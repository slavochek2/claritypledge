---
name: weekly
description: Weekly review - validate Claude context, flag stale docs, run evidence-based retro. Run when terminal reminds you.
when_to_use: "Weekly. When terminal reminds you or starting a new week."
version: 1.0.0
---

# Weekly Review

Context hygiene + evidence-based solo founder retrospective. Evidence first, questions after.

---

## Workflow

### 0. Determine Review Period

**Run this first** — everything else uses `$SINCE`.

```bash
# Get last run date, fall back to 7 days ago
LAST_RUN=$(grep "^date:" ~/.claude_weekly_last_run 2>/dev/null | awk '{print $2}' | tr -d '[:space:]')
if [ -z "$LAST_RUN" ]; then
  SINCE="7 days ago"
  DAYS=7
  echo "No prior run found — analyzing last 7 days"
else
  # Validate format before using (guard against corrupt state file)
  if echo "$LAST_RUN" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
    SINCE="$LAST_RUN"
    LAST_TS=$(date -j -f "%Y-%m-%d" "$LAST_RUN" +%s 2>/dev/null)
    if [ -z "$LAST_TS" ]; then
      SINCE="7 days ago"; DAYS=7
      echo "WARNING: Could not parse date '$LAST_RUN' — falling back to 7 days"
    else
      DAYS=$(( ( $(date +%s) - LAST_TS ) / 86400 ))
      echo "Last review: $LAST_RUN ($DAYS days ago)"
    fi
  else
    SINCE="7 days ago"; DAYS=7
    echo "WARNING: Malformed date in state file ('$LAST_RUN') — falling back to 7 days"
  fi
fi
```

Report the period at the top of the review: **"Review period: $LAST_RUN → today ($DAYS days)"**

If >14 days, note: "Overdue by $((DAYS - 7)) days — this covers a longer stretch."
If <5 days, note: "Short cycle — [N] days since last review."

---

### 1. Context Health (run in parallel)

```bash
# DB backup health — latest backup age and size
LATEST=$(gsutil ls gs://claritypledge-db-backups/ 2>/dev/null | sort | tail -1)
if [ -z "$LATEST" ]; then
  echo "BACKUP: ❌ NO BACKUPS FOUND"
else
  SIZE=$(gsutil stat "$LATEST" 2>/dev/null | grep "Content-Length" | awk '{print $2}')
  DATE=$(echo "$LATEST" | grep -oE '[0-9]{8}' | head -1)
  if [ -z "$DATE" ]; then
    echo "BACKUP: ⚠️  Could not parse date from: $LATEST"
  else
    DATE_EPOCH=$(date -j -f "%Y%m%d" "$DATE" +%s 2>/dev/null || date -d "$DATE" +%s 2>/dev/null)
    if [ -z "$DATE_EPOCH" ]; then
      echo "BACKUP: ⚠️  Could not parse epoch from date: $DATE"
    else
      DAYS_AGO=$(( ( $(date +%s) - DATE_EPOCH ) / 86400 ))
      if [ "$DAYS_AGO" -gt 2 ]; then
        echo "BACKUP: ⚠️  Last backup ${DAYS_AGO}d ago — check GitHub Actions: https://github.com/slavochek2/claritypledge/actions/workflows/db-backup.yml"
      elif [ -z "$SIZE" ] || [ "$SIZE" -lt 1000 ]; then
        echo "BACKUP: ❌ Last backup suspiciously small (${SIZE:-unknown}B) — may be corrupt"
      else
        echo "BACKUP: ✅ Last backup ${DAYS_AGO}d ago, ${SIZE}B"
      fi
    fi
  fi
fi

# Broken links in CLAUDE.md
/usr/bin/grep -oE '\[.*?\]\((src/[^)]+|docs/[^)]+|features/[^)]+|e2e/[^)]+|scripts/[^)]+|\.claude/[^)]+)\)' CLAUDE.md | \
  /usr/bin/sed 's/.*(\(.*\))/\1/' > /tmp/refs.txt
while IFS= read -r path; do [ ! -e "$path" ] && echo "MISSING: $path"; done < /tmp/refs.txt

# Size (use absolute path — wc not always in PATH in sandbox)
echo "CLAUDE.md: $(/usr/bin/wc -l < CLAUDE.md) lines"

# Rules files
/bin/ls .claude/rules/*.md 2>/dev/null

# Stale docs (>30 days) — use absolute path for find
/usr/bin/find docs/technical -name "*.md" -mtime +30 -exec /bin/ls -la {} \;
```

