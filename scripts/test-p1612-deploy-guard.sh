#!/usr/bin/env bash
# scripts/test-p1612-deploy-guard.sh — canary for P1612 (a stale checkout cannot put old edge
# functions on the shared TEST server).
#
# Hermetic: throwaway git repos under mktemp, stubbed gcloud and curl on PATH, a HOME of its own.
# The REAL scripts run: scripts/selfhosted/deploy-functions.sh (including the remote half, which
# the gcloud stub executes against a sandbox directory standing in for the VM), the guard library,
# deploy-drift.sh and deploy-on-land.sh. Nothing touches a real server.
#
# Scenarios (each failure path is shown failing; each documented workflow is shown passing):
#   1 stale     behind main on _shared / router / JWT list: refused, full and single, nothing uploaded
#   2 allowed   behind main only on other paths or .test.ts; current with own committed and
#               uncommitted function change; from main itself
#   3 lock      main moves between check and lock; live lock; stale lock is reported, not removed
#   4 probe     one function cannot boot (named, only it), a protected 401 passes, a non-target
#               function breaking after a single-function deploy is caught
#   5 drift     in sync / branch-only / behind main / unknown (no manifest, server unreachable)
#   6 land      the landed commit (--from-commit, extracted by the script itself) is deployed, an uncommitted edit does not
#               ride along, a landing that touches no inputs does not deploy, failure keeps the landing
set -u
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR

SRC_ROOT="${P1612_SRC_ROOT:-$(git rev-parse --show-toplevel)}"
PASS=0; FAIL=0
ok()  { echo "  OK   $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL+1)); }
check() { # name, expected-rc, actual-rc
  if [ "$2" = "$3" ]; then ok "$1 (exit $3)"; else bad "$1 (wanted exit $2, got $3)"; fi
}
has() { # name, file, pattern
  if grep -q -e "$3" "$2" 2>/dev/null; then ok "$1"; else bad "$1 (no '$3' in output: $(head -c 300 "$2" | tr '\n' ' '))"; fi
}
hasnt() {
  if grep -q -e "$3" "$2" 2>/dev/null; then bad "$1 (found '$3')"; else ok "$1"; fi
}

# The scripts under test no longer use process substitution (stderr filtering goes through a temp
# file), so the harness runs where /dev/fd is blocked. If one ever regains it, say so honestly
# instead of reporting dozens of misleading failures.
if grep -q -e '>(' -e '<(' "$SRC_ROOT/scripts/selfhosted/deploy-functions.sh" "$SRC_ROOT/scripts/selfhosted/deploy-drift.sh" "$SRC_ROOT"/scripts/selfhosted/lib/deploy-*.sh 2>/dev/null; then
  if ! [ "$(cat < <(echo ok) 2>/dev/null)" = ok ]; then
    echo "SKIP-ENV: process substitution (/dev/fd) is unavailable here and a script under test uses it. Not a P1612 result." >&2; exit 2
  fi
fi
export DG_LOCK_POLL=1   # the lock wait polls every second, so the contention cases stay quick

TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT
ANON="anon-key-canary-value-12345"
REALGIT="$(command -v git)"
mkdir -p "$TMPROOT/gitfail"
printf '#!/bin/bash\nfor a in "$@"; do [ "$a" = diff ] && { echo "fatal: simulated git failure" >&2; exit 128; }; done\nexec %s "$@"\n' "$REALGIT" > "$TMPROOT/gitfail/git"
chmod +x "$TMPROOT/gitfail/git"

# ---------------------------------------------------------------- fixtures
mk_world() { # name -> sets W (world dir), R (repo), SB (sandbox VM dir)
  W="$TMPROOT/$1"; R="$W/repo"; SB="$W/vm"
  mkdir -p "$W/bin" "$W/home/.config/cp-selfhosted-test" "$SB/stack/volumes/functions" "$SB/tmp" "$W/stubstate/probe"
  printf 'SUPABASE_URL=https://136-85-1-126.sslip.io\nANON_KEY=%s\n' "$ANON" > "$W/home/.config/cp-selfhosted-test/env"
  : > "$SB/stack/functions.env"; echo "env_file functions.env" > "$SB/stack/docker-compose.override.yml"
  : > "$W/stubstate/scp.log"; : > "$W/stubstate/curl-argv.log"

  cat > "$W/bin/gcloud" <<STUB
#!/bin/bash
SB="$SB"; ST="$W/stubstate"
map() { sed -e "s|/opt/supabase/docker|\$SB/stack|g" -e "s|/tmp/|\$SB/tmp/|g"; }
case "\$1 \$2" in
  "auth print-access-token") [ -n "\${STUB_AUTH_FAIL:-}" ] && { echo "ERROR: not logged in" >&2; exit 1; }; echo tok; exit 0 ;;
  "compute scp")
    [ -n "\${STUB_HANG:-}" ] && { echo "Connecting to IAP tunnel..." >&2; exec sleep 60; }
    [ -n "\${STUB_SSH_FAIL:-}" ] && exit 255
    local_f=""; remote=""
    for a in "\$@"; do case "\$a" in --*) ;; compute|scp) ;; cp-test-supabase:*) remote="\${a#cp-test-supabase:}" ;; *) local_f="\$a" ;; esac; done
    echo "\$remote" >> "\$ST/scp.log"
    dest="\$(printf '%s' "\$remote" | map)"; cp "\$local_f" "\$dest"; exit \$? ;;
  "compute ssh")
    [ -n "\${STUB_HANG:-}" ] && { echo "Connecting to IAP tunnel..." >&2; exec sleep 60; }
    [ -n "\${STUB_SSH_FAIL:-}" ] && exit 255
    cmd=""; while [ \$# -gt 0 ]; do [ "\$1" = "--command" ] && { cmd="\$2"; break; }; shift; done
    PATH="$W/bin/vmbin:\$PATH"
    if [ "\$cmd" = "sudo bash -s" ]; then map | bash -s; exit \$?; fi
    mapped="\$(printf '%s' "\${cmd//sudo /}" | map)"; bash -c "\$mapped"; exit \$? ;;
esac
exit 0
STUB
  mkdir -p "$W/bin/vmbin"
  cat > "$W/bin/vmbin/docker" <<'STUB'
#!/bin/bash
case "$1" in inspect) echo healthy ;; logs) ;; esac
exit 0
STUB
  printf '#!/bin/bash\nexit 0\n' > "$W/bin/vmbin/chown"
  printf '#!/bin/bash\nexec shasum -a 256 "$@"\n' > "$W/bin/vmbin/sha256sum"; chmod +x "$W/bin/vmbin/sha256sum"
  cat > "$W/bin/curl" <<STUB
