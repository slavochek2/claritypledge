#!/usr/bin/env python3
"""scripts/test-p1724-lane-parity.py: hermetic canary for the lane parity check (P1724).

No VM, no docker, no network: lanectl is imported by path with its state under a temp dir
(CP_LANES_ROOT), and every docker- or system-facing function is replaced by a stub. Covers what the
live lane2 proof cannot reach (scripts/selfhosted/lanes/vm/p1724_live_proof.py):
  * the rules: accept good input, refuse each defect class, never print a secret;
  * the tripwire on paths the main lane does not set today (a new child under a classified service);
  * every entry point: provision stops before the firewall and the database copy and ends failed, lift
    quarantines, a deploy to a ready lane is refused before quarantining, boot quarantines, check and
    parity exit 3, and a missing relay list leaves provisioning failed rather than stuck.
Each refusal has its control: the same input made good passes, so a refusal is not a fixture artifact.
Exit 0 when every case passes.
"""
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import time
from pathlib import Path

TMP = Path(tempfile.mkdtemp(prefix='p1724-canary-'))
os.environ['CP_LANES_ROOT'] = str(TMP / 'lanes')
SRC = Path(__file__).resolve().parent / 'selfhosted/lanes/vm/lanectl.py'
spec = importlib.util.spec_from_file_location('lanectl_under_test', SRC)
L = importlib.util.module_from_spec(spec)
spec.loader.exec_module(L)


def _no_tailscale():   # hermetic everywhere: an unstubbed Tailscale call fails here, not only off this machine
    raise RuntimeError('canary: Tailscale reached without a stub')


L.ts_identity = _no_tailscale

PASS = FAIL = 0


def check(cond, name):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'  PASS  {name}')
    else:
        FAIL += 1
        print(f'  FAIL  {name}')


@contextlib.contextmanager
def patched(**kw):
    old = {k: getattr(L, k) for k in kw}
    for k, v in kw.items():
        setattr(L, k, v)
    try:
        yield
    finally:
        for k, v in old.items():
            setattr(L, k, v)


def captured(fn, *a, **kw):
    out, err = io.StringIO(), io.StringIO()
    exc = None
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            res = fn(*a, **kw)
        except BaseException as e:   # noqa: BLE001  (the test inspects whatever escaped)
            res, exc = None, e
    return res, exc, out.getvalue() + err.getvalue()


# ---- fixture values (synthetic; none is a real secret)
MO = L.MAIN_ORIGIN
LO = 'https://lanehost.example.ts.net:8443'
TS_IP = '100.64.0.9'
MAIN_JWT, LANE_JWT = 'main-jwt-secret-0123456789abcdefXYZ', 'lane-jwt-secret-9876543210fedcbaQRS'  # gitleaks:allow
MAIN_PW, LANE_PW = 'mainPw0123456789abcdef', 'lanePw9876543210fedcba'
GOOGLE_SECRET = 'GOC' + 'SPX-sharedGoogleSecret0123456789'  # vendor-shaped: built at run time, never a literal (P1726)
OTHER_SECRET = 'smtpPass0123456789abcdefghij'
SECRETS = [MAIN_JWT, LANE_JWT, MAIN_PW, LANE_PW, GOOGLE_SECRET, OTHER_SECRET]


def main_auth():
    return {
        'API_EXTERNAL_URL': f'{MO}/auth/v1', 'GOTRUE_JWT_ISSUER': f'{MO}/auth/v1', 'GOTRUE_SITE_URL': MO,
        'GOTRUE_EXTERNAL_GOOGLE_ENABLED': 'true', 'GOTRUE_EXTERNAL_GOOGLE_SECRET': GOOGLE_SECRET,
        'GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID': '1234-abc.apps.' + 'googleusercontent.com',
        'GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI': f'{MO}/auth/v1/callback',
        'GOTRUE_URI_ALLOW_LIST': f'http://localhost:5001/**,,{MO}/**',
        'GOTRUE_JWT_SECRET': MAIN_JWT,
        'GOTRUE_DB_DATABASE_URL': f'postgres://supabase_auth_admin:{MAIN_PW}@db.example.com:5432/postgres',  # gitleaks:allow (synthetic fixture)
        'GOTRUE_SMTP_HOST': 'supabase-mail', 'GOTRUE_SMTP_PASS': '',
        'GOTRUE_MAILER_TEMPLATES_MAGIC_LINK': f'{MO}/_cp-email-templates/magic_link.html',
    }


def lane_auth():
    return {
        'API_EXTERNAL_URL': f'{LO}/auth/v1', 'GOTRUE_JWT_ISSUER': f'{LO}/auth/v1', 'GOTRUE_SITE_URL': LO,
        'GOTRUE_EXTERNAL_GOOGLE_ENABLED': 'true', 'GOTRUE_EXTERNAL_GOOGLE_SECRET': GOOGLE_SECRET,
        'GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID': '1234-abc.apps.' + 'googleusercontent.com',
        'GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI': f'{LO}/auth/v1/callback',
        'GOTRUE_URI_ALLOW_LIST': f'{LO}/**,http://localhost:5001/**',
        'GOTRUE_JWT_SECRET': LANE_JWT,
        'GOTRUE_DB_DATABASE_URL': f'postgres://supabase_auth_admin:{LANE_PW}@db.example.com:5432/postgres',  # gitleaks:allow (synthetic fixture)
        'GOTRUE_SMTP_HOST': 'mail', 'GOTRUE_SMTP_PASS': '',
        'GOTRUE_MAILER_TEMPLATES_MAGIC_LINK': f'{LO}/_cp-email-templates/magic_link.html',
    }


