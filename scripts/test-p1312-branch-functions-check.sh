#!/usr/bin/env bash
# scripts/test-p1312-branch-functions-check.sh — canary for P1312 (a branch's E2E run says whether
# shared TEST serves the branch's own edge functions).
#
# Hermetic, on the pattern of test-p1612-deploy-guard.sh: throwaway git repos under mktemp, a stubbed
# gcloud and curl on PATH, a HOME of its own. The REAL scripts run: branch-functions-check.sh,
# deploy-functions.sh (including its remote half, executed by the gcloud stub against a sandbox
# directory standing in for the VM) and the guard library. Nothing contacts a real server.
#
# Sections:
#   1 differs     a changed function not on the server; the printed fix command, run, makes it match
#   2 sequences   deploy then check is 0; deploy, edit, check is 1 (the tool's own documented workflow)
#   3 shared      a _shared-only change; two functions; behind main; a deleted function; a rename
#   4 other       another branch's copy of an unchanged _shared file differs, main's tip copy passes
#   5 no network  a branch that changed no deployed file never calls gcloud
#   6 unknown     every way the check cannot tell exits 2, each next to a passing control
#   7 manifest    a missing manifest with matching hashes
#   8 deploy      the deploy says what it replaces
#   9 playwright  the hooks under a real Playwright run (empty spec, stub check script, no TEST)
set -u
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR

SRC_ROOT="${P1312_SRC_ROOT:-$(git rev-parse --show-toplevel)}"
PASS=0; FAIL=0
ok()  { echo "  OK   $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL+1)); }
check() { if [ "$2" = "$3" ]; then ok "$1 (exit $3)"; else bad "$1 (wanted exit $2, got $3)"; fi; }
has() { if grep -q -e "$3" "$2" 2>/dev/null; then ok "$1"; else bad "$1 (no '$3' in: $(head -c 400 "$2" | tr '\n' ' '))"; fi; }
hasnt() { if grep -q -e "$3" "$2" 2>/dev/null; then bad "$1 (found '$3')"; else ok "$1"; fi; }
first_line_is() { # name file prefix
  if [ "$(head -1 "$2" 2>/dev/null | cut -c1-${#3})" = "$3" ]; then ok "$1"; else bad "$1 (first line: $(head -1 "$2" 2>/dev/null))"; fi
}

export DG_LOCK_POLL=1
TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT
ANON="anon-key-canary-value-12345"
SELF_URL="https://136-85-1-126.sslip.io"
HOSTED_URL="https://hosted-stub.supabase.invalid"

# ---------------------------------------------------------------- fixtures
mk_world() { # name -> W (world dir), R (repo), SB (sandbox VM dir)
  W="$TMPROOT/$1"; R="$W/repo"; SB="$W/vm"
  mkdir -p "$W/bin/vmbin" "$W/home/.config/cp-selfhosted-test" "$SB/stack/volumes/functions" "$SB/tmp" "$W/stubstate"
  printf 'SUPABASE_URL=%s\nANON_KEY=%s\n' "$SELF_URL" "$ANON" > "$W/home/.config/cp-selfhosted-test/env"
  : > "$SB/stack/functions.env"; echo "env_file functions.env" > "$SB/stack/docker-compose.override.yml"
  : > "$W/stubstate/gcloud-calls.log"
  # The active-server file the resolver reads: self-hosted.
  printf 'VITE_SUPABASE_URL=%s\nSELFHOSTED_TEST_ORIGIN=%s\n' "$SELF_URL" "$SELF_URL" > "$W/active-selfhosted.env"
  printf 'VITE_SUPABASE_URL=%s\n' "$HOSTED_URL" > "$W/active-hosted.env"
  cat > "$W/bin/gcloud" <<STUB
#!/bin/bash
SB="$SB"; ST="$W/stubstate"
echo "\$*" >> "\$ST/gcloud-calls.log"
map() { sed -e "s|/opt/supabase/docker|\$SB/stack|g" -e "s|/tmp/|\$SB/tmp/|g"; }
case "\$1 \$2" in
  "auth print-access-token") [ -n "\${STUB_AUTH_FAIL:-}" ] && { echo "ERROR: not logged in" >&2; exit 1; }; echo tok; exit 0 ;;
  "compute scp")
    [ -n "\${STUB_HANG:-}" ] && { echo "Connecting to IAP tunnel..." >&2; exec sleep 60; }
    [ -n "\${STUB_SSH_FAIL:-}" ] && exit 255
    local_f=""; remote=""
    for a in "\$@"; do case "\$a" in --*) ;; compute|scp) ;; cp-test-supabase:*) remote="\${a#cp-test-supabase:}" ;; *) local_f="\$a" ;; esac; done
    dest="\$(printf '%s' "\$remote" | map)"; cp "\$local_f" "\$dest"; exit \$? ;;
  "compute ssh")
    [ -n "\${STUB_HANG:-}" ] && { echo "Connecting to IAP tunnel..." >&2; exec sleep 60; }
    [ -n "\${STUB_SSH_FAIL:-}" ] && exit 255
    cmd=""; while [ \$# -gt 0 ]; do [ "\$1" = "--command" ] && { cmd="\$2"; break; }; shift; done
    PATH="$W/bin/vmbin:\$PATH"
    if [ "\$cmd" = "sudo bash -s" ]; then
      if [ -n "\${STUB_TRUNCATE:-}" ]; then map | bash -s | sed '\$d'; exit 0; fi
      map | bash -s; exit \$?
    fi
    mapped="\$(printf '%s' "\${cmd//sudo /}" | map)"; bash -c "\$mapped"; exit \$? ;;
esac
exit 0
STUB
  # docker: health and StartedAt come from files so a scenario can set them.
  cat > "$W/bin/vmbin/docker" <<STUB
#!/bin/bash
ST="$W/stubstate"
case "\$*" in
  *StartedAt*) cat "\$ST/started" 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%S.000000000Z ;;
  *Health*) cat "\$ST/health" 2>/dev/null || echo healthy ;;
