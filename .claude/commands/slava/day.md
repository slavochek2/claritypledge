---
name: day
description: Single daily skill — health checks, reflection on what shipped since last run, goals and branches forward. Replaces /day-start and /day-end.
when_to_use: Start of any work session, or end of day before closing laptop. Run instead of /day-start or /day-end.
version: 1.5.0
---

# Day (/day)

Single daily skill. Looks backward (what happened since last run), then forward (health, goals, what's next).
Replaces /day-start and /day-end.

## Timestamp Management

At the START of the skill, read the last-run timestamp:
```bash
LAST_RUN=$(cat ~/.claude-day-last-run 2>/dev/null || echo "")
```

If empty or file missing: fall back to `date -u -v-24H +"%Y-%m-%dT%H:%M:%SZ"` (last 24h).
If present: use the stored ISO 8601 timestamp as `$SINCE`.

**Floor rule:** If `$SINCE` is more recent than 6am local today, use `$SINCE`. If `$SINCE` is before 6am local today, use 6am local today as the floor. This ensures a second-same-day run shows the afternoon delta, while a morning run always covers at least the full workday.

Use `$SINCE` wherever the skill says "since last run."

Write the new timestamp at the very end (Step 10).

---

## Steps

### 0. Setup Reminders

**a) Reset Whisper language to English**
```bash
echo "en" > ~/.whisper-lang
```
Silent. Clears yesterday's `whisper ru`/`whisper de` pin so a stale language can't
carry into today's calls. Resets to `en`, **not** auto-detect: on 2026-07-27 an
auto-detect reset caused a 50-min English call to be transcribed as
hallucinated pseudo-Norwegian. Auto-detect is opt-in per call via `whisper all`.

**b) Lid sleep reset**
```bash
sudo pmset -a disablesleep 0
```
Silent.

**c) Claude extension check**
Output immediately:
```
⚠ Check: Claude extension connected in Chrome? (chrome://extensions → Claude — must be enabled & connected)
```

**d) Did the calendar actually get refreshed last time?**
```bash
cd "$(git rev-parse --show-toplevel)" && ./scripts/day-gates.sh --mode=start
```

**Relay its stdout verbatim.** Do not summarise it, do not re-attest it, do not
compose a `✓` line of your own from it — the script's output *is* the finding.

This is the only thing that makes a missed run visible. `$SINCE`'s floor rule
(above) clamps to 6am today whenever the marker is older, so a marker 6 days stale
renders **identically** to a healthy one — nothing else in this skill prints the
age of anything.

**It also records the push stamp that Step 8b compares against, so do not skip it.**
Without it, Step 8b can only ask "is the receipt recent", which a push from earlier
today satisfies — and that is exactly the 2026-08-13 shape, where Step 8 was dropped
entirely from a complete-looking report. With it, Step 8b asks the sharper question:
*did the stamp move during this run.*

**A day or three off is not an alarm here** and will not print as one — the check
only raises a flag after a week with no successful push. If it does print
`CALENDAR: STALE`, surface it and carry on to Step 8, which refreshes and re-verifies;
today's run cannot change the previous run's outcome. The blocking invocation is Step 8b.

---

### 1. Health Checks (3 sequential waves — NOT all in parallel)

**IMPORTANT:** Execute as 3 sequential waves to prevent permission prompt floods.
Each wave = at most 2 tool calls. Process results between waves.

#### Wave 1: Local + Git + Smoke + Cloud (1 bash call)

Combine ALL local operations into a single bash script:

```bash
cd "$(git rev-parse --show-toplevel)"

echo "=== PROD SMOKE ==="
node scripts/prod-smoke-test.mjs 2>&1 || echo "SMOKE_FAILED"

echo "=== GIT LOG ==="
git log --oneline --since="$SINCE" --author-date-order

echo "=== GIT BRANCHES ==="
git branch --format='%(refname:short) %(upstream:track)' | grep -v "^main"
git log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' '

echo "=== STRANDED SPECS ==="
grep -rl "delivery_stage: uat\|status: in-progress" features/p*.md 2>/dev/null || echo "none"

echo "=== STASH ==="
git stash list 2>/dev/null || echo "none"

echo "=== KDD CHECK ==="
git log --oneline --since="$SINCE" -- CLAUDE.md .claude/rules/ supabase/migrations/ .env.local .env.prod .mcp.json scripts/ docs/technical/

echo "=== CLAUDE.MD CHANGES ==="
git log --oneline --since="$SINCE" -- CLAUDE.md .claude/rules/

echo "=== ACTIVITY LOG ==="
grep -E "^$(date +%Y-%m-%d)" .private/logs/activity.log 2>/dev/null || echo "no activity log"

echo "=== CLOUD ==="
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
  echo "GCLOUD_NOT_AUTHENTICATED"
else
  gcloud compute instances list --filter="name=clarity-agent" --format="value(name,status,zone)" 2>/dev/null || echo "gcloud unavailable"
fi
echo -n "ghost_status="
curl -s -o /dev/null -w "%{http_code}" https://claritypledge.com/blog --max-time 5
echo ""
LATEST=$(gcloud storage ls gs://claritypledge-db-backups/ 2>/dev/null | sort | tail -1)
DATE=$(echo "$LATEST" | grep -oE '[0-9]{8}' | head -1)
if [ -n "$DATE" ]; then
  DATE_EPOCH=$(date -j -f "%Y%m%d" "$DATE" +%s 2>/dev/null)
  if [ -n "$DATE_EPOCH" ]; then
    echo "backup_age_days=$(( ( $(date +%s) - DATE_EPOCH ) / 86400 ))"
  fi
fi

echo "=== COST TRIPWIRE ==="
# Structural leak detection — catches always-on/GPU resources BEFORE cost accrues.
# (Gross MTD spend is not CLI-readable without BigQuery export; cause-pattern check is the daily signal.
#  Below also emits EST_PER_DAY — a resource-based €/day estimate, NOT billed actuals. Billed €: weekly /gcp-spend.)
GCP_PROJECT="gen-lang-client-0869694595"
for REGION in us-east4 us-central1 us-east5 europe-west1; do
  gcloud run services list --project="$GCP_PROJECT" --region="$REGION" --format="value(metadata.name)" 2>/dev/null | while read SVC; do
    [ -z "$SVC" ] && continue
    # Per-field queries — multi-field --format mis-maps when annotations are empty (verified May 2026)
    GPU=$(gcloud run services describe "$SVC" --project="$GCP_PROJECT" --region="$REGION" --format="value(spec.template.spec.containers[0].resources.limits['nvidia.com/gpu'])" 2>/dev/null)
    MIN=$(gcloud run services describe "$SVC" --project="$GCP_PROJECT" --region="$REGION" --format="value(spec.template.metadata.annotations['autoscaling.knative.dev/minScale'])" 2>/dev/null)
    THR=$(gcloud run services describe "$SVC" --project="$GCP_PROJECT" --region="$REGION" --format="value(spec.template.metadata.annotations['run.googleapis.com/cpu-throttling'])" 2>/dev/null)
    [ -n "$GPU" ] && echo "GPU_SERVICE: $SVC ($REGION) gpu=$GPU minScale=${MIN:-0} cpu-throttle=${THR:-true}"
    { [ -n "$MIN" ] && [ "$MIN" != "0" ]; } && echo "ALWAYS_ON: $SVC ($REGION) minScale=$MIN (never scales to zero)"
  done
done
# Enabled schedulers that target Cloud Run (the keep-warm trap)
for REGION in us-east4 us-central1; do
  gcloud scheduler jobs list --project="$GCP_PROJECT" --location="$REGION" \
    --filter="state=ENABLED" --format="value(name)" 2>/dev/null | grep -iE "run\.app|cloud-?run|poll|warm|transcribe|janitor|sweep" | grep -vx "tx-job-janitor" \
    && echo "SCHEDULER_PINGING_RUN: ^ enabled job in $REGION — verify it is not keeping a billable instance warm"
done
# €/day estimate + cost since last /day run — resource-based (±5%), NOT billed actuals.
# Snapshot rate × elapsed window: catches PERSISTENT spend. A leak that started-and-stopped
# between runs won't show here (only BigQuery billing history would) — that's what the tripwire above is for.
LAST_RUN=$(cat ~/.claude-day-last-run 2>/dev/null)
NOW_EPOCH=$(date +%s)
if [ -n "$LAST_RUN" ]; then
  LR_EPOCH=$(date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$LAST_RUN" +%s 2>/dev/null || date -d "$LAST_RUN" +%s 2>/dev/null)
  DAYS_ELAPSED=$(python3 -c "print(max(0.04,($NOW_EPOCH-${LR_EPOCH:-$NOW_EPOCH})/86400))")
else
  DAYS_ELAPSED=1
fi
export DAYS_ELAPSED
gcloud compute instances list --project="$GCP_PROJECT" --format="value(name,machineType.basename(),status)" 2>/dev/null | python3 -c '
import sys, os
HR={"e2-micro":0.0084,"e2-small":0.0168,"e2-medium":0.0335,"e2-standard-2":0.0670,"e2-standard-4":0.1340,"e2-standard-8":0.2681,"n1-standard-1":0.0475}
usd_day=0.16  # disk+storage baseline/day (from /gcp-spend inventory)
for line in sys.stdin:
    p=line.split()
    if len(p)>=3 and p[2]=="RUNNING":
        usd_day+=HR.get(p[1],0)*24
days=float(os.environ.get("DAYS_ELAPSED","1"))
eur_day=usd_day*0.92  # rough USD->EUR; estimate only
print(f"EST_PER_DAY: ~EUR{round(eur_day,2)}/day  |  EST_SINCE_LAST: ~EUR{round(eur_day*days,2)} over {round(days,1)}d (current resources x elapsed; a warm GPU adds ~EUR19/day)")
'
echo "(empty above = no always-on/GPU cost leaks)"
```

