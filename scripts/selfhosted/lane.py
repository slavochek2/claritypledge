#!/usr/bin/env python3
"""lane.py — which TEST environment this worktree uses, and the lane lifecycle (P1672).

THE one answer per worktree for "which TEST environment" (it replaces the single shared answer of
P1591 for self-hosted work). Every consumer asks this file; none decides for itself.

    lane.py resolve [--purpose run|write] [--format json|shell|vite-env] [--worktree PATH]
    lane.py claim                 claim a lane for this worktree, provision it, migrate, deploy, lift
    lane.py heartbeat             extend this worktree's lease (every lane write command calls it)
    lane.py release               give the lane back; this worktree returns to the main lane
    lane.py return-to-main        clear a revoked, failed or expired claim (explicit, recorded)
    lane.py status                this checkout's claims and the VM's lanes
    lane.py revoke-all            rollback: revoke every lane, tombstone every claim
    lane.py vm -- ARGS...         run lanectl on the VM with ARGS (stdin/stdout passed through)
    lane.py vm-install            install lanectl and its units on the VM (idempotent)

Answers:
  * An UNCLAIMED worktree uses the main lane exactly as before: `vite-env` prints {} so nothing is
    overridden, and the other formats describe the main lane.
  * A CLAIMED worktree uses its lane. A claim that is revoked, failed, expired, half-written or
    unreadable is REFUSED (exit 2, reason on stderr). It never falls back to the main lane; only
    `release` or `return-to-main` moves a worktree back, and that transition is recorded.
  * --purpose write (deploy, migrate): an unclaimed worktree is refused while another worktree on
    the same branch holds a lane (one branch, one lane).

Where things live:
  claim record   <git-common-dir>/cp-test-lanes/claims/<worktree-dir>.json   (never in env files:
                 every worktree's .env files are symlinks to main's)
  lane keys      ~/.config/cp-selfhosted-test/lanes/<lane>.env, mode 600, never printed
  lane state     on the VM (/opt/supabase/lanes/state), the authority for allocation and fencing

Never prints a key. Prod and hosted TEST are unreachable from here: the only targets are the
self-hosted VM's main lane and its lanes.
"""
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

# --- Fixed targets. Changing these is a decision, not a flag. ---
GCP_PROJECT = 'gen-lang-client-0869694595'
VM = 'cp-test-supabase'
ZONE = 'asia-southeast1-a'
MAIN_ORIGIN = 'https://136-85-1-126.sslip.io'
MAIN_STACK_DIR = '/opt/supabase/docker'
MAIN_CONTAINERS = {'db': 'supabase-db', 'meta': 'supabase-meta', 'functions': 'supabase-edge-functions'}
LANES_ROOT = '/opt/supabase/lanes'
LANECTL = f'{LANES_ROOT}/bin/lanectl'
# Test seam (hermetic tests only): CP_LANE_CONFIG_DIR replaces the Mac secrets directory.
CONFIG_DIR = Path(os.environ.get('CP_LANE_CONFIG_DIR') or (Path.home() / '.config/cp-selfhosted-test'))
MAIN_KEYS = CONFIG_DIR / 'env'
LANE_KEYS_DIR = CONFIG_DIR / 'lanes'
PROTOCOL_PATH = 'scripts/selfhosted/lanes/PROTOCOL'
PROTOCOL = 1
DEFAULT_TTL = 7 * 24 * 3600
LANE_NAMES = ('lane1', 'lane2')
LANE_PORTS = {'lane1': '8443', 'lane2': '8444'}   # must match LANES in lanes/vm/lanectl.py
LANE_ORIGIN = re.compile(r'https://[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net:(8443|8444)')

EXIT_REFUSED = 2


class Refused(Exception):
    """A fail-closed refusal: the caller must stop."""


def err(msg):
    print(msg, file=sys.stderr)


# --- git ---------------------------------------------------------------------------------------

def git(*args, cwd):
    return subprocess.run(['git', '-C', str(cwd), *args], capture_output=True, text=True)


def worktree_root(cwd):
    r = git('rev-parse', '--show-toplevel', cwd=cwd)
    if r.returncode != 0:
        raise Refused(f'lane: {cwd} is not inside a git checkout; cannot tell which TEST environment it uses.')
    return Path(r.stdout.strip())