esac
exit 0
STUB
  printf '#!/bin/bash\nexit 0\n' > "$W/bin/vmbin/chown"
  printf '#!/bin/bash\nexec shasum -a 256 "$@"\n' > "$W/bin/vmbin/sha256sum"
  cat > "$W/bin/curl" <<STUB
#!/bin/bash
cat >/dev/null
out=""; prev=""
for a in "\$@"; do [ "\$prev" = "-o" ] && out="\$a"; prev="\$a"; done
[ -n "\$out" ] && printf ok > "\$out"
printf 200
STUB
  chmod +x "$W/bin/gcloud" "$W/bin/curl" "$W/bin/vmbin/docker" "$W/bin/vmbin/chown" "$W/bin/vmbin/sha256sum"

  mkdir -p "$R"
  (
    cd "$R" && git init -q && git config user.email t@t && git config user.name t && git config commit.gpgsign false
    mkdir -p scripts/selfhosted/lib scripts/lib supabase/functions/_shared supabase/functions/fn-a supabase/functions/fn-b \
             supabase/selfhosted/functions-main
    cp "$SRC_ROOT/scripts/selfhosted/deploy-functions.sh" "$SRC_ROOT/scripts/selfhosted/branch-functions-check.sh" "$SRC_ROOT/scripts/selfhosted/flip-test-env.py" scripts/selfhosted/
    cp "$SRC_ROOT/scripts/selfhosted/lib/deploy-guard.sh" scripts/selfhosted/lib/
    cp "$SRC_ROOT/scripts/lib/active-test.sh" scripts/lib/
    printf '#!/bin/bash\nexit 0\n' > scripts/check-edge-function-secrets.sh
    chmod +x scripts/check-edge-function-secrets.sh
    echo 'export const v = 1' > supabase/functions/_shared/x.ts
    echo 'export const w = 1' > supabase/functions/_shared/y.ts
    echo 'main v1' > supabase/functions/fn-a/index.ts
    echo 'main v1' > supabase/functions/fn-b/index.ts
    echo '{}' > supabase/functions/deno.json; echo '{}' > supabase/functions/deno.lock
    echo 'router v1' > supabase/selfhosted/functions-main/index.ts
    echo 'fn-a' > supabase/no-verify-jwt-functions.txt
    echo readme > README.md
    git add -A && git commit -qm seed && git branch -M main
  ) >/dev/null 2>&1
  ACTIVE="$W/active-selfhosted.env"
}
commit_on() { # branch file content msg
  ( cd "$R" && git checkout -q "$1" && mkdir -p "$(dirname "$2")" && printf '%s\n' "$3" > "$2" && git add "$2" && git commit -qm "$4" ) >/dev/null 2>&1
}
branch() { ( cd "$R" && git checkout -q -b "$1" ) >/dev/null 2>&1; }
checkout() { ( cd "$R" && git checkout -q "$1" ) >/dev/null 2>&1; }
envrun() { HOME="$W/home" PATH="$W/bin:$PATH" CP_ACTIVE_TEST_FILE="$ACTIVE" "$@"; }
run_deploy() { ( cd "$R" && envrun "$R/scripts/selfhosted/deploy-functions.sh" "$@" ) > "$W/out" 2>&1; RC=$?; }
run_check() { ( cd "$R" && envrun "$R/scripts/selfhosted/branch-functions-check.sh" ) > "$W/cout" 2>&1; CRC=$?; }
# Run every printed fix command (the lines indented by two spaces), in order, in the repo.
run_fixes() {
  local cmd; : > "$W/fixout"; FRC=0; NFIX=0
  while IFS= read -r cmd; do
    NFIX=$((NFIX+1))
    ( cd "$R" && envrun bash -c "$cmd" ) >> "$W/fixout" 2>&1 || FRC=$?
  done < <(grep '^  [a-z]' "$W/cout" | sed 's/^  //')
}
gcloud_calls() { wc -l < "$W/stubstate/gcloud-calls.log" | tr -d ' '; }

