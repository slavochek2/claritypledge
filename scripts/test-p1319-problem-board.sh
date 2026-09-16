#!/bin/bash
# scripts/test-p1319-problem-board.sh — canary for P1319.
#
# Proves the two deterministic halves of /slava:problem:submit's weekly flow:
#   1. problem_block.py accepts the valid fixtures and rejects every case in
#      scripts/fixtures/problem-block/invalid-cases.json, naming the failing field.
#   2. candidates.py keeps the private list honest: maybe-later is re-offered,
#      reject and submitted are terminal, the weekly cap holds, a corrupt file is
#      never overwritten, and a location inside a git repository is refused —
#      with an outside-repository control run through the identical command.
#
# Hermetic: every state file lives under mktemp and CLARITY_PROBLEM_BOARD_DIR
# points there, so the member's real list is never read or written.
#
# P1319_PB_DIR overrides the scripts directory so a mutated copy can be run
# through this exact test to prove it fails (.claude/rules/epistemic.md gate 7).
set -u
export PYTHONDONTWRITEBYTECODE=1

REPO_ROOT="$(git rev-parse --show-toplevel)"
PB="${P1319_PB_DIR:-$REPO_ROOT/scripts/problem-board}"
FIX="$REPO_ROOT/scripts/fixtures/problem-block"
PASS=0
FAIL=0
OUT=""
CODE=0

TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

