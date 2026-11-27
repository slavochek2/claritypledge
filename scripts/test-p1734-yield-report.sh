#!/usr/bin/env bash
# Hermetic fixture tests for P1734: scripts/review_yield_report.py. Tally files only, no git repo needed.
# Usage: bash scripts/test-p1734-yield-report.sh   (exit 0 = all pass)
set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
R="${YIELD_REPORT:-$SCRIPT_DIR/review_yield_report.py}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
check() { if [[ "$2" == "$3" ]]; then echo "  PASS: $1"; PASS=$((PASS+1)); else echo "  FAIL: $1 (expected '$2', got '$3')"; FAIL=$((FAIL+1)); fi; }
W="--since 2000-01-01 --until 2100-01-01"
rep() { local f="$1"; shift; python3 "$R" --tallies "$f" $W "$@"; }
# j FILE EXPR: evaluate a python expression over the --json document d
j() { local f="$1"; shift; rep "$f" --json | python3 -c "import json,sys; d=json.load(sys.stdin); rv={r['reviewer']:r for r in d['reviewers']}; print($1)"; }

mkdir -p "$TMP/content"
printf 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nTARGET_LINE_8\nl9\nl10\nl11\n' > "$TMP/content/abc123"

# Fixture generator: writes every tally file used below.
FIXDIR="$TMP" python3 - <<'PYEOF'
import json, os
D = os.environ["FIXDIR"]
SL = ["gemini", "glm", "codex", "opus"]
VEND = {"gemini": "gemini", "glm": "openrouter", "codex": "codex", "opus": "local"}

def rec(snap, outs, defects=(), kind="finish", rnd="first", status="reviewed", attempts=None, nbytes=30000, ts="2026-11-26T10:00:00Z"):
    if status != "reviewed":
        return {"v": 1, "ts": ts, "snapshot": snap, "status": status, "reason": "x", "kind": kind, "round": rnd}
    full = {s: outs.get(s, "not triggered") for s in SL}
    if attempts is None:
        attempts = [{"slot": s, "vendor": VEND[s], "requested": "m-" + s, "served": "m-" + s,
                     "served_assumed": s == "codex", "effort": None, "reasoning_tokens": 100,
                     "exit": 0, "ok": True, "file": None, "hash": None, "fallback_from": None}
                    for s in SL if full[s] == "ok"]
    return {"v": 1, "ts": ts, "snapshot": snap, "session": "s", "head": "h", "worktree": "/w", "kind": kind,
            "round": rnd, "after": None, "prompt": {"path": "p", "bytes": nbytes}, "status": "reviewed",
            "reason": None, "reviewers": full, "attempts": attempts, "defects": list(defects)}

def df(summary, state, raised, sev="LOW", file="a.py", line=8, content=None):
    return {"summary": summary, "file": file, "line": line, "state": state, "severity": sev,
            "raised_by": raised, "content": content}

def write(name, recs):
    with open(os.path.join(D, name), "w") as f:
        f.write("this line is not json\n")
        for r in recs:
            f.write(json.dumps(r) + "\n")

ALL = {s: "ok" for s in SL}

# Fixture 1: 25 rounds, all four ok. Findings order would be opus,gemini,glm,codex (differs from slot order).
r1 = []
for i in range(25):
    ds = [df("noisy-g %d-%d" % (i, k), "dropped", {"gemini": "LOW"}) for k in range(7)]
    ds += [df("noisy-o %d-%d" % (i, k), "dropped", {"opus": "LOW"}) for k in range(7)]
    ds.append(df("echo %d" % i, "verified", {"glm": "LOW", "codex": "LOW"}))
    if i == 3:
        ds.append(df("quiet-high", "verified", {"codex": "HIGH"}, sev="HIGH"))
    if i == 4:
        ds.append(df("noisy-high", "verified", {"opus": "HIGH"}, sev="HIGH"))
    r1.append(rec("f1-%d.json" % i, ALL, ds))
write("f1.jsonl", r1)

# Fixture 2: codex solo for 25 rounds, then 25 rounds with a peer and no catches.
r2 = [rec("f2s-%d.json" % i, {"codex": "ok", "gemini": "missing (quota)", "glm": "skipped (x)", "opus": "skipped (x)"},
          [df("solo %d" % i, "verified", {"codex": "LOW"})]) for i in range(25)]