#!/bin/bash
ST="$W/stubstate"
echo "\$*" >> "\$ST/curl-argv.log"
out=""; url=""; prev=""
for a in "\$@"; do [ "\$prev" = "-o" ] && out="\$a"; prev="\$a"; url="\$a"; done
cat >/dev/null   # the -K - config on stdin
fn="\${url##*/}"
status=200; body='ok'
if [ -f "\$ST/probe/\$fn" ]; then status="\$(sed -n 1p "\$ST/probe/\$fn")"; body="\$(sed -n 2p "\$ST/probe/\$fn")"; fi
[ -n "\$out" ] && printf '%s' "\$body" > "\$out"
printf '%s' "\$status"
STUB
  chmod +x "$W/bin/gcloud" "$W/bin/curl" "$W/bin/vmbin/docker" "$W/bin/vmbin/chown"

  mkdir -p "$R"
  (
    cd "$R" && git init -q && git config user.email t@t && git config user.name t && git config commit.gpgsign false
    mkdir -p scripts/selfhosted/lib supabase/functions/_shared supabase/functions/fn-a supabase/functions/fn-b \
             supabase/selfhosted/functions-main
    cp "$SRC_ROOT/scripts/selfhosted/deploy-functions.sh" scripts/selfhosted/
    cp "$SRC_ROOT/scripts/selfhosted/deploy-drift.sh" scripts/selfhosted/
    cp "$SRC_ROOT/scripts/selfhosted/lib/deploy-guard.sh" "$SRC_ROOT/scripts/selfhosted/lib/deploy-on-land.sh" "$SRC_ROOT/scripts/selfhosted/lib/land-job.sh" scripts/selfhosted/lib/
    printf '#!/bin/bash\nexit 0\n' > scripts/check-edge-function-secrets.sh
    chmod +x scripts/check-edge-function-secrets.sh
    echo 'export const v = 1' > supabase/functions/_shared/x.ts
    echo 'main v1' > supabase/functions/fn-a/index.ts
    echo 'main v1' > supabase/functions/fn-b/index.ts
    echo 'test' > supabase/functions/fn-b/index.test.ts
    echo '{}' > supabase/functions/deno.json; echo '{}' > supabase/functions/deno.lock
    echo 'router v1' > supabase/selfhosted/functions-main/index.ts
    echo 'fn-a' > supabase/no-verify-jwt-functions.txt
    echo readme > README.md
    git add -A && git commit -qm seed && git branch -M main
  ) >/dev/null 2>&1
}

commit_on() { # branch file content msg
  ( cd "$R" && git checkout -q "$1" && mkdir -p "$(dirname "$2")" && printf '%s\n' "$3" > "$2" && git add "$2" && git commit -qm "$4" ) >/dev/null 2>&1
}

run_deploy() { # args...; output in $W/out, rc in RC. cwd = repo (or $DEPLOY_CWD)
  ( cd "${DEPLOY_CWD:-$R}" && HOME="$W/home" PATH="${EXTRA_PATH:+$EXTRA_PATH:}$W/bin:$PATH" "$R/scripts/selfhosted/deploy-functions.sh" "$@" ) > "$W/out" 2>&1
  RC=$?
}
uploads() { wc -l < "$W/stubstate/scp.log" | tr -d ' '; }

# ---------------------------------------------------------------- 0 modes
echo "0. shipped scripts are executable (the /day check skips a non-executable one)"
for f in scripts/selfhosted/deploy-drift.sh scripts/selfhosted/deploy-functions.sh scripts/test-p1612-deploy-guard.sh; do
  if [ -x "$SRC_ROOT/$f" ]; then ok "$f is executable on disk"; else bad "$f is not executable"; fi
  mode="$(git -C "$SRC_ROOT" ls-files -s -- "$f" | cut -d' ' -f1)"
  if [ -z "$mode" ] || [ "$mode" = 100755 ]; then ok "  $f index mode ok (${mode:-untracked})"; else bad "  $f index mode is $mode"; fi
done

# ---------------------------------------------------------------- 1 stale
echo "1. stale ancestry is refused"
mk_world s1
( cd "$R" && git checkout -q -b feature/old ) >/dev/null 2>&1
commit_on main supabase/functions/_shared/x.ts 'export const v = 2' "main: shared v2"
commit_on feature/old supabase/functions/fn-a/index.ts 'branch work' "branch change"
run_deploy; check "full deploy from a branch behind main on _shared" 1 "$RC"
has "  names the fix and the count" "$W/out" "behind main on 1 deployed file"
has "  says nothing was deployed" "$W/out" "Nothing was deployed"
check "  nothing uploaded (full)" 0 "$(uploads)"
run_deploy fn-a; check "single-function deploy from the same branch" 1 "$RC"
check "  nothing uploaded (single)" 0 "$(uploads)"
mk_world s1b
( cd "$R" && git checkout -q -b feature/old ) >/dev/null 2>&1
commit_on main supabase/selfhosted/functions-main/index.ts 'router v2' "main: router v2"
( cd "$R" && git checkout -q feature/old ) >/dev/null 2>&1
run_deploy; check "behind on the router only" 1 "$RC"
mk_world s1c
( cd "$R" && git checkout -q -b feature/old ) >/dev/null 2>&1
commit_on main supabase/no-verify-jwt-functions.txt 'fn-a fn-b' "main: jwt list"
( cd "$R" && git checkout -q feature/old ) >/dev/null 2>&1
run_deploy fn-b; check "behind on the JWT list only (single)" 1 "$RC"
# control: the same repo, rebased, now passes (same check passes and refuses)
( cd "$R" && git checkout -q feature/old && git rebase -q main ) >/dev/null 2>&1
run_deploy fn-b; check "  control: after rebasing onto main the same deploy passes" 0 "$RC"

# A git failure must refuse, never read as "no changes" (fail open)
mk_world s1e
run_deploy; check "control: a current checkout deploys" 0 "$RC"
: > "$W/stubstate/scp.log"
EXTRA_PATH="$TMPROOT/gitfail" run_deploy; check "git diff failing refuses the deploy (fails closed)" 1 "$RC"
has "  says it could not compare" "$W/out" "could not compare this checkout with main"
check "  nothing uploaded" 0 "$(uploads)"

# DG_MAIN_REF must not be settable from the environment
mk_world s1d
( cd "$R" && git checkout -q -b feature/old ) >/dev/null 2>&1
commit_on main supabase/functions/_shared/x.ts 'export const v = 2' "main: shared v2"
( cd "$R" && git checkout -q feature/old && git branch -q stale-pointer feature/old ) >/dev/null 2>&1
DG_MAIN_REF=refs/heads/stale-pointer run_deploy; check "DG_MAIN_REF in the environment does not redirect the guard" 1 "$RC"
has "  still refused as behind main" "$W/out" "behind main on 1 deployed file"

# ---------------------------------------------------------------- 2 allowed
echo "2. documented workflows still pass"
mk_world s2
( cd "$R" && git checkout -q -b feature/side ) >/dev/null 2>&1
commit_on main README.md 'readme v2' "main: other path"
commit_on main supabase/functions/fn-b/index.test.ts 'test v2' "main: test only"
( cd "$R" && git checkout -q feature/side ) >/dev/null 2>&1
run_deploy; check "behind main only on other paths and a .test.ts" 0 "$RC"
mk_world s2b
( cd "$R" && git checkout -q -b feature/own ) >/dev/null 2>&1
commit_on feature/own supabase/functions/fn-a/index.ts 'own committed change' "own change"
echo 'uncommitted edit' >> "$R/supabase/functions/fn-a/index.ts"
run_deploy fn-a; check "current with main plus own committed and uncommitted change" 0 "$RC"
mk_world s2c
run_deploy; check "from main itself (full)" 0 "$RC"
has "  probe ran" "$W/out" "probe: all 2 functions answered OPTIONS"
run_deploy fn-a; check "from main itself (single)" 0 "$RC"

# ---------------------------------------------------------------- 3 lock
echo "3. lock and re-read of main"
mk_world s3
(
  cd "$R"
  source scripts/selfhosted/lib/deploy-guard.sh
  git checkout -q -b feature/x
  # Main gains a change to a deployed input between the first check and the lock.
  dg_after_precheck_hook() {
    local t blob idx nt
    t="$(git -C "$R" rev-parse refs/heads/main)"
    blob="$(echo 'export const v = 9' | git -C "$R" hash-object -w --stdin)"
    idx="$(mktemp -u)"
    GIT_INDEX_FILE="$idx" git -C "$R" read-tree "$t"
    GIT_INDEX_FILE="$idx" git -C "$R" update-index --cacheinfo 100644,"$blob",supabase/functions/_shared/x.ts
    nt="$(GIT_INDEX_FILE="$idx" git -C "$R" write-tree)"
    git -C "$R" update-ref refs/heads/main "$(git -C "$R" commit-tree -p "$t" -m shared-moved "$nt")"
    rm -f "$idx"
  }
  dg_guard_begin "$R" HEAD
) > "$W/out" 2>&1
check "main moves between the first check and taking the lock" 1 "$?"
has "  refused as behind" "$W/out" "behind main on 1 deployed file"
if [ -d "$R/.git/cp-test-deploy.lock" ]; then bad "  lock released after the refusal"; else ok "  lock released after the refusal"; fi

