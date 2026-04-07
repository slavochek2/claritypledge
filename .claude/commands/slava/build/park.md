---
name: park
description: "Park a feature on its branch without merging to main. Use when work is done but you're not ready to ship yet."
when_to_use: "When a feature is complete (or verified) on its branch but you want to defer merging. Triggered by /park, 'park this', 'done but don't merge yet'."
version: 1.0.0
---

# /park

Park a feature on its branch without merging. No review gates, no prompts — just a frontmatter stamp.

```
/park p665
```

---

## Pipeline Stamp (P659)

Before any other work in this skill:
1. Read spec frontmatter
2. Set `delivery_stage: park`
3. Append `park` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, park]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [park]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `park` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → proceed silently (parking is always valid as an ad-hoc action).

---

## What it does

1. **Find the spec** — resolve P-number from argument. Look in `features/p{N}_*.md`.
2. **Set delivery_stage** — `delivery_stage: park` (pipeline stamp already did this).
3. **Report:**

```
P{N} parked on branch feature/p{N}-xxx.
Run /ship p{N} when ready to merge to main.
```

That's it. No pre-commit checks, no review gates, no interactive prompts.

---

## When to use

- Feature is done on branch, you want to merge later (not now)
- Feature passed `/verify` but you're batching merges
- You're switching context and want to mark progress

## What it does NOT do

- Does not change `status:` — it stays whatever it was (`in-progress`, `qa`, etc.)
- Does not merge anything
- Does not run reviews or tests
- Does not move the spec to `features/done/`

---

## Related

- `/dev` — implements the feature (stops at UAT gate on branch)
- `/verify` — live UAT (sets status: qa on pass)
- `/ship` — merges to main and closes the spec
