#!/usr/bin/env bash
# gate-override.sh — the single escape hatch for a deterministic pipeline gate (P1246, P1444).
#
# WHAT THIS IS — AND, IMPORTANTLY, WHAT IT IS NOT
#
# **This is friction plus a human-presence check plus an audit trail. It has NOT
# been shown to be unforgeable, and nothing in this file should be read as a
# security boundary.** That sentence is first because the first version of this
# file claimed the opposite, in bold, and was wrong.
#
# HOW AN OVERRIDE IS APPROVED (P1444)
#   ./scripts/git-ops.sh ship pN --override --reason "why the gate is wrong"
# announces the request (stderr line, macOS notification, request log, a bell on
# the asking tab — the keyring.sh announcement path, naming the spec and the
# reason), then reads a DEDICATED keychain approval item that trusts no
# application. macOS raises its own keychain dialog: **Allow** approves this one
# close, **Deny** refuses it. The item's access list is verified BEFORE and AFTER
# the read; a missing, defeated ("Always Allow") or indeterminate access list
# refuses, and so does anything but a successful, non-empty read. The founder
# enrols the item once: ./scripts/keyring.sh approve-enroll
#
# WHY NOT THE TERMINAL PROMPT ANY MORE
# Until P1444 the override prompted on /dev/tty, on the theory that an agent shell
# has no controlling terminal. It has none by default — but `script(1)` allocates a
# real pty, and an agent wrapping its own command in it answered the prompt and
# closed a spec with an unticked box on a red gate, with no human anywhere
# (decisions.md 2026-09-08). So /dev/tty is no longer an authorization path at all:
# nothing in this file or in git-ops.sh's override path opens it.
#
# WHAT THE KEYCHAIN DIALOG IS WORTH, HONESTLY
#   * A human-presence check against the specific bypass that defeated the tty
#     prompt: a pty answers nothing here, and the dialog belongs to the OS, not to
#     this process.
#   * NOT shown unforgeable. Nobody has verified that macOS's keychain dialog
#     cannot be answered by UI scripting — Accessibility automation, synthetic
#     events, or a computer-use agent — on this machine (Codex review 2026-10-08:
#     "not verified"). Until a probe run with the founder present settles it, treat
#     an approved override as "a click happened", not "the founder clicked".
#   * NOT bound to this close. The item is a reusable approval, not a signature
#     over the spec, the SHA or the reason. The announcement names them; the
#     dialog cannot.
#   * Local code, editable by anyone who can edit git-ops.sh or keychain.py.
#
# THE ACTUAL BOUNDARY is server-side: .github/workflows/closure-gate.yml re-derives
# the verdict from pushed commits. It still accepts a `Gate-Override-Reason:`
# trailer as a human override (with a warning), and a trailer is writable by
# whoever makes the commit — so a forged override is loud and permanent in
# history, not prevented. A server-side approval bound to a founder-only identity
# is the recommended fix and is out of scope here (P1444 Non-Goals).
#
# NO TEST MODE. Nothing here reads an environment variable that skips, fakes or
# pre-answers the approval. Tests source this file and redefine the two reader
# functions below (gate_override_acl_state, gate_override_read_approval) inside the
# test harness, then call gate_override_decide — production never sees that.

# keychain.py lives beside this file. Resolved once, at source time, from this
# file's own location (git-ops.sh sources it from its repo's scripts/lib/).
_GATE_OVERRIDE_LIBDIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
_GATE_OVERRIDE_KEYCHAIN_PY="${_GATE_OVERRIDE_LIBDIR}/keychain.py"

# --- Where the audit trail lives -------------------------------------------
# Two records, deliberately:
#   1. git-common-dir/gate-overrides.log — local, shared across every worktree
#      (same home as .finish-reviewed, P950/P1002), survives worktree removal.
#   2. The closure commit message trailers — permanent, pushed, reviewable by
#      anyone reading git history. This is the one that actually matters; the
#      log file is a convenience and is as forgeable as any local file.
gate_override_log_path() {
  local common
  common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  printf '%s/gate-overrides.log\n' "$common"
}

