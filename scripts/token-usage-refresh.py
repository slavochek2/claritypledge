#!/usr/bin/env python3
"""Aggregate local Claude Code + Codex token usage into the two files the token dashboard reads.

Zero model tokens: plain log parsing. Incremental: a SQLite cache keeps one row per assistant
message, and only log files whose size or mtime changed are re-read.

Usage: token-usage-refresh.py OUT_DIR
Writes OUT_DIR/token-usage-daily.json (day x tool x model x project) and OUT_DIR/quota.json,
then prints one summary line for the weekly report.
"""
import glob, json, os, re, sqlite3, statistics, sys, datetime

HOME = os.path.expanduser('~')
CACHE = os.path.join(HOME, '.claude', '.token-usage-cache.db')


def project_from_claude_dir(d):
    d = re.sub(r'--claude-worktrees-.*$', '', d)
    m = re.search(r'Projects-(?:public|private)-(.+)$', d)
    return m.group(1) if m else (re.sub(r'^-Users-[^-]+-?', '', d) or 'home')


def parse_claude(path, project):
    best = {}
    for line in open(path, errors='replace'):
        if '"usage"' not in line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        m = d.get('message')
        if not isinstance(m, dict) or 'usage' not in m or not d.get('timestamp'):
            continue
        model = m.get('model', '?')
        if model == '<synthetic>':
            continue
        u = m['usage']
        key = '%s|%s' % (m.get('id') or d.get('uuid'), d.get('requestId'))
        out = u.get('output_tokens') or 0
        if key not in best or out >= best[key][4]:
            best[key] = (key, d['timestamp'][:10], model, project, out,
                         u.get('input_tokens') or 0, u.get('cache_creation_input_tokens') or 0,
                         u.get('cache_read_input_tokens') or 0)
    return [('claude',) + v for v in best.values()]


def parse_codex(path):
    cwd, model, last, rows = '', 'codex', None, []
    for n, line in enumerate(open(path, errors='replace')):
        if '"session_meta"' in line and not cwd:
            try:
                cwd = json.loads(line)['payload'].get('cwd', '')
            except (ValueError, KeyError):
                pass
        elif '"turn_context"' in line:
            try:
                model = json.loads(line)['payload'].get('model') or model
            except (ValueError, KeyError):
                pass
        elif '"token_count"' in line:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            info = (d.get('payload') or {}).get('info')
            if not info:
                continue
            tot = (info.get('total_token_usage') or {}).get('total_tokens')
            if tot is None or tot == last:
                continue
            last = tot
            l = info.get('last_token_usage') or {}
            inp, cached = l.get('input_tokens') or 0, l.get('cached_input_tokens') or 0
            proj = 'codex-review' if ('codex-review' in cwd or not cwd) else (
                os.path.basename(re.sub(r'/\.claude/worktrees/.*$', '', cwd)) or 'home')
            rows.append(('codex', '%s#%d' % (path, n), d['timestamp'][:10], model, proj,
                         l.get('output_tokens') or 0, max(0, inp - cached), 0, cached))
    return rows


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    db = sqlite3.connect(CACHE)
    db.executescript('''
        CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, sig TEXT);
        CREATE TABLE IF NOT EXISTS msgs(path TEXT, tool TEXT, key TEXT, day TEXT, model TEXT,
            project TEXT, out INT, inp INT, cw INT, cr INT);
        CREATE INDEX IF NOT EXISTS msgs_path ON msgs(path);
        CREATE INDEX IF NOT EXISTS msgs_key ON msgs(tool, key);''')
    known = dict(db.execute('SELECT path, sig FROM files'))
    seen, reread = set(), 0
    sources = [(p, 'claude') for p in glob.glob(HOME + '/.claude/projects/**/*.jsonl', recursive=True)]
    sources += [(p, 'codex') for p in glob.glob(HOME + '/.codex/sessions/**/*.jsonl', recursive=True)]
    for path, tool in sources:
        seen.add(path)
        st = os.stat(path)
        sig = '%d:%d' % (st.st_size, int(st.st_mtime))
        if known.get(path) == sig:
            continue
        reread += 1
        rel = os.path.relpath(path, HOME + '/.claude/projects') if tool == 'claude' else ''
        rows = parse_claude(path, project_from_claude_dir(rel.split('/')[0])) if tool == 'claude' else parse_codex(path)
        db.execute('DELETE FROM msgs WHERE path=?', (path,))
        db.executemany('INSERT INTO msgs VALUES (?,?,?,?,?,?,?,?,?,?)',
                       [(path, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]) for r in rows])
        db.execute('INSERT OR REPLACE INTO files VALUES (?,?)', (path, sig))
    for gone in set(known) - seen:
        pass  # keep cached usage of deleted logs: the tokens were still spent
    db.commit()

    # One row per message across files (a resumed session repeats earlier messages).
    cur = db.execute('''
        SELECT day, tool, model, project, SUM(inp), SUM(out), SUM(cw), SUM(cr), COUNT(*) FROM (
            SELECT * FROM msgs m WHERE m.rowid = (
                SELECT m2.rowid FROM msgs m2 WHERE m2.tool=m.tool AND m2.key=m.key
                ORDER BY m2.out DESC, m2.rowid LIMIT 1))
        GROUP BY day, tool, model, project ORDER BY day, tool, model, project''')
    rows = [dict(day=r[0], tool=r[1], model=r[2], project=r[3], input=r[4], output=r[5],
                 cache_write=r[6], cache_read=r[7], messages=r[8]) for r in cur]
    json.dump(rows, open(os.path.join(out_dir, 'token-usage-daily.json'), 'w'), separators=(',', ':'))

    quota = []
    try:
        q = json.load(open(os.path.join(HOME, '.claude', '.quota-cache.json')))
        quota = [{'window': '5-hour', 'used_pct': q['five_hour_pct']}, {'window': '7-day', 'used_pct': q['seven_day_pct']}]
    except (OSError, ValueError, KeyError):
        pass
    json.dump(quota, open(os.path.join(out_dir, 'quota.json'), 'w'))

    # Summary: last completed Mon-Sun week vs the median of the four weeks before it.
    latest = max(r['day'] for r in rows)
    mon = lambda s: (datetime.date.fromisoformat(s) - datetime.timedelta(days=datetime.date.fromisoformat(s).weekday()))
    last_mon = mon(latest)
    if latest < (last_mon + datetime.timedelta(days=6)).isoformat():
        last_mon -= datetime.timedelta(days=7)
    wk = {}
    for r in rows:
        wk[mon(r['day'])] = wk.get(mon(r['day']), 0) + r['output']
    cur_out = wk.get(last_mon, 0)
    prev = [wk.get(last_mon - datetime.timedelta(days=7 * i), 0) for i in range(1, 5)]
    med = statistics.median(prev)
    delta = ('%+.0f%%' % ((cur_out / med - 1) * 100)) if med else 'n/a'
    q7 = next((x['used_pct'] for x in quota if x['window'] == '7-day'), 'n/a')
    print('Token usage: week of %s wrote %.1fM output tokens, %s vs your 4-week median; weekly quota %s%%. '
          '(%d log files re-read, %d rows)' % (last_mon, cur_out / 1e6, delta, q7, reread, len(rows)))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
