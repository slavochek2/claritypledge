#!/usr/bin/env bash
# test-pipeline-gates.sh — red/green canary for the P1246 deterministic layer.
#
# Every gate here is asserted in BOTH directions, because epistemic.md gate 7
# says a gate you have not watched FAIL is unproven, and gate 7c says a gate you
# have not watched PASS legitimate work is unmeasured. One direction alone is
# how you ship a control that is either decoration or an obstacle.
#
#   A. Override is not forgeable — no tty refuses, a real pty accepts, junk is
#      rejected even at a real pty.
#   B. Closure gate blocks an unticked spec and passes a ticked one.
#   C. Closure gate FAILS CLOSED when its own script is missing.
#   D. --spec-file fails closed on an unreadable path (never falls back).
#   E. Intent gate: refuses no-framing, passes framing, exempts bugs, honours
#      cold-start, fails closed on an unreadable file.
#   F. Manual-close hook blocks hand-rolled closes and allows everything else.
#   G. Stranding report: fires on an interrupted ship, silent when clean.
#   H. Absorbed-by arm (P1309): a spec delivered under another spec's number
#      passes on its absorber's evidence, and on nothing weaker.
#
# Hermetic: scratch repos under mktemp, no network, no remote, never touches the
# real repo's state.

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

FAILURES=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; FAILURES=$((FAILURES + 1)); }

# A real pty via script(1). READ THIS BEFORE TRUSTING WHAT IT PROVES.
#
# This helper was originally introduced as "a human at a terminal", and the A2
# case below was read as evidence that only a human can pass the override. That
# was wrong, and the error was structural: script(1) is exactly how an AGENT
# obtains a pty, so this helper is the bypass, not the human. An oracle built out
# of the mechanism under test cannot detect that mechanism (CLAUDE.md: "name the
# oracle and check it is independent of the thing under test").
#
# What these cases actually establish is the mechanics of the prompt: it reads
# from /dev/tty, accepts a substantive reason, rejects a junk one. That is worth
# pinning. What they do NOT establish is that an agent cannot pass it — A4 below
# pins the opposite, deliberately.
#
# The sleeps let the pty settle before and after the line is delivered; without
# them the read races and returns EOF, which looks exactly like a refusal and
# would make this canary lie in the SAFE direction.
# PORTABILITY, and why it is not cosmetic. script(1) takes different arguments on
# BSD (macOS: `script -q <file> <cmd> <args...>`) and util-linux (CI:
# `script -q -c "<cmd>" <file>`). This helper was written on macOS only, so on the
# Linux runner all three override cases died with "script: unexpected number of
# arguments" — and A4's failure text reads "the bypass no longer works — GOOD
# NEWS", i.e. a broken helper announced itself as a security improvement. That is
# the canary lying in the UNSAFE direction, which is the one direction it must
# never lie in.
#
# So: detect the flavour, and if neither form works, fail loudly rather than let
# any case interpret an unrunnable helper as a verdict.
# `</dev/null` on BOTH probes is load-bearing: script(1) runs tcgetattr on stdin,
# and in an agent shell stdin is a SOCKET, so the probe dies with
# "tcgetattr/ioctl: Operation not supported on socket" and reports the platform as
# unsupported — on the very platform it works on. Measured 2026-09-08: identical
# probe returns 1 with inherited stdin and 0 with </dev/null.
PTY_FLAVOUR=""
if script -q -c true /dev/null </dev/null >/dev/null 2>&1; then
  PTY_FLAVOUR="util-linux"
elif script -q /dev/null true </dev/null >/dev/null 2>&1; then
  PTY_FLAVOUR="bsd"
fi

# pty_feed <reason> <shell command string>
pty_feed() {
  local reason="$1" cmd="$2"
  case "$PTY_FLAVOUR" in
    util-linux) { sleep 0.4; printf '%s\n' "$reason"; sleep 0.3; } | script -q -c "$cmd" /dev/null 2>&1 | tr -d '\r' ;;
    bsd)        { sleep 0.4; printf '%s\n' "$reason"; sleep 0.3; } | script -q /dev/null bash -c "$cmd" 2>&1 | tr -d '\r' ;;
    *)          echo "PTY_UNAVAILABLE" ;;
  esac
}

# ── A. Override ─────────────────────────────────────────────────────────────
cat > "$SCRATCH/ovr.sh" <<'EOF'
#!/usr/bin/env bash
set -u
. "$1/scripts/lib/gate-override.sh"
gate_override_tty_available && echo "AVAIL=yes" || echo "AVAIL=no"
if r="$(gate_override_capture p9999 "closure gate")"; then echo "CAPTURED=[$r]"; else echo "REFUSED"; fi
EOF
chmod +x "$SCRATCH/ovr.sh"