echo "0. shipped scripts are executable"
for f in scripts/selfhosted/branch-functions-check.sh scripts/test-p1312-branch-functions-check.sh; do
  if [ -x "$SRC_ROOT/$f" ]; then ok "$f is executable on disk"; else bad "$f is not executable"; fi
done

# ---------------------------------------------------------------- 1 differs
echo "1. a changed function not on the server"
mk_world s1
run_deploy; check "setup: main deployed to the server" 0 "$RC"
branch feature/a
commit_on feature/a supabase/functions/fn-a/index.ts 'branch change' "change fn-a"
run_check; check "branch changed fn-a, server holds main's" 1 "$CRC"
first_line_is "  status line starts with differs:" "$W/cout" "differs: fn-a"
has "  names who deployed it" "$W/cout" "server has main from 20"
has "  prints the deploy command" "$W/cout" "^  scripts/selfhosted/deploy-functions.sh fn-a$"
has "  says a deploy recreates the container" "$W/cout" "recreates the shared functions container"
run_fixes; check "  the printed command, run, succeeds" 0 "$FRC"
check "  exactly one command was printed" 1 "$NFIX"
run_check; check "  after running it the check matches" 0 "$CRC"
first_line_is "  match line" "$W/cout" "match: "
# a function that is not on the server at all
mk_world s1b
run_deploy
branch feature/n
commit_on feature/n supabase/functions/fn-c/index.ts 'brand new' "add fn-c"
run_check; check "a new function the server lacks" 1 "$CRC"
has "  says it is not on the server" "$W/cout" "no copy of fn-c on the server"
run_fixes; check "  its printed command works" 0 "$FRC"
run_check; check "  then matches" 0 "$CRC"
# uncommitted and untracked work counts
mk_world s1c
run_deploy; branch feature/u
echo 'uncommitted edit' >> "$R/supabase/functions/fn-b/index.ts"
run_check; check "an uncommitted edit to fn-b differs" 1 "$CRC"
first_line_is "  names fn-b" "$W/cout" "differs: fn-b"
( cd "$R" && git checkout -q -- supabase/functions/fn-b/index.ts ) >/dev/null 2>&1
echo 'untracked' > "$R/supabase/functions/fn-b/extra.ts"
run_check; check "an untracked new file in fn-b differs" 1 "$CRC"

# ---------------------------------------------------------------- 2 sequences
echo "2. the documented sequences (deploy, check, edit, check)"
mk_world s2
branch feature/seq
commit_on feature/seq supabase/functions/fn-a/index.ts 'seq change' "change fn-a"
run_deploy fn-a; check "deploy fn-a from the branch with the real deploy script" 0 "$RC"
run_check; check "check right after the deploy" 0 "$CRC"
first_line_is "  reads match" "$W/cout" "match: "
echo 'edited after the deploy' >> "$R/supabase/functions/fn-a/index.ts"
run_check; check "deploy, edit, check" 1 "$CRC"
first_line_is "  names fn-a" "$W/cout" "differs: fn-a"
has "  names this branch as the deployer" "$W/cout" "feature/seq from 20"
has "  marks it as an uncommitted deploy only when it was" "$W/cout" "feature/seq from [0-9T:Z-]*)"

