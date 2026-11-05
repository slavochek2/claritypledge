#!/bin/bash
# P1626 canary: drives the REAL scripts/lib/transcribe-room-batch-tests.sh and the REAL setup script
# against throwaway git repos (the helper reads the INDEX, so each control builds an index). Needs the
# real venv (./scripts/setup-transcribe-room-batch-venv.sh). Nothing is written into the repo's service
# dir. Every exit code is printed. No redirect tokens in output (shell-safety).
set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
ROOT="$(git rev-parse --show-toplevel)"
HELPER="$ROOT/scripts/lib/transcribe-room-batch-tests.sh"
SETUP="$ROOT/scripts/setup-transcribe-room-batch-venv.sh"
SVC_REAL="$ROOT/services/transcribe-room-batch"
REALROOT="$HOME/.cache/cp-transcribe-room-batch-venv"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/tmpd"   # the helper's TMPDIR: must be empty after every run
FAILS=0
ok()  { echo "PASS: $1"; }
bad() { echo "FAIL: $1"; FAILS=$((FAILS+1)); }
expect() { local n="$1" want="$2"; shift 2; LAST=$("$@" 2>&1); local rc=$?; echo "  exit code for [$n] = $rc (want $want)"
  if [ "$rc" -eq "$want" ]; then ok "$n"; else bad "$n"; printf '%s\n' "$LAST" | tail -8; fi; }
has()  { if printf '%s' "$LAST" | grep -qF -- "$1"; then ok "output names: $1"; else bad "output missing: $1"; fi; }
hasnt(){ if printf '%s' "$LAST" | grep -qF -- "$1"; then bad "output unexpectedly has: $1"; else ok "output lacks: $1"; fi; }

HASH=$(shasum -a 256 "$SVC_REAL/requirements.txt" | awk '{print $1}')
[ -x "$REALROOT/$HASH/bin/python" ] || { echo "FATAL: real venv missing, run the setup script"; exit 1; }

mkrepo() {  # prints a new throwaway repo path with the service in the INDEX (and working tree)
  local r; r=$(mktemp -d "$TMP/repo.XXXXXX"); mkdir -p "$r/services/transcribe-room-batch"   # a subshell: no counters
  cp -R "$SVC_REAL/." "$r/services/transcribe-room-batch/"
  rm -rf "$r/services/transcribe-room-batch/__pycache__" "$r/services/transcribe-room-batch/tests/__pycache__"
  (cd "$r" && git init -q . && git add services) >/dev/null 2>&1; echo "$r"
}
SVC=services/transcribe-room-batch
# run REPO STAGED [VENVROOT] [HELPERFILE]
run() { local r="$1" st="$2" vr="${3:-$REALROOT}" h="${4:-$HELPER}"; (cd "$r" && env TMPDIR="$TMP/tmpd" CP_TRB_STAGED="$st" CP_TRB_VENV_ROOT="$vr" bash "$h"); }
tmp_clean() { if [ -z "$(ls -A "$TMP/tmpd")" ]; then ok "helper temp dir cleaned up"; else bad "helper left temp files: $(ls "$TMP/tmpd")"; fi; }
ST="$SVC/main.py"

echo "== C1 legitimate workflow: service staged, indexed suite passes"
R=$(mkrepo); expect "pass" 0 run "$R" "$ST"; has "on a snapshot of the index"; tmp_clean

echo "== C2 known-failing test staged blocks"
R=$(mkrepo); printf 'def test_known_failing():\n    assert 1 == 2\n' > "$R/$SVC/tests/test_zz_fail.py"; (cd "$R" && git add "$SVC/tests/test_zz_fail.py")
expect "failing test" 1 run "$R" "$ST"; has "tests failed (pytest exit 1)"; tmp_clean

echo "== C3 collection error blocks (pytest 2)"
R=$(mkrepo); printf 'import module_that_does_not_exist_p1626\ndef test_x():\n    pass\n' > "$R/$SVC/tests/test_zz_c.py"; (cd "$R" && git add "$SVC/tests/test_zz_c.py")
expect "collection error" 1 run "$R" "$ST"; has "pytest exit 2"

echo "== C4 no tests collected blocks (pytest 5)"
R=$(mkrepo); (cd "$R" && git rm -q --cached -r "$SVC/tests" && git add -f "$SVC/tests/conftest.py")
expect "no tests" 1 run "$R" "$ST"; has "pytest exit 5"

