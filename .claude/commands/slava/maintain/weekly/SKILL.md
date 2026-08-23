---
name: weekly
description: Weekly ops monitor — context hygiene, metrics, background scans, closing ACTIONS list. No founder input except the step 2.5 process-debt close, which defaults to keep. Auto-run by /day's Due Board when overdue.
when_to_use: "Weekly. Auto-invoked by /day when >7d since last run, or run directly."
version: 2.0.0
---

# Weekly Review

Context hygiene + ops monitor. Gathers evidence and derives an ACTIONS list. Coaching/accountability lives in `/claude-conversations-to-pp` and `-to-cp`, not here (P900).

**One exception to "asks nothing":** step 2.5 offers to close process-debt entries. That is an action decision on a concrete queue item, not the reflection/accountability prompting P900 removed — and it defaults to keep, so an unattended run still completes (P1081).

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

> DB backup age and Sentry are NOT checked here — `/day` runs both daily (P900 de-dup).

```bash
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

### 2.1 Product Metrics (CSV-first — `/day` already collects the funnel daily)

**Signups: read from `.private/metrics/funnel-daily.csv`** (written by `/day` Wave 2; columns: `date,profiles,story_users,position_users,agreements` — daily snapshots of cumulative totals).

```bash
CSV="$(git rev-parse --show-toplevel)/.private/metrics/funnel-daily.csv"
SINCE_DATE=$(date -v-${DAYS}d +%Y-%m-%d 2>/dev/null || date -d "${DAYS} days ago" +%F)
if [ -f "$CSV" ]; then
  LAST_ROW=$(tail -1 "$CSV")
  LAST_DATE=$(echo "$LAST_ROW" | cut -d, -f1)
  BASE_ROW=$(awk -F, -v d="$SINCE_DATE" '$1 <= d' "$CSV" | tail -1)
  if [ -n "$BASE_ROW" ] && [[ ! "$LAST_DATE" < "$SINCE_DATE" ]]; then  # >= : same-day run is fresh, not stale; [[ ]] works in bash AND zsh (plain [ lacks < in zsh)
    SIGNUPS=$(( $(echo "$LAST_ROW" | cut -d, -f2) - $(echo "$BASE_ROW" | cut -d, -f2) ))
    echo "SIGNUPS: $SIGNUPS this period (CSV: $(echo "$BASE_ROW" | cut -d, -f1) → $LAST_DATE)"
  else
    echo "CSV_STALE: last row $LAST_DATE older than review period — fall back to prod query"
  fi
else
  echo "CSV_MISSING — fall back to prod query"
fi
```

**Fallback** (CSV absent, stale, or no baseline row): curl prod (`besjtuodziykmjidubzw`) with `PROD_SUPABASE_SERVICE_ROLE_KEY` from `.env.local`:
`profiles?select=id&created_at=gt.{SINCE_DATE}` → count = signups this period.

**Always from prod** (not in the CSV — two small curls, run in parallel):
- Total pledgers: `profiles?select=id&has_pledged=eq.true` → count
- Live sessions this period: `clarity_sessions?select=code&created_at=gt.{SINCE_DATE}` → distinct codes

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

**Recalibration trigger:** if 4+ suppressed items in this period share the same category (e.g., 4+ candidates that all hit `suppressed_at_7.1_ev_gate` for the same kind of friction), add to ACTIONS (step 5):

```
· Review /kdd EV gate for category X — N suppressions this period; threshold may be miscalibrated
```

Otherwise: silent.

This is a 1-minute scan. Don't expand it. Purpose: the suppression log is the falsification mechanism for the EV gates — without periodic review, silent suppression is unfalsifiable.

---

### 2.5 Process Friction Review — read, age-flag, and CLOSE

The deferred-work inbox. This is the **only** step in `/weekly` that accepts founder input, and it
exists because the queue previously had no exit at all: it reached 14 open items once
(`docs/decisions.md` 2026-02-26), was hand-cleaned to 4, and had climbed back to 8 by 2026-08-14.
Surfacing without closing is what produced that. Reading is the cheap half; the close is the point.

**Read both stores** — the public one is committed, the private one is gitignored and may
legitimately not exist:

```bash
for STORE in docs/process-learnings.md .private/docs/process-learnings.md; do
  if [ -f "$STORE" ]; then
    printf 'STORE %-42s %s open\n' "$STORE" "$(grep -c '^\*\*Status:\*\* proposed' "$STORE")"
  elif [ "$STORE" = ".private/docs/process-learnings.md" ]; then
    printf 'STORE %-42s ABSENT — private store not created yet (expected until /note first routes a private entry)\n' "$STORE"
  else
    printf 'STORE %-42s ABSENT — UNEXPECTED: this file is committed to the repo. Do not proceed as if the queue were empty; report it.\n' "$STORE"
  fi
