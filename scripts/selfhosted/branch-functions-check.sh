#!/usr/bin/env bash
# scripts/selfhosted/branch-functions-check.sh — does shared TEST serve THIS branch's edge functions? (P1312)
#
#   branch-functions-check.sh
#
# Read-only. Compares, BY SHA-256 of content, the files this checkout changed (and the shared code
# those functions run on) with the files actually on the self-hosted TEST server. One SSH call
# returns the manifest (provenance only, for the message), the file hashes, the functions
# container's health and start time, and the newest function file's mtime, closed by a sentinel.
# Never reads or deploys prod; needs no keychain item (the same gcloud login the drift check uses).
# First line of output is the status, the exit code is the contract:
#   no changed functions            exit 0   nothing deployed was changed: no network call at all
#   match: <n> file(s)              exit 0, then STARTED: <container start, integer nanoseconds>
#   differs: <names> (server has <branch> from <time>[, uncommitted])   exit 1, then STARTED:, then the fix
# The STARTED line is always the second line of a match or differs. Any deploy recreates the container,
# so a run that sees two different values has seen a deploy happen between them (P1312 review H1).
#   unknown: <reason>               exit 2   NEVER reported as a pass
# Compared: every changed file; plus, so that "match" means the function runs on this branch's code,
# the whole directory of each changed function, all of _shared, deno.json, deno.lock, the router and
# the JWT list. A file in that wider set the branch did NOT change differs only when the server's
# copy is also not main's tip copy (the state a rebase would give).
# The container must be healthy and started after the newest function file, else unknown: files on
# disk the running process has not loaded are not served code.
#
# Output contract (shell-safety.md): no redirect or pipe tokens in the status line. Does not reuse
# deploy-drift.sh's say(), which turns exit 0 into 1.
set -uo pipefail

GCP_PROJECT="gen-lang-client-0869694595"; VM="cp-test-supabase"; ZONE="asia-southeast1-a"
EXPECTED_URL="https://136-85-1-126.sslip.io"
STACK_DIR="/opt/supabase/docker"
FUNCTIONS_VOL="$STACK_DIR/volumes/functions"
DEADLINE="${BFC_DEADLINE:-45}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || true)"
# shellcheck source=lib/deploy-guard.sh
source "$SCRIPT_DIR/lib/deploy-guard.sh"
# shellcheck source=../lib/active-test.sh
source "$SCRIPT_DIR/../lib/active-test.sh"

