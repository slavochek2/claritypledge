---
status: today
type: task
rank: 1000061.0
created_date: '2026-04-05'
tags: [infrastructure, skills, process, pipeline]
---

# P659: Pipeline Delivery Tracking

## Problem

**Situation:** Feature specs have two frontmatter fields — `status` (kanban column) and `delivery_stage` (which skill last ran). Skills are supposed to update these as they run.

**Complication:** Three things are broken:
1. **No trail** — `delivery_stage` shows only the last skill, not what ran before it. When you look at `delivery_stage: dev` you can't tell if UX, architect, and tests actually ran or were skipped.
2. **Inconsistent stamping** — only 6 of 15 pipeline skills update `delivery_stage`. The rest don't touch it, so the value goes stale.
3. **No validation** — skills don't check whether the previous skill in the flow actually ran. You can run `/dev` without `/generate-tests` having completed. Nothing stops you.

Result: kanban shows stale states, specs get stuck at `in-progress` for weeks, and you can't tell from a spec what actually happened to it.

**Question:** How do we make the spec frontmatter reliably track what was planned, what ran, what was skipped, and where the spec is now?

## Appetite

High blast radius — changes 15 skill files, `features.md` rules, and `pick-flow`. Affects every future session. Medium reversibility — git revert removes the changes, but specs created under the new format would need frontmatter cleanup. Low decision density — design decisions already made in conversation (this session).

## Solution

### Three new frontmatter fields

```yaml
pipeline_plan: [create-spec, challenge-prd, ux, architect, generate-tests, dev, verify]
pipeline_ran: [create-spec, challenge-prd, ux]
pipeline_skipped: [research-arch -- no novel tech, decompose -- under 5 files]
```

- **`pipeline_plan`** — the full ordered flow recommended by `/pick-flow`. Written once when the user confirms the flow. Never deleted.
- **`pipeline_ran`** — each tracked skill appends its name on entry. Shows what actually started executing. If a skill runs again, it appends with `.2` suffix (third time `.3`, etc.). Matching is exact string only (`dev` does not match `dev.2`).
- **`pipeline_skipped`** — flat string list of skills intentionally skipped, each with `--` separator and one-line reason. Written by `/pick-flow` when the user confirms. Never deleted.

**All three fields use inline YAML list format `[a, b, c]` only.** Never block format. This keeps each field on one line and avoids YAML parsing fragility with nested objects.

**`pipeline_ran` means "started", not "completed."** A skill that crashes after stamping will appear in the list. Downstream skills already verify upstream output exists (e.g., `/dev` reads `## Technical Architecture` — if missing, it stops). The stamp tells you what attempted to run; the spec sections tell you what completed.

### `delivery_stage` becomes skill name

Replace numbered values (`1-prd`, `2-ux-done`, `3-arch-review`, `3.5-ui-review`, `4-tests-ready`, `5-decomposed`, `uat`) with the actual skill name that last ran: `create-spec`, `ux`, `architect`, `ui`, `generate-tests`, `decompose`, `dev`, `verify`, `ship`.

Each tracked skill overwrites `delivery_stage` with its own name on entry.

### `status` updated at 4 transition points only

| Event | Sets `status` to |
|-------|-----------------|
| `/dev` or `/fix` starts | `in-progress` |
| `/fix` completes (QA gate) | `qa` |
| `/verify` passes | `qa` |
| `/ship` completes | `all-done` |

All other skills leave `status` unchanged.

### Validation gates

Each tracked skill checks: "Is the skill immediately before me in `pipeline_plan` present in `pipeline_ran`?" If not → refuse and tell the user what to run first.

**First-skill rule:** If this skill is the first item in `pipeline_plan`, skip predecessor check. If `pipeline_ran` is absent or empty and `pipeline_plan` exists, only the first planned skill may proceed.

**No-plan rule:** If `pipeline_plan` is absent (old spec, or inline work), skip validation entirely — just stamp.