if [[ -z "$PTY_FLAVOUR" ]]; then
  fail "A0: no usable script(1) on this platform — the override cases below cannot run, and must not be read as verdicts"
else
  pass "A0: pty helper available (flavour: $PTY_FLAVOUR)"
fi

out="$("$SCRATCH/ovr.sh" "$REPO_ROOT" 2>/dev/null)"
if [[ "$out" == *"AVAIL=no"* && "$out" == *"REFUSED"* ]]; then
  pass "A1: no controlling terminal (agent shell) — override refused"
else
  fail "A1: override did not refuse without a tty: $out"
fi

out="$(pty_feed "criteria 3-6 retired, reason in prose" "'$SCRATCH/ovr.sh' '$REPO_ROOT'")"
if [[ "$out" == *"AVAIL=yes"* && "$out" == *"CAPTURED=[criteria 3-6 retired, reason in prose]"* ]]; then
  pass "A2: prompt mechanics — a pty + substantive reason is accepted"
else
  fail "A2: override did not accept at a real pty: $out"
fi

out="$(pty_feed "ok" "'$SCRATCH/ovr.sh' '$REPO_ROOT'")"
if [[ "$out" == *"AVAIL=yes"* && "$out" == *"REFUSED"* ]]; then
  pass "A3: prompt mechanics — a 2-char reason is refused even at a pty"
else
  fail "A3: a 2-char reason was accepted: $out"
fi

# A4. KNOWN LIMITATION, pinned on purpose (2026-09-08 adversarial review).
#
# An agent CAN close a spec on a red gate by wrapping its own command in
# script(1). This case asserts that the bypass WORKS, which is an unusual thing
# to assert — the point is that the limitation is documented and regression-
# tested rather than quietly believed away. If someone later devises a local
# defence, this case goes red and forces the docs in gate-override.sh to be
# updated with it, instead of the old false claim silently coming back.
#
# The real boundary is .github/workflows/closure-gate.yml, which must be a
# REQUIRED status check on main to be worth anything. It is not one yet.
A4_R="$SCRATCH/a4"; mkdir -p "$A4_R"
mk_repo_a4() {
  mkdir -p "$1/scripts/lib" "$1/features/done/2026-09-08"
  cp "$REPO_ROOT/scripts/git-ops.sh" "$REPO_ROOT/scripts/ship-gates.sh" "$1/scripts/"
  cp "$REPO_ROOT/scripts/lib/gate-override.sh" "$1/scripts/lib/"
  chmod +x "$1/scripts/git-ops.sh" "$1/scripts/ship-gates.sh"
  : > "$1/features/done/2026-09-08/.gitkeep"
  ( cd "$1" && git init -q && git config user.email c@t && git config user.name c \
    && git config commit.gpgsign false && echo s > README.md && git add -A \
    && git commit -qm seed && git branch -M main \
    && git checkout -q -b feature/p777-demo && echo x > w.txt && git add w.txt \
    && git commit -qm "p777: work" && git checkout -q main ) >/dev/null 2>&1
  printf -- '---\nstatus: qa\ntype: task\npipeline_ran: [dev]\n---\n# p777\n## Done-When\n- [ ] UNTICKED\n' > "$1/features/p777_demo.md"
  ( cd "$1" && git add features/p777_demo.md && git commit -qm "chore: add p777 spec" ) >/dev/null 2>&1
  printf '{"type": "code", "pn": "p777", "branch": "feature/p777-demo", "sha": "x", "timestamp": "t"}\n' >> "$1/.git/.finish-reviewed"
}
mk_repo_a4 "$A4_R"
pty_feed "agent typed this, no human present" \
  "cd '$A4_R' && bash scripts/git-ops.sh ship p777 --override" >"$SCRATCH/a4.log" 2>&1
