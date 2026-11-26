#!/usr/bin/env bash
# scripts/test-p1732-prod-functions.sh — hermetic canary for P1732 (the /push prod function step).
#
# Covers every Done-When test item of features/p1732_push_deploys_stale_prod_functions.md except
# Gating (skill-side): source binding (shown failing against the pre-P1732 deploy-functions.sh),
# selection incl. JWT policy both ways, supersession, concurrency, partial failure, smoke failure,
# stamp failure, manifest isolation, preflight fail-closed, rollback mode, and the /day check.
#
# Hermetic: temp git repositories with a bare "origin", a fake `supabase` CLI on PATH (records each
# uploaded directory's content hash, the project ref and the flags; serves a fake secret inventory),
# a fake smoke, a fake keyring.sh (records every unlock, never touches the keychain) and a fake
# git-ops.sh commit-to-main. No network, no prod, no TEST, no keychain, no .env.prod is sourced.
#
# The scripts under test default to this checkout's. To show the suite can fail, point
#   P1732_SCRIPT_UNDER_TEST=<file>        at a mutated copy of deploy-prod-functions.sh, or
#   P1732_DEPLOY_FUNCTIONS_UNDER_TEST=<file> at a mutated copy of deploy-functions.sh,
#   P1732_STAMP_UNDER_TEST=<file> / P1732_LIB_UNDER_TEST=<file> at mutated copies of
#   stamp-deploy-manifest.sh / lib/prod-functions.sh.
# scripts/test-p1732-mutation-controls.sh runs eight such mutations and requires each to fail.
#
# Exit: 0 all passed · 1 a check failed · 2 a fixture could not be built (not a result).
# Output contract (shell-safety.md): status lines carry no redirect or pipe tokens.
set -u
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR SKIP_EDGE_SECRET_CHECK EDGE_SMOKE

SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UT="${P1732_SCRIPT_UNDER_TEST:-$SRC_ROOT/scripts/deploy-prod-functions.sh}"
DF_UT="${P1732_DEPLOY_FUNCTIONS_UNDER_TEST:-$SRC_ROOT/scripts/deploy-functions.sh}"

PASS=0; FAIL=0
ok()  { echo "  OK   $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL+1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (wanted '$2', got '$3')"; fi; }
has()   { if grep -qF -e "$3" "$2" 2>/dev/null; then ok "$1"; else bad "$1 (no '$3' in: $(head -c 400 "$2" | tr '\n' ' '))"; fi; }
hasnt() { if grep -qF -e "$3" "$2" 2>/dev/null; then bad "$1 (found '$3')"; else ok "$1"; fi; }
broken() { echo "FIXTURE: $1"; exit 2; }
G() { git -c user.email=t@t.t -c user.name=t -c commit.gpgsign=false "$@"; }

# The /push skill guards step 7 with `[ -x scripts/deploy-prod-functions.sh ]` and prints "not
# installed" otherwise, so a committed 100644 mode silently skips every prod function deploy.
# Two checks, because each alone has a blind spot. The INDEX mode (what the next commit records;
# not HEAD, so the commit that fixes a bad mode is not blocked by its own test) catches a chmod
# that never reached git and so fails on every other checkout. The working-tree -x bit is what the
# guard actually reads, and catches a checkout that lost it (core.fileMode=false, tarball, copy).
for _s in deploy-prod-functions.sh deploy-functions.sh; do
  check "git records $_s as executable (100755)" "100755" \
    "$(G -C "$SRC_ROOT" ls-files -s -- "scripts/$_s" | cut -d' ' -f1)"
  if [ -x "$SRC_ROOT/scripts/$_s" ]; then ok "$_s has the working-tree executable bit"; else bad "$_s lacks the working-tree executable bit"; fi
done
unset _s

T="$(mktemp -d)"
trap 'pkill -P $$ sleep 2>/dev/null; rm -rf "$T"' EXIT
REF="fixref"

# --- fake CLIs ----------------------------------------------------------------------------------
BIN="$T/bin"; mkdir -p "$BIN"
cat > "$BIN/supabase" <<'STUB'
#!/bin/bash
R="$STUB_REC"
case "$1 $2" in
  "functions deploy")
    # Flags by name, not position. --workdir is honoured the way the real CLI honours it: the
    # bundle comes from that directory, so the recorded hash shows which source was uploaded.
    fn="$3"; ref=""; flags="none"; wd="${SUPABASE_WORKDIR:-$PWD}"; shift 3
    while [ $# -gt 0 ]; do case "$1" in --project-ref) ref="$2"; shift 2 ;; --workdir) wd="$2"; shift 2 ;;
      --no-verify-jwt) flags="--no-verify-jwt"; shift ;; *) shift ;; esac; done
    mkdir "$R/busy" 2>/dev/null || echo "OVERLAP $fn" >> "$R/overlap"
    h="$(cd "$wd/supabase/functions" && find "$fn" _shared -type f 2>/dev/null | LC_ALL=C sort | while read -r f; do printf '%s\n' "$f"; cat "$f"; done | shasum -a 256 | cut -c1-16)"
    echo "$fn $ref $flags $h" >> "$R/uploads"
    sleep "${STUB_UPLOAD_SLEEP:-0}"
    rmdir "$R/busy" 2>/dev/null
    case ",${STUB_FAIL:-}," in *",$fn,"*) echo "upload boom"; exit 1 ;; esac
    echo "Deployed Function $fn"; exit 0 ;;
  "secrets list")
    echo "$4" >> "$R/secrets-ref"
    if [ "${STUB_SECRETS_FAIL:-0}" = 1 ]; then echo "unexpected API error 500"; exit 1; fi
    out='{"secrets":['; sep=""
    IFS=, read -ra names <<< "${STUB_SECRETS-SECRET_A,SECRET_B}"
    for n in "${names[@]}"; do [ -n "$n" ] && { out="$out$sep{\"name\":\"$n\"}"; sep=","; }; done
    echo "$out]}"; exit 0 ;;