r2 += [rec("f2p-%d.json" % i, {"codex": "ok", "gemini": "ok"}) for i in range(25)]
write("f2.jsonl", r2)

# Fixture 3: gemini and glm raise the same defects over 65 rounds; opus ok with unique catches.
r3 = []
for i in range(65):
    ds = [df("same %d" % i, "verified", {"gemini": "LOW", "glm": "LOW"})]
    ds.append(df("glm-drop %d" % i, "dropped", {"glm": "LOW"}))
    if i % 10 == 0:
        ds.append(df("opus-own %d" % i, "verified", {"opus": "LOW"}))
    r3.append(rec("f3-%d.json" % i, {"gemini": "ok", "glm": "ok", "opus": "ok"}, ds))
write("f3.jsonl", r3)

# Fixture 3b: codex and gemini ok together 65 rounds, nothing raised.
write("f3b.jsonl", [rec("f3b-%d.json" % i, {"gemini": "ok", "codex": "ok"}) for i in range(65)])

# Recheck with content: two verified (one with stored content), one dropped without content.
write("rc.jsonl", [rec("rc-1.json", {"gemini": "ok", "glm": "ok"}, [
    df("has content", "verified", {"gemini": "LOW"}, line=8, content="abc123"),
    df("no content", "verified", {"gemini": "LOW"}, line=3, content="missinghash"),
    df("dropped one", "dropped", {"glm": "LOW"}, line=2)])])

# Latest record wins: same snapshot twice.
write("lw.jsonl", [
    rec("same.json", ALL, [df("first only", "verified", {"gemini": "LOW"})]),
    rec("same.json", {"gemini": "ok", "glm": "ok", "codex": "skipped (x)", "opus": "skipped (x)"}, [])])

# Abandoned / waived are counted, not rounds.
write("aw.jsonl", [rec("a1.json", {}, status="abandoned"), rec("a2.json", {}, status="abandoned"),
                   rec("w1.json", {}, status="waived"), rec("ok1.json", {"gemini": "ok", "glm": "ok"})])

# Single-file fallback: carbon failed row plus argon ok row.
fb = [{"slot": "gemini", "vendor": "gemini", "requested": "carbon", "served": None, "served_assumed": False,
       "effort": None, "reasoning_tokens": None, "exit": 1, "ok": False, "file": None, "hash": None, "fallback_from": None},
      {"slot": "gemini", "vendor": "gemini", "requested": "argon", "served": "argon", "served_assumed": False,
       "effort": None, "reasoning_tokens": 50, "exit": 0, "ok": True, "file": "f", "hash": "0" * 16, "fallback_from": "carbon"},
      {"slot": "codex", "vendor": "codex", "requested": "cx", "served": "cx", "served_assumed": True,
       "effort": None, "reasoning_tokens": None, "exit": 0, "ok": True, "file": "g", "hash": "1" * 16, "fallback_from": None}]
write("fb.jsonl", [rec("fb.json", {"gemini": "ok", "codex": "ok"}, attempts=fb)])

# Rule 9: window 2026-11-01..2026-11-30, past period 2026-08-03..2026-10-31. Model answering = m-gemini.
def r9(name, past_rounds, past_unique):
    rs = []
    for i in range(40):
        ds = [df("cur-%d" % i, "verified", {"gemini": "LOW"})] if i == 0 else []
        rs.append(rec("r9c-%d.json" % i, {"gemini": "ok", "glm": "ok"}, ds, ts="2026-11-15T10:00:00Z"))
    for i in range(past_rounds):
        ds = [df("past-%d" % i, "verified", {"gemini": "LOW"})] if i < past_unique else []
        rs.append(rec("r9p-%d.json" % i, {"gemini": "ok", "glm": "ok"}, ds, ts="2026-09-15T10:00:00Z"))
    write(name, rs)
r9("r9a.jsonl", 40, 10)   # past rate 0.25, current 0.025: trigger
r9("r9b.jsonl", 39, 10)   # past has 39 runs: no trigger
r9("r9c.jsonl", 40, 0)    # past rate 0: no trigger

def att(slot, requested, served, ok=True, tokens=None, file="f", fb=None):
    return {"slot": slot, "vendor": VEND[slot], "requested": requested, "served": served,
            "served_assumed": False, "effort": None, "reasoning_tokens": tokens, "exit": 0 if ok else 1,
            "ok": ok, "file": file, "hash": None, "fallback_from": fb}

