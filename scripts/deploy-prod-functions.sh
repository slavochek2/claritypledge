#!/bin/bash
# scripts/deploy-prod-functions.sh — bring prod edge functions up to the live origin/main tip (P1732).
#
# Usage:
#   ./scripts/deploy-prod-functions.sh
#       The /push step. Deploys every function whose prod fingerprint differs from the live tip
#       of origin/main, from a clean checkout of that tip. An empty batch prompts nothing.
#   ./scripts/deploy-prod-functions.sh --after-push <step-5 exit|none> [applied|not-applied] --sha <sha>
#       The same, gated on /push's step 5 and step 6: 0 or none runs; 3 runs only when step 6
#       applied the coupled migrations (else "waiting on migrations"); 4 is "unproven: schema
#       unconfirmed"; 1 does not run. <sha> is the commit this /push confirmed: when the live tip
#       is anything else the run is "superseded" and uploads nothing.
#   ./scripts/deploy-prod-functions.sh --rollback <sha> <fn> [<fn> ...]
#       Deploys ONLY the named functions from <sha>. Skips the tip check. The next /push redeploys
#       them from main unless main is reverted.
#   ./scripts/deploy-prod-functions.sh --check
#       Read-only (/day cp.prodfns). Never locks, never deploys, never prompts.
#       Prints one of: "cp.prodfns: ok at <sha9>" / "cp.prodfns: problem <names>" / "cp.prodfns: unproven (<why>)".
#
# Invariants (features/p1732_push_deploys_stale_prod_functions.md):
#   1 live tip read with git ls-remote under the lock, re-checked before upload (superseded)
#   2 batch = functions whose fingerprint (traced input hash + JWT policy) differs from the healthy
#     prod record; never "deploy all"; orphans reported, never deleted
#   3 one prod function deploy at a time (lock shared with deploy-functions.sh --env prod)
#   4 a smoke-failed function is never stamped and is recorded, so it is reselected
#   5 the stamp holds only prod entries of functions that deployed, committed via commit-to-main
#     from HEAD's manifest, never sweeping the working file's other edits
#   6 per-function outcome: deployed / deployed, smoke failed / deployed, stamp not recorded /
#     not deployed (<reason>) / unproven
#   7 fail-closed scoped preflight (scripts/lib/prod-functions.sh)
#   8 batch computed offline; prod token unlocked only for a non-empty batch
#
# Healthy prod record = the prod entry in the committed manifest: the main checkout's HEAD when
# local main is ahead of the tip (its unpushed stamps, a rollback's included), else origin/main's,
# minus any function in the smoke-failure record. That record also holds a pending marker for every
# function from before its upload until its smoke passes, so an interrupted deploy stays selected.
# The working manifest is never evidence. A function whose stamp commit failed after a healthy
# smoke is found in the deploy proof (<git-common-dir>/cp-prod-deployed.txt, name and fingerprint,
# written only after that smoke): a normal run records the stamp without uploading again. When
# local main is behind the tip, no stamp is committed (it would diverge main); after a pull, the
# next run records it from the proof.
#
# Exit: 0 every batch function deployed (or nothing to do) · 1 at least one function did not end
#       "deployed", or waiting on migrations · 2 unproven (lock, live tip, fetch or a record could
#       not be read; schema unconfirmed; local main diverged) · 3 superseded
#   --check: 0 ok · 1 problem · 2 unproven
# Output contract (shell-safety.md): status lines never carry redirect or pipe tokens.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/prod-functions.sh
source "$SCRIPT_DIR/lib/prod-functions.sh"
HASHER="$SCRIPT_DIR/lib/function-input-hash.py"