esac
echo "$*" >> "$R/other-cli"; exit 2
STUB
printf '#!/bin/bash\nexit 1\n' > "$BIN/security"
chmod +x "$BIN"/*

# content hash of a function as uploaded from DIR (same formula as the fake CLI)
tree_hash() { ( cd "$1/supabase/functions" && find "$2" _shared -type f 2>/dev/null | LC_ALL=C sort | while read -r f; do printf '%s\n' "$f"; cat "$f"; done | shasum -a 256 | cut -c1-16 ); }
hash_at() { # world-main sha fn
  local d="$T/at.$RANDOM"; mkdir -p "$d"; git -C "$1" archive "$2" supabase | tar -x -C "$d"; tree_hash "$d" "$3"; rm -rf "$d"; }

# --- a world: bare origin + the main checkout ---------------------------------------------------
mk_world() {
  W="$T/$1"; M="$W/main"; O="$W/origin.git"; REC="$W/rec"
  mkdir -p "$W/seed/scripts/lib" "$W/seed/supabase/functions"/{_shared,fn-a,fn-b,fn-c} "$REC"
  local S="$W/seed"
  cp "$UT" "$S/scripts/deploy-prod-functions.sh"
  cp "$DF_UT" "$S/scripts/deploy-functions.sh"
  cp "${P1732_STAMP_UNDER_TEST:-$SRC_ROOT/scripts/stamp-deploy-manifest.sh}" "$S/scripts/stamp-deploy-manifest.sh"
  cp "$SRC_ROOT/scripts/check-edge-function-secrets.sh" "$S/scripts/check-edge-function-secrets.sh"
  cp "$SRC_ROOT/scripts/lib/function-input-hash.py" "$S/scripts/lib/"
  cp "${P1732_LIB_UNDER_TEST:-$SRC_ROOT/scripts/lib/prod-functions.sh}" "$S/scripts/lib/prod-functions.sh"
  cat > "$S/scripts/keyring.sh" <<'STUB'
keyring_require() { echo "$1" >> "$STUB_REC/keyring"; [ -n "${STUB_KEYRING_HOOK:-}" ] && bash "$STUB_KEYRING_HOOK"; export "$1=sbp_fake_not_a_token"; return 0; }
STUB
  if [ "${REAL_GITOPS:-0}" = 1 ]; then cp "${P1732_GITOPS_UNDER_TEST:-$SRC_ROOT/scripts/git-ops.sh}" "$S/scripts/git-ops.sh"; mkdir -p "$S/.claude/worktrees"; touch "$S/.claude/worktrees/.keep"; else
  cat > "$S/scripts/git-ops.sh" <<'STUB'
#!/bin/bash
[ "$1" = commit-to-main ] || exit 2; shift; msg=""; files=(); cf=""; eb=""
while [ $# -gt 0 ]; do case "$1" in --message) msg="$2"; shift 2 ;; --content-file) cf="$2"; shift 2 ;; --expect-head-blob) eb="$2"; shift 2 ;;
  --files) shift; while [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; do files+=("$1"); shift; done ;; *) shift ;; esac; done
echo "$msg" >> "$STUB_REC/commits"
if [ "${STUB_GITOPS_FAIL:-0}" = 1 ]; then echo "commit-to-main: forced failure"; exit 1; fi
if [ -n "$cf" ]; then  # the real --content-file semantics: CAS on HEAD's blob, stage the blob, never the working file
  act="$(git rev-parse -q --verify "HEAD:${files[0]}" 2>/dev/null || echo none)"
  [ -z "$eb" ] || [ "$act" = "$eb" ] || { echo "moved"; exit 4; }
  b="$(git hash-object -w -- "$cf")" && git update-index --add --cacheinfo "100644,$b,${files[0]}" || exit 1
  git -c user.email=t@t.t -c user.name=t -c commit.gpgsign=false commit -qm "$msg"; exit $?
fi
git add -- "${files[@]}" && git -c user.email=t@t.t -c user.name=t -c commit.gpgsign=false commit -qm "$msg"
STUB
  fi
  cat > "$S/scripts/edge-function-smoke.mjs" <<'STUB'
import { appendFileSync } from 'fs';
const a = process.argv.slice(2); const only = a[a.indexOf('--only') + 1];
appendFileSync(process.env.STUB_REC + '/smokes', only + ' ' + a[a.indexOf('--base-url') + 1] + '\n');
if (process.env.STUB_SMOKE_HANG) { appendFileSync(process.env.STUB_REC + '/smoke-hang.pid', String(process.pid)); setTimeout(() => process.exit(0), 60000); }
else process.exit((process.env.STUB_SMOKE_FAIL || '').split(',').some((n) => only.split(',').includes(n)) ? 1 : 0);
STUB
  chmod +x "$S"/scripts/*.sh
  echo 'export const u = 1;' > "$S/supabase/functions/_shared/util.ts"
  printf "import { u } from '../_shared/util.ts';\nconst k = Deno.env.get('SECRET_A');\nexport default u;\n" > "$S/supabase/functions/fn-a/index.ts"
  printf "import { u } from '../_shared/util.ts';\nconst k = Deno.env.get('SECRET_B');\nexport default u;\n" > "$S/supabase/functions/fn-b/index.ts"
  printf "export const c = 1;\n" > "$S/supabase/functions/fn-c/index.ts"
  echo '{}' > "$S/supabase/functions/deno.json"
  printf '# list\nfn-c\n' > "$S/supabase/no-verify-jwt-functions.txt"
  printf '.env.prod\n' > "$S/.gitignore"
  python3 - "$S" <<'PY' || broken "baseline manifest"
import json, subprocess, sys
s = sys.argv[1]
r = json.loads(subprocess.check_output([sys.executable, s + '/scripts/lib/function-input-hash.py', s + '/supabase/functions',
                                        '--jwt-policy', s + '/supabase/no-verify-jwt-functions.txt']))
m = {'prod': {'functions': r['hashes']}, 'test': {'functions': {'fn-a': 't0'}}}
json.dump(m, open(s + '/supabase/deploy-manifest.json', 'w'), indent=2)
PY
  ( cd "$S" && G init -q && G add -A && G commit -qm seed && G branch -M main ) >/dev/null 2>&1 || broken "seed commit"
  G init -q --bare "$O" >/dev/null 2>&1 && G -C "$S" push -q "$O" main >/dev/null 2>&1 || broken "origin"
  G clone -q "$O" "$M" >/dev/null 2>&1 || broken "main clone"
  G -C "$M" config user.email t@t.t; G -C "$M" config user.name t; G -C "$M" config commit.gpgsign false
  printf 'VITE_SUPABASE_URL=https://%s.supabase.co\n' "$REF" > "$M/.env.prod"
  : > "$REC/uploads"; : > "$REC/keyring"; : > "$REC/smokes"; : > "$REC/commits"; : > "$REC/secrets-ref"
}
reset_rec() { : > "$REC/uploads"; : > "$REC/keyring"; : > "$REC/smokes"; : > "$REC/commits"; : > "$REC/secrets-ref"; rm -f "$REC/overlap"; }
# push_change <file-relative> <content> : commit on main and push to origin (what /push does)
push_change() { printf '%s\n' "$2" >> "$M/$1"; G -C "$M" add -- "$1"; G -C "$M" commit -qm "change $1"; G -C "$M" push -q origin main >/dev/null 2>&1 || broken "push"; }
push_set() { printf '%s\n' "$2" > "$M/$1"; G -C "$M" add -- "$1"; G -C "$M" commit -qm "set $1"; G -C "$M" push -q origin main >/dev/null 2>&1 || broken "push"; }
run() { # args... : the new script from the main checkout
  ( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" CP_PROD_PROJECT_REF_EXPECTED="${EXPECT_REF:-$REF}" \
      PROD_FN_LOCK_TIMEOUT="${LOCK_TIMEOUT:-60}" bash ./scripts/deploy-prod-functions.sh "$@" ) > "$W/out" 2>&1
  RC=$?
}
run_df() { # args... : the manual deploy-functions.sh from the main checkout
  ( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" CP_PROD_PROJECT_REF_EXPECTED="$REF" \
      PROD_FN_LOCK_TIMEOUT="${LOCK_TIMEOUT:-60}" bash ./scripts/deploy-functions.sh "$@" ) > "$W/df-out" 2>&1
  RC=$?
}
tip() { G -C "$M" ls-remote origin refs/heads/main | cut -c1-40; }
uploaded() { awk '{print $1}' "$REC/uploads" | tr '\n' ' ' | sed 's/ $//'; }
fp_now() { python3 "$M/scripts/lib/function-input-hash.py" "$1/supabase/functions" --jwt-policy "$1/supabase/no-verify-jwt-functions.txt" | python3 -c "import json,sys; print(json.load(sys.stdin)['hashes']['$2'])"; }
mf() { # <git-rev or WORK> <section> <fn>
  if [ "$1" = WORK ]; then cat "$M/supabase/deploy-manifest.json"; else G -C "$M" show "$1:supabase/deploy-manifest.json"; fi \
    | python3 -c "import json,sys; print((json.load(sys.stdin).get('$2') or {}).get('functions',{}).get('$3',''))"; }

[ "$(PATH="$BIN:$PATH" command -v supabase)" = "$BIN/supabase" ] || broken "the fake supabase CLI is not first on PATH"

echo "P1732 canary. Under test: $UT"

# =================================================================================================
echo "1. Source binding: the uploaded bytes are the target SHA's, not the working tree's"
mk_world w-src
push_change supabase/functions/fn-a/index.ts "// v2 committed"
TIP=$(tip); WANT=$(hash_at "$M" "$TIP" fn-a)
echo "// v3 UNCOMMITTED working-tree edit" >> "$M/supabase/functions/fn-a/index.ts"
DIRTY=$(tree_hash "$M" fn-a)
[ "$WANT" != "$DIRTY" ] || broken "the dirty edit did not change the hash"
# control: the pre-P1732 deploy-functions.sh, run the way a session ran it by hand
L="$W/legacy"; cp -R "$M" "$L"
git -C "$SRC_ROOT" show d1455d224:scripts/deploy-functions.sh > "$L/scripts/deploy-functions.sh" 2>/dev/null || broken "legacy script"
printf '#!/bin/bash\nexit 0\n' > "$L/scripts/stamp-deploy-manifest.sh"; chmod +x "$L/scripts/stamp-deploy-manifest.sh"
( cd "$L" && env PATH="$BIN:$PATH" STUB_REC="$REC" bash ./scripts/deploy-functions.sh fn-a --env prod ) > "$W/legacy-out" 2>&1
LEGACY_H=$(awk '$1=="fn-a"{print $4}' "$REC/uploads" | tail -1)
if [ "$LEGACY_H" = "$DIRTY" ] && [ "$LEGACY_H" != "$WANT" ]; then
  ok "CONTROL: the pre-P1732 script uploads the UNCOMMITTED working-tree bytes (this is the defect; the check below fails against it)"
else bad "CONTROL: legacy upload hash $LEGACY_H, dirty $DIRTY, target $WANT"; fi
reset_rec
run
check "new step exits 0" 0 "$RC"
check "uploaded fn-a only" "fn-a" "$(uploaded)"
check "uploaded bytes hash to the target SHA's fn-a" "$WANT" "$(awk '$1=="fn-a"{print $4}' "$REC/uploads")"
has "prints the batch line" "$W/out" "prod functions: deploying fn-a at ${TIP:0:9}"
has "prints the summary" "$W/out" "prod functions: 1 deployed, 0 not"
check "stamp records the target SHA's fingerprint, not the dirty one" "$(fp_now "$(mkdir -p "$W/x" && git -C "$M" archive "$TIP" supabase | tar -x -C "$W/x" && echo "$W/x")" fn-a)" "$(mf HEAD prod fn-a)"
check "the dirty edit is still in the working tree" "1" "$(grep -c 'v3 UNCOMMITTED' "$M/supabase/functions/fn-a/index.ts")"

# =================================================================================================
echo "2. Selection"
mk_world w-sel
run
check "in sync: exit 0" 0 "$RC"
has "in sync: says so" "$W/out" "prod functions: in sync at $(tip | cut -c1-9)"
check "in sync: nothing uploaded" "" "$(uploaded)"
check "in sync: no keychain prompt" "0" "$(wc -l < "$REC/keyring" | tr -d ' ')"
reset_rec
push_change supabase/functions/_shared/util.ts "// shared change"
run
check "_shared change selects exactly its importers" "fn-a fn-b" "$(uploaded)"
check "one keychain unlock for a non-empty batch" "1" "$(wc -l < "$REC/keyring" | tr -d ' ')"
reset_rec
push_set supabase/no-verify-jwt-functions.txt "$(printf '# list\nfn-c\nfn-a')"
run
check "JWT policy added (no code change): selects fn-a only" "fn-a" "$(uploaded)"
check "  uploaded with --no-verify-jwt" "--no-verify-jwt" "$(awk '$1=="fn-a"{print $3}' "$REC/uploads")"
reset_rec
push_set supabase/no-verify-jwt-functions.txt "$(printf '# list\nfn-c')"
run
check "JWT policy removed: selects fn-a again" "fn-a" "$(uploaded)"
check "  uploaded without the flag" "none" "$(awk '$1=="fn-a"{print $3}' "$REC/uploads")"
reset_rec
# healthy unpushed stamp: the stamp commits above are local only (not pushed)
check "the stamp commit is local only" "1" "$( [ "$(G -C "$M" rev-parse HEAD)" != "$(tip)" ] && echo 1 || echo 0)"
run
check "healthy unpushed stamp counts as deployed: nothing uploaded" "" "$(uploaded)"
has "  in sync" "$W/out" "in sync"
# orphan: prod record names a function with no source
python3 - "$M/supabase/deploy-manifest.json" <<'PY'
import json, sys
p = sys.argv[1]; m = json.load(open(p)); m['prod']['functions']['fn-gone'] = 'abc'; json.dump(m, open(p, 'w'), indent=2)
PY
G -C "$M" commit -qam "orphan record"; G -C "$M" push -q origin main >/dev/null 2>&1
reset_rec; run
has "orphan reported" "$W/out" "orphaned on prod, not deleted: fn-gone"
check "orphan never uploaded or deleted" "" "$(uploaded)$(cat "$REC/other-cli" 2>/dev/null)"

# =================================================================================================
echo "3. Supersession"
mk_world w-sup
push_change supabase/functions/fn-a/index.ts "// v2"
OTHER="$W/other"; G clone -q "$O" "$OTHER" >/dev/null 2>&1
cat > "$W/hook.sh" <<HOOK
cd "$OTHER" && git pull -q origin main && echo '// newer' >> supabase/functions/fn-b/index.ts && git -c user.email=t@t.t -c user.name=t commit -qam newer && git push -q origin main
HOOK
RC_SUP=$(cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_KEYRING_HOOK="$W/hook.sh" CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh > "$W/out" 2>&1; echo $?)
check "tip moved before upload: exit 3" 3 "$RC_SUP"
has "  reports superseded" "$W/out" "superseded by $(tip | cut -c1-9)"
check "  nothing uploaded" "" "$(uploaded)"
reset_rec; run
check "the newer run deploys the newer code" "fn-a fn-b" "$(uploaded)"
check "  local main is behind origin: the stamp is not committed onto it" "1" "$RC"
has "  and says why" "$W/out" "local main is behind origin/main"
check "  local main did not diverge" "0" "$(G -C "$M" rev-list --count origin/main..main 2>/dev/null)"
reset_rec; run
check "an older run starting after the newer one deployed changes nothing" "" "$(uploaded)"
G -C "$M" pull -q --ff-only origin main >/dev/null 2>&1
reset_rec; run
check "after a pull, the stamp is recorded without a second upload" "" "$(uploaded)"
has "  in sync" "$W/out" "in sync"
check "  the stamp commit is on local main" "1" "$(G -C "$M" rev-list --count origin/main..main)"

# =================================================================================================
echo "4. Concurrency (one lock across the /push step and a manual deploy-functions.sh --env prod)"
mk_world w-con
push_change supabase/functions/fn-a/index.ts "// v2"
push_change supabase/functions/fn-c/index.ts "// v2"
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_UPLOAD_SLEEP=1 CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh > "$W/out1" 2>&1; echo $? > "$W/rc1" ) &
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_UPLOAD_SLEEP=1 CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-functions.sh fn-c --env prod > "$W/out2" 2>&1; echo $? > "$W/rc2" ) &
wait
check "no two uploads overlapped" "" "$(cat "$REC/overlap" 2>/dev/null)"
check "the /push step exited 0" 0 "$(cat "$W/rc1")"
check "the manual deploy exited 0" 0 "$(cat "$W/rc2")"
check "manifest keeps fn-a's prod entry" "$(fp_now "$M" fn-a)" "$(mf WORK prod fn-a)"
check "manifest keeps fn-c's prod entry" "$(fp_now "$M" fn-c)" "$(mf WORK prod fn-c)"
reset_rec
# a held lock is waited for a bounded time, then unproven
sleep 30 & HOLDER=$!
printf 'PID=%s\nPID_START_TIME=%s\n' "$HOLDER" "$(ps -o lstart= -p $HOLDER | tr -s ' ' | sed 's/^ *//; s/ *$//')" > "$M/.git/cp-prod-functions.lock"
push_change supabase/functions/fn-b/index.ts "// v2"
LOCK_TIMEOUT=2 run
check "held lock: unproven exit 2" 2 "$RC"
has "  says unproven" "$W/out" "prod functions: unproven"
check "  nothing uploaded" "" "$(uploaded)"
kill $HOLDER 2>/dev/null; wait $HOLDER 2>/dev/null
reset_rec; run
check "a dead holder's lock is broken and the run proceeds" "fn-b" "$(uploaded)"