done
```

**Absent must always print as its own line — never as silence and never as `0 open`.** A reader
wired to a store that is not there looks exactly like a healthy empty queue, which is how this step
could have been dead for months without anyone noticing. The two absent cases are not the same:
a missing private store is normal, a missing public store is a defect.

**Count with the anchored literal form** shown above (`^\*\*Status:\*\* proposed`). The store's
header documents this form. An unanchored `grep -c "Status: proposed"` matches prose and misses
every real entry — it returned `1` against 8 live entries before P1081.

**Scope:** entries with `due: month` belong to `/monthly` — skip them here. Entries with
`due: week`, or with no `due:` field at all, are in scope (absent means week).

For each in-scope entry:
- Age it from its `**Date:**` field. 2+ weeks without action → flag: "sitting since [date]".
- If 2+ entries share a root cause → that's a chronic pattern, not a one-off.

#### The close offer

After listing the in-scope entries, present **one** numbered list and **one** prompt — never one
prompt per entry:

```
PROCESS DEBT — 8 open, oldest 2026-05-19. Close any?
  1. An objection is a conjecture, not a refutation      2026-07-27  (2w+)
  2. Spotting the illusion of recursive understanding    2026-05-19  (2w+)
  ...
Reply with entry numbers: `resolve 3`, `drop 5`, `keep` / silence = all keep.
```

Rules that make this safe to run unattended:

- **Default is keep.** No reply, an unparseable reply, or a run where nobody is watching → change
  nothing, and emit the count to ACTIONS. This step must never block a `/day`-triggered run.
- **One entry at a time, named by the founder.** Never bulk-close, never infer that an entry "looks
  done", never propose a sweep. The entries hold live content — one is an unfilled pre-commitment.
- **`resolve N`** — the graduation rule (`docs/decisions.md` 2026-02-26), in this order:
  1. Read the full entry. Ask the founder for one line on *what was decided* if the entry does not
     already say it — a resolved entry with no recorded outcome is the graveyard in a new costume.
  2. Prepend a `## YYYY-MM-DD [process]: <title>` entry to `docs/decisions.md` — newest at top,
     immediately **above the current first `## ` heading** (do not anchor on a line number; a
     co-tenant session may have prepended an entry since you last read the file), carrying
     **Context / Decision / Consequences / References**.
     The References line cites the store entry's original date.
  3. Only then delete the entry from the store, leaving a tombstone in the file's existing comment
     form: `<!-- Resolved YYYY-MM-DD: "<title>" — see decisions.md YYYY-MM-DD [process] -->`
  4. Re-run the count. It must have dropped by exactly one.
- **`drop N`** — the entry is no longer worth doing. Delete it and leave
  `<!-- Dropped YYYY-MM-DD: "<title>" — <one-line reason> -->`. No `decisions.md` entry. A drop
  still needs a stated reason; "stale" is not one.
- **Never write `Status: done`** into the store. Entries leave the file or stay open — there is no
  third state, and an in-place done-marker is what made this a graveyard the first time.
- Resolving an entry in the **private** store writes its decision to `.private/docs/` — never to
  the public `docs/decisions.md`.

Surface findings in the Evidence Picture (step 4) as:
```
PROCESS DEBT: [N open — list them; or "none"; or "PUBLIC STORE ABSENT — unexpected"]
CHRONIC:      [patterns appearing 2+ times — or "none"]
```

Keep the scan itself short. The close is founder-driven and takes as long as it takes; do not
expand the *reading* half beyond age + chronic-pattern detection.

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

### 2.7 — moved to /monthly (P900)

Prompt-pattern/skill-gap mining now runs in `/slava:maintain:monthly` (Agent D) — it overlaps Agent B's recurring-questions analysis, and gap detection needs a month of volume.

---

### 2.9 Analytics Snapshot (invoke /slava:maintain:analytics)

Run `/slava:maintain:analytics` and incorporate its output into the Evidence Picture.

This handles: Mixpanel session check → login if needed → Supabase user health → Mixpanel board metrics.

---

### 2.9.1 Mixpanel Event Audit (subagent, runs in background — parallel with 2.8)

Spawn a subagent (`model: "sonnet"`) in background while you continue to step 3.