if ls "$A4_R"/features/done/*/p777_demo.md >/dev/null 2>&1; then
  pass "A4: KNOWN LIMITATION holds — an agent CAN pass the override via script(1); this prompt is friction + audit, not a boundary"
else
  if grep -q 'PTY_UNAVAILABLE\|unexpected number of arguments' "$SCRATCH/a4.log" 2>/dev/null; then
    fail "A4: the pty helper could not run — this is a BROKEN CANARY, not evidence the bypass is closed"
  else
    fail "A4: the script(1) bypass no longer works — GOOD NEWS, but gate-override.sh's documented limitation is now stale; update it and this case"
  fi
fi

# ── Scratch repo for the ship-path cases ────────────────────────────────────
mk_repo() {
  local d="$1"
  mkdir -p "$d/scripts/lib" "$d/features/done/2026-09-08"
  cp "$REPO_ROOT/scripts/git-ops.sh"            "$d/scripts/"
  cp "$REPO_ROOT/scripts/ship-gates.sh"         "$d/scripts/"
  cp "$REPO_ROOT/scripts/lib/gate-override.sh"  "$d/scripts/lib/"
  chmod +x "$d/scripts/git-ops.sh" "$d/scripts/ship-gates.sh"
  : > "$d/features/done/2026-09-08/.gitkeep"
  (
    cd "$d"
    git init -q; git config user.email c@t; git config user.name c
    git config commit.gpgsign false
    echo seed > README.md
    git add -A; git commit -qm seed; git branch -M main
  ) >/dev/null 2>&1
}

# spec_fixture <dir> <pn> <ticked|unticked>
spec_fixture() {
  local d="$1" pn="$2" state="$3"
  local box="[x]"; [[ "$state" == unticked ]] && box="[ ]"
  cat > "$d/features/${pn}_demo.md" <<EOF
---
status: qa
type: task
rank: 1
delivery_stage: dev
pipeline_ran: [dev]
---
# ${pn}: Demo

> Founder framing, verbatim: *"this is a long enough sentence to satisfy the intent gate."*

## Done-When

- ${box} the criterion
EOF
  ( cd "$d" && git checkout -q -b "feature/${pn}-demo" && echo x > "${pn}.txt" \
    && git add "${pn}.txt" && git commit -qm "${pn}: work" && git checkout -q main \
    && git add "features/${pn}_demo.md" && git commit -qm "chore: add ${pn} spec" ) >/dev/null 2>&1
  printf '{"type": "code", "pn": "%s", "branch": "feature/%s-demo", "sha": "%s", "timestamp": "%s", "issues_found": 0, "issues_fixed": 0}\n' \
    "$pn" "$pn" "$(cd "$d" && git rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >> "$d/.git/.finish-reviewed"
}

# ── B. Closure gate blocks unticked, passes ticked ──────────────────────────
R1="$SCRATCH/r1"; mk_repo "$R1"
spec_fixture "$R1" p1043 unticked
( cd "$R1" && bash scripts/git-ops.sh ship p1043 ) >"$SCRATCH/b1.log" 2>&1; rc=$?
if [[ $rc -ne 0 ]] && grep -q 'unticked completion item' "$SCRATCH/b1.log" \
   && [[ -f "$R1/features/p1043_demo.md" ]]; then
  pass "B1: a spec with an unticked box cannot be closed (exit $rc, spec not moved)"
else
  fail "B1: unticked spec was not blocked (exit $rc)"; sed 's/^/    /' "$SCRATCH/b1.log" >&2
fi

# Names the recovery AND the override command. git.md records that an un-named
# recovery recipe gets re-invented badly (a `git commit --amend` on the shared
# checkout), so the refusal has to carry both.
if grep -q -- '--override' "$SCRATCH/b1.log" && grep -q 'Fix the artifact' "$SCRATCH/b1.log"; then
  pass "B2: the refusal names both the fix and the override recipe, rather than leaving them to be re-derived"
else
  fail "B2: refusal did not name the fix and the override path"
fi

R2="$SCRATCH/r2"; mk_repo "$R2"
spec_fixture "$R2" p1044 ticked
( cd "$R2" && bash scripts/git-ops.sh ship p1044 ) >"$SCRATCH/b3.log" 2>&1; rc=$?
if [[ $rc -eq 0 ]] && ls "$R2"/features/done/*/p1044_demo.md >/dev/null 2>&1; then
  pass "B3: a fully-ticked spec still ships (the gate is not an obstacle)"
else
  fail "B3: a well-formed spec was refused (exit $rc)"; sed 's/^/    /' "$SCRATCH/b3.log" >&2
fi

# ── B4. A refused ship must leave NO stale journal ──────────────────────────
# ship_init_journal runs before the gate on the branch route, so a refusal used
# to leave a journal behind — which pipeline-strandings.sh then reported as
# "INTERRUPTED SHIP ... converge with --resume". Nothing was interrupted and the
# advice looped. A gate whose refusal manufactures a false alarm in the repo's
# own monitoring is worse than no monitoring.
if [[ -d "$R1/.claude/worktrees/.ship-journal" ]] && \
   ls "$R1/.claude/worktrees/.ship-journal/"*.json >/dev/null 2>&1; then
  fail "B4: the refused ship (B1) left a stale journal: $(ls "$R1/.claude/worktrees/.ship-journal/")"