# =================================================================================================
echo "5. Partial failure"
mk_world w-part
push_change supabase/functions/_shared/util.ts "// shared"
push_change supabase/functions/fn-c/index.ts "// v2"
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_FAIL=fn-b CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh ) > "$W/out" 2>&1; RC=$?
check "exit non-zero" 1 "$RC"
check "the two that uploaded were smoked" "fn-a fn-c" "$(awk '{print $1}' "$REC/smokes" | tr '\n' ' ' | sed 's/ $//')"
check "fn-a stamped and committed" "$(fp_now "$M" fn-a)" "$(mf HEAD prod fn-a)"
check "fn-c stamped and committed" "$(fp_now "$M" fn-c)" "$(mf HEAD prod fn-c)"
check "fn-b keeps its old record" "$(mf origin/main prod fn-b)" "$(mf HEAD prod fn-b)"
has "fn-b is not deployed" "$W/out" "fn-b: not deployed (upload failed"
has "summary" "$W/out" "prod functions: 2 deployed, 1 not"

# =================================================================================================
echo "6. Smoke failure"
mk_world w-smk
push_change supabase/functions/fn-a/index.ts "// v2"
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_SMOKE_FAIL=fn-a CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh ) > "$W/out" 2>&1; RC=$?
check "exit non-zero" 1 "$RC"
has "fn-a: deployed, smoke failed" "$W/out" "fn-a: deployed, smoke failed"
check "not stamped" "$(mf origin/main prod fn-a)" "$(mf WORK prod fn-a)"
run --check; check "/day reports problem after a smoke failure" 1 "$RC"; has "  names it" "$W/out" "problem fn-a"
reset_rec; run
check "next run selects it again" "fn-a" "$(uploaded)"
check "  and exits 0 when the smoke passes" 0 "$RC"
run --check; check "/day ok after the passing smoke" 0 "$RC"
# the manual path: stamps before the smoke (P890), so only the record keeps it unsynced
reset_rec
push_change supabase/functions/fn-b/index.ts "// v2"
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_SMOKE_FAIL=fn-b CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-functions.sh fn-b --env prod ) > "$W/df-out" 2>&1
check "manual smoke failure: the manual stamp says deployed" "$(fp_now "$M" fn-b)" "$(mf WORK prod fn-b)"
reset_rec; run
check "  yet the next /push step reselects fn-b" "fn-b" "$(uploaded)"

