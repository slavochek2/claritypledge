#!/bin/bash
# scripts/lib/prod-functions.sh — shared by every prod edge-function deploy path (P1732):
#   scripts/deploy-prod-functions.sh (the /push step, rollback mode, the /day check)
#   scripts/deploy-functions.sh --env prod (manual one-off deploys)
#
# Provides:
#   prodfn_lock_acquire / prodfn_lock_release  one prod function deploy at a time (Invariant 3)
#   prodfn_preflight                           scoped, fail-closed secret preflight (Invariant 7)
#   prodfn_expected_ref / prodfn_check_target  the upload target must be the prod project
#   prodfn_ref_from_url / prodfn_no_verify_jwt  the URL shape and the JWT list, parsed one way
#   prodfn_smoke_failed_* helpers              the record that keeps a smoke-failed function
#                                              "not in sync" until a later smoke passes (Invariant 4)
#   prodfn_proof_* helpers                     the only evidence a missing stamp may be recorded
#                                              without a second upload (Invariant 5)
#
# State lives in git's COMMON directory, so the main checkout and every worktree of it share it.
# Output contract (shell-safety.md): status lines never carry redirect or pipe tokens.

# The prod project. A deploy whose .env.prod names anything else uploads nothing. Tests point it at
# fixture refs via CP_PROD_PROJECT_REF_EXPECTED. That override is honoured only for values that
# cannot be a real project: a real Supabase ref is 20 lowercase letters, and an inherited override
# naming one (TEST's, say) must not widen the target check (Invariant 7). Same shape as
# check-prod-deploy.sh, whose test override is accepted only for localhost.
prodfn_expected_ref() {
  local v="${CP_PROD_PROJECT_REF_EXPECTED:-}" r
  if [ -n "$v" ]; then
    for r in $v; do
      if [[ "$r" =~ ^[a-z]{20}$ ]]; then
        echo "prod functions: refusing CP_PROD_PROJECT_REF_EXPECTED, it names a real-shaped project ref" >&2
        printf '%s\n' "besjtuodziykmjidubzw"; return 0
      fi
    done
    printf '%s\n' "$v"; return 0
  fi
  printf '%s\n' "besjtuodziykmjidubzw"
}

# prodfn_common_dir <checkout> — absolute git common dir.
prodfn_common_dir() {
  git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null
}

# --- lock -----------------------------------------------------------------------------------
# Atomic hard-link primitive (same as stamp-deploy-manifest.sh and git-ops.sh: no flock on macOS).
# A lock whose holder is dead (PID gone or recycled) is broken; a live one is waited for, up to
# PROD_FN_LOCK_TIMEOUT seconds (default 900), then the caller reports unproven.
PRODFN_LOCK_FILE=""
PRODFN_LOCK_HELD=0
_prodfn_pid_start() { LC_ALL=C ps -o lstart= -p "$1" 2>/dev/null | tr -s ' ' | sed 's/^ *//; s/ *$//'; }
_prodfn_holder_live() {
  local pid="$1" rec="$2"
  kill -0 "$pid" 2>/dev/null || return 1
  [ -z "$rec" ] && return 0
  [ "$(_prodfn_pid_start "$pid")" = "$rec" ]
}
prodfn_lock_acquire() { # <checkout>
  local common waited=0 timeout="${PROD_FN_LOCK_TIMEOUT:-900}" tmp holder hstart stale
  common="$(prodfn_common_dir "$1")" || return 1
  [ -n "$common" ] || return 1
  PRODFN_LOCK_FILE="$common/cp-prod-functions.lock"
  tmp="$(mktemp "$common/cp-prod-functions.lock.XXXXXX")" || return 1
  printf 'PID=%s\nPID_START_TIME=%s\nSTARTED=%s\n' "$$" "$(_prodfn_pid_start "$$")" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$tmp"
  while :; do
    if ln "$tmp" "$PRODFN_LOCK_FILE" 2>/dev/null; then
      rm -f "$tmp"; PRODFN_LOCK_HELD=1; return 0
    fi
    holder="$(sed -n 's/^PID=//p' "$PRODFN_LOCK_FILE" 2>/dev/null)"
    hstart="$(sed -n 's/^PID_START_TIME=//p' "$PRODFN_LOCK_FILE" 2>/dev/null)"
    if [ -n "$holder" ] && ! _prodfn_holder_live "$holder" "$hstart"; then
      # Only one contender may break a stale lock: the breaker guard is an atomic mkdir. Under it
      # the holder is read again, so a lock another contender has just replaced with a live one is
      # never removed. A guard left by a breaker that died is cleared after 60s.
      if mkdir "$PRODFN_LOCK_FILE.break" 2>/dev/null; then
        if [ "$(sed -n 's/^PID=//p' "$PRODFN_LOCK_FILE" 2>/dev/null)" = "$holder" ] \
           && [ "$(sed -n 's/^PID_START_TIME=//p' "$PRODFN_LOCK_FILE" 2>/dev/null)" = "$hstart" ] \
           && ! _prodfn_holder_live "$holder" "$hstart"; then
          echo "prod function lock: breaking a stale lock left by dead pid $holder" >&2
          rm -f "$PRODFN_LOCK_FILE"
        fi
        rmdir "$PRODFN_LOCK_FILE.break" 2>/dev/null
        continue
      fi
      if [ -n "$(find "$PRODFN_LOCK_FILE.break" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then
        rmdir "$PRODFN_LOCK_FILE.break" 2>/dev/null
      fi
    fi
    if [ "$waited" -ge "$timeout" ]; then
      rm -f "$tmp"
      echo "prod function lock: still held after ${timeout}s by: $(tr '\n' ' ' < "$PRODFN_LOCK_FILE" 2>/dev/null)" >&2
      return 1
    fi
    sleep 1; waited=$((waited + 1))
  done
}
prodfn_lock_release() {
  if [ "$PRODFN_LOCK_HELD" = 1 ] && [ -n "$PRODFN_LOCK_FILE" ]; then
    if [ "$(sed -n 's/^PID=//p' "$PRODFN_LOCK_FILE" 2>/dev/null)" = "$$" ]; then rm -f "$PRODFN_LOCK_FILE"; fi
    PRODFN_LOCK_HELD=0
  fi
  return 0
}

# --- target ---------------------------------------------------------------------------------
# prodfn_check_target <ref> — 0 when the ref is the prod project. Prints the reason otherwise.
prodfn_check_target() {
  local ref="$1" want
  want="$(prodfn_expected_ref)"
  if [ -z "$ref" ]; then echo "no prod project ref could be read from .env.prod"; return 1; fi
  # The override may hold several fixture refs (space-separated) for canaries that tell .env.prod
  # copies apart by their ref; the shipped default is one ref.
  case " $want " in
    *" $ref "*) return 0 ;;
  esac
  echo "target mismatch: .env.prod names $ref, the prod project is $want"
  return 1
}

