#!/usr/bin/env bash
# git-ops.sh — unified git-operations wrapper for multi-session agent workflow.
#
# Part of P781 (worktree/branch/push hygiene). Surface:
#   T02 (P783): claim, status, release
#   T03-T05 (P787): gc, abandon, reconcile, commit-to-main, switch-safe, sync
#   T06    (P788): ship — journal-based idempotent cherry-pick onto main
#
# Unknown subcommands print usage and exit 2.
#
# Lockfile identity survives PID recycling:
#   PID            — current shell PID
#   PID_START_TIME — from `ps -o lstart= -p $PID` (macOS-compatible, whitespace-trimmed)
#   NONCE          — 16 hex chars (8 random bytes) from /dev/urandom
#   SESSION_ID     — hostname-pid-epoch
#   HEARTBEAT      — ISO8601 UTC, refreshed by `claim` and `adopt` and by the SessionStart hook
#
# LIVENESS (revised P1268). PID existence alone CANNOT express liveness here: `claim`
# stamps the PID of the git-ops.sh process itself, and in an agent harness no process
# outlives a single command — so every agent-claimed lock was ORPHAN within milliseconds
# of being written. HEARTBEAT freshness is the primary evidence; PID is a fast path.
#
#   LIVE    — PID exists AND `ps -o lstart=` matches PID_START_TIME (fast path)
#             OR HEARTBEAT is within LOCK_TTL_SECONDS (default 12h)
#   STALE   — PID exists, start time differs (OS recycled the PID), heartbeat expired
#   ORPHAN  — PID does not exist AND heartbeat expired
#   NO_LOCK — slot directory has no .lock file
#
# Freshness fails CLOSED: an empty, unparseable or wildly skewed HEARTBEAT is not fresh.
# `scripts/pre-flight.sh` carries a deliberate standalone copy of this logic; the two are
# held in agreement by `scripts/test-lock-state-parity.sh`, not by convention.
#
# CALLER EVAL CONTRACT (P783 fix — see .claude/rules/shell-safety.md):
#   `claim` prints eval-safe output wrapped in #CP_CLAIM_BEGIN / #CP_CLAIM_END
#   sentinel markers. Callers MUST filter to the sentinel block before `eval`,
#   never pipe stderr into eval. Safe pattern:
#
#     eval "$(./scripts/git-ops.sh claim p1 slug 2>/tmp/claim-stderr.log \
#             | sed -n '/^#CP_CLAIM_BEGIN$/,/^#CP_CLAIM_END$/p' | grep -v '^#')"
#     cat /tmp/claim-stderr.log   # human-readable summary
#
#   Unsafe (DO NOT USE — caused the P783 .env.local truncation):
#     eval "$(./scripts/git-ops.sh claim p1 slug 2>&1 1>/tmp/...)"
#   Routing stderr into eval re-lexes setup-worktree.sh output and the shell
#   parses `->` as an I/O redirect, wiping files named in the status lines.
#
# All errors go to stderr. Exit codes: 0 success, 1 logical error, 2 usage error.

set -euo pipefail

# ----------------------------------------------------------------------------
# Repo-root resolution
# ----------------------------------------------------------------------------

# Works from the main repo or any worktree. `--git-common-dir` always points at
# the main repo's .git directory; its parent is the main repo root.
resolve_repo_root() {
  local common_dir
  common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [[ -z "$common_dir" ]]; then
    echo "git-ops: not inside a git repository" >&2
    exit 1
  fi
  # Strip trailing /.git if present (it always is for --git-common-dir)
  dirname "$common_dir"
}

REPO_ROOT="$(resolve_repo_root)"
WORKTREES_DIR="$REPO_ROOT/.claude/worktrees"
# Default first (bash 3.2 compat: source of missing file exits even with ||)
WATCHED_PATHS="docs/ features/ .claude/commands/ CLAUDE.md README.md content/articles/ content/sifter/ supabase/migrations/"
if [[ -f "$REPO_ROOT/scripts/privacy-watched-paths.sh" ]]; then
  source "$REPO_ROOT/scripts/privacy-watched-paths.sh"
fi
# Shared UTC-timestamp parser (the one blessed `date -j` site). See lib-datetime.sh.
if [[ -f "$REPO_ROOT/scripts/lib-datetime.sh" ]]; then
  source "$REPO_ROOT/scripts/lib-datetime.sh"
fi
# TTY-only gate override (P1246). See scripts/lib/gate-override.sh for why the
# escape hatch is a controlling terminal and not a flag file or env var.
if [[ -f "$REPO_ROOT/scripts/lib/gate-override.sh" ]]; then
  source "$REPO_ROOT/scripts/lib/gate-override.sh"
fi
# Required-status-check derivation (P1290). The `main` ruleset's required contexts are
# QUERIED, never hardcoded — a hardcoded list is what let push-docs promote while a
# newly-added second required check was still queued. See lib-required-checks.sh.
#
# Sourced when present. The HARD failure for a missing library lives in the two paths
# that promote to main (`require_required_checks_lib`, called by cmd_push_docs and
# cmd_ship_to_prod), NOT here.
#
# Why not here: a missing file must never degrade into an empty wait-list — with
# derive_required_contexts undefined, the caller's `|| ruleset_ok=1` swallows the
# command-not-found (127) under `set -e`, and an empty wait-list means "wait for
# nothing", i.e. promote to a public main with ZERO CI verification (found by hostile
# review, 2026-09-09). But refusing to LOAD AT ALL was the wrong lever: it broke
# `adopt`, `claim`, `park` and `status`, none of which touch a required check, because
# the hermetic canaries build fixtures that copy only git-ops.sh. That is epistemic gate
# 7c exactly — a new gate must be run against the workflows that already exist, and this
# one was caught by 15 failing assertions in test-git-ops-adopt.sh, not by inspection.
# Gate the operation, never the whole tool.
if [[ -f "$REPO_ROOT/scripts/lib-required-checks.sh" ]]; then
  source "$REPO_ROOT/scripts/lib-required-checks.sh"
fi

# Called at the top of every path that promotes to main. Fails closed and loudly.
require_required_checks_lib() {
  local caller="${1:-git-ops}"
  if ! command -v derive_required_contexts >/dev/null 2>&1 \
     || ! command -v wait_for_required_checks >/dev/null 2>&1; then
    echo "git-ops: FATAL: scripts/lib-required-checks.sh is missing or did not load." >&2
    echo "  ${caller} cannot verify main's required status checks without it, and" >&2
    echo "  promoting unverified is strictly worse than not promoting. Restore it." >&2
    exit 1
  fi
  if ! command -v parse_utc_epoch >/dev/null 2>&1; then
    echo "git-ops: FATAL: scripts/lib-datetime.sh is missing or did not load." >&2
    echo "  Without it the CI freshness guard cannot run, so a green check from a" >&2
    echo "  PRIOR staging cycle would satisfy this push. Restore it." >&2
    exit 1
  fi
}

# ----------------------------------------------------------------------------
# Utilities
# ----------------------------------------------------------------------------

die() {
  echo "git-ops: $*" >&2
  exit 1
}

usage_exit() {
  print_usage >&2
  exit 2
}

# Reap any process whose current working directory is inside a worktree we are about to
# remove. Without this, a dev server started in the worktree (e.g. `npm run dev` → Vite)
# outlives `git worktree remove`, reparents to PID 1, and squats its TCP port indefinitely
# (observed: a default-5173 Vite orphan that took down an unrelated local app). We reap by
# CWD — provably *this* worktree's processes — never by a guessed port: an orphan can bind a
# different port than its slot assigns, and killing a computed port can hit an innocent one.
#
# Scope / safety:
#   - Hard-guarded to paths under $WORKTREES_DIR, so a future caller can't aim it at the repo
#     root or $HOME.
#   - Matches by the PATH STRING lsof reports, NOT by inode — deliberately: an orphan from a
#     prior lifetime of a since-recreated slot holds a stale inode but the right path string,
#     and `lsof -- <dir>` (inode match) would miss exactly the orphan we exist to kill.
#   - Excludes this process and its whole ancestor chain, so it never kills the invoking
#     shell / terminal / agent session. NOTE: a *sibling* process you left cwd'd in the
#     worktree (a second shell, a `kanban wN` server) IS reaped — correct, since the dir is
#     being destroyed, but it happens with no prompt (the reaped pids are logged to stderr).
#   - Assumes worktree paths contain no embedded newline (true for the wN slot convention);
#     the line-oriented `lsof -F` parse would otherwise be foolable, and macOS awk has no
#     working NUL record separator to harden it further.
# Best-effort: never fails teardown.
reap_worktree_servers() {
  local wt="$1"
  # Hard containment: only ever operate on a real worktree path. Anything else → no-op.
  case "$wt" in "$WORKTREES_DIR"/*) ;; *) return 0 ;; esac
  [[ -d "$wt" ]] || return 0
  command -v lsof >/dev/null 2>&1 || return 0
  # Canonicalize to the physical path lsof reports (dir still exists here). `local wtp` MUST
  # stay on its own line: `local wtp="$(...)"` would let `local` (always exit 0) swallow the
  # subshell's status, so the `|| wtp="$wt"` fallback could never fire.
  local wtp
  wtp="$(cd "$wt" 2>/dev/null && pwd -P)" || wtp="$wt"
  wt="${wtp%/}"
  [[ -z "$wt" || "$wt" == "/" ]] && return 0

  # Exclusion set: this process + every ancestor up to init. Guarantees we never reap the
  # invoking shell / Claude session / terminal even if it is cwd'd into the worktree.
  local excl=" " a=$$
  while [[ -n "$a" && "$a" != "0" && "$a" != "1" ]]; do
    excl="$excl$a "
    a="$(ps -o ppid= -p "$a" 2>/dev/null | tr -d ' ')" || a=""
  done

  # PIDs whose cwd is the worktree root or anything under it. `lsof -d cwd` reads each
  # process's cwd without walking the tree (fast); awk matches by path prefix and drops
  # excluded pids. `local x="$(...)"` masks the pipe status so set -e/pipefail don't trip on
  # lsof's habitual non-zero exit while still capturing its stdout.
  local pids="$(lsof -d cwd -Fpn 2>/dev/null | awk -v wt="$wt" -v excl="$excl" '
    /^p/ { pid = substr($0, 2); next }
    /^n/ { p = substr($0, 2)
           if ((p == wt || index(p, wt "/") == 1) && index(excl, " " pid " ") == 0) print pid }
  ' | sort -u)"
  [[ -z "$pids" ]] && return 0

  echo "git-ops: reaping process(es) with cwd under $wt (pids: ${pids//$'\n'/ }) before worktree removal" >&2
  # We SIGTERM every matched pid directly (not just the parent), so npm failing to forward
  # the signal to its node/esbuild children doesn't matter — those were matched by cwd too.
  # shellcheck disable=SC2086  # word-splitting $pids into kill args is intentional
  kill -TERM $pids 2>/dev/null || true
  sleep 1
  local alive="" p
  for p in $pids; do kill -0 "$p" 2>/dev/null && alive="$alive $p" || true; done
  # shellcheck disable=SC2086
  [[ -n "$alive" ]] && kill -KILL $alive 2>/dev/null || true
  return 0
}

iso_now() {
  date -u +%FT%TZ
}

# ps -o lstart= -p PID returns e.g. "Mon Apr 21 22:34:17 2026" (macOS)
# Whitespace-trimmed so repeated runs compare cleanly.
pid_start_time() {
  local pid="$1"
  ps -o lstart= -p "$pid" 2>/dev/null | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/[[:space:]][[:space:]]*/ /g'
}

# 16 hex chars (8 random bytes) — 64 bits of entropy, per plan/spec.
gen_nonce() {
  head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

# Returns 0 if PID exists, 1 otherwise. `kill -0` is POSIX and non-destructive.
pid_alive() {
  local pid="$1"
  kill -0 "$pid" 2>/dev/null
}

# Parse KEY=VALUE lines from a lockfile into shell variables prefixed with LOCK_.
# Clears any prior LOCK_* state before reading.
load_lockfile() {
  local lockfile="$1"
  LOCK_PID=""; LOCK_PID_START_TIME=""; LOCK_NONCE=""; LOCK_SESSION_ID=""
  LOCK_SLOT=""; LOCK_BRANCH=""; LOCK_P_NUMBER=""; LOCK_CLAIMED_AT=""; LOCK_HEARTBEAT=""
  if [[ ! -f "$lockfile" ]]; then
    return 1
  fi
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      PID) LOCK_PID="$value" ;;
      PID_START_TIME) LOCK_PID_START_TIME="$value" ;;
      NONCE) LOCK_NONCE="$value" ;;
      SESSION_ID) LOCK_SESSION_ID="$value" ;;
      SLOT) LOCK_SLOT="$value" ;;
      BRANCH) LOCK_BRANCH="$value" ;;
      P_NUMBER) LOCK_P_NUMBER="$value" ;;
      CLAIMED_AT) LOCK_CLAIMED_AT="$value" ;;
      HEARTBEAT) LOCK_HEARTBEAT="$value" ;;
    esac
  done < "$lockfile"
  return 0
}

# P1268: liveness TTL for HEARTBEAT, in seconds. 12h — long enough that a session
# idle over a long break is never misread as dead, short enough that yesterday's
# corpse is visible today. Override for tests via CP_LOCK_TTL_SECONDS.
LOCK_TTL_SECONDS="${CP_LOCK_TTL_SECONDS:-43200}"