else
  pass "B4: a gate-refused ship leaves no journal — no false 'INTERRUPTED SHIP' in the strandings report"
fi

# ── C. Fail closed when the gate script is missing ──────────────────────────
R3="$SCRATCH/r3"; mk_repo "$R3"
spec_fixture "$R3" p1045 ticked
rm -f "$R3/scripts/ship-gates.sh"
( cd "$R3" && bash scripts/git-ops.sh ship p1045 ) >"$SCRATCH/c1.log" 2>&1; rc=$?
if [[ $rc -ne 0 ]] && grep -q 'cannot run closure gates' "$SCRATCH/c1.log" \
   && [[ -f "$R3/features/p1045_demo.md" ]]; then
  pass "C1: a missing gate script DENIES the close (exit $rc) — deleting the gate is not a way past it"
else
  fail "C1: missing gate script did not fail closed (exit $rc)"; sed 's/^/    /' "$SCRATCH/c1.log" >&2
fi

# ── D. --spec-file fails closed ─────────────────────────────────────────────
( cd "$REPO_ROOT" && bash scripts/ship-gates.sh p9999 --spec-file features/nope.md --only 2.5 ) \
  >"$SCRATCH/d1.log" 2>&1; rc=$?
if [[ $rc -ne 0 ]] && grep -q 'spec not found' "$SCRATCH/d1.log"; then
  pass "D1: --spec-file on an unreadable path FAILS (exit $rc) — no silent fall-back to another spec"
else
  fail "D1: --spec-file fell back or passed (exit $rc)"
fi

# ── D2. --only must FAIL CLOSED on an unknown gate id ───────────────────────
# Before 2026-09-08 an unrecognized id matched no gate, every block was skipped,
# and the script exited 0 having checked nothing — silently, zero bytes of output.
( cd "$REPO_ROOT" && bash scripts/ship-gates.sh p9999 --only 99.9 ) >"$SCRATCH/d2.log" 2>&1; rc=$?
if [[ $rc -ne 0 ]] && grep -q 'unknown gate' "$SCRATCH/d2.log"; then
  pass "D2: --only with an unknown gate id FAILS (exit $rc) — it cannot silently disable every gate"
else
  fail "D2: --only 99.9 returned $rc — the flag still fails open"
fi

# ── D3. A forged ship journal must NOT skip the closure gate ────────────────
# The journal is a plain unauthenticated file. Naming a spec_file that does not
# exist used to hit the "moved but unflagged" arm, skip the gate entirely, and
# still let Phase 1 cherry-pick the branch's commits onto main — ungated code,
# measured landing on main 2026-09-08. The skip predicate now reads the
# filesystem (is a closed copy actually in features/done/?) instead.
R5="$SCRATCH/r5"; mk_repo "$R5"
spec_fixture "$R5" p1046 unticked
( cd "$R5" && echo PAYLOAD > payload.txt && git checkout -q feature/p1046-demo \
  && git add payload.txt && git commit -qm "p1046: unreviewed" && git checkout -q main ) >/dev/null 2>&1
mkdir -p "$R5/.claude/worktrees/.ship-journal"
cat > "$R5/.claude/worktrees/.ship-journal/p1046.json" <<EOF
{"pn":"p1046","source_branch":"feature/p1046-demo","spec_file":"features/DOES_NOT_EXIST.md","spec_closed":false,"commits":[{"source_sha":"$( cd "$R5" && git rev-parse feature/p1046-demo )","landed_sha":null}]}
EOF
( cd "$R5" && bash scripts/git-ops.sh ship p1046 --resume ) >"$SCRATCH/d3.log" 2>&1
if grep -q 'GATE 2.5' "$SCRATCH/d3.log" && ! ( cd "$R5" && git cat-file -e main:payload.txt 2>/dev/null ); then
  pass "D3: a forged journal does NOT skip the gate, and no ungated code reaches main"
else
  fail "D3: forged journal bypassed the closure gate (gate lines: $(grep -c 'GATE 2.5' "$SCRATCH/d3.log"), payload on main: $( cd "$R5" && git cat-file -e main:payload.txt 2>/dev/null && echo yes || echo no ))"
fi