# =================================================================================================
echo "7. Stamp failure (recovery: re-commit the stamp next run, no second upload)"
mk_world w-stf
push_change supabase/functions/fn-a/index.ts "// v2"
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_GITOPS_FAIL=1 CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh ) > "$W/out" 2>&1; RC=$?
check "exit non-zero" 1 "$RC"
has "deployed, stamp not recorded" "$W/out" "fn-a: deployed, stamp not recorded"
check "no stamp commit" "$(mf origin/main prod fn-a)" "$(mf HEAD prod fn-a)"
run --check; check "/day: healthy, only the stamp commit is missing, counts as deployed" 0 "$RC"
reset_rec; run
check "next run: no second upload" "" "$(uploaded)"
check "  exits 0" 0 "$RC"
has "  records the missing stamp" "$W/out" "recorded the missing stamp for fn-a"
check "  stamp now committed" "$(fp_now "$M" fn-a)" "$(mf HEAD prod fn-a)"

# =================================================================================================
echo "8. Manifest isolation"
mk_world w-iso
push_change supabase/functions/fn-a/index.ts "// v2"
python3 - "$M/supabase/deploy-manifest.json" <<'PY'
import json, sys
p = sys.argv[1]; m = json.load(open(p)); m['test']['functions']['fn-a'] = 'co-tenant-edit'; json.dump(m, open(p, 'w'), indent=2)
PY
BEFORE=$(G -C "$M" rev-parse HEAD)
run
check "exit 0" 0 "$RC"
check "stamp commit leaves the test section as committed" "t0" "$(mf HEAD test fn-a)"
check "stamp commit changes prod fn-a" "$(fp_now "$M" fn-a)" "$(mf HEAD prod fn-a)"
check "the commit touches only the manifest" "supabase/deploy-manifest.json" "$(G -C "$M" diff --name-only "$BEFORE" HEAD)"
check "the co-tenant's uncommitted test edit stays in the working file" "co-tenant-edit" "$(mf WORK test fn-a)"
check "the working file also carries the prod stamp" "$(fp_now "$M" fn-a)" "$(mf WORK prod fn-a)"
CHANGED=$(G -C "$M" show HEAD:supabase/deploy-manifest.json | python3 -c "
import json,sys,subprocess
new=json.load(sys.stdin); old=json.loads(subprocess.check_output(['git','-C','$M','show','$BEFORE:supabase/deploy-manifest.json']))
d=[s+'.'+k for s in set(new)|set(old) for k in set((new.get(s) or {}).get('functions',{}))|set((old.get(s) or {}).get('functions',{})) if (new.get(s) or {}).get('functions',{}).get(k)!=(old.get(s) or {}).get('functions',{}).get(k)]
print(' '.join(sorted(d)))")
check "the only function entry the commit changed is prod.fn-a" "prod.fn-a" "$CHANGED"

# =================================================================================================
echo "9. Preflight fails closed"
mk_world w-pre
push_change supabase/functions/_shared/util.ts "// shared"
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" SKIP_EDGE_SECRET_CHECK=1 CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh ) > "$W/out" 2>&1; RC=$?
check "inherited SKIP_EDGE_SECRET_CHECK=1: zero uploads" "" "$(uploaded)"; check "  exit 1" 1 "$RC"
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" SKIP_EDGE_SECRET_CHECK=1 CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-functions.sh fn-a --env prod ) > "$W/df-out" 2>&1; RC=$?
check "  manual deploy-functions.sh --env prod agrees: zero uploads" "" "$(uploaded)"; check "  exit 1" 1 "$RC"
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_SECRETS_FAIL=1 CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh ) > "$W/out" 2>&1; RC=$?
check "erroring secret API: zero uploads" "" "$(uploaded)"; has "  says why" "$W/out" "secret inventory could not be read"
check "  the secret check read the upload's project" "$REF" "$(sort -u "$REC/secrets-ref")"
reset_rec
EXPECT_REF=otherref run
check "target mismatch: zero uploads" "" "$(uploaded)"; has "  says why" "$W/out" "target mismatch"
check "  and no keychain prompt" "0" "$(wc -l < "$REC/keyring" | tr -d ' ')"
# An inherited override naming a real-shaped project ref (20 lowercase letters, e.g. TEST's) must
# not widen the target check: the lib falls back to the real prod ref.
check "real-shaped CP_PROD_PROJECT_REF_EXPECTED is refused" "besjtuodziykmjidubzw" \
  "$(CP_PROD_PROJECT_REF_EXPECTED="abcdefghijklmnopqrst" bash -c 'source "$1"; prodfn_expected_ref' _ "$SRC_ROOT/scripts/lib/prod-functions.sh" 2>/dev/null)"