**Subagent prompt:**
```
You are a Mixpanel event auditor. Look at git commits since the last successful /weekly run:
[run: git log --oneline --since="$SINCE" --no-merges in <cp-root>]

Note: `$SINCE` comes from step 0 and is the last successful /weekly run, falling back to
"7 days ago" on a first run. It must NOT be hardcoded — a hardcoded 7-day window turns any
skipped week into a permanent blind spot, because this audit only ever inspects commits inside
its own lookback and nothing else recovers a gap once it ages out. Pre-existing gaps that
predate this mechanism are recorded in docs/technical/analytics.md § "Known event gaps".

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

### 2.10 Privacy Scan (subagent, runs in background — parallel with 2.8)

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

If hard flags found: add to ACTIONS (step 5): "· Fix privacy issue in [file] before next commit"

---

### 2.10.1 Secret-Leak Audit (runs in background — parallel with 2.8, 2.10)

Lightweight history secret scan. Full triage logic lives in `/slava:maintain:secret-audit` — this step only detects and hands off.

```bash
# run from the cp repo root
bash scripts/audit-secrets-history.sh 2>&1 | grep -iE 'no leaks found|leaks found:' | tail -1
# Backstop for what gitleaks misses (e.g. RTF-wrapped env files):
git rev-list --all --objects 2>/dev/null | grep -iE '\.env' | grep -viE 'environment|\.env\.example' | head
```

Merge into Evidence Picture as:
```
SECRETS:      ✅ history clean / ⚠️ [N findings — run /secret-audit]
```

If **not** clean (gitleaks findings OR a `.env*` blob in history): add to ACTIONS (step 5): "· Run `/slava:maintain:secret-audit` — secret-scan non-clean, classify (dead/live/public) before next push." Do NOT triage inline — that's the standalone skill's job (per-finding dead/live verification, allowlisting, private ledger).

---

### 2.10.2 Credential Drift Audit (P1147, runs in background — parallel with 2.8, 2.10, 2.10.1)

Read-only classification/drift check, distinct from 2.10.1 (which scans git history for a leak).
This checks the **live inventory**: every local secret classified against the two private
registries, in three directions. It never mints, writes, rotates, or revokes anything.

```bash
# run from the cp repo root. Output holds key names/tiers/reasoning, never a
# raw value — but it's still a credential-topology map, so it's written
# private (600) rather than left at the default world-readable /tmp perms.
AUDIT_OUT=/tmp/p1147-weekly-audit.txt
(umask 077; : > "$AUDIT_OUT")
scripts/audit-credential-drift.sh --audit \
  --env-dir "$(pwd)" \
  --registry .private/docs/accounts.md \
  --registry .private/docs/edge-function-secrets.md \
  --consumers-dir src --consumers-dir supabase/functions --consumers-dir scripts \
  --not-enumerated "ci-secrets:GitHub Actions secrets store — agent's credential has no API access, HTTP 403 by design" \
  > "$AUDIT_OUT" 2>&1