Process Wave 1 results before proceeding.
Show: `✓ Prod smoke: all pass` or `✗ Prod smoke: N failed — [first failure]`
Flag cloud only if broken: Ghost non-200, backup >2d old.

**Cost tripwire — flag if ANY line appears under `=== COST TRIPWIRE ===`:**
- `GPU_SERVICE:` → a GPU is attached to a Cloud Run service. GPUs bill ~€0.80/hr while allocated. Confirm it is intended and scales to zero (`minScale=0`, but note `cpu-throttle=false` still bills GPU between requests if kept warm).
- `ALWAYS_ON:` → a service has `minScale ≥ 1` and never idles to zero — paying 24/7.
- `SCHEDULER_PINGING_RUN:` → an enabled scheduler hits Cloud Run. A poll on a `cpu-throttle=false`/GPU service holds it warm 24/7 (this is the May-2026 €1,600 transcribe-session leak — see decisions). Verify the target isn't being kept alive needlessly. Allowlisted: `tx-job-janitor` (P858/P902 sweeper, ~2h interval ≫ the ~15-min idle window — intentionally excluded in the grep above; any OTHER scheduler hitting transcribe-session is a leak).

**Always output a cost block, even when clean** (silence = "did it leak?" uncertainty, the exact problem this prevents):
- **Verdict line:**
  - Any tripwire present → one `⚠ COST LEAK: [line]` per `GPU_SERVICE:` / `ALWAYS_ON:` / `SCHEDULER_PINGING_RUN:` line. These are silent money drains the credit-masked budget won't catch until gross thresholds.
  - All clear → `✓ GPU/cost: no leak (no GPU services, no always-on, no Run-pinging scheduler)`.
- **Spend line (always):** render the `EST_PER_DAY:` / `EST_SINCE_LAST:` output as `Est. spend: ~€X/day · ~€Y since last /day (Nd)`. This is a resource-based estimate (±5%), NOT billed — a warm GPU spikes it ~€19/day above the ~€4/day baseline. For billed-to-the-cent €: weekly `/gcp-spend`.

**gcloud auth gate:** If output contains `GCLOUD_NOT_AUTHENTICATED`, stop and prompt:
> ⚠ gcloud is not authenticated. Run `! gcloud auth login` to authenticate, then say "done" to continue.

Wait for user response before proceeding to Wave 2. Cloud checks (VM status, backup age) and Step 5 (cloud server check) depend on gcloud.

#### Wave 2: Supabase + Sentry (2 calls max, parallel)

Run these two in parallel:

**a) Sentry MCP** — single call:

**Pre-flight: connect before executing.** Before the query, run ToolSearch for `mcp__sentry__search_issues` to confirm the MCP is live. If the tool is not found, run the **self-repair sequence** (automatic — same mechanism as Mixpanel; Sentry uses the identical `mcp-remote` OAuth cache — verified 2026-07-03):

1. Read the newest Sentry MCP log to diagnose:
   ```bash
   LOGDIR=~/Library/Caches/claude-cli-nodejs/$(git rev-parse --show-toplevel | sed 's#/#-#g')/mcp-logs-sentry
   LOG=$(ls -t "$LOGDIR"/*.jsonl 2>/dev/null | head -1)
   [ -n "$LOG" ] && grep -oE 'connection timed out|Server returned 40[0-9]|invalid_token' "$LOG" | head -3 || echo "no-log"
   ```
   (Patterns are UNQUOTED substrings matching the real log format — e.g. `MCP server "sentry" connection timed out after 30000ms`, `Server returned 403`. The phrase is never wrapped in its own quote pair, so a quoted grep like `'"connection timed out"'` matches nothing — verified against historical logs 2026-07-03.)
2. **Stale-OAuth path** (log contains `connection timed out`, `Server returned 401/403`, or `invalid_token`): clear Sentry's cached token automatically — hash-glob across ALL mcp-remote versions so it survives the `.mcp.json` version pin drifting (Sentry's token has been seen under an older version dir than the pinned one):
   ```bash
   rm -f ~/.mcp-auth/mcp-remote-*/305d49f5*
   ```
   (Hash `305d49f5287a7c289157a704a0ed3b1e` = `md5('https://mcp.sentry.dev/mcp')` — stable, derived from the server URL, NOT the token. This glob clears ONLY Sentry, never Mixpanel's `3065cf…`. Verified 2026-07-03.)
   Then re-run ToolSearch for `mcp__sentry__search_issues`. If tools appear, proceed — repair was silent (note it in the status line).
   If tools still absent after clearing: prompt once: "Sentry auth was stale and cleared, but the MCP didn't reconnect. Run `/mcp` → reconnect sentry (browser OAuth opens), then say 'done'." On "done": retry once more. If still unavailable, skip with the loud line below.
3. **No log / different error**: skip with the loud line — don't clear auth blindly.

**Query** (once connected): use `mcp__sentry__search_issues`: org `22minds-llc`, project `javascript-react`, unresolved issues first seen since `$SINCE`. Also look for `live_state_update_failed` in results.

**Always emit exactly one explicit status line** (a skip MUST be visually distinct from "clean" — this is the whole point):
- `✓ Sentry: clean (0 new since last /day)` — connected, no new issues
- `⚠ Sentry: N new issues — [top title]` — connected, issues found
- `✓ Sentry: self-healed (cleared stale OAuth), clean` — repair succeeded
- `⚠ Sentry: SKIPPED — MCP unreachable after self-heal + reconnect. NOT checked this run. → /mcp reconnect sentry` — genuinely failed; never render as clean

**b) All Supabase queries** — single bash call with all curls:

