#!/usr/bin/env bash
# test-p1399-day-registry.sh — the /day check registries and the skill files that report into them
# must describe the same checks.
#
# P1399 split "what ran" (the step manifest) from "what was checked" (the check registry beside it,
# `<name>-checks.tsv`). Two lists drift, and both directions are silent on the board:
#
#   - a CHECK id a skill writes that no registry row names is shown in a group of its own, with no
#     label, severity or connection — and nothing tells anyone the registry is behind;
#   - a registry row whose step id is in no manifest can never be graded "did not run" correctly;
#   - a registered check that no skill line ever reports reads "not proven" on every single morning,
#     which trains the founder to read past "not proven".
#
# day-step.sh check-sync guards the step ids; nothing guarded the check ids until this file.
#
# Pairs checked: this repo's sub-day (always), and the dispatcher's (day.md + day-steps.tsv +
# day-checks.tsv) under DAY_DISPATCHER_ROOT, default ~/.claude — reported as NOT CHECKED, never as a
# pass, when that root has no registry.
#
# Gate 7 / 7d: the controls mutate COPIES OF THE REAL FILES (a planted unregistered id, a planted
# row with a step no manifest has, a deleted report line) and require each to fail, and require
# the unmutated files to pass.
#
# Exit 0: all assertions held. Exit 1: at least one did not.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DISPATCHER_ROOT="${DAY_DISPATCHER_ROOT:-$HOME/.claude}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok()  { echo "  ok   $1"; pass=$((pass+1)); }
bad() { echo "  FAIL $1"; fail=$((fail+1)); }

# check_pair MANIFEST REGISTRY SKILL — prints one line per problem; exit 1 if any.
check_pair() {
  python3 - "$1" "$2" "$3" <<'PY'
import re, sys
man, reg, skill = sys.argv[1:4]
def rows(p):
    out = []
    for ln in open(p, encoding="utf-8").read().splitlines():
        if ln.strip() and not ln.lstrip().startswith("#"):
            out.append(ln.split("\t"))
    return out
steps = {r[0] for r in rows(man)}
problems = []
registered = {}
for r in rows(reg):
    if len(r) not in (5, 6):
        problems.append("registry row has %d TAB fields, want 5 or 6: %s" % (len(r), r[0]))
        continue
    cid, step, label, group, sev = r[:5]
    if cid in registered:
        problems.append("check id registered twice: " + cid)
    registered[cid] = step
    if step not in steps:
        problems.append("registry row %s names step %s, which is in no manifest row" % (cid, step))
    if sev not in ("high", "normal"):
        problems.append("registry row %s has severity %r" % (cid, sev))
text = open(skill, encoding="utf-8").read()
ID = r"([a-z]+\.[A-Za-z0-9._-]*[A-Za-z0-9])"
written = set(re.findall(r"CHECK " + ID + r"\b", text))
written |= set(re.findall(r"(?:day-step\.sh|DAY_STEP\"?) check " + ID + r"\b", text))
for cid in sorted(written - set(registered)):
    problems.append("the skill reports %s, which no registry row names" % cid)
for cid in sorted(set(registered) - written):
    problems.append("registered check %s is never reported by the skill — it would read not proven every pass" % cid)
for p in problems:
    print(p)
print("CHECKS %d registered, %d reported" % (len(registered), len(written)), file=sys.stderr)
sys.exit(1 if problems else 0)
PY
}

run_pair() {  # NAME MANIFEST REGISTRY SKILL
  local name="$1" out
  echo "== $name =="
  for f in "$2" "$3" "$4"; do
    [ -f "$f" ] || { bad "$name: missing $(basename "$f")"; return; }
  done
  if out="$(check_pair "$2" "$3" "$4" 2>&1)"; then
    ok "$name: $(printf '%s\n' "$out" | tail -1)"
  else
    bad "$name: registry and skill disagree:"; printf '%s\n' "$out" | sed 's/^/         /'
  fi
}

CP_MAN="$ROOT/scripts/day-cp-steps.tsv"
CP_REG="$ROOT/scripts/day-cp-checks.tsv"
CP_SKILL="$ROOT/.claude/commands/slava/maintain/day-cp.md"
run_pair "ClarityPledge sub-day" "$CP_MAN" "$CP_REG" "$CP_SKILL"

echo
D_MAN="$DISPATCHER_ROOT/scripts/day-steps.tsv"
D_REG="$DISPATCHER_ROOT/scripts/day-checks.tsv"
D_SKILL="$DISPATCHER_ROOT/commands/day.md"
if [ -f "$D_REG" ]; then
  run_pair "dispatcher ($DISPATCHER_ROOT)" "$D_MAN" "$D_REG" "$D_SKILL"
else
  # Not a pass: counted in neither column, and said plainly.
  echo "== dispatcher =="
  echo "  NOT CHECKED — no day-checks.tsv under DAY_DISPATCHER_ROOT; set it to the dispatcher checkout"
fi

echo
echo "== CONTROLS: mutations of the REAL files must fail, the real files must pass =="
mutate() {  # NAME — runs check_pair on the mutated copies in $TMP, wants exit 1
  if check_pair "$TMP/man.tsv" "$TMP/reg.tsv" "$TMP/skill.md" >/dev/null 2>&1; then
    bad "control did NOT fail: $1"
  else
    ok "control fails as it must: $1"
  fi
}
fresh() { cp "$CP_MAN" "$TMP/man.tsv"; cp "$CP_REG" "$TMP/reg.tsv"; cp "$CP_SKILL" "$TMP/skill.md"; }

fresh
if check_pair "$TMP/man.tsv" "$TMP/reg.tsv" "$TMP/skill.md" >/dev/null 2>&1; then ok "CONTROL: unmutated copies pass (no false positive)"
else bad "CONTROL: unmutated copies fail — every control below proves nothing"; fi

fresh
printf '\n```bash\necho "CHECK cp.planted ok a check nobody registered" | tee -a "$DAY_CHECK_FILE"\n```\n' >> "$TMP/skill.md"
mutate "a CHECK line with an unregistered id"

fresh
printf '\n```bash\n"$DAY_STEP" check cp.plantedagent ok --detail "an agent check nobody registered" --step cp.w2s\n```\n' >> "$TMP/skill.md"
mutate "an agent check with an unregistered id"

fresh
printf 'cp.orphan\tcp.nosuchstep\tOrphan\tCode\tnormal\t\n' >> "$TMP/reg.tsv"
mutate "a registry row whose step is in no manifest"

fresh
# Delete every line that reports the FIRST registered check: it is registered but never reported.
FIRST="$(grep -v '^[[:space:]]*#' "$CP_REG" | grep -v '^[[:space:]]*$' | head -1 | cut -f1)"
grep -vF "CHECK ${FIRST} " "$TMP/skill.md" | grep -vF "check ${FIRST} " > "$TMP/skill2.md"; mv "$TMP/skill2.md" "$TMP/skill.md"
if grep -qF "CHECK ${FIRST} " "$CP_SKILL"; then mutate "registered check ${FIRST} with its report lines deleted"
else bad "control could not run: no real report line for ${FIRST}"; fi

echo
echo "== ${pass} passed, ${fail} failed =="
[ "$fail" -eq 0 ]
