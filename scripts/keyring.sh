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
#     keyring_require PROD_SUPABASE_SERVICE_ROLE_KEY
#     # ... $PROD_SUPABASE_SERVICE_ROLE_KEY is now exported, or we already exited
#
# CLI:
#     ./scripts/keyring.sh enroll [KEY...]   copy key(s) from .env.local into the keychain
#     ./scripts/keyring.sh verify            report whether the gate still fires (no dialog)
#     ./scripts/keyring.sh status            enrolled / not-enrolled per registered key
#     ./scripts/keyring.sh list              registered critical key names
#     ./scripts/keyring.sh withdraw KEY      remove a key from the keychain (rollback)
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
  _keyring_git_root="$(git rev-parse --show-toplevel 2>/dev/null)"
  if [ -n "$_keyring_git_root" ] && [ -r "${_keyring_git_root}/scripts/keyring-critical.txt" ]; then
    KEYRING_ROOT="${_keyring_git_root}/scripts"
  fi
fi
KEYRING_PY="${KEYRING_ROOT}/lib/keychain.py"
KEYRING_REGISTRY="${KEYRING_ROOT}/keyring-critical.txt"
KEYRING_SERVICE_PREFIX="cp.keyring."

keyring_service_name() { printf '%s%s' "$KEYRING_SERVICE_PREFIX" "$1"; }

# Registered critical key names, comments and blanks stripped.
keyring_keys() {
  [[ -r "$KEYRING_REGISTRY" ]] || {
    echo "keyring: missing registry $KEYRING_REGISTRY" >&2
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
  python3 "$KEYRING_PY" get "$(keyring_service_name "$1")"
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
      echo "SKIP     ${key} — no value in .env.local" >&2
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

_keyring_cmd_withdraw() {
  [[ -n "$1" ]] || { echo "usage: keyring.sh withdraw KEY" >&2; return 1; }
  python3 "$KEYRING_PY" delete "$(keyring_service_name "$1")"
}

# Only run the CLI when executed, not when sourced by a consumer.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-}" in
    enroll)   shift; _keyring_cmd_enroll "$@" ;;
    verify)   _keyring_cmd_verify ;;
    status)   _keyring_cmd_status ;;
    list)     keyring_keys ;;
    withdraw) shift; _keyring_cmd_withdraw "$@" ;;
    *) sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
  esac
fi