def ctx(grand=None):
    return {'origin': LO, 'ts_ip': TS_IP, 'grandfathered': grand or {},
            'lane_env': {'JWT_SECRET': LANE_JWT, 'POSTGRES_PASSWORD': LANE_PW},
            'main_env': {'JWT_SECRET': MAIN_JWT, 'POSTGRES_PASSWORD': MAIN_PW}}


NETS_MAIN = {'networks': {'default': {}}}
NETS_LANE = {'networks': {'default': {'internal': True}, 'edge': {}}}


def svc(env, nets=('default', 'edge'), hosts=('lanehost.example.ts.net:100.64.0.9',)):
    return {'image': 'supabase/gotrue:v2', 'environment': env, 'networks': {n: {} for n in nets},
            'extra_hosts': list(hosts)}


def auth_fails(lane_env, main_env=None, c=None, **kw):
    ms = {'image': 'supabase/gotrue:v2', 'environment': main_env or main_auth(), 'networks': {'default': {}}}
    return L.compare_service('auth', ms, svc(lane_env, **kw), NETS_MAIN, NETS_LANE, c or ctx())


def no_secret(lines):
    text = '\n'.join(lines)
    return not any(s in text for s in SECRETS)


print('rules')
f = auth_fails(lane_auth())
check(f == [], f'control: a correct lane auth passes ({f})')

for key, mutate, why in [
    ('GOTRUE_EXTERNAL_GOOGLE_ENABLED', lambda e: e.pop('GOTRUE_EXTERNAL_GOOGLE_ENABLED'), 'missing on the lane'),
    ('GOTRUE_EXTERNAL_GOOGLE_ENABLED', lambda e: e.update(GOTRUE_EXTERNAL_GOOGLE_ENABLED=''), 'blank is not an override'),
    ('GOTRUE_MAILER_TEMPLATES_MAGIC_LINK', lambda e: e.update(GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=f'{MO}/_cp-email-templates/magic_link.html'),
     "a template URL left on main's origin"),
    ('GOTRUE_EXTRA_NEW', lambda e: e.update(GOTRUE_EXTRA_NEW='1'), 'a key present on the lane only'),
    ('GOTRUE_SMTP_HOST', lambda e: e.update(GOTRUE_SMTP_HOST='supabase-mail'), "main's mail container instead of the lane's"),
    ('GOTRUE_URI_ALLOW_LIST', lambda e: e.update(GOTRUE_URI_ALLOW_LIST=f'{LO}/**'), 'an allow-list entry dropped'),
    ('GOTRUE_SITE_URL', lambda e: e.update(GOTRUE_SITE_URL=LO + '/x'), 'a rebased URL that is not main rebased'),
]:
    e = lane_auth()
    mutate(e)
    f = auth_fails(e)
    check(any(key in x for x in f), f'refused: {why} ({len(f)} line(s))')

e = lane_auth()
e['GOTRUE_JWT_SECRET'] = MAIN_JWT
f = auth_fails(e)
check(any('GOTRUE_JWT_SECRET' in x for x in f) and no_secret(f), 'refused: the lane signs with main\'s JWT secret (not printed)')
c = ctx()
c['lane_env']['JWT_SECRET'] = MAIN_JWT
f = auth_fails(lane_auth() | {'GOTRUE_JWT_SECRET': MAIN_JWT}, c=c)
check(any('empty or equal' in x for x in f), "refused: the lane .env JWT secret equals main's")
c = ctx()
c['lane_env']['POSTGRES_PASSWORD'] = ''
f = auth_fails(lane_auth(), c=c)
check(any('GOTRUE_DB_DATABASE_URL' in x for x in f), 'refused: an empty lane database password')
e = lane_auth()
e['GOTRUE_DB_DATABASE_URL'] = f'postgres://supabase_auth_admin:{LANE_PW}@otherdb.example.com:5432/postgres'  # gitleaks:allow (synthetic fixture)
f = auth_fails(e)
check(any('GOTRUE_DB_DATABASE_URL' in x for x in f) and no_secret(f), 'refused: a database URL that differs beyond the password')

m_env, l_env = main_auth(), lane_auth()
m_env['GOTRUE_SMTP_PASS'] = l_env['GOTRUE_SMTP_PASS'] = OTHER_SECRET
f = auth_fails(l_env, m_env)
check(any('GOTRUE_SMTP_PASS' in x and 'same secret-looking value' in x for x in f) and no_secret(f),
      'refused: a secret shared with main that is not on the shared list (not printed)')
m_env['GOTRUE_SMTP_PASS'] = l_env['GOTRUE_SMTP_PASS'] = ''
check(auth_fails(l_env, m_env) == [], 'control: the Google client, which is on the shared list, passes')
m_env['GOTRUE_SOME_ID'] = l_env['GOTRUE_SOME_ID'] = 'AbCdEf0123456789GhIjKl0123'
f = auth_fails(l_env, m_env)
check(any('GOTRUE_SOME_ID' in x for x in f), 'refused: a token-shaped value under an innocent name, shared with main')

