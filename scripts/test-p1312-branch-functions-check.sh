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
#  10 review      the container start line, subsecond precision, failed joins, non-ASCII paths, the
#                 printed fixes on a dirty tree and for a deleted function, dead locks and landings
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
  *StartedAt*) cat "\$ST/started" 2>/dev/null || python3 -c "import datetime;print(datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ'))" ;;
  *Health*) cat "\$ST/health" 2>/dev/null || echo healthy ;;
esac
exit 0
STUB
  # join: the real one unless a scenario makes it fail or answer nothing (P1312 review: Codex 1, L4).
  cat > "$W/bin/join" <<STUB
#!/bin/bash
[ -n "\${STUB_JOIN_FAIL:-}" ] && exit 1
[ -n "\${STUB_JOIN_EMPTY:-}" ] && exit 0
for j in /usr/bin/join /bin/join; do [ -x "\$j" ] && exec "\$j" "\$@"; done
exit 127
STUB
  chmod +x "$W/bin/join"
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

# ---------------------------------------------------------------- 10 review fixes
echo "10a. the container start time is reported on a stable second line (H1)"
mk_world s10a
run_deploy; branch feature/h
commit_on feature/h supabase/functions/fn-a/index.ts 'h work' "h"
run_deploy fn-a
echo "2030-01-01T00:00:00.500000000Z" > "$W/stubstate/started"
run_check; check "matching state with a fixed container start" 0 "$CRC"
second_a="$(sed -n 2p "$W/cout")"
if printf '%s' "$second_a" | grep -q '^STARTED: [0-9][0-9]*$'; then ok "  line 2 is STARTED: digits ($second_a)"; else bad "  line 2 is STARTED: digits (got: $second_a)"; fi
run_check; second_b="$(sed -n 2p "$W/cout")"
if [ -n "$second_a" ] && [ "$second_a" = "$second_b" ]; then ok "  the same container gives the same line"; else bad "  the same container gives the same line ($second_a vs $second_b)"; fi
echo "2030-01-01T00:00:09.500000000Z" > "$W/stubstate/started"
run_check; second_c="$(sed -n 2p "$W/cout")"
if [ -n "$second_c" ] && [ "$second_a" != "$second_c" ]; then ok "  a recreated container gives a different line"; else bad "  a recreated container gives a different line ($second_a vs $second_c)"; fi
echo 'drift' >> "$R/supabase/functions/fn-a/index.ts"
run_check; check "differs also reports it" 1 "$CRC"
if [ "$(sed -n 2p "$W/cout" | cut -c1-9)" = "STARTED: " ]; then ok "  line 2 of a differs is STARTED too"; else bad "  line 2 of a differs is STARTED too ($(sed -n 2p "$W/cout"))"; fi

echo "10b. subsecond precision: a file written after the container started within the same second (Codex 3)"
mk_world s10b
run_deploy; branch feature/t
commit_on feature/t supabase/functions/fn-a/index.ts 't work' "t"
run_deploy fn-a
python3 -c 'import os,sys; os.utime(sys.argv[1], ns=(1900000000900000000, 1900000000900000000))' "$SB/stack/volumes/functions/fn-a/index.ts"
D="$(date -u -r 1900000000 +%Y-%m-%dT%H:%M:%S)"
echo "$D.100000000Z" > "$W/stubstate/started"
run_check; check "container started at .1, newest file written at .9 of the same second" 2 "$CRC"
has "  says the container started before the files" "$W/cout" "started before the newest function file"
echo "$D.950000000Z" > "$W/stubstate/started"
run_check; check "  control: container started at .95 passes" 0 "$CRC"

echo "10c. a failed or empty comparison is never a match (Codex 1, L4)"
mk_world s10c
run_deploy; branch feature/j
commit_on feature/j supabase/functions/fn-a/index.ts 'j work' "j"
run_deploy fn-a
run_check; check "control: matches" 0 "$CRC"
STUB_JOIN_FAIL=1 run_check; unk "join fails"
STUB_JOIN_EMPTY=1 run_check; unk "join answers nothing (fewer lines than files)"
has "  says the comparison is incomplete" "$W/cout" "comparison"
run_check; check "  control: the real join passes again" 0 "$CRC"