mk_world s3b
mkdir "$R/.git/cp-test-deploy.lock"; printf 'pid=%s\nhost=%s\nepoch=%s\n' "$$" "$(hostname)" "$(( $(date +%s) - 30 ))" > "$R/.git/cp-test-deploy.lock/owner"
run_deploy; check "a second deploy while the lock is held by a live run" 1 "$RC"
has "  names the live holder" "$W/out" "another TEST deploy is running"
check "  nothing uploaded" 0 "$(uploads)"
dead=999999; while kill -0 "$dead" 2>/dev/null; do dead=$((dead+1)); done
printf 'pid=%s\nhost=%s\nepoch=%s\n' "$dead" "$(hostname)" "$(( $(date +%s) - 7200 ))" > "$R/.git/cp-test-deploy.lock/owner"
run_deploy; check "stale lock from a dead run" 1 "$RC"
has "  reported as stale with its age" "$W/out" "stale TEST deploy lock from a dead run (pid $dead, 72[0-9][0-9]s old)"
has "  with the exact command to clear it" "$W/out" "rm -r '.*/cp-test-deploy.lock'"
if [ -d "$R/.git/cp-test-deploy.lock" ]; then ok "  stale lock was not removed silently"; else bad "  stale lock was not removed silently"; fi
rm -rf "$R/.git/cp-test-deploy.lock"
run_deploy; check "  lock gone: deploy proceeds, and releases its lock" 0 "$RC"
if [ -d "$R/.git/cp-test-deploy.lock" ]; then bad "  lock released after a successful deploy"; else ok "  lock released after a successful deploy"; fi

# ---------------------------------------------------------------- 4 probe
echo "4. post-deploy probe"
mk_world s4
printf '500\n{"msg":"InvalidWorkerCreation: boot error"}\n' > "$W/stubstate/probe/fn-b"
run_deploy; check "a function that cannot boot fails the deploy" 1 "$RC"
has "  names fn-b" "$W/out" "fn-b(500)"
hasnt "  does not name fn-a" "$W/out" "fn-a("
check "  files were uploaded (deployed, then failed)" 1 "$(uploads)"
printf '401\n{"error":"Unauthorized"}\n' > "$W/stubstate/probe/fn-b"
run_deploy; check "a protected function answering 401 with its own body passes" 0 "$RC"
printf '405\nmethod not allowed\n' > "$W/stubstate/probe/fn-b"
run_deploy; check "a function answering 405 passes" 0 "$RC"
has "  each function's status is printed" "$W/out" "probe: fn-b answered 405"
printf '429\nslow down\n' > "$W/stubstate/probe/fn-b"
run_deploy; check "a function answering 429 passes" 0 "$RC"
printf '500\n{"error":"Service temporarily unavailable"}\n' > "$W/stubstate/probe/fn-b"
run_deploy; check "a function's own 500 {error} body also fails (any 5xx fails)" 1 "$RC"
has "  names it" "$W/out" "fn-b(500)"
printf '000\n\n' > "$W/stubstate/probe/fn-b"
run_deploy; check "transport failure / timeout fails" 1 "$RC"
rm -f "$W/stubstate/probe/fn-b"
run_deploy; check "baseline full deploy passes" 0 "$RC"
printf '500\n{"msg":"boot error: _shared import"}\n' > "$W/stubstate/probe/fn-b"
run_deploy fn-a; check "single-function deploy of fn-a, but non-target fn-b is broken" 1 "$RC"
has "  names the non-target function" "$W/out" "fn-b(500)"
hasnt "  does not name the target" "$W/out" "fn-a("
rm -f "$W/stubstate/probe/fn-b"
printf '404\nnot found\n' > "$W/stubstate/probe/fn-a"
run_deploy; check "a function the router cannot find (404) fails" 1 "$RC"
rm -f "$W/stubstate/probe/fn-a"
for f in fn-a fn-b; do printf '401\n{"error":"x"}\n' > "$W/stubstate/probe/$f"; done
run_deploy; check "no function answers 2xx (probe not reaching workers): fails" 1 "$RC"
rm -f "$W/stubstate/probe/"*
run_deploy; check "  control: healthy again" 0 "$RC"
if grep -q "$ANON" "$W/stubstate/curl-argv.log"; then bad "anon key never appears in curl argv"; else ok "anon key never appears in curl argv"; fi
if grep -q "$ANON" "$W/out"; then bad "anon key never printed"; else ok "anon key never printed"; fi

# ---------------------------------------------------------------- 5 drift
echo "5. drift check"
run_drift() { ( cd "$R" && HOME="$W/home" PATH="${EXTRA_PATH:+$EXTRA_PATH:}$W/bin:$PATH" "$R/scripts/selfhosted/deploy-drift.sh" ) > "$W/dout" 2>&1; DRC=$?; }
mk_world s5
run_deploy; check "setup: full deploy from main" 0 "$RC"
run_drift; check "after a full deploy from main" 0 "$DRC"; has "  reads in sync" "$W/dout" "^in sync"
# single-function deploy from a current branch with its own change
( cd "$R" && git checkout -q -b feature/own ) >/dev/null 2>&1
commit_on feature/own supabase/functions/fn-a/index.ts 'branch only change' "own change"
run_deploy fn-a; check "setup: single deploy of a branch's own change" 0 "$RC"
run_drift; check "after the branch deploy" 1 "$DRC"
has "  names fn-a as branch-only" "$W/dout" "branch-only: fn-a"
hasnt "  fn-b untouched" "$W/dout" "fn-b"
( cd "$R" && git checkout -q main ) >/dev/null 2>&1
run_deploy; check "setup: full deploy from main again" 0 "$RC"
run_drift; check "back to in sync after a full deploy from main" 0 "$DRC"
# server older than main
commit_on main supabase/functions/fn-b/index.ts 'main v2' "main moves fn-b"
run_drift; check "server holds an older copy than main" 1 "$DRC"
has "  reads behind main, naming fn-b" "$W/dout" "behind main: fn-b"
# older copy replaced on the server (shared file)
commit_on main supabase/functions/_shared/x.ts 'export const v = 3' "main moves shared"
run_deploy; check "setup: deploy main" 0 "$RC"
run_drift; check "in sync after redeploying main" 0 "$DRC"
# a server file replaced behind the manifest's back: the manifest still says in sync, the files do not
older="$(git -C "$R" show "$(git -C "$R" rev-list --max-parents=0 main):supabase/functions/fn-b/index.ts")"
[ -n "$older" ] || bad "setup: found an older version of fn-b in history"
printf '%s\n' "$older" > "$W/vm/stack/volumes/functions/fn-b/index.ts"
run_drift; check "a server file replaced by an older copy (manifest untouched)" 1 "$DRC"
has "  reads behind main, naming fn-b" "$W/dout" "behind main: fn-b"
run_deploy; run_drift; check "  control: redeploy restores in sync" 0 "$DRC"
echo 'hand edit never in main' > "$W/vm/stack/volumes/functions/fn-a/index.ts"
run_drift; check "a server file edited to content main never had" 1 "$DRC"
has "  reads branch-only, naming fn-a" "$W/dout" "branch-only: fn-a"
echo 'stray' > "$W/vm/stack/volumes/functions/fn-a/stray.ts"
run_deploy; run_drift; check "  control: full redeploy restores in sync (stray file pruned with its dir)" 0 "$DRC"
# unknown cases
rm -f "$W/vm/stack/deploy-manifest.tsv"
run_drift; check "manifest missing" 2 "$DRC"; has "  says unknown, never in sync" "$W/dout" "^unknown"
run_deploy; run_drift; check "  control: manifest back" 0 "$DRC"
STUB_SSH_FAIL=1 run_drift; check "server unreachable" 2 "$DRC"; has "  says unknown" "$W/dout" "^unknown"
: > "$W/vm/stack/deploy-manifest.tsv"
run_drift; check "manifest empty" 2 "$DRC"