e = lane_auth()
e['API_EXTERNAL_URL'] = e['GOTRUE_JWT_ISSUER'] = LO
f = auth_fails(e)
check(len([x for x in f if 'API_EXTERNAL_URL' in x or 'GOTRUE_JWT_ISSUER' in x]) == 2, 'refused: the bare origin as API URL on a new lane')
g = {('auth', 'API_EXTERNAL_URL'): 'bare-origin', ('auth', 'GOTRUE_JWT_ISSUER'): 'bare-origin'}
check(auth_fails(e, c=ctx(g)) == [], 'control: the bare origin is accepted for the grandfathered generation')
check(L.PARITY_GRANDFATHERED == {('lane1', 6): g}, 'the bare-origin exception is scoped to lane1 generation 6 only')

f = auth_fails(lane_auth(), nets=('default',))
check(any('only on internal networks' in x for x in f), 'refused: auth only on the internal lane network')
f = auth_fails(lane_auth(), hosts=())
check(any('no host entry' in x for x in f), 'refused: no host entry for the lane host')
check(auth_fails(lane_auth(), hosts=('lanehost.example.ts.net=100.64.0.9',)) == [], 'control: the host=ip form of a host entry passes')
f = auth_fails(lane_auth(), hosts=('lanehost.example.ts.net:100.64.0.99',))
check(any('no host entry' in x for x in f), 'refused: a host entry pointing at the wrong address')

ms = {'image': 'axllent/mailpit:v1', 'environment': {'MP_MAX_MESSAGES': '5000', 'MP_SMTP_RELAY_MATCHING': 'a@x'}, 'networks': {'default': {}}}
ls = {'image': 'axllent/mailpit:v1', 'environment': {'MP_MAX_MESSAGES': '2000', 'MP_SMTP_RELAY_MATCHING': 'a@x'}, 'networks': {'default': {}, 'edge': {}}}
check(L.compare_service('mail', ms, ls, NETS_MAIN, NETS_LANE, ctx()) == [], 'control: mail with the 2000 cap passes')
ls['environment']['MP_MAX_MESSAGES'] = '1999'
check(L.compare_service('mail', ms, ls, NETS_MAIN, NETS_LANE, ctx()) != [], 'refused: any mail cap other than exactly 2000')
ls['environment']['MP_MAX_MESSAGES'] = '2000'
ls['image'] = 'axllent/mailpit:v2'
check(any('image' in x for x in L.compare_service('mail', ms, ls, NETS_MAIN, NETS_LANE, ctx())), 'refused: a different image')

m_env, l_env = main_auth(), lane_auth()
m_env['GOTRUE_SMS_PIN_SECRET'], l_env['GOTRUE_SMS_PIN_SECRET'] = '424242', '515151'
f = auth_fails(l_env, m_env)
check(any('GOTRUE_SMS_PIN_SECRET' in x for x in f) and not any('424242' in x or '515151' in x for x in f),
      'a secret-named value is never printed, even when it looks public (a numeric PIN)')
check(L.shown('postgres://u:pw@db:5432/x') == '<25 chars>', 'a URL with credentials is never shown')
check(L.shown(GOOGLE_SECRET).startswith('<'), 'a secret value is shown by length only')
check(L.shown('true') == "'true'" and L.shown(f'{LO}/auth/v1') == repr(f'{LO}/auth/v1'), 'public shapes are shown')
HOOK_TOKEN = 'abcdEFGH12345678xyzQRS'  # gitleaks:allow (synthetic fixture)
hook = L.shown(f'https://hooks.example.com/services/T0AAAA/B0BBBB/{HOOK_TOKEN}')
check(HOOK_TOKEN not in hook and 'hooks.example.com' in hook, f'a capability URL is shown without its token-bearing path ({hook})')
check(L.shown(f'{LO}/_cp-email-templates/magic_link.html') == repr(f'{LO}/_cp-email-templates/magic_link.html'),
      'control: a template URL with a plain path is shown in full')

m_env, l_env = main_auth(), lane_auth()
m_env.pop('GOTRUE_SMTP_HOST')
f = auth_fails(l_env, m_env)
check(any('GOTRUE_SMTP_HOST missing on main' in x for x in f), 'refused: a key with a value: rule present on the lane only')

check(L.host_entries({'lanehost.example.ts.net': '100.64.0.9'}) == {'lanehost.example.ts.net=100.64.0.9'} and
      L.host_entries({'h': ['1.2.3.4', '5.6.7.8']}) == {'h=1.2.3.4', 'h=5.6.7.8'} and
      L.host_entries(['h:1.2.3.4', 'g=5.6.7.8']) == {'h=1.2.3.4', 'g=5.6.7.8'}, 'host entries: map, map of lists and list forms')
ls = svc(lane_auth())
ls['extra_hosts'] = {'lanehost.example.ts.net': '100.64.0.9'}
ms = {'image': 'supabase/gotrue:v2', 'environment': main_auth(), 'networks': {'default': {}}}
check(L.compare_service('auth', ms, ls, NETS_MAIN, NETS_LANE, ctx()) == [], 'control: the map form of a host entry passes')
ls['extra_hosts'] = {'lanehost.example.ts.net': '100.64.0.99'}
check(any('no host entry' in x for x in L.compare_service('auth', ms, ls, NETS_MAIN, NETS_LANE, ctx())),
      'refused: the map form pointing at the wrong address')

