---
status: rejected
type: task
rank: 39
workstream: events
created_date: '2026-08-18'
tags: [refactor, identity, avatar, agents]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1107: One identity component for showing a person

> **REJECTED 2026-08-19, before any implementation.** Filed to give `features/p1104_agents_must_be_visually_distinguishable.md` a single place to add its marker, on the assumption the marker had to be threaded into each surface as data. That assumption was wrong: because the account list is a constant in application code rather than a database column, any render site can look the marker up with the identifier it already holds (verified 2026-08-19 across six surfaces). There is nothing to unify. Adversarial review additionally found two of the nine named surfaces were wrong — `PointHeader` renders no avatar, `compact-profile-card` has no importers — and that the "nothing changes visually" bar was unenforceable, since no visual-diff tooling exists in this repo. The incident evidence in the Problem section below did not survive checking either: P697 and P940 were fetch-layer bugs a render component could not have prevented, P793 was a visibility guard, and P75→P76 was planned debt rather than an escaped defect. **Kept as a record, not as work.** One real defect surfaced during the review and is filed separately: `StoryCardDetail.tsx:567` hardcodes `isPledger={false}` while its structural twin `story-card-with-links.tsx:581` reads `authorHasPledged ?? false`, so a pledger's ring never renders on that row.


**Blocking** `features/p1104_agents_must_be_visually_distinguishable.md`. P1104 must add one branch to every surface that shows a person; today there is no single place to add it.

## Problem

**Situation:** 29 non-test files import `GravatarAvatar` directly and hand-assemble the same row — avatar, name, pledger ring, `EarBadge`, position badge. A shared `PersonRow` component exists at `src/app/components/shared/PersonRow.tsx`; it is imported by **exactly one file**, `src/app/prototypes/events/components/EventDetail.tsx`, which is a prototype. Every production surface composes the pieces itself.

**Complication:** This has already produced the same class of defect at least five times, each caught late and each on a different subset of surfaces:

| Recorded | What broke |
|---|---|
| P75 → P76 (2026-01-19) | Inline avatar-with-ring implementation, logged as debt at creation, scheduled for refactor onto `GravatarAvatar` |
| P793 (2026-04-23) | Identity row showed the wrong person on **three** surfaces; `story-card-with-links.tsx` was missed in scoping and caught only in code review |
| "by {name}" removal (2026-03-17) | Fix needed in **four** surfaces; `profile-page-v2.tsx` "bypasses the shared component" and the founder reported the fix hadn't worked |
| P697 | Letter reads omitted `avatar_url`, `avatar_color`, `has_pledged` — recipients saw initials, no ring, invisible to TypeScript and to tests |
| P940 (2026-06-16) | Ear count differed between profile and event page; the select column list had been copy-pasted ~15×. Founder framed the target as *"Google photo + pledge ring renders the same everywhere"* |

P1104 now needs to add an agent marker, suppress the pledger ring, and suppress the ear count — on nine of these surfaces. On the current structure that is nine independent edits with nine independent chances to be missed, and a missed one renders a machine as a person. That failure is silent: nothing errors, nothing fails a type check, and the surface simply keeps looking human.

**Question:** What is the smallest structural change that makes "how a person is shown" have exactly one definition, so that P1104 — and the next change after it — is one edit rather than nine?

## Appetite

**High blast radius by reach, low by depth.** Every surface that shows a person is touched; none should change what it renders. **Reversible** — the component is additive and each surface migrates independently, so rollback is per-surface, not all-or-nothing.

**Decision density: one founder decision** (scope, below). The rest is mechanical.

## Solution

Direction only; `/architect` owns the design.

**One component that owns the identity row for a person** — the avatar, the name, the pledger ring, the ear count, the badge slots, and the accessible name — with the existing surfaces calling it instead of assembling those pieces themselves.

**The verification bar is that nothing changes.** For a person, every migrated surface must render identically before and after, at every size it currently renders at. A visual difference is a defect in this spec, not an improvement.

**Scope — `[FOUNDER DECISION]`.** Migrate the nine surfaces P1104 needs, or all 29?