AUDIT_EXIT=$?
chmod 600 "$AUDIT_OUT"
grep -c '^CONSUMER_ONLY:\|^REGISTRY_ONLY:\|^REGISTRY_LOCATION_MISMATCH:\|^REGISTRY_MISMATCH:\|^PLAINTEXT_IN_REGISTRY:\|^PLAINTEXT_CHECK_SKIPPED:' "$AUDIT_OUT"
grep '^COVERAGE:' "$AUDIT_OUT"
echo "exit=$AUDIT_EXIT"
```

Read `$AUDIT_EXIT` directly (do not infer the audit's own exit status from `grep`'s — a `grep -c` with zero matches exits 1, which is unrelated to whether the audit itself ran cleanly).

Merge into Evidence Picture as:
```
CRED DRIFT:   ✅ N/N classified, 0 drift findings / ⚠️ [coverage]/[total] classified, [N] drift findings
```

If `$AUDIT_EXIT` is non-zero (a `PLAINTEXT_IN_REGISTRY` hard-fail, or a usage/fatal error), OR any `REGISTRY_LOCATION_MISMATCH`/`REGISTRY_MISMATCH`/`PLAINTEXT_CHECK_SKIPPED` finding exists: add to ACTIONS (step 5): "· Credential drift found — see `/tmp/p1147-weekly-audit.txt` — a registry disagrees with itself, claims a location it doesn't occupy, or the hard-fail plaintext check didn't run for one of its tables." A `PLAINTEXT_IN_REGISTRY` hit is the highest-severity one (a real secret value inline in a doc) — call it out first if multiple fire. A non-zero `$AUDIT_EXIT` with none of the other three findings present means something else went wrong (a bad `--registry` path, a usage error) — read the raw output before assuming it's the plaintext hard-fail.

If `COVERAGE` shows unclassified live keys (`CONSUMER_ONLY` findings), `RETIREMENT_CANDIDATE`/`CONSUMER_LIST_STALE` entries, or `MULTI_KEY_ROW_BUNDLED`: these are backlog, not a break — do NOT add to ACTIONS unless the count has grown since the last run (compare against the prior week's `/tmp/p1147-weekly-audit.txt` if still present, else note the baseline). Classification is a founder-paced pass, not something this check should nag about every week.

---

### 2.8 Code Health Scan (subagent, runs in background — parallel with 2.9.1)

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

If verdict is ❌: add to ACTIONS (step 5): "· Fix code health — [worst metric]"

---

### 2.11 Ops Email Triage (subagent, runs in background — parallel with 2.8, 2.9.1)

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

### 2.12 GCP Spend (invoke /slava:maintain:gcp-spend — runs in background with 2.8, 2.9.1)

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

### 2.14 Memory Hygiene (moved from /day 6b — weekly cadence, P900)

Scan MEMORY.md for staleness:
1. Count lines — over 150 = over limit
2. Check for entries referencing completed features (cross-reference `features/done/`): a memory entry mentioning a P-number that's in `features/done/` is stale
3. Check for entries >90 days old (if date is in the entry or topic file)

Surface in Evidence Picture as:
```
MEMORY:       N lines (target <150) [OK / ⚠ over limit] | Stale entries: [list or "none"]
```

If over limit or stale entries found, add to ACTIONS (step 5): "· Trim MEMORY.md — [N lines over / stale: list]". Do NOT delete entries from this skill — proposing is the monitor's job, trimming is a founder-initiated action.

---

### 2.15 Backup Restore Test (28-day gate — runs at most monthly)

A backup that has never been restored is a hypothesis, not a backup. Backups silently died for 10 weeks in May–July 2026 and three subsequent verification-gate revisions were all bugs in the *checker*, never in the backup. Only a restore proves recoverability.

**Gate first — skip cheaply if not due:**
```bash
LAST=$(cat ~/.claude_restore_test_last_run 2>/dev/null)
if [ -n "$LAST" ] && [ $(( ($(date +%s) - $(date -j -f "%Y-%m-%d" "$LAST" +%s)) / 86400 )) -lt 28 ]; then
  echo "RESTORE TEST: last $LAST — not due (<28d), skipping"
fi
```
If not due, surface the one line and do nothing else. If due (or the marker is absent), run the procedure.

**The procedure lives in `pp/docs/infra/restic.md`** — repo path, credentials, and env exports are private infra and must not be inlined into this public repo. Read that file and follow its "Testing a change to the script" and layout sections. Shape of the run:

1. `restic restore latest --target <scratch> --include <a small, stable path>` — a few hundred KB is enough; this is a correctness test, not a capacity test.
2. **Checksum-compare every restored file against its live counterpart** (`shasum -a 256`). Restoring without comparing proves only that bytes moved, not that they are the right bytes.
3. `restic check` for structural integrity.
4. Delete the scratch directory.

**Report to Evidence Picture:**
```
RESTORE TEST: N/N files identical | repo check: no errors | last run YYYY-MM-DD
```

**On ANY mismatch, missing file, or check error:** do not summarize it as a passing row. Add to ACTIONS as a P1 and state plainly that the backup is unproven. A partial pass is a fail — the whole value of this step is that it discriminates.

Write the marker **only on a clean pass**, so a failed or abandoned run stays due and resurfaces next week:
```bash
echo "date: $(date +%Y-%m-%d)" > ~/.claude_restore_test_last_run
```

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
```

---

### 4. Evidence Picture

Pure monitor — present the picture, ask nothing.

```
SHIPPED:      [N features — list titles]
CREATED:      [N new specs — list titles]
COMMITS:      [N total — split by type: feat/fix/chore/docs/refactor]
STRATEGY:     [docs touched or "none"]
SMELLS:       [areas fixed 2+ times — scope only, not count; or "none"]
ACTIVITY LOG: [N /status checks | WIP active >2 days: list or "none" | Recurring blockers: list or "none" | or "no log yet"]
GCP SPEND:    [$XX/week, ~$XXX/mo | credits: ~$XX,XXX | flags: list or "none"]
PROCESS DEBT:  [N proposed fixes from process-learnings.md — or "none"]
CHRONIC:       [patterns appearing 2+ times — or "none"]
PRODUCT PULSE: [what changed in lean-canvas/philosophy/README/CLAUDE.md — or "no changes (X weeks)"]
USERS:         [total / verified / unverified / new this week — or "query failed"]
BLOG SUBS:     [+N blog-origin this period | total blog-origin audience M | N synced excluded — or "skipped"]
MIXPANEL:      [features audited / has events / missing — or "no new features"]
SEO:           [impressions trend + coverage errors — or "skipped"]
OPS EMAIL:     [N actionable — subjects; or "✅ nothing actionable (N total)"]
MEMORY:       [N lines OK/over | stale entries or "none"]
KDD SUPPRESSION: [N runs | M suppressed | top category — or "no log yet"]
```

