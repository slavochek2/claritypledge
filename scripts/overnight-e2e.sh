#!/usr/bin/env bash
#
# Overnight E2E runner — P1085 (trusted core) / P1043 (repair the rot).
#
# One start, unattended, machine time only. Spends no agent tokens: every phase is
# a command, and the expensive interpretation work is deliberately left for the
# morning, on the smallest set that survives.
#
#   Phase A  local Supabase from empty, auth rate-limit ceiling raised + PROVEN
#   Phase B  full suite against whichever DB won, batched, resumable
#   Phase C  mechanical classification of the failures (no agent, no tokens)
#   Phase D  morning report
#
# Why the ceiling matters: supabase/config.toml sets sign_in_sign_ups = 30 per
# 5 min PER IP. The suite issues ~1.5 sign-ins/test, so it exceeds its own quota
# with no co-tenant involved — that is what made run 4 unusable (156 rate-limit
# failures indistinguishable from defects) and what caps any run at ~360 auth/hr.
# The ceiling is a knob on a LOCAL stack. Phase A pulls it and proves it moved.
#
# Falls back to the hosted test project if Phase A fails, so a failed unlock costs
# the night's upside but never the night.
#
# Usage:
#   ./scripts/overnight-e2e.sh                 # start now, hard stop at 07:00 local
#   ./scripts/overnight-e2e.sh --end-hour 6    # different stop
#   ./scripts/overnight-e2e.sh --hosted        # skip Phase A, use hosted test project
#   ./scripts/overnight-e2e.sh --resume        # keep completed batches, redo the rest
#
# Pause:  touch .private/p1043-sweep/nightly/PAUSE     (stops between batches)
# Status: cat   .private/p1043-sweep/nightly/status.json
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

STATE="$REPO/.private/p1043-sweep/nightly"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$STATE/$RUN_ID"
STATUS="$STATE/status.json"
PAUSE="$STATE/PAUSE"
LOG="$RUN_DIR/runner.log"
CONFIG="$REPO/supabase/config.toml"
# Backup lives in the gitignored state dir, NOT beside the tracked config.
# A SIGKILL used to leave an untracked config.toml.overnight-bak in supabase/,
# where a co-tenant broad `git add` could sweep it into a commit.
CONFIG_BAK="$STATE/config.toml.overnight-bak"

END_HOUR=7
BATCH_SIZE=12
PHASE_A_DEADLINE_MIN=45
FORCE_HOSTED=0
RESUME=0

while [ $# -gt 0 ]; do
  case "$1" in
    --end-hour) END_HOUR="$2"; shift 2 ;;
    --batch-size) BATCH_SIZE="$2"; shift 2 ;;
    --hosted) FORCE_HOSTED=1; shift ;;
    --resume) RESUME=1; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$RUN_DIR/batches"
LOCKDIR="$STATE/.lock"
HOLD_LOCK=0


# ---------------------------------------------------------------- logging
log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$LOG"; }

# ---------------------------------------------------------------- status
# A missing or non-"green" verdict must never read as a pass (P1085 requirement:
# "no run last night" has to be distinguishable from "run was green").
DB_TARGET="unknown"
PHASE="init"
VERDICT="incomplete"
CUTOFF="false"
NOTE=""

write_status() {
  cat > "$STATUS" <<EOF
{
  "run_id": "$RUN_ID",
  "run_dir": "$RUN_DIR",
  "started_at": "$STARTED_AT",
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "phase": "$PHASE",
  "db_target": "$DB_TARGET",
  "verdict": "$VERDICT",
  "cut_off_by_window": $CUTOFF,
  "note": "$NOTE"
}
EOF
}

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---------------------------------------------------------------- window
if [ "$(date +%-H)" -lt "$END_HOUR" ]; then
  STOP_EPOCH=$(date -v"${END_HOUR}"H -v0M -v0S +%s)
else
  STOP_EPOCH=$(date -v+1d -v"${END_HOUR}"H -v0M -v0S +%s)
fi

time_left() { echo $(( STOP_EPOCH - $(date +%s) )); }
window_open() { [ "$(time_left)" -gt 0 ]; }

check_pause() {
  if [ -f "$PAUSE" ]; then
    log "PAUSE file present — stopping cleanly. Remove $PAUSE to allow the next run."
    NOTE="paused by PAUSE file"
    VERDICT="paused"
    write_status
    exit 0
  fi
}

