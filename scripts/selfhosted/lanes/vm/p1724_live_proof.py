#!/usr/bin/env python3
"""P1724 live proof: the lane parity check fires on real mismatches, staged on the spare lane2.

Run as root on cp-test-supabase against a CANDIDATE lanectl (not the installed one):

    sudo python3 p1724_live_proof.py /tmp/<dir>/lanectl.py

What it does, and what it never does:
  * Refuses unless lane2 is free, has no lane directory, and its compose project owns no containers,
    networks or volumes. Holds lane2's exclusive lock throughout, so nothing else can claim it meanwhile.
  * Writes lane2's config with the candidate's own generators (write_lane_env, write_functions_env,
    lane_yml): the same files a provision writes. lane2 is not an enabled lane, so no claim can reach it.
  * Five defect replays: the generated lane.yml with one of the 2026-11-24 defects put back. Each must fail
    on the defect it replays; the unmodified file must pass.
  * Running comparison: containers CREATED (never started) from a defective lane.yml, then the good file
    written back. The rendered check passes, the container check fails; recreated from the good file, it passes.
    Twice: once for env (Google off), once for structure (off the edge network, no host entry).
  * Tripwire: removing one real classification entry must fail, naming the path.
  * Always tears down: compose down, containers by name, networks, the lane directory. Never touches
    Caddy, the firewall or any other lane. Verifies lane2 is left as it was found.
  * lane1 is only read: its config file hashes and its auth/mail container ids and start times are
    recorded before and after, and must be unchanged.

Prints no secret: every line is a parity report line (public shapes only) or a fixed message.
Exit 0 = every expectation held. Exit 1 = at least one did not (each printed as NOT OK).
"""
import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
import sys

LANE = 'lane2'
results = []


def ok(cond, what):
    results.append(bool(cond))
    print(f'{"ok    " if cond else "NOT OK"} {what}', flush=True)


def sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def load_candidate(path):
    spec = importlib.util.spec_from_file_location('lanectl_candidate', path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def project_residue(lane):
    lab = f'label=com.docker.compose.project=cp-{lane}'
    out = []
    for kind, cmd in (('container', ['docker', 'ps', '-a', '-q', '--filter', lab]),
                      ('network', ['docker', 'network', 'ls', '-q', '--filter', lab]),
                      ('volume', ['docker', 'volume', 'ls', '-q', '--filter', lab])):
        p = sh(*cmd)
        if p.returncode != 0:   # an unreadable inventory is never an empty one (Codex 2)
            raise RuntimeError(f'docker {kind} list failed (exit {p.returncode}); cannot tell what cp-{lane} holds')
        out += [f'{kind} {x}' for x in p.stdout.split()]
    for svc in ('db', 'auth', 'rest', 'realtime', 'storage', 'meta', 'kong', 'mail', 'functions'):
        p = sh('docker', 'inspect', f'cp-{lane}-{svc}')
        if p.returncode == 0:
            out.append(f'container cp-{lane}-{svc}')
        elif 'no such object' not in (p.stderr or '').lower():
            raise RuntimeError(f'docker inspect cp-{lane}-{svc} failed (exit {p.returncode}) for a reason other than absence')
    return out


def lane1_fingerprint(m):
    d = m.ldir('lane1')
    fp = {f: hashlib.sha256((d / f).read_bytes()).hexdigest() for f in ('.env', 'lane.yml', 'functions.env')}
    for svc in ('auth', 'mail', 'kong', 'db', 'functions'):
        p = sh('docker', 'inspect', '-f', '{{.Id}} {{.State.StartedAt}} {{.State.Running}}', m.cname('lane1', svc))
        fp[svc] = p.stdout.strip()
    fp['state'] = json.dumps({k: m.load('lane1').get(k) for k in ('state', 'generation', 'quarantined')})
    return fp


def block(text, svc):
    """(start, end) of a top-level service block in a generated lane.yml."""
    s = text.index(f'\n  {svc}:\n') + 1
    nxt = re.search(r'\n  [a-z]+:\n', text[s + 1:])
    return s, (s + 1 + nxt.start() + 1) if nxt else len(text)


def in_block(text, svc, fn):
    s, e = block(text, svc)
    new = fn(text[s:e])
    return text[:s] + new + text[e:]


def drop_lines(pattern):
    def fn(b):
        out = re.sub(pattern, '', b, flags=re.M)
        assert out != b, f'defect replay removed nothing ({pattern})'   # a no-op replay would be a blind probe
        return out
    return fn


def google_disabled(b):
    """The lane as it was before af3868662: Google present but switched off, its client fields blank. A replay
    that deleted the keys would also fail on key presence alone, so it could not show the value is compared."""
    out = re.sub(r'^(      GOTRUE_EXTERNAL_GOOGLE_ENABLED: ).*$', r'\1"false"', b, flags=re.M)
    out = re.sub(r'^(      GOTRUE_EXTERNAL_GOOGLE_(?!ENABLED)[A-Z_]+: ).*$', r'\1""', out, flags=re.M)
    assert re.search(r'^      GOTRUE_EXTERNAL_GOOGLE_ENABLED: "false"$', out, flags=re.M) and out != b, \
        'defect replay changed nothing (Google)'
    return out


DEFECTS = [
    # (name, mutation of the generated lane.yml, a fragment the report must contain)
    ('Google sign-in off (before af3868662)',
     lambda t: in_block(t, 'auth', google_disabled),
     'GOTRUE_EXTERNAL_GOOGLE_ENABLED'),
    ('no production e-mail designs',
     lambda t: in_block(t, 'auth', drop_lines(r'^      GOTRUE_MAILER_TEMPLATES_[A-Z_]+: .*\n')),
     'GOTRUE_MAILER_TEMPLATES_MAGIC_LINK'),
    ('no founder-only relay',
     lambda t: in_block(t, 'mail', drop_lines(r'^      MP_SMTP_RELAY_[A-Z_]+: .*\n|^      # Same relay.*\n')),
     'MP_SMTP_RELAY_MATCHING'),
    ('auth and mail off the edge network',
     lambda t: in_block(in_block(t, 'auth', drop_lines(r'^      edge: \{\}\n')), 'mail', drop_lines(r'^      edge: \{\}\n')),
     'only on internal networks'),
    ('no host entry for the template URLs',
     lambda t: in_block(t, 'auth', drop_lines(r'^    extra_hosts:\n      - ".*"\n')),
     'no host entry'),
]


def main(cand_path):
    m = load_candidate(cand_path)
    print(f'candidate {cand_path} sha256 {hashlib.sha256(open(cand_path, "rb").read()).hexdigest()[:16]}')
    if LANE in m.ENABLED_LANES:
        print(f'REFUSED: {LANE} is an enabled lane; this proof only runs on a lane no claim can reach')
        return 1
    l1_before = lane1_fingerprint(m)
    with m.Lock(LANE, blocking=False):
        st = m.load(LANE)
        residue = project_residue(LANE)
        if st.get('state') != 'free' or m.ldir(LANE).exists() or residue:
            print(f'REFUSED: {LANE} is not empty (state {st.get("state")}, dir {m.ldir(LANE).exists()}, '
                  f'{len(residue)} docker object(s)); not touching it')
            return 1
        try:
            run_proof(m)
        except Exception as e:   # reported as a failed expectation; cleanup and both checks below still run
            ok(False, f'the proof ran to completion ({type(e).__name__}: {m.why_failed(e)})')
        # Each cleanup step runs whatever the one before it did (Codex round 5, finding 5).
        steps = []
        if (m.ldir(LANE) / 'lane.yml').exists() and (m.ldir(LANE) / '.env').exists():
            steps.append(('compose down', lambda: m.compose(LANE, 'down', '-v', '--remove-orphans', timeout=300, check=False)))
        steps += [(f'remove {svc}', lambda svc=svc: sh('docker', 'rm', '-f', m.cname(LANE, svc))) for svc in ('auth', 'mail')]
        steps += [(f'remove network {net}', lambda net=net: sh('docker', 'network', 'rm', f'cp-{LANE}_{net}'))
                  for net in ('default', 'edge')]
        steps.append(('remove the lane directory', lambda: shutil.rmtree(m.ldir(LANE), ignore_errors=True)))
        for what, step in steps:
            try:
                step()
            except Exception as e:
                print(f'   cleanup: {what} failed ({type(e).__name__}: {m.why_failed(e)})')
        try:
            left = project_residue(LANE)
        except Exception as e:
            ok(False, f'the docker inventory after cleanup could be read ({type(e).__name__}: {m.why_failed(e)})')
            left = ['unreadable']
        ok(not left and not m.ldir(LANE).exists() and m.load(LANE).get('state') == 'free',
           f'{LANE} left clean: free, no directory, no containers, networks or volumes ({len(left)} left)')
    l1_after = lane1_fingerprint(m)
    for k in l1_before:
        ok(l1_before[k] == l1_after[k], f'lane1 unchanged: {k}')
    print(f'{sum(results)} of {len(results)} expectations held')
    return 0 if all(results) else 1


def run_proof(m):
    host, ts_ip = m.ts_identity()
    d = m.ldir(LANE)
    d.mkdir(parents=True)
    import os
    os.chmod(d, 0o700)
    m.write_lane_env(LANE, host)
    m.write_functions_env(LANE)
    good = m.lane_yml(LANE, host, ts_ip)
    (d / 'ts_ip').write_text(ts_ip + '\n')
    yml = d / 'lane.yml'

    def report(text, **kw):
        yml.write_text(text)
        return m.parity_report(LANE, **kw)

    # Known good: the generator's own output.
    fails, _ = report(good, running=False, settings=False)
    for f in fails:
        print(f'   {f}')
    ok(not fails, f'known-good lane2 config passes the rendered check ({len(fails)} failure(s))')
    rendered = m.render_lane(LANE)['services']
    n = sum(len(rendered[s].get('environment') or {}) for s in m.PARITY_SERVICES)
    ok(n >= 40, f'the comparison saw real settings: {n} auth and mail env entries rendered')

    # The five defects of 2026-11-24, one at a time.
    for name, mutate, expect in DEFECTS:
        fails, _ = report(mutate(good), running=False, settings=False)
        hit = [f for f in fails if expect in f]
        for f in fails:
            print(f'   {f}')
        ok(hit, f'defect replay fails: {name} ({len(fails)} failure(s), {len(hit)} naming it)')

    # Running comparison: containers created from a defective file, then the good file written back.
    bad = DEFECTS[0][1](good)
    yml.write_text(bad)
    m.compose(LANE, 'up', '--no-start', '--no-deps', 'auth', 'mail', timeout=300)
    running = [sh('docker', 'inspect', '-f', '{{.State.Running}}', m.cname(LANE, s)).stdout.strip() for s in ('auth', 'mail')]
    ok(running == ['false', 'false'], f'lane2 containers were created, never started ({running})')
    yml.write_text(good)
    rfails, _ = m.parity_report(LANE, running=False, settings=False)
    ok(not rfails, f'with the good file back, the rendered check passes ({len(rfails)} failure(s))')
    full = m.render_lane(LANE)
    lane_r = full['services']
    drift = m.container_drift(lane_r['auth'], require_running=False, render=full)
    for f in drift:
        print(f'   {f}')
    ok(any('GOTRUE_EXTERNAL_GOOGLE' in f for f in drift),
       f'the container check fails on the auth container built from the defective file ({len(drift)} line(s))')
    m.compose(LANE, 'up', '--no-start', '--no-deps', '--force-recreate', 'auth', 'mail', timeout=300)
    drift = [f for s in ('auth', 'mail') for f in m.container_drift(lane_r[s], require_running=False, render=full)]
    for f in drift:
        print(f'   {f}')
    ok(not drift, f'recreated from the good file, the container check passes ({len(drift)} line(s))')

    # Structural drift at the container: lane.yml hand-fixed, container never recreated (review, Opus M3).
    # Created off the edge network and without the host entry, then the good file written back.
    yml.write_text(DEFECTS[4][1](DEFECTS[3][1](good)))
    m.compose(LANE, 'up', '--no-start', '--no-deps', '--force-recreate', 'auth', 'mail', timeout=300)
    yml.write_text(good)
    drift = [f for s in ('auth', 'mail') for f in m.container_drift(lane_r[s], require_running=False, render=full)]
    for f in drift:
        print(f'   {f}')
    ok(any('auth' in f and 'attached to networks' in f for f in drift) and
       any('mail' in f and 'attached to networks' in f for f in drift) and
       any('auth' in f and 'host entries differ' in f for f in drift),
       f'the container check fails on containers still off the edge network and without the host entry ({len(drift)} line(s))')
    m.compose(LANE, 'up', '--no-start', '--no-deps', '--force-recreate', 'auth', 'mail', timeout=300)
    drift = [f for s in ('auth', 'mail') for f in m.container_drift(lane_r[s], require_running=False, render=full)]
    ok(not drift, f'recreated again from the good file, the container check passes ({len(drift)} line(s))')
    running = [sh('docker', 'inspect', '-f', '{{.State.Running}}', m.cname(LANE, s)).stdout.strip() for s in ('auth', 'mail')]
    ok(running == ['false', 'false'], f'lane2 containers still never started ({running})')

    # Tripwire: one real classification entry removed.
    saved = m.OVERRIDE_CLASSIFIED.pop('caddy.image')
    try:
        fails, _ = m.parity_report(LANE, running=False, settings=False)
    finally:
        m.OVERRIDE_CLASSIFIED['caddy.image'] = saved
    ok(any('tripwire' in f and 'caddy.image' in f for f in fails),
       f'tripwire fails with the caddy.image classification removed ({len(fails)} failure(s))')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