# say <exit-code> <first line> [more lines]: the status line (stripped of redirect tokens, branch
# names come from a manifest anyone can write), then any fix lines.
say() {
  local rc="$1" first="$2"; shift 2
  printf '%s\n' "$first" | tr -d '<>|'
  [ $# -eq 0 ] || printf '%s\n' "$@"
  exit "$rc"
}
unknown() { say 2 "unknown: $1"; }

[ -n "$REPO" ] || unknown "not inside a checkout of this repository"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
START=$SECONDS
remaining() { local r=$(( DEADLINE - (SECONDS - START) )); [ "$r" -ge 1 ] || r=1; echo "$r"; }

# ---- 1. the changed set (local, no network) ----
git -C "$REPO" rev-parse --verify -q "$DG_MAIN_REF^{commit}" >/dev/null || unknown "local main not found"
base="$(git -C "$REPO" merge-base HEAD "$DG_MAIN_REF" 2>/dev/null)" || unknown "no common history with main"
# core.quotepath=off: git otherwise quotes a non-ASCII path, which the deployed-path filter would drop.
tracked="$(git -C "$REPO" -c core.quotepath=off diff --no-renames --name-only "$base" -- "${DG_INPUT_PATHS[@]}" 2>/dev/null)" || unknown "git could not list this branch's changes"
untracked="$(git -C "$REPO" -c core.quotepath=off ls-files --others --exclude-standard -- "${DG_INPUT_PATHS[@]}" 2>/dev/null)" || unknown "git could not list untracked files"
printf '%s\n%s\n' "$tracked" "$untracked" | dg_filter_deployed_repo_paths | LC_ALL=C sort -u > "$T/changed.repo"
if [ ! -s "$T/changed.repo" ]; then say 0 "no changed functions"; fi
: > "$T/changed.rel"
while IFS= read -r p; do dg_rel_of_repo_path "$p"; done < "$T/changed.repo" | LC_ALL=C sort -u > "$T/changed.rel"

# ---- 2. local reasons for unknown ----
landf="$(dg_land_failed_file "$REPO")"
if [ -n "$landf" ] && [ -s "$landf" ]; then
  IFS=$'\t' read -r ep sha rc log < "$landf"
  unknown "the latest landing deploy failed $(dg_lock_age "$ep") ago (exit $rc, landed ${sha:0:9}), so TEST may hold a half-deployed main. It clears when main's own code deploys successfully: run scripts/selfhosted/deploy-functions.sh from a clean checkout of main"
fi
lockd="$(dg_lock_dir_of "$REPO")"
if [ -n "$lockd" ] && [ -d "$lockd" ]; then
  # A lock whose owner is dead (or ownerless for 10 minutes) is stuck, and the message names the command that clears it.
  stuck="$(dg_lock_stuck "$REPO")" && unknown "$stuck"
  unknown "a TEST deploy is under way (deploy lock held)"
fi

# ---- 3. the target ----
target="$(active_test_target 2>/dev/null)" || unknown "cannot tell which TEST server is active"
[ "$target" = selfhosted ] || unknown "hosted TEST is active; this check covers self-hosted TEST only"
if [ -n "${VITE_SUPABASE_URL:-}" ] && [ "${VITE_SUPABASE_URL%/}" != "$EXPECTED_URL" ]; then
  unknown "VITE_SUPABASE_URL is not the self-hosted server this check reads"
fi
command -v gcloud >/dev/null 2>&1 || PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
command -v gcloud >/dev/null 2>&1 || unknown "gcloud not found"

# ---- 4. one SSH call, one deadline over the whole check ----
dg_deadline "$(remaining)" gcloud auth print-access-token >/dev/null 2>&1; rc=$?
[ "$rc" -ne 124 ] || unknown "gcloud did not answer within the ${DEADLINE}s deadline"
[ "$rc" -eq 0 ] || unknown "gcloud not logged in"

IFS= read -r -d '' REMOTE <<'REMOTE_EOF' || true
set -eo pipefail
M="$STACK_DIR/deploy-manifest.tsv"
if [ -f "$M" ]; then echo BFC:MANIFEST_BEGIN; cat "$M"; echo BFC:MANIFEST_END; else echo BFC:NOMANIFEST; fi
echo BFC:SUMS_BEGIN
( cd "$FUNCTIONS_VOL" && find . -type f -exec sha256sum {} + </dev/null )
echo BFC:SUMS_END
echo "BFC:HEALTH $(docker inspect -f '{{.State.Health.Status}}' supabase-edge-functions 2>/dev/null </dev/null || echo missing)"
started="$(docker inspect -f '{{.State.StartedAt}}' supabase-edge-functions 2>/dev/null </dev/null || echo '')"
python3 - "$FUNCTIONS_VOL" "$started" <<'PY'
import os, re, sys, datetime
vol, s = sys.argv[1], sys.argv[2]
# Both times in integer nanoseconds: whole seconds would let a file written after the container
# started, within the same second, read as written before it.
st = 0
m = re.match(r'(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?', s)
if m:
    try:
        sec = int(datetime.datetime.strptime(m.group(1), '%Y-%m-%dT%H:%M:%S').replace(tzinfo=datetime.timezone.utc).timestamp())
        st = sec * 1000000000 + int((m.group(2) or '0')[:9].ljust(9, '0'))
    except Exception:
        st = 0
if st < 0:
    st = 0
newest = 0
for r, d, files in os.walk(vol):
    for n in files:
        try:
            newest = max(newest, os.stat(os.path.join(r, n)).st_mtime_ns)
        except OSError:
            pass
print('BFC:STARTED %d' % st)
print('BFC:NEWEST %d' % newest)
PY
echo BFC:END
REMOTE_EOF
{ printf 'STACK_DIR=%q\nFUNCTIONS_VOL=%q\n' "$STACK_DIR" "$FUNCTIONS_VOL"; printf '%s\n' "$REMOTE"; } |
  dg_deadline "$(remaining)" gcloud compute ssh "$VM" --project="$GCP_PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet \
    --command 'sudo bash -s' > "$T/server.out" 2> "$T/ssh.err"
rc=$?
[ "$rc" -ne 124 ] || unknown "the server did not answer within the ${DEADLINE}s deadline"
[ "$rc" -eq 0 ] || unknown "could not read the server (ssh exit $rc: $(grep -v -i -E 'numpy|^WARNING:|^$' "$T/ssh.err" | tail -1 | tr -d '<>|' | cut -c1-80))"
tr -d '\r' < "$T/server.out" > "$T/server.clean"
[ "$(grep -v '^$' "$T/server.clean" | tail -1)" = "BFC:END" ] || unknown "the server's answer was cut short (no end marker)"
for tag in BFC:SUMS_BEGIN BFC:SUMS_END; do
  [ "$(grep -c -x "$tag" "$T/server.clean")" = 1 ] || unknown "the server's answer is incomplete ($tag)"
done
if ! { [ "$(grep -c -x BFC:MANIFEST_BEGIN "$T/server.clean")" = 1 ] && [ "$(grep -c -x BFC:MANIFEST_END "$T/server.clean")" = 1 ]; } &&
   [ "$(grep -c -x BFC:NOMANIFEST "$T/server.clean")" != 1 ]; then
  unknown "the server's answer is incomplete (manifest section)"
fi
health="$(sed -n 's/^BFC:HEALTH //p' "$T/server.clean" | head -1)"
started="$(sed -n 's/^BFC:STARTED //p' "$T/server.clean" | head -1)"
newest="$(sed -n 's/^BFC:NEWEST //p' "$T/server.clean" | head -1)"
case "$started" in ''|*[!0-9]*) unknown "the server's answer is incomplete (container start time)" ;; esac
case "$newest" in ''|*[!0-9]*) unknown "the server's answer is incomplete (newest file time)" ;; esac
sed -n '/^BFC:MANIFEST_BEGIN$/,/^BFC:MANIFEST_END$/p' "$T/server.clean" | grep -v '^BFC:' > "$T/manifest.tsv" || true
sed -n '/^BFC:SUMS_BEGIN$/,/^BFC:SUMS_END$/p' "$T/server.clean" |
  sed -n 's|^\([0-9a-f]\{64\}\)  \./\(.*\)$|\2	\1|p' | LC_ALL=C sort > "$T/server.files"