# ---------------------------------------------------------------- cleanup
restore_config() {
  if [ -f "$CONFIG_BAK" ]; then
    if mv "$CONFIG_BAK" "$CONFIG"; then
      log "restored supabase/config.toml from backup"
    else
      return 1
    fi
  fi
  return 0
}

cleanup() {
  local rc=$?
  # If we never acquired the lock, this process owns NOTHING: another run's backup
  # and status.json are live. Touching either would recreate the very fatal this
  # lock exists to prevent. Exit silently.
  if [ "${HOLD_LOCK:-0}" -ne 1 ]; then return 0; fi
  # set -e applies INSIDE the trap: a failing mv in restore_config used to abort
  # cleanup entirely — config left patched, status.json frozen, nothing logged.
  # Verified: RESTORE/STATUS/FINAL log lines all vanished and rc was masked to 1.
  set +e
  if ! restore_config; then
    log "!!! CRITICAL: could not restore supabase/config.toml — IT IS STILL PATCHED."
    log "!!! Restore by hand:  mv '$CONFIG_BAK' '$CONFIG'   (or: git checkout -- supabase/config.toml)"
    VERDICT="error"; NOTE="config.toml restore FAILED — file left patched"
  fi
  if [ "${HOLD_LOCK:-0}" -eq 1 ]; then rm -rf "$LOCKDIR"; fi
  if [ "$rc" -ne 0 ] && [ "$VERDICT" = "incomplete" ]; then
    VERDICT="error"
    NOTE="runner exited rc=$rc during phase $PHASE"
  fi
  write_status
  log "runner finished: verdict=$VERDICT phase=$PHASE rc=$rc"
}
trap cleanup EXIT

# ---------------------------------------------------------------- mutual exclusion
# Acquired AFTER the trap so any later exit releases it. Two overlapping runs used
# to destroy each other: run 2's startup restore_config consumed run 1's backup, so
# run 1's exit-restore became a silent no-op and left config.toml patched at 100000.
# No flock on macOS; mkdir is atomic.
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "ABORT: another overnight-e2e run holds $LOCKDIR (pid $(cat "$LOCKDIR/pid" 2>/dev/null || echo '?'))." >&2
  echo "If no run is active, remove it:  rmdir $LOCKDIR" >&2
  exit 1
fi
echo "$$" > "$LOCKDIR/pid"
HOLD_LOCK=1

# A previous run that died mid-phase leaves the config patched. Restore before
# anything else, so tonight does not start from a corrupted committed file.
restore_config

# ---------------------------------------------------------------- preflight
PHASE="preflight"; write_status
log "=== overnight-e2e run $RUN_ID ==="
log "stop at $(date -r "$STOP_EPOCH" '+%Y-%m-%d %H:%M') local ($(( $(time_left) / 3600 ))h $(( ($(time_left) % 3600) / 60 ))m from now)"

if ! pmset -g batt | grep -q 'AC Power'; then
  log "WARNING: not on AC power. A multi-hour run will drain and sleep."
fi

# caffeinate tied to THIS script's whole lifetime, not to one child command —
# the previous attempt lost three runs to a caffeinate that released early.
# NOTE: caffeinate cannot beat a CLOSED LID on a laptop with no external display.
# Leave the lid open.
caffeinate -dimsu -w $$ &
log "caffeinate holding for pid $$ (lid must stay OPEN)"

# Liveness probe must match the node process, not a queued wrapper shell — the
# naive 'pgrep -f "playwright test"' matched a wrapper and deadlocked a runner 7h.
if pgrep -f "node .*playwright test" >/dev/null 2>&1; then
  log "ABORT: a playwright run is already in flight. Not starting a second."
  NOTE="another playwright run already in flight"
  exit 1
fi

# ---------------------------------------------------------------- Phase A
PHASE="A-local-supabase"; write_status
LOCAL_OK=0
STACK_UP=0

if [ "$FORCE_HOSTED" -eq 1 ]; then
  log "Phase A skipped (--hosted)"