# R1: glm has 20 real runs (3 dropped each) and 30 rounds where it ran alone (20 dropped each).
n1 = [rec("n1r-%d.json" % i, {"gemini": "ok", "glm": "ok"},
          [df("d%d-%d" % (i, k), "dropped", {"glm": "LOW"}) for k in range(3)]) for i in range(20)]
n1 += [rec("n1s-%d.json" % i, {"glm": "ok", "gemini": "missing (quota)"},
           [df("s%d-%d" % (i, k), "dropped", {"glm": "LOW"}) for k in range(20)]) for i in range(30)]
write("n1.jsonl", n1)

# --until boundary: one record exactly at midnight 2026-11-26.
write("u.jsonl", [rec("u1.json", {"gemini": "ok", "glm": "ok"}, ts="2026-11-26T00:00:00Z")])

# Fix 3: requested differs from served; the answering model is the requested one.
write("am.jsonl", [rec("am.json", {"gemini": "ok", "glm": "ok"}, attempts=[
    att("gemini", "req-model", "srv-model"), att("glm", "m-glm", "m-glm")])])

# Fix 4 and 6: two-file manual re-run: failed carbon file plus ok argon file, no fallback_from.
write("mr.jsonl", [rec("mr.json", {"gemini": "ok", "glm": "ok"}, attempts=[
    att("gemini", "carbon", None, ok=False, file="c"), att("gemini", "argon", "argon", file="a"),
    att("glm", "m-glm", "m-glm")])])

# Fix 5: two ok gemini attempts in one round report 30 and 70 reasoning tokens.
write("tk.jsonl", [rec("tk.json", {"gemini": "ok", "glm": "ok"}, attempts=[
    att("gemini", "a", "a", tokens=30), att("gemini", "b", "b", tokens=70), att("glm", "m-glm", "m-glm")])])

# Fix 7: recheck with content_missing, line past the file, and a null line.
write("rc2.jsonl", [rec("rc2.json", {"gemini": "ok", "glm": "ok"}, [
    df("far line", "verified", {"gemini": "LOW"}, line=99, content="abc123"),
    df("null line", "verified", {"gemini": "LOW"}, line=None, content="abc123"),
    df("gone", "verified", {"gemini": "LOW"}, line=2, content="gonehash"),
    df("dropped gone", "dropped", {"glm": "LOW"}, line=2)])])
j2 = json.loads(open(os.path.join(D, "rc2.jsonl")).read().splitlines()[1])
for d in j2["defects"]:
    if d["summary"] in ("gone", "dropped gone"):
        d["content_missing"] = "deleted"
open(os.path.join(D, "rc2.jsonl"), "w").write(json.dumps(j2) + "\n")

# Fix 8: criteria subagent as a peer. Round A: gemini+glm ok; B: gemini ok alone; C: gemini unique control.
write("cr.jsonl", [
    rec("cr-a.json", {"gemini": "ok", "glm": "ok"}, [df("with criteria", "verified", {"gemini": "LOW", "criteria": "LOW"})]),
    rec("cr-b.json", {"gemini": "ok", "glm": "missing (quota)"}, [df("solo criteria", "verified", {"gemini": "LOW", "criteria": "LOW"})]),
    rec("cr-c.json", {"gemini": "ok", "glm": "ok"}, [df("really unique", "verified", {"gemini": "LOW"})])])

# Fix 9: a waiver note after a reviewed round must not replace it.
write("wv.jsonl", [rec("wv.json", {"gemini": "ok", "glm": "ok"}),
                   {"v": 1, "ts": "2026-11-26T11:00:00Z", "snapshot": "wv.json", "status": "waiver", "reason": "x"}])

# Overlap guard (PROTECTED patched empty): chain A-B-C where A and C do not overlap.
ch = []
for i in range(65):
    ds = [df("ab %d" % i, "verified", {"gemini": "LOW", "glm": "LOW"}),
          df("bc %d" % i, "verified", {"glm": "LOW", "codex": "LOW"}),
          df("gd %d" % i, "dropped", {"gemini": "LOW"}),
          df("cd %d" % i, "dropped", {"codex": "LOW"}), df("cd2 %d" % i, "dropped", {"codex": "LOW"})]
    ch.append(rec("ch-%d.json" % i, {"gemini": "ok", "glm": "ok", "codex": "ok"}, ds))