# Parse an ISO8601 UTC stamp ("2026-09-08T09:47:59Z") to epoch seconds.
# Prints nothing and returns 1 if it cannot be parsed — callers MUST treat that
# as "not fresh" (fail closed), never as "fresh".
iso_to_epoch() {
  local stamp="$1"
  [[ -n "$stamp" ]] || return 1
  # Validate the SHAPE before parsing. BSD `date -j -f` accepts trailing garbage
  # and still returns an epoch ("...Z; rm -rf /" parses fine), so a malformed
  # HEARTBEAT would read as LIFE rather than failing closed — the opposite of the
  # stated contract. Not an injection (it is an argument, never evaluated), but the
  # fail-closed property is the whole point. Found by adversarial review.
  [[ "$stamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || return 1
  # BSD (macOS) first, then GNU (Linux). Without the GNU arm every heartbeat is
  # unparseable there, so every lock reads ORPHAN and the feature silently inverts
  # to permissive on the clarity-agent VM. Same BSD-only family as `stat -f %m`.
  TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%SZ" "$stamp" +%s 2>/dev/null && return 0
  date -u -d "$stamp" +%s 2>/dev/null && return 0
  return 1
}

# Returns 0 iff the given HEARTBEAT is within LOCK_TTL_SECONDS of now.
# Fails closed: empty, unparseable, or clock-skewed stamps are never fresh.
heartbeat_fresh() {
  local hb="$1" hb_epoch now_epoch age
  hb_epoch="$(iso_to_epoch "$hb")" || return 1
  [[ -n "$hb_epoch" ]] || return 1
  now_epoch="$(date -u +%s)"
  age=$(( now_epoch - hb_epoch ))
  # A clock-skewed future stamp is not evidence of life; bound it both ways.
  [[ $age -lt 0 ]] && age=$(( -age ))
  [[ $age -le $LOCK_TTL_SECONDS ]]
}

# Emit one of: LIVE | STALE | ORPHAN | NO_LOCK
# Callers are expected to have already called load_lockfile.
classify_lock_state() {
  if [[ -z "${LOCK_PID:-}" ]]; then
    echo "NO_LOCK"
    return
  fi
  # Fast path: the recorded process is still the process that claimed the slot.
  if pid_alive "$LOCK_PID"; then
    local now_start
    now_start="$(pid_start_time "$LOCK_PID")"
    if [[ -n "$now_start" && "$now_start" == "$LOCK_PID_START_TIME" ]]; then
      echo "LIVE"
      return
    fi
    # PID recycled. A fresh heartbeat still evidences a live owner.
    if heartbeat_fresh "${LOCK_HEARTBEAT:-}"; then
      echo "LIVE"
      return
    fi
    echo "STALE"
    return
  fi
  # P1268: no process in an agent harness outlives a single command, so PID
  # absence alone cannot mean abandoned. A heartbeat inside the TTL is the
  # positive evidence of an owner; without it the slot really is orphaned.
  if heartbeat_fresh "${LOCK_HEARTBEAT:-}"; then
    echo "LIVE"
    return
  fi
  echo "ORPHAN"
}

# ----------------------------------------------------------------------------
# Subcommand: claim
# ----------------------------------------------------------------------------

cmd_claim() {
  if [[ $# -ne 2 ]]; then
    echo "usage: git-ops claim <p-number> <slug>" >&2
    exit 2
  fi
  local p_number="$1"
  local slug="$2"

  # Basic slug sanity — branch names cannot contain spaces or special git chars.
  if [[ ! "$p_number" =~ ^p[0-9]+$ ]]; then
    die "p-number must match 'p<digits>' (got '$p_number')"
  fi
  if [[ ! "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    die "slug must be lowercase-alnum-with-dashes (got '$slug')"
  fi

  mkdir -p "$WORKTREES_DIR"

  # Find next free slot using git's worktree registry as truth, with a strict
  # path-safety bounded auto-heal of orphan-only directories (left behind by
  # earlier `git worktree remove` cycles where a `node_modules` symlink or
  # similar untracked artifact survived).
  #
  # A slot is FREE iff:
  #   (a) not in `git worktree list` (registry says free)
  #   (b) no admin dir at $REPO_ROOT/.git/worktrees/<slot> (defends concurrent claim)
  #   (c) no live lockfile at <slot>/.lock
  #
  # If a slot is FREE per (a)+(b)+(c) but a directory exists with no `.git`
  # marker inside, it's an orphan — auto-clean. Real worktrees always have a
  # `.git` *file* at their root. `.git` presence guarantees we never delete an
  # active worktree even if it temporarily falls out of the registry.
  # awk filters by path prefix AND wN convention in one pass — no grep needed,
  # so the pipeline returns 0 lines without a non-zero exit when nothing matches
  # (avoids bash 3.2 `set -e` propagation through `var=$(... | grep)`).
  local registered_slots
  registered_slots="$(
    cd "$REPO_ROOT" && git worktree list --porcelain 2>/dev/null \
      | awk -v dir="$WORKTREES_DIR/" '
          /^worktree / && index($2, dir)==1 {
            slot = $2; sub(dir, "", slot);
            if (slot ~ /^w[0-9]+$/) print slot
          }' \
      | sort -u
  )"

  local slot="" slot_path="" candidate candidate_path
  local i
  for ((i = 1; i <= 99; i++)); do
    candidate="w$i"
    candidate_path="$WORKTREES_DIR/$candidate"

    # (a) registered as a worktree?
    printf '%s\n' "$registered_slots" | grep -qx "$candidate" && continue

    # (b) admin dir present? (TOCTOU defense — git creates this before the worktree dir)
    [[ -e "$REPO_ROOT/.git/worktrees/$candidate" ]] && continue

    # (c) live lockfile present?
    [[ -f "$candidate_path/.lock" ]] && continue

    # FREE per registry. If a stale directory exists without a `.git` marker,
    # auto-clean before claiming.
    if [[ -d "$candidate_path" && ! -e "$candidate_path/.git" ]]; then
      # Path-safety: WORKTREES_DIR must be a non-trivial absolute path under
      # the repo, and candidate_path must be the wN convention under it.
      case "$WORKTREES_DIR" in
        ""|/|/.claude*|/private/*) die "refusing rm: WORKTREES_DIR=$WORKTREES_DIR" ;;
      esac
      case "$candidate_path" in
        "$WORKTREES_DIR"/w[0-9]*) ;;
        *) die "refusing rm: $candidate_path outside slot convention" ;;
      esac
      rm -rf -- "$candidate_path"
    fi

    slot="$candidate"
    slot_path="$candidate_path"
    break
  done
  if [[ -z "$slot" ]]; then
    die "no free slot in w1..w99 — worktree ceiling reached"
  fi

  local branch="feature/${p_number}-${slug}"

  # Create worktree + branch from main repo root. `git worktree add -b` creates
  # the branch from HEAD of the current branch in REPO_ROOT; we explicitly use
  # main as the base to avoid inheriting whatever branch REPO_ROOT is on.
  (
    cd "$REPO_ROOT"
    git worktree add "$slot_path" -b "$branch" main
  ) >&2

  # Hydrate env symlinks (.env.local, node_modules, scripts, supabase/migrations).
  # setup-worktree.sh lives in the main repo's scripts/ dir.
  if [[ -x "$REPO_ROOT/scripts/setup-worktree.sh" ]]; then
    ( cd "$REPO_ROOT" && ./scripts/setup-worktree.sh "$slot_path" ) >&2
  else
    echo "git-ops: warning — scripts/setup-worktree.sh not found or not executable; env symlinks not hydrated" >&2
  fi

  # Build lockfile.
  local pid=$$
  local pst
  pst="$(pid_start_time "$pid")"
  if [[ -z "$pst" ]]; then
    die "could not read PID_START_TIME via 'ps -o lstart=' for pid $pid"
  fi
  local nonce
  nonce="$(gen_nonce)"
  # P1268 follow-up. claim used to ALWAYS stamp a process identity here, and that made
  # the whole heartbeat mechanism inert on a freshly claimed slot — a dead interlock
  # found by adversarial review and reproduced by command:
  #   * claim writes SESSION_ID=<hostname>-<pid>-<epoch> and a fresh heartbeat, so the
  #     slot reads LIVE;
  #   * the SessionStart hook's `adopt` refuses a LIVE lock without --nonce (rc=1), so
  #     the agent's session id never reaches the lockfile;
  #   * `cmd_heartbeat` needs LOCK_PID == $$ (never true — no agent process outlives a
  #     command, which is the original P1268 defect) or CP_SESSION_ID == LOCK_SESSION_ID,
  #     which now cannot match. It exits 0 silently, so nothing reports the failure.
  # Net effect: the slot ages back to ORPHAN after the TTL while its owner is still
  # working — exactly what the heartbeat exists to prevent.
  # Binding the caller's session id AT CLAIM TIME closes it: the same session that
  # claimed the slot is the one whose PostToolUse hook beats it. Falls back to the
  # process identity when CP_SESSION_ID is absent (a human running claim by hand).
  local session_id
  session_id="${CP_SESSION_ID:-$(hostname -s)-${pid}-$(date +%s)}"
  local now
  now="$(iso_now)"

  local lockfile="$slot_path/.lock"
  {
    echo "PID=$pid"
    echo "PID_START_TIME=$pst"
    echo "NONCE=$nonce"
    echo "SESSION_ID=$session_id"
    echo "SLOT=$slot"
    echo "BRANCH=$branch"
    echo "P_NUMBER=$p_number"
    echo "CLAIMED_AT=$now"
    echo "HEARTBEAT=$now"
  } > "$lockfile"

  # Human-readable summary to stderr.
  {
    echo "git-ops: claimed $slot for $branch"
    echo "  path   : $slot_path"
    echo "  branch : $branch"
    echo "  nonce  : $nonce"
    echo "  session: $session_id"
    echo ""
    echo "To capture the nonce in the parent shell (SAFE pattern — P783):"
    echo "  eval \"\$(scripts/git-ops.sh claim $p_number $slug 2>/tmp/claim-stderr.log \\"
    echo "          | sed -n '/^#CP_CLAIM_BEGIN\$/,/^#CP_CLAIM_END\$/p' | grep -v '^#')\""
  } >&2

  # L3b (P783) — wrap the eval-safe export in sentinel markers so callers can
  # filter to exactly this block and reject any other line. Any non-sentinel
  # stdout (including accidental stderr merges) becomes inert under the safe
  # caller pattern documented in stderr above.
  echo "#CP_CLAIM_BEGIN"
  echo "export CP_LOCK_NONCE_${slot}=${nonce}"
  echo "#CP_CLAIM_END"
}

# ----------------------------------------------------------------------------
# Subcommand: status
# ----------------------------------------------------------------------------

list_slot_dirs() {
  # Emit absolute paths of slot dirs (one per line), sorted by slot number.
  # No-op if worktrees dir absent.
  if [[ ! -d "$WORKTREES_DIR" ]]; then
    return 0
  fi
  # Only wN directories (avoid stray files). We sort numerically by the trailing digits.
  local entry
  for entry in "$WORKTREES_DIR"/w*; do
    [[ -d "$entry" ]] || continue
    local base
    base="$(basename "$entry")"
    if [[ "$base" =~ ^w[0-9]+$ ]]; then
      echo "$entry"
    fi
  done | awk -F/ '{ n = $NF; sub(/^w/, "", n); print n " " $0 }' | sort -n | awk '{ $1=""; sub(/^ /, ""); print }'
}

cmd_status_single() {
  local slot="$1"
  local slot_path="$WORKTREES_DIR/$slot"
  if [[ ! -d "$slot_path" ]]; then
    die "slot $slot does not exist at $slot_path"
  fi
  local lockfile="$slot_path/.lock"
  echo "Slot:     $slot"
  echo "Path:     $slot_path"
  if ! load_lockfile "$lockfile"; then
    echo "State:    NO_LOCK"
    echo "(no .lock file present)"
    return 0
  fi
  local state
  state="$(classify_lock_state)"
  echo "State:    $state"
  echo "Branch:   ${LOCK_BRANCH:-?}"
  echo "P-Number: ${LOCK_P_NUMBER:-?}"
  echo "PID:      ${LOCK_PID:-?}"
  echo "PID start:${LOCK_PID_START_TIME:+ }${LOCK_PID_START_TIME:-?}"
  # Redacted unless the caller is standing in this slot. `--nonce` accepts this
  # value as proof of ownership and bypasses the LIVE refusal, so `status wN` on a
  # slot you are not in must not hand it over. Honest about strength: .lock is a
  # readable file, so this is friction for the tool's own paths, not a boundary
  # against a determined local process.
  local _status_caller
  _status_caller="$(git rev-parse --path-format=absolute --show-toplevel 2>/dev/null || true)"
  if [[ -n "$_status_caller" && "$(cd "$_status_caller" 2>/dev/null && pwd -P)" == "$(cd "$slot_path" 2>/dev/null && pwd -P)" ]]; then
    echo "Nonce:    ${LOCK_NONCE:-?}"
  else
    echo "Nonce:    (hidden — run from inside $slot to see it)"
  fi
  echo "Session:  ${LOCK_SESSION_ID:-?}"
  echo "Claimed:  ${LOCK_CLAIMED_AT:-?}"
  echo "Heartbeat:${LOCK_HEARTBEAT:+ }${LOCK_HEARTBEAT:-?}"
}

cmd_status_table() {
  local slots
  slots="$(list_slot_dirs || true)"
  if [[ -z "$slots" ]]; then
    echo "(no slots under $WORKTREES_DIR)"
    return 0
  fi
  printf "%-6s %-45s %-8s %-8s\n" "SLOT" "BRANCH" "PID" "STATE"
  printf "%-6s %-45s %-8s %-8s\n" "----" "------" "---" "-----"
  local slot_path slot lockfile state branch pid
  while IFS= read -r slot_path; do
    [[ -z "$slot_path" ]] && continue
    slot="$(basename "$slot_path")"
    lockfile="$slot_path/.lock"
    if load_lockfile "$lockfile"; then
      state="$(classify_lock_state)"
      branch="${LOCK_BRANCH:--}"
      pid="${LOCK_PID:--}"
    else
      state="NO_LOCK"
      branch="-"
      pid="-"
    fi
    printf "%-6s %-45s %-8s %-8s\n" "$slot" "$branch" "$pid" "$state"
  done <<< "$slots"
}

cmd_status() {
  if [[ $# -eq 0 ]]; then
    cmd_status_table
  elif [[ $# -eq 1 ]]; then
    cmd_status_single "$1"
  else
    echo "usage: git-ops status [slot]" >&2
    exit 2
  fi
}

# ----------------------------------------------------------------------------
# Subcommand: release
# ----------------------------------------------------------------------------

cmd_release() {
  local slot=""
  local nonce_arg=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --nonce)
        if [[ $# -lt 2 ]]; then
          echo "--nonce requires a value" >&2
          exit 2
        fi
        nonce_arg="$2"
        shift 2
        ;;
      --nonce=*)
        nonce_arg="${1#--nonce=}"
        shift
        ;;
      -*)
        echo "unknown flag: $1" >&2
        exit 2
        ;;
      *)
        if [[ -n "$slot" ]]; then
          echo "usage: git-ops release <slot> [--nonce <value>]" >&2
          exit 2
        fi
        slot="$1"
        shift
        ;;
    esac
  done

  if [[ -z "$slot" ]]; then
    echo "usage: git-ops release <slot> [--nonce <value>]" >&2
    exit 2
  fi

  local slot_path="$WORKTREES_DIR/$slot"
  local lockfile="$slot_path/.lock"
  if [[ ! -d "$slot_path" ]]; then
    die "slot $slot does not exist at $slot_path"
  fi
  if [[ ! -f "$lockfile" ]]; then
    die "no lockfile at $lockfile — nothing to release"
  fi

  load_lockfile "$lockfile" || die "failed to read lockfile $lockfile"

  # Ownership check: --nonce match OR current-process PID match.
  local caller_pid=$$
  local own_by_nonce=0
  local own_by_pid=0
  if [[ -n "$nonce_arg" && "$nonce_arg" == "${LOCK_NONCE:-}" ]]; then
    own_by_nonce=1
  fi
  if [[ "${LOCK_PID:-}" == "$caller_pid" ]]; then
    own_by_pid=1
  fi
  if [[ "$own_by_nonce" -ne 1 && "$own_by_pid" -ne 1 ]]; then
    {
      echo "git-ops: refusing to release $slot — ownership check failed"
      echo "  lock PID  : ${LOCK_PID:-?}  (caller pid: $caller_pid)"
      # NEVER print LOCK_NONCE here — it is the credential this branch is refusing
      # for. Disclosing it in the denial makes the gate decorative (reproduced by
      # adversarial review: harvest from the refusal, replay, succeed).
      if [[ -n "$nonce_arg" ]]; then
        echo "  given nonce: $nonce_arg  (no match)"
      else
        echo "  no --nonce supplied"
      fi
      echo "Pass --nonce <value> matching the lockfile, or run from the same PID that claimed it."
    } >&2
    exit 1
  fi

  rm -f "$lockfile"
  echo "git-ops: released $slot (lockfile removed, worktree/branch preserved)" >&2
}

# ----------------------------------------------------------------------------
# Subcommand: heartbeat (P1268)
# ----------------------------------------------------------------------------
#
# Refresh ONLY the HEARTBEAT of a slot's lock, in place. Cheap enough to call on
# every file edit, which is the point: `adopt` fires once at session start, so a
# session that outlives the TTL would go ORPHAN again while its owner is still
# typing — the original defect, moved from milliseconds to 12 hours rather than
# fixed. Found by adversarial review, not by the author.
#
# Deliberately activity-driven, never a timer. A daemon stamping on a schedule
# outlives the session it represents and manufactures false LIVE, which is worse
# than the false ORPHAN this whole spec exists to remove. A refresh triggered by
# the session doing something cannot outlive the session doing things.
#
# Silent and non-zero-exit-free by design: callers are hooks on the hot path.
# It refuses to CREATE a lock — no lock means nothing is claimed, and inventing
# one here would forge a claim nobody made.
cmd_heartbeat() {
  local slot="${1:-}"
  [[ -n "$slot" ]] || { echo "usage: git-ops heartbeat <slot>" >&2; exit 2; }
  [[ "$slot" =~ ^w[0-9]+$ ]] || exit 0
  local lockfile="$WORKTREES_DIR/$slot/.lock"
  [[ -f "$lockfile" ]] || exit 0

  load_lockfile "$lockfile" || exit 0

  # Containment FIRST. cmd_heartbeat originally had none at all, so a caller
  # anywhere on the filesystem could keep any slot alive forever by reading
  # SESSION_ID out of the very lockfile it wanted to hold open and echoing it back
  # in CP_SESSION_ID. Reproduced by adversarial review. CP_SESSION_ID is an ordinary
  # environment variable and therefore NOT a credential — it is a same-session hint,
  # and it is only meaningful behind this check.
  local hb_caller_root hb_resolved_caller hb_resolved_slot
  hb_caller_root="$(git rev-parse --path-format=absolute --show-toplevel 2>/dev/null || true)"
  [[ -n "$hb_caller_root" ]] || exit 0
  hb_resolved_slot="$(cd "$WORKTREES_DIR/$slot" 2>/dev/null && pwd -P || echo "")"
  hb_resolved_caller="$(cd "$hb_caller_root" 2>/dev/null && pwd -P || echo "")"
  [[ -n "$hb_resolved_slot" && "$hb_resolved_caller" == "$hb_resolved_slot" ]] || exit 0

  # Only the session that OWNS the lock may keep it alive.
  local caller_pid=$$
  if [[ "${LOCK_PID:-}" != "$caller_pid" ]]; then
    # The claiming PID is a dead short-lived process by design, so PID equality
    # almost never holds. Fall back to session identity, which `adopt` stamps.
    if [[ -z "${CP_SESSION_ID:-}" || "${CP_SESSION_ID}" != "${LOCK_SESSION_ID:-}" ]]; then
      exit 0
    fi
  fi

  local now tmp
  now="$(iso_now)"
  tmp="$(mktemp "$WORKTREES_DIR/$slot/.lock.XXXXXX")" || exit 0
  # Rewrite every field verbatim except HEARTBEAT — never regenerate identity here.
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      HEARTBEAT=*) echo "HEARTBEAT=$now" ;;
      *)           echo "$line" ;;
    esac
  done < "$lockfile" > "$tmp"
  mv -f "$tmp" "$lockfile"
}

# ----------------------------------------------------------------------------
# Subcommand: adopt (P1268)
# ----------------------------------------------------------------------------
#
# Re-own an EXISTING lock: refresh the liveness fields, preserve the identity
# fields. `claim` creates a claim; `adopt` says "the same claim, me now".
#
# Preserved: SLOT, BRANCH, P_NUMBER, CLAIMED_AT, NONCE.
# Refreshed: PID, PID_START_TIME, SESSION_ID, HEARTBEAT.
#
# NONCE is deliberately preserved, not regenerated: a nonce captured by an
# earlier `claim` (CP_LOCK_NONCE_wN, and every skill that stores it) must keep
# working across an adopt, or adopting a slot silently breaks the `release` and
# `abandon` its own owner is holding a nonce for.
#
# Containment — adoption is only ever INTO the slot you are working in:
#   1. slot dir and lockfile must exist
#   2. caller's git toplevel must BE the slot path, unless --nonce matches
#      (a matching nonce proves prior ownership and is accepted from anywhere)
#   3. the worktree's checked-out branch must equal the lock's BRANCH
#   4. a LIVE lock held by a DIFFERENT living PID is refused without a nonce
cmd_adopt() {
  local slot=""
  local nonce_arg=""
  local session_arg=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --nonce)   [[ $# -lt 2 ]] && { echo "--nonce requires a value" >&2; exit 2; }; nonce_arg="$2"; shift 2 ;;
      --nonce=*) nonce_arg="${1#--nonce=}"; shift ;;
      --session) [[ $# -lt 2 ]] && { echo "--session requires a value" >&2; exit 2; }; session_arg="$2"; shift 2 ;;
      --session=*) session_arg="${1#--session=}"; shift ;;
      -*)        echo "unknown flag: $1" >&2; exit 2 ;;
      *)
        if [[ -n "$slot" ]]; then
          echo "usage: git-ops adopt <slot> [--nonce <value>] [--session <id>]" >&2
          exit 2
        fi
        slot="$1"; shift ;;
    esac
  done

  if [[ -z "$slot" ]]; then
    echo "usage: git-ops adopt <slot> [--nonce <value>] [--session <id>]" >&2
    exit 2
  fi

  # `claim` validates its arguments; `adopt` validated nothing, so a slot name
  # could be any path fragment. Constrain it to the wN convention.
  [[ "$slot" =~ ^w[0-9]+$ ]] || die "adopt: invalid slot '$slot' (expected wN)"

  local slot_path="$WORKTREES_DIR/$slot"
  local lockfile="$slot_path/.lock"
  [[ -d "$slot_path" ]] || die "slot $slot does not exist at $slot_path"
  [[ -f "$lockfile" ]] || die "no lockfile at $lockfile — nothing to adopt (use 'claim' to create one)"

  # Serialize the read-modify-write below. `mv` alone makes the WRITE atomic but
  # does nothing about two adopters both reading the same dead claim, both passing
  # every check, and both writing — last one wins silently, and the loser keeps
  # working under a lock that now names someone else. `mkdir` is atomic on POSIX
  # and needs no extra tooling (`flock` is not on stock macOS).
  # Found by adversarial review.
  local mutex="$slot_path/.lock.mutex"
  local mutex_waited=0
  until mkdir "$mutex" 2>/dev/null; do
    mutex_waited=$(( mutex_waited + 1 ))
    if [[ "$mutex_waited" -gt 50 ]]; then
      {
        echo "git-ops: refusing to adopt $slot — another adopt holds its mutex ($mutex)"
        echo "adopt is a sub-second operation, so a mutex held for 5s means a previous"
        echo "run was killed mid-flight. Inspect, then remove it by hand:  rmdir '$mutex'"
      } >&2
      exit 1
    fi
    sleep 0.1
  done
  # NO automatic staleness break, deliberately. The previous version broke any mutex
  # whose mtime read older than 30s, and adversarial review reproduced two failures
  # that together destroy mutual exclusion outright:
  #   (a) the breaker walks into a critical section a slow holder still occupies; and
  #   (b) far worse, the original holder's path-based `rmdir` then deletes the
  #       BREAKER's mutex on exit, so every later holder can be unlocked by the
  #       previous one — an unbounded cascade, not a one-shot race.
  # It also read mtime via `stat -f %m`, which is BSD-only; GNU `stat -f` rejects
  # `%m`, and the `|| echo 0` fallback made age ~1.7e9, so on Linux EVERY mutex read
  # as stale and was broken instantly. A portability slip whose failure mode was
  # silently permissive.
  # A wedged slot needing one human `rmdir` is strictly better than a lock that does
  # not lock. Failing closed is the whole point of a mutex.
  # shellcheck disable=SC2064
  trap "rmdir '$mutex' 2>/dev/null || true" EXIT

  load_lockfile "$lockfile" || die "failed to read lockfile $lockfile"

  local own_by_nonce=0
  if [[ -n "$nonce_arg" && "$nonce_arg" == "${LOCK_NONCE:-}" ]]; then
    own_by_nonce=1
  fi

  # (2) Containment: must be standing in the slot, unless the nonce proves ownership.
  if [[ "$own_by_nonce" -ne 1 ]]; then
    local caller_root
    caller_root="$(git rev-parse --path-format=absolute --show-toplevel 2>/dev/null || true)"
    # Resolve both sides through the same realpath treatment so a symlinked
    # /tmp or /private/tmp prefix does not read as a different directory.
    local resolved_slot resolved_caller
    resolved_slot="$(cd "$slot_path" 2>/dev/null && pwd -P || echo "$slot_path")"
    resolved_caller="$(cd "$caller_root" 2>/dev/null && pwd -P || echo "$caller_root")"
    if [[ -z "$caller_root" || "$resolved_caller" != "$resolved_slot" ]]; then
      {
        echo "git-ops: refusing to adopt $slot — caller is not inside that slot"
        echo "  slot   : $resolved_slot"
        echo "  caller : ${resolved_caller:-<not in a git repo>}"
        echo "Adopting a slot you are not working in is a seizure, not a hand-off."
        echo "Run from inside the worktree, or pass --nonce <value> to prove prior ownership."
      } >&2
      exit 1
    fi
  fi

  # (2b) THE ownership gate. Presence in a directory is not evidence of ownership —
  # every session in the repo can cd anywhere. Classify, and refuse a LIVE lock
  # without the nonce, exactly as cmd_abandon already does.
  #
  # An earlier cut only WARNED here, reasoning that refusing might break a session
  # resuming into its own slot if Claude issues a new session_id on --resume. That
  # was a false dilemma, and an adversarial review reproduced the cost: any session
  # that cd'd into an occupied slot seized it silently, exit 0, and the SessionStart
  # hook made it automatic. Refusing LIVE does NOT break resume — a resumed session's
  # slot is by definition NOT heartbeat-fresh, because its owner was away and nothing
  # was beating it. A fresh heartbeat means someone is actively there right now.
  # That is the whole point of having a heartbeat: it distinguishes the two cases
  # that PID identity could not.
  if [[ "$own_by_nonce" -ne 1 ]]; then
    local cur_state
    cur_state="$(classify_lock_state)"
    if [[ "$cur_state" == "LIVE" ]]; then
      {
        echo "git-ops: refusing to adopt $slot — the lock is LIVE"
        echo "  held by  : ${LOCK_SESSION_ID:-?}"
        echo "  last beat: ${LOCK_HEARTBEAT:-?}"
        echo "A fresh heartbeat means a session is actively working in this slot."
        echo "If this claim is yours, pass --nonce <value>. If that session is gone,"
        echo "its heartbeat expires after ${LOCK_TTL_SECONDS}s and adopt will succeed."
      } >&2
      exit 1
    fi
  fi

  # (3) Branch identity: the worktree must still hold the branch the lock names.
  local wt_branch
  wt_branch="$(git -C "$slot_path" symbolic-ref --short HEAD 2>/dev/null || true)"
  if [[ -n "${LOCK_BRANCH:-}" && -n "$wt_branch" && "$wt_branch" != "$LOCK_BRANCH" ]]; then
    {
      echo "git-ops: refusing to adopt $slot — branch mismatch"
      echo "  lock BRANCH   : $LOCK_BRANCH"
      echo "  worktree HEAD : $wt_branch"
      echo "The one-worktree-one-branch invariant is broken here; resolve that before adopting."
    } >&2
    exit 1
  fi

  # (4) Never take a lock out from under a genuinely live, different process.
  local caller_pid=$$
  if [[ "$own_by_nonce" -ne 1 && -n "${LOCK_PID:-}" && "${LOCK_PID}" != "$caller_pid" ]]; then
    if pid_alive "$LOCK_PID"; then
      local now_start
      now_start="$(pid_start_time "$LOCK_PID")"
      if [[ -n "$now_start" && "$now_start" == "${LOCK_PID_START_TIME:-}" ]]; then
        {
          echo "git-ops: refusing to adopt $slot — lock is LIVE under a different process"
          echo "  lock PID: $LOCK_PID (alive, start time matches)"
          echo "Pass --nonce <value> if this claim is yours."
        } >&2
        exit 1
      fi
    fi
  fi

  # Re-check the slot survived the reads above before writing into it.
  [[ -d "$slot_path" && -e "$slot_path/.git" ]] \
    || die "slot $slot disappeared or is no longer a worktree — refusing to write a lock into it"

  local pid=$$
  local pst
  pst="$(pid_start_time "$pid")"
  [[ -n "$pst" ]] || die "could not read PID_START_TIME via 'ps -o lstart=' for pid $pid"
  local session_id="${session_arg:-$(hostname -s)-${pid}-$(date +%s)}"
  local now
  now="$(iso_now)"

  # Rotate the nonce. Preserving it was wrong: --nonce bypasses containment from
  # anywhere, so one disclosure granted permanent seizure power over the slot across
  # every later hand-off, and only `claim` ever rotated it. The adopting session
  # receives the new value on stdout via the same eval contract `claim` uses, so a
  # hand-off keeps working while prior holders lose the capability.
  local new_nonce
  new_nonce="$(gen_nonce)"

  local prev_hb="${LOCK_HEARTBEAT:-<none>}"
  local tmp
  tmp="$(mktemp "$slot_path/.lock.XXXXXX")" || die "mktemp failed in $slot_path"
  {
    echo "PID=$pid"
    echo "PID_START_TIME=$pst"
    echo "NONCE=$new_nonce"
    echo "SESSION_ID=$session_id"
    echo "SLOT=${LOCK_SLOT:-$slot}"
    echo "BRANCH=${LOCK_BRANCH:-$wt_branch}"
    echo "P_NUMBER=${LOCK_P_NUMBER:-}"
    echo "CLAIMED_AT=${LOCK_CLAIMED_AT:-$now}"
    echo "HEARTBEAT=$now"
  } > "$tmp"
  # Atomic swap so a concurrent reader never sees a half-written lock.
  mv -f "$tmp" "$lockfile"
  rmdir "$mutex" 2>/dev/null || true
  trap - EXIT

  {
    echo "git-ops: adopted $slot"
    echo "  branch   : ${LOCK_BRANCH:-$wt_branch}"
    echo "  heartbeat: $prev_hb -> $now"
    echo "  session  : $session_id"
  } >&2

  # Same eval-safe contract as `claim` (P783) — callers may capture the nonce.
  echo "#CP_CLAIM_BEGIN"
  echo "export CP_LOCK_NONCE_${slot}=${new_nonce}"
  echo "#CP_CLAIM_END"
}

# ============================================================================
# P787 extensions — gc, abandon, reconcile, commit-to-main, switch-safe, sync
# ============================================================================

# ----------------------------------------------------------------------------
# Helpers for P787 subcommands
# ----------------------------------------------------------------------------

# Print set of branches held by any lockfile under worktrees/ — by lockfile
# PRESENCE, not by state. (The comment previously said "live"; it never consulted
# classify_lock_state. The direction is conservative — it over-excludes, never
# over-deletes — so P1268's LIVE widening changes nothing here. Verified by review.)
# One branch name per line, sorted, no duplicates.
branches_held_by_slots() {
  if [[ ! -d "$WORKTREES_DIR" ]]; then
    return 0
  fi
  local slot_path lockfile
  for slot_path in "$WORKTREES_DIR"/w*; do
    [[ -d "$slot_path" ]] || continue
    lockfile="$slot_path/.lock"
    if load_lockfile "$lockfile" 2>/dev/null; then
      if [[ -n "${LOCK_BRANCH:-}" ]]; then
        echo "$LOCK_BRANCH"
      fi
    fi
  done | sort -u
}

# Print set of branches currently checked out in `git worktree list`, one per line.
# Uses porcelain --porcelain format so branch names with spaces can't trick the parser.
branches_in_worktree_list() {
  ( cd "$REPO_ROOT" && git worktree list --porcelain 2>/dev/null ) | \
    awk '/^branch refs\/heads\// { sub(/^branch refs\/heads\//, ""); print }' | sort -u
}

# Require that the caller is running from the main repo's toplevel (not a worktree).
# Used by commit-to-main per spec T04.
require_main_repo() {
  local toplevel
  toplevel="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -z "$toplevel" || "$toplevel" != "$REPO_ROOT" ]]; then
    die "must be called from the main repo root (got toplevel: ${toplevel:-'(not in repo)'}, expected: $REPO_ROOT)"
  fi
}

# Emit a redirect-safe summary of the lock holder (for contention messages).
# No `>`, `<`, or `|` tokens in output. Colon-separated per P783 shell-safety.
main_lock_holder_summary() {
  local lockfile="$1"
  if ! load_lockfile "$lockfile" 2>/dev/null; then
    echo "  (main.lock file not readable)"
    return 0
  fi
  local state
  state="$(classify_lock_state)"
  echo "  session : ${LOCK_SESSION_ID:-?}"
  echo "  pid     : ${LOCK_PID:-?} (state: $state)"
  echo "  started : ${LOCK_CLAIMED_AT:-?}"
  # The holder's nonce is deliberately NOT printed. This summary is shown to the
  # party being REFUSED, and the nonce is exactly what `--nonce` accepts as proof
  # of ownership — it bypasses both the containment check and the LIVE refusal.
  # Handing it to the contending session turns a refusal into instructions.
}

# Atomic main.lock acquisition via hard link. Writes the lock contents to a
# temp file, then `ln tmp target` — which is atomic on POSIX. If another
# process holds the lock, ln fails. Retries every 1s up to $timeout seconds,
# then reports holder info on stderr and returns 1.
#
# Sets MAIN_LOCK_ACQUIRED=1 when we hold the lock (for release path).
acquire_main_lock() {
  local timeout="$1"
  local target="$WORKTREES_DIR/main.lock"
  mkdir -p "$WORKTREES_DIR"
  local pid=$$
  local pst
  pst="$(pid_start_time "$pid")"
  [[ -n "$pst" ]] || die "could not read PID_START_TIME for pid $pid"
  local nonce
  nonce="$(gen_nonce)"
  local session_id
  session_id="$(hostname -s)-${pid}-$(date +%s)"
  local now
  now="$(iso_now)"

  local tmp
  tmp="$(mktemp "$WORKTREES_DIR/.main.lock.XXXXXX")" || die "mktemp failed"
  # Use CLAIMED_AT (not STARTED_AT) so existing load_lockfile parser picks it up
  # into LOCK_CLAIMED_AT — otherwise contention diagnostics print `started : ?`.
  {
    echo "PID=$pid"
    echo "PID_START_TIME=$pst"
    echo "NONCE=$nonce"
    echo "SESSION_ID=$session_id"
    echo "CLAIMED_AT=$now"
  } > "$tmp"

  local waited=0
  while (( waited < timeout )); do
    if ln "$tmp" "$target" 2>/dev/null; then
      rm -f "$tmp"
      MAIN_LOCK_NONCE="$nonce"
      MAIN_LOCK_ACQUIRED=1
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  # Timeout: report holder. Never force-release (spec).
  rm -f "$tmp"
  {
    echo "git-ops: main.lock held by another session after ${timeout}s timeout."
    main_lock_holder_summary "$target"
    echo ""
    echo "Options: wait longer (increase GIT_OPS_MAIN_LOCK_TIMEOUT), or run 'git-ops reconcile'"
    echo "to check whether the holder is orphaned. Never force-release main.lock without"
    echo "verifying the holder PID is dead (spec P787)."
  } >&2
  return 1
}

# Release main.lock. Ownership check: the nonce we stored must match the
# nonce in the lockfile. Safeguard against releasing someone else's lock.
release_main_lock() {
  local target="$WORKTREES_DIR/main.lock"
  if [[ ! -f "$target" ]]; then
    return 0
  fi
  if [[ "${MAIN_LOCK_ACQUIRED:-0}" != "1" ]]; then
    return 0
  fi
  if ! load_lockfile "$target"; then
    return 0
  fi
  if [[ "${LOCK_NONCE:-}" == "${MAIN_LOCK_NONCE:-}" ]]; then
    rm -f "$target"
    MAIN_LOCK_ACQUIRED=0
  fi
}

# commit_staged_exact <message> <path> [path...] — plain `git commit`, not a
# pathspec commit. `git commit -- <paths>` re-reads those paths from the
# WORKING TREE before committing (git-commit(1) -o/--only, the default
# whenever any path is given) rather than the index — found 2026-08-20 when
# this exact shape silently swept a co-tenant's uncommitted docs/decisions.md
# WIP into a commit. A plain commit uses the index as-is instead, which is
# safe ONLY under acquire_main_lock — every caller of this function must
# already hold it — because the lock is what makes the staging+commit
# sequence atomic against every other commit-to-main-shaped caller; a bare
# `git commit` was already unsafe on this checkout WITHOUT that atomicity in
# two earlier incidents (docs/decisions.md 2026-08-17 P1057, 2026-06-06).
# Refuses (does not commit) if the index holds anything other than exactly
# the given paths, rather than trusting that no stray content is staged.
commit_staged_exact() {
  local message="$1"; shift
  local -a paths=("$@")
  local staged expected
  # --no-renames: without it, git's default rename detection collapses a
  # staged `git mv` (delete-old + add-new) into ONE line (the destination),
  # so a two-path expected list (old, new) never matches — found running
  # this fix's own test suite against a real spec-close rename.
  staged=$(cd "$REPO_ROOT" && git diff --cached --name-only --no-renames | sort)
  expected=$(printf '%s\n' "${paths[@]}" | sort)
  if [[ "$staged" != "$expected" ]]; then
    echo "commit_staged_exact: staged set does not match the requested paths -- refusing to commit" >&2
    echo "  requested: ${paths[*]}" >&2
    echo "  staged:    $(printf '%s ' $staged)" >&2
    return 1
  fi
  ( cd "$REPO_ROOT" && git commit -q -m "$message" )
}

# ----------------------------------------------------------------------------
# Subcommand: gc  (rewritten by P1260)
#
# Enumerates every ref this pipeline can leave behind — LOCAL branches AND the refs
# actually on `origin` — and classifies each as MERGED or KEEP.
#
# What changed and why (the old version selected on age and worktree-exclusion alone):
#   * It looked at `git branch` only, so nothing on the remote was ever a candidate. The
#     three refs measured on origin on 2026-09-07 were invisible to it.
#   * Its candidate filter was `^(feature|fix)/p[0-9]+`, which matches none of the refs this
#     pipeline actually leaks — they are `staging/doc-*`, `staging/pN`, and ad-hoc names.
#     Replaced by an explicit EXCLUSION set, so a new ref shape is a candidate by default
#     rather than silently out of scope.
#   * It had NO merged-ness check of any kind. Age is not a merge.
#
# The merged-ness oracle, and why it is three signals rather than one. Both available oracles
# are individually wrong, measured on this repo:
#   * patch-id (`git cherry`) alone: says 3 commits unmatched on backup/p1165-orig-20260827.
#   * subject match alone: says 1. And `c431d2ec` subject-matches main's `eb56d6e3` while their
#     patches differ by 382 lines across 5 files — a subject match is not a content match.
#   * BOTH are defeated by reverted work. docs/decisions.md 2026-09-05 [technical]: rebasing
#     work that was previously REVERTED silently drops commits, because the patch-id matches the
#     revert's history and every gate stays green. Live here: 95036cca3 was reverted 4 minutes
#     later by 37984ff00 and only re-landed on 2026-09-05. For those two days both oracles would
#     have called the holding branch fully merged while main lacked the content.
#
# So a commit counts as absorbed only when ALL THREE agree: patch present, subject present, and
# no revert of it anywhere in the base's history. Any commit that fails any signal is reported
# by SHA and the branch is KEEP. This deliberately OVER-keeps — a branch whose commits were ever
# reverted stays KEEP even after the content re-lands. That is the fail-safe invariant: the cost
# of over-keeping is a line in a report, the cost of under-keeping is destroyed work.
#
# Report-only by default. Deletion still requires BOTH --yes AND --delete-branches (P781), only
# ever deletes LOCAL branches, and never deletes anything classified KEEP.
# ----------------------------------------------------------------------------

# NOTE — every `grep -q` here reads from a PROCESS SUBSTITUTION, never the right-hand side of a
# pipe. This file runs under `set -euo pipefail`, and `producer | grep -q x` returns 141 on a
# SUCCESSFUL match: grep exits the moment it matches, the producer dies of SIGPIPE, and pipefail
# surfaces that as the pipeline's status. The condition then reads as "not found" on exactly the
# inputs it was supposed to find. This silently broke the re-land check below — the oracle called
# a re-landed commit still-reverted, and only a fixture with a known answer caught it.
# ── The revert index ─────────────────────────────────────────────────────────
#
# Why this is file-overlap and not message parsing. The governing case
# (docs/decisions.md 2026-09-05 [technical]) is live in this repo: 95036cca3 was reverted by
# 37984ff00 four minutes later and re-landed as 06dad4d3e two days on. That revert commit has
# NEITHER of the two machine-readable forms — its subject is `revert(p1220): back out the
# design-consistency commits…` (conventional-commit style, no quoted original subject) and its
# body is free prose with no `This reverts commit <sha>` trailer. Measured on main: 4 commits use
# git's `Revert "…"` form, 3 use the conventional form, and only 4 carry the body trailer. A
# parser keyed on either spelling therefore misses a third of this repo's reverts — including the
# exact one this oracle exists to catch. It reported MERGED on the fixture until this was fixed.
#
# Content-based detection (searching base for a commit whose patch is the inverse of C) would be
# message-independent, but costs a patch-id over every commit in the window. File overlap gets the
# same answer here at a fraction of that, and errs toward KEEP, which is the invariant.
#
# Writes "<sha>" lines to $REVERT_INDEX_SHAS and "<sha>\t<path>" to $REVERT_INDEX_FILES.
build_revert_index() {
  local base="$1"
  REVERT_INDEX_SHAS="$(mktemp)"; REVERT_INDEX_FILES="$(mktemp)"
  local r
  # Both spellings. Reverts are rare and recent; an unbounded scan buys nothing.
  # `|| true` throughout this function: `set -e` is on, and grep exits 1 when it simply finds
  # NOTHING. A repo with no reverts is the normal case, not an error — without the guard `gc`
  # aborted with no output at all in every scratch repo the canary builds.
  ( cd "$REPO_ROOT" && git log "$base" -n 4000 --format='%H %s' 2>/dev/null || true ) \
    | { grep -iE '^[0-9a-f]+ (revert[(:"]|revert )' || true; } | awk '{print $1}' > "$REVERT_INDEX_SHAS"
  while IFS= read -r r; do
    [[ -z "$r" ]] && continue
    ( cd "$REPO_ROOT" && git show --pretty=format: --name-only "$r" 2>/dev/null || true ) \
      | { grep -v '^$' || true; } | sed "s|^|$r\t|" >> "$REVERT_INDEX_FILES"
  done < "$REVERT_INDEX_SHAS"
}

cleanup_revert_index() { rm -f "$REVERT_INDEX_SHAS" "$REVERT_INDEX_FILES" 2>/dev/null; }

# Was commit $1's work reverted in base $2 and never re-landed? Echoes the revert sha, or "".
commit_reverted_unrelanded() {
  local sha="$1" base="$2" subj files r rfiles
  [[ -s "$REVERT_INDEX_SHAS" ]] || { echo ""; return; }

  files="$( cd "$REPO_ROOT" && git show --pretty=format: --name-only "$sha" 2>/dev/null | { grep -v '^$' || true; } )"
  [[ -z "$files" ]] && { echo ""; return; }
  subj="$( cd "$REPO_ROOT" && git log -1 --format=%s "$sha" 2>/dev/null )"
  # AUTHOR date, not committer date: a cherry-pick or rebase rewrites the committer date but
  # preserves the author date, and the whole point of this oracle is branches whose SHAs differ
  # from what landed on base.
  local sha_at
  sha_at="$( cd "$REPO_ROOT" && git log -1 --format=%at "$sha" 2>/dev/null )"
  [[ -z "$sha_at" ]] && { echo ""; return; }

  local r_at
  while IFS= read -r r; do
    [[ -z "$r" ]] && continue
    # Only a revert that came AFTER this work can have reverted it. Ancestry CANNOT be used for
    # this: a shipped branch is cherry-picked onto main, so the branch keeps its own SHAs and is
    # not an ancestor of the revert that backed the copy out. Testing ancestry here reported
    # MERGED on the fixture — the exact false negative this oracle exists to prevent.
    r_at="$( cd "$REPO_ROOT" && git log -1 --format=%ct "$r" 2>/dev/null )"
    [[ -z "$r_at" || "$r_at" -lt "$sha_at" ]] && continue
    rfiles="$(awk -F'\t' -v s="$r" '$1==s {print $2}' "$REVERT_INDEX_FILES")"
    [[ -z "$rfiles" ]] && continue
    # Any file in common? Then this revert plausibly backed this commit out.
    if ! grep -Fxq -f <(printf '%s\n' "$rfiles") < <(printf '%s\n' "$files") 2>/dev/null; then
      continue
    fi
    # Re-landed after the revert? Same subject reappearing downstream is this repo's own
    # re-land signature (06dad4d3e carries 95036cca3's subject verbatim).
    if [[ -n "$subj" ]] && grep -Fxq "$subj" < <( cd "$REPO_ROOT" && git log "$r..$base" --format='%s' 2>/dev/null ); then
      continue
    fi
    echo "$r"; return
  done < "$REVERT_INDEX_SHAS"
  echo ""
}

# Is $1 (a commit) absorbed into $2 (a base ref)? Echoes "" if absorbed, else a reason.
# Fail-safe: any signal it cannot evaluate counts as NOT absorbed.
commit_absorbed_reason() {
  local sha="$1" base="$2" subj rev

  subj="$( cd "$REPO_ROOT" && git log -1 --format=%s "$sha" 2>/dev/null )"
  [[ -z "$subj" ]] && { echo "unreadable"; return; }

  # Signal 3 — disqualifying regardless of what the other two say.
  rev="$(commit_reverted_unrelanded "$sha" "$base")"
  [[ -n "$rev" ]] && { echo "reverted-by-${rev:0:9}"; return; }

  # Signal 1 — patch-id. `git cherry <base> <head> <limit>` prints "- <sha>" when the patch is
  # already in base, "+ <sha>" when it is not. Limiting to <sha>^..<sha> examines just this one.
  local cherry
  cherry="$( cd "$REPO_ROOT" && git cherry "$base" "$sha" "$sha^" 2>/dev/null | head -1 )"
  [[ "$cherry" != -* ]] && { echo "patch-absent"; return; }

  # Signal 2 — subject present in base.
  if ! grep -Fxq "$subj" < <( cd "$REPO_ROOT" && git log "$base" --format='%s' 2>/dev/null ); then
    echo "subject-absent"; return
  fi

  echo ""
}

# Classify a ref. Echoes "MERGED" or "KEEP — <reason>".
classify_ref() {
  local ref="$1" base="$2"

  local ahead
  ahead="$( cd "$REPO_ROOT" && git rev-list --count "$base..$ref" 2>/dev/null )"
  if [[ -z "$ahead" ]]; then
    echo "KEEP — cannot compare against $base (missing objects?)"
    return
  fi

  # An ancestor of base needs no oracle, and must NOT get one. Every commit is reachable from
  # base forever, so deleting the ref cannot lose work even if the content was later reverted —
  # the commits stay in base's history and `git log` still finds them. An earlier revision of
  # this function ran the revert scan over an ancestor's tip window anyway; because a `staging/*`
  # ref is literally a snapshot of main, that swept up unrelated reverted history and reported
  # KEEP on both staging refs, each measured to carry zero unique commits. The revert trap lives
  # in the NON-ancestor case below, where the branch holds its own SHAs and reachability proves
  # nothing.
  if [[ "$ahead" -eq 0 ]]; then
    echo "MERGED"
    return
  fi

  local unmatched="" c reason n=0
  while IFS= read -r c; do
    [[ -z "$c" ]] && continue
    reason="$(commit_absorbed_reason "$c" "$base")"
    if [[ -n "$reason" ]]; then
      unmatched+="${c:0:9}($reason) "
      n=$((n+1))
      (( n >= 8 )) && { unmatched+="… "; break; }
    fi
  done < <( cd "$REPO_ROOT" && git rev-list "$base..$ref" 2>/dev/null )

  if [[ -z "$unmatched" ]]; then
    echo "MERGED"
  else
    echo "KEEP — unmatched: ${unmatched% }"
  fi
}

cmd_gc() {
  local do_delete=0 got_yes=0 got_delete=0
  local stale_age_days=30
  local base_ref="main"
  local include_remote=1
  local arg
  while [[ $# -gt 0 ]]; do
    arg="$1"
    case "$arg" in
      --dry-run)          shift ;;
      --yes)              got_yes=1; shift ;;
      --delete-branches)  got_delete=1; shift ;;
      --no-remote)        include_remote=0; shift ;;
      --base)             base_ref="$2"; shift 2 ;;
      --stale-days)       stale_age_days="$2"; shift 2 ;;
      *) echo "git-ops gc: unknown flag '$arg'" >&2; exit 2 ;;
    esac
  done
  [[ $got_yes -eq 1 && $got_delete -eq 1 ]] && do_delete=1

  if ! ( cd "$REPO_ROOT" && git rev-parse --verify "$base_ref" >/dev/null 2>&1 ); then
    echo "git-ops gc: base ref '$base_ref' does not resolve" >&2
    exit 2
  fi

  # One pass over the base's history; consumed by classify_ref for every ref below.
  build_revert_index "$base_ref"
  trap cleanup_revert_index RETURN

  # Exclusion set: never a candidate, whatever its age or merge state.
  local held_by_slot held_in_worktree exclusion
  held_by_slot="$(branches_held_by_slots)"
  held_in_worktree="$(branches_in_worktree_list)"
  exclusion="$(printf '%s\n%s\nmain\nmaster\nHEAD\n' "$held_by_slot" "$held_in_worktree" | sort -u)"

  # ── Candidates: every local branch, plus every head on origin ──────────────
  local local_branches remote_branches
  # `|| true` on both: this file runs under `set -e`, and a failing command substitution aborts
  # the whole run at the ASSIGNMENT. Without it, `gc` died silently in any clone with no `origin`
  # — which is every scratch repo the canary builds, so the canary saw no output at all.
  local_branches="$( cd "$REPO_ROOT" && git branch --format='%(refname:short)' 2>/dev/null || true )"

  remote_branches=""
  local remote_ok=1
  if (( include_remote )); then
    if ! remote_branches="$(remote_heads)"; then
      remote_branches=""
      remote_ok=0
      echo "git-ops gc: WARNING — could not reach origin; remote refs NOT covered by this report." >&2
    fi
  fi

  local now_ts cutoff_ts
  now_ts="$(date +%s)"
  cutoff_ts=$((now_ts - stale_age_days * 86400))

  echo "git-ops gc: ref report (base: $base_ref, stale cutoff: ${stale_age_days}d)"
  echo ""
  printf '  %-8s %-46s %-9s %-6s %s\n' WHERE REF WORKTREE AGE VERDICT
  printf '  %-8s %-46s %-9s %-6s %s\n' "-----" "---" "--------" "---" "-------"

  local stale_list="" b where wt_flag age_days last_ts verdict resolved
  local seen_local
  while IFS=$'\t' read -r where b; do
    [[ -z "$b" ]] && continue

    if grep -Fxq "$b" < <(printf '%s\n' "$exclusion"); then
      continue
    fi

    if [[ "$where" == "local" ]]; then
      resolved="$b"
    else
      # Prefer the remote-tracking copy; fall back to the local name only if it is the same sha.
      if ( cd "$REPO_ROOT" && git rev-parse --verify "origin/$b" >/dev/null 2>&1 ); then
        resolved="origin/$b"
      else
        resolved=""
      fi
    fi

    if grep -Fxq "$b" < <(printf '%s\n' "$held_in_worktree"); then wt_flag="yes"; else wt_flag="no"; fi

    if [[ -n "$resolved" ]]; then
      last_ts="$( cd "$REPO_ROOT" && git log -1 --format=%ct "$resolved" 2>/dev/null || echo 0 )"
    else
      last_ts=0
    fi

    if [[ -z "$last_ts" || "$last_ts" -eq 0 ]]; then
      age_days="?"
      verdict="KEEP — not fetched locally; run: git fetch origin"
    else
      age_days="$(( (now_ts - last_ts) / 86400 ))d"
      verdict="$(classify_ref "$resolved" "$base_ref")"
    fi

    printf '  %-8s %-46s %-9s %-6s %s\n' "$where" "$b" "$wt_flag" "$age_days" "$verdict"

    # Deletion candidates: LOCAL only, MERGED only, no worktree, older than the cutoff.
    if [[ "$where" == "local" && "$verdict" == "MERGED" && "$wt_flag" == "no" \
          && "$last_ts" -ne 0 && "$last_ts" -lt "$cutoff_ts" ]]; then
      stale_list+="$b"$'\n'
    fi
  done < <(
    printf '%s\n' "$local_branches"  | sed 's/^/local\t/'
    printf '%s\n' "$remote_branches" | sed 's/^/origin\t/'
  )

  stale_list="$(printf '%s' "$stale_list" | { grep -v '^$' || true; } | sort -u)"

  echo ""
  if [[ -z "$stale_list" ]]; then
    echo "git-ops gc: no LOCAL branch is both MERGED and older than ${stale_age_days}d — nothing to delete." >&2
  else
    echo "Deletable (local, MERGED, no worktree, older than ${stale_age_days}d):" >&2
    printf '%s\n' "$stale_list" | sed 's/^/  /' >&2
    if (( do_delete )); then
      local d
      while IFS= read -r d; do
        [[ -z "$d" ]] && continue
        ( cd "$REPO_ROOT" && git branch -D "$d" >&2 )
      done <<< "$stale_list"
      echo "git-ops gc: deleted $(printf '%s\n' "$stale_list" | grep -c .) local branches." >&2
    else
      {
        echo ""
        echo "This was a dry-run. To delete the LOCAL branches listed above:"
        echo "  git-ops gc --yes --delete-branches"
      } >&2
    fi
  fi

  # Remote refs are never auto-deleted. Deleting a public ref does not un-publish it
  # (P1260 Invariants), so there is no safety reason to rush it and a real reason not to
  # automate it: the ref may be someone's in-flight recovery handle.
  if (( include_remote )) && (( remote_ok )) && [[ -n "$remote_branches" ]]; then
    echo "" >&2
    echo "Remote refs are reported only, never auto-deleted. Remove one by hand when its" >&2
    echo "verdict is MERGED and you are sure nobody is mid-recovery on it." >&2
  fi
}

# ----------------------------------------------------------------------------
# Subcommand: abandon
# Removes slot's lockfile AND worktree; does NOT delete the branch.
# Ownership check for LIVE locks; STALE/ORPHAN/NO_LOCK slots can be abandoned freely.
# ----------------------------------------------------------------------------

cmd_abandon() {
  local slot=""
  local nonce_arg=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --nonce)
        [[ $# -lt 2 ]] && { echo "--nonce requires a value" >&2; exit 2; }
        nonce_arg="$2"; shift 2 ;;
      --nonce=*)
        nonce_arg="${1#--nonce=}"; shift ;;
      -*)
        echo "git-ops abandon: unknown flag '$1'" >&2; exit 2 ;;
      *)
        if [[ -n "$slot" ]]; then
          echo "usage: git-ops abandon <slot> [--nonce <value>]" >&2; exit 2
        fi
        slot="$1"; shift ;;
    esac
  done
  if [[ -z "$slot" ]]; then
    echo "usage: git-ops abandon <slot> [--nonce <value>]" >&2; exit 2
  fi

  local slot_path="$WORKTREES_DIR/$slot"
  if [[ ! -d "$slot_path" ]]; then
    die "slot $slot does not exist at $slot_path"
  fi

  local lockfile="$slot_path/.lock"
  if [[ -f "$lockfile" ]]; then
    load_lockfile "$lockfile" || die "failed to read lockfile $lockfile"
    local state
    state="$(classify_lock_state)"
    if [[ "$state" == "LIVE" ]]; then
      local caller_pid=$$
      local own_by_nonce=0
      local own_by_pid=0
      if [[ -n "$nonce_arg" && "$nonce_arg" == "${LOCK_NONCE:-}" ]]; then
        own_by_nonce=1
      fi
      if [[ "${LOCK_PID:-}" == "$caller_pid" ]]; then
        own_by_pid=1
      fi
      if [[ $own_by_nonce -ne 1 && $own_by_pid -ne 1 ]]; then
        {
          echo "git-ops abandon: refusing $slot — lock is LIVE and ownership check failed"
          echo "  lock pid   : ${LOCK_PID:-?} (caller pid: $caller_pid)"
          # NEVER print LOCK_NONCE in a refusal — see cmd_release.
          if [[ -n "$nonce_arg" ]]; then
            echo "  given nonce: $nonce_arg (no match)"
          else
            echo "  no --nonce supplied"
          fi
          echo "Pass --nonce matching the lockfile, or run from the claiming PID."
          # P1268 widened LIVE to include a fresh HEARTBEAT, so this refusal can now
          # fire where it previously could not: before, every agent-claimed lock was
          # ORPHAN within milliseconds and abandon never asked for ownership at all.
          # Name the way out, or a caller who has lost their nonce is simply stuck.
          if [[ -n "${LOCK_HEARTBEAT:-}" ]] && heartbeat_fresh "${LOCK_HEARTBEAT}"; then
            echo "  heartbeat  : ${LOCK_HEARTBEAT} (fresh — this slot reads LIVE on heartbeat, not PID)"
            echo "If that session is really gone, its heartbeat expires ${LOCK_TTL_SECONDS}s after"
            echo "the stamp above, after which 'abandon' needs no nonce."
          fi
        } >&2
        exit 1
      fi
    fi
    # STALE, ORPHAN: proceed (the claiming session is dead — spec-safe cleanup).
    rm -f "$lockfile"
  fi

  # Kill any dev server squatting inside the slot before we remove it (orphan-port guard).
  reap_worktree_servers "$slot_path"

  # Remove the worktree. --force skips the "uncommitted changes" refusal.
  # If git's removal fails (corrupted state, partial earlier teardown), do
  # NOT die — fall through to the unconditional post-cleanup so the slot
  # is always reusable after `abandon`.
  if ( cd "$REPO_ROOT" && git worktree list --porcelain 2>/dev/null | grep -Fq "worktree $slot_path" ); then
    ( cd "$REPO_ROOT" && git worktree remove --force "$slot_path" ) >&2 || \
      echo "git-ops abandon: 'git worktree remove' failed; falling back to rm -rf" >&2
  fi

  # Post-cleanup: always reach this. Closes partial-teardown gaps where the
  # admin dir or working dir survived `git worktree remove`.
  if [[ -e "$slot_path" ]]; then
    case "$WORKTREES_DIR" in
      ""|/|/.claude*|/private/*) die "refusing rm: WORKTREES_DIR=$WORKTREES_DIR" ;;
    esac
    case "$slot_path" in
      "$WORKTREES_DIR"/w[0-9]*) ;;
      *) die "refusing rm: $slot_path outside slot convention" ;;
    esac
    rm -rf -- "$slot_path"
  fi
  ( cd "$REPO_ROOT" && git worktree prune ) >/dev/null 2>&1 || true

  echo "git-ops abandon: removed lockfile and worktree for $slot (branch preserved)" >&2
}

# ----------------------------------------------------------------------------
# Subcommand: reconcile
# Cross-check slot directories against `git worktree list`.
# Reports orphan-lock (.lock without worktree entry) and orphan-worktree (worktree without .lock).
# Exit 0 if all OK, 2 if any orphans found.
# ----------------------------------------------------------------------------

cmd_reconcile() {
  local orphans_found=0
  local lines=""

  # All worktree paths registered by git, absolute, sorted for deterministic output.
  local wt_paths
  wt_paths="$( cd "$REPO_ROOT" && git worktree list --porcelain 2>/dev/null | \
               awk '/^worktree / { sub(/^worktree /, ""); print }' | sort -u )"

  # All slot directories under .claude/worktrees, sorted.
  local slot_dirs=""
  if [[ -d "$WORKTREES_DIR" ]]; then
    local entry
    for entry in "$WORKTREES_DIR"/w*; do
      [[ -d "$entry" ]] || continue
      slot_dirs+="$entry"$'\n'
    done
  fi
  slot_dirs="$( printf '%s' "$slot_dirs" | sort -u )"

  # Pass 1: for each slot dir, check if it has a lockfile and if git tracks it as a worktree.
  local slot_path slot has_lock in_wt
  while IFS= read -r slot_path; do
    [[ -z "$slot_path" ]] && continue
    slot="$(basename "$slot_path")"
    has_lock=0
    [[ -f "$slot_path/.lock" ]] && has_lock=1
    in_wt=0
    if printf '%s\n' "$wt_paths" | grep -Fxq "$slot_path"; then
      in_wt=1
    fi
    if [[ $has_lock -eq 1 && $in_wt -eq 0 ]]; then
      lines+="  orphan-lock      $slot (path: $slot_path)"$'\n'
      orphans_found=$((orphans_found + 1))
    elif [[ $has_lock -eq 0 && $in_wt -eq 1 ]]; then
      lines+="  orphan-worktree  $slot (path: $slot_path)"$'\n'
      orphans_found=$((orphans_found + 1))
    else
      lines+="  ok               $slot (path: $slot_path)"$'\n'
    fi
  done <<< "$slot_dirs"

  # Pass 2: worktrees registered by git but whose path is NOT under WORKTREES_DIR
  # (e.g., user manually created a worktree outside the slot convention).
  # These are noise for reconcile; we skip them.

  # Pass 3: ship journals. Passes 1-2 classify a slot by lock x worktree, so a
  # ship that landed commits on main and then aborted before Phase 3 — lock
  # present AND worktree present — falls through to the `ok` arm and is reported
  # as healthy. That is the p1057/w1 state, and reconcile called it fine.
  #
  # The journal is the durable record of that condition (`branch_deleted: false`
  # plus at least one `landed_sha`) and nothing consumed it. The abort-time
  # stderr from ship_on_abort is a one-shot message in a session that has just
  # errored; the 8 journals that accumulated here over ~88 days are the evidence
  # that the channel does not hold on its own. This pass is the durable half.
  #
  # A leftover journal is not inert residue either: with a journal present and
  # no --resume, every later `git-ops ship pN` hard-exits, which is what pushes
  # an operator to finish the ship by hand, which is what leaves the next
  # journal. Surfacing it breaks that loop.
  local journal_lines=""
  if [[ -d "$SHIP_JOURNAL_DIR" ]]; then
    local jf jpn jbranch jlanded jdeleted jinfo
    for jf in "$SHIP_JOURNAL_DIR"/*.json; do
      [[ -f "$jf" ]] || continue
      jinfo="$( python3 - "$jf" 2>/dev/null <<'PYJ'
import json, sys
d = json.load(open(sys.argv[1]))
print("%s	%s	%d	%s" % (
    d.get("p_number", ""),
    d.get("source_branch", ""),
    sum(1 for c in d.get("commits", []) if c.get("landed_sha")),
    "1" if d.get("branch_deleted") else "0",
))
PYJ
)" || jinfo=""
      if [[ -z "$jinfo" ]]; then
        journal_lines+="  unreadable-journal  $(basename "$jf")"$'\n'
        orphans_found=$((orphans_found + 1))
        continue
      fi
      jpn="$(  printf '%s' "$jinfo" | cut -f1 )"
      jbranch="$(printf '%s' "$jinfo" | cut -f2 )"
      jlanded="$( printf '%s' "$jinfo" | cut -f3 )"
      jdeleted="$(printf '%s' "$jinfo" | cut -f4 )"
      [[ -z "$jpn" ]] && jpn="$(basename "$jf" .json)"
      if [[ "$jdeleted" != "1" ]] && [[ -n "$jbranch" ]] && \
         ( cd "$REPO_ROOT" && git rev-parse --verify "$jbranch" >/dev/null 2>&1 ); then
        journal_lines+="  stranded-ship       $jpn (branch: $jbranch, ${jlanded} commit(s) on main; converge: git-ops ship $jpn --resume)"$'\n'
      else
        journal_lines+="  stale-journal       $jpn (${jlanded} commit(s) landed, branch gone; ship $jpn is blocked until this is removed: rm $jf)"$'\n'
      fi
      orphans_found=$((orphans_found + 1))
    done
  fi

  if [[ -n "$lines" ]]; then
    echo "git-ops reconcile: slot state"
    printf '%s' "$lines"
  else
    echo "git-ops reconcile: no slot directories under $WORKTREES_DIR"
  fi

  if [[ -n "$journal_lines" ]]; then
    echo "git-ops reconcile: ship journals"
    printf '%s' "$journal_lines"
  fi

  if [[ $orphans_found -gt 0 ]]; then
    echo "" >&2
    echo "git-ops reconcile: ${orphans_found} orphan(s) detected." >&2
    exit 2
  fi
}

# ----------------------------------------------------------------------------
# Subcommand: commit-to-main
# Serializes concurrent commits to main via .claude/worktrees/main.lock.
# Must be called from main repo root (not a worktree).
# ----------------------------------------------------------------------------

# ----------------------------------------------------------------------------
# P919 staging-branch hop. git-ops NEVER auto-pushes (see the cmd_ship header
# invariant) — this prints the commands the human runs. Once the P919 privacy-scan
# ruleset is active on main (Phase 2), a direct push of un-checked commits to main
# is rejected server-side (GH013); the hop runs CI on the commits via a staging
# branch FIRST so the required check is green on those exact SHAs when `git push
# origin <sha>:refs/heads/main` promotes them (SHA-portability — proven in P919
# Phase 0). The ruleset IS active (verified 2026-09-04: 'main-privacy-gate',
# enforcement active, empty bypass list) — an unpinned promote of a tip CI never
# scanned is refused server-side, so it costs a wasted run, not a leak.
# Override the branch prefix with STAGING_BRANCH_PREFIX (default "staging/").
# Output goes to stderr (human guidance); shell-safe (no >, <, | tokens — P783).
# Args: $1 = staging branch leaf (e.g. "p919" or "doc-<short-sha>").
#       $2 = the snapshot SHA to pin every printed command to (default: current HEAD).
#
# The printed commands MUST name an explicit SHA, never the bare branch `main`.
# A human or agent following this guidance runs it minutes after it is printed, on a
# shared checkout where the measured median gap between watched-path commits is ~16
# minutes — so `main` at step 3 is routinely not the SHA CI went green on at step 2.
# 2026-09-04: a session followed this text literally as "the documented manual-recovery
# step" and ran an unpinned, unlocked promote. See pp/docs/decisions.md 2026-08-28.
print_staging_hop() {
  local sb="${STAGING_BRANCH_PREFIX:-staging/}${1}"
  # $2 is REQUIRED — no `${2:-$(git rev-parse HEAD)}` default. A default silently
  # reintroduces exactly the defect this function was changed to remove: two of the
  # three callers sit immediately after release_main_lock, so the fallback would
  # resolve HEAD with no lock held and print a SHA that may already include co-tenant
  # commits the caller never verified. Failing loudly beats printing a wrong SHA that
  # a human will paste into a promote.
  # Loud, but NOT `die`. All three call sites run AFTER release_main_lock and
  # `trap - EXIT` — main has already moved and the ship/commit has fully landed. `die`
  # exits 1, which would turn a COMPLETED operation into a failure the caller may retry.
  # Loudness was the right instinct; the exit code was not.
  if [[ -z "${2:-}" ]]; then
    echo "  ❌ print_staging_hop: snapshot SHA (arg 2) is required — pass the SHA the caller" >&2
    echo "     verified, never a live HEAD read. The work above SUCCEEDED; only this" >&2
    echo "     guidance block is missing. Derive the hop by hand from the commit you just made." >&2
    return 1
  fi
  local snap="$2"
  cat >&2 <<EOF
Staging hop (P919) — main is gated by REQUIRED status checks (P1290: more than one;
list them with 'gh api repos/:owner/:repo/rules/branches/main').
Every command below pins the snapshot ${snap} on purpose; do not substitute 'main'.
  1. Run CI on these commits via a staging branch:
       git push origin ${snap}:refs/heads/${sb}
  2. Wait for EVERY required check to pass on those commits (Actions tab, or gh run
     watch). A check that has not appeared yet is not a pass — it is queued.
  3. Promote to main (the green check on that exact SHA satisfies the rule):
       git push origin ${snap}:refs/heads/main
  4. Delete the ephemeral staging branch:
       git push origin --delete ${sb}
  (The ruleset IS active on main — verified 2026-09-04: ruleset 'main-privacy-gate',
   enforcement active, empty bypass list. A promote of an unscanned tip is refused
   server-side, so an unpinned push does not silently leak — it wastes the run.)
EOF
}

cmd_commit_to_main() {
  local message=""
  local files=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --message)
        [[ $# -lt 2 ]] && { echo "--message requires a value" >&2; exit 2; }
        message="$2"; shift 2 ;;
      --message=*)
        message="${1#--message=}"; shift ;;
      --files)
        shift
        while [[ $# -gt 0 && "$1" != --* ]]; do
          files+=("$1"); shift
        done ;;
      *)
        echo "git-ops commit-to-main: unknown flag '$1'" >&2; exit 2 ;;
    esac
  done
  if [[ -z "$message" ]]; then
    echo "usage: git-ops commit-to-main --message <msg> --files <f1> [f2 ...]" >&2; exit 2
  fi
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "usage: git-ops commit-to-main --message <msg> --files <f1> [f2 ...]" >&2; exit 2
  fi

  # Advisory only — NEVER refuses, never rewrites the subject. It fires at the moment
  # the omission is made, rather than at ship time when the recovery means touching the
  # shared main checkout. Non-refusing is the point: a guard with no false-positive cost
  # cannot do to a legitimate workflow what a fail-closed check would (epistemic.md 7c).
  if [[ "$message" =~ [Pp][0-9]{3,4} ]] && [[ "$message" != *"ready for QA"* ]]; then
    local _pn_seen="${BASH_REMATCH[0]}"
    # Only speak up if NO stamp exists for this pN yet. Without this the note fires on
    # every routine spec-edit or docs commit that merely mentions a P-number — which is
    # most of them — and a note that is always on is a note nobody reads. Same grep the
    # ship gate itself uses, so the advisory and the refusal can never disagree.
    if ! ( cd "$REPO_ROOT" 2>/dev/null && git log main -i --grep="\\b${_pn_seen}\\b" --grep="ready for QA" --all-match --format='%H' 2>/dev/null | grep -q . ); then
      echo "note: subject carries ${_pn_seen} and no 'ready for QA' stamp commit exists for it yet — if ${_pn_seen} is a spec implemented inline on main, 'git-ops.sh ship ${_pn_seen}' will refuse to close it until one does." >&2
    fi
  fi

  require_main_repo

  # P787: refuse if HEAD is not main, or an operation is in progress. A co-tenant
  # session sharing this repo may have switched the branch or started a ship/cherry-pick;
  # committing then lands on the wrong branch or inside another session's operation.
  local _head _gitdir
  _head="$(cd "$REPO_ROOT" && git symbolic-ref --short -q HEAD)"
  [[ "$_head" == "main" ]] || die "commit-to-main: HEAD is not main (got $_head) - a co-tenant session may have switched the branch"
  _gitdir="$(cd "$REPO_ROOT" && git rev-parse --absolute-git-dir)"
  if [[ -e "$_gitdir/CHERRY_PICK_HEAD" || -e "$_gitdir/rebase-merge" || -e "$_gitdir/rebase-apply" || -e "$_gitdir/MERGE_HEAD" ]]; then
    die "commit-to-main: operation in progress - refusing to commit into a cherry-pick, rebase, or merge started by another session"
  fi

  local timeout="${GIT_OPS_MAIN_LOCK_TIMEOUT:-120}"

  # Acquire the lock. Releases on every exit path via trap.
  if ! acquire_main_lock "$timeout"; then
    exit 1
  fi
  trap 'release_main_lock' EXIT

  # Stage explicit files (never -A per .claude/rules/git.md).
  #
  # A rename (git mv) leaves the OLD path absent from both the worktree and the
  # index, so `git add -- <old>` can never match it and aborts the whole call.
  # `.claude/rules/git.md` nonetheless requires BOTH paths on the commit pathspec,
  # or the staged deletion is left behind invisibly. So: add paths that exist,
  # accept paths already staged as deletions, and reject anything else — a path
  # that is neither on disk nor staged-deleted is a typo, and silently skipping it
  # would turn a mistyped filename into a no-op commit.
  # VALIDATE EVERY PATH BEFORE STAGING ANY OF THEM. The previous single loop staged
  # as it went and aborted on the first bad path, leaving the paths it had already
  # added sitting in the shared index. The caller then fixes the one filename and
  # re-runs, and the set being committed is no longer the set they typed -- it is
  # theirs PLUS the leftovers. Reproduced 2026-09-01; a spec close hit it and the
  # retry produced a commit that recorded a spec's deletion and nothing else.
  # Cleaning up on the error path was the obvious alternative and is worse: it would
  # unstage paths the caller had deliberately staged before the call. Checking
  # everything before touching anything has no such edge.
  ( cd "$REPO_ROOT" && for f in "${files[@]}"; do
      if [[ -e "$f" ]]; then
        : # stageable below
      elif [[ -n "$(git diff --cached --name-only --diff-filter=D -- "$f")" ]]; then
        : # deleted half of a staged rename; already in the index
      else
        echo "commit-to-main: path not found and not staged as a deletion: $f" >&2
        echo "commit-to-main: nothing was staged -- the index is exactly as you left it" >&2
        exit 1
      fi
    done ) >&2 || exit 1

  # `|| exit 1` above is load-bearing: this subshell's status was previously ignored,
  # so a rejected path fell through to commit_staged_exact instead of stopping here.
  # `if`, not `[[ ... ]] && git add`: under `set -e` the && form makes the whole loop
  # body return 1 on the last already-staged-deletion path, so the subshell exits 1 and
  # the `|| exit 1` below aborts a commit whose paths the validation loop above had just
  # accepted. That made commit-to-main structurally unable to commit a pure deletion
  # (or the old half of a rename) — the exact case the validation loop was written for.
  # Found 2026-09-01 by P1217's first test-retirement batch; see decisions.md.
  ( cd "$REPO_ROOT" && for f in "${files[@]}"; do
      if [[ -e "$f" ]]; then git add -- "$f"; fi
    done ) >&2 || exit 1

  # commit_staged_exact: plain commit (not pathspec), guarded — see its own
  # comment for why that's safe here (acquire_main_lock, held above).
  commit_staged_exact "$message" "${files[@]}" >&2 || exit 1

  # Report what the commit ACTUALLY recorded, not how many paths were requested. The
  # 2026-09-01 incident printed a confident "committed 3 file(s)" over a commit holding
  # one deletion; main.lock serializes git-ops CALLERS only, so a co-tenant running raw
  # git on the shared checkout is not held off by it at all. Cause unresolved.
  #
  # THE WARNING BELOW CANNOT FIRE TODAY, and that is stated rather than left to look
  # like a live safety net: commit_staged_exact refuses unless the staged set equals the
  # requested paths exactly, so by the time control reaches here the counts always
  # agree. Verified by trying to make it fire three ways (partial co-tenant commit,
  # directory pathspec, rename) -- the exact-match guard rejected each first. It is a
  # TRIPWIRE for a future change that weakens that guard, not a detector for the
  # incident above. The unconditional line, by contrast, is plain fact and always runs.
  _landed="$( cd "$REPO_ROOT" && git show --stat --no-renames --format= HEAD | sed '$d' | wc -l | tr -d ' ' )"
  echo "git-ops commit-to-main: requested ${#files[@]} path(s); the commit records ${_landed} file(s)" >&2
  if [[ "$_landed" != "${#files[@]}" ]]; then
    echo "git-ops commit-to-main: WARNING -- requested and recorded counts differ. Inspect 'git show --stat --no-renames HEAD' before continuing; a concurrent session may have altered the shared index." >&2
  fi
  # P919 D4: this commit is main-bound and subject to the privacy-scan required check
  # once the ruleset is live — route it through a staging branch before main. Release
  # the lock FIRST (mirror cmd_ship) so the guidance prints lock-free; the rev-parse
  # subshell still resolves the new HEAD after release (commit is already on disk).
  release_main_lock
  trap - EXIT
  local _hop_snap
  _hop_snap="$( cd "$REPO_ROOT" && git rev-parse HEAD )"
  print_staging_hop "doc-$( cd "$REPO_ROOT" && git rev-parse --short "$_hop_snap" )" "$_hop_snap"
}

# ----------------------------------------------------------------------------
# Subcommand: switch-safe
# Refuses to switch branches when the main repo has uncommitted bystander
# changes not attributable to the caller's lock manifest.
# ----------------------------------------------------------------------------

cmd_switch_safe() {
  if [[ $# -ne 1 ]]; then
    echo "usage: git-ops switch-safe <branch>" >&2; exit 2
  fi
  local target_branch="$1"

  # Optional pre-flight.sh (P786). Not yet shipped — graceful degrade to inline check.
  if [[ -x "$REPO_ROOT/scripts/pre-flight.sh" ]]; then
    if ! "$REPO_ROOT/scripts/pre-flight.sh" switch --branch "$target_branch" >&2; then
      exit 1
    fi
  fi

  local toplevel
  toplevel="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -n "$toplevel" ]] || die "not inside a git repository"

  # Inline dirty-check: any staged or unstaged changes, ignoring untracked files.
  # `git diff-index --quiet HEAD --` exits 0 when the working tree + index match HEAD.
  local dirty_staged dirty_unstaged
  dirty_staged="$( cd "$toplevel" && git diff --cached --name-only )"
  dirty_unstaged="$( cd "$toplevel" && git diff --name-only )"

  if [[ -n "$dirty_staged" || -n "$dirty_unstaged" ]]; then
    {
      echo "git-ops switch-safe: refusing to switch — uncommitted bystander changes."
      if [[ -n "$dirty_staged" ]]; then
        echo "  staged:"
        echo "$dirty_staged" | sed 's/^/    /'
      fi
      if [[ -n "$dirty_unstaged" ]]; then
        echo "  unstaged:"
        echo "$dirty_unstaged" | sed 's/^/    /'
      fi
      echo ""
      echo "Commit or reset the changes, then retry."
    } >&2
    exit 1
  fi

  ( cd "$toplevel" && git checkout "$target_branch" ) >&2
}

# ----------------------------------------------------------------------------
# Subcommand: sync
# Fetches origin (read-only). Refuses to pull on branches with upstream
# tracking (spec: "push is human-gated"). Local-only branches get ff-only pull.
# ----------------------------------------------------------------------------

cmd_sync() {
  if [[ $# -gt 0 ]]; then
    echo "usage: git-ops sync" >&2; exit 2
  fi

  local toplevel
  toplevel="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -n "$toplevel" ]] || die "not inside a git repository"

  # Fetch is always safe. Skip if no origin remote.
  if ( cd "$toplevel" && git remote get-url origin >/dev/null 2>&1 ); then
    ( cd "$toplevel" && git fetch origin ) >&2 || true
  fi

  local current_branch
  current_branch="$( cd "$toplevel" && git rev-parse --abbrev-ref HEAD 2>/dev/null )"
  [[ -n "$current_branch" ]] || die "could not resolve current branch"

  # Upstream check: if the branch has an @{upstream}, it's tracked.
  if ( cd "$toplevel" && git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1 ); then
    {
      echo "git-ops sync: branch '$current_branch' is published (has upstream)."
      echo "  Push is human-gated. Never auto-push. This command refuses to advance"
      echo "  tracked branches; the human runs 'git push' after review."
    } >&2
    exit 3
  fi

  # Local-only branch: spec says "runs git pull --ff-only". Git's own hint
  # output on no-upstream contains `<remote>`/`<branch>` placeholder tokens
  # which violate P783 shell-safety for any caller that routes output through
  # eval. Suppress git's raw output but preserve its exit signal as a colon-safe
  # status line so real failures (diverged branch, network) aren't invisible.
  if ( cd "$toplevel" && git pull --ff-only >/dev/null 2>&1 ); then
    echo "git-ops sync: branch '$current_branch' pulled ff-only" >&2
  else
    # For a branch with no upstream the pull exits non-zero — that is the
    # expected case for local-only. Report the status clearly; don't exit 1
    # because local-only IS the contract for this code path.
    echo "git-ops sync: branch '$current_branch' is local-only (nothing to pull or no upstream configured)" >&2
  fi
}

# ============================================================================
# P788 extension — ship (T06)
# ============================================================================
#
# Journal-based idempotent cherry-pick of a feature/fix branch onto main.
# Integrates with P787's main.lock for serialization across sessions.
#
# Journal (one per P-number): .claude/worktrees/.ship-journal/pN.json
# Written atomically via temp-file + rename(2) so the on-disk state is always
# consistent after a crash. On --resume, every recorded landed_sha is verified
# to still exist on main via `git cat-file -e`; if any is missing, the run
# fails loudly rather than silently re-applying commits.
#
# Never auto-pushes. Ends with "Ready to push." The human runs `git push`.

SHIP_JOURNAL_DIR="$WORKTREES_DIR/.ship-journal"

# Locate the feature or fix branch for a P-number. Dies on zero matches or more
# than one match — silently shipping only the first branch when both exist would
# drop commits from the other branch.
# Resolve the single feature/fix branch for a P-number.
#   - Zero matches: echo "" and return 0. The caller decides — this may be a
#     direct-to-main spec with no branch (see cmd_ship's no-branch closure path,
#     P920). Previously this die'd; the empty-return contract lets cmd_ship
#     distinguish "no branch + spec on main" from "no branch + no spec".
#   - Exactly one match: echo it.
#   - More than one: die (ambiguous — operator must delete all but one).
resolve_ship_branch() {
  local pn="$1"
  local all
  all="$( cd "$REPO_ROOT" && git for-each-ref --format='%(refname:short)' \
          "refs/heads/feature/${pn}-*" "refs/heads/fix/${pn}-*" 2>/dev/null )"
  local count
  count="$(echo "$all" | grep -c . || true)"
  if [[ "$count" == "0" ]]; then
    echo ""
    return 0
  fi
  if [[ "$count" != "1" ]]; then
    die "ship: multiple branches match ${pn}: $(echo "$all" | tr '\n' ' ')— delete all but one before shipping"
  fi
  echo "$all"
}

# Locate the single spec file for a P-number anywhere under features/ except
# done/, archive/, uat/ (those are already-shipped / abandoned copies and must
# not be re-shipped). Die on zero or multiple matches.
resolve_ship_spec() {
  local pn="$1"
  local matches
  matches="$( cd "$REPO_ROOT" && find features -maxdepth 3 -type f -name "${pn}_*.md" \
              ! -path "features/done/*" ! -path "features/archive/*" \
              ! -path "features/uat/*" 2>/dev/null | sort )"
  local count
  count="$(echo "$matches" | grep -c . || true)"
  if [[ "$count" == "0" ]]; then
    # Diagnostic (recurs at P796/P866/P869): the usual cause of "no spec found" is a
    # spec authored only on the feature branch, never committed to main — so this
    # find on main's tree comes up empty. Detect that and show the recovery, instead
    # of a bare error. Message only — does NOT auto-cherry-pick (decisions.md:2204:
    # fail fast with a clear message; the agreed prevention is a /fix skill edit).
    local cand_branch branch_spec
    cand_branch="$( cd "$REPO_ROOT" && git for-each-ref --format='%(refname:short)' \
                    "refs/heads/feature/${pn}-*" "refs/heads/fix/${pn}-*" 2>/dev/null | head -1 )" || cand_branch=""
    branch_spec=""
    if [[ -n "$cand_branch" ]]; then
      branch_spec="$( cd "$REPO_ROOT" && git ls-tree -r --name-only "$cand_branch" -- features 2>/dev/null \
                      | grep -E "/${pn}_[^/]*\.md\$" | grep -vE '/(done|archive|uat)/' | head -1 )" || branch_spec=""
    fi
    if [[ -n "$branch_spec" ]]; then
      die "ship: spec ${branch_spec} exists on branch ${cand_branch} but was never committed to main — that is why it cannot be found.
  Recovery: seed the spec on main, then re-run ship:
    ./scripts/git-ops.sh commit-to-main --message 'seed ${pn} spec for ship' --files ${branch_spec}"
    fi
    die "ship: no spec found under features/ matching ${pn}_*.md (excluding done/archive/uat)"
  fi
  if [[ "$count" != "1" ]]; then
    die "ship: ambiguous spec — $count files match: $(echo "$matches" | tr '\n' ' ')"
  fi
  echo "$matches"
}

# Internal: does `git log main..branch` resolve at all? Both detect_cospecs
# and detect_filed_cospecs treat "no" as fail-closed (P1105) — an
# unresolvable range must never be silently read as "nothing touched/added",
# because that's exactly the shape of the bug being fixed.
_cospec_range_ok() {
  local branch="$1"
  ( cd "$REPO_ROOT" && git log --format= "main..${branch}" >/dev/null 2>&1 )
}

# Return other P-number spec paths DELIVERED by branch commits — specs that
# existed on main before the branch and were edited, which ship would orphan
# if closed only for the named pn. Used by the co-located spec guard and
# Phase 2b auto-close.
#
# A spec the branch only CREATED (never present on main) was filed, not
# delivered, and is excluded here (P1105) — being touched by the branch's
# commits is not evidence of delivery, only the add-set subtraction is. See
# detect_filed_cospecs for that excluded set (used for audit-trail
# messaging at the call site — kept as a separate function because a bash
# function invoked via command substitution runs in a subshell, so it
# cannot hand a second value back through a caller-named out-variable).
#
# Fail-closed: returns exit status 1 with empty output if the commit range
# cannot be resolved — callers must not fall through to treating that as
# "nothing to close".
detect_cospecs() {
  local pn="$1" branch="$2"
  _cospec_range_ok "$branch" || return 1
  local touched added
  touched="$( ( cd "$REPO_ROOT" && git log --format= --name-only "main..${branch}" 2>/dev/null ) \
    | grep -E '^features/p[0-9]+_.*\.md$' \
    | grep -vE '^features/(done|archive|uat)/' \
    | grep -oE 'p[0-9]+' \
    | sort -u || true )"
  added="$( ( cd "$REPO_ROOT" && git log --diff-filter=A --format= --name-only "main..${branch}" 2>/dev/null ) \
    | grep -E '^features/p[0-9]+_.*\.md$' \
    | grep -vE '^features/(done|archive|uat)/' \
    | grep -oE 'p[0-9]+' \
    | sort -u || true )"
  grep -vFxf <(printf '%s\n' "$added") <(printf '%s\n' "$touched") \
    | grep -v "^${pn}$" || true
}

# Companion to detect_cospecs: P-numbers of specs the branch CREATED (never
# existed on main) — filed, not delivered. Lets the ship message name what
# it is deliberately NOT auto-closing, so the decision is auditable from the
# log alone (P1105 AC). Fail-closed the same way as detect_cospecs.
detect_filed_cospecs() {
  local pn="$1" branch="$2"
  _cospec_range_ok "$branch" || return 1
  ( cd "$REPO_ROOT" && git log --diff-filter=A --format= --name-only "main..${branch}" 2>/dev/null ) \
    | grep -E '^features/p[0-9]+_.*\.md$' \
    | grep -vE '^features/(done|archive|uat)/' \
    | grep -oE 'p[0-9]+' \
    | sort -u \
    | grep -v "^${pn}$" || true
}

# Pick the sprint directory for shipped specs. Resolution order:
#   1. features/done/CURRENT_SPRINT file (authoritative — written by kanban)
#   2. Newest date-prefixed directory under features/done/ (YYYY* glob avoids uat/, INDEX.md, etc.)
#   3. Today's YYYY-MM-DD fallback (caller mkdir -p's it).
# Shell-safety note: output goes into a quoted `mv` argument, not eval. _safe_echo not required.
# See .claude/rules/shell-safety.md — rule applies to eval-bound paths only.
resolve_ship_sprint_dir() {
  local current_sprint_file="$REPO_ROOT/features/done/CURRENT_SPRINT"
  if [[ -f "$current_sprint_file" ]]; then
    local content
    content="$(cat "$current_sprint_file" | sed 's:/$::')"
    # Typo/corruption guard: must be features/done/YYYY-MM-DD (agent-writes-garbage protection).
    if [[ ! "$content" =~ ^features/done/[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
      echo "ERROR: CURRENT_SPRINT must contain 'features/done/YYYY-MM-DD', got: $content" >&2
      exit 1
    fi
    echo "$content"
    return
  fi
  local newest
  newest="$( cd "$REPO_ROOT" && ls -1d features/done/[0-9][0-9][0-9][0-9]*/ 2>/dev/null | sort -V | tail -n1 | sed 's:/$::' )"
  if [[ -n "$newest" ]]; then
    echo "$newest"
  else
    echo "features/done/$(date -u +%F)"
  fi
}

# Initialize a fresh journal with the source_sha list from `git log main..branch`.
# spec_file is stored so --resume can find the spec even after spec_closed=true
# (the spec has already been moved out of features/).
ship_init_journal() {
  local pn="$1"
  local branch="$2"
  local spec_file="$3"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  local shas
  shas="$( cd "$REPO_ROOT" && git log --reverse --format=%H "main..${branch}" 2>/dev/null )"
  if [[ -z "$shas" ]]; then
    die "ship: branch '$branch' has no commits ahead of main — nothing to ship"
  fi

  # Pre-flight merge-commit warning (2026-08-21, P1135 KDD). Cherry-pick refuses
  # a merge commit without -m, so each one on the branch is a guaranteed Phase 1
  # failure — recovered via the documented `--mark-landed <sha> <sha^2>` escape
  # hatch (decisions.md 2026-08-20, P1104: this stalled a ship after 12 of 22
  # commits had already landed). Merging main into a feature branch is "ordinary"
  # here (that same entry's own words), so this fires often enough to be worth a
  # batch print rather than N one-at-a-time discoveries. Warn-and-continue only:
  # this does NOT skip or auto-record anything — Phase 1 still stops on the first
  # merge exactly as before; the operator just has every recipe up front instead
  # of finding them one failure at a time.
  local merge_shas
  merge_shas="$( cd "$REPO_ROOT" && git rev-list --merges --reverse "main..${branch}" 2>/dev/null )"
  if [[ -n "$merge_shas" ]]; then
    echo "ship: branch '$branch' contains $(printf '%s\n' "$merge_shas" | wc -l | tr -d ' ') merge commit(s)."
    echo "  Cherry-pick cannot apply a merge without -m, so Phase 1 will stop on the first"
    echo "  one below. Resolve each in turn with the recipe printed at that failure, or"
    echo "  pre-resolve all of them now:"
    local _m _m2
    while IFS= read -r _m; do
      [[ -n "$_m" ]] || continue
      _m2="$( cd "$REPO_ROOT" && git rev-parse "${_m}^2" 2>/dev/null )"
      if [[ -n "$_m2" ]] && ( cd "$REPO_ROOT" && git merge-base --is-ancestor "$_m2" main 2>/dev/null ); then
        echo "    ./scripts/git-ops.sh ship $pn --mark-landed $_m $_m2"
      else
        echo "    $_m merges something other than main — inspect by hand, no recipe below it"
      fi
    done <<< "$merge_shas"
  fi

  mkdir -p "$SHIP_JOURNAL_DIR"
  local started_at session_id
  started_at="$(iso_now)"
  session_id="$(hostname -s)-$$-$(date +%s)"

  local tmp
  tmp="$(mktemp "$SHIP_JOURNAL_DIR/.init.XXXXXX")" || die "mktemp failed"
  SHIP_SHAS="$shas" python3 - "$tmp" "$pn" "$branch" "$spec_file" "$started_at" "$session_id" <<'PY'
import json, os, sys
tmp, pn, branch, spec_file, started, session = sys.argv[1:]
shas = [s for s in os.environ["SHIP_SHAS"].splitlines() if s]
payload = {
    "p_number": pn,
    "started_at": started,
    "session_id": session,
    "source_branch": branch,
    "spec_file": spec_file,
    "commits": [{"source_sha": s, "landed_sha": None, "landed_at": None, "pre_pick_head": None} for s in shas],
    "spec_closed": False,
    "branch_deleted": False,
}
with open(tmp, "w") as f:
    json.dump(payload, f, indent=2)
    f.flush()
    os.fsync(f.fileno())
PY
  mv "$tmp" "$journal"
}

# Read a top-level string field from the journal (empty string if absent).
ship_journal_str() {
  local pn="$1"
  local field="$2"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  python3 - "$journal" "$field" <<'PY'
import json, sys
j = json.load(open(sys.argv[1]))
v = j.get(sys.argv[2])
print("" if v is None else v)
PY
}

# Return 0 if the named boolean flag is true in the journal, 1 otherwise.
ship_journal_flag() {
  local pn="$1"
  local flag="$2"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  local val
  val="$(python3 - "$journal" "$flag" <<'PY'
import json, sys
j = json.load(open(sys.argv[1]))
print("1" if j.get(sys.argv[2]) else "0")
PY
)"
  [[ "$val" == "1" ]]
}

# Verify every recorded landed_sha still resolves on main. Exit non-zero on
# missing sha with a diagnostic naming the source and landed SHAs.
ship_verify_landed_shas() {
  local pn="$1"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  local missing
  missing="$( cd "$REPO_ROOT" && python3 - "$journal" <<'PY'
import json, subprocess, sys
j = json.load(open(sys.argv[1]))
missing = []
for c in j.get("commits", []):
    landed = c.get("landed_sha")
    if not landed:
        continue
    r = subprocess.run(["git", "cat-file", "-e", landed], capture_output=True)
    if r.returncode != 0:
        missing.append((c.get("source_sha", "?"), landed))
for s, l in missing:
    print(f"  source={s} landed={l}")
PY
 )"
  if [[ -n "$missing" ]]; then
    {
      echo "ship: --resume refuses because a recorded landed_sha is missing from main history:"
      echo "$missing"
      echo ""
      echo "Main may have been reset or force-modified since the prior ship attempt."
      echo "Options: (a) delete the journal at $journal and re-ship from scratch,"
      echo "(b) restore main to include the landed commits, then re-run --resume."
    } >&2
    exit 1
  fi
}

# List pending source_shas (landed_sha null) in journal order.
ship_pending_source_shas() {
  local journal="$1"
  python3 - "$journal" <<'PY'
import json, sys
j = json.load(open(sys.argv[1]))
for c in j.get("commits", []):
    if not c.get("landed_sha"):
        print(c["source_sha"])
PY
}

# Atomically update journal: set landed_sha for a given source_sha.
ship_record_landed() {
  local pn="$1"
  local source_sha="$2"
  local landed_sha="$3"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  local landed_at
  landed_at="$(iso_now)"
  python3 - "$journal" "$source_sha" "$landed_sha" "$landed_at" <<'PY'
import json, os, sys, tempfile
target, src, landed, at = sys.argv[1:]
j = json.load(open(target))
for c in j["commits"]:
    if c["source_sha"] == src:
        c["landed_sha"] = landed
        c["landed_at"] = at
        break
else:
    raise SystemExit(f"source_sha {src} not in journal")
d = os.path.dirname(target)
fd, tmp = tempfile.mkstemp(prefix=".ship-journal.", dir=d)
try:
    with os.fdopen(fd, "w") as f:
        json.dump(j, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.rename(tmp, target)
except Exception:
    try:
        os.unlink(tmp)
    except FileNotFoundError:
        pass
    raise
PY
}

# Record pre_pick_head (HEAD before a pick attempt) for a source_sha. Lets the
# crash-window recovery below (P972 finding #1) find a commit that landed via a
# prior --continue but crashed before ship_record_landed wrote the journal.
# Atomic temp-file write, same pattern as ship_record_landed.
ship_record_pre_pick() {
  local pn="$1"
  local source_sha="$2"
  local head="$3"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  python3 - "$journal" "$source_sha" "$head" <<'PY'
import json, os, sys, tempfile
target, src, head = sys.argv[1:]
j = json.load(open(target))
for c in j["commits"]:
    if c["source_sha"] == src:
        c["pre_pick_head"] = head
        break
else:
    raise SystemExit(f"source_sha {src} not in journal")
d = os.path.dirname(target)
fd, tmp = tempfile.mkstemp(prefix=".ship-journal.", dir=d)
try:
    with os.fdopen(fd, "w") as f:
        json.dump(j, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.rename(tmp, target)
except Exception:
    try:
        os.unlink(tmp)
    except FileNotFoundError:
        pass
    raise
PY
}

# Print the recorded pre_pick_head for a source_sha (empty if none).
ship_journal_pre_pick() {
  local pn="$1"
  local source_sha="$2"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  python3 - "$journal" "$source_sha" <<'PY'
import json, sys
j = json.load(open(sys.argv[1]))
for c in j.get("commits", []):
    if c["source_sha"] == sys.argv[2]:
        print(c.get("pre_pick_head") or "")
        break
PY
}

# Crash-window detection (P972 finding #1). If a prior --continue committed
# source_sha but was killed before the landed_sha write, that commit now sits on
# main as the IMMEDIATE CHILD of pre_pick_head (our paused pick committed on top
# of pre_pick_head, so candidate^ == pre_pick_head). A cherry-pick — clean OR
# conflict-resolved — preserves the source commit's author email + author date +
# subject (only the committer changes), so we additionally require that triple to
# match. Both constraints together pin the one commit our own ship could have
# produced; a co-tenant commit lands as a DESCENDANT (not the immediate child),
# and an operator --skip/--abort leaves no immediate child at all. Prints the
# candidate sha (empty if none).
#
# DELIBERATELY NOT used to auto-record a landing: author identity is forgeable by
# any same-source cherry-pick, and the operator's resolution can make the landed
# tree mean anything, so a metadata match is NOT proof the change is on main.
# Silently recording it + deleting the branch risks unrecoverable data loss
# (adversarial-review round 2, HIGH). The caller uses this only to emit a
# detect-and-refuse diagnostic — it never mutates main or the journal on this
# signal. Must run where HEAD is main's tip; callers cd into REPO_ROOT.
ship_find_landed_pick() {
  local pre_head="$1"
  local source_sha="$2"
  ( cd "$REPO_ROOT" && python3 - "$pre_head" "$source_sha" <<'PY'
import subprocess, sys
pre, src = sys.argv[1:]
def out(args):
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None
def ident(ref):
    s = out(["show", "-s", "--format=%ae%x00%aI%x00%s", ref])
    return s.rstrip("\n") if s is not None else None
target = ident(src)
if not target:
    raise SystemExit(0)
# Resolve pre_pick_head; if it no longer exists (main reset) bail → no detection.
pre_full = out(["rev-parse", "--verify", f"{pre}^{{commit}}"])
if pre_full is None:
    raise SystemExit(0)
pre_full = pre_full.strip()
# The immediate child of pre on the path to HEAD: first commit whose parent==pre.
# --ancestry-path keeps only commits on a path pre..HEAD; --reverse → oldest first.
rng = out(["rev-list", "--ancestry-path", "--reverse", f"{pre}..HEAD"])
if not rng:
    raise SystemExit(0)
first = rng.split()[0]
parent = out(["rev-parse", "--verify", f"{first}^"])
if parent is None or parent.strip() != pre_full:
    raise SystemExit(0)  # immediate child's parent isn't pre — shouldn't happen, bail safe
if ident(first) == target:
    print(first)
PY
  )
}

# Set a top-level boolean flag in the journal (e.g. spec_closed, branch_deleted).
ship_set_journal_flag() {
  local pn="$1"
  local flag="$2"
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  python3 - "$journal" "$flag" <<'PY'
import json, os, sys, tempfile
target, flag = sys.argv[1:]
j = json.load(open(target))
j[flag] = True
d = os.path.dirname(target)
fd, tmp = tempfile.mkstemp(prefix=".ship-journal.", dir=d)
try:
    with os.fdopen(fd, "w") as f:
        json.dump(j, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.rename(tmp, target)
except Exception:
    try:
        os.unlink(tmp)
    except FileNotFoundError:
        pass
    raise
PY
}

# Phase 3 (branch + worktree cleanup) is the LAST thing cmd_ship does, so ANY
# abort after Phase 1 has landed commits leaves a live branch and worktree while
# main already looks shipped. Nothing used to say so: the operator saw the spec
# closed, assumed a clean ship, and found the slot still in kanban days later
# (p1057/w1, plus 8 stale journals whose specs are all closed on main). Fixing
# the individual abort causes is necessary but never sufficient — this trap
# turns the whole class from silent into loud. Best-effort throughout: a trap
# that can itself fail would mask the real error it is reporting.
ship_on_abort() {
  local rc=$?
  local pn="${1:-}" branch="${2:-}"
  : "$rc"  # kept for diagnostics; see the note below on why it is NOT a gate
  # Releasing the lock is the one thing this trap must ALWAYS do, so it comes
  # first and nothing above it can fail. release_main_lock checks the nonce, so
  # it never releases a lock this process does not own.
  release_main_lock || true
  # Deliberately NOT gated on $rc. Bash reports $? as 0 inside an EXIT trap when
  # the shell dies from SIGTERM or SIGINT, so an `rc == 0 -> return` gate is mute
  # in exactly the kill-mid-ship scenario this trap exists for (measured: outer
  # status 143, trap sees 0). Gating on the journal instead is both stricter and
  # honest: the success path at the end of cmd_ship runs `trap - EXIT` BEFORE it
  # returns, and there is no `exit 0` or bare `return` anywhere between arming
  # and clearing — so if this function runs at all, the ship did not complete,
  # whatever $? claims. Canary XX pins the signal case.
  [[ -n "$pn" ]] || return 0
  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  [[ -f "$journal" ]] || return 0
  # A paused cherry-pick is a DESIGNED stop, not a strand: ship prints conflict
  # instructions and exits non-zero on purpose, and the branch and worktree are
  # SUPPOSED to still be there until the operator resolves and re-runs. Shouting
  # "INCOMPLETE" at a routine conflict would train the operator to ignore the
  # one message that matters — and /ship relays this output to the founder as an
  # incident. The resolve-and-resume advice ship already printed is the correct
  # guidance here; do not overwrite it with a worse copy. Canary YY pins it.
  local _gitdir_abort=""
  _gitdir_abort="$( cd "$REPO_ROOT" && git rev-parse --absolute-git-dir 2>/dev/null )" || _gitdir_abort=""
  if [[ -n "$_gitdir_abort" && -e "$_gitdir_abort/CHERRY_PICK_HEAD" ]]; then
    return 0
  fi
  # branch_deleted true means Phase 3 already ran; nothing is stranded.
  if ship_journal_flag "$pn" "branch_deleted" 2>/dev/null; then return 0; fi
  # Only shout when main actually changed. A journal with nothing landed means
  # the ship aborted before touching main, and the branch is meant to still be
  # there — saying "stranded" then would be a false alarm.
  # "unknown" and "zero" must stay distinguishable. Collapsing them would let a
  # broken or missing python3 silence the warning this trap exists to print —
  # the degraded environment is exactly when the operator most needs it. Zero
  # returns quietly (main untouched, nothing stranded); unknown warns.
  local landed=""
  landed="$( python3 - "$journal" 2>/dev/null <<'PYCOUNT'
import json, sys
d = json.load(open(sys.argv[1]))
print(sum(1 for c in d.get("commits", []) if c.get("landed_sha")))
PYCOUNT
) " || landed=""
  landed="$(printf '%s' "$landed" | tr -dc '0-9')"
  local landed_desc="$landed"
  if [[ -z "$landed" ]]; then
    landed_desc="an unknown number of"
  elif [[ "$landed" == "0" ]]; then
    return 0
  fi
  local wt_path=""
  wt_path="$( cd "$REPO_ROOT" && git worktree list --porcelain 2>/dev/null | \
              awk -v br="refs/heads/${branch}" '
                /^worktree / { path = substr($0, 10); next }
                /^branch / { if ($2 == br) print path }
              ' | head -n1 )" || wt_path=""
  {
    echo ""
    echo "ship: INCOMPLETE — ${landed_desc} commit(s) already landed on main, but cleanup did not run."
    echo "ship: still live: branch ${branch}"
    [[ -n "$wt_path" ]] && echo "ship: still live: worktree ${wt_path}"
    echo "ship: journal kept at ${journal}"
    echo "ship: fix the error above, then converge with: git-ops ship ${pn} --resume"
  } >&2
  return 0
}

# Rewrite the moved spec's frontmatter: status: all-done, add completed_at
# (YYYY-MM-DD UTC), drop delivery_stage. Leaves pipeline_plan / pipeline_ran /
# pipeline_skipped intact for audit.
ship_rewrite_frontmatter() {
  local spec_path="$1"
  python3 - "$spec_path" <<'PY'
import re, sys
p = sys.argv[1]
with open(p) as f:
    text = f.read()
# Split frontmatter: must start with --- on line 1.
if not text.startswith("---\n"):
    raise SystemExit(f"ship: {p} has no frontmatter — cannot rewrite")
end = text.find("\n---\n", 4)
if end < 0:
    raise SystemExit(f"ship: {p} frontmatter never closes")
fm = text[4:end]
rest = text[end + 5:]
lines = fm.splitlines()
out = []
saw_status = False
saw_completed_at = False
for ln in lines:
    if ln.startswith("delivery_stage:"):
        continue
    if ln.startswith("status:"):
        out.append("status: all-done")
        saw_status = True
        continue
    if ln.startswith("completed_at:"):
        saw_completed_at = True
    out.append(ln)
if not saw_status:
    out.append("status: all-done")
if not saw_completed_at:
    from datetime import datetime, timezone
    out.append("completed_at: " + datetime.now(timezone.utc).strftime("%Y-%m-%d"))
else:
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out = [f"completed_at: {today}" if ln.startswith("completed_at:") else ln for ln in out]
new = "---\n" + "\n".join(out) + "\n---\n" + rest
with open(p, "w") as f:
    f.write(new)
PY
}

# P1094 item 1. Closing a spec moves it two directories deeper (features/ ->
# features/done/<sprint>/), and nothing used to rewrite its body links — so a
# link written `../docs/x.md`, correct from features/, resolved to
# features/done/docs/x.md after the move. The doc-link gate in
# pre-commit-checks.sh then blocked the close commit ITSELF, after Phase 1 had
# already landed the code on main, and the retry was booby-trapped (item 2).
#
# Re-base is pure path math, never a guess: resolve each target against the OLD
# directory, then express that same file relative to the NEW one. Contrast
# scripts/fix-doc-links.cjs, which repairs unrelated legacy rot by matching a
# basename — that one can be wrong; this one cannot point at a different file.
#
# Scoping tracks scripts/validate-doc-links.cjs `extractLinks` /
# `isSkippableTarget` — inline links only, fenced code blocks skipped, same skip
# prefixes, same percent-decoding for existence checks. Rewriting exactly the
# set of links the gate judges is the point; a wider rewrite would edit prose
# the gate never reads. TWO DELIBERATE DIVERGENCES, so a future parity check
# reads them as intent rather than drift:
#   - root-absolute targets (leading `/`) are skipped here and not there. They
#     do not depend on the file's depth, so re-basing them is meaningless, and
#     os.path.join would treat one as an absolute override.
#   - reference-style definitions ([label]: target) are not re-based, because
#     the gate does not extract them. If it learns to, this must too.
#
# Ratchet, not threshold (docs/decisions.md 2026-08-15): the repo carries
# pre-existing dead links by design, so a link that was ALREADY dead before the
# move is re-based too but never fails the close. Only a link that resolved
# before the move and does not after is an error — that is a path-math bug, and
# it dies loudly rather than committing a rewritten-but-dead link.
ship_rebase_doc_links() {
  local repo_root="$1" old_rel="$2" new_rel="$3"
  python3 - "$repo_root" "$old_rel" "$new_rel" <<'PY'
import os, re, sys, urllib.parse

repo_root, old_rel, new_rel = sys.argv[1], sys.argv[2], sys.argv[3]
old_dir = os.path.dirname(old_rel)
new_dir = os.path.dirname(new_rel)
path = os.path.join(repo_root, new_rel)

if old_dir == new_dir:
    raise SystemExit(0)

# Encoding is explicit: spec bodies are full of em-dashes and a locale-dependent
# decode would rewrite the whole file as mojibake, silently.
with open(path, encoding='utf-8') as f:
    text = f.read()

# Mirrors validate-doc-links.cjs isSkippableTarget().
SKIP_RE = re.compile(r'^(?:https?:|mailto:|tel:|data:|ftp:)', re.I)


def skippable(target):
    return (
        SKIP_RE.match(target) is not None
        or target.startswith(('#', '<', '~', '$', '{', '/'))
        or '${' in target
    )


def fs_part(target):
    """Split a target into (filesystem path, preserved #anchor/?query suffix)."""
    cut = len(target)
    for ch in ('#', '?'):
        i = target.find(ch)
        if i >= 0:
            cut = min(cut, i)
    return target[:cut], target[cut:]


def decoded(rel):
    """Percent-decoded form, for existence checks only — matches
    validate-doc-links.cjs toFsPath(). The link text itself is never decoded:
    re-basing must not silently rewrite `my%20file.md` into `my file.md`."""
    try:
        return urllib.parse.unquote(rel)
    except Exception:
        return rel


def exists(rel):
    return os.path.exists(os.path.join(repo_root, rel)) or os.path.exists(
        os.path.join(repo_root, decoded(rel))
    )


broken = []


def rebase(target):
    """Re-based target, or None to leave the link untouched."""
    if not target or skippable(target):
        return None
    fs, suffix = fs_part(target)
    if not fs:
        return None
    from_root = os.path.normpath(os.path.join(old_dir, fs))
    if from_root.startswith('..'):
        return None  # escapes the repo root — nothing sane to re-base onto
    resolved_before = exists(from_root)
    if not resolved_before:
        # The target doesn't resolve from THIS file's old location. That's expected
        # when the link was already dead — but it's also what a co-located sibling
        # spec looks like once IT has already moved earlier in the same ship run
        # (P1135/P1130, 2026-08-21): the naive old-dir rebase math below is still
        # internally consistent (round-trip matches), so nothing catches that it now
        # points at nothing. Before trusting that math, check whether the ORIGINAL,
        # unrebased link text already resolves from the NEW directory — the case
        # exactly when the target independently moved to (or already lived in) this
        # same directory. If so, the link is already correct; leave it untouched
        # rather than rebase a path that's stale on both ends.
        as_is_from_new = os.path.normpath(os.path.join(new_dir, fs)) if new_dir else fs
        if exists(as_is_from_new):
            return None
    new_fs = os.path.relpath(from_root, new_dir) if new_dir else from_root
    # The rewrite must name the SAME file from the new directory. If the round
    # trip disagrees, or a link that resolved before does not now, the path math
    # is wrong — fail rather than commit a silently mangled target.
    round_trip = os.path.normpath(os.path.join(new_dir, new_fs)) if new_dir else new_fs
    if round_trip != from_root or (resolved_before and not exists(round_trip)):
        broken.append((target, new_fs))
        return None
    if new_fs == fs:
        return None
    return new_fs + suffix


# Mirrors validate-doc-links.cjs extractLinks(): fence-aware, same link regex.
LINK_RE = re.compile(r'(\[(?:\\.|[^\]\\])*\]\()([^)\s]+)((?:\s+"[^"]*")?\))')

out_lines = []
in_fence = False
changed = 0
for line in text.split('\n'):
    if re.match(r'^\s*(```|~~~)', line):
        in_fence = not in_fence
        out_lines.append(line)
        continue
    if in_fence:
        out_lines.append(line)
        continue

    def sub(m):
        global changed
        new_target = rebase(m.group(2))
        if new_target is None:
            return m.group(0)
        changed += 1
        return m.group(1) + new_target + m.group(3)

    out_lines.append(LINK_RE.sub(sub, line))

if broken:
    # Colon, never an arrow: this string reaches stderr, and stderr can be
    # re-lexed by a caller's eval (.claude/rules/shell-safety.md, P783).
    detail = '; '.join('%s becomes %s' % (a, b) for a, b in broken)
    raise SystemExit(
        'ship: refusing to close %s — re-basing its links from %s to %s would '
        'break a link that resolved before the move: %s'
        % (new_rel, old_dir or '.', new_dir or '.', detail)
    )

if changed:
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out_lines))
    print('ship: re-based %d relative link(s) in %s for its new depth' % (changed, new_rel))
PY
}

# Extract a spec's title: the first non-frontmatter '# ' heading. Empty if none.
# Shared by the normal Phase-2 spec-close and the no-branch closure path (P920).
ship_extract_title() {
  local spec_path="$1"
  python3 - "$spec_path" <<'PY'
import sys
with open(sys.argv[1]) as f:
    text = f.read()
in_fm = False
seen_open = False
for line in text.splitlines():
    if line == "---":
        if not seen_open:
            in_fm = True; seen_open = True; continue
        elif in_fm:
            in_fm = False; continue
    if in_fm:
        continue
    if line.startswith("# "):
        print(line[2:].strip())
        break
PY
}

# Return the blob content of spec_file at its FIRST addition commit on the branch.
# Used by the branch-born seed: seeding the creation blob (not FINAL) makes the
# creation cherry-pick a no-op (identical AA auto-resolves; benign arm handles it).
ship_spec_creation_blob() {
  local branch="$1" spec="$2"
  local creation_sha
  creation_sha="$( cd "$REPO_ROOT" && \
    git log --diff-filter=A --format='%H' "$branch" -- "$spec" 2>/dev/null | tail -1 )"
  if [[ -z "$creation_sha" ]]; then
    return 1
  fi
  ( cd "$REPO_ROOT" && git show "${creation_sha}:${spec}" 2>/dev/null )
}

# ── P1255: disclosure embargo ────────────────────────────────────────────────
# Return the spec's `disclosure:` value ("public", "embargo", or "" when the
# field is absent — every spec predating P1255).
#
# Reads the BRANCH copy first, matching ship-gates.sh's own precedence: specs
# evolve on the branch and main's copy is stale until ship completes. A spec that
# is branch-born has no main copy at all, which is the whole point.
ship_spec_disclosure() {
  local branch="$1" spec="$2"
  local content=""
  if [[ -n "$branch" && -n "$spec" ]]; then
    content="$( cd "$REPO_ROOT" && git show "${branch}:${spec}" 2>/dev/null )" || content=""
  fi
  if [[ -z "$content" && -n "$spec" && -f "$REPO_ROOT/$spec" ]]; then
    content="$( cat "$REPO_ROOT/$spec" )"
  fi
  [[ -z "$content" ]] && return 0
  # `|| true` is load-bearing, not defensive noise: this file runs under
  # `set -euo pipefail` (L39), grep exits 1 whenever `disclosure:` is absent —
  # every spec predating P1255, i.e. the common case — and a bare command-
  # substitution assignment in the caller would abort the script before its own
  # error message could run. `sed -n 1p` replaces `head -1` for the same reason:
  # head closes the pipe early and SIGPIPEs the upstream grep (141), which
  # pipefail promotes to the pipeline's status (epistemic.md gate 7, P1260).
  printf '%s\n' "$content" \
    | sed -n '/^---$/,/^---$/p' \
    | { /usr/bin/grep -E '^disclosure:' || true; } \
    | sed -n '1p' \
    | sed 's/^disclosure://' \
    | sed 's/[[:space:]]#.*$//' \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
    | sed "s/^'\\(.*\\)'$/\\1/; s/^\"\\(.*\\)\"$/\\1/"
}

# ----------------------------------------------------------------------------
# Subcommand: publish-spec  (P1255, Build Sequence step 6b)
#
# Publishes a spec that `ship` deliberately withheld because it carried
# `disclosure: embargo`. This is the deferred half of a normal close: the code
# already merged at ship time, the branch and worktree were retained, and the
# spec file still exists only on its own branch.
#
# Why it is a separate step and not a pre-merge gate (R1): ship.md:66 mandates
# merge-first-then-migrate, because stamp-deploy-manifest.sh refuses to run from
# inside a worktree and migrating pre-merge dirties main's manifest into a
# guaranteed cherry-pick conflict. So the prod stamp this step waits for cannot
# exist until AFTER the merge. A gate placed before the merge would deadlock.
#
# Gates, all hard:
#   1. Every migration carrying this spec's pN token is present in
#      origin/main:supabase/deploy-manifest.json -> .prod.migrations.
#   2. If the spec has NO migration, there is nothing a manifest can confirm —
#      require an explicit --yes. Fails closed (toward non-disclosure).
#   3. The authenticated prod smoke test passes RIGHT NOW. The manifest is a
#      record, not the database: .private/docs/security-log.md 2026-08-10 has an
#      incident where it recorded a migration as applied whose effects were
#      absent. Manifest = trigger, live check = confirmation, never manifest alone.
# ----------------------------------------------------------------------------
cmd_publish_spec() {
  local pn="" assume_yes=0 skip_smoke=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes)         assume_yes=1; shift ;;
      --skip-smoke)  skip_smoke=1; shift ;;   # test-only knob; never in normal use
      p[0-9]*)       pn="$1"; shift ;;
      *)             die "publish-spec: unknown argument '$1'" ;;
    esac
  done
  [[ -n "$pn" ]] || die "publish-spec: usage: git-ops.sh publish-spec pN [--yes]"
  [[ "$pn" =~ ^p[0-9]+$ ]] || die "publish-spec: pN must match p[0-9]+ (got: $pn)"

  # Must run from the main checkout: this commits to main, and the branch it
  # tears down at the end may be the very worktree a caller is standing in.
  local _top; _top="$( git rev-parse --show-toplevel )"
  [[ "$_top" == "$REPO_ROOT" ]] || \
    die "publish-spec: run from the main checkout ($REPO_ROOT), not $_top"

  local branch; branch="$(resolve_ship_branch "$pn")"
  [[ -n "$branch" ]] || die "publish-spec: no feature/${pn}-* or fix/${pn}-* branch — nothing to publish (already published?)"

  # `local x=""` then `x="$(...)" || x=""` — the file's own safe idiom (L1380).
  # `git ls-tree -r` emits the whole tree, so a `head -1` really would SIGPIPE
  # the upstream grep; and grep exits 1 when the spec is absent.
  local branch_spec=""
  branch_spec="$( cd "$REPO_ROOT" && git ls-tree -r --name-only "$branch" 2>/dev/null \
    | { /usr/bin/grep -E "^features/${pn}_[^/]+\.md$" || true; } | sed -n '1p' )" || branch_spec=""
  [[ -n "$branch_spec" ]] || die "publish-spec: no features/${pn}_*.md on $branch"

  local disc; disc="$(ship_spec_disclosure "$branch" "$branch_spec")"
  [[ "$disc" == "embargo" ]] || \
    die "publish-spec: $pn is 'disclosure: ${disc:-<absent>}', not embargo — a normal 'git-ops.sh ship $pn' publishes it"

  # ── Gate 1/2: migrations present on prod ──────────────────────────────────
  local pnum="${pn#p}"
  # The trailing boundary is load-bearing: a bare `p126` also matches p1268,
  # p1260 and so on, which would demand THOSE specs' migrations be on prod before
  # p126 could publish. Fail-closed rather than insecure, but wrong — verified by
  # command 2026-09-08 against the repo's 253 pN-tokened migrations.
  local migs=""
  migs="$( cd "$REPO_ROOT" && git ls-tree -r --name-only "$branch" -- supabase/migrations 2>/dev/null \
    | { /usr/bin/grep -E "p${pnum}([^0-9]|\$)" || true; } )" || migs=""
  if [[ -n "$migs" ]]; then
    local manifest; manifest="$( cd "$REPO_ROOT" && git show origin/main:supabase/deploy-manifest.json 2>/dev/null )" \
      || die "publish-spec: cannot read origin/main:supabase/deploy-manifest.json"
    local missing=0
    while IFS= read -r m; do
      [[ -z "$m" ]] && continue
      local base; base="$(basename "$m")"
      if ! printf '%s' "$manifest" | python3 -c \
        "import json,sys; d=json.load(sys.stdin); sys.exit(0 if '$base' in d.get('prod',{}).get('migrations',[]) else 1)"; then
        echo "publish-spec: NOT applied to prod: $base" >&2
        missing=$((missing + 1))
      fi
    done <<<"$migs"
    (( missing == 0 )) || die "publish-spec: $missing migration(s) for $pn are absent from origin/main deploy-manifest [prod].migrations — apply to prod and stamp the manifest first"
    echo "publish-spec: all $pn migrations present in origin/main [prod].migrations" >&2
  else
    if (( assume_yes == 0 )); then
      die "publish-spec: $pn has no migration, so no manifest can confirm the fix is live on prod. Confirm the fix is deployed and re-run with --yes."
    fi
    echo "publish-spec: no migrations for $pn — proceeding on explicit operator ack (--yes)" >&2
  fi

  # ── Gate 3: live confirmation (the manifest is a record, not the database) ──
  if (( skip_smoke == 0 )); then
    echo "publish-spec: running authenticated prod smoke test..." >&2
    ( cd "$REPO_ROOT" && node scripts/prod-smoke-test.mjs ) \
      || die "publish-spec: prod smoke test FAILED — refusing to publish $pn while prod does not demonstrate the fixed behaviour"
  else
    echo "publish-spec: WARNING — prod smoke skipped (--skip-smoke); this is a test-only path" >&2
  fi

  # ── Publish under the main lock, serialized against ship / commit-to-main ──
  acquire_main_lock 120 >/dev/null || die "publish-spec: could not acquire main.lock"
  # shellcheck disable=SC2064 — expand now: the trap must name this exact lock.
  trap "release_main_lock >/dev/null 2>&1 || true" EXIT

  local _head; _head="$( cd "$REPO_ROOT" && git rev-parse --abbrev-ref HEAD )"
  [[ "$_head" == "main" ]] || die "publish-spec: HEAD is not main (got $_head)"
  local _gd; _gd="$( cd "$REPO_ROOT" && git rev-parse --absolute-git-dir )"
  [[ -e "$_gd/CHERRY_PICK_HEAD" || -e "$_gd/rebase-merge" || -e "$_gd/rebase-apply" || -e "$_gd/MERGE_HEAD" ]] \
    && die "publish-spec: operation in progress — refusing to commit inside another session's cherry-pick, rebase or merge"

  local sprint_dir; sprint_dir="$(resolve_ship_sprint_dir)"
  mkdir -p "$REPO_ROOT/$sprint_dir"
  local dest="${sprint_dir}/$(basename "$branch_spec")"

  # Write the BRANCH copy (the only complete one) to its closed location on main.
  ( cd "$REPO_ROOT" && git show "${branch}:${branch_spec}" > "$dest" ) \
    || die "publish-spec: could not extract $branch_spec from $branch"

  ship_rewrite_frontmatter "$REPO_ROOT/$dest" || die "publish-spec: frontmatter rewrite failed"

  # D4 (founder, 2026-09-08): the field reads `public` once published. Leaving
  # `embargo` in features/done/ would publish a permanent, computable
  # "this hole was open for completed_at - created_date days" figure for every
  # security fix, forever — a per-spec exposure-duration index, which is close to
  # the committed list of what is sensitive that Invariant 1 forbids.
  python3 - "$REPO_ROOT/$dest" <<'PYEOF'