echo "10d. non-ASCII paths are seen (Codex 2, L1)"
mk_world s10d
run_deploy; branch feature/u8
# Characters with no decomposed form (macOS tar would rewrite e-acute into e plus a combining mark and
# make a Mac-built fixture differ from a Linux server for a reason that has nothing to do with the check).
printf 'x\n' > "$R/supabase/functions/fn-a/$(printf '\346\227\245').ts"
run_check; check "an untracked file with a non-ASCII name" 1 "$CRC"
first_line_is "  names fn-a" "$W/cout" "differs: fn-a"
run_fixes; run_check; check "  after its printed deploy it matches" 0 "$CRC"
( cd "$R" && git add -- "supabase/functions/fn-a/$(printf '\346\227\245').ts" && git commit -qm "u8" ) >/dev/null 2>&1
run_check; check "  committed, still matching" 0 "$CRC"
printf 'y\n' > "$R/supabase/functions/fn-b/$(printf '\303\237').ts"
( cd "$R" && git add -- "supabase/functions/fn-b/$(printf '\303\237').ts" && git commit -qm "u8b" ) >/dev/null 2>&1
run_check; check "a committed non-ASCII file in fn-b, not on the server" 1 "$CRC"
has "  names fn-b" "$W/cout" "^differs: fn-b "

echo "10e. behind main with uncommitted work: commit first, never stash (M1)"
mk_world s10e
run_deploy; branch feature/old
commit_on main supabase/functions/_shared/x.ts 'export const v = 2' "main: shared v2"
commit_on feature/old supabase/functions/fn-a/index.ts 'old branch work' "branch change"
echo 'uncommitted' >> "$R/supabase/functions/fn-a/index.ts"
run_check; check "behind main, fn-a edited, tree dirty" 1 "$CRC"
has "  tells you to commit first" "$W/cout" "[Cc]ommit your changes first"
hasnt "  never suggests stash" "$W/cout" "stash"
cm="$(grep -n -i 'commit your changes first' "$W/cout" | head -1 | cut -d: -f1)"; rb="$(grep -n 'git rebase main' "$W/cout" | head -1 | cut -d: -f1)"
if [ -n "$cm" ] && [ -n "$rb" ] && [ "$cm" -lt "$rb" ]; then ok "  the commit instruction comes before the rebase"; else bad "  the commit instruction comes before the rebase ($(tr '\n' ' ' < "$W/cout"))"; fi
( cd "$R" && git commit -qam "wip" ) >/dev/null 2>&1
run_check; check "  after committing, still differs" 1 "$CRC"
hasnt "  clean tree: no commit instruction" "$W/cout" "[Cc]ommit your changes first"
run_fixes; check "  the printed rebase and deploy work" 0 "$FRC"
run_check; check "  then matches" 0 "$CRC"

echo "10f. a deleted function that is already off the server needs no full deploy (M2)"
mk_world s10f
run_deploy; branch feature/del2
( cd "$R" && git rm -q -r supabase/functions/fn-b && git commit -qm "delete fn-b" ) >/dev/null 2>&1
commit_on feature/del2 supabase/functions/fn-a/index.ts 'del2 work' "a"
rm -rf "$SB/stack/volumes/functions/fn-b"
run_check; check "fn-b deleted locally and gone from the server, fn-a differs" 1 "$CRC"
first_line_is "  names only fn-a" "$W/cout" "differs: fn-a "
hasnt "  no prune warning" "$W/cout" "WARNING"
hasnt "  no full deploy" "$W/cout" "^  scripts/selfhosted/deploy-functions.sh$"
has "  the named deploy" "$W/cout" "^  scripts/selfhosted/deploy-functions.sh fn-a$"
run_fixes; run_check; check "  matches after it" 0 "$CRC"