echo "5b. one file-set rule for the deploy and the drift check"
mk_world s5b
commit_on main supabase/functions/README.md 'tracked top-level file' "main: top-level readme"
echo junk > "$R/supabase/functions/.DS_Store"; echo junk > "$R/supabase/functions/stray.txt"
echo junk > "$R/supabase/functions/fn-a/.DS_Store"; mkdir -p "$R/supabase/functions/fn-a/deep"; echo junk > "$R/supabase/functions/fn-a/deep/.hidden"
run_deploy; check "full deploy from main with stray top-level file, tracked top-level file and .DS_Store files present" 0 "$RC"
run_drift; check "  reads in sync" 0 "$DRC"; has "  says in sync" "$W/dout" "^in sync"
for f in .DS_Store stray.txt README.md fn-a/.DS_Store fn-a/deep/.hidden; do
  if [ -e "$W/vm/stack/volumes/functions/$f" ]; then bad "  $f was not shipped"; else ok "  $f was not shipped"; fi
done
if [ -f "$W/vm/stack/volumes/functions/fn-a/index.ts" ]; then ok "  real function files were shipped"; else bad "  real function files were shipped"; fi

echo "5c. a file main has and the server lacks"
mk_world s5c
commit_on main supabase/functions/fn-a/extra.ts 'extra v1' "main: extra file"
run_deploy; check "setup: full deploy from main" 0 "$RC"
( cd "$R" && git checkout -q -b feature/del && git rm -q supabase/functions/fn-a/extra.ts && git commit -qm "branch deletes extra" ) >/dev/null 2>&1
run_deploy fn-a; check "setup: single deploy from a branch that deleted the file" 0 "$RC"
run_drift; check "main has the file, the server lacks it, the deploy came from a branch" 1 "$DRC"
has "  reads branch-only" "$W/dout" "branch-only: fn-a"
( cd "$R" && git checkout -q main ) >/dev/null 2>&1
run_deploy; run_drift; check "  control: full deploy from main restores in sync" 0 "$DRC"
commit_on main supabase/functions/fn-b/added-later.ts 'added later' "main: adds a file after the deploy"
run_drift; check "main added a file after the deploy" 1 "$DRC"
has "  reads behind main" "$W/dout" "behind main: fn-b"
grep -v -P '^D\tfn-b\t' "$W/vm/stack/deploy-manifest.tsv" > "$W/m.tmp" 2>/dev/null || awk -F'\t' '!($1=="D" && $2=="fn-b")' "$W/vm/stack/deploy-manifest.tsv" > "$W/m.tmp"
cp "$W/m.tmp" "$W/vm/stack/deploy-manifest.tsv"
run_drift; check "same file, but the deploy's commit for fn-b is not recorded" 1 "$DRC"
has "  reads unclassified, not a guess" "$W/dout" "unclassified: fn-b"
hasnt "  not called behind main" "$W/dout" "behind main: fn-b"