Then compute these signals (evidence-only — no founder input exists in this skill):

| Signal | What it reveals |
|--------|----------------|
| **feat vs chore ratio** | High chore = tooling/meta-work week, low product |
| **specs created > shipped** | Backlog growing faster than execution |
| **strategy docs touched** | Decisions re-opened — settling or drifting? |
| **repeated fix areas** | Patching symptoms not root causes |

---

### 5. ACTIONS

The closing section — one-line actionable items derived from evidence already gathered. No interrogation, no reflection prompts. "ACTIONS: none" is a valid output.

Sources (collect from the steps above):
- Ops email ACTION_NEEDED / DECISION items (2.11)
- Process debt entries sitting 2+ weeks (2.5) — and, if the close offer was declined or unanswered, the open count itself
- GCP/cost flags (2.12)
- Code health ❌ verdict (2.8)
- Privacy hard flags (2.10) / secret-scan non-clean (2.10.1)
- KDD EV-gate recalibration trigger (2.4.5)
- Memory hygiene over-limit/stale (2.14)
- Broken CLAUDE.md links / stale docs (1)

Format:
```
ACTIONS
  · [one line per item — verb first, concrete target]
  · ...
```
or
```
ACTIONS: none
```

---

### 6. Pattern Interrupt (printed statements — no response required)

Run this check using the evidence picture only. Surface at most 2 patterns. State them plainly — printed observations, not questions, not preachy. One sentence each. If none apply, skip this section entirely.

**Triggers and flags (all evidence-only):**

- **Scope expansion:** New specs > shipped AND strategy docs re-opened → "The backlog grew and direction shifted. That's scope expanding before the current hypothesis has a result."

- **Framework substitution:** >50% commits are docs/refactor/chore → "This was an architectural/tooling week. Check whether frameworks replaced external contact."

- **Prerequisite creep:** Multiple features in-progress AND nothing user-facing shipped in 2+ weeks → "The list of things that need to be done before launch keeps growing. Name the actual blocker."

- **Anxiety pivot:** Strategy docs changed AND no new external data in evidence → "Something changed direction this week without new external information."

Only surface what the evidence actually shows. One sentence per pattern. Don't pile on. (Triggers that needed founder input — user-convo count, commitment follow-through, pricing statements — were removed in P900; that accountability layer lives in `/claude-conversations-to-pp` / `-to-cp`.)

---

### 7. Save State

Write the completion marker — **only on completion** (a skipped/abandoned run stays overdue on /day's Due Board):

```bash
cat > ~/.claude_weekly_last_run << EOF
date: $(date +%Y-%m-%d)
EOF
```

The file keeps `date:` only (P900). The kanban `/api/weekly` endpoint parses generic `key: value` pairs and degrades gracefully; the Goals-view commitment card reads `docs/goals.md`, not this file.

---

## Output Format

```markdown
## Weekly Review — YYYY-MM-DD
**Period:** LAST_RUN → today (N days)

### Context Health
✅/⚠️ CLAUDE.md: X lines, [broken links or "clean"]
✅/⚠️ Rules: [files or "missing"]
✅/⚠️ Stale docs: [list or "none"]

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
**Memory:** N lines [OK/over] | stale: [list or "none"]

### Evidence Signals
[table of signals with interpretations]

### Pattern Check
[0–2 flags based on evidence, printed statements, not preachy]

### ACTIONS
· [one line per item] / none
```

---

## Rules

- **Pure monitor. Zero founder prompts** — no questions, no commitment, no waiting for input (P900). Coaching/accountability lives in `/claude-conversations-to-pp` / `-to-cp`.
- **End with ACTIONS** — actionable one-liners derived from evidence, or "ACTIONS: none".
- **No DB-backup or Sentry checks** — `/day` runs both daily.
- **Signup counts: CSV first** (`.private/metrics/funnel-daily.csv`), prod query only as fallback.
- **Pattern interrupt: plain statements, not questions, at most 2.** Evidence-only triggers. If none apply, skip the section.
- **Write `~/.claude_weekly_last_run` only on completion** — a skipped run stays overdue.
- Implement improvements now if identified. Keep it under 15 minutes.