Flag if >300 lines. Flag stale docs with archive-or-update call.

---

### 2. Sentry Health

Use Sentry MCP (`mcp__sentry__search_issues`):
- Org: `22minds-llc`, Project: `javascript-react`
- Query: unresolved issues first seen since `$SINCE`

>10 events = investigate now. 5–10 = flag. <5 = note only.

---

### 2.1 Product Metrics (use curl — Supabase MCP is test-only, never prod)

Prod project: `besjtuodziykmjidubzw`. Use curl with `PROD_SUPABASE_SERVICE_ROLE_KEY` from `.env.local`. Run in parallel with step 2.

```sql
-- New signups this period (substitute $DAYS from step 0)
SELECT count(*) FROM profiles WHERE created_at > now() - interval '$DAYS days';

-- Total pledgers (all-time, sanity check)
SELECT count(*) FROM profiles WHERE has_pledged = true;

-- Live sessions completed this period (meaningful engagement)
SELECT count(DISTINCT code) FROM clarity_sessions
WHERE created_at > now() - interval '$DAYS days';
```

Surface in the output header as:
```
METRICS:  Signups: N this week (total pledgers: M) | Live sessions: N
```

---

### 2.1.1 Blog Subscribers (Ghost — runs in parallel with 2.1)

The blog newsletter runs on Ghost (`blog.claritypledge.com`), separate from Supabase. Report new **blog-origin** subscribers since `$SINCE`.

`/sync-ghost-members` also creates Ghost members from verified app users — those carry a recent `created_at`, so a raw "new members" count is inflated. Exclude any Ghost member whose email exists in Supabase `profiles` to isolate true blog signups — applied to BOTH the delta and the total. JWT auth pattern: see `/sync-ghost-members`. Requires `GHOST_ADMIN_API_KEY` + `PROD_SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

One Ghost fetch (`limit=all`) + one Supabase fetch; the delta and total are both derived in-memory. Ghost's API returns transient 502s / HTML error pages under load, so `getJSON` retries 5xx/429 with backoff and the whole step degrades to `skipped` rather than crashing the review.

```bash
set -a; source .env.local 2>/dev/null; set +a
SINCE_DATE=$(date -v-${DAYS}d +%Y-%m-%d 2>/dev/null || date -d "${DAYS} days ago" +%F)
node -e '
const crypto=require("crypto");
const [gid,gsec]=process.env.GHOST_ADMIN_API_KEY.split(":");
const gtok=()=>{const n=Math.floor(Date.now()/1000);const h=Buffer.from(JSON.stringify({alg:"HS256",kid:gid,typ:"JWT"})).toString("base64url");const p=Buffer.from(JSON.stringify({iat:n,exp:n+300,aud:"/admin/"})).toString("base64url");const s=crypto.createHmac("sha256",Buffer.from(gsec,"hex")).update(h+"."+p).digest("base64url");return h+"."+p+"."+s;};
const getJSON=async(url,headers,tries=3)=>{
  for(let i=0;i<tries;i++){
    try{
      const r=await fetch(url,{headers});
      if(r.ok) return await r.json();
      if(r.status<500 && r.status!==429) throw new Error("HTTP "+r.status);
    }catch(e){ if(i===tries-1) throw e; }
    await new Promise(s=>setTimeout(s,1500*(i+1)));
  }
  throw new Error("retries exhausted");
};
const since=process.argv[1];
(async()=>{
  const gj=await getJSON("https://blog.claritypledge.com/ghost/api/admin/members/?limit=all",{Authorization:"Ghost "+gtok()});
  const members=gj.members||[];
  const key=process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
  const pj=await getJSON("https://besjtuodziykmjidubzw.supabase.co/rest/v1/profiles?select=email",{apikey:key,Authorization:"Bearer "+key});
  const appEmails=new Set((Array.isArray(pj)?pj:[]).map(p=>(p.email||"").toLowerCase()));
  const blog=members.filter(m=>!appEmails.has((m.email||"").toLowerCase()));
  const newBlog=blog.filter(m=>(m.created_at||"")>=since);
  console.log("BLOG SUBS: +"+newBlog.length+" blog-origin since "+since+" (total blog-origin audience: "+blog.length+"; "+(members.length-blog.length)+" synced app users excluded)");
})().catch(e=>console.log("BLOG SUBS: skipped (Ghost API error: "+e.message+")"));
' "$SINCE_DATE"
```

Surface in the Evidence Picture as:
```
BLOG SUBS:    +N blog-origin this period (total blog-origin audience: M | N synced excluded)
```

If credentials are missing or the query errors after retries, the block prints `BLOG SUBS: skipped (Ghost API error: ...)` — note it and move on; do not treat it as a failed review.

---

### 2.2 SEO Pulse (Search Console, quick — run in parallel with 2.1)

Open Search Console at `https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Aclaritypledge.com` (or use `mcp__claude-in-chrome__navigate` if browser is available).

Check two things only:
1. **Impression trend** — is the 28-day total higher or lower than last period?
2. **Coverage errors** — any new "Error" or "Valid with warnings" in the Coverage report?

Surface in Evidence Picture as:
```
SEO:          Impressions: N this week (↑/↓ vs last period) | Coverage: ✅ clean / ⚠️ N errors
```

If Search Console is inaccessible, skip silently and note "SEO: skipped (no browser access)".

---

### 2.4.5 KDD Suppression Log Review

Read `~/.claude/kdd-suppressed-log.md` (created by `/kdd` and `/kdd-private` after the 2026-05-22 step 7 redesign).

If the file does not exist, output `KDD SUPPRESSION: no log yet — /kdd hasn't been called since redesign` and skip this step.

