#!/usr/bin/env bash
# scripts/selfhosted/deploy-drift.sh — does the shared TEST server hold main's edge functions? (P1612)
#
#   deploy-drift.sh
#
# Read-only. Compares, BY CONTENT, the files actually on the server (hashed there over SSH with
# sudo, as the deploy does) with the deployed inputs at local main. The manifest the deploys leave
# (/opt/supabase/docker/deploy-manifest.tsv) is provenance only, but it must exist: a server that
# no P1612 deploy has touched answers unknown. One line:
#   in sync
#   differs: <functions> (behind main: <fns>; branch-only: <fns>)
#   unknown: <reason>          the stamp or the server could not be read; NEVER reported as in sync
# Exit 0 in sync, 1 differs, 2 unknown.
#
# "behind main" = every differing file on the server is a version main once had, or is a file main
# added after the commit the server's copy of that function was deployed from. "branch-only" = some
# differing file matches nothing in main's recent history, or main has a file the server lacks
# because the deploying branch did not have it. "unclassified" = it differs and the deploy's
# recorded commit cannot say why (no record, or a file it had is gone): reported, never guessed.
# Not health.sh: a missing manifest must not turn disk and WAL monitoring unknown.
#
# Output contract (shell-safety.md): no redirect or pipe tokens in the status line.
set -uo pipefail

GCP_PROJECT="gen-lang-client-0869694595"; VM="cp-test-supabase"; ZONE="asia-southeast1-a"
MANIFEST_PATH="/opt/supabase/docker/deploy-manifest.tsv"
FUNCTIONS_VOL="/opt/supabase/docker/volumes/functions"
HISTORY_DEPTH=50
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${DRIFT_REPO:-$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || true)}"
# shellcheck source=lib/deploy-guard.sh
source "$SCRIPT_DIR/lib/deploy-guard.sh"

# What the server comparison cannot see, read locally: the latest landing deploy that failed (until a
# later deploy of main succeeds) and a stuck deploy lock. Appended to whatever the answer is.
extras() {
  local f line ep sha rc log lk
  if [ -n "$REPO" ]; then
    f="$(dg_land_failed_file "$REPO")"
    if [ -n "$f" ] && [ -s "$f" ]; then
      IFS=$'\t' read -r ep sha rc log < "$f"
      echo "WARNING: the latest landing deploy failed $(dg_lock_age "$ep") ago (exit $rc, landed ${sha:0:9}), see ${log:-the landing log}"
    fi
    lk="$(dg_lock_stuck "$REPO")" && echo "WARNING: $lk"
  fi
  return 0
}
# say <exit-code> <answer>: one status line; any warning makes a clean answer a problem (exit 1).
say() {
  local rc="$1" text="$2" ex
  ex="$(extras | tr '\n' ';' | sed 's/;$//; s/;/; /g')"
  echo "$text${ex:+; $ex}"
  if [ -n "$ex" ] && [ "$rc" -eq 0 ]; then rc=1; fi
  exit "$rc"
}
unknown() { say 2 "unknown: $1"; }
[ -n "$REPO" ] || unknown "not inside a checkout of this repository"
git -C "$REPO" rev-parse --verify -q "$DG_MAIN_REF^{commit}" >/dev/null || unknown "local main not found"
command -v gcloud >/dev/null 2>&1 || PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
command -v gcloud >/dev/null 2>&1 || unknown "gcloud not found"
# Say so when the cause is the login, not a missing manifest.
dg_deadline "${DG_GCLOUD_DEADLINE:-30}" gcloud auth print-access-token >/dev/null 2>&1 || unknown "gcloud not logged in (or not answering)"

T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
# Provenance first: a missing manifest and an unreachable server are both unknown, with different words.
dg_deadline "${DG_GCLOUD_DEADLINE:-90}" gcloud compute ssh "$VM" --project="$GCP_PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet \
  --command "sudo test -f $MANIFEST_PATH && sudo cat $MANIFEST_PATH" > "$T/server.tsv" 2>"$T/ssh.err"
rc=$?
if [ "$rc" -eq 1 ]; then unknown "no deploy manifest on the server (not deployed since P1612 shipped)"; fi
[ "$rc" -ne 124 ] || unknown "the server did not answer within the deadline"
[ "$rc" -eq 0 ] || unknown "could not read the server (ssh exit $rc: $(grep -v -i -E 'numpy|^WARNING:|^$' "$T/ssh.err" | tail -1 | tr -d '<>|' | cut -c1-80))"
grep -q '^F	' "$T/server.tsv" || unknown "deploy manifest on the server is empty or unreadable"

# The truth: hash the files the functions container actually serves.
dg_deadline "${DG_GCLOUD_DEADLINE:-90}" gcloud compute ssh "$VM" --project="$GCP_PROJECT" --zone="$ZONE" --tunnel-through-iap --quiet \
  --command "sudo sh -c 'cd $FUNCTIONS_VOL && find . -type f -exec sha256sum {} +'" > "$T/server.sums" 2>/dev/null
