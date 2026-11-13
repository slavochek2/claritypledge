#!/usr/bin/env python3
"""admit.py — P1672: VM-authoritative E2E admission for the self-hosted TEST server.

Runs as root on the VM. lanectl.py imports it and calls admit.main(argv) for any argv[0] starting with
"admit"; it also runs directly (`python3 admit.py admit ...`) for hermetic tests.

WHY ON THE VM. The P1541/P1607 locks lived in one checkout's git dir and skipped themselves under CI, so a
second machine or a CI job was never held off. CPU is one pool for the whole VM (P1607 measured 3 concurrent
runs on one stack at about half of 4 CPUs) while databases are per environment (the main lane and each lane).
So admission has two rules, both decided here and nowhere else:

  (i)   CAPACITY, VM-wide: the weights of all admitted runs, across every environment, never exceed
        `capacity` (default 3, from <state>/admit.conf `capacity=N`). P1607 had no weighting beyond
        "one run = one slot", so every run weighs 1 unless --weight says otherwise.
  (ii)  EXCLUSIVITY, per environment: an exclusive run in env X waits until no other run is in X, and from the
        moment it starts waiting it holds a claim that keeps new runs out of X (otherwise a stream of shared
        runs starves it; P1607's drain rule). It never blocks a run in another environment.
  (iii) ONE DEV-SERVER PORT PER MACHINE (P1234/P1607): a run whose --machine and --port match a live run waits,
        in any environment (a reused dev server would also point at the other run's database).

TICKETS expire after their TTL unless heartbeated; a waiting exclusive claim expires after CLAIM_TTL_S unless
its waiter refreshes it. Expired tickets are swept on every call, so a run killed outright frees its place
after at most its TTL. All mutations happen under fcntl.flock on <state>/.lock; the state file is replaced
atomically.

Exit codes: 0 ok · 1 error/usage · 4 refused (heartbeat for an unknown or expired ticket) · 5 wait timed out.

  admit --env main|laneN --mode shared|exclusive --holder ID --ttl S [--wait S] [--weight N]
        [--machine M --port P]
      admitted: one JSON line {"ticket","env","mode","expires_at","used","capacity"}, exit 0
      timeout:  one JSON line {"admitted": false, "blockers": [...]} on stdout, the reason on stderr, exit 5
  admit-heartbeat --ticket T --ttl S      {"ticket","expires_at"}; exit 4 when T is unknown or expired
  admit-release --ticket T                idempotent: {"released": true|false}, always exit 0
  admit-status [--json]                   capacity, used, every live ticket and claim
  admit-sweep                             remove expired tickets, print how many
"""
import fcntl
import json
import os
import re
import secrets
import sys
import time

DEFAULT_STATE_DIR = '/opt/supabase/lanes/state/admit'
DEFAULT_CAPACITY = 3
MAX_CAPACITY = 64
CLAIM_TTL_S = 15          # a waiting exclusive claim lives this long past its waiter's last poll
POLL_S = 0.25
MAX_TTL_S = 24 * 3600
ENV_RE = re.compile(r'^(main|lane[0-9]{1,2})$')

EXIT_OK, EXIT_ERR, EXIT_REFUSED, EXIT_TIMEOUT = 0, 1, 4, 5


class UsageError(Exception):
    pass


def state_dir():
    return os.environ.get('CP_ADMIT_STATE_DIR') or DEFAULT_STATE_DIR


def now():
    return time.time()


# --- state -----------------------------------------------------------------------------------------