- **Nine** (recommended): the point-page position row, the crawler share card, the accessible name, the feed story card, the story detail page, story-card-with-links, point-card-with-links, PointHeader, and the profile page. Covers everywhere an agent can currently be seen. Leaves 20 surfaces unmigrated and a documented follow-up.
- **All 29:** one definition everywhere, and 20 surfaces changed that nobody is currently testing.

Recommending nine because the twenty carry no agent and the change would be unverified against its own bar.

## Risks / Non-Goals

### Risks

- **Silent visual regression.** The surfaces differ in small ways today — sizes, ring suppression at compact sizes, which badges appear. A unified component averages them and the difference shows up on a screen nobody opened. **MITIGATE:** before/after screenshots per migrated surface, at the sizes each currently uses; the diff is the evidence, not the test suite.
- **The component grows a prop per surface** and stops being one definition while still looking like one. **MITIGATE:** if a surface needs a prop no other surface uses, that is a signal the surface should stay unmigrated — record it as an exception with its reason rather than widening the component.
- **A partial migration is worse than none for P1104's guarantee**, because "the marker lives in one place" becomes true only for the migrated set. **MITIGATE:** P1104 asserts the marker per surface against its own list, and does not rely on this spec's completeness.
- **The compact-size ring behaviour is deliberate, not incidental.** `point-detail-page.tsx` carries an explicit note that the pledger ring was restored at compact size, choosing semantic correctness over clipping. **MITIGATE:** read that reasoning before normalising ring behaviour; it is a decision, not drift.

### Non-Goals

- **Do NOT change what any surface renders for a person.** No spacing fixes, no visual improvements, no "while I'm here."
- **Do NOT touch the data or fetch layer.** See Alternatives Considered — a canonical data shape was evaluated and rejected on this repo's own evidence.
- **Do NOT implement the agent marker here.** That is P1104. This spec makes the place for it; it does not fill it.
- **Do NOT migrate a surface whose needs do not fit** — list it as an exception instead.
- **Do NOT delete `PersonRow`** without checking the prototype that imports it.

### Alternatives Considered

- **A canonical person shape at the data layer (`toPersonRef()`).** **Already rejected in this repo**, 2026-06-16 under P940, on the grounds that `PersonRef` carried no ear count, no ear surface consumed it, and routing through it "would force consumer reshaping (cosmetic, high-churn) for zero correctness gain." That rejection stands and this spec does not reopen it — it operates at the **render** layer, not the fetch layer, and the correctness gain here is concrete rather than absent: the agent marker must appear on every surface, and today each surface decides independently whether it does. The two are different changes with different arguments; the earlier one should not be re-litigated by this one.
- **Do nothing; implement the agent marker nine times.** Delivers P1104 without this spec. Rejected on the recorded evidence above: five separate incidents where a cross-surface change missed a surface, two of them caught only by the founder or a reviewer after the fix was believed complete.
- **A select-guard style mechanism** (the P940 answer — one source column plus an extractor plus a guard). Correct for the fetch layer and already shipped there. It does not address rendering, which is where the agent marker lives.

### Rollback Strategy

Each surface migrates independently. Reverting one surface is restoring its previous composition; reverting the whole spec is reverting those commits and leaving the new component unused. No data, no schema, no external state.

## Done-When

- [ ] One component exists that owns the person identity row — avatar, name, ring, ear count, badge slots, accessible name
- [ ] Every surface in the agreed scope calls it; each surface outside that scope is listed with the reason it was excluded
- [ ] Before/after screenshots for each migrated surface, at the sizes it currently renders at, showing no visual change for a person — output pasted
- [ ] The accessible name for a person is produced in one place, verified by reading the rendered label on at least two migrated surfaces
- [ ] `grep` for direct `GravatarAvatar` imports returns only the new component plus the documented exceptions — output pasted
- [ ] No prop exists on the component that only one surface passes, or each such prop is recorded with its reason
- [ ] Founder decision on scope answered and recorded in this spec