write("chain.jsonl", ch)
PYEOF

echo "[missing file]"
out="$(python3 "$R" --tallies "$TMP/nope.jsonl")"; check "no tallies message" "no tallies recorded yet" "$out"
check "missing file exit 0" 0 "$(python3 "$R" --tallies "$TMP/nope.jsonl" >/dev/null 2>&1; echo $?)"

echo "[fixture 1: 2026-11-05 ruling control]"
check "quiet reviewer (unique HIGH) keeps" keep "$(j "$TMP/f1.jsonl" "rv['codex']['verdict']")"
check "noisy-with-HIGH keeps" keep "$(j "$TMP/f1.jsonl" "rv['opus']['verdict']")"
check "noisy no-unique is not keep" "no" "$(j "$TMP/f1.jsonl" "'yes' if rv['gemini']['verdict']=='keep' else 'no'")"
check "echo reviewer is not keep" "no" "$(j "$TMP/f1.jsonl" "'yes' if rv['glm']['verdict']=='keep' else 'no'")"
check "echo reviewer has zero unique" 0 "$(j "$TMP/f1.jsonl" "rv['glm']['unique']")"
check "noisy gemini gets tune item" 1 "$(j "$TMP/f1.jsonl" "sum('tune item' in i for i in rv['gemini']['items'])")"
check "noisy-with-HIGH opus gets tune item" 1 "$(j "$TMP/f1.jsonl" "sum('tune item' in i for i in rv['opus']['items'])")"
check "quiet codex has no tune item" 0 "$(j "$TMP/f1.jsonl" "sum('tune item' in i for i in rv['codex']['items'])")"
check "echo glm has no tune item" 0 "$(j "$TMP/f1.jsonl" "sum('tune item' in i for i in rv['glm']['items'])")"
order="$(rep "$TMP/f1.jsonl" | grep -oE '^(gemini|glm|codex|opus):' | tr '\n' ' ')"
check "text order is fixed slot order, not by findings" "gemini: glm: codex: opus: " "$order"
check "json order is fixed slot order" "gemini,glm,codex,opus" "$(j "$TMP/f1.jsonl" "','.join(r['reviewer'] for r in d['reviewers'])")"
check "dropped per run printed beside verdict" 1 "$(rep "$TMP/f1.jsonl" | grep -c '^gemini: verdict=watch | dropped per run=7.00')"

echo "[fixture 2: solo catches]"
check "solo column counts" 25 "$(j "$TMP/f2.jsonl" "rv['codex']['solo']")"
check "unique stays zero" 0 "$(j "$TMP/f2.jsonl" "rv['codex']['unique']")"
check "runs exclude solo rounds" 25 "$(j "$TMP/f2.jsonl" "rv['codex']['runs']")"
check "solo reviewer is not keep" watch "$(j "$TMP/f2.jsonl" "rv['codex']['verdict']")"

echo "[fixture 3: overlap guard]"
check "overlap table shows shared defects" 65 "$(j "$TMP/f3.jsonl" "d['overlap']['gemini+glm']")"
check "overlap text row" 1 "$(rep "$TMP/f3.jsonl" | grep -c '^  gemini+glm: 65$')"
check "gemini verdict remove" remove "$(j "$TMP/f3.jsonl" "rv['gemini']['verdict']")"
check "glm verdict remove" remove "$(j "$TMP/f3.jsonl" "rv['glm']['verdict']")"
check "gemini remove is a founder item" 1 "$(j "$TMP/f3.jsonl" "sum(i.startswith('founder item: remove') for i in rv['gemini']['items'])")"
check "exactly one roster action across slots" 1 "$(j "$TMP/f3.jsonl" "sum(i.startswith('roster action') for r in d['reviewers'] for i in r['items'])")"
check "roster action lands on glm" 1 "$(j "$TMP/f3.jsonl" "sum(i.startswith('roster action') for i in rv['glm']['items'])")"
check "opus with unique catches keeps" keep "$(j "$TMP/f3.jsonl" "rv['opus']['verdict']")"
check "codex remove prints as founder item" 1 "$(j "$TMP/f3b.jsonl" "sum(i.startswith('founder item: remove') for i in rv['codex']['items'])")"
check "no roster action on protected slots" 0 "$(j "$TMP/f3b.jsonl" "sum(i.startswith('roster action') for r in d['reviewers'] for i in r['items'])")"