check "  a fixture ref is still honoured" "stub" \
  "$(CP_PROD_PROJECT_REF_EXPECTED="stub" bash -c 'source "$1"; prodfn_expected_ref' _ "$SRC_ROOT/scripts/lib/prod-functions.sh" 2>/dev/null)"
chmod -x "$M/scripts/check-edge-function-secrets.sh"
run; check "missing secret-check helper: zero uploads" "" "$(uploaded)"; has "  says why" "$W/out" "secret-check helper is missing"
run_df fn-a --env prod; check "  manual deploy-functions.sh agrees: zero uploads" "" "$(uploaded)"
chmod +x "$M/scripts/check-edge-function-secrets.sh"
reset_rec
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_SECRETS=SECRET_A CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh ) > "$W/out" 2>&1; RC=$?
check "a function missing a secret is excluded, the other deploys" "fn-a" "$(uploaded)"
has "  fn-b: not deployed (missing secret SECRET_B)" "$W/out" "fn-b: not deployed (missing secret SECRET_B)"
check "  exit 1" 1 "$RC"
reset_rec
push_change supabase/functions/fn-c/index.ts "// v2"
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_SECRETS=SECRET_A CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-functions.sh fn-b fn-c --env prod ) > "$W/df-out" 2>&1; RC=$?
check "  manual path agrees: fn-c deploys, fn-b excluded" "fn-c" "$(uploaded)"; check "  exit 1" 1 "$RC"

# =================================================================================================
echo "10. Rollback mode"
mk_world w-rb
OLD=$(G -C "$M" rev-parse HEAD)
push_change supabase/functions/fn-a/index.ts "// v2"
push_change supabase/functions/fn-b/index.ts "// v2"
run; reset_rec
run --rollback "$OLD" fn-a
check "rollback exits 0" 0 "$RC"
check "deploys only the named function" "fn-a" "$(uploaded)"
check "  from the given SHA" "$(hash_at "$M" "$OLD" fn-a)" "$(awk '$1=="fn-a"{print $4}' "$REC/uploads")"
has "prints the overwrite warning" "$W/out" "the next /push redeploys fn-a from main unless main is reverted"
reset_rec; run
check "the next normal run redeploys fn-a from main" "fn-a" "$(uploaded)"

# =================================================================================================
echo "11. /day cp.prodfns"
mk_world w-day
run --check; check "matching: ok exit 0" 0 "$RC"; has "  prints ok" "$W/out" "cp.prodfns: ok at"
push_change supabase/functions/fn-b/index.ts "// v2"
run --check; check "stale: problem exit 1" 1 "$RC"; has "  names it" "$W/out" "cp.prodfns: problem fn-b"
check "  the check uploads nothing and prompts nothing" "0" "$(cat "$REC/uploads" "$REC/keyring" | wc -l | tr -d ' ')"
run; run --check; check "healthy unpushed stamp: ok" 0 "$RC"
printf 'fn-c\n' > "$M/.git/cp-prod-smoke-failed.txt"
run --check; check "smoke-failed record: problem" 1 "$RC"; has "  names it" "$W/out" "problem fn-c"
rm -f "$M/.git/cp-prod-smoke-failed.txt"
G -C "$M" remote set-url origin "$W/no-such-origin.git"
run --check; check "fetch fails: unproven exit 2" 2 "$RC"; has "  prints unproven" "$W/out" "cp.prodfns: unproven"
run; check "deploy with an unreadable tip: unproven exit 2" 2 "$RC"

# =================================================================================================
echo "12. /push gating (--after-push), bound to the SHA this /push confirmed"
mk_world w-gate
push_change supabase/functions/fn-b/index.ts "// v2"
T0="$(tip)"
run --after-push 4 --sha "$T0"; check "step 5 exit 4: unproven exit 2" 2 "$RC"; has "  says schema unconfirmed" "$W/out" "unproven: schema unconfirmed"
check "  nothing uploaded, no prompt" "0" "$(cat "$REC/uploads" "$REC/keyring" | wc -l | tr -d ' ')"
run --after-push 3 not-applied --sha "$T0"; check "step 6 not applied: exit 1" 1 "$RC"; has "  waiting on migrations" "$W/out" "waiting on migrations"
check "  nothing uploaded" "" "$(uploaded)"
run --after-push 1 --sha "$T0"; check "step 5 failed: not run, exit 1" 1 "$RC"; check "  nothing uploaded" "" "$(uploaded)"
run --after-push 0; check "no --sha: refused" 1 "$RC"; check "  nothing uploaded" "" "$(uploaded)"
run --after-push 0 --sha "$(printf 'a%.0s' $(seq 40))"; check "a SHA that is not the live tip: superseded exit 3" 3 "$RC"
check "  nothing uploaded" "" "$(uploaded)"
run --after-push 3 applied --sha "$T0"; check "step 6 applied: runs" 0 "$RC"; check "  deploys the stale function" "fn-b" "$(uploaded)"
push_change supabase/functions/fn-a/index.ts "// v3"; reset_rec
run --after-push none --sha "$(tip)"; check "nothing to push still retries a stale function" "fn-a" "$(uploaded)"
# The tip moves after step 1's fetch (a /ship-prod push, which deploys no functions).
T1="$(G -C "$M" rev-parse origin/main)"; push_change supabase/functions/fn-c/index.ts "// moved"; reset_rec
run --after-push 0 --sha "$T1"; check "a push run whose SHA is no longer the tip: superseded exit 3" 3 "$RC"
check "  nothing uploaded" "" "$(uploaded)"; has "  says who deploys it" "$W/out" "The next /push deploys"
reset_rec; run --after-push none --sha "$T1"; check "nothing to push, tip moved after step 1: deploys, exit 0" 0 "$RC"
check "  the newer tip's stale function" "fn-c" "$(uploaded)"; has "  says it followed the tip" "$W/out" "moved from ${T1:0:9}"
# An earlier push left its migration unapplied (step 6 not-applied); a later /push with nothing to
# push must not deploy the functions ahead of it.
( cd "$M" && mkdir -p supabase/migrations && echo 'select 1;' > supabase/migrations/20990101000000_pN_coupled.sql \
  && echo '// v4' >> supabase/functions/fn-b/index.ts && G add supabase && G commit -qm "migration + function" && G push -q origin main ) >/dev/null 2>&1
