#!/usr/bin/env python3
"""lanectl — the VM-side authority for P1672 TEST lanes. Runs as root on cp-test-supabase.

Installed to /opt/supabase/lanes/bin/lanectl.py (+ a `lanectl` wrapper) by `lane.py vm-install`.
The Mac never decides lane state: allocation, generation fencing, quarantine and the outbound check
all happen here, under one flock. Python 3 stdlib only.

A lane is a trimmed second Supabase stack (compose project cp-<lane>) beside the main one:
db auth rest realtime storage meta functions kong mail. studio, imgproxy and the pooler are left out.
  * db sits ONLY on the lane's internal network: pg_net and triggers can reach nothing outside the lane.
  * kong, functions, auth (Google sign-in) and mail also sit on the lane's edge network (port publish, egress). A host firewall
    stops the edge subnet reaching any host address except the lane's own origin, the main lane's
    public IP, other docker networks and other tailnet machines.
  * Clients reach the lane only over Tailscale: the main Caddy serves a site bound to the VM's
    Tailscale IP, with a cert from `tailscale cert`, configured by a file this tool writes.

Lifecycle: free -> provisioning -> ready -> draining -> free, plus failed. Every allocate bumps the
generation; every data-plane command names the generation it was issued for and a stale one is
refused (exit 4). Every claim re-provisions from scratch: old volumes go, the database is copied
fresh from the main lane with Postgres's low-level backup API (owners, ACLs, default privileges, RLS
and security-definer functions come across byte for byte), keys are generated fresh.

Parity (P1724): a lane's sign-in and mail must match the main lane's, checked at provisioning, lift,
deploy (before quarantining a ready lane), boot, `check`, and on demand with `parity --lane L`
(read-only, no generation; `--config-only` skips the containers and auth's own answer).

Exit codes: 0 ok, 1 error, 3 outbound or parity check failed (lane stays quarantined), 4 refused (stale
generation / lane not held), 5 admission wait timed out (admit.py).
Never prints a secret except `keys`, whose stdout the Mac writes straight into a mode-600 file.
"""
import base64
import fcntl
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

PROTOCOL = 1
ROOT = Path(os.environ.get('CP_LANES_ROOT', '/opt/supabase/lanes'))
STATE = ROOT / 'state'
BIN = ROOT / 'bin'
MAIN_DIR = Path('/opt/supabase/docker')
MAIN_DB = 'supabase-db'
MAIN_CADDY = 'cp-test-caddy'
CADDY_VOLUME = 'supabase_caddy_data'
PUBLIC_IP = '136.85.1.126'
MAIN_ORIGIN = 'https://136-85-1-126.sslip.io'
SELF_REF = 'cpselfhostedtest01'   # synthetic `ref` claim the SQL purge guard checks (scripts/lib/test-target.mjs)
LEASE_DEFAULT = 7 * 24 * 3600

# Per-lane fixed values. Stage 1 runs lane1; lane2 is defined so stage 2 is a config change.
LANES = {
    'lane1': {'https_port': 8443, 'kong_port': 18001, 'mail_ui_port': 8026, 'edge_subnet': '172.31.201.0/24'},
    'lane2': {'https_port': 8444, 'kong_port': 18002, 'mail_ui_port': 8027, 'edge_subnet': '172.31.202.0/24'},
}
ENABLED_LANES = ('lane1',)
SERVICES_UP = ('db', 'auth', 'rest', 'realtime', 'storage', 'meta', 'kong', 'mail')

# Vault classification. Every name the copied database holds must be listed, or provisioning
# stops: an unknown entry could hold an address or key of another environment.
VAULT_URL = {'canvas_draft_url', 'dispatch_event_emails_url', 'mirror_reply_url'}
VAULT_ANON = {'dispatch_event_emails_anon_key'}
VAULT_KEEP = {'canvas_draft_internal_secret', 'dispatch_event_emails_cron_secret', 'mirror_internal_secret', 'password_signin'}
# The kept entries that are internal secrets: always given a fresh value in a lane (never main's).
VAULT_SECRET = {'canvas_draft_internal_secret', 'dispatch_event_emails_cron_secret', 'mirror_internal_secret'}
# Not isolated in stage 1 (spec deny-list): transcription worker and voice notes. Deleted in a lane.
VAULT_DENY_PREFIXES = ('chat_voice_', 'enqueue_room_transcription_', 'transcription_webhook_')

# Function env is DENY BY DEFAULT: a lane gets only the names listed here. An unlisted name may be a
# credential for a resource the lane would share with the main lane (the storage bucket behind
# GCS_UPLOAD_SECRET, the transcription worker, the voice bucket, main's mail domain), and the lane's
# copied session ids would let it address main's objects there (P1672 review, Opus H2).
FN_ENV_ALLOW = {'GEMINI_BATCH_API_KEY', 'CANVAS_DRAFT_AI_ENABLED', 'CANVAS_DRAFT_GEMINI_API_KEY', 'MIRROR_AI_ENABLED',
                'MIRROR_GEMINI_API_KEY', 'APP_URL'}
# Internal shared secrets: kept by name, given FRESH values per lane. A vault entry that held the same
# main value gets the same fresh value, so database-to-function pairs keep matching (review M4).
FN_ENV_REGENERATE = {'CANVAS_DRAFT_INTERNAL_SECRET', 'INTERNAL_FN_SECRET', 'CRON_SECRET', 'WEBHOOK_SECRET',
                     'MIRROR_INTERNAL_SECRET', 'IP_HASH_SECRET'}
FN_ENV_LANE_OWN = {'VITE_SUPABASE_ANON_KEY'}   # rewritten to the lane's own key
MAIN_MAIL_DOMAIN = 'mg.claritypledge.com'
# Lane mail: only a Mailgun sandbox domain, which the provider restricts to confirmed recipients
# (the founder's addresses). The restriction is the provider's, so it holds whatever a branch's code does.
LANE_MAIL_DOMAIN = re.compile(r'sandbox[0-9a-f]{20,40}\.mailgun\.org')

# Inherited runnable work, cleared in the lane copy (never on the main lane).
CLEAR_SQL = r"""
DO $$
BEGIN
  IF to_regclass('public.canvas_draft_runs') IS NOT NULL THEN
    UPDATE public.canvas_draft_runs SET state = 'cancelled' WHERE state IN ('queued', 'running'); END IF;
  IF to_regclass('public.transcription_jobs') IS NOT NULL THEN
    UPDATE public.transcription_jobs SET status = 'failed' WHERE status IN ('pending', 'processing'); END IF;
  IF to_regclass('public.transcribe_room_transcription_jobs') IS NOT NULL THEN
    UPDATE public.transcribe_room_transcription_jobs SET status = 'failed' WHERE status IN ('pending', 'processing'); END IF;
  IF to_regclass('public.mirror_jobs') IS NOT NULL THEN DELETE FROM public.mirror_jobs; END IF;
  IF to_regclass('public.transcribe_round_clean_jobs') IS NOT NULL THEN DELETE FROM public.transcribe_round_clean_jobs; END IF;
  IF to_regclass('public.chat_voice_purge') IS NOT NULL THEN DELETE FROM public.chat_voice_purge; END IF;
  IF to_regclass('public.letter_response_pending') IS NOT NULL THEN DELETE FROM public.letter_response_pending; END IF;
  -- Provider identities: every stored Mailgun id becomes the "sent, no id" sentinel, so the lane can
  -- never address (cancel) main's scheduled mail and never re-sends an inherited reminder.
  IF to_regclass('public.event_rsvps') IS NOT NULL THEN
    -- Which rows were inherited, so later checks never confuse them with the lane's own fixtures.
    CREATE SCHEMA IF NOT EXISTS _cp_lane;
    DROP TABLE IF EXISTS _cp_lane.inherited_rsvps;
    CREATE TABLE _cp_lane.inherited_rsvps AS SELECT id FROM public.event_rsvps;
    UPDATE public.event_rsvps r SET mailgun_message_ids =
      coalesce((SELECT jsonb_object_agg(k, 'SENT_NO_ID') FROM jsonb_object_keys(coalesce(r.mailgun_message_ids, '{}'::jsonb)) k), '{}'::jsonb)
      || '{"reminder":"SENT_NO_ID","feedback":"SENT_NO_ID","starting_soon":"SENT_NO_ID"}'::jsonb;
  END IF;
END $$;
DELETE FROM net.http_request_queue;
DELETE FROM net._http_response;
TRUNCATE cron.job_run_details;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.sessions;
"""

class Refused(Exception):
    pass


class CheckFailed(Exception):
    pass


class LaneBusy(Exception):
    pass


def say(msg):
    print(msg, file=sys.stderr, flush=True)


def run(cmd, *, input=None, check=True, capture=True, timeout=600, env=None):
    p = subprocess.run(cmd, input=input, capture_output=capture, timeout=timeout, env=env,
                       text=isinstance(input, str) or input is None)
    if check and p.returncode != 0:
        tail = (p.stderr or '')[-1500:] if capture else ''
        raise RuntimeError(f'command failed ({p.returncode}): {" ".join(map(str, cmd[:6]))} ... {tail}')
    return p


# --- state + lock ----------------------------------------------------------------------------------

class Lock:
    """flock on one lock file. Lock(lane) is THE lock for everything about that lane, held for the
    whole operation (the generation check AND the work it guards: SQL, deploy, quarantine, lift,
    provision, release), so a release or reallocation can never slip in between. Lock() with no
    lane serializes allocation across lanes; allocation then takes the chosen lane's lock too.
    Order is always allocation lock first, lane lock second, never the reverse."""
    # shared=True: data-plane commands (SQL, reads, heartbeat). Many may run at once on one lane, so
    # concurrent SQL sessions (the P1592 interleaving spec) still interleave; every lifecycle change
    # (provision, quarantine, lift, deploy, release) takes it EXCLUSIVE and so waits for them, which is
    # what keeps a release or reallocation out from under a running session.
    # blocking=False: raise LaneBusy instead of waiting (allocation skips a busy lane).
    # state=True: a separate short mutex for state-file writes made under a shared lock (heartbeat).
    def __init__(self, lane=None, shared=False, blocking=True, state=False):
        if lane is not None and lane not in LANES:
            raise Refused(f'unknown lane {lane!r}')
        self.name = (f'.state-{lane}' if state else f'.lock-{lane}') if lane else '.lock'
        self.mode = (fcntl.LOCK_SH if shared else fcntl.LOCK_EX) | (0 if blocking else fcntl.LOCK_NB)
        # Writer preference (review round 3, R3-1): flock lets new shared holders in while an exclusive one
        # waits, so a lifecycle command could starve under continuous SQL. An exclusive taker holds the lane's
        # gate while it waits; a shared taker passes through the gate first, so it queues behind that waiter.
        self.gate = f'.gate-{lane}' if lane and not state else None
        self.shared = shared

    def __enter__(self):
        STATE.mkdir(parents=True, exist_ok=True)
        os.chmod(STATE, 0o700)
        nb = 0 if self.mode & fcntl.LOCK_NB == 0 else fcntl.LOCK_NB
        g = None
        if self.gate:
            g = open(STATE / self.gate, 'a+')
            try:
                fcntl.flock(g, (fcntl.LOCK_SH if self.shared else fcntl.LOCK_EX) | nb)
            except BlockingIOError:
                g.close()
                raise LaneBusy(self.gate)
        self.f = open(STATE / self.name, 'a+')
        try:
            fcntl.flock(self.f, self.mode)
        except BlockingIOError:
            self.f.close()
            raise LaneBusy(self.name)
        finally:
            if g is not None:   # the gate is only for the wait; holders release it once they have the lock
                fcntl.flock(g, fcntl.LOCK_UN)
                g.close()
        return self

    def __exit__(self, *a):
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


def load(lane):
    p = STATE / f'{lane}.json'
    if not p.exists():
        return {'lane': lane, 'state': 'free', 'generation': 0}
    return json.loads(p.read_text())


def save(st):
    p = STATE / f'{st["lane"]}.json'
    tmp = p.with_name(f'{p.name}.tmp-{os.getpid()}')
    tmp.write_text(json.dumps(st, indent=2, sort_keys=True) + '\n')
    os.replace(tmp, p)


def event(lane, what):
    with open(STATE / 'events.log', 'a') as f:
        f.write(f'{time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}\t{lane}\t{what}\n')


def held(lane, gen, states=('provisioning', 'ready')):
    """The lane's state when (lane, gen) is current and in one of `states`, else Refused."""
    if lane not in LANES:
        raise Refused(f'unknown lane {lane!r}')
    st = load(lane)
    if st.get('generation') != gen:
        raise Refused(f'{lane}: generation {gen} is stale (current {st.get("generation")}); this claim no longer holds the lane')
    if st.get('state') not in states:
        raise Refused(f'{lane}: state is {st.get("state")}, not {"/".join(states)}')
    if st.get('lease_expires_at', 0) < time.time():
        raise Refused(f'{lane}: lease expired; the lane will be reclaimed')
    return st


# --- paths, names, secrets -------------------------------------------------------------------------

def ldir(lane):
    return ROOT / lane


def cname(lane, svc):
    return f'cp-{lane}-{svc}'