print('container check')
CT_RENDER = {'services': {'auth': svc(lane_auth()) | {'container_name': 'cp-lane1-auth'}},
             'networks': {'default': {'name': 'cp-lane1_default', 'internal': True}, 'edge': {'name': 'cp-lane1_edge'}}}


def fake_docker(nets=('cp-lane1_default', 'cp-lane1_edge'), hosts=('lanehost.example.ts.net:100.64.0.9',), env=None,
                inspect_rc=0, inspect_err='', image_rc=0):
    cont = [{'Image': 'sha256:abc', 'State': {'Running': True}, 'NetworkSettings': {'Networks': {n: {} for n in nets}},
             'HostConfig': {'ExtraHosts': list(hosts)},
             'Config': {'Image': 'supabase/gotrue:v2', 'Env': [f'{k}={v}' for k, v in (env or lane_auth()).items()] + ['PATH=/bin']}}]
    seen = []

    def run(cmd, **kw):
        seen.append(cmd)
        if cmd[:2] == ['docker', 'inspect']:
            return type('P', (), {'returncode': inspect_rc, 'stdout': json.dumps(cont), 'stderr': inspect_err})()
        return type('P', (), {'returncode': image_rc, 'stdout': json.dumps(['PATH=/bin']), 'stderr': ''})()
    run.seen = seen
    return run


A = CT_RENDER['services']['auth']
with patched(run=fake_docker()):
    check(L.container_drift(A, True, render=CT_RENDER) == [], 'control: a container matching its config passes')
r = fake_docker(nets=('cp-lane1_default',))
with patched(run=r):
    f = L.container_drift(A, True, render=CT_RENDER)
check(any('attached to networks' in x for x in f), 'refused: a container still off the edge network (lane.yml fixed, not recreated)')
check(any(c[:3] == ['docker', 'image', 'inspect'] and c[3] == 'sha256:abc' for c in r.seen), 'baked env is read from the image the container runs (by id)')
with patched(run=fake_docker(hosts=())):
    f = L.container_drift(A, True, render=CT_RENDER)
check(any('host entries differ' in x for x in f), 'refused: a container without the host entry its config has')
with patched(run=fake_docker(inspect_rc=1, inspect_err='Error response from daemon: No such container: cp-lane1-auth')):
    f = L.container_drift(A, True, render=CT_RENDER)
check(f == ['cp-lane1-auth: container does not exist'], 'a missing container is named as missing')
with patched(run=fake_docker(inspect_rc=1, inspect_err='Cannot connect to the Docker daemon')):
    f = L.container_drift(A, True, render=CT_RENDER)
check(any('could not be checked' in x for x in f), 'a docker error is not reported as a missing container')
with patched(run=fake_docker(image_rc=1)):
    f = L.container_drift(A, True, render=CT_RENDER)
check(any('could not be inspected' in x for x in f) and not any('does not set' in x for x in f),
      'an image that cannot be inspected is said so, not read as stray env')
check(any('no container_name' in x for x in L.container_drift({'image': 'x'}, True)), 'a service without a container name is reported, not a crash')
NONAME = {'name': 'cp-lane1', 'services': CT_RENDER['services'], 'networks': {'default': {'internal': True}, 'edge': {}}}
with patched(run=fake_docker()):
    check(L.container_drift(A, True, render=NONAME) == [], 'a render network without a name maps to <project>_<network>')

print('lane origin')
with patched(lane_env=lambda lane: {'SITE_URL': LO}, origin=lambda lane: (_ for _ in ()).throw(RuntimeError('tailscale'))):
    check(L.lane_origin('lane1') == LO, 'the origin comes from the lane .env, no Tailscale call')
with patched(lane_env=lambda lane: {'SITE_URL': 'https://x:1'}, origin=lambda lane: LO):
    check(L.lane_origin('lane1') == LO, 'a malformed recorded origin falls back to Tailscale')

print('tripwire')
check(L.classify('auth.environment.ANY') == 'compared by parity', 'auth env is compared by parity')
check(L.classify('auth.extra_hosts') is None and L.classify('auth.networks') is None and L.classify('mail.ports[9999]') is None and L.classify('mail.ports[8025]'),
      'main additions to fields parity skips (extra_hosts, networks, ports) are unclassified unless named one by one')
base = {'services': {'caddy': {'image': 'caddy:2'}, 'functions': {'environment': {}}}}
full = {'services': {'caddy': {'image': 'caddy:2', 'environment': {'NEW': 'x'}}, 'functions': {'environment': {'LIVEKIT_URL': 'u'}},
                     'brandnew': {'image': 'x'}}, 'x-top': {'a': 1}}
paths = L.override_contributions(base, full)
unclassified = [p for p in paths if not L.classify(p)]
check('caddy.environment.NEW' in unclassified, 'a new child under a classified service (caddy) is unclassified')
check('brandnew.image' in unclassified, 'a new service is flattened and unclassified')
check('x-top.a' in unclassified, 'a new top-level key is unclassified')
check('functions.environment.LIVEKIT_URL' not in unclassified, 'control: a deny-by-default function env name is classified')
check(L.classify('functions.environment.SOMETHING_NEW') is None, 'a new function env name is unclassified')
check(L.classify('kong.ports[8443]') and L.classify('kong.ports[9999]') is None, 'ports are classified per target, not per field')
paths = L.override_contributions({'services': {}}, {'services': {'mail': {'networks': {'default': None, 'relaynet': None}}}})
check('mail.networks[relaynet]' in paths and not L.classify('mail.networks[relaynet]') and L.classify('mail.networks[default]'),
      'networks are keyed per name: a network main adds to mail later is unclassified')