If a skill is invoked that isn't in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Run anyway?" Don't block, just flag.

### 14 tracked skills (with stamp), 1 tracked value without skill file, 4 not tracked

**Tracked with stamp** (stamp `delivery_stage`, append to `pipeline_ran`):
`create-spec`, `create-bug`, `change-request`, `challenge-prd`, `ux`, `architect`, `ui`, `generate-tests`, `spec-review`, `decompose`, `dev`, `fix`, `verify`, `ship`

**Valid `delivery_stage` value but no skill file:** `research-arch` — referenced in pick-flow as optional pre-architect step. If a `/research-arch` skill is created later, add the stamp pattern.

**Not tracked** (helpers, not pipeline milestones):
`spec-compact` (text cleanup), `finish` (auto-runs inside dev/fix), `beautify` (optional polish), `kdd` (post-ship learning)

### `/pick-flow` resume logic simplified

Old: 6-row hardcoded table mapping numbered stages to resume points.
New: compare `pipeline_plan` vs `pipeline_ran`. First item in plan not in ran = where to resume. One rule replaces the table.

## Risks / Non-Goals

### Risks
- **Existing specs have old-format `delivery_stage`** — specs with `1-prd`, `3-arch-review`, etc. will confuse updated skills. Mitigation: skills accept both old and new format during transition. Old values are treated as "unknown stage — don't validate predecessor."
- **Frontmatter bloat** — `pipeline_plan` + `pipeline_ran` + `pipeline_skipped` adds 3-6 lines per spec. Mitigation: acceptable trade-off for visibility. Specs already have 8-12 frontmatter lines.
- **`pipeline_ran` records starts, not completions** — a crashed skill appears in the list. Downstream skills must verify upstream output exists (e.g., check for `## Technical Architecture` header), not just trust `pipeline_ran`. This is already how skills work today. Two-phase stamping (started/completed) was considered but rejected — doubles implementation surface across 15 skills for marginal benefit.
- **YAML list-append fragility** — 15 skills all appending to inline `[a, b, c]` lists is high surface area for formatting errors. Mitigation: exact Edit tool pattern provided in stamp template; mandatory inline format only.
- **Kanban server validates `delivery_stage`** — `tools/kanban/lib/scanner-rules.ts` has `VALID_DELIVERY_STAGE` allowlist with old numbered values only. New skill-name values will be rejected. Mitigation: update kanban types and validation (added to scope).
- **`fix-frontmatter.py` strips `delivery_stage` at `status: qa`** — the script clears delivery_stage when status is qa, which conflicts with `/fix` and `/verify` leaving their stamp. Mitigation: remove that clearing rule (added to scope).

### Non-Goals
- Do NOT change `status` kanban values — the 8-column kanban stays as-is
- Do NOT create a shared state-machine script or library — each skill reads frontmatter directly
- Do NOT migrate existing specs to the new format — old specs keep their current frontmatter, new specs use the new fields
- Do NOT track non-pipeline skills (spec-compact, finish, beautify, kdd)
- Do NOT add `pipeline_plan` to bug specs that use the simple `[create-bug, fix]` flow — the flow is always the same, tracking adds no value. Only add when pick-flow recommends a non-trivial flow.

### Alternatives Considered
- **Single `delivery_stage` field (status quo)** — rejected because it only shows the last skill, not the trail. Can't tell what ran vs what was skipped.
- **Shared state-machine script called by all skills** — rejected as over-engineering. 15 skills reading frontmatter directly is simpler than 15 skills calling a shared script that reads frontmatter.
- **Merge `status` and `delivery_stage` into one field** — rejected because they serve different audiences. `status` is kanban (for the founder). `delivery_stage` is pipeline cursor (for skills).

### Rollback Strategy
Revert the skill file changes. New-format frontmatter fields in specs are harmless — they're just ignored by old skill versions. No data migration needed in either direction.

## Implementation Plan

### The Stamp Pattern (all 15 tracked skills)

