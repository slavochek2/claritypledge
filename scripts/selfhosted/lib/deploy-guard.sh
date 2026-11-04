#!/bin/bash
# scripts/selfhosted/lib/deploy-guard.sh — guards for deploying edge functions to the shared
# self-hosted TEST server (P1612). Sourced by scripts/selfhosted/deploy-functions.sh, never run.
#
# Why: the deploy replaces the whole of _shared, the router and the JWT list from the CURRENT
# checkout. A checkout that is behind main on any of those puts main's older copy back and the
# server reports success (2026-11-04). Everything here is about not letting that happen quietly.
#
#   dg_ancestry_check <repo> <src-ref>   0 = source holds every deployed-input change main has;
#                                        1 = refused (stale), message on stderr; 2 = cannot tell
#   dg_guard_begin <repo> <src-ref>      ancestry check, take the TEST deploy lock, re-check main
#                                        under the lock. Lock is released by dg_lock_release.
#   dg_lock_release                      idempotent; only removes a lock this process took
#   dg_manifest_fragment <stage> <commit> <branch> <dirty>   writes $stage/functions/.manifest-fragment
#   dg_response_alive <http-status> <body-file>              0 = the function itself answered
#
# Test seams (functions, not env vars): dg_after_precheck_hook runs between the first check and
# taking the lock; tests redefine it to move main in that window.

# Sourced twice in one shell (the deploy script and the landing hook both want it) is a no-op.
if type dg_lib_guard_loaded >/dev/null 2>&1; then return 0; fi
dg_lib_guard_loaded() { :; }

# "Deployed inputs": everything a deploy overwrites on the server. .test.ts files are excluded
# because the deploy excludes them.
DG_INPUT_PATHS=(supabase/functions supabase/selfhosted/functions-main/index.ts supabase/no-verify-jwt-functions.txt)
# Fixed on purpose: not overridable from the environment, or the guard could be pointed at any ref.
readonly DG_MAIN_REF="refs/heads/main"
DG_LOCK_DIR=""

dg_after_precheck_hook() { :; }
# Test seam: runs after a job decided a lock is dead and before it takes the clearing mutex.
dg_before_clear_hook() { :; }

dg_sha256() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi; }