print('null-valued entries (Codex 3)')
ms = {'image': 'i', 'command': None, 'environment': {'GOTRUE_X': None}}
check(any('command' in x for x in L.compare_service('mail', ms, {'image': 'i', 'environment': {'GOTRUE_X': None}}, {}, {}, ctx())),
      'a field main sets to null and the lane omits is a difference')
check(any('GOTRUE_X' in x and 'main' in x for x in L.compare_service('mail', ms, {'image': 'i', 'command': None}, {}, {}, ctx())),
      'an env name main sets with no value and the lane omits is a difference')
check(L.compare_service('mail', ms, dict(ms), {}, {}, ctx()) == [], 'control: the same null entries on both sides pass')
paths = L.override_contributions({'services': {}, 'volumes': {}}, {'services': {}, 'volumes': {'newvol': None}})
check('volumes.newvol' in paths, 'a top-level map entry main adds as null is a contribution')

print('render and settings')
with patched(run=lambda *a, **k: type('P', (), {'returncode': 1, 'stdout': '', 'stderr': f'bad value {MAIN_PW}'})()):
    _, exc, out = captured(L.render_main, ['docker-compose.yml'])
check(isinstance(exc, L.CheckFailed) and MAIN_PW not in str(exc) and 'exit 1' in str(exc), 'a failed render reports the exit code, never docker\'s text')

GOOD_R = {'services': {'auth': svc(lane_auth()) | {'container_name': 'cp-lane1-auth'},
                       'mail': {'image': 'm', 'environment': {}, 'networks': {'default': {}, 'edge': {}}}},
          'networks': NETS_LANE['networks']}
MAIN_R = {'services': {'auth': {'image': 'supabase/gotrue:v2', 'environment': main_auth(), 'networks': {'default': {}},
                                'container_name': 'supabase-auth'},
                       'mail': {'image': 'm', 'environment': {}, 'networks': {'default': {}}}},
          'networks': NETS_MAIN['networks']}


def stub_report(lane_s, main_s, drift=()):
    return dict(render_main=lambda files=None: MAIN_R if files is None else {'services': {}},
                render_lane=lambda lane: GOOD_R, origin=lambda lane: LO, lane_ts_ip=lambda lane: TS_IP,
                lane_env=lambda lane: {'JWT_SECRET': LANE_JWT, 'POSTGRES_PASSWORD': LANE_PW, 'ANON_KEY': 'a'},
                main_env=lambda: {'JWT_SECRET': MAIN_JWT, 'POSTGRES_PASSWORD': MAIN_PW, 'ANON_KEY': 'b'},
                load=lambda lane: {'lane': lane, 'state': 'ready', 'generation': 2},
                container_drift=lambda s, require_running, render=None: list(drift),
                auth_settings=lambda port, anon: lane_s if anon == 'a' else main_s,
                override_contributions=lambda b, f: [])


S = {'external': {'google': True, 'email': True}, 'mailer_autoconfirm': False}
with patched(**stub_report(S, S)):
    f, w = L.parity_report('lane1')
check(f == [] and w == [], f'control: identical settings and clean containers pass ({f})')
import subprocess  # noqa: E402
for boom, name in ((subprocess.TimeoutExpired(['docker', 'compose', 'config'], 120), 'a render timeout'),
                   (RuntimeError('canary: Tailscale reached'), 'an origin lookup failure')):
    def raiser(*a, _e=boom, **k):
        raise _e
    with patched(**stub_report(S, S) | {'render_lane': raiser}):
        _, exc, _o = captured(L.parity_report, 'lane1')
        res = L.parity_report('lane1') if exc is None else None
    check(exc is None and res and res[0] and 'could not run' in res[0][0],
          f'{name} is a parity failure, never an exception (Codex 5): {res}')
seen_env = {}
with patched(run=lambda cmd, **k: seen_env.update(k) or type('P', (), {'returncode': 0, 'stdout': '', 'stderr': ''})()):
    L.compose('lane1', 'up', '-d', 'auth')
check(seen_env.get('env') == L.RENDER_ENV, 'compose runs with the environment parity renders with (Codex 4)')
PROOF = Path(__file__).resolve().parent / 'selfhosted/lanes/vm/p1724_live_proof.py'
pspec = importlib.util.spec_from_file_location('p1724_live_proof', PROOF)
P = importlib.util.module_from_spec(pspec)
pspec.loader.exec_module(P)
P.sh = lambda *cmd: type('P', (), {'returncode': 1, 'stdout': '', 'stderr': 'Cannot connect to the Docker daemon'})()
_, exc, _o = captured(P.project_residue, 'lane2')
check(isinstance(exc, RuntimeError), 'live proof: an unreadable docker inventory raises, never reads as empty (Codex 2)')
P.sh = lambda *cmd: type('P', (), {'returncode': 1 if cmd[1] == 'inspect' else 0, 'stdout': '',
                                    'stderr': 'Error: No such object: x'})()