Every tracked skill gets this block at the **top of its workflow**, before any other work:

```
1. **Pipeline stamp** (before any other work):
   a. Read spec frontmatter
   b. Set `delivery_stage: {skill-name}`
   c. Append `{skill-name}` to `pipeline_ran` inline list.
      If `{skill-name}` already in list, append `{skill-name}.2` (third time `.3`, etc.).
      Always use inline format: `pipeline_ran: [create-spec, ux, architect]`
      Edit pattern: match `pipeline_ran: [existing, items]`,
      replace with `pipeline_ran: [existing, items, {skill-name}]`.
      If `pipeline_ran` doesn't exist yet, add `pipeline_ran: [{skill-name}]`.
   d. **Predecessor check:**
      - If `pipeline_plan` is absent → skip validation (old spec or inline work).
      - If this skill is the first item in `pipeline_plan` → skip (no predecessor).
      - If `pipeline_ran` is absent or empty → only the first planned skill may proceed.
      - Otherwise: find the skill immediately before this one in `pipeline_plan`.
        If that skill is NOT in `pipeline_ran` (exact match) → stop and tell user:
        "Run `/{predecessor}` first."
   e. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned
      flow. Proceed anyway?" Continue if user confirms.
```

### Skills that also set `status`

- `/dev` and `/fix` — add to stamp: set `status: in-progress` (if not already)
- `/fix` — also sets `status: qa` on completion (QA gate), same as today
- `/verify` — unchanged (sets `status: qa` on passing verdict, not on entry)
- `/ship` — unchanged (sets `status: all-done` during spec close)

### Skill-by-skill changes

| Skill | Current behavior | Change |
|-------|-----------------|--------|
| `/create-spec` | "do NOT add delivery_stage" | Add stamp. Set `delivery_stage: create-spec`. Initialize `pipeline_ran: [create-spec]`. |
| `/create-bug` | "do NOT add delivery_stage" | Same pattern. `delivery_stage: create-bug`, `pipeline_ran: [create-bug]`. |
| `/change-request` | No delivery_stage | Add stamp. `delivery_stage: change-request`. |
| `/challenge-prd` | No delivery_stage | Add stamp. `delivery_stage: challenge-prd`. |
| `/ux` | Sets `2-ux-review` | Replace with `delivery_stage: ux` + append to pipeline_ran. |
| `/research-arch` | No delivery_stage | Add stamp. `delivery_stage: research-arch`. |
| `/architect` | Sets `3-arch-review` | Replace with `delivery_stage: architect` + append to pipeline_ran. |
| `/ui` | Sets `3.5-ui-review` | Replace with `delivery_stage: ui` + append to pipeline_ran. |
| `/generate-tests` | Sets `4-tests-ready` | Replace with `delivery_stage: generate-tests` + append to pipeline_ran. |
| `/spec-review` | No delivery_stage | Add stamp. `delivery_stage: spec-review`. |
| `/decompose` | Sets `5-decomposed` | Replace with `delivery_stage: decompose` + append to pipeline_ran. |
| `/dev` | Sets `uat` at end | Move stamp to entry: `delivery_stage: dev` + `status: in-progress`. Remove `uat` set at end. |
| `/fix` | Clears delivery_stage | Add stamp on entry: `delivery_stage: fix` + `status: in-progress`. |
| `/verify` | Reads `uat` for prod detection | Change prod detection to check `dev` in `pipeline_ran`. Add stamp: `delivery_stage: verify`. |
| `/ship` | Removes `uat` | Remove `delivery_stage` entirely on spec close. Add stamp on entry. |

### `/pick-flow` changes