import sys, re, pathlib
p = pathlib.Path(sys.argv[1]); t = p.read_text()
end = t.find("\n---\n", 4)
fm, rest = t[4:end], t[end + 5:]
fm = re.sub(r'^disclosure:.*$', 'disclosure: public', fm, count=1, flags=re.M)
p.write_text("---\n" + fm + "\n---\n" + rest)
PYEOF

  ( cd "$REPO_ROOT" && git add -- "$dest" ) || die "publish-spec: git add failed"
  commit_staged_exact "chore: publish $pn spec — embargo lifted, fix confirmed on prod" "$dest" \
    || die "publish-spec: commit failed"
  echo "publish-spec: $pn published at $dest" >&2

  # ── Teardown: what ship's Phase 3 deliberately skipped ────────────────────
  local wt_path=""
  wt_path="$( cd "$REPO_ROOT" && git worktree list --porcelain | \
              awk -v br="refs/heads/${branch}" '
                /^worktree / { path = substr($0, 10); next }
                /^branch / { if ($2 == br) print path }
              ' | sed -n '1p' )" || wt_path=""
  if [[ -n "$wt_path" ]]; then
    reap_worktree_servers "$wt_path"
    ( cd "$REPO_ROOT" && git worktree remove --force "$wt_path" ) >/dev/null 2>&1 || true
  fi
  if ( cd "$REPO_ROOT" && git rev-parse --verify "$branch" >/dev/null 2>&1 ); then
    ( cd "$REPO_ROOT" && git branch -D "$branch" ) >/dev/null 2>&1 || \
      echo "publish-spec: WARNING — branch delete failed for $branch" >&2
  fi
  echo "publish-spec: $pn complete. Push when ready (pushes are never automatic)." >&2
}