echo "[table test]"
python3 "$R" --table-test > "$TMP/table.txt"
check "table rows" 972 "$(wc -l < "$TMP/table.txt" | tr -d ' ')"
check "every row has one of the five verdicts" 0 "$(awk -F, '$4!="not enough runs" && $4!="keep" && $4!="remove" && $4!="stakes-gate" && $4!="watch"' "$TMP/table.txt" | wc -l | tr -d ' ')"
check "every row has exactly four fields" 0 "$(awk -F, 'NF!=4' "$TMP/table.txt" | wc -l | tr -d ' ')"
check "runs 20 unique 1 keep" "20,1,0,keep" "$(grep '^20,1,0,' "$TMP/table.txt")"
check "runs 21 unique 1 watch" "21,1,0,watch" "$(grep '^21,1,0,' "$TMP/table.txt")"
check "runs 19 unique 1 not enough" "19,1,0,not enough runs" "$(grep '^19,1,0,' "$TMP/table.txt")"
check "runs 60 unique 0 remove" "60,0,0,remove" "$(grep '^60,0,0,' "$TMP/table.txt")"
check "runs 59 unique 0 stakes-gate" "59,0,0,stakes-gate" "$(grep '^59,0,0,' "$TMP/table.txt")"
check "runs 40 unique 0 stakes-gate" "40,0,0,stakes-gate" "$(grep '^40,0,0,' "$TMP/table.txt")"
check "runs 39 unique 0 watch" "39,0,0,watch" "$(grep '^39,0,0,' "$TMP/table.txt")"
check "high at 20 runs keeps" "20,0,1,keep" "$(grep '^20,0,1,' "$TMP/table.txt")"
check "high at 80 runs keeps" "80,0,1,keep" "$(grep '^80,0,1,' "$TMP/table.txt")"

echo "[recheck]"
out="$(rep "$TMP/rc.jsonl" --recheck --seed 1 --content-dir "$TMP/content")"
check "fewer than 3 verified says only N eligible" 1 "$(grep -c 'verified: only 2 eligible' <<<"$out")"
check "dropped pool of one is fully used" 1 "$(grep -c 'dropped one' <<<"$out")"
check "stored excerpt prints the target line" 1 "$(grep -c '> *8 | TARGET_LINE_8' <<<"$out")"
check "excerpt shows context after the line" 1 "$(grep -c '11 | l11' <<<"$out")"
check "missing content is disclosed" 2 "$(grep -c 'content not stored' <<<"$out")"
out="$(rep "$TMP/f1.jsonl" --recheck --seed 1 --content-dir "$TMP/content")"
check "enough verified: no only-N message" 0 "$(grep -c 'verified: only' <<<"$out")"
check "three verified rechecked" 3 "$(grep -c '^- \[verified\]' <<<"$out")"
check "one dropped rechecked" 1 "$(grep -c '^- \[dropped\]' <<<"$out")"

echo "[latest record wins]"
check "only the second record counted (opus not ok)" 0 "$(j "$TMP/lw.jsonl" "rv['opus']['slot_counts']['ok']")"
check "gemini counted once" 1 "$(j "$TMP/lw.jsonl" "rv['gemini']['ok_rounds']")"
check "first record's defect not counted" 0 "$(j "$TMP/lw.jsonl" "rv['gemini']['unique']")"

echo "[abandoned and waived]"
check "abandoned counted" 2 "$(j "$TMP/aw.jsonl" "d['abandoned']")"
check "waived counted" 1 "$(j "$TMP/aw.jsonl" "d['waived']")"
check "only reviewed record is a round" 1 "$(j "$TMP/aw.jsonl" "d['rounds']")"
check "abandoned does not touch slot counts" 1 "$(j "$TMP/aw.jsonl" "rv['gemini']['slot_counts']['ok']")"

