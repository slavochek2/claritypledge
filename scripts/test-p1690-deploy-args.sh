#!/usr/bin/env bash
# scripts/test-p1690-deploy-args.sh — canary for P1690 (two deploy scripts that failed quietly).
#
#   1. Several function names. Both scripts kept only the LAST positional argument, so
#      `deploy-functions.sh a b c` deployed `c` and printed success. Every name given must now be
#      deployed, or the whole call refused before anything is uploaded.
#   2. `.env.prod` from a worktree. The wrapper's fallback was the parent of its own scripts/
#      directory, which in a worktree is the worktree again. It must find the main checkout's file
#      through git's common directory.
#
# Hermetic, on the pattern of test-p1612-deploy-guard.sh and test-p890-deploy-smoke.sh: throwaway
# git repositories under mktemp, a HOME of its own, and stubs for gcloud, curl, supabase, the
# keychain, the lane resolver and every sibling script. The REAL deploy scripts run, including the
# self-hosted script's remote half, which the gcloud stub executes against a sandbox directory
# standing in for the VM. No server is contacted, no secret is read, and the env files are fakes.
#
# What this cannot show (epistemic gate 7b): the lane controller on the VM and the real Supabase
# CLI are stubs here, so how they treat a bundle with several directories is read from their code,
# not exercised. The real manifest stamp is a stub too; its worktree refusal is emulated by exit code.
#
# The scripts under test default to the shipped ones. The overrides exist so the failure path can
# be shown against a copy with a fix removed (epistemic gate 7), without editing the real files:
#   P1690_SELFHOSTED_UNDER_TEST=<file>  P1690_WRAPPER_UNDER_TEST=<file>
# A normal run does NOT repeat that control. To repeat it, point the overrides at the two scripts
# as they were before P1690 and expect exit 1:
#   git show a4affff77:scripts/deploy-functions.sh > "$TMPDIR/w.sh"
#   git show a4affff77:scripts/selfhosted/deploy-functions.sh > "$TMPDIR/s.sh"
#   P1690_WRAPPER_UNDER_TEST="$TMPDIR/w.sh" P1690_SELFHOSTED_UNDER_TEST="$TMPDIR/s.sh" bash scripts/test-p1690-deploy-args.sh
#
# Exit: 0 all passed · 1 at least one check failed · 2 a fixture could not be built (not a result).
# Output contract (shell-safety.md): no redirect or pipe tokens in status lines.
set -u
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR

SRC_ROOT="${P1690_SRC_ROOT:-$(git rev-parse --show-toplevel)}"
# P1732: a prod deploy refuses any project but prod's. These fixtures tell .env.prod copies apart
# by their ref, so all three fixture refs stand in for prod.
export CP_PROD_PROJECT_REF_EXPECTED="mainref wtref strayref"
SELF_UT="${P1690_SELFHOSTED_UNDER_TEST:-$SRC_ROOT/scripts/selfhosted/deploy-functions.sh}"
WRAP_UT="${P1690_WRAPPER_UNDER_TEST:-$SRC_ROOT/scripts/deploy-functions.sh}"
[ -f "$SELF_UT" ] && [ -f "$WRAP_UT" ] || { echo "FIXTURE: a script under test is missing"; exit 2; }

PASS=0; FAIL=0
ok()  { echo "  OK   $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL+1)); }
check() { # name, expected, actual
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (wanted '$2', got '$3')"; fi
}
refused() { # name, rc
  if [ "$2" -ne 0 ]; then ok "$1 (exit $2)"; else bad "$1 (wanted a non-zero exit, got 0)"; fi
}
has() { # name, file, pattern
  if grep -q -e "$3" "$2" 2>/dev/null; then ok "$1"; else bad "$1 (no '$3' in output: $(head -c 300 "$2" | tr '\n' ' '))"; fi
}
hasnt() {
  if grep -q -e "$3" "$2" 2>/dev/null; then bad "$1 (found '$3')"; else ok "$1"; fi
}
fixture_broken() { echo "FIXTURE: $1"; exit 2; }

TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT

echo "P1690 canary. Scripts under test:"
echo "  self-hosted: $SELF_UT"
echo "  wrapper:     $WRAP_UT"

# The main lane's address is read from the script under test, so this file names no server.
MAIN_URL="$(sed -n 's/^EXPECTED_URL="\(.*\)"$/\1/p' "$SELF_UT" | head -1)"
[ -n "$MAIN_URL" ] || fixture_broken "cannot read EXPECTED_URL from the self-hosted script"

# =====================================================================================
# Part A — scripts/selfhosted/deploy-functions.sh
# =====================================================================================
mk_world() { # name: sets W (world), R (repo), SB (sandbox standing in for the VM)
  W="$TMPROOT/$1"; R="$W/repo"; SB="$W/vm"
  mkdir -p "$W/bin/vmbin" "$W/home/.config/cp-selfhosted-test" "$SB/stack/volumes/functions" "$SB/tmp" "$W/stubstate"
  printf 'SUPABASE_URL=%s\nANON_KEY=%s\n' "$MAIN_URL" "anon-key-canary-not-real" > "$W/home/.config/cp-selfhosted-test/env"
  : > "$SB/stack/functions.env"; echo "env_file functions.env" > "$SB/stack/docker-compose.override.yml"
  : > "$W/stubstate/scp.log"; : > "$W/stubstate/lanectl.log"

  cat > "$W/bin/gcloud" <<STUB
#!/bin/bash
SB="$SB"; ST="$W/stubstate"
# Two passes through placeholders, so a sandbox that itself lives under /tmp (TMPDIR=/tmp) is not
# rewritten a second time by the /tmp/ rule.
map() { sed -e "s|/opt/supabase/docker|@@CP_STACK@@|g" -e "s|/tmp/|@@CP_TMP@@/|g" -e "s|@@CP_STACK@@|\$SB/stack|g" -e "s|@@CP_TMP@@|\$SB/tmp|g"; }
case "\$1 \$2" in
  "auth print-access-token") echo tok; exit 0 ;;
  "compute scp")
    local_f=""; remote=""
    for a in "\$@"; do case "\$a" in --*) ;; compute|scp) ;; cp-test-supabase:*) remote="\${a#cp-test-supabase:}" ;; *) local_f="\$a" ;; esac; done
    echo "\$remote" >> "\$ST/scp.log"
    dest="\$(printf '%s' "\$remote" | map)"; cp "\$local_f" "\$dest"; exit \$? ;;
  "compute ssh")
    cmd=""; while [ \$# -gt 0 ]; do [ "\$1" = "--command" ] && { cmd="\$2"; break; }; shift; done
    PATH="$W/bin/vmbin:\$PATH"
    if [ "\$cmd" = "sudo bash -s" ]; then map | bash -s; exit \$?; fi
    mapped="\$(printf '%s' "\${cmd//sudo /}" | map)"; bash -c "\$mapped"; exit \$? ;;
esac
exit 0
STUB
  cat > "$W/bin/vmbin/docker" <<'STUB'
#!/bin/bash
case "$1" in inspect) echo healthy ;; logs) ;; esac
exit 0
STUB
  printf '#!/bin/bash\nexit 0\n' > "$W/bin/vmbin/chown"
  printf '#!/bin/bash\nexec shasum -a 256 "$@"\n' > "$W/bin/vmbin/sha256sum"
  # The lane controller stand-in: records its arguments and the top-level entries of the bundle.
  cat > "$W/bin/vmbin/lanectl-stub" <<STUB