# THE rule for which files a deploy ships, used by the deploy, the ancestry check, the drift check
# and the landing hook, so none of them can disagree about what "deployed" means.
# dg_is_deployed_path <path relative to supabase/functions>:
#   shipped: files inside a function directory (including _shared), plus deno.json and deno.lock
#   never:   .test.ts files, anything with a dot-prefixed component (.DS_Store and friends), and
#            any other top-level file (a README beside the function directories is not deployed)
dg_is_deployed_path() {
  case "$1" in
    *.test.ts) return 1 ;;
    .*|*/.*) return 1 ;;
    deno.json|deno.lock) return 0 ;;
    */*) return 0 ;;
    *) return 1 ;;
  esac
}
# dg_filter_deployed_repo_paths: repo-relative paths on stdin, deployed ones on stdout. The router
# and the JWT list are always deployed; paths under supabase/functions/ follow dg_is_deployed_path.
dg_filter_deployed_repo_paths() {
  local p
  while IFS= read -r p; do
    case "$p" in
      supabase/functions/*) dg_is_deployed_path "${p#supabase/functions/}" && printf '%s\n' "$p" ;;
      supabase/selfhosted/functions-main/index.ts|supabase/no-verify-jwt-functions.txt) printf '%s\n' "$p" ;;
    esac
  done
  return 0
}

# Files under the deployed inputs that main changed since this source diverged from it.
# A git failure is NOT "no changes": it returns 2 and the caller refuses. Only the filter, which
# cannot fail, is allowed to produce an empty list.
dg_stale_files() {
  local repo="$1" src="$2" base changed
  base="$(git -C "$repo" merge-base "$src" "$DG_MAIN_REF" 2>/dev/null)" || return 2
  changed="$(git -C "$repo" diff --name-only "$base" "$DG_MAIN_REF" -- "${DG_INPUT_PATHS[@]}" 2>/dev/null)" || return 2
  printf '%s\n' "$changed" | dg_filter_deployed_repo_paths
}

dg_ancestry_check() {
  local repo="$1" src="$2" files rc=0 n
  git -C "$repo" rev-parse --verify -q "$DG_MAIN_REF^{commit}" >/dev/null || {
    echo "REFUSED: cannot find local main ($DG_MAIN_REF) to compare against. Nothing was deployed." >&2; return 2; }
  git -C "$repo" rev-parse --verify -q "$src^{commit}" >/dev/null || {
    echo "REFUSED: cannot resolve the source commit ($src). Nothing was deployed." >&2; return 2; }
  files="$(dg_stale_files "$repo" "$src")" || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "REFUSED: could not compare this checkout with main (no common history, or git failed). Nothing was deployed." >&2; return 2
  fi
  [ -z "$files" ] && return 0
  n="$(printf '%s\n' "$files" | wc -l | tr -d ' ')"
  {
    echo "REFUSED: this checkout is behind main on $n deployed file(s); deploying it would put main's older copy back on the shared TEST server."
    printf '%s\n' "$files" | head -8 | sed 's/^/  /'
    [ "$n" -gt 8 ] && echo "  ... and $((n - 8)) more"
    echo "Fix: rebase onto main (git rebase main), then deploy again. Nothing was deployed."
  } >&2
  return 1
}

# --- The TEST deploy lock: shared by every checkout through the git common dir. ---
dg_lock_age() { # seconds since epoch $1, or "unknown"
  [ -n "$1" ] && echo "$(( $(date +%s) - $1 ))s" || echo unknown
}

# dg_deadline <seconds> <command...>: run a command with a hard deadline (macOS has no timeout(1);
# perl's alarm is what health.sh uses). Exit 124 on timeout; otherwise the command's own status.
# stdin passes through, so it can sit at the end of a pipe.
dg_deadline() {
  local secs="$1"; shift
  perl -e '
    my $secs = shift; my $pid = fork();
    defined $pid or exit 125;
    if (!$pid) { setpgrp(0, 0); exec @ARGV; exit 127 }
    # The command runs in its own process group so a deadline (or a TERM sent to this wrapper)
    # takes its children, such as the ssh tunnel, with it.
    my $die = sub { kill "TERM", -$pid; select(undef, undef, undef, 1.5); kill "KILL", -$pid; waitpid($pid, 0) };
    $SIG{ALRM} = sub { $die->(); exit 124 };
    $SIG{TERM} = $SIG{INT} = $SIG{HUP} = sub { $die->(); exit 143 };
    alarm $secs; waitpid($pid, 0); alarm 0;
    my $st = $?; exit(($st & 127) ? 128 + ($st & 127) : $st >> 8);
  ' "$secs" "$@"
}

# The lock lives in the git common dir, so every checkout shares it. Its owner file records pid,
# host and start time.
dg_lock_dir_of() { git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null | sed 's|$|/cp-test-deploy.lock|'; }
dg_lock_field() { sed -n "s/^$2=//p" "$1/owner" 2>/dev/null | head -1; }
# Provably dead: the owner file names a pid on THIS machine and kill -0 answers "No such process".
# A foreign host, no owner record, or any live process (even one we may not signal: EPERM) is not
# provable. No ps: it is blocked in some sandboxes, and a blocked ps must never read as "dead".
dg_lock_owner_dead() {
  local dir="$1" pid host err
  pid="$(dg_lock_field "$dir" pid)"; host="$(dg_lock_field "$dir" host)"
  [ -n "$pid" ] && [ -n "$host" ] && [ "$host" = "$(hostname)" ] || return 1
  err="$(kill -0 "$pid" 2>&1)" && return 1
  case "$err" in *"No such process"*) return 0 ;; *) return 1 ;; esac
}

# dg_lock_acquire <repo> [wait-seconds] [clear-dead]
#   wait: a lock held by a LIVE run, or one with no readable owner record (old branches' wrappers
#         create those), is waited for up to that many seconds, saying so on stderr.
#   clear-dead (1): a lock whose owner is provably dead (dg_lock_owner_dead) is cleared and the
#         acquire retried, printing that it did. Only the landing job asks for this; an
#         interactive deploy reports the lock and the exact command instead.
#   A live holder or an ownerless lock is never removed.
dg_lock_acquire() {
  local repo="$1" waited_max="${2:-0}" clear_dead="${3:-0}" waited=0 common owner pid epoch dir moved
  common="$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)" || return 1
  DG_LOCK_DIR=""
  dir="$common/cp-test-deploy.lock"
  while :; do
    if mkdir "$dir" 2>/dev/null; then
      printf 'pid=%s\nhost=%s\nepoch=%s\n' "$$" "$(hostname)" "$(date +%s)" > "$dir/owner"
      DG_LOCK_DIR="$dir"
      return 0
    fi
    if [ "$clear_dead" = 1 ] && dg_lock_owner_dead "$dir"; then
      pid="$(dg_lock_field "$dir" pid)"
      dg_before_clear_hook
      # Clearing is serialized by its own mkdir mutex, and the owner is re-read INSIDE it: two jobs
      # that saw the same dead owner cannot both act, and a job that cleared the lock and took a
      # fresh one is never mistaken for the dead owner (its pid differs, so nothing is removed).
      if mkdir "$dir.clear" 2>/dev/null; then
        printf 'pid=%s\nhost=%s\n' "$$" "$(hostname)" > "$dir.clear/owner"
        if [ -d "$dir" ] && [ "$(dg_lock_field "$dir" pid)" = "$pid" ] && dg_lock_owner_dead "$dir"; then
          rm -rf "$dir"
          echo "Cleared a stale TEST deploy lock left by dead pid $pid (this machine)." >&2
        fi
        rm -rf "$dir.clear"
      elif ! dg_lock_owner_dead "$dir.clear"; then
        sleep 0.2   # another job is clearing right now
      else
        rm -rf "$dir.clear"   # the clearer itself died holding the mutex
      fi
      continue
    fi
    pid="$(dg_lock_field "$dir" pid)"
    if [ "$waited_max" -gt 0 ] && [ "$waited" -lt "$waited_max" ] && ! dg_lock_owner_dead "$dir" &&
       { [ -z "$pid" ] || kill -0 "$pid" 2>/dev/null || [ "$(dg_lock_field "$dir" host)" != "$(hostname)" ]; }; then
      [ "$waited" -eq 0 ] && echo "Waiting for the running TEST deploy to finish, up to ${waited_max}s." >&2
      sleep "${DG_LOCK_POLL:-2}"; waited=$((waited + ${DG_LOCK_POLL:-2}))
      continue
    fi
    break
  done
  owner="$dir/owner"
  pid="$(dg_lock_field "$dir" pid)"
  epoch="$(dg_lock_field "$dir" epoch)"
  [ -n "$epoch" ] || epoch="$(stat -f %m "$dir" 2>/dev/null || stat -c %Y "$dir" 2>/dev/null || true)"
  if dg_lock_owner_dead "$dir"; then
    echo "REFUSED: a stale TEST deploy lock from a dead run (pid $pid, $(dg_lock_age "$epoch") old) is in the way: $dir" >&2
    echo "Its owner is provably dead. If no deploy is running, clear it with:  rm -r '$dir'  and re-run. Nothing was deployed." >&2
  elif [ -n "$pid" ] && [ "$(dg_lock_field "$dir" host)" = "$(hostname)" ]; then
    echo "REFUSED: another TEST deploy is running (pid $pid, started $(dg_lock_age "$epoch") ago). Wait for it and re-run. Nothing was deployed." >&2
  else
    echo "REFUSED: a TEST deploy lock with no usable owner record is held ($(dg_lock_age "$epoch") old): $dir" >&2
    echo "Cannot tell whether a deploy is running, so it is not removed. If you are sure none is:  rm -r '$dir'. Nothing was deployed." >&2
  fi
  return 1
}

# dg_lock_stuck <repo>: prints one line and returns 0 when the lock looks stuck (provably dead
# owner, or no owner record for over 10 minutes). A lock held by a live run is not stuck.
dg_lock_stuck() {
  local dir epoch age
  dir="$(dg_lock_dir_of "$1")"
  [ -n "$dir" ] && [ -d "$dir" ] || return 1
  epoch="$(dg_lock_field "$dir" epoch)"
  [ -n "$epoch" ] || epoch="$(stat -f %m "$dir" 2>/dev/null || stat -c %Y "$dir" 2>/dev/null || true)"
  age="$(dg_lock_age "$epoch")"
  if dg_lock_owner_dead "$dir"; then
    echo "stuck deploy lock (owner pid $(dg_lock_field "$dir" pid) is dead, $age old): rm -r '$dir'"; return 0
  fi
  if [ -z "$(dg_lock_field "$dir" pid)" ] && [ -n "$epoch" ] && [ $(( $(date +%s) - epoch )) -gt 600 ]; then
    echo "stuck deploy lock (no owner record, $age old): rm -r '$dir'"; return 0
  fi
  return 1
}

# Record of the latest landing deploy that failed, in the git common dir. One tab-separated line:
# epoch, commit, exit status, log path. A later successful deploy of main clears it.
dg_land_failed_file() { git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null | sed 's|$|/cp-test-deploy-land.failed|'; }

dg_lock_release() {
  [ -n "$DG_LOCK_DIR" ] || return 0
  if [ "$(sed -n 's/^pid=//p' "$DG_LOCK_DIR/owner" 2>/dev/null | head -1)" = "$$" ]; then
    rm -rf "$DG_LOCK_DIR"
  fi
  DG_LOCK_DIR=""
}

dg_guard_begin() {
  local repo="$1" src="$2"
  dg_ancestry_check "$repo" "$src" || { dg_lock_release; return 1; }
  dg_after_precheck_hook
  # A caller that already holds the lock (the landing mode takes it first) must not take it twice.
  [ -n "$DG_LOCK_DIR" ] || dg_lock_acquire "$repo" || return 1
  # Re-read main now that nothing else can deploy: a ship may have landed while we waited.
  if ! dg_ancestry_check "$repo" "$src"; then dg_lock_release; return 1; fi
  return 0
}

# --- Manifest fragment: one F line per staged file (path, sha256), one D line per function dir. ---
# Shipped inside the tarball; the VM merges it into its manifest (replaced dirs only).
dg_manifest_fragment() {
  local stage="$1" commit="$2" branch="$3" dirty="$4" out now f rel d
  out="$stage/functions/.manifest-fragment"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  : > "$out"
  ( cd "$stage/functions" && find . -type f ! -name '.full-deploy' ! -name '.manifest-fragment' | sed 's|^\./||' | LC_ALL=C sort ) |
    while IFS= read -r rel; do
      printf 'F\t%s\t%s\n' "$rel" "$(dg_sha256 "$stage/functions/$rel")" >> "$out"
    done
  for d in "$stage/functions"/*/; do
    [ -d "$d" ] || continue
    printf 'D\t%s\t%s\t%s\t%s\t%s\n' "$(basename "$d")" "$commit" "$branch" "$now" "$dirty" >> "$out"
  done
}

# Did a worker answer an OPTIONS probe? 2xx and 4xx except 404 mean one did (a 401, 405 or 429 is a
# worker answering; the probe is not testing the function's logic). ANY 5xx fails, including a
# function's own {"error"} 500: a worker that answers a preflight with a server error is not healthy
# enough to call deployed. 404 means the router cannot find it. 000 is transport.
dg_response_alive() {
  local status="$1"
  case "$status" in
    2??) return 0 ;;
    404) return 1 ;;
    4??) return 0 ;;
    *) return 1 ;;
  esac
}
