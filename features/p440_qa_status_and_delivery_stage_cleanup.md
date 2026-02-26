---
status: today
type: task
rank: 1
tags: [kanban, workflow, process]
---

# P440: QA status + delivery_stage cleanup

Make the dev→review→ship pipeline unmissable in kanban.

## Problem

- After `/dev` finishes, feature stays in "in-progress" column — indistinguishable from features still being coded
- `delivery_stage: uat` badge is subtle, confusing name (UAT ≠ "needs your review")
- 4 delivery_stage values are never set by any skill (dead weight)
- `arch-approved` requires manual frontmatter edit (inconsistent with prd/ux-approved pattern)
- No ordering — can't tell at a glance which review stage comes first

## Changes

### 1. Add `status: qa` to kanban

New kanban column between `in-progress` and `done`.

- `/dev` and `/fix` set `status: qa` when implementation is complete (not `status: in-progress` + badge)
- `/ship` accepts `status: qa` as input, sets `status: done` + moves to `features/done/`
- `status: qa` = clear signal: "needs your review before going to prod"

### 2. Delivery stage cleanup

**Remove** (never set by any skill): `prd-draft`, `ux-design`, `arch-design`, `implementation`, `uat`

**Remove** (implicit via running next skill): `prd-approved`, `ux-approved`, `arch-approved`

**Keep + number:**

| New name | Old name | Set by |
|---|---|---|
| `1-prd-review` | `prd-review` | `/create-prd` |
| `2-ux-review` | `ux-review` | `/ux` |
| `3-arch-review` | `arch-review` | `/architect` |
| `4-tests-ready` | `tests-generated` | `/generate-tests` |

No delivery_stage on `status: qa` — the column is the signal.

### 3. Fix implicit approvals

- `/ux` sets `1-prd-review` → clears it and sets `2-ux-review` when done (running /ux = PRD approved)
- `/architect` sets `2-ux-review` → clears it and sets `3-arch-review` when done
- `/decompose` or `/generate-tests` clears `3-arch-review` → sets `4-tests-ready` (running either = arch approved)

## Files to change

**Kanban types/UI:**
- `tools/kanban/src/lib/types.ts` — Status type (add `qa`), DeliveryStage type (replace values)
- `tools/kanban/src/components/CardDialog.tsx` — DELIVERY_STAGE_OPTIONS list

**Skills:**
- `.claude/commands/slava/build/dev.md` — step 10: set `status: qa` (not delivery_stage: uat)
- `.claude/commands/slava/build/fix.md` — same: set `status: qa` on completion
- `.claude/commands/slava/build/ship.md` — accept `status: qa` input
- `.claude/commands/slava/build/create-prd.md` — set `1-prd-review`
- `.claude/commands/slava/build/ux.md` — set `2-ux-review`; clear `1-prd-review` at start
- `.claude/commands/slava/build/architect.md` — set `3-arch-review`; clear `2-ux-review` at start
- `.claude/commands/slava/build/generate-tests/agent.md` — set `4-tests-ready`; clear `3-arch-review`
- `.claude/commands/slava/build/decompose.md` — remove `arch-approved` check; clear `3-arch-review`
- `.claude/commands/slava/build/revert-feature.md` — update delivery_stage reference

**Docs/rules:**
- `.claude/rules/features.md` — update delivery_stage definitions
- `docs/development-process.md` — update pipeline description
- `CLAUDE.md` — update dev pattern description

## Acceptance criteria

- [x] `status: qa` column visible in kanban (between in-progress and done)
- [x] `/dev` completion sets `status: qa`, not in-progress + badge
- [x] `/fix` completion sets `status: qa`
- [x] Old delivery_stage values (`uat`, `prd-approved`, etc.) gone from type and options
- [x] New numbered values (`1-prd-review` etc.) appear as badges on planning cards
- [x] `/ship` works from `status: qa` cards
- [x] No skill requires manual frontmatter edits for approvals