def common_dir(root):
    r = git('rev-parse', '--path-format=absolute', '--git-common-dir', cwd=root)
    if r.returncode != 0:
        raise Refused('lane: cannot read the git common dir; cannot tell which TEST environment this is.')
    return Path(r.stdout.strip())


def is_main_checkout(root):
    return common_dir(root).parent.resolve() == root.resolve()


def worktree_id(root):
    """'main' for the main checkout; otherwise git's own per-worktree id (the name under
    <common>/worktrees/), which git keeps unique, unlike the directory's basename."""
    if is_main_checkout(root):
        return 'main'
    r = git('rev-parse', '--path-format=absolute', '--git-dir', cwd=root)
    if r.returncode != 0:
        raise Refused('lane: cannot read this worktree\'s git dir; cannot tell which claim is its own.')
    return Path(r.stdout.strip()).name


def branch_of(root):
    r = git('symbolic-ref', '--short', '-q', 'HEAD', cwd=root)
    return r.stdout.strip() if r.returncode == 0 else ''


def claims_dir(root):
    return common_dir(root) / 'cp-test-lanes' / 'claims'


# --- claim records -------------------------------------------------------------------------------

# 'allocating' is written BEFORE the VM is asked for a lane, so a lost or unreadable answer leaves a
# refusing record, never a worktree that silently resolves to the main lane (review round 2).
RECORD_STATES = ('allocating', 'provisioning', 'active', 'revoked', 'failed')


def record_path(root):
    return claims_dir(root) / f'{worktree_id(root)}.json'


def read_record(path):
    """None when absent. Raises Refused when present but unreadable: a claim we cannot read is unknown."""
    if not path.exists() and not path.is_symlink():
        return None
    try:
        rec = json.loads(path.read_text())
    except (OSError, ValueError) as e:
        raise Refused(f'lane: claim record {path} is unreadable ({e}). Refusing: run lane.py return-to-main after checking it.')
    if not isinstance(rec, dict) or rec.get('state') not in RECORD_STATES:
        raise Refused(f'lane: claim record {path} is malformed. Refusing: run lane.py return-to-main after checking it.')
    if rec['state'] != 'allocating' and (rec.get('lane') not in LANE_NAMES or not isinstance(rec.get('generation'), int)):
        raise Refused(f'lane: claim record {path} is malformed. Refusing: run lane.py return-to-main after checking it.')
    return rec


def own_record(path, root):
    """read_record, refusing a record that names another checkout (release and heartbeat act on the VM)."""
    rec = read_record(path)
    if rec and rec.get('path') and Path(rec['path']).resolve() != root.resolve():
        raise Refused(f'lane: the claim record {path.name} belongs to checkout {rec["path"]}, not {root}. Refusing.')
    return rec


def write_record(path, rec):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f'.tmp-{os.getpid()}')
    tmp.write_text(json.dumps(rec, indent=2, sort_keys=True) + '\n')
    os.replace(tmp, path)


def log_transition(root, what):
    d = claims_dir(root)
    d.mkdir(parents=True, exist_ok=True)
    with open(d / 'transitions.log', 'a') as f:
        f.write(f'{time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}\t{worktree_id(root)}\t{branch_of(root) or "-"}\t{what}\n')


def all_records(root):
    out = []
    d = claims_dir(root)
    if not d.is_dir():
        return out
    for p in sorted(d.glob('*.json')):
        try:
            out.append((p, read_record(p)))
        except Refused:
            out.append((p, None))
    return out


# --- keys ----------------------------------------------------------------------------------------

def parse_env(text):
    out = {}
    for line in text.splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def lane_keys_file(lane):
    return LANE_KEYS_DIR / f'{lane}.env'


def read_lane_keys(lane, generation):
    p = lane_keys_file(lane)
    try:
        st = p.stat()
    except OSError:
        raise Refused(f'lane: keys for {lane} are missing ({p}). Refusing: run lane.py release, then claim again.')
    if st.st_mode & 0o077:
        raise Refused(f'lane: {p} must be mode 600. Refusing.')
    env = parse_env(p.read_text())
    if env.get('LANE') != lane or env.get('LANE_GENERATION') != str(generation):
        raise Refused(f'lane: {p} belongs to another claim (lane or generation differs). Refusing: run lane.py release, then claim again.')
    for k in ('SUPABASE_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY'):
        if not env.get(k):
            raise Refused(f'lane: {p} has no {k}. Refusing.')
    # A lane origin is the VM's tailnet name on a lane port (D4), never the main lane or a hosted project.
    m = LANE_ORIGIN.fullmatch(env['SUPABASE_URL'])
    if not m or not env['SUPABASE_URL'].startswith(f'https://{VM}.') or m.group(2) != LANE_PORTS[lane]:
        raise Refused(f'lane: {p} names an origin that is not {lane}\'s (the VM\'s tailnet name on port {LANE_PORTS[lane]}). Refusing.')
    return env