# ---------------------------------------------------------------- 6 land
echo "6. landing deploys the landed commit"
mk_world s6
# a stand-in active-test lib and a recording deploy script, in the repo that will be archived
mkdir -p "$R/scripts/lib"
cat > "$R/scripts/lib/active-test.sh" <<'LIB'
active_test_target() { [ -n "${STUB_ACTIVE_FAIL:-}" ] && return 2; echo "${STUB_ACTIVE:-selfhosted}"; }
LIB
( cd "$R" && git add scripts/lib/active-test.sh && git commit -qm "active-test stub" ) >/dev/null 2>&1
before="$(git -C "$R" rev-parse HEAD)"
echo 'landed v2' > "$R/supabase/functions/fn-a/index.ts"
( cd "$R" && git add supabase/functions/fn-a/index.ts && git commit -qm "land: fn-a v2" ) >/dev/null 2>&1
after="$(git -C "$R" rev-parse HEAD)"
echo 'UNCOMMITTED' > "$R/supabase/functions/fn-a/dirty.ts"
echo 'dirty edit' >> "$R/supabase/functions/fn-b/index.ts"
# The landing deploy is detached: the hook returns at once and a background job writes the log.
# land() runs the hook, then waits for that job to log its END line. LRC is the hook's own exit
# status; $W/lout is the hook's stderr followed by what the job logged.
wait_jobs() { # count log
  local i; for i in $(seq 1 400); do
    [ "$(grep -c LAND-JOB-END "$2" 2>/dev/null || true)" -ge "$1" ] && return 0; sleep 0.2
  done; echo "(timed out waiting for the landing job)" >&2; return 1
}
hook() { ( source "$R/scripts/selfhosted/lib/deploy-on-land.sh"; HOME="$W/home" PATH="${EXTRA_PATH:+$EXTRA_PATH:}$W/bin:$PATH" deploy_test_on_land "$R" "$1" "$2" ) > "$W/hook" 2>&1; LRC=$?; }
jobs_done() { grep -c LAND-JOB-END "$R/.git/cp-test-deploy-land.log" 2>/dev/null || true; }
land() { # before after
  local lf="$R/.git/cp-test-deploy-land.log" size0 n0
  size0="$(wc -c < "$lf" 2>/dev/null || echo 0)"; size0="${size0// /}"; n0="$(jobs_done)"
  hook "$1" "$2"
  if grep -q "started in the background" "$W/hook"; then wait_jobs $((n0 + 1)) "$lf"; fi
  { cat "$W/hook"; tail -c +$((size0 + 1)) "$lf" 2>/dev/null; } > "$W/lout"
}
land "$before" "$after"; check "landing a function change runs the real deploy from an extract" 0 "$LRC"
has "  the hook said the deploy started in the background" "$W/lout" "started in the background"
has "  deployed main's tip after the landing" "$W/lout" "deployed main's tip after landing ${after:0:9}"
mf="$W/vm/stack/deploy-manifest.tsv"
has "  manifest records the landed commit, branch main, clean" "$mf" "^D.fn-a.$after.main.[0-9TZ:-]*.0$"
# Positive evidence first: a failed deploy would also "not contain" the dirty edits.
fa="$W/vm/stack/volumes/functions/fn-a"; fb="$W/vm/stack/volumes/functions/fn-b"
if [ -f "$fa/index.ts" ] && [ -f "$fb/index.ts" ] && [ -d "$W/vm/stack/volumes/functions/_shared" ]; then ok "deployed artifacts exist on the server"; else bad "deployed artifacts exist on the server"; fi
if [ -f "$R/supabase/functions/fn-a/dirty.ts" ] && grep -q 'dirty edit' "$R/supabase/functions/fn-b/index.ts"; then ok "the dirty edits really are in the checkout"; else bad "the dirty edits really are in the checkout"; fi
if [ ! -e "$fa/dirty.ts" ]; then ok "uncommitted file did not ride along"; else bad "uncommitted file did not ride along"; fi
if ! grep -q 'dirty edit' "$fb/index.ts"; then ok "uncommitted edit to fn-b did not ride along"; else bad "uncommitted edit to fn-b did not ride along"; fi
has "  server holds the committed content" "$W/vm/stack/volumes/functions/fn-a/index.ts" "landed v2"
: > "$W/stubstate/scp.log"
echo 'readme v3' > "$R/README.md"; git -C "$R" add README.md; git -C "$R" commit -qm "land: readme" >/dev/null 2>&1
land "$after" "$(git -C "$R" rev-parse HEAD)"; check "landing that touches no deployed input" 0 "$LRC"
check "  does not deploy" 0 "$(uploads)"
[ ! -s "$W/lout" ] && ok "  prints nothing" || bad "  prints nothing ($(head -c 100 "$W/lout"))"
STUB_ACTIVE=hosted land "$before" "$after"; check "active TEST is hosted" 0 "$LRC"
has "  skips with a reason" "$W/lout" "not self-hosted: not deploying"
# fail closed: an unknown target never deploys
: > "$W/stubstate/scp.log"
STUB_ACTIVE=bogus land "$before" "$after"; check "resolver answers something unexpected" 0 "$LRC"
has "  skips" "$W/lout" "not deploying"
STUB_ACTIVE_FAIL=1 land "$before" "$after"; check "resolver fails" 0 "$LRC"
has "  skips, target unknown" "$W/lout" "'unknown', not self-hosted"
mv "$R/scripts/lib/active-test.sh" "$R/scripts/lib/active-test.sh.off"
land "$before" "$after"; check "resolver library missing" 0 "$LRC"
has "  skips and says why" "$W/lout" "cannot load the active-TEST resolver"
mv "$R/scripts/lib/active-test.sh.off" "$R/scripts/lib/active-test.sh"
check "  nothing was uploaded in any of the three" 0 "$(uploads)"
# failure keeps the landing and prints loudly
printf '500\n{"msg":"boot error"}\n' > "$W/stubstate/probe/fn-a"
land "$before" "$after"; check "failed deploy leaves the landing intact (returns 0)" 0 "$LRC"
has "  prints the failure loudly" "$W/lout" "DEPLOY FAILED"
if [ "$(git -C "$R" rev-parse HEAD)" != "$after" ] && git -C "$R" merge-base --is-ancestor "$after" HEAD; then ok "  landing still on main"; else bad "  landing still on main"; fi
rm -f "$W/stubstate/probe/fn-a"
echo "6a. landing under contention (the landing itself never waits)"
mk_world s6d
mkdir -p "$R/scripts/lib"; echo 'active_test_target() { echo selfhosted; }' > "$R/scripts/lib/active-test.sh"
( cd "$R" && git add -A && git commit -qm stub ) >/dev/null 2>&1
run_deploy; check "setup: server on main" 0 "$RC"
b0="$(git -C "$R" rev-parse HEAD)"
commit_on main supabase/functions/fn-a/index.ts 'M2 content' "main: M2"
m2="$(git -C "$R" rev-parse HEAD)"
LOCK="$R/.git/cp-test-deploy.lock"; LOGF="$R/.git/cp-test-deploy-land.log"
holder_lock() { sleep 120 & holder=$!; mkdir "$LOCK"; printf 'pid=%s\nhost=%s\nepoch=%s\n' "$holder" "$(hostname)" "$(date +%s)" > "$LOCK/owner"; }
holder_stop() { kill "$holder" 2>/dev/null; wait "$holder" 2>/dev/null; rm -rf "$LOCK"; }
holder_lock
( sleep 4; kill "$holder" 2>/dev/null; rm -rf "$LOCK" ) &
releaser=$!
n0="$(jobs_done)"; t0=$SECONDS
CP_LAND_LOCK_WAIT=60 hook "$b0" "$m2"; el=$((SECONDS - t0))
check "the landing hook returns 0 while a deploy holds the lock" 0 "$LRC"
if [ "$el" -lt 3 ]; then ok "  and at once (${el}s), not after the lock frees"; else bad "  and at once (took ${el}s)"; fi
has "  prints one line: started in the background, with the log path" "$W/hook" "started in the background (log: .*cp-test-deploy-land.log)"
wait_jobs $((n0 + 1)) "$LOGF"; wait "$releaser" 2>/dev/null
has "  the job waited for the running deploy and said so" "$LOGF" "Waiting for the running TEST deploy"
has "  then deployed" "$LOGF" "deployed main's tip after landing"
has "  server holds main's content" "$W/vm/stack/volumes/functions/fn-a/index.ts" "M2 content"
has "  manifest records main's tip" "$W/vm/stack/deploy-manifest.tsv" "^D.fn-a.$m2"
# a lock that never frees: bounded wait, recorded failure
holder_lock
commit_on main supabase/functions/fn-a/index.ts 'M3 content' "main: M3"
m3="$(git -C "$R" rev-parse HEAD)"
n0="$(jobs_done)"
CP_LAND_LOCK_WAIT=2 hook "$m2" "$m3"; check "a lock that never frees: the hook still returns 0 at once" 0 "$LRC"
wait_jobs $((n0 + 1)) "$LOGF"
has "  the job logged DEPLOY FAILED" "$LOGF" "DEPLOY FAILED"
has "  server unchanged" "$W/vm/stack/volumes/functions/fn-a/index.ts" "M2 content"
if [ -s "$R/.git/cp-test-deploy-land.failed" ]; then ok "  failure record written"; else bad "  failure record written"; fi
run_drift; check "  the drift check reports the failed landing (exit 1)" 1 "$DRC"
has "  names it in the status line" "$W/dout" "WARNING: the latest landing deploy failed"
holder_stop
# interactive deploys still refuse at once
holder_lock
t0=$SECONDS; run_deploy; el=$((SECONDS - t0))
check "an interactive deploy against a held lock refuses" 1 "$RC"
if [ "$el" -lt 3 ]; then ok "  and at once (${el}s)"; else bad "  and at once (took ${el}s)"; fi
holder_stop
# the next landing succeeds, which clears the failure record
land "$m2" "$m3"
has "  a later successful landing deploys main's tip" "$W/lout" "deployed main's tip after landing"
has "  server now holds M3" "$W/vm/stack/volumes/functions/fn-a/index.ts" "M3 content"
if [ -e "$R/.git/cp-test-deploy-land.failed" ]; then bad "  failure record cleared by the later success"; else ok "  failure record cleared by the later success"; fi
run_drift; check "  drift reads clean again" 0 "$DRC"
# two quick landings: both hooks return at once, the server ends on the newer one
commit_on main supabase/functions/fn-a/index.ts 'M4 content' "main: M4"
m4="$(git -C "$R" rev-parse HEAD)"
n0="$(jobs_done)"; size0="$(wc -c < "$LOGF" | tr -d ' ')"
hook "$m2" "$m3"; r1=$LRC; hook "$m3" "$m4"; r2=$LRC
check "two quick landings: first hook" 0 "$r1"; check "  second hook" 0 "$r2"
wait_jobs $((n0 + 2)) "$LOGF"
if [ "$(tail -c +$((size0 + 1)) "$LOGF" | grep -c 'DEPLOY FAILED' || true)" -eq 0 ]; then ok "  no DEPLOY FAILED from either job"; else bad "  no DEPLOY FAILED from either job"; tail -n 25 "$LOGF" | cut -c1-200 >&2; fi
has "  server ends on the newer commit's content" "$W/vm/stack/volumes/functions/fn-a/index.ts" "M4 content"
has "  manifest records the newer commit" "$W/vm/stack/deploy-manifest.tsv" "^D.fn-a.$m4"
if [ -d "$LOCK" ]; then bad "  lock released"; else ok "  lock released"; fi