# ---------------------------------------------------------------- 3 shared, several, behind, deleted, rename
echo "3a. a _shared-only change"
mk_world s3
run_deploy; branch feature/sh
commit_on feature/sh supabase/functions/_shared/x.ts 'export const v = 5' "shared v5"
run_check; check "_shared changed locally, absent on the server" 1 "$CRC"
first_line_is "  names _shared" "$W/cout" "differs: _shared"
has "  prints a named deploy of the first function alphabetically" "$W/cout" "^  scripts/selfhosted/deploy-functions.sh fn-a$"
hasnt "  never prints _shared as a function name" "$W/cout" "deploy-functions.sh _shared"
run_fixes; check "  the printed command works" 0 "$FRC"
run_check; check "  _shared now matches on the server" 0 "$CRC"
echo "3b. deno.lock and the router and the JWT list are shared inputs too"
mk_world s3d
run_deploy; branch feature/dl
commit_on feature/dl supabase/functions/deno.lock '{"v":2}' "lock"
run_check; check "deno.lock changed" 1 "$CRC"
run_fixes; run_check; check "  matches after its printed command" 0 "$CRC"
commit_on feature/dl supabase/selfhosted/functions-main/index.ts 'router v9' "router"
run_check; check "router changed" 1 "$CRC"
run_fixes; run_check; check "  matches after its printed command" 0 "$CRC"
commit_on feature/dl supabase/no-verify-jwt-functions.txt 'fn-a fn-b' "jwt"
run_check; check "JWT list changed" 1 "$CRC"
run_fixes; run_check; check "  matches after its printed command" 0 "$CRC"

echo "3c. two changed functions print two commands"
mk_world s3e
run_deploy; branch feature/two
commit_on feature/two supabase/functions/fn-a/index.ts 'two a' "a"
commit_on feature/two supabase/functions/fn-b/index.ts 'two b' "b"
run_check; check "fn-a and fn-b changed" 1 "$CRC"
has "  prints fn-a" "$W/cout" "^  scripts/selfhosted/deploy-functions.sh fn-a$"
has "  prints fn-b" "$W/cout" "^  scripts/selfhosted/deploy-functions.sh fn-b$"
run_fixes; check "  both commands work" 0 "$FRC"
check "  two commands" 2 "$NFIX"
run_check; check "  then matches" 0 "$CRC"

echo "3d. a branch behind main prints rebase first"
mk_world s3f
run_deploy; branch feature/old
commit_on main supabase/functions/_shared/x.ts 'export const v = 2' "main: shared v2"
commit_on feature/old supabase/functions/fn-a/index.ts 'old branch work' "branch change"
run_check; check "behind main on _shared, changed fn-a" 1 "$CRC"
first_line_is "  status names fn-a" "$W/cout" "differs: fn-a"
if [ "$(grep -n 'git rebase main' "$W/cout" | head -1 | cut -d: -f1)" -lt "$(grep -n 'deploy-functions.sh fn-a' "$W/cout" | head -1 | cut -d: -f1)" ] 2>/dev/null; then ok "  the rebase comes before the deploy"; else bad "  the rebase comes before the deploy ($(cat "$W/cout" | tr '\n' ' '))"; fi
run_fixes; check "  the printed rebase and deploy commands work in order" 0 "$FRC"
run_check; check "  then matches" 0 "$CRC"

echo "3e. a deleted function prints the full deploy and its warning"
mk_world s3g
run_deploy; branch feature/del
( cd "$R" && git rm -q -r supabase/functions/fn-b && git commit -qm "delete fn-b" ) >/dev/null 2>&1
run_check; check "fn-b deleted on the branch, still on the server" 1 "$CRC"
first_line_is "  names fn-b" "$W/cout" "differs: fn-b"
has "  prints the full deploy" "$W/cout" "^  scripts/selfhosted/deploy-functions.sh$"
has "  warns it prunes other sessions' functions" "$W/cout" "WARNING: .*prunes"
run_fixes; check "  the full deploy works" 0 "$FRC"
run_check; check "  then matches" 0 "$CRC"
if [ -d "$SB/stack/volumes/functions/fn-b" ]; then bad "  fn-b is gone from the server"; else ok "  fn-b is gone from the server"; fi

echo "3f. a rename: the old path on the server and the new path absent both differ"
mk_world s3h
run_deploy; branch feature/ren
( cd "$R" && git mv supabase/functions/fn-a/index.ts supabase/functions/fn-a/main.ts && git commit -qm rename ) >/dev/null 2>&1
V="$SB/stack/volumes/functions/fn-a"
run_check; check "server has the old path only (new absent)" 1 "$CRC"
cp "$R/supabase/functions/fn-a/main.ts" "$V/main.ts"
run_check; check "server has both (old path still present)" 1 "$CRC"
rm -f "$V/index.ts"; rm -f "$V/main.ts"
run_check; check "server has neither (new path absent)" 1 "$CRC"
cp "$R/supabase/functions/fn-a/main.ts" "$V/main.ts"
run_check; check "control: server has exactly the renamed layout" 0 "$CRC"