def write_lane_keys(lane, text):
    LANE_KEYS_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(LANE_KEYS_DIR, 0o700)
    p = lane_keys_file(lane)
    tmp = p.with_name(p.name + f'.tmp-{os.getpid()}')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(text)
    os.replace(tmp, p)


# --- resolve -------------------------------------------------------------------------------------

def main_answer(root):
    return {
        'target': 'main', 'lane': None, 'generation': None, 'origin': MAIN_ORIGIN,
        'keys_file': str(MAIN_KEYS), 'containers': dict(MAIN_CONTAINERS), 'stack_dir': MAIN_STACK_DIR,
        'functions_vol': f'{MAIN_STACK_DIR}/volumes/functions', 'lanectl': None,
        'vm': {'project': GCP_PROJECT, 'zone': ZONE, 'name': VM},
        'worktree': worktree_id(root), 'branch': branch_of(root),
    }


def lane_answer(root, rec, keys):
    lane = rec['lane']
    return {
        'target': 'lane', 'lane': lane, 'generation': rec['generation'], 'origin': keys['SUPABASE_URL'],
        'keys_file': str(lane_keys_file(lane)),
        'containers': {'db': f'cp-{lane}-db', 'meta': f'cp-{lane}-meta', 'functions': f'cp-{lane}-functions'},
        'stack_dir': f'{LANES_ROOT}/{lane}', 'functions_vol': f'{LANES_ROOT}/{lane}/volumes/functions',
        'lanectl': LANECTL, 'vm': {'project': GCP_PROJECT, 'zone': ZONE, 'name': VM},
        'worktree': worktree_id(root), 'branch': branch_of(root),
    }


def resolve(root, purpose='run'):
    """The answer for this worktree, or Refused. Pure reads: no network."""
    rec = read_record(record_path(root))
    if rec is not None:
        lane, gen, state = rec['lane'], rec['generation'], rec['state']
        if state != 'active':
            raise Refused(f'lane: this worktree\'s claim of {lane} (generation {gen}) is {state}. Refusing: it never falls back to the '
                          f'main lane. Run lane.py return-to-main to use the main lane, or lane.py claim for a new lane.')
        exp = rec.get('lease_expires_at')
        if not isinstance(exp, (int, float)) or exp < time.time():
            raise Refused(f'lane: this worktree\'s lease on {lane} has expired. Refusing: run lane.py return-to-main, or lane.py claim.')
        # The lane belongs to the branch and the checkout that claimed it. A branch switched inside this
        # worktree, or another checkout that maps to the same record name, must not inherit it.
        here = branch_of(root)
        if rec.get('branch') != here:
            raise Refused(f'lane: {lane} was claimed for branch {rec.get("branch")}, but this worktree is on {here or "a detached HEAD"}. '
                          f'Refusing. Switch back, or run lane.py release on the original branch first.')
        if rec.get('path') and Path(rec['path']).resolve() != root.resolve():
            raise Refused(f'lane: the claim record names checkout {rec["path"]}, not {root}. Refusing.')
        return lane_answer(root, rec, read_lane_keys(lane, gen))
    if purpose == 'write':
        br = branch_of(root)
        for p, other in all_records(root):
            if other is None:
                continue
            if other.get('branch') == br and br and other['state'] in ('allocating', 'active', 'provisioning'):
                raise Refused(f'lane: branch {br} holds {other["lane"]} through worktree {other.get("worktree")}. '
                              f'Refusing to deploy or migrate it to the main lane from here (one branch, one lane).')
    return main_answer(root)


