---
status: rejected
type: task
rank: 55
created_date: '2026-04-17'
tags: [avatar, design-system, letters, p725-followup]
closed_at: '2026-08-14'
---

# P744: Add `xs` size to PersonAvatar/GravatarAvatar + restore pledge ring on inline participant rows

> **Closed 2026-08-14 — backlog triage.** The user-facing outcome shipped in **P852**: the pledge ring is restored on inline participant rows (`letter-participant-row.tsx:57-64`), via a CSS override rather than the `xs` size token this spec proposed. Remaining item is cosmetic debt, not a feature gap.
>
> Full reasoning and the adversarial review that produced this call: session plan v2, 2026-08-14.

## Problem

**Situation:** P725's `LetterParticipantRow` renders "Letter to [avatar] [Name]" inline with surrounding text on the letter-reading cover, completion summary, and results header. The shared `PersonAvatar` / `GravatarAvatar` smallest size is `sm: w-10 h-10 (40px)`; with the pledge `ring-2 ring-offset-2` it reads ~48px — a standalone profile card next to 14px text.

**Complication:** P725 shipped a local `CompactAvatar` (24px, initials or photo, no ring) inside `letter-participant-row.tsx` as a short-term fix. This drops the pledge ring on an identity surface — inside the ClarityPledge brand, where the pledge ring is the canonical signal that someone has taken the pledge. Inline visibility of the pledge state is a product value, not a nice-to-have.

**Question:** How do we restore the pledge ring on inline participant rows without reintroducing the 40px visual weight that the UAT feedback rejected?

## Appetite

Small. One shared component change, one call-site cleanup. Low blast radius — adding a size option is additive; no existing `sm/md/lg/xl` consumer is affected. Reversible.

## Solution

1. Add `xs: "w-6 h-6 text-[10px]"` to `sizeClasses` in `src/components/ui/gravatar-avatar.tsx`.
2. Adjust `ringClasses.xs` to a tighter offset (`ring-1 ring-blue-500 ring-offset-1 ring-offset-background`) so the pledge ring doesn't clip at 24px.
3. Widen `PersonAvatarProps.size` and `GravatarAvatarProps.size` unions to include `"xs"`.
4. Replace the local `CompactAvatar` inside `src/app/components/letters/letter-participant-row.tsx` with `<PersonAvatar person={person} size="xs" />`; delete the helper.
5. Lift the `@deprecated` marker from `LetterParticipantRow.hasPledged` — the prop is live again.
6. Verify on all three consumers (reading cover, completion summary, results header) that the pledge ring renders correctly at 24px and doesn't break the inline flow.

## Risks / Non-Goals

### Risks
- **Ring offset clipping at 24px:** `ring-offset-2` on a 24px circle visually overlaps adjacent text. The `ring-offset-1` variant mitigates this but changes the established ring visual on this one size. Accept — the ring tightens along with the avatar. Document the offset variance.
- **Accidental adoption elsewhere:** once `xs` exists on the shared component, unrelated surfaces may reach for it without the same compact-context justification. Mitigate via a doc line in `person-avatar.tsx` header: "xs is for inline-text identity only; prefer sm/md for standalone profile surfaces."

### Non-Goals
- No redesign of `PersonAvatar` / `GravatarAvatar` API.
- No change to the existing `sm / md / lg / xl` sizes or ring offsets.
- No re-introduction of an avatar on inbox/sent rows (spec P725 AD6 keeps them name-only).

## Done-When

- [ ] `GravatarAvatar` accepts `size="xs"` and renders a 24px circle with a tight pledge ring for pledgers.
- [ ] `PersonAvatar` forwards `size="xs"` to `GravatarAvatar`.
- [ ] `LetterParticipantRow` uses `PersonAvatar size="xs"` instead of `CompactAvatar`; the local helper is deleted.
- [ ] `@deprecated` marker on `LetterParticipantRow.hasPledged` is removed.
- [ ] Visual check on all three surfaces (reading cover, completion summary, results header) confirms the ring is visible for pledgers and doesn't clip.
- [ ] No regression in `sm / md / lg / xl` usage elsewhere (grep: `size="sm"`, `size="md"`, `size="lg"`, `size="xl"`).

## References

- [P725 decisions.md entry](../docs/decisions.md) — originating context
- [src/components/ui/gravatar-avatar.tsx](../src/components/ui/gravatar-avatar.tsx) — size registry
- [src/app/components/letters/letter-participant-row.tsx](../src/app/components/letters/letter-participant-row.tsx) — current consumer