check(P.project_residue('lane2') == [], 'control: absent containers on a reachable daemon read as empty')
print('origin source')
seen_o = {}
with patched(**stub_report(S0 := {'external': {}}, S0) | {'origin': lambda lane: 'https://live.example:8443',
             'lane_origin': lambda lane: 'https://recorded.example:8443',
             'compare_service': lambda s, ms, ls, mr, lr, ctx: seen_o.setdefault('o', []).append(ctx['origin']) or []}):
    L.parity_report('lane1', running=False, settings=False)
    check(set(seen_o.pop('o')) == {'https://live.example:8443'}, 'outside boot the origin is the live Tailscale one')
    L.parity_report('lane1', running=False, settings=False, boot=True)
    check(set(seen_o.pop('o')) == {'https://recorded.example:8443'}, 'at boot the origin is the one recorded in the lane .env')
check(L.why_failed(FileNotFoundError(2, 'x', '/opt/lane1/.env')) == 'missing file /opt/lane1/.env', 'a refusal names a missing file')
check(L.why_failed(RuntimeError('command failed (1): docker compose -p cp-lane1 ... stderr tail TOKEN=abc')) ==
      'RuntimeError: command failed (1): docker compose -p cp-lane1', "a refusal never carries docker's stderr tail")
check(L.why_failed(ValueError('secret')) == 'ValueError', 'any other exception is named by type only')

with patched(**stub_report({'external': {'google': False, 'email': True}, 'mailer_autoconfirm': False}, S)):
    f, w = L.parity_report('lane1')
check(any('sign-in providers google' in x for x in f), 'refused: the lane auth server answers with Google off')
with patched(**stub_report(None, S)):
    f, w = L.parity_report('lane1')
check(any('did not answer' in x for x in f), 'refused: the lane auth server does not answer')
with patched(**stub_report(S, None)):
    f, w = L.parity_report('lane1')
check(f == [] and any('main lane did not answer' in x for x in w), 'main not answering is a warning, not a lane failure')
with patched(**stub_report(S, S) | {'override_contributions': lambda b, f: ['caddy.environment.NEW', 'caddy.image']}):
    f, w = L.parity_report('lane1')
check(any('tripwire' in x and 'caddy.environment.NEW' in x for x in f) and not any('caddy.image' in x for x in f),
      'parity_report fails on an unclassified main-lane path, and only on that one')
with patched(**stub_report(S, S, drift=['cp-lane1-auth: container is not running'])):
    f, w = L.parity_report('lane1')
check(any('not running' in x for x in f) and any(x.startswith('main lane:') for x in w), 'container drift: a lane failure, a main-lane warning')

print('entry points')
STATE = L.STATE
STATE.mkdir(parents=True, exist_ok=True)
calls = []


def rec(name, ret=None):
    def fn(*a, **k):
        calls.append((name,) + tuple(str(x) for x in a))
        return ret
    return fn


def set_state(**kw):
    st = {'lane': 'lane1', 'state': 'ready', 'generation': 1, 'quarantined': False,
          'lease_expires_at': int(time.time()) + 3600} | kw
    L.save(st)


DIFF = (['auth: GOTRUE_EXTERNAL_GOOGLE_ENABLED missing on the lane'], [])
# Everything provision does after the gate, stubbed, so a regression that lets it past fails fast
# (the test then sees fw_apply in the calls) instead of polling a stub for minutes.
LATER_STEPS = dict(held=lambda lane, gen, states=(): L.load(lane), wait_healthy=rec('wait_healthy'),
                   configure_lane_db=rec('configure_lane_db'), event=rec('event'))
