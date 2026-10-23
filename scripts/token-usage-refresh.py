#!/usr/bin/env python3
"""Aggregate local Claude Code + Codex token usage into the two files the token dashboard reads.

Zero model tokens: plain log parsing. Incremental: a SQLite cache keeps one row per assistant
message, and only log files whose size or mtime changed are re-read.

Usage: token-usage-refresh.py [OUT_DIR]      (default OUT_DIR: ~/.claude/.token-usage-out)
Writes OUT_DIR/token-usage-daily.json (day x tool x model x project) and OUT_DIR/quota.json, then
prints the TOKENS summary line for the weekly report and a "Files:" line naming OUT_DIR.

Days are UTC dates taken from the log timestamps. Known limits: Codex sessions in
~/.codex/archived_sessions are not read; Claude.ai chats and API keys used by projects are not logs.
"""
import datetime, glob, json, os, re, sqlite3, statistics, sys

HOME = os.path.expanduser('~')
CACHE = os.path.join(HOME, '.claude', '.token-usage-cache.db')
DEFAULT_OUT = os.path.join(HOME, '.claude', '.token-usage-out')
PARSER_VERSION = 3  # bump when parse logic changes so unchanged files are re-read


def day_of(ts):
    """UTC date prefix of an ISO timestamp, or None when the value is not one."""
    if isinstance(ts, str) and re.match(r'\d{4}-\d{2}-\d{2}', ts):
        try:
            datetime.date.fromisoformat(ts[:10])  # rejects 2026-99-99, which would later crash the summary
            return ts[:10]
        except ValueError:
            pass
    return None


def project_from_claude_dir(d):
    d = re.sub(r'--claude-worktrees-.*$', '', d)
    m = re.search(r'Projects-(?:public|private)-(.+)$', d)
    return m.group(1) if m else (re.sub(r'^-Users-[^-]+-?', '', d) or 'home')


def parse_claude(path, project):
    best = {}
    for n, line in enumerate(open(path, errors='replace')):
        if '"usage"' not in line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        m = d.get('message') if isinstance(d, dict) else None
        if not isinstance(m, dict) or not isinstance(m.get('usage'), dict):
            continue
        day = day_of(d.get('timestamp'))
        if not day:
            continue
        model = m.get('model') or '?'
        if model == '<synthetic>':
            continue
        u = m['usage']
        ident = m.get('id') or d.get('uuid')
        key = '%s|%s' % (ident, d.get('requestId')) if ident else '%s#%d' % (path, n)
        out = u.get('output_tokens') or 0
        if key not in best or out >= best[key][4]:
            best[key] = (key, day, model, project, out, u.get('input_tokens') or 0,
                         u.get('cache_creation_input_tokens') or 0, u.get('cache_read_input_tokens') or 0)
    return [('claude',) + v for v in best.values()]


def parse_codex(path):
    cwd, model, last, rows = '', 'codex', None, []
    for line in open(path, errors='replace'):
        if '"session_meta"' in line and not cwd:
            try:
                cwd = json.loads(line)['payload'].get('cwd', '') or ''
            except (ValueError, KeyError, AttributeError, TypeError):
                pass
        elif '"turn_context"' in line:
            try:
                model = json.loads(line)['payload'].get('model') or model
            except (ValueError, KeyError, AttributeError, TypeError):
                pass
        elif '"token_count"' in line:
            try:
                d = json.loads(line)
                info = d['payload']['info']
                tot = info['total_token_usage']['total_tokens']
                l = info['last_token_usage']
                ts = d['timestamp']
            except (ValueError, KeyError, TypeError):
                continue
            if not isinstance(l, dict):  # one odd event must not discard the file's good neighbours
                continue
            if not day_of(ts) or tot is None or tot == last:
                continue
            last = tot
            inp, cached = l.get('input_tokens') or 0, l.get('cached_input_tokens') or 0
            proj = 'codex-review' if ('codex-review' in cwd or not cwd) else (
                os.path.basename(re.sub(r'/\.claude/worktrees/.*$', '', cwd)) or 'home')
            # A resumed session replays earlier events into a new file; timestamp + running total identify one.
            rows.append(('codex', '%s|%s' % (ts, tot), ts[:10], model, proj,
                         l.get('output_tokens') or 0, max(0, inp - cached), 0, cached))
    return rows


def write_json(path, obj):
    tmp = '%s.%d.tmp' % (path, os.getpid())  # unique per run, so two concurrent runs cannot collide
    with open(tmp, 'w') as f:
        json.dump(obj, f, separators=(',', ':'))
    os.replace(tmp, path)


