#!/usr/bin/env bash
# keyring.sh — P1239: the locked half of the credential set.
#
# Critical credentials live in the macOS login keychain as items with an empty
# trusted-application list. Reading one requires a human to answer an OS dialog
# at the moment of the read. There is no unlock command, no time window, and no
# state to remember or display — the dialog appears when a key is read and does
# not otherwise exist.
#
# Consumers (source this file, then require what you need):
#     source "$(git rev-parse --show-toplevel)/scripts/keyring.sh"
#     keyring_require PROD_EXAMPLE_KEY
#     # ... $PROD_EXAMPLE_KEY is now exported, or we already exited
#
# CLI:
#     ./scripts/keyring.sh enroll [KEY...]   copy key(s) from .env.local into the keychain
#     ./scripts/keyring.sh enroll-from FILE VAR NAME
#                                            copy VAR from another env file, locked as NAME
#     ./scripts/keyring.sh verify            report whether the gate still fires (no dialog)
#     ./scripts/keyring.sh status            enrolled / not-enrolled per registered key
#     ./scripts/keyring.sh list              registered critical key names
#     ./scripts/keyring.sh requests [N]      who asked for what, and why — last N requests
#     ./scripts/keyring.sh withdraw KEY      remove a key from the keychain (rollback)
#
# Every read announces itself BEFORE the dialog appears: a line in the request
# log, a line on stderr, and a macOS notification naming the key, the reason, the
# session and the branch. The dialog itself can only say "Python wants to use ..."
# — it cannot name the caller, and an approval you cannot attribute is one you
# cannot answer correctly. Pass a reason with $KEYRING_REASON or as the second
# argument to keyring_get.
#
# `verify` is the answer to this spec's top risk: clicking "Always Allow" on the
# dialog silently turns the gate into a no-op, with no error and nothing visible.
# `verify` reads each item's ACL without decrypting it, so it never prompts, and
# it reports DEFEATED for any item that has acquired a trusted application.
#
# Never echo a decrypted value. `keyring_get` writes to stdout for a caller to
# capture; nothing here logs, traces, or passes a secret as a command argument
# (P1239 Done-When: no secret in shell history, the session transcript, or `ps`).

# BASH_SOURCE is unset when this file is sourced from zsh, which silently
# resolved the registry to the repo root and made `keyring_keys` return nothing.
# Fall back to $0, then to the git root, and let keyring_keys fail loudly if
# neither works — an empty key list must never read as "all keys fine".
_keyring_self="${BASH_SOURCE[0]:-$0}"
KEYRING_ROOT="$(cd "$(dirname "$_keyring_self")" 2>/dev/null && pwd)"
if [ ! -r "${KEYRING_ROOT}/keyring-critical.txt" ]; then
  # `|| true` on both git lookups: this file is SOURCED, often by `set -e` scripts
  # (migrate.sh, deploy-functions.sh). Outside a git checkout a bare failing command
  # substitution killed the caller with exit 128 before it did anything (P1214 review).
  _keyring_git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$_keyring_git_root" ] && [ -r "${_keyring_git_root}/scripts/keyring-critical.txt" ]; then
    KEYRING_ROOT="${_keyring_git_root}/scripts"
  fi
fi
KEYRING_PY="${KEYRING_ROOT}/lib/keychain.py"
# The registry names which credentials are critical — a target list — so it
# lives in the gitignored private half, not in this public repo. Resolved via
# git-common-dir so it is found identically from the main checkout and from any
# worktree (worktrees do not get .private/). Template: keyring-critical.txt.example
KEYRING_REGISTRY="${KEYRING_REGISTRY:-}"
if [ -z "$KEYRING_REGISTRY" ]; then
  _keyring_common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [ -n "$_keyring_common" ]; then
    KEYRING_REGISTRY="$(dirname "$_keyring_common")/.private/docs/keyring-critical.txt"
  fi
fi
KEYRING_SERVICE_PREFIX="cp.keyring."

keyring_service_name() { printf '%s%s' "$KEYRING_SERVICE_PREFIX" "$1"; }

# Registered critical key names, comments and blanks stripped.
keyring_keys() {
  [[ -n "$KEYRING_REGISTRY" && -r "$KEYRING_REGISTRY" ]] || {
    echo "keyring: cannot read the critical-key registry." >&2
    echo "  expected: ${KEYRING_REGISTRY:-<could not resolve the repo root>}" >&2
    echo "  create it from scripts/keyring-critical.txt.example" >&2
    return 1
  }
  sed -e 's/#.*//' -e 's/[[:space:]]//g' "$KEYRING_REGISTRY" | grep -v '^$'
}

keyring_is_registered() {
  keyring_keys | grep -qx -- "$1"
}