[ -s "$T/server.files" ] || unknown "no function files found on the server"
[ "$health" = healthy ] || unknown "the functions container is ${health:-unreadable}, not healthy"
[ "$started" -gt 0 ] || unknown "could not read when the functions container started"
[ "$started" -ge "$newest" ] || unknown "the functions container started before the newest function file was written, so it may not have loaded it"
have_manifest=0; [ -s "$T/manifest.tsv" ] && have_manifest=1

# ---- the comparison ----
# Functions this branch changed (directories); _shared, main and the deno files are shared inputs.
: > "$T/fns"
while IFS= read -r rel; do
  case "$rel" in _shared/*|main/*|deno.json|deno.lock) ;; */*) echo "${rel%%/*}" ;; esac
done < "$T/changed.rel" | LC_ALL=C sort -u > "$T/fns"

# The wider set: those directories, _shared, the deno files, the router and the JWT list.
specs=(supabase/functions/_shared supabase/functions/deno.json supabase/functions/deno.lock
       supabase/selfhosted/functions-main/index.ts supabase/no-verify-jwt-functions.txt)
while IFS= read -r f; do [ -n "$f" ] && specs+=("supabase/functions/$f"); done < "$T/fns"
git -C "$REPO" -c core.quotepath=off ls-files --cached --others --exclude-standard -- "${specs[@]}" > "$T/wide.raw" 2>/dev/null || unknown "git could not list the files of the changed functions"
dg_filter_deployed_repo_paths < "$T/wide.raw" > "$T/wide.repo"
{
  cat "$T/changed.rel"
  while IFS= read -r p; do dg_rel_of_repo_path "$p"; done < "$T/wide.repo"
  # Files only the server holds under those directories (another branch's additions).
  cut -f1 "$T/server.files" | while IFS= read -r rel; do
    case "$rel" in _shared/*|main/index.ts|main/no-verify-jwt-functions.txt|deno.json|deno.lock) echo "$rel" ;;
      */*) grep -qxF -- "${rel%%/*}" "$T/fns" && echo "$rel" ;; esac
  done
} | LC_ALL=C sort -u | grep -v '^$' > "$T/rels" || true