```bash
source "$(git rev-parse --show-toplevel)/.env.local"
PROD_URL="https://besjtuodziykmjidubzw.supabase.co/rest/v1"
H1="apikey: $PROD_SUPABASE_SERVICE_ROLE_KEY"
H2="Authorization: Bearer $PROD_SUPABASE_SERVICE_ROLE_KEY"
CUTOFF=$(date -u -v-60M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "60 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")

echo "=== SIGNUPS ==="
curl -s "${PROD_URL}/profiles?select=id,name,email,created_at&created_at=gt.${SINCE}&email=neq.test-agent@claritypledge.com&order=created_at.desc" -H "$H1" -H "$H2"

echo -e "\n=== STORIES ==="
curl -s "${PROD_URL}/stories?select=author_id,created_at&created_at=gt.${SINCE}&order=created_at.desc" -H "$H1" -H "$H2"

echo -e "\n=== POSITIONS ==="
curl -s "${PROD_URL}/point_positions?select=user_id,updated_at&updated_at=gt.${SINCE}&order=updated_at.desc" -H "$H1" -H "$H2"

echo -e "\n=== VERIFICATIONS ==="
curl -s "${PROD_URL}/story_verifications?select=speaker_id,listener_id,created_at&created_at=gt.${SINCE}" -H "$H1" -H "$H2"

echo -e "\n=== AGREEMENTS ==="
curl -s "${PROD_URL}/clarity_agreements?select=creator_profile_id,partner_profile_id,status,created_at&or=(created_at.gt.${SINCE},partner_signed_at.gt.${SINCE})" -H "$H1" -H "$H2"

echo -e "\n=== FUNNEL: PROFILES ==="
FUNNEL_SIGNUPS=$(curl -s "${PROD_URL}/profiles?select=id&email=neq.test-agent@claritypledge.com" -H "$H1" -H "$H2" | python3 -c "import json,sys;r=json.load(sys.stdin);print(len(r) if isinstance(r,list) else '?')" 2>/dev/null || echo "?")
echo "$FUNNEL_SIGNUPS"

echo -e "\n=== FUNNEL: STORY AUTHORS ==="
FUNNEL_STORY_USERS=$(curl -s "${PROD_URL}/stories?select=author_id" -H "$H1" -H "$H2" | python3 -c "import json,sys;r=json.load(sys.stdin);print(len(set(x['author_id'] for x in r)) if isinstance(r,list) else '?')" 2>/dev/null || echo "?")
echo "$FUNNEL_STORY_USERS"

echo -e "\n=== FUNNEL: POSITION USERS ==="
FUNNEL_POSITION_USERS=$(curl -s "${PROD_URL}/point_positions?select=user_id" -H "$H1" -H "$H2" | python3 -c "import json,sys;r=json.load(sys.stdin);print(len(set(x['user_id'] for x in r)) if isinstance(r,list) else '?')" 2>/dev/null || echo "?")
echo "$FUNNEL_POSITION_USERS"

echo -e "\n=== FUNNEL: AGREEMENTS ==="
FUNNEL_AGREEMENTS=$(curl -s "${PROD_URL}/clarity_agreements?select=id&status=eq.active" -H "$H1" -H "$H2" | python3 -c "import json,sys;r=json.load(sys.stdin);print(len(r) if isinstance(r,list) else '?')" 2>/dev/null || echo "?")
echo "$FUNNEL_AGREEMENTS"

echo -e "\n=== ORPHANED SESSIONS ==="
curl -s "${PROD_URL}/clarity_sessions?select=id,code,created_at,expires_at&joiner_name=not.is.null&expires_at=lt.${CUTOFF}&demo_status=neq.completed&order=expires_at.desc&limit=5" -H "$H1" -H "$H2"

echo -e "\n=== TRANSCRIPTION HEALTH ==="
# P874 tier-0 job health. Uses only columns on prod today (status/created_at/updated_at) —
# NOT `attempts` (a P858 column; add an attempts distribution here once P858's migration is on prod).
# Stale/lost windows are filtered SERVER-SIDE (PostgREST) — never string-compare timestamps client-side
# (prod returns +00:00 offsets that don't sort lexicographically against a Z cutoff).
TX_STALE=$(date -u -v-30M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "30 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")
TX_LOST=$(date -u -v-5M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "5 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")
echo -n "counts: "; curl -s "${PROD_URL}/transcription_jobs?select=status" -H "$H1" -H "$H2" | python3 -c "import json,sys;from collections import Counter;r=json.load(sys.stdin);print('query failed:',r.get('message')) if isinstance(r,dict) else print(dict(Counter(x['status'] for x in r)) or {})" 2>/dev/null || echo "?"
echo -n "stale_processing(>30m): "; curl -s "${PROD_URL}/transcription_jobs?select=id&status=eq.processing&updated_at=lt.${TX_STALE}" -H "$H1" -H "$H2" | python3 -c "import json,sys;r=json.load(sys.stdin);print(len(r) if isinstance(r,list) else '?')" 2>/dev/null || echo "?"
echo -n "lost_pending(>5m): "; curl -s "${PROD_URL}/transcription_jobs?select=id&status=eq.pending&created_at=lt.${TX_LOST}" -H "$H1" -H "$H2" | python3 -c "import json,sys;r=json.load(sys.stdin);print(len(r) if isinstance(r,list) else '?')" 2>/dev/null || echo "?"

echo -e "\n=== FUNNEL CSV ==="
# Pin to the MAIN checkout, not a worktree — .private/ is gitignored, so a worktree
# under .claude/worktrees/wN has no shared file; writing there silently forks the metric.
MAIN_GIT_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
METRICS_DIR="$(dirname "$MAIN_GIT_DIR")/.private/metrics"
mkdir -p "$METRICS_DIR"
CSV_FILE="$METRICS_DIR/funnel-daily.csv"
# Strip any trailing blank line before reading the tail — an empty last line never
# equals today's date, which would otherwise defeat the dedup below on every run.
LAST_CSV_DATE=$(grep -v '^[[:space:]]*$' "$CSV_FILE" 2>/dev/null | tail -1 | cut -d, -f1)
if [ -n "$LAST_CSV_DATE" ]; then
  LAST_CSV_EPOCH=$(date -j -f "%Y-%m-%d" "$LAST_CSV_DATE" +%s 2>/dev/null || date -d "$LAST_CSV_DATE" +%s 2>/dev/null)
  if [ -n "$LAST_CSV_EPOCH" ]; then
    STALE_DAYS=$(( ( $(date +%s) - LAST_CSV_EPOCH ) / 86400 ))
    [ "$STALE_DAYS" -gt 2 ] && echo "⚠ FUNNEL CSV STALE: $STALE_DAYS days since last row ($LAST_CSV_DATE) — check this append is actually firing"
  fi
fi
if [[ "$FUNNEL_SIGNUPS" =~ ^[0-9]+$ ]] && [[ "$FUNNEL_STORY_USERS" =~ ^[0-9]+$ ]] && [[ "$FUNNEL_POSITION_USERS" =~ ^[0-9]+$ ]] && [[ "$FUNNEL_AGREEMENTS" =~ ^[0-9]+$ ]]; then
  TODAY_ROW="$(date -u +%Y-%m-%d)"
  # Same-day re-run: REPLACE the last row rather than skip — the latest snapshot wins.
  # Skipping would make an earlier bad/partial row (e.g. from a since-fixed query
  # failure) permanent for the day, since the CSV has no other correction path.
  if [ "$LAST_CSV_DATE" = "$TODAY_ROW" ]; then
    grep -v '^[[:space:]]*$' "$CSV_FILE" 2>/dev/null | sed '$d' > "${CSV_FILE}.tmp" && mv "${CSV_FILE}.tmp" "$CSV_FILE"
  fi
  echo "${TODAY_ROW},${FUNNEL_SIGNUPS},${FUNNEL_STORY_USERS},${FUNNEL_POSITION_USERS},${FUNNEL_AGREEMENTS}" >> "$CSV_FILE"
  echo "CSV row for $TODAY_ROW written (latest snapshot of the day)"
else
  echo "CSV_APPEND_SKIPPED — one or more funnel counts was non-numeric (query failure): signups=$FUNNEL_SIGNUPS story=$FUNNEL_STORY_USERS pos=$FUNNEL_POSITION_USERS agreements=$FUNNEL_AGREEMENTS"
fi
```

