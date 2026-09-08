#!/usr/bin/env bash
# gate-override.sh — the single escape hatch for a deterministic pipeline gate (P1246).
#
# WHY THIS SHAPE, AND NOT A FLAG FILE OR AN ENV VAR
# Every previous override in this repo was writable by the party it gated:
# `inline` in ship-gates' gate 2.5, the hand-written .finish-reviewed stamp, and
# ~/.push-enabled (which the founder's own global CLAUDE.md describes as
# "authorization the agent can forge is not authorization"). P1246's Invariants
# forbid repeating that: "No override is writable by the agent being gated."
#
# The only thing in this environment an agent structurally cannot obtain is a
# controlling terminal. Measured 2026-09-08 from the agent Bash tool:
#     stdin tty: NO   stdout tty: NO   stderr tty: NO   /dev/tty: not openable
# ("Device not configured" — not merely redirected, ABSENT). A human in a
# terminal window has one. So "was a human present at this exact invocation?"
# is answerable by opening /dev/tty, and cannot be spoofed by setting a
# variable, touching a file, or passing a flag.
#
# There is deliberately NO test-mode env var here. A `GATE_OVERRIDE_TEST=1`
# escape would reintroduce exactly the agent-writable hole this exists to close,
# and would be the first thing a blocked agent found. The canary
# (test-pipeline-gates.sh) exercises the allow-path through a REAL pty via
# script(1) instead — see its "override" cases.
#
# Consequence, accepted by the founder 2026-09-08 ("Yes — same gate, TTY override
# is yours alone"): there is one code path, and it refuses everyone. The founder
# passes it from a terminal; an agent cannot pass it at all and must report the
# block instead. `!`-prefixed commands inside Claude Code run through the harness
# and have no tty either, so the override needs a real terminal window.

# --- Where the audit trail lives -------------------------------------------
# Two records, deliberately:
#   1. git-common-dir/gate-overrides.log — local, shared across every worktree
#      (same home as .finish-reviewed, P950/P1002), survives worktree removal.
#   2. The closure commit message trailer — permanent, pushed, reviewable by
#      anyone reading git history. This is the one that actually matters; the
#      log file is a convenience and is as forgeable as any local file.
gate_override_log_path() {
  local common
  common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  printf '%s/gate-overrides.log\n' "$common"
}

# gate_override_tty_available — 0 when a controlling terminal is reachable.
#
# Opens /dev/tty read-write rather than testing `[ -t 0 ]`. A human who pipes
# input (`echo x | ./git-ops.sh ...`) still has a controlling terminal and
# should still be able to override; an agent has none either way. Testing the
# fds would get both of those backwards.
gate_override_tty_available() {
  { exec 3<>/dev/tty; } 2>/dev/null || return 1
  exec 3>&- 2>/dev/null || true
  return 0
}

# gate_override_capture <pn> <gate_label> — prompt for a reason on /dev/tty.
# Prints the accepted reason on STDOUT (nothing else goes to stdout). Returns
# non-zero if there is no tty, the read fails, or the reason is not substantive.
gate_override_capture() {
  local pn="$1" gate_label="$2" reason=""

  gate_override_tty_available || return 1
  exec 3<>/dev/tty || return 1

  {
    printf '\n'
    printf '  ── GATE OVERRIDE ──────────────────────────────────────────────\n'
    printf '  %s failed for %s.\n' "$gate_label" "$pn"
    printf '  Overriding records your reason in the closure commit message,\n'
    printf '  permanently and in public. Leave it blank to abort.\n'
    printf '\n'
    printf '  Reason for closing anyway: '
  } >&3

  IFS= read -r reason <&3 || { exec 3>&- 2>/dev/null; return 1; }

  # Trim surrounding whitespace.
  reason="${reason#"${reason%%[![:space:]]*}"}"
  reason="${reason%"${reason##*[![:space:]]}"}"

  # A reason must say something. 12 chars is not a security boundary — a human
  # who wants to type "aaaaaaaaaaaa" can — it exists so a reflexive "ok"/"y"
  # keystroke does not become the audit trail. The real deterrent is that the
  # string lands in a public commit message.
  if [[ ${#reason} -lt 12 ]]; then
    { printf '  Aborted: a reason of at least 12 characters is required.\n\n'; } >&3
    exec 3>&- 2>/dev/null
    return 1
  fi

  # Newlines cannot survive a commit trailer or a single log line; collapse any
  # control characters rather than letting them corrupt either record.
  reason="$(printf '%s' "$reason" | tr -d '\000-\037' | tr -s ' ')"

  { printf '  Recorded.\n\n'; } >&3
  exec 3>&- 2>/dev/null
  printf '%s\n' "$reason"
  return 0
}

# gate_override_record <pn> <gate_label> <reason> — append to the local log.
# Never fails the caller: a missing log is an audit gap, not a reason to abort a
# close the human already authorized at the terminal.
gate_override_record() {
  local pn="$1" gate_label="$2" reason="$3"
  local log ts sha user
  log="$(gate_override_log_path)" || return 0
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  sha="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  user="$(git config user.name 2>/dev/null || echo unknown)"
  printf '{"pn":"%s","gate":"%s","sha":"%s","user":"%s","timestamp":"%s","reason":"%s"}\n' \
    "$pn" "$gate_label" "$sha" "$user" "$ts" \
    "$(printf '%s' "$reason" | sed 's/\\/\\\\/g; s/"/\\"/g')" \
    >> "$log" 2>/dev/null || true
  return 0
}

# gate_override_refusal_text <pn> — the message an agent sees. Names the recipe
# so the human is not left deriving it (git.md records that an un-named recovery
# recipe gets re-invented badly — a `git commit --amend` on the shared checkout).
gate_override_refusal_text() {
  local pn="$1"
  printf '%s' "ship: refusing to close ${pn} — gates failed (see the gate report above).

  Fix the artifact (tick the box, or delete the criterion and say why in prose),
  then re-run:            ./scripts/git-ops.sh ship ${pn}

  Or override. This needs a real terminal window — it prompts on /dev/tty, which
  an agent session does not have, and the reason you type is committed publicly:
                          ./scripts/git-ops.sh ship ${pn} --override"
}