class Locked:
    """flock held for the whole read-modify-write of one decision."""

    def __enter__(self):
        d = state_dir()
        os.makedirs(d, mode=0o700, exist_ok=True)
        self.fd = os.open(os.path.join(d, '.lock'), os.O_RDWR | os.O_CREAT, 0o600)
        fcntl.flock(self.fd, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        fcntl.flock(self.fd, fcntl.LOCK_UN)
        os.close(self.fd)
        return False


def tickets_path():
    return os.path.join(state_dir(), 'tickets.json')


def load():
    """The ticket table. A missing file is an empty table; an unreadable one is an error (fail closed:
    treating it as empty would admit runs past the capacity)."""
    try:
        with open(tickets_path()) as f:
            data = json.load(f)
    except FileNotFoundError:
        return {}
    if not isinstance(data, dict):
        raise RuntimeError(f'{tickets_path()} is not a JSON object')
    return data


def save(table):
    p = tickets_path()
    tmp = f'{p}.{os.getpid()}.tmp'
    with open(tmp, 'w') as f:
        json.dump(table, f, sort_keys=True)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, p)


def capacity():
    """capacity=N from <state>/admit.conf, 1..MAX_CAPACITY; anything else is the default, with a warning."""
    p = os.path.join(state_dir(), 'admit.conf')
    try:
        with open(p) as f:
            lines = f.read().splitlines()
    except FileNotFoundError:
        return DEFAULT_CAPACITY
    for line in lines:
        line = line.split('#', 1)[0].strip()
        if not line.startswith('capacity'):
            continue
        _, _, val = line.partition('=')
        val = val.strip()
        if val.isdigit() and 1 <= int(val) <= MAX_CAPACITY:
            return int(val)
        print(f'admit: {p}: capacity={val!r} is not a whole number from 1 to {MAX_CAPACITY}; using {DEFAULT_CAPACITY}',
              file=sys.stderr)
        return DEFAULT_CAPACITY
    return DEFAULT_CAPACITY


def sweep(table, t=None):
    """Drop every ticket and claim past its expiry. Returns the removed tickets."""
    t = now() if t is None else t
    gone = {k: v for k, v in table.items() if v.get('expires_at', 0) <= t}
    for k in gone:
        del table[k]
    return gone


def running(table):
    return {k: v for k, v in table.items() if v.get('phase') == 'running'}


def describe(tk, t=None):
    t = now() if t is None else t
    mins = max(0, int(round((t - tk.get('started_at', tk.get('created_at', t))) / 60)))
    what = 'exclusive' if tk.get('mode') == 'exclusive' else 'shared'
    if tk.get('phase') == 'waiting':
        state = f'waiting to run alone in {tk["env"]} for {mins} min'
    else:
        state = f'{what} in {tk["env"]}, running {mins} min'
    port = f', {tk["machine"]}:{tk["port"]}' if tk.get('machine') and tk.get('port') else ''
    return f'{tk.get("holder", "?")} ({state}{port})'


# --- decision --------------------------------------------------------------------------------------

def decide(table, req, mine_id, t):
    """One admission decision on a swept table. Returns (admit: bool, blockers: [str]).
    `mine_id` is this waiter's own claim id (exclusive waiters), never counted against itself."""
    others = {k: v for k, v in table.items() if k != mine_id}
    run = running(others)
    blockers = []

    same_env = [v for v in others.values() if v['env'] == req['env']]
    if req['mode'] == 'exclusive':
        # Anything else in this env (running, or another exclusive run's claim) keeps an exclusive run out.
        blockers += [describe(v, t) for v in same_env]
    else:
        # A shared run is kept out by an exclusive run (running or waiting) in its env.
        blockers += [describe(v, t) for v in same_env if v.get('mode') == 'exclusive']

    if req.get('machine') and req.get('port'):
        same_port = [v for v in run.values() if v.get('machine') == req['machine'] and v.get('port') == req['port']]
        blockers += [f'{describe(v, t)} (same dev-server port {req["port"]} on {req["machine"]}: '
                     'a shared dev server dies with the run that started it)' for v in same_port]

    used = sum(int(v.get('weight', 1)) for v in run.values())
    cap = capacity()
    if used + req['weight'] > cap:
        oldest_first = sorted(run.values(), key=lambda v: (v.get('started_at', 0), v.get('ticket', '')))
        blockers += [f'VM capacity {cap} in use ({used} admitted): ' +
                     '; '.join(describe(v, t) for v in oldest_first)]
    return (not blockers), blockers