echo "10g. a lock or a failed landing says what clears it (M3)"
mk_world s10g
run_deploy; branch feature/l
commit_on feature/l supabase/functions/fn-a/index.ts 'l work' "l"
run_deploy fn-a
sh -c 'exit 0' & DEADPID=$!; wait "$DEADPID" 2>/dev/null
mkdir "$R/.git/cp-test-deploy.lock"; printf 'pid=%s\nhost=%s\nepoch=%s\n' "$DEADPID" "$(hostname)" "$(date +%s)" > "$R/.git/cp-test-deploy.lock/owner"
run_check; check "a lock whose owner is dead" 2 "$CRC"
has "  says stuck, not under way" "$W/cout" "stuck deploy lock"
hasnt "  does not claim a deploy is under way" "$W/cout" "under way"
has "  prints the command that clears it" "$W/cout" "rm -r "
rm -rf "$R/.git/cp-test-deploy.lock"
mkdir "$R/.git/cp-test-deploy.lock"; printf 'pid=%s\nhost=%s\nepoch=%s\n' "$$" "$(hostname)" "$(date +%s)" > "$R/.git/cp-test-deploy.lock/owner"
run_check; check "a lock held by a live run" 2 "$CRC"
has "  says a deploy is under way" "$W/cout" "under way"
rm -rf "$R/.git/cp-test-deploy.lock"
printf '%s\t%s\t%s\t%s\n' "$(date +%s)" abcdef1234567 1 "/x/land.log" > "$R/.git/cp-test-deploy-land.failed"
run_check; check "a failed landing recorded" 2 "$CRC"
has "  says what clears it" "$W/cout" "clean checkout of main"
rm -f "$R/.git/cp-test-deploy-land.failed"

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
  # Stub check script: answers from a queue ("exit|first line", ";;" starts a new output line), counts its runs.
  cat > "$PWD_DIR/check-stub.sh" <<'STUB'
#!/bin/bash
d="$(cd "$(dirname "$0")" && pwd)"
echo x >> "$d/count"
q="$d/queue"; line="$(head -1 "$q")"; tail -n +2 "$q" > "$q.n"; mv "$q.n" "$q"
nl=$'\n'; rest="${line#*|}"; printf '%s\n' "${rest//;;/$nl}"; exit "${line%%|*}"
STUB
  chmod +x "$PWD_DIR/check-stub.sh"
  # Playwright through a shim that records its arguments (the queue must never reach it as filters).
  cat > "$PWD_DIR/pw-shim.sh" <<SHIM
