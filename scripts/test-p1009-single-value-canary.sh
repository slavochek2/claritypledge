#!/usr/bin/env bash
# test-p1009-single-value-canary.sh — the SINGLE-VALUE canary must catch the real shapes of a
# competing lead, and must keep leaving the sanctioned shapes alone.
#
# scripts/check-single-value-slots.py guards `<!-- SINGLE-VALUE: slot -->` sections against a
# second live lead accumulating next to the first (P987). Before P1009 it recognised exactly one
# shape — a top-level `>` callout whose BOLD lead-in carried an ISO date, inside the callout group
# that ended at the first prose line — so eight real shapes of a competing lead exited 0
# (features/p1009_single_value_canary_evasions.md, the table under Problem).
#
# Sections:
#   1. must-FAIL  — one synthetic fixture per evasion row, plus the original control shape
#   2. must-PASS  — the shapes that must stay uncounted (elaboration bullets, bracket-tagged
#                   retirements, fenced examples, prose mentions of the marker)
#   3. real docs  — every tracked doc carrying a marker scans clean, and the parser finds the
#                   known slots (gate 7e: a parser returning nothing cannot pass green)
#   4. real-doc mutations — the must-fail controls rebuilt by injecting each evasion into a COPY
#                   of the real docs/lean-canvas.md (gate 7d: a fixture with no neighbours proves
#                   less than the real file with all of them)
#   5. commit-time derivation — the real `pre-commit-checks.sh` §13e block, extracted and run in a
#                   throwaway repo, scans a staged marker doc OUTSIDE the old five-doc list
#
# Exit 0: all assertions held. Exit 1: at least one did not.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKER="$ROOT/scripts/check-single-value-slots.py"
PRECOMMIT="$ROOT/scripts/pre-commit-checks.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

ok()   { echo "  ok   $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL $1"; fail=$((fail+1)); }
want() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 — expected $3, got $2"; fi; }
rc_of(){ python3 "$CHECKER" "$@" >/dev/null 2>&1; echo $?; }

# A slot as it is really written: heading, marker, the live lead, a bracket-retired fallback,
# the closing prose line that used to end the scan, then a subsection and the next section.
base() {
  cat <<'EOF'
# Doc

## Unique Value Proposition

<!-- SINGLE-VALUE: page-lead -->

> **Page-lead (2026-07-20 — the single hero, UNTESTED).** Lead with the build-the-right-thing wedge.

> **[FALLBACK — subordinate to the 2026-07-20 lead] Key-hire wedge (2026-07-14 — UNTESTED).** Lead with the key-hire wedge.

Everything below is the durable positioning.

**Pitch hook — one question (2026-04-08):** a bold prose paragraph, not a callout.

### Platform

Open-source, free, community-driven.

## Channels

> **Active channel (2026-09-21).** A different slot-less section; never counted.
> **Second dated callout (2026-09-22).** Also outside any slot.
EOF
}

# fixture NAME LINE-TO-INSERT AFTER-PATTERN — insert after the first line matching the pattern.
fixture() {
  local name="$1" insert="$2" after="$3"
  base | awk -v ins="$insert" -v pat="$after" '
    { print }
    !done && index($0, pat) { print ""; print ins; done = 1 }   # awk -v turns \\n into newlines
  ' > "$TMP/$name.md"
}

echo "== 1. must-FAIL: each evasion row is a competing lead (exit 2) =="
base > "$TMP/base.md"
want "baseline slot (one live lead + one [FALLBACK]) is clean"            "$(rc_of "$TMP/base.md")" 0

