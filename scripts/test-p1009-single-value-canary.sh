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
#   3. real docs  — on a PINNED snapshot of the real docs: the parser finds the known slots
#                   (gate 7e: a parser returning nothing cannot pass green). The CURRENT live
#                   docs are then scanned for information only — never a failure (see below).
#   4. real-doc mutations — the must-fail controls rebuilt by injecting each evasion into the
#                   pinned copy of the real docs/lean-canvas.md (gate 7d: a fixture with no
#                   neighbours proves less than the real file with all of them)
#
# Why pinned, not live: a finding in a live doc is a WARN by design (CHARTER — it may be a
# deliberate in-progress edit), and pre-commit §13f turns any failure of this suite into a
# blocking ERROR. Failing on live content made a permitted in-progress conflict block every
# unrelated commit that staged the checker, this suite or pre-commit-checks.sh — and an edit
# to a mutation's anchor line in lean-canvas would have done the same.
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

# Fences follow CommonMark: a closer is the SAME char, at least as LONG as the opener, with
# nothing but whitespace after it. A 5-backtick example that shows a 4-backtick block with a
# ```python opener inside must not leave the scanner "inside code" for the rest of the file —
# that hides every real slot after it (exit 0, no slots).
cat > "$TMP/fence-nest.md" <<'EOF2'
## How to write examples

`````md
````md
Open a Python block with:
```python
````
`````

## Unique Value Proposition

<!-- SINGLE-VALUE: page-lead -->

> **Lead A (2026-07-20).** x

> **Lead B (2026-07-22).** y
EOF2
want "a real slot after a nested 5/4/3-backtick example is still scanned" "$(rc_of "$TMP/fence-nest.md")" 2
{ printf '%s\n' '## How to open a block' '' '````md' 'Start with:' '```python' '````' ''; sed -n '/^## Unique/,$p' "$TMP/fence-nest.md"; } > "$TMP/fence-4.md"
want "a real slot after a 4-backtick example showing a bare \`\`\`python opener" "$(rc_of "$TMP/fence-4.md")" 2
# An info string makes a line an OPENER, never a closer: inside a ``` fence, ```python is content.
cat > "$TMP/fence-info.md" <<'EOF2'
## Example

```
```python
<!-- SINGLE-VALUE: page-lead -->

> **Lead A (2026-07-04).** x
> **Lead B (2026-07-11).** y
```
EOF2
want "a fenced example whose body has a \`\`\`python line stays fenced"   "$(rc_of "$TMP/fence-info.md")" 0
# A closer must be the SAME character: a bare ``` inside a ~~~ fence is content.
printf '%s\n' '## Example' '' '~~~md' '```' '<!-- SINGLE-VALUE: page-lead -->' '' \
  '> **Lead A (2026-07-04).** x' '> **Lead B (2026-07-11).** y' '```' '~~~' > "$TMP/fence-char.md"
want "a bare backtick fence line inside a ~~~ fence stays fenced"         "$(rc_of "$TMP/fence-char.md")" 0

# Retirement propagates through nesting: a note quoted inside a [FALLBACK] callout belongs
# to the retired callout, however deep. Outdenting restores the enclosing state.
printf '%s\n' '## UVP' '' '<!-- SINGLE-VALUE: page-lead -->' '' \
  '> **A (2026-07-20).** live' \
  '>> **[FALLBACK] B (2026-07-22).** retired' \
  '>>> **Historical note (2026-07-23).** subordinate to B' \
  '>>>> **Deeper note (2026-07-25).** still inside B, via an untagged parent' > "$TMP/nest-retired.md"
want "a deeper quote inside a retired nested callout inherits the retirement" "$(rc_of "$TMP/nest-retired.md")" 0
{ cat "$TMP/nest-retired.md"; printf '%s\n' '> **D (2026-07-24).** back at the top level'; } > "$TMP/nest-outdent1.md"
want "control: outdent to the top level, a new dated lead counts again"   "$(rc_of "$TMP/nest-outdent1.md")" 2
{ cat "$TMP/nest-retired.md"; printf '%s\n' '>> **E (2026-07-24).** sibling of B, under live A'; } > "$TMP/nest-outdent2.md"
want "control: outdent to B's depth, a dated lead under live A counts"     "$(rc_of "$TMP/nest-outdent2.md")" 2

echo
echo "== 3. real docs: a PINNED snapshot of the real docs, parsed for the known slots =="
# lean-canvas and CHARTER as of main on 2026-10-13, the base the section-4 anchors were written
# against. A pinned copy keeps every assertion below deterministic: a later
# edit to the live docs (an in-progress conflict, a reworded anchor line) cannot fail this suite.
# Bump it only together with the section-4 anchors, and only to a commit on main.
PIN=8184815bdae7701a073553badc11e4869d0cae5f
LC="$TMP/pinned-lean-canvas.md"; CH="$TMP/pinned-CHARTER.md"
if git -C "$ROOT" show "$PIN:docs/lean-canvas.md" > "$LC" 2>/dev/null \
   && git -C "$ROOT" show "$PIN:docs/CHARTER.md" > "$CH" 2>/dev/null; then
  PINNED=1
  ok "loaded the pinned real docs from ${PIN:0:9} ($(wc -l < "$LC" | tr -d ' ') + $(wc -l < "$CH" | tr -d ' ') lines)"
else
  PINNED=0
  bad "pinned commit ${PIN:0:9} is not in this clone (shallow?) — sections 3 and 4 cannot run"
fi
if [ "$PINNED" = 1 ]; then
  slots="$(python3 "$CHECKER" --list "$LC" 2>&1 | sed -n "s/^slot '\([^']*\)'.*/\1/p" | sort | tr '\n' ' ')"
  want "--list finds the three known lean-canvas slots" "$slots" "active-channel active-market-focus page-lead "
  want "--list finds no slot in CHARTER.md (its marker is a fenced example)" \
       "$(python3 "$CHECKER" --list "$CH" 2>&1 | grep -c "^slot '")" 0