ok()  { PASS=$((PASS + 1)); echo "  PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }

run() { OUT=$("$@" 2>&1); CODE=$?; }

expect_code() { # name want cmd...
  local name=$1 want=$2
  shift 2
  run "$@"
  if [ "$CODE" = "$want" ]; then ok "$name"; else bad "$name — exit $CODE, want $want: $OUT"; fi
}

block()      { python3 "$PB/problem_block.py" "$@"; }
candidates() { python3 "$PB/candidates.py" "$@"; }

# ─── 1. The problem block ────────────────────────────────────────────────────
echo "problem block"

expect_code "valid fixture validates" 0 block validate "$FIX/valid.json"
expect_code "valid fixture with a blank slot validates" 0 block validate "$FIX/valid-blank-slot.json"

OUT=$(block validate - < "$FIX/valid.json" 2>&1); CODE=$?
[ "$CODE" = 0 ] && ok "validates from stdin" || bad "validates from stdin — exit $CODE: $OUT"

run block emit "$FIX/valid.json"
if [ "$CODE" = 0 ]; then
  EMITTED=$OUT
  printf 'Here is your problem block:\n\n%s\n\nPaste it into the review page.\n' "$EMITTED" > "$TMPROOT/fenced.md"
  expect_code "emitted fence, wrapped in prose, validates" 0 block validate "$TMPROOT/fenced.md"
  printf '%s\n\n%s\n' "$EMITTED" "$EMITTED" > "$TMPROOT/two.md"
  expect_code "two blocks in one input are rejected" 1 block validate "$TMPROOT/two.md"
else
  bad "emit on the valid fixture — exit $CODE: $OUT"
fi

printf '```json\n{}\n```\n' > "$TMPROOT/wrong-fence.md"
expect_code "a fence that is not problem-block is rejected" 1 block validate "$TMPROOT/wrong-fence.md"

printf '{"format_version": 1,' > "$TMPROOT/broken.json"
expect_code "broken JSON is rejected" 1 block validate "$TMPROOT/broken.json"

STDOUT=$(block emit "$TMPROOT/broken.json" 2>/dev/null); CODE=$?
if [ "$CODE" = 1 ] && [ -z "$STDOUT" ]; then ok "emit prints nothing for an invalid block"
else bad "emit prints nothing for an invalid block — exit $CODE, stdout: $STDOUT"; fi

python3 - "$FIX" "$TMPROOT/cases" <<'PY'
import copy, json, os, sys
fix, out = sys.argv[1], sys.argv[2]
os.makedirs(out)
with open(os.path.join(fix, "invalid-cases.json"), encoding="utf-8") as fh:
    spec = json.load(fh)
with open(os.path.join(fix, spec["base"]), encoding="utf-8") as fh:
    base = json.load(fh)

def key(obj, part):
    return int(part) if isinstance(obj, list) else part

def parent_of(doc, path):
    *head, last = path.split(".")
    obj = doc
    for part in head:
        obj = obj[key(obj, part)]
    return obj, key(obj, last)

with open(os.path.join(out, "manifest.tsv"), "w", encoding="utf-8") as manifest:
    for i, case in enumerate(spec["cases"]):
        doc = copy.deepcopy(base)
        for path, value in case.get("set", {}).items():
            obj, k = parent_of(doc, path)
            obj[k] = value
        for path in case.get("delete", []):
            obj, k = parent_of(doc, path)
            del obj[k]
        name = os.path.join(out, f"case-{i}.json")
        with open(name, "w", encoding="utf-8") as fh:
            json.dump(doc, fh)
        manifest.write(f"{name}\t{case['expect']}\t{case['name']}\n")
PY

N_CASES=0
while IFS=$'\t' read -r file expect name; do
  N_CASES=$((N_CASES + 1))
  run block validate "$file"
  if [ "$CODE" = 1 ] && grep -qF -- "$expect" <<<"$OUT"; then ok "rejects: $name"
  else bad "rejects: $name — exit $CODE, wanted '$expect' in: $OUT"; fi
done < "$TMPROOT/cases/manifest.tsv"
if [ "$N_CASES" -ge 19 ]; then ok "all $N_CASES malformed cases ran"
else bad "only $N_CASES malformed cases ran — was the fixture read?"; fi

# ─── 2. The candidate list and profile ───────────────────────────────────────
echo "candidate list"

export CLARITY_PROBLEM_BOARD_DIR="$TMPROOT/private/problem-board"

# Control first: the identical command, outside any repository, must pass.
expect_code "location outside any repository is accepted (control)" 0 candidates where
mkdir -p "$TMPROOT/somerepo" && git -C "$TMPROOT/somerepo" init -q
run env CLARITY_PROBLEM_BOARD_DIR="$TMPROOT/somerepo/private/pb" python3 "$PB/candidates.py" profile-set "A project"
if [ "$CODE" = 4 ] && [ ! -e "$TMPROOT/somerepo/private/pb/profile.json" ]; then
  ok "location inside a git repository is refused and nothing is written"
else
  bad "location inside a git repository is refused — exit $CODE: $OUT"
fi

expect_code "no profile on the first run" 5 candidates profile
expect_code "the first run creates the profile" 0 candidates profile-set "The weekly meetup" "A booking tool for clinics"
run candidates profile
if [ "$CODE" = 0 ] && grep -qF "A booking tool for clinics" <<<"$OUT"; then ok "a later run reads the profile back"
else bad "a later run reads the profile back — exit $CODE: $OUT"; fi
expect_code "a multi-line project is refused" 2 candidates profile-set $'one\ntwo'

ids_in() {
  candidates list 2>/dev/null \
    | python3 -c 'import json, sys; print(" ".join(c["id"] for c in json.load(sys.stdin)[sys.argv[1]]))' "$1"
}
count_all() {
  candidates list 2>/dev/null \
    | python3 -c 'import json, sys; print(sum(len(v) for v in json.load(sys.stdin).values()))'
}

run candidates add "Newcomers do not return" "The weekly meetup"; A=$OUT
expect_code "mark maybe later" 0 candidates mark "$A" maybe
case " $(ids_in maybe_later) " in
  *" $A "*) ok "maybe later is re-offered on the next run" ;;
  *) bad "maybe later is re-offered on the next run — $A not in maybe_later" ;;
esac
run candidates add "newcomers do NOT return!"
if [ "$CODE" = 0 ] && [ "$OUT" = "$A" ] && [ "$(count_all)" = 1 ]; then
  ok "re-proposing the same title returns the existing entry, no duplicate"
else
  bad "re-proposing the same title — exit $CODE, got '$OUT', total $(count_all)"
fi

mode=$(python3 -c 'import os, sys; print(oct(os.stat(sys.argv[1]).st_mode & 0o777))' "$CLARITY_PROBLEM_BOARD_DIR/candidates.json")
[ "$mode" = "0o600" ] && ok "the list file is readable by its owner only" || bad "list file mode is $mode, want 0o600"

run candidates add "Clinic double-bookings"; B=$OUT
expect_code "mark reject" 0 candidates mark "$B" reject
expect_code "a rejected title is never proposed again" 3 candidates add "Clinic double-bookings"
expect_code "a rejected entry cannot be re-marked" 3 candidates mark "$B" maybe
case " $(ids_in maybe_later) $(ids_in proposed) " in
  *" $B "*) bad "a rejected entry is re-offerable" ;;
  *) ok "a rejected entry is in no re-offered group" ;;
esac

