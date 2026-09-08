#!/usr/bin/env bash
# P1155 — process-level exit-code proof for scripts/alert-escalator.mjs.
#
# The unit suite (test-alert-escalator.mjs) imports the evaluators and asserts on
# their return values. It never runs the script as a PROCESS, so it cannot see the
# thing CI actually dispatches on: the exit code. That gap is not cosmetic — the
# script deliberately overrides Node's default uncaught-exception exit of 1,
# because 1 already means "email sent" (A7). If that override regressed, every
# crash would be read by the workflow as a successful escalation and the run would
# go green. No assertion inside the module can catch that.
#
# So this runs the real file, offline, with `gh` and `git` stubbed onto PATH, and
# asserts all three codes: 0 clean, 1 due, 2 broken.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/alert-escalator.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then printf 'PASS  %s (exit %s)\n' "$1" "$3"
  else printf 'FAIL  %s — expected exit %s, got %s\n' "$1" "$2" "$3"; fail=1; fi
}

mkdir -p "$TMP/bin"

# --- stub gh -------------------------------------------------------------
# Emits whatever fixture file the current case wrote. A stub that answered from
# hardcoded strings would test the stub; this way each case owns its data.
cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
case "$1 $2" in
  "issue list")  cat "$GH_ISSUES_FIXTURE" ;;
  "run list")    cat "$GH_RUNS_FIXTURE" ;;
  "label create"|"issue edit") exit 0 ;;
  *) echo "unexpected gh invocation: $*" >&2; exit 1 ;;
esac
STUB
# The reader shells out to git to learn when each workflow file first appeared, so a
# workflow added minutes ago is not reported as a stalled producer. Echoing
# $GIT_ADDED_AT lets a case choose between "added long ago" (the grace window has
# expired, a stall is real) and "added just now" (inside the window, silence is
# correct). An empty value is the third case the reader handles: no answer at all,
# treated as old, because failing loud beats failing quiet.
cat > "$TMP/bin/git" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "${GIT_ADDED_AT:-}"
STUB
chmod +x "$TMP/bin/gh" "$TMP/bin/git"
export PATH="$TMP/bin:$PATH"

NOW_MINUS_10D="$(node -e 'console.log(new Date(Date.now()-10*864e5).toISOString())')"
NOW="$(node -e 'console.log(new Date().toISOString())')"

echo '[]' > "$TMP/runs.json"
export GH_RUNS_FIXTURE="$TMP/runs.json"

# Registry with a single issue-age check and no workflow checks, so the case under
# test is the issue path alone.
cat > "$TMP/registry.json" <<'REG'
{ "checks": [ { "id": "t", "kind": "github-issue-age",
  "match_title": "Prod drift detected", "escalate_at_days": [2, 7, 30] } ] }
REG

# --- case 1: nothing open -> EXIT_CLEAN (0) ------------------------------
echo '[]' > "$TMP/issues.json"
export GH_ISSUES_FIXTURE="$TMP/issues.json"
node "$SCRIPT" --dry-run --registry "$TMP/registry.json" >/dev/null 2>&1
check "nothing due exits CLEAN" 0 $?

# --- case 2: an aged bot issue -> EXIT_DUE (1), and the mail is composed ---
cat > "$TMP/issues.json" <<JSON
[{ "number": 11, "title": "Prod drift detected", "createdAt": "$NOW_MINUS_10D",
   "labels": [], "url": "https://example.invalid/11",
   "author": { "login": "app/github-actions", "is_bot": true } }]
JSON
out="$(node "$SCRIPT" --dry-run --registry "$TMP/registry.json" 2>&1)"
check "an aged bot issue exits DUE" 1 $?
if grep -q "Subject:" <<<"$out"; then echo "PASS  the DUE run actually composed a message"
else echo "FAIL  DUE exit with no composed message"; fail=1; fi

# --- case 3: a fresh issue -> back to CLEAN (the no-false-alarm case) -----
cat > "$TMP/issues.json" <<JSON
[{ "number": 12, "title": "Prod drift detected", "createdAt": "$NOW",
   "labels": [], "url": "https://example.invalid/12",
   "author": { "login": "app/github-actions", "is_bot": true } }]
