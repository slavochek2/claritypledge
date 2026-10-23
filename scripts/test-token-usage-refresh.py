#!/usr/bin/env python3
"""Hermetic test for scripts/token-usage-refresh.py: fake HOME, synthetic logs, nothing real is read.

Run: python3 scripts/test-token-usage-refresh.py   (exit 0 = all pass)
"""
import datetime, json, os, subprocess, sys, tempfile

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'token-usage-refresh.py')
SCRIPT = os.environ.get('TOKEN_USAGE_SCRIPT', SCRIPT)  # lets a test point at an older copy to prove the test can fail
today = datetime.datetime.now(datetime.timezone.utc).date()  # the script buckets and anchors on UTC days
last_mon = today - datetime.timedelta(days=today.weekday()) - datetime.timedelta(days=7)
D1 = (last_mon + datetime.timedelta(days=1)).isoformat()
D2 = (last_mon + datetime.timedelta(days=2)).isoformat()


def run(home):
    env = dict(os.environ, HOME=home)
    p = subprocess.run([sys.executable, SCRIPT], env=env, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def totals(home):
    rows = json.load(open(os.path.join(home, '.claude', '.token-usage-out', 'token-usage-daily.json')))
    t = {}
    for r in rows:
        a = t.setdefault(r['tool'], {'output': 0, 'messages': 0})
        a['output'] += r['output']; a['messages'] += r['messages']
    return t


def claude_line(mid, req, out, day=D1, usage='ok'):
    u = {'input_tokens': 1, 'output_tokens': out, 'cache_creation_input_tokens': 0, 'cache_read_input_tokens': 5} if usage == 'ok' else None
    return json.dumps({'timestamp': day + 'T10:00:00.000Z', 'requestId': req,
                       'message': {'id': mid, 'model': 'claude-opus-5', 'usage': u}})


def codex_meta():
    return json.dumps({'type': 'session_meta', 'payload': {'cwd': '/work/demo'}})


def codex_event(ts, total, out):
    return json.dumps({'timestamp': ts, 'type': 'event_msg', 'payload': {'type': 'token_count', 'info': {
        'total_token_usage': {'total_tokens': total},
        'last_token_usage': {'input_tokens': 100, 'cached_input_tokens': 40, 'output_tokens': out}}}})


def write(path, lines):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w').write('\n'.join(lines) + '\n')


failures = []
def check(name, cond, detail=''):
    print(('PASS  ' if cond else 'FAIL  ') + name + ('' if cond else '  ' + str(detail)))
    if not cond:
        failures.append(name)


# 1. fresh machine with no logs and no ~/.claude: no crash, cache dir created
with tempfile.TemporaryDirectory() as h:
    rc, out = run(h)
    check('empty home exits 0 and says no usage', rc == 0 and 'no usage found' in out, out[-300:])
    check('cache dir created when ~/.claude is missing', os.path.exists(os.path.join(h, '.claude', '.token-usage-cache.db')))

# 2. dedup, bad lines, replay, incremental
with tempfile.TemporaryDirectory() as h:
    proj = h + '/.claude/projects/-Users-x-Projects-public-demo/'
    write(proj + 's1.jsonl', [claude_line('m1', 'r1', 5), claude_line('m1', 'r1', 10), claude_line('m2', 'r2', 20),
                              '{not json', claude_line('m3', 'r3', 0, usage=None), '["usage"]', claude_line('m4', 'r4', 3, day=''),
                              claude_line('m5', 'r5', 4, day='2026-99-99')])  # impossible calendar date
    write(proj + 's2.jsonl', [claude_line('m1', 'r1', 10)])  # resumed session repeats m1
    SEC = 1_700_000_000 * 10**9
    os.utime(proj + 's2.jsonl', ns=(SEC + 100_000_000, SEC + 100_000_000))  # x.1 s, so a whole-second compare cannot tell x.9 s apart
    write(h + '/.codex/sessions/2026/c.jsonl', [codex_meta(), codex_event(D2 + 'T12:00:00.000Z', 300, 7),
                                                 json.dumps({'timestamp': D2 + 'T12:30:00.000Z', 'payload': {'type': 'token_count', 'info': {
                                                     'total_token_usage': {'total_tokens': 350}, 'last_token_usage': None}}}),
                                                 codex_event(D2 + 'T13:00:00.000Z', 400, 3)])  # null usage between two good events
    write(h + '/.codex/sessions/2026/a.jsonl', [codex_meta(), codex_event(D1 + 'T11:00:00.000Z', 100, 7)])
    write(h + '/.codex/sessions/2026/b.jsonl', [codex_meta(), codex_event(D1 + 'T11:00:00.000Z', 100, 7),
                                                 codex_event(D2 + 'T11:00:00.000Z', 200, 3)])  # replay + one new event
    rc, out = run(h)
    t = totals(h) if rc == 0 else {}
    check('odd/malformed lines do not abort the run', rc == 0, out[-400:])
    check('claude message streamed twice and resumed in another file counts once (10 + 20)', t.get('claude', {}).get('output') == 30, t)
    check('codex event replayed in a second file counts once, null-usage event skipped, neighbours kept (7 + 3 + 7 + 3)', t.get('codex', {}).get('output') == 20, t)
    check('summary names the last completed week', 'week of %s' % last_mon in out, out)
    rc, out = run(h)
    check('second run re-reads nothing', '(0 log files re-read' in out, out)
    # same-size rewrite inside the same wall-clock second (x.1 s then x.9 s) must still be noticed
    p = proj + 's2.jsonl'
    write(p, [claude_line('m9', 'r9', 11)])
    os.utime(p, ns=(SEC + 900_000_000, SEC + 900_000_000))
    rc, out = run(h)
    check('a changed file is re-read', '(1 log files re-read' in out, out)
    check('changed file adds its new message (30 + 11)', totals(h)['claude']['output'] == 41, totals(h))

print('\n%d failed' % len(failures) if failures else '\nall passed')
sys.exit(1 if failures else 0)
