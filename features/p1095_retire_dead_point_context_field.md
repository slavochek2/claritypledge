---
status: backlog
type: task
rank: 95
created_date: '2026-08-17'
tags: [tech-debt, points, schema]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1095: Retire the dead `points.context` field

## Problem

`points.context` has existed since the first points migration (2026-02-04, commented *"optional explanation/background"*). Verified 2026-08-17:

- **Nothing writes it.** `createPoint` accepts a `context` argument, but the only production caller (`story-detail-page.tsx:169`) passes `undefined`. No form, no page, no script sets it.
- **One surface renders it** — the compact feed card, clamped to three lines with an expand control. The point **detail** page uses a different component that never renders it, which is why it is invisible on `/point/:id`.

So it reads as available capacity to any agent scanning the schema, while being a field the product does not have. The risk is not the dead column; it is an agent deciding to *use* it and putting a point's grounding somewhere only one of two surfaces displays.

**Grounding belongs in a linked Story** — a Story renders on both the feed and the detail page, carries the quotes that make a point answerable out of context, and is the model's own answer to "why does this point exist". A parallel half-rendered text field competes with that for no gain.

## Appetite

**Low blast radius, entirely internal.** No user sees a change either way. **Reversible** — a dropped column is restorable from migration history; a deprecation comment is a one-line revert.

**Decision density: one** — remove the column, or keep it and mark it.

## Solution

Two stages, and only the first has been done:

1. **Done 2026-08-17:** deprecation comment on the row type in `points-service-real.ts`, stating the verification and pointing at this spec. This is the part that actually prevents the failure mode.
2. **Not done:** remove the column and its render. Requires a migration, the `createPoint` signature change (its `context` parameter is positional — callers and both service implementations plus the interface move together), removal of the feed-card render block, and the type update.

## Risks / Non-Goals

### Risks

- **The column may hold rows on prod that nobody knows about.** **MITIGATE:** count non-null values on prod before any drop; if any exist, decide where the content goes before dropping.
- **`createPoint`'s `context` parameter is positional**, so removing it silently shifts `tags` and `visibility` at every call site. **MITIGATE:** whoever does stage 2 changes the signature to an options object, or removes the parameter last, with a typecheck between each step.

### Non-Goals

- **Do NOT write to this field in the meantime** — including in any points-filing skill or script.
- **Do NOT expand the field's rendering** to the detail page "so it can be used". That is the opposite of this spec.
- **Do NOT remove the feed card's render before the column** — leaving a column with no reader is safer than a reader with no column.

## Done-When

- [x] Deprecation comment in place, stating what was verified and when
- [ ] Non-null count on prod recorded (expected: zero)
- [ ] Column removed, `createPoint` signature updated, feed-card render removed, typecheck and tests green
- [ ] `grep -rn "\.context" src/app/data/points-service-real.ts` returns nothing for the point row type
