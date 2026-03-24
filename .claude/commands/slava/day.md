---
name: day
description: Single daily skill — health checks, reflection on what shipped since last run, goals and branches forward. Replaces /day-start and /day-end.
when_to_use: Start of any work session, or end of day before closing laptop. Run instead of /day-start or /day-end.
version: 1.1.0
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

Write the new timestamp at the very end (Step 7).

---

## Steps

### 0. Open Items Check (run first)

Scan MEMORY.md at `/Users/slavochek/.claude/projects/-Users-slavochek-Projects-public-claritypledge/memory/MEMORY.md` for lines starting with `ACTION_NEEDED:`.

If file not found: `⚠ MEMORY.md not found — open items check skipped`, continue.

If any found:
```
⚠ OPEN ITEMS (from memory):
  · [item 1]
  · [item 2]
Address one before starting new work? Reply 'yes' to make it this session's first task, or send anything else to continue.
```
Wait for response. Yes → make it first task, skip remaining steps. Anything else → continue.

If none → silent.

---

### 0a. Setup Reminders

**a) Reset Whisper language to auto-detect**
```bash
rm -f ~/.whisper-lang
```
Silent.

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
```

Process Wave 1 results before proceeding.
Show: `✓ Prod smoke: all pass` or `✗ Prod smoke: N failed — [first failure]`
Flag cloud only if broken: Ghost non-200, backup >2d old.

**gcloud auth gate:** If output contains `GCLOUD_NOT_AUTHENTICATED`, stop and prompt:
> ⚠ gcloud is not authenticated. Run `! gcloud auth login` to authenticate, then say "done" to continue.

Wait for user response before proceeding to Wave 2. Cloud checks (VM status, backup age) and Step 5 (cloud server check) depend on gcloud.

#### Wave 2: Supabase + Sentry (2 calls max, parallel)

Run these two in parallel:

**a) Sentry MCP** — single call:
Use `mcp__sentry__search_issues`: org `22minds-llc`, project `javascript-react`, unresolved issues first seen since `$SINCE`. Also look for `live_state_update_failed` in results.
Fallback (if MCP unavailable): skip with `⚠ Sentry: MCP unavailable — check manually`
Show: `✓ Sentry: clean` or `⚠ Sentry: N new issues — [top title]`

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
curl -s "${PROD_URL}/stories?select=author_id,title,created_at&created_at=gt.${SINCE}&order=created_at.desc" -H "$H1" -H "$H2"

echo -e "\n=== POSITIONS ==="
curl -s "${PROD_URL}/point_positions?select=user_id,updated_at&updated_at=gt.${SINCE}&order=updated_at.desc" -H "$H1" -H "$H2"

echo -e "\n=== VERIFICATIONS ==="
curl -s "${PROD_URL}/story_verifications?select=speaker_id,listener_id,created_at&created_at=gt.${SINCE}" -H "$H1" -H "$H2"

echo -e "\n=== AGREEMENTS ==="
curl -s "${PROD_URL}/clarity_agreements?select=creator_profile_id,partner_profile_id,status,created_at&or=(created_at.gt.${SINCE},partner_signed_at.gt.${SINCE})" -H "$H1" -H "$H2"

echo -e "\n=== FUNNEL: PROFILES ==="
curl -s "${PROD_URL}/profiles?select=id&email=neq.test-agent@claritypledge.com" -H "$H1" -H "$H2" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?"

echo -e "\n=== FUNNEL: STORY AUTHORS ==="
curl -s "${PROD_URL}/stories?select=author_id" -H "$H1" -H "$H2" | python3 -c "import json,sys; print(len(set(x['author_id'] for x in json.load(sys.stdin))))" 2>/dev/null || echo "?"

echo -e "\n=== FUNNEL: POSITION USERS ==="
curl -s "${PROD_URL}/point_positions?select=user_id" -H "$H1" -H "$H2" | python3 -c "import json,sys; print(len(set(x['user_id'] for x in json.load(sys.stdin))))" 2>/dev/null || echo "?"

echo -e "\n=== FUNNEL: AGREEMENTS ==="
curl -s "${PROD_URL}/clarity_agreements?select=id&status=eq.active" -H "$H1" -H "$H2" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?"

echo -e "\n=== ORPHANED SESSIONS ==="
curl -s "${PROD_URL}/clarity_sessions?select=id,code,created_at,expires_at&joiner_name=not.is.null&expires_at=lt.${CUTOFF}&demo_status=neq.completed&order=expires_at.desc&limit=5" -H "$H1" -H "$H2"

echo -e "\n=== FUNNEL CSV ==="
mkdir -p "$(git rev-parse --show-toplevel)/.private/metrics"
```