**This append is mandatory, not optional — it runs inline in the Wave 2b bash script above, using the funnel counts it already computed.** If `CSV_APPEND_SKIPPED` or `⚠ FUNNEL CSV STALE` appears in output, flag it (a query failed, or a prior run silently didn't append) rather than continuing past it. Filter out `test-agent@claritypledge.com` from all results.

**Known remaining gap (not fixed here — flag if it becomes live):** all four funnel counts use client-side `len()` over an unpaginated query, so a table crossing PostgREST's `max-rows` cap (commonly 1000) would silently plateau. Not worth the `Prefer: count=exact` header rewrite at current volume (~90 profiles) — revisit if any count nears 3 digits.

If response is a JSON object with `message` key (not array): `⚠ User activity: query failed — check PROD_SUPABASE_SERVICE_ROLE_KEY in .env.local`

**Transcription health (P874 tier-0) — read `=== TRANSCRIPTION HEALTH ===`. Flag if:**
- `failed` climbing relative to `completed` → pipeline regression (cross-check Sentry + recent `transcription_jobs.error_message`).
- `stale_processing(>30m) > 0` → a job crashed mid-run. The P858 sweeper (`tx-job-janitor`, ~2h) should reset these; **>0 across two consecutive `/day` runs = the sweeper isn't running** — check the scheduler.
- `lost_pending(>5m) > 0` → a trigger was lost (webhook/Cloud Tasks miss); the sweeper is the backstop — same two-run rule applies.
- All zeros (or only `completed`) = healthy / idle. Pre-P858-deploy this is mostly zeros + historical rows — that's the expected baseline.
- Once P858's migration is on prod, add an `attempts` distribution here (`attempts>=3` = retries exhausted → permanent failure).

Cross-reference: user IDs in activity but NOT in new signups = **returning users**.

Show the Supabase summary (Wave 2b enriches this with Mixpanel narratives):
```
USER INTELLIGENCE (since last /day)
  New:       N signups
    · Name (email) — HH:MM UTC
      [Mixpanel narrative — see Wave 2b Phase 3] [tag]
  Returning: N
    · Name — [narrative from Mixpanel drill] [tag]
  Funnel:    A → B → C → D  (+Δ/+Δ/+Δ/+Δ)
             signup  story  pos  agreement
```

Quiet period (no real users): `Quiet: no real user activity since last /day (founder/test excluded) | Funnel: A → B → C → D`

The daily CSV row was already appended earlier in this wave's bash script (`=== FUNNEL CSV ===` block) — no separate step needed here. If a previous entry exists, show deltas in the funnel line.

Show: `✓ Sessions: no orphans` or `⚠ ORPHANED SESSIONS: N sessions with joined users but no completion (possible deadlocks) — check Sentry for live_state errors`

#### Wave 2b: User Intelligence (Mixpanel MCP — after Wave 2)

Three-phase per-user intelligence. Enriches the Supabase data from Wave 2 with behavioral narratives.

**Pre-flight: connect before executing.** Before any Mixpanel tool call, run ToolSearch for `mcp__mixpanel__Run-Query` to confirm the MCP is live. If the tool is not found:

**Self-repair sequence (automatic — no user prompt needed until repair exhausted):**

0. **Config check FIRST — is the server even registered?** Clearing auth cannot fix a server that does not exist, and a missing entry produces the exact same "tools not found" symptom as stale auth:
   ```bash
   grep -q '"mixpanel"' .mcp.json && echo "configured" || echo "NOT-CONFIGURED"
   ```
   If `NOT-CONFIGURED`: **stop the repair sequence here** — do NOT clear auth, do NOT read logs (the newest log will show a healthy connection from whenever the entry last existed, which reads as a false all-clear). Skip all three phases with: `⚠ Mixpanel: NOT CONFIGURED — no "mixpanel" entry in .mcp.json. Narratives NOT available. → restore the entry, then /mcp reconnect` and move on.
   (This is the Jul-3→Jul-15 failure: the entry vanished from the gitignored `.mcp.json`, permissions and cached tokens survived, and 12 days of runs reported "unavailable" — pointing at auth, which was fine. Verified 2026-07-15.)
1. Read the newest MCP log to diagnose the failure:
   ```bash
   LOGDIR=~/Library/Caches/claude-cli-nodejs/$(git rev-parse --show-toplevel | sed 's#/#-#g')/mcp-logs-mixpanel
   LOG=$(ls -t "$LOGDIR"/*.jsonl 2>/dev/null | head -1)
   [ -n "$LOG" ] && grep -oE 'connection timed out|Server returned 40[0-9]|invalid_token' "$LOG" | head -3 || echo "no-log"
   ```
   (UNQUOTED substrings — the real log reads `MCP server "mixpanel" connection timed out after 30000ms` / `Server returned 403`; a quoted grep matches nothing. Verified 2026-07-03.)
2. **Stale-OAuth path** (log contains `connection timed out`, `Server returned 401/403`, or `invalid_token`): clear cached token automatically:
   ```bash
   rm -f ~/.mcp-auth/mcp-remote-*/3065cf*
   ```
   (The `3065cf…` hash is stable — derived from the Mixpanel server URL, not the token. Verified 2026-06-06.)
   Then re-run ToolSearch for `mcp__mixpanel__Run-Query`. If tools appear now, proceed — repair was silent.
   If tools still absent after clearing: prompt once: "Mixpanel auth was stale and cleared, but the MCP didn't reconnect automatically. Run `/mcp` → reconnect mixpanel (browser OAuth opens), then say 'done'." On "done": retry once more. If still unavailable, skip all three phases with: `⚠ Mixpanel MCP unavailable — user narratives skipped`
3. **No log / different error**: skip with `⚠ Mixpanel MCP unavailable — user narratives skipped` — don't clear auth blindly.

**Always emit exactly one explicit Mixpanel status line** — a connection failure MUST read differently from a legitimately-idle day (the two look identical otherwise, which is the confusion this prevents):
- `✓ Mixpanel: checked (N users drilled)` — connected, real users narrated
- `✓ Mixpanel: not called — no real users this run (nothing to drill, not a failure)` — the quiet-day case; connection was never needed
- `✓ Mixpanel: self-healed (cleared stale OAuth), N drilled` — repair succeeded
- `⚠ Mixpanel: NOT CONFIGURED — no "mixpanel" entry in .mcp.json. Narratives NOT available. → restore the entry, then /mcp reconnect` — config gone; distinct from an auth failure, and NOT fixable by reconnecting
- `⚠ Mixpanel: SKIPPED — MCP unreachable after self-heal + reconnect. Narratives NOT available this run. → /mcp reconnect mixpanel` — genuinely failed; never silently omit

##### Phase 1: Classify users

Using the Wave 2 Supabase results already collected (no new queries):

1. Collect all unique user IDs + emails from Wave 2 results (signups `id`, stories `author_id`, positions `user_id`, verifications `speaker_id`/`listener_id`, agreements `creator_profile_id`/`partner_profile_id`)
2. Read `.private/docs/founder-accounts.md` — it contains the founder's Supabase UUIDs and test account emails. Use this to classify users without querying prod.
3. Classify each user:
   - UUID matches a founder UUID from `.private/docs/founder-accounts.md` → **founder** (skip)
   - Email matches a test/founder email from `.private/docs/founder-accounts.md` → **founder/test** (skip)
   - `test-agent@claritypledge.com` → **test** (skip, fallback if file missing)
   - Everything else → **real user** (proceed to Phase 2)
3. If 0 real users and 0 new signups: output `Quiet: no real user activity since last /day (founder/test excluded)` and skip Phase 2.

##### Phase 2: Drill (1 Mixpanel MCP call per real user)

For each real user, call `mcp__mixpanel__Run-Query` (project_id: `3968494`) with key journey events as separate metrics, all filtered by the user's distinct_id:

```json
{
  "report_type": "insights",
  "report": {
    "name": "Journey: <UserName>",
    "metrics": [
      { "eventName": "profile_created", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "login_complete", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "story_created", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "story_viewed", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "position_recorded", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "live_session_created", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "live_session_joined", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "live_session_completed", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "live_rating_submitted", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "profile_page_viewed", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "landing_page_viewed", "measurement": { "type": "basic", "math": "total" } },
      { "eventName": "agreement_create_success", "measurement": { "type": "basic", "math": "total" } }
    ],
    "chartType": "table",
    "dateRange": { "type": "absolute", "from": "<SINCE as YYYY-MM-DD>", "to": "<today YYYY-MM-DD>" },
    "filters": [{ "type": "string", "propertyName": "$distinct_id", "operator": "equals", "value": "<user-uuid>" }]
  }
}
```

This returns event counts for 12 key journey events for that specific user. Only events with count > 0 appear in results. Identity bridge: Supabase `profiles.id` (UUID) = Mixpanel `distinct_id` (verified in `src/auth/AuthCallbackPage.tsx:416`).

**Live-session positions fire `live_rating_submitted`, NOT `position_recorded`** — `position_recorded` only fires from story/doc detail pages (`story-detail-page.tsx`, `doc-detail-page.tsx`). A user whose positions all came through /live shows 0 `position_recorded`; that is correct, not a tracking gap (verified 2026-06-06).

**Empty drill ≠ inactive user.** If Supabase (Wave 2) shows activity but the Mixpanel drill returns zero events for that UUID, the user's client is likely blocking Mixpanel (ad/tracking blockers — common). Narrate as: "active in DB, no Mixpanel data — likely blocked client" — never tag `[bounced]` on Mixpanel absence when Supabase shows actions. Supabase is ground truth; Mixpanel undercounts.

**Also run the magic-link gap check** (in parallel with first user drill):
- `signup_magic_link_sent` total (last 24h) vs `profile_created` total (last 24h)
- If sends > 0 AND completions = 0: `⚠ MAGIC LINK GAP: N sent, 0 completed — check Brevo logs`
- Otherwise: silent.

**Scaling rules:**
- ≤10 real users → drill each user individually
- 11-20 → drill new signups only; returning users get aggregate summary ("N returning, M took positions")
- >20 → aggregate mode only + flag: "Consider state-transition alerts (t005 Phase 2)"

##### Phase 3: Narrate (LLM synthesis — no tool calls)

For each user with Mixpanel drill results, produce a per-user narrative using the **Event-to-Journey Mapping** (see reference section below).

**Narrative structure** (one block per user, max 3 sentences):
1. **WHO + WHEN:** "Kevin signed up via magic link at 14:32 UTC"
2. **WHAT they did:** using journey stage labels, not event names. "Created a story, took 2 positions, browsed the feed"
3. **WHERE they stopped + SO WHAT:** "Left after viewing the feed once — no content created, no /live session. [bounced]"

**User tags** (append to narrative):
- `[activated]` — completed a live session OR created story + took position
- `[exploring]` — signed up + page views or content views but no creation actions
- `[bounced]` — signed up + zero further meaningful events in the period
- `[engaged]` — returning user with new actions (positions, stories, sessions)
- Do NOT use "churned" — with <10 users and <7 days of data, "paused" is more honest

**Final output format:**
```
USER INTELLIGENCE (since last /day)
  New: N signups
    · Kevin (kevin@example.com) — 14:32 UTC
      Signed up via magic link, viewed profile once, left.
      No content created, no /live session. [bounced]
    · Maria (maria@example.com) — 09:15 UTC
      Signed up via Google OAuth, completed a live session (3 checks).
      Reached activation — watch for return visit. [activated]
  Returning: N
    · Alex — took 4 new positions, viewed 2 stories. [engaged]
  Quiet: no real user activity (founder/test excluded).
  Funnel: 67 → 3 → 12 → 1 (+2/+0/+2/+0)
          signup  story  pos  agreement
  ⚠ MAGIC LINK GAP: 3 sent, 0 completed — check Brevo logs
```

#### Wave 2c: Signup Intel (WebSearch — after Wave 2, only if new real-user signups exist)

For each new real-user signup (non-founder, non-test, max 10), run one WebSearch:

```
"{Name} cofounder OR founder OR startup"
```

Synthesize into a single line per person:
- Role/context if findable: "UWaterloo robotics student, Tesla internships. Pre-company."
- If nothing surfaces: "No public record found."

Output appended to the USER INTELLIGENCE block:
```
  · [Signup A] — finance background, pivot to nonprofit/education. No startup record.
  · [Signup B] — engineering student, pre-company stage.
```

**Skip entirely** if: no new real-user signups, or WebSearch MCP unavailable.

---

#### Wave 3: Repo health + file reads (2-3 calls, after processing Wave 1-2)

**a) Repo health** (1 bash call):
```bash
cd "$(git rev-parse --show-toplevel)"
echo "=== LINT ==="
npm run lint 2>&1 | grep -c "error" || echo "0"
echo "=== TEST ==="
npm test -- --run 2>&1 | tail -5
echo "=== OPS ISSUES ==="
gh issue list --state open --limit 50 || echo "OPS-ISSUES-CHECK-FAILED (exit $?)"
echo "=== RLS DRIFT ==="
# Pin to the MAIN checkout, same reason as the funnel CSV below: the baseline lives
# under .private/ (gitignored, so absent in worktrees), and a worktree on an older
# branch may not have the script at all. Resolving from --git-common-dir works
# identically whether /day is run from w0 or a worktree.
RLS_MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
python3 "$RLS_MAIN_ROOT/scripts/rls-drift-check.py" --summary 2>&1
RLS_RC=$?
# This used to end `|| true`, which threw away a deliberately three-way signal:
# 0 clean, 1 NEW drift (the alarm), 2 "The check did NOT run. This is not a clean
# result." — the script's own words, on three separate paths. With the code discarded,
# "did not run" and "ran clean" were indistinguishable in the output, which is the
# same class of bug day-gates.sh exists to close, sitting on live security signal.
# Printing the code unconditionally means the agent cannot infer clean from silence.
if [ "$RLS_RC" -ge 2 ]; then
  echo "RLS-DRIFT-CHECK-DID-NOT-RUN (exit $RLS_RC) — do NOT report clean"
fi
echo "rls_drift_exit=$RLS_RC"
echo "=== FUNCTION GRANT DRIFT ==="
# Same main-checkout pinning and same three-way exit contract as the RLS check
# above. Separate script because it reads a different catalog (EXECUTE grants on
# pg_proc, not pg_policies) — the RLS check is blind to the entire P1063 class.
python3 "$RLS_MAIN_ROOT/scripts/function-grant-drift-check.py" --summary 2>&1
FGD_RC=$?
if [ "$FGD_RC" -ge 2 ]; then
  echo "FUNCTION-GRANT-CHECK-DID-NOT-RUN (exit $FGD_RC) — do NOT report clean"
fi
echo "function_grant_exit=$FGD_RC"
```
Show: `✓ Repo baseline: clean` or `⚠ Repo baseline: N lint errors, M test failures — fix before starting new work`