else
  log "--- Phase A: local Supabase from empty, rate-limit ceiling raised ---"
  A_DEADLINE=$(( $(date +%s) + PHASE_A_DEADLINE_MIN * 60 ))

  a_time_ok() { [ "$(date +%s)" -lt "$A_DEADLINE" ]; }

  if ! docker info >/dev/null 2>&1; then
    log "starting Docker Desktop..."
    open -a Docker || true
    while ! docker info >/dev/null 2>&1; do
      if ! a_time_ok; then log "Docker did not come up before the Phase A deadline"; break; fi
      sleep 5
    done
  fi

  if docker info >/dev/null 2>&1 && a_time_ok; then
    log "Docker up. Raising auth rate-limit ceiling in config.toml (restored on exit)."
    cp "$CONFIG" "$CONFIG_BAK"
    # Only the [auth.rate_limit] knobs. sms_sent left alone (also 30, irrelevant).
    /usr/bin/sed -i '' \
      -e 's/^sign_in_sign_ups = .*/sign_in_sign_ups = 100000/' \
      -e 's/^token_refresh = .*/token_refresh = 100000/' \
      -e 's/^token_verifications = .*/token_verifications = 100000/' \
      -e 's/^anonymous_users = .*/anonymous_users = 100000/' \
      -e 's/^email_sent = .*/email_sent = 100000/' \
      "$CONFIG"
    log "patched: $(grep -c '= 100000' "$CONFIG") rate-limit keys raised"

    # The stack MUST be (re)started AFTER the patch: GoTrue reads the rate limits
    # at container start, so a stack already running with the old config would keep
    # the 30/5min ceiling. Verified the omission the hard way — `db reset` alone
    # returns "supabase start is not running" and Phase A silently fell back to
    # hosted, losing the entire point of the night.
    log "restarting local stack so GoTrue loads the patched rate limits"
    supabase stop >>"$RUN_DIR/supabase-reset.log" 2>&1 || true
    if supabase start >>"$RUN_DIR/supabase-reset.log" 2>&1; then
      log "local stack up"
      STACK_UP=1
    else
      log "supabase start FAILED — see supabase-reset.log. Falling back to hosted."
      STACK_UP=0
    fi

    log "supabase db reset — from empty, applying $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') migrations. Timing it."
    MIG_START=$(date +%s)
    # --local: this project IS linked (supabase/.temp/project-ref -> the hosted test
    # project). `db reset` defaults to local today, but naming the target means a
    # future CLI default can never silently retarget the reset at the hosted DB.
    # --yes: no prompt can block an unattended run. Both verified to parse on CLI 2.106.0.
    if [ "$STACK_UP" -eq 1 ] && supabase db reset --local --yes >>"$RUN_DIR/supabase-reset.log" 2>&1; then
      MIG_SECS=$(( $(date +%s) - MIG_START ))
      log "migrations applied in ${MIG_SECS}s"
      echo "$MIG_SECS" > "$RUN_DIR/migration-apply-seconds.txt"

      LOCAL_URL="$(supabase status -o env 2>/dev/null | grep '^API_URL=' | cut -d= -f2- | tr -d '"')"
      LOCAL_ANON="$(supabase status -o env 2>/dev/null | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')"
      LOCAL_SERVICE="$(supabase status -o env 2>/dev/null | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')"

      if [ -n "$LOCAL_URL" ] && [ -n "$LOCAL_ANON" ]; then
        log "local stack at $LOCAL_URL — running the rate-limit CONTROL PROBE"
        # Gate 7 / control-probe discipline: a patch that silently failed to apply
        # looks identical to one that worked. Prove the ceiling moved before
        # trusting a single failure this run produces.
        if node scripts/lib/probe-auth-rate-limit.cjs "$LOCAL_URL" "$LOCAL_ANON" 60 \
             2>&1 | tee -a "$LOG" | grep -q 'Ceiling is raised'; then
          log "CONTROL PROBE PASSED — 60 consecutive sign-ups, no 429."
          LOCAL_OK=1
        else
          log "CONTROL PROBE FAILED — ceiling did NOT move. Falling back to hosted."
        fi
      else
        log "could not read local stack credentials from 'supabase status'"
      fi
    else
      log "supabase db reset FAILED — see supabase-reset.log. Falling back to hosted."
    fi
  fi
fi

if [ "$LOCAL_OK" -eq 1 ]; then
  DB_TARGET="local-ephemeral"
  export VITE_SUPABASE_URL="$LOCAL_URL"
  export VITE_SUPABASE_ANON_KEY="$LOCAL_ANON"
  export SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SERVICE"
  log "DB target: LOCAL (unthrottled). This is the fast path."
else
  DB_TARGET="hosted-test-throttled"
  log "DB target: HOSTED test project (throttled at 30 sign-ins/5min per IP)."
  log "Expect rate-limit failures; Phase C tags them so they are not read as defects."
fi
write_status

# ---------------------------------------------------------------- Phase B
PHASE="B-suite"; write_status
log "--- Phase B: full suite, batches of $BATCH_SIZE ---"