LIVE='> **Page-lead (2026-07-20'
fixture control      '> **New page-lead (2026-07-22).** Lead with Y.'                         "$LIVE"
fixture row1-body    '> **New page-lead (UNTESTED).** Lead with Y — see decisions.md 2026-07-22.' "$LIVE"
fixture row2-after   '> **New page-lead.** (2026-07-22, UNTESTED) Lead with Y.'                "$LIVE"
fixture row3-human   '> **New page-lead (22 July 2026).** Lead with Y.'                        "$LIVE"
fixture row3-us      '> **New page-lead (July 22, 2026).** Lead with Y.'                       "$LIVE"
fixture row4-line2   '> **New page-lead (UNTESTED).** Lead with Y,\n> per the founder call of 2026-07-22.' "$LIVE"
fixture row5-nested  '>> **New page-lead (2026-07-22).** Lead with Y.'                         "$LIVE"
fixture row6-prose   '> **New page-lead (2026-07-22).** Lead with Y.'                          'Everything below is the durable positioning.'
fixture row6-subsec  '> **New page-lead (2026-07-22).** Lead with Y.'                          'Open-source, free, community-driven.'
fixture row7-premark '> **New page-lead (2026-07-22).** Lead with Y.'                          '## Unique Value Proposition'
fixture row8-bullet  '> - **New page-lead (2026-07-22):** Lead with Y.'                        "$LIVE"
# A nested `>>` lead tucked INSIDE the live lead's own callout is not a sanctioned elaboration
# shape (CHARTER sanctions `> - ` bullets only), so it still counts.
base | awk -v live="$LIVE" '{ print } index($0, live) { print ">> **New page-lead (2026-07-22).** Lead with Y." }' > "$TMP/row5-inside.md"
# The revival sentence is a SENTENCE, not a tag — it must stay counted (2026-07-23 decision).
fixture revival      '> **Dormant no longer — revived as THE lead (2026-07-22).** Lead with Y.' "$LIVE"

want "control: plain second dated lead"                                   "$(rc_of "$TMP/control.md")" 2
want "row 1: date in the body, not the bold span"                         "$(rc_of "$TMP/row1-body.md")" 2
want "row 2: date after the bold"                                         "$(rc_of "$TMP/row2-after.md")" 2
want "row 3: human-format date (22 July 2026)"                            "$(rc_of "$TMP/row3-human.md")" 2
want "row 3: human-format date (July 22, 2026)"                           "$(rc_of "$TMP/row3-us.md")" 2
want "row 4: date on the second blockquote line"                          "$(rc_of "$TMP/row4-line2.md")" 2
want "row 5: nested (double) blockquote, own block"                                "$(rc_of "$TMP/row5-nested.md")" 2
want "row 5: nested blockquote inside the live lead's callout"            "$(rc_of "$TMP/row5-inside.md")" 2
want "row 6: placed after the group's closing prose"                      "$(rc_of "$TMP/row6-prose.md")" 2
want "row 6: placed under a subsection of the slot's section"             "$(rc_of "$TMP/row6-subsec.md")" 2
want "row 7: placed between heading and marker"                           "$(rc_of "$TMP/row7-premark.md")" 2
want "row 8: standalone dash-bullet lead"                               "$(rc_of "$TMP/row8-bullet.md")" 2
want "revival sentence is not a retirement tag"                           "$(rc_of "$TMP/revival.md")" 2

echo
echo "== 2. must-PASS: sanctioned shapes stay uncounted (exit 0) =="
# An elaboration bullet is ATTACHED to its lead (no blank line between), so fixture() — which
# inserts a blank line and would make the bullets standalone — cannot build it.
base | awk -v live="$LIVE" '{ print } index($0, live) {
  print "> - **Targeting splits (2026-08-10, UNTESTED — subordinate to the lead above).** detail"
  print "> - **Size range is open (2026-09-03).** detail" }' > "$TMP/elab-bullets.md"
want "dated dash-bullet elaborations attached under the live lead"     "$(rc_of "$TMP/elab-bullets.md")" 0

fixture tagged '> **[SUPERSEDED 2026-07-22 → above] Old lead (2026-07-01).** x\n>\n> - **What changed 2026-08-10 (subordinate).** y\n>> **Nested note (2026-08-11).** z\n\n> **[Dormant 2026-08-07 — revivable] Direct-first (2026-07-20).** x\n> **[Parked] Therapy (2026-06-29).** x\n> **[Demoted 2026-07-01] Solo (2026-07-01).** x\n\n> - **[Dormant — superseded 2026-07-14, revivable] Solo-AI-builder (2026-07-01):** x' "$LIVE"
want "bracket-tagged retirements, and everything nested inside them"      "$(rc_of "$TMP/tagged.md")" 0

fixture undated '> **"The first tool that measures whether understanding actually happened."**' "$LIVE"
want "an undated bold callout (tagline) is not a dated directive"         "$(rc_of "$TMP/undated.md")" 0