echo "6b2. locks left behind"
# a provably dead owner: a landing clears it and says so; an interactive deploy reports the exact command
dead=999999; while kill -0 "$dead" 2>/dev/null; do dead=$((dead+1)); done
mkdir "$LOCK"; printf 'pid=%s\nhost=%s\nepoch=%s\n' "$dead" "$(hostname)" "$(( $(date +%s) - 900 ))" > "$LOCK/owner"
run_deploy; check "interactive deploy with a dead owner's lock refuses, removes nothing" 1 "$RC"
has "  with the exact command" "$W/out" "rm -r '.*/cp-test-deploy.lock'"
[ -d "$LOCK" ] && ok "  lock still there" || bad "  lock still there"
run_drift; has "  drift reports the stuck lock" "$W/dout" "WARNING: stuck deploy lock (owner pid $dead is dead"
commit_on main supabase/functions/fn-a/index.ts 'M5 content' "main: M5"
m5="$(git -C "$R" rev-parse HEAD)"
land "$m4" "$m5"
has "a landing clears the provably dead lock and says so" "$W/lout" "Cleared a stale TEST deploy lock left by dead pid $dead"
has "  and deploys" "$W/vm/stack/volumes/functions/fn-a/index.ts" "M5 content"
# a lock from another host is never provably dead
mkdir "$LOCK"; printf 'pid=%s\nhost=%s\nepoch=%s\n' "$dead" "some-other-machine" "$(( $(date +%s) - 900 ))" > "$LOCK/owner"
commit_on main supabase/functions/fn-a/index.ts 'M6 content' "main: M6"
m6="$(git -C "$R" rev-parse HEAD)"
CP_LAND_LOCK_WAIT=3 land "$m5" "$m6"
has "a lock owned by another host is not cleared" "$W/lout" "DEPLOY FAILED"
[ -d "$LOCK" ] && ok "  and is still there" || bad "  and is still there"
rm -rf "$LOCK"
# an ownerless lock (an old branch's wrapper): the landing waits the full bound, then refuses
mkdir "$LOCK"
n0="$(jobs_done)"; size0="$(wc -c < "$LOGF" | tr -d ' ')"; t0=$SECONDS
CP_LAND_LOCK_WAIT=14 hook "$m5" "$m6"
wait_jobs $((n0 + 1)) "$LOGF"; el=$((SECONDS - t0))
tail -c +$((size0 + 1)) "$LOGF" > "$W/jl"
has "ownerless lock, never freed: refused only after the bound" "$W/jl" "no usable owner record"
if [ "$el" -ge 13 ]; then ok "  after waiting the full bound (${el}s, not a short grace)"; else bad "  after waiting the full bound (only ${el}s)"; fi
[ -d "$LOCK" ] && ok "  ownerless lock is never removed" || bad "  ownerless lock is never removed"
# freed meanwhile, it proceeds
n0="$(jobs_done)"
( sleep 4; rm -rf "$LOCK" ) &
rel2=$!
CP_LAND_LOCK_WAIT=60 hook "$m5" "$m6"; wait_jobs $((n0 + 1)) "$LOGF"; wait "$rel2" 2>/dev/null
has "ownerless lock freed meanwhile: the landing proceeds and deploys" "$W/vm/stack/volumes/functions/fn-a/index.ts" "M6 content"

echo "6b3. clearing a dead lock is atomic"
dead=999999; while kill -0 "$dead" 2>/dev/null; do dead=$((dead+1)); done
LOCK2="$R/.git/cp-test-deploy.lock"; rm -rf "$LOCK2" "$LOCK2.clear"
# B decided the lock was dead, then A cleared it and took a fresh one; B's clear must remove nothing
mkdir "$LOCK2"; printf 'pid=%s\nhost=%s\nepoch=%s\n' "$dead" "$(hostname)" "$(date +%s)" > "$LOCK2/owner"
sleep 60 & live=$!
(
  source "$R/scripts/selfhosted/lib/deploy-guard.sh"
  dg_before_clear_hook() { rm -rf "$LOCK2"; mkdir "$LOCK2"; printf 'pid=%s\nhost=%s\nepoch=%s\n' "$live" "$(hostname)" "$(date +%s)" > "$LOCK2/owner"; }
  dg_lock_acquire "$R" 0 1
) > "$W/b.out" 2>&1; brc=$?
check "B's clear after A re-acquired: B does not get the lock" 1 "$brc"
if [ "$(sed -n 's/^pid=//p' "$LOCK2/owner" 2>/dev/null)" = "$live" ]; then ok "  A's live lock is untouched (owner pid $live)"; else bad "  A's live lock is untouched"; fi
hasnt "  and nothing was reported as cleared" "$W/b.out" "Cleared a stale"
[ -d "$LOCK2.clear" ] && bad "  clearing mutex released" || ok "  clearing mutex released"
kill "$live" 2>/dev/null; wait "$live" 2>/dev/null; rm -rf "$LOCK2"
# two real jobs against one dead lock never hold it together
mkdir "$LOCK2"; printf 'pid=%s\nhost=%s\nepoch=%s\n' "$dead" "$(hostname)" "$(date +%s)" > "$LOCK2/owner"
two() { # name
  ( source "$R/scripts/selfhosted/lib/deploy-guard.sh"
    dg_lock_acquire "$R" 30 1 >/dev/null 2>&1 || { echo "$1 NOLOCK" >> "$W/two.log"; exit 1; }
    echo "$1 start $(perl -MTime::HiRes=time -e 'printf "%.2f", time')" >> "$W/two.log"
    sleep 2
    echo "$1 end $(perl -MTime::HiRes=time -e 'printf "%.2f", time')" >> "$W/two.log"
    dg_lock_release ) &
}
: > "$W/two.log"; two A; two B; wait
sa="$(awk '$1=="A"&&$2=="start"{print $3}' "$W/two.log")"; sb="$(awk '$1=="B"&&$2=="start"{print $3}' "$W/two.log")"
if [ -n "$sa" ] && [ -n "$sb" ] && perl -e 'exit(abs($ARGV[0]-$ARGV[1]) >= 1.9 ? 0 : 1)' "$sa" "$sb"; then ok "two jobs on one dead lock: they ran one after the other ($sa, $sb)"; else bad "two jobs on one dead lock ran at once or failed: $(tr '\n' ' ' < "$W/two.log")"; fi
# a lock whose pid exists but may not be signalled is not dead; a failing ps changes nothing
mkdir -p "$W/fakeps"; printf '#!/bin/bash\nexit 1\n' > "$W/fakeps/ps"; chmod +x "$W/fakeps/ps"
mkdir "$LOCK2"; printf 'pid=1\nhost=%s\nepoch=%s\n' "$(hostname)" "$(date +%s)" > "$LOCK2/owner"
( source "$R/scripts/selfhosted/lib/deploy-guard.sh"; PATH="$W/fakeps:$PATH"; dg_lock_owner_dead "$LOCK2" ); r=$?
check "a pid we may not signal (EPERM), ps blocked: not dead" 1 "$r"
printf 'pid=%s\nhost=%s\nepoch=%s\n' "$dead" "$(hostname)" "$(date +%s)" > "$LOCK2/owner"
( source "$R/scripts/selfhosted/lib/deploy-guard.sh"; PATH="$W/fakeps:$PATH"; dg_lock_owner_dead "$LOCK2" ); r=$?
check "a dead pid, ps blocked: still provably dead (no ps involved)" 0 "$r"
rm -rf "$LOCK2"

echo "6b4. the failure record is written while the deploy lock is still held"
git -C "$R" checkout -q main 2>/dev/null
tipsha="$(git -C "$R" rev-parse HEAD)"
rm -f "$R/.git/cp-test-deploy-land.failed"
( for i in $(seq 1 400); do [ -d "$LOCK2" ] && break; sleep 0.02; done
  while [ -d "$LOCK2" ]; do :; done
  [ -s "$R/.git/cp-test-deploy-land.failed" ] && echo RECORD-BEFORE-RELEASE || echo RECORD-AFTER-RELEASE ) > "$W/obs" 2>&1 &