# ── H. Absorbed-by arm (P1309) ──────────────────────────────────────────────
# H1 and H9 are legitimate closes that MUST pass (epistemic.md gate 7c: a gate
# with only reject cases has an unmeasured false-positive rate). Every other
# case is one way to fake an absorbed close, and each must be refused with its
# own reason.
#
# abs_spec <repo> <path> <pn> <pipeline_ran items> <box: [x] or [ ]> <frontmatter line> <body line>
abs_spec() {
  local d="$1" path="$2" pn="$3" ran="$4" box="$5" extra="$6" body="$7"
  mkdir -p "$d/$(dirname "$path")"
  cat > "$d/$path" <<EOF
---
status: qa
type: task
rank: 1
pipeline_ran: [${ran}]
${extra}
---
# ${pn}: Demo

> Founder framing, verbatim: *"this is a long enough sentence to satisfy the intent gate."*

${body}

## Done-When

- ${box} the criterion
EOF
}
abs_review() {
  printf '{"type": "code", "pn": "%s", "branch": "main", "sha": "0", "timestamp": "%s", "issues_found": 0, "issues_fixed": 0}\n' \
    "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$1/.git/.finish-reviewed"
}
# abs_case <name> — a fresh repo holding a VALID pair: absorber p2001 SHIPPED
# (a copy under features/done/, dev run, `absorbs: [p2000]`, reviewed) and the
# absorbed p2000 (no run of its own, every box ticked, `absorbed_by: p2001`).
# Each case then breaks exactly one thing.
ABS_DONE=features/done/2026-09-08
abs_case() {
  local d="$SCRATCH/$1"; mk_repo "$d"
  abs_spec "$d" "$ABS_DONE/p2001_absorber.md" p2001 "create-spec, dev" "[x]" "absorbs: [p2000]" "Delivers everything p2000 asked for."
  abs_spec "$d" features/p2000_absorbed.md p2000 "create-spec" "[x]" "absorbed_by: p2001" "Scope delivered by P2001."
  abs_review "$d" p2001
  echo "$d"
}
abs_gate() { local d="$1"; shift; ( cd "$d" && bash scripts/ship-gates.sh "$@" ) >"$SCRATCH/h.log" 2>&1; echo $?; }

d="$(abs_case h1)"; rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -eq 0 ]] && grep -q 'GATE 2.5\] PASS.*absorbing spec p2001' "$SCRATCH/h.log" \
   && grep -q 'GATE 2.7\] PASS.*absorbing spec p2001' "$SCRATCH/h.log"; then
  pass "H1: an absorbed spec passes 2.5 and 2.7 on its absorber's run and review, and says so"
else
  fail "H1: a legitimate absorbed close was refused (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

d="$(abs_case h2)"; abs_spec "$d" features/p2000_absorbed.md p2000 "create-spec" "[x]" "absorbed_by: p2099" "Scope delivered elsewhere."
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'absorbing spec p2099 has not shipped' "$SCRATCH/h.log"; then
  pass "H2: an absorber that does not exist is refused, by name"
else
  fail "H2: a dangling absorbed_by was not refused (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

d="$(abs_case h3)"; abs_spec "$d" "$ABS_DONE/p2001_absorber.md" p2001 "create-spec" "[x]" "absorbs: [p2000]" "Delivers everything p2000 asked for."
rc="$(abs_gate "$d" p2000)"
# The absorber IS reviewed here, so 2.7 is where a borrow-without-qualifying bug
# would show: it must still FAIL. (A mutation that re-allowed the borrow went
# undetected until this assertion existed — the H10 case never reaches it.)
if [[ "$rc" -ne 0 ]] && grep -q 'records no dev, fix or inline run' "$SCRATCH/h.log" \
   && grep -q 'GATE 2.7\] FAIL' "$SCRATCH/h.log"; then
  pass "H3: an absorber with no implementation recorded cannot vouch for anything — not even its review"
else
  fail "H3: an unbuilt absorber was accepted (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# The absorber's prose names p2000 — explicitly as NOT delivered. A mention is
# not a delivery claim; only its own `absorbs:` field is (adversarial review M-1).
d="$(abs_case h4)"; abs_spec "$d" "$ABS_DONE/p2001_absorber.md" p2001 "create-spec, dev" "[x]" "" "Related: p2000 is a follow-up, NOT delivered here."
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'does not list p2000 in its absorbs' "$SCRATCH/h.log" \
   && grep -q 'GATE 2.7\] FAIL' "$SCRATCH/h.log"; then
  pass "H4: a one-sided link is refused — the absorber must LIST the spec in absorbs:, a prose mention does not count"
else
  fail "H4: an absorber that only mentions p2000 in prose was accepted (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

d="$(abs_case h5)"; abs_spec "$d" features/p2000_absorbed.md p2000 "create-spec" "[ ]" "absorbed_by: p2001" "Scope delivered by P2001."
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'unticked completion item' "$SCRATCH/h.log"; then
  pass "H5: absorbed_by never excuses an unticked box"
else
  fail "H5: an absorbed spec with an unticked box passed (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