# Print one key's value from the keychain. Triggers the authorization dialog.
# Returns non-zero (and prints nothing on stdout) if the human declines.
#
# WARNING for callers: capturing this with `v="$(keyring_get KEY)"` REINTRODUCES
# the xtrace leak that keyring_require guards against. Command substitution forks
# a subshell, and the `set +x` below mutates only that subshell — your shell still
# traces `v=<the secret>`. Prefer `keyring_require KEY`, which exports in your own
# frame with tracing suspended. If you genuinely need the raw value, suspend
# xtrace yourself around the capture (see scripts/keyring-gate-proof.sh).
keyring_get() {
  local _kr_x="" _kr_rc
  case "$-" in *x*) _kr_x=1; set +x ;; esac
  python3 "$KEYRING_PY" get "$(keyring_service_name "$1")" "${2:-${KEYRING_REASON:-}}"
  _kr_rc=$?
  [ -n "$_kr_x" ] && set -x
  return $_kr_rc
}

# Export each named key, or fail closed and loud. Never falls back to a
# plaintext copy and never proceeds with an empty value (P1239 Invariants).
# Bash xtrace expands and prints every argument, so a decrypted value goes
# straight to stderr under `bash -x` or `set -x` — an entirely ordinary thing to
# do when debugging a failing script. Measured before this guard: one
# keyring_require call leaked the value four times, into exactly the channel
# P1239 Done-When claims is closed. xtrace is suspended across the read and
# restored to however the caller had it.
keyring_require() {
  local _kr_x="" _kr_rc
  case "$-" in *x*) _kr_x=1; set +x ;; esac
  _keyring_require_impl "$@"
  _kr_rc=$?
  [ -n "$_kr_x" ] && set -x
  return $_kr_rc
}

_keyring_require_impl() {
  local key val
  for key in "$@"; do
    if ! val="$(keyring_get "$key")"; then
      cat >&2 <<MSG
FATAL: could not read the critical credential ${key}.

  Either you declined the authorization dialog, or ${key} is not enrolled
  in the keychain. This script will NOT fall back to a plaintext copy.

  To retry:  re-run this command and click "Allow" (never "Always Allow" —
             that permanently disables the gate; see ./scripts/keyring.sh verify)
  To enroll: ./scripts/keyring.sh enroll ${key}
  To check:  ./scripts/keyring.sh status
MSG
      return 1
    fi
    if [[ -z "$val" ]]; then
      echo "FATAL: ${key} decrypted to an empty value — refusing to continue." >&2
      return 1
    fi
    printf -v "$key" '%s' "$val"
    export "${key?}"
  done
}

# --- CLI ------------------------------------------------------------------

# Extract one value from an env file without echoing it anywhere but stdout.
_keyring_env_value() {
  local key="$1" file="$2"
  awk -v k="$key" '
    index($0, k "=") == 1 {
      v = substr($0, length(k) + 2)
      if (v ~ /^".*"$/)      v = substr(v, 2, length(v) - 2)
      else if (v ~ /^'\''.*'\''$/) v = substr(v, 2, length(v) - 2)
      print v
      exit
    }
  ' "$file"
}