os_geteuid = os.geteuid
os.geteuid = lambda: 0
try:
    # provision: stops after writing config, before the firewall and the database copy
    set_state(state='provisioning', quarantined=True)
    calls.clear()
    lanes_dir = TMP / 'lanes'
    with patched(ts_identity=lambda: ('lanehost.example.ts.net', TS_IP), teardown=rec('teardown'),
                 MAIN_DIR=TMP / 'main', run=rec('run', type('P', (), {'stdout': str(TMP), 'returncode': 0})()),
                 write_lane_env=rec('write_lane_env'), write_functions_env=rec('write_functions_env'),
                 lane_yml=lambda *a: 'x', compose=rec('compose'), parity_report=lambda *a, **k: DIFF,
                 fw_apply=rec('fw_apply'), copy_main_db=rec('copy_main_db'), **LATER_STEPS):
        (TMP / 'main/volumes/api').mkdir(parents=True, exist_ok=True)
        (TMP / 'main/volumes/db').mkdir(parents=True, exist_ok=True)
        for fn in ('kong.yml', 'kong-entrypoint.sh'):
            (TMP / 'main/volumes/api' / fn).write_text('x')
        _, exc, out = captured(L.main, ['provision', '--lane', 'lane1', '--gen', '1'])
    names = [c[0] for c in calls]
    check(isinstance(exc, RuntimeError) and 'PARITY FAILED' in out, 'provision: a difference stops it, reported as PARITY FAILED')
    check('fw_apply' not in names and 'copy_main_db' not in names, f'provision: never reaches the firewall or the database copy ({names})')
    check(L.load('lane1')['state'] == 'failed', 'provision: the lane ends failed')

    # provision: a main lane with no relay list leaves it failed, not stuck in provisioning
    set_state(state='provisioning', quarantined=True)
    (TMP / 'main/docker-compose.override.yml').write_text('services:\n  mail:\n    environment:\n      MP_MAX_MESSAGES: 5\n')
    with patched(ts_identity=lambda: ('lanehost.example.ts.net', TS_IP), teardown=rec('teardown'),
                 MAIN_DIR=TMP / 'main', run=rec('run', type('P', (), {'stdout': str(TMP), 'returncode': 0})()),
                 write_lane_env=rec('write_lane_env'), write_functions_env=rec('write_functions_env'),
                 compose=rec('compose'), fw_apply=rec('fw_apply'), copy_main_db=rec('copy_main_db'), **LATER_STEPS):
        _, exc, out = captured(L.main, ['provision', '--lane', 'lane1', '--gen', '1'])
    check(isinstance(exc, RuntimeError) and 'MP_SMTP_RELAY_MATCHING' in str(exc), 'provision: no relay list raises RuntimeError')
    check(L.load('lane1')['state'] == 'failed', 'provision: no relay list leaves the lane failed')

    # lift: a difference quarantines and functions never start
    set_state(quarantined=True)
    calls.clear()
    with patched(outbound_check=lambda lane: [], parity_report=lambda *a, **k: DIFF, quarantine=rec('quarantine'),
                 compose=rec('compose'), caddy_route_add=rec('caddy_route_add'), wait_healthy=rec('wait_healthy'),
                 probe_functions=rec('probe'), lane_psql=lambda *a, **k: type('P', (), {'stdout': ''})()):
        _, exc, out = captured(L.main, ['lift', '--lane', 'lane1', '--gen', '1'])
    names = [c[0] for c in calls]
    check(exc is None and 'quarantine' in names and 'compose' not in names and 'caddy_route_add' not in names,
          f'lift: a difference quarantines, no functions, no route ({names})')
    with patched(outbound_check=lambda lane: [], parity_report=lambda *a, **k: ([], []), quarantine=rec('quarantine'),
                 compose=rec('compose'), wait_healthy=rec('wait_healthy'), probe_functions=rec('probe'),
                 lane_psql=lambda *a, **k: type('P', (), {'stdout': ''})(), caddy_route_add=rec('caddy_route_add'),
                 origin=lambda lane: LO):   # hermetic: the success line names the origin (Codex 6)
        (L.ldir('lane1')).mkdir(parents=True, exist_ok=True)
        calls.clear()
        _, exc, out = captured(L.main, ['lift', '--lane', 'lane1', '--gen', '1'])
    check(exc is None and L.load('lane1')['state'] == 'ready' and 'caddy_route_add' in [c[0] for c in calls],
          'control: lift with no difference makes the lane ready')

    # deploy to a ready lane: refused before quarantine, the lane keeps serving
    set_state(quarantined=False)
    tb = Path('/tmp/cp-functions-1-2.tgz')
    calls.clear()
    with patched(parity_report=lambda *a, **k: DIFF, quarantine=rec('quarantine'), compose=rec('compose'),
                 run=rec('run'), lift=rec('lift')):
        rc, exc, out = captured(L.main, ['deploy', '--lane', 'lane1', '--gen', '1', '--tarball', str(tb)])
    check(rc == 3 and 'quarantine' not in [c[0] for c in calls] and not L.load('lane1')['quarantined'],
          f'deploy: refused with exit 3 before quarantine; the lane still serves (rc {rc})')

    # boot: a serving lane that differs is quarantined and its functions are not started
    set_state(quarantined=False)
    calls.clear()
    # (running comparison only: the pre-start render comparison passes, the containers then differ)
    def boot_report(*a, **k):
        calls.append(('parity_report', k.get('boot'), k.get('running', True)))
        return DIFF if k.get('running', True) else ([], [])
    with patched(fw_apply=rec('fw_apply'), fw_ok=lambda lane: True, compose=rec('compose'), wait_healthy=rec('wait_healthy'),
                 parity_report=boot_report, quarantine=rec('quarantine'), caddy_route_remove=rec('caddy_route_remove')):
        rc, exc, out = captured(L.main, ['boot'])
    started_fn = [c for c in calls if c[0] == 'compose' and 'functions' in c and 'up' in c]
    check(rc == 1 and 'quarantine' in [c[0] for c in calls] and not started_fn, f'boot: a difference quarantines, functions not started (rc {rc})')
    names = [c[0] for c in calls]
    running_at = [i for i, c in enumerate(calls) if c[0] == 'parity_report' and c[2]]
    check('wait_healthy' in names and running_at and names.index('wait_healthy') < running_at[0],
          'boot: waits for auth and mail before the running comparison')
    check(calls[names.index('parity_report')][2] is False and names.index('parity_report') < names.index('compose'),
          'boot: the rendered config is compared before any lane container starts (Codex 1)')
    check('caddy_route_remove' not in names, 'control: a lane whose config matches keeps its route through the start')
    # pre-start: the rendered config already differs, so the route goes before the lane starts
    set_state(quarantined=False)
    calls.clear()
    with patched(fw_apply=rec('fw_apply'), fw_ok=lambda lane: True, compose=rec('compose'), wait_healthy=rec('wait_healthy'),
                 parity_report=lambda *a, **k: calls.append(('parity_report', k.get('boot'), k.get('running', True))) or DIFF,
                 quarantine=rec('quarantine'), caddy_route_remove=rec('caddy_route_remove')):
        rc, exc, out = captured(L.main, ['boot'])
    names = [c[0] for c in calls]
    up_at = next((i for i, c in enumerate(calls) if c[0] == 'compose' and 'up' in c), None)
    check(rc == 1 and 'caddy_route_remove' in names and up_at is not None and names.index('caddy_route_remove') < up_at,
          f'boot: a pre-start difference removes the route before the lane starts (rc {rc}, {names})')
    check(('wait_healthy', 'lane1', "['db']") in calls and 'quarantine' in names and names.index('wait_healthy') < names.index('quarantine'),
          'boot: the database is up before quarantine, so it can record and stop cron')
    check(not [c for c in calls if c[0] == 'compose' and 'functions' in c and 'up' in c]
          and [c for c in calls if c[0] == 'parity_report' and c[2]] == [],
          'boot: a pre-start difference starts no functions and skips the running comparison')
    check({c[1] for c in calls if c[0] == 'parity_report'} == {True},
          'boot: both comparisons take the origin recorded in the lane .env (boot=True)')
    check('boot failed' in out and 'firewall restore failed' not in out, 'boot: a parity refusal is not logged as a firewall failure')

    def slow(lane, services, timeout=240):
        raise RuntimeError('not healthy')
    set_state(quarantined=False)
    calls.clear()
    with patched(fw_apply=rec('fw_apply'), fw_ok=lambda lane: True, compose=rec('compose'), wait_healthy=slow,
                 parity_report=lambda *a, **k: ([], []), quarantine=rec('quarantine')):
        rc, exc, out = captured(L.main, ['boot'])
    started_fn = [c for c in calls if c[0] == 'compose' and 'functions' in c and 'up' in c]
    check(rc in (0, None) and started_fn and 'quarantine' not in [c[0] for c in calls],
          f'boot: a slow auth alone does not quarantine; the comparison decides (rc {rc})')

    set_state(quarantined=False)
    calls.clear()
    with patched(parity_report=lambda *a, **k: (_ for _ in ()).throw(RuntimeError('tailscale down')), quarantine=rec('quarantine'),
                 compose=rec('compose'), run=rec('run')):
        rc, exc, out = captured(L.main, ['deploy', '--lane', 'lane1', '--gen', '1', '--tarball', str(tb)])
    check(rc == 3 and 'quarantine' not in [c[0] for c in calls] and 'could not run (RuntimeError: tailscale down)' in out,
          f'deploy: a parity check that cannot run refuses with exit 3, the lane still serves (rc {rc})')

    # check and parity: exit 3 on a difference, 0 without
    set_state(quarantined=False)
    with patched(outbound_check=lambda lane: [], parity_report=lambda *a, **k: DIFF):
        rc, exc, out = captured(L.main, ['check', '--lane', 'lane1', '--gen', '1'])
    check(rc == 3 and 'PARITY FAILED' in out, f'check: exit 3 with PARITY FAILED (rc {rc})')
    with patched(outbound_check=lambda lane: [], parity_report=lambda *a, **k: ([], [])):
        rc, exc, out = captured(L.main, ['check', '--lane', 'lane1', '--gen', '1'])
    check(rc == 0, f'control: check passes with no difference (rc {rc})')
    L.ldir('lane1').mkdir(parents=True, exist_ok=True)
    for fn in ('.env', 'lane.yml', 'ts_ip'):   # parity needs the lane's written config (contents unused: stubbed)
        if not (L.ldir('lane1') / fn).exists():
            (L.ldir('lane1') / fn).write_text('')
    with patched(parity_report=lambda *a, **k: DIFF):
        rc, exc, out = captured(L.main, ['parity', '--lane', 'lane1'])
    check(rc == 3, f'parity: exit 3 on a difference, no generation needed (rc {rc})')
    seen = {}
    with patched(parity_report=lambda lane, running=True, settings=True: seen.update(r=running, s=settings) or ([], [])):
        rc, exc, out = captured(L.main, ['parity', '--lane', 'lane1', '--config-only'])
    check(rc == 0 and seen == {'r': False, 's': False}, f'parity --config-only skips containers and settings (rc {rc})')
    set_state(state='free')
    rc, exc, out = captured(L.main, ['parity', '--lane', 'lane1'])[0:3]
    check(rc == 4, f'parity: a free lane is refused (rc {rc})')
    set_state(state='failed')
    keep = {f: (L.ldir('lane1') / f) for f in ('.env', 'lane.yml', 'ts_ip')}
    moved = {f: p.rename(p.with_name(p.name + '.away')) for f, p in keep.items() if p.exists()}
    try:
        rc, exc, out = captured(L.main, ['parity', '--lane', 'lane1'])[0:3]
    finally:
        for f, p in keep.items():
            if p.with_name(p.name + '.away').exists():
                p.with_name(p.name + '.away').rename(p)
    check(rc == 4 and 'not written yet' in out, f'parity: a failed lane with no config is refused, not a traceback (rc {rc})')
    set_state(state='ready')
    tsf = L.ldir('lane1') / 'ts_ip'
    tsf.rename(tsf.with_name('ts_ip.away'))
    try:
        with patched(parity_report=lambda *a, **k: ([], [])):
            rc, exc, out = captured(L.main, ['parity', '--lane', 'lane1'])[0:3]
    finally:
        tsf.with_name('ts_ip.away').rename(tsf)
    check(rc == 0, f'parity: a lane with no recorded ts_ip is still compared (lane_ts_ip falls back) (rc {rc})')
finally:
    os.geteuid = os_geteuid

print(f'\n{PASS} passed, {FAIL} failed')
import shutil  # noqa: E402
shutil.rmtree(TMP, ignore_errors=True)
sys.exit(1 if FAIL else 0)