fi

# The CURRENT live docs: reported, never counted. A live finding is a WARN by design (CHARTER) and
# §13e already reports it for any staged doc; counting it here made §13f turn a permitted
# in-progress conflict into a blocking ERROR on unrelated commits.
REAL_DOCS=()
while IFS= read -r f; do REAL_DOCS+=("$ROOT/$f"); done < <(git -C "$ROOT" grep -l 'SINGLE-VALUE:' -- 'docs/*.md' 'features/*.md')
if [ "${#REAL_DOCS[@]}" -eq 0 ]; then
  echo "  info no tracked docs/ or features/ file carries a SINGLE-VALUE marker — live scan skipped"
else
  out="$(python3 "$CHECKER" "${REAL_DOCS[@]}" 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "  info live scan: ${#REAL_DOCS[@]} marker-carrying docs, every slot holds one lead"
  else
    echo "  WARN live scan (exit $rc, informational — not a suite failure; reconcile before it ships):"
    printf '%s\n' "$out" | sed 's/^/       /'
  fi
fi

if [ "$PINNED" = 1 ]; then   # section 4 needs the pinned copy; its absence already failed above
echo
echo "== 4. real-doc mutations: each evasion injected into the pinned copy of docs/lean-canvas.md =="
# mutate NAME TEXT PATTERN [blank] — insert TEXT after the first line containing PATTERN.
mutate() {
  local name="$1" text="$2" pat="$3" sep="${4:-blank}"
  awk -v ins="$text" -v pat="$pat" -v sep="$sep" '
    { print }
    !done && index($0, pat) { if (sep == "blank") print ""; print ins; done = 1 }
  ' "$LC" > "$TMP/lc-$name.md"
  if cmp -s "$LC" "$TMP/lc-$name.md"; then bad "mutation $name did not apply — its anchor line is not in the pinned doc"; fi
}
want "unmutated pinned copy of the real doc is clean" "$(rc_of "$LC")" 0
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
fi

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
newrepo() {
  git -C "$1" init -q && git -C "$1" config user.email t@example.invalid && git -C "$1" config user.name t
  # Pinned to git's default, so the non-ASCII case below cannot pass just because a
  # host's global config happens to turn path quoting off.
  git -C "$1" config core.quotepath true
}
newrepo "$REPO"
run13e() {
  # The block needs these from the surrounding script; nothing else. STAGED_FILES is built
  # exactly as pre-commit-checks.sh builds it (default quoting), since §13e runs beside it.
  ( cd "${1:-$REPO}" && STAGED_FILES="$(git diff --cached --name-only --diff-filter=d)" \
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
git -C "$REPO" rm -q --cached docs/plain.md
# A non-ASCII filename arrives C-quoted ("\303\251...") under git's default core.quotepath, and
# `git show ":<quoted>"` then fails. That must not read as an unreadable/unmerged path.
printf '# plain\n' > "$REPO/docs/résumé.md"; git -C "$REPO" add "docs/résumé.md"
o="$(run13e)"
case "$o" in *"ERRORS=0 WARNINGS=0"*) ok "staged non-ASCII-named markdown without a marker → no error" ;; *) bad "non-ASCII-named markdown misreported: $o" ;; esac
git -C "$REPO" rm -q --cached "docs/résumé.md"
cp "$TMP/control.md" "$REPO/docs/stratégie.md"; git -C "$REPO" add "docs/stratégie.md"
o="$(run13e)"
case "$o" in *"ERRORS=0 WARNINGS=1"*) ok "staged non-ASCII-named marker doc with two leads → scanned, WARN" ;; *) bad "non-ASCII-named marker doc not scanned: $o" ;; esac
git -C "$REPO" rm -q --cached "docs/stratégie.md"
# core.quotepath=false alone is not enough: git still C-quotes a name containing `"`, `\` or a
# control character. Only NUL-delimited output (-z) prints it verbatim.
cp "$TMP/control.md" "$REPO/docs/the \"lead\".md"; git -C "$REPO" add "docs/the \"lead\".md"
o="$(run13e)"
case "$o" in *"ERRORS=0 WARNINGS=1"*) ok "staged marker doc with a double quote in its name → scanned, WARN" ;; *) bad "double-quote-named marker doc not scanned: $o" ;; esac
git -C "$REPO" rm -q --cached "docs/the \"lead\".md"
# The ERROR for a genuinely unreadable path must survive the fix: a conflicted merge leaves the
# doc unmerged (no stage-0 entry), which is exactly when competing leads land.
REPO2="$TMP/repo2"; mkdir -p "$REPO2/scripts" "$REPO2/docs"; cp "$CHECKER" "$REPO2/scripts/"; newrepo "$REPO2"
( cd "$REPO2" && printf 'base\n' > docs/m.md && git add docs/m.md scripts && git commit -qm base \
  && git checkout -qb side && printf 'side\n' > docs/m.md && git commit -qam side \
  && git checkout -q - && printf 'main\n' > docs/m.md && git commit -qam main \
  && { git merge -q side >/dev/null 2>&1 || true; } )
if git -C "$REPO2" ls-files -u -- docs/m.md | grep -c . >/dev/null; then
  o="$(run13e "$REPO2")"
  case "$o" in *"could not read staged content"*"ERRORS=1"*) ok "unmerged staged markdown → still an ERROR" ;; *) bad "unmerged staged markdown not reported as an ERROR: $o" ;; esac
else
  bad "could not build the unmerged-path fixture — the ERROR path went untested"
fi

echo
echo "== $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