Scan entries since `$SINCE`. For each entry, count items in the `suppressed_at_*` arrays.

**Surface in Evidence Picture as:**

```
KDD SUPPRESSION: [N runs since $SINCE | M items suppressed | top category: X (Ncount)]
```

**Recalibration trigger:** if 4+ suppressed items in this period share the same category (e.g., 4+ candidates that all hit `suppressed_at_7.1_ev_gate` for the same kind of friction), surface a recalibration question in Step 5:

```
> "/kdd has suppressed N items in category X this period. Is the EV gate (upside ≥ 4 AND
>  confidence ≥ 3) calibrated correctly, or is this category systematically below the bar?
>  If the latter is a real friction, the threshold may need lowering for this category."
```

Otherwise: silent.

This is a 1-minute scan. Don't expand it. Purpose: the suppression log is the falsification mechanism for the EV gates — without periodic review, silent suppression is unfalsifiable.

---

### 2.5 Process Friction Review

Read `docs/process-learnings.md`. If the file does not exist, output `PROCESS DEBT: no tracking file yet` and skip this step.

Scan for entries with `Status: proposed`.

For each unresolved entry:
- If it's been proposed for 2+ weeks without action → flag it: "This fix has been sitting since [date]. Still worth doing?"
- If 2+ entries share the same root cause → that's a chronic pattern, not a one-off

Surface findings in the Evidence Picture (step 4) as:
```
PROCESS DEBT: [N proposed fixes — list them; or "none"]
CHRONIC:      [patterns appearing 2+ times — or "none"]
```

This is a 2-minute scan. Don't expand it. Purpose is surfacing what /kdd sessions flagged but never acted on.

---

### 2.6 Product Pulse (inline, fire in parallel with step 3)

```bash
# What changed in core product/strategy docs since $SINCE
# Use git log -p (not git diff "date"..HEAD — that form silently produces no output for date refs)
for f in docs/lean-canvas.md docs/philosophy.md README.md CLAUDE.md; do
  [ -f "$f" ] || continue
  CHANGES=$(git log --since="$SINCE" --oneline -- "$f" | wc -l | tr -d ' ')
  if [ "$CHANGES" -gt 0 ]; then
    echo "=== $f ($CHANGES commits) ==="
    git log --since="$SINCE" -p --follow -- "$f" 2>/dev/null | \
      /usr/bin/grep -E "^[+-]" | /usr/bin/grep -vE "^(---|\+\+\+|@@)" | head -40
  fi
done

# Last meaningful edit date for each (to catch docs drifting from reality)
for f in docs/lean-canvas.md docs/philosophy.md README.md; do
  [ -f "$f" ] && echo "$f: last changed $(git log -1 --format='%ar' -- $f)"
done
```

Read the diff output. Summarize in 1–3 bullets: what substantively changed (ignore formatting/typos). If no changes, check last-edit dates — if any core doc is >3 weeks untouched, flag it.

Surface in the Evidence Picture as:
```
PRODUCT PULSE: [what changed — 1-3 bullets; or "no changes (last edit: X weeks ago)"]
```

The purpose: distinguish deliberate evolution from silent drift. Don't expand — this is a 2-minute read.

---

### 2.7 Prompt Pattern Mining (subagent, runs in background)