def main(out_dir):
    os.makedirs(out_dir, mode=0o700, exist_ok=True)
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    db = sqlite3.connect(CACHE, timeout=60)
    db.executescript('''
        CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, sig TEXT);
        CREATE TABLE IF NOT EXISTS msgs(path TEXT, tool TEXT, key TEXT, day TEXT, model TEXT,
            project TEXT, out INT, inp INT, cw INT, cr INT);
        CREATE INDEX IF NOT EXISTS msgs_path ON msgs(path);
        CREATE INDEX IF NOT EXISTS msgs_key ON msgs(tool, key);''')
    known = dict(db.execute('SELECT path, sig FROM files'))
    reread = skipped = 0
    sources = [(p, 'claude') for p in glob.glob(HOME + '/.claude/projects/**/*.jsonl', recursive=True)]
    sources += [(p, 'codex') for p in glob.glob(HOME + '/.codex/sessions/**/*.jsonl', recursive=True)]
    for path, tool in sources:
        try:
            st = os.stat(path)
            sig = '%d:%d:%d' % (PARSER_VERSION, st.st_size, st.st_mtime_ns)
            if known.get(path) == sig:
                continue
            if tool == 'claude':
                rel = os.path.relpath(path, HOME + '/.claude/projects')
                rows = parse_claude(path, project_from_claude_dir(rel.split('/')[0]))
            else:
                rows = parse_codex(path)
        except Exception:  # a vanished or odd file must not abort the run; its usage is picked up next time
            skipped += 1
            continue
        reread += 1
        db.execute('DELETE FROM msgs WHERE path=?', (path,))
        db.executemany('INSERT INTO msgs VALUES (?,?,?,?,?,?,?,?,?,?)',
                       [(path,) + tuple(r) for r in rows])
        db.execute('INSERT OR REPLACE INTO files VALUES (?,?)', (path, sig))
        if reread % 500 == 0:
            db.commit()  # a later crash keeps the work done so far
    db.commit()  # usage of logs deleted since is kept on purpose: those tokens were still spent

    # One row per message across files (a resumed session repeats earlier messages).
    cur = db.execute('''
        SELECT day, tool, model, project, SUM(inp), SUM(out), SUM(cw), SUM(cr), COUNT(*) FROM (
            SELECT * FROM msgs m WHERE m.rowid = (
                SELECT m2.rowid FROM msgs m2 WHERE m2.tool=m.tool AND m2.key=m.key
                ORDER BY m2.out DESC, m2.path, m2.rowid LIMIT 1))
        GROUP BY day, tool, model, project ORDER BY day, tool, model, project''')
    rows = [dict(day=r[0], tool=r[1], model=r[2], project=r[3], input=r[4], output=r[5],
                 cache_write=r[6], cache_read=r[7], messages=r[8]) for r in cur]
    write_json(os.path.join(out_dir, 'token-usage-daily.json'), rows)

    quota = []
    try:
        q = json.load(open(os.path.join(HOME, '.claude', '.quota-cache.json')))
        quota = [{'window': '5-hour', 'used_pct': q['five_hour_pct']}, {'window': '7-day', 'used_pct': q['seven_day_pct']}]
    except (OSError, ValueError, KeyError, TypeError):
        pass
    write_json(os.path.join(out_dir, 'quota.json'), quota)
    q7 = next((x['used_pct'] for x in quota if x['window'] == '7-day'), None)
    quota_txt = ('%s%%' % q7) if q7 is not None else 'n/a'
    note = '(%d log files re-read%s, %d rows)' % (reread, ', %d skipped' % skipped if skipped else '', len(rows))

    if not rows:
        print('TOKENS:       no usage found in the local logs yet %s' % note)
    else:
        # Last completed Mon-Sun week (the week before the current one) vs the median of the four before it.
        mon = lambda d: d - datetime.timedelta(days=d.weekday())
        first_mon = mon(datetime.date.fromisoformat(min(r['day'] for r in rows)))
        last_mon = mon(datetime.datetime.now(datetime.timezone.utc).date()) - datetime.timedelta(days=7)  # UTC, like the log days
        wk = {}
        for r in rows:
            m = mon(datetime.date.fromisoformat(r['day']))
            wk[m] = wk.get(m, 0) + r['output']
        cur_out = wk.get(last_mon, 0)
        prev = [wk.get(last_mon - datetime.timedelta(days=7 * i), 0) for i in range(1, 5)
                if last_mon - datetime.timedelta(days=7 * i) >= first_mon]
        delta = ('%+.0f%% vs your median of the %d weeks before' % ((cur_out / statistics.median(prev) - 1) * 100, len(prev))
                 if len(prev) >= 2 and statistics.median(prev) else 'no baseline yet')
        print('TOKENS:       week of %s wrote %.1fM output tokens, %s; weekly quota %s. %s'
              % (last_mon, cur_out / 1e6, delta, quota_txt, note))
    print('Files:        %s' % out_dir)


if __name__ == '__main__':
    if len(sys.argv) > 2:
        sys.exit(__doc__)
    main(sys.argv[1] if len(sys.argv) == 2 else DEFAULT_OUT)