#!/bin/bash
ST="$W/stubstate"
echo "\$*" >> "\$ST/lanectl.log"
tb=""; prev=""
for a in "\$@"; do [ "\$prev" = "--tarball" ] && tb="\$a"; prev="\$a"; done
tar -tzf "\$tb" | sed 's|^\./||' | cut -d/ -f1 | grep -v '^\$' | LC_ALL=C sort -u > "\$ST/lane-entries"
exit 0
STUB
  cat > "$W/bin/curl" <<'STUB'
#!/bin/bash
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
cat >/dev/null   # the -K - config on stdin
[ -n "$out" ] && printf 'ok' > "$out"
printf '200'
STUB
  chmod +x "$W/bin/gcloud" "$W/bin/curl" "$W/bin/vmbin/docker" "$W/bin/vmbin/chown" "$W/bin/vmbin/sha256sum" "$W/bin/vmbin/lanectl-stub"

  mkdir -p "$R"
  (
    cd "$R" && git init -q && git config user.email t@t && git config user.name t && git config commit.gpgsign false
    mkdir -p scripts/selfhosted/lib supabase/functions/_shared supabase/functions/fn-a supabase/functions/fn-b \
             supabase/functions/fn-c supabase/selfhosted/functions-main
    cp "$SELF_UT" scripts/selfhosted/deploy-functions.sh; chmod +x scripts/selfhosted/deploy-functions.sh
    cp "$SRC_ROOT/scripts/selfhosted/lane.py" scripts/selfhosted/
    cp "$SRC_ROOT/scripts/selfhosted/lib/deploy-guard.sh" scripts/selfhosted/lib/
    printf '#!/bin/bash\nexit 0\n' > scripts/check-edge-function-secrets.sh
    chmod +x scripts/check-edge-function-secrets.sh
    echo 'export const v = 1' > supabase/functions/_shared/x.ts
    for f in fn-a fn-b fn-c; do echo 'main v1' > "supabase/functions/$f/index.ts"; done
    echo '{}' > supabase/functions/deno.json; echo '{}' > supabase/functions/deno.lock
    echo 'router v1' > supabase/selfhosted/functions-main/index.ts
    echo 'fn-a' > supabase/no-verify-jwt-functions.txt
    git add -A && git commit -qm seed && git branch -M main
  ) >/dev/null 2>&1
  [ -x "$R/scripts/selfhosted/deploy-functions.sh" ] || fixture_broken "world $1: the repository was not built"
}

run_deploy() { # args...; output in $W/out, exit code in RC
  ( cd "$R" && HOME="$W/home" PATH="$W/bin:$PATH" "$R/scripts/selfhosted/deploy-functions.sh" "$@" ) > "$W/out" 2>&1
  RC=$?
}
uploads() { wc -l < "$W/stubstate/scp.log" | tr -d ' '; }
srv() { cat "$SB/stack/volumes/functions/$1/index.ts" 2>/dev/null || echo MISSING; }

# A world whose server holds main's v1 of fn-a, fn-b and fn-c plus a function that exists only on
# the server, and whose checkout holds an uncommitted v2 of all three.
seeded_world() {
  mk_world "$1"
  run_deploy
  [ "$RC" -eq 0 ] || fixture_broken "world $1: the seeding full deploy failed: $(tail -5 "$W/out" | tr '\n' ' ')"
  [ "$(srv fn-a)" = "main v1" ] || fixture_broken "world $1: the seeding deploy did not reach the sandbox"
  mkdir -p "$SB/stack/volumes/functions/fn-server-only"
  echo 'server only' > "$SB/stack/volumes/functions/fn-server-only/index.ts"
  for f in fn-a fn-b fn-c; do echo 'branch v2' > "$R/supabase/functions/$f/index.ts"; done
  : > "$W/stubstate/scp.log"
}

echo
echo "A1. self-hosted: two names deploy both, and only those"
seeded_world a1
run_deploy fn-a fn-b
check "two names exit 0" 0 "$RC"
check "  the first name was deployed" "branch v2" "$(srv fn-a)"
check "  the second name was deployed" "branch v2" "$(srv fn-b)"
check "  a function that was not named is left as it was" "main v1" "$(srv fn-c)"
check "  a server-only function is not pruned by a named deploy" "server only" "$(srv fn-server-only)"
check "  one upload" 1 "$(uploads)"
has "  the output names both functions" "$W/out" "^Named functions (2): fn-a fn-b"

