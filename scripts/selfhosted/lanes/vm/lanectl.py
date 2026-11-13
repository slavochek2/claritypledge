#!/usr/bin/env python3
"""lanectl — the VM-side authority for P1672 TEST lanes. Runs as root on cp-test-supabase.

Installed to /opt/supabase/lanes/bin/lanectl.py (+ a `lanectl` wrapper) by `lane.py vm-install`.
The Mac never decides lane state: allocation, generation fencing, quarantine and the outbound check
all happen here, under one flock. Python 3 stdlib only.

A lane is a trimmed second Supabase stack (compose project cp-<lane>) beside the main one:
db auth rest realtime storage meta functions kong mail. studio, imgproxy and the pooler are left out.
  * db sits ONLY on the lane's internal network: pg_net and triggers can reach nothing outside the lane.
  * kong and functions also sit on the lane's edge network (port publish, egress). A host firewall
    stops the edge subnet reaching any host address except the lane's own origin, the main lane's
    public IP, other docker networks and other tailnet machines.
  * Clients reach the lane only over Tailscale: the main Caddy serves a site bound to the VM's
    Tailscale IP, with a cert from `tailscale cert`, configured by a file this tool writes.

Lifecycle: free -> provisioning -> ready -> draining -> free, plus failed. Every allocate bumps the
generation; every data-plane command names the generation it was issued for and a stale one is
refused (exit 4). Every claim re-provisions from scratch: old volumes go, the database is copied
fresh from the main lane with Postgres's low-level backup API (owners, ACLs, default privileges, RLS
and security-definer functions come across byte for byte), keys are generated fresh.

Exit codes: 0 ok, 1 error, 3 outbound check failed (lane stays quarantined), 4 refused (stale
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
               timeout=timeout, check=check)


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
{svc('auth', '''    environment:
      GOTRUE_EXTERNAL_GOOGLE_ENABLED: "false"
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
        'SUPABASE_PUBLIC_URL': o, 'API_EXTERNAL_URL': o, 'SITE_URL': o, 'ADDITIONAL_REDIRECT_URLS': f'"{redirects}"',
        'KONG_HTTP_PORT': str(c['kong_port']), 'KONG_HTTPS_PORT': str(c['kong_port'] + 100),
        'SMTP_HOST': 'mail', 'SMTP_PORT': '2500', 'PROXY_DOMAIN': host, 'GOOGLE_SECRET': '', 'GOOGLE_CLIENT_ID': '',
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
    if fails:
        for f in fails:
            say(f'CHECK FAILED: {f}')
        event(lane, f'gen {st["generation"]}: lift refused ({len(fails)} failure(s))')
        raise CheckFailed(f'{lane} is quarantined: {len(fails)} outbound check failure(s)')
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
            for f in fails:
                print(f'CHECK FAILED: {f}')
            if fails:
                return 3
            print('outbound check: pass')
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
                        st = load(l)
                        if st['state'] in ('free', 'draining'):
                            continue
                        fw_apply(l)
                        if cmd == 'boot' and not fw_ok(l):
                            raise RuntimeError('firewall rules do not verify after restore')   # -> quarantined below
                        if cmd == 'boot':
                            compose(l, 'up', '-d', *[s for s in SERVICES_UP], timeout=600)
                            if not st.get('quarantined'):
                                compose(l, 'up', '-d', 'functions', timeout=300)
                            else:   # quarantined: whatever started it, functions stay down and cron stays off
                                compose(l, 'stop', 'functions', check=False)
                                wait_healthy(l, ['db'])
                                cron_off(l, record=False)
                except Exception as e:
                    bad += 1
                    say(f'{l}: firewall restore failed ({e}); quarantining it')
                    try:
                        with Lock(l):
                            quarantine(l)
                    except Exception as e2:
                        say(f'{l}: quarantine also failed ({e2})')
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