: > "$T/local.files"
while IFS= read -r rel; do
  p="$(dg_repo_path_of_rel "$rel")"
  if [ -f "$REPO/$p" ]; then printf '%s\t%s\n' "$rel" "$(dg_sha256 "$REPO/$p")"; else printf '%s\tMISSING\n' "$rel"; fi
done < "$T/rels" | LC_ALL=C sort > "$T/local.files"
# Server side, restricted to the compared set.
LC_ALL=C join -t "$(printf '\t')" -a1 -e MISSING -o 0,2.2 "$T/local.files" "$T/server.files" > "$T/server.cmp" ||
  unknown "the comparison could not be completed (join failed)"
LC_ALL=C join -t "$(printf '\t')" -o 0,1.2,2.2 "$T/local.files" "$T/server.cmp" > "$T/cmp.tsv" ||
  unknown "the comparison could not be completed (join failed)"
# One compared line per file asked about: anything else is an incomplete comparison, never a match.
n_files="$(wc -l < "$T/cmp.tsv" | tr -d ' ')"
n_rels="$(grep -c '' "$T/rels" || true)"; n_local="$(grep -c '' "$T/local.files" || true)"
if [ "${n_rels:-0}" -lt 1 ] || [ "$n_files" != "$n_rels" ] || [ "$n_local" != "$n_rels" ]; then
  unknown "the comparison is incomplete (compared ${n_files:-0} of ${n_rels:-0} files)"
fi

main_hash() { # rel -> hash of main's tip copy, or MISSING
  git -C "$REPO" cat-file blob "$DG_MAIN_REF:$(dg_repo_path_of_rel "$1")" > "$T/blob" 2>/dev/null && dg_sha256 "$T/blob" || echo MISSING
}
: > "$T/differs"
while IFS=$'\t' read -r rel lhash shash; do
  [ "$lhash" != "$shash" ] || continue
  if grep -qxF -- "$rel" "$T/changed.rel"; then echo "$rel" >> "$T/differs"; continue; fi
  [ "$shash" = "$(main_hash "$rel")" ] || echo "$rel" >> "$T/differs"
done < "$T/cmp.tsv"

if [ ! -s "$T/differs" ]; then
  if [ "$have_manifest" = 1 ]; then say 0 "match: $n_files file(s)" "STARTED: $started"; fi
  say 0 "match: $n_files file(s) (deployer unknown: no deploy manifest on the server)" "STARTED: $started"
fi