MODE="deploy"; ROLLBACK_SHA=""; ROLLBACK_FNS=(); AFTER_SHA=""
case "${1:-}" in
  --check) MODE="check"; shift ;;
  --rollback)
    MODE="rollback"; shift
    ROLLBACK_SHA="${1:-}"; [ $# -gt 0 ] && shift
    for a in "$@"; do
      if ! [[ "$a" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then echo "ERROR: not a function name: '$a'. Nothing was deployed."; exit 1; fi
      case " ${ROLLBACK_FNS[*]-} " in *" $a "*) continue ;; esac  # named twice: one upload, one outcome
      ROLLBACK_FNS+=("$a")
    done
    if [ -z "$ROLLBACK_SHA" ] || [ ${#ROLLBACK_FNS[@]} -eq 0 ]; then
      echo "ERROR: --rollback needs a SHA and at least one function name. Nothing was deployed."; exit 1
    fi ;;
  --after-push)
    # The /push step 7 gate (spec Solution A). /push passes step 5's exit ("none" when step 1 found
    # nothing to push) and whether step 6 applied the coupled migrations. The rule lives here, not
    # in the skill text, so it is tested.
    PUSH_RC="${2:-}"; shift; [ $# -gt 0 ] && shift
    STEP6=""; case "${1:-}" in applied|not-applied) STEP6="$1"; shift ;; esac
    if [ "${1:-}" = "--sha" ]; then AFTER_SHA="${2:-}"; shift; [ $# -gt 0 ] && shift; fi
    [ $# -eq 0 ] || { echo "ERROR: unexpected argument '$1' after --after-push. Nothing was deployed."; exit 1; }
    case "$PUSH_RC" in
      0|none) ;;
      3) case "$STEP6" in
           applied) ;;
           not-applied) echo "prod functions: waiting on migrations (the coupled migrations are not applied yet; the next /push re-checks). Nothing was deployed."; exit 1 ;;
           *) echo "ERROR: --after-push 3 needs 'applied' or 'not-applied'. Nothing was deployed."; exit 1 ;;
         esac ;;
      4) echo "prod functions: unproven: schema unconfirmed (step 5 could not confirm the schema). Nothing was deployed."; exit 2 ;;
      1) echo "prod functions: not run (the push failed or was refused)"; exit 1 ;;
      *) echo "ERROR: --after-push needs step 5's exit (0, 1, 3, 4) or 'none'. Nothing was deployed."; exit 1 ;;
    esac
    # The SHA this /push confirmed (step 5 pushed it, or step 1 found origin/main at it). Its
    # schema gate vouches for that commit only: a later tip is deployed by the push that moved it.
    [[ "${AFTER_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo "ERROR: --after-push needs --sha with the full 40-character SHA this /push confirmed. Nothing was deployed."; exit 1; }
    ;;
  "") ;;
  *) echo "ERROR: unknown argument '$1'. Usage: deploy-prod-functions.sh [--after-push RC [applied|not-applied]] or [--check] or [--rollback SHA FN...]"; exit 1 ;;
esac

TAG="prod functions"; [ "$MODE" = "check" ] && TAG="cp.prodfns"
unproven() { echo "$TAG: unproven ($1)"; exit 2; }

# --- the main checkout (manifest, .env.prod, lock and record live there) ----------------------
HERE="$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null)" || unproven "not inside a git checkout"
COMMON="$(prodfn_common_dir "$HERE")" || unproven "no git common dir"
if [ "$(basename "$COMMON")" = ".git" ]; then MAIN="$(dirname "$COMMON")"; else MAIN="$HERE"; fi

WORK="$(mktemp -d)"
cleanup() {
  prodfn_lock_release
  rm -rf "$WORK"
}
trap cleanup EXIT

if [ "$MODE" != "check" ]; then
  prodfn_lock_acquire "$MAIN" || unproven "another prod function deploy holds the lock"
fi

# A half-open tunnel must not hang a run that holds the prod lock: stalled transfers abort, and the
# whole call is bounded where a timeout command exists.
NET=(); UPT=(); command -v timeout >/dev/null 2>&1 && { NET=(timeout -k 10 "${PROD_FN_NET_TIMEOUT:-120}"); UPT=(timeout -k 10 "${PROD_FN_UPLOAD_TIMEOUT:-600}"); }
net_git() { GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=30 ${NET[@]+"${NET[@]}"} git "$@"; }
live_tip() { net_git -C "$MAIN" ls-remote origin refs/heads/main 2>/dev/null | awk 'NR==1{print $1}'; }

