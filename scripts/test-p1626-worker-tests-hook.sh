#!/bin/bash
# P1626 canary: drives the REAL scripts/lib/transcribe-room-batch-tests.sh with real controls.
# Needs the real venv (./scripts/setup-transcribe-room-batch-venv.sh). Temp copies only; nothing
# is ever written into the repo's service dir. Prints every exit code. No redirect tokens in output.
set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
ROOT="$(git rev-parse --show-toplevel)"
HELPER="$ROOT/scripts/lib/transcribe-room-batch-tests.sh"
REALVENV="$HOME/.cache/cp-transcribe-room-batch-venv"
SVC_REAL="$ROOT/services/transcribe-room-batch"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
FAILS=0
ok()   { echo "PASS: $1"; }
bad()  { echo "FAIL: $1"; FAILS=$((FAILS+1)); }
# expect NAME WANT_RC cmd...   (runs cmd, captures output in $LAST)
expect() { local n="$1" want="$2"; shift 2; LAST=$("$@" 2>&1); local rc=$?; echo "  exit code for [$n] = $rc (want $want)"
  if [ "$rc" -eq "$want" ]; then ok "$n"; else bad "$n"; echo "$LAST" | tail -8; fi; }
has() { if printf '%s' "$LAST" | grep -qF "$1"; then ok "output names: $1"; else bad "output missing: $1"; fi; }  # grep on a variable, no producer pipe race

[ -x "$REALVENV/bin/python" ] || { echo "FATAL: real venv missing, run the setup script"; exit 1; }
mkdir -p "$TMP/svc"; cp -R "$SVC_REAL/." "$TMP/svc/"; rm -rf "$TMP/svc/__pycache__" "$TMP/svc/tests/__pycache__"
STAGED_SVC="services/transcribe-room-batch/main.py"
run() { env CP_TRB_STAGED="$1" CP_TRB_SERVICE_DIR="${2:-$TMP/svc}" CP_TRB_VENV="${3:-$REALVENV}" bash "$HELPER"; }

echo "== C1 legitimate workflow: service staged, suite passes"
expect "pass" 0 run "$STAGED_SVC"; has "worker tests passed"

echo "== C2 known-failing test blocks"
cat > "$TMP/svc/tests/test_zz_known_failing.py" <<'P'
def test_known_failing():
    assert 1 == 2
P
expect "failing test" 1 run "$STAGED_SVC"; has "tests failed (pytest exit 1)"
rm -f "$TMP/svc/tests/test_zz_known_failing.py"

echo "== C3 collection error blocks (pytest 2)"
printf 'import module_that_does_not_exist_p1626\ndef test_x():\n    pass\n' > "$TMP/svc/tests/test_zz_collect.py"
expect "collection error" 1 run "$STAGED_SVC"; has "pytest exit 2"
rm -f "$TMP/svc/tests/test_zz_collect.py"

echo "== C4 no tests collected blocks (pytest 5)"
mkdir -p "$TMP/empty/tests"; cp "$SVC_REAL/requirements.txt" "$TMP/empty/"
expect "no tests" 1 run "$STAGED_SVC" "$TMP/empty"; has "pytest exit 5"

echo "== C5 missing venv blocks, banner names setup command"
expect "missing venv" 1 run "$STAGED_SVC" "$TMP/svc" "$TMP/nonexistent-venv"; has "setup-transcribe-room-batch-venv.sh"; has "venv missing"

echo "== C6 stale stamp blocks"
mkdir -p "$TMP/fakevenv/bin"; ln -s "$REALVENV/bin/python" "$TMP/fakevenv/bin/python"; echo "deadbeef" > "$TMP/fakevenv/requirements.sha256"
expect "stale stamp" 1 run "$STAGED_SVC" "$TMP/svc" "$TMP/fakevenv"; has "stale"
rm -f "$TMP/fakevenv/requirements.sha256"
expect "no stamp" 1 run "$STAGED_SVC" "$TMP/svc" "$TMP/fakevenv"; has "no requirements stamp"

echo "== C7 no service staged: no Python runs (venv python is a tripwire that would fail loudly)"
mkdir -p "$TMP/trip/bin"; printf '#!/bin/sh\necho TRIPWIRE-PYTHON-RAN\nexit 99\n' > "$TMP/trip/bin/python"; chmod +x "$TMP/trip/bin/python"
expect "no service staged" 0 run $'src/app/foo.ts\ndocs/x.md' "$TMP/svc" "$TMP/trip"
if printf '%s' "$LAST" | grep -qF TRIPWIRE; then bad "python was invoked"; else ok "python not invoked"; fi
expect "tripwire proves itself when service staged" 1 run "$STAGED_SVC" "$TMP/svc" "$TMP/trip"
expect "empty staged list" 0 run "" "$TMP/svc" "$TMP/trip"
expect "deleted test file counts as staged" 0 run "services/transcribe-room-batch/tests/test_old.py"

echo "== C8 wiring: pre-commit step exists and calls the helper"
if grep -q 'scripts/lib/transcribe-room-batch-tests.sh' "$ROOT/scripts/pre-commit-checks.sh"; then ok "step wired"; else bad "step not wired"; fi

echo "== C9 end to end: real git commit in a throwaway repo blocked by a failing test"
R="$TMP/repo"; mkdir -p "$R" && cd "$R" && git init -q . && git config user.email t@t && git config user.name t
mkdir -p services/transcribe-room-batch; cp -R "$SVC_REAL/." services/transcribe-room-batch/
rm -rf services/transcribe-room-batch/__pycache__ services/transcribe-room-batch/tests/__pycache__
cat > .git/hooks/pre-commit <<H
#!/bin/bash
CP_TRB_STAGED="\$(git diff --cached --name-only --no-renames)" CP_TRB_VENV="$REALVENV" bash "$HELPER"
H
chmod +x .git/hooks/pre-commit
printf 'def test_known_failing():\n    assert False\n' > services/transcribe-room-batch/tests/test_zz_e2e.py
git add services && LAST=$(git commit -q -m "should be blocked" 2>&1); rc=$?
echo "  exit code for [git commit with failing test] = $rc (want nonzero)"
if [ $rc -ne 0 ] && [ -z "$(git log --oneline 2>/dev/null)" ]; then ok "commit blocked, no commit exists"; else bad "commit not blocked"; fi
rm services/transcribe-room-batch/tests/test_zz_e2e.py; git add -A services
LAST=$(git commit -q -m "service, passing" 2>&1); rc=$?; echo "  exit code for [git commit passing] = $rc (want 0)"
if [ $rc -eq 0 ]; then ok "passing commit lands"; else bad "passing commit failed"; echo "$LAST" | tail; fi
echo x > other.txt; git add other.txt
LAST=$(git commit -q -m "unrelated" 2>&1); rc=$?; echo "  exit code for [unrelated commit] = $rc (want 0)"
if [ $rc -eq 0 ]; then ok "unrelated commit lands, helper skipped"; else bad "unrelated commit failed"; fi
cd "$ROOT"
echo
if [ "$FAILS" -eq 0 ]; then echo "ALL PASS"; exit 0; else echo "$FAILS FAILED"; exit 1; fi