Spawn a subagent (`model: "sonnet"`) in background while you continue to step 3. It scans session logs since `$SINCE` and returns skill gap candidates.

**Subagent prompt:**
```
Scan Claude Code session logs in /Users/slavochek/.claude/projects/-Users-slavochek-Projects-public-claritypledge/*.jsonl
for files modified since [SINCE date].

For each file, extract lines where role == "human" and content is conversational (skip tool results, system messages, skill content).

Cluster the messages by intent. Count frequency. Identify the top 5 patterns that:
- Appear 10+ times
- Have NO matching skill in .claude/commands/slava/ (check by grepping for the intent)
- Or have a skill that exists but is being bypassed (user types the intent informally instead of using the command)

Return ONLY:
- Pattern name (3-5 words)
- Frequency (approximate count)
- Sample prompt (1 real example)
- Gap type: MISSING_SKILL | SKILL_EXISTS_BUT_BYPASSED | SKILL_NEEDS_IMPROVEMENT
- One-line recommendation

Max 5 candidates. No preamble.
```

Merge the subagent result into the Evidence Picture (step 4) as:
```
SKILL GAPS:   [N candidates — name (Nx), gap type] → act / defer / skip
```

If no gaps found: `SKILL GAPS: none detected`

---

### 2.9 Analytics Snapshot (invoke /slava:maintain:analytics)

Run `/slava:maintain:analytics` and incorporate its output into the Evidence Picture.

This handles: Mixpanel session check → login if needed → Supabase user health → Mixpanel board metrics.

---

### 2.9.1 Mixpanel Event Audit (subagent, runs in background — parallel with 2.7 and 2.8)

Spawn a subagent (`model: "sonnet"`) in background while you continue to step 3.

**Subagent prompt:**
```
You are a Mixpanel event auditor. Look at git commits from the last 7 days:
[run: git log --oneline --since="7 days ago" --no-merges in /Users/slavochek/Projects/public/claritypledge]

For each commit that looks like a new feature (not fix/chore/docs):
1. Read the changed files to understand what was built
2. Check if analytics.track() calls were added in those files
3. Check if docs/technical/analytics.md was updated
4. Flag any features that should have events but don't

Output format — be concise, no preamble:
**New features this week:** [list or "none"]
**Has events:** [list or "none"]
**Missing events (action needed):** [list or "none"]
**Recommendation:** [specific events to add with key properties, or "none needed"]
```

Merge into Evidence Picture (step 4) as:
```
MIXPANEL:     Features: N | Has events: N | Missing: [list or "none"]
```

If no feature commits this week: `MIXPANEL: no new features — nothing to audit`

---

### 2.10 Privacy Scan (subagent, runs in background — parallel with 2.7 and 2.8)

Spawn a subagent (`model: "sonnet"`) to scan docs changed this week for PII and sensitive content that the pre-commit hook may have missed.

**Subagent prompt:**
```
You are a privacy auditor. Run /slava:maintain:privacy on docs changed in this repo since [SINCE date].

Repo: /Users/slavochek/Projects/public/claritypledge

Steps:
1. Run: git log --since="[SINCE]" --name-only --pretty="" -- "docs/" ".claude/commands/" "CLAUDE.md" "README.md" "features/" | sort -u
2. Filter to public files only (exclude .private/, .env*, gitignored paths).
3. Read each file and flag:
   - HARD: personal email addresses (non-project), phone numbers, passwords, tokens, personal usernames
   - SOFT: private business strategy, personal struggles, negative opinions about named people, unannounced decisions
4. Return findings concisely — file, what was found, category (hard/soft), suggested action.
5. If nothing found: "Privacy: ✅ no issues in [N] docs scanned"
```

Merge into Evidence Picture as:
```
PRIVACY:      ✅ clean (N docs) / ⚠️ [N findings — hard/soft breakdown]
```

If hard flags found: surface them in Questions as "Privacy issue in [file] — fix before next commit."

---

### 2.8 Code Health Scan (subagent, runs in background — parallel with 2.7)

Spawn a subagent (`model: "sonnet"`) in background while you continue to step 3.