# gate_override_clean_reason <raw> — the reason as it will be recorded: control
# characters removed (a newline would forge a second trailer or log line), runs of
# spaces collapsed, ends trimmed. Prints it; returns 1 when fewer than 12
# characters remain.
#
# 12 characters is not a security boundary — anyone can type "aaaaaaaaaaaa" — it
# exists so a reflexive "ok"/"y" does not become the audit trail. The real
# deterrent is that the string lands in a public commit message.
gate_override_clean_reason() {
  local r
  r="$(printf '%s' "$1" | tr -d '\000-\037\177' | tr -s ' ')"
  r="${r#"${r%%[![:space:]]*}"}"
  r="${r%"${r##*[![:space:]]}"}"
  [[ ${#r} -ge 12 ]] || return 1
  printf '%s\n' "$r"
}

# --- The two readers. The ONLY functions that touch the keychain. -----------
# Tests redefine these after sourcing; production code never branches around them.

# gate_override_acl_state — exit 0 intact, 1 item not enrolled, 2 defeated (an
# application is trusted — what "Always Allow" does), anything else indeterminate.
# Never prompts: it reads the access list without decrypting (keychain.py acl).
gate_override_acl_state() {
  if [[ "$(uname -s 2>/dev/null)" != "Darwin" ]]; then
    echo "  approval: the keychain approval needs macOS; this machine is $(uname -s 2>/dev/null | tr -cd 'A-Za-z0-9')." >&2
    return 3
  fi
  if [[ ! -r "$_GATE_OVERRIDE_KEYCHAIN_PY" ]]; then
    echo "  approval: the approval helper (scripts/lib/keychain.py) is missing beside gate-override.sh." >&2
    return 3
  fi
  python3 "$_GATE_OVERRIDE_KEYCHAIN_PY" approval-acl >&2
}

# gate_override_read_approval <pN> <reason> — exit 0 only when the human clicked
# Allow and the item decrypted to a non-empty value. Raises the keychain dialog,
# after the keyring.sh announcement. The value never reaches stdout.
#
# stdout is discarded, not trusted to be empty (review: Gemini #5). The helper
# prints nothing there today, but gate_override_decide's stdout IS the reason that
# lands in a public commit trailer, so anything a helper wrote would be published.
gate_override_read_approval() {
  [[ -r "$_GATE_OVERRIDE_KEYCHAIN_PY" ]] || return 3
  python3 "$_GATE_OVERRIDE_KEYCHAIN_PY" approval-get "approve closing $1 on a red closure gate: $2" </dev/null >/dev/null
}

# _gate_override_acl_ok <before|after> — maps the access-list state to a verdict.
_gate_override_acl_ok() {
  local when="$1" rc=0
  gate_override_acl_state || rc=$?
  case "$rc" in
    0) return 0 ;;
    1) echo "  approval refused ($when the read): the approval item is not enrolled. Founder, once: ./scripts/keyring.sh approve-enroll" >&2 ;;
    2) echo "  approval refused ($when the read): the approval item trusts an application, so it no longer asks anyone — this is what \"Always Allow\" does. Re-enrol it: ./scripts/keyring.sh approve-enroll" >&2 ;;
    *) echo "  approval refused ($when the read): the approval item's access list could not be verified (exit $rc) — an access list nobody can read is never treated as intact." >&2 ;;
  esac
  return 1
}

# gate_override_decide <pN> <raw reason> — THE decision. Prints the cleaned reason
# on stdout and returns 0 only when: the reason is substantive, the access list is
# intact before the read, the read was approved, and the access list is STILL
# intact after it (an "Always Allow" click during this very request is caught
# here). Every other path returns non-zero with its reason on stderr.
gate_override_decide() {
  local pn="$1" reason rc=0
  if ! reason="$(gate_override_clean_reason "$2")"; then
    echo "  approval refused: the reason must say something — at least 12 characters." >&2
    return 1
  fi
  _gate_override_acl_ok before || return 1
  {
    printf '\n  ── GATE OVERRIDE ──────────────────────────────────────────────\n'
    # Display copy only: no redirect or pipe characters in a status line
    # (shell-safety.md). The recorded reason is not altered.
    printf '  Closure gate failed for %s. Reason given: %s\n' "$pn" "$(printf '%s' "$reason" | tr '<>|' '()/')"
    printf '  A macOS keychain dialog follows. Allow approves THIS close; Deny refuses.\n'
    printf '  Never "Always Allow": it disables the approval and this override then refuses.\n\n'
  } >&2
  gate_override_read_approval "$pn" "$reason" || rc=$?
  if [[ "$rc" -ne 0 ]]; then
    case "$rc" in
      2) echo "  approval refused: the keychain dialog was denied." >&2 ;;
      1) echo "  approval refused: the approval item is not enrolled. Founder, once: ./scripts/keyring.sh approve-enroll" >&2 ;;
      *) echo "  approval refused: the keychain read failed (exit $rc)." >&2 ;;
    esac
    return 1
  fi
  _gate_override_acl_ok after || return 1
  printf '%s\n' "$reason"
  return 0
}

# gate_override_record <pn> <gate_label> <reason> — append to the local log.
# Never fails the caller: a missing log is an audit gap, not a reason to abort a
# close that was already approved.
gate_override_record() {
  local pn="$1" gate_label="$2" reason="$3"
  local log ts sha user
  log="$(gate_override_log_path)" || return 0
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  sha="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  user="$(git config user.name 2>/dev/null || echo unknown)"
  printf '{"pn":"%s","gate":"%s","sha":"%s","user":"%s","timestamp":"%s","approval":"keychain dialog","reason":"%s"}\n' \
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

  Or, if the refusal is wrong, the founder approves an override with ONE CLICK:
                          ./scripts/git-ops.sh ship ${pn} --override --reason \"why the gate is wrong\"
  A macOS keychain dialog appears naming nothing but python, after a notification
  naming ${pn} and the reason. Allow approves this close; Deny refuses. The reason
  is committed publicly in the closure commit.

  Agents: only after the founder said so in this conversation. Tell them, in your
  reply and before running it, which spec and reason the dialog is for, and that
  the answer is Allow, never Always Allow. Never answer, script or click the
  dialog yourself."
}