echo "[single-file fallback]"
check "gemini slot stays ok" 1 "$(j "$TMP/fb.jsonl" "rv['gemini']['slot_counts']['ok']")"
check "failed model shows one failed attempt" "1,0" "$(j "$TMP/fb.jsonl" "str(d['models']['tables']['requested']['carbon']['attempts'])+','+str(d['models']['tables']['requested']['carbon']['ok'])")"
check "answering model shows ok attempt" "1,1" "$(j "$TMP/fb.jsonl" "str(d['models']['tables']['requested']['argon']['attempts'])+','+str(d['models']['tables']['requested']['argon']['ok'])")"
check "fallback round flagged" 1 "$(j "$TMP/fb.jsonl" "d['splits']['gemini_fallback_rounds']")"
check "run belongs to answering model" 1 "$(j "$TMP/fb.jsonl" "[m['runs'] for m in d['models']['answering'] if m['model']=='argon'][0]")"
check "codex served-assumed note printed" 1 "$(rep "$TMP/fb.jsonl" | grep -c 'served = requested (header has no served field)')"
check "tokens unreported for glm, codex, opus; gemini reports 50" 3 "$(rep "$TMP/fb.jsonl" | grep -c 'tokens per run=unreported')"
check "gemini tokens per run mean" 1 "$(rep "$TMP/fb.jsonl" | grep -c 'tokens per run=50.0')"

echo "[rule 9 model trigger]"
j9() { local f="$1"; shift; python3 "$R" --tallies "$f" --since 2026-11-01 --until 2026-11-30 --json | python3 -c "import json,sys; d=json.load(sys.stdin); m={x['model']:x for x in d['models']['answering']}; print($1)"; }
check "(a) 40 runs now, past 40 runs at 10x rate: trigger" True "$(j9 "$TMP/r9a.jsonl" "m['m-gemini']['trigger']")"
check "(a) window runs counted only in window" 40 "$(j9 "$TMP/r9a.jsonl" "m['m-gemini']['runs']")"
check "(a) past runs read from the 90 days before" 40 "$(j9 "$TMP/r9a.jsonl" "m['m-gemini']['past_runs']")"
check "(a) text prints benchmark re-run item" 1 "$(python3 "$R" --tallies "$TMP/r9a.jsonl" --since 2026-11-01 --until 2026-11-30 | grep -c 'benchmark re-run item')"
check "(b) past period 39 runs: no trigger" False "$(j9 "$TMP/r9b.jsonl" "m['m-gemini']['trigger']")"
check "(c) past rate zero: no trigger" False "$(j9 "$TMP/r9c.jsonl" "m['m-gemini']['trigger']")"
check "(d) fallback run credited to argon" 1 "$(j "$TMP/fb.jsonl" "[m['runs'] for m in d['models']['answering'] if m['model']=='argon'][0]")"
check "(d) carbon gets no answering run" 0 "$(j "$TMP/fb.jsonl" "len([m for m in d['models']['answering'] if m['model']=='carbon'])")"

echo "[round-1 fix 1: dropped counted only in real runs]"
check "dropped per run uses runs only (3.0)" 3.0 "$(j "$TMP/n1.jsonl" "rv['glm']['dropped_per_run']")"
check "ok rounds still printed (50)" 50 "$(j "$TMP/n1.jsonl" "rv['glm']['ok_rounds']")"
check "no tune item from solo-round drops" 0 "$(j "$TMP/n1.jsonl" "sum('tune item' in i for i in rv['glm']['items'])")"

echo "[round-1 fix 2: --until]"
check "record at exactly midnight excluded by --until previous day" 0 "$(python3 "$R" --tallies "$TMP/u.jsonl" --since 2000-01-01 --until 2026-11-25 --json | python3 -c "import json,sys; print(json.load(sys.stdin)['rounds'])")"
check "--until the record's own day includes it" 1 "$(python3 "$R" --tallies "$TMP/u.jsonl" --since 2000-01-01 --until 2026-11-26 --json | python3 -c "import json,sys; print(json.load(sys.stdin)['rounds'])")"
check "--until alone does not crash" 0 "$(python3 "$R" --tallies "$TMP/u.jsonl" --until 2026-11-26 >/dev/null 2>&1; echo $?)"
check "--until alone prints the earliest record date" 1 "$(python3 "$R" --tallies "$TMP/u.jsonl" --until 2026-11-26 2>&1 | grep -c '^Reviewer yield report: 2026-11-26 to ')"
check "--until alone, empty window prints a dash" 1 "$(python3 "$R" --tallies "$TMP/u.jsonl" --until 2020-01-01 2>&1 | grep -c '^Reviewer yield report: - to ')"