**Subagent prompt:**
```
You are a code quality analyst. Run these checks in the repo at /Users/slavochek/Projects/public/claritypledge and return a brief health report. Do NOT fix anything — scan only.

1. **TypeScript**: run `npx tsc --noEmit 2>&1 | tail -5` — report error count (0 = ✅)
2. **Lint warnings**: run `npx eslint src --max-warnings 9999 2>&1 | grep "warning" | wc -l` — report count
3. **eslint-disable comments**: run `grep -r "eslint-disable" src --include="*.tsx" --include="*.ts" -l | wc -l` — report file count; also flag any added since last git tag: `git diff HEAD~7..HEAD -- src/ | grep "^+.*eslint-disable" | grep -v "^+++" | wc -l`
4. **Untested source files**: count .ts/.tsx files in src/app/ that have no corresponding test file: `comm -23 <(find src/app -name "*.tsx" -o -name "*.ts" | sed 's|src/app/||' | sort) <(find src/tests -name "*.test.*" | sed 's|src/tests/||;s|\.test\.[^.]*||' | sort) | wc -l`
5. **Bundle size**: run `npx vite build 2>&1 | grep "dist/assets" | awk '{print $3}' | sort -h | tail -3` — flag any chunk >500kB

Return ONLY:
- TS_ERRORS: N
- LINT_WARNINGS: N
- ESLINT_DISABLES: N files (N new this week)
- UNTESTED_FILES: N
- LARGE_CHUNKS: [list chunks >500kB or "none"]
- VERDICT: ✅ healthy / ⚠️ watch / ❌ needs attention

No preamble. If a command fails, skip it and note "skipped".
```

Merge into Evidence Picture (step 4) as:
```
CODE HEALTH:  TS: N errors | Lint: N warnings | eslint-disables: N files (N new) | Untested: N | Chunks: [list or "clean"]
```

If verdict is ❌: add to questions "Code health degraded — worth a fix session this week?"

---

### 2.11 Ops Email Triage (subagent, runs in background — parallel with 2.7, 2.8, 2.9.1)

Spawn a subagent (`model: "sonnet"`) in background to check `ops@claritypledge.com` and surface only emails that need a decision or action.

**Subagent prompt:**
```
You are an email triage assistant for ops@claritypledge.com.

Repo: /Users/slavochek/Projects/public/claritypledge

Step 1 — fetch all unread email headers:
Run: node scripts/read-ops-email.mjs --unread
Returns From, Subject, Date for every unread message.

If output is "📭 No unread emails": return "OPS EMAIL: ✅ inbox clear" and stop.

Step 2 — decide whether to fetch bodies:
Fetch bodies if ANY email header has:
- A human-looking sender (not noreply@, no-reply@, notifications@, mailer@, or known SaaS domains like github.com, stripe.com, vercel.com, sentry.io, supabase.io)
- OR a subject that isn't clearly a system notification/receipt (e.g. not "Your invoice", "Verification code", "Password reset", "[GitHub]", "Delivery notification")

If bodies needed:
Run: node scripts/read-ops-email.mjs --unread --body --mark-read
(Fetches full bodies AND marks all unread as read in one connection.)

If bodies NOT needed (all obvious FYI/SPAM):
Run: node scripts/read-ops-email.mjs --unread --mark-read
(Just marks as read.)

Step 3 — classify each email:
- ACTION_NEEDED: requires a reply, payment, registration decision, or external action by Slava
- DECISION: Slava must decide something (pricing, partnership, account, policy)
- FYI: informational, no response needed (receipts, confirmations, newsletters, auto-notifications)
- SPAM: unsolicited, no relevance

Step 4 — return ONLY ACTION_NEEDED and DECISION items.

Output format (no preamble):
**OPS EMAIL TRIAGE**
ACTION_NEEDED:
- [From] | [Subject] | [Date] | [1-line: what action is needed]
DECISION:
- [From] | [Subject] | [Date] | [1-line: what decision is needed]
FYI: N suppressed
SPAM: N suppressed

If all suppressed: "OPS EMAIL: ✅ nothing actionable (N unread processed)"
```

Merge into Evidence Picture (step 4) as:
```
OPS EMAIL:    [N actionable — list subjects; or "✅ nothing actionable (N total)"]
```

---

### 2.13 Efficiency Scan (runs in background with other background steps)

```bash
python3 scripts/scan-transcript-efficiency.py --days 7 --verify-baseline
```

Report lands in `.private/reports/efficiency/<today>.md` (gitignored). Review the P3 spot-check sample (§3 of the report) to judge quality before drawing conclusions.

**Thresholds for action:**
- P3 raw count > 2× previous baseline AND manual spot-check confirms >50% genuine → investigate top 3 offender sessions, identify the skill origin (check session hotlist), then consider a targeted skill-level edit (not a CLAUDE.md rule).
- P1 raw count rising across 2+ scans → duplicate Read pattern is getting worse; consider flagging the top offender sessions.
- Any pattern: stable or declining → no action needed; note in Evidence Picture.