# ---------------------------------------------------------------- 4 other branches
echo "4a. another branch's copy of an unchanged _shared file differs"
mk_world s4
run_deploy
branch feature/b; checkout main; branch feature/a
commit_on feature/a supabase/functions/fn-a/index.ts 'a work' "a"
commit_on feature/b supabase/functions/_shared/x.ts 'export const v = 77' "b shared"
checkout feature/a; run_deploy fn-a; check "setup: A deploys fn-a" 0 "$RC"
run_check; check "A's check right after A's deploy" 0 "$CRC"
checkout feature/b; run_deploy fn-b; check "setup: B deploys fn-b over A's _shared" 0 "$RC"
checkout feature/a; run_check; check "A's check after B deployed over _shared" 1 "$CRC"
first_line_is "  names _shared" "$W/cout" "differs: _shared"
has "  names B as the deployer" "$W/cout" "feature/b from 20"
echo "4b. main's tip copy of an unchanged _shared file passes"
mk_world s4b
run_deploy; branch feature/a
commit_on feature/a supabase/functions/fn-a/index.ts 'a work' "a"
run_deploy fn-a; check "setup: A deploys fn-a" 0 "$RC"
commit_on main supabase/functions/_shared/x.ts 'export const v = 2' "main: shared v2"
checkout main; run_deploy fn-b; check "setup: main deploys fn-b (carries _shared v2)" 0 "$RC"
checkout feature/a; run_check; check "A, behind main, with main's _shared on the server" 0 "$CRC"
first_line_is "  reads match" "$W/cout" "match: "

# ---------------------------------------------------------------- 5 no network
echo "5. a branch that changed no deployed file makes no network call"
mk_world s5
run_deploy; branch feature/docs
: > "$W/stubstate/gcloud-calls.log"
commit_on feature/docs README.md 'readme v2' "docs"
commit_on feature/docs supabase/functions/fn-a/index.test.ts 'a test only' "test only"
run_check; check "only a README and a .test.ts changed" 0 "$CRC"
first_line_is "  says no changed functions" "$W/cout" "no changed functions"
check "  gcloud was never called" 0 "$(gcloud_calls)"
checkout main; run_check; check "on main itself" 0 "$CRC"
check "  gcloud still never called" 0 "$(gcloud_calls)"

# ---------------------------------------------------------------- 6 unknown
echo "6. every way the check cannot tell exits 2, never a pass"
mk_world s6
run_deploy; branch feature/u
commit_on feature/u supabase/functions/fn-a/index.ts 'u work' "u"
run_deploy fn-a
run_check; check "control: matching state passes" 0 "$CRC"
unk() { # name  (the situation is already set up; CRC/cout are from the run)
  check "$1" 2 "$CRC"; first_line_is "  says unknown" "$W/cout" "unknown: "
}
STUB_SSH_FAIL=1 run_check; unk "server unreachable"
STUB_AUTH_FAIL=1 run_check; unk "gcloud logged out"
has "  says so" "$W/cout" "not logged in"
t0=$SECONDS; STUB_HANG=1 BFC_DEADLINE=3 run_check; unk "a hanging server (deadline hit)"
if [ $((SECONDS - t0)) -le 12 ]; then ok "  returned within the deadline ($((SECONDS - t0))s)"; else bad "  took $((SECONDS - t0))s"; fi
has "  names the deadline" "$W/cout" "deadline"
ACTIVE="$W/active-hosted.env"; run_check; unk "hosted TEST active"
ACTIVE="$W/active-selfhosted.env"; run_check; check "  control: self-hosted active again" 0 "$CRC"
VITE_SUPABASE_URL="https://other.example.org" run_check; unk "VITE_SUPABASE_URL is another server"
VITE_SUPABASE_URL="$SELF_URL" run_check; check "  control: the self-hosted URL passes" 0 "$CRC"
STUB_TRUNCATE=1 run_check; unk "truncated output with no end marker"
has "  says it was cut short" "$W/cout" "cut short"
mkdir "$R/.git/cp-test-deploy.lock"; printf 'pid=%s\nhost=%s\nepoch=%s\n' "$$" "$(hostname)" "$(date +%s)" > "$R/.git/cp-test-deploy.lock/owner"
: > "$W/stubstate/gcloud-calls.log"
run_check; unk "deploy lock held"
check "  decided locally (no gcloud call)" 0 "$(gcloud_calls)"
rm -rf "$R/.git/cp-test-deploy.lock"; run_check; check "  control: lock gone" 0 "$CRC"
printf '%s\t%s\t%s\t%s\n' "$(date +%s)" abcdef1234567 1 "/x/land.log" > "$R/.git/cp-test-deploy-land.failed"
run_check; unk "a failed landing recorded"
has "  names the landing" "$W/cout" "landing deploy failed"
rm -f "$R/.git/cp-test-deploy-land.failed"; run_check; check "  control: record cleared" 0 "$CRC"
echo unhealthy > "$W/stubstate/health"; run_check; unk "container unhealthy"
has "  names the state" "$W/cout" "unhealthy"
rm -f "$W/stubstate/health"; run_check; check "  control: healthy again" 0 "$CRC"
echo "2000-01-01T00:00:00.000000000Z" > "$W/stubstate/started"; run_check; unk "container started before the files"
rm -f "$W/stubstate/started"; run_check; check "  control: started now" 0 "$CRC"
git -C "$R" checkout -q main
echo "gone" > "$TMPROOT/nomain"; ( cd "$R" && git branch -m main moved ) >/dev/null 2>&1
git -C "$R" checkout -q feature/u 2>/dev/null; run_check; unk "local main missing"
( cd "$R" && git branch -m moved main ) >/dev/null 2>&1

