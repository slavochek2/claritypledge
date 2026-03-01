---
paths:
  - "features/**/*.md"
---

# Feature Spec Rules

## Frontmatter (Required on all feature files)

```yaml
---
status: week          # REQUIRED: kanban column
type: story           # REQUIRED: story | bug | task | comment
rank: 7               # REQUIRED: sort order within column
tags: []              # REQUIRED: can be empty array
# completed_at: "2026-02-19"  # Add when status transitions to done
---
```

## Status Values

`backlog` → `week` → `today` → `in-progress` → `blocked` → `qa` → `done` → `all-done`

- When `status: qa` → feature is implemented, awaiting user review before shipping. Stays on feature branch; run `/ship pN` to merge to prod.
- When `status: done` → move file to `features/done/`, add `completed_at`
- When `status: all-done` → move file to `features/done/` (same as `done`), `completed_at` not required. Use for permanently closed features that should remain visually prominent on the kanban.
- When rejected → move to `features/archive/`, set `status: rejected`
- UAT file (`features/uat/pN.md`) → always moves with its spec into `features/done/{sprint}/uat/`

## Manual Status Lock (`locked_at`)

When the kanban UI sets a status manually, it writes `locked_at: <ISO timestamp>` to frontmatter.

**CRITICAL RULE: If a feature file has `locked_at`, DO NOT change its `status` unless the user has explicitly instructed you to do so for that specific feature in this conversation.** Automated status transitions (e.g. auto-closing on `/dev` success) must be skipped for locked features. If you need to close a feature that has `locked_at`, ask the user first.

**`in-progress` is exclusively agent-set.** Only `/dev` or `/fix` may set `status: in-progress` — at the moment the run actually starts. Users should not manually drag a feature to `in-progress` on the kanban: doing so writes `locked_at`, which suppresses all automated status transitions for that feature. The correct user signal for "I want this next" is `status: today`. The agent sets `in-progress` when it picks up the work.

## P-Number Assignment

ALWAYS run `./scripts/next-p-number.sh` — never compute manually (`ls`, `find`, or manual inspection miss `features/done/` and cause duplicate P-numbers). Script excludes `uat/` and `archive/` correctly. If script unavailable, warn user and halt.

## Type Classification

- `story` — user-facing functionality (new capability or enhancement)
- `bug` — something broken that needs fixing
- `task` — technical work (refactor, infra, tools, docs)
- `comment` — notes, decisions (not actionable)

## Optional Frontmatter: `flow`

```yaml
flow: fix    # fix | dev | inline | quick-feature
```

Records which implementation flow was chosen. Set by `/pick-flow` or the agent/human choosing the approach. Values map to the sequential flow tiers: `fix` = single-concern bug with confirmed root cause; `dev` = full pipeline; `inline` = too small for a skill; `quick-feature` = skeleton only.

**When `flow:` is set, the implementing agent must validate the chosen flow still matches actual scope before starting work.** If `flow: fix` is set but the scope has grown (multiple concerns, DB migration, 5+ files), flag the mismatch and confirm before proceeding.

## Change Requests

A change request is a redesign spec for a **shipped feature whose design was wrong** (wrong visual ordering, actor confusion, duplication, hierarchy issues). Use `/change-request` to file one.

Change requests use `type: story` with extra frontmatter:

```yaml
changes: p422      # which original feature this redesigns
tags:
  - redesign
  - p422
```

**When filed from `/sim`**, also include:
```yaml
source: sim
persona: solo-founder  # which persona surfaced it
```

No separate `change-request` type — kanban shows them as regular stories. The `changes:` + `redesign` tag are the distinguishers.

**When to use `/change-request` vs other skills:**
- Code is broken → `/fix`
- New capability, new user value → `/create-prd`
- Shipped feature, design was wrong → `/change-request`

## Hook Side-Effect: Re-read Required After First Edit

A PostToolUse hook (`features-frontmatter-fix.sh`) runs `fix-frontmatter.py` on every Write or Edit to `features/p*.md`, modifying the file on disk immediately after your tool call completes.

**Rule:** If you make more than one Edit to the same feature file in a single task, re-read the file before each subsequent Edit. The hook may have altered frontmatter, making your previous copy stale. Skipping the re-read causes Edit to fail with an `old_string` mismatch.

## Secrets & External Services in Specs

When a spec introduces a new external API key, edge function, or third-party service secret, the spec **MUST** include a **Pre-deploy Checklist** section.

**Trigger conditions (any one is sufficient):**
- New `VITE_*` or server-side env var not yet in Vercel prod
- New Supabase edge function that calls an external API
- New third-party integration (OAuth provider, payment processor, webhook, etc.)

**Required section format:**

```markdown
## Pre-deploy Checklist

### Secrets to provision
- [ ] `VITE_EXAMPLE_KEY` — `vercel env add VITE_EXAMPLE_KEY production --token "$VERCEL_TOKEN"`

### Deploy commands
- [ ] `supabase functions deploy <name> --project-ref <ref>` (if edge function)
- [ ] Trigger Vercel redeploy (VITE_* vars baked at build time — redeploy required)

### Post-deploy verification
- [ ] Smoke test the new endpoint/function on prod
- [ ] Check Sentry for new errors in first 10 minutes
```

**Why:** VITE_* env vars are baked at build time. A secret that works in `.env.local` is silently absent in prod until explicitly provisioned AND a redeploy is triggered.