reset_rec; run --after-push none --sha "$(tip)"
check "a migration at the tip not applied on prod: exit 1" 1 "$RC"; has "  waiting on migrations" "$W/out" "waiting on migrations (1 at"
printf 'fn-z\n' >> "$M/.git/cp-prod-smoke-failed.txt"; reset_rec; run --after-push none --sha "$(tip)"
has "  a pending entry the tip lacks is still named while waiting" "$W/out" "resolve by hand: fn-z"
python3 - "$M/.git/cp-prod-smoke-failed.txt" <<'PYZ'
import sys; p = sys.argv[1]; keep = [l for l in open(p) if l.strip() != 'fn-z']; open(p, 'w').writelines(keep)
PYZ
check "  nothing uploaded, no prompt" "0" "$(cat "$REC/uploads" "$REC/keyring" | wc -l | tr -d ' ')"
run --check; has "  /day notes it" "$W/out" "function deploys wait for them"
python3 - "$M/supabase/deploy-manifest.json" <<'PYX'
import json, sys
d = json.load(open(sys.argv[1])); d['prod'].setdefault('migrations', []).append('20990101000000'); json.dump(d, open(sys.argv[1], 'w'), indent=2)
PYX
( cd "$M" && G commit -qam "step 6 applied it" && G push -q origin main ) >/dev/null 2>&1
reset_rec; run --after-push none --sha "$(tip)"; check "  once recorded as applied, the function deploys" "fn-b" "$(uploaded)"

# =================================================================================================
echo "13. Records: rollback after a pushed stamp, diverged, corrupt, proof-only recovery"
mk_world w-rec
OLD=$(G -C "$M" rev-parse HEAD)
push_change supabase/functions/fn-a/index.ts "// v2"
run; G -C "$M" push -q origin main >/dev/null 2>&1; reset_rec
run --rollback "$OLD" fn-a; check "rollback after the v2 stamp was pushed: exit 0" 0 "$RC"
run --check; check "  the check sees fn-a stale again (the local rollback stamp wins)" 1 "$RC"
has "  names it" "$W/out" "problem fn-a"
reset_rec; run; check "  the next run redeploys fn-a" "fn-a" "$(uploaded)"
mk_world w-div
OTHER="$W/other"; G clone -q "$O" "$OTHER" >/dev/null 2>&1
( cd "$OTHER" && echo x >> README && G add README && G commit -qm other && G push -q origin main ) >/dev/null 2>&1
( cd "$M" && echo y >> LOCAL && G add LOCAL && G commit -qm local ) >/dev/null 2>&1
run; check "diverged local main: unproven exit 2" 2 "$RC"; has "  says diverged" "$W/out" "diverged"
check "  nothing uploaded" "" "$(uploaded)"
reset_rec; run --rollback "$(G -C "$M" rev-parse HEAD~1)" fn-a
check "rollback on a diverged local main: refused exit 1" 1 "$RC"; check "  rollback on diverged main: nothing uploaded" "" "$(uploaded)"
has "  says it could not be recorded" "$W/out" "the rollback could not be recorded"
mk_world w-rbb
OLD=$(G -C "$M" rev-parse HEAD)
OTHER="$W/other"; G clone -q "$O" "$OTHER" >/dev/null 2>&1
( cd "$OTHER" && echo '// v2' >> supabase/functions/fn-a/index.ts && G commit -qam other && G push -q origin main ) >/dev/null 2>&1
reset_rec; run --rollback "$OLD" fn-a
check "rollback on a local main behind origin: refused exit 1" 1 "$RC"; check "  rollback behind origin: nothing uploaded" "" "$(uploaded)"
mk_world w-rbf
OLD=$(G -C "$M" rev-parse HEAD)
push_change supabase/functions/fn-a/index.ts "// v2"
run; G -C "$M" push -q origin main >/dev/null 2>&1; reset_rec
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_GITOPS_FAIL=1 CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh --rollback "$OLD" fn-a ) > "$W/out" 2>&1; RC=$?
check "rollback whose stamp fails: exit 1" 1 "$RC"; check "  it uploaded" "fn-a" "$(uploaded)"
run --check; check "  /day still sees fn-a differ from the tip" 1 "$RC"; has "  names it" "$W/out" "problem fn-a"
mk_world w-rvt
push_change supabase/functions/fn-a/index.ts "// v2"; reset_rec
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_GITOPS_FAIL=1 CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh ) > "$W/out" 2>&1
check "tip deployed, stamp failed: uploaded" "fn-a" "$(uploaded)"
( cd "$M" && G revert --no-edit HEAD && G push -q origin main ) >/dev/null 2>&1 || broken "revert of the deployed change"
[ "$(fp_now "$M" fn-a)" = "$(mf HEAD prod fn-a)" ] || broken "the revert did not bring fn-a back to the recorded code"
run --check; check "  then reverted to the recorded code: /day sees prod still runs the reverted code" 1 "$RC"
reset_rec; run; check "  and the next run redeploys it" "fn-a" "$(uploaded)"
mk_world w-mdirty
echo '// uncommitted' >> "$M/supabase/functions/fn-a/index.ts"; reset_rec; run_df fn-a --env prod
check "manual deploy of uncommitted code, smoke passes: uploaded" "fn-a" "$(uploaded)"
run --check; check "  /day sees prod differ from the tip" 1 "$RC"; has "  names it" "$W/out" "problem fn-a"
mk_world w-mclean
push_change supabase/functions/fn-a/index.ts "// v2"; reset_rec; run_df fn-a --env prod
check "manual deploy of the tip, smoke passes: uploaded" "fn-a" "$(uploaded)"
has "  says it stays pending until the next /push" "$W/df-out" "stay pending until the next /push"
run --check; check "  /day still reports it: a manual run commits no record" 1 "$RC"
reset_rec; run; check "  the next /push redeploys it from a clean checkout" "fn-a" "$(uploaded)"
check "  and commits the stamp" "$(fp_now "$M" fn-a)" "$(mf main prod fn-a)"
run --check; check "  then /day is ok" 0 "$RC"
mk_world w-intr
push_change supabase/functions/fn-a/index.ts "// v2"; reset_rec
( cd "$M" && exec env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_SMOKE_HANG=1 CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-functions.sh fn-a --env prod ) > "$W/df-out" 2>&1 &
DPID=$!
for _ in $(seq 1 100); do [ -s "$REC/smoke-hang.pid" ] && break; sleep 0.2; done
[ -s "$REC/smoke-hang.pid" ] || broken "the hanging smoke stub never started"
kill -9 "$DPID"; wait "$DPID" 2>/dev/null; kill "$(cat "$REC/smoke-hang.pid")" 2>/dev/null
check "manual deploy interrupted before its smoke: it uploaded" "fn-a" "$(uploaded)"
( cd "$M" && G commit -qam "manual stamp" ) >/dev/null 2>&1 || broken "the hand stamp commit"
check "  the hand stamp names the tip, so only the pending marker can flag it" "$(fp_now "$M" fn-a)" "$(mf HEAD prod fn-a)"
run --check; check "  stamp committed by hand: /day still sees it unsmoked" 1 "$RC"
mk_world w-stray
mkdir -p "$M/supabase/functions/fn-z"; printf 'export const z = 1;\n' > "$M/supabase/functions/fn-z/index.ts"; reset_rec; run_df fn-z --env prod
check "manual deploy of a function the tip does not have: uploaded" "fn-z" "$(uploaded)"
rm -rf "$M/supabase/functions/fn-z"
run --check; check "  /day reports the branch-only function" 1 "$RC"; has "  names it as pending but not at origin/main" "$W/out" "resolve by hand (merge it, or check prod, delete it there if it exists, and drop its line from cp-prod-smoke-failed.txt): fn-z"
hasnt "  and does not claim prod differs from the tip" "$W/out" "prod differs from origin/main"
reset_rec; run; check "  a /push run with only that entry does not say in sync" 1 "$RC"; has "  and names it" "$W/out" "fn-z: not deployed (pending from a deploy never verified clean"
mkdir -p "$M/supabase/functions/fn-z"; echo notes > "$M/supabase/functions/fn-z/README.md"; G -C "$M" add -- supabase/functions/fn-z/README.md; G -C "$M" commit -qm "fn-z notes only"; G -C "$M" push -q origin main >/dev/null 2>&1 || broken "push"
run --check; check "  a tip directory with no index.ts still counts as not a function" 1 "$RC"
mk_world w-clr
printf 'fn-a\nfn-b\n' > "$M/.git/cp-prod-smoke-failed.txt"; chmod 000 "$M/.git/cp-prod-smoke-failed.txt"
( source "$M/scripts/lib/prod-functions.sh"; prodfn_smoke_failed_clear "$M" fn-b ) >/dev/null 2>&1; RC=$?
chmod 600 "$M/.git/cp-prod-smoke-failed.txt"
check "pending record unreadable while clearing one entry: non-zero" 1 "$RC"
check "  and the other entries are kept" "$(printf 'fn-a\nfn-b')" "$(cat "$M/.git/cp-prod-smoke-failed.txt")"
( source "$M/scripts/lib/prod-functions.sh"; prodfn_smoke_failed_clear "$M" fn-b ) >/dev/null 2>&1
check "  a readable record drops only the named entry" "fn-a" "$(cat "$M/.git/cp-prod-smoke-failed.txt")"
mk_world w-bad
( cd "$M" && echo '{not json' > supabase/deploy-manifest.json && G commit -qam "corrupt manifest" ) >/dev/null 2>&1
run; check "corrupt committed manifest: unproven exit 2" 2 "$RC"; check "  nothing uploaded" "" "$(uploaded)"
mk_world w-proof
push_change supabase/functions/fn-a/index.ts "// v2"
# A stamp in the working file with no healthy upload behind it (a hand-run stamp, or a manual
# deploy interrupted before its smoke): it is not evidence of anything.
python3 - "$M" <<'PYX'
import json, subprocess, sys
m = sys.argv[1]
r = json.loads(subprocess.check_output([sys.executable, m + '/scripts/lib/function-input-hash.py', m + '/supabase/functions',
                                        '--jwt-policy', m + '/supabase/no-verify-jwt-functions.txt']))