DRAFT=3f2b9c1e-7a4d-4e0b-9f6a-2c8d1e5b7a90
run candidates add "Venue contract"; C=$OUT
expect_code "only a selected entry can be recorded as submitted" 3 candidates submitted "$C" "$DRAFT"
expect_code "mark select" 0 candidates mark "$C" select
expect_code "record the emitted block" 0 candidates submitted "$C" "$DRAFT"
expect_code "a submitted title is never proposed again" 3 candidates add "Venue contract"
expect_code "a submitted entry cannot be selected again" 3 candidates mark "$C" select

# Weekly cap of 3 — C (submitted this week) already uses one.
run candidates add "Problem D"; D=$OUT
run candidates add "Problem E"; E=$OUT
run candidates add "Problem F"; F=$OUT
expect_code "second selection this week" 0 candidates mark "$D" select
expect_code "third selection this week" 0 candidates mark "$E" select
expect_code "a fourth selection this week hits the cap" 6 candidates mark "$F" select
case " $(ids_in proposed) " in
  *" $F "*) ok "the refused selection left the entry unchanged" ;;
  *) bad "the refused selection changed the entry's state" ;;
esac

# The member owns their own weekly number; 3 is only the default.
export CLARITY_PROBLEM_BOARD_DIR="$TMPROOT/cap/problem-board"
run candidates cap
[ "$OUT" = "3" ] && ok "the default weekly cap is 3" || bad "default weekly cap is '$OUT', want 3"
expect_code "the member can set their own weekly cap" 0 candidates cap 2
run candidates cap
[ "$OUT" = "2" ] && ok "the member's cap is read back" || bad "cap read back as '$OUT', want 2"
expect_code "a cap below 1 is refused" 2 candidates cap 0
expect_code "setting the cap does not destroy the profile lines" 0 candidates profile-set "A project"
run candidates cap
[ "$OUT" = "2" ] && ok "the cap survives a profile update" || bad "cap after profile-set is '$OUT', want 2"
run candidates profile
grep -qF "A project" <<<"$OUT" && ok "the profile survives a cap change" || bad "profile lost its lines: $OUT"
for t in "Cap one" "Cap two" "Cap three"; do run candidates add "$t"; done
run candidates list
CAP_IDS=$(ids_in proposed)
set -- $CAP_IDS
expect_code "first selection under a cap of 2" 0 candidates mark "$1" select
expect_code "second selection under a cap of 2" 0 candidates mark "$2" select
expect_code "the member's own cap of 2 is enforced" 6 candidates mark "$3" select
expect_code "raising the cap allows the next one" 0 candidates cap 4
expect_code "selection allowed after the cap is raised" 0 candidates mark "$3" select

# Two runs at once must not lose each other's writes (the lock, not just atomic saves).
export CLARITY_PROBLEM_BOARD_DIR="$TMPROOT/race/problem-board"
candidates cap 99 > /dev/null 2>&1
for i in 1 2 3 4 5 6 7 8; do candidates add "Parallel problem $i" > /dev/null 2>&1 & done
wait
TOTAL=$(count_all)
[ "$TOTAL" = "8" ] && ok "8 concurrent adds all survive" || bad "8 concurrent adds left $TOTAL entries — writes were lost"

export CLARITY_PROBLEM_BOARD_DIR="$TMPROOT/race2/problem-board"
candidates cap 3 > /dev/null 2>&1
for i in 1 2 3 4 5 6; do candidates add "Race problem $i" > /dev/null 2>&1; done
for id in $(ids_in proposed); do candidates mark "$id" select > /dev/null 2>&1 & done
wait
SELECTED=$(ids_in selected | wc -w | tr -d ' ')
[ "$SELECTED" = "3" ] && ok "6 concurrent selections stop at the cap of 3" \
  || bad "6 concurrent selections left $SELECTED selected, want 3"

export CLARITY_PROBLEM_BOARD_DIR="$TMPROOT/corrupt/problem-board"
mkdir -p "$CLARITY_PROBLEM_BOARD_DIR"
printf '{"candidates": [' > "$CLARITY_PROBLEM_BOARD_DIR/candidates.json"
cp "$CLARITY_PROBLEM_BOARD_DIR/candidates.json" "$TMPROOT/corrupt.orig"
expect_code "an unreadable list is refused" 7 candidates add "Anything"
if cmp -s "$CLARITY_PROBLEM_BOARD_DIR/candidates.json" "$TMPROOT/corrupt.orig"; then ok "an unreadable list is never overwritten"
else bad "an unreadable list was overwritten"; fi

echo ""
echo "p1319: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