# ---------------------------------------------------------------- 7 manifest
echo "7. provenance is for the message only"
mk_world s7
run_deploy; branch feature/m
commit_on feature/m supabase/functions/fn-a/index.ts 'm work' "m"
run_deploy fn-a
rm -f "$SB/stack/deploy-manifest.tsv"
run_check; check "manifest missing, hashes match" 0 "$CRC"
has "  says deployer unknown" "$W/cout" "deployer unknown"
echo 'local edit' >> "$R/supabase/functions/fn-a/index.ts"
run_check; check "manifest missing, hashes differ" 1 "$CRC"
has "  still a differs, deployer unknown" "$W/cout" "differs: fn-a (server has deployer unknown)"

# ---------------------------------------------------------------- 8 deploy notice
echo "8. the deploy says what it replaces"
mk_world s8
run_deploy; check "main full deploy" 0 "$RC"
run_deploy fn-a; check "main again, over main's own clean deploy" 0 "$RC"
hasnt "  prints nothing about replacing clean main" "$W/out" "^replacing "
branch feature/x
commit_on feature/x supabase/functions/_shared/x.ts 'export const v = 11' "x shared"
run_deploy fn-a; check "feature/x deploys fn-a over main" 0 "$RC"
hasnt "  clean main replaced: quiet" "$W/out" "^replacing "
run_deploy fn-a; check "feature/x again, over its own code" 0 "$RC"
hasnt "  its own code replaced: quiet" "$W/out" "^replacing "
branch feature/y
commit_on feature/y supabase/functions/_shared/y.ts 'export const w = 12' "y shared"
run_deploy fn-b; check "feature/y deploys over feature/x's _shared" 0 "$RC"
has "  names _shared and the other branch" "$W/out" "^replacing _shared deployed by feature/x at 20"
hasnt "  does not say uncommitted" "$W/out" "^replacing _shared.*uncommitted"
echo 'dirty' >> "$R/supabase/functions/fn-b/index.ts"
run_deploy fn-b; check "feature/y deploys fn-b with an uncommitted edit" 0 "$RC"
( cd "$R" && git checkout -q -- supabase/functions/fn-b/index.ts ) >/dev/null 2>&1
run_deploy fn-b; check "feature/y deploys again, over its own uncommitted deploy" 0 "$RC"
has "  names uncommitted content even from its own branch" "$W/out" "^replacing fn-b deployed by feature/y at 20[0-9T:Z-]*, uncommitted"
checkout main; run_deploy; check "a full deploy from main prunes and replaces" 0 "$RC"
has "  names the dirs it replaces" "$W/out" "^replacing _shared deployed by feature/y"
printf 'not a manifest\n\001\002 binary junk\n' > "$SB/stack/deploy-manifest.tsv"
run_deploy fn-a; check "an unreadable manifest does not block the deploy" 0 "$RC"
hasnt "  and says nothing" "$W/out" "^replacing "
# pruned directories are named too
mk_world s8b
run_deploy; branch feature/p
( cd "$R" && git rm -q -r supabase/functions/fn-b && git commit -qm "rm fn-b" ) >/dev/null 2>&1
mkdir -p "$SB/stack/volumes/functions/fn-b"
awk 'BEGIN{OFS="\t"} {print}' "$SB/stack/deploy-manifest.tsv" | sed 's/\tmain\t/\tother\/branch\t/' > "$SB/stack/m.new" && mv "$SB/stack/m.new" "$SB/stack/deploy-manifest.tsv"
run_deploy; check "a full deploy that prunes fn-b" 0 "$RC"
has "  names the pruned directory's deployer" "$W/out" "^replacing fn-b deployed by other/branch"

