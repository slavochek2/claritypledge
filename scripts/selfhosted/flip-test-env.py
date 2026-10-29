#!/usr/bin/env python3
"""flip-test-env.py — point the shared .env.test.local at the self-hosted TEST server, or back (P1557).

    python3 scripts/selfhosted/flip-test-env.py selfhosted [--file PATH]
    python3 scripts/selfhosted/flip-test-env.py hosted     [--file PATH]
    python3 scripts/selfhosted/flip-test-env.py status     [--file PATH]
    python3 scripts/selfhosted/flip-test-env.py active     [--file PATH]

active (P1591) is the resolver other scripts call: prints exactly "selfhosted" or "hosted" on
stdout, exit 0. A missing, unreadable, malformed or unknown-state file prints the reason on stderr
and exits 2. It never writes anything and never guesses.

Default PATH is the main checkout's .env.test.local (every worktree symlinks to it). --file lets a
rehearsal flip a copy and leave the shared file alone.

selfhosted: backs the file up beside itself (mode 600), keeps the hosted values as HOSTED_TEST_*
lines (scripts/selfhosted/run-hosted-sql.sh reads them), and writes the self-hosted URL and keys
plus SELFHOSTED_TEST_ORIGIN. hosted: restores the main values from the HOSTED_TEST_* lines and
drops the self-hosted ones. Every other line is kept as it is.

Never prints a value. Writes in place through the symlink, atomically.
"""
import os
import sys
import time
from pathlib import Path

HOSTED_URL = 'https://ayibkeoyukulbsjpxgaw.supabase.co'
SELF_URL = 'https://136-85-1-126.sslip.io'
SELF_SECRETS = Path.home() / '.config/cp-selfhosted-test/env'
# main key: (hosted backup key, self-hosted value source)
MAP = {
    'VITE_SUPABASE_URL': 'HOSTED_TEST_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY': 'HOSTED_TEST_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY': 'HOSTED_TEST_SERVICE_ROLE_KEY',
    'VITE_STORY_GUIDE_EDGE_FN_URL': 'HOSTED_TEST_STORY_GUIDE_EDGE_FN_URL',
}
ORIGIN_KEY = 'SELFHOSTED_TEST_ORIGIN'


def die(msg):
    print(f'ERROR: {msg} Nothing was changed.', file=sys.stderr)
    sys.exit(1)


def parse(text):
    out = {}
    for line in text.splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def rewrite(text, values, drop):
    """Replace or append KEY=value for each key in values; remove keys in drop."""
    seen, lines = set(), []
    for line in text.splitlines():
        key = line.split('=', 1)[0].strip() if '=' in line and not line.lstrip().startswith('#') else None
        if key in drop:
            continue
        if key in values:
            lines.append(f'{key}={values[key]}')
            seen.add(key)
        else:
            lines.append(line)
    lines += [f'{k}={v}' for k, v in values.items() if k not in seen]
    return '\n'.join(lines) + '\n'


def shape_error(text):
    """The shapes this script does not rewrite faithfully; refuse them rather than guess."""
    keys = []
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith(('export ', 'export\t')):
            return 'a line starts with "export"'
        if '=' in stripped and not stripped.startswith('#'):
            k, v = stripped.split('=', 1)
            keys.append(k.strip())
            if v.strip()[:1] in ('"', "'") or v.strip()[-1:] in ('"', "'") or ' #' in v or '\t#' in v:
                return f'{k.strip()} is quoted or carries an inline comment'
    dupes = sorted({k for k in keys if keys.count(k) > 1})
    return f'duplicate keys: {", ".join(dupes)}' if dupes else None


def state(env):
    url = env.get('VITE_SUPABASE_URL', '')
    if url == HOSTED_URL and ORIGIN_KEY not in env and not any(k in env for k in MAP.values()):
        return 'hosted'
    if url == SELF_URL and env.get(ORIGIN_KEY) == SELF_URL:
        return 'selfhosted'
    return 'unknown'


def write_atomic(path, text):
    real = Path(os.path.realpath(path))
    tmp = real.with_name(real.name + f'.tmp-{os.getpid()}')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(text)
    os.replace(tmp, real)


def main_checkout():
    """The MAIN checkout's root, from any worktree: the flip state lives there, never in a worktree copy."""
    import subprocess
    here = Path(__file__).resolve().parents[2]
    try:
        common = subprocess.run(['git', '-C', str(here), 'rev-parse', '--path-format=absolute', '--git-common-dir'],
                                capture_output=True, text=True, check=True).stdout.strip()
        return Path(common).parent
    except (OSError, subprocess.CalledProcessError):
        return here


