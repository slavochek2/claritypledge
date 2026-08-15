---
status: backlog
type: story
rank: 57
created_date: '2026-04-24'
tags: [versioning, points, ui]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P801: Point Supersede — Author UI (D1-full)

## Problem

Point authors (tracked via `points.first_validator_id`) cannot currently supersede their own points via UI. [P800](./done/2026-04-22/p800_point_supersede_schema.md) (D1-mini) establishes the schema (`points.superseded_by`), the display filter, and the banner/history view — but restricts write access to founder-only manual SQL. As non-founder users begin authoring points, they will need a UI path to mark their own points as superseded by their own successors.

**Blocked by:** P800 must ship first, and non-founder point authoring must exist or be imminent.

## Appetite

**Blast radius:** Medium — new UI surface, new SECURITY DEFINER RPC with authority check. No schema change (P800 did that). Potential privacy implications if `first_validator_id` becomes visible.

**Reversibility:** High — additive feature, feature-flaggable, can be disabled without schema change.

**Decision density:** Medium — open questions include privacy of author field, undo/revert UX details, error handling when picker is empty (author hasn't written a successor yet).

## Design Rationale

P800 ships the schema, the display filter, and the banner — everything needed for supersede to work — but restricts *setting* the pointer to founder-only manual SQL. This is the honest scope for today: no non-founder user currently authors points, so no one needs the button yet. P801 adds the user-facing authoring path once non-founder point authoring exists (or is imminent).

The split exists because shipping schema and UI together would double the risk surface for zero current benefit. P800 proves the model works on founder content first; P801 then adds the UI atop proven infrastructure.

## Solution

**What changes for users when this ships:**

- A point author — any user who originally created a point — sees a "Supersede this point" option on that point's detail page. Other users do not see this option.
- Clicking it opens a picker listing points the same author has written in the same story grouping and same variant (main or anti), excluding points that are already part of a supersede chain. They pick one; a confirmation prompt states clearly that positions do not transfer and that the old point remains visible with a banner pointing to the new one.
- They can also undo a supersede — clearing the pointer — from the same surface.
- Everything else (the banner, the version history, the display filter) already exists from P800; this spec only adds the write path.

**What's being built (sketch only — full design when the spec is pulled from backlog):**

- UI affordance on point detail, gated by author identity.
- Server-side authority check enforced via RPC (not just UI gating) — re-validates all P800 invariants at write time.
- **New UPDATE RLS policy on `points` scoped strictly to the `superseded_by` column**, gated by `auth.uid() = first_validator_id`. P800 ships with no UPDATE policy at all on `points` (writes go through `service_role` only); P801 is the first spec to introduce authenticated-user UPDATE access, and the policy must remain narrowly scoped so no other column becomes writable. The SECURITY DEFINER RPC is the primary write path; the RLS policy is defense-in-depth.
- Undo / unlink flow.
- Error handling for the empty-picker case (author hasn't written any eligible successor yet).

Reuses P800's existing banner and history view. No new schema.

## Risks / Non-Goals

### Risks

- **Author-abuse vector:** author declares supersede to redirect social gravity from a strongly-endorsed P1 to a semantically different P2. Mitigation: positions never transfer (P800 invariant); banner on P1 stays visible; endorser profiles keep P1 in their history regardless of supersede status; visibility scope already limited to "story linked points" surfaces (P800).
- **Empty picker:** author clicks "Supersede" before filing a successor. Mitigation: button disabled with tooltip "First file a successor point in the same story and variant."
- **`first_validator_id` privacy:** no current UI surfaces this field. If P801 requires showing "authored by X" anywhere, a privacy review is needed.

### Non-Goals

- **Do NOT** auto-carry positions (P800 invariant).
- **Do NOT** aggregate endorser counts across chain (P800 invariant).
- **Do NOT** allow cross-variant supersede (P800 invariant).
- **Do NOT** allow branching chains (P800 invariant).
- **Do NOT** add active notifications to v1 endorsers. Banner remains the discovery path.
- **Do NOT** expand scope to "any user can supersede any point" — authority is strictly `first_validator_id`.

## Done-When

- [ ] Placeholder — full Done-When list to be elaborated when this spec is pulled from backlog.

## Dependencies

- **Hard dep:** P800 (D1-mini) must be shipped
- **Soft dep:** non-founder point-authoring flow must exist or be actively imminent — no consumer for the button otherwise

## Related Specs

- **Depends on [P800](./done/2026-04-22/p800_point_supersede_schema.md)** — schema and display come from there; this spec adds the UI layer.