find e2e -name '*.spec.ts' | sort > "$RUN_DIR/all-specs.txt"
TOTAL_FILES=$(wc -l < "$RUN_DIR/all-specs.txt" | tr -d ' ')
log "$TOTAL_FILES spec files"

split -l "$BATCH_SIZE" "$RUN_DIR/all-specs.txt" "$RUN_DIR/batches/b-"

BATCHES_RUN=0; BATCHES_SKIPPED=0; BATCHES_FAILED_TO_START=0; BATCHES_PARTIAL=0
for batch in "$RUN_DIR"/batches/b-*; do
  name="$(basename "$batch")"
  out="$RUN_DIR/$name.json"

  check_pause
  if ! window_open; then
    log "WINDOW CLOSED — stopping at batch $name. Partial results kept."
    CUTOFF="true"; NOTE="cut off by window at $name"
    break
  fi

  if [ "$RESUME" -eq 1 ] && [ -s "$out" ]; then
    BATCHES_SKIPPED=$(( BATCHES_SKIPPED + 1 )); continue
  fi

  log "batch $name ($(wc -l < "$batch" | tr -d ' ') files, $(( $(time_left) / 60 ))m left)"

  # Exit code is CHECKED. The prior batched-rerun.sh printed "done" on an aborted
  # batch and the loop continued — that is how a killed run looked complete.
  set +e
  PLAYWRIGHT_JSON_OUTPUT_NAME="$out" \
    npx playwright test $(tr '\n' ' ' < "$batch") \
      --reporter=json >/dev/null 2>>"$RUN_DIR/$name.stderr"
  rc=$?
  set -e

  # A non-empty report is NOT proof the batch ran. Measured: a batch that dies at
  # global/webServer level still writes a VALID 2.8KB report with suites:[],
  # stats.expected=0 and errors:[1]. Under the old `[ -s ]` test that counted as a
  # completed batch AND --resume skipped it forever — 12 spec files silently gone.
  BATCH_STATE="notrun"
  if [ -s "$out" ]; then
    BATCH_STATE="$(node -e '
      try {
        const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        const st = j.stats || {};
        const n = (st.expected||0)+(st.unexpected||0)+(st.flaky||0)+(st.skipped||0);
        const errs = (j.errors || []).length;
        if (n === 0) { console.log("notrun"); }
        else if (errs > 0) { console.log("partial:" + errs); }
        else { console.log("ok"); }
      } catch (e) { console.log("unparseable"); }
    ' "$out" 2>/dev/null || echo unparseable)"
  fi

  case "$BATCH_STATE" in
    ok)
      BATCHES_RUN=$(( BATCHES_RUN + 1 ))
      log "  batch $name done (rc=$rc)" ;;
    partial:*)
      BATCHES_RUN=$(( BATCHES_RUN + 1 ))
      BATCHES_PARTIAL=$(( BATCHES_PARTIAL + 1 ))
      log "  batch $name ran but reported ${BATCH_STATE#partial:} global error(s) (rc=$rc) — results kept, coverage INCOMPLETE" ;;
    *)
      # Remove the misleading report so --resume retries this batch instead of skipping it.
      rm -f "$out"
      log "  batch $name produced NO USABLE report ($BATCH_STATE, rc=$rc) — recorded as not-run, not as pass"
      BATCHES_FAILED_TO_START=$(( BATCHES_FAILED_TO_START + 1 )) ;;
  esac
done

log "batches: $BATCHES_RUN ran ($BATCHES_PARTIAL with global errors), $BATCHES_SKIPPED skipped (resume), $BATCHES_FAILED_TO_START produced no usable report"

# ---------------------------------------------------------------- Phase C
PHASE="C-classify"; write_status
log "--- Phase C: mechanical classification (zero tokens) ---"