def vite_env(answer):
    """Env overrides for the dev server and Playwright. {} for the main lane: nothing changes."""
    if answer['target'] != 'lane':
        return {}
    keys = read_lane_keys(answer['lane'], answer['generation'])
    o = keys['SUPABASE_URL']
    return {
        'VITE_SUPABASE_URL': o,
        'VITE_SUPABASE_ANON_KEY': keys['ANON_KEY'],
        'SUPABASE_SERVICE_ROLE_KEY': keys['SERVICE_ROLE_KEY'],
        'VITE_STORY_GUIDE_EDGE_FN_URL': f'{o}/functions/v1/story-guide',
        'SELFHOSTED_TEST_ORIGIN': o,
        'CP_TEST_LANE': answer['lane'],
        'CP_TEST_LANE_GENERATION': str(answer['generation']),
    }


def shell_lines(answer):
    pairs = [
        ('CP_TEST_TARGET', answer['target']), ('CP_TEST_LANE', answer['lane'] or ''),
        ('CP_TEST_GEN', '' if answer['generation'] is None else str(answer['generation'])),
        ('CP_TEST_ORIGIN', answer['origin']), ('CP_TEST_KEYS_FILE', answer['keys_file']),
        ('CP_TEST_DB_CONTAINER', answer['containers']['db']), ('CP_TEST_META_CONTAINER', answer['containers']['meta']),
        ('CP_TEST_FUNCTIONS_CONTAINER', answer['containers']['functions']), ('CP_TEST_STACK_DIR', answer['stack_dir']),
        ('CP_TEST_FUNCTIONS_VOL', answer['functions_vol']), ('CP_TEST_LANECTL', answer['lanectl'] or ''),
    ]
    return '\n'.join(f'{k}={shlex.quote(v)}' for k, v in pairs)


# --- VM ------------------------------------------------------------------------------------------

def gcloud_bin():
    g = shutil.which('gcloud')
    if g:
        return g
    alt = '/opt/homebrew/share/google-cloud-sdk/bin/gcloud'
    if os.path.exists(alt):
        return alt
    raise Refused('lane: gcloud not found.')


def vm_cmd(remote):
    mux = f'/tmp/cp-iap-{os.getuid()}'
    os.makedirs(mux, mode=0o700, exist_ok=True)
    return [gcloud_bin(), 'compute', 'ssh', VM, f'--project={GCP_PROJECT}', f'--zone={ZONE}', '--tunnel-through-iap', '--quiet',
            '--ssh-flag=-o ControlMaster=auto', f'--ssh-flag=-o ControlPath={mux}/%C', '--ssh-flag=-o ControlPersist=120',
            '--ssh-flag=-o ConnectTimeout=30', '--command', remote]


NOISE = ('numpy', 'increasing_the_tcp', 'WARNING:')


def run_lanectl(args, stdin_bytes=None, capture=True, timeout=900):
    """Run lanectl on the VM. Returns (rc, stdout_text). stderr is passed through minus gcloud noise."""
    remote = 'sudo ' + LANECTL + ' ' + ' '.join(shlex.quote(a) for a in args)
    p = subprocess.run(vm_cmd(remote), input=stdin_bytes if stdin_bytes is not None else b'', capture_output=True, timeout=timeout)
    for line in p.stderr.decode(errors='replace').splitlines():
        if line.strip() and not any(n in line for n in NOISE):
            print(line, file=sys.stderr)
    return p.returncode, p.stdout.decode(errors='replace')


def require_lanectl_protocol():
    rc, out = run_lanectl(['version'])
    if rc != 0:
        raise Refused('lane: lanectl is not installed on the VM (or did not answer). Run lane.py vm-install first.')
    got = out.strip()
    if got != f'protocol {PROTOCOL}':
        raise Refused(f'lane: the VM runs lanectl "{got}", this checkout speaks protocol {PROTOCOL}. Run lane.py vm-install from a current checkout.')


# --- lifecycle -----------------------------------------------------------------------------------

def holder(root):
    return {'worktree': worktree_id(root), 'branch': branch_of(root), 'host': os.uname().nodename, 'path': str(root)}


def dev_server_pids(root):
    """PIDs of vite processes whose cwd is this worktree."""
    pids = []
    r = subprocess.run(['pgrep', '-f', 'vite'], capture_output=True, text=True)
    for pid in r.stdout.split():
        lr = subprocess.run(['lsof', '-a', '-d', 'cwd', '-p', pid, '-Fn'], capture_output=True, text=True)
        cwd = next((l[1:] for l in lr.stdout.splitlines() if l.startswith('n')), '')
        if cwd and Path(cwd).resolve() == root.resolve():
            pids.append(int(pid))
    return pids