def new_id():
    return f't{int(now())}-{secrets.token_hex(6)}'


def cmd_admit(o):
    req = {
        'env': o['env'], 'mode': o['mode'], 'holder': o['holder'], 'weight': o['weight'],
        'machine': o.get('machine') or '', 'port': o.get('port') or '',
    }
    deadline = now() + o['wait']
    claim_id = None
    blockers = []
    while True:
        with Locked():
            table = load()
            t = now()
            sweep(table, t)
            ok, blockers = decide(table, req, claim_id, t)
            if ok:
                tid = claim_id or new_id()
                created = table.get(tid, {}).get('created_at', t)
                table[tid] = {**req, 'ticket': tid, 'phase': 'running', 'ttl': o['ttl'],
                              'created_at': created, 'started_at': t, 'expires_at': t + o['ttl']}
                save(table)
                used = sum(int(v.get('weight', 1)) for v in running(table).values())
                print(json.dumps({'ticket': tid, 'env': req['env'], 'mode': req['mode'],
                                  'expires_at': int(t + o['ttl']), 'used': used, 'capacity': capacity()}))
                return EXIT_OK
            if req['mode'] == 'exclusive':
                # Hold (or refresh) a claim on the env while waiting, unless another run's claim is first.
                other_claim = any(v.get('phase') == 'waiting' and v['env'] == req['env'] and k != claim_id
                                  for k, v in table.items())
                if claim_id is None and not other_claim:
                    claim_id = new_id()
                    table[claim_id] = {**req, 'ticket': claim_id, 'phase': 'waiting', 'created_at': t,
                                       'expires_at': t + CLAIM_TTL_S}
                elif claim_id is not None and claim_id in table:
                    table[claim_id]['expires_at'] = t + CLAIM_TTL_S
                elif claim_id is not None:
                    claim_id = None  # our claim expired (the waiter stalled); take a new one next round
                if t >= deadline and claim_id is not None:
                    table.pop(claim_id, None)  # a waiter that gives up must not keep others out
                save(table)
            if t >= deadline:
                break
        time.sleep(min(POLL_S, max(0.0, deadline - now())) or 0.01)
    reason = (f'admit: {req["mode"]} run in {req["env"]} not admitted within {o["wait"]}s; held by: '
              + ('; '.join(blockers) or 'unknown'))
    print(json.dumps({'admitted': False, 'env': req['env'], 'mode': req['mode'], 'blockers': blockers}))
    print(reason, file=sys.stderr)
    return EXIT_TIMEOUT


def cmd_heartbeat(o):
    with Locked():
        table = load()
        t = now()
        sweep(table, t)
        tk = table.get(o['ticket'])
        if not tk or tk.get('phase') != 'running':
            save(table)
            print(f'admit: ticket {o["ticket"]} is unknown or expired; this run is no longer admitted', file=sys.stderr)
            return EXIT_REFUSED
        tk['expires_at'] = t + o['ttl']
        tk['ttl'] = o['ttl']
        save(table)
        print(json.dumps({'ticket': o['ticket'], 'expires_at': int(tk['expires_at'])}))
        return EXIT_OK


def cmd_release(o):
    with Locked():
        table = load()
        sweep(table)
        had = table.pop(o['ticket'], None) is not None
        save(table)
    print(json.dumps({'released': had}))
    return EXIT_OK


def cmd_status(o):
    with Locked():
        table = load()
        t = now()
        sweep(table, t)
        save(table)
    run = running(table)
    used = sum(int(v.get('weight', 1)) for v in run.values())
    cap = capacity()
    if o.get('json'):
        print(json.dumps({'capacity': cap, 'used': used, 'now': int(t),
                          'tickets': sorted(table.values(), key=lambda v: v.get('created_at', 0))}, sort_keys=True))
        return EXIT_OK
    print(f'E2E admission: {used} of {cap} in use')
    for v in sorted(table.values(), key=lambda v: v.get('created_at', 0)):
        print(f'  {v["ticket"]}  {describe(v, t)}  expires in {int(v["expires_at"] - t)}s')
    return EXIT_OK