d = json.load(open(m + '/supabase/deploy-manifest.json')); d['prod']['functions']['fn-a'] = r['hashes']['fn-a']
json.dump(d, open(m + '/supabase/deploy-manifest.json', 'w'), indent=2)
PYX
run --check; check "working-file stamp alone: the check says problem" 1 "$RC"
reset_rec; run; check "  and the deploy uploads it" "fn-a" "$(uploaded)"
mk_world w-int
push_change supabase/functions/fn-a/index.ts "// v2"
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" CP_PROD_PROJECT_REF_EXPECTED="$REF" EDGE_SMOKE=0 bash ./scripts/deploy-functions.sh fn-a --env prod ) > "$W/df-out" 2>&1
( cd "$M" && G commit -qam "manual stamp" ) >/dev/null 2>&1
run --check; check "manual deploy never smoked, stamp committed: still a problem" 1 "$RC"
reset_rec; run; check "  and the next run redeploys and smokes it" "fn-a" "$(uploaded)"
check "  smoked" "fn-a" "$(awk '{print $1}' "$REC/smokes" | tr '\n' ' ' | sed 's/ $//')"
mk_world w-unr
printf 'fn-b\n' > "$M/.git/cp-prod-smoke-failed.txt"; chmod 000 "$M/.git/cp-prod-smoke-failed.txt"
run --check; check "unreadable smoke record: unproven exit 2" 2 "$RC"
chmod 600 "$M/.git/cp-prod-smoke-failed.txt"

# =================================================================================================
echo "14. Inputs: env-free batch, empty inventory, JWT list whitespace, URL shape, workdir, legacy records"
mk_world w-in
push_change supabase/functions/fn-c/index.ts "// v2"
# Env-free alone: the scan proves no secret can be missing, so the inventory is never consulted,
# not even when it would read empty.
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_SECRETS="" CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh ) > "$W/out" 2>&1; RC=$?
check "a batch of only env-free functions deploys, the inventory unread" "fn-c" "$(uploaded)"; check "  exit 0" 0 "$RC"
push_change supabase/functions/fn-a/index.ts "// v3"; push_change supabase/functions/fn-c/index.ts "// v3"; reset_rec
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_SECRETS="SECRET_B" CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh ) > "$W/out" 2>&1
check "a missing secret excludes its function, the env-free one still deploys" "fn-c" "$(uploaded)"
has "  names the missing secret" "$W/out" "missing secret SECRET_A"
reset_rec
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" STUB_SECRETS="" CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh ) > "$W/out" 2>&1
check "an empty secret inventory: nothing uploads" "" "$(uploaded)"; has "  says the inventory is empty" "$W/out" "empty or could not be parsed"
reset_rec; run
printf '# list\nfn-c \r\nfn-a\r\n' > "$M/supabase/no-verify-jwt-functions.txt"; G -C "$M" commit -qam "list with CR and a trailing space"; G -C "$M" push -q origin main >/dev/null 2>&1
reset_rec; run
check "JWT list with a trailing space and CRLF: fn-a gets the flag" "--no-verify-jwt" "$(awk '$1=="fn-a"{print $3}' "$REC/uploads")"
reset_rec; run; check "  and is in sync afterwards (fingerprint and flag agree)" "" "$(uploaded)"
push_change supabase/functions/fn-b/index.ts "// v4"
printf 'VITE_SUPABASE_URL=https://%s.supabase.co.attacker.example\n' "$REF" > "$M/.env.prod"
reset_rec; run; check "URL whose host only begins with the ref: nothing uploads" "" "$(uploaded)"
has "  target mismatch" "$W/out" "target mismatch"
printf 'VITE_SUPABASE_URL=https://%s.supabase.co\n' "$REF" > "$M/.env.prod"
DIRTY="$W/dirty"; mkdir -p "$DIRTY/supabase/functions/fn-b"; echo 'dirty' > "$DIRTY/supabase/functions/fn-b/index.ts"
reset_rec
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" SUPABASE_WORKDIR="$DIRTY" CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh ) > "$W/out" 2>&1
check "an inherited SUPABASE_WORKDIR does not change what uploads" "$(hash_at "$M" "$(tip)" fn-b)" "$(awk '$1=="fn-b"{print $4}' "$REC/uploads")"
push_change supabase/functions/fn-b/index.ts "// manual"; reset_rec
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" SUPABASE_WORKDIR="$DIRTY" CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-functions.sh fn-b --env prod ) > "$W/df-out" 2>&1
check "  nor on the manual path" "$(hash_at "$M" HEAD fn-b)" "$(awk '$1=="fn-b"{print $4}' "$REC/uploads")"
OLD=$(G -C "$M" rev-parse "$(tip)~1")
( cd "$M" && G checkout -qb side && echo '// unpublished' >> supabase/functions/fn-b/index.ts && G commit -qam side && G checkout -q main ) >/dev/null 2>&1
reset_rec; run --rollback side fn-b; check "rollback to an unpublished branch: refused" 1 "$RC"; check "  nothing uploaded" "" "$(uploaded)"
reset_rec; run --rollback "$OLD" fn-b fn-b; check "rollback naming a function twice uploads it once" "fn-b" "$(uploaded)"
mk_world w-leg
python3 - "$M" <<'PYX'
import json, subprocess, sys
m = sys.argv[1]
r = json.loads(subprocess.check_output([sys.executable, m + '/scripts/lib/function-input-hash.py', m + '/supabase/functions']))
d = json.load(open(m + '/supabase/deploy-manifest.json')); d['prod']['functions'].update(r['hashes'])
json.dump(d, open(m + '/supabase/deploy-manifest.json', 'w'), indent=2)
PYX
( cd "$M" && G commit -qam "legacy plain-hash records" && G push -q origin main ) >/dev/null 2>&1
reset_rec; run
check "legacy plain-hash records: every function redeploys once, whatever its policy" "fn-a fn-b fn-c" "$(uploaded)"