echo "A2. self-hosted: three names deploy all three in one upload"
seeded_world a2
run_deploy fn-c fn-a fn-b
check "three names exit 0" 0 "$RC"
check "  fn-a deployed" "branch v2" "$(srv fn-a)"
check "  fn-b deployed" "branch v2" "$(srv fn-b)"
check "  fn-c deployed" "branch v2" "$(srv fn-c)"
check "  a server-only function is not pruned" "server only" "$(srv fn-server-only)"
check "  one upload" 1 "$(uploads)"

echo "A3. self-hosted: one bad name refuses the whole call, wherever it sits"
seeded_world a3
refuse_case() { # label, args...
  local label="$1"; shift
  : > "$W/stubstate/scp.log"
  run_deploy "$@"
  refused "$label" "$RC"
  check "  nothing uploaded" 0 "$(uploads)"
  check "  the server still holds the old fn-a" "main v1" "$(srv fn-a)"
  check "  the server still holds the old fn-b" "main v1" "$(srv fn-b)"
}
refuse_case "a name with no directory, first" nope fn-a
has "  names the bad name" "$W/out" "nope"
refuse_case "a name with no directory, last" fn-a nope
refuse_case "a path instead of a name, first" ../fn-a fn-b
has "  says it is not a function name" "$W/out" "not a function name"
refuse_case "a path instead of a name, last" fn-b ../fn-a
refuse_case "an empty name, first" "" fn-a
refuse_case "an empty name, last" fn-a ""
refuse_case "an empty name alone (it used to mean a full, pruning deploy)" ""
check "  the server-only function survived every refused call" "server only" "$(srv fn-server-only)"

echo "A4. self-hosted: a repeated name deploys once"
seeded_world a4
run_deploy fn-a fn-a
check "a repeated name exits 0" 0 "$RC"
check "  the function was deployed" "branch v2" "$(srv fn-a)"
if [ -e "$SB/stack/volumes/functions/fn-a/fn-a" ]; then bad "  no nested copy on the server (found fn-a/fn-a)"; else ok "  no nested copy on the server"; fi
check "  the other function is untouched" "main v1" "$(srv fn-b)"
has "  the output names it once" "$W/out" "^Named functions (1): fn-a"

# The lane controller decides pruning from the .full-deploy marker INSIDE the bundle and ignores a
# --full argument, so the marker is what is asserted here.
echo "A5. self-hosted lane: several names go to the lane controller in a bundle with no full-deploy marker"
lane_world() {
  mk_world "$1"
  printf 'SUPABASE_URL=https://lane-canary.example.test\nANON_KEY=lane-anon-not-real\n' > "$W/home/lane-env"
  cat > "$R/scripts/selfhosted/lane.py" <<STUB
import sys
if len(sys.argv) > 1 and sys.argv[1] == 'heartbeat':
    sys.exit(0)
if len(sys.argv) > 1 and sys.argv[1] == 'resolve':
    print("CP_TEST_TARGET=lane")
    print("CP_TEST_LANE=lane-canary")
    print("CP_TEST_GEN=7")
    print("CP_TEST_ORIGIN=https://lane-canary.example.test")
    print("CP_TEST_KEYS_FILE=$W/home/lane-env")
    print("CP_TEST_STACK_DIR=/srv/lanes/lane-canary")
    print("CP_TEST_FUNCTIONS_VOL=/srv/lanes/lane-canary/volumes/functions")
    print("CP_TEST_LANECTL=lanectl-stub")
    sys.exit(0)
sys.exit(1)
STUB
}
lane_entries() { tr '\n' ' ' < "$W/stubstate/lane-entries" 2>/dev/null; }
lane_world a5
run_deploy fn-a fn-b
check "a lane deploy of two names exits 0" 0 "$RC"
has "  the lane controller was called" "$W/stubstate/lanectl.log" "deploy --lane lane-canary --gen 7"
case " $(lane_entries)" in *" .full-deploy "*) bad "  the bundle has no full-deploy marker, so nothing is pruned (entries: $(lane_entries))" ;; *) ok "  the bundle has no full-deploy marker, so nothing is pruned" ;; esac
case " $(lane_entries)" in *" fn-a "*) ok "  the bundle holds the first name" ;; *) bad "  the bundle holds the first name (entries: $(lane_entries))" ;; esac
case " $(lane_entries)" in *" fn-b "*) ok "  the bundle holds the second name" ;; *) bad "  the bundle holds the second name (entries: $(lane_entries))" ;; esac
case " $(lane_entries)" in *" fn-c "*) bad "  the bundle leaves out the function that was not named (entries: $(lane_entries))" ;; *) ok "  the bundle leaves out the function that was not named" ;; esac
case " $(lane_entries)" in *" _shared "*) ok "  the bundle carries _shared" ;; *) bad "  the bundle carries _shared (entries: $(lane_entries))" ;; esac
lane_world a5b
run_deploy
check "a lane deploy with no name exits 0" 0 "$RC"
case " $(lane_entries)" in *" .full-deploy "*) ok "  the bundle carries the full-deploy marker" ;; *) bad "  the bundle carries the full-deploy marker (entries: $(lane_entries))" ;; esac
case " $(lane_entries)" in *" fn-c "*) ok "  the full bundle holds every function" ;; *) bad "  the full bundle holds every function (entries: $(lane_entries))" ;; esac