JSON
node "$SCRIPT" --dry-run --registry "$TMP/registry.json" >/dev/null 2>&1
check "a fresh issue exits CLEAN" 0 $?

# --- case 4: a broken registry -> EXIT_BROKEN (2), NOT 1 -----------------
# This is the assertion the unit suite structurally cannot make. A crash must not
# be spelled the same way as a successful send.
echo '{ "checks": [ { "id": "t", "kind": "no-such-kind" } ] }' > "$TMP/bad.json"
node "$SCRIPT" --dry-run --registry "$TMP/bad.json" >/dev/null 2>&1
check "an unknown kind exits BROKEN, not DUE" 2 $?

# --- case 5: gh itself failing -> EXIT_BROKEN (2) ------------------------
cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
echo "gh: auth token expired" >&2; exit 1
STUB
chmod +x "$TMP/bin/gh"
node "$SCRIPT" --dry-run --registry "$TMP/registry.json" >/dev/null 2>&1
check "a failed gh call exits BROKEN, never CLEAN" 2 $?

# --- workflow-last-run: the second kind, and the only one that uses git --------
# Without these the git stub above is decoration: main() only calls
# fetchWorkflowAddedAt for checks of this kind, so a registry holding only
# github-issue-age never reaches it. The grace window matters because it already
# produced a real false alarm — stranded-signups.yml tripped it on the first live
# dry run, 33 minutes before that workflow's first scheduled cron.

cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
case "$1 $2" in
  "issue list")  cat "$GH_ISSUES_FIXTURE" ;;
  "run list")    cat "$GH_RUNS_FIXTURE" ;;
  "label create"|"issue edit") echo "$*" >> "$GH_SIDE_EFFECT_LOG" ;;
  *) echo "unexpected gh invocation: $*" >&2; exit 1 ;;
esac
STUB
chmod +x "$TMP/bin/gh"

echo '[]' > "$TMP/issues.json"
cat > "$TMP/registry-run.json" <<'REG'
{ "checks": [ { "id": "r", "kind": "workflow-last-run",
  "workflows": [ { "file": "csp-smoke.yml", "max_age_hours": 25 } ] } ] }
REG

LONG_AGO="$(node -e 'console.log(new Date(Date.now()-90*864e5).toISOString())')"
STALE_RUN="$(node -e 'console.log(new Date(Date.now()-72*36e5).toISOString())')"
FRESH_RUN="$(node -e 'console.log(new Date(Date.now()-2*36e5).toISOString())')"

# A producer whose cron stopped, on a workflow added long ago -> DUE.
export GIT_ADDED_AT="$LONG_AGO"
cat > "$TMP/runs.json" <<JSON
[{ "createdAt": "$STALE_RUN", "conclusion": "success", "status": "completed", "event": "schedule" }]
JSON
node "$SCRIPT" --dry-run --registry "$TMP/registry-run.json" >/dev/null 2>&1
check "a stalled producer exits DUE" 1 $?

# Same workflow, still running on schedule -> CLEAN.
cat > "$TMP/runs.json" <<JSON
[{ "createdAt": "$FRESH_RUN", "conclusion": "success", "status": "completed", "event": "schedule" }]
JSON
node "$SCRIPT" --dry-run --registry "$TMP/registry-run.json" >/dev/null 2>&1
check "a fresh producer exits CLEAN" 0 $?

# Never run at all, but added minutes ago: inside its grace window -> CLEAN.
# This is the false alarm that actually happened; it must stay silent.
export GIT_ADDED_AT="$NOW"
echo '[]' > "$TMP/runs.json"
node "$SCRIPT" --dry-run --registry "$TMP/registry-run.json" >/dev/null 2>&1
check "a brand-new workflow inside its grace window exits CLEAN" 0 $?

# Never run, added long ago -> DUE. The cron was never wired.
export GIT_ADDED_AT="$LONG_AGO"
node "$SCRIPT" --dry-run --registry "$TMP/registry-run.json" >/dev/null 2>&1
check "a never-run workflow past its window exits DUE" 1 $?