# ----------------------------------------------------------------------------
# Closure gate (P1246)
# ----------------------------------------------------------------------------
#
# WHY THIS IS A FUNCTION CALL AND NOT A LINE IN ship.md
# `ship-gates.sh` has existed and been correct for months. `ship.md:51` told the
# agent to run it. Measured 2026-09-04: ZERO call sites in the closing code, and
# scored against gate 2.5 at the moment of each close, 15/18 co-located closes
# and >=19/40 sampled ordinary closes would have been refused had it run. A
# control an agent is asked to invoke is not a control. This is the fix: the
# close path itself runs the gate, on every route, before any mutation.
#
# Placement rule: call this BEFORE the first irreversible step of a route
# (cherry-pick, git mv, commit). A gate that runs after a mutation is a
# diagnostic, not a gate.
#
# Sets SHIP_GATE_OVERRIDE_REASON (empty when no override was used) for the
# caller to fold into the closure commit message.
SHIP_GATE_OVERRIDE_REASON=""

# ship_close_message <subject> — the closure commit subject, plus an override
# trailer when a gate was overridden.
#
# The trailer is the audit trail that MATTERS. gate-overrides.log lives in
# git-common-dir, is untracked, and is as forgeable as any local file; a commit
# message is pushed, immutable in practice, and shows up in `git log` next to
# the close it justifies. Anyone auditing "which specs were closed on a red
# gate?" greps one string across history.
ship_close_message() {
  local subject="$1"
  if [[ -n "$SHIP_GATE_OVERRIDE_REASON" ]]; then
    printf '%s\n\nGate-Override: closure gate failed; closed by human override.\nGate-Override-Reason: %s\n' \
      "$subject" "$SHIP_GATE_OVERRIDE_REASON"
  else
    printf '%s\n' "$subject"
  fi
}

