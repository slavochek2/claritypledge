#!/usr/bin/env bash
# gate-override.sh — the single escape hatch for a deterministic pipeline gate (P1246).
#
# WHAT THIS IS — AND, IMPORTANTLY, WHAT IT IS NOT
#
# **This is friction plus an audit trail. It is NOT a security boundary, and an
# agent CAN defeat it.** That correction is the first thing in this file because
# the first version of it claimed the opposite, in bold, and was wrong.
#
# The original claim was: "the only thing in this environment an agent
# structurally cannot obtain is a controlling terminal", resting on a real
# measurement — from the agent Bash tool, /dev/tty is not merely redirected but
# ABSENT ("Device not configured"). That measurement is correct and still holds.
# The inference drawn from it does not.
#
# `script(1)` is a standard, unrestricted utility, and it allocates a real pty.
# An agent that wraps its own command in it gets a controlling terminal and can
# answer this prompt. Demonstrated end-to-end 2026-09-08, from a plain agent
# shell with no human anywhere:
#
#     { sleep .5; printf 'agent typed this, no human present\n'; sleep .5; } \
#       | script -q /dev/null bash -c 'git-ops.sh ship p777 --override'
#     -> [GATE 2.5] FAIL: 1 unticked completion item(s)
#     -> GATE OVERRIDE accepted ... Ready to push.
#
# A spec with an unticked box was closed by an agent on a red gate. The escape
# hatch this file exists to protect was opened by the party it was meant to
# exclude.
#
# The tell was in the test, and it is worth naming because it is a general trap:
# the canary proved the ALLOW path by feeding the prompt through `script(1)` —
# i.e. it used the bypass as its stand-in for a human. An oracle built out of the
# thing under test cannot detect that thing. There is no local check that fixes
# this: detecting `script` specifically is an arms race against every other pty
# allocator, and any predicate an agent can read, it can arrange to satisfy.
#
# SO WHAT IS IT FOR, HONESTLY:
#   * It is a real speed bump. Passing it requires deliberately reaching for a
#     pty wrapper — that is no longer a slip, it is a decision, and one that
#     reads as circumvention in a transcript.
#   * It produces a durable, public record. The typed reason lands in the closure
#     commit message, so "which specs were closed on a red gate, and why?" is one
#     grep over history, and a forged override is loud rather than silent.
#   * It is the same posture as every other local control in this repo
#     (block-banned-git.py, the privacy pre-commit hook): accident prevention,
#     explicitly NOT the boundary. See .claude/rules/git.md — "Local hooks are
#     accident-prevention, not the boundary."
#
# THE ACTUAL BOUNDARY is server-side: .github/workflows/closure-gate.yml re-derives
# the verdict from pushed commits. As of 2026-09-08 that job is NOT yet a required
# status check on main (the only required check is `audit-privacy`), so the
# boundary is currently unenforced. Until a repo admin adds `closure-gate` to the
# main-privacy-gate ruleset, nothing in the closure chain is un-routable-around.
# Do not describe this file as a guarantee before then — or after.

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

  Or, if the refusal is wrong, the founder can override it. It prompts on
  /dev/tty and the typed reason is committed publicly, in the closure commit:
                          ./scripts/git-ops.sh ship ${pn} --override

  Agents: this prompt is friction and an audit trail, not a wall you are unable
  to climb — a pty wrapper defeats it. Do not reach for one. Report the gate
  failure and let the founder decide."
}
