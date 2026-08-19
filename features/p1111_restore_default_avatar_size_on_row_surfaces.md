---
status: week
type: task
rank: 44
created_date: '2026-08-19'
tags: [avatar, identity, density, p1104]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1111: Restore the app's default avatar size on the row surfaces that shrink it to 20px

## Problem

**Situation:** The app has one avatar default and it is **40px** — `GravatarAvatar size="sm"` resolves to `w-10 h-10`, and 29 of the 58 call sites use it. Measured 2026-08-19.

**Complication:** Twelve call sites override it down to **20px** with `!w-5 !h-5`, and **ten of those twelve are the identity rows people actually read** — the position-holder row, the story-detail identity rows, the story and point cards, the profile page. At 20px an avatar carries almost no identity: a photograph, a robotified portrait and a coloured initials circle all resolve to the same small dark disc. P1104 measured this directly — a machine-generated portrait and the real photograph of the same person are **indistinguishable at 20px**, and become clearly distinguishable at 40px.

There is also a standing cost already recorded in the code. `point-detail-page.tsx:774` carries the comment *"P852 Round-E: pledger ring restored at compact size — semantic correctness over clip aesthetics"* — the ring was knowingly shipped in a state where it clips, because the avatar is too small to hold it. The 20px override is what forced that trade.

**Question:** Should these ten rows return to the app's own default, and what does the added row height cost on a dense list?

## Appetite

**Medium blast radius.** Ten call sites across five files, all of them surfaces people look at daily. Nothing about data, auth or schema changes — this is size and the layout consequences of size.

**Fully reversible** — the change is removing (or widening) a className override per site. Revert is a one-line-per-file diff with no migration and no state.

**Decision density: one founder decision** — whether the added row height is acceptable on lists that are scanned rather than read. That is a judgement about the product's feel, not something measurable in advance, so it wants a screenshot rather than an argument.

## Solution

Replace the `!w-5 !h-5` override with the component's own `size="sm"` (40px) at the ten in-scope sites, and let the row geometry follow.

The two remaining 20px sites are in partner-session views (`live-mode-view.tsx:645`, `live-story-card-expanded.tsx:310`). They are **in scope for the audit, not automatically for the change** — partner sessions are a 1:1 surface with different density needs, so they are looked at and then either changed or listed with a reason.

**Why this is worth doing on its own terms**, independent of P1104:

- **Identity becomes legible.** A pledge ring, an avatar colour and a face all carry meaning that 20px destroys. The product renders all three and then hides them.
- **It retires a knowingly-bad trade.** The P852 Round-E comment documents shipping a clipping ring because the avatar was too small. At 40px the ring has room, and that comment can go.
- **It makes P1104's portrait channel primary rather than supporting.** P1104 ships at 20px with the square silhouette doing the work; at 40px the robotified portrait does it too, and the marker gets a second independent channel for free.

**Why it was split out of P1104 rather than folded in:** P1104's own constraint is that its change be additive and touch nothing about how *people* render. This changes every human row on ten shipped surfaces. Folding it in would have made P1104's correctness depend on a density judgement that has nothing to do with disclosure — and if the density call later went the other way, the revert would have weakened the marker as a side effect.

### Sequencing against P1109

`features/p1109_pledger_ring_missing_on_story_detail_identity_row.md` is a bug in `StoryCardDetail.tsx` — the identity row's props interface never declared `authorHasPledged` or `authorAvatarColor`, so the row passes `isPledger={false}` literally. **P1109 lands first.** Two reasons: it is a correctness fix and this is a presentation change; and this spec makes the ring far more visible, so shipping this first would amplify a known-wrong ring rather than a right one. The two touch overlapping lines in the same file — do not run them concurrently in separate worktrees.

## Risks / Non-Goals

### Risks

- **Row height grows and list density drops.** A 20px avatar in a 12px-padded row yields roughly a 44px row; 40px yields roughly 64px. On a point with many position holders this is the difference between scanning and scrolling. **MITIGATE:** produce before/after screenshots of the longest real list at desktop, 375px and 320px, and put the density question to the founder as a picture rather than a number. If it is judged too loose, the fallback is 32px at the affected sites — still double the current size, still enough for the ring — not a return to 20px.
- **Narrow viewports are where this bites.** A wider avatar plus a name plus an ear badge plus a position badge plus a story pill compete for a 320px row; the name gets less room and truncates earlier. **MITIGATE:** 320px is an explicit test case, not an inferred one. The truncation behaviour must be looked at, not assumed — P1104 measured that name truncation at 320px is what destroys a trailing disclosure marker.
- **The pledger ring needs offset room it did not have.** `ringClasses.sm` is `ring-2 ring-offset-2`, which was clipping at 20px. At 40px it should sit correctly, but "should" is not evidence. **MITIGATE:** screenshot a pledger avatar at every changed site and confirm the ring is unclipped on all four sides.
- **Ten sites is enough to miss one.** **MITIGATE:** the completion check is a grep returning zero unexplained `!w-5 !h-5` occurrences, not a count of files edited.

### Non-Goals

- **Do NOT change `GravatarAvatar` itself** — not its `sizeClasses`, not its `ringClasses`, not its defaults. Every other call site in the app depends on those values. The change is at call sites only.
- **Do NOT touch the 24px, 28px or 32px sites** (letters, profile picker, sessions). They were not part of this measurement and have their own density reasons.
- **Do NOT change row padding, gaps, badge sizes, or the story pill** to compensate for the new height. If the row needs those, that is a design change and belongs in its own spec — adjusting five other values to absorb one is how a size change becomes a redesign.
- **Do NOT add a size prop, config value, or feature flag** to make this switchable. Two constants for one decision is worse than the decision.
- **Do NOT run concurrently with P1109** — overlapping lines in `StoryCardDetail.tsx`.
- **Do NOT let this block P1104.** P1104 ships at 20px and is correct at 20px by design.

### Alternatives Considered

- **Fold it into P1104.** Rejected on coupling, not effort: it would tie a disclosure guarantee to a density judgement, so a later density revert would silently weaken the marker.
- **32px instead of 40px.** A genuine middle path — enough for the ring, less height. Rejected as the *opening* position because it invents a fourth size the app does not otherwise use; retained as the named fallback if 40px reads too loose.
- **Leave 20px and rely on the square silhouette alone.** Coherent, and it is exactly what P1104 ships. Rejected as the end state because it permanently spends the avatar slot on a single bit of information (person / not-person) when the same slot could carry identity as well.
- **Change `size="sm"` to mean 20px and move everything else up a step.** Rejected — it redefines a value 29 call sites already depend on, to avoid editing 10.

### Rollback Strategy

Restore the `!w-5 !h-5` className at each changed call site. One line per site, no migration, no data, no state. If the density judgement goes against it after shipping, the fallback to 32px is the same edit with a different value.

## Done-When

- [ ] `grep -rn '!w-5 !h-5' src/` returns only sites explicitly listed here with a reason — output pasted
- [ ] Before/after screenshots of the longest real position list at desktop, 375px and 320px — pasted, and the density question put to the founder explicitly
- [ ] A pledger avatar screenshotted at every changed site with the ring unclipped on all four sides
- [ ] Name truncation at 320px checked at each changed site and reported — not assumed unchanged
- [ ] The `P852 Round-E` comment at `point-detail-page.tsx:774` removed or rewritten to match what is now true
- [ ] The two partner-session sites either changed or listed here with the reason they were not
- [ ] P1109 confirmed shipped before this starts