# $3 = path of a journal this run CREATED (empty on --resume). A refusal removes
# it, so a correctly-refused ship leaves no stale state behind.
#
# Without this, `ship_init_journal` (which runs earlier on the branch route)
# leaves a journal on every gate refusal, and pipeline-strandings.sh then reports
# it as "INTERRUPTED SHIP ... converge with --resume". Nothing was interrupted —
# the gate did its job — so the report is wrong and its advice is a loop. Caught
# 2026-09-08 by running the new reporter against the new gate; a self-inflicted
# false positive of exactly the kind epistemic.md gate 7c exists to catch, and it
# would have trained the founder to ignore the one report meant to be trusted.
#
# Same precedent as the self-modification guard below: "On a fresh run the
# journal was just created — remove it so refusal leaves no stale state."
ship_run_gates() {
  local pn="$1" want_override="${2:-0}" fresh_journal="${3:-}"
  SHIP_GATE_OVERRIDE_REASON=""

  local gates_script="$REPO_ROOT/scripts/ship-gates.sh"
  # Fails CLOSED (P1246 invariant: "Unreadable spec, missing script, unresolvable
  # branch -> deny"). A missing gate script must never mean "no gates apply" —
  # that is the failure mode where deleting the gate is the cheapest way past it.
  if [[ ! -x "$gates_script" ]]; then
    [[ -n "$fresh_journal" ]] && rm -f "$fresh_journal"
    die "ship: cannot run closure gates — $gates_script is missing or not executable. Refusing to close $pn ungated."
  fi

  local gate_out gate_rc=0
  gate_out="$( bash "$gates_script" "$pn" 2>&1 )" || gate_rc=$?
  printf '%s\n' "$gate_out" >&2

  if [[ "$gate_rc" -eq 0 ]]; then
    return 0
  fi

  # --- Failed. --------------------------------------------------------------
  if [[ "$want_override" -ne 1 ]]; then
    [[ -n "$fresh_journal" ]] && rm -f "$fresh_journal"
    die "$(gate_override_refusal_text "$pn")"
  fi

  if ! gate_override_tty_available; then
    die "ship: --override requires an interactive terminal.

  This session has no controlling terminal (/dev/tty is not openable), which is
  how an agent shell looks by default.

  This check is friction and an audit trail, NOT a wall you are unable to climb:
  a pty wrapper such as script(1) defeats it (verified 2026-09-08). Do not reach
  for one. An override you obtain that way is indistinguishable in the log from a
  founder's decision, which is precisely the self-attestation this gate exists to
  end. Report the gate failure and let the founder decide.

  Founder: run the same command from a real terminal window."
  fi

  local reason=""
  if ! reason="$( gate_override_capture "$pn" "closure gate" )"; then
    [[ -n "$fresh_journal" ]] && rm -f "$fresh_journal"
    die "ship: override aborted at the prompt — $pn not closed."
  fi

  gate_override_record "$pn" "closure" "$reason"
  SHIP_GATE_OVERRIDE_REASON="$reason"
  echo "ship: GATE OVERRIDE accepted for $pn — recorded in the closure commit and in gate-overrides.log" >&2
  return 0
}