def restart_dev_server(root, relaunch=True):
    pids = dev_server_pids(root)
    if not pids:
        print('dev server: none running in this worktree.')
        return
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    time.sleep(2)
    print(f'dev server: stopped {len(pids)} process(es) so it re-reads the TEST target.')
    if relaunch:
        log = common_dir(root) / 'cp-test-lanes' / f'dev-{worktree_id(root)}.log'
        log.parent.mkdir(parents=True, exist_ok=True)
        with open(log, 'a') as f:
            subprocess.Popen(['npm', 'run', 'dev'], cwd=root, stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                             start_new_session=True)
        print(f'dev server: relaunched with npm run dev (log: {log}).')


def run_script(root, argv):
    print(f'>>> {" ".join(argv)}')
    return subprocess.run(argv, cwd=root).returncode


def cmd_claim(root, ttl):
    if is_main_checkout(root):
        raise Refused('lane: the main checkout serves landings and stays on the main lane. Claim from a worktree.')
    br = branch_of(root)
    if not br or br == 'main':
        raise Refused('lane: claim from a feature branch, not main or a detached HEAD.')
    if git('cat-file', '-e', f'HEAD:{PROTOCOL_PATH}', cwd=root).returncode != 0:
        raise Refused(f'lane: this branch does not contain the lane resolver ({PROTOCOL_PATH} is missing at HEAD). '
                      f'Its scripts know nothing of lanes. Rebase onto main, then claim again.')
    path = record_path(root)
    rec = read_record(path)
    if rec is not None:
        raise Refused(f'lane: this worktree already has a claim of {rec["lane"]} ({rec["state"]}). Release it or return-to-main first.')
    for p, other in all_records(root):
        if other and other.get('branch') == br and other['state'] in ('allocating', 'active', 'provisioning'):
            raise Refused(f'lane: branch {br} already holds {other["lane"]} through {other.get("worktree")} (one branch, one lane).')
    require_lanectl_protocol()

    # The refusing record goes down BEFORE the VM is asked: whatever happens next (an SSH answer lost, a
    # timeout, a crash), this worktree can never resolve to the main lane while the VM may hold a lane for it.
    write_record(path, {'lane': None, 'generation': None, 'state': 'allocating', 'branch': br, 'worktree': worktree_id(root),
                        'path': str(root), 'claimed_at': int(time.time())})
    log_transition(root, 'claim: allocating')
    rc, out = run_lanectl(['allocate', '--ttl', str(ttl)], stdin_bytes=json.dumps(holder(root)).encode())
    if rc == 4:
        path.unlink()   # lanectl's own refusal: it holds nothing for us, so nothing to keep refusing
        log_transition(root, 'claim: the VM refused the allocation; record removed')
        raise Refused('lane: the VM did not allocate a lane (see above). Nothing was claimed.')
    if rc != 0:
        # An SSH drop or a lanectl error after it saved: the VM MAY hold a lane for us. Keep refusing.
        log_transition(root, f'claim: allocation answer lost (exit {rc}); record kept as allocating')
        raise Refused(f'lane: the allocation did not answer cleanly (exit {rc}). The VM may hold a lane for this worktree: '
                      f'run lane.py status, release it there if so, then lane.py return-to-main.')
    try:
        alloc = json.loads(out.strip().splitlines()[-1])
        lane, gen = alloc['lane'], int(alloc['generation'])
        int(alloc['lease_expires_at'])
        if lane not in LANE_NAMES:
            raise ValueError(lane)
    except (ValueError, KeyError, IndexError, TypeError):
        raise Refused('lane: the VM answered the allocation with something unreadable. It MAY hold a lane for this '
                      'worktree now: run lane.py status, and release it there (lane.py vm -- release --lane L --gen G).')
    rec = {'lane': lane, 'generation': gen, 'state': 'provisioning', 'branch': br, 'worktree': worktree_id(root),
           'path': str(root), 'claimed_at': int(time.time()), 'lease_expires_at': alloc['lease_expires_at']}
    write_record(path, rec)   # written before provisioning, so a crash leaves a refusing claim, never a silent fallback
    log_transition(root, f'claim {lane} gen {gen}: provisioning')
    print(f'Allocated {lane} (generation {gen}). Provisioning from a fresh copy of the main lane...')

    def fail(why):
        rec['state'] = 'failed'
        write_record(path, rec)
        log_transition(root, f'claim {lane} gen {gen}: failed ({why})')
        raise Refused(f'lane: {why}. The claim is marked failed and this worktree refuses until lane.py release (or return-to-main).')

    rc, _ = run_lanectl(['provision', '--lane', lane, '--gen', str(gen)], capture=False, timeout=1800)
    if rc != 0:
        fail('provisioning failed on the VM')
    rc, keys = run_lanectl(['keys', '--lane', lane, '--gen', str(gen)])
    if rc != 0 or 'ANON_KEY=' not in keys:
        fail('could not read the new lane keys')
    write_lane_keys(lane, keys)
    rec['state'] = 'active'
    write_record(path, rec)
    log_transition(root, f'claim {lane} gen {gen}: active (quarantined until lift)')

    # The record must be 'active' here so the deploy and migrate scripts resolve to the lane; any way out
    # of these steps other than success (a failure, a timeout, Ctrl-C) marks the claim failed.
    try:
        if run_script(root, ['./scripts/selfhosted/deploy-functions.sh']) != 0:
            fail('the function deploy to the lane failed')
        if run_script(root, ['./scripts/migrate.sh', '--env', 'selfhosted']) != 0:
            fail('the branch migrations failed on the lane (it stays quarantined)')
        rc, _ = run_lanectl(['lift', '--lane', lane, '--gen', str(gen)], capture=False)
        if rc != 0:
            fail('the outbound check did not pass, so the lane stays quarantined')
    except Refused:
        if rec['state'] == 'active':   # a refusal from a helper (not from fail()) must not leave an active claim
            rec['state'] = 'failed'
            write_record(path, rec)
            log_transition(root, f'claim {lane} gen {gen}: failed (refused before lift)')
        raise
    except BaseException as e:
        fail(f'claiming stopped before the lane was lifted ({type(e).__name__})')
    log_transition(root, f'claim {lane} gen {gen}: ready')
    print(f'\n{lane} is ready at {keys_origin(lane, gen)} (Tailscale only).')
    ledger_diff(root, lane, gen)
    restart_dev_server(root)
    return 0


