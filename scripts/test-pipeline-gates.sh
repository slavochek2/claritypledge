#!/usr/bin/env bash
# test-pipeline-gates.sh — red/green canary for the P1246 deterministic layer.
#
# Every gate here is asserted in BOTH directions, because epistemic.md gate 7
# says a gate you have not watched FAIL is unproven, and gate 7c says a gate you
# have not watched PASS legitimate work is unmeasured. One direction alone is
# how you ship a control that is either decoration or an obstacle.
#
#   A. Override (P1444): reason cleaning, --reason required, and a pty grants
#      nothing — the approval step refuses with no keychain present.
#   B. Closure gate blocks an unticked spec and passes a ticked one.
#   C. Closure gate FAILS CLOSED when its own script is missing.
#   D. --spec-file fails closed on an unreadable path (never falls back).
#   E. Intent gate: refuses no-framing, passes framing, exempts bugs, honours
#      cold-start, fails closed on an unreadable file.
#   F. Manual-close hook blocks hand-rolled closes and allows everything else.
#   G. Stranding report: fires on an interrupted ship, silent when clean.
#   H. Absorbed-by arm (P1309): a spec delivered under another spec's number
#      passes on its absorber's evidence, and on nothing weaker.
#   I. Review type follows what the branch changed (P1040): a migration-only
#      branch passes 2.7 on a migrations review; a branch with code still needs
#      a code review.
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
# P1444 replaced the /dev/tty prompt with one keychain dialog. The tty cases that
# lived here (A1-A3 prompt mechanics, A4 "the pty bypass WORKS") described a path
# that no longer exists. What replaces them pins the new contract at the level
# this suite can reach WITHOUT ever touching a real keychain: the scratch repos
# below carry no scripts/lib/keychain.py, so every approval fails closed before
# any dialog could exist. The decision function itself (approve / deny / defeated /
# indeterminate access list) is covered with injected readers in
# scripts/test-p1444-closure-gate.sh.
cat > "$SCRATCH/ovr.sh" <<'EOF'
#!/usr/bin/env bash
set -u
. "$1/scripts/lib/gate-override.sh"
if r="$(gate_override_clean_reason "$2")"; then echo "CLEAN=[$r]"; else echo "REFUSED"; fi
EOF
chmod +x "$SCRATCH/ovr.sh"

if [[ -z "$PTY_FLAVOUR" ]]; then
  fail "A0: no usable script(1) on this platform — A4 below cannot run, and must not be read as a verdict"
else
  pass "A0: pty helper available (flavour: $PTY_FLAVOUR)"
fi

out="$("$SCRATCH/ovr.sh" "$REPO_ROOT" "$(printf 'criteria 3-6 retired,\nreason in prose')" 2>/dev/null)"
if [[ "$out" == "CLEAN=[criteria 3-6 retired,reason in prose]" ]]; then
  pass "A1: a substantive reason is accepted, with the newline that would forge a second trailer removed"
else
  fail "A1: reason cleaning: $out"
fi

out="$("$SCRATCH/ovr.sh" "$REPO_ROOT" "  ok   " 2>/dev/null)"
if [[ "$out" == "REFUSED" ]]; then
  pass "A2: a 2-char reason is refused"
else
  fail "A2: a 2-char reason was accepted: $out"
fi