# ---------------------------------------------------------------- 9 playwright
echo "9. the hooks under a real Playwright run (empty spec, stub check script, no TEST)"
PW="$SRC_ROOT/node_modules/.bin/playwright"
if [ ! -x "$PW" ]; then
  bad "playwright is not installed here ($PW)"
else
  PWD_DIR="$TMPROOT/pw"; mkdir -p "$PWD_DIR/specs"
  PORT=$((59300 + RANDOM % 600))
  cat > "$PWD_DIR/specs/empty.spec.ts" <<SPEC
import { test } from '$SRC_ROOT/node_modules/@playwright/test';
test('empty', async () => {});
SPEC
  cat > "$PWD_DIR/pw.config.ts" <<CFG
import { defineConfig } from '$SRC_ROOT/node_modules/@playwright/test';
export default defineConfig({
  testDir: './specs',
  reporter: 'line',
  globalSetup: '$SRC_ROOT/e2e/global-setup.ts',
  globalTeardown: '$SRC_ROOT/e2e/global-teardown.ts',
  webServer: { command: "node -e \"require('http').createServer((q,r)=>r.end('ok')).listen($PORT)\"", url: 'http://localhost:$PORT', reuseExistingServer: false, timeout: 30000 },
});
CFG
  # Stub check script: answers from a queue ("exit|first line"), counts its runs.
  cat > "$PWD_DIR/check-stub.sh" <<STUB