d="$(abs_case h6)"; abs_spec "$d" features/p2000_absorbed.md p2000 "create-spec" "[x]" "" "No link at all."
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'no implementation is recorded' "$SCRATCH/h.log" && ! grep -q 'absorbed_by does not qualify' "$SCRATCH/h.log"; then
  pass "H6: without absorbed_by the gate behaves exactly as before"
else
  fail "H6: a spec with no absorbed_by changed behaviour (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

d="$(abs_case h7)"; : > "$d/.git/.finish-reviewed"
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'GATE 2.7\] FAIL' "$SCRATCH/h.log"; then
  pass "H7: an unreviewed absorber leaves gate 2.7 failing"
else
  fail "H7: gate 2.7 passed with no review anywhere (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

d="$(abs_case h8)"; abs_spec "$d" features/p2000_absorbed.md p2000 "create-spec" "[x]" "absorbed_by: p2000" "Absorbs itself."
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q "is not another spec's P-number" "$SCRATCH/h.log"; then
  pass "H8: a spec cannot absorb itself"
else
  fail "H8: self-absorption was accepted (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# H9: the CI path. closure-gate.yml gates a pushed close with --spec-file on the
# spec's features/done/ copy and --only 2.5; by then the absorber has usually
# shipped too, so it must be found under features/done/ as well.
d="$(abs_case h9)"
mv "$d/features/p2000_absorbed.md" "$d/$ABS_DONE/"
rc="$(abs_gate "$d" p2000 --spec-file "$ABS_DONE/p2000_absorbed.md" --only 2.5)"
if [[ "$rc" -eq 0 ]] && grep -q 'absorbing spec p2001' "$SCRATCH/h.log"; then
  pass "H9: the CI path (--spec-file, both specs already in features/done) passes a legitimate absorbed close"
else
  fail "H9: CI would refuse a legitimate absorbed close (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# H10 — adversarial review H-1, the worst finding against the first version: the
# spec claims its own dev run AND points absorbed_by at a spec whose only merit
# is a review. The review must not be borrowed, under a full run or --only 2.7.
d="$(abs_case h10)"; abs_spec "$d" features/p2000_absorbed.md p2000 "create-spec, dev" "[x]" "absorbed_by: p2001" "Claims its own work."
rc="$(abs_gate "$d" p2000)"; rc27="$(abs_gate "$d" p2000 --only 2.7)"
if [[ "$rc" -ne 0 && "$rc27" -ne 0 ]] && grep -q 'GATE 2.7\] FAIL' "$SCRATCH/h.log" && ! grep -q 'absorbing spec' "$SCRATCH/h.log"; then
  pass "H10: absorbed_by beside the spec's own dev run borrows nothing — 2.7 FAILS, full run and --only 2.7"
else
  fail "H10: a review was borrowed onto a spec claiming its own work (full rc $rc, --only 2.7 rc $rc27)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# H11 — adversarial review H-2: an absorber that has not shipped may never land.
d="$(abs_case h11)"; mv "$d/$ABS_DONE/p2001_absorber.md" "$d/features/"
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'absorbing spec p2001 has not shipped' "$SCRATCH/h.log"; then
  pass "H11: an absorber still open (not under features/done) cannot vouch — ship it first"
else
  fail "H11: an unshipped absorber was accepted (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# H12 — L-2: the key in the BODY (a syntax example) must not activate the arm.
d="$(abs_case h12)"; abs_spec "$d" features/p2000_absorbed.md p2000 "create-spec" "[x]" "" "Example of the syntax: absorbed_by: p2001"
printf '\nabsorbed_by: p2001\n' >> "$d/features/p2000_absorbed.md"
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'no implementation is recorded' "$SCRATCH/h.log" && ! grep -q 'absorbing spec' "$SCRATCH/h.log"; then
  pass "H12: absorbed_by outside the frontmatter is ignored"
else
  fail "H12: a body-only absorbed_by line activated the arm (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# H13 — M-4: two shipped copies of the absorber are ambiguous, never "pick the first".
d="$(abs_case h13)"; abs_spec "$d" features/done/2026-01-01/p2001_old.md p2001 "create-spec, dev" "[x]" "absorbs: [p2000]" "An older copy."
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'ambiguous' "$SCRATCH/h.log"; then
  pass "H13: an absorber with two copies under features/done is refused as ambiguous"
else
  fail "H13: an ambiguous absorber was resolved to one copy (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# H14 — L-1: the refused value is echoed; status lines must never carry < > or |.