obs=$!
( cd "$R" && HOME="$W/home" PATH="$W/bin:$PATH" STUB_SSH_FAIL=1 "$R/scripts/selfhosted/deploy-functions.sh" --from-main-tip --lock-wait 5 --record-landing "$tipsha" ) > "$W/out" 2>&1; RC=$?
wait "$obs"
[ "$RC" -ne 0 ] && ok "a failing landing deploy exits non-zero (exit $RC)" || bad "a failing landing deploy exits non-zero"
has "  the record names the landed commit and the exit status" "$R/.git/cp-test-deploy-land.failed" "$tipsha.$RC."
has "  it was already there when the lock was released" "$W/obs" "RECORD-BEFORE-RELEASE"

echo "6c. deadlines"
commit_on main supabase/functions/fn-a/index.ts 'M7 content' "main: M7"
m7="$(git -C "$R" rev-parse HEAD)"
n0="$(jobs_done)"; t0=$SECONDS
STUB_HANG=1 DG_GCLOUD_DEADLINE=3 hook "$m6" "$m7"; el=$((SECONDS - t0))
check "a hung gcloud: the landing hook returns 0" 0 "$LRC"
if [ "$el" -lt 3 ]; then ok "  at once (${el}s)"; else bad "  at once (took ${el}s)"; fi
wait_jobs $((n0 + 1)) "$LOGF"
tail -n 12 "$LOGF" > "$W/jl"
has "  the job says the gcloud call timed out" "$W/jl" "gcloud call timed out after 3s"
has "  gcloud's own stderr stays visible" "$W/jl" "Connecting to IAP tunnel"
has "  and DEPLOY FAILED is logged" "$W/jl" "DEPLOY FAILED"
[ -d "$LOCK" ] && bad "  lock released after the timeout" || ok "  lock released after the timeout"
n0="$(jobs_done)"
STUB_HANG=1 DG_GCLOUD_DEADLINE=100 CP_LAND_JOB_DEADLINE=3 hook "$m6" "$m7"
wait_jobs $((n0 + 1)) "$LOGF"; tail -n 6 "$LOGF" > "$W/jl"
has "the whole background job has a hard deadline too" "$W/jl" "timed out after 3s"
[ -d "$LOCK" ] && bad "  lock released after the job deadline" || ok "  lock released after the job deadline"
t0=$SECONDS; STUB_HANG=1 DG_GCLOUD_DEADLINE=2 run_drift; el=$((SECONDS - t0))
check "drift against a hung server" 2 "$DRC"; has "  says unknown, deadline" "$W/dout" "unknown: the server did not answer within the deadline"
if [ "$el" -lt 10 ]; then ok "  within the deadline (${el}s)"; else bad "  within the deadline (took ${el}s)"; fi
STUB_AUTH_FAIL=1 run_drift; check "drift with gcloud logged out" 2 "$DRC"
has "  says so, not 'no manifest'" "$W/dout" "unknown: gcloud not logged in"
hasnt "  not blamed on the manifest" "$W/dout" "manifest"
run_deploy; check "  control: a real deploy restores the server" 0 "$RC"

echo "6d. the hook runs the script from main's tip, not the working tree"
mk_world s6e
mkdir -p "$R/scripts/lib"; echo 'active_test_target() { echo selfhosted; }' > "$R/scripts/lib/active-test.sh"
( cd "$R" && git add -A && git commit -qm stub ) >/dev/null 2>&1
b0="$(git -C "$R" rev-parse HEAD)"
commit_on main supabase/functions/fn-a/index.ts 'tip content' "main: tip"
tip="$(git -C "$R" rev-parse HEAD)"
printf '#!/bin/bash\necho "CO-TENANT EDIT RAN"; exit 99\n' > "$R/scripts/selfhosted/deploy-functions.sh"
land "$b0" "$tip"
hasnt "a co-tenant's uncommitted edit to the deploy script does not run" "$W/lout" "CO-TENANT EDIT RAN"
has "  main's tip is deployed" "$W/vm/stack/volumes/functions/fn-a/index.ts" "tip content"