def ts_identity():
    st = json.loads(run(['tailscale', 'status', '--json']).stdout)
    host = st['Self']['DNSName'].rstrip('.')
    ip = run(['tailscale', 'ip', '-4']).stdout.split()[0]
    return host, ip


def origin(lane):
    host, _ = ts_identity()
    return f'https://{host}:{LANES[lane]["https_port"]}'


def lane_origin(lane):
    """The origin the lane was provisioned with, from its own .env: no Tailscale call, so the boot-time
    parity check does not depend on tailscaled being up yet. Asks Tailscale only when the record is missing."""
    o = lane_env(lane).get('SITE_URL', '')
    return o if re.fullmatch(rf'https://[A-Za-z0-9.-]+:{LANES[lane]["https_port"]}', o) else origin(lane)


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def jwt(secret, role, now):
    head = b64url(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
    body = b64url(json.dumps({'role': role, 'iss': 'supabase', 'ref': SELF_REF, 'iat': now, 'exp': now + 10 * 365 * 86400},
                             separators=(',', ':')).encode())
    sig = b64url(hmac.new(secret.encode(), f'{head}.{body}'.encode(), hashlib.sha256).digest())
    return f'{head}.{body}.{sig}'


def parse_env(text):
    out = {}
    for line in text.splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip()
    return out


def lane_env(lane):
    return parse_env((ldir(lane) / '.env').read_text())


def main_env():
    return parse_env((MAIN_DIR / '.env').read_text())


def write_600(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(text)
    os.replace(tmp, path)


# --- compose ---------------------------------------------------------------------------------------

def compose(lane, *args, timeout=600, check=True):
    d = ldir(lane)
    return run(['docker', 'compose', '-p', f'cp-{lane}', '--project-directory', str(d),
                '-f', str(MAIN_DIR / 'docker-compose.yml'), '-f', str(d / 'lane.yml'), '--env-file', str(d / '.env'), *args],
               timeout=timeout, check=check, env=RENDER_ENV)   # the env parity rendered with (P1724 Codex 4)


def relay_matching():
    """The main lane's relay allowlist, read from its own compose file so no address lives in this repo."""
    for line in (MAIN_DIR / 'docker-compose.override.yml').read_text().splitlines():
        if line.strip().startswith('MP_SMTP_RELAY_MATCHING:'):
            return line.split(':', 1)[1].strip()
    # RuntimeError, not SystemExit: provisioning's handler catches Exception, and a SystemExit slipped past it
    # and left the lane stuck in `provisioning` instead of `failed` (P1724).
    raise RuntimeError('main lane has no MP_SMTP_RELAY_MATCHING; refusing to relay everything')


def lane_yml(lane, host, ts_ip):
    c = LANES[lane]
    log = '\n'.join([
        '    logging:', '      driver: json-file', '      options:', '        max-size: "10m"', '        max-file: "3"'])
    # restart "no": docker must never start a lane by itself (at boot, after a crash), before its firewall is
    # verified; on-failure is not enough, since docker revives a container whose recorded exit was non-zero.
    # `lanectl boot` starts lanes after the firewall check; a crashed lane stays down until lift or boot.
    log = log + '\n    restart: "no"'
    svc = lambda name, extra='': f'  {name}:\n    container_name: {cname(lane, name)}\n{log}\n{extra}'
    return f"""# Generated by lanectl for {lane}. Do not edit: every claim rewrites it.
networks:
  default:
    internal: true
  edge:
    ipam:
      config:
        - subnet: {c['edge_subnet']}
services:
{svc('db', '''    volumes:
      - ./volumes/db-config:/etc/postgresql-custom
''')}
{svc('auth', f'''    environment:
      GOTRUE_EXTERNAL_GOOGLE_ENABLED: "true"
      GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${{GOOGLE_CLIENT_ID}}
      GOTRUE_EXTERNAL_GOOGLE_SECRET: ${{GOOGLE_SECRET}}
      GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: https://{host}:{c['https_port']}/auth/v1/callback
      GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: https://{host}:{c['https_port']}/_cp-email-templates/magic_link.html
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: https://{host}:{c['https_port']}/_cp-email-templates/confirmation.html
    extra_hosts:
      - "{host}:{ts_ip}"
    networks:
      default: {{}}
      edge: {{}}
''')}
{svc('rest')}
  realtime:
    container_name: {cname(lane, 'realtime')}
{log}
    networks:
      default:
        aliases:
          - realtime-dev.supabase-realtime
{svc('storage', '''    depends_on: !override
      db:
        condition: service_healthy
      rest:
        condition: service_started
    environment:
      ENABLE_IMAGE_TRANSFORMATION: "false"
''')}
{svc('meta')}
{svc('kong', f'''    depends_on: !reset []
    ports: !override
      - "127.0.0.1:{c['kong_port']}:8000/tcp"
    networks:
      default:
        aliases:
          - api-gw
      edge: {{}}
''')}
{svc('functions', f'''    volumes:
      - ./volumes/deno-cache:/root/.cache/deno
    env_file:
      - ./functions.env
    environment:
      SUPABASE_URL: https://{host}:{c['https_port']}
    extra_hosts:
      - "{host}:{ts_ip}"
    networks:
      default: {{}}
      edge: {{}}
''')}
  mail:
    container_name: {cname(lane, 'mail')}
    image: axllent/mailpit:v1.21.8
{log}
    environment:
      MP_SMTP_BIND_ADDR: 0.0.0.0:2500
      MP_SMTP_AUTH_ACCEPT_ANY: "1"
      MP_SMTP_AUTH_ALLOW_INSECURE: "1"
      MP_MAX_MESSAGES: "2000"
      # Same relay as the main lane: only the founder's own addresses are forwarded, the rest stay here.
      MP_SMTP_RELAY_CONFIG: /relay.yaml
      MP_SMTP_RELAY_MATCHING: {relay_matching()}
    volumes:
      - {MAIN_DIR}/mailpit/relay.yaml:/relay.yaml:ro
    ports:
      - "{ts_ip}:{c['mail_ui_port']}:8025"
    networks:
      default: {{}}
      edge: {{}}
"""


def write_lane_env(lane, host):
    """A fresh lane .env: main's file with every secret, URL and port replaced."""
    c = LANES[lane]
    m = (MAIN_DIR / '.env').read_text().splitlines()
    now = int(time.time())
    jwt_secret = secrets.token_hex(32)
    o = f'https://{host}:{c["https_port"]}'
    # API URL: main's own value on the lane's origin (main's carries the /auth/v1 path, so the JWT issuer
    # matches main's form; lanes before P1724 got the bare origin).
    main_api = parse_env('\n'.join(m)).get('API_EXTERNAL_URL', '')
    api_url = main_api.replace(MAIN_ORIGIN, o) if main_api.startswith(MAIN_ORIGIN) else o
    redirects = parse_env('\n'.join(m)).get('ADDITIONAL_REDIRECT_URLS', '').strip('"')
    redirects = ','.join(u for u in redirects.split(',') if u and '136-85-1-126' not in u) + f',{o}/**'
    repl = {
        'POSTGRES_PASSWORD': secrets.token_hex(24), 'JWT_SECRET': jwt_secret,
        'ANON_KEY': jwt(jwt_secret, 'anon', now), 'SERVICE_ROLE_KEY': jwt(jwt_secret, 'service_role', now),
        'SUPABASE_PUBLISHABLE_KEY': '', 'SUPABASE_SECRET_KEY': '', 'JWT_KEYS': '', 'JWT_JWKS': '',
        'ANON_KEY_ASYMMETRIC': '', 'SERVICE_ROLE_KEY_ASYMMETRIC': '',
        'DASHBOARD_PASSWORD': secrets.token_hex(16), 'SECRET_KEY_BASE': secrets.token_hex(32),
        'REALTIME_DB_ENC_KEY': secrets.token_hex(8), 'VAULT_ENC_KEY': secrets.token_hex(16),
        'PG_META_CRYPTO_KEY': secrets.token_hex(16), 'S3_PROTOCOL_ACCESS_KEY_ID': secrets.token_hex(16),
        'S3_PROTOCOL_ACCESS_KEY_SECRET': secrets.token_hex(32), 'MINIO_ROOT_PASSWORD': secrets.token_hex(16),
        'SUPABASE_PUBLIC_URL': o, 'API_EXTERNAL_URL': api_url, 'SITE_URL': o, 'ADDITIONAL_REDIRECT_URLS': f'"{redirects}"',
        'KONG_HTTP_PORT': str(c['kong_port']), 'KONG_HTTPS_PORT': str(c['kong_port'] + 100),
        'SMTP_HOST': 'mail', 'SMTP_PORT': '2500', 'PROXY_DOMAIN': host,  # Google sign-in: lanes reuse main's TEST OAuth client (not prod's)
        'OPENAI_API_KEY': '',
    }
    out, seen = [], set()
    for line in m:
        k = line.split('=', 1)[0].strip() if '=' in line and not line.lstrip().startswith('#') else None
        if k == 'COMPOSE_FILE':
            continue   # the lane names its files explicitly; main's list would pull in main's override
        if k in repl:
            out.append(f'{k}={repl[k]}')
            seen.add(k)
        else:
            out.append(line)
    out += [f'{k}={v}' for k, v in repl.items() if k not in seen]
    write_600(ldir(lane) / '.env', '\n'.join(out) + '\n')


def write_functions_env(lane):
    """The lane's function env: allowlisted names from main's file, fresh internal secrets, the lane's own
    anon key, and the lane's own mail if configured. Writes secret-map.json (600): main value to fresh value,
    which rewrite_vault applies to vault entries holding the same main value."""
    keep, secret_map, dropped = [], {}, []
    for line in (MAIN_DIR / 'functions.env').read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#') or '=' not in line:
            continue
        k, _, v = line.partition('=')
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k in FN_ENV_ALLOW:
            keep.append(line)
        elif k in FN_ENV_REGENERATE:
            fresh = secret_map.setdefault(v, secrets.token_hex(32)) if v else ''
            keep.append(f'{k}={fresh}')
        elif k not in FN_ENV_LANE_OWN:
            dropped.append(k)
    keep.append(f'VITE_SUPABASE_ANON_KEY={lane_env(lane)["ANON_KEY"]}')
    write_600(ldir(lane) / 'secret-map.json', json.dumps(secret_map))
    say(f'{lane}: function env keeps {len(keep)} name(s); not given to the lane: {", ".join(sorted(dropped)) or "none"}')
    mail = ROOT / 'mail.env'
    if mail.exists():
        me = parse_env(mail.read_text())
        if not LANE_MAIL_DOMAIN.fullmatch(me.get('MAILGUN_DOMAIN', '')):
            raise RuntimeError('mail.env must name a Mailgun sandbox domain (the provider delivers it only to confirmed '
                               'recipients); a lane never holds a domain that can mail anyone')
        keep += [f'{k}={v}' for k, v in me.items() if k.startswith('MAILGUN_')]
    write_600(ldir(lane) / 'functions.env', '\n'.join(keep) + '\n')


# --- parity with the main lane (P1724) -------------------------------------------------------------
#
# A lane's sign-in and mail must behave like the main lane's. lane_yml and write_lane_env build a lane by
# hand, so anything the main lane gains later was silently missing (2026-11-24: Google sign-in, the
# founder-only relay and the production e-mail designs, all three at once). parity_report compares the
# two stacks as docker renders and runs them, and fails on every difference no rule below accepts.
# It only reads: it renders, inspects, and makes one GET per stack.

PARITY_SERVICES = ('auth', 'mail')
# Lane structure, not settings. networks and extra_hosts are checked by the derived rules in _structure.
PARITY_SKIP_FIELDS = {'container_name', 'ports', 'logging', 'restart', 'depends_on', 'networks', 'extra_hosts'}
# The intended overrides: (service, env name) -> the value the lane MUST hold. Every other name must equal
# main's. A value carrying the main origin and no rule here gets 'rebase' automatically.
#   rebase       main's value with the main origin replaced by the lane origin
#   rebase-set   a comma list, compared as a set (empty entries dropped) after the same replacement
#   lane-env:K   the lane's own .env K, which must be non-empty and differ from main's .env K
#   in-url:K     main's value with main's .env K replaced by the lane's (a password inside a URL); the rest
#                of the URL must match exactly, and the lane's K must be non-empty and differ from main's
#   value:V      exactly V
PARITY_RULES = {
    ('auth', 'API_EXTERNAL_URL'): 'rebase',
    ('auth', 'GOTRUE_JWT_ISSUER'): 'rebase',
    ('auth', 'GOTRUE_SITE_URL'): 'rebase',
    ('auth', 'GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI'): 'rebase',
    ('auth', 'GOTRUE_URI_ALLOW_LIST'): 'rebase-set',
    ('auth', 'GOTRUE_JWT_SECRET'): 'lane-env:JWT_SECRET',
    ('auth', 'GOTRUE_DB_DATABASE_URL'): 'in-url:POSTGRES_PASSWORD',
    ('auth', 'GOTRUE_SMTP_HOST'): 'value:mail',          # the lane's own mail service; main names its container
    ('mail', 'MP_MAX_MESSAGES'): 'value:2000',           # disk cap on a short-lived copy (main keeps 5000)
}
# Lanes provisioned before P1724 got the bare origin as the API URL (and so the JWT issuer). Rewriting a live
# lane's .env is forbidden, and both forms build the same sign-in links. Keyed by generation, so the
# exception ends the moment the lane is reprovisioned.
PARITY_GRANDFATHERED = {
    ('lane1', 6): {('auth', 'API_EXTERNAL_URL'): 'bare-origin', ('auth', 'GOTRUE_JWT_ISSUER'): 'bare-origin'},
}
# Values a lane shares with main on purpose: main's TEST Google sign-in client (af3868662). Any other
# secret-looking value equal to main's fails: parity alone would pass it, and the outbound check does not
# look at auth or mail.
SHARED_WITH_MAIN = {('auth', 'GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID'), ('auth', 'GOTRUE_EXTERNAL_GOOGLE_SECRET')}
SECRET_NAME = re.compile(r'SECRET|PASSW|PASS$|TOKEN|_KEY|KEY_|CREDENTIAL|PRIVATE', re.I)

# What main's compose files contribute beyond the upstream file lanes use, classified at field level
# (service.environment.NAME, list entries by target, other fields by name). auth and mail are covered by the
# comparison itself; a function env name by the FN_ENV_* sets plus FN_ENV_NOT_IN_LANES. Any other
# contributed path must be listed here, so a new main-lane setting forces a decision about lanes.
OVERRIDE_CLASSIFIED = {
    'functions.env_file': "main's function env file; lanes get their own (write_functions_env, deny by default)",
    'functions.environment.SUPABASE_URL': 'lane own: the lane origin (lane_yml; outbound check)',
    'kong.ports[8000]': 'lane own: the lane gateway port (lane_yml)',
    'kong.ports[8443]': 'lane own: lanes publish only the plain gateway port to loopback',
    'supavisor.ports[5432]': 'the pooler is not part of a lane',
    'supavisor.ports[6543]': 'the pooler is not part of a lane',
    # main's Caddy is the only Caddy: it also serves every lane's site (caddy_route_add), so lanes have none.
    'caddy.command': "main's Caddy, which serves the lane sites too (rendered as null)",
    'caddy.container_name': "main's Caddy, which serves the lane sites too",
    'caddy.entrypoint': "main's Caddy, which serves the lane sites too (rendered as null)",
    'caddy.image': "main's Caddy, which serves the lane sites too",
    'caddy.network_mode': "main's Caddy, which serves the lane sites too",
    'caddy.restart': "main's Caddy, which serves the lane sites too",
    'caddy.depends_on': "main's Caddy, which serves the lane sites too",
    'caddy.volumes[/config]': "main's Caddy state",
    'caddy.volumes[/data]': "main's Caddy state (certificates)",
    'caddy.volumes[/etc/caddy/Caddyfile]': "main's Caddyfile, which imports the lane sites lanectl writes",
    'caddy.volumes[/srv/cp-email-templates]': 'the e-mail designs; each lane route serves this same directory '
                                              '(caddy_route_add). Checking the route itself is deferred (P1724)',
    # The mail service comes wholly from main's override; its env, image and volumes are compared by parity.
    # These four are fields parity skips, classified one by one (review, Opus M2):
    'mail.container_name': 'lane own: cp-<lane>-mail (lane_yml)',
    'mail.networks[default]': "derived rule: main's mail reaches the internet, so the lane's must sit on its edge network (_structure)",
    'mail.ports[8025]': "lane own: the lane's mail UI on the tailnet address and its own port (lane_yml)",
    'mail.restart': 'lane own: lanes are started by lanectl boot once their firewall verifies, not by a docker restart policy',
    'volumes.caddy_config': "main's Caddy state",
    'volumes.caddy_data': "main's Caddy state (certificates)",
}
# Function env names the main lane holds and a lane deliberately does not (P1672 deny by default):
# credentials for resources a lane would share with main, and features stage 1 leaves out. Lanes get
# their own MAILGUN_* from mail.env.
FN_ENV_NOT_IN_LANES = {
    'CALL_CRON_SECRET', 'CALL_ENV', 'CHAT_VOICE_CRON_SECRET', 'GCP_ENQUEUER_SA_KEY', 'GCS_CHAT_VOICE_BUCKET',
    'GCS_CHAT_VOICE_SERVICE_ACCOUNT_KEY', 'GCS_UPLOAD_SECRET', 'GEMINI_CHAT_VOICE_API_KEY', 'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET', 'LIVEKIT_URL', 'MAILGUN_API_KEY', 'MAILGUN_DOMAIN', 'MAILGUN_REGION',
    'TRANSCRIBE_ROOM_BATCH_URL', 'TRANSCRIBE_ROOM_INVOKER_SA', 'TRANSCRIBE_ROOM_QUEUE',
}
# A clean environment for rendering, so the caller's shell can never interpolate into either stack.
RENDER_ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root'}


def shown(v):
    """A value as it may appear in a report: only public shapes are printed, anything else by length."""
    if v is None:
        return '<absent>'
    if v == '':
        return '<empty>'
    if re.fullmatch(r'true|false|[0-9]{1,6}', v, re.I):
        return repr(v)
    m = re.fullmatch(r'(https?://[A-Za-z0-9.-]+(?::[0-9]+)?)(/[A-Za-z0-9._/*-]*)?', v)
    if m:
        # A capability URL carries its token in the path (a webhook, say): a path segment that is long and
        # mixes letters and digits is never printed, only its length.
        path = m.group(2) or ''
        if any(len(s) >= 16 and re.search(r'[A-Za-z]', s) and re.search(r'[0-9]', s) for s in path.split('/')):
            return repr(m.group(1)) + f' with a <{len(path)}-char path>'
        return repr(v)
    return f'<{len(v)} chars>'


def looks_secret(name, value):
    if not value:
        return False
    if SECRET_NAME.search(name):
        return True
    # A token-shaped value under an innocent name: long, no spaces, not a URL or path, letters and digits.
    return (len(value) >= 20 and not re.search(r'\s', value) and not re.match(r'[a-z]+://|/', value)
            and re.search(r'[A-Za-z]', value) is not None and re.search(r'[0-9]', value) is not None)


def _render(args):
    p = run(['docker', 'compose', *args, 'config', '--format', 'json'], check=False, env=RENDER_ENV, timeout=120)
    if p.returncode != 0:   # docker's error text is not printed: it can quote values from .env
        raise CheckFailed(f'docker compose could not render ({" ".join(a for a in args if a.startswith("/"))[:200]}; exit {p.returncode})')
    return json.loads(p.stdout)


def render_main(files=None):
    files = files or [f for f in main_env().get('COMPOSE_FILE', 'docker-compose.yml').split(':') if f]
    args = ['--project-directory', str(MAIN_DIR), '--env-file', str(MAIN_DIR / '.env')]
    for f in files:
        args += ['-f', str(MAIN_DIR / f)]
    return _render(args)


def render_lane(lane):
    d = ldir(lane)
    return _render(['-p', f'cp-{lane}', '--project-directory', str(d), '-f', str(MAIN_DIR / 'docker-compose.yml'),
                    '-f', str(d / 'lane.yml'), '--env-file', str(d / '.env')])


def _env_diff(svc, k, mv, lv, ctx):
    """None when the lane value is the one the rules require, else a report line (no secret printed)."""
    o, gen_rules = ctx['origin'], ctx['grandfathered']
    rule = PARITY_RULES.get((svc, k))
    if rule is None and isinstance(mv, str) and MAIN_ORIGIN in mv:
        rule = 'rebase'
    secret = SECRET_NAME.search(k) is not None
    detail = lambda exp: '' if secret else f': lane {shown(lv)}, required {shown(exp)}'
    if mv is None and lv is not None:   # a rule (value:, lane-env:) must not make a lane-only key pass
        return f'{svc}: {k} missing on main'
    if rule == 'rebase-set':
        want = {u.replace(MAIN_ORIGIN, o) for u in (mv or '').split(',') if u}
        have = {u for u in (lv or '').split(',') if u}
        if mv is None or lv is None or want != have:
            return (f'{svc}: {k} differs from main rebased onto the lane origin '
                    f'(missing {sorted(shown(u) for u in want - have)}, extra {sorted(shown(u) for u in have - want)})')
        exp = lv
    elif rule and rule.startswith('lane-env:'):
        name = rule.split(':', 1)[1]
        le, me = ctx['lane_env'].get(name, ''), ctx['main_env'].get(name, '')
        if not le or le == me:
            return f'{svc}: {k}: the lane .env {name} is empty or equal to main\'s; a lane needs its own'
        exp = le
    elif rule and rule.startswith('in-url:'):
        name = rule.split(':', 1)[1]
        le, me = ctx['lane_env'].get(name, ''), ctx['main_env'].get(name, '')
        if not le or le == me:
            return f'{svc}: {k}: the lane .env {name} is empty or equal to main\'s; a lane needs its own'
        if not mv or mv.count(me) != 1:
            return f'{svc}: {k}: main\'s value does not hold its {name} exactly once; cannot derive the lane value'
        exp = mv.replace(me, le)
    elif rule and rule.startswith('value:'):
        exp = rule.split(':', 1)[1]
    elif rule == 'rebase':
        exp = mv.replace(MAIN_ORIGIN, o) if isinstance(mv, str) else mv
    else:
        exp = mv
    ok = lv == exp or (gen_rules.get((svc, k)) == 'bare-origin' and lv == o)
    if not ok:
        what = 'missing on the lane' if lv is None else 'missing on main' if mv is None else 'differs from main'
        return f'{svc}: {k} {what}{detail(exp)}'
    if isinstance(lv, str) and (MAIN_ORIGIN in lv or '136-85-1-126' in lv or PUBLIC_IP in lv):
        return f'{svc}: {k} names the main lane\'s origin'
    if rule is None and lv == mv and (svc, k) not in SHARED_WITH_MAIN and looks_secret(k, lv):
        return f'{svc}: {k} holds the same secret-looking value as main; a lane shares only {sorted(n for _, n in SHARED_WITH_MAIN)}'
    return None


def host_entries(eh):
    """extra_hosts as a set of "host=ip". Compose renders it as a list ("host:ip" or "host=ip") or, in some
    versions, a map of host to an address or a list of addresses; docker stores "host:ip"."""
    if isinstance(eh, dict):
        return {f'{h}={a}' for h, v in eh.items() for a in (v if isinstance(v, list) else [v])}
    return {h.replace(':', '=', 1) if '=' not in h else h for h in (eh or [])}


def _structure(svc, ms, ls, main_r, lane_r, ctx):
    """Derived rules for the skipped structural fields (today's fixes were partly structural)."""
    fails = []
    internal = lambda r, n: bool(((r.get('networks') or {}).get(n) or {}).get('internal'))
    if any(not internal(main_r, n) for n in (ms.get('networks') or {})) and \
            all(internal(lane_r, n) for n in (ls.get('networks') or {})):
        fails.append(f'{svc}: main\'s {svc} can reach the internet, the lane\'s is only on internal networks '
                     f'(join the lane edge network)')
    host = re.sub(r'^https://([^:/]+).*$', r'\1', ctx['origin'])
    if any(isinstance(v, str) and f'://{host}' in v for v in (ls.get('environment') or {}).values()):
        if f'{host}={ctx["ts_ip"]}' not in host_entries(ls.get('extra_hosts')):
            fails.append(f'{svc}: names the lane host in its settings but has no host entry for it '
                         f'({host} to the VM tailnet address); it cannot fetch its own URLs')
    return fails


def compare_service(svc, ms, ls, main_r, lane_r, ctx):
    fails = []
    for f in sorted((set(ms) | set(ls)) - PARITY_SKIP_FIELDS - {'environment'}):
        # Membership as well as value: a field present as null on one side only is a difference (Codex 3).
        if (f in ms) != (f in ls) or ms.get(f) != ls.get(f):
            fails.append(f'{svc}: {f} differs from main')
    me, le = ms.get('environment') or {}, ls.get('environment') or {}
    for k in sorted(set(me) | set(le)):
        if (k in me) != (k in le) and (me.get(k) if k in me else le.get(k)) is None:
            fails.append(f'{svc}: {k} is set with no value on {"main" if k in me else "the lane"} only')
            continue
        d = _env_diff(svc, k, me.get(k), le.get(k), ctx)
        if d:
            fails.append(d)
    return fails + _structure(svc, ms, ls, main_r, lane_r, ctx)


def _flatten(name, svc):
    out = {}
    for f, v in (svc or {}).items():
        if f == 'environment' and isinstance(v, dict):
            for k, ev in v.items():
                out[f'{name}.environment.{k}'] = ev
        elif isinstance(v, list) and v and all(isinstance(x, dict) and 'target' in x for x in v):
            # Keyed by target. Bindings that share a target are keyed by their whole binding instead, so a second
            # one can never overwrite the first and hide as an already-classified path (Codex round 2, finding 5).
            targets = [x['target'] for x in v]
            for x in v:
                t = x['target']
                key = t if targets.count(t) == 1 else \
                    f'{t}@{x.get("host_ip", "")}:{x.get("published", "")}/{x.get("protocol", "tcp")}'
                out[f'{name}.{f}[{key}]'] = x
        elif f == 'networks' and isinstance(v, (dict, list)):
            # Per network, like ports per target: a network main adds later is a new path, so a classification
            # of the networks main has today cannot let it through (review round 2, Opus N1).
            for n in v:
                out[f'{name}.networks[{n}]'] = v[n] if isinstance(v, dict) else None
        else:
            out[f'{name}.{f}'] = v
    return out


def override_contributions(base, full):
    """Every path main's own compose files change or add beyond the upstream file, at field level."""
    paths = []
    bs, fs = base.get('services') or {}, full.get('services') or {}
    for s in sorted(set(bs) | set(fs)):
        b, f = _flatten(s, bs.get(s)), _flatten(s, fs.get(s))
        # Membership, not just value: compose renders a network joined without options as null, so a path
        # present on one side only with a null value is still a contribution.
        paths += [p for p in sorted(set(b) | set(f)) if (p in b) != (p in f) or b[p] != f[p]]
    for k in sorted((set(base) | set(full)) - {'services', 'name'}):
        if (k in base) != (k in full):   # before normalising: a key main adds as null is still an addition
            v = full[k] if k in full else base[k]
            paths += [f'{k}.{x}' for x in sorted(v)] if isinstance(v, dict) and v else [k]
            continue
        bk, fk = base.get(k) or {}, full.get(k) or {}
        if isinstance(bk, dict) and isinstance(fk, dict):
            paths += [f'{k}.{x}' for x in sorted(set(bk) | set(fk)) if (x in bk) != (x in fk) or bk.get(x) != fk.get(x)]
        elif bk != fk:
            paths.append(k)
    return paths


def classify(path):
    """Why a main-override path is fine for lanes, or None (the tripwire)."""
    svc = re.split(r'[.\[]', path, 1)[0]
    if svc in PARITY_SERVICES:
        # Fields compare_service skips are NOT compared, so main's additions there must be classified one by
        # one (the derived rules in _structure cover only the lane's own host entry and edge reachability).
        field = re.split(r'[.\[]', path[len(svc) + 1:], 1)[0]
        return OVERRIDE_CLASSIFIED.get(path) if field in PARITY_SKIP_FIELDS else 'compared by parity'
    m = re.fullmatch(r'functions\.environment\.([A-Za-z0-9_]+)', path)
    if m and m.group(1) in FN_ENV_ALLOW | FN_ENV_REGENERATE | FN_ENV_LANE_OWN | FN_ENV_NOT_IN_LANES:
        return 'function env (P1672 deny by default)'
    return OVERRIDE_CLASSIFIED.get(path)


def container_drift(svc_render, require_running, render=None):
    """A container against the config it was rendered from: image, env and, given the whole render, its
    networks and host entries (a hand-fixed lane.yml whose container was never recreated still runs the old
    ones). Env the image itself bakes in is not a difference. Report lines never print a secret."""
    name = svc_render.get('container_name')
    if not name:
        return ['a compared service has no container_name in its config; its container cannot be checked']
    p = run(['docker', 'inspect', name], check=False)
    if p.returncode != 0:
        missing = 'no such' in (p.stderr or '').lower()
        return [f'{name}: container does not exist' if missing else
                f'{name}: docker inspect failed (exit {p.returncode}); the container could not be checked']
    c = json.loads(p.stdout)[0]
    fails = []
    if require_running and not c.get('State', {}).get('Running'):
        fails.append(f'{name}: container is not running')
    if c['Config'].get('Image') != svc_render.get('image'):
        fails.append(f'{name}: runs image {c["Config"].get("Image")!r}, its config says {svc_render.get("image")!r}')
    if render is not None:
        nets = render.get('networks') or {}
        proj = render.get('name') or ''
        want_n = {(nets.get(n) or {}).get('name') or f'{proj}_{n}' for n in (svc_render.get('networks') or {})}
        have_n = set((c.get('NetworkSettings') or {}).get('Networks') or {})
        if want_n != have_n:
            fails.append(f'{name}: attached to networks {sorted(have_n)}, its config says {sorted(want_n)}')
        if host_entries(svc_render.get('extra_hosts')) != host_entries((c.get('HostConfig') or {}).get('ExtraHosts')):
            fails.append(f'{name}: its host entries differ from its config file')
    cenv = dict(e.split('=', 1) for e in c['Config'].get('Env') or [] if '=' in e)
    # The env baked into the image the container actually runs (by id): a re-pulled tag may differ.
    ip = run(['docker', 'image', 'inspect', c.get('Image') or c['Config'].get('Image', ''), '-f', '{{json .Config.Env}}'],
             check=False)
    if ip.returncode != 0:
        # Without the image's own env, every variable it bakes in would read as a stray one: say why instead.
        return fails + [f'{name}: its image could not be inspected (exit {ip.returncode}); its env was not compared']
    baked = dict(e.split('=', 1) for e in (json.loads(ip.stdout) or []) if '=' in e)
    want = {k: v for k, v in (svc_render.get('environment') or {}).items() if v is not None}
    for k in sorted(set(want) | set(cenv)):
        if k in want and cenv.get(k) != want[k]:
            fails.append(f'{name}: runs with {k} ' + ('missing' if k not in cenv else 'different from its config file') +
                         ('' if SECRET_NAME.search(k) else f' ({shown(cenv.get(k))}, config {shown(want[k])})'))
        elif k not in want and baked.get(k) != cenv[k]:
            fails.append(f'{name}: runs with {k}, which its config file does not set')
    return fails


def auth_settings(port, anon):
    p = run(['curl', '-s', '-f', '-m', '10', '-K', '-', f'http://127.0.0.1:{port}/auth/v1/settings'],
            input=f'header = "apikey: {anon}"\n', check=False)
    try:
        return json.loads(p.stdout) if p.returncode == 0 else None
    except ValueError:
        return None


def parity_report(lane, running=True, settings=True, boot=False):
    """(failures, warnings) for the lane against the main lane. running: also its containers. settings: also
    auth's own /auth/v1/settings through each gateway. boot: take the lane origin from its own .env, since
    tailscaled may not be up yet; everywhere else it comes from Tailscale, so a lane whose URLs name a stale
    host fails here, not first at the lift's outbound check (review round 2, Opus N3). Renders and reads only.
    A comparison that cannot run (a docker timeout, a missing file, Tailscale down) is a failure, never an
    exception, so every caller refuses the same way (Codex 5)."""
    try:
        return _parity_report(lane, running, settings, boot)
    except Exception as e:
        return [f'the comparison could not run ({why_failed(e)})'], []


def _parity_report(lane, running, settings, boot):
    fails, warns = [], []
    try:
        main_r, main_base, lane_r = render_main(), render_main(['docker-compose.yml']), render_lane(lane)
    except CheckFailed as e:
        return [f'render: {e}'], warns
    ctx = {'origin': lane_origin(lane) if boot else origin(lane), 'ts_ip': lane_ts_ip(lane), 'lane_env': lane_env(lane), 'main_env': main_env(),
           'grandfathered': PARITY_GRANDFATHERED.get((lane, load(lane).get('generation')), {})}
    for s in PARITY_SERVICES:
        ms, ls = (main_r.get('services') or {}).get(s), (lane_r.get('services') or {}).get(s)
        if ms is None or ls is None:
            fails.append(f'{s}: service missing on {"main" if ms is None else "the lane"}')
            continue
        fails += compare_service(s, ms, ls, main_r, lane_r, ctx)
    for p in override_contributions(main_base, main_r):
        if not classify(p):
            fails.append(f'tripwire: the main lane sets {p}, which lanectl has not classified. Decide whether lanes '
                         f'need it, then add a rule or a classification (OVERRIDE_CLASSIFIED, FN_ENV_*)')
    if running:
        for s in PARITY_SERVICES:
            if s in (lane_r.get('services') or {}):
                fails += container_drift(lane_r['services'][s], require_running=True, render=lane_r)
            if s in (main_r.get('services') or {}):   # main-lane upkeep: reported, never a lane failure
                try:   # even when the inspection itself fails (Codex round 2, finding 6)
                    warns += [f'main lane: {w}' for w in container_drift(main_r['services'][s], require_running=True,
                                                                         render=main_r)]
                except Exception as e:
                    warns.append(f'main lane: {s}: the container could not be inspected ({why_failed(e)})')
    if settings:
        me, le = ctx['main_env'], ctx['lane_env']
        lane_s = auth_settings(LANES[lane]['kong_port'], le.get('ANON_KEY', ''))
        main_s = auth_settings(me.get('KONG_HTTP_PORT', '8000'), me.get('ANON_KEY', ''))
        if lane_s is None:
            fails.append('auth settings: the lane auth server did not answer /auth/v1/settings through its gateway')
        elif main_s is None:
            warns.append('auth settings: the main lane did not answer /auth/v1/settings; not compared')
        elif lane_s != main_s:
            keys = sorted(k for k in set(lane_s) | set(main_s) if lane_s.get(k) != main_s.get(k))
            ext = sorted(k for k in set(lane_s.get('external') or {}) | set(main_s.get('external') or {})
                         if (lane_s.get('external') or {}).get(k) != (main_s.get('external') or {}).get(k))
            fails.append(f'auth settings: the lane auth server answers differently from main ({", ".join(keys)}'
                         f'{"; sign-in providers " + ", ".join(ext) if ext else ""})')
    return fails, warns


def why_failed(e):
    """A cause line for an exception that never carries a value: file names, exit codes, timeouts and
    lanectl's own messages only (review round 2, Opus N5)."""
    if isinstance(e, FileNotFoundError):
        return f'missing file {e.filename}'
    if isinstance(e, subprocess.TimeoutExpired):
        return f'{" ".join(map(str, e.cmd[:3]))} timed out after {e.timeout}s'
    if isinstance(e, subprocess.CalledProcessError):
        return f'{" ".join(map(str, e.cmd[:3]))} exited {e.returncode}'
    if isinstance(e, json.JSONDecodeError):
        return f'unreadable JSON at line {e.lineno}'
    if type(e) is RuntimeError:   # lanectl's own messages; run()'s carries a docker stderr tail, cut at ' ... '
        return f'RuntimeError: {str(e).split(" ... ", 1)[0]}'
    return type(e).__name__


def report_parity(lane, fails, warns):
    for w in warns:
        say(f'PARITY WARNING: {w}')
    for f in fails:
        print(f'PARITY FAILED: {f}', flush=True)


# --- database copy ---------------------------------------------------------------------------------

def copy_main_db(lane):
    """Online physical copy of the main lane's cluster (low-level backup API; no config change on main)."""
    d = ldir(lane)
    data = d / 'volumes/db/data'
    tmp = d / 'tmp'
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    script = r"""\set ON_ERROR_STOP 1
SELECT pg_backup_start('cp-lane-copy', true);
\! rm -f /tmp/cp-lane-base.tar /tmp/cp-lane-wal.tar /tmp/cp-lane-backup_label; tar -C /var/lib/postgresql/data -cf /tmp/cp-lane-base.tar --exclude=./pg_wal --exclude=./postmaster.pid --exclude=./postmaster.opts --exclude='./pg_replslot/*' --exclude='./pg_stat_tmp/*' . ; echo tar-base-exit=$?
\pset format unaligned
\pset tuples_only on
\o /tmp/cp-lane-backup_label
SELECT labelfile FROM pg_backup_stop(false);
\o
\! tar -C /var/lib/postgresql/data -cf /tmp/cp-lane-wal.tar ./pg_wal ; echo tar-wal-exit=$?
"""
    # Per-lane names inside the main container: two lanes provisioning at once must never pair one
    # copy's backup label with the other's data.
    script = script.replace('/tmp/cp-lane-', f'/tmp/cp-{lane}-').replace("'cp-lane-copy'", f"'cp-{lane}-copy'")
    names = [f'cp-{lane}-base.tar', f'cp-{lane}-wal.tar', f'cp-{lane}-backup_label']
    try:
        p = run(['docker', 'exec', '-i', MAIN_DB, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q'], input=script, timeout=900)
        # tar exit 1 = "file changed as we read it", expected for an online base backup; 2 is a real failure.
        for m in re.findall(r'tar-(base|wal)-exit=(\d+)', p.stdout):
            if int(m[1]) > 1:
                raise RuntimeError(f'copy: tar of {m[0]} failed (exit {m[1]})')
        for f in names:
            run(['docker', 'cp', f'{MAIN_DB}:/tmp/{f}', str(tmp / f)])
    finally:
        # Never leave the copy's temp files inside the MAIN lane's database container, whatever failed.
        run(['docker', 'exec', MAIN_DB, 'rm', '-f', *[f'/tmp/{f}' for f in names]], check=False)
    label = (tmp / names[2]).read_text()
    if 'START WAL LOCATION' not in label:
        raise RuntimeError('copy: pg_backup_stop returned no backup label')
    data.mkdir(parents=True)
    run(['tar', '--numeric-owner', '-xpf', str(tmp / names[0]), '-C', str(data)])
    run(['tar', '--numeric-owner', '-xpf', str(tmp / names[1]), '-C', str(data)])
    uid, gid = (run(['docker', 'exec', MAIN_DB, 'id', '-u', 'postgres']).stdout.strip(),
                run(['docker', 'exec', MAIN_DB, 'id', '-g', 'postgres']).stdout.strip())
    (data / 'backup_label').write_text(label.rstrip('\n') + '\n')
    for sub in ('pg_replslot', 'pg_stat_tmp'):
        (data / sub).mkdir(exist_ok=True)
    run(['chown', '-R', f'{uid}:{gid}', str(data)])
    os.chmod(data, 0o700)
    # pgsodium root key + custom config: vault entries decrypt in the lane exactly as in the main lane.
    cfg = d / 'volumes/db-config'
    cfg.mkdir(parents=True)
    run(['docker', 'cp', f'{MAIN_DB}:/etc/postgresql-custom/.', str(cfg)])
    run(['chown', '-R', f'{uid}:{gid}', str(cfg)])
    shutil.rmtree(tmp, ignore_errors=True)


def lane_psql(lane, sql, *, at=False, user='supabase_admin', db='postgres', timeout=600, check=True):
    args = ['docker', 'exec', '-i', cname(lane, 'db'), 'psql', '-U', user, '-d', db, '-X', '-q', '-v', 'ON_ERROR_STOP=1']
    if at:
        args.append('-At')
    return run(args, input=sql, timeout=timeout, check=check)


def sql_lit(s):
    return "'" + s.replace("'", "''") + "'"


def configure_lane_db(lane):
    """Rewrite everything in the copy that belongs to the main lane. The lane is quarantined throughout."""
    env = lane_env(lane)
    pw = env['POSTGRES_PASSWORD']
    roles = lane_psql(lane, "SELECT rolname FROM pg_authid WHERE rolpassword IS NOT NULL ORDER BY 1;", at=True).stdout.split()
    stmts = [f'ALTER ROLE {r} WITH PASSWORD {sql_lit(pw)};' for r in roles if re.fullmatch(r'[a-z_]+', r)]
    stmts += [
        f'ALTER DATABASE postgres SET "app.settings.jwt_secret" TO {sql_lit(env["JWT_SECRET"])};',
        f'ALTER DATABASE postgres SET "app.settings.jwt_exp" TO {sql_lit(env.get("JWT_EXPIRY", "3600"))};',
    ]
    lane_psql(lane, '\n'.join(stmts) + '\n')
    # Realtime keeps its tenant (with main's JWT secret, encrypted with main's key) in _realtime;
    # drop it so realtime seeds the lane's own tenant on start.
    lane_psql(lane, "DO $$ BEGIN IF to_regclass('_realtime.tenants') IS NOT NULL THEN TRUNCATE _realtime.tenants CASCADE; END IF; END $$;\n")
    cron_off(lane, record=True)
    rewrite_vault(lane)
    lane_psql(lane, CLEAR_SQL, timeout=900)


def cron_off(lane, record):
    """Deactivate every cron job. With record=True, remember which were active (restored on lift)."""
    if record:
        active = lane_psql(lane, 'SELECT jobid FROM cron.job WHERE active ORDER BY 1;', at=True).stdout.split()
        (ldir(lane) / 'cron-active.json').write_text(json.dumps([int(x) for x in active]))
    lane_psql(lane, 'UPDATE cron.job SET active = false WHERE active;\n')


def rewrite_vault(lane):
    env = lane_env(lane)
    names = lane_psql(lane, 'SELECT name FROM vault.secrets ORDER BY 1;', at=True).stdout.split()
    unknown = [n for n in names if n not in VAULT_URL | VAULT_ANON | VAULT_KEEP and not n.startswith(VAULT_DENY_PREFIXES)]
    if unknown:
        raise RuntimeError(f'vault holds entries lanectl does not classify: {", ".join(unknown)}. Add them to lanectl.py first.')
    stmts = []
    for n in names:
        if n.startswith(VAULT_DENY_PREFIXES):
            stmts.append(f'DELETE FROM vault.secrets WHERE name = {sql_lit(n)};')
        elif n in VAULT_URL:
            # Keep the function path, swap the origin for the lane's internal gateway.
            stmts.append(f"SELECT vault.update_secret(id, 'http://kong:8000' || substring(decrypted_secret from '/functions/v1/.*$')) "
                         f"FROM vault.decrypted_secrets WHERE name = {sql_lit(n)};")
        elif n in VAULT_ANON:
            stmts.append(f'SELECT vault.update_secret(id, {sql_lit(env["ANON_KEY"])}) FROM vault.secrets WHERE name = {sql_lit(n)};')
    # Internal shared secrets: an entry holding a main value that the function env regenerated gets the
    # same fresh value, so the pair keeps matching inside the lane and no longer matches the main lane.
    secret_map = json.loads((ldir(lane) / 'secret-map.json').read_text())
    for row in lane_psql(lane, "SELECT name || E'\\t' || coalesce(decrypted_secret, '') FROM vault.decrypted_secrets;",
                         at=True).stdout.splitlines():
        n, _, v = row.partition('\t')
        if n in VAULT_SECRET:
            # Paired with a regenerated function secret: the same fresh value. Unpaired: a fresh value of its own
            # (no function in the lane checks it, so nothing breaks, and main's value never stays in the lane).
            fresh = secret_map.get(v) or secrets.token_hex(32)
            stmts.append(f'SELECT vault.update_secret(id, {sql_lit(fresh)}) FROM vault.secrets WHERE name = {sql_lit(n)};')
    lane_psql(lane, '\n'.join(stmts) + '\n')


# --- caddy + firewall ------------------------------------------------------------------------------

def caddy_data():
    return Path(run(['docker', 'volume', 'inspect', CADDY_VOLUME, '-f', '{{.Mountpoint}}']).stdout.strip())


def caddy_reload():
    run(['docker', 'exec', MAIN_CADDY, 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
    run(['docker', 'exec', MAIN_CADDY, 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])


def caddy_setup():
    """One-time: lanes dir in the caddy data volume, an import line and a main-site access log in Caddyfile.cp."""
    lanes = caddy_data() / 'cp-lanes'
    (lanes / 'certs').mkdir(parents=True, exist_ok=True)
    (lanes / 'logs').mkdir(parents=True, exist_ok=True)
    ph = lanes / '000-placeholder.caddy'
    if not ph.exists():
        ph.write_text('# lanectl: lane sites are the other *.caddy files here.\n')
    cf = MAIN_DIR / 'Caddyfile.cp'
    text = cf.read_text()
    if 'import /data/cp-lanes/*.caddy' in text:
        return False
    new = text
    if 'cp-lanes/logs/main-access.log' not in new:
        new = new.replace('\theader -Server\n}', '\theader -Server\n\tlog {\n\t\toutput file /data/cp-lanes/logs/main-access.log {\n'
                                                '\t\t\troll_size 20MiB\n\t\t\troll_keep 5\n\t\t}\n\t\tformat json\n\t}\n}', 1)
    new = new.rstrip('\n') + '\n\nimport /data/cp-lanes/*.caddy\n'
    cand = lanes / '.candidate-Caddyfile'
    cand.write_text(new)
    run(['docker', 'exec', MAIN_CADDY, 'caddy', 'validate', '--config', '/data/cp-lanes/.candidate-Caddyfile', '--adapter', 'caddyfile'])
    shutil.copy2(cf, MAIN_DIR / f'Caddyfile.cp.pre-p1672-{time.strftime("%Y%m%d-%H%M%S")}')
    with open(cf, 'r+') as f:   # in place: the container bind-mounts this one inode
        f.seek(0)
        f.write(new)
        f.truncate()
    cand.unlink()
    caddy_reload()
    return True


def caddy_route_add(lane):
    host, ts_ip = ts_identity()
    lanes = caddy_data() / 'cp-lanes'
    crt, key = lanes / 'certs' / f'{host}.crt', lanes / 'certs' / f'{host}.key'
    run(['tailscale', 'cert', '--cert-file', str(crt), '--key-file', str(key), host], timeout=180)
    os.chmod(key, 0o600)
    c = LANES[lane]
    site = f"""# lanectl: {lane}. Tailscale only (bound to the tailnet address).
https://{host}:{c['https_port']} {{
	bind {ts_ip}
	tls /data/cp-lanes/certs/{host}.crt /data/cp-lanes/certs/{host}.key
	@api path /rest/v1/* /auth/v1/* /realtime/v1/* /storage/v1/* /functions/v1/*
	handle @api {{
		request_body {{
			max_size 50MB
		}}
		reverse_proxy 127.0.0.1:{c['kong_port']}
	}}
	# Production e-mail designs, the same files the main lane serves (auth fetches them by URL).
	handle_path /_cp-email-templates/* {{
		root * /srv/cp-email-templates
		file_server
	}}
	handle {{
		respond "Not Found" 404
	}}
	header -Server
	log {{
		output file /data/cp-lanes/logs/{lane}-access.log {{
			roll_size 10MiB
			roll_keep 3
		}}
		format json
	}}
}}
"""
    f = lanes / f'{lane}.caddy'
    tmp = lanes / f'.{lane}.caddy.tmp'
    tmp.write_text(site)
    os.replace(tmp, f)
    try:
        caddy_reload()
    except Exception:
        f.unlink(missing_ok=True)
        caddy_reload()
        raise


def caddy_route_remove(lane):
    f = caddy_data() / 'cp-lanes' / f'{lane}.caddy'
    if f.exists():
        f.unlink()
        caddy_reload()


def fw_rules(lane, ts_ip):
    sub = LANES[lane]['edge_subnet']
    tag = ['-m', 'comment', '--comment', f'cp-{lane}']
    port = str(LANES[lane]['https_port'])
    new = ['-m', 'conntrack', '--ctstate', 'NEW']   # only connections the lane STARTS; replies always pass
    return [
        # INPUT (connections to the host's own addresses): only the lane's own origin.
        ('INPUT', ['-s', sub, '-d', ts_ip, '-p', 'tcp', '--dport', port, *tag, '-j', 'ACCEPT']),
        ('INPUT', ['-s', sub, *new, *tag, '-j', 'REJECT']),
        # FORWARD via DOCKER-USER: inside the lane's own subnet is fine; the main lane's public address,
        # other docker networks, the VPC and other tailnet machines are not.
        ('DOCKER-USER', ['-s', sub, '-d', sub, *tag, '-j', 'ACCEPT']),
        ('DOCKER-USER', ['-s', sub, '-d', PUBLIC_IP, *new, *tag, '-j', 'REJECT']),
        ('DOCKER-USER', ['-s', sub, '-d', '172.16.0.0/12', *new, *tag, '-j', 'REJECT']),
        ('DOCKER-USER', ['-s', sub, '-d', '100.64.0.0/10', *new, *tag, '-j', 'REJECT']),
        ('DOCKER-USER', ['-s', sub, '-d', '10.0.0.0/8', *new, *tag, '-j', 'REJECT']),
        ('DOCKER-USER', ['-s', sub, '-d', '192.168.0.0/16', *new, *tag, '-j', 'REJECT']),
        # Link-local, including the cloud metadata server (it would hand out the VM's service-account token).
        ('DOCKER-USER', ['-s', sub, '-d', '169.254.0.0/16', *new, *tag, '-j', 'REJECT']),
    ]


def lane_ts_ip(lane):
    """The lane's tailnet address, recorded at provisioning, so the firewall can be restored at boot
    before Tailscale (or Docker) is up. Falls back to asking Tailscale."""
    f = ldir(lane) / 'ts_ip'
    return f.read_text().strip() if f.exists() else ts_identity()[1]


def fw_apply(lane):
    ts_ip = lane_ts_ip(lane)
    # At boot this runs BEFORE docker starts the lane containers, when DOCKER-USER may not exist yet;
    # docker keeps an existing DOCKER-USER chain and its rules.
    if subprocess.run(['iptables', '-L', 'DOCKER-USER', '-n'], capture_output=True).returncode != 0:
        run(['iptables', '-N', 'DOCKER-USER'])
    if fw_ok(lane) and fw_count(lane) == len(fw_rules(lane, ts_ip)):
        return
    # Anything missing, duplicated or out of order: rebuild the lane's whole rule set, in order, at the
    # top of each chain. Inserting only the missing rule would land it above the lane's ACCEPT.
    fw_remove(lane)
    for chain, spec in reversed(fw_rules(lane, ts_ip)):
        run(['iptables', '-I', chain, '1', *spec])
    if not fw_ok(lane) or fw_count(lane) != len(fw_rules(lane, ts_ip)):
        raise RuntimeError(f'{lane}: firewall rules did not land as expected')


def fw_count(lane):
    return sum(1 for chain in ('INPUT', 'DOCKER-USER') for l in run(['iptables', '-S', chain]).stdout.splitlines()
               if f'cp-{lane}' in l)


def fw_ok(lane):
    ts_ip = lane_ts_ip(lane)
    for chain, spec in fw_rules(lane, ts_ip):
        if subprocess.run(['iptables', '-C', chain, *spec], capture_output=True).returncode != 0:
            return False
    for chain in ('INPUT', 'DOCKER-USER'):   # each chain's ACCEPT must sit above its REJECTs
        lines = run(['iptables', '-S', chain]).stdout.splitlines()
        tagged = [i for i, l in enumerate(lines) if f'cp-{lane}' in l]
        acc = [i for i in tagged if 'ACCEPT' in lines[i]]
        rej = [i for i in tagged if 'REJECT' in lines[i]]
        if not (acc and rej) or max(acc) > min(rej):
            return False
    return True


def fw_remove(lane):
    """Delete EVERY rule tagged for this lane, whatever its shape (older rule sets included)."""
    import shlex
    for chain in ('INPUT', 'DOCKER-USER'):
        for line in run(['iptables', '-S', chain]).stdout.splitlines():
            if f'--comment cp-{lane}' in line and line.startswith(f'-A {chain} '):
                run(['iptables', '-D', chain, *shlex.split(line)[2:]])


# Catalog fingerprint: owners, ACLs, RLS flags, policies, default privileges and functions (with
# SECURITY DEFINER and a body hash). P1538: a green logical restore once carried 299 wrong ACLs.
CATALOG_SQL = r"""
SELECT 'schema', n.nspname, pg_get_userbyid(n.nspowner), coalesce(n.nspacl::text, '')
  FROM pg_namespace n WHERE n.nspname !~ '^(pg_temp|pg_toast_temp|_cp_lane$)'
UNION ALL
SELECT 'relation', n.nspname || '.' || c.relname || ' ' || c.relkind::text, pg_get_userbyid(c.relowner),
       coalesce(c.relacl::text, '') || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname !~ '^(pg_temp|pg_toast|_cp_lane$)'
   -- realtime's janitor rotates dated message partitions on its own schedule in each stack
   AND NOT (n.nspname = 'realtime' AND c.relname ~ '^messages_[0-9]{4}_[0-9]{2}_[0-9]{2}')
UNION ALL
SELECT 'column-acl', n.nspname || '.' || c.relname || '.' || a.attname, '', a.attacl::text
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE a.attacl IS NOT NULL AND n.nspname !~ '^(pg_temp|_cp_lane$)'
UNION ALL
SELECT 'policy', schemaname || '.' || tablename || ' ' || policyname, array_to_string(roles, ','),
       cmd || ' ' || permissive || ' ' || regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\s+', ' ', 'g')
  FROM pg_policies
UNION ALL
SELECT 'default-acl', pg_get_userbyid(d.defaclrole) || ' ' || coalesce(n.nspname, '*') || ' ' || d.defaclobjtype::text, '', d.defaclacl::text
  FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
UNION ALL
SELECT 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       pg_get_userbyid(p.proowner), coalesce(p.proacl::text, '') || ' secdef=' || p.prosecdef || ' body=' || md5(coalesce(p.prosrc, ''))
       || ' config=' || coalesce(array_to_string(p.proconfig, ','), '')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname !~ '^(pg_catalog|information_schema|_cp_lane)$'
ORDER BY 1, 2;
"""


def catalog_rows(container):
    p = run(['docker', 'exec', '-i', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-At', '-F', '\t',
             '-v', 'ON_ERROR_STOP=1'], input=CATALOG_SQL, timeout=300)
    rows = p.stdout.splitlines()
    if len(rows) < 100:   # the main lane has thousands; a near-empty answer is a broken probe, not a match
        raise RuntimeError(f'catalog probe on {container} returned {len(rows)} rows; refusing to call that a match')
    return rows


def catalog_diff(lane):
    main_rows, lane_rows = catalog_rows(MAIN_DB), catalog_rows(cname(lane, 'db'))
    ms, ls = set(main_rows), set(lane_rows)
    kinds = sorted({r.split('\t', 1)[0] for r in ms | ls})
    print('kind\tmain\tlane\tonly-main\tonly-lane')
    for k in kinds:
        mk = {r for r in ms if r.startswith(k + '\t')}
        lk = {r for r in ls if r.startswith(k + '\t')}
        print(f'{k}\t{len(mk)}\t{len(lk)}\t{len(mk - lk)}\t{len(lk - mk)}')
    diff = sorted(('main-only\t' + r for r in ms - ls)) + sorted(('lane-only\t' + r for r in ls - ms))
    for r in diff[:40]:
        print(r[:300])
    print(f'catalog rows: main {len(ms)}, lane {len(ls)}, differing {len(diff)}')
    return len(diff)


# --- quarantine, check, lift -----------------------------------------------------------------------

def quarantine(lane):
    """Stop what can act first (functions, cron), record it, and only then remove the client route, so a
    Caddy failure can never leave functions running in a lane that reads as quarantined."""
    st = load(lane)
    compose(lane, 'stop', 'functions', check=False)
    if run(['docker', 'inspect', '-f', '{{.State.Running}}', cname(lane, 'db')], check=False).stdout.strip() == 'true':
        cron_off(lane, record=not st.get('quarantined') and st.get('state') == 'ready')
    st['quarantined'] = True
    save(st)
    event(lane, f'gen {st["generation"]}: quarantined')
    caddy_route_remove(lane)


def outbound_check(lane):
    """Every outbound address and credential reachable from the lane belongs to the lane or is absent."""
    fails = []
    env, menv = lane_env(lane), main_env()
    o = origin(lane)
    main_secrets = {k: menv.get(k, '') for k in ('ANON_KEY', 'SERVICE_ROLE_KEY', 'JWT_SECRET', 'POSTGRES_PASSWORD')}
    main_markers = [MAIN_ORIGIN, '136-85-1-126', PUBLIC_IP, 'supabase.co'] + [v for v in main_secrets.values() if v]
    # The main lane's deny-listed function secrets (its mail key, voice and transcription credentials)
    # must not surface anywhere in a lane under any name.
    # A value the main lane ALSO stores under a name a lane may hold (one Gemini key serving both the
    # voice and the mirror features, say) is shared by design, not a leak.
    # Every main function-env value a lane must not hold: all of them except the allowlisted names'
    # (regenerated internal secrets included, so a missed regeneration is caught).
    denied, allowed = set(), set()
    for line in (MAIN_DIR / 'functions.env').read_text().splitlines():
        k, _, v = line.partition('=')
        v = v.strip().strip('"').strip("'")
        if len(v) >= 16:
            (allowed if k.strip() in FN_ENV_ALLOW else denied).add(v)
    main_markers += sorted(denied - allowed)
    # And the main lane's own internal vault secrets, read from its database (never printed).
    mv = run(['docker', 'exec', '-i', MAIN_DB, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-At', '-v',
              'ON_ERROR_STOP=1'], input="SELECT name || E'\\t' || coalesce(decrypted_secret, '') FROM vault.decrypted_secrets;\n",
             check=False)
    if mv.returncode != 0:
        fails.append('could not read the main lane vault to compare against; refusing to call the lane clean')
    for row in mv.stdout.splitlines():
        n, _, v = row.partition('\t')
        if n in VAULT_SECRET and len(v) >= 16:
            main_markers.append(v)

    public_markers = {MAIN_ORIGIN, '136-85-1-126', PUBLIC_IP, 'supabase.co'}

    def leaks(value):   # names only public markers; a matched secret is reported, never printed
        return [m if m in public_markers else '<main secret>' for m in main_markers if m and m in value]

    # 1. vault
    rows = lane_psql(lane, "SELECT name || E'\\t' || coalesce(decrypted_secret, '<NULL>') FROM vault.decrypted_secrets ORDER BY 1;",
                     at=True).stdout.splitlines()
    for row in rows:
        n, _, v = row.partition('\t')
        if n.startswith(VAULT_DENY_PREFIXES):
            fails.append(f'vault: deny-listed entry {n} present')
        elif n in VAULT_URL and not v.startswith('http://kong:8000/functions/v1/'):
            fails.append(f'vault: {n} does not point at the lane gateway')
        elif n in VAULT_ANON and v != env['ANON_KEY']:
            fails.append(f'vault: {n} is not the lane anon key')
        elif n not in VAULT_URL | VAULT_ANON | VAULT_KEEP:
            fails.append(f'vault: unclassified entry {n}')
        if v == '<NULL>':
            fails.append(f'vault: {n} decrypts to NULL')
        if leaks(v):
            fails.append(f'vault: {n} holds a main-lane value ({", ".join(leaks(v))})')
    # 2. function env file
    fe = parse_env((ldir(lane) / 'functions.env').read_text())
    lane_names = FN_ENV_ALLOW | FN_ENV_REGENERATE | FN_ENV_LANE_OWN
    for k, v in fe.items():
        if k not in lane_names and not (k.startswith('MAILGUN_') and (ROOT / 'mail.env').exists()):
            fails.append(f'functions.env: {k} is not a name a lane may hold')
        if leaks(v):
            fails.append(f'functions.env: {k} holds a main-lane value')
    if 'MAILGUN_DOMAIN' in fe and not LANE_MAIL_DOMAIN.fullmatch(fe['MAILGUN_DOMAIN']):
        fails.append('functions.env: MAILGUN_DOMAIN is not a Mailgun sandbox domain (lane mail must reach only confirmed recipients)')
    # 3. the functions container as created (its real env)
    cfg = run(['docker', 'inspect', cname(lane, 'functions')], check=False)
    if cfg.returncode != 0:
        fails.append('functions container does not exist')
    else:
        cenv = dict(e.split('=', 1) for e in json.loads(cfg.stdout)[0]['Config']['Env'] if '=' in e)
        if cenv.get('SUPABASE_URL') != o:
            fails.append(f'functions: SUPABASE_URL is {cenv.get("SUPABASE_URL")!r}, not the lane origin')
        if cenv.get('SUPABASE_ANON_KEY') != env['ANON_KEY'] or cenv.get('SUPABASE_SERVICE_ROLE_KEY') != env['SERVICE_ROLE_KEY']:
            fails.append('functions: Supabase keys are not the lane keys')
        for k, v in cenv.items():
            if leaks(v):
                fails.append(f'functions: env {k} holds a main-lane value')
    # 4. database settings
    js = lane_psql(lane, "SELECT current_setting('app.settings.jwt_secret', true);", at=True).stdout.strip()
    if js != env['JWT_SECRET']:
        fails.append('db: app.settings.jwt_secret is not the lane secret')
    # 5. cron commands: nothing may name an outside address
    for row in lane_psql(lane, "SELECT jobname || E'\\t' || command FROM cron.job;", at=True).stdout.splitlines():
        n, _, cmd = row.partition('\t')
        if re.search(r'https?://', cmd) and 'http://kong:8000' not in cmd:
            fails.append(f'cron: {n} names an outside address')
    # 6. inherited runnable work and provider identities
    q = lane_psql(lane, r"""SELECT
      (SELECT count(*) FROM public.canvas_draft_runs WHERE state IN ('queued','running')) +
      (SELECT count(*) FROM public.transcription_jobs WHERE status IN ('pending','processing')) +
      (SELECT count(*) FROM public.transcribe_room_transcription_jobs WHERE status IN ('pending','processing')) +
      (SELECT count(*) FROM public.mirror_jobs) + (SELECT count(*) FROM public.transcribe_round_clean_jobs) +
      (SELECT count(*) FROM public.chat_voice_purge) + (SELECT count(*) FROM net.http_request_queue),
      (SELECT count(*) FROM public.event_rsvps r JOIN _cp_lane.inherited_rsvps i ON i.id = r.id,
              jsonb_each_text(coalesce(r.mailgun_message_ids, '{}'::jsonb)) e WHERE e.value <> 'SENT_NO_ID');""",
                  at=True, check=False)
    if q.returncode != 0:
        fails.append(f'queues: could not count ({q.stderr.strip()[-200:]})')
    else:
        runnable, ids = q.stdout.strip().split('|')
        if int(runnable):
            fails.append(f'queues: {runnable} runnable row(s)')
        if int(ids):
            fails.append(f'provider ids: {ids} inherited Mailgun id(s) still addressable')
    # 7. network shape and firewall
    nets = json.loads(run(['docker', 'inspect', cname(lane, 'db')]).stdout)[0]['NetworkSettings']['Networks']
    if list(nets) != [f'cp-{lane}_default']:
        fails.append(f'db: attached to {", ".join(nets)}; must be only on the internal lane network')
    internal = run(['docker', 'network', 'inspect', f'cp-{lane}_default', '-f', '{{.Internal}}']).stdout.strip()
    if internal != 'true':
        fails.append('network: the lane default network is not internal')
    # The firewall is IPv4 only, so neither lane network may carry IPv6.
    for net in (f'cp-{lane}_default', f'cp-{lane}_edge'):
        if run(['docker', 'network', 'inspect', net, '-f', '{{.EnableIPv6}}']).stdout.strip() != 'false':
            fails.append(f'network: {net} has IPv6 enabled; the lane firewall covers IPv4 only')
    if not fw_ok(lane):
        fails.append('firewall: lane rules missing or out of order')
    return fails


def probe_functions(lane):
    names = functions_ls(lane)
    env = lane_env(lane)
    port = LANES[lane]['kong_port']
    bad, ok2xx = [], 0
    for n in names:
        p = run(['curl', '-s', '-m', '30', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'OPTIONS', '-K', '-',
                 f'http://127.0.0.1:{port}/functions/v1/{n}'],
                input=f'header = "apikey: {env["ANON_KEY"]}"\nheader = "Authorization: Bearer {env["ANON_KEY"]}"\n', check=False)
        code = (p.stdout or '000').strip()
        say(f'probe: {n} answered {code}')
        if code.startswith('2'):
            ok2xx += 1
        elif code == '000' or code.startswith('5'):
            bad.append(f'{n}({code})')
    if bad:
        raise RuntimeError(f'functions did not answer OPTIONS cleanly: {" ".join(bad)}')
    if names and not ok2xx:
        raise RuntimeError('no function answered 2xx to OPTIONS; the probe may not reach the workers')


def wait_healthy(lane, services, timeout=240):
    end = time.time() + timeout
    pending = list(services)
    while pending and time.time() < end:
        still = []
        for s in pending:
            r = run(['docker', 'inspect', '-f', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
                     cname(lane, s)], check=False)
            if r.stdout.strip() not in ('healthy', 'running'):
                still.append(s)
        pending = still
        if pending:
            time.sleep(3)
    if pending:
        raise RuntimeError(f'not healthy after {timeout}s: {", ".join(pending)}')


def lift(lane):
    """Outbound check, then functions, cron and the client route. ANY failure on the way (the check itself
    throwing, a function that cannot boot, cron or the route) ends with the lane fully quarantined, so a
    half-lifted lane never serves and the state never claims otherwise."""
    try:
        _lift(lane)
    except Exception:
        quarantine(lane)
        raise


def _lift(lane):
    st = load(lane)
    fails = outbound_check(lane)
    pfails, pwarns = parity_report(lane)   # P1724: sign-in and mail must match the main lane's
    report_parity(lane, pfails, pwarns)
    if fails or pfails:
        for f in fails:
            say(f'CHECK FAILED: {f}')
        event(lane, f'gen {st["generation"]}: lift refused ({len(fails)} outbound, {len(pfails)} parity failure(s))')
        raise CheckFailed(f'{lane} is quarantined: {len(fails)} outbound check failure(s), '
                          f'{len(pfails)} difference(s) from the main lane')
    try:
        compose(lane, 'up', '-d', 'functions', timeout=300)
        wait_healthy(lane, ['functions'])
        probe_functions(lane)
    except Exception:
        event(lane, f'gen {st["generation"]}: lift failed at the function probe; stays quarantined')
        raise
    active = json.loads((ldir(lane) / 'cron-active.json').read_text()) if (ldir(lane) / 'cron-active.json').exists() else []
    # Jobs a branch migration created while quarantined are active already; keep them in the set so a
    # later quarantine/lift cycle restores them too. (While quarantined they could only reach the lane:
    # the database has no route out of the lane's internal network.)
    active = sorted(set(active) | {int(x) for x in lane_psql(lane, 'SELECT jobid FROM cron.job WHERE active;', at=True).stdout.split()})
    (ldir(lane) / 'cron-active.json').write_text(json.dumps(active))
    if active:
        lane_psql(lane, 'UPDATE cron.job SET active = true WHERE jobid IN (%s);\n' % ','.join(str(int(x)) for x in active))
    caddy_route_add(lane)
    st = load(lane)
    st.update(state='ready', quarantined=False)
    save(st)
    event(lane, f'gen {st["generation"]}: ready (outbound check passed)')
    say(f'{lane}: outbound check passed; ready at {origin(lane)}')


# --- functions deploy ------------------------------------------------------------------------------

def functions_ls(lane):
    vol = ldir(lane) / 'volumes/functions'
    if not vol.is_dir():
        return []
    return sorted(p.name for p in vol.iterdir() if p.is_dir() and p.name not in ('_shared', 'main'))


def deploy(lane, tarball):
    """Caller holds Lock(lane). New function code is a configuration change: a ready lane re-enters
    quarantine first and is lifted again only through the outbound check (spec invariant)."""
    was_ready = not load(lane).get('quarantined')
    if was_ready:
        # P1724: a ready lane that would fail the lift's parity check is refused here, while it still
        # serves, instead of being quarantined by a lift that cannot pass.
        try:
            pfails, pwarns = parity_report(lane)
        except Exception as e:   # the check could not run: refuse the same way, the lane keeps serving
            raise CheckFailed(f'deploy refused: the parity check with the main lane could not run '
                              f'({why_failed(e)}); {lane} keeps serving the code it has') from None
        report_parity(lane, pfails, pwarns)
        if pfails:
            raise CheckFailed(f'deploy refused: {lane} differs from the main lane in {len(pfails)} place(s) and could '
                              f'not be lifted again; it keeps serving the code it has')
        quarantine(lane)
    vol = ldir(lane) / 'volumes/functions'
    vol.mkdir(parents=True, exist_ok=True)
    w = Path(tempfile.mkdtemp(prefix=f'cp-{lane}-deploy-'))
    try:
        # Root extracts a branch's tarball: regular files and directories only. A symlink (committed
        # under supabase/functions, say, pointing at the main lane's .env) would otherwise be followed
        # and its target served from the lane (review, Opus H4). The 'data' filter also refuses absolute
        # paths and members that escape the directory.
        with tarfile.open(tarball, 'r:gz') as tf:
            bad = [m.name for m in tf.getmembers() if not (m.isfile() or m.isdir())]
            if bad:
                raise RuntimeError(f'deploy refused: not a regular file or directory: {", ".join(bad[:5])}')
            tf.extractall(w, filter='data')
        full = (w / '.full-deploy').exists()
        (w / '.full-deploy').unlink(missing_ok=True)
        new_dirs = [p.name for p in w.iterdir() if p.is_dir()]
        if full:
            for d in vol.iterdir():
                if d.is_dir() and d.name not in new_dirs:
                    say(f'pruned: {d.name}')
                    shutil.rmtree(d)
        for n in new_dirs:
            shutil.rmtree(vol / n, ignore_errors=True)
            shutil.copytree(w / n, vol / n)
        for f in ('deno.json', 'deno.lock'):
            if (w / f).exists():
                shutil.copy2(w / f, vol / f)
        man = ldir(lane) / 'deploy-manifest.tsv'
        old = man.read_text().splitlines() if man.exists() and not full else []
        names = set(new_dirs) | {'deno.json', 'deno.lock'}
        keep = []
        for line in old:
            parts = line.split('\t')
            key = parts[1].split('/')[0] if len(parts) > 1 and parts[0] == 'F' else (parts[1] if len(parts) > 1 else '')
            if key not in names:
                keep.append(line)
        frag = (w / '.manifest-fragment').read_text().splitlines() if (w / '.manifest-fragment').exists() else []
        man.write_text('\n'.join(keep + frag) + '\n')
    finally:
        shutil.rmtree(w, ignore_errors=True)
        Path(tarball).unlink(missing_ok=True)
    run(['chown', '-R', '-h', 'root:root', str(vol)])   # -h: never follow a link out of the volume
    if not was_ready:
        say(f'{lane}: deployed into the volume; functions stay stopped until the lane is lifted.')
        return
    lift(lane)   # outbound check, then functions restarted on the new code and probed, cron and route back
    say(f'{lane}: functions deployed, checked and probed.')


# --- lifecycle -------------------------------------------------------------------------------------

def teardown(lane):
    """Stop and remove a lane's containers, volumes, route and firewall rules."""
    d = ldir(lane)
    caddy_route_remove(lane)
    if (d / 'lane.yml').exists() and (d / '.env').exists():
        compose(lane, 'down', '-v', '--remove-orphans', timeout=300, check=False)
    # Containers by name, in case the compose files are gone.
    for s in SERVICES_UP + ('functions',):
        run(['docker', 'rm', '-f', cname(lane, s)], check=False)
    fw_remove(lane)
    if d.exists():
        shutil.rmtree(d)


def provision(lane, gen):
    """Caller holds Lock(lane) for the whole run, so nothing else can act on this lane meanwhile."""
    st = held(lane, gen, states=('provisioning', 'failed'))   # failed: a retry of the same claim starts over
    st['state'] = 'provisioning'
    save(st)
    host, ts_ip = ts_identity()
    say(f'{lane}: tearing down the previous generation')
    teardown(lane)
    d = ldir(lane)
    for sub in ('volumes/api', 'volumes/db', 'volumes/functions', 'volumes/storage', 'volumes/deno-cache'):
        (d / sub).mkdir(parents=True, exist_ok=True)
    os.chmod(d, 0o700)
    for f in ('kong.yml', 'kong-entrypoint.sh'):
        shutil.copy2(MAIN_DIR / 'volumes/api' / f, d / 'volumes/api' / f)
    for f in (MAIN_DIR / 'volumes/db').glob('*.sql'):
        shutil.copy2(f, d / 'volumes/db' / f.name)
    # The edge runtime's dependency cache, seeded from the main lane's. A fresh cache re-downloads
    # remote modules, and at least one no longer matches the committed deno.lock (integrity check
    # failed, 2026-11-13), so a cold lane cannot boot functions the main lane serves.
    main_cache = Path(run(['docker', 'volume', 'inspect', 'supabase_deno-cache', '-f', '{{.Mountpoint}}']).stdout.strip())
    run(['cp', '-a', f'{main_cache}/.', str(d / 'volumes/deno-cache') + '/'])
    write_lane_env(lane, host)
    write_functions_env(lane)
    (d / 'lane.yml').write_text(lane_yml(lane, host, ts_ip))
    (d / 'ts_ip').write_text(ts_ip + '\n')
    compose(lane, 'config', '--quiet')
    # P1724: the written config must match the main lane's sign-in and mail before anything runs or copies.
    pfails, pwarns = parity_report(lane, running=False, settings=False)
    report_parity(lane, pfails, pwarns)
    if pfails:
        raise RuntimeError(f'{lane}: the generated config differs from the main lane in {len(pfails)} place(s)')
    fw_apply(lane)
    say(f'{lane}: copying the main-lane database (online backup)')
    copy_main_db(lane)
    st = held(lane, gen, states=('provisioning',))
    st.update(quarantined=True, provisioned_at=int(time.time()))
    save(st)
    compose(lane, 'up', '-d', 'db', timeout=300)
    wait_healthy(lane, ['db'], timeout=300)
    say(f'{lane}: rewriting roles, JWT settings, realtime tenant, cron, vault; clearing inherited work')
    configure_lane_db(lane)
    compose(lane, 'up', '-d', *[s for s in SERVICES_UP if s != 'db'], timeout=600)
    compose(lane, 'create', 'functions', timeout=300)
    wait_healthy(lane, [s for s in SERVICES_UP if s != 'db'])
    pfails, pwarns = parity_report(lane)   # P1724: now the running containers and auth's own answer
    report_parity(lane, pfails, pwarns)
    if pfails:
        raise RuntimeError(f'{lane}: the running lane differs from the main lane in {len(pfails)} place(s)')
    event(lane, f'gen {gen}: provisioned (quarantined)')
    say(f'{lane}: provisioned and quarantined. Next: deploy, migrate, lift.')


def expired(st, now=None):
    # 'draining' is a release whose teardown failed part-way: always reclaimable, never stuck.
    return st.get('state') == 'draining' or \
        (st.get('state') in ('provisioning', 'ready', 'failed') and st.get('lease_expires_at', 0) < (now or time.time()))


def reap():
    """Release every lane whose lease has expired. The expiry is re-read UNDER the lane's lock, so a
    heartbeat that lands first keeps the lane; the generation read there is the one released."""
    out = []
    for lane in ENABLED_LANES:
        try:
            with Lock(lane, blocking=False):   # busy = in use right now: skip; the next reap sees it again
                st = load(lane)
                if expired(st):
                    do_release(lane, st['generation'], 'lease expired')
                    out.append(lane)
        except LaneBusy:
            continue
    return out


def do_release(lane, gen, why):
    """Caller holds Lock(lane). Refuses unless `gen` is still the lane's generation, so a release
    decided for one generation can never tear down the next one."""
    st = load(lane)
    if st.get('generation') != gen:
        raise Refused(f'{lane}: generation {gen} is not current ({st.get("generation")}); not releasing')
    st['state'] = 'draining'
    save(st)
    event(lane, f'gen {gen}: draining ({why})')
    teardown(lane)
    st = load(lane)
    st.update(state='free', holder=None, quarantined=None, lease_expires_at=0)
    save(st)
    event(lane, f'gen {gen}: free')


# --- install ---------------------------------------------------------------------------------------

UNITS = {
    # Before docker: the lane containers restart with docker, so their rules must already be in place
    # (the tailnet address comes from the lane's own record, not from Tailscale, which may not be up).
    'cp-lane-firewall.service': """[Unit]
Description=P1672 TEST lane firewall rules (before docker starts lane containers)
Before=docker.service
After=network-pre.target

[Service]
Type=oneshot
ExecStart=/opt/supabase/lanes/bin/lanectl firewall-restore

[Install]
WantedBy=multi-user.target docker.service
""",
    # After docker: re-check the order in case docker re-inserted its own rules above ours.
    'cp-lane-firewall-post.service': """[Unit]
Description=P1672 TEST lanes: re-check firewall rules after docker, then start lanes whose rules verify
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/opt/supabase/lanes/bin/lanectl boot

[Install]
WantedBy=multi-user.target
""",
    'cp-lane-reaper.service': """[Unit]
Description=P1672 TEST lane reaper (releases lanes whose lease expired)

[Service]
Type=oneshot
ExecStart=/opt/supabase/lanes/bin/lanectl reap
""",
    'cp-lane-reaper.timer': """[Unit]
Description=P1672 TEST lane reaper, hourly

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
""",
}


def install(src):
    src = Path(src)
    BIN.mkdir(parents=True, exist_ok=True)
    for f in ('lanectl.py', 'admit.py'):
        if (src / f).exists():
            shutil.copy2(src / f, BIN / f)
            os.chmod(BIN / f, 0o755)
    wrapper = BIN / 'lanectl'
    wrapper.write_text('#!/bin/sh\nexec /usr/bin/python3 /opt/supabase/lanes/bin/lanectl.py "$@"\n')
    os.chmod(wrapper, 0o755)
    STATE.mkdir(parents=True, exist_ok=True)
    os.chmod(STATE, 0o700)
    for name, text in UNITS.items():
        Path('/etc/systemd/system', name).write_text(text)
    run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'enable', 'cp-lane-firewall.service', 'cp-lane-firewall-post.service'])
    run(['systemctl', 'enable', '--now', 'cp-lane-reaper.timer'])
    changed = caddy_setup()
    print(f'installed lanectl protocol {PROTOCOL}; caddy {"updated (import line + main access log)" if changed else "already set up"}')


# --- CLI -------------------------------------------------------------------------------------------

def opt(args, name, default=None, cast=str):
    if name in args:
        i = args.index(name)
        if i + 1 >= len(args):
            raise SystemExit(f'lanectl: {name} needs a value')
        return cast(args[i + 1])
    return default


def _boot_lane(l, cmd):
    """One lane at firewall-restore or boot. The caller holds Lock(l) and quarantines on any exception."""
    st = load(l)
    if st['state'] in ('free', 'draining'):
        return 'skip'
    fw_apply(l)
    if cmd != 'boot':
        return None
    if not fw_ok(l):
        raise RuntimeError('firewall rules do not verify after restore')   # -> quarantined by the caller
    if not st.get('quarantined'):
        # P1724 (Codex 1): compare the rendered config BEFORE anything starts. The client route survives a
        # reboot, so a lane started first would serve sign-in with a stale config until the running comparison
        # below. On a difference the route goes and only the database starts (so quarantine can record and
        # stop cron): the gateway and auth never start, so a route Caddy still holds in memory reaches nothing
        # (Codex round 2, finding 1).
        pre, pre_w = parity_report(l, running=False, settings=False, boot=True)
        if pre:
            report_parity(l, pre, pre_w)
            try:   # the file goes before the reload, so Caddy never loads it again
                caddy_route_remove(l)
            except Exception as e:
                say(f'{l}: Caddy did not drop the route ({why_failed(e)}); the gateway stays down, so it reaches nothing')
            compose(l, 'up', '-d', 'db', timeout=600)
            wait_healthy(l, ['db'])
            raise RuntimeError(f'{len(pre)} difference(s) from the main lane before start')
    compose(l, 'up', '-d', *[s for s in SERVICES_UP], timeout=600)
    if st.get('quarantined'):   # whatever started it, functions stay down and cron stays off
        compose(l, 'stop', 'functions', check=False)
        wait_healthy(l, ['db'])
        cron_off(l, record=False)
        return None
    # P1724: a serving lane must still match the main lane, which may have changed while the VM was down.
    # Auth's own answer is left to the next lift: it may not be up yet. Give auth and mail time to come up
    # first (auth restarts until the database answers), so a slow boot is not read as a stopped container;
    # if they never come up, the running comparison below says so.
    try:
        wait_healthy(l, ['auth', 'mail'])
    except RuntimeError:
        pass
    pfails, pwarns = parity_report(l, settings=False, boot=True)
    report_parity(l, pfails, pwarns)
    if pfails:
        raise RuntimeError(f'{len(pfails)} difference(s) from the main lane')
    compose(l, 'up', '-d', 'functions', timeout=300)
    return None


def main(argv):
    if not argv:
        print(__doc__)
        return 1
    cmd, args = argv[0], argv[1:]
    if cmd.startswith('admit'):
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import admit   # noqa: E402  (agent-B module, installed beside this file)
        return admit.main(argv)
    if os.geteuid() != 0:
        say('lanectl: run as root (sudo).')
        return 1
    lane = opt(args, '--lane')
    gen = opt(args, '--gen', cast=int)
    try:
        if cmd == 'version':
            print(f'protocol {PROTOCOL}')
        elif cmd == 'status':
            out = [load(l) for l in ENABLED_LANES]
            if '--json' in args:
                print(json.dumps(out))
            for st in out:
                h = st.get('holder') or {}
                exp = time.strftime('%Y-%m-%d %H:%M', time.gmtime(st.get('lease_expires_at') or 0)) if st.get('lease_expires_at') else '-'
                print(f'  {st["lane"]}: {st["state"]} gen {st.get("generation")} '
                      f'{"quarantined " if st.get("quarantined") else ""}holder {h.get("worktree", "-")}@{h.get("branch", "-")} lease to {exp}Z')
        elif cmd == 'allocate':
            h = json.loads(sys.stdin.read() or '{}')
            if not isinstance(h, dict) or not all(
                    isinstance(h.get(k), str) and re.fullmatch(r'[A-Za-z0-9._/@:+-]{1,200}', h[k]) for k in ('worktree', 'branch', 'host')):
                raise Refused('the holder must name worktree, branch and host in plain characters')
            ttl = opt(args, '--ttl', LEASE_DEFAULT, int)
            reap()
            chosen = None
            with Lock():   # serializes allocations; each lane's own lock is taken inside, never the reverse
                for l in ENABLED_LANES:
                    st = load(l)
                    if st['state'] != 'free' and (st.get('holder') or {}).get('branch') == h['branch']:
                        raise Refused(f'branch {h["branch"]} already holds {l} (one branch, one lane)')
                for l in ENABLED_LANES:
                    try:
                        lk = Lock(l, blocking=False)   # a busy lane is never free: skip it, never wait under the global lock
                        lk.__enter__()
                    except LaneBusy:
                        continue
                    try:
                        st = load(l)
                        if st['state'] != 'free':
                            continue
                        st.update(state='provisioning', generation=st.get('generation', 0) + 1, holder=h,
                                  lease_expires_at=int(time.time()) + ttl, quarantined=True, allocated_at=int(time.time()))
                        save(st)
                        event(l, f'gen {st["generation"]}: allocated to {h["worktree"]}@{h["branch"]}')
                        chosen = st
                        break
                    finally:
                        lk.__exit__()
            if chosen is None:
                raise Refused('no free lane. Wait for one, or stay on the main lane (an unclaimed worktree uses it).')
            print(json.dumps({'lane': chosen['lane'], 'generation': chosen['generation'], 'lease_expires_at': chosen['lease_expires_at']}))
        elif cmd == 'provision':
            with Lock(lane):
                try:
                    provision(lane, gen)
                except Refused:
                    raise
                except Exception:
                    st = load(lane)
                    if st.get('generation') == gen:
                        st['state'] = 'failed'
                        save(st)
                        event(lane, f'gen {gen}: provisioning failed')
                    raise
        elif cmd == 'keys':
            with Lock(lane, shared=True):
                held(lane, gen)
                e = lane_env(lane)
                print(f'LANE={lane}\nLANE_GENERATION={gen}\nSUPABASE_URL={origin(lane)}\nANON_KEY={e["ANON_KEY"]}\n'
                      f'SERVICE_ROLE_KEY={e["SERVICE_ROLE_KEY"]}')
        elif cmd == 'heartbeat':
            with Lock(lane, shared=True), Lock(lane, state=True):   # never waits behind a running SQL session
                st = held(lane, gen)
                st['lease_expires_at'] = int(time.time()) + opt(args, '--ttl', LEASE_DEFAULT, int)
                save(st)
            print(json.dumps({'lease_expires_at': st['lease_expires_at']}))
        elif cmd == 'quarantine':
            with Lock(lane):
                held(lane, gen)
                quarantine(lane)
        elif cmd == 'lift':
            with Lock(lane):
                held(lane, gen)
                lift(lane)
        elif cmd == 'check':
            with Lock(lane, shared=True):
                held(lane, gen)
                fails = outbound_check(lane)
                pfails, pwarns = parity_report(lane)
            for f in fails:
                print(f'CHECK FAILED: {f}')
            report_parity(lane, pfails, pwarns)
            if fails or pfails:
                return 3
            print('outbound check: pass')
            print('parity with the main lane: pass')
        elif cmd == 'parity':
            # Read-only and generation-free: anyone may ask whether a lane still matches the main lane.
            if lane not in LANES:
                raise Refused(f'unknown lane {lane!r}')
            with Lock(lane, shared=True):
                st = load(lane)
                if st.get('state') in ('free', 'draining'):
                    raise Refused(f'{lane} is {st.get("state")}; there is nothing to compare')
                # ts_ip is not required: lane_ts_ip asks Tailscale when the recorded address is missing.
                if not all((ldir(lane) / f).exists() for f in ('.env', 'lane.yml')):
                    raise Refused(f'{lane} is {st.get("state")} and its config is not written yet; nothing to compare')
                pfails, pwarns = parity_report(lane, running='--config-only' not in args,
                                               settings='--config-only' not in args)
            report_parity(lane, pfails, pwarns)
            if pfails:
                return 3
            print(f'{lane}: parity with the main lane: pass')
        elif cmd == 'deploy':
            tb = opt(args, '--tarball')
            if not tb or not re.fullmatch(r'/tmp/cp-functions-[0-9]+-[0-9]+\.tgz', tb):
                raise SystemExit('lanectl: --tarball must be the /tmp/cp-functions-<pid>-<time>.tgz upload')
            with Lock(lane):
                held(lane, gen)
                deploy(lane, tb)
        elif cmd == 'catalog-diff':
            with Lock(lane, shared=True):
                held(lane, gen)
                return 0 if catalog_diff(lane) == 0 else 6
        elif cmd == 'functions-ls':
            with Lock(lane, shared=True):
                held(lane, gen)
                print('\n'.join(functions_ls(lane)))
        elif cmd == 'manifest':
            with Lock(lane, shared=True):
                held(lane, gen)
                m = ldir(lane) / 'deploy-manifest.tsv'
                sys.stdout.write(m.read_text() if m.exists() else '')
        elif cmd == 'psql':
            flags = ['-At'] if '--at' in args else []
            if '--single-transaction' in args:
                flags.append('--single-transaction')
            # The lock is held until psql exits: a release or reallocation cannot run between the
            # generation check and the SQL, so an old claim can never write into the next holder's database.
            with Lock(lane, shared=True):
                held(lane, gen)
                p = subprocess.run(['docker', 'exec', '-i', cname(lane, 'db'), 'psql', '-U', 'postgres', '-d', 'postgres', '-X',
                                    '-q', '-v', 'ON_ERROR_STOP=1', *flags], stdin=sys.stdin)
            return p.returncode
        elif cmd == 'sql':
            node = ('let b="";process.stdin.on("data",d=>b+=d).on("end",async()=>{const r=await fetch("http://localhost:8080/query",'
                    '{method:"POST",headers:{"content-type":"application/json"},body:b});console.log("P1606STATUS:"+r.status);'
                    'console.log(await r.text())})')
            with Lock(lane, shared=True):   # held through execution, as for psql
                held(lane, gen)
                p = subprocess.run(['docker', 'exec', '-i', cname(lane, 'meta'), 'node', '-e', node], stdin=sys.stdin)
            return p.returncode
        elif cmd == 'release':
            with Lock(lane):
                st = load(lane)
                if st.get('generation') != gen or st.get('state') == 'free':
                    raise Refused(f'{lane}: generation {gen} does not hold the lane (state {st.get("state")}, '
                                  f'generation {st.get("generation")})')
                do_release(lane, gen, 'released by its holder')   # any state, an expired lease included
            print(f'{lane} released')
        elif cmd == 'reap':
            for l in reap():
                print(f'{l} reclaimed (lease expired)')
        elif cmd == 'revoke-all':
            for l in ENABLED_LANES:
                with Lock(l):
                    st = load(l)
                    if st['state'] != 'free':
                        do_release(l, st['generation'], 'revoke-all (rollback)')
                        print(f'{l} revoked')
        elif cmd in ('firewall-restore', 'boot'):
            # firewall-restore: rules only (runs before docker at boot). boot: rules, then start each lane's
            # containers only if its rules verify; a lane whose rules fail is quarantined and left down.
            # One lane's failure never stops the others.
            bad = 0
            for l in ENABLED_LANES:
                try:
                    with Lock(l):
                        try:
                            if _boot_lane(l, cmd) == 'skip':
                                continue
                        except Exception as e:
                            bad += 1
                            say(f'{l}: {cmd} failed ({e}); quarantining it')
                            try:   # under the same lock acquisition as the refusal (Codex round 2, finding 3)
                                quarantine(l)
                            except Exception as e2:
                                say(f'{l}: quarantine also failed ({e2})')
                except Exception as e:   # the lane lock itself
                    bad += 1
                    say(f'{l}: {cmd} could not take the lane lock ({e})')
            return 1 if bad else 0
        elif cmd == 'install':
            install(opt(args, '--from', str(Path(__file__).resolve().parent)))
        else:
            say(f'lanectl: unknown command {cmd!r}')
            return 1
        return 0
    except Refused as e:
        say(f'REFUSED: {e}')
        return 4
    except CheckFailed as e:
        say(str(e))
        return 3


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
