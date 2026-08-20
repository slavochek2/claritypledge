#!/usr/bin/env python3
"""P1127 phase 1 reproducer (v4 - adds the third invocation channel) — /pick-flow invocation frame, seeded draw, and statistics.

Usage:  python3 20260820-p1127-pickflow-frame.py [events.jsonl]

Reads the local Claude Code transcripts under ~/.claude/projects/*claritypledge*/*.jsonl
(20 project directories; only the main one carries founder invocations — the two worktree
project dirs contain the string in `attachment` lines only, i.e. injected context).

FRAME (structural, not prose-heuristic). An invocation EVENT is either:
  (A) founder channel — a user line that is NOT isSidechain, NOT isMeta, whose
      promptSource is not in {sdk, system}, whose text still contains /pick-flow after
      injected wrappers are stripped, and which is not a compaction summary or a
      <teammate-message>; or
  (B) skill channel — an assistant tool_use of Skill{skill: slava:build:pick-flow}.
Events <=6 lines apart in one file merge (a founder turn causes a Skill call).

WHY THESE FILTERS. `isMeta: true` marks injected skill bodies; `promptSource: "sdk"` marks
agent-authored prompts; compaction summaries and teammate messages arrive as ordinary user
turns. `isSidechain` is a NO-OP on this corpus (zero sidechain lines carry the string).
`entrypoint` MUST NOT be used as a filter — it is absent in pre-March transcripts, and
filtering on it silently deletes the entire February corpus.

SAMPLE: random.Random(1127).sample(pool, 50) over events that have a genuine founder reply,
pool sorted by (ts, file, idx) so the draw is deterministic across runs and machines.
"""
import json, glob, os, re, sys, random, math
from math import comb
from collections import Counter

DIRS = sorted(glob.glob(os.path.expanduser('~/.claude/projects/*claritypledge*')))
PICK = re.compile(r'/pick[- ]flow', re.I)
STRIP = re.compile(
    r'<system-reminder>.*?</system-reminder>'
    r'|<task-notification>.*?</task-notification>'
    r'|<local-command-stdout>.*?</local-command-stdout>'
    r'|<command-message>.*?</command-message>'
    r'|<command-name>.*?</command-name>', re.S)
HOOKCTX = re.compile(r'\n?[A-Za-z ]*hook additional context:.*$', re.S)
NOT_FOUNDER = (
    'This session is being continued from a previous conversation',
    'Another Claude session sent a message:',
    'Base directory for this skill:',
    'Caveat: The messages below were generated',
)

def text_of(msg):
    c = msg.get('content')
    if isinstance(c, str): return c
    if isinstance(c, list):
        return '\n'.join(b.get('text','') for b in c
                         if isinstance(b, dict) and b.get('type') == 'text')
    return ''

def founder_text(o):
    if o.get('type') != 'user': return None
    if o.get('isSidechain'): return None
    if o.get('isMeta') is True: return None
    if o.get('promptSource') in ('sdk', 'system'): return None
    t = text_of(o.get('message', {}))
    if not t: return None
    t = HOOKCTX.sub('', STRIP.sub('', t)).strip()
    if not t: return None
    for bad in NOT_FOUNDER:
        if t.startswith(bad) or bad in t[:400]: return None
    if t.startswith('# /') or '**Announce at start:**' in t[:600]: return None
    return t

ARTIFACT = re.compile(r'^\s*(\[Request interrupted[^\]]*\]|Tool loaded\.|API Error[:\s].*|\[Tool use was rejected\][\s\S]*)\s*$')
def is_artifact(t):
    """System-emitted text that occupies a user turn but is not the founder replying."""
    return bool(ARTIFACT.match(t or ''))

def assistant_text(o):
    m = o.get('message', {}); c = m.get('content')
    if not isinstance(c, list): return ''
    return '\n'.join(b.get('text','') for b in c
                     if isinstance(b, dict) and b.get('type') == 'text')

NAMESPACED = '<command-name>/slava:build:pick-flow</command-name>'
def namespaced_invocation(o):
    """Channel C: the founder typed the FULL-NAMESPACE form `/slava:build:pick-flow`.

    This is a THIRD invocation channel; the spec named only two. It is invisible to a
    `/pick[- ]flow` regex (the string is `/slava:build:pick-flow`, which has no `/pick`)
    AND to wrapper-stripping (the name lives inside the <command-name> tag that gets
    stripped). Missing it drops 106 of 471 events - 22% of the corpus."""
    if o.get('type') != 'user' or o.get('isSidechain') or o.get('isMeta') is True:
        return False
    c = o.get('message', {}).get('content')
    return NAMESPACED in (c if isinstance(c, str) else json.dumps(c))

def skill_invocation(o):
    if o.get('type') != 'assistant' or o.get('isSidechain'): return False
    c = o.get('message', {}).get('content')
    if not isinstance(c, list): return False
    for b in c:
        if isinstance(b, dict) and b.get('type') == 'tool_use' and b.get('name') == 'Skill':
            if 'pick-flow' in json.dumps(b.get('input', {})): return True
    return False