**"After user confirms" section — before:**
```
- add `flow: <fix|dev|inline|create-spec>` to frontmatter
- log skips to `## Next Steps`
```

**After:**
```
- Keep `flow:` (unchanged)
- Set `pipeline_plan: [ordered list of tracked skills]`
- Set `pipeline_skipped:` with each skipped skill and reason
- Initialize `pipeline_ran: []`
- Do NOT write skip info to `## Next Steps`
```

**Resume logic — before:** 6-row hardcoded table mapping numbered stages.
**After:** diff `pipeline_plan` vs `pipeline_ran`. First item in plan not in ran = resume point. Legacy table kept (collapsed) for old-format specs.

### `.claude/rules/features.md` additions

```markdown
### Pipeline tracking fields (set by skills, not manually)

- `delivery_stage:` — name of last skill that started on this spec.
  Valid: create-spec, create-bug, change-request, challenge-prd, ux,
  research-arch, architect, ui, generate-tests, spec-review, decompose,
  dev, fix, verify, ship. Legacy numbered values accepted but deprecated.
- `pipeline_plan:` — ordered skill list for this spec's flow. Set by /pick-flow. Never deleted.
- `pipeline_ran:` — skills that actually ran, in order. Each skill appends on entry.
- `pipeline_skipped:` — skills intentionally skipped with reason. Set by /pick-flow. Never deleted.
```

### What does NOT change

- `status` kanban values (8 columns)
- `flow` field (stays `fix|dev|inline|create-spec`)
- `spec-compact`, `finish`, `beautify`, `kdd` (no stamp)
- Closed specs in `features/done/` (untouched)

### On spec close (`/ship`)

`delivery_stage` is removed (same as today). `pipeline_plan`, `pipeline_ran`, and `pipeline_skipped` are kept — they're the permanent audit trail of what happened to this spec.

### Scope manifest

| Category | Files | Count |
|----------|-------|-------|
| Skill files (stamp pattern) | create-spec, create-bug, change-request, challenge-prd, ux, research-arch, architect, ui, generate-tests/agent.md, spec-review, decompose, dev, fix, verify/SKILL.md, ship | 15 |
| Pick-flow | pick-flow/SKILL.md | 1 |
| Rules | .claude/rules/features.md | 1 |
| Kanban types | tools/kanban/src/lib/types.ts (DeliveryStage type) | 1 |
| Kanban validation | tools/kanban/lib/scanner-rules.ts (VALID_DELIVERY_STAGE) | 1 |
| Kanban server | tools/kanban/server/api.ts (delivery_stage validation) | 1 |
| Frontmatter fixer | scripts/fix-frontmatter.py (remove qa clearing rule) | 1 |
| Decisions | docs/decisions.md | 1 |
| **Total** | | **22 files** |

## Done-When

- [ ] All 15 tracked skills stamp `delivery_stage` with their skill name on entry
- [ ] All 15 tracked skills append their name to `pipeline_ran` on entry (inline format only)
- [ ] `/dev` and `/fix` set `status: in-progress` on entry
- [ ] `/fix` sets `status: qa` on completion (QA gate)
- [ ] `/verify` sets `status: qa` on passing verdict
- [ ] `/ship` sets `status: all-done` on completion
- [ ] `/pick-flow` writes `pipeline_plan` and `pipeline_skipped` to frontmatter when user confirms flow
- [ ] `/pick-flow` resume logic uses plan-vs-ran diff instead of hardcoded stage table
- [ ] Each tracked skill validates its predecessor is in `pipeline_ran` before proceeding
- [ ] First-skill-in-plan skips predecessor check
- [ ] Skills that aren't in `pipeline_plan` warn but don't block
- [ ] Old-format `delivery_stage` values (numbered) are accepted without validation errors
- [ ] `tools/kanban/` updated: `DeliveryStage` type and `VALID_DELIVERY_STAGE` include new skill-name values
- [ ] `scripts/fix-frontmatter.py` no longer strips `delivery_stage` when `status: qa`
- [ ] `.claude/rules/features.md` documents the new fields and valid `delivery_stage` values
- [ ] `docs/decisions.md` entry explaining design choices
- [ ] `/ship` keeps `pipeline_plan/ran/skipped` on spec close (only removes `delivery_stage`)