echo "== C5 missing venv blocks, banner names the setup command"
R=$(mkrepo); expect "missing venv" 1 run "$R" "$ST" "$TMP/no-such-root"; has "setup-transcribe-room-batch-venv.sh"; has "no venv for the indexed requirements.txt"

echo "== C6 stale lockfile: a venv exists only for ANOTHER hash, or has no stamp; both block"
mkdir -p "$TMP/vr6/otherhash/bin"; ln -s "$REALROOT/$HASH/bin/python" "$TMP/vr6/otherhash/bin/python"; echo otherhash > "$TMP/vr6/otherhash/requirements.sha256"
R=$(mkrepo); expect "other-hash venv only" 1 run "$R" "$ST" "$TMP/vr6"; has "sha256 $HASH"
mkdir -p "$TMP/vr6b/$HASH/bin"; ln -s "$REALROOT/$HASH/bin/python" "$TMP/vr6b/$HASH/bin/python"
expect "venv dir without stamp" 1 run "$R" "$ST" "$TMP/vr6b"
echo "  an indexed lockfile edit makes the real venv stale (hash comes from the INDEX):"
echo "# edited" >> "$R/$SVC/requirements.txt"; (cd "$R" && git add "$SVC/requirements.txt")
expect "indexed lockfile edited" 1 run "$R" "$ST"; hasnt "worker tests passed"
echo "  a working-tree-only lockfile edit does not matter (the index decides):"
R=$(mkrepo); echo "# wt only" >> "$R/$SVC/requirements.txt"; expect "wt-only lockfile edit" 0 run "$R" "$ST"

echo "== C7 no service staged: no Python runs (tripwire python in the keyed venv dir)"
mkdir -p "$TMP/trip/$HASH/bin"; printf '#!/bin/sh\necho TRIPWIRE-PYTHON-RAN\nexit 99\n' > "$TMP/trip/$HASH/bin/python"; chmod +x "$TMP/trip/$HASH/bin/python"; echo "$HASH" > "$TMP/trip/$HASH/requirements.sha256"
R=$(mkrepo); expect "no service staged" 0 run "$R" $'src/app/foo.ts\ndocs/x.md' "$TMP/trip"; hasnt TRIPWIRE
expect "empty staged list" 0 run "$R" "" "$TMP/trip"; hasnt TRIPWIRE
expect "tripwire fires when service staged" 1 run "$R" "$ST" "$TMP/trip"; has TRIPWIRE

echo "== C8 inherited pytest options cannot fake a pass"
R=$(mkrepo); printf 'def test_good():\n    assert True\ndef test_bad():\n    assert False\n' > "$R/$SVC/tests/test_zz_mix.py"; (cd "$R" && git add "$SVC/tests/test_zz_mix.py")
PYV="$REALROOT/$HASH/bin/python"
echo "  poison proof (the OLD invocation, option set and not cleared):"
for opt in "-k test_good" "--collect-only"; do
  (cd "$R/$SVC" && PYTEST_ADDOPTS="$opt" PYTHONDONTWRITEBYTECODE=1 "$PYV" -m pytest -p no:cacheprovider -q tests/test_zz_mix.py >/dev/null 2>&1); prc=$?
  echo "  exit code for [OLD style, PYTEST_ADDOPTS=$opt] = $prc (want 0: the false pass)"
  if [ $prc -eq 0 ]; then ok "poison works on old style: $opt"; else bad "poison did not reproduce: $opt"; fi
done
for opt in "-k test_good" "--collect-only"; do
  LAST=$(cd "$R" && PYTEST_ADDOPTS="$opt" env TMPDIR="$TMP/tmpd" CP_TRB_STAGED="$ST" CP_TRB_VENV_ROOT="$REALROOT" bash "$HELPER" 2>&1); rc=$?
  echo "  exit code for [helper, PYTEST_ADDOPTS=$opt] = $rc (want 1)"; if [ $rc -eq 1 ]; then ok "blocked: $opt"; else bad "false pass: $opt"; fi