# --- 1. target SHA ------------------------------------------------------------------------------
TIP="$(live_tip)"
[[ "$TIP" =~ ^[0-9a-f]{40}$ ]] || unproven "could not read the live origin/main tip"
net_git -C "$MAIN" fetch --quiet origin main >/dev/null 2>&1 || unproven "git fetch origin main failed"
git -C "$MAIN" cat-file -e "$TIP^{commit}" 2>/dev/null || unproven "the live tip $TIP is not available after fetch"
if [ "$MODE" = "rollback" ]; then
  TARGET="$(git -C "$MAIN" rev-parse --verify --quiet "$ROLLBACK_SHA^{commit}")" || {
    echo "$TAG: not deployed (unknown rollback SHA $ROLLBACK_SHA)"; exit 1; }
  # Only code that has been on origin/main: a branch or an unpushed commit is forward code no
  # review or schema gate has passed.
  git -C "$MAIN" merge-base --is-ancestor "$TARGET" "$TIP" 2>/dev/null || {
    echo "$TAG: not deployed (rollback SHA ${TARGET:0:9} is not in origin/main's history)"; exit 1; }
else
  if [ -n "$AFTER_SHA" ] && [ "$TIP" != "$AFTER_SHA" ]; then
    # Nothing was pushed in the "none" case, so no step-5 schema verdict is tied to AFTER_SHA: a
    # newer tip is deployed, and the migration check below gates it. A push run stays bound to the
    # SHA its step 5 checked. A moved tip is not always deployed by whoever moved it: /ship-prod
    # pushes and deploys no functions.
    if [ "${PUSH_RC:-}" = "none" ] && git -C "$MAIN" merge-base --is-ancestor "$AFTER_SHA" "$TIP" 2>/dev/null; then
      echo "$TAG: origin/main moved from ${AFTER_SHA:0:9} to ${TIP:0:9} after step 1; deploying ${TIP:0:9}"
    else
      echo "$TAG: superseded (origin/main is at ${TIP:0:9}, not ${AFTER_SHA:0:9} that this /push confirmed). Nothing was deployed. The next /push deploys ${TIP:0:9}; /day reports its stale functions until then."
      exit 3
    fi
  fi
  TARGET="$TIP"
fi
SHA9="${TARGET:0:9}"

# A clean, private checkout of the target: its own git root, untouched by any working tree.
SRC="$WORK/src"
git clone --quiet --shared --no-checkout "$MAIN" "$SRC" >/dev/null 2>&1 \
  && git -C "$SRC" checkout --quiet --detach "$TARGET" >/dev/null 2>&1 \
  || unproven "could not make a clean checkout of $SHA9"
[ -d "$SRC/supabase/functions" ] || unproven "$SHA9 has no supabase/functions"

# --- 2. batch, offline --------------------------------------------------------------------------
JWT_LIST="$SRC/supabase/no-verify-jwt-functions.txt"
[ -f "$JWT_LIST" ] || unproven "$SHA9 has no supabase/no-verify-jwt-functions.txt"
python3 "$HASHER" "$SRC/supabase/functions" --jwt-policy "$JWT_LIST" > "$WORK/fp.json" 2>"$WORK/fp.err" \
  || unproven "the fingerprint helper failed: $(head -1 "$WORK/fp.err")"
# Which record is newest depends on where local main stands against the live tip. Local main AHEAD
# of (or equal to) the tip: its manifest carries origin's entries plus any local stamp, including a
# rollback that must override origin's newer-looking entry. Local main BEHIND: origin is newer.
# Diverged: no record can be trusted. The local "main" ref is read, never HEAD, and the working
# manifest is never read: an uncommitted value is not evidence that anything was deployed.
LOCAL_MAIN="$(git -C "$MAIN" rev-parse --verify --quiet refs/heads/main)" || unproven "the main checkout has no local main branch"
if git -C "$MAIN" merge-base --is-ancestor "$TIP" "$LOCAL_MAIN" 2>/dev/null; then REL="ahead"
elif git -C "$MAIN" merge-base --is-ancestor "$LOCAL_MAIN" "$TIP" 2>/dev/null; then REL="behind"
else REL="diverged"; fi
[ "$REL" = "diverged" ] && [ "$MODE" != "rollback" ] && unproven "local main has diverged from origin/main"
# A rollback is recorded by a stamp commit on local main, which is refused when main is behind or
# diverged. Uploading first would leave prod on old code under a record that still names the tip,
# and every later check would call it in sync. So it is refused before anything uploads.
if [ "$MODE" = "rollback" ] && [ "$REL" != "ahead" ]; then
  echo "$TAG: not deployed (local main is $REL origin/main, so the rollback could not be recorded; pull main, then roll back)"
  exit 1