**RLS drift** (`=== RLS DRIFT ===`, P1048): read-only three-way diff of live prod vs live test vs migration files. This is the check that would have caught P1046, where four permissive policies sat live on prod — one of them an unauthenticated read of private data — invisible to every file-based audit in the repo. It runs here rather than in CI because it needs both projects' credentials and they already exist locally; putting a full-account Supabase token into GitHub Actions to buy a daily email was judged the wrong trade (P1048).

Read the one line it prints:

- `RLS drift: clean` — nothing unallowlisted. Report `✓ RLS drift: clean`.
- `RLS drift: N known-open` — the recorded backlog, unchanged. Report `✓ RLS drift: N known-open (no change)`. **Do not re-litigate these daily** — they are tracked in `.private/docs/security-log.md` and each needs its own spec. Mentioning them every morning is how this signal gets tuned out.
- `RLS DRIFT: N NEW ...` (capitalised) — **a policy has appeared on a live database that was not there when the backlog was recorded.** This is the alarm. Surface the named table/policy prominently, treat it as potential live exposure, and offer to investigate now. An out-of-band policy means someone or something wrote directly to a live database outside the migration path.
- `N resolved since baseline` — findings that are now gone. Offer `python3 scripts/rls-drift-check.py --update-baseline` to re-record.
- `RLS-DRIFT-CHECK-DID-NOT-RUN (exit N)` — the check **did not run** (missing credentials, API error, malformed allowlist, unreadable baseline). Flag `⚠ RLS drift: NOT checked this run` and never render it as clean. Exit 2 is deliberately distinct from exit 1 for exactly this reason.

**Read `rls_drift_exit=N`, which is always printed — do not infer the outcome from the prose alone.** `0` clean · `1` NEW drift, treat as the alarm above · `2` did not run. If that line is absent from the output entirely, the wave did not complete and the RLS check is unverified — say so rather than omitting the row.

The backlog file is `.private/rls-drift-baseline.json` — gitignored, because it names live unpatched policies. If it is missing the check reports every finding as NEW, which is noisy but never silently quiet. **The baseline is not an allowlist**: baselined findings are still printed in the full report (`python3 scripts/rls-drift-check.py` with no flags), they are just not re-alarmed. Only `scripts/rls-drift-allowlist.txt` marks a divergence as permanently expected, and every entry there needs a reason and a date.

**Function grant drift** (`=== FUNCTION GRANT DRIFT ===`, P1065): the RLS check above reads **policies** and is structurally blind to who may EXECUTE a function. That blindness is why P1063 — four RPCs reachable by unauthenticated callers on prod, each carrying a lockdown in its own migration that had never taken effect — was found by accident rather than by a gate. This check reads live EXECUTE privileges on both projects and diffs them against `scripts/anon-execute-allowlist.txt` (P1064).

Read the line it prints:

- `Function grants: clean` — report `✓ Function grants: clean`.
- `Function grants: N known-open` — the recorded backlog, unchanged. Report `✓ Function grants: N known-open (no change)`. **Do not re-litigate these daily** — they are in `.private/docs/security-log.md` and each needs its own spec.
- `FUNCTION GRANT DRIFT: N NEW ...` (capitalised) — **a function became reachable by an anonymous caller, or prod and test stopped agreeing on who may execute one.** This is the alarm. Surface the named signatures and offer to investigate now.
- `M guard(s) did not refuse anon` — functions that, invoked with no identity on test, returned instead of refusing. **This appears alongside exit 0 by design** and is the highest-signal half of the output: a finding only exists in the conjunction of a live anon grant and a non-refusing guard. Report the count. It is report-only because the probe passes NULL arguments and under-reports — never treat its silence as proof a guard is correct.
- `guard probe BLIND (not run)` — the probe could not tell refusal from success, so the guard half is **unverified**, not clean. Say so.
- `FUNCTION-GRANT-CHECK-DID-NOT-RUN (exit N)` — flag `⚠ Function grants: NOT checked this run` and never render it as clean.

**Read `function_grant_exit=N`, always printed** — `0` clean or backlog-unchanged · `1` NEW drift, the alarm · `2` did not run. Absent line = the wave did not complete; say the check is unverified rather than omitting the row. Note that `0` does NOT mean the guard probe found nothing — read the prose for that.

The backlog is `.private/function-grant-baseline.json` (gitignored — it names live unpatched functions). Not an allowlist: baselined findings still print on every full run. Only `scripts/anon-execute-allowlist.txt` marks an anon grant as deliberate, and every entry there needs a real anon call site as `file:line`.

**Ops issues** (`=== OPS ISSUES ===`): scheduled workflows alert via find-or-append GitHub issues instead of failure emails (P866 pattern — prod-health-smoke, check-deploy-drift, backup-staleness). An open "Deploy drift detected on prod" issue means a merged migration/function is not deployed — surface it with the fix command from the issue body and offer to resolve now (prod migrate = ALWAYS-ASK). An open "Prod health smoke" issue means a public route is erroring. An open "Backup stale or unverified" issue means the newest prod DB backup has no `.verified` marker or is >25h old — likely the daily backup workflow stopped running or was disabled; check `db-backup.yml`'s run history, surface the object name from the issue body, do NOT attempt a manual backup or restore inline (ALWAYS-ASK). No relevant open issue = healthy as of the last cron run (drift: daily 6am UTC; prod-health: 6-hourly; backup-staleness: daily 6:15am UTC). `OPS-ISSUES-CHECK-FAILED` or any gh stderr (rate limit, auth) = flag ⚠, don't report healthy, don't silently skip.

**b) Read goals** (1 Read call):
- `docs/goals.md`

#### Health output block

After all 3 waves, output:
```
HEALTH
  [✓/✗] Prod smoke
  [✓/⚠] Sentry       ← the explicit Wave 2a status line; SKIPPED must show here, never omitted
  [✓/⚠] Mixpanel     ← the explicit Wave 2b status line; "not called (no users)" ≠ "SKIPPED (failed)"
  [✓/⚠] Sessions
  [✓/⚠] Ops issues (drift / prod-health alerts)
  [✓/⚠] RLS drift    ← known-open counts are ✓; any NEW finding is ⚠ and names the policy.
                        "NOT checked" (exit 2 / no output) must show here, never omitted.
  [✓/○/⚠] Agent VM   ← from /slava:util:agent-vm-health (step 5); printed
                        verbatim and in full, never omitted, never a prompt.
                        Healthy is one line; a problem may run to three.
  [user activity summary line]
  [nothing if cloud ok / ⚠ per issue]
```

---

### 2. Reflection (since last /day)

This section looks backward at what happened since `$SINCE`. Gather data, then synthesize.

**2a. Gather**

Use the git log, activity log, KDD check, and CLAUDE.md change data already collected in Wave 1 (no additional tool calls needed).
If CLAUDE.md/rules were changed (per Wave 1 output), spawn a single `/slava:maintain:claude-md` subagent (`model: "sonnet"`). Get: VALID / NEEDS REVISION + recommendation.
**Delivery:** a background subagent's reply is silently lost, and a lost verdict here reads as
VALID. Have it **Write** the verdict + recommendation to a parent-supplied scratchpad path and also
reply; read the **file**. No file ⟹ the check did not run — report that, never a pass.

**2b. KDD reminder check**

Scan git log since `$SINCE` for commits touching:
- `supabase/migrations/`
- `.env.local`, `.env.prod`, `.env*`
- `.mcp.json`, `mcp-*.json`
- `.claude/rules/`, `CLAUDE.md`
- `scripts/` (new or significant rewrites)
- `docs/technical/`

If infra-touching commits exist AND no KDD capture since last run → include KDD REMINDER in output.

**2c. Synthesize and output**

**Language rules (critical):**
- Translate into user value and business impact. Never use ticket numbers (P413), engineering terms (RLS, schema, migration, e2e), or internal jargon.
- "P413 closed" → "users can now see how calibrated their communication is"
- "RLS locked down" → "your data is private"
- If something shipped with no user-facing impact: describe what it enables or protects.

Output — bullet-driven, tight, no padding:
```
SINCE LAST /day ([N hours ago] · [N commits])
• [what users can do now — one line each]
• [designs, plans count as real work]
• [infra/reliability: what it protects]

BUSINESS  (skip if nothing moved)
• [progress toward pilot / milestone gate]

INSIGHT  (skip if nothing real)
• [one thing learned about users, product, or yourself]

CHALLENGE  (skip if nothing real)
• [real obstacle — what it revealed]

ATTENTION  (skip if <2 status checks or nothing notable)
• [attention shifts, persistent blockers]

AGENT CONFIG  (skip if CLAUDE.md/rules unchanged)
• [what changed — plain English]
• /slava:maintain:claude-md verdict: VALID ✅ / NEEDS REVISION ⚠️

METRICS  (skip if no signups and no sentry issues)
• [N new signups since last /day]
• [N new Sentry issues since last /day]

KDD REMINDER  (skip if no uncaptured infra work)
• [what was touched]
• Run `/kdd` to capture before context is lost.

TOMORROW
→ [one clear next move + why it matters now]
```

If git log is empty: "No commits since last /day." Reflect on non-code work from KDD/milestone reads.

---

### 3. Goals & Milestone

**Primary source: `docs/goals.md`**

1. Read `docs/goals.md`
2. **Auto-crossout**: For each `[ ] P<N>` in Next Steps, check if the spec is done:
   - File exists in `features/done/` (any subfolder): mark `[x]`
   - File exists in `features/` with `status: done` or `status: all-done`: mark `[x]`
   - File exists in `features/archive/` with `status: rejected`: mark `[x]` and append `(rejected)`
   If any items were crossed out, edit `docs/goals.md` silently (no confirmation needed).
3. Parse `## Next Steps` — identify `[ ]` (not done) vs `[x]` (done)
4. Show max 5 upcoming (not done). Never show done items.
5. Parse `## Dos` and `## Don'ts` — compact reminders.
6. **If none of `## Next Steps`, `## Dos`, `## Don'ts` exist in the file, do NOT print an empty WHAT'S NEXT block.** Print instead:
   `WHAT'S NEXT: unavailable — docs/goals.md has no Next Steps/Dos/Don'ts sections (found: <list the ## headings that ARE there>). The parser and the doc have drifted.`
   An empty block reads as "nothing queued"; the two states must not look alike. Same signal the kanban Goals page returns as `structureNotFound` (`tools/kanban/server/api.ts`, `/api/goals-strategic`).

```
WHAT'S NEXT (from goals.md):
  → [step N] [text]       ← immediate next
  ○ [step N+1] [text]
  ○ [step N+2] [text]

DO: [comma-separated one-liners]
DON'T: [comma-separated one-liners]
```

---

### 4. Branch Status

Use the branch, stranded spec, and stash data already collected in Wave 1 (no additional tool calls).

Output:
```
BRANCHES
  main: [N commits ahead / clean and in sync]
  feature/pN-name  ← [ready to /ship? / in-progress / no spec — stale?]
```

Rules: delivery_stage uat + branch → "ready to /ship?". uat + branch gone → "/ship pN spec-only". in-progress → "in-progress". No spec → "stale?"

**4c. Stash check:**
```bash
git stash list
```
If non-empty, print all entries (max 10; if more, note "N more — run `git stash list` to see all"):
```
⚠ STASHES (invisible to git status — address before starting work):
  · stash@{0}: [message]
```
Note: stash message includes the branch it was created on — apply only if you are on that branch.

Ask: "Apply, drop, or continue?" Wait for response.

---

### 5. Cloud Server Check (information only — never prompts, never suggests)