def keys_origin(lane, gen):
    return read_lane_keys(lane, gen)['SUPABASE_URL']


def ledger_diff(root, lane, gen):
    """After the copy: the lane's ledger against this branch's migration files, both directions (stage 1 ACCEPT)."""
    rc, out = run_lanectl(['psql', '--lane', lane, '--gen', str(gen), '--at'],
                          stdin_bytes=b'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;\n')
    if rc != 0:
        err('ledger diff: could not read the lane ledger.')
        return
    server = {l.strip() for l in out.splitlines() if l.strip()}
    local = set()
    for f in sorted((root / 'supabase/migrations').glob('*.sql')):
        v = ''.join(ch for ch in f.name.split('_', 1)[0] if ch.isdigit())
        if v:
            local.add(v)
    extra, missing = sorted(server - local), sorted(local - server)
    print(f'ledger diff ({lane} vs this branch): {len(extra)} applied version(s) with no file here, {len(missing)} file(s) not applied.')
    for v in extra[:20]:
        print(f'  on lane, not in branch: {v}')
    for v in missing[:20]:
        print(f'  in branch, not on lane: {v}')
    if extra:
        print('  (Inherited from the main lane, which still holds unlanded branch schema; stage 2 cleans the main lane.)')


def cmd_heartbeat(root, ttl):
    path = record_path(root)
    rec = own_record(path, root)
    if rec is None:
        print('heartbeat: this worktree holds no lane; nothing to do.')
        return 0
    if rec['state'] != 'active':
        raise Refused(f'lane: claim is {rec["state"]}; nothing to heartbeat.')
    rc, out = run_lanectl(['heartbeat', '--lane', rec['lane'], '--gen', str(rec['generation']), '--ttl', str(ttl)])
    if rc != 0:
        raise Refused('lane: the VM refused the heartbeat (generation stale, lane released or expired). Refusing.')
    rec['lease_expires_at'] = json.loads(out.strip().splitlines()[-1])['lease_expires_at']
    write_record(path, rec)
    return 0