_keyring_cmd_enroll() {
  local envfile="${KEYRING_ROOT}/../.env.local"
  [[ -r "$envfile" ]] || { echo "keyring: cannot read $envfile" >&2; return 1; }
  local keys=("$@") k
  if [[ ${#keys[@]} -eq 0 ]]; then
    while IFS= read -r k; do keys+=("$k"); done < <(keyring_keys)
  fi
  local key rc=0
  for key in "${keys[@]}"; do
    if ! keyring_is_registered "$key"; then
      echo "SKIP     ${key} — not in $(basename "$KEYRING_REGISTRY")" >&2
      rc=1; continue
    fi
    if ! _keyring_env_value "$key" "$envfile" | grep -q .; then
      echo "SKIP     ${key} — no value in .env.local (if it lives in another file: enroll-from)" >&2
      rc=1; continue
    fi
    if _keyring_env_value "$key" "$envfile" \
         | python3 "$KEYRING_PY" add "$(keyring_service_name "$key")"; then
      echo "ENROLLED ${key}"
    else
      echo "FAILED   ${key}" >&2
      rc=1
    fi
  done
  echo
  echo "The plaintext copies in .env.local were NOT removed — both copies must"
  echo "coexist until the locked path has served every consumer (P1239 Invariants)."
  return $rc
}

# Enroll a credential from a DIFFERENT env file under an explicit locked name (P1214).
#
# Why the name is explicit rather than the source variable's: the prod-tier env file holds
# its own, DIFFERENT copy of a credential under the same variable name .env.local uses.
# Enrolling it under that shared name would silently replace the .env.local copy's item —
# `add` is delete-then-create — and every consumer of the first copy would start reading
# the second, with no error. A distinct registered name makes the two copies two items.
_keyring_cmd_enroll_from() {
  local src="${1:-}" var="${2:-}" name="${3:-}"
  if [[ -z "$src" || -z "$var" || -z "$name" ]]; then
    echo "usage: keyring.sh enroll-from ENV_FILE SOURCE_VAR LOCKED_NAME" >&2
    return 2
  fi
  [[ -r "$src" ]] || { echo "keyring: cannot read $src" >&2; return 1; }
  if ! keyring_is_registered "$name"; then
    echo "SKIP     ${name} — not in $(basename "$KEYRING_REGISTRY")" >&2
    return 1
  fi
  if ! _keyring_env_value "$var" "$src" | grep -q .; then
    echo "SKIP     ${name} — no value for ${var} in $(basename "$src")" >&2
    return 1
  fi
  if _keyring_env_value "$var" "$src" \
       | python3 "$KEYRING_PY" add "$(keyring_service_name "$name")"; then
    echo "ENROLLED ${name} (from $(basename "$src"), variable ${var})"
  else
    echo "FAILED   ${name}" >&2
    return 1
  fi
  echo
  echo "The plaintext copy in $(basename "$src") was NOT removed (P1239 Invariants)."
}

_keyring_cmd_verify() {
  local svcs=() k
  while IFS= read -r k; do svcs+=("$(keyring_service_name "$k")"); done \
    < <(keyring_keys) || return 1
  [[ ${#svcs[@]} -gt 0 ]] || { echo "keyring: registry is empty" >&2; return 1; }
  echo "Gate check — does a human still have to authorize every read?"
  echo "(reads ACLs only; never decrypts, so this never prompts)"
  echo
  python3 "$KEYRING_PY" acl "${svcs[@]}"
  local rc=$?
  echo
  case $rc in
    0) echo "PASS — every enrolled item still requires authorization." ;;
    1) echo "INCOMPLETE — some registered keys are not enrolled (see MISSING above)." ;;
    2) echo "FAIL — at least one item has a trusted application: the gate is a NO-OP"
       echo "       for it. This is what clicking \"Always Allow\" does."
       echo "       Repair: ./scripts/keyring.sh enroll <KEY>   (re-creates with an empty ACL)" ;;
  esac
  return $rc
}

_keyring_cmd_status() {
  local k svc
  while IFS= read -r k; do
    svc="$(keyring_service_name "$k")"
    if python3 "$KEYRING_PY" exists "$svc"; then
      printf '%-40s enrolled\n' "$k"
    else
      printf '%-40s NOT enrolled\n' "$k"
    fi
  done < <(keyring_keys)
}

_keyring_cmd_requests() {
  local log
  log="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.private/logs/keyring-requests.log"
  python3 "${KEYRING_ROOT}/lib/keyring-requests.py" "$log" "${1:-10}"
  _keyring_live_requests
}

# A request only writes to the log if the code making it carries the announcement.
# A worktree whose branch predates that change reads the keychain silently, and
# then a dialog appears with nothing to explain it. So also look at what is asking
# RIGHT NOW, which works regardless of which copy of the code is running.
_keyring_live_requests() {
  local pids pid line cwd key spec
  # Match only the interpreter actually doing the read. A parent shell carries the
  # same string in its own argv and would otherwise be reported as a second request.
  pids=$(ps -Ao pid=,command= | grep '[k]eychain\.py get' \
         | awk '$2 ~ /[Pp]ython/ {print $1}')
  [ -n "$pids" ] || return 0
  echo
  echo "ASKING RIGHT NOW — a dialog is open:"
  for pid in $pids; do
    line=$(ps -o command= -p "$pid" 2>/dev/null) || continue
    key=$(echo "$line" | sed -n 's/.*keychain\.py get cp\.keyring\.\([^ ]*\).*/\1/p')
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | tail -1)
    spec=$(git -C "${cwd:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null \
           | sed -n 's|^\(feature\|fix\)/\(p[0-9]*\).*|\2|p')
    printf '  now      %-28s %-16s %s\n' "${key:-?}" \
      "${spec:-$(basename "${cwd:-?}")}" "$(ps -o command= -p "$(ps -o ppid= -p "$pid" | tr -d ' ')" 2>/dev/null | awk '{print $1, $2}')"
  done
  echo
  echo "  Recognise it? Allow. Don't? Deny — nothing breaks that can't be re-run."
}

_keyring_cmd_withdraw() {
  [[ -n "$1" ]] || { echo "usage: keyring.sh withdraw KEY" >&2; return 1; }
  python3 "$KEYRING_PY" delete "$(keyring_service_name "$1")"
}

# Only run the CLI when executed, not when sourced by a consumer.
# `:-` because zsh leaves BASH_SOURCE unset: under `set -u` the bare form printed
# "parameter not set" every time a skill sourced this file (independent review, P1214).
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
  case "${1:-}" in
    enroll)   shift; _keyring_cmd_enroll "$@" ;;
    enroll-from) shift; _keyring_cmd_enroll_from "$@" ;;
    verify)   _keyring_cmd_verify ;;
    status)   _keyring_cmd_status ;;
    list)     keyring_keys ;;
    requests) shift; _keyring_cmd_requests "$@" ;;
    withdraw) shift; _keyring_cmd_withdraw "$@" ;;
    *) sed -n '2,30p' "${BASH_SOURCE[0]:-$0}" | sed 's/^# \{0,1\}//'; exit 1 ;;
  esac
fi