Surface in Evidence Picture as:
```
EFFICIENCY:   P1=N P2=N P3=N P5=N | vs last week: ↑/↓/— | FP rate: N% (spot-check)
```

If script errors: `EFFICIENCY: skipped (script error)`.

---

### 2.12 GCP Spend (invoke /slava:maintain:gcp-spend — runs in background with 2.7, 2.8, 2.9.1)

Run `/slava:maintain:gcp-spend` and incorporate its output into the Evidence Picture.

This handles: gcloud resource inventory → cost estimate → optimization flags.

Surface in Evidence Picture as:
```
GCP SPEND:    $XX/week (~$XXX/mo, XX% of €400 budget) | Credits: ~$XX,XXX left (~XXX months)
INFRA FLAGS:  [optimization opportunities or "none"]
EFFICIENCY:   P1=N P2=N P3=N P5=N | vs last week: ↑/↓/— | FP rate: N% (spot-check)
```

If gcloud auth fails: `GCP SPEND: skipped (auth unavailable)`.

---

### 3. Evidence Gathering (fire in parallel with steps 1 and 2.6 — all three are independent)

```bash
# Activity log for this period (timeline of /status checks)
# Use SINCE_DATE (always a YYYY-MM-DD) — $SINCE may be "7 days ago" and breaks awk string comparison
SINCE_DATE=$(date -v-${DAYS}d +%Y-%m-%d 2>/dev/null || date -d "${DAYS} days ago" +%F)
[ -f .private/logs/activity.log ] && \
  awk -F'|' -v since="$SINCE_DATE" 'substr($1,1,10) >= since' .private/logs/activity.log || \
  echo "Activity log: not found"
# From the log lines above, derive:
# - Total lines = N status checks
# - P-numbers appearing in active: field across entries spanning 2+ calendar days = WIP >2 days
# - Keywords in blocked: field appearing in 3+ entries = recurring blockers

# Commits (use $SINCE from step 0)
git log --since="$SINCE" --oneline --no-merges

# Features shipped
git log --since="$SINCE" --diff-filter=A --name-only --pretty="" -- 'features/done/'

# Features created (new specs)
git log --since="$SINCE" --diff-filter=A --name-only --pretty="" -- "features/p*.md" | grep "\.md$"

# Strategy docs touched
git log --since="$SINCE" --name-only --pretty="" \
  -- "docs/hypotheses.md" "docs/lean-canvas.md" "docs/decisions.md" \
     "docs/philosophy.md" "CLAUDE.md" ".claude/" | sort -u

# Repeated fix areas (same scope fixed 2+ times = smell; refactors excluded)
git log --since="$SINCE" --oneline --no-merges | grep -iE "^[a-f0-9]+ fix" | \
  sed 's/^[a-f0-9]* //' | sort | uniq -c | sort -rn | head -10

# (Last run commitment — read the file internally, do NOT echo it to terminal;
#  it already appears in the Kanban Goals view)
# Just note whether the file exists:
[ -f ~/.claude_weekly_last_run ] && echo "Commitment file: found" || echo "Commitment file: none"
```

> **Agent note:** Read `~/.claude_weekly_last_run` with the Read tool — do not print its raw contents to the terminal. Incorporate the commitment into the evidence picture silently.

---

### 4. Evidence Picture

Present this before asking anything. For LAST WEEK: read the saved commitment verbatim, then ask: "Did you do this? Yes / partial / no — one word." Wait for the answer before proceeding.

```
SHIPPED:      [N features — list titles]
CREATED:      [N new specs — list titles]
COMMITS:      [N total — split by type: feat/fix/chore/docs/refactor]
STRATEGY:     [docs touched or "none"]
SMELLS:       [areas fixed 2+ times — scope only, not count; or "none"]
ACTIVITY LOG: [N /status checks | WIP active >2 days: list or "none" | Recurring blockers: list or "none" | or "no log yet"]
LAST WEEK:    [paste saved commitment] → [founder's yes/partial/no]
USER CONVOS:  [cannot be detected from git — ask now: "How many real user conversations this week? Names if any."]
GCP SPEND:    [$XX/week, ~$XXX/mo | credits: ~$XX,XXX | flags: list or "none"]
PROCESS DEBT:  [N proposed fixes from process-learnings.md — or "none"]
CHRONIC:       [patterns appearing 2+ times — or "none"]
PRODUCT PULSE: [what changed in lean-canvas/philosophy/README/CLAUDE.md — or "no changes (X weeks)"]
USERS:         [total / verified / unverified / new this week — or "query failed"]
BLOG SUBS:     [+N blog-origin this period | total blog-origin audience M | N synced excluded — or "skipped"]
MIXPANEL:      [features audited / has events / missing — or "no new features"]
SEO:           [impressions trend + coverage errors — or "skipped"]
OPS EMAIL:     [N actionable — subjects; or "✅ nothing actionable (N total)"]
```