def cmd_release(root):
    path = record_path(root)
    rec = own_record(path, root)
    if rec is None:
        print('release: this worktree holds no lane; it already uses the main lane.')
        return 0
    if rec['state'] == 'allocating':
        raise Refused('lane: this claim never learned which lane the VM gave it (allocating). Run lane.py status to see the '
                      'VM\'s holder, release it there if it is this worktree (lane.py vm -- release --lane L --gen G), then '
                      'lane.py return-to-main.')
    rc, _ = run_lanectl(['release', '--lane', rec['lane'], '--gen', str(rec['generation'])], capture=False)
    if rc not in (0, 4):   # 4: stale generation, the lane is already someone else's or free
        raise Refused('lane: the VM could not release the lane (see above). The claim stays; nothing changed here.')
    path.unlink()
    kf = lane_keys_file(rec['lane'])
    if kf.exists() and parse_env(kf.read_text()).get('LANE_GENERATION') == str(rec['generation']):
        kf.unlink()
    log_transition(root, f'release {rec["lane"]} gen {rec["generation"]}: back to the main lane')
    print(f'Released {rec["lane"]}. This worktree uses the main lane again.')
    restart_dev_server(root)
    return 0


def cmd_return_to_main(root):
    path = record_path(root)
    try:
        rec = read_record(path)
    except Refused:
        rec = {'lane': '?', 'generation': '?', 'state': 'unreadable'}
    if rec is None:
        print('return-to-main: no claim here; this worktree already uses the main lane.')
        return 0
    if rec.get('state') == 'active':
        raise Refused('lane: the claim is active. Use lane.py release, which also frees the lane on the VM.')
    # A failed or half-provisioned claim still holds its lane on the VM until the lease runs out (7 days):
    # free it now. Exit 4 means the VM no longer gives this generation the lane, which is fine.
    if rec.get('state') in ('failed', 'provisioning') and rec.get('lane') in LANE_NAMES and isinstance(rec.get('generation'), int):
        rc, _ = run_lanectl(['release', '--lane', rec['lane'], '--gen', str(rec['generation'])], capture=False)
        if rc not in (0, 4):
            raise Refused('lane: the VM could not release the lane this claim held (see above). Nothing changed here.')
    path.unlink()
    log_transition(root, f'return-to-main from {rec.get("lane")} gen {rec.get("generation")} ({rec.get("state")})')
    print(f'Cleared the {rec.get("state")} claim. This worktree uses the main lane again.')
    restart_dev_server(root)
    return 0


def cmd_revoke_all(root):
    rc, _ = run_lanectl(['revoke-all'], capture=False)
    if rc != 0:
        raise Refused('lane: the VM did not revoke the lanes (see above).')
    for p, rec in all_records(root):
        if rec and rec['state'] in ('active', 'provisioning'):
            rec['state'] = 'revoked'
            write_record(p, rec)
            log_transition(root, f'revoke {rec["lane"]} gen {rec["generation"]} (worktree {rec.get("worktree")})')
            wt = Path(rec.get('path', ''))
            if wt.is_dir():
                restart_dev_server(wt, relaunch=False)
    print('Every lane revoked. Claimed worktrees refuse until lane.py return-to-main is run in each.')
    return 0


def cmd_status(root):
    print('Claims in this checkout:')
    recs = all_records(root)
    if not recs:
        print('  none (every worktree uses the main lane)')
    for p, rec in recs:
        if rec is None:
            print(f'  {p.stem}: UNREADABLE record (refuses)')
        else:
            exp = time.strftime('%Y-%m-%d %H:%M', time.localtime(rec.get('lease_expires_at', 0)))
            print(f'  {rec.get("worktree")}: {rec["lane"]} gen {rec["generation"]} {rec["state"]}, branch {rec.get("branch")}, lease to {exp}')
    rc, out = run_lanectl(['status'])
    print('VM lanes:')
    print(out.rstrip() if rc == 0 else '  (lanectl did not answer; run lane.py vm-install?)')
    return 0