echo "6e. real git-ops, end to end"
SRC_GOPS="$SRC_ROOT/scripts"
add_gitops() { # active-test answer
  ( cd "$R"
    cp "$SRC_GOPS/git-ops.sh" "$SRC_GOPS/ship-gates.sh" scripts/
    mkdir -p scripts/lib .claude/worktrees features/done/2026-04-22
    for f in gate-override.sh admin-close.sh worktree-changes.sh decisions-merge.py lib-datetime.sh; do [ -f "$SRC_GOPS/lib/$f" ] && cp "$SRC_GOPS/lib/$f" scripts/lib/; done
    cp "$SRC_GOPS/lib-datetime.sh" scripts/ 2>/dev/null
    printf 'active_test_target() { echo %s; }\n' "$1" > scripts/lib/active-test.sh
    : > features/done/2026-04-22/.gitkeep
    printf '.claude/worktrees/\n' > .gitignore
    git add .gitignore scripts features >/dev/null; git commit -qm "gitops tooling" ) >/dev/null 2>&1
}
gops() { ( cd "$R" && HOME="$W/home" PATH="$W/bin:$PATH" bash "$R/scripts/git-ops.sh" "$@" ); }
ship_fixture() { # a feature branch p101 with a function change, a spec and a review receipt
  ( cd "$R"; git checkout -q -b feature/p101-demo; printf 'landed via ship\n' > supabase/functions/fn-a/index.ts; git add supabase/functions/fn-a/index.ts; git commit -qm "p101: fn"; git checkout -q main
    printf -- '---\nstatus: qa\ntype: task\nrank: 1\ntags: [demo]\ndelivery_stage: fix\npipeline_ran: [fix]\n---\n# p101: Demo\n\nProblem: demo.\n\n## Done-When\n\n- [x] fixture\n' > features/p101_demo.md
    git add features/p101_demo.md; git commit -qm "chore: add p101 spec"
    printf '{"type": "code", "pn": "p101", "branch": "feature/p101-demo", "sha": "%s", "timestamp": "%s", "issues_found": 0, "issues_fixed": 0}\n' "$(git rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .git/.finish-reviewed ) >/dev/null 2>&1
}
mk_world g1; add_gitops selfhosted
printf 'landed via commit-to-main\n' > "$R/supabase/functions/fn-a/index.ts"
LOGF="$R/.git/cp-test-deploy-land.log"
t0=$SECONDS; STUB_HANG=1 DG_GCLOUD_DEADLINE=8 gops commit-to-main --message "e2e: fn change" --files supabase/functions/fn-a/index.ts > "$W/o" 2> "$W/e"; GRC=$?; el=$((SECONDS - t0))
check "commit-to-main with a hung gcloud returns 0" 0 "$GRC"
if [ "$el" -lt 6 ]; then ok "  without waiting for the deploy (${el}s)"; else bad "  without waiting for the deploy (took ${el}s)"; fi
[ ! -s "$W/o" ] && ok "  stdout is empty, as before" || bad "  stdout is empty ($(head -c 80 "$W/o"))"
has "  stderr has the one started-in-the-background line" "$W/e" "TEST functions: deploy of main's tip started in the background"
[ "$(git -C "$R" log -1 --format=%s)" = "e2e: fn change" ] && ok "  the commit landed" || bad "  the commit landed"
wait_jobs 1 "$LOGF"
has "  the job later logged its failure" "$LOGF" "DEPLOY FAILED"
run_drift; has "  and drift reports it" "$W/dout" "WARNING: the latest landing deploy failed"
# healthy: the same commit-to-main lands and the server follows
printf 'second change\n' > "$R/supabase/functions/fn-a/index.ts"
gops commit-to-main --message "e2e: second" --files supabase/functions/fn-a/index.ts > "$W/o" 2> "$W/e"; GRC=$?
check "commit-to-main, healthy" 0 "$GRC"; wait_jobs 2 "$LOGF"
has "  the server follows" "$W/vm/stack/volumes/functions/fn-a/index.ts" "second change"
run_drift; check "  and drift is clean again" 0 "$DRC"
: > "$W/stubstate/scp.log"; echo x >> "$R/README.md"
gops commit-to-main --message "e2e: docs" --files README.md > "$W/o" 2> "$W/e"; GRC=$?
check "a docs-only commit-to-main" 0 "$GRC"; check "  does not deploy" 0 "$(uploads)"
hasnt "  and prints nothing about TEST" "$W/e" "TEST functions"

mk_world g2; add_gitops selfhosted; ship_fixture
LOGF="$R/.git/cp-test-deploy-land.log"
t0=$SECONDS; STUB_HANG=1 DG_GCLOUD_DEADLINE=8 gops ship p101 > "$W/o" 2> "$W/e"; GRC=$?; el=$((SECONDS - t0))
check "ship with a hung gcloud returns 0" 0 "$GRC"
if [ "$el" -lt 6 ]; then ok "  without waiting for the deploy (${el}s)"; else bad "  without waiting for the deploy (took ${el}s)"; fi
[ "$(tail -n 1 "$W/o")" = "Ready to push." ] && ok "  stdout still ends with Ready to push." || bad "  stdout still ends with Ready to push. ($(tail -n 1 "$W/o"))"
has "  stderr has the started-in-the-background line" "$W/e" "TEST functions: deploy of main's tip started in the background"
wait_jobs 1 "$LOGF"
has "  the detached job logged its failure" "$LOGF" "DEPLOY FAILED"
mk_world g3; add_gitops selfhosted; ship_fixture
LOGF="$R/.git/cp-test-deploy-land.log"
gops ship p101 > "$W/o" 2> "$W/e"; GRC=$?
check "ship, healthy" 0 "$GRC"; wait_jobs 1 "$LOGF"
has "  the server follows the landed commit" "$W/vm/stack/volumes/functions/fn-a/index.ts" "landed via ship"
run_drift; check "  and drift reads in sync" 0 "$DRC"

echo "5d. top-level deno.json and deno.lock in the drift check"
mk_world s5d
run_deploy; check "setup: full deploy from main" 0 "$RC"
run_drift; check "in sync before" 0 "$DRC"
commit_on main supabase/functions/deno.json '{"imports":{"a":"b"}}' "main: deno.json changes"
run_drift; check "main changed deno.json after the deploy" 1 "$DRC"
has "  reads behind main, naming deno.json" "$W/dout" "behind main: deno.json"
run_deploy; run_drift; check "  redeploy restores in sync" 0 "$DRC"
echo 'tampered' > "$W/vm/stack/volumes/functions/deno.lock"
run_drift; check "deno.lock edited on the server" 1 "$DRC"
has "  reads branch-only, naming deno.lock" "$W/dout" "branch-only: deno.lock"
run_deploy

# --from-commit: the script extracts the commit itself and runs the same guard
mk_world s6b
old="$(git -C "$R" rev-parse HEAD)"
commit_on main supabase/functions/_shared/x.ts 'export const v = 5' "main: shared"
newer="$(git -C "$R" rev-parse HEAD)"
run_deploy --from-commit "$old"; check "--from-commit of a commit behind main on _shared is refused" 1 "$RC"
has "  by the same guard" "$W/out" "behind main on 1 deployed file"
check "  nothing uploaded" 0 "$(uploads)"
run_deploy --from-commit "$newer"; check "--from-commit of main's tip deploys" 0 "$RC"
( cd "$R" && git checkout -q -b feature/off-main ) >/dev/null 2>&1
commit_on feature/off-main supabase/functions/fn-a/index.ts 'off main' "off main"
offmain="$(git -C "$R" rev-parse HEAD)"
run_deploy --from-commit "$offmain"; check "--from-commit of a commit that is not on main is refused" 1 "$RC"
has "  says why" "$W/out" "is not on main"
run_deploy --from-commit deadbeef; check "--from-commit of a non-commit is refused" 1 "$RC"
# nothing in the checkout can stand in for provenance
( cd "$R" && git checkout -q -b feature/stale2 "$old" ) >/dev/null 2>&1
printf 'repo=%s\ncommit=%s\n' "$R" "$newer" > "$R/.deploy-source"
run_deploy; check "a stale checkout with a .deploy-source naming main's tip is still refused" 1 "$RC"
has "  as behind main" "$W/out" "behind main on 1 deployed file"
rm -f "$R/.deploy-source"

# a resumed ship keeps the journal's baseline
echo "6b. ship baseline survives a resume"
mk_world s6c
( source "$R/scripts/selfhosted/lib/deploy-on-land.sh"
  start="$(git -C "$R" rev-parse HEAD)"
  echo 'landed in the first run' > "$R/supabase/functions/fn-a/index.ts"; git -C "$R" add -A; git -C "$R" commit -qm "pick 1" >/dev/null
  echo 'second pick' > "$R/README.md"; git -C "$R" add -A; git -C "$R" commit -qm "pick 2" >/dev/null
  tip="$(git -C "$R" rev-parse HEAD)"
  [ "$(deploy_land_baseline "$R" "$start")" = "$start" ] && echo "BASE-JOURNAL" || echo "BASE-WRONG"
  [ "$(deploy_land_baseline "$R" "")" = "$tip" ] && echo "BASE-FALLBACK" || echo "BASE-FALLBACK-WRONG"
  [ "$(deploy_land_baseline "$R" "0000000000000000000000000000000000000000")" = "$tip" ] && echo "BASE-BOGUS" || echo "BASE-BOGUS-WRONG"
  # the failure being fixed: baseline recaptured at resume time sees no function change
  git -C "$R" diff --name-only "$tip" "$tip" -- supabase/functions | grep -q . && echo "RECAPTURE-DEPLOYS" || echo "RECAPTURE-SKIPS"
  git -C "$R" diff --name-only "$start" "$tip" -- supabase/functions | grep -q . && echo "JOURNAL-DEPLOYS" || echo "JOURNAL-SKIPS"
) > "$W/bout" 2>&1
has "journal start_head is used when valid" "$W/bout" "BASE-JOURNAL"
has "falls back to HEAD when the journal has none" "$W/bout" "BASE-FALLBACK$"
has "falls back to HEAD for a bogus sha" "$W/bout" "BASE-BOGUS$"
has "recapturing at resume would skip the deploy (the bug)" "$W/bout" "RECAPTURE-SKIPS"
has "the journal baseline still sees the function change" "$W/bout" "JOURNAL-DEPLOYS"
if grep -q 'ship_journal_str "\$pn" start_head' "$SRC_ROOT/scripts/git-ops.sh" && grep -q 'deploy_land_baseline' "$SRC_ROOT/scripts/git-ops.sh"; then ok "cmd_ship reads the journal start_head through deploy_land_baseline"; else bad "cmd_ship reads the journal start_head"; fi
if grep -q '_land_sha' "$SRC_ROOT/scripts/git-ops.sh" && ! grep -q 'rev-parse "\$_hop_snap^"' "$SRC_ROOT/scripts/git-ops.sh"; then ok "commit-to-main hook uses the SHA captured under the lock"; else bad "commit-to-main hook uses the lock-time SHA"; fi

# ---------------------------------------------------------------- health.sh unchanged
echo "8. health.sh is untouched"
if git -C "$SRC_ROOT" diff --quiet HEAD -- scripts/selfhosted/health.sh scripts/selfhosted/day-health.sh; then ok "health.sh and day-health.sh have no diff against HEAD"; else bad "health.sh / day-health.sh changed"; fi

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