# ---- who deployed what the server holds (message only) ----
# (A case inside $( ) is mis-parsed by the Mac's bash 3.2, so the tops go through a file.)
while IFS= read -r rel; do
  case "$rel" in
    */*) echo "${rel%%/*}" ;;
    *) echo "$rel" ;;
  esac
done < "$T/differs" | LC_ALL=C sort -u > "$T/tops"
tops="$(cat "$T/tops")"
labels=""
for top in $tops; do
  key="$top"; case "$top" in deno.json|deno.lock) key=_shared ;; esac
  line="$(awk -F'\t' -v n="$key" '$1 == "D" && $2 == n { l = $0 } END { print l }' "$T/manifest.tsv")"
  if [ -n "$line" ]; then
    br="$(printf '%s' "$line" | cut -f4 | tr -d '<>|')"; at="$(printf '%s' "$line" | cut -f5)"; dirty="$(printf '%s' "$line" | cut -f6)"
    lab="$br from $at"; [ "$dirty" = 1 ] && lab="$lab, uncommitted"
  elif [ "$have_manifest" = 0 ]; then lab="deployer unknown"
  elif ! grep -q -e "^$key/" "$T/server.files"; then lab="no copy of $top on the server"
  else lab="deployer unknown"; fi
  case "; $labels;" in *"; $lab;"*) ;; *) labels="${labels:+$labels; }$lab" ;; esac
done
names="$(printf '%s\n' $tops | tr '\n' ' ' | sed 's/ $//; s/ /, /g')"

# ---- the fix, as commands that work ----
fixes=()
stale="$(dg_stale_files "$REPO" HEAD 2>/dev/null)" || stale=""
if [ -n "$stale" ]; then
  # A rebase refuses a tree with uncommitted changes to tracked files; stash is not an option here.
  if [ -n "$(git -C "$REPO" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
    fixes+=("Fix: this checkout is behind main on a deployed file, and deploy-functions.sh refuses that. Commit your changes first (a rebase refuses a tree with uncommitted changes), then rebase, then deploy:")
  else
    fixes+=("Fix: this checkout is behind main on a deployed file, and deploy-functions.sh refuses that. Rebase first, then deploy:")
  fi
  fixes+=("  git rebase main")
else
  fixes+=("Fix: deploy this branch's functions to TEST:")
fi
deleted=""; kept=""
while IFS= read -r fn; do
  [ -n "$fn" ] || continue
  present="$(git -C "$REPO" -c core.quotepath=off ls-files --cached --others --exclude-standard -- "supabase/functions/$fn" | dg_filter_deployed_repo_paths)"
  # A tracked file removed from the working tree is still listed: only a file that exists counts.
  alive=0
  while IFS= read -r pp; do [ -n "$pp" ] && [ -f "$REPO/$pp" ] && alive=1; done <<< "$present"
  if [ "$alive" = 1 ]; then kept="$kept $fn"
  # A function this branch deleted needs the pruning full deploy only when it is among the
  # differences, that is, when the server still holds a copy of it.
  elif grep -qxF -- "$fn" "$T/tops"; then deleted="$deleted $fn"; fi
done < "$T/fns"
if [ -n "$deleted" ]; then
  fixes+=("  scripts/selfhosted/deploy-functions.sh")
  fixes+=("WARNING: this branch deleted a function (${deleted# }); only a full deploy removes it, and a full deploy replaces every function and prunes the ones this checkout lacks, including other sessions' work.")
elif [ -n "$kept" ]; then
  for fn in $kept; do fixes+=("  scripts/selfhosted/deploy-functions.sh $fn"); done
else
  for d in "$REPO"/supabase/functions/*/; do
    b="$(basename "$d")"
    case "$b" in
      _shared|main) ;;
      *) echo "$b" ;;
    esac
  done | LC_ALL=C sort > "$T/fnlist"
  first="$(sed -n 1p "$T/fnlist")"
  fixes+=("  scripts/selfhosted/deploy-functions.sh ${first:-<function>}")
  fixes+=("(any named deploy carries _shared, deno.json, deno.lock, the router and the JWT list)")
fi
fixes+=("A deploy recreates the shared functions container, which interrupts any run using TEST right now.")
say 1 "differs: $names (server has $labels)" "STARTED: $started" "${fixes[@]}"