def cmd_vm_install(root):
    """Copy lanectl and its units to the VM and run its own install step."""
    src = root / 'scripts/selfhosted/lanes/vm'
    files = sorted(p for p in src.iterdir() if p.is_file())
    tar = subprocess.run(['tar', '--no-xattrs', '-C', str(src), '-czf', '-', *[p.name for p in files]], capture_output=True, check=True,
                         env={**os.environ, 'COPYFILE_DISABLE': '1'}).stdout
    remote = ('set -e; d=$(mktemp -d); tar -xzf - -C "$d"; sudo mkdir -p ' + LANES_ROOT + '/bin; '
              'sudo python3 "$d/lanectl.py" install --from "$d"; rm -rf "$d"')
    p = subprocess.run(vm_cmd(remote), input=tar, capture_output=True)
    sys.stdout.write(p.stdout.decode(errors='replace'))
    for line in p.stderr.decode(errors='replace').splitlines():
        if line.strip() and not any(n in line for n in NOISE):
            print(line, file=sys.stderr)
    return p.returncode


def cmd_vm(args):
    # stdin is STREAMED, never read up front: a caller whose stdin stays open (an agent shell, a
    # detached job) would otherwise block here forever before anything reaches the VM.
    remote = 'sudo ' + LANECTL + ' ' + ' '.join(shlex.quote(a) for a in args)
    p = subprocess.run(vm_cmd(remote), stdin=sys.stdin, stdout=sys.stdout, stderr=subprocess.PIPE)
    for line in p.stderr.decode(errors='replace').splitlines():
        if line.strip() and not any(n in line for n in NOISE):
            print(line, file=sys.stderr)
    return p.returncode


# --- main ----------------------------------------------------------------------------------------

def main(argv):
    if not argv:
        print(__doc__)
        return 1
    cmd, rest = argv[0], argv[1:]
    try:
        if cmd == 'resolve':
            purpose, fmt, where = 'run', 'json', os.getcwd()
            i = 0
            while i < len(rest):
                a = rest[i]
                if a == '--purpose' and i + 1 < len(rest) and rest[i + 1] in ('run', 'write'):
                    purpose = rest[i + 1]; i += 2
                elif a == '--format' and i + 1 < len(rest) and rest[i + 1] in ('json', 'shell', 'vite-env'):
                    fmt = rest[i + 1]; i += 2
                elif a == '--worktree' and i + 1 < len(rest):
                    where = rest[i + 1]; i += 2
                else:
                    raise Refused(f'lane: resolve: bad argument {a!r}. Usage: resolve [--purpose run|write] [--format json|shell|vite-env] [--worktree PATH]')
            root = worktree_root(where)
            ans = resolve(root, purpose)
            if fmt == 'json':
                print(json.dumps(ans, sort_keys=True))
            elif fmt == 'shell':
                print(shell_lines(ans))
            else:
                print(json.dumps(vite_env(ans), sort_keys=True))
            return 0
        if cmd == 'vm':
            if rest[:1] == ['--']:
                rest = rest[1:]
            return cmd_vm(rest)
        root = worktree_root(os.getcwd())
        ttl = DEFAULT_TTL
        if '--ttl' in rest:
            i = rest.index('--ttl')
            if i + 1 >= len(rest) or not rest[i + 1].isdigit() or int(rest[i + 1]) < 60:
                raise Refused('lane: --ttl needs a whole number of seconds, at least 60.')
            ttl = int(rest[i + 1])
        handlers = {
            'claim': lambda: cmd_claim(root, ttl), 'heartbeat': lambda: cmd_heartbeat(root, ttl),
            'release': lambda: cmd_release(root), 'return-to-main': lambda: cmd_return_to_main(root),
            'revoke-all': lambda: cmd_revoke_all(root), 'status': lambda: cmd_status(root),
            'vm-install': lambda: cmd_vm_install(root),
        }
        if cmd not in handlers:
            raise Refused(f'lane: unknown command {cmd!r}.')
        return handlers[cmd]()
    except Refused as e:
        err(str(e))
        return EXIT_REFUSED
    except Exception as e:   # a timeout or anything unforeseen: never a traceback with a half-written claim
        err(f'lane: {cmd} stopped on an unexpected error ({type(e).__name__}: {e}). Refusing.')
        try:
            path = record_path(worktree_root(os.getcwd()))
            rec = read_record(path)
            if rec and rec['state'] == 'provisioning':
                rec['state'] = 'failed'
                write_record(path, rec)
                err('lane: this worktree\'s claim is marked failed; lane.py return-to-main also frees its lane on the VM.')
        except Exception:
            pass
        return EXIT_REFUSED


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
