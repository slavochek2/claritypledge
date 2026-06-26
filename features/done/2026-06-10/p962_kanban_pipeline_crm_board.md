---
status: all-done
type: task
rank: 1000937.0
created_date: '2026-06-25'
tags: [kanban, crm, pipeline, gtm]
flow: dev
pipeline_plan: [create-spec, generate-tests, dev, verify]
pipeline_skipped: [challenge-prd -- infra tooling not a feature PRD, architect -- mirrors existing Content board pattern, ux -- no net-new design, decompose -- under 5 files, spec-review -- spec is fresh]
pipeline_ran: [create-spec, generate-tests, dev, ship]
uat_file: features/uat/p962.md
test_files:
  - tools/kanban/server/__tests__/opportunities.test.ts
completed_at: 2026-06-26
---

# P962: Pipeline (CRM) board in the kanban tool

## Problem

**Situation:** Live GTM opportunities (Matt Jones / Cofounder Clarity, Kai) have no
per-deal home. Cold candidate lists live in `pp/crm/shortlists/*.csv` (cross-venture
rolodex); GTM motion + target research lives in `cp/.private/research/` and
`cp/.private/docs/coach-partner-journey.md`. But the *state of an active deal* —
which stage, what's the next step, when — is written down nowhere.
**Complication:** As outreach scales beyond two deals, "where is Matt, what's next on
Kai" can't be answered. The `tools/kanban` is already a multi-board tool (scans
`features/` → feature board, `content/articles/` → Content board) and was built to be
extended (env-overridable scan dirs, ports "to allow embedding in pp").
**Question:** Add a Pipeline board that scans an opportunities directory, so live deals
are glanceable on the same board mechanism — without duplicating contact data or
polluting the feature board.

## Appetite

Low blast radius — additive to `tools/kanban` (new scan dir + board view), mirrors the
existing Content board pattern; no existing board changes. Fully reversible (remove the
board + endpoint; data is plain markdown). Low decision density — pipeline shape and
storage decided in this conversation; remaining choices are mechanical.

## Solution

One opportunity pipeline, `type` as a tag (not separate boards per type).

- **Data:** `cp/.private/crm/opportunities/*.md`, one file per deal, gitignored via
  `.private`. Frontmatter drives the board:
  ```yaml
  name: Matthew Jones
  type: coach            # founder | coach | distribution-partner | investor
  stage: in-conversation # drives board columns
  next_step: "..."
  next_date: 2026-06-30
  contact_ref: "pp/crm — Cofounder Clarity"   # link to rolodex, no dup
  ```
- **Stages (columns):** `contacted → in-conversation → qualified → committed → active → closed`.
- **Scanner:** new opportunities scan dir in `tools/kanban/server/api.ts`, mirroring the
  `getArticlesDir`/`getArticles` pattern, path env-overridable (e.g.
  `KANBAN_OPPORTUNITIES_DIR`) defaulting to `cp/.private/crm/opportunities`.
- **Board view:** new "Pipeline" page/tab in the kanban frontend, mirroring `ContentPage`.
- **Person vs opportunity:** the person stays in `pp/crm` (cross-venture); the opportunity
  file is cp-local and references the rolodex via `contact_ref`.
- **Seed:** create `matt-jones.md` and `kai.md` as the first two opportunities.

## Risks / Non-Goals

### Risks
- **Private data path referenced from public repo code.** Mitigation: the scanner stores
  only a *path string* (public-safe); deal data lives under `.private` (gitignored) and is
  never committed. Verify `.private/crm/` is covered by `.gitignore` before seeding.
- **Stage taxonomy may not fit all four `type`s** (a coach's journey ≠ an investor's).
  Mitigation: `next_step` free-text absorbs type-specific nuance; revisit splitting boards
  only if one `type` exceeds ~15 active deals.

### Non-Goals
- Do NOT create separate boards per opportunity type — one pipeline + `type` tag.
- Do NOT move contact/identity data from `pp/crm` into cp — opportunities reference, never duplicate.
- Do NOT reuse the feature board or `features/` directory — separate scan dir, separate board.
- Do NOT migrate the cold shortlists (`pp/crm/shortlists/`) into this board — they are the
  cold feeder; a file is created only when a row graduates to an active conversation.
- Do NOT touch the Content/Goals/Focus boards.

### Alternatives Considered
- **Standalone `opportunities.md` markdown kanban (no tool).** Rejected: the kanban
  mechanism already exists and is built for extension; a separate file means no board view
  and a second thing to maintain.
- **Reuse `npm run kanban` feature board with a CRM tag.** Rejected: conflates sales deals
  with product specs, pollutes feature status, and `features/` is public.
- **External CRM (Notion/Airtable/HubSpot).** Rejected: adds an external dependency and a
  network hop for ~2 deals; data leaves the local gitignored store.

### Rollback Strategy
Remove the Pipeline board component + the opportunities endpoint/scan dir from
`tools/kanban`. The `.private/crm/opportunities/*.md` files are plain markdown and can stay
or be deleted independently. Single-feature revert, no data migration.

## Done-When

- [x] `tools/kanban` shows a "Pipeline" board scanning `.private/crm/opportunities/`
- [x] Board renders columns: contacted / in-conversation / qualified / committed / active / closed
- [x] Each opportunity card shows name, `type`, `next_step`, `next_date` (next_date shows when populated; seed deals have it empty)
- [x] `matt-jones.md` and `kai.md` exist and appear on the board in their stages (Kai → Contacted, Matthew Jones → In Conversation)
- [x] `.private/crm/` confirmed gitignored — no deal data is committable
- [x] Existing feature/Content boards unaffected (regression check — 93 unrelated tests pass; the 10 failing predate P962, in goals/CORS)

## Test Coverage Strategy

Tests live in `tools/kanban` (Vitest), mirroring `server/__tests__/api.test.ts`.

**What's tested (18 cases, `server/__tests__/opportunities.test.ts`):**
- ✅ Scanner: GET returns parsed opps; missing dir → empty array; non-`.md` ignored
- ✅ Field surfacing: id, path, name, type, stage, next_step, next_date, contact_ref
- ✅ Stage parsing: all 6 valid stages round-trip; missing/invalid → `contacted`
- ✅ Type parsing: 4 valid types round-trip; missing/invalid → `undefined`
- ✅ Cache: no-refresh serves cache; `?refresh=true` busts it
- ✅ PATCH: writes stage to disk; 400 invalid stage; 404 unknown id; cache updated
- ✅ Regression: `/api/features` and `/api/articles` still 200

**Contract decisions locked by tests:** default stage `contacted`; invalid type → `undefined`; PATCH `/api/opportunities/:id` for drag-to-column parity; flat `.md` scan (no prefix filter).

**What's NOT tested (rationale):**
- ❌ Board UI render / drag interaction → `/verify` in browser (UAT 1-7)
- ❌ Accessibility → internal tool, not required