done
LAST=$(cd "$R" && PYTEST_PLUGINS=nonexistent_plugin_p1626 env TMPDIR="$TMP/tmpd" CP_TRB_STAGED="$ST" CP_TRB_VENV_ROOT="$REALROOT" bash "$HELPER" 2>&1); rc=$?
echo "  exit code for [helper, PYTEST_PLUGINS junk, failing fixture] = $rc (want 1)"; if [ $rc -eq 1 ]; then ok "blocked with PYTEST_PLUGINS set"; else bad "PYTEST_PLUGINS case"; fi
echo "  a stray ini cannot deselect: pytest.ini with addopts -k test_good in the index"
printf '[pytest]\naddopts = -k test_good\n' > "$R/$SVC/pytest.ini"; (cd "$R" && git add "$SVC/pytest.ini")
expect "stray pytest.ini" 1 run "$R" "$ST"

echo "== C9 the INDEX is tested, not the working tree"
R=$(mkrepo); printf 'def test_x():\n    assert False\n' > "$R/$SVC/tests/test_zz_ix.py"; (cd "$R" && git add "$SVC/tests/test_zz_ix.py")
printf 'def test_x():\n    assert True\n' > "$R/$SVC/tests/test_zz_ix.py"
expect "staged-broken, working-tree-fixed" 1 run "$R" "$ST"
R=$(mkrepo); printf 'def test_x():\n    assert True\n' > "$R/$SVC/tests/test_zz_ix.py"; (cd "$R" && git add "$SVC/tests/test_zz_ix.py")
printf 'def test_x():\n    assert False\n' > "$R/$SVC/tests/test_zz_ix.py"
expect "staged-fixed, working-tree-broken" 0 run "$R" "$ST"
echo "  temporary index (what git commit -a and pathspec commits export): GIT_INDEX_FILE honoured"
R=$(mkrepo); cp "$R/.git/index" "$TMP/alt-index"; printf 'def test_x():\n    assert False\n' > "$R/$SVC/tests/test_zz_alt.py"
(cd "$R" && GIT_INDEX_FILE="$TMP/alt-index" git add "$SVC/tests/test_zz_alt.py")
LAST=$(cd "$R" && GIT_INDEX_FILE="$TMP/alt-index" env TMPDIR="$TMP/tmpd" CP_TRB_STAGED="$ST" CP_TRB_VENV_ROOT="$REALROOT" bash "$HELPER" 2>&1); rc=$?
echo "  exit code for [GIT_INDEX_FILE temp index with failing test] = $rc (want 1)"; if [ $rc -eq 1 ]; then ok "temp index respected"; else bad "temp index ignored"; fi

echo "== C10 helper file lives elsewhere (a worktree running main's hook); the repo is the cwd's"
mkdir -p "$TMP/elsewhere/lib"; cp "$HELPER" "$TMP/elsewhere/lib/h.sh"
R=$(mkrepo); expect "helper elsewhere" 0 run "$R" "$ST" "$REALROOT" "$TMP/elsewhere/lib/h.sh"
printf 'def test_x():\n    assert False\n' > "$R/$SVC/tests/test_zz_e.py"; (cd "$R" && git add "$SVC/tests/test_zz_e.py")
expect "helper elsewhere sees THIS repo's broken index" 1 run "$R" "$ST" "$REALROOT" "$TMP/elsewhere/lib/h.sh"
LAST=$(cd "$R/services" && env TMPDIR="$TMP/tmpd" CP_TRB_STAGED="$ST" CP_TRB_VENV_ROOT="$REALROOT" bash "$TMP/elsewhere/lib/h.sh" 2>&1); rc=$?
echo "  exit code for [run from a subdirectory of the repo] = $rc (want 1)"; if [ $rc -eq 1 ]; then ok "subdir cwd resolves toplevel"; else bad "subdir cwd"; fi
if grep -q '_pcc_self")" && pwd -P)/lib/transcribe-room-batch-tests.sh' "$ROOT/scripts/pre-commit-checks.sh"; then ok "pre-commit resolves helper beside the hook (like run-quiet.sh)"; else bad "pre-commit helper path not resolved beside the hook"; fi
if grep -q 'bash "\$TRB_LIB"' "$ROOT/scripts/pre-commit-checks.sh"; then ok "step wired"; else bad "step not wired"; fi