fi
# A manifest absent at a revision is an empty record; one that is present but unreadable is not.
read_manifest() { # <rev> <out>
  if git -C "$MAIN" cat-file -e "$1:supabase/deploy-manifest.json" 2>/dev/null; then
    git -C "$MAIN" show "$1:supabase/deploy-manifest.json" > "$2" 2>/dev/null || unproven "the manifest at $1 could not be read"
  else echo '{}' > "$2"; fi
}
read_manifest "$TIP" "$WORK/m.origin"
read_manifest "$LOCAL_MAIN" "$WORK/m.head"
prodfn_smoke_record_read "$MAIN" "$WORK/smokefail" || unproven "the smoke-failure record exists but could not be read"
prodfn_proof_read "$MAIN" "$WORK/proof" || unproven "the deploy-proof record exists but could not be read"

ONLY_ARG=""
[ "$MODE" = "rollback" ] && ONLY_ARG="$(printf '%s\n' "${ROLLBACK_FNS[@]}")"
python3 - "$WORK" "$SRC/supabase/functions" "$MODE" "$ONLY_ARG" "$REL" > "$WORK/plan" <<'PY' || unproven "the batch could not be computed (an unreadable manifest?)"
import json, os, re, sys
work, fdir, mode, only, rel = sys.argv[1], sys.argv[2], sys.argv[3], [n for n in sys.argv[4].split('\n') if n], sys.argv[5]
fp = json.load(open(os.path.join(work, 'fp.json')))
def prod(name):
    # Invalid JSON raises: an unreadable record must never read as "nothing deployed".
    d = json.load(open(os.path.join(work, name)))
    return (d.get('prod') or {}).get('functions') or {}
origin, head = prod('m.origin'), prod('m.head')
committed = head if rel == 'ahead' else origin
smokefail = {l.strip() for l in open(os.path.join(work, 'smokefail')) if l.strip()}
proof = {}
for l in open(os.path.join(work, 'proof')):
    p = l.rstrip('\n').split('\t')
    if len(p) == 2 and p[0]:
        proof[p[0]] = p[1]
local = sorted(d for d in os.listdir(fdir) if os.path.isdir(os.path.join(fdir, d)) and not d.startswith('_'))
if mode == 'rollback':
    for n in only:
        if n not in local:
            print('MISSING\t%s' % n)
        elif n in fp['errors']:
            print('UNTRACEABLE\t%s\t%s' % (n, fp['errors'][n]))
        else:
            print('SELECT\t%s' % n)
    sys.exit(0)
for n in local:
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', n):
        print('UNTRACEABLE\t%s\t%s' % (n, 'not a valid function name')); continue
    if n in fp['errors']:
        print('UNTRACEABLE\t%s\t%s' % (n, fp['errors'][n])); continue
    h = fp['hashes'].get(n) or ''
    if not h:
        continue  # no index.ts: not a deployable function
    if n in smokefail:
        print('SELECT\t%s' % n); continue
    # The last upload is neither the tip nor what the committed record names: prod runs code no
    # record describes (a rollback, or a manual deploy of other code, whose stamp never landed). It
    # is not in sync even when the record matches the tip.
    p = proof.get(n)
    if p and p != h and p != committed.get(n):
        print('SELECT\t%s' % n); continue
    if committed.get(n) == h:
        continue
    # Deployed and smoked by this script at exactly this fingerprint, but the stamp commit never
    # landed: record it without a second upload. Nothing else counts as proof (Invariant 5).
    if proof.get(n) == h:
        print('RECOVER\t%s' % n); continue
    print('SELECT\t%s' % n)
for n in sorted(set(committed)):
    if n not in local and not n.startswith('_'):
        print('ORPHAN\t%s' % n)
# Pending entries for a function the tip does not have (a manual deploy of a branch-only function):
# prod runs code no clean deploy can replace, so it is reported until someone resolves it by hand.
for n in sorted(smokefail):
    if n in local and not re.fullmatch(r'[a-z0-9][a-z0-9-]*', n):
        continue  # already UNTRACEABLE above
    if n not in fp['errors'] and not fp['hashes'].get(n):
        print('STRAY\t%s' % n)
# Migrations at the target the committed prod record does not list as applied. Functions wait for
# them, whatever this run's caller says: a /push that found nothing to push must not deploy code
# whose schema an earlier push left unapplied (spec Solution A, "the next /push re-checks").
def migs(name):
    d = json.load(open(os.path.join(work, name)))
    return set((d.get('prod') or {}).get('migrations') or [])