d="$(abs_case h14)"; abs_spec "$d" features/p2000_absorbed.md p2000 "create-spec" "[x]" "absorbed_by: p1 | x > y <z>" "x"
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q "is not another spec's P-number" "$SCRATCH/h.log" && ! grep -E '^\[GATE' "$SCRATCH/h.log" | grep -qE '[<>|]'; then
  pass "H14: a hostile absorbed_by value is refused and echoed without redirect or pipe characters"
else
  fail "H14: output contract broken or value accepted (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# H15/H16 — adversarial review M-2: the legitimate close must go all the way
# through git-ops.sh ship (no-branch route), whose code-presence check looks for
# a "ready for QA" stamp. For an absorbed spec that stamp is the ABSORBER's; a
# "p2000 ready for QA" commit would record work that did not happen under p2000.
d="$(abs_case h15)"
( cd "$d" && git add features && git commit -qm "chore: p2001 ready for QA — the absorber" ) >/dev/null 2>&1
( cd "$d" && bash scripts/git-ops.sh ship p2000 ) >"$SCRATCH/h15.log" 2>&1; rc=$?
if [[ $rc -eq 0 ]] && ls "$d"/features/done/*/p2000_absorbed.md >/dev/null 2>&1; then
  pass "H15: git-ops.sh ship closes a legitimate absorbed spec on the absorber's stamp"
else
  fail "H15: the legitimate absorbed close failed through git-ops.sh ship (exit $rc)"; sed 's/^/    /' "$SCRATCH/h15.log" >&2
fi

d="$(abs_case h16)"
( cd "$d" && git add features && git commit -qm "chore: add specs" ) >/dev/null 2>&1
( cd "$d" && bash scripts/git-ops.sh ship p2000 ) >"$SCRATCH/h16.log" 2>&1; rc=$?
if [[ $rc -ne 0 ]] && grep -q "p2001 ready for QA" "$SCRATCH/h16.log" && [[ -f "$d/features/p2000_absorbed.md" ]]; then
  pass "H16: with no absorber stamp on main, the absorbed close is refused and names the stamp it needs"
else
  fail "H16: an absorbed close went through with no absorber stamp (exit $rc)"; sed 's/^/    /' "$SCRATCH/h16.log" >&2
fi

# ── E. Intent gate ──────────────────────────────────────────────────────────
ig() { ( cd "$REPO_ROOT" && bash scripts/spec-intent-gate.sh "$1" ) >/dev/null 2>&1; echo $?; }

printf -- '---\ntype: task\n---\n# t\n\nProblem: I reckon we should do a thing.\n' > "$SCRATCH/e1.md"
[[ "$(ig "$SCRATCH/e1.md")" == "1" ]] && pass "E1: task spec with no framing REFUSED (exit 1)" \
                                      || fail "E1: no-framing task spec was allowed"

printf -- '---\ntype: task\n---\n# t\n\n> Founder framing, verbatim: *"I want the thing to stop asking me which model every single time."*\n' > "$SCRATCH/e2.md"
[[ "$(ig "$SCRATCH/e2.md")" == "0" ]] && pass "E2: task spec WITH verbatim framing passes" \
                                      || fail "E2: a compliant spec was refused"

printf -- '---\ntype: bug\n---\n# t\n\nProblem: it crashed.\n' > "$SCRATCH/e3.md"
[[ "$(ig "$SCRATCH/e3.md")" == "0" ]] && pass "E3: bug spec exempt (founder decision 2026-09-08)" \
                                      || fail "E3: bug spec was gated"

printf -- '---\ntype: task\nintent: cold-start\n---\n# t\n\nProblem: cold.\n' > "$SCRATCH/e4.md"
[[ "$(ig "$SCRATCH/e4.md")" == "0" ]] && pass "E4: declared cold-start passes" \
                                      || fail "E4: cold-start declaration was refused"

[[ "$(ig "$SCRATCH/does-not-exist.md")" == "1" ]] && pass "E5: unreadable spec FAILS CLOSED (exit 1)" \
                                                  || fail "E5: unreadable spec did not fail closed"

printf -- '---\ntype: task\n---\n# t\n\n> He said "fix it" and left.\n' > "$SCRATCH/e6.md"
[[ "$(ig "$SCRATCH/e6.md")" == "1" ]] && pass "E6: a short quoted fragment does not satisfy the gate" \
                                      || fail "E6: a 6-char quote passed as verbatim framing"

# ── F. Manual-close hook ────────────────────────────────────────────────────
HOOK="$REPO_ROOT/.claude/hooks/block-manual-spec-close.py"
hk() { printf '%s' "$1" | python3 "$HOOK" >/dev/null 2>&1; echo $?; }

[[ "$(hk '{"tool_name":"Bash","tool_input":{"command":"git mv features/p1043_x.md features/done/2026-09-08/"}}')" == "2" ]] \
  && pass "F1: hand-rolled 'git mv' into features/done/ is BLOCKED (exit 2)" || fail "F1: hand close not blocked"
[[ "$(hk '{"tool_name":"Write","tool_input":{"file_path":"features/done/2026-09-08/p999_new.md","content":"x"}}')" == "2" ]] \
  && pass "F2: writing a new spec straight into features/done/ is BLOCKED" || fail "F2: done/ Write not blocked"
[[ "$(hk '{"tool_name":"Bash","tool_input":{"command":"./scripts/git-ops.sh ship p1246"}}')" == "0" ]] \
  && pass "F3: the sanctioned closing path is allowed" || fail "F3: git-ops ship was blocked"
[[ "$(hk '{"tool_name":"Bash","tool_input":{"command":"grep -rn TODO features/ features/done/"}}')" == "0" ]] \
  && pass "F4: reading across features/done/ is allowed" || fail "F4: a read was blocked"
[[ "$(hk 'not json')" == "0" ]] \
  && pass "F5: unparseable input fails OPEN (this hook fronts every Bash call)" || fail "F5: hook failed closed on bad input"

# F6. FALSE POSITIVE, measured live 2026-09-08 within hours of shipping this hook.
# A command that copies a script and then READS an already-closed spec by path was
# refused: the copy matched the move verb, and the already-closed spec path matched
# both the spec pattern and the done-tree pattern at once. Three independent
# questions answered "yes" in one string is co-occurrence, not a move. Being wrong
# here blocks unrelated work in every session, because this hook fronts every Bash
# call in the repo.
_fp_cmd='{"tool_name":"Bash","tool_input":{"command":"cp scripts/ship-gates.sh /tmp/tg.sh \u0026\u0026 bash /tmp/tg.sh p1246 --spec-file features/done/2026-06-10/p1246_demo.md --only 2.5"}}'
[[ "$(hk "$_fp_cmd")" == "0" ]] \
  && pass "F6: copying a script while READING an already-closed spec is allowed (the shipped false positive)" \
  || fail "F6: hook still refuses a read-only diagnostic that merely mentions a closed spec"

# F7. The discriminator must not have opened the real hole: a source spec that is
# NOT yet closed, moving into the done tree, is still refused.
_tp_cmd='{"tool_name":"Bash","tool_input":{"command":"git mv features/p1099_thing.md features/done/2026-09-08/p1099_thing.md"}}'
[[ "$(hk "$_tp_cmd")" == "2" ]] \
  && pass "F7: an un-closed spec moving INTO the done tree is still BLOCKED (exit 2)" \
  || fail "F7: the false-positive fix opened the real hole"

# ── G. Stranding report ─────────────────────────────────────────────────────
R4="$SCRATCH/r4"; mk_repo "$R4"
cp "$REPO_ROOT/scripts/pipeline-strandings.sh" "$R4/scripts/"
chmod +x "$R4/scripts/pipeline-strandings.sh"

out="$( cd "$R4" && ./scripts/pipeline-strandings.sh 2>&1 )"
if [[ -z "$out" ]]; then
  pass "G1: silent when there is nothing to act on (a report that always prints is wallpaper)"
else
  fail "G1: reported on a clean repo: $out"
fi

mkdir -p "$R4/.claude/worktrees/.ship-journal"
echo '{"commits":[]}' > "$R4/.claude/worktrees/.ship-journal/p1234.json"
out="$( cd "$R4" && ./scripts/pipeline-strandings.sh 2>&1 )"
if [[ "$out" == *"INTERRUPTED SHIP"* && "$out" == *"p1234"* && "$out" == *"--resume"* ]]; then
  pass "G2: an abandoned ship journal is reported unasked, with the converge command"
else
  fail "G2: interrupted ship not reported: $out"
fi

out="$( cd "$R4" && ./scripts/pipeline-strandings.sh --strict >/dev/null 2>&1; echo $? )"
[[ "$out" == "1" ]] && pass "G3: --strict exits non-zero when something is stranded" \
                    || fail "G3: --strict returned $out with a strand present"

# ── Result ──────────────────────────────────────────────────────────────────
echo ""
if [[ "$FAILURES" -ne 0 ]]; then
  echo "FAILED: $FAILURES pipeline-gate invariant(s)"
  exit 1
fi
echo "PASS: all P1246 pipeline-gate invariants hold (A0-A4, B1-B4, C1, D1-D3, E1-E6, F1-F5, G1-G3)"
exit 0
