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

# A real pty, so the override's allow-path is proven without a test-mode env var
# (which would be the agent-writable hole the override exists to close). The
# sleeps let script(1)'s pty settle before and after the line is delivered —
# without them the read races the pty and returns EOF, which looks exactly like
# a refusal and would make this canary lie in the safe direction.
pty_feed() {
  local reason="$1"; shift
  { sleep 0.4; printf '%s\n' "$reason"; sleep 0.3; } | script -q /dev/null "$@" 2>&1 | tr -d '\r'
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

out="$("$SCRATCH/ovr.sh" "$REPO_ROOT" 2>/dev/null)"
if [[ "$out" == *"AVAIL=no"* && "$out" == *"REFUSED"* ]]; then
  pass "A1: no controlling terminal (agent shell) — override refused"
else
  fail "A1: override did not refuse without a tty: $out"
fi

out="$(pty_feed "criteria 3-6 retired, reason in prose" "$SCRATCH/ovr.sh" "$REPO_ROOT")"
if [[ "$out" == *"AVAIL=yes"* && "$out" == *"CAPTURED=[criteria 3-6 retired, reason in prose]"* ]]; then
  pass "A2: real terminal + substantive reason — override accepted"
else
  fail "A2: override did not accept at a real pty: $out"
fi

out="$(pty_feed "ok" "$SCRATCH/ovr.sh" "$REPO_ROOT")"
if [[ "$out" == *"AVAIL=yes"* && "$out" == *"REFUSED"* ]]; then
  pass "A3: real terminal + junk reason — still refused"
else
  fail "A3: a 2-char reason was accepted: $out"
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

if grep -q 'real terminal' "$SCRATCH/b1.log"; then
  pass "B2: the refusal names the override recipe rather than leaving it to be re-derived"
else
  fail "B2: refusal did not name the override path"
fi

R2="$SCRATCH/r2"; mk_repo "$R2"
spec_fixture "$R2" p1044 ticked
( cd "$R2" && bash scripts/git-ops.sh ship p1044 ) >"$SCRATCH/b3.log" 2>&1; rc=$?
if [[ $rc -eq 0 ]] && ls "$R2"/features/done/*/p1044_demo.md >/dev/null 2>&1; then
  pass "B3: a fully-ticked spec still ships (the gate is not an obstacle)"
else
  fail "B3: a well-formed spec was refused (exit $rc)"; sed 's/^/    /' "$SCRATCH/b3.log" >&2
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
echo "PASS: all P1246 pipeline-gate invariants hold (A1-A3, B1-B3, C1, D1, E1-E6, F1-F5, G1-G3)"
exit 0