**Invoke `/slava:util:agent-vm-health` via the Skill tool** and print what it
returns in the HEALTH block, **verbatim and in full**. That skill owns the
details; this step owns nothing but the call and the placement.

A healthy result is one line. A problem result may be two or three sentences —
the extra ones carry how long the fault has been open and whether it will clear
itself, which is the part that decides whether you act now or later. Do not
summarise, truncate to the first sentence, or reformat.

**Do not suggest stopping the VM. Do not ask whether to stop it. Do not mention
the idle cost.** Until 2026-08-06 this step prompted *"clarity-agent is still
running (~$3/day idle). Stop it?"* every run. Two things were wrong with it:
answering "yes" silently killed a long-running workload on that VM, and a daily
yes/no about the same €3 is nagging, not information. The founder asked for the
state and nothing else — a running VM is usually deliberate.

**Never go silent on TERMINATED or on a gcloud failure.** The old step printed
nothing in both cases, which made "stopped", "unreachable", and "fine" all look
identical — the exact ambiguity this step now exists to remove. Three states,
three distinct lines, always one of them:

```
✓ Agent VM: healthy (autoheal 6m ago)
○ Agent VM: stopped — the workload is not running.
⚠ Agent VM: status unknown (gcloud failed) — NOT checked.
```

If `/slava:util:agent-vm-health` is not available, print
`⚠ Agent VM: NOT checked — /slava:util:agent-vm-health missing` and move on.
Never render an unchecked VM as healthy.

---

### 6. Save to Memory (auto, no confirmation)

After all output, silently:
- If INSIGHT is substantive → append to relevant topic file in memory dir
- If CHALLENGE reveals a recurring pattern → add to MEMORY.md
- If new tool/script/workflow discovered → add to relevant memory section
- Do NOT save trivial observations

---

### 7. Write Timestamp — moved

Runs last now, as **Step 10**. It sat here, before Step 8, so a run that dropped
Step 8 still advanced the marker and left no trace of the drop (2026-08-13).

Moved, **not gated**: the marker is written unconditionally at the end regardless of
what Step 8 reported. It is the reflection window and nothing else — `$SINCE` drives
git log, Sentry deltas, signups, Mixpanel and spend, so withholding it on a calendar
failure would pin `$SINCE`, the floor rule would then truncate every window to 6am
today, and yesterday's data would never be reported by any run. "The calendar is
verified" is carried by the push receipt (Step 8), not by this file. One file, one
meaning.

---

### 8. CM Events Calendar Refresh (always, inline)

**Always invoke `/slava:util:cm-events-update` in THIS conversation via the Skill tool.** This is unconditional — do not decide whether to run it, do not gate it on anything, always invoke. The skill's own `state.json` `last_run` gate no-ops the expensive Beeper refresh if it already ran today, so invoking is always cheap and safe.

**Never spawn it as a subagent.** cm-events is browser-mediated — it needs the claude-in-chrome MCP, Beeper Desktop (`localhost:23373`), and the gcloud `beeper-digest` config. Subagents have **no MCP access** (`.claude/rules/skills.md`), so a spawned subagent fails silently and the calendar never updates. *(The disk-access half of the old wording was false and was removed 2026-07-30 — subagents can read files. MCP is the binding constraint here, and it alone is sufficient.)* It must run inline in the main conversation where those tools live.

Announce before invoking: *"cm-events: refreshing the CM Events calendar now."* If Beeper Desktop is closed the skill pauses and warns — surface that to the founder, never silently skip.

**Relay the pipeline's final `[concerns]` block verbatim** — impossible times, a person's name published as a venue, self-contradicting entries. Every run, including a clean one. A check whose output nobody repeats is a check that does not exist (2026-08-23); the block is printed last precisely so it is the thing still on screen when the run ends.

**8a. Beeper token pre-flight — run this BEFORE invoking cm-events:**

```bash
python3 ~/Projects/private/personal/beeper-digest/scripts/beeper_token_status.py
```

The Beeper OAuth token has a ~29-day TTL. On 2026-07-29 it lapsed and **nothing noticed for 6 days** — `/day` kept publishing a stale triage report while the CM Events calendar silently stopped updating. The pipeline's own check fires only after it starts work and cannot tell "token lapsed" from "app closed". This pre-flight runs first and is the fix.

Run it **without** `--read-only` here: this is the one invocation that heals the
repairable case (keychain token valid, `.env` out of sync) and appends to the TTL
observation log. `day-gates.sh` probes the same script with `--read-only`, so those
side effects happen once a run, not on every status read.

Branch on the exit code — the wording matters, because a lapsed token and a closed app look identical downstream:

| Exit | Meaning | What /day does |
|---|---|---|
| 0 | valid (or self-healed from keychain) | proceed to cm-events normally |
| 1 | EXPIRING | proceed to cm-events normally |
| 2 | EXPIRED | **skip cm-events entirely** (it would only abort), then run the Step 8b gate |
| 3 | UNKNOWN (no keychain entry) | skip cm-events, then run the Step 8b gate |

**Do not compose the warning yourself.** `day-gates.sh` D4 reads the same exit code
and emits the `⚠ CM EVENTS: NOT REFRESHED` block and the reconnect instruction as
script output. That is the whole point: the loud line is emitted by something that
cannot forget to emit it. Your job here is only the branch — run cm-events, or don't.

**Renewal cannot be automated — do not try, and do not promise it.** Verified 2026-08-04: the keychain entry carries **no `refreshToken`**, and the local authorization server advertises `grant_types_supported: ["authorization_code"]` only — `GET /oauth/authorize` returns an HTML consent page requiring a human click. Driving that click with browser automation would forge a consent grant; that is out of bounds for a daily background job. The script self-heals only the genuinely repairable case: keychain token still valid but `.env` out of sync (the normal post-reconnect state).

**Do not diagnose a Beeper 401 by curling `/v1/info`** — that endpoint is unauthenticated and returns 200 with a dead token. The real probe is `/v1/chats?limit=1`, which is what `digest.py` validates against.

**8b. Prove it — run this AFTER cm-events returns (and also on the 8a skip paths):**

```bash
cd "$(git rev-parse --show-toplevel)" && ./scripts/day-gates.sh --mode=verify
```

**Relay its stdout verbatim and in full.** Never write a `✓ CM Events: refreshed`
line of your own — not as a summary, not as a paraphrase, not "in addition to" the
script output. If the script did not print `CALENDAR: VERIFIED`, the calendar is not
verified, whatever the cm-events transcript looked like.

**Pass `--mode=verify` explicitly, and check the verdict says `(mode=verify)`.** Step 0d
runs the same script with a 36h window; re-relaying *that* block here would show a
verdict for a push that could be a day and a half old. The mode is printed in the
verdict line precisely so this is visible to whoever reads the report.

**A `/day` report with no `── CM EVENTS VERDICT ──` block in it is defective**, whatever
else it contains. Not "the calendar was fine" and not "nothing to report" — the block is
missing, which means this step did not run. Say that plainly rather than omitting the
section, and run the script.

It reads four artifacts and decides: the push receipt `tmp/last-push.json` is fresh
**and its stamp moved since Step 0d** (D1), the push reached the calendar and ran a
full refresh (D2), each browser-scraped source's cache is within cadence and above its
floor (D3), and the Beeper token (D4). All four were previously things this skill
*asserted*. `Push complete:` prints unconditionally after the push loop, so
`0 created, 0 skipped, 60 failed` reads exactly like a healthy run to anyone grepping
the log — D2 is the check that tells them apart.

On a clean run this collapses to a single `checks passed:` line. That is deliberate:
eleven near-identical lines twice a day is how a reader learns to skip the block. Any
WARN or FAIL prints in full.

Run it on the 8a skip paths too. A run that never reached the calendar still owes the
founder a verdict, and D1 will say how stale the calendar now is.

---

### 8.5. Personal Triage Surface (always, inline — read-only)

After the cm-events refresh, surface the day's personal Beeper triage so the founder sees who came up, what's worth a reply, and any help/job leads — without opening Beeper. **Read the existing report, don't re-scrape** (cm-events already refreshed the Beeper data this run; re-running the digest here would double the work).