# prodfn_ref_from_url <url> — the project ref of a Supabase URL of exactly the form
# https://<ref>.supabase.co (an optional trailing slash). Anything else prints nothing and returns
# 1: a URL whose first label matches but whose host is elsewhere would let the smoke probe a
# different server from the one the upload targets.
prodfn_ref_from_url() {
  if [[ "$1" =~ ^https://([a-z0-9]+)\.supabase\.co/?$ ]]; then printf '%s\n' "${BASH_REMATCH[1]}"; return 0; fi
  return 1
}

# --- JWT policy -----------------------------------------------------------------------------
# prodfn_no_verify_jwt <list> <fn> — 0 when <fn> is listed. Parsed exactly as the fingerprint
# helper parses it (function-input-hash.py: each line stripped of surrounding whitespace, CR
# included; blank lines and # comments skipped), so the upload flag and the recorded fingerprint
# can never disagree about a line with a trailing space or a CRLF ending.
prodfn_no_verify_jwt() {
  grep -qxF -- "$2" < <(tr -d '\r' < "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | grep -v -e '^#' -e '^$')
}

# --- smoke-failure record -------------------------------------------------------------------
# One function name per line. Present = its last prod upload failed its smoke (or was never smoked)
# and it is not in sync, whatever the manifest says. Cleared when a later smoke of it passes.
prodfn_smoke_record_file() { printf '%s/cp-prod-smoke-failed.txt\n' "$(prodfn_common_dir "$1")"; }
prodfn_smoke_failed_add() { # <checkout> fn... — non-zero when the record could not be written
  local f; f="$(prodfn_smoke_record_file "$1")"; shift
  if [ -e "$f" ] && ! [ -r "$f" ]; then return 1; fi
  { cat "$f" 2>/dev/null; printf '%s\n' "$@"; } | grep -v '^$' | LC_ALL=C sort -u > "$f.tmp.$$" && mv "$f.tmp.$$" "$f"
}
# prodfn_smoke_record_read <checkout> <out> — absent record = empty; present but unreadable = 1.
prodfn_smoke_record_read() {
  local f; f="$(prodfn_smoke_record_file "$1")"
  if [ ! -e "$f" ]; then : > "$2"; return 0; fi
  cp "$f" "$2" 2>/dev/null
}

# --- deploy proof ---------------------------------------------------------------------------
# "<fn> TAB <fingerprint>" lines, written by deploy-prod-functions.sh only after that function was
# uploaded from a clean checkout AND its smoke passed. It is the only evidence that lets a run
# record a missing stamp without uploading again. A bare manifest value is never such evidence: a
# hand-run stamp or an interrupted manual deploy can write one with no healthy upload behind it.
prodfn_proof_file() { printf '%s/cp-prod-deployed.txt\n' "$(prodfn_common_dir "$1")"; }
prodfn_proof_read() { # <checkout> <out> — absent = empty; present but unreadable = 1
  local f; f="$(prodfn_proof_file "$1")"
  if [ ! -e "$f" ]; then : > "$2"; return 0; fi
  cp "$f" "$2" 2>/dev/null
}
prodfn_proof_set() { # <checkout> <fn> <fingerprint> — replaces any earlier line for <fn>
  local f; f="$(prodfn_proof_file "$1")"
  { [ -e "$f" ] && awk -F'\t' -v n="$2" '$1!=n' "$f"; printf '%s\t%s\n' "$2" "$3"; } > "$f.tmp.$$" && mv "$f.tmp.$$" "$f"
}
prodfn_proof_drop() { # <checkout> fn...
  local f n; f="$(prodfn_proof_file "$1")"; shift
  [ -e "$f" ] || return 0
  cp "$f" "$f.tmp.$$" || return 1
  for n in "$@"; do awk -F'\t' -v n="$n" '$1!=n' "$f.tmp.$$" > "$f.tmp2.$$" && mv "$f.tmp2.$$" "$f.tmp.$$"; done
  mv "$f.tmp.$$" "$f"
}
prodfn_smoke_failed_clear() { # <checkout> fn... — non-zero, record unchanged, when it cannot be rewritten
  local f cur rc; f="$(prodfn_smoke_record_file "$1")"; shift
  [ -f "$f" ] || return 0
  # A record that cannot be read must stay as it is: rewriting it from a failed read would drop every
  # other function's pending entry, and those would then read as in sync. cat, not awk: macOS awk
  # treats a read error as end of file and exits 0.
  cur="$(cat -- "$f")" || return 1
  # `|| rc=$?`, not `; rc=$?`: grep exits 1 when every entry is dropped, and a caller under set -e
  # would die on the bare pipeline before rc is read.
  rc=0; printf '%s\n' "$cur" | grep -vxF -e '' -f <(printf '%s\n' "$@") > "$f.tmp.$$" || rc=$?
  [ "$rc" -le 1 ] && mv "$f.tmp.$$" "$f" || { rm -f "$f.tmp.$$"; return 1; }
}

# --- preflight ------------------------------------------------------------------------------
# prodfn_preflight <ref> <functions-dir> <hash-helper> <secret-helper> <workdir> fn...
# Scoped to the named functions: each function's REQUIRED secrets are read from its traced inputs
# (its own files plus the _shared files it imports), and the secret inventory is read ONCE from
# the same project the upload targets.
# Return 0: per-function verdicts in <workdir>/preflight.ok (one name per line) and
#           <workdir>/preflight.excluded ("name: reason" lines). A function missing a secret is
#           excluded; the others proceed.
# Return 1: fatal, nothing may upload. The reason is in <workdir>/preflight.fatal.
prodfn_preflight() {
  local ref="$1" fdir="$2" hasher="$3" helper="$4" wd="$5"; shift 5
  local fn rel out rc missing req var bad
  : > "$wd/preflight.ok"; : > "$wd/preflight.excluded"; : > "$wd/preflight.fatal"
  fatal() { echo "$1" > "$wd/preflight.fatal"; return 1; }
  if [ -n "${SKIP_EDGE_SECRET_CHECK:-}" ] && [ "${SKIP_EDGE_SECRET_CHECK}" != "0" ]; then
    fatal "SKIP_EDGE_SECRET_CHECK is set in the environment; a prod deploy never skips the secret check"; return 1
  fi
  if [ ! -x "$helper" ]; then fatal "the secret-check helper is missing or not executable: $helper"; return 1; fi
  if [ ! -f "$hasher" ]; then fatal "the input-trace helper is missing: $hasher"; return 1; fi
  prodfn_check_target "$ref" > "$wd/preflight.target" || { fatal "$(cat "$wd/preflight.target")"; return 1; }
  rm -rf "$wd/union" "$wd/per"; mkdir -p "$wd/union" "$wd/per"
  local traced=()
  for fn in "$@"; do
    out="$(python3 "$hasher" "$fdir" --files "$fn" 2>/dev/null)" || { fatal "the input-trace helper failed for $fn"; return 1; }
    if ! printf '%s' "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if "files" in d else 1)' 2>/dev/null; then
      echo "$fn: inputs cannot be traced" >> "$wd/preflight.excluded"; continue
    fi
    mkdir -p "$wd/per/$fn"
    while IFS= read -r rel; do
      [ -n "$rel" ] || continue
      case "$rel" in *.ts|*.tsx|*.js|*.mjs) ;; *) continue ;; esac
      mkdir -p "$wd/union/$(dirname "$rel")" "$wd/per/$fn/$(dirname "$rel")"
      cp "$fdir/$rel" "$wd/union/$rel"; cp "$fdir/$rel" "$wd/per/$fn/$rel"
    done < <(printf '%s' "$out" | python3 -c 'import json,sys; print("\n".join(json.load(sys.stdin)["files"]))')
    traced+=("$fn")
  done
  [ ${#traced[@]} -gt 0 ] || return 0
  # No traced file reads the environment: no secret can be missing, and the helper stops before it
  # queries anything. Proven by the scan itself, never by the helper's silence.
  if ! grep -rqF 'Deno.env.get' "$wd/union" 2>/dev/null; then
    printf '%s\n' "${traced[@]}" >> "$wd/preflight.ok"; return 0
  fi
  local to=(); command -v timeout >/dev/null 2>&1 && to=(timeout -k 10 "${PROD_FN_NET_TIMEOUT:-120}")
  out="$(${to[@]+"${to[@]}"} "$helper" --project-ref "$ref" --scan-dir "$wd/union" 2>&1)"; rc=$?
  printf '%s\n' "$out" > "$wd/preflight.secrets-out"
  bad="$(printf '%s\n' "$out" | sed -n 's/^Querying secrets on project: //p' | grep -vxF "$ref" | head -1)"
  if [ -n "$bad" ]; then fatal "the secret check read project $bad, the upload targets $ref"; return 1; fi
  # Positive proof, not absence of a contrary line: a helper that stops printing its banner must not
  # read as "checked the right project".
  if ! printf '%s\n' "$out" | grep -qxF "Querying secrets on project: $ref"; then
    fatal "the secret check did not confirm it read project $ref"; return 1
  fi
  # The helper reads names out of whatever the CLI printed. An answer it could not parse reads as
  # "no secrets at all", which would mark every required secret missing and let the env-free
  # functions through on an inventory nobody read. Prod always holds secrets: zero is unreadable.
  if [ "$rc" -le 1 ] && ! printf '%s\n' "$out" | grep -qE '^SECRETS_FOUND: [1-9][0-9]*$'; then
    fatal "the secret inventory of $ref was empty or could not be parsed"; return 1
  fi
  missing=""
  if [ "$rc" -eq 1 ]; then
    missing="$(printf '%s\n' "$out" | sed -n 's/^  - \([A-Z_][A-Z0-9_]*\) (referenced at.*/\1/p')"
    if [ -z "$missing" ]; then fatal "the secret check failed and its result could not be read"; return 1; fi
  elif [ "$rc" -ne 0 ]; then
    fatal "the secret inventory could not be read (secret check exit $rc)"; return 1
  fi
  local excluded_any=0 parsed
  for fn in "${traced[@]}"; do
    if [ -n "$missing" ] && ! grep -rqF 'Deno.env.get' "$wd/per/$fn" 2>/dev/null; then
      echo "$fn" >> "$wd/preflight.ok"; continue
    fi
    if [ -n "$missing" ]; then
      parsed="$("$helper" --parse-only --scan-dir "$wd/per/$fn" 2>/dev/null)" \
        || { fatal "the secret check could not parse $fn's inputs"; return 1; }
      printf '%s\n' "$parsed" | grep -q '^REQUIRED' || { fatal "the secret check's parse of $fn could not be read"; return 1; }
      req="$(printf '%s\n' "$parsed" | sed -n 's/^REQUIRED[^:]*: //p' | tr ' ' '\n' | grep -v '^$')"
      var="$(printf '%s\n' "$missing" | grep -xF -f <(printf '%s\n' "$req" | grep -v '^$'; echo '#none#') | tr '\n' ' ' | sed 's/ $//')"
      if [ -n "$var" ]; then echo "$fn: missing secret $var" >> "$wd/preflight.excluded"; excluded_any=1; continue; fi
    fi
    echo "$fn" >> "$wd/preflight.ok"
  done
  # A secret is missing for the batch but no function claims it: the per-function attribution is
  # wrong, so nothing is safe to upload.
  if [ -n "$missing" ] && [ "$excluded_any" -eq 0 ]; then
    rm -f "$wd/preflight.ok"; fatal "a secret is missing for the batch but no batch function could be matched to it"; return 1
  fi
  return 0
}