Collect the user conversation answer before moving to questions. Zero = flag immediately in the evidence table.

Then compute these signals:

| Signal | What it reveals |
|--------|----------------|
| **feat vs chore ratio** | High chore = tooling/meta-work week, low product |
| **specs created > shipped** | Backlog growing faster than execution |
| **strategy docs touched** | Decisions re-opened — settling or drifting? |
| **repeated fix areas** | Patching symptoms not root causes |
| **zero user conversations** | Builder's refuge. Building is safe. Selling is where the loop breaks. Flag this explicitly — do not soften it. |
| **last week commitment missed** | Pattern of commitments that don't bind. Name it: "This is the second/third time." |

---

### 5. Retrospective Questions

Show the evidence picture first. Then ask — **evidence-derived questions first, then the 4 mandatory ones.** Never skip the mandatory ones.

#### Evidence-Derived (pick 1–2 based on what you found)

- High chore ratio → "Most commits were chores/tooling. Was that intentional investment or meta-work avoidance?"
- Specs created >> shipped → "You created [N] specs but shipped [M]. Is the backlog growing because priorities are unclear, or because you're scoping before validating?"
- Same area fixed 3x → "You touched [area] [N] times. Is there a root cause being patched instead of fixed?"
- Strategy docs changed → "You reopened [doc] — is that decision now settled, or still drifting?"
- Product pulse has changes → "The product framing shifted: [summary]. Was that driven by new evidence, or did something feel off and you adjusted the words?"
- Nothing shipped → "Nothing shipped. Groundwork week, or did something block you that's worth naming?"

#### Mandatory (always ask all 4, in this order)

**1. The avoidance check**
> "What task, conversation, or action did you actively avoid this week? Name it specifically."
*(The avoided thing is almost always the highest-leverage one. Common pattern: offering a session, naming a price, sending a message to a real person.)*