cat > "$TMP/fenced.md" <<'EOF'
## Single-valued slots

Mark each slot like this:

```
<!-- SINGLE-VALUE: page-lead -->

> **Lead A (2026-07-04).** x
> **Lead B (2026-07-11).** y
```

> **Example A (2026-07-04).** outside the fence, but no real marker owns this section.
> **Example B (2026-07-11).** same.
EOF
want "a marker inside a code fence is an example, not a slot"             "$(rc_of "$TMP/fenced.md")" 0

cat > "$TMP/inline.md" <<'EOF'
## 2026-07-23 decision

**Context:** the audit surfaced §UVP `<!-- SINGLE-VALUE: page-lead -->` carrying three leads.

> **Lead A (2026-07-04).** quoted in a decision entry.
> **Lead B (2026-07-11).** quoted in a decision entry.
EOF
want "a marker mentioned inline in prose is not a slot"                   "$(rc_of "$TMP/inline.md")" 0

echo
echo "== 3. real docs: every tracked marker doc scans clean, and the parser sees the known slots =="
REAL_DOCS=()
while IFS= read -r f; do REAL_DOCS+=("$ROOT/$f"); done < <(git -C "$ROOT" grep -l 'SINGLE-VALUE:' -- 'docs/*.md' 'features/*.md')
case " ${REAL_DOCS[*]} " in
  *"/docs/lean-canvas.md "*) ok "derived doc set includes docs/lean-canvas.md (${#REAL_DOCS[@]} docs)" ;;
  *) bad "derived doc set is missing docs/lean-canvas.md — the derivation returned: ${REAL_DOCS[*]:-nothing}" ;;
esac
out="$(python3 "$CHECKER" "${REAL_DOCS[@]}" 2>&1)"; rc=$?
want "all marker-carrying docs/ + features/ files exit 0 (no new false positives)" "$rc" 0
[ "$rc" -eq 0 ] || printf '%s\n' "$out" | sed 's/^/       /'
slots="$(python3 "$CHECKER" --list "$ROOT/docs/lean-canvas.md" 2>&1 | sed -n "s/^slot '\([^']*\)'.*/\1/p" | sort | tr '\n' ' ')"
want "--list finds the three known lean-canvas slots" "$slots" "active-channel active-market-focus page-lead "
want "--list finds no slot in CHARTER.md (its marker is a fenced example)" \
     "$(python3 "$CHECKER" --list "$ROOT/docs/CHARTER.md" 2>&1 | grep -c "^slot '")" 0

echo
echo "== 4. real-doc mutations: each evasion injected into a COPY of docs/lean-canvas.md =="
LC="$ROOT/docs/lean-canvas.md"
# mutate NAME TEXT PATTERN [blank] — insert TEXT after the first line containing PATTERN.
mutate() {
  local name="$1" text="$2" pat="$3" sep="${4:-blank}"
  awk -v ins="$text" -v pat="$pat" -v sep="$sep" '
    { print }
    !done && index($0, pat) { if (sep == "blank") print ""; print ins; done = 1 }
  ' "$LC" > "$TMP/lc-$name.md"
  if cmp -s "$LC" "$TMP/lc-$name.md"; then bad "mutation $name did not apply — its anchor line is gone from the real doc"; fi
}
want "unmutated copy of the real doc is clean" "$(rc_of "$LC")" 0
mutate uvp-after-group   '> **New page-lead (2026-10-13).** Lead with Y.'           '### Platform *(ClarityPledge)*' none
mutate uvp-body-date     '> **New page-lead (UNTESTED).** Lead with Y, per 2026-10-13.' '> **Page-lead (2026-07-20'
mutate uvp-nested        '>> **New page-lead (13 October 2026).** Lead with Y.'      '> **Page-lead (2026-07-20'
mutate focus-bullet      '> - **New active focus (2026-10-13):** Lead with Y.'       '> **Who (2026-09-21'
mutate focus-premark     '> **New active focus (2026-10-13).** Lead with Y.'         '### Active focus (2026-09-21)'
mutate channel-tail      '> **New active channel (2026-10-13).** Lead with Y.'       '**Primary flywheel (2026-04-11'
mutate channel-revival   '> **Dormant no longer — direct-first revived (2026-10-13).** Lead with Y.' '> **Active channel (2026-09-21)'
for m in uvp-after-group uvp-body-date uvp-nested focus-bullet focus-premark channel-tail channel-revival; do
  want "real lean-canvas + $m → exit 2" "$(rc_of "$TMP/lc-$m.md")" 2