echo "A6. self-hosted: every documented invocation still behaves as before"
seeded_world a6
run_deploy
check "no name: full deploy exits 0" 0 "$RC"
check "  every function replaced (fn-c)" "branch v2" "$(srv fn-c)"
check "  a full deploy prunes a function the checkout lacks" "MISSING" "$(srv fn-server-only)"
hasnt "  a full deploy prints no named list" "$W/out" "^Named functions"
seeded_world a6b
run_deploy fn-a
check "one name exits 0" 0 "$RC"
check "  it was deployed" "branch v2" "$(srv fn-a)"
check "  the others were not" "main v1" "$(srv fn-b)"
check "  no pruning" "server only" "$(srv fn-server-only)"
seeded_world a6c
( cd "$R" && git commit -qam "v2 on main" ) >/dev/null 2>&1
SHA="$(git -C "$R" rev-parse HEAD)"
echo 'uncommitted v3' > "$R/supabase/functions/fn-a/index.ts"
run_deploy --from-commit "$SHA" fn-a
check "--from-commit <sha> <name> exits 0" 0 "$RC"
check "  the commit's content is deployed, not the uncommitted edit" "branch v2" "$(srv fn-a)"
check "  the others were not deployed" "main v1" "$(srv fn-b)"
seeded_world a6d
( cd "$R" && git commit -qam "v2 on main" ) >/dev/null 2>&1
SHA="$(git -C "$R" rev-parse HEAD)"
run_deploy --from-commit "$SHA" fn-a fn-b
check "--from-commit <sha> with two names exits 0" 0 "$RC"
check "  the first name" "branch v2" "$(srv fn-a)"
check "  the second name" "branch v2" "$(srv fn-b)"
check "  the unnamed function" "main v1" "$(srv fn-c)"
: > "$W/stubstate/scp.log"
run_deploy "--from-commit=$SHA"
check "--from-commit=<sha> with no name exits 0 (full deploy of that commit)" 0 "$RC"
check "  every function is the commit's" "branch v2" "$(srv fn-c)"
seeded_world a6e
( cd "$R" && git commit -qam "v2 on main" ) >/dev/null 2>&1
SHA="$(git -C "$R" rev-parse HEAD)"
run_deploy --from-main-tip --lock-wait 5 --clear-dead-lock --record-landing "$SHA"
check "the landing call (--from-main-tip with its flags) exits 0" 0 "$RC"
check "  main's tip is deployed" "branch v2" "$(srv fn-b)"
mk_world a6f
run_deploy --help
check "--help exits 0" 0 "$RC"
has "  prints the usage" "$W/out" "deploy-functions.sh"
# The help text is a line range of the header comment. Compare both ends with the header as it is
# in the script, so a range left short or run long after the header changes fails here.
HELP_FIRST="$(sed -n '2p' "$SELF_UT" | sed 's/^# \{0,1\}//')"
HELP_LAST="$(awk 'NR > 1 && !/^#/ { exit } NR > 1 { l = $0 } END { sub(/^# ?/, "", l); print l }' "$SELF_UT")"
check "  the help starts at the header's first line" "$HELP_FIRST" "$(sed -n '1p' "$W/out")"
check "  the help ends at the header's last line" "$HELP_LAST" "$(tail -1 "$W/out")"
check "  uploads nothing" 0 "$(uploads)"
run_deploy --setup
check "--setup exits 0" 0 "$RC"
has "  reports the setup" "$W/out" "setup ok"
# The exit status of --check-secrets is not asserted: the mode exits 1 even when nothing is
# missing, before and after P1690 (a separate defect, reported with this work, not fixed here).
run_deploy --check-secrets
has "--check-secrets reports the missing names line" "$W/out" "MISSING required"
check "  none of these uploaded anything" 0 "$(uploads)"
run_deploy --env prod
refused "--env is refused as a hosted flag" "$RC"
has "  says so" "$W/out" "hosted-target flag"
run_deploy fn-a --project-ref x
refused "--project-ref is refused after a name too" "$RC"
run_deploy --nope fn-a
refused "an unknown flag is refused" "$RC"
# Value-taking flags (unchanged by P1690, recorded here): a missing value is refused by name; a
# following flag is read as the value, and for --from-commit that value is then refused as no commit.
run_deploy --from-commit
refused "--from-commit with no value is refused" "$RC"
has "  with its own message, not a shell error" "$W/out" "from-commit needs a commit"
run_deploy --from-commit --from-main-tip fn-a
refused "--from-commit followed by a flag is refused" "$RC"
has "  because the flag is read as the commit and is not one" "$W/out" "not a commit"
check "  still nothing uploaded" 0 "$(uploads)"

# =====================================================================================
# Part B — scripts/deploy-functions.sh hands every name to the self-hosted script
# =====================================================================================
echo
echo "B. wrapper: TEST deploys forward every name to the self-hosted script"
BR="$TMPROOT/wrap-test/repo"; BCALLS="$TMPROOT/wrap-test/calls"; BSTUBS="$TMPROOT/wrap-test/stubs"
mkdir -p "$BR/scripts/selfhosted" "$BSTUBS"
cp "$WRAP_UT" "$BR/scripts/deploy-functions.sh"
cp -R "$SRC_ROOT/scripts/lib" "$BR/scripts/lib"
cp "$SRC_ROOT/scripts/selfhosted/flip-test-env.py" "$BR/scripts/selfhosted/"
# Records each argument in brackets, so an empty argument is visible.
cat > "$BR/scripts/selfhosted/deploy-functions.sh" <<STUB
#!/bin/bash
line="SELFHOSTED-DEPLOY"
for a in "\$@"; do line="\$line [\$a]"; done
echo "\$line" >> "$BCALLS"
exit 0
STUB
chmod +x "$BR/scripts/selfhosted/deploy-functions.sh" "$BR/scripts/deploy-functions.sh"
for tool in npx supabase curl; do
  printf '#!/bin/bash\necho "HOSTED-TOOL %s" >> "%s"\nexit 1\n' "$tool" "$BCALLS" > "$BSTUBS/$tool"