# git answering nothing (shallow clone, no history) must read as OLD, not as clean.
export GIT_ADDED_AT=""
node "$SCRIPT" --dry-run --registry "$TMP/registry-run.json" >/dev/null 2>&1
check "an unknown add-date fails loud, not quiet" 1 $?
unset GIT_ADDED_AT

# --- the non-dry-run path: send and label actually happen --------------------
# Every case above passes --dry-run, so none of them reaches sendOpsEmail or the
# labelling loop. That leaves the composition of the whole chain unproven at the
# process level. Point the send layer at a local fake Mailgun and run it for real.
export GH_SIDE_EFFECT_LOG="$TMP/side-effects.log"
: > "$GH_SIDE_EFFECT_LOG"
PORT_FILE="$TMP/port" SEND_LOG="$TMP/send.log" \
  node -e '
    const http = require("http");
    const fs = require("fs");
    const s = http.createServer((req, res) => {
      let b = ""; req.on("data", (c) => (b += c));
      req.on("end", () => {
        fs.appendFileSync(process.env.SEND_LOG, b + "\n");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "<fake@test>", message: "Queued" }));
      });
    });
    s.listen(0, "127.0.0.1", () => fs.writeFileSync(process.env.PORT_FILE, String(s.address().port)));
  ' &
FAKE_PID=$!
disown "$FAKE_PID" 2>/dev/null || true
for _ in $(seq 1 50); do [ -s "$TMP/port" ] && break; sleep 0.1; done
PORT="$(cat "$TMP/port" 2>/dev/null || true)"

if [ -z "$PORT" ]; then
  echo "FAIL  could not start the fake Mailgun endpoint"; fail=1
else
  export GH_ISSUES_FIXTURE="$TMP/issues.json"
  cat > "$TMP/issues.json" <<JSON
[{ "number": 11, "title": "Prod drift detected", "createdAt": "$NOW_MINUS_10D",
   "labels": [], "url": "https://example.invalid/11",
   "author": { "login": "app/github-actions", "is_bot": true } }]
JSON
  MAILGUN_BASE="http://127.0.0.1:$PORT/v3" \
  MAILGUN_DOMAIN="example.invalid" \
  MAILGUN_SENDING_KEY="fake-key-not-a-real-credential" \
  OPS_EMAIL="ops@example.invalid" \
  node "$SCRIPT" --registry "$TMP/registry.json" >/dev/null 2>&1
  check "a real (non-dry-run) escalation exits DUE" 1 $?

  if [ -s "$TMP/send.log" ]; then echo "PASS  the send layer was actually called"
  else echo "FAIL  DUE exit but nothing reached the send endpoint"; fail=1; fi

  if grep -q "issue edit" "$GH_SIDE_EFFECT_LOG" 2>/dev/null; then
    echo "PASS  a successful send is followed by a label"
  else echo "FAIL  send succeeded but no label was applied — it will re-escalate daily"; fail=1; fi

  # Ordering, tested rather than asserted: labelling must happen AFTER the send.
  # Label-first loses the email silently on a send failure — the issue is marked
  # escalated for a message nobody received, and the threshold never fires again.
  # Send-first can duplicate instead, which is the tolerable failure. The only way
  # to tell the two orders apart is to make the send fail and look for the label.
  : > "$GH_SIDE_EFFECT_LOG"
  MAILGUN_BASE="http://127.0.0.1:1/v3" \
  MAILGUN_DOMAIN="example.invalid" \
  MAILGUN_SENDING_KEY="fake-key-not-a-real-credential" \
  OPS_EMAIL="ops@example.invalid" \
  node "$SCRIPT" --registry "$TMP/registry.json" >/dev/null 2>&1
  check "a failed send exits BROKEN, not DUE" 2 $?

  if [ -s "$GH_SIDE_EFFECT_LOG" ]; then
    echo "FAIL  the issue was labelled despite the send failing — label-first, email lost"
    fail=1
  else
    echo "PASS  a failed send leaves the issue unlabelled, so it re-escalates"
  fi
fi
kill "$FAKE_PID" 2>/dev/null || true

echo
if [ "$fail" -eq 0 ]; then echo "RESULT: all exit-code cases passed"; else echo "RESULT: FAILURES"; fi
exit "$fail"