echo "== C11 deletions"
R=$(mkrepo); (cd "$R" && git rm -r -q --cached "$SVC")
expect "whole service removed from index" 0 run "$R" "$SVC/main.py" "$TMP/trip"; has "service removed from index"; hasnt TRIPWIRE
R=$(mkrepo); (cd "$R" && git rm -q --cached "$SVC/tests/test_swap.py")
expect "partial deletion, suite still green" 0 run "$R" "$SVC/tests/test_swap.py"; has "worker tests passed"
R=$(mkrepo); (cd "$R" && git rm -q --cached "$SVC/merge.py")
expect "partial deletion breaks the suite" 1 run "$R" "$SVC/merge.py"; has "pytest exit"

echo "== C12 signal cleanup: SIGTERM mid-run leaves no temp dir"
R=$(mkrepo); printf 'import time\ndef test_slow():\n    time.sleep(4)\n' > "$R/$SVC/tests/test_zz_slow.py"; (cd "$R" && git add "$SVC/tests/test_zz_slow.py")
(cd "$R" && env TMPDIR="$TMP/tmpd" CP_TRB_STAGED="$ST" CP_TRB_VENV_ROOT="$REALROOT" bash "$HELPER" >/dev/null 2>&1) &
BG=$!
sleep 1.5; kill -TERM "$BG" 2>/dev/null; wait "$BG" 2>/dev/null; echo "  exit code after SIGTERM = $? (want 143 or 130)"
sleep 0.5; tmp_clean

echo "== C13 venv setup: lockfile-keyed venvs coexist, atomic publish, migration is exact"
VR="$TMP/vr13"; R=$(mkrepo)
mkdir -p "$VR/old"; echo "keep me" > "$VR/old/f"   # unrelated content with no venv markers
H1=$(shasum -a 256 "$R/$SVC/requirements.txt" | awk '{print $1}')
LAST=$(cd "$R" && CP_TRB_VENV_ROOT="$VR" bash "$SETUP" 2>&1); rc=$?; echo "  exit code for [setup lockfile 1] = $rc (want 0)"; if [ $rc -eq 0 ]; then ok "setup 1"; else bad "setup 1"; printf '%s\n' "$LAST" | tail -5; fi
echo "# second lockfile" >> "$R/$SVC/requirements.txt"; H2=$(shasum -a 256 "$R/$SVC/requirements.txt" | awk '{print $1}')
LAST=$(cd "$R" && CP_TRB_VENV_ROOT="$VR" bash "$SETUP" 2>&1); rc=$?; echo "  exit code for [setup lockfile 2] = $rc (want 0)"; if [ $rc -eq 0 ]; then ok "setup 2"; else bad "setup 2"; printf '%s\n' "$LAST" | tail -5; fi
if [ -x "$VR/$H1/bin/python" ] && [ -x "$VR/$H2/bin/python" ] && [ "$H1" != "$H2" ]; then ok "two lockfile hashes coexist"; else bad "venvs do not coexist"; fi
if "$VR/$H1/bin/python" -c 'import numpy, pytest'; then ok "first venv still usable after second build"; else bad "first venv broken"; fi
if [ -z "$(ls -A "$VR" | grep '^\.building' || true)" ]; then ok "no temp build dirs left"; else bad "temp build dir left"; fi
if [ -f "$VR/old/f" ]; then ok "unrelated dir under the root untouched"; else bad "setup deleted unrelated content"; fi
LAST=$(cd "$R" && CP_TRB_VENV_ROOT="$VR" bash "$SETUP" 2>&1); rc=$?; echo "  exit code for [setup again, same lockfile] = $rc (want 0)"; has "already exists"
echo "  migration: an old unkeyed venv at the root is removed, and only that shape"
mkdir -p "$TMP/vr13b"; echo "home = x" > "$TMP/vr13b/pyvenv.cfg"; echo abc > "$TMP/vr13b/requirements.sha256"
(cd "$R" && CP_TRB_VENV_ROOT="$TMP/vr13b" bash "$SETUP" >/dev/null 2>&1)
if [ ! -f "$TMP/vr13b/pyvenv.cfg" ] && [ -x "$TMP/vr13b/$H2/bin/python" ]; then ok "old unkeyed venv migrated"; else bad "migration"; fi
echo
if [ "$FAILS" -eq 0 ]; then echo "ALL PASS"; exit 0; else echo "$FAILS FAILED"; exit 1; fi