# =================================================================================================
echo "15. The stamp commit through the REAL git-ops.sh commit-to-main --content-file"
REAL_GITOPS=1 mk_world w-real
push_change supabase/functions/fn-a/index.ts "// v2"
# A co-tenant's uncommitted test stamp sits in the working manifest for the whole run.
python3 - "$M/supabase/deploy-manifest.json" <<'PYX'
import json, sys
d = json.load(open(sys.argv[1])); d['test']['functions']['fn-a'] = 'cotenant'; json.dump(d, open(sys.argv[1], 'w'), indent=2)
PYX
# The hook stands in for the minutes-long pre-commit run and reads the working file while the stamp
# commit is being made: content mode never writes the stamp there.
cat > "$M/.git/hooks/pre-commit" <<'HOOK'
#!/bin/bash
echo "hook saw working test.fn-a=$(python3 -c 'import json;print(json.load(open("supabase/deploy-manifest.json"))["test"]["functions"]["fn-a"])')" >> "$STUB_REC/hook"
exit 0
HOOK
chmod +x "$M/.git/hooks/pre-commit"
reset_rec; run
check "real commit-to-main: the stamp commit lands (exit 0)" 0 "$RC"
check "  the commit records the prod stamp" "$(python3 "$M/scripts/lib/function-input-hash.py" "$M/supabase/functions" --jwt-policy "$M/supabase/no-verify-jwt-functions.txt" | python3 -c 'import json,sys;print(json.load(sys.stdin)["hashes"]["fn-a"])')" \
  "$(G -C "$M" show HEAD:supabase/deploy-manifest.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["prod"]["functions"]["fn-a"])')"
check "  and not the co-tenant's test edit" "t0" "$(G -C "$M" show HEAD:supabase/deploy-manifest.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["test"]["functions"]["fn-a"])')"
has "  the working file held the co-tenant's edit throughout the commit" "$REC/hook" "hook saw working test.fn-a=cotenant"
check "  and still holds it afterwards" "cotenant" "$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["test"]["functions"]["fn-a"])' "$M/supabase/deploy-manifest.json")"
# Compare-and-swap: a manifest commit lands between the stamp's read of HEAD and its commit.
push_change supabase/functions/fn-b/index.ts "// v2"
G -C "$M" checkout -q -- supabase/deploy-manifest.json 2>/dev/null
cat > "$W/racer.sh" <<RACER
#!/bin/bash
if [ ! -e "$W/raced" ]; then
  touch "$W/raced"
  python3 -c 'import json;p="supabase/deploy-manifest.json";d=json.load(open(p));d["test"]["migrations"]=["m-cotenant"];json.dump(d,open(p,"w"),indent=2)'
  git add supabase/deploy-manifest.json && git -c user.email=t@t.t -c user.name=t -c commit.gpgsign=false commit -qm "cotenant: test migration stamp" --no-verify
fi
exec bash "$M/scripts/git-ops.sh" "\$@"
RACER
chmod +x "$W/racer.sh"; rm -f "$M/.git/hooks/pre-commit"
reset_rec
( cd "$M" && env PATH="$BIN:$PATH" STUB_REC="$REC" CP_GIT_OPS="$W/racer.sh" CP_PROD_PROJECT_REF_EXPECTED="$REF" bash ./scripts/deploy-prod-functions.sh ) > "$W/out" 2>&1; RC=$?
check "a manifest commit racing the stamp: the stamp still lands (exit 0)" 0 "$RC"
check "  the co-tenant's commit is kept (rebuilt on the new HEAD, not reverted)" '["m-cotenant"]' \
  "$(G -C "$M" show HEAD:supabase/deploy-manifest.json | python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin)["test"].get("migrations")))')"
check "  and fn-b's stamp is in HEAD" "1" "$(G -C "$M" log --oneline -1 --format=%s | grep -c 'stamp prod functions')"
# A co-tenant edits and `git add`s the manifest inside the hook: the commit lands without the stamp.
push_change supabase/functions/fn-c/index.ts "// v2"
G -C "$M" checkout -q -- supabase/deploy-manifest.json 2>/dev/null
cat > "$M/.git/hooks/pre-commit" <<'HOOK'
#!/bin/bash
python3 -c 'import json;p="supabase/deploy-manifest.json";d=json.load(open(p));d["test"]["functions"]["fn-a"]="cotenant-hook";json.dump(d,open(p,"w"),indent=2)'
git add supabase/deploy-manifest.json
HOOK
chmod +x "$M/.git/hooks/pre-commit"
reset_rec; run
check "a co-tenant add inside the hook: exit 1" 1 "$RC"; has "  the stamp is reported not recorded" "$W/out" "stamp not recorded"
has "  the deploy proof keeps fn-c" "$M/.git/cp-prod-deployed.txt" "fn-c"
rm -f "$M/.git/hooks/pre-commit"; G -C "$M" checkout -q -- supabase/deploy-manifest.json 2>/dev/null
reset_rec; run; check "  the next run records it: exit 0" 0 "$RC"; check "  without uploading" "" "$(uploaded)"
# The hook fails: nothing is committed, and the shared index is left as it was found.
push_change supabase/functions/fn-a/index.ts "// v3"
G -C "$M" checkout -q -- supabase/deploy-manifest.json 2>/dev/null
printf '#!/bin/bash\nexit 1\n' > "$M/.git/hooks/pre-commit"; chmod +x "$M/.git/hooks/pre-commit"
reset_rec; run
check "a failing pre-commit hook: exit 1" 1 "$RC"
check "  the manifest is not left staged in the shared index" "" "$(G -C "$M" diff --cached --name-only)"
rm -f "$M/.git/hooks/pre-commit"
reset_rec; run; check "  the next run records it: exit 0" 0 "$RC"; check "  without uploading" "" "$(uploaded)"
# A co-tenant has another file staged: refused, and only their file stays staged.
push_change supabase/functions/fn-b/index.ts "// v3"
G -C "$M" checkout -q -- supabase/deploy-manifest.json 2>/dev/null
echo x > "$M/cotenant.txt"; G -C "$M" add cotenant.txt
reset_rec; run
check "a co-tenant's staged file: exit 1" 1 "$RC"
check "  only the co-tenant's file is staged afterwards" "cotenant.txt" "$(G -C "$M" diff --cached --name-only)"
G -C "$M" reset -q -- cotenant.txt; rm -f "$M/cotenant.txt"

echo ""
echo "P1732: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