def main():
    events = []
    for d in DIRS:
        for p in sorted(glob.glob(os.path.join(d, '*.jsonl'))):
            lines = []
            for raw in open(p, errors='replace'):
                try: lines.append(json.loads(raw))
                except Exception: lines.append(None)
            raw_ev = []
            for i, o in enumerate(lines):
                if o is None: continue
                ft = founder_text(o)
                if ft and PICK.search(ft):
                    raw_ev.append((i, 'founder', ft, o))
                elif namespaced_invocation(o):
                    raw_ev.append((i, 'namespaced', '/slava:build:pick-flow', o))
                elif skill_invocation(o):
                    raw_ev.append((i, 'skill', '', o))
            # merge: a founder event followed within 6 lines by a skill event = one event
            merged = []
            for e in raw_ev:
                if merged and e[0] - merged[-1]['idx'] <= 6 and merged[-1]['ch'] != e[1]:
                    merged[-1]['ch'] = 'both'
                    if e[1] in ('founder', 'namespaced'): merged[-1]['invoke_text'] = e[2]
                    continue
                merged.append({'idx': e[0], 'ch': e[1], 'invoke_text': e[2], 'o': e[3]})
            # for each event: capture assistant recommendation + next founder turn
            for m in merged:
                rec, nxt, nxt_idx, interrupted = [], None, None, False
                for j in range(m['idx'] + 1, len(lines)):
                    o2 = lines[j]
                    if o2 is None: continue
                    ft2 = founder_text(o2)
                    if ft2 is not None:
                        if is_artifact(ft2):
                            interrupted = True     # founder stopped the agent; keep looking
                            continue
                        nxt, nxt_idx = ft2, j; break
                    if o2.get('type') == 'assistant' and not o2.get('isSidechain'):
                        at = assistant_text(o2)
                        if at.strip(): rec.append(at)
                o = m['o']
                events.append({
                    'file': os.path.basename(p), 'dir': os.path.basename(d),
                    'idx': m['idx'], 'channel': m['ch'],
                    'uuid': o.get('uuid'), 'ts': o.get('timestamp'),
                    'branch': o.get('gitBranch'), 'ver': o.get('version'),
                    'invoke_text': m['invoke_text'],
                    'recommendation': '\n'.join(rec)[-9000:],
                    'next_founder_turn': nxt, 'next_idx': nxt_idx,
                    'interrupted_first': interrupted,
                })
    events.sort(key=lambda e: (e['ts'] or ''))
    out = sys.argv[1] if len(sys.argv) > 1 else 'events.jsonl'
    with open(out, 'w') as fh:
        for e in events: fh.write(json.dumps(e) + '\n')
    print(f"invocation events: {len(events)}")
    print("by channel:", dict(Counter(e['channel'] for e in events)))
    print("by month  :", dict(sorted(Counter((e['ts'] or '?')[:7] for e in events).items())))
    print("with a next founder turn:", sum(1 for e in events if e['next_founder_turn']))
    print("date range:", events[0]['ts'][:10], '..', events[-1]['ts'][:10])

def stats(path='events.jsonl'):
    ev = [json.loads(l) for l in open(path)]
    pool = [e for e in ev if e['next_founder_turn']]
    pool.sort(key=lambda e: (e['ts'] or '', e['file'], e['idx']))
    sample = random.Random(1127).sample(pool, 50)
    print(f"pool={len(pool)}  sample=50  post-April census="
          f"{len([e for e in pool if (e['ts'] or '') >= '2026-05'])}")
    print("sample by month:",
          dict(sorted(Counter(e['ts'][:7] for e in sample).items())))

def wilson(k, n, z=1.96):
    p = k / n; den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    m = z / den * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return p, c - m, c + m

if __name__ == '__main__':
    out_path = sys.argv[1] if len(sys.argv) > 1 else 'events.jsonl'
    main()
    stats(out_path)
    # ---- hand-classification result (see .private/docs/p1127-classification.json) ----
    # Stratified, because the third invocation channel was found AFTER the first draw:
    #   stratum A = the 361 events frame v3 already had  (n=50, 35 eligible,  9 push-back)
    #   stratum B = the 108 events channel C adds        (n=20, 15 eligible,  7 push-back)
    NA, nA, pbA = 361, 50, 9
    NB, nB, pbB = 108, 20, 7
    N = NA + NB; WA, WB = NA / N, NB / N
    pA, pB = pbA / nA, pbB / nB
    est = WA * pA + WB * pB
    var = (WA**2) * (pA*(1-pA)/nA) * (1-nA/NA) + (WB**2) * (pB*(1-pB)/nB) * (1-nB/NB)
    se = math.sqrt(var)
    print(f"  push-back, all turns (stratified) = {est*100:4.1f}%  "
          f"95% CI [{(est-1.96*se)*100:.1f}%, {(est+1.96*se)*100:.1f}%]   (regex probe said 14%)")
    print(f"  push-back, eligible denominator   = "
          f"{(WA*pA+WB*pB)/(WA*35/nA+WB*15/nB)*100:4.1f}%")
    # direction: removes, pre-May sample vs post-April census (18 unique events)
    def hyp(k, N, K, n):
        return comb(K, k) * comb(N-K, n-k) / comb(N, n)
    a, b, c, d = 1, 46, 5, 9      # pre-May 1 remove/47 ; post-April 5 remove/14
    pval = sum(hyp(k, a+b+c+d, a+c, c+d) for k in range(c, min(a+c, c+d)+1))
    print(f"  direction: pre-May 15 add : 1 remove   post-April 2 add : 5 remove")
    print(f"  Fisher exact one-tailed on removes: p = {pval:.5f}")
