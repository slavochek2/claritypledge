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

# 3. P1552: the tokens block, reduced from invented rows (pure function, fixed "today")
import importlib.util
spec = importlib.util.spec_from_file_location('tur', SCRIPT)
tur = importlib.util.module_from_spec(spec); spec.loader.exec_module(tur)
T = datetime.date(2026, 10, 23)  # a Friday; the current week (Mon 2026-10-19) and month are incomplete
def row(day, tool, model, project, out, inp=10, cw=0, cr=90, msgs=2):
    return dict(day=day, tool=tool, model=model, project=project, input=inp, output=out, cache_write=cw, cache_read=cr, messages=msgs)
rows = [row('2026-09-28', 'claude', 'claude-opus-5', 'alpha', 100), row('2026-10-05', 'claude', 'claude-opus-5', 'alpha', 100),
        row('2026-10-06', 'claude', 'claude-sonnet-5', 'beta', 50), row('2026-10-12', 'claude', 'claude-opus-5', 'alpha', 300),
        row('2026-10-13', 'codex', 'gpt-x', 'beta', 40, inp=100, cr=0, msgs=1), row('2026-10-22', 'claude', 'claude-opus-5', 'alpha', 999)]
b = tur.reduce_tokens(rows, T)
wk = {w['p']: w for w in b['weeks']}
check('block: collected, as_of is the latest log day', b['collected'] is True and b['as_of'] == '2026-10-22', b['as_of'])
check('block: current incomplete week/month left out', '2026-10-19' not in wk and all(m['p'] != '2026-10' for m in b['months']), list(wk))
check('block: week output split by family, codex separate', wk['2026-10-12']['output'] == {'Opus': 300, 'Codex': 40}, wk.get('2026-10-12'))
gap = {w['p']: w for w in tur.reduce_tokens(rows + [row('2026-08-03', 'claude', 'claude-opus-5', 'a', 1)], T)['weeks']}
check('block: week with no usage is a zero row, not a gap', gap['2026-08-31']['output'] == {} and gap['2026-08-31']['days'] == {'claude': 0, 'codex': 0}, gap.get('2026-08-31'))
check('block: days in use counted per tool', wk['2026-10-12']['days'] == {'claude': 1, 'codex': 1}, wk['2026-10-12']['days'])
check('block: ctx per reply is Claude only ((10+90)/2 msgs = 50)', wk['2026-10-05'].get('ctx_per_reply') == 50 and wk['2026-10-12']['ctx_per_reply'] == 50, wk['2026-10-12'])
check('block: median4 absent with fewer than two earlier periods', 'median4' not in b['weeks'][0] and 'median4' not in b['weeks'][1], b['weeks'][:2])
check('block: median4 is the median of earlier weeks (100, 150 -> 125 before 10-12)', wk['2026-10-12'].get('median4') == 125, wk['2026-10-12'])
check('block: months list completed months only', [m['p'] for m in b['months']] == ['2026-09'], b['months'])
pj = {x['project']: x for x in b['projects_28d']}
check('block: 28-day projects ranked with shares', [x['project'] for x in b['projects_28d']] == ['alpha', 'beta'] and abs(sum(x['share'] for x in b['projects_28d']) - 1) < 1e-3, b['projects_28d'])
check('block: 28-day window excludes older days', pj['alpha']['output'] == 100 + 100 + 300 + 999 and 'old' not in pj and tur.reduce_tokens(rows + [row('2026-09-01', 'claude', 'claude-opus-5', 'old', 5)], T)['projects_28d'][-1]['project'] != 'old', pj)
many = [row('2026-10-%02d' % (i + 1), 'claude', 'claude-opus-5', 'p%d' % i, 100 + i) for i in range(11)]
mp = tur.reduce_tokens(many, T)['projects_28d']
check('block: top 5 plus "all others"', len(mp) == 6 and mp[-1]['project'] == 'all others' and mp[0]['project'] == 'p10', [x['project'] for x in mp])
check('block: no rows gives collected true with empty lists', tur.reduce_tokens([], T)['weeks'] == [], '')
check('block: unknown claude model lands in Other', tur.family_of('claude', 'claude-mystery') == 'Other' and tur.family_of('claude', 'claude-fable-5-1') == 'Fable', '')
with tempfile.TemporaryDirectory() as h:
    write(h + '/.claude/projects/-Users-x-Projects-public-demo/s1.jsonl', [claude_line('m1', 'r1', 5)])
    rc, out = run(h)
    blk = json.load(open(os.path.join(h, '.claude', '.token-usage-out', 'tokens-block.json')))
    check('script writes tokens-block.json next to the daily file', rc == 0 and blk['collected'] is True and blk['as_of'] == D1, blk)

# 4. P1552 round 2: Gemini calls from the delegation log (synthetic lines only)
def gem(ts, extra='vendor=gemini', end='gemini-send'):
    return '=== %s | pid=1 | %s | model=gemini-x | cwd=/work/demo | bytes=10 | sha=abc | %s' % (ts, extra, end)
with tempfile.TemporaryDirectory() as h:
    lg = h + '/delegation.log'
    write(lg, [gem(D1 + 'T10:00:00Z'), gem(D1 + 'T11:00:00Z'), gem(D2 + 'T10:00:00Z'),
               gem(D1 + 'T12:00:00Z', end='REFUSED:SECRET'),                     # blocked by the scan: not a call
               gem(D1 + 'T12:30:00Z', extra='vendor=codex', end='codex-run'),    # another vendor
               'payload line that is not a record, vendor=gemini | gemini-send',  # no "=== " prefix
               gem('garbage')])                                                   # no usable day
    g = tur.parse_gemini_calls(lg)
    check('gemini: counts sent calls per day, skipping REFUSED, other vendors, payload lines and bad days', g == {D1: 2, D2: 1}, g)
    check('gemini: a missing log is None, not an empty dict', tur.parse_gemini_calls(h + '/nope.log') is None, '')
    gb = tur.reduce_tokens(rows, T, {'2026-10-06': 3, '2026-10-12': 1, '2026-10-13': 2})
    gw = {w['p']: w for w in gb['weeks']}
    check('gemini: calls and days per week; a week without calls is 0', gw['2026-10-05']['gemini_calls'] == 3 and gw['2026-10-12']['gemini_calls'] == 3 and gw['2026-10-12']['days']['gemini'] == 2 and gw['2026-09-28']['gemini_calls'] == 0, gw['2026-10-12'])
    check('gemini: never in the output bars', all('Gemini' not in w['output'] for w in gb['weeks'] + gb['months']), '')
    nb = {w['p']: w for w in tur.reduce_tokens(rows, T, None)['weeks']}
    check('gemini: absent (not 0) when the log is missing', 'gemini_calls' not in nb['2026-10-12'] and 'gemini' not in nb['2026-10-12']['days'], nb['2026-10-12'])
with tempfile.TemporaryDirectory() as h:  # end to end through the script, fake HOME
    write(h + '/.claude/projects/-Users-x-Projects-public-demo/s1.jsonl', [claude_line('m1', 'r1', 5)])
    write(h + '/.agents/logs/delegation.log', [gem(D1 + 'T10:00:00Z')])
    rc, out = run(h)
    blk = json.load(open(os.path.join(h, '.claude', '.token-usage-out', 'tokens-block.json')))
    check('gemini: the script reads HOME/.agents/logs/delegation.log into the block', rc == 0 and sum(w.get('gemini_calls', 0) for w in blk['weeks']) == 1, blk['weeks'][-2:])

print('\n%d failed' % len(failures) if failures else '\nall passed')
sys.exit(1 if failures else 0)