done
# And the sanctioned shapes injected into the real doc still pass.
mutate focus-elab        '> - **Champion seniority (2026-10-13, UNTESTED — subordinate to the lead above).** x' '> **Who (2026-09-21' none
want "real lean-canvas + attached elaboration bullet under the live lead → exit 0" "$(rc_of "$TMP/lc-focus-elab.md")" 0

echo
echo "== 5. commit-time derivation: the real §13e block scans a staged marker doc outside the old list =="
BLOCK="$TMP/13e.sh"
# Stop at §13f (this suite's own canary — extracting it would recurse) or at §14.
awk '/^# 13e\. SINGLE-VALUE/{f=1} /^# (13f|14)\. /{f=0} f' "$PRECOMMIT" > "$BLOCK"
if grep -q 'run_quiet' "$BLOCK"; then
  bad "extracted §13e reaches into the §13f self-test — it would recurse; fix the end anchor"
  : > "$BLOCK"
elif grep -q 'check-single-value-slots.py' "$BLOCK" && grep -q 'SV_STAGED' "$BLOCK"; then
  ok "extracted the §13e block from pre-commit-checks.sh ($(wc -l < "$BLOCK" | tr -d ' ') lines)"
else
  bad "could not extract §13e from pre-commit-checks.sh — its '# 13e. SINGLE-VALUE' anchor moved"
fi
REPO="$TMP/repo"
mkdir -p "$REPO/scripts" "$REPO/docs" "$REPO/features"
cp "$CHECKER" "$REPO/scripts/"
git -C "$REPO" init -q && git -C "$REPO" config user.email t@example.invalid && git -C "$REPO" config user.name t
run13e() {
  # The block needs these from the surrounding script; nothing else.
  ( cd "$REPO" && STAGED_FILES="$(git diff --cached --name-only --diff-filter=d)" \
    RED='' GREEN='' YELLOW='' NC='' ERRORS=0 WARNINGS=0 \
    bash -c 'source "$1"; echo "ERRORS=$ERRORS WARNINGS=$WARNINGS"' _ "$BLOCK" 2>&1 )
}
cp "$TMP/control.md" "$REPO/docs/goals.md"            # a doc the old fixed list never scanned
git -C "$REPO" add docs/goals.md
o="$(run13e)"
case "$o" in *"WARNINGS=1"*) ok "staged docs/goals.md with two leads → WARN" ;; *) bad "staged docs/goals.md with two leads not flagged: $o" ;; esac
git -C "$REPO" rm -q --cached docs/goals.md
cp "$TMP/control.md" "$REPO/features/p9999_x.md"
git -C "$REPO" add features/p9999_x.md
o="$(run13e)"
case "$o" in *"WARNINGS=1"*) ok "staged features/ spec with two leads → WARN" ;; *) bad "staged features/ spec with two leads not flagged: $o" ;; esac
git -C "$REPO" rm -q --cached features/p9999_x.md
cp "$TMP/base.md" "$REPO/docs/CHARTER.md"
git -C "$REPO" add docs/CHARTER.md
o="$(run13e)"
case "$o" in *"ERRORS=0 WARNINGS=0"*) ok "staged clean marker doc → no finding" ;; *) bad "clean marker doc flagged: $o" ;; esac
case "$o" in *"each hold one lead"*) ok "…and it was actually scanned (green line printed)" ;; *) bad "clean marker doc was not scanned: $o" ;; esac
git -C "$REPO" rm -q --cached docs/CHARTER.md
printf '# plain\n' > "$REPO/docs/plain.md"; git -C "$REPO" add docs/plain.md
o="$(run13e)"
case "$o" in *"ERRORS=0 WARNINGS=0"*) ok "staged markdown without a marker → skipped, no error" ;; *) bad "marker-less markdown misreported: $o" ;; esac

echo
echo "== $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