Filter out `test-agent@claritypledge.com` from all results.

If response is a JSON object with `message` key (not array): `⚠ User activity: query failed — check PROD_SUPABASE_SERVICE_ROLE_KEY in .env.local`

Cross-reference: user IDs in activity but NOT in new signups = **returning users**.

Show:
```
USER ACTIVITY (since last /day)
  New:       N signups
    · Name (email) — HH:MM UTC → [what they did: story, N positions, pledge / "no activity ⚠"]
  Returning: N
    · Name — [what they did: N positions, story, /live verification]
  Funnel:    A → B → C → D  (+Δ/+Δ/+Δ/+Δ)
             signup  story  pos  agreement
```

Quiet period (no signups, no returning): collapse to `Users: no activity since last /day | Funnel: A → B → C → D`

**Optional daily CSV log** (append after computing funnel):
```bash
echo "$(date -u +%Y-%m-%d),${SIGNUPS},${STORY_USERS},${POSITION_USERS},${AGREEMENTS}" >> \
  "$(git rev-parse --show-toplevel)/.private/metrics/funnel-daily.csv"
```
If previous entry exists, show deltas in funnel line.

Show: `✓ Sessions: no orphans` or `⚠ ORPHANED SESSIONS: N sessions with joined users but no completion (possible deadlocks) — check Sentry for live_state errors`

#### Wave 3: Repo health + file reads (2-3 calls, after processing Wave 1-2)

**a) Repo health** (1 bash call):
```bash
cd "$(git rev-parse --show-toplevel)"
echo "=== LINT ==="
npm run lint 2>&1 | grep -c "error" || echo "0"
echo "=== TEST ==="
npm test -- --run 2>&1 | tail -5
```
Show: `✓ Repo baseline: clean` or `⚠ Repo baseline: N lint errors, M test failures — fix before starting new work`

**b) Read goals** (1 Read call):
- `docs/goals.md`

#### Health output block

After all 3 waves, output:
```
HEALTH
  [✓/✗] Prod smoke
  [✓/⚠] Sentry
  [✓/⚠] Sessions
  [user activity summary line]
  [nothing if cloud ok / ⚠ per issue]
```

---

### 2. Reflection (since last /day)

This section looks backward at what happened since `$SINCE`. Gather data, then synthesize.

**2a. Gather**

Use the git log, activity log, KDD check, and CLAUDE.md change data already collected in Wave 1 (no additional tool calls needed).
If CLAUDE.md/rules were changed (per Wave 1 output), spawn a single `/slava:maintain:claude-md` subagent. Get: VALID / NEEDS REVISION + recommendation.

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
• /claude-md verdict: VALID ✅ / NEEDS REVISION ⚠️

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

### 5. Cloud Server Check

Gather VM status during Step 1 health checks (parallel). Prompt here:

If clarity-agent is RUNNING:
> **clarity-agent is still running** (~$3/day idle). Stop it?

Wait for response. Yes → `gcloud compute instances stop clarity-agent --zone=<zone>`. No → continue.

If TERMINATED or gcloud unavailable → silent.

---

### 6. Save to Memory (auto, no confirmation)

After all output, silently:
- If INSIGHT is substantive → append to relevant topic file in memory dir
- If CHALLENGE reveals a recurring pattern → add to MEMORY.md
- If new tool/script/workflow discovered → add to relevant memory section
- Do NOT save trivial observations

---

### 7. Write Timestamp

```bash
date -u +"%Y-%m-%dT%H:%M:%SZ" > ~/.claude-day-last-run
```

---

## Tone

- Direct. Warm. No fluff.
- Celebrate real progress, not effort theater.
- The goals section should feel like clarity + pull, not a to-do list.
- Total reflection output: ~15-20 lines. Dense and useful.
- Health + goals + branches: concise (~15 lines). Signup list exempt — show all.

## Notes

- Never show done steps in goals. Only what's coming.
- Only interactive prompts: open items (step 0), stash (step 4c), cloud VM (step 5).
- Run data gathering in 3 sequential waves (Wave 1: local/git, Wave 2: Supabase+Sentry, Wave 3: lint/test+file reads). Max 2-3 tool calls per wave to prevent permission prompt floods.
- First run (no timestamp file): behaves like old /day-start with 24h lookback.