Read the most recent report at `~/Projects/private/personal/beeper-digest/reports/<YYYY-MM-DD>.md` (today's; if only an older file exists, read the newest and state its date — the data is stale). Surface ONLY these three sections inline, compact:

- **🔔 You came up** — every hit (rare; always show).
- **💬 Worth engaging** — top items with their suggested replies.
- **🤝 Help & matchmaking** — unanswered help requests, connect opportunities.

Skip 📅 events (already on the calendar via Step 8) and 📍 what's happening (ambient, not actionable). If all three sections are empty, say so in one line. This is read-only — the founder replies in Beeper himself; never send anything.

**📣 Replies to your event posts** (always, inline — read-only). The founder posts events into group chats via `/slava:events:promote-groups`, which records every posted group in `~/.private/event-state/*.groups.json` (each row: `chatID`, `name`, `posted_at`, `status`). These posts go out *as the founder*, so replies and questions ("what time?", "is it hard?", "can I bring a friend?") land in those groups and are easy to miss.

For **every** event (any type, not just hikes), read all `*.groups.json` state files, and for each group row with `status: "sent"` **and** `posted_at` within the **last 7 days**:

1. Load Beeper MCP (see Step 8's transport note — needs the inline claude-in-chrome/Beeper setup; skip with a one-line warning if Beeper Desktop is closed).
2. `list_messages` for that `chatID`, filtered to messages **after `posted_at`** (parse both as ISO timestamps — do not compare as raw strings) from senders **other than the founder's own account** (exclude the Beeper `me`/self sender — the same self identity Step 8 uses — else the founder's own posted blurb reads as a "reply").
3. Surface any that reference the event or reply to the post — group name + the message + a suggested reply.

Show as a compact list grouped by event. If no posted groups in the window, or no replies, say so in one line. **Read-only — never auto-reply; the founder responds in Beeper himself.**

---


### 9. Due Board (auto-runs the most-overdue review — P900)

Runs last of the reporting steps — after Step 8's calendar refresh, so a `/day` always delivers its daily output first and a long review never defers it. (Only Step 10's one-line timestamp write follows it.) Overdue reviews are **auto-run, not printed as commands** (P900: printed commands never got copy-pasted; reviews didn't happen). Control is preserved via a conversational "skip", not a y/n gate.

Read the *existing* markers and compute overdue rows (no new files):

```bash
TODAY_EPOCH=$(date +%s)
WK=$(grep "^date:" ~/.claude_weekly_last_run 2>/dev/null | awk '{print $2}' | tr -d '[:space:]')
MO=$(grep "^date:" ~/.claude_monthly_last_run 2>/dev/null | awk '{print $2}' | tr -d '[:space:]')

# weekly: overdue if >7d (prints days past threshold for most-overdue comparison)
if [ -z "$WK" ]; then
  [ -f ~/.claude_weekly_last_run ] || echo "WEEKLY: never run"
else
  WK_EPOCH=$(date -j -f "%Y-%m-%d" "$WK" +%s 2>/dev/null || date -d "$WK" +%s 2>/dev/null)
  if [ -n "$WK_EPOCH" ]; then
    WK_DAYS=$(( (TODAY_EPOCH - WK_EPOCH) / 86400 ))
    [ "$WK_DAYS" -gt 7 ] && echo "WEEKLY: last $WK ($WK_DAYS d ago) OVERDUE by $(( WK_DAYS - 7 ))d"
  fi
fi

# monthly: overdue if >28d
if [ -z "$MO" ]; then
  [ -f ~/.claude_monthly_last_run ] || echo "MONTHLY: never run"
else
  MO_EPOCH=$(date -j -f "%Y-%m-%d" "$MO" +%s 2>/dev/null || date -d "$MO" +%s 2>/dev/null)
  if [ -n "$MO_EPOCH" ]; then
    MO_DAYS=$(( (TODAY_EPOCH - MO_EPOCH) / 86400 ))
    [ "$MO_DAYS" -gt 28 ] && echo "MONTHLY: last $MO ($MO_DAYS d ago) OVERDUE by $(( MO_DAYS - 28 ))d"
  fi
fi
```

**Render rules:**
- Show a row ONLY if it's overdue (or never-run). A not-due review is omitted — keeps the board quiet.
- **Fresh-machine guard:** if a marker file is absent, the script emits `never run`; render it as `never run → consider running`, not a loud OVERDUE, and do NOT auto-run it. If BOTH weekly and monthly markers are absent (no output at all), **suppress the board entirely** — this is a genuinely new setup, not stale reviews.

(cm-events is no longer part of this board — it is its own unconditional Step 8, run inline before the Due Board.)

Output (only the rows that apply):
```
DUE BOARD
  weekly    — last done Apr 11 (52d ago)  OVERDUE (>7d)   → running now
  monthly   — last done Mar 30 (64d ago)  OVERDUE (>28d)  → next /day run
```

If no rows apply: print nothing (no empty board).

**Auto-run rules (after rendering the board):**
1. **Max one review per `/day` run.** If both weekly and monthly are OVERDUE, run the one with more days past its threshold (the `OVERDUE by Nd` value) and name the other: "monthly is also overdue — it'll run on the next /day."
2. **Announce, then invoke** — no y/n gate:
   > weekly is Nd overdue — running it now. Say "skip" at any point to abandon it.
   Then immediately invoke the skill (`/slava:maintain:weekly` or `/slava:maintain:monthly`) in this conversation.
3. **Skip is conversational.** If the founder says "skip" during the review, stop it. Markers are written only on review completion (by the review skill itself), so a skipped or abandoned run stays overdue and resurfaces on the next `/day`.
4. **Never-run rows are not auto-run** (fresh-machine guard above) — offer only.

---

### 10. Write Timestamp (unconditional, and genuinely last)

```bash
date -u +"%Y-%m-%dT%H:%M:%SZ" > ~/.claude-day-last-run
```

Write it whatever Step 8b reported. This marker is the reflection window and nothing
more — see Step 7 for why gating it on the calendar would corrupt every other section
of the report. It moved here from slot 7 so it records a run that reached the end,
rather than one that reached Step 6.

---

## Event-to-Journey Mapping (Wave 2b reference)

Used by Phase 3 (Narrate) to translate Mixpanel event names into journey stages.

| Stage | Events | Narrative label |
|-------|--------|----------------|
| ARRIVAL | `landing_page_viewed`, `signup_page_viewed`, `about_page_viewed`, `sign_pledge_page_viewed` | "visited site" |
| SIGNUP | `signup_magic_link_sent`, `google_auth_initiated`, `profile_created`, `login_complete` | "signed up via [method]" / "logged in" |
| ONBOARDING | `profile_page_viewed` (own), `settings_page_viewed`, `welcome_dialog_shown` | "viewed profile" |
| CONTENT | `story_created`, `story_viewed`, `point_created`, `position_recorded`, `feed_tag_filtered` | "created story" / "took N positions" / "browsed feed" |
| LIVE | `live_session_created`, `live_session_joined`, `live_rating_submitted`, `live_session_completed` | "started /live session" / "completed session (N checks)" |
| SOCIAL | `agreement_create_success`, `share_link_copied`, `share_linkedin_clicked`, `witness_submitted` | "signed agreement" / "shared profile" |

**Skip in narrative** (noise events): `nav_*`, `pwa_*`, `live_state_drift_detected`, `audio_chunk_*`, `$mp_*` (Mixpanel autocapture), `$session_start`, `$session_end`

**Auth method detection** (from `profile_created` properties): `auth_method = 'google'` → "via Google OAuth", `auth_method = 'magic_link'` → "via magic link"

---

## Tone

- Direct. Warm. No fluff.
- Celebrate real progress, not effort theater.
- The goals section should feel like clarity + pull, not a to-do list.
- Total reflection output: ~15-20 lines. Dense and useful.
- Health + goals + branches: concise (~15 lines). Signup list exempt — show all.

## Notes

- Never show done steps in goals. Only what's coming.
- Only interactive prompts: open items (step 0), stash (step 4c). **Step 5 no longer prompts** — it reports the agent VM's state and nothing else (changed 2026-08-06; it used to ask whether to stop the VM, and "yes" silently killed a long-running workload). The Due Board auto-run (step 9) announces and proceeds — "skip" is conversational, not a prompt that waits.
- Run data gathering in sequential waves (Wave 1: local/git, Wave 2: Supabase+Sentry, Wave 2b: Mixpanel, Wave 2c: Signup Intel, Wave 3: lint/test+file reads). Max 2-3 tool calls per wave to prevent permission prompt floods.
- First run (no timestamp file): behaves like old /day-start with 24h lookback.