**2. Build / sell / learn ratio**
> "Rough split this week: what % was building product, % talking to actual users or doing outreach, % reviewing data or running experiments?"
*(Watch for: zero user conversations = builder's refuge. Building is safe. Selling is where the loop breaks.)*

**3. Hypothesis integrity**
> "What assumption did you test this week with a real person or real usage data? What surprised you?"
*(Codebase surprises, refactor discoveries, and UI edge cases don't count. Real-person test or production usage data only. If the answer is "nothing" or "it worked as expected," that's a flag — no surprise means no real test.)*

**4. Scope / re-derivation check**
If strategy docs were touched: "You opened [doc] this week. Read back the last change before this one. What's substantively different in your thinking now? If the answer is 'mostly the same framing,' that's re-derivation — the decision was already made and you're circling it."

If no strategy docs touched: "Did you find yourself re-explaining your strategy or direction in any conversation this week — to me, to a user, to yourself in writing? Same idea, new words = re-derivation."

*(The tell: each re-derivation feels like refinement. The question is whether anything actually changed — new data, new constraint, new evidence — or whether the act of re-deriving is itself the avoidance.)*

---

### 6. Personal Pattern Interrupt

Run this check using the evidence picture and the answers just given. Surface at most 2 patterns. State them plainly — not as questions, not preachy. One sentence each. If none apply, skip this section entirely.

**Triggers and flags:**

- **Scope expansion:** New specs > shipped AND strategy docs re-opened → "The backlog grew and direction shifted. That's scope expanding before the current hypothesis has a result."

- **Framework substitution:** >50% commits are docs/refactor/chore AND zero user conversations → "This was an architectural week with no external contact. Frameworks replaced conversations."

- **Prerequisite creep:** Multiple features in-progress AND nothing user-facing shipped in 2+ weeks → "The list of things that need to be done before launch keeps growing. Name the actual blocker."

- **Anxiety pivot:** Strategy docs changed AND no new external data in evidence → "Something changed direction this week. Was there new information, or did anxiety spike?"

- **Virtue shield:** If the founder mentions inability to charge, "people like me," or fairness concerns about pricing → "That framing protects you from testing whether people will pay. Is the constraint real or is it a shield?"

- **Zero user conversations (automatic flag, no trigger needed):** If USER CONVOS = 0 → "Zero user conversations. That's the most important number in this review. Everything else is internal."

Only surface what the evidence actually shows. One sentence per pattern. Don't pile on.

---

### 7. Next Week Commitment

Always end with this. Save to state file for accountability next week:

```
STOP:        [one specific behavior — not a project, a behavior]
START:       [one specific action — must involve a real person or real user]
SCARY THING: [verb] + [named person or public channel] + [by specific date]
             Example: "Send pricing page to Marcus by Thursday"
             Not acceptable: "reach out to users", "think about pricing", "send a message"
HYPOTHESIS:  "I believe [X] will cause [Y], measured by [Z] by [date]"
KILL DATE:   "I'll reconsider this direction if [condition] by [date]"
```

If the scary thing doesn't have a name and a date, it's not a commitment — push back and ask again.

Save it:
```bash
cat > ~/.claude_weekly_last_run << 'EOF'
date: YYYY-MM-DD
stop: ...
start: ...
scary_thing: ...
hypothesis: ...
kill_date: ...
EOF
```

---

## Output Format

```markdown
## Weekly Review — YYYY-MM-DD
**Period:** LAST_RUN → today (N days)

### Context Health
✅/⚠️ CLAUDE.md: X lines, [broken links or "clean"]
✅/⚠️ Rules: [files or "missing"]
✅/⚠️ Stale docs: [list or "none"]
✅/⚠️ DB backup: [last backup age + size, or ❌ if missing/stale]

### Sentry
✅/⚠️ [summary]

### Metrics
Signups: N this week (total pledgers: M) | Live sessions: N
Blog subs: +N blog-origin this period (total blog-origin audience M | N synced excluded)

### This Week
**Shipped:** [N] — [titles]
**Created:** [N] — [titles]
**Commits:** [N] ([feat/fix/chore split])
**Strategy touched:** [docs or "none"]
**Smells:** [repeated fixes or "none"]
**Activity log:** N checks | WIP >2 days: [or "none"] | Recurring blockers: [or "none"]
**User conversations:** [N — names if any, or "zero"]
**Last week:** [commitment text] → [yes/partial/no]
**Process debt:** [N proposed fixes or "none"]
**Chronic patterns:** [or "none"]
**Product pulse:** [what changed or "no changes (X weeks)"]
**Code health:** TS: N | Lint: N | eslint-disables: N (N new) | Untested: N | Chunks: [list or "clean"]
**User health:** Total: N | Verified: N | Unverified: N | New this week: N
**Mixpanel audit:** Features: N | Has events: N | Missing: [list or "none"]
**SEO pulse:** Impressions: N (↑/↓) | Coverage: ✅/⚠️ N errors
**Ops email:** ✅ nothing actionable / ⚠️ [N items — list subjects]
**GCP spend:** $X.XX/week (~$XXX/mo) | Credits: ~$XX,XXX (~XXX months) | Flags: [list or "none"]
**Privacy scan:** ✅ clean (N docs) / ⚠️ [findings]
**Efficiency scan:** P1=N P2=N P3=N P5=N | vs last week: ↑/↓/— | FP rate: N%

### Evidence Signals
[table of signals with interpretations]

### Questions
[1–2 evidence-derived + 4 mandatory]

### Pattern Check
[0–2 flags based on evidence, not preachy]

### Next Week
Stop: ...
Start: ...
Scary thing: ...
Hypothesis: ...
Kill date: ...
```

---

## Rules

- **Evidence first. Questions after.** Never ask before showing the picture.
- **Collect user conversation count before questions** — it's the most important number.
- **Last week's commitment: paste it verbatim, ask yes/partial/no, wait for answer.** Don't infer.
- **Questions must be derived from evidence** — never generic "what went well?"
- **Always ask all 4 mandatory questions** — avoidance, ratio, hypothesis, re-derivation.
- **Q3 hypothesis check: real person or real usage data only.** Reject codebase answers.
- **Q4 re-derivation: anchor to the specific strategy doc touched.** Don't accept self-assessment without anchoring.
- **Pattern interrupt: plain statements, not questions, at most 2.** If none apply, skip the section.
- **The scary thing must have a name and a date.** Push back if it doesn't.
- **A retro that never stings is a journal entry.** If this feels comfortable, it's not working.
- Implement improvements now if identified. Keep it under 15 minutes.