#!/bin/bash
echo "\$*" >> "$PWD_DIR/argv.log"
exec "$PW" "\$@"
SHIM
  chmod +x "$PWD_DIR/pw-shim.sh"
  MATCHL='0|match: 3 file(s);;STARTED: 1000'; DIFFL='1|differs: fn-a (server has other from 2026-11-05T10:00:00Z);;STARTED: 1000;;Fix: deploy this branch'"'"'s functions to TEST:;;  scripts/selfhosted/deploy-functions.sh fn-a'
  pw_run() { # queue lines... ; env from caller. output $PWD_DIR/out, rc PRC
    printf '%s\n' "$@" > "$PWD_DIR/queue"; : > "$PWD_DIR/count"; rm -f "$PWD_DIR/receipt.jsonl" "$PWD_DIR/argv.log"
    ( cd "$PWD_DIR" && env -u CI -u VERIFY_PROD -u E2E_LOADTEST -u TEST_WORKER_INDEX -u TEST_PARALLEL_INDEX \
        VITE_SUPABASE_URL="https://example.invalid" CP_TEARDOWN_CLEANUP_SEAM=1 CP_BRANCH_FUNCTIONS_RETRY_WAIT_MS=0 \
        CP_BRANCH_FUNCTIONS_CHECK="$PWD_DIR/check-stub.sh" CP_FUNCTION_CHECK_RECEIPT="$PWD_DIR/receipt.jsonl" \
        "$PWD_DIR/pw-shim.sh" test -c "$PWD_DIR/pw.config.ts" ) > "$PWD_DIR/out" 2>&1
    PRC=$?
  }
  pw_count() { wc -l < "$PWD_DIR/count" | tr -d ' '; }

  pw_run "$MATCHL" "$MATCHL"; check "trusted run (match, match)" 0 "$PRC"
  hasnt "  the queue is not passed to Playwright as test filters" "$PWD_DIR/argv.log" "match:"
  has "  prints the FUNCTIONS line" "$PWD_DIR/out" "^FUNCTIONS: trusted (start match, end match)"
  check "  receipt has one line" 1 "$(wc -l < "$PWD_DIR/receipt.jsonl" | tr -d ' ')"
  has "  receipt says trusted" "$PWD_DIR/receipt.jsonl" '"verdict":"trusted"'
  # The cleanup seam prints a line when cleanup() runs; FUNCTIONS must come after it, and removing
  # the cleanup call must fail this section.
  has "  cleanup ran" "$PWD_DIR/out" "cleanup ran"
  cl="$(grep -n 'cleanup ran' "$PWD_DIR/out" | head -1 | cut -d: -f1)"; fl="$(grep -n '^FUNCTIONS:' "$PWD_DIR/out" | head -1 | cut -d: -f1)"
  if [ -n "$cl" ] && [ -n "$fl" ] && [ "$fl" -gt "$cl" ]; then ok "  FUNCTIONS comes after the cleanup"; else bad "  FUNCTIONS comes after the cleanup (cleanup line ${cl:-none}, FUNCTIONS line ${fl:-none})"; fi

  pw_run "$DIFFL" "$MATCHL"; check "warn and continue: the start differs, no flag" 0 "$PRC"
  has "  warns loudly" "$PWD_DIR/out" "differs: fn-a"
  has "  says it continues" "$PWD_DIR/out" "Continuing"
  has "  FUNCTIONS line records the verdict" "$PWD_DIR/out" "^FUNCTIONS: started-on-other-code (start differs, end match)"

  E2E_REQUIRE_FUNCTIONS=1 pw_run "$DIFFL" "$MATCHL"; check "refused under the flag when the start differs" 1 "$PRC"
  has "  says refused" "$PWD_DIR/out" "Refused"
  has "  shows the printed fix command, not only the first line" "$PWD_DIR/out" "deploy-functions.sh fn-a"
  has "  cleanup still ran after the refusal" "$PWD_DIR/out" "cleanup ran"
  check "  no second check ran" 1 "$(pw_count)"
  has "  teardown still printed its FUNCTIONS line" "$PWD_DIR/out" "^FUNCTIONS: started-on-other-code (start differs, end not checked)"
  has "  receipt records the refusal" "$PWD_DIR/receipt.jsonl" '"verdict":"started-on-other-code"'

  E2E_REQUIRE_FUNCTIONS=1 pw_run "$MATCHL" "$DIFFL"; check "a run whose end differs fails under the flag" 1 "$PRC"
  has "  says the results are untrusted" "$PWD_DIR/out" "untrusted"
  has "  FUNCTIONS line" "$PWD_DIR/out" "^FUNCTIONS: changed-during-run (start match, end differs)"
  has "  the test itself passed (it is the check that failed the run)" "$PWD_DIR/out" "1 passed"
  has "  cleanup still ran, and the failing run says so" "$PWD_DIR/out" "cleanup ran"
  has "  the failure shows the fix lines too" "$PWD_DIR/out" "deploy-functions.sh fn-a"
  pw_run "$MATCHL" "$DIFFL"; check "the same differing end without the flag only warns" 0 "$PRC"
  E2E_REQUIRE_FUNCTIONS=1 pw_run "$MATCHL" '2|unknown: tunnel' "$MATCHL"; check "an unknown end is retried once and recovers" 0 "$PRC"
  check "  three checks ran" 3 "$(pw_count)"
  E2E_REQUIRE_FUNCTIONS=true pw_run "$MATCHL" "$DIFFL"; check "the flag spelled true also fails the run" 1 "$PRC"
  E2E_REQUIRE_FUNCTIONS=1 pw_run "$MATCHL" '0|match: 3 file(s);;STARTED: 2000'; check "same files at the end but the container restarted (a deploy happened)" 1 "$PRC"
  has "  FUNCTIONS line" "$PWD_DIR/out" "^FUNCTIONS: changed-during-run (start match, end match)"
  has "  says a deploy happened" "$PWD_DIR/out" "restarted"
  pw_run "$MATCHL" '0|match: 3 file(s);;STARTED: 2000'; check "  the restart only warns without the flag" 0 "$PRC"
  E2E_REQUIRE_FUNCTIONS=1 pw_run '0|no changed functions' '0|no changed functions'; check "a branch with no function changes passes under the flag" 0 "$PRC"
  has "  and is not called trusted" "$PWD_DIR/out" "^FUNCTIONS: not-applicable (start none, end none)"
  E2E_REQUIRE_FUNCTIONS=1 pw_run '0|no changed functions' "$MATCHL"; check "none at the start, match at the end fails under the flag" 1 "$PRC"

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
  # CI, --list and no-webServer have no rows here: global-setup.ts returns before the hook for CI and
  # for no webServer, and --list never runs setup, so "no check ran" held whatever the skip logic did
  # (a mutation removing those skips left this section green). The skip logic itself is unit-tested
  # in src/tests/p1312-branch-functions-verdict.test.ts.
fi

echo
echo "p1312 canary: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