def active(args):
    """P1591 resolver: fail closed, read-only."""
    if len(args) not in (1, 3) or (len(args) == 3 and args[1] != '--file'):
        print('active-test: usage: flip-test-env.py active [--file PATH].', file=sys.stderr)
        return 2
    path = Path(args[2]) if len(args) == 3 else main_checkout() / '.env.test.local'
    try:
        text = Path(os.path.realpath(path)).read_text()
    except OSError as e:
        print(f'active-test: cannot read {path}: {e.strerror}. Cannot tell which TEST server is active.', file=sys.stderr)
        return 2
    bad = shape_error(text)
    if bad:
        print(f'active-test: {path}: {bad}. Refusing to guess.', file=sys.stderr)
        return 2
    now = state(parse(text))
    if now == 'unknown':
        print(f'active-test: {path} is neither cleanly hosted nor cleanly self-hosted. Refusing to guess.', file=sys.stderr)
        return 2
    print(now)
    return 0


def main():
    args = sys.argv[1:]
    if args and args[0] == 'active':
        sys.exit(active(args))
    # Exact shapes only: a typo such as --flie must never fall through to the shared file.
    if not args or args[0] not in ('selfhosted', 'hosted', 'status') \
            or len(args) not in (1, 3) or (len(args) == 3 and args[1] != '--file'):
        die('usage: flip-test-env.py selfhosted|hosted|status [--file PATH].')
    target = args[0]
    if '--file' in args and args.index('--file') + 1 >= len(args):
        die('--file needs a path.')
    path = Path(args[args.index('--file') + 1]) if '--file' in args else \
        Path(__file__).resolve().parents[2] / '.env.test.local'
    if not path.exists():
        die(f'{path} not found.')
    text = Path(os.path.realpath(path)).read_text()
    bad = shape_error(text)
    if bad:
        die(f'{path}: {bad}.')
    env = parse(text)
    now = state(env)
    print(f'{path}: currently {now}')
    if target == 'status':
        return
    if now == target:
        print(f'Already {target}; nothing to do.')
        return
    if now == 'unknown':
        die('the file is neither cleanly hosted nor cleanly self-hosted; fix it by hand first.')

    if target == 'selfhosted':
        self_text = SELF_SECRETS.read_text() if SELF_SECRETS.exists() else ''
        if shape_error(self_text):
            die(f'{SELF_SECRETS}: {shape_error(self_text)}.')
        s = parse(self_text)
        if s.get('SUPABASE_URL') != SELF_URL or not s.get('ANON_KEY') or not s.get('SERVICE_ROLE_KEY'):
            die(f'{SELF_SECRETS} does not hold the self-hosted URL and keys.')
        missing = [k for k in MAP if not env.get(k)]
        if missing:
            die(f'hosted values missing for {", ".join(missing)}.')
        real = Path(os.path.realpath(path))
        backup = real.with_name(f'{real.name}.hosted-backup-{time.strftime("%Y%m%d-%H%M%S")}-{os.getpid()}')
        fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(text)
        values = {MAP[k]: env[k] for k in MAP}
        values.update({
            'VITE_SUPABASE_URL': SELF_URL,
            'VITE_SUPABASE_ANON_KEY': s['ANON_KEY'],
            'SUPABASE_SERVICE_ROLE_KEY': s['SERVICE_ROLE_KEY'],
            'VITE_STORY_GUIDE_EDGE_FN_URL': f'{SELF_URL}/functions/v1/story-guide',
            ORIGIN_KEY: SELF_URL,
        })
        write_atomic(path, rewrite(text, values, drop=set()))
        print(f'Backup: {backup.name}')
    else:
        missing = [MAP[k] for k in MAP if not env.get(MAP[k])]
        if missing:
            die(f'no hosted values to restore ({", ".join(missing)}); use the .env.test.local.hosted-backup-* file.')
        if env[MAP['VITE_SUPABASE_URL']] != HOSTED_URL:
            die('HOSTED_TEST_SUPABASE_URL is not hosted TEST.')
        values = {k: env[MAP[k]] for k in MAP}
        write_atomic(path, rewrite(text, values, drop=set(MAP.values()) | {ORIGIN_KEY}))

    after = state(parse(Path(os.path.realpath(path)).read_text()))
    if after != target:
        print(f'ERROR: the file WAS changed but reads as {after}, not {target}. Restore it from the backup.', file=sys.stderr)
        sys.exit(1)
    print(f'Now {target}. Restart any running dev server or test run: they keep the old values.')


if __name__ == '__main__':
    main()