done; chmod +x "$BSTUBS"/*
SELF_URL="$(sed -nE "s/^SELF_URL = '(.*)'/\1/p" "$SRC_ROOT/scripts/selfhosted/flip-test-env.py")"
[ -n "$SELF_URL" ] || fixture_broken "cannot read SELF_URL from flip-test-env.py"
printf 'VITE_SUPABASE_URL=%s\nSELFHOSTED_TEST_ORIGIN=%s\n' "$SELF_URL" "$SELF_URL" > "$TMPROOT/wrap-test/flip-selfhosted"
git -C "$BR" init -q
wrap_test() { # args...
  : > "$BCALLS"
  ( cd "$BR" && CP_ACTIVE_TEST_FILE="$TMPROOT/wrap-test/flip-selfhosted" PATH="$BSTUBS:$PATH" bash scripts/deploy-functions.sh "$@" ) > "$TMPROOT/wrap-test/out" 2>&1
  RC=$?; RAN="$(cat "$BCALLS")"
}
wrap_test fn-a fn-b fn-c
check "three names exit 0" 0 "$RC"
check "  all three are forwarded, in order" "SELFHOSTED-DEPLOY [fn-a] [fn-b] [fn-c]" "$RAN"
wrap_test fn-a
check "one name is forwarded as before" "SELFHOSTED-DEPLOY [fn-a]" "$RAN"
wrap_test
check "no name forwards no name (deploy all), as before" "SELFHOSTED-DEPLOY" "$RAN"
wrap_test fn-a fn-a
check "a repeated name is forwarded once" "SELFHOSTED-DEPLOY [fn-a]" "$RAN"
wrap_test "" fn-a
refused "an empty name is refused" "$RC"
check "  and nothing ran" "" "$RAN"

echo "B2. wrapper: --env must carry a value (a prod deploy mistyped must not become a TEST deploy)"
BOUT="$TMPROOT/wrap-test/out"
env_refused() { # label, args...
  local label="$1"; shift
  wrap_test "$@"
  refused "$label" "$RC"
  check "  and nothing ran" "" "$RAN"
  has "  says --env needs a value" "$BOUT" "\-\-env needs a value"
}
env_refused "--env as the last argument" fn-a --env
env_refused "--env alone (it used to deploy everything to TEST)" --env
env_refused "--env= with nothing after it" fn-a --env=
env_refused "--env followed by a flag" --env --help fn-a
env_refused "--env with an empty value" --env "" fn-a
env_refused "--env= followed by something that looks like a flag" fn-a --env=--prod
# A later, valid --env must not hide an earlier one that had no value.
env_refused "--env typed twice before its value" --env --env prod
env_refused "--env twice, then a function name (it used to deploy everything to TEST)" --env --env fn-a
env_refused "an empty --env value, then a good one" --env "" --env local fn-a
env_refused "a flag-shaped --env= value, then a good one" --env=--bad --env=local fn-a
env_refused "an empty --env= value, then a good one" --env= --env=local fn-a
echo "   documented --env shapes still parse"
wrap_test fn-a --env test
check "<name> --env test goes to TEST with that name" "SELFHOSTED-DEPLOY [fn-a]" "$RAN"
wrap_test --env local fn-a
check "--env local <name> goes to TEST with that name" "SELFHOSTED-DEPLOY [fn-a]" "$RAN"
wrap_test --env=local
check "--env=local alone goes to TEST with no name" "SELFHOSTED-DEPLOY" "$RAN"
wrap_test fn-a --env test fn-b
check "a flag between two names keeps both names" "SELFHOSTED-DEPLOY [fn-a] [fn-b]" "$RAN"
wrap_test fn-a --env hosted-test
refused "--env hosted-test still reaches the hosted-TEST switch, which refuses" "$RC"
has "  with the switch's own message" "$BOUT" "hosted TEST is switched off"
check "  and nothing ran" "" "$RAN"

# =====================================================================================
# Part C and D — scripts/deploy-functions.sh --env prod (hosted path), and the .env.prod lookup
# =====================================================================================
HSTUBS="$TMPROOT/hosted-stubs"; mkdir -p "$HSTUBS"
# supabase: refuses a name the real CLI refuses (its own rule, quoted in its error text), and
# records what it uploaded, to which project, and with which flag.
cat > "$HSTUBS/supabase" <<'STUB'
#!/bin/bash
# args: functions deploy <name> --project-ref <ref> [--no-verify-jwt]
if [ "$1 $2" != "functions deploy" ]; then echo "unexpected supabase call: $*"; exit 2; fi
if ! [[ "$3" =~ ^[A-Za-z][A-Za-z0-9_-]*$ ]]; then
  echo "$3" >> "$STUB_RECORD_REFUSED"
  echo "Invalid Function name. Must start with at least one letter, and only include alphanumeric characters, underscores, and hyphens. (^[A-Za-z][A-Za-z0-9_-]*$)"
  exit 1
fi
if [ -n "${STUB_FAIL_FN:-}" ] && [ "$3" = "$STUB_FAIL_FN" ]; then echo "upload failed"; exit 1; fi
echo "$3 $5" >> "$STUB_RECORD_DEPLOYS"
echo "$3 ${6:-no-flag}" >> "$STUB_RECORD_FLAGS"
echo "Deployed Function $3"
exit 0
STUB
# security: never reach the real login keychain.
printf '#!/bin/bash\nexit 1\n' > "$HSTUBS/security"
chmod +x "$HSTUBS"/*

build_hosted() { # root: a committed repository, so a linked worktree gets scripts/ as a native checkout
  local root="$1"
  mkdir -p "$root/scripts/lib" "$root/supabase/functions/_shared" "$root/supabase/functions/alpha-fn" \
           "$root/supabase/functions/beta-fn" "$root/supabase/functions/create-and-sign"
  cp "$WRAP_UT" "$root/scripts/deploy-functions.sh"; chmod +x "$root/scripts/deploy-functions.sh"
  # Real keyring.sh, stub keychain.py: no login keychain, no dialog, no notification. The stub
  # records every time it is asked, and declines when STUB_KEYCHAIN_DECLINE=1.
  cp "$SRC_ROOT/scripts/keyring.sh" "$root/scripts/keyring.sh"
  # P1732: the prod path's shared lock + preflight, and the tracer that scopes the preflight.
  cp "$SRC_ROOT/scripts/lib/prod-functions.sh" "$SRC_ROOT/scripts/lib/function-input-hash.py" "$root/scripts/lib/"
  cat > "$root/scripts/lib/keychain.py" <<'STUB'
import os, sys
if len(sys.argv) >= 3 and sys.argv[1] == "get":
    rec = os.environ.get("STUB_RECORD_KEYRING")
    if rec:
        with open(rec, "a") as f:
            f.write("asked\n")
    if os.environ.get("STUB_KEYCHAIN_DECLINE") == "1":
        sys.exit(1)
    sys.stdout.write("stub-value-not-a-token")
    sys.exit(0)
sys.exit(1)
STUB
  : > "$root/supabase/functions/_shared/cors.ts"
  for f in alpha-fn beta-fn create-and-sign; do : > "$root/supabase/functions/$f/index.ts"; done
  echo 'create-and-sign' > "$root/supabase/no-verify-jwt-functions.txt"
  printf '#!/bin/bash\nexit 0\n' > "$root/scripts/check-edge-function-secrets.sh"
  # The stamp stand-in refuses exactly where the real stamp does: when the working directory is
  # under .claude/worktrees (its guard is copied here; a check in part D fails if the real script's
  # guard changes). STUB_STAMP_EXIT forces a failure anywhere else.
  cat > "$root/scripts/stamp-deploy-manifest.sh" <<'STUB'
#!/bin/bash
echo "$*" >> "$STUB_RECORD_STAMP"
if [[ "$PWD" == *".claude/worktrees"* ]]; then
  echo "ERROR: stamp-deploy-manifest.sh must run from the main repo root, not from a worktree."
  exit 1
fi
if [ "${STUB_STAMP_EXIT:-0}" != "0" ]; then
  echo "ERROR: the stamp failed (forced by the canary)."
  exit "$STUB_STAMP_EXIT"
fi
exit 0
STUB
  cat > "$root/scripts/edge-function-smoke.mjs" <<'STUB'
import { appendFileSync } from 'fs';
appendFileSync(process.env.STUB_RECORD_SMOKE, process.argv.slice(2).join(' ') + '\n');
process.exit(Number(process.env.STUB_SMOKE_EXIT || '0'));
STUB
  chmod +x "$root/scripts/check-edge-function-secrets.sh" "$root/scripts/stamp-deploy-manifest.sh"
  printf '.env.prod\n.env.local\n.claude/\n' > "$root/.gitignore"
  (
    cd "$root" && git init -q && git config user.email t@t && git config user.name t && git config commit.gpgsign false
    git add -A && git commit -qm seed && git branch -M main
  ) >/dev/null 2>&1
  [ -n "$(git -C "$root" rev-parse -q --verify HEAD 2>/dev/null)" ] || fixture_broken "hosted repository $root was not committed"
}
run_hosted() { # cwd, args...; fills RC, OUT, DEPLOYS, FLAGS, CLI_REFUSED, KEYRING, STAMP, SMOKE
  local cwd="$1"; shift
  local rec="$TMPROOT/hosted-rec"; mkdir -p "$rec"
  : > "$rec/deploys"; : > "$rec/stamp"; : > "$rec/smoke"; : > "$rec/flags"; : > "$rec/refused"; : > "$rec/keyring"
  OUT="$(cd "$cwd" && env PATH="$HSTUBS:$PATH" STUB_RECORD_DEPLOYS="$rec/deploys" STUB_RECORD_STAMP="$rec/stamp" \
    STUB_RECORD_SMOKE="$rec/smoke" STUB_RECORD_FLAGS="$rec/flags" STUB_RECORD_REFUSED="$rec/refused" \
    STUB_RECORD_KEYRING="$rec/keyring" STUB_KEYCHAIN_DECLINE="${KEYRING_DECLINE:-0}" STUB_FAIL_FN="${FAIL_FN:-}" \
    STUB_STAMP_EXIT="${STAMP_EXIT:-0}" STUB_SMOKE_EXIT="${SMOKE_EXIT:-0}" bash "${HOSTED_SCRIPT:-./scripts/deploy-functions.sh}" "$@" 2>&1)"
  RC=$?
  DEPLOYS="$(tr '\n' ',' < "$rec/deploys")"; STAMP="$(tr '\n' ';' < "$rec/stamp")"; SMOKE="$(tr '\n' ';' < "$rec/smoke")"
  FLAGS="$(tr '\n' ',' < "$rec/flags")"; CLI_REFUSED="$(tr '\n' ',' < "$rec/refused")"; KEYRING="$(tr '\n' ',' < "$rec/keyring")"
  printf '%s\n' "$OUT" > "$rec/out"
}
HOUT="$TMPROOT/hosted-rec/out"

echo
echo "C. wrapper: --env prod deploys, stamps and smokes every name given"
HM="$TMPROOT/hosted-main"
build_hosted "$HM"
printf 'VITE_SUPABASE_URL=https://mainref.supabase.co\n' > "$HM/.env.prod"   # a fake project address, no token
run_hosted "$HM" alpha-fn beta-fn --env prod
check "two names then --env prod exit 0" 0 "$RC"
check "  both are uploaded, to the project the env file names" "alpha-fn mainref,beta-fn mainref," "$DEPLOYS"
check "  both are stamped" "--env prod --functions-only --function alpha-fn --function beta-fn;" "$STAMP"
case "$SMOKE" in *"--only alpha-fn,beta-fn"*) ok "  both are smoked" ;; *) bad "  both are smoked (smoke args: $SMOKE)" ;; esac
check "  the prod token is asked for once (the control for every 'never asked' check below)" "asked," "$KEYRING"
run_hosted "$HM" alpha-fn --env prod beta-fn
check "--env prod between two names uploads both" "alpha-fn mainref,beta-fn mainref," "$DEPLOYS"
run_hosted "$HM" alpha-fn create-and-sign --env prod
check "a function on the open list keeps its flag beside another name, and only it gets the flag" "alpha-fn no-flag,create-and-sign --no-verify-jwt," "$FLAGS"
run_hosted "$HM" --env prod beta-fn alpha-fn
check "--env prod then two names uploads both, in the order given" "beta-fn mainref,alpha-fn mainref," "$DEPLOYS"
run_hosted "$HM" --env=prod alpha-fn
check "--env=prod <name> uploads that one" "alpha-fn mainref," "$DEPLOYS"
run_hosted "$HM" alpha-fn alpha-fn --env prod
check "a repeated name is uploaded once" "alpha-fn mainref," "$DEPLOYS"
run_hosted "$HM" nope alpha-fn --env prod
refused "a name with no directory, first, refuses the call" "$RC"
check "  nothing uploaded" "" "$DEPLOYS"
run_hosted "$HM" alpha-fn nope --env prod
refused "a name with no directory, last, refuses the call" "$RC"
check "  nothing uploaded" "" "$DEPLOYS"
run_hosted "$HM" "" alpha-fn --env prod
refused "an empty name refuses the call" "$RC"
check "  nothing uploaded" "" "$DEPLOYS"

echo "C2. wrapper: only bare function names reach a hosted deploy, and a bad name never costs a prod-token prompt"
hosted_name_refused() { # label, args...
  local label="$1"; shift
  run_hosted "$HM" "$@"
  refused "$label" "$RC"
  check "  nothing uploaded" "" "$DEPLOYS"
  check "  nothing even offered to the CLI" "" "$CLI_REFUSED"
  check "  the prod token was never asked for" "" "$KEYRING"
}
hosted_name_refused "the shared library named beside a function" alpha-fn _shared --env prod
has "  says it is not a function name" "$HOUT" "not a function name"
hosted_name_refused "a trailing slash, as tab completion leaves it" alpha-fn beta-fn/ --env prod
hosted_name_refused "a ./ prefix, first" ./alpha-fn beta-fn --env prod
hosted_name_refused "a dot" alpha-fn . --env prod
hosted_name_refused "a path that resolves to a real function directory" alpha-fn ../functions/beta-fn --env prod
hosted_name_refused "a name with a space" alpha-fn "beta fn" --env prod
hosted_name_refused "a name with no directory, last" alpha-fn nope --env prod
has "  says the directory was not found" "$HOUT" "directory not found"
hosted_name_refused "a name with no directory, alone" nope --env prod
echo "   documented shapes"
run_hosted "$HM" --env prod
check "--env prod alone exits 0" 0 "$RC"
check "  every function directory is uploaded, never _shared" "alpha-fn mainref,beta-fn mainref,create-and-sign mainref," "$DEPLOYS"
run_hosted "$HM" alpha-fn --env prod
check "<name> --env prod exits 0" 0 "$RC"
check "  only that function is uploaded" "alpha-fn mainref," "$DEPLOYS"
check "  only that function is stamped" "--env prod --functions-only --function alpha-fn;" "$STAMP"

echo
echo "D. wrapper: --env prod finds .env.prod from a linked worktree"
# The worktree sits where this repository keeps its worktrees, so the stamp stand-in refuses it by
# the real stamp's own rule, with nothing forced.
HW="$HM/.claude/worktrees/w9"
( cd "$HM" && git worktree add -q -b feature/canary "$HW" ) >/dev/null 2>&1
[ -f "$HW/scripts/deploy-functions.sh" ] || fixture_broken "the linked worktree has no scripts/ checkout"
[ ! -e "$HW/.env.prod" ] || fixture_broken "the linked worktree unexpectedly holds an .env.prod"
[ -z "$(git -C "$HM" status --porcelain)" ] || fixture_broken "the worktree shows up as a change in the main checkout"
if grep -q -F '*".claude/worktrees"*' "$SRC_ROOT/scripts/stamp-deploy-manifest.sh"; then
  ok "the real stamp script still refuses by the path rule that the notice and the stand-in copy"
else
  bad "the real stamp script no longer refuses by a path under .claude/worktrees: the wrapper's notice and this stand-in copy that rule and are now wrong"
fi
# A function that exists only in the worktree: proves the worktree's own code is what is deployed.
mkdir -p "$HW/supabase/functions/wt-only-fn"; : > "$HW/supabase/functions/wt-only-fn/index.ts"
run_hosted "$HW" alpha-fn wt-only-fn --env prod
check "from the worktree, with the file only in the main checkout: the main checkout's project address is used, and the worktree's functions are deployed" "alpha-fn mainref,wt-only-fn mainref," "$DEPLOYS"
has "  a notice says this deploys the worktree's code to prod" "$HOUT" "deploys this worktree's code to prod"
has "  and where the env file was read from" "$HOUT" "\.env\.prod was read from the main checkout"
has "  and that this run will end non-zero, because the stamp refuses here" "$HOUT" "this run will end non-zero"
has "  and that a re-stamp from main must wait for the merge" "$HOUT" "until this branch is merged"
refused "  the run does end non-zero: the stamp refused, as the notice said" "$RC"
has "  says the manifest was not updated" "$HOUT" "Manifest NOT updated"
has "  the re-stamp hint says to wait for the merge" "$HOUT" "AFTER this branch is merged"
case "$SMOKE" in *"--only alpha-fn,wt-only-fn"*) ok "  and the smoke still ran" ;; *) bad "  and the smoke still ran (smoke args: $SMOKE)" ;; esac
KEYRING_DECLINE=1 run_hosted "$HW" alpha-fn --env prod
refused "  with the prod token declined the run stops" "$RC"
check "    nothing uploaded" "" "$DEPLOYS"
has "    and the notice was already printed, so it comes before the token prompt" "$HOUT" "deploys this worktree's code to prod"
FAIL_FN=beta-fn run_hosted "$HW" alpha-fn beta-fn --env prod
refused "  one upload failing and the stamp refusing: ends non-zero" "$RC"
has "    names the failed function" "$HOUT" "failed to deploy: beta-fn"
has "    and this re-stamp hint says to wait for the merge too" "$HOUT" "AFTER this branch is merged"
SMOKE_EXIT=1 run_hosted "$HW" alpha-fn --env prod
refused "  the smoke failing after the stamp refused: ends non-zero" "$RC"
hasnt "    the smoke message does not claim the manifest records the upload" "$HOUT" "the manifest records it"
has "    it says the manifest was not updated" "$HOUT" "post-deploy smoke failed. The upload succeeded and the manifest was NOT updated"
SMOKE_EXIT=1 run_hosted "$HM" alpha-fn --env prod
refused "control, the main checkout with a failing smoke: ends non-zero" "$RC"
has "  there the stamp ran, and the message says the manifest records the upload" "$HOUT" "the manifest records it"
STAMP_EXIT=1 run_hosted "$HM" alpha-fn --env prod
refused "control, the main checkout with a failing stamp: ends non-zero" "$RC"
has "  with the plain re-stamp hint" "$HOUT" "Re-stamp from the main"
hasnt "  and no wait-for-the-merge wording, which would be wrong there" "$HOUT" "this branch is merged"
hasnt "  and no worktree notice" "$HOUT" "deploys this worktree's code to prod"
# The main checkout reached through a symbolic link is still the main checkout.
ln -s "$HM" "$TMPROOT/hosted-main-link"
run_hosted "$TMPROOT/hosted-main-link" alpha-fn --env prod
check "the main checkout reached through a symbolic link: exit 0" 0 "$RC"
check "  the function is deployed" "alpha-fn mainref," "$DEPLOYS"
hasnt "  and it is not mistaken for a worktree" "$HOUT" "deploys this worktree's code to prod"
# A linked worktree OUTSIDE .claude/worktrees: the stamp does not refuse there, so the notice must
# not promise a non-zero exit.
HO="$TMPROOT/hosted-wt-outside"
( cd "$HM" && git worktree add -q -b feature/outside "$HO" ) >/dev/null 2>&1
[ -f "$HO/scripts/deploy-functions.sh" ] || fixture_broken "the outside worktree has no scripts/ checkout"
run_hosted "$HO" alpha-fn --env prod
check "a worktree outside the worktrees folder, where the stamp runs: exit 0" 0 "$RC"
check "  the function is deployed to the main checkout's project" "alpha-fn mainref," "$DEPLOYS"
has "  the notice still says this deploys the worktree's code" "$HOUT" "deploys this worktree's code to prod"
has "  and still warns against a re-stamp from main before the merge" "$HOUT" "until this branch is merged"
hasnt "  but it does not promise a non-zero exit that will not happen" "$HOUT" "will end non-zero"
# The one shape the old fallback did serve: the main checkout's copy of the script, run from the worktree.
HOSTED_SCRIPT="$HM/scripts/deploy-functions.sh" run_hosted "$HW" wt-only-fn --env prod
check "the main checkout's script run from the worktree still finds the file and deploys the worktree's code" "wt-only-fn mainref," "$DEPLOYS"
printf 'VITE_SUPABASE_URL=https://wtref.supabase.co\n' > "$HW/.env.prod"
run_hosted "$HW" alpha-fn --env prod
check "a worktree's own .env.prod wins" "alpha-fn wtref," "$DEPLOYS"
has "  the worktree notice is still printed: the stamp refuses this worktree, whose-ever file was read" "$HOUT" "deploys this worktree's code to prod"
hasnt "  but it does not claim the file came from the main checkout" "$HOUT" "was read from the main checkout"

# A bare repository has no main checkout: the parent of its git directory is an unrelated folder.
# A stray .env.prod there must never be read as "the main checkout's".
BP="$TMPROOT/bare-parent"; BW="$TMPROOT/bare-wt"
mkdir -p "$BP"
git clone -q --bare "$HM" "$BP/repo.git" >/dev/null 2>&1
git --git-dir "$BP/repo.git" worktree add -q -b feature/bare "$BW" main >/dev/null 2>&1
[ -f "$BW/scripts/deploy-functions.sh" ] || fixture_broken "the worktree of the bare repository has no scripts/ checkout"
printf 'VITE_SUPABASE_URL=https://strayref.supabase.co\n' > "$BP/.env.prod"
run_hosted "$BW" alpha-fn --env prod
refused "a worktree of a bare repository, with a stray .env.prod beside the repository: refused" "$RC"
check "  nothing uploaded, to the stray project or anywhere" "" "$DEPLOYS"
check "  the prod token was never asked for" "" "$KEYRING"
hasnt "  the stray file is not called the main checkout's" "$HOUT" "main checkout"

rm -f "$HW/.env.prod" "$HM/.env.prod"
run_hosted "$HW" alpha-fn --env prod
refused "with no .env.prod in either checkout the run is refused" "$RC"
check "  nothing uploaded" "" "$DEPLOYS"
has "  names the worktree it looked in" "$HOUT" "$HW/.env.prod"
has "  names the main checkout it looked in" "$HOUT" "$HM/.env.prod"
run_hosted "$HM" alpha-fn --env prod
refused "the main checkout with no .env.prod is refused too" "$RC"
check "  nothing uploaded" "" "$DEPLOYS"

echo
echo "P1690: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