#!/bin/bash
echo x >> "$PWD_DIR/count"
q="$PWD_DIR/queue"; line="\$(head -1 "\$q")"; tail -n +2 "\$q" > "\$q.n"; mv "\$q.n" "\$q"
echo "\${line#*|}"; exit "\${line%%|*}"
STUB
  chmod +x "$PWD_DIR/check-stub.sh"
  MATCHL='0|match: 3 file(s)'; DIFFL='1|differs: fn-a (server has other from 2026-11-05T10:00:00Z)'
  pw_run() { # queue lines... ; env from caller. output $PWD_DIR/out, rc PRC
    printf '%s\n' "$@" > "$PWD_DIR/queue"; : > "$PWD_DIR/count"; rm -f "$PWD_DIR/receipt.jsonl"
    ( cd "$PWD_DIR" && env -u CI -u VERIFY_PROD -u E2E_LOADTEST -u TEST_WORKER_INDEX -u TEST_PARALLEL_INDEX \
        VITE_SUPABASE_URL="https://example.invalid" \
        CP_BRANCH_FUNCTIONS_CHECK="$PWD_DIR/check-stub.sh" CP_FUNCTION_CHECK_RECEIPT="$PWD_DIR/receipt.jsonl" \
        "$PW" test -c "$PWD_DIR/pw.config.ts" "$@" ) > "$PWD_DIR/out" 2>&1
    PRC=$?
  }
  pw_count() { wc -l < "$PWD_DIR/count" | tr -d ' '; }

  pw_run "$MATCHL" "$MATCHL"; check "trusted run (match, match)" 0 "$PRC"
  has "  prints the FUNCTIONS line" "$PWD_DIR/out" "^FUNCTIONS: trusted (start match, end match)"
  check "  receipt has one line" 1 "$(wc -l < "$PWD_DIR/receipt.jsonl" | tr -d ' ')"
  has "  receipt says trusted" "$PWD_DIR/receipt.jsonl" '"verdict":"trusted"'
  # Playwright prints its own pass/fail summary after teardown returns; the hook's last line is FUNCTIONS.
  if [ "$(grep -n '^FUNCTIONS:' "$PWD_DIR/out" | head -1 | cut -d: -f1)" -gt "$(grep -n 'P1532\|\[P1312\]' "$PWD_DIR/out" | tail -1 | cut -d: -f1)" ] 2>/dev/null; then ok "  FUNCTIONS comes after every other hook line"; else bad "  FUNCTIONS comes after every other hook line"; fi

  pw_run "$DIFFL" "$MATCHL"; check "warn and continue: the start differs, no flag" 0 "$PRC"
  has "  warns loudly" "$PWD_DIR/out" "differs: fn-a"
  has "  says it continues" "$PWD_DIR/out" "Continuing"
  has "  FUNCTIONS line records the verdict" "$PWD_DIR/out" "^FUNCTIONS: started-on-other-code (start differs, end match)"

  E2E_REQUIRE_FUNCTIONS=1 pw_run "$DIFFL" "$MATCHL"; check "refused under the flag when the start differs" 1 "$PRC"
  has "  says refused" "$PWD_DIR/out" "Refused"
  check "  no second check ran" 1 "$(pw_count)"
  has "  teardown still printed its FUNCTIONS line" "$PWD_DIR/out" "^FUNCTIONS: started-on-other-code (start differs, end not checked)"
  has "  receipt records the refusal" "$PWD_DIR/receipt.jsonl" '"verdict":"started-on-other-code"'

  E2E_REQUIRE_FUNCTIONS=1 pw_run "$MATCHL" "$DIFFL"; check "a run whose end differs fails under the flag" 1 "$PRC"
  has "  says the results are untrusted" "$PWD_DIR/out" "untrusted"
  has "  FUNCTIONS line" "$PWD_DIR/out" "^FUNCTIONS: changed-during-run (start match, end differs)"
  has "  the test itself passed (it is the check that failed the run)" "$PWD_DIR/out" "1 passed"
  pw_run "$MATCHL" "$DIFFL"; check "the same differing end without the flag only warns" 0 "$PRC"
  E2E_REQUIRE_FUNCTIONS=1 pw_run "$MATCHL" '2|unknown: tunnel' "$MATCHL"; check "an unknown end is retried once and recovers" 0 "$PRC"
  check "  three checks ran" 3 "$(pw_count)"

  echo "9b. each skip condition runs no check"
  skip_run() { # name, VAR=value
    printf '%s\n' "$MATCHL" "$MATCHL" > "$PWD_DIR/queue"; : > "$PWD_DIR/count"; rm -f "$PWD_DIR/receipt.jsonl"
    ( cd "$PWD_DIR" && env -u CI -u VERIFY_PROD -u E2E_LOADTEST VITE_SUPABASE_URL="https://example.invalid" "$2" \
        CP_BRANCH_FUNCTIONS_CHECK="$PWD_DIR/check-stub.sh" CP_FUNCTION_CHECK_RECEIPT="$PWD_DIR/receipt.jsonl" \
        "$PW" test -c "$PWD_DIR/pw.config.ts" ) > "$PWD_DIR/out" 2>&1
    check "$1: run passes" 0 "$?"
    check "  $1: no check ran" 0 "$(pw_count)"
    hasnt "  $1: no FUNCTIONS line" "$PWD_DIR/out" "^FUNCTIONS:"
    if [ -e "$PWD_DIR/receipt.jsonl" ]; then bad "  $1: no receipt written"; else ok "  $1: no receipt written"; fi
  }
  skip_run "VERIFY_PROD" VERIFY_PROD=1
  skip_run "E2E_LOADTEST" E2E_LOADTEST=1
  # CI makes Playwright itself behave differently (retries), so it is run with a count only
  printf '%s\n' "$MATCHL" "$MATCHL" > "$PWD_DIR/queue"; : > "$PWD_DIR/count"
  ( cd "$PWD_DIR" && env -u VERIFY_PROD -u E2E_LOADTEST CI=1 VITE_SUPABASE_URL="https://example.invalid" CP_BRANCH_FUNCTIONS_CHECK="$PWD_DIR/check-stub.sh" \
      CP_FUNCTION_CHECK_RECEIPT="$PWD_DIR/receipt.jsonl" "$PW" test -c "$PWD_DIR/pw.config.ts" ) > "$PWD_DIR/out" 2>&1
  check "CI: run passes" 0 "$?"; check "  CI: no check ran" 0 "$(pw_count)"
  # --list never runs setup or teardown at all, so no check either
  printf '%s\n' "$MATCHL" > "$PWD_DIR/queue"; : > "$PWD_DIR/count"
  ( cd "$PWD_DIR" && env -u CI CP_BRANCH_FUNCTIONS_CHECK="$PWD_DIR/check-stub.sh" "$PW" test -c "$PWD_DIR/pw.config.ts" --list ) > "$PWD_DIR/out" 2>&1
  check "--list: exits 0" 0 "$?"; check "  --list: no check ran" 0 "$(pw_count)"
  # No webServer: a config of its own with none
  sed 's|^  webServer:.*$||' "$PWD_DIR/pw.config.ts" > "$PWD_DIR/pw-noserver.config.ts"
  printf '%s\n' "$MATCHL" "$MATCHL" > "$PWD_DIR/queue"; : > "$PWD_DIR/count"
  ( cd "$PWD_DIR" && env -u CI -u VERIFY_PROD -u E2E_LOADTEST CP_BRANCH_FUNCTIONS_CHECK="$PWD_DIR/check-stub.sh" "$PW" test -c "$PWD_DIR/pw-noserver.config.ts" ) > "$PWD_DIR/out" 2>&1
  check "no webServer: run passes" 0 "$?"; check "  no webServer: no check ran" 0 "$(pw_count)"
fi

echo
echo "p1312 canary: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