# A3/A4 scratch: the override path with NO approval helper present.
A4_R="$SCRATCH/a4"; mkdir -p "$A4_R"
mk_repo_a4() {
  mkdir -p "$1/scripts/lib" "$1/features/done/2026-09-08"
  cp "$REPO_ROOT/scripts/git-ops.sh" "$REPO_ROOT/scripts/ship-gates.sh" "$1/scripts/"
  cp "$REPO_ROOT/scripts/lib/gate-override.sh" "$REPO_ROOT/scripts/lib/admin-close.sh" "$1/scripts/lib/"
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
# Hermeticity guard, asserted rather than assumed: with keychain.py present this
# path would reach the REAL login keychain.
if [[ -e "$A4_R/scripts/lib/keychain.py" ]]; then
  fail "A3/A4: the scratch repo carries keychain.py — refusing to run a case that could raise a real dialog"
else
  ( cd "$A4_R" && bash scripts/git-ops.sh ship p777 --override ) >"$SCRATCH/a3.log" 2>&1; rc=$?
  if [[ $rc -eq 2 ]] && grep -q -- '--reason' "$SCRATCH/a3.log" && [[ -f "$A4_R/features/p777_demo.md" ]]; then
    pass "A3: --override without --reason is a usage error (exit 2) — nothing prompts, nothing closes"
  else
    fail "A3: --override without --reason did not refuse up front (exit $rc)"; sed 's/^/    /' "$SCRATCH/a3.log" >&2
  fi

  # A4. The bypass that defeated P1246's prompt — an agent wrapping its own command
  # in script(1) — must now grant NOTHING. Asserting the spec stays open is not
  # enough on its own (a broken helper also leaves it open), so the log must show
  # the run reached the approval step and was refused THERE.
  #
  # KNOWN LIMITATION, not testable here and stated rather than implied away: nobody
  # has shown the keychain dialog cannot be answered by UI scripting on this
  # machine. gate-override.sh's header carries that label.
  pty_feed "" "cd '$A4_R' && bash scripts/git-ops.sh ship p777 --override --reason 'agent typed this, no human present'" \
    >"$SCRATCH/a4.log" 2>&1
  if grep -q 'PTY_UNAVAILABLE\|unexpected number of arguments' "$SCRATCH/a4.log" 2>/dev/null; then
    fail "A4: the pty helper could not run — this is a BROKEN CANARY, not a verdict"
  elif ls "$A4_R"/features/done/*/p777_demo.md >/dev/null 2>&1; then
    fail "A4: an agent closed a red-gate spec through a pty — the override is forgeable again"; sed 's/^/    /' "$SCRATCH/a4.log" >&2
  elif grep -q 'approval refused' "$SCRATCH/a4.log" && grep -q 'override NOT approved' "$SCRATCH/a4.log"; then
    pass "A4: a pty no longer grants an override — the run reached the approval step and was refused there"
  else
    fail "A4: the spec stayed open but not at the approval step — inconclusive"; sed 's/^/    /' "$SCRATCH/a4.log" >&2
  fi
fi

# A5. (P1444 review M4, gate 7b) A4 shows a pty does not CLOSE the spec; it does
# not show WHY. Two checks that do:
#   a) static — the override path has no terminal read at all: no /dev/tty, no
#      `read` from a fd, no tty test, in gate-override.sh (comments stripped) or in
#      git-ops.sh's two override functions;
#   b) dynamic (macOS) — with a fake keychain.py that RECORDS being reached and
#      answers Deny, a reason typed into a real pty closes nothing, and the helper
#      was consulted: the decision is the helper's, not the typed input's.
a5_code() {  # code lines only (comments and blank lines removed)
  sed -e 's/^[[:space:]]*#.*$//' -e '/^[[:space:]]*$/d' "$@"
}
a5_fn() {  # a5_fn <file> <function> — the function's body
  awk -v f="$2" '$0 ~ "^" f "\\(\\) \\{" {p=1} p {print} p && /^}/ {exit}' "$1"
}
a5_body="$( a5_code "$REPO_ROOT/scripts/lib/gate-override.sh"; \
            a5_fn "$REPO_ROOT/scripts/git-ops.sh" ship_run_gates | a5_code; \
            a5_fn "$REPO_ROOT/scripts/git-ops.sh" ship_approve_pending_override | a5_code )"
a5_pat='/dev/tty|read[^;]*<&[0-9]|\[\[? -t [0-9]|tty_available|exec [0-9]<>'
a5_lines="$(printf '%s\n' "$a5_body" | grep -c .)"
if [[ "$a5_lines" -lt 40 ]] || ! grep -q 'gate_override_decide' <<<"$a5_body"; then
  fail "A5a: extracted too little of the override path to judge ($a5_lines lines) — the scan would be vacuous"
elif grep -qE "$a5_pat" <<<"$a5_body"; then
  fail "A5a: the override path reads a terminal again:"; grep -nE "$a5_pat" <<<"$a5_body" >&2
elif ! grep -qE "$a5_pat" <<<"$(printf '%s\nexec 3<>/dev/tty\n' "$a5_body")"; then
  fail "A5a: the scan did not fire on a planted /dev/tty — it is blind"
else
  pass "A5a: the override path (gate-override.sh, ship_run_gates, ship_approve_pending_override; $a5_lines code lines) reads no terminal, and the scan fires on a planted /dev/tty"
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  pass "A5b: not macOS — the approval reader refuses before any helper (A4 covers the refusal here)"
elif [[ -z "$PTY_FLAVOUR" ]]; then
  fail "A5b: no pty helper — the dynamic case cannot run"
else
  A5_R="$SCRATCH/a5"; mkdir -p "$A5_R"; mk_repo_a4 "$A5_R"
  printf '%s\n' '#!/usr/bin/env python3' \
    '# FAKE for test-pipeline-gates A5b: records each call, intact ACL, DENIES approval.' \
    'import os, sys' \
    'log = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fake-calls")' \
    'open(log, "a").write((sys.argv[1] if len(sys.argv) > 1 else "") + "\n")' \
    'sys.exit(0 if sys.argv[1:2] == ["approval-acl"] else 2)' > "$A5_R/scripts/lib/keychain.py"
  pty_feed "yes, approve it, I am the founder" \
    "cd '$A5_R' && bash scripts/git-ops.sh ship p777 --override --reason 'agent typed this, no human present'" \
    >"$SCRATCH/a5.log" 2>&1
  if ls "$A5_R"/features/done/*/p777_demo.md >/dev/null 2>&1; then
    fail "A5b: a pty-typed answer closed the spec"; sed 's/^/    /' "$SCRATCH/a5.log" >&2
  elif grep -qx 'approval-get' "$A5_R/scripts/lib/fake-calls" 2>/dev/null \
       && grep -q 'the keychain dialog was denied' "$SCRATCH/a5.log"; then
    pass "A5b: with a reason typed into a real pty, the approval helper was consulted and its Deny held — nothing closed"
  else
    fail "A5b: the helper was not reached (calls: $(tr '\n' ' ' < "$A5_R/scripts/lib/fake-calls" 2>/dev/null))"; sed 's/^/    /' "$SCRATCH/a5.log" >&2
  fi
fi

# ── Scratch repo for the ship-path cases ────────────────────────────────────
mk_repo() {
  local d="$1"
  mkdir -p "$d/scripts/lib" "$d/features/done/2026-09-08"
  cp "$REPO_ROOT/scripts/git-ops.sh"            "$d/scripts/"
  cp "$REPO_ROOT/scripts/ship-gates.sh"         "$d/scripts/"
  cp "$REPO_ROOT/scripts/lib/gate-override.sh"  "$d/scripts/lib/"
  # P1444 review (7c): load the administrative arm, so these documented workflows
  # run with it present rather than past its "library missing" branch.
  cp "$REPO_ROOT/scripts/lib/admin-close.sh"    "$d/scripts/lib/"
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
if grep -q -- '--override --reason' "$SCRATCH/b1.log" && grep -q 'Fix the artifact' "$SCRATCH/b1.log" \
   && grep -q 'ONE CLICK' "$SCRATCH/b1.log" && ! grep -qiE 'dev/tty|real terminal|in your terminal' "$SCRATCH/b1.log"; then
  pass "B2: the refusal names the fix and the one-click override recipe, and no longer sends anyone to a terminal"
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
# abs_case <name> [absorber pipeline_ran] [absorber frontmatter line] [absorber body] [absorber closing-commit message]
# The absorber is COMMITTED under features/done/ in its own closing commit,
# because the gate reads it as it was closed, from that commit, never from the
# working tree. `${n-default}` keeps an explicit "" empty (H4 passes none).
abs_case() {
  local d="$SCRATCH/$1"; mk_repo "$d"
  local ran="${2-create-spec, dev}" extra="${3-absorbs: [p2000]}" body="${4-Delivers everything p2000 asked for.}" msg="${5-chore: close p2001}"
  # Closed the way /ship closes: committed open, then moved into features/done/
  # in its own closing commit (the gate accepts only such a move as a close).
  abs_spec "$d" features/p2001_absorber.md p2001 "$ran" "[x]" "$extra" "$body"
  ( cd "$d" && git add features/p2001_absorber.md && git commit -qm "p2001: build" \
    && git mv features/p2001_absorber.md "$ABS_DONE/p2001_absorber.md" && git commit -qm "$msg" ) >/dev/null 2>&1
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

d="$(abs_case h3 "create-spec")"
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
d="$(abs_case h4 "create-spec, dev" "" "Related: p2000 is a follow-up, NOT delivered here.")"
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

# H15 — the legitimate close goes all the way through git-ops.sh ship (no-branch
# route) with NO "ready for QA" stamp anywhere. Round 1 found it demanded a stamp
# under p2000 (work that did not happen under p2000); round 3 found the absorber's
# stamp is just as unlikely to exist (19 of the last 20 branch-route ships wrote
# none). The absorber's close commit, verified by gate 2.5, is the evidence.
d="$(abs_case h15)"
( cd "$d" && git add features && git commit -qm "chore: add p2000 spec" ) >/dev/null 2>&1
( cd "$d" && bash scripts/git-ops.sh ship p2000 ) >"$SCRATCH/h15.log" 2>&1; rc=$?
if [[ $rc -eq 0 ]] && ls "$d"/features/done/*/p2000_absorbed.md >/dev/null 2>&1; then
  pass "H15: git-ops.sh ship closes a legitimate absorbed spec on the absorber's close — no stamp needed anywhere"
else
  fail "H15: the legitimate absorbed close failed through git-ops.sh ship (exit $rc)"; sed 's/^/    /' "$SCRATCH/h15.log" >&2
fi

# H16 — round-3 M-1: removing the closed absorber and re-adding it with a forged
# absorbs: is not a close. The copy from its real close is what counts.
d="$(abs_case h16 "create-spec, dev" "" "Unrelated shipped work.")"
( cd "$d" && git rm -q "$ABS_DONE/p2001_absorber.md" && git commit -qm "chore: remove p2001" ) >/dev/null 2>&1
abs_spec "$d" "$ABS_DONE/p2001_absorber.md" p2001 "create-spec, dev" "[x]" "absorbs: [p2000]" "Re-added with a forged absorbs."
( cd "$d" && git add "$ABS_DONE/p2001_absorber.md" && git commit -qm "chore: re-add p2001" ) >/dev/null 2>&1
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'does not list p2000' "$SCRATCH/h.log"; then
  pass "H16: a bare re-add of a closed absorber with a forged absorbs: does not vouch — its real close's copy counts"
else
  fail "H16: a re-added absorber vouched (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# ── Round 2 of the adversarial review: 0 HIGH, 3 MEDIUM, plus LOWs ──────────
# H17 — M-A: git-ops read the absorber out of a HUMAN line that also carries the
# spec's path, so a filename containing the phrase skipped the stamp check for a
# spec with no absorbed_by at all. It now reads a dedicated machine line only.
d="$(abs_case h17)"; rm -f "$d/features/p2000_absorbed.md"
abs_spec "$d" "features/p2000_x implementation recorded on absorbing spec p2001 y.md" p2000 "create-spec, dev" "[x]" "" "Own work, no absorbed_by."
abs_review "$d" p2000
( cd "$d" && git add features && git commit -qm "feat: p2001 ready for QA" ) >/dev/null 2>&1
( cd "$d" && bash scripts/git-ops.sh ship p2000 ) >"$SCRATCH/h17.log" 2>&1; rc=$?
if [[ $rc -ne 0 ]] && grep -q "no qualifying 'p2000 ready for QA'" "$SCRATCH/h17.log"; then
  pass "H17: a spec path containing the PASS phrase cannot point git-ops at another spec's stamp"
else
  fail "H17: a crafted filename skipped the code-presence gate (exit $rc)"; sed 's/^/    /' "$SCRATCH/h17.log" >&2
fi

# H18 — M-B: absorbs: added to an ALREADY-CLOSED spec afterwards (here even
# committed) does not vouch. The absorber is read as it was closed.
d="$(abs_case h18 "create-spec, dev" "" "Unrelated shipped work.")"
perl -0pi -e 's/^rank: 1$/rank: 1\nabsorbs: [p2000]/m' "$d/$ABS_DONE/p2001_absorber.md"
( cd "$d" && git add "$ABS_DONE/p2001_absorber.md" && git commit -qm "docs: later edit to a closed spec" ) >/dev/null 2>&1
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'does not list p2000' "$SCRATCH/h.log"; then
  pass "H18: absorbs: added to a spec after it closed does not vouch — its closing commit's copy is what counts"
else
  fail "H18: a later absorbs: edit to a closed spec vouched for an undelivered one (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# H19 — M-C: no closing `---` means no frontmatter, not "the whole file".
d="$(abs_case h19)"
printf -- '---\nstatus: qa\ntype: task\nrank: 1\npipeline_ran: [create-spec]\n# p2000: Demo\n\nSyntax example:\nabsorbed_by: p2001\n\n## Done-When\n\n- [x] the criterion\n' > "$d/features/p2000_absorbed.md"
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'no implementation is recorded' "$SCRATCH/h.log" && ! grep -q 'absorbing spec' "$SCRATCH/h.log"; then
  pass "H19: a file with no closing --- has no frontmatter, so a body absorbed_by line stays inert"
else
  fail "H19: an unclosed frontmatter was read whole (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# H20 — LOW: absorbs: must be a list of P-numbers, not free text that contains one.
d="$(abs_case h20 "create-spec, dev" "absorbs: not p2000")"
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'has no absorbs: list of P-numbers' "$SCRATCH/h.log"; then
  pass "H20: absorbs: 'not p2000' is refused — the field must be a list of P-numbers"
else
  fail "H20: a free-text absorbs: value vouched (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# H21 — LOW: an absorber that was itself closed on a red gate cannot vouch.
d="$(abs_case h21 "create-spec, dev" "absorbs: [p2000]" "Closed on a red gate." "$(printf 'chore: close p2001\n\nGate-Override: closure gate failed; closed by human override.\nGate-Override-Reason: test')")"
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'closed by override' "$SCRATCH/h.log"; then
  pass "H21: an absorber that was itself closed by override cannot vouch for another spec"
else
  fail "H21: an override-closed absorber vouched (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# ── Round 3 of the adversarial review: 0 HIGH, 2 MEDIUM ────────────────────
# H22 — M-1: moving a closed absorber to another done folder, forging absorbs:
# in the same commit, is not a close either (it also shed an override trailer).
d="$(abs_case h22 "create-spec, dev" "" "Unrelated shipped work.")"
mkdir -p "$d/features/done/2026-09-09"
( cd "$d" && git mv "$ABS_DONE/p2001_absorber.md" features/done/2026-09-09/p2001_absorber.md ) >/dev/null 2>&1
perl -0pi -e 's/^rank: 1$/rank: 1\nabsorbs: [p2000]/m' "$d/features/done/2026-09-09/p2001_absorber.md"
( cd "$d" && git add features/done/2026-09-09/p2001_absorber.md && git commit -qm "chore: tidy done folders" ) >/dev/null 2>&1
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -ne 0 ]] && grep -q 'did not arrive by a close' "$SCRATCH/h.log"; then
  pass "H22: a move between done folders is not a close — a forged absorbs: riding it does not vouch"
else
  fail "H22: a within-done move vouched (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
fi

# H23 — LOW: a quoted YAML list is a legitimate absorbs: value (a false refusal before).
d="$(abs_case h23 "create-spec, dev" 'absorbs: ["p2000"]')"
rc="$(abs_gate "$d" p2000)"
if [[ "$rc" -eq 0 ]] && grep -q 'absorbing spec p2001' "$SCRATCH/h.log"; then
  pass "H23: absorbs: [\"p2000\"] (quoted) is accepted"
else
  fail "H23: a quoted absorbs: list was refused (exit $rc)"; sed 's/^/    /' "$SCRATCH/h.log" >&2
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

# F8-F13. P1343: git-ops' own printed recovery moves a spec OUT of the done tree. It must
# pass; every shape that still moves a spec IN, or cannot be parsed, must stay blocked.
_reopen='{"tool_name":"Bash","tool_input":{"command":"git mv features/done/2026-09-14/p500_x.md features/p500_x.md"}}'
[[ "$(hk "$_reopen")" == "0" ]] \
  && pass "F8: git-ops' recovery (git mv OUT of features/done/) is allowed" \
  || fail "F8: the documented recovery move is still refused"
_reopen_dir='{"tool_name":"Bash","tool_input":{"command":"mv -v features/done/2026-09-14/p500_x.md features/"}}'
[[ "$(hk "$_reopen_dir")" == "0" ]] \
  && pass "F9: plain mv out of the done tree into a directory is allowed" \
  || fail "F9: reopen into features/ refused"
_split_close='{"tool_name":"Bash","tool_input":{"command":"mv features/p1099_t.md /tmp/x.md; mv /tmp/x.md features/done/2026-09-08/"}}'
[[ "$(hk "$_split_close")" == "2" ]] \
  && pass "F10: a close split across two moves is still BLOCKED" \
  || fail "F10: two-step close slipped through the reopen exemption"
_mixed='{"tool_name":"Bash","tool_input":{"command":"git mv features/done/2026-09-14/p500_x.md features/p500_x.md && git mv features/p501_y.md features/done/2026-09-14/"}}'
[[ "$(hk "$_mixed")" == "2" ]] \
  && pass "F11: a reopen chained with a real close is still BLOCKED" \
  || fail "F11: a chained close rode the reopen exemption"
_gitc='{"tool_name":"Bash","tool_input":{"command":"git -C . mv features/p1099_t.md features/done/2026-09-08/"}}'
[[ "$(hk "$_gitc")" == "2" ]] \
  && pass "F12: git -C <dir> mv into done is still BLOCKED (not parsed, not trusted)" \
  || fail "F12: git -C form escaped"
_subsh='{"tool_name":"Bash","tool_input":{"command":"mv $(echo features/p1099_t.md) features/done/2026-09-08/"}}'
[[ "$(hk "$_subsh")" == "2" ]] \
  && pass "F13: a command substitution keeps the old verdict (BLOCKED)" \
  || fail "F13: subshell form escaped"

# F14-F19. A reopen segment must not carry a close past the hook in the same command
# (review finding: skipped unknown segments let these through).
_ro='git mv features/done/2026-09-14/p500_x.md features/p500_x.md; '
_i=14
for _tail in 'sudo mv features/p501_y.md features/done/2026-09-14/' \
             '/bin/mv features/p501_y.md features/done/2026-09-14/' \
             'T=features/done/2026-09-14/; mv features/p501_y.md $T' \
             'cd features/ && mv p501_y.md done/2026-09-14/' \
             'echo features/p501_y.md | xargs -I{} mv {} features/done/2026-09-14/' \
             "sh -c 'mv features/p501_y.md features/done/2026-09-14/'"; do
  _j=$(python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$_ro$(printf '%b' "$_tail")")
  [[ "$(hk "$_j")" == "2" ]] && pass "F$_i: reopen + '${_tail:0:30}...' is BLOCKED" \
                             || fail "F$_i: reopen carried a close through: $_tail"
  _i=$((_i+1))
done

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

# ── I. Review type follows what the branch changed (P1040) ──────────────────
# /finish writes a review of the type the changed paths call for (migrations,
# skills, rules, specs, docs); /dev and /fix write `code` after a full /finish
# dispatch. Gate 2.7 used to accept `code` only, so a migration-only branch
# (P1035) failed after a correct migrations review.
#
# rt_case <name> <pn> <path>... — scratch repo whose feature/<pn>-demo branch
# changes exactly the given paths. The spec sits on main, ticked, dev recorded;
# only gate 2.7 is under test, so every run below is `--only 2.7`.
rt_case() {
  local name="$1" pn="$2"; shift 2
  local d="$SCRATCH/$name" f
  mk_repo "$d"
  printf -- '---\nstatus: qa\ntype: task\npipeline_ran: [dev]\n---\n# %s\n\n## Done-When\n\n- [x] the criterion\n' "$pn" \
    > "$d/features/${pn}_demo.md"
  ( cd "$d" && git add "features/${pn}_demo.md" && git commit -qm "chore: add ${pn} spec" \
    && git checkout -q -b "feature/${pn}-demo" ) >/dev/null 2>&1
  for f in "$@"; do
    mkdir -p "$d/$(dirname "$f")"
    echo "change $f" >> "$d/$f"
    ( cd "$d" && git add "$f" ) >/dev/null 2>&1
  done
  ( cd "$d" && git commit -qm "${pn}: work" && git checkout -q main ) >/dev/null 2>&1
  echo "$d"
}
# rt_stamp <dir> <type> <pn> [branch] [spaced] — append one .finish-reviewed line.
rt_stamp() {
  local br="${4:-feature/$3-demo}"
  if [[ "${5:-}" == spaced ]]; then
    printf '{"type": "%s", "pn": "%s", "branch": "%s", "sha": "0", "timestamp": "%s"}\n' \
      "$2" "$3" "$br" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$1/.git/.finish-reviewed"
  else
    printf '{"type":"%s","pn":"%s","branch":"%s","sha":"0","timestamp":"%s"}\n' \
      "$2" "$3" "$br" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$1/.git/.finish-reviewed"
  fi
}
rt_gate() { ( cd "$1" && bash scripts/ship-gates.sh "$2" --only 2.7 ) >"$SCRATCH/i.log" 2>&1; echo $?; }
rt_show() { sed 's/^/    /' "$SCRATCH/i.log" >&2; }

MIG=supabase/migrations/20261013000000_demo.sql

# I1 — AC1, the P1035 shape: migrations + the spec itself, migrations review only.
d="$(rt_case i1 p3001 "$MIG" features/p3001_demo.md)"; rt_stamp "$d" migrations p3001
rc="$(rt_gate "$d" p3001)"
if [[ "$rc" -eq 0 ]] && grep -q 'GATE 2.7\] PASS.*migrations' "$SCRATCH/i.log"; then
  pass "I1: a migration-only branch passes 2.7 on its migrations review, no redundant code stamp"
else
  fail "I1: a migration-only branch with a migrations review was refused (exit $rc)"; rt_show
fi

# I1b — the same with the deploy manifest migrate.sh stamps and stages (the real
# P1035 branch carried it).
d="$(rt_case i1b p3016 "$MIG" supabase/deploy-manifest.json features/p3016_demo.md)"; rt_stamp "$d" migrations p3016
rc="$(rt_gate "$d" p3016)"
if [[ "$rc" -eq 0 ]] && grep -q 'GATE 2.7\] PASS.*migrations' "$SCRATCH/i.log"; then
  pass "I1b: a migration branch carrying supabase/deploy-manifest.json passes on its migrations review"
else
  fail "I1b: the deploy manifest put a migration branch behind a code review (exit $rc)"; rt_show
fi

# I2 — AC2, the must-fail: code on the branch, only a migrations review.
d="$(rt_case i2 p3002 src/app/demo.ts "$MIG")"; rt_stamp "$d" migrations p3002
rc="$(rt_gate "$d" p3002)"
if [[ "$rc" -ne 0 ]] && grep -q 'GATE 2.7\] FAIL: .finish-reviewed has no code review entry for feature/p3002-demo' "$SCRATCH/i.log"; then
  pass "I2: a branch that changes src/ still FAILS 2.7 with only a migrations review"
else
  fail "I2: a code-changing branch passed on a migrations review (exit $rc)"; rt_show
fi

# I3 — AC2, no regression: code on the branch, code review, exactly as before.
d="$(rt_case i3 p3003 src/app/demo.ts)"; rt_stamp "$d" code p3003
rc="$(rt_gate "$d" p3003)"
if [[ "$rc" -eq 0 ]] && grep -q 'GATE 2.7\] PASS: code review artifact present' "$SCRATCH/i.log"; then
  pass "I3: a src/ branch with a code review passes exactly as before"
else
  fail "I3: a src/ branch with a code review was refused (exit $rc)"; rt_show
fi

# I4 — AC3, the failure path: migration-only branch, no review at all.
d="$(rt_case i4 p3004 "$MIG" features/p3004_demo.md)"; : > "$d/.git/.finish-reviewed"
rc="$(rt_gate "$d" p3004)"
if [[ "$rc" -ne 0 ]] && grep -q 'GATE 2.7\] FAIL.*migrations' "$SCRATCH/i.log"; then
  pass "I4: a migration-only branch with no review still FAILS 2.7, naming the review it needs"
else
  fail "I4: a migration-only branch with no review passed (exit $rc)"; rt_show
fi

# I5 — the branch discriminator still holds for the new types.
d="$(rt_case i5 p3005 "$MIG")"; rt_stamp "$d" migrations p3005 feature/p9999-other
rc="$(rt_gate "$d" p3005)"
if [[ "$rc" -ne 0 ]] && grep -q 'GATE 2.7\] FAIL' "$SCRATCH/i.log"; then
  pass "I5: a migrations review recorded for ANOTHER branch does not satisfy this one"
else
  fail "I5: another branch's migrations review was accepted (exit $rc)"; rt_show
fi

# I6 — 7c: /dev and /fix write `code` after a full /finish; that still covers a
# migration-only branch.
d="$(rt_case i6 p3006 "$MIG")"; rt_stamp "$d" code p3006
rc="$(rt_gate "$d" p3006)"
if [[ "$rc" -eq 0 ]] && grep -q 'GATE 2.7\] PASS' "$SCRATCH/i.log"; then
  pass "I6: the code stamp /dev writes still covers a migration-only branch"
else
  fail "I6: a /dev code stamp was refused on a migration-only branch (exit $rc)"; rt_show
fi

# I7 — 7c: a code+migrations branch reviewed by /dev (one code stamp) still ships.
d="$(rt_case i7 p3007 src/app/demo.ts "$MIG")"; rt_stamp "$d" code p3007
rc="$(rt_gate "$d" p3007)"
if [[ "$rc" -eq 0 ]] && grep -q 'GATE 2.7\] PASS' "$SCRATCH/i.log"; then
  pass "I7: a code+migrations branch with the /dev code stamp passes as before"
else
  fail "I7: a code+migrations branch with a code stamp was refused (exit $rc)"; rt_show
fi

# I8 — fail closed: a path /finish does not classify (scripts/*.sh) still needs code.
d="$(rt_case i8 p3008 scripts/demo.sh "$MIG")"; rt_stamp "$d" migrations p3008
rc="$(rt_gate "$d" p3008)"
if [[ "$rc" -ne 0 ]] && grep -q 'GATE 2.7\] FAIL: .finish-reviewed has no code review entry' "$SCRATCH/i.log"; then
  pass "I8: an unclassified path (scripts/*.sh) keeps the code requirement — fail closed"
else
  fail "I8: an unclassified path was let through on a migrations review (exit $rc)"; rt_show
fi

# I9 — every non-code category present needs its own review.
d="$(rt_case i9 p3009 "$MIG" .claude/commands/slava/build/demo.md)"; rt_stamp "$d" migrations p3009
rc="$(rt_gate "$d" p3009)"
if [[ "$rc" -ne 0 ]] && grep -q 'GATE 2.7\] FAIL.*skills' "$SCRATCH/i.log"; then
  pass "I9a: migrations+skills with only a migrations review FAILS, naming the missing skills review"
else
  fail "I9a: a branch was let through with one of two categories reviewed (exit $rc)"; rt_show
fi
rt_stamp "$d" skills p3009
rc="$(rt_gate "$d" p3009)"
if [[ "$rc" -eq 0 ]] && grep -q 'GATE 2.7\] PASS.*migrations' "$SCRATCH/i.log" && grep -q 'GATE 2.7\] PASS.*skills' "$SCRATCH/i.log"; then
  pass "I9b: with both a migrations and a skills review it passes"
else
  fail "I9b: both categories reviewed and still refused (exit $rc)"; rt_show
fi

# I10 — prose-only (spec + docs): a specs review passes; no review fails.
d="$(rt_case i10 p3010 features/p3010_demo.md docs/technical/demo.md)"
rc="$(rt_gate "$d" p3010)"
if [[ "$rc" -ne 0 ]] && grep -q 'GATE 2.7\] FAIL' "$SCRATCH/i.log"; then
  pass "I10a: a prose-only branch with no review FAILS"
else
  fail "I10a: a prose-only branch with no review passed (exit $rc)"; rt_show
fi
rt_stamp "$d" specs p3010
rc="$(rt_gate "$d" p3010)"
if [[ "$rc" -eq 0 ]] && grep -q 'GATE 2.7\] PASS' "$SCRATCH/i.log"; then
  pass "I10b: a prose-only branch passes on a specs review"
else
  fail "I10b: a prose-only branch with a specs review was refused (exit $rc)"; rt_show
fi

# I11 — the optional space after the colon (P1203) is tolerated for the new types.
d="$(rt_case i11 p3011 "$MIG")"; rt_stamp "$d" migrations p3011 "" spaced
rc="$(rt_gate "$d" p3011)"
if [[ "$rc" -eq 0 ]]; then
  pass "I11: a spaced \"type\": \"migrations\" entry is read"
else
  fail "I11: a spaced migrations entry was missed (exit $rc)"; rt_show
fi

# I12 — a deleted src/ file is a code change, even when a migration is added
# beside it (rename detection must not fold the deletion away).
d="$SCRATCH/i12"; mk_repo "$d"
mkdir -p "$d/src/app"; echo old > "$d/src/app/old.ts"
printf -- '---\nstatus: qa\ntype: task\npipeline_ran: [dev]\n---\n# p3012\n\n## Done-When\n\n- [x] c\n' > "$d/features/p3012_demo.md"
( cd "$d" && git add src/app/old.ts features/p3012_demo.md && git commit -qm base \
  && git checkout -q -b feature/p3012-demo && mkdir -p supabase/migrations \
  && git mv src/app/old.ts "$MIG" && git commit -qm "p3012: move" && git checkout -q main ) >/dev/null 2>&1
rt_stamp "$d" migrations p3012
rc="$(rt_gate "$d" p3012)"
if [[ "$rc" -ne 0 ]] && grep -q 'no code review entry' "$SCRATCH/i.log"; then
  pass "I12: moving a src/ file into supabase/migrations still requires a code review"
else
  fail "I12: a src/ deletion folded into a rename was let through (exit $rc)"; rt_show
fi

# I13 — fail closed: a branch with no diff against main falls back to code.
d="$SCRATCH/i13"; mk_repo "$d"
printf -- '---\nstatus: qa\ntype: task\npipeline_ran: [dev]\n---\n# p3013\n\n## Done-When\n\n- [x] c\n' > "$d/features/p3013_demo.md"
( cd "$d" && git add features/p3013_demo.md && git commit -qm base && git branch feature/p3013-demo ) >/dev/null 2>&1
rt_stamp "$d" migrations p3013; rt_stamp "$d" specs p3013
rc="$(rt_gate "$d" p3013)"
if [[ "$rc" -ne 0 ]] && grep -q 'no code review entry' "$SCRATCH/i.log"; then
  pass "I13: an empty branch diff fails closed to the code requirement"
else
  fail "I13: an empty branch diff passed on a non-code review (exit $rc)"; rt_show
fi

# I14 — scope: the no-branch arm (direct to main) has no diff to read and is unchanged.
d="$SCRATCH/i14"; mk_repo "$d"
printf -- '---\nstatus: qa\ntype: task\npipeline_ran: [dev]\n---\n# p3014\n\n## Done-When\n\n- [x] c\n' > "$d/features/p3014_demo.md"
( cd "$d" && git add features/p3014_demo.md && git commit -qm base ) >/dev/null 2>&1
rt_stamp "$d" migrations p3014 main
rc="$(rt_gate "$d" p3014)"
if [[ "$rc" -ne 0 ]] && grep -q 'no code review entry naming p3014' "$SCRATCH/i.log"; then
  pass "I14: the no-branch arm still requires a code entry naming the spec (unchanged)"
else
  fail "I14: the no-branch arm changed behaviour (exit $rc)"; rt_show
fi

# I15 — output contract (shell-safety.md): no redirect or pipe characters.
d="$(rt_case i15 p3015 "$MIG" .claude/rules/demo.md)"; rc="$(rt_gate "$d" p3015)"
if [[ "$rc" -ne 0 ]] && grep -q 'GATE 2.7\] FAIL' "$SCRATCH/i.log" \
   && ! grep -qE '[<>|]' < <(grep -E '^\[GATE' "$SCRATCH/i.log"); then
  pass "I15: gate 2.7 status lines carry no redirect or pipe characters"
else
  fail "I15: a gate 2.7 line carries a redirect or pipe character (exit $rc)"; rt_show
fi

# I16 — Codex review M1: only Markdown under features/ and docs/ is prose.
# features/verification/ holds runnable .ts (browser automation, DB writes) that
# needed a code review before P1040 and still does.
d="$(rt_case i16a p3017 features/verification/p3017/uat-check.ts "$MIG")"; rt_stamp "$d" migrations p3017
rc="$(rt_gate "$d" p3017)"
if [[ "$rc" -ne 0 ]] && grep -q 'no code review entry' "$SCRATCH/i.log"; then
  pass "I16a: a .ts file under features/ is code, not prose — a migrations review does not cover it"
else
  fail "I16a: executable code under features/ rode a migrations review (exit $rc)"; rt_show
fi
d="$(rt_case i16b p3018 docs/events/badges/sheet.html)"; rt_stamp "$d" specs p3018
rc="$(rt_gate "$d" p3018)"
if [[ "$rc" -ne 0 ]] && grep -q 'no code review entry' "$SCRATCH/i.log"; then
  pass "I16b: a non-Markdown file under docs/ is code, not prose"
else
  fail "I16b: a non-Markdown docs/ file passed on a specs review (exit $rc)"; rt_show
fi
# Same class in the skills tree: skill assets include runnable .sh/.mjs/.py.
d="$(rt_case i16c p3019 .claude/commands/slava/util/demo/assets/run.sh)"; rt_stamp "$d" skills p3019
rc="$(rt_gate "$d" p3019)"
if [[ "$rc" -ne 0 ]] && grep -q 'no code review entry' "$SCRATCH/i.log"; then
  pass "I16c: a script under .claude/commands/slava/ is code, not a skill doc"
else
  fail "I16c: a skill-tree script passed on a skills review (exit $rc)"; rt_show
fi
# I16e — the /finish review's exact shape: skill-asset scripts plus the spec,
# stamped skills AND specs, no code review. Must FAIL.
d="$(rt_case i16e p3027 .claude/commands/slava/util/demo/assets/render.mjs \
     .claude/commands/slava/util/demo/assets/planner.py .claude/commands/slava/util/demo/SKILL.md features/p3027_demo.md)"
rt_stamp "$d" skills p3027; rt_stamp "$d" specs p3027
rc="$(rt_gate "$d" p3027)"
if [[ "$rc" -ne 0 ]] && grep -q 'no code review entry' "$SCRATCH/i.log"; then
  pass "I16e: skill-asset .mjs/.py with skills + specs reviews and no code review FAILS"
else
  fail "I16e: skill-asset scripts passed on skills + specs reviews (exit $rc)"; rt_show
fi
d="$(rt_case i16d p3020 features/p3020_demo.md docs/technical/demo.md "$MIG")"; rt_stamp "$d" migrations p3020
rc="$(rt_gate "$d" p3020)"
if [[ "$rc" -eq 0 ]]; then
  pass "I16d: Markdown under features/ and docs/ is still prose (a migration branch passes on migrations)"
else
  fail "I16d: Markdown prose now demands a code review (exit $rc)"; rt_show
fi

# I17 — Codex review M2: the branch name is data, not a regex. A '.' in it must
# not let a stamp for a different branch match — in the new typed arm AND the
# pre-existing code arm.
# rt_case_br <name> <pn> <branch> <path> — like rt_case, with an explicit branch.
rt_case_br() {
  local d="$SCRATCH/$1" pn="$2" br="$3" f="$4"
  mk_repo "$d"
  printf -- '---\nstatus: qa\ntype: task\npipeline_ran: [dev]\n---\n# %s\n\n## Done-When\n\n- [x] c\n' "$pn" > "$d/features/${pn}_demo.md"
  ( cd "$d" && git add "features/${pn}_demo.md" && git commit -qm spec && git checkout -q -b "$br" \
    && mkdir -p "$(dirname "$f")" && echo x > "$f" && git add "$f" && git commit -qm work \
    && git checkout -q main ) >/dev/null 2>&1
  echo "$d"
}
d="$(rt_case_br i17a p3021 feature/p3021-release.1 "$MIG")"; rt_stamp "$d" migrations p3021 feature/p3021-releaseX1
rc="$(rt_gate "$d" p3021)"
if [[ "$rc" -ne 0 ]] && grep -q 'GATE 2.7\] FAIL' "$SCRATCH/i.log"; then
  pass "I17a: a migrations stamp for feature/p3021-releaseX1 does not satisfy feature/p3021-release.1"
else
  fail "I17a: a '.' in the branch name matched another branch's migrations stamp (exit $rc)"; rt_show
fi
d="$(rt_case_br i17b p3022 feature/p3022-release.1 src/app/demo.ts)"; rt_stamp "$d" code p3022 feature/p3022-releaseX1
rc="$(rt_gate "$d" p3022)"
if [[ "$rc" -ne 0 ]] && grep -q 'no code review entry' "$SCRATCH/i.log"; then
  pass "I17b: the pre-existing code arm does not match feature/p3022-releaseX1 for feature/p3022-release.1"
else
  fail "I17b: a '.' in the branch name matched another branch's code stamp (exit $rc)"; rt_show
fi
d="$(rt_case_br i17c p3023 feature/p3023-release.1 "$MIG")"; rt_stamp "$d" migrations p3023 feature/p3023-release.1 spaced
rc="$(rt_gate "$d" p3023)"
if [[ "$rc" -eq 0 ]]; then
  pass "I17c: the exact branch name, dots and a spaced entry included, still matches"
else
  fail "I17c: exact branch match broke (exit $rc)"; rt_show
fi

# I18 — Codex review L1: 2.7b must warn when ANY required type's latest entry is
# stale, not only the last line read. Warn-only: the run still exits 0.
rt_old_stamp() {
  printf '{"type":"%s","pn":"%s","branch":"feature/%s-demo","sha":"0","timestamp":"2000-01-01T00:00:00Z"}\n' \
    "$2" "$3" "$3" >> "$1/.git/.finish-reviewed"
}
d="$(rt_case i18a p3024 "$MIG" .claude/commands/slava/build/demo.md)"
rt_old_stamp "$d" migrations p3024; rt_stamp "$d" skills p3024
rc="$(rt_gate "$d" p3024)"
if [[ "$rc" -eq 0 ]] && grep -q 'GATE 2.7b\] WARN.*migrations' "$SCRATCH/i.log"; then
  pass "I18a: a stale migrations review is reported even when a newer skills review follows it (still warn-only)"
else
  fail "I18a: a stale migrations review was masked by a newer skills review (exit $rc)"; rt_show
fi
d="$(rt_case i18b p3025 "$MIG" .claude/commands/slava/build/demo.md)"
rt_stamp "$d" migrations p3025; rt_stamp "$d" skills p3025
rc="$(rt_gate "$d" p3025)"
if [[ "$rc" -eq 0 ]] && grep -q 'GATE 2.7b\] PASS' "$SCRATCH/i.log" && ! grep -q 'GATE 2.7b\] WARN' "$SCRATCH/i.log"; then
  pass "I18b: two current reviews read as current"
else
  fail "I18b: current reviews were reported stale (exit $rc)"; rt_show
fi
d="$(rt_case i18c p3026 src/app/demo.ts)"; rt_old_stamp "$d" code p3026
rc="$(rt_gate "$d" p3026)"
if [[ "$rc" -eq 0 ]] && grep -q 'GATE 2.7b\] WARN' "$SCRATCH/i.log"; then
  pass "I18c: a stale code review still warns (pre-existing behaviour kept)"
else
  fail "I18c: a stale code review no longer warns (exit $rc)"; rt_show
fi

# ── Result ──────────────────────────────────────────────────────────────────
echo ""
if [[ "$FAILURES" -ne 0 ]]; then
  echo "FAILED: $FAILURES pipeline-gate invariant(s)"
  exit 1
fi
echo "PASS: all P1246 pipeline-gate invariants hold (A0-A5, B1-B4, C1, D1-D3, E1-E6, F1-F19, G1-G3, I1-I18)"
exit 0