applied = migs('m.head') if rel == 'ahead' else migs('m.origin')
mdir = os.path.join(os.path.dirname(fdir), 'migrations')
for bn in sorted(os.listdir(mdir)) if os.path.isdir(mdir) else []:
    v = re.match(r'[0-9]+', bn)
    if bn.endswith('.sql') and v and v.group(0) not in applied:
        print('PENDMIG\t%s' % bn)
PY

field() { awk -F'\t' -v k="$1" '$1==k{print $2}' "$WORK/plan"; }
fp_of() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["hashes"][sys.argv[2]])' "$WORK/fp.json" "$1"; }
BATCH=(); while IFS= read -r n; do [ -n "$n" ] && BATCH+=("$n"); done < <(field SELECT)
RECOVER=(); while IFS= read -r n; do [ -n "$n" ] && RECOVER+=("$n"); done < <(field RECOVER)
ORPHANS="$(field ORPHAN | tr '\n' ' ' | sed 's/ $//')"
STRAYS="$(field STRAY | tr '\n' ' ' | sed 's/ $//')"
UNTRACE="$(field UNTRACEABLE | tr '\n' ' ' | sed 's/ $//')"
MISSING="$(field MISSING | tr '\n' ' ' | sed 's/ $//')"
PENDMIG_N="$(field PENDMIG | grep -c .)"; PENDMIG_1="$(field PENDMIG | head -1)"

# --- --check: report and stop -----------------------------------------------------------------
if [ "$MODE" = "check" ]; then
  [ -n "$ORPHANS" ] && echo "cp.prodfns: note: orphaned on prod, not deleted: $ORPHANS"
  PROBLEM="$(printf '%s ' ${BATCH[@]+"${BATCH[@]}"} $UNTRACE $STRAYS | sed 's/ $//')"
  [ "$PENDMIG_N" -gt 0 ] && echo "cp.prodfns: note: $PENDMIG_N migration(s) at $SHA9 not recorded as applied on prod (first: $PENDMIG_1); function deploys wait for them"
  if [ -n "$PROBLEM" ]; then
    SF="$(printf '%s\n' ${BATCH[@]+"${BATCH[@]}"} | grep -xF -f "$WORK/smokefail" 2>/dev/null | tr '\n' ' ' | sed 's/ $//')"
    DIFF="$(printf '%s ' ${BATCH[@]+"${BATCH[@]}"} $UNTRACE | sed 's/ $//')"
    WHY="${DIFF:+prod differs from origin/main at $SHA9: $DIFF}${SF:+; not verified by a clean deploy (a failed smoke, or a manual or interrupted deploy): $SF}"
    WHY="$WHY${STRAYS:+${WHY:+; }pending from a deploy never verified clean, but not at origin/main $SHA9, resolve by hand (merge it, or check prod, delete it there if it exists, and drop its line from cp-prod-smoke-failed.txt): $STRAYS}"
    echo "cp.prodfns: problem $PROBLEM ($WHY)"
    exit 1
  fi
  echo "cp.prodfns: ok at $SHA9"
  exit 0
fi

[ -n "$ORPHANS" ] && echo "$TAG: orphaned on prod, not deleted: $ORPHANS"
RESULT="$WORK/result"; : > "$RESULT"
set_state() { printf '%s\t%s\n' "$1" "$2" >> "$RESULT"; }
for n in $UNTRACE; do set_state "$n" "unproven"; done
for n in $MISSING; do set_state "$n" "not deployed (no such function at $SHA9)"; done
for n in $STRAYS; do set_state "$n" "not deployed (pending from a deploy never verified clean, but $SHA9 has no such function; resolve by hand)"; done

stamp() { # fn... — 0 when the stamp commit landed
  local args=() f
  if [ "$REL" = "behind" ]; then
    echo "local main is behind origin/main; a stamp commit there would diverge it. Pull main, and the next run records the stamp without uploading again." > "$WORK/stamp.log"
    return 1
  fi
  for f in "$@"; do args+=(--function "$f"); done
  ( cd "$MAIN" && "$SCRIPT_DIR/stamp-deploy-manifest.sh" --env prod --source-dir "$SRC" --manifest-root "$MAIN" \
      --commit-isolated "chore: stamp prod functions at $SHA9 (P1732)" "${args[@]}" ) >"$WORK/stamp.log" 2>&1
}