cmd_ship() {
  local pn=""
  local resume=0
  local want_override=0
  local _gate_skip=0
  local mark_source="" mark_landed=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --resume) resume=1; shift ;;
      # P1246. Does NOT skip the gates — it makes a FAILING gate promptable on
      # /dev/tty. An agent shell has no /dev/tty, so passing this flag from one
      # changes nothing except the wording of the refusal.
      --override) want_override=1; shift ;;
      # Safe manual convergence for the P972 crash-window detect-and-refuse path:
      # records an operator-confirmed landing without hand-editing the journal.
      --mark-landed)
        mark_source="${2:-}"; mark_landed="${3:-}"
        if [[ -z "$mark_source" || -z "$mark_landed" ]]; then
          echo "usage: git-ops ship <p-number> --mark-landed <source_sha> <landed_sha>" >&2; exit 2
        fi
        shift 3 ;;
      -*)       echo "git-ops ship: unknown flag '$1'" >&2; exit 2 ;;
      *)
        if [[ -n "$pn" ]]; then
          echo "usage: git-ops ship <p-number> [--resume] [--override]" >&2; exit 2
        fi
        pn="$1"; shift ;;
    esac
  done
  if [[ -z "$pn" ]]; then
    echo "usage: git-ops ship <p-number> [--resume] [--override]" >&2; exit 2
  fi
  if [[ ! "$pn" =~ ^p[0-9]+$ ]]; then
    die "ship: p-number must match ^p[0-9]+$ (got '$pn')"
  fi

  require_main_repo

  local journal="$SHIP_JOURNAL_DIR/${pn}.json"
  local journal_exists=0
  [[ -f "$journal" ]] && journal_exists=1

  # --mark-landed: validate the landed sha is actually on main, then record it.
  # Validation is the safety boundary the auto-recovery lacked — the operator may
  # pass any sha, so we refuse unless it is an ancestor of main's HEAD (the change
  # is genuinely on main) and the source_sha is a pending entry in the journal.
  if [[ -n "$mark_source" ]]; then
    (( journal_exists == 1 )) || die "ship: --mark-landed needs an existing journal at $journal"
    local _ml_full
    _ml_full="$( cd "$REPO_ROOT" && git rev-parse --verify "${mark_landed}^{commit}" 2>/dev/null )" \
      || die "ship: --mark-landed sha '$mark_landed' is not a valid commit"
    if ! ( cd "$REPO_ROOT" && git merge-base --is-ancestor "$_ml_full" HEAD 2>/dev/null ); then
      die "ship: --mark-landed sha '$mark_landed' is not on main (not an ancestor of HEAD) — refusing to record a landing that did not happen"
    fi
    local _ml_pending
    _ml_pending="$( ship_pending_source_shas "$journal" | grep -Fxq "$mark_source" && echo 1 || echo 0 )"
    [[ "$_ml_pending" == "1" ]] || die "ship: --mark-landed source '$mark_source' is not a pending commit in the journal"
    ship_record_landed "$pn" "$mark_source" "$_ml_full"
    echo "ship: recorded $mark_source as landed at $_ml_full. Re-run 'git-ops ship $pn --resume' to converge." >&2
    return 0
  fi

  if (( journal_exists == 1 && resume == 0 )); then
    {
      echo "ship: existing journal at $journal"
      echo "Resume with 'git-ops ship $pn --resume' or delete the journal to restart."
    } >&2
    exit 1
  fi
  if (( journal_exists == 0 && resume == 1 )); then
    die "ship: --resume requested but no journal at $journal"
  fi

  # Establish branch + spec. On fresh runs, resolve from disk. On resume, trust
  # the journal's stored fields so a spec that was already moved (spec_closed=true)
  # doesn't trigger a "spec not found" refusal.
  local branch=""
  local spec_file=""
  # Plan v2 Layer 1 (branch-born seed-to-match): set inside the fresh-run block;
  # read inside the post-lock seed block. Resume path always leaves these as "".
  local need_seed=0
  local branch_spec_file=""
  # P1255: set when the spec carries `disclosure: embargo`. Suppresses the spec
  # seed, the spec-close git mv, and Phase 3 teardown — the branch and worktree
  # must survive so the spec stays branch-born until `publish-spec` runs.
  local ship_embargoed=0
  if (( journal_exists == 0 )); then
    # Resolve the spec FIRST (it has no branch dependency) so the no-branch
    # closure path can reuse it. resolve_ship_branch now returns "" on zero
    # matches instead of dying (P920), letting us distinguish:
    #   - no branch + spec on main + pN stamp  → direct-to-main closure
    #   - no branch + no resolvable spec         → original "no branch" error
    # Statement-level `|| fallback` (not `="$(… || true)"`): bash 3.2 trips set -e
    # on a bare assignment whose command substitution exits non-zero, even with an
    # inline `|| true`. resolve_ship_spec die's when no spec is found — that's the
    # "no spec" signal here, not an error. See git-ops.sh:251 for the same gotcha.
    local spec_file_attempt=""
    spec_file_attempt="$(resolve_ship_spec "$pn" 2>/dev/null)" || spec_file_attempt=""
    branch="$(resolve_ship_branch "$pn")"
    if [[ -z "$branch" ]]; then
      # ===== No-branch direct-to-main closure path (P920) =====
      if [[ -z "$spec_file_attempt" ]]; then
        # No branch AND no resolvable spec — preserve the original diagnostic
        # (a genuinely missing branch, e.g. a typo'd P-number).
        die "ship: no feature/${pn}-* or fix/${pn}-* branch found"
      fi
      spec_file="$spec_file_attempt"

      # --- Detection (must confirm the IMPLEMENTATION is on main, not just the
      #     spec). Two independent gates, BOTH required:
      #   (1) closure gate: scripts/ship-gates.sh (completion criteria + review)
      #   (2) code-presence gate: a 'pN ready for QA' stamp commit on main
      # Neither alone is sufficient; together they make a spurious close
      # implausible. See spec Decision B + Security Review.
      #
      # P1246 REPLACED gate (1). It used to read the spec's `status:` field and
      # require qa|in-progress. Three things were wrong with that:
      #
      #   a. It violated .claude/rules/features.md outright — "no skill, script
      #      or hook may gate a merge, a close or a deploy on this field" — and
      #      this was the last remaining violation in the codebase.
      #   b. `status:` is a self-reported label written by the same agent that
      #      wants the close. It attests to nothing. ship-gates.sh gate 2.5
      #      already stopped consulting it for exactly this reason (P1169), and
      #      its own comment says so: "It now reads the artifact instead of the
      #      label."
      #   c. It produced false REFUSALS as well as false passes. The P1113 case:
      #      a spec whose frontmatter reads `status: done` with the work genuinely
      #      on main hit the `*)` arm and died, because "done" is not in the
      #      allowed pair — a spec could be too finished to close.
      #
      # What replaces it is strictly stronger: every completion checkbox ticked,
      # an implementation recorded in pipeline_ran, and a code-review artifact
      # naming this P-number. Those are artifacts, not labels.
      ship_run_gates "$pn" "$want_override"

      # Code-presence gate (Decision B, option iii) — HARDENED after the P920
      # adversarial review. A bare message grep (`git log --grep`) matched commits
      # that do NOT represent landed pN implementation:
      #   - a sibling spec's stamp that mentions pN only in its BODY (--all-match
      #     matches anywhere in the message, not the same token) → wrong-close of pN
      #     off pM's stamp;
      #   - `git revert` commits whose auto-message quotes the stamp subject.
      # So scan candidates and require one whose SUBJECT carries BOTH pN and
      # 'ready for QA' and is not a revert. (-i / nocasematch tolerate an
      # uppercase-P outlier; \b in the outer grep avoids the pN0 prefix match;
      # the subject re-check uses portable [^a-z0-9] boundaries.)
      # RESIDUAL (documented, see spec): a message grep cannot prove code is
      # present AT HEAD — an impl committed directly to main and later reverted
      # still leaves a qualifying subject in history. The status gate is the
      # second layer; a wrong close is bounded, reversible metadata (one spec).
      local _stamp_ok="" _cand _subj
      while IFS= read -r _cand; do
        [[ -z "$_cand" ]] && continue
        _subj="$( cd "$REPO_ROOT" && git log -1 --format='%s' "$_cand" 2>/dev/null || true )"
        [[ "$_subj" == Revert\ * ]] && continue
        shopt -s nocasematch
        if [[ "$_subj" =~ (^|[^a-z0-9])${pn}([^a-z0-9]|$) && "$_subj" == *"ready for qa"* ]]; then
          _stamp_ok="$_cand"
        fi
        shopt -u nocasematch
        [[ -n "$_stamp_ok" ]] && break
      done < <( cd "$REPO_ROOT" && git log main -i --grep="\\b${pn}\\b" --grep="ready for QA" --all-match --format='%H' 2>/dev/null || true )
      if [[ -z "$_stamp_ok" ]]; then
        # The recovery is named here on purpose. This refusal has now fired on four
        # separate emitters (P920 design, P1185 inline-on-main, P1205), and each time
        # the recipe had to be re-derived from the error. On 2026-09-01 that produced
        # a `git commit --amend` on the SHARED main checkout — a history rewrite where
        # a second stamp commit was the safe move. Naming the safe path removes the
        # need to invent one. Do NOT "fix" this by auto-stamping in commit-to-main:
        # a bare pN match was explicitly rejected when P920 was designed, because spec
        # edits and cross-references carry pN tokens too, so auto-stamping trades a
        # loud recoverable refusal for a SILENT false close of work that never landed.
        die "ship: spec $pn is on main but no qualifying '$pn ready for QA' stamp commit found (a non-revert commit whose SUBJECT carries '$pn' and 'ready for QA') — its implementation may be on an unmerged or deleted branch, reverted, or incomplete.
  If the implementation IS on main under a non-stamp subject, record it with a stamp commit — do not amend history on the shared checkout:
    ./scripts/git-ops.sh commit-to-main --message \"chore: $pn ready for QA — <title>\" --files <a file you actually changed>
  Then re-run: ./scripts/git-ops.sh ship $pn"
      fi

      # --- Closure (Decisions C + D). Acquire the main lock exactly once HERE
      #     (this arm returns before the normal path's acquire, so there is no
      #     outer lock and no self-deadlock — never call cmd_commit_to_main).
      local timeout="${GIT_OPS_MAIN_LOCK_TIMEOUT:-120}"
      if ! acquire_main_lock "$timeout"; then
        exit 1
      fi
      trap 'release_main_lock' EXIT

      # Ensure HEAD is main before any mv/commit (mirror the normal-path block).
      local current_branch
      current_branch="$( cd "$REPO_ROOT" && git rev-parse --abbrev-ref HEAD )"
      if [[ "$current_branch" != "main" ]]; then
        ( cd "$REPO_ROOT" && git checkout -q main ) || die "ship: failed to checkout main"
      fi

      # Op-in-progress assertion (Decision D — mirrors cmd_commit_to_main). HEAD
      # is guaranteed main by the checkout above; refuse if a co-tenant started a
      # cherry-pick/rebase/merge we'd otherwise commit into.
      local _gitdir
      _gitdir="$( cd "$REPO_ROOT" && git rev-parse --absolute-git-dir )"
      if [[ -e "$_gitdir/CHERRY_PICK_HEAD" || -e "$_gitdir/rebase-merge" || \
            -e "$_gitdir/rebase-apply" || -e "$_gitdir/MERGE_HEAD" ]]; then
        die "ship: operation in progress — refusing closure commit inside a cherry-pick, rebase, or merge started by another session"
      fi

      # Test-only knob: widen the post-lock race window so a canary can create a
      # branch / switch HEAD between lock-acquire and the re-verification below.
      # Unset in prod (mirrors SHIP_DEBUG_SLEEP_SECS on the normal path).
      if [[ -n "${SHIP_DEBUG_NOBRANCH_SLEEP_SECS:-}" ]]; then
        sleep "${SHIP_DEBUG_NOBRANCH_SLEEP_SECS}"
      fi

      # Post-acquire re-verification (P920 adversarial review). The four no-branch
      # preconditions were checked PRE-lock; a co-tenant can invalidate them in the
      # window, and the racing operations (`git-ops claim`, `switch-safe`) take no
      # main.lock, so the lock alone cannot serialize against them. Mirror the normal
      # path's post-acquire race guard: convert silent corruption into a safe die.
      local _recheck_branch
      _recheck_branch="$(resolve_ship_branch "$pn")"
      if [[ -n "$_recheck_branch" ]]; then
        die "ship: a branch ($_recheck_branch) for $pn appeared after the no-branch decision (a co-tenant may have run /dev) — re-run 'git-ops ship $pn' to take the normal branch path."
      fi
      if [[ ! -f "$REPO_ROOT/$spec_file" ]]; then
        die "ship: spec $spec_file is no longer in features/ — a co-tenant may have already closed $pn. Nothing to do."
      fi
      # Strict HEAD assertion adjacent to the mutation: a co-tenant `switch-safe`/
      # `git checkout` takes no lock, so the earlier HEAD read can be stale by now.
      local _head_now
      _head_now="$( cd "$REPO_ROOT" && git symbolic-ref --short -q HEAD || true )"
      [[ "$_head_now" == "main" ]] || die "ship: HEAD is '$_head_now', not main (a co-tenant switched the shared checkout) — aborting closure to avoid committing on the wrong branch."

      # Discard uncommitted kanban edits to the spec before git mv (mirror the
      # normal path) — kanban writes locked_at/status/rank without committing,
      # which would otherwise block git mv on this file.
      # Unstaged only, index untouched — same narrowing and same reasoning as the
      # pre-cherry-pick block (P1094 item 2). This site is the sibling of that
      # one; leaving it on the old predicate would keep a known-defective copy of
      # the same step alive for whichever path reaches it first.
      local spec_pattern="features/${pn}_*.md"
      if git -C "$REPO_ROOT" diff --quiet -- "$spec_pattern" 2>/dev/null; then
        : # no UNSTAGED edits — anything staged is deliberate and never ours to revert
      else
        echo "ship: discarding uncommitted kanban edits to $spec_pattern before closure:" >&2
        git -C "$REPO_ROOT" diff --stat -- "$spec_pattern" >&2 || true
        git -C "$REPO_ROOT" checkout -- "$spec_pattern" 2>/dev/null || true
      fi

      # Close the spec (mirror Phase 2 structurally: git mv → rewrite → commit).
      local sprint_dir spec_base spec_dest
      sprint_dir="$(resolve_ship_sprint_dir)"
      mkdir -p "$REPO_ROOT/$sprint_dir"
      spec_base="$(basename "$spec_file")"
      spec_dest="${sprint_dir}/${spec_base}"
      ( cd "$REPO_ROOT" && git mv "$spec_file" "$spec_dest" ) || die "ship: git mv failed (no-branch closure)"
      # Same move, same depth change, same dead links (P1094 item 1).
      if ! ship_rebase_doc_links "$REPO_ROOT" "$spec_file" "$spec_dest"; then
        ( cd "$REPO_ROOT" && git reset -q HEAD -- "$spec_dest" "$spec_file" 2>/dev/null ) || true
        die "ship: doc-link re-base failed (no-branch closure) — unstaged the partial rename; spec is at $spec_dest in the working tree. Recover with 'git mv $spec_dest $spec_file' then re-run ship after resolving the cause."
      fi
      # On any failure AFTER git mv, unstage the partial rename before dying so it
      # cannot be swept into a co-tenant's plain `git commit` (git.md: the #1 cause
      # of wrong-files-in-wrong-commit in a shared index). The working-tree move
      # remains; the operator recovers with the printed `git mv` command.
      if ! ship_rewrite_frontmatter "$REPO_ROOT/$spec_dest"; then
        ( cd "$REPO_ROOT" && git reset -q HEAD -- "$spec_dest" "$spec_file" 2>/dev/null ) || true
        die "ship: frontmatter rewrite failed (no-branch closure) — unstaged the partial rename; spec is at $spec_dest in the working tree. Recover with 'git mv $spec_dest $spec_file' then re-run ship after resolving the cause."
      fi
      ( cd "$REPO_ROOT" && git add -- "$spec_dest" ) >/dev/null
      local title
      title="$(ship_extract_title "$REPO_ROOT/$spec_dest")"
      [[ -z "$title" ]] && title="close $pn"
      # Include $spec_file so the git mv source deletion is committed too.
      # commit_staged_exact: plain commit, guarded — safe under acquire_main_lock
      # (held for this whole block); see its own comment for why.
      if ! commit_staged_exact "$(ship_close_message "chore: close $pn (direct-to-main) — $title")" "$spec_dest" "$spec_file"; then
        ( cd "$REPO_ROOT" && git reset -q HEAD -- "$spec_dest" "$spec_file" 2>/dev/null ) || true
        die "ship: spec-close commit failed (no-branch closure) — unstaged the partial rename; spec is at $spec_dest in the working tree. Recover with 'git mv $spec_dest $spec_file' then re-run ship after resolving the cause."
      fi

      echo "ship: no branch — closing $pn directly on main ($sprint_dir)"
      # Capture the snapshot BEFORE releasing the lock: after the release a co-tenant
      # can commit, and the SHA printed in the guidance below must be the one this
      # ship verified, not whatever main has drifted to by the time a human reads it.
      local _hop_sha_nobranch
      _hop_sha_nobranch="$( cd "$REPO_ROOT" && git rev-parse HEAD )"
      release_main_lock
      trap - EXIT
      # P919 D4: the closure commit (P920 no-branch path) is main-bound too — staging hop applies.
      print_staging_hop "$pn" "$_hop_sha_nobranch"
      echo "Ready to push."
      return
    fi
    if [[ -z "$spec_file_attempt" ]]; then
      # Spec not found on main. Check if it lives on the branch (branch-born).
      # If so, defer spec resolution + journal init to after the lock; the seed
      # block will commit the creation blob and then re-run resolve+init.
      branch_spec_file="$( cd "$REPO_ROOT" && \
        git ls-tree -r --name-only "$branch" -- features 2>/dev/null \
        | grep -E "/${pn}_[^/]*\.md$" | grep -vE '/(done|archive|uat)/' | head -1 )" || branch_spec_file=""
      if [[ -n "$branch_spec_file" ]]; then
        need_seed=1
        # spec_file and journal init deferred to post-lock seed block below.
      else
        # Branch exists but neither main nor the branch has the spec — let
        # resolve_ship_spec emit its standard diagnostic (branch-born message).
        spec_file="$(resolve_ship_spec "$pn")"
        ship_init_journal "$pn" "$branch" "$spec_file"
      fi
    else
      spec_file="$(resolve_ship_spec "$pn")"
      ship_init_journal "$pn" "$branch" "$spec_file"
    fi
  else
    ship_verify_landed_shas "$pn"
    branch="$(ship_journal_str "$pn" "source_branch")"
    spec_file="$(ship_journal_str "$pn" "spec_file")"
    [[ -n "$branch" ]] || die "ship: journal $journal missing source_branch"
    [[ -n "$spec_file" ]] || die "ship: journal $journal missing spec_file"
  fi

  # --- Closure gate, normal branch route (P1246) ----------------------------
  # Runs here: after branch+spec are resolved, BEFORE the first cherry-pick and
  # before the main lock is taken. Everything above this line is read-only, so a
  # refusal leaves the repo exactly as it found it — no half-landed picks, no
  # stranded lock, no journal to clean up by hand.
  #
  # Skipped on a --resume whose spec has ALREADY LEFT features/. That is not a
  # hole: this gate protects the open->closed TRANSITION, and once the spec has
  # moved, that transition has already happened. Re-gating then can only strand a
  # converging ship — the spec now lives in features/done/, where gate 2.5
  # deliberately does not look, so it reports "spec not found" and FAILS a ship
  # that is 90% landed. A resume whose spec is still in features/ is gated
  # normally: the mutation it protects is still ahead of it.
  #
  # TWO conditions, not one, and the second was found the hard way. An earlier
  # version of this block tested only the journal's spec_closed flag and was a
  # live false positive: canary QQ (P1094 item 2) crashes a ship in the window
  # between Phase 2's `git mv` and the flag write, then resumes. The spec is
  # gone from features/, the flag is not yet set, and the gate hard-failed a
  # recovery path whose whole purpose is surviving that crash. Caught only by
  # running the suite's existing workflows against the new gate — epistemic.md
  # gate 7c.
  #
  # THE SECOND CONDITION MUST BE AN ON-DISK FACT, NOT A JOURNAL CLAIM. Its first
  # form asked "is the journal's spec_file absent from features/?" — which an
  # adversarial review defeated in one step, verified end-to-end 2026-09-08:
  #
  #   .ship-journal/pN.json is a plain unauthenticated file with a documented
  #   schema. Write one naming a spec_file that never existed, run `ship pN
  #   --resume`, and the "moved but unflagged" arm fires, the closure gate is
  #   never called, and Phase 1 cherry-picks every commit in the journal's
  #   `commits` array onto main. Measured: payload.txt from an unreviewed branch
  #   landed on main with a deliberately-unticked spec and zero GATE lines in the
  #   output. Phase 2 then died on the bogus path, so the SPEC stayed open — but
  #   the CODE was already merged, ungated. That is the exact failure class this
  #   spec exists to close, reached through the closing code it added.
  #
  # The fix is to ask the filesystem, not the journal: a spec has "already left
  # features/" only if a closed copy is actually sitting in features/done/. That
  # is true in the genuine P1094 crash window (Phase 2 git-mv'd it there before
  # the crash) and false for any forged journal, because a forger would have to
  # produce the closed artifact itself — at which point the close has happened.
  _gate_skip=0
  if (( journal_exists == 1 )); then
    if ship_journal_flag "$pn" "spec_closed"; then
      _gate_skip=1
    elif ( cd "$REPO_ROOT" && ls features/done/*/"${pn}"_*.md >/dev/null 2>&1 ); then
      # Genuinely moved but unflagged — the P1094 crash window.
      _gate_skip=1
    fi
  fi
  if (( _gate_skip == 1 )); then
    echo "ship: closure gate skipped — $pn's spec has already left features/ (resuming a partially-landed ship)." >&2
  else
    local _fresh_journal=""
    (( journal_exists == 0 )) && _fresh_journal="$journal"
    ship_run_gates "$pn" "$want_override" "$_fresh_journal"
  fi

  # Guard: refuse if branch touches git-ops.sh itself.
  # Bash parses function bodies at script load; cherry-picks that land a new version
  # on disk are invisible to the running process. Ship git-ops.sh fixes via
  # commit-to-main first, then rebase the feature branch and re-ship.
  if ( cd "$REPO_ROOT" && git log --oneline "$branch" "^main" -- scripts/git-ops.sh 2>/dev/null | grep -q . ); then
    # On a fresh run the journal was just created — remove it so refusal leaves no stale state.
    # On --resume the journal pre-existed; leave it for the user to resolve.
    (( journal_exists == 0 )) && rm -f "$SHIP_JOURNAL_DIR/${pn}.json"
    die "ship: branch modifies scripts/git-ops.sh — commit that change to main via commit-to-main first, rebase $branch onto main, then re-ship"
  fi

  # Guard: refuse if main has an untracked spec file that the cherry-pick would
  # try to create. /create-bug leaves the spec untracked on main until ship
  # commits it; cherry-pick refuses to overwrite untracked files, producing a
  # cryptic "conflict or unresolved state" error with no filename.
  # Scope: features/${pn}_*.md only (the most common case — other untracked
  # collisions fall through to the improved diagnostic from Fix 1).
  # pathspec quoted to suppress shell glob expansion; pn validated ^p[0-9]+$ above.
  local untracked_specs
  untracked_specs="$( cd "$REPO_ROOT" && git ls-files --others --exclude-standard \
    -- "features/${pn}_*.md" 2>/dev/null )"
  if [[ -n "$untracked_specs" ]]; then
    # Fresh run: journal was just created — remove it so refusal leaves no stale state.
    # Resume run: journal pre-existed — preserve it so the user can retry after cleanup.
    (( journal_exists == 0 )) && rm -f "$SHIP_JOURNAL_DIR/${pn}.json"
    # Check if the untracked file exists on the feature branch. If so, it will
    # arrive via cherry-pick — give the agent the exact rm command to unblock.
    local first_untracked rm_targets
    first_untracked="$(echo "$untracked_specs" | head -1)"
    rm_targets="$(echo "$untracked_specs" | tr '\n' ' ' | sed 's/ $//')"
    if git show "${branch}:${first_untracked}" >/dev/null 2>&1; then
      die "ship: untracked spec file(s) in main working tree would block cherry-pick:
  $untracked_specs
These files exist on the feature branch and will arrive via cherry-pick.
Fix: rm ${rm_targets}; re-run ship."
    else
      die "ship: untracked spec file(s) in main working tree would block cherry-pick:
  $untracked_specs
Remove or commit them first, then re-ship."
    fi
  fi

  # Guard (P878): untracked migration copies in main. The worktree migration flow
  # (worktree-setup.md "Supabase CLI not linked in worktrees") copies a new migration
  # to the main repo to run migrate.sh; left behind, cherry-pick refuses to overwrite
  # the untracked file with the same cryptic no-filename error as the spec case above.
  # Scope: only migration paths the BRANCH itself adds (git diff main...branch) —
  # a co-tenant's stray that this ship's commits don't touch must not block this ship.
  # Byte-identical copy: auto-remove (the cherry-pick immediately restores the same
  # bytes, so removal is safe by construction). Diverged copy: die, human decides.
  local mig untracked_mig_identical="" untracked_mig_diverged=""
  while IFS= read -r mig; do
    [[ -z "$mig" ]] && continue
    if [[ -f "$REPO_ROOT/$mig" ]] && \
       ! ( cd "$REPO_ROOT" && git ls-files --error-unmatch -- "$mig" >/dev/null 2>&1 ); then
      if ( cd "$REPO_ROOT" && git show "${branch}:${mig}" 2>/dev/null | cmp -s - "$REPO_ROOT/$mig" ); then
        rm "$REPO_ROOT/$mig"
        untracked_mig_identical+="  $mig"$'\n'
      else
        untracked_mig_diverged+="  $mig"$'\n'
      fi
    fi
  done < <( cd "$REPO_ROOT" && git diff --name-only "main...${branch}" -- 'supabase/migrations/*.sql' 2>/dev/null )
  if [[ -n "$untracked_mig_identical" ]]; then
    echo "ship: auto-removed untracked migration copy(ies) byte-identical to the branch version (worktree migrate-flow leftover; cherry-pick restores them):" >&2
    printf '%s' "$untracked_mig_identical" >&2
  fi
  if [[ -n "$untracked_mig_diverged" ]]; then
    (( journal_exists == 0 )) && rm -f "$SHIP_JOURNAL_DIR/${pn}.json"
    die "ship: untracked migration(s) in main working tree DIFFER from the branch version:
$untracked_mig_diverged
The branch is authoritative for shipped migrations. Compare each file with
'git show ${branch}:FILE', keep the right content, rm the untracked copy, re-ship."
  fi

  # Detect co-located specs — other P-number specs EDITED by this branch's
  # commits. Specs the branch only FILED (created, never on main) are excluded
  # (P1105) and named separately below.
  #
  # P1250: these are REPORTED, never closed. Editing a spec is not delivering
  # it — the predicate cannot tell "I implemented this" from "I fixed a link in
  # this on my way past". Audited 2026-09-07 (docs/process-learnings.md): of the
  # 17 specs it ever closed this way, 11 were NOT delivered — 6 of those had
  # already been reopened by hand, one commit reading "reopen — ship closed a
  # live bug spec as a side effect". A spec wrongly left OPEN is visible and
  # gets closed;
  # a spec wrongly marked DONE is invisible forever. P1162 sat closed with 0 of
  # 7 items ticked until P1237 went looking for the thing it claimed to have
  # built and found nothing.
  local cospecs cospecs_filed=""
  if ! cospecs="$(detect_cospecs "$pn" "$branch")"; then
    cospecs=""
    echo "ship: co-located spec detection on branch ${branch} could not resolve the commit range — no co-located specs will be listed. Review by hand." >&2
  else
    cospecs_filed="$(detect_filed_cospecs "$pn" "$branch" || true)"
  fi
  if [[ -n "$cospecs" ]]; then
    # Announce here, BEFORE the cherry-picks, as well as in the Phase 2b report.
    # Phase 2b runs after the primary close, so a ship that dies on a cherry-pick
    # conflict would otherwise print nothing at all about co-located specs — and an
    # aborted ship is exactly when a human is reading this output most closely.
    echo "ship: specs edited by ${branch}, none will be auto-closed: $(echo "$cospecs" | tr '\n' ' ')" >&2
  fi
  if [[ -n "$cospecs_filed" ]]; then
    echo "ship: specs filed (not delivered) on branch ${branch}: $(echo "$cospecs_filed" | tr '\n' ' ') — left untouched, not auto-closed." >&2
  fi

  local timeout="${GIT_OPS_MAIN_LOCK_TIMEOUT:-120}"
  if ! acquire_main_lock "$timeout"; then
    exit 1
  fi
  # Releases the lock AND, on a non-zero exit, reports the stranded branch and
  # worktree that Phase 3 never got to clean up (canary VV).
  #
  # The values are hoisted to SCRIPT scope, and the trap body defaults them,
  # for one specific reason: on SIGINT bash unwinds the function frame BEFORE
  # running the EXIT trap. A trap body referencing cmd_ship's `local` pn/branch
  # then expands an unset variable, and under `set -u` that aborts the trap
  # BEFORE its first statement — so the lock would never be released and every
  # later ship would block for the full timeout and then refuse. SIGTERM does
  # not reproduce this; SIGINT (a plain Ctrl-C) does. Canary WW pins it.
  SHIP_ABORT_PN="$pn"
  SHIP_ABORT_BRANCH="$branch"
  trap 'ship_on_abort "${SHIP_ABORT_PN:-}" "${SHIP_ABORT_BRANCH:-}"' EXIT

  # Post-acquire race guard: another session holding the same P-number may have
  # completed (deleting the branch) between our pre-check and lock acquire. If
  # the branch is gone but our journal still expects to pick its commits,
  # abort cleanly — main already has everything this session would have added.
  # Also clear the (now-stale) journal so future ship attempts aren't poisoned.
  if ! ship_journal_flag "$pn" "branch_deleted" && \
     ! ( cd "$REPO_ROOT" && git rev-parse --verify "$branch" >/dev/null 2>&1 ); then
    rm -f "$journal"
    die "ship: branch $branch no longer exists — another session may have already shipped this P-number"
  fi

  # Ensure we are on main for cherry-pick + commit operations.
  local current_branch
  current_branch="$( cd "$REPO_ROOT" && git rev-parse --abbrev-ref HEAD )"
  if [[ "$current_branch" != "main" ]]; then
    ( cd "$REPO_ROOT" && git checkout -q main ) || die "ship: failed to checkout main"
  fi

  # Layer 1 (plan v2 seed-to-match): if spec was born on the branch (not on main
  # when ship started), commit the creation blob now — inside the lock, HEAD==main.
  # Seeding the creation blob makes the creation cherry-pick identical-AA on both
  # sides → git auto-resolves it, benign arm skips, subsequent edit picks apply
  # cleanly. Common path (spec already on main): need_seed=0, this block is a no-op.
  # P1255: an embargoed spec must NOT be seeded onto main. Seeding is what
  # publishes a branch-born spec, and publication is deferred until the fix is
  # confirmed live on prod (`git-ops.sh publish-spec pN`). The code cherry-picks
  # above have already run — R1: this gates PUBLICATION, never the merge.
  # Gating the merge would deadlock against ship.md:66, which mandates
  # merge-first-then-migrate, so the prod stamp a pre-merge gate waits for cannot
  # exist until after the merge it blocks.
  local _disc_spec="${branch_spec_file:-$spec_file}"
  if [[ "$(ship_spec_disclosure "$branch" "$_disc_spec")" == "embargo" ]]; then
    ship_embargoed=1
    need_seed=0
    echo "ship: $pn is disclosure: embargo — spec withheld from main (code merges normally)." >&2
  fi

  if (( need_seed == 1 )); then
    # Op-in-progress guard (mirror cmd_commit_to_main L999).
    local _gitdir_seed
    _gitdir_seed="$( cd "$REPO_ROOT" && git rev-parse --absolute-git-dir )"
    if [[ -e "$_gitdir_seed/CHERRY_PICK_HEAD" || -e "$_gitdir_seed/rebase-merge" || \
          -e "$_gitdir_seed/rebase-apply" || -e "$_gitdir_seed/MERGE_HEAD" ]]; then
      die "ship: operation in progress — refusing branch-born seed commit inside a cherry-pick, rebase, or merge started by another session"
    fi
    # Strict HEAD assertion adjacent to the mutation (mirror L1677 in no-branch path).
    local _head_seed
    _head_seed="$( cd "$REPO_ROOT" && git symbolic-ref --short -q HEAD || true )"
    [[ "$_head_seed" == "main" ]] || \
      die "ship: HEAD is '$_head_seed', not main (co-tenant switched the checkout) — aborting branch-born seed"
    local _creation_blob
    _creation_blob="$(ship_spec_creation_blob "$branch" "$branch_spec_file")" || \
      die "ship: cannot find creation commit for $branch_spec_file on $branch (seed-to-match failed)"
    printf '%s' "$_creation_blob" > "$REPO_ROOT/$branch_spec_file"
    ( cd "$REPO_ROOT" && git add -- "$branch_spec_file" ) >/dev/null
    # commit_staged_exact: plain commit, guarded — safe under acquire_main_lock
    # (held for this whole block); see its own comment for why.
    commit_staged_exact "seed ${pn} spec for ship (creation blob)" "$branch_spec_file" >/dev/null || \
      die "ship: branch-born seed commit failed"
    echo "ship: branch-born spec $branch_spec_file seeded on main (creation blob — cherry-picks will replay cleanly)" >&2
    spec_file="$(resolve_ship_spec "$pn")"
    ship_init_journal "$pn" "$branch" "$spec_file"
  fi

  # Discard any uncommitted/staged kanban-written changes to this feature's spec file.
  # Kanban writes locked_at/status/rank without committing (unstaged); on folder-move
  # status changes it also git-adds (staged). Both block cherry-pick if the commit
  # touches the same file. Cherry-picks carry the correct spec state, so it's safe to
  # discard the kanban delta here — but emit the diff first so it's recoverable via reflog.
  #
  # P1082: never discard while a cherry-pick is paused (CHERRY_PICK_HEAD present).
  # A --resume issued right after the operator resolves+stages a real conflict on
  # this exact spec_pattern is indistinguishable from stray kanban noise by
  # `diff-index` alone — both show a real diff against HEAD. Gating on
  # CHERRY_PICK_HEAD trades "kanban noise staged during a legitimately paused pick
  # rides into the --continue commit" (frontmatter noise on main, harmless) for
  # "never silently destroy an operator's staged conflict resolution" (data loss).
  #
  # P1094 item 2: the CHERRY_PICK_HEAD gate above closed ONE window. It left the
  # next one open — once Phase 1 has fully landed, that sentinel is gone, so a
  # --resume fell through to the branch below and reverted the Phase 2 rename
  # THIS SAME RUN had staged moments earlier: the pathspec matches the rename's
  # staged source deletion (it does not match the nested destination), so
  # `git checkout --` resurrected the old path and `git mv` then died
  # "destination exists". The operator's recovery destroyed the work.
  #
  # Fixed by provenance rather than by naming a third window — enumerating
  # windows is what produced the recurrence, and any future phase added between
  # the pick loop and the final commit would open a fourth. The index IS the
  # provenance: anything staged got there by a deliberate act (an operator's
  # conflict resolution, this run's own Phase 2 rename). So this step now
  # discards ONLY unstaged working-tree noise and NEVER touches the index —
  # note the `git reset HEAD` is gone, and the predicate is `git diff` (working
  # tree vs index), not `diff-index HEAD` (which also sees staged content).
  #
  # The CHERRY_PICK_HEAD gate stays and is not redundant: mid-pick, an UNSTAGED
  # working-tree edit to the spec is the operator's in-progress resolution, and
  # only that gate protects it.
  local spec_pattern="features/${pn}_*.md"
  local _gitdir_discard
  _gitdir_discard="$( cd "$REPO_ROOT" && git rev-parse --absolute-git-dir )"
  if [[ -e "$_gitdir_discard/CHERRY_PICK_HEAD" ]]; then
    : # a resume is converging a paused pick — never discard resolution content
  elif git -C "$REPO_ROOT" diff --quiet -- "$spec_pattern" 2>/dev/null; then
    : # no UNSTAGED edits — anything staged is deliberate and never ours to revert
  else
    echo "ship: discarding uncommitted kanban edits to $spec_pattern before cherry-pick:" >&2
    git -C "$REPO_ROOT" diff --stat -- "$spec_pattern" >&2 || true
    git -C "$REPO_ROOT" checkout -- "$spec_pattern" 2>/dev/null || true
  fi

  # Phase 1: cherry-pick pending commits (idempotent — reads journal, only picks
  # entries with landed_sha=null).
  local pending sha landed
  pending="$(ship_pending_source_shas "$journal")"
  local cherry_out cherry_rc
  while IFS= read -r sha; do
    [[ -z "$sha" ]] && continue
    # P2 (plan v2): per-iteration op-in-progress guard. Mirror cmd_commit_to_main
    # L999 but exclude self: CHERRY_PICK_HEAD == $sha is OUR in-progress pick
    # (resume). Only die on a FOREIGN CHERRY_PICK_HEAD or any rebase/merge.
    # A pre-loop "any CHERRY_PICK_HEAD" guard blocks legitimate --resume (v1 bug).
    local _gitdir_iter
    _gitdir_iter="$( cd "$REPO_ROOT" && git rev-parse --absolute-git-dir )"
    if [[ -e "$_gitdir_iter/rebase-merge" || -e "$_gitdir_iter/rebase-apply" || \
          -e "$_gitdir_iter/MERGE_HEAD" ]]; then
      {
        echo "ship: aborting before cherry-pick $sha — rebase or merge in progress (started by another session)"
        echo "Resolve or abort the co-tenant operation, then run 'git-ops ship $pn --resume'."
      } >&2
      exit 1
    fi
    local _resume_continue=0
    if [[ -e "$_gitdir_iter/CHERRY_PICK_HEAD" ]]; then
      local _cur_cph _sha_full
      _cur_cph="$( cat "$_gitdir_iter/CHERRY_PICK_HEAD" 2>/dev/null | tr -d '[:space:]' || true )"
      _sha_full="$( cd "$REPO_ROOT" && git rev-parse "$sha" 2>/dev/null || true )"
      if [[ -n "$_cur_cph" && "$_cur_cph" != "$_sha_full" ]]; then
        {
          echo "ship: aborting before cherry-pick $sha — CHERRY_PICK_HEAD exists for a different commit ($_cur_cph)"
          echo "Resolve or abort the co-tenant cherry-pick, then run 'git-ops ship $pn --resume'."
        } >&2
        exit 1
      elif [[ -n "$_cur_cph" && "$_cur_cph" == "$_sha_full" ]]; then
        # Our own pick of $sha is paused mid-conflict: a prior run conflicted on
        # this commit and CHERRY_PICK_HEAD still points at it (whether or not the
        # operator manually ran `git cherry-pick --continue`). Continue the
        # paused pick — NEVER start a fresh `git cherry-pick $sha`, which git
        # rejects ("cherry-pick is already in progress" / "your local changes
        # would be overwritten") and which loops the journal forever. P972.
        _resume_continue=1
      fi
    fi
    # Crash-window detect-and-refuse (P972 finding #1): if a prior attempt of $sha
    # committed via --continue but was killed before ship_record_landed wrote the
    # journal, CHERRY_PICK_HEAD is now clear and the journal still says pending. A
    # fresh pick would re-conflict (the operator's resolution differs from $sha's
    # tree, so git can't report "already applied") and loop with a confusing
    # conflict diagnostic. We detect the likely-landed commit (immediate child of
    # pre_pick_head with $sha's author identity) and STOP with a precise
    # diagnostic — we do NOT auto-record it. Author identity is forgeable by any
    # same-source cherry-pick and the operator's resolution can mean anything, so
    # a metadata match is not proof the change is on main; silently recording +
    # deleting the branch risked unrecoverable data loss (adversarial-review
    # round 2, HIGH). The operator confirms, then marks the journal (or resolves).
    # Only when NOT mid-pick (CHERRY_PICK_HEAD absent → _resume_continue==0).
    if (( _resume_continue == 0 )); then
      local _pre_head _candidate
      _pre_head="$( ship_journal_pre_pick "$pn" "$sha" )"
      if [[ -n "$_pre_head" ]]; then
        _candidate="$( ship_find_landed_pick "$_pre_head" "$sha" )"
        if [[ -n "$_candidate" ]]; then
          # Diagnostic stays free of redirect-parseable tokens (no '>' '<' '|'),
          # per .claude/rules/shell-safety.md — so a stream-reversed caller can
          # never re-lex it. Framing is deliberately NON-committal: the candidate
          # is only an author-identity match (forgeable by any same-source pick —
          # e.g. a co-tenant cherry-pick after an operator --skip), NOT confirmed
          # to contain $sha's change. The operator MUST verify before marking; we
          # do not pre-assert a landing (adversarial-review round 3, MEDIUM).
          {
            echo "ship: cherry-pick $sha did not apply, and the journal still lists it pending."
            echo "  A commit on main matches $sha's author identity (email + author-date + subject):"
            echo "      $_candidate"
            echo "  It is the immediate child of pre-pick HEAD $_pre_head. This MIGHT be a prior"
            echo "  'git cherry-pick --continue' of $sha that committed before the journal recorded it"
            echo "  (the P972 crash window) — but an author-identity match is NOT proof it carries your"
            echo "  change. A co-tenant cherry-pick of the same source after a --skip looks identical."
            echo "  ship will NOT auto-record it. You decide:"
            echo ""
            echo "  1. VERIFY FIRST, then record. Inspect the candidate:"
            echo "       git -C \"$REPO_ROOT\" show $_candidate"
            echo "     Only if it genuinely carries $sha's intended change, record + re-resume:"
            echo "       ./scripts/git-ops.sh ship $pn --mark-landed $sha $_candidate"
            echo "       ./scripts/git-ops.sh ship $pn --resume"
            echo "  2. If it does NOT carry your change (or $sha was --skip/--abort'd and never landed),"
            echo "     re-pick $sha fresh, resolve, --continue, then re-resume:"
            echo "       git -C \"$REPO_ROOT\" cherry-pick $sha"
          } >&2
          exit 1
        fi
      fi
    fi
    # Record the pre-pick HEAD so the recovery path above can fire if THIS attempt
    # commits but crashes before the landed_sha write. HEAD is the pick's parent
    # in both the fresh and --continue (paused) cases.
    ship_record_pre_pick "$pn" "$sha" "$( cd "$REPO_ROOT" && git rev-parse HEAD )"
    set +e
    if (( _resume_continue == 1 )); then
      # --no-edit reuses the original commit message (no interactive editor).
      # If the resolution is net-empty vs main, --continue exits non-zero with
      # "previous cherry-pick is now empty" — the benign-already-applied arm
      # below catches that and --skips. Genuinely-unresolved conflicts (unmerged
      # paths still present) also fail here and fall through to the diagnostic.
      cherry_out=$( cd "$REPO_ROOT" && git cherry-pick --continue --no-edit 2>&1 )
      cherry_rc=$?
    else
      cherry_out=$( cd "$REPO_ROOT" && git cherry-pick "$sha" 2>&1 )
      cherry_rc=$?
    fi
    set -e
    if (( cherry_rc != 0 )); then
      # Cherry-pick failed. Distinguish "already applied / redundant" (benign
      # — prior run picked this commit before SIGTERM could write the journal)
      # from a real conflict.
      if echo "$cherry_out" | grep -qiE 'empty|nothing to commit|previous cherry-pick is now empty|already been applied'; then
        # Clean the sequencer state and treat HEAD as the landed sha. HEAD
        # already contains this commit's changes from the prior partial run.
        ( cd "$REPO_ROOT" && git cherry-pick --skip >/dev/null 2>&1 ) || true
        landed="$( cd "$REPO_ROOT" && git rev-parse HEAD )"
        ship_record_landed "$pn" "$sha" "$landed"
        if [[ -n "${SHIP_DEBUG_SLEEP_SECS:-}" ]]; then
          sleep "${SHIP_DEBUG_SLEEP_SECS}"
        fi
        continue
      fi
      # Layer 2 (plan v2 AA safety net): backstop for when Layer 1 seed-to-match
      # didn't prevent an AA conflict (e.g. resume of a pre-fix journal, or a race
      # where the journal was init'd before the seed). Auto-resolve ONLY when:
      #   (a) EVERY conflicted porcelain line is XY="AA"
      #   (b) EVERY conflicted path matches features/${pn}_*.md
      #   (c) main's spec content == branch-tip spec content (body guard, finding 1)
      # --ours keeps main (never --theirs, finding 2). Any UU, non-spec, or
      # body-mismatch falls through to the diagnostic below.
      local _conflict_lines _all_aa _aa_spec _xy _cpath
      _conflict_lines="$( cd "$REPO_ROOT" && git status --porcelain 2>/dev/null \
        | grep -E '^(DD|AU|UD|UA|DU|AA|UU) ' || true )"
      _all_aa=1
      _aa_spec=""
      if [[ -n "$_conflict_lines" ]]; then
        while IFS= read -r _cl; do
          [[ -z "$_cl" ]] && continue
          _xy="${_cl:0:2}"
          _cpath="${_cl:3}"
          if [[ "$_xy" != "AA" ]] || [[ ! "$_cpath" =~ ^features/${pn}_.*\.md$ ]]; then
            _all_aa=0
            break
          fi
          _aa_spec="$_cpath"
        done <<< "$_conflict_lines"
      else
        _all_aa=0
      fi
      if (( _all_aa == 1 )) && [[ -n "$_aa_spec" ]]; then
        local _main_content _branch_content
        _main_content="$( cd "$REPO_ROOT" && git show "HEAD:${_aa_spec}" 2>/dev/null )" || _main_content=""
        _branch_content="$( cd "$REPO_ROOT" && git show "${branch}:${_aa_spec}" 2>/dev/null )" || _branch_content=""
        if [[ -n "$_main_content" && "$_main_content" == "$_branch_content" ]]; then
          # Content matches: safe to resolve with --ours (keep main, finding 2).
          ( cd "$REPO_ROOT" && git checkout --ours -- "$_aa_spec" && git add -- "$_aa_spec" ) >/dev/null
          # --continue may report "nothing to commit" (net-zero change); --skip then.
          ( cd "$REPO_ROOT" && git cherry-pick --continue --no-edit >/dev/null 2>&1 ) || \
            ( cd "$REPO_ROOT" && git cherry-pick --skip >/dev/null 2>&1 ) || true
          echo "ship: AA conflict on ${_aa_spec} auto-resolved (Layer 2 --ours; content matches branch-tip)" >&2
          landed="$( cd "$REPO_ROOT" && git rev-parse HEAD )"
          ship_record_landed "$pn" "$sha" "$landed"
          if [[ -n "${SHIP_DEBUG_SLEEP_SECS:-}" ]]; then
            sleep "${SHIP_DEBUG_SLEEP_SECS}"
          fi
          continue
        fi
      fi
      {
        echo "ship: cherry-pick $sha failed — conflict or unresolved state"
        echo "#CP_DIAGNOSTIC_BEGIN"
        if [[ -n "$cherry_out" ]]; then
          echo "cherry-pick output:"
          printf '%s\n' "$cherry_out"
          echo ""
        fi
        echo "git status:"
        local conflict_status
        conflict_status="$(git -C "$REPO_ROOT" status --short 2>/dev/null || true)"
        printf '%s\n' "$conflict_status"
        echo "#CP_DIAGNOSTIC_END"
        echo ""
        # Manifest-only conflict: two branches independently appending their own
        # migration version to the same JSON array. Wholesale checkout of either
        # side drops the other's entry — merge by hand instead. See
        # docs/decisions.md 2026-08-10 [process] "Manifest cherry-pick conflicts
        # need entry-level merge, not wholesale checkout".
        if printf '%s\n' "$conflict_status" | awk '{print $2}' | sort -u | grep -qx "supabase/deploy-manifest.json" \
           && [[ "$(printf '%s\n' "$conflict_status" | awk '{print $2}' | sort -u | wc -l)" -eq 1 ]]; then
          echo "Conflict is on supabase/deploy-manifest.json only — most likely two branches"
          echo "each appended their own migration version to the same array. Keep BOTH new"
          echo "entries (don't take one side's file wholesale) and use the later"
          echo "migrations_deployed_at timestamp. Verify each entry against the actual live"
          echo "environment (pg_policies / schema_migrations) before assuming it's correct —"
          echo "the array is an assertion about what was deployed, not a log."
          echo ""
        fi
        echo "Stage the resolution with 'git add', then run 'git-ops ship $pn --resume'."
        echo "Do NOT run 'git cherry-pick --continue' yourself first — it clears"
        echo "CHERRY_PICK_HEAD, which forces the slower --mark-landed recovery path on"
        echo "resume (still safe, just an extra manual verify step you can skip)."
        echo "Never run 'git cherry-pick --abort' or '--quit' mid-sequence."
      } >&2
      exit 1
    fi
    landed="$( cd "$REPO_ROOT" && git rev-parse HEAD )"
    ship_record_landed "$pn" "$sha" "$landed"
    # Test-only knob: widen the SIGTERM window between picks. Unset in prod.
    if [[ -n "${SHIP_DEBUG_SLEEP_SECS:-}" ]]; then
      sleep "${SHIP_DEBUG_SLEEP_SECS}"
    fi
  done <<<"$pending"

  # Phase 2: spec close (idempotent — skip if journal.spec_closed=true).
  #
  # P1255: skipped entirely for `disclosure: embargo`. The close is what moves the
  # spec into features/done/ and commits it to main — i.e. publication. It runs
  # later, from `git-ops.sh publish-spec pN`, once the fix is confirmed live on
  # prod. Deliberately NOT recorded as spec_closed: the spec genuinely is not
  # closed, and a resume must be able to finish the job after publication.
  if (( ship_embargoed == 1 )); then
    echo "ship: $pn spec close deferred (disclosure: embargo) — run 'git-ops.sh publish-spec $pn' after the prod apply." >&2
  elif ! ship_journal_flag "$pn" "spec_closed"; then
    # Op-in-progress guard (P1082, mirrors L1816 no-branch arm + L2038 seed block).
    # When `pending` is empty (all commits already landed) the per-sha loop above
    # never runs a single iteration, so its own foreign-op guard (~L2088) never
    # fires — this was the only unguarded path left once the discard fix above
    # stopped treating a foreign CHERRY_PICK_HEAD as "safe to proceed past".
    local _gitdir_specclose
    _gitdir_specclose="$( cd "$REPO_ROOT" && git rev-parse --absolute-git-dir )"
    if [[ -e "$_gitdir_specclose/CHERRY_PICK_HEAD" || -e "$_gitdir_specclose/rebase-merge" || \
          -e "$_gitdir_specclose/rebase-apply" || -e "$_gitdir_specclose/MERGE_HEAD" ]]; then
      die "ship: operation in progress — refusing spec-close commit inside a cherry-pick, rebase, or merge started by another session"
    fi
    local sprint_dir
    sprint_dir="$(resolve_ship_sprint_dir)"
    mkdir -p "$REPO_ROOT/$sprint_dir"
    local spec_base spec_dest
    spec_base="$(basename "$spec_file")"
    spec_dest="${sprint_dir}/${spec_base}"

    if [[ -f "$REPO_ROOT/$spec_file" ]]; then
      ( cd "$REPO_ROOT" && git mv "$spec_file" "$spec_dest" ) || die "ship: git mv failed"
    elif [[ ! -f "$REPO_ROOT/$spec_dest" ]]; then
      die "ship: spec file missing at both $spec_file and $spec_dest"
    fi
    # Re-base body links for the new depth (P1094 item 1). Deliberately OUTSIDE
    # the branch above, so it also runs on a --resume that finds the spec already
    # moved. Gating it on "we just did the mv" would leave one unrecoverable
    # window: a crash between `git mv` and this call strands the spec at its new
    # path with un-re-based links, and every later --resume would skip the whole
    # block on old-path absence and re-block at the doc-link gate forever.
    # Safe to run unconditionally because the re-base is idempotent — the move
    # only ever goes deeper, so a second pass re-resolves an already-re-based
    # target above the repo root and skips it. That is a property, not a
    # coincidence, so canary SS pins it.
    if ! ship_rebase_doc_links "$REPO_ROOT" "$spec_file" "$spec_dest"; then
      ( cd "$REPO_ROOT" && git reset -q HEAD -- "$spec_dest" "$spec_file" 2>/dev/null ) || true
      die "ship: doc-link re-base failed — unstaged the partial rename; spec is at $spec_dest in the working tree. Recover with 'git mv $spec_dest $spec_file' then re-run ship after resolving the cause."
    fi
    ship_rewrite_frontmatter "$REPO_ROOT/$spec_dest"
    ( cd "$REPO_ROOT" && git add -- "$spec_dest" ) >/dev/null

    # If the rename+frontmatter-rewrite produces no net change vs HEAD, a prior
    # run already committed it — SIGTERM landed between commit and flag write.
    # Skip the commit (would fail with "nothing to commit") and just mark done.
    if ( cd "$REPO_ROOT" && git diff --cached --quiet -- "$spec_dest" ) && \
       ( cd "$REPO_ROOT" && git diff --quiet -- "$spec_dest" ); then
      ship_set_journal_flag "$pn" "spec_closed"
    else
      # Title for commit message: first non-frontmatter '# ' heading, fallback to pn.
      local title
      title="$(ship_extract_title "$REPO_ROOT/$spec_dest")"
      if [[ -z "$title" ]]; then
        title="close $pn"
      fi
      # Include $spec_file so the git mv source deletion is committed (not left staged).
      # On --resume when spec was already moved, $spec_file's deletion may already
      # be committed from a prior partial run — only expect it if it's still staged.
      # commit_staged_exact: plain commit, guarded — safe under acquire_main_lock
      # (held for this whole block); see its own comment for why.
      local _expected_paths=("$spec_dest")
      if [[ -n "$(cd "$REPO_ROOT" && git diff --cached --name-only --diff-filter=D -- "$spec_file" 2>/dev/null)" ]]; then
        _expected_paths+=("$spec_file")
      fi
      commit_staged_exact "$(ship_close_message "chore: close $pn — $title")" "${_expected_paths[@]}" \
        || die "ship: spec-close commit failed"
      ship_set_journal_flag "$pn" "spec_closed"
    fi
  fi

  # Phase 2b: REPORT co-located specs. Never close them (P1250).
  #
  # This block used to move each co-located spec to done/, rewrite its
  # frontmatter, re-base its doc links and commit it. That is gone, and with it
  # two whole classes of incident that only existed because this loop wrote to
  # another P-number's file mid-ship:
  #   - a malformed co-spec aborting the script and stranding this ship's
  #     branch and worktree (the p1057/w1 bug, previously guarded by canary UU);
  #   - a failed close leaving someone else's spec modified in the shared
  #     checkout (previously guarded by canary ZZ).
  # Neither is reachable now: nothing is moved, so nothing can fail halfway.
  # The canaries are retired in test-git-ops-ship.sh with this reasoning; the
  # protection is structural rather than guarded.
  #
  # What replaces it is a named list the operator acts on. Closing a spec stays
  # an explicit act: `git-ops.sh ship pM`, which runs pM's own gates.
  if [[ -n "$cospecs" ]]; then
    echo "" >&2
    echo "ship: these specs were EDITED by ${branch} and were NOT closed:" >&2
    for cospec_pn in $cospecs; do
      local cospec_file_r cospec_status_r
      # Keep resolve_ship_spec's own diagnostic. It distinguishes three cases the
      # operator must act on differently — already closed, AMBIGUOUS (several files
      # match), and present on a branch but never committed to main (its die carries
      # a recovery recipe). Swallowing stderr collapsed all three into one wrong line.
      local cospec_err_r=""
      cospec_file_r="$(resolve_ship_spec "$cospec_pn" 2>/tmp/cospec_err.$$ || true)"
      cospec_err_r="$(head -1 /tmp/cospec_err.$$ 2>/dev/null || true)"
      rm -f /tmp/cospec_err.$$ 2>/dev/null || true
      if [[ -n "$cospec_file_r" ]]; then
        cospec_status_r="$( ( cd "$REPO_ROOT" && sed -n 's/^status:[[:space:]]*//p' "$cospec_file_r" 2>/dev/null | head -1 ) || true )"
        echo "  ${cospec_pn}  [status: ${cospec_status_r:-unknown}]  ${cospec_file_r}" >&2
      elif [[ -n "$cospec_err_r" ]]; then
        echo "  ${cospec_pn}  [unresolved] ${cospec_err_r}" >&2
      else
        echo "  ${cospec_pn}  [already closed]" >&2
      fi
    done
    echo "  Editing a spec is not delivering it. If one of these is genuinely done," >&2
    echo "  close it by name:  ./scripts/git-ops.sh ship pNNNN" >&2
    echo "" >&2
  fi

  # Phase 3: branch + worktree cleanup (idempotent — skip if already done).
  #
  # P1255: skipped for `disclosure: embargo`. The spec file lives ONLY on this
  # branch until publication; deleting the branch here would destroy the only
  # copy that exists anywhere. The branch and worktree are torn down by
  # `publish-spec` instead, after the spec has landed on main.
  if (( ship_embargoed == 1 )); then
    echo "ship: $pn branch + worktree retained (disclosure: embargo) — the spec exists only on $branch until it is published." >&2
  elif ! ship_journal_flag "$pn" "branch_deleted"; then
    local wt_path
    wt_path="$( cd "$REPO_ROOT" && git worktree list --porcelain | \
                awk -v br="refs/heads/${branch}" '
                  /^worktree / { path = substr($0, 10); next }
                  /^branch / { if ($2 == br) print path }
                ' | head -n1 )"
    if [[ -n "$wt_path" ]]; then
      # Kill any dev server squatting inside the worktree before removal (orphan-port guard).
      reap_worktree_servers "$wt_path"
      ( cd "$REPO_ROOT" && git worktree remove --force "$wt_path" ) >/dev/null 2>&1 || true
    fi
    # Branch may already be deleted if a prior run reached here — treat "branch
    # not found" as success for idempotency.
    if ( cd "$REPO_ROOT" && git rev-parse --verify "$branch" >/dev/null 2>&1 ); then
      ( cd "$REPO_ROOT" && git branch -D "$branch" ) >/dev/null 2>&1 || \
        die "ship: branch delete failed for $branch"
    fi
    ship_set_journal_flag "$pn" "branch_deleted"
  fi

  # Capture the snapshot BEFORE releasing the lock — see the no-branch path above.
  local _hop_sha
  _hop_sha="$( cd "$REPO_ROOT" && git rev-parse HEAD )"

  # Release lock and clean up journal.
  release_main_lock
  trap - EXIT
  rm -f "$journal"

  echo "ship: $pn landed on main; branch and journal cleaned up."
  # P919 D4: cherry-picked commits are new SHAs CI has never seen — staging hop runs
  # the privacy-scan check on them before the human pushes main.
  print_staging_hop "$pn" "$_hop_sha"
  echo "Ready to push."
}