echo "[round-1 fix 3: answering model is the requested one]"
check "answering model keyed by requested" "req-model" "$(j "$TMP/am.jsonl" "[m['model'] for m in d['models']['answering'] if m['model'] in ('req-model','srv-model')][0]")"

echo "[round-1 fix 4: two-file manual re-run flagged as fallback]"
check "failed + ok gemini with different requested counts" 1 "$(j "$TMP/mr.jsonl" "d['splits']['gemini_fallback_rounds']")"
check "control: single clean gemini attempt is not a fallback" 0 "$(j "$TMP/am.jsonl" "d['splits']['gemini_fallback_rounds']")"

echo "[round-1 fix 5: tokens summed per round]"
check "two ok attempts in one round sum to 100" 100.0 "$(j "$TMP/tk.jsonl" "rv['gemini']['tokens_per_run']")"

echo "[round-1 fix 6: served table skips the synthetic failed row]"
check "no (none) row in the served table" 0 "$(j "$TMP/fb.jsonl" "'(none)' in d['models']['tables']['served'] and 1 or 0")"
check "failed row stays in the requested table" 1 "$(j "$TMP/fb.jsonl" "d['models']['tables']['requested']['carbon']['attempts']")"

echo "[round-1 fix 7: recheck disclosures]"
out="$(rep "$TMP/rc2.jsonl" --recheck --seed 1 --content-dir "$TMP/content")"
check "content_missing reason printed" 2 "$(grep -c '^    deleted$' <<<"$out")"
check "line beyond the stored file" 1 "$(grep -c 'line 99 is beyond the stored file (11 lines)' <<<"$out")"
check "no line recorded" 1 "$(grep -c 'no line recorded' <<<"$out")"

echo "[round-1 fix 8: criteria subagent is a peer]"
check "criteria peer: not unique (only the control counts)" 1 "$(j "$TMP/cr.jsonl" "rv['gemini']['unique']")"
check "criteria peer: not solo" 0 "$(j "$TMP/cr.jsonl" "rv['gemini']['solo']")"
check "criteria gets no row" 0 "$(j "$TMP/cr.jsonl" "'criteria' in rv and 1 or 0")"
check "header says unique includes criteria" 1 "$(rep "$TMP/cr.jsonl" | grep -c '^unique = no other reviewer in the round raised it, /finish criteria subagents included$')"

echo "[round-1 fix 9: waiver note]"
check "waiver note does not replace the reviewed round" 1 "$(j "$TMP/wv.jsonl" "d['rounds']")"
check "waiver note counted as waived" 1 "$(j "$TMP/wv.jsonl" "d['waived']")"

echo "[round-1 fix 10: overlap guard with nothing protected]"
guard() { python3 -c "
import sys; sys.path.insert(0, '$SCRIPT_DIR')
import review_yield_report as m
A = m.analyze(m.load_records('$TMP/$1')); m.PROTECTED = set()
rows, _ = m.build(A, None)
$2"; }
check "pair: exactly one roster action" 1 "$(guard f3.jsonl "print(sum(i.startswith('roster action: remove') for r in rows for i in r['items']))")"
check "pair: the action lands on the one with more dropped per run (glm)" glm "$(guard f3.jsonl "print([r['reviewer'] for r in rows if any(i.startswith('roster action') for i in r['items'])][0])")"
check "pair: the other holds" 1 "$(guard f3.jsonl "print(sum(i.startswith('hold (overlap guard') for r in rows for i in r['items']))")"
check "chain: all three removable" 3 "$(guard chain.jsonl "print(sum(r['verdict']=='remove' for r in rows))")"
check "chain A-B-C: exactly one acted on" 1 "$(guard chain.jsonl "print(sum(i.startswith('roster action') for r in rows for i in r['items']))")"
check "chain A-B-C: the other two hold" 2 "$(guard chain.jsonl "print(sum(i.startswith('hold (overlap guard') for r in rows for i in r['items']))")"
check "chain: A and C do not overlap directly" False "$(guard chain.jsonl "print(m.overlaps(A, 'gemini', 'codex'))")"

echo "=== Results: $PASS passed, $FAIL failed ==="
[[ "$FAIL" -eq 0 ]]