def cmd_sweep(o):
    with Locked():
        table = load()
        gone = sweep(table)
        save(table)
    print(json.dumps({'swept': sorted(gone)}))
    return EXIT_OK


# --- argv ------------------------------------------------------------------------------------------

def parse(argv, spec):
    """--name value pairs per spec {name: type|'flag'}; required names are listed in spec['_required']."""
    out, i = {}, 0
    required = spec.get('_required', ())
    while i < len(argv):
        a = argv[i]
        name = a[2:] if a.startswith('--') else None
        if name not in spec or name == '_required':
            raise UsageError(f'unknown argument {a!r}')
        if spec[name] == 'flag':
            out[name] = True
            i += 1
            continue
        if i + 1 >= len(argv):
            raise UsageError(f'{a} needs a value')
        out[name] = spec[name](argv[i + 1])
        i += 2
    missing = [r for r in required if r not in out]
    if missing:
        raise UsageError('missing ' + ', '.join(f'--{m}' for m in missing))
    return out


def env_name(v):
    if not ENV_RE.match(v):
        raise UsageError(f'--env must be main or laneN, got {v!r}')
    return v


def mode(v):
    if v not in ('shared', 'exclusive'):
        raise UsageError(f'--mode must be shared or exclusive, got {v!r}')
    return v


def seconds(v):
    try:
        n = int(v)
    except ValueError:
        raise UsageError(f'expected whole seconds, got {v!r}')
    if n < 0 or n > MAX_TTL_S:
        raise UsageError(f'seconds out of range: {n}')
    return n


def positive_seconds(v):
    n = seconds(v)
    if n < 1:
        raise UsageError('a TTL must be at least 1 second')
    return n


def weight(v):
    try:
        n = int(v)
    except ValueError:
        raise UsageError(f'--weight must be a whole number, got {v!r}')
    if not 1 <= n <= MAX_CAPACITY:
        raise UsageError(f'--weight must be 1..{MAX_CAPACITY}')
    return n


def text(v):
    v = v.strip()
    if not v or len(v) > 300 or any(ord(c) < 32 for c in v):
        raise UsageError('a text argument must be 1..300 printable characters')
    return v


SPECS = {
    'admit': {'env': env_name, 'mode': mode, 'holder': text, 'ttl': positive_seconds, 'wait': seconds,
              'weight': weight, 'machine': text, 'port': text, '_required': ('env', 'mode', 'holder', 'ttl')},
    'admit-heartbeat': {'ticket': text, 'ttl': positive_seconds, '_required': ('ticket', 'ttl')},
    'admit-release': {'ticket': text, '_required': ('ticket',)},
    'admit-status': {'json': 'flag'},
    'admit-sweep': {},
}
HANDLERS = {'admit': cmd_admit, 'admit-heartbeat': cmd_heartbeat, 'admit-release': cmd_release,
            'admit-status': cmd_status, 'admit-sweep': cmd_sweep}


def main(argv):
    if not argv or argv[0] not in HANDLERS:
        print(f'admit: unknown subcommand {argv[0] if argv else "(none)"!r}; one of {", ".join(HANDLERS)}', file=sys.stderr)
        return EXIT_ERR
    sub = argv[0]
    try:
        o = parse(argv[1:], SPECS[sub])
        if sub == 'admit':
            o.setdefault('wait', 0)
            o.setdefault('weight', 1)
        return HANDLERS[sub](o)
    except UsageError as e:
        print(f'{sub}: {e}', file=sys.stderr)
        return EXIT_ERR
    except (OSError, RuntimeError, ValueError) as e:
        print(f'{sub}: {e}', file=sys.stderr)
        return EXIT_ERR


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