set +e
node - "$RUN_DIR" <<'NODE' >>"$LOG" 2>&1
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
// Playwright colourises error messages. Left in, the escape codes fragment one
// logical failure cluster into several — measured in a dry run against a real
// report: 3 clusters that were all the same toBeVisible failure.
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*m/g, '');
const tests = [];
for (const f of fs.readdirSync(dir).filter(f => /^b-.*\.json$/.test(f))) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
  const walk = (suites, file) => {
    for (const s of suites || []) {
      const fname = s.file || file;
      for (const spec of s.specs || []) for (const t of spec.tests || []) for (const r of t.results || []) {
        tests.push({ file: fname, line: spec.line, title: spec.title, status: r.status,
                     expected: t.expectedStatus, duration: r.duration,
                     err: stripAnsi(r.error && r.error.message || '').replace(/\s+/g, ' ').slice(0, 400) });
      }
      walk(s.suites, fname);
    }
  };
  walk(j.suites);
}
const failed = tests.filter(t => t.status !== 'passed' && t.status !== 'skipped');
// Rate-limit failures are NOT defects. Tagging them is the whole reason run 4 was
// unusable: 156 of its failures were this, and nothing separated them.
const rateLimited = failed.filter(t => /rate limit|429|too many requests/i.test(t.err));
const timeouts = failed.filter(t => !rateLimited.includes(t) && /Test timeout of/i.test(t.err));
const rest = failed.filter(t => !rateLimited.includes(t) && !timeouts.includes(t));
const sig = e => e.replace(/\d+/g, '<n>').replace(/'[^']*'/g, "'<s>'").slice(0, 120);
const clusters = {};
for (const t of rest) (clusters[sig(t.err)] ||= []).push(t);
const out = {
  totals: { tests: tests.length, passed: tests.filter(t => t.status === 'passed').length,
            skipped: tests.filter(t => t.status === 'skipped').length, failed: failed.length },
  rate_limited: rateLimited.length,
  bare_timeouts: timeouts.length,
  clusters: Object.entries(clusters).sort((a, b) => b[1].length - a[1].length)
    .map(([sig, ts]) => ({ n: ts.length, sig, files: [...new Set(ts.map(t => t.file))].slice(0, 40), sample: ts[0] })),
};
fs.writeFileSync(path.join(dir, 'classified.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(dir, 'failures.json'), JSON.stringify(failed, null, 1));
console.log(`tests=${out.totals.tests} passed=${out.totals.passed} failed=${out.totals.failed} ` +
            `rate_limited=${out.rate_limited} bare_timeouts=${out.bare_timeouts} clusters=${out.clusters.length}`);
NODE
CLASSIFY_RC=$?
set -e
if [ "$CLASSIFY_RC" -ne 0 ]; then
  log "Phase C classifier FAILED (rc=$CLASSIFY_RC) — raw batch reports are intact in $RUN_DIR"
else
  log "classified: $(grep -m1 '^tests=' "$LOG" | tail -1)"
fi

# ---------------------------------------------------------------- Phase D
PHASE="D-report"; write_status
REPORT="$RUN_DIR/MORNING-REPORT.md"

{
  echo "# Overnight E2E — $RUN_ID"
  echo
  echo "- DB target: **$DB_TARGET**"
  echo "- Window stop: $(date -r "$STOP_EPOCH" '+%H:%M') local — cut off: **$CUTOFF**"
  [ -f "$RUN_DIR/migration-apply-seconds.txt" ] && \
    echo "- Migrations from empty: **$(cat "$RUN_DIR/migration-apply-seconds.txt")s** (P1085 Research Q1 deliverable)"
  echo "- Batches: $BATCHES_RUN ran / $BATCHES_SKIPPED skipped / $BATCHES_FAILED_TO_START produced no report"
  echo
  echo '## Results'
  echo '```'
  node -e "const o=require('$RUN_DIR/classified.json');console.log(JSON.stringify(o.totals,null,1));console.log('rate_limited:',o.rate_limited);console.log('bare_timeouts:',o.bare_timeouts)" 2>/dev/null || echo "no classified.json"
  echo '```'
  echo
  echo '## Top failure clusters (fan-out candidates — biggest first)'
  node -e "
    const o=require('$RUN_DIR/classified.json');
    for (const c of o.clusters.slice(0,15)) console.log(\`- **\${c.n}×** \\\`\${c.sig}\\\` — \${c.files.length} files, e.g. \${c.files[0]}\`);
  " 2>/dev/null || echo "no clusters"
  echo
  echo '## Caveats'
  if [ "$DB_TARGET" = "hosted-test-throttled" ]; then
    echo "- Ran on the THROTTLED hosted project. Failures tagged \`rate_limited\` are NOT defects."
  else
    echo "- Ran on a local unthrottled stack; the rate-limit control probe passed before the suite started."
    echo "- Edge functions are not served by \`supabase start\` here — integration specs that call a real edge function will fail for that reason, not as regressions."
  fi
  [ "$CUTOFF" = "true" ] && echo "- **PARTIAL** — the window closed mid-run. Counts cover only the batches that ran."
} > "$REPORT"

if [ "$CUTOFF" = "true" ]; then VERDICT="partial"; else VERDICT="complete"; fi
write_status
log "report: $REPORT"