rc=$?
[ "$rc" -ne 124 ] || unknown "the server did not answer within the deadline"
[ "$rc" -eq 0 ] || unknown "could not hash the files on the server (ssh exit $rc)"
[ -s "$T/server.sums" ] || unknown "no function files found on the server"
# "<hash>  ./<path>" to "<path><TAB><hash>"
sed -n 's|^\([0-9a-f]\{64\}\)  \./\(.*\)$|\2	\1|p' "$T/server.sums" | LC_ALL=C sort > "$T/server.files"
[ -s "$T/server.files" ] || unknown "could not read the server's file hashes"

# Main side: same shape. supabase/functions/X maps to X; the router and JWT list live under main/.
main_path() { dg_repo_path_of_rel "$1"; } # the repo path for a manifest-relative path (mapping lives in deploy-guard.sh)
: > "$T/main.files"
{
  # The same file-set rule the deploy uses (dg_is_deployed_path): a tracked README beside the
  # function directories, a test or a dotfile is not part of what a deploy ships.
  git -C "$REPO" ls-tree -r --name-only "$DG_MAIN_REF" -- supabase/functions | dg_filter_deployed_repo_paths | sed 's|^supabase/functions/||'
  echo main/index.ts; echo main/no-verify-jwt-functions.txt
} | while IFS= read -r rel; do
  p="$(main_path "$rel")"
  git -C "$REPO" cat-file blob "$DG_MAIN_REF:$p" > "$T/blob" 2>/dev/null || continue
  printf '%s\t%s\n' "$rel" "$(dg_sha256 "$T/blob")" >> "$T/main.files"
done
LC_ALL=C sort -o "$T/main.files" "$T/main.files"
[ -s "$T/main.files" ] || unknown "could not read main's function files"

# Files that differ: in one side only, or with different hashes.
LC_ALL=C join -t "$(printf '\t')" -a1 -a2 -e MISSING -o 0,1.2,2.2 "$T/server.files" "$T/main.files" |
  awk -F'\t' '$2 != $3 { print }' > "$T/diff.tsv"
if [ ! -s "$T/diff.tsv" ]; then say 0 "in sync"; fi

# A server hash that main once had means the server is behind; anything else is branch-only.
history_has() { # rel hash
  local p c; p="$(main_path "$1")"
  for c in $(git -C "$REPO" log -n "$HISTORY_DEPTH" --format=%H "$DG_MAIN_REF" -- "$p"); do
    git -C "$REPO" cat-file blob "$c:$p" > "$T/hist" 2>/dev/null || continue
    [ "$(dg_sha256 "$T/hist")" = "$2" ] && return 0
  done
  return 1
}
# The commit each function directory was last deployed from, from the manifest's D lines.
deploy_commit() { awk -F'\t' -v n="$1" '$1 == "D" && $2 == n { print $3 }' "$T/server.tsv" | tail -1; }
behind=""; only=""; unclass=""; all=""
while IFS=$'\t' read -r rel shash mhash; do
  top="${rel%%/*}"
  case " $all " in *" $top "*) ;; *) all="$all $top" ;; esac
  if [ "$shash" = MISSING ]; then
    # On main, absent on the server. Main added it after the deploy (behind), the deploying branch
    # did not have it (branch-only), or something removed it by hand (unclassified).
    c="$(deploy_commit "$top")"; p="$(main_path "$rel")"
    if [ -z "$c" ] || ! git -C "$REPO" rev-parse -q --verify "$c^{commit}" >/dev/null 2>&1; then kind=unclass
    elif git -C "$REPO" cat-file -e "$c:$p" 2>/dev/null; then kind=unclass
    elif git -C "$REPO" merge-base --is-ancestor "$c" "$DG_MAIN_REF" 2>/dev/null; then kind=behind
    else kind=only; fi
  elif history_has "$rel" "$shash"; then kind=behind
  else kind=only; fi
  case "$kind" in
    only) case " $only " in *" $top "*) ;; *) only="$only $top" ;; esac ;;
    unclass) case " $unclass " in *" $top "*) ;; *) unclass="$unclass $top" ;; esac ;;
    behind) case " $behind " in *" $top "*) ;; *) behind="$behind $top" ;; esac ;;
  esac
done < "$T/diff.tsv"
# One list per function: branch-only wins over unclassified, which wins over behind.
b2=""; u2=""
for f in $behind; do case " $only $unclass " in *" $f "*) ;; *) b2="$b2 $f" ;; esac; done
for f in $unclass; do case " $only " in *" $f "*) ;; *) u2="$u2 $f" ;; esac; done
say 1 "differs:$all (behind main:${b2:- none}; branch-only:${only:- none}; unclassified:${u2:- none})"