finish() {
  local total=0 ok=0 line name state not=""
  while IFS=$'\t' read -r name state; do
    [ -n "$name" ] || continue
    total=$((total + 1))
    if [ "$state" = "deployed" ]; then ok=$((ok + 1)); else echo "  $name: $state"; not="$not, $name: $state"; fi
  done < "$RESULT"
  if [ -s "$WORK/stamp.log" ] && grep -q . "$WORK/stamp.log" && [ "$ok" -lt "$total" ]; then
    sed 's/^/    stamp: /' "$WORK/stamp.log" | tr -d '<>|' | tail -5
  fi
  if [ "$MODE" = "rollback" ]; then
    echo "WARNING: the next /push redeploys $(printf '%s ' "${ROLLBACK_FNS[@]}" | sed 's/ $//') from main unless main is reverted."
  fi
  echo "$TAG: $ok deployed, $((total - ok)) not${not:+ — ${not#, }}"
  [ "$ok" -lt "$total" ] && exit 1
  [ "$ok" -gt 0 ] && echo "$TAG: the stamp commit is on local main and rides the next push."
  exit 0
}

# Recovery of a stamp commit that failed earlier: no upload, no prompt.
if [ ${#RECOVER[@]} -gt 0 ]; then
  if stamp "${RECOVER[@]}"; then
    prodfn_proof_drop "$MAIN" "${RECOVER[@]}" || true
    echo "$TAG: recorded the missing stamp for $(printf '%s ' "${RECOVER[@]}" | sed 's/ $//') at $SHA9 (no upload)"
  else
    for n in "${RECOVER[@]}"; do set_state "$n" "deployed, stamp not recorded"; done
  fi
fi

if [ ${#BATCH[@]} -eq 0 ]; then
  if [ -s "$RESULT" ]; then finish; fi
  echo "$TAG: in sync at $SHA9"
  [ ${#RECOVER[@]} -gt 0 ] && echo "$TAG: the stamp commit is on local main and rides the next push."
  exit 0
fi

if [ "$MODE" != "rollback" ] && [ "$PENDMIG_N" -gt 0 ]; then
  echo "$TAG: waiting on migrations ($PENDMIG_N at $SHA9 not recorded as applied on prod, first: $PENDMIG_1). Nothing was deployed; stale: $(printf '%s ' "${BATCH[@]}" | sed 's/ $//')${STRAYS:+; also pending but not at $SHA9, resolve by hand: $STRAYS}"
  exit 1
fi

echo "$TAG: deploying $(printf '%s ' "${BATCH[@]}" | sed 's/ $//') at $SHA9"
not_all() { for n in "${BATCH[@]}"; do set_state "$n" "not deployed ($1)"; done; finish; }

# --- 3. target, token, preflight ------------------------------------------------------------
ENV_FILE="$MAIN/.env.prod"
[ -f "$ENV_FILE" ] || not_all ".env.prod not found in the main checkout"
SUPABASE_URL="$(grep '^VITE_SUPABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r')"
PROJECT_REF="$(prodfn_ref_from_url "$SUPABASE_URL")" || not_all "target mismatch: .env.prod's VITE_SUPABASE_URL is not of the form https://REF.supabase.co"
WHY="$(prodfn_check_target "$PROJECT_REF")" || not_all "$WHY"
SUPABASE_URL="https://$PROJECT_REF.supabase.co"

# shellcheck source=keyring.sh
source "$SCRIPT_DIR/keyring.sh"
if ! KEYRING_REASON="${KEYRING_REASON:-deploy-prod-functions.sh: deploy $(printf '%s ' "${BATCH[@]}")at $SHA9}" \
     keyring_require PROD_SUPABASE_ACCESS_TOKEN; then
  not_all "the prod token was not unlocked"
fi
export SUPABASE_ACCESS_TOKEN="$PROD_SUPABASE_ACCESS_TOKEN"
export CP_SUPABASE_TOKEN_REF="$PROJECT_REF"

if ! prodfn_preflight "$PROJECT_REF" "$SRC/supabase/functions" "$HASHER" \
     "$SCRIPT_DIR/check-edge-function-secrets.sh" "$WORK" "${BATCH[@]}"; then
  not_all "preflight: $(cat "$WORK/preflight.fatal")"
fi
while IFS= read -r line; do
  [ -n "$line" ] && set_state "${line%%: *}" "not deployed (${line#*: })"
done < "$WORK/preflight.excluded"
GO=(); while IFS= read -r n; do [ -n "$n" ] && GO+=("$n"); done < "$WORK/preflight.ok"

# --- supersession: re-read the live tip before anything uploads -----------------------------
if [ "$MODE" = "deploy" ]; then
  NOW_TIP="$(live_tip)"
  [[ "$NOW_TIP" =~ ^[0-9a-f]{40}$ ]] || { for n in ${GO[@]+"${GO[@]}"}; do set_state "$n" "unproven"; done
    echo "$TAG: unproven (the live tip could not be re-read; nothing uploaded)"; finish; }
  if [ "$NOW_TIP" != "$TIP" ]; then
    echo "$TAG: superseded by ${NOW_TIP:0:9}; nothing uploaded (the next /push deploys it; /day reports its stale functions until then)"
    exit 3
  fi
fi

# --- 4. upload from the clean checkout, then smoke each uploaded function -------------------
# Before anything uploads, every function about to upload is recorded as not yet smoked, and its
# old proof is dropped. A run killed between upload and smoke therefore leaves it selected, never
# "in sync". If the record cannot be written, nothing uploads.
if [ ${#GO[@]} -gt 0 ]; then
  if ! prodfn_smoke_failed_add "$MAIN" "${GO[@]}" || ! prodfn_proof_drop "$MAIN" "${GO[@]}"; then
    for n in "${GO[@]}"; do set_state "$n" "not deployed (the smoke-failure record could not be written)"; done
    finish
  fi
fi
UPLOADED=()
for fn in ${GO[@]+"${GO[@]}"}; do
  flags=(); prodfn_no_verify_jwt "$JWT_LIST" "$fn" && flags=(--no-verify-jwt)
  # --workdir pins the bundle source to the clean checkout whatever the environment says.
  if ( cd "$SRC" && unset SUPABASE_WORKDIR && ${UPT[@]+"${UPT[@]}"} supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --workdir "$SRC" ${flags[@]+"${flags[@]}"} ) >"$WORK/up.$fn" 2>&1; then
    UPLOADED+=("$fn")
  else
    set_state "$fn" "not deployed (upload failed: $(tail -1 "$WORK/up.$fn" | tr -d '<>|'))"
  fi
done

SMOKE="$SRC/scripts/edge-function-smoke.mjs"
HEALTHY=()
for fn in ${UPLOADED[@]+"${UPLOADED[@]}"}; do
  if [ -f "$SMOKE" ] && ( cd "$SRC" && ${NET[@]+"${NET[@]}"} node "$SMOKE" --base-url "$SUPABASE_URL/functions/v1" --only "$fn" ) >"$WORK/smoke.$fn" 2>&1; then
    HEALTHY+=("$fn")
  else
    set_state "$fn" "deployed, smoke failed"   # still in the record written before the upload
  fi
done

# --- 5. stamp only the healthy ones ---------------------------------------------------------
if [ ${#HEALTHY[@]} -gt 0 ]; then
  for fn in "${HEALTHY[@]}"; do
    prodfn_proof_set "$MAIN" "$fn" "$(fp_of "$fn")" || echo "$TAG: warning: the deploy proof for $fn could not be written; a failed stamp then means one more upload"
  done
  prodfn_smoke_failed_clear "$MAIN" "${HEALTHY[@]}" \
    || echo "$TAG: warning: the pending record could not be rewritten; ${HEALTHY[*]} stay pending (the next run redeploys them, or reports unproven while the record stays unreadable)"
  if stamp "${HEALTHY[@]}"; then
    # Once the stamp is committed the proof has done its job; a proof left behind could later
    # vouch for code prod no longer runs (a revert back to this fingerprint after a manual deploy).
    prodfn_proof_drop "$MAIN" "${HEALTHY[@]}" || true
    for fn in "${HEALTHY[@]}"; do set_state "$fn" "deployed"; done
  else
    for fn in "${HEALTHY[@]}"; do set_state "$fn" "deployed, stamp not recorded"; done
  fi
fi
finish