# ----------------------------------------------------------------------------
# Help / dispatch
# ----------------------------------------------------------------------------

print_usage() {
  cat <<'EOF'
git-ops.sh — unified git-operations wrapper

SUBCOMMANDS (T02 scope)
  claim <p-number> <slug>      Allocate next free slot, create worktree+branch+lockfile
                               Stdout: `#CP_CLAIM_BEGIN` / export / `#CP_CLAIM_END` (for eval)
                               Stderr: human-readable summary
                               Caller (SAFE pattern — P783):
                                 eval "$(scripts/git-ops.sh claim p999 smoketest 2>/tmp/x.log \
                                         | sed -n '/^#CP_CLAIM_BEGIN$/,/^#CP_CLAIM_END$/p' \
                                         | grep -v '^#')"

  status [slot]                With no arg: print table of all slots (SLOT | BRANCH | PID | STATE)
                               With slot arg: print detailed block for that slot
                               States: LIVE / STALE / ORPHAN / NO_LOCK
                                 LIVE    — PID exists AND ps lstart matches PID_START_TIME
                                 STALE   — PID exists BUT start time differs (PID recycled)
                                 ORPHAN  — PID does not exist
                                 NO_LOCK — slot directory has no .lock file

  release <slot> [--nonce <v>] Remove slot's lockfile. Ownership check: --nonce must match
                               the stored NONCE, OR current PID must match the stored PID.
                               Does NOT delete the worktree or branch.

  heartbeat <slot>             Refresh ONLY that slot's HEARTBEAT, in place. Silent no-op
                               unless the caller owns the lock (PID match, or
                               CP_SESSION_ID matching the lock's SESSION_ID). Meant to
                               be called from an editing hook so a session outliving
                               the TTL does not go ORPHAN while still working.

  adopt <slot> [--nonce <v>] [--session <id>]
                               Re-own an EXISTING lock: refresh PID / PID_START_TIME /
                               SESSION_ID / HEARTBEAT, preserve SLOT / BRANCH / P_NUMBER /
                               CLAIMED_AT / NONCE. Use when a session resumes into a slot
                               it already owns. Refuses unless the caller is standing IN
                               the slot (or --nonce matches), the worktree branch equals
                               the lock's BRANCH, and the lock is not LIVE under a
                               different process. Same #CP_CLAIM_BEGIN/END eval contract
                               as `claim`.

  help | --help                Show this message.

SUBCOMMANDS (P787 extensions — T03/T04/T05)
  gc [--dry-run | --yes --delete-branches] [--base <ref>] [--no-remote] [--stale-days <n>]
                               Report EVERY ref this pipeline can leave behind -- local
                               branches AND the heads on origin -- with worktree, age and a
                               merge verdict of MERGED or 'KEEP -- unmatched: <shas>'.
                               The verdict needs three signals to agree (patch-id, subject,
                               and a revert scan); any commit it cannot match keeps the
                               branch. Report-only by default; deletion requires BOTH --yes
                               AND --delete-branches, only ever removes LOCAL branches that
                               are MERGED and older than --stale-days (default 30), and
                               never touches a branch in 'git worktree list' or held by a
                               slot lockfile. Remote refs are reported, never auto-deleted.
                               --base picks the ref to judge against (default main);
                               --no-remote skips the origin round-trip. (P1260)

  abandon <slot> [--nonce <v>] Remove slot's lockfile AND worktree (branch preserved).
                               Ownership check for LIVE locks (same as release: --nonce
                               match OR current PID match). STALE/ORPHAN locks can be
                               abandoned without ownership (session is dead — safe cleanup).

  reconcile                    Cross-check slot dirs against 'git worktree list'.
                               Reports: orphan-lock (.lock but no worktree entry),
                               orphan-worktree (worktree entry but no .lock).
                               Exit 0 if all ok, exit 2 if any orphans found.

  commit-to-main --message <m> --files <f1> [f2 ...]
                               Serialize concurrent commits to main via
                               .claude/worktrees/main.lock (timeout: 120s default,
                               override with GIT_OPS_MAIN_LOCK_TIMEOUT env var).
                               Must be called from main repo root (not a worktree).
                               Reports "held by session X (pid Y)" on contention.
                               Never force-releases the lock (user-gated).

  switch-safe <branch>         Refuse to switch branches when main has uncommitted
                               bystander changes. Delegates to scripts/pre-flight.sh
                               if present (P786); falls back to inline dirty check.

  sync                         Fetch origin. Refuse on any branch with upstream
                               tracking (exit 3: "push is human-gated"). Local-only
                               branches get 'git pull --ff-only' (typically a no-op).

SUBCOMMANDS (P788 extension — T06)
  ship <p-number> [--resume]   Journal-based idempotent cherry-pick of
                               feature/pN-* or fix/pN-* onto main. Records
                               (source_sha : landed_sha) per commit in
                               .claude/worktrees/.ship-journal/pN.json, fsynced
                               and atomically replaced after each pick so a
                               crash leaves consistent state. Acquires main.lock
                               for the full run (serializes concurrent ships).
                               After all commits land: moves the spec into the
                               newest features/done/{sprint}/ directory with
                               status=all-done + completed_at, drops
                               delivery_stage, deletes the branch, removes the
                               worktree if one was checked out, clears the
                               journal. Never auto-pushes — ends with
                               'Ready to push.' for the human to run push.
                               --resume continues from a crashed run; any
                               recorded landed_sha missing from main history
                               causes an immediate refusal.

  push-docs                    Automate the P919 staging hop for doc/KDD commits
                               that are ahead of origin/main (no P-number needed).
                               6 steps: privacy check -> main.lock -> staging push ->
                               CI poll -> TTY y/N -> main push -> staging cleanup.
                               Same D1/D2 invariants as ship-to-prod: TTY-gated push,
                               detect-and-stop on uncovered privacy commits.

EXIT CODES
  0   success
  1   logical error (slot exhausted, ownership mismatch, lockfile missing, etc.)
  2   usage error (bad flags/args, unknown subcommand)
  3   sync refused (branch is published — push is human-gated)

LOCKFILE FORMAT (one KEY=VALUE per line, at <slot>/.lock)
  PID, PID_START_TIME, NONCE, SESSION_ID, SLOT, BRANCH, P_NUMBER, CLAIMED_AT, HEARTBEAT

DESIGN NOTES
  * Nonce is 16 hex chars (64 bits entropy) from /dev/urandom.
  * PID recycling is detected via ps -o lstart= — stored and current strings must match.
  * claim's stdout is wrapped in #CP_CLAIM_BEGIN / #CP_CLAIM_END sentinel markers
    (P783). Callers MUST filter to that block before eval; never merge stderr
    into eval. See .claude/rules/shell-safety.md for the caller contract.
EOF
}

# ── cmd_ship_to_prod ──────────────────────────────────────────────────────────
# P950: Execute the documented staging->CI->main push sequence autonomously.
# Usage: git-ops.sh ship-to-prod <pN>
#
# Hard invariants:
#   D1: The final git push origin main ALWAYS prompts a TTY y/N -- even when
#       ~/.push-enabled is set. ship-to-prod never consumes the flag's waiver.
#   D2: The executor detects-and-stops on uncovered privacy commits; it never
#       writes the privacy stamp. Only the human-invoked /privacy skill writes it.
#
# Safe to re-run: idempotent staging branch (--force-with-lease), checks whether
# commits are already on origin/main before pushing main.
# ─────────────────────────────────────────────────────────────────────────────
cmd_ship_to_prod() {
  require_required_checks_lib "ship-to-prod"
  local pn="${1:-}"
  [[ -n "$pn" ]] || die "ship-to-prod: usage: git-ops.sh ship-to-prod <pN> (e.g. p950)"
  # Normalize: strip leading 'p' if caller passed numeric only
  pn="${pn#p}"
  pn="p${pn}"

  require_main_repo

  # ── Precondition: must be on main ───────────────────────────────────────────
  local current_branch
  current_branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
  [[ "$current_branch" == "main" ]] || die "ship-to-prod: must be on main (current: $current_branch). Run git-ops.sh ship first."

  local local_sha
  local_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"

  # ── Precondition: verify pN commits are on local main ──────────────────────
  # (ship already put them here; this is a double-check)
  local pn_commits
  pn_commits="$(git -C "$REPO_ROOT" log --oneline --grep="$pn" origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "$pn_commits" -eq 0 ]]; then
    # Check if already on origin/main
    local on_remote
    on_remote="$(git -C "$REPO_ROOT" log --oneline --grep="$pn" origin/main 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "$on_remote" -gt 0 ]]; then
      die "ship-to-prod: ${pn} commits are already on origin/main -- nothing to push."
    fi
    die "ship-to-prod: no commits matching '${pn}' found ahead of origin/main. Run git-ops.sh ship ${pn} first."
  fi

  # ── Step 1: Privacy check (detect-only -- D2) ─────────────────────────────
  echo "ship-to-prod [1/6]: checking privacy stamp covers push range..." >&2

  local origin_main_sha=""
  if git -C "$REPO_ROOT" rev-parse --verify origin/main >/dev/null 2>&1; then
    origin_main_sha="$(git -C "$REPO_ROOT" rev-parse origin/main)"
  fi

  local privacy_range
  if [[ -n "$origin_main_sha" ]]; then
    privacy_range="$origin_main_sha..$local_sha"
  else
    privacy_range="$local_sha"
  fi

  # shellcheck disable=SC2086
  local uncovered_commits
  uncovered_commits="$(git -C "$REPO_ROOT" rev-list "$privacy_range" -- $WATCHED_PATHS 2>/dev/null)"

  if [[ -n "$uncovered_commits" ]]; then
    local git_common
    git_common="$(git -C "$REPO_ROOT" rev-parse --git-common-dir)"
    [[ "$git_common" == /* ]] || git_common="$REPO_ROOT/$git_common"
    local stamp_file="$git_common/.privacy-reviewed"
    local reviewed_sha=""
    if [[ -f "$stamp_file" ]]; then
      reviewed_sha="$(tr -d '[:space:]' < "$stamp_file")"
    fi

    local still_uncovered=""
    if [[ -n "$reviewed_sha" ]] && [[ "$reviewed_sha" =~ ^[0-9a-f]{40}$ ]]; then
      while IFS= read -r commit; do
        [[ -z "$commit" ]] && continue
        if ! git -C "$REPO_ROOT" merge-base --is-ancestor "$commit" "$reviewed_sha" 2>/dev/null; then
          still_uncovered="$still_uncovered$commit "
        fi
      done <<< "$uncovered_commits"
    else
      still_uncovered="$uncovered_commits"
    fi

    if [[ -n "$still_uncovered" ]]; then
      echo "" >&2
      echo "  ❌ ship-to-prod STOPPED: watched-path commits not covered by /privacy review:" >&2
      for c in $still_uncovered; do
        git -C "$REPO_ROOT" log --oneline -1 "$c" 2>/dev/null | sed 's/^/     /' >&2
      done
      echo "" >&2
      echo "  Run /maintain:privacy first, then re-run ship-to-prod." >&2
      echo "  (Per D2: ship-to-prod never writes the privacy stamp.)" >&2
      exit 1
    fi
  fi
  echo "  ✅ Privacy stamp covers all watched-path commits in push range." >&2

  # ── Step 2: Acquire main.lock ────────────────────────────────────────────
  echo "ship-to-prod [2/6]: acquiring main.lock..." >&2
  local timeout="${GIT_OPS_MAIN_LOCK_TIMEOUT:-120}"
  if ! acquire_main_lock "$timeout"; then
    die "ship-to-prod: could not acquire main.lock after ${timeout}s"
  fi
  trap 'release_main_lock; echo "ship-to-prod: released main.lock (exit/trap)" >&2' EXIT

  # ── Step 3: Staging push ─────────────────────────────────────────────────
  local staging_branch="staging/${pn}"
  local PUSH_EPOCH
  PUSH_EPOCH="$(date +%s)"
  echo "ship-to-prod [3/6]: pushing to staging branch ${staging_branch}..." >&2

  # Force-with-lease: if staging/pN already exists from a prior failed attempt,
  # overwrite it exactly to our current SHAs so CI runs on THESE commits.
  if ! git -C "$REPO_ROOT" push origin "${local_sha}:refs/heads/${staging_branch}" --force-with-lease="${staging_branch}" 2>&1; then
    # Branch may not exist yet; try without lease
    if ! git -C "$REPO_ROOT" push origin "${local_sha}:refs/heads/${staging_branch}" 2>&1; then
      die "ship-to-prod: staging push failed"
    fi
  fi
  echo "  ✅ Staging branch ${staging_branch} created at $local_sha" >&2

  # ── Step 4: CI poll -- verify EVERY required check on these exact SHAs ────
  # P1290: derived from the live ruleset, never hardcoded. See cmd_push_docs for the
  # incident that produced this — the identical hardcoded single-check poll lived here
  # too and was latent for exactly the same reason.
  # Array, not word-splitting — see the identical block in cmd_push_docs for why
  # (a required context name may contain spaces).
  local _raw ctx_list
  local ruleset_ok=0
  local -a required_contexts=()
  _raw="$(derive_required_contexts main)" || ruleset_ok=1
  while IFS= read -r _c; do
    [[ -n "$_c" ]] && required_contexts+=("$_c")
  done <<< "$_raw"
  ctx_list="$(printf '%s, ' "${required_contexts[@]}" | sed 's/, $//')"
  if (( ${#required_contexts[@]} == 0 )); then
    die "ship-to-prod: required-check list is empty — refusing to promote (P1290 fail-closed)"
  fi
  if (( ruleset_ok != 0 )); then
    echo "  ⚠️  ship-to-prod: could not read required_status_checks from main's ruleset." >&2
    echo "     Falling back to the known set: ${ctx_list}" >&2
    echo "     If the ruleset has gained a check, this promote may still be rejected." >&2
    echo "     Verify with: gh api repos/:owner/:repo/rules/branches/main" >&2
  fi

  echo "ship-to-prod [4/6]: waiting for [${ctx_list}] on ${local_sha}..." >&2

  # Verify gh is available and authenticated
  if ! command -v gh >/dev/null 2>&1; then
    echo "" >&2
    echo "  ❌ ship-to-prod: 'gh' CLI not found. Cannot poll CI." >&2
    echo "  Manual fallback: wait for [${ctx_list}] to pass in GitHub Actions," >&2
    echo "  then run: git push origin ${local_sha}:refs/heads/main && git push origin --delete ${staging_branch}" >&2
    die "gh not available"
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "  ❌ ship-to-prod: gh not authenticated. Run: gh auth login" >&2
    echo "  Manual fallback: wait for CI, then: git push origin ${local_sha}:refs/heads/main && git push origin --delete ${staging_branch}" >&2
    die "gh not authenticated"
  fi

  # Taken before the staging push (see cmd_push_docs for the mechanism): a baseline
  # stamped after the push is later than our own check-run's started_at, so the poll
  # rejects its own scan as stale and dies at MAX_WAIT with CI green.
  # 40 minutes, not 10. MEASURED, not guessed: every audit-privacy run on 2026-09-04
  # exceeded the old 600s budget — 768s, 980s and 793s on the same SHA. The 10:18:46Z
  # run concluded SUCCESS at 10:31:59Z while push-docs had already died at ~10:28, so a
  # green verdict arrived ~4 minutes after the poll stopped listening. That was the
  # dominant cause of the day's failures, independent of every other defect fixed here.
  #
  # It also COMPOUNDS: the scan cost scales with how far behind origin/main we are, so
  # each failed push lengthens the next scan and makes the next timeout more certain.
  # The backlog was both the result and the cause.
  #
  # COST, stated because it is real: push-docs holds main.lock across this poll, so a
  # longer budget widens the window in which co-tenant sessions cannot commit
  # (GIT_OPS_MAIN_LOCK_TIMEOUT is 120s — they cannot wait this long by construction).
  # A push that cannot succeed is strictly worse than one that blocks commits, so this
  # is the right trade today — but it makes releasing the lock across the poll the
  # obvious next change rather than an optional one.
  # 40 min also means a push-on grant must cover ~45 minutes, not the 20 /push budgets.
  local MAX_WAIT="${GIT_OPS_CI_MAX_WAIT:-2400}"
  local POLL_INTERVAL=20

  # The poll loop itself lives in lib-required-checks.sh so it can be tested: git-ops.sh
  # hard-fails without real `gh auth`, so while this logic was inline it was the one
  # part of the fix no canary could reach. It was also written out twice (here and in
  # cmd_ship_to_prod) — the same duplication that let the original single-check bug sit
  # latent in ship-to-prod after it was found in push-docs.
  local rc_status=0
  wait_for_required_checks "$local_sha" "$PUSH_EPOCH" "$MAX_WAIT" "$POLL_INTERVAL" \
    "${required_contexts[@]}" || rc_status=$?


  if (( rc_status == 2 )); then
    echo "" >&2
    echo "  ❌ ship-to-prod: '${RC_FAILED_CONTEXT}' concluded: ${RC_FAILED_CONCLUSION} (not success)." >&2
    echo "  Staging branch ${staging_branch} left for inspection (deliberate -- it is the" >&2
    echo "  handle for the manual promote). 'git-ops.sh gc' now reports it until it is" >&2
    echo "  reclaimed, and /weekly prints that report." >&2
    die "CI check failed: ${RC_FAILED_CONTEXT} concluded ${RC_FAILED_CONCLUSION}"
  fi

  if (( rc_status != 0 )); then
    echo "" >&2
    echo "  ❌ ship-to-prod: timed out after ${MAX_WAIT}s waiting for [${ctx_list}]." >&2
    echo "  Still blocking: ${RC_BLOCKING:-unknown}" >&2
    echo "  Staging branch ${staging_branch} left for inspection (deliberate -- it is the" >&2
    echo "  handle for the manual promote). 'git-ops.sh gc' now reports it until it is" >&2
    echo "  reclaimed, and /weekly prints that report." >&2
    echo "  Check GitHub Actions manually, then promote the snapshot to main and delete ${staging_branch}." >&2
    die "CI poll timeout"
  fi

  echo "  ✅ all required checks passed on ${local_sha}: [${ctx_list}]" >&2

  # ── Step 5: Promote to main (D1: ALWAYS prompt TTY y/N) ──────────────────
  echo "" >&2
  echo "ship-to-prod [5/6]: CI verified. Ready to push to main." >&2
  echo "" >&2
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  echo "  Push verified commits to main -> Vercel deploys claritypledge.com" >&2
  echo "  Staging: ${staging_branch} (CI green on SHA ${local_sha:0:8})" >&2
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  echo "" >&2
  echo "  Confirm prod push? (y/N)" >&2

  # D1: Always require TTY -- never skip even if ~/.push-enabled is set.
  # P1260: check it EXPLICITLY rather than letting `exec < /dev/tty` fail under `set -e`. The
  # implicit form dies with an opaque redirect error AND leaks the staging ref, because the
  # staging push already happened several steps above. Unlike push-docs there is deliberately no
  # ASSUME_YES escape here — a prod deploy always asks a human.
  [[ -t 0 ]] || reclaim_staging_and_die "${staging_branch}" \
    "ship-to-prod: no TTY available — a prod promote always requires a human confirm; run this in a terminal."
  exec < /dev/tty
  read -r answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    # P1260: same reclamation as cmd_push_docs' declined promote. staging/pN refs were covered
    # by nothing before this -- cmd_gc's old candidate filter did not match them either.
    echo "  Cancelled." >&2
    echo "  Reclaiming the staging ref (it is not needed once the promote is declined)." >&2
    if ! git -C "$REPO_ROOT" push origin --delete "${staging_branch}" >&2 2>&1; then
      echo "  WARNING: could not delete ${staging_branch} -- 'git-ops.sh gc' will report it." >&2
    fi
    release_main_lock
    exit 1
  fi

  echo "" >&2
  echo "  Pushing to main..." >&2
  # Promote the EXACT SHA that CI scanned — same rule as cmd_push_docs above.
  if ! git -C "$REPO_ROOT" push origin "${local_sha}:refs/heads/main"; then
    die "ship-to-prod: promote of ${local_sha} to refs/heads/main failed"
  fi
  echo "  ✅ Pushed to main." >&2

  # ── Step 6: Cleanup ───────────────────────────────────────────────────────
  echo "ship-to-prod [6/6]: cleaning up staging branch..." >&2
  if git -C "$REPO_ROOT" push origin --delete "$staging_branch" 2>&1; then
    echo "  ✅ Deleted staging/${pn}." >&2
  else
    echo "  Warning: Could not delete ${staging_branch} -- delete manually: git push origin --delete ${staging_branch}" >&2
  fi

  release_main_lock

  echo "" >&2
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  echo "  ship-to-prod complete. ${pn} is live on claritypledge.com." >&2
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
}

# remote_branch_sha <branch> — echo the SHA origin has for refs/heads/<branch>, or
# nothing if the branch does not exist. Returns non-zero ONLY when origin could not be
# reached (after one retry), so callers can tell "no such branch" from "no answer".
#
# ls-remote runs UNPIPED so `$?` is its own. The earlier version of this used
# `${PIPESTATUS[0]:-0}` after the assignment and fell through fail-open; the comment
# that shipped with it blamed command substitution and was FALSE — verified 2026-09-04
# in bash, `x="$(false | awk ...)"` leaves PIPESTATUS[0]=1 and a failed ls-remote
# leaves 128. Two real reasons it broke: (1) PIPESTATUS is clobbered by the NEXT
# command, and a `local st` declaration between the assignment and the read resets it
# to 0 — which is the shape that shipped; (2) the "verifying" experiment was run in
# zsh, where PIPESTATUS is unset entirely (zsh uses lowercase `pipestatus`), while the
# script under test is bash. Checking bash semantics in zsh is not verification.
#
# Why this is a function and not two inline copies: the piped-and-unchecked form
# survived in the --resume path after being fixed in the reconcile, and the canary
# check for it grepped for the ABSENCE of a string rather than the presence of the
# property, so it passed on a file that still contained the bug.
remote_branch_sha() {
  local br="$1" out
  if ! out="$(git -C "$REPO_ROOT" ls-remote origin "refs/heads/${br}" 2>/dev/null)"; then
    if ! out="$(git -C "$REPO_ROOT" ls-remote origin "refs/heads/${br}" 2>/dev/null)"; then
      return 1
    fi
  fi
  awk '{print $1}' <<< "$out"
  return 0
}

# Reclaim a staging ref and then die (P1260).
#
# For the abort paths that leave NOTHING to inspect. The four "left for inspection" sites are
# deliberately not routed through this — their ref is the handle for a manual promote.
#
# The no-TTY aborts are the reason this exists. Both promote functions push the staging ref and
# only afterwards discover they cannot prompt, so before P1260 an agent-driven run leaked a ref on
# every single invocation and said nothing about it — no "left for inspection" message, no cleanup.
# That is the most likely way the two staging/doc-* refs measured on origin on 2026-09-07 got
# there. main.lock is held at every call site below, which is the precondition the normal-path
# delete's SAFETY NOTE states.
reclaim_staging_and_die() {
  local staging_branch="$1" msg="$2"
  echo "  Reclaiming ${staging_branch} (nothing to inspect on this path)." >&2
  if ! git -C "$REPO_ROOT" push origin --delete "${staging_branch}" >&2 2>&1; then
    echo "  WARNING: could not delete ${staging_branch} -- 'git-ops.sh gc' will report it." >&2
  fi
  die "$msg"
}

# Enumerate every head on origin, one short name per line. Sibling of remote_branch_sha, and it
# exists for the same reason: `ls-remote` failing (offline, auth, DNS) prints NOTHING and exits
# non-zero, so a caller that ignores the status cannot tell "origin has no branches" from "I could
# not reach origin". For `gc` that distinction is the whole point — a silent empty list would
# report full coverage of the remote while covering none of it, which is the false-absence class
# this repo keeps re-learning. Returns non-zero on failure; prints nothing.
remote_heads() {
  local out
  if ! out="$( cd "$REPO_ROOT" && git ls-remote --heads origin 2>/dev/null )"; then
    return 1
  fi
  printf '%s\n' "$out" | sed 's|.*refs/heads/||' | grep -v '^$' || true
  return 0
}

# ── cmd_push_docs ─────────────────────────────────────────────────────────────
# Push doc/KDD commits that are ahead of origin/main through the P919 staging
# hop automatically: staging push → CI poll → TTY y/N → main push → cleanup.
#
# Hard invariants (mirrors ship-to-prod):
#   D1: The final git push origin main ALWAYS prompts a TTY y/N.
#   D2: Detect-and-stop on uncovered watched-path commits; never writes the stamp.
#
# Usage: git-ops.sh push-docs [--resume]
#
# --resume: a previous run already pushed the staging branch and then aborted
#   (typically the push-on flag lapsing during the CI poll). Deletes that leftover
#   branch and re-pushes it, so GitHub fires a fresh `push` event and a fresh
#   full-range audit-privacy run. Needed because re-pushing the same SHA onto an
#   existing ref is a no-op that creates no run at all, so a plain re-run polls
#   until MAX_WAIT and dies. It does NOT reuse the old green run: audit-privacy
#   scans a RANGE derived from the event (privacy-scan.yml:47-59), so a green
#   verdict on this SHA is not a verdict on this content.
# ─────────────────────────────────────────────────────────────────────────────
cmd_push_docs() {
  require_main_repo
  # Refuse BEFORE anything is pushed. Placed at the top rather than beside the poll
  # so a missing library cannot cost a staging branch and a CI cycle first.
  require_required_checks_lib "push-docs"

  local resume=0
  while (( $# )); do
    case "$1" in
      --resume) resume=1 ;;
      *) die "push-docs: unknown argument '$1' (accepts --resume)" ;;
    esac
    shift
  done

  # Must be on main
  local current_branch
  current_branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
  [[ "$current_branch" == "main" ]] || die "push-docs: must be on main (current: $current_branch)"

  # ── Step 0: Pin the snapshot ──────────────────────────────────────────────
  # EVERY stage below operates on $local_sha and never re-reads `main`. This
  # function previously resolved "what is main right now" at five separate points
  # — ahead-count, staging branch NAME, staging PUSH (`main:refs/...`), and the
  # promote (`push origin main`) — spread across a run that takes 15-20 minutes.
  # On this shared checkout the measured median gap between watched-path commits
  # is ~16 minutes (230 such commits in the 270-commit backlog of 2026-09-04, 95%
  # of them within 15 min of the previous one), so those five reads routinely
  # disagreed. The observable failure was a CI poll that could never match
  # (`head_sha != local_sha`), burning MAX_WAIT and leaking a staging branch.
  # Recorded but never implemented here: pp/docs/decisions.md 2026-08-28
  # "Push the SHA that CI actually scanned, never local HEAD".
  local local_sha
  local_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"

  local origin_main_sha=""
  if git -C "$REPO_ROOT" rev-parse --verify origin/main >/dev/null 2>&1; then
    origin_main_sha="$(git -C "$REPO_ROOT" rev-parse origin/main)"
  fi

  # --resume must REPLAY the prior run's snapshot, never re-derive it. Re-deriving
  # is what broke it: the retreat below depends on the privacy stamp, and the stamp
  # moves whenever /maintain:privacy runs (/day, /kdd, or a co-tenant). A resume that
  # recomputed the snapshot then computed a DIFFERENT staging branch name, ls-remote
  # missed the branch the aborted run actually left on origin, and the run died with
  # "no staging branch — drop --resume" while orphaning that branch permanently. The
  # recovery path was broken by the exact condition it exists to recover from.
  # Resolved here rather than reusing Step 0's $git_common: that block is extracted
  # and executed standalone by scripts/test-push-snapshot-pinning.sh Test 4, so it
  # must stay self-contained and cannot depend on — or be depended on by — this one.
  local state_dir
  state_dir="$(git -C "$REPO_ROOT" rev-parse --git-common-dir)"
  [[ "$state_dir" == /* ]] || state_dir="$REPO_ROOT/$state_dir"
  local resume_state="$state_dir/.push-docs-resume"
  local resumed_branch=""
  # --8<-- RESUME-REPLAY-BEGIN (extracted by scripts/test-push-snapshot-pinning.sh Test 5;
  # may read only: resume, resume_state, REPO_ROOT, local_sha — and the `die` function.)
  if (( resume )); then
    if [[ ! -f "$resume_state" ]]; then
      die "push-docs --resume: no run state at $resume_state — nothing to resume. Drop --resume to start a normal run."
    fi
    local _rs_sha _rs_branch
    read -r _rs_sha _rs_branch < "$resume_state" || true
    if [[ ! "$_rs_sha" =~ ^[0-9a-f]{40}$ ]] || [[ -z "$_rs_branch" ]]; then
      die "push-docs --resume: run state at $resume_state is malformed ('${_rs_sha:-empty}') — delete it and start a normal run."
    fi
    if ! git -C "$REPO_ROOT" cat-file -e "$_rs_sha" 2>/dev/null; then
      die "push-docs --resume: recorded snapshot $_rs_sha no longer exists in this repo — delete $resume_state and start a normal run."
    fi
    local_sha="$_rs_sha"
    resumed_branch="$_rs_branch"
    echo "push-docs: --resume replaying snapshot ${local_sha:0:9} on ${resumed_branch}." >&2
  fi
  # --8<-- RESUME-REPLAY-END

  # Retreat the snapshot to the privacy stamp when HEAD has run ahead of it.
  # A co-tenant watched-path commit landing between /maintain:privacy and this
  # run used to ABORT at Step 1 below, forcing a full re-review — measured at
  # 34 min over 168 commits (docs/decisions.md 2026-09-01). That window is the
  # widest in the whole pipeline and nothing else closes it. Retreating instead
  # ships the reviewed snapshot and leaves the later commits for the next run.
  # Conditions are deliberately strict: the stamp must be a real commit, strictly
  # between origin/main and HEAD, and HEAD must actually carry watched-path
  # commits it does not cover. Anything else leaves local_sha at HEAD, so a
  # genuinely-uncovered range still fails closed at Step 1.
  # --8<-- STEP0-RETREAT-BEGIN (extracted verbatim by scripts/test-push-snapshot-pinning.sh
  # Test 4 and executed against a fixture under `set -euo pipefail`. Keep this block
  # self-contained: it may read only REPO_ROOT, WATCHED_PATHS, local_sha, origin_main_sha.)
  local git_common
  git_common="$(git -C "$REPO_ROOT" rev-parse --git-common-dir)"
  [[ "$git_common" == /* ]] || git_common="$REPO_ROOT/$git_common"
  local stamp_sha=""
  # Plain `if` rather than `[[ -f … ]] && stamp_sha=…`. NOTE, because the first draft
  # of this comment claimed the opposite and was wrong: the `&&` form does NOT trip
  # the `set -euo pipefail` at :39 — verified 2026-09-04 by direct experiment
  # (`( set -euo pipefail; [[ -f /missing ]] && x=1 )` exits 0), because errexit
  # exempts a command that is not the last in an AND-OR list. The trap documented at
  # :1160 is a different shape. The `if` is kept for legibility and so this line does
  # not depend on that subtlety, not because the alternative was a bug.
  if [[ -f "$git_common/.privacy-reviewed" ]]; then
    stamp_sha="$(tr -d '[:space:]' < "$git_common/.privacy-reviewed")"
  fi

  if [[ "${resume:-0}" -eq 0 ]] \
     && [[ "$stamp_sha" =~ ^[0-9a-f]{40}$ ]] \
     && [[ "$stamp_sha" != "$local_sha" ]] \
     && [[ -n "$origin_main_sha" ]] && [[ "$stamp_sha" != "$origin_main_sha" ]] \
     && git -C "$REPO_ROOT" cat-file -e "$stamp_sha" 2>/dev/null \
     && git -C "$REPO_ROOT" merge-base --is-ancestor "$stamp_sha" "$local_sha" 2>/dev/null \
     && git -C "$REPO_ROOT" merge-base --is-ancestor "$origin_main_sha" "$stamp_sha" 2>/dev/null; then
    # shellcheck disable=SC2086
    local unstamped_watched
    unstamped_watched="$(git -C "$REPO_ROOT" rev-list "${stamp_sha}..${local_sha}" -- $WATCHED_PATHS 2>/dev/null)"
    if [[ -n "$unstamped_watched" ]]; then
      local deferred
      deferred="$(git -C "$REPO_ROOT" rev-list --count "${stamp_sha}..${local_sha}" 2>/dev/null || echo '?')"
      echo "push-docs [0/6]: ${deferred} commit(s) landed after the privacy review." >&2
      echo "  Pinning this push to the reviewed snapshot ${stamp_sha:0:9}; they ship on the next push." >&2
      local_sha="$stamp_sha"
    fi
  fi
  # --8<-- STEP0-RETREAT-END

  # Must have commits ahead of origin/main — measured on the PINNED snapshot.
  # When origin/main does not exist the expansion is a BARE SHA, not a range, so
  # rev-list counts the whole history and the run proceeds. That is a deliberate
  # change from the old `origin/main..HEAD`, which errored into `|| echo 0` and
  # exited "nothing to push" on a repo that in fact had everything to push. It
  # matches privacy_range's own no-origin fallback a few lines below.
  local ahead_count
  ahead_count="$(git -C "$REPO_ROOT" rev-list --count "${origin_main_sha:+${origin_main_sha}..}${local_sha}" 2>/dev/null || echo 0)"
  if [[ "$ahead_count" -eq 0 ]]; then
    echo "push-docs: nothing to push — the reviewed snapshot is already on origin/main." >&2
    exit 0
  fi
  echo "push-docs: ${ahead_count} commit(s) ahead of origin/main (snapshot ${local_sha:0:9})." >&2

  # ── Step 1: Privacy check (D2) ────────────────────────────────────────────
  echo "push-docs [1/6]: checking privacy stamp covers push range..." >&2

  local privacy_range
  if [[ -n "$origin_main_sha" ]]; then
    privacy_range="$origin_main_sha..$local_sha"
  else
    privacy_range="$local_sha"
  fi

  # shellcheck disable=SC2086
  local uncovered_commits
  uncovered_commits="$(git -C "$REPO_ROOT" rev-list "$privacy_range" -- $WATCHED_PATHS 2>/dev/null)"

  if [[ -n "$uncovered_commits" ]]; then
    # $git_common / $stamp_sha were resolved once at Step 0 -- do NOT re-read the
    # stamp here. A second read can observe a DIFFERENT value than the one the
    # snapshot was pinned to (a co-tenant /maintain:privacy rewrites this file
    # mid-run), which is the same read-live defect Step 0 exists to remove.
    local reviewed_sha="$stamp_sha"

    local still_uncovered=""
    if [[ -n "$reviewed_sha" ]] && [[ "$reviewed_sha" =~ ^[0-9a-f]{40}$ ]]; then
      while IFS= read -r commit; do
        [[ -z "$commit" ]] && continue
        if ! git -C "$REPO_ROOT" merge-base --is-ancestor "$commit" "$reviewed_sha" 2>/dev/null; then
          still_uncovered="$still_uncovered$commit "
        fi
      done <<< "$uncovered_commits"
    else
      still_uncovered="$uncovered_commits"
    fi

    if [[ -n "$still_uncovered" ]]; then
      echo "" >&2
      echo "  ❌ push-docs STOPPED: watched-path commits not covered by /privacy review:" >&2
      for c in $still_uncovered; do
        git -C "$REPO_ROOT" log --oneline -1 "$c" 2>/dev/null | sed 's/^/     /' >&2
      done
      echo "" >&2
      echo "  Run /maintain:privacy first, then re-run push-docs." >&2
      echo "  (Per D2: push-docs never writes the privacy stamp.)" >&2
      exit 1
    fi
  fi
  echo "  ✅ Privacy stamp covers all watched-path commits in push range." >&2

  # ── Step 2: Acquire main.lock (serializes against ship-to-prod / commit-to-main) ──
  # Must hold the lock from staging push through main push to prevent another session
  # from inserting commits between CI-verified SHA and the actual push (C1).
  echo "push-docs [2/6]: acquiring main.lock..." >&2
  local timeout="${GIT_OPS_MAIN_LOCK_TIMEOUT:-120}"
  if ! acquire_main_lock "$timeout"; then
    die "push-docs: could not acquire main.lock after ${timeout}s"
  fi
  trap 'release_main_lock; echo "push-docs: released main.lock (exit/trap)" >&2' EXIT

  # ── Step 3: Staging push ─────────────────────────────────────────────────
  local short_sha
  # From the PINNED snapshot, never a fresh HEAD read: the branch name must match the
  # SHA the CI poll waits on. Across a --resume the name is REPLAYED from the run
  # state, not recomputed — recomputing is what orphaned branches when the privacy
  # stamp moved between the abort and the resume (see the --resume block above).
  short_sha="$(git -C "$REPO_ROOT" rev-parse --short "$local_sha")"
  local staging_branch="staging/doc-${short_sha}"
  if [[ -n "$resumed_branch" ]]; then
    staging_branch="$resumed_branch"
  fi

  # Record the run state BEFORE the staging push, so an abort at any later point —
  # CI timeout, red check, lapsed push-on, a killed terminal — is resumable. Written
  # before the push, not after, because the push itself is one of the things that can
  # fail after creating the ref.
  if (( resume )); then
    # Delete the leftover staging branch so the re-push below CREATES the ref again.
    # This is the whole mechanism: pushing the same SHA onto an existing branch is a
    # no-op ref update, GitHub fires no `push` event, and no new audit-privacy run is
    # ever created — so a plain re-run polls for a fresh run that cannot exist and
    # dies at MAX_WAIT. Re-creating the ref sends BEFORE=0000, which privacy-scan.yml
    # (:52-56) turns into a FULL `origin/main..AFTER` scan.
    #
    # We deliberately do NOT reuse the existing green check-run. audit-privacy is a
    # function of (content, event, base) — not of tree content — because the range is
    # computed from the event payload (privacy-scan.yml:47-59) and the workflow runs
    # on `pull_request` too. So a green run on this exact SHA may have scanned an
    # empty or narrow diff, and accepting it by head_sha alone would promote content
    # nothing ever scanned. The freshness guard in the poll below is what binds the
    # verdict to OUR full-range push; it stays enforced on every path.
    local remote_staging_sha
    if ! remote_staging_sha="$(remote_branch_sha "$staging_branch")"; then
      # Distinguish "cannot reach origin" from "branch is gone". Conflating them told
      # the founder to drop --resume on a transient network blip, and dropping --resume
      # is exactly what orphans the branch permanently.
      die "push-docs --resume: cannot reach origin to look up ${staging_branch}. This is NOT 'the branch is gone' — do not drop --resume; retry when the network is back."
    fi
    if [[ -z "$remote_staging_sha" ]]; then
      die "push-docs --resume: no staging branch ${staging_branch} on origin — drop --resume to start a normal run."
    fi
    echo "push-docs [3/6]: --resume — deleting stale ${staging_branch} to force a fresh full-range scan..." >&2
    if ! git -C "$REPO_ROOT" push origin --delete "${staging_branch}" 2>&1; then
      die "push-docs --resume: could not delete ${staging_branch} — resolve by hand, then re-run without --resume."
    fi
  fi

  # Stamp the freshness baseline BEFORE the push, not after. GitHub starts the
  # workflow the instant the ref lands — which is DURING the push, not after the
  # local command returns — so a baseline taken afterwards is later than our own
  # check-run's started_at. The poll below then rejects its own scan as "pre-dates
  # our push (stale run)", waits for a fresh run that will never be created, and
  # dies at MAX_WAIT with the scan sitting green on origin. Observed 2026-09-04 on the
  # pinned snapshot 20e894b89: `audit-privacy` started 09:39:13 and concluded SUCCESS at
  # 09:47:53, yet push-docs died and origin/main did not move. Precisely: `goal-gate`
  # also ran on that SHA and concluded FAILURE at 09:50:27 — it is NOT the explanation,
  # because a red `goal-gate` is not a REQUIRED context and cannot block the promote.
  # (This comment previously said the ruleset "requires only the `audit-privacy`
  # context (verified against the live ruleset)". That was true when written on
  # 2026-09-04 and false on 2026-09-08, when P1255 added `disclosure` as a second
  # required check — and the poll that trusted it raced the new check and was rejected
  # GH013 three times on 2026-09-09. A verified fact with no expiry date is still a
  # fact that expires: the required set is now DERIVED, see derive_required_contexts.
  # P1290.)
  # Named here because the two failures sat in the same evidence and only one is ours. The bigger the
  # push, the longer the transfer, the more certain the misordering — which is why
  # this bites hardest exactly when the backlog is worst.
  # Taking it early is strictly safer: a check-run started before we pushed is
  # still correctly rejected, which is all the guard was ever for.
  # A staging branch left on origin under our name is a trap in BOTH directions, so
  # delete it whenever it exists — not only when it matches our snapshot.
  #
  #  - Same SHA: pushing it again is a no-op update ("Everything up-to-date"), so no
  #    ref changes. GitHub creates workflow runs from ref updates, so no push event and
  #    no audit-privacy run; the poll then waits out MAX_WAIT for a run that cannot
  #    exist. (The local no-op is verified by the canary's RED control; that the event
  #    does not fire is inference from GitHub's documented push-event semantics plus
  #    the --resume mechanism below, which exists for precisely this reason.)
  #  - DIFFERENT SHA: worse, and the reason this is unconditional. The push succeeds as
  #    a real ref update, so the event carries BEFORE=<old sha> rather than 0000, and
  #    privacy-scan.yml computes its range from the event — yielding a NARROW scan
  #    instead of the full origin/main..AFTER. A green check is a verdict on a RANGE,
  #    not on a SHA (decisions.md 2026-09-01), so content nothing scanned would pass
  #    the required check. Needs a --short abbreviation collision to happen (git widens
  #    abbreviations as the repo grows), so it is unlikely — and unbounded if it does.
  #
  # --resume already deletes unconditionally; the normal path now matches it. This is
  # reachable at all because the Step-0 retreat re-selects the stamp SHA, and every
  # aborted run leaks a branch named from it. Observed live 2026-09-04.
  #
  # SAFETY NOTE: deleting a branch another session may own is prevented by main.lock,
  # acquired above and held through the promote — a co-tenant push-docs blocks at its
  # 120s timeout and never reaches here. If the lock is ever released across the CI
  # poll (a real contention cost recorded in decisions.md 2026-09-01), THIS DELETE
  # BECOMES UNSAFE and needs its own ownership check. Do not release that lock without
  # revisiting this block.
  if (( ! resume )); then
    local existing_staging_sha
    if ! existing_staging_sha="$(remote_branch_sha "$staging_branch")"; then
      die "push-docs: cannot reach origin to check for an existing ${staging_branch} — refusing to push blind into a possible no-op or a narrow-range scan."
    fi
    if [[ -n "$existing_staging_sha" ]]; then
      echo "push-docs [3/6]: ${staging_branch} already on origin at ${existing_staging_sha:0:9} (leaked by an earlier abort)." >&2
      echo "  Deleting it so the re-push creates the ref and gets a full-range scan." >&2
      if ! git -C "$REPO_ROOT" push origin --delete "${staging_branch}" 2>&1; then
        die "push-docs: could not delete the stale ${staging_branch} — delete it by hand, then re-run."
      fi
    fi
  fi

  # Written AFTER the reconcile, deliberately. Written before it, either reconcile
  # `die` (origin unreachable, delete failed) exited leaving state that names a staging
  # branch this run never pushed — and a later --resume would then either delete a
  # branch by accident or tell the founder to drop --resume, which orphans it.
  # Overwriting run state from a PREVIOUS abort makes that abort's staging branch
  # unreachable from any future --resume — the exact outcome the replay mechanism
  # exists to prevent, reached by a second route. Warn and NAME it rather than refuse:
  # refusing would add a new way for the founder to be stuck, which is the failure class
  # this whole change is fixing. The founder is not expected to know this file exists.
  if [[ -f "$resume_state" ]]; then
    local _old_sha _old_branch
    read -r _old_sha _old_branch < "$resume_state" || true
    if [[ -n "${_old_branch:-}" ]] && [[ "$_old_branch" != "$staging_branch" ]]; then
      echo "  ⚠️  Discarding run state from an earlier aborted push (${_old_sha:0:9} on ${_old_branch})." >&2
      echo "     That branch is no longer resumable. If it is still on origin, delete it:" >&2
      echo "       git push origin --delete ${_old_branch}" >&2
    fi
  fi
  printf '%s %s\n' "$local_sha" "$staging_branch" > "$resume_state"

  local PUSH_EPOCH
  PUSH_EPOCH="$(date +%s)"

  echo "push-docs [3/6]: pushing to staging branch ${staging_branch}..." >&2

  if ! git -C "$REPO_ROOT" push origin "${local_sha}:refs/heads/${staging_branch}" --force-with-lease="${staging_branch}" 2>&1; then
    if ! git -C "$REPO_ROOT" push origin "${local_sha}:refs/heads/${staging_branch}" 2>&1; then
      die "push-docs: staging push failed"
    fi
  fi
  echo "  ✅ Staging branch ${staging_branch} created at ${local_sha}" >&2

  # ── Step 3: CI poll ───────────────────────────────────────────────────────
  # P1290: the wait-list is DERIVED from the live ruleset, never hardcoded. This poll
  # previously waited on `audit-privacy` alone, which was correct until P1255 added
  # `disclosure` as a second required check on 2026-09-08 — after which push-docs
  # promoted the instant the first one went green and raced the second. The two jobs
  # have no fixed completion order (measured across five staging cycles on 2026-09-09:
  # `disclosure` finished first twice, last twice, and once had not STARTED 23s after
  # `audit-privacy` concluded), so this was a coin flip on every run, and GH013 when it
  # lost. Hardcoding the second name would rot the same way the first one did.
  # Read into an ARRAY, one context per line — never `for ctx in $unquoted`. A GitHub
  # check context may legitimately contain spaces: this repo already has check-runs
  # named "Secret Scan" and "Vercel Preview Comments", and marking either required
  # would make word-splitting silently wait for four nonexistent checks named "Secret",
  # "Scan", "Vercel", ... forever. Also immune to glob characters in a context name,
  # which unquoted splitting would pathname-expand.
  local _raw ctx_list
  local ruleset_ok=0
  local -a required_contexts=()
  _raw="$(derive_required_contexts main)" || ruleset_ok=1
  while IFS= read -r _c; do
    [[ -n "$_c" ]] && required_contexts+=("$_c")
  done <<< "$_raw"
  ctx_list="$(printf '%s, ' "${required_contexts[@]}" | sed 's/, $//')"
  # Unreachable by construction (derive_required_contexts never echoes nothing), and
  # asserted anyway: an empty wait-list means "wait for nothing", which promotes
  # instantly and is strictly worse than the bug this whole change fixes.
  if (( ${#required_contexts[@]} == 0 )); then
    die "push-docs: required-check list is empty — refusing to promote (P1290 fail-closed)"
  fi
  if (( ruleset_ok != 0 )); then
    echo "  ⚠️  push-docs: could not read required_status_checks from main's ruleset." >&2
    echo "     Falling back to the known set: ${ctx_list}" >&2
    echo "     If the ruleset has gained a check, this promote may still be rejected." >&2
    echo "     Verify with: gh api repos/:owner/:repo/rules/branches/main" >&2
  fi

  echo "push-docs [4/6]: waiting for [${ctx_list}] on ${local_sha}..." >&2

  if ! command -v gh >/dev/null 2>&1; then
    echo "" >&2
    echo "  ❌ push-docs: 'gh' CLI not found. Cannot poll CI." >&2
    echo "  Manual fallback: wait for [${ctx_list}] to pass in GitHub Actions," >&2
    echo "  then run: git push origin ${local_sha}:refs/heads/main && git push origin --delete ${staging_branch}" >&2
    die "gh not available"
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "  ❌ push-docs: gh not authenticated. Run: gh auth login" >&2
    echo "  Manual fallback: wait for CI, then: git push origin ${local_sha}:refs/heads/main && git push origin --delete ${staging_branch}" >&2
    die "gh not authenticated"
  fi

  # PUSH_EPOCH is deliberately NOT re-stamped here — it was taken BEFORE the staging
  # push (see the comment there). Re-stamping it now would reinstate the race that
  # made the poll reject its own green scan.
  # 40 minutes, not 10. MEASURED, not guessed: every audit-privacy run on 2026-09-04
  # exceeded the old 600s budget — 768s, 980s and 793s on the same SHA. The 10:18:46Z
  # run concluded SUCCESS at 10:31:59Z while push-docs had already died at ~10:28, so a
  # green verdict arrived ~4 minutes after the poll stopped listening. That was the
  # dominant cause of the day's failures, independent of every other defect fixed here.
  #
  # It also COMPOUNDS: the scan cost scales with how far behind origin/main we are, so
  # each failed push lengthens the next scan and makes the next timeout more certain.
  # The backlog was both the result and the cause.
  #
  # P1290 widens what this budget must cover: the wait is now bounded by the SLOWEST of
  # N required checks, not by audit-privacy alone. Stated precisely, because the first
  # draft of this comment conflated two different facts: workflow RUNS are created in
  # the same second (measured — `privacy-scan` and `disclosure-gate` both trigger on a
  # bare `push:`), but the JOBS do not start together — 09:55:01 vs 09:55:40 in the
  # cycle this fix was diagnosed from, a 39s spread, up to 42s from run creation. So the
  # added cost is queue latency rather than serialized scan time, and 2400s still holds
  # — but that is an inference from the observed spread, not from proven concurrency.
  # Revisit if a required check is added whose own runtime exceeds audit-privacy's.
  #
  # COST, stated because it is real: push-docs holds main.lock across this poll, so a
  # longer budget widens the window in which co-tenant sessions cannot commit
  # (GIT_OPS_MAIN_LOCK_TIMEOUT is 120s — they cannot wait this long by construction).
  # A push that cannot succeed is strictly worse than one that blocks commits, so this
  # is the right trade today — but it makes releasing the lock across the poll the
  # obvious next change rather than an optional one.
  # 40 min also means a push-on grant must cover ~45 minutes, not the 20 /push budgets.
  local MAX_WAIT="${GIT_OPS_CI_MAX_WAIT:-2400}"
  local POLL_INTERVAL=20

  # The poll loop itself lives in lib-required-checks.sh so it can be tested: git-ops.sh
  # hard-fails without real `gh auth`, so while this logic was inline it was the one
  # part of the fix no canary could reach. It was also written out twice (here and in
  # cmd_ship_to_prod) — the same duplication that let the original single-check bug sit
  # latent in ship-to-prod after it was found in push-docs.
  local rc_status=0
  wait_for_required_checks "$local_sha" "$PUSH_EPOCH" "$MAX_WAIT" "$POLL_INTERVAL" \
    "${required_contexts[@]}" || rc_status=$?


  if (( rc_status == 2 )); then
    echo "" >&2
    echo "  ❌ push-docs: '${RC_FAILED_CONTEXT}' concluded: ${RC_FAILED_CONCLUSION} (not success)." >&2
    echo "  Staging branch ${staging_branch} left for inspection (deliberate -- it is the" >&2
    echo "  handle for the manual promote). 'git-ops.sh gc' now reports it until it is" >&2
    echo "  reclaimed, and /weekly prints that report." >&2
    # Clear the run state on a RED check specifically. --resume exists to retry a run
    # that was interrupted (CI timeout, lapsed push-on, killed terminal) — not to
    # re-push a snapshot CI has already judged, which would burn another full poll to
    # be told the same thing. Those interrupted paths deliberately KEEP the state;
    # this one must not.
    rm -f "$resume_state"
    die "CI check failed: ${RC_FAILED_CONTEXT} concluded ${RC_FAILED_CONCLUSION}"
  fi

  if (( rc_status != 0 )); then
    echo "" >&2
    echo "  ❌ push-docs: timed out after ${MAX_WAIT}s waiting for [${ctx_list}]." >&2
    echo "  Still blocking: ${RC_BLOCKING:-unknown}" >&2
    echo "  Staging branch ${staging_branch} left for inspection (deliberate -- it is the" >&2
    echo "  handle for the manual promote). 'git-ops.sh gc' now reports it until it is" >&2
    echo "  reclaimed, and /weekly prints that report." >&2
    echo "  Check GitHub Actions manually, then promote the snapshot to main and delete ${staging_branch}." >&2
    die "CI poll timeout"
  fi

  echo "  ✅ all required checks passed on ${local_sha}: [${ctx_list}]" >&2

  # ── Step 4: Promote to main (TTY y/N — auto-confirmed when PUSH_DOCS_ASSUME_YES=1) ──
  echo "" >&2
  echo "push-docs [5/6]: CI verified. Ready to push to main." >&2
  echo "" >&2
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  echo "  Push ${ahead_count} commit(s) to main" >&2
  echo "  Staging: ${staging_branch} (CI green on SHA ${local_sha:0:8})" >&2
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  echo "" >&2
  # Non-interactive confirm: PUSH_DOCS_ASSUME_YES=1 skips ONLY this local y/N.
  # Set by the /push skill, where invoking /push IS the human authorization for
  # THIS push. Every other gate stays: privacy-coverage check, main.lock, and
  # the non-bypassable server-side audit-privacy required check on main (the real
  # security boundary, P919). This loosens D1 for the doc-push path ONLY —
  # cmd_ship_to_prod keeps its unconditional TTY prompt for prod deploys.
  if [[ "${PUSH_DOCS_ASSUME_YES:-}" == "1" ]]; then
    echo "  Confirm push? → auto-confirmed (PUSH_DOCS_ASSUME_YES=1)." >&2
  else
    echo "  Confirm push? (y/N)" >&2

    # C3: Guard against pipe-injected y bypassing the prompt (adversarial-review finding).
    # -t 0 checks fd 0 is a real TTY; exec < /dev/tty alone can silently degrade.
    [[ -t 0 ]] || reclaim_staging_and_die "${staging_branch}" \
      "push-docs: no TTY available — set PUSH_DOCS_ASSUME_YES=1 to confirm non-interactively, or run in a terminal."
    exec < /dev/tty
    read -r answer
    if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
      # P1260: reclaim rather than leak. A declined promote leaves nothing to inspect -- unlike
      # the timeout and red-CI paths above, which keep the ref deliberately. main.lock is still
      # held here (released on the next line), the same condition that makes the normal-path
      # delete safe; see the SAFETY NOTE above it before changing either.
      echo "  Cancelled." >&2
      echo "  Reclaiming the staging ref (it is not needed once the promote is declined)." >&2
      if ! git -C "$REPO_ROOT" push origin --delete "${staging_branch}" >&2 2>&1; then
        echo "  WARNING: could not delete ${staging_branch} -- 'git-ops.sh gc' will report it." >&2
      fi
      release_main_lock  # C2: explicit release before exit; trap is backup
      exit 1
    fi
  fi

  echo "" >&2
  echo "  Pushing to main..." >&2
  # Promote the EXACT SHA that CI scanned, not the branch name. pp/docs/decisions.md
  # 2026-08-28: "The staging-hop pattern makes this easy to get wrong, because its
  # instructions end with a literal push of `main` — correct only if nothing lands
  # during CI, which on this machine is the unlikely case rather than the safe default."
  # remote_ref stays refs/heads/main with a SHA source ref, so all three layers of
  # pre-push-checks.sh still fire — verified 2026-09-04 in a throwaway bare repo with
  # an instrumented pre-push hook: the SHA form yields local_ref=<sha>,
  # remote_ref=refs/heads/main, and pre-push-checks.sh reads local_ref (:57/:87/:212)
  # but never uses it; every layer gates on remote_ref.
  if ! git -C "$REPO_ROOT" push origin "${local_sha}:refs/heads/main"; then
    die "push-docs: promote of ${local_sha} to refs/heads/main failed"
  fi
  echo "  ✅ Pushed to main." >&2

  # ── Step 5: Cleanup ───────────────────────────────────────────────────────
  echo "push-docs [6/6]: cleaning up staging branch..." >&2
  if git -C "$REPO_ROOT" push origin --delete "$staging_branch" 2>&1; then
    echo "  ✅ Deleted ${staging_branch}." >&2
  else
    echo "  Warning: could not delete ${staging_branch} -- delete manually: git push origin --delete ${staging_branch}" >&2
  fi

  # The run succeeded — drop the resume state so a later --resume cannot replay a
  # snapshot that is already on origin (which would re-push a staging branch and burn
  # a CI run for nothing).
  rm -f "$resume_state"

  echo "" >&2
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  echo "  push-docs complete." >&2
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
}

main() {
  if [[ $# -eq 0 ]]; then
    usage_exit
  fi
  local sub="$1"
  shift
  case "$sub" in
    claim)           cmd_claim "$@" ;;
    status)          cmd_status "$@" ;;
    release)         cmd_release "$@" ;;
    adopt)           cmd_adopt "$@" ;;
    heartbeat)       cmd_heartbeat "$@" ;;
    gc)              cmd_gc "$@" ;;
    abandon)         cmd_abandon "$@" ;;
    reconcile)       cmd_reconcile "$@" ;;
    commit-to-main)  cmd_commit_to_main "$@" ;;
    switch-safe)     cmd_switch_safe "$@" ;;
    sync)            cmd_sync "$@" ;;
    ship)            cmd_ship "$@" ;;
    publish-spec)    cmd_publish_spec "$@" ;;
    ship-to-prod)    cmd_ship_to_prod "$@" ;;
    push-docs)       cmd_push_docs "$@" ;;
    help|-h|--help)  print_usage; exit 0 ;;
    *)
      echo "git-ops: unknown subcommand '$sub'" >&2
      usage_exit
      ;;
  esac
}

main "$@"
