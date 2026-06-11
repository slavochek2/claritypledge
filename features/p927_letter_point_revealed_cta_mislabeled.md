---
status: week
type: bug
rank: 1000927.0
severity: medium
date_reported: '2026-06-11'
created_date: '2026-06-11'
tags: [letter-reading, cta, lead_count, p898]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P927: Letter reading — "Read X's story" CTA shown when the button does NOT go to the story

## Summary

On the letter-reading `point-revealed` screen the primary CTA is hardcoded to `Read {name}'s story`, but `advanceFromPointReveal` routes three different ways depending on the story's `lead_count` (P898) and point count. The label is only correct for the default single-lead-before-story shape; for multi-lead stories and single-point stories it tells the reader "Read X's story" and then takes them to a *point* or to the chapter end instead.

## Root Cause

The label at `letter-flow-content.tsx:593` was written when the `point-revealed` phase could only ever appear immediately before the story (the original "exactly one point leads, then the story" shape). Two later changes made `point-revealed` reachable in positions where the next screen is **not** the story, but the label was never generalized:

- **P898** (`lead_count`) — authors can now mark ≥2 points as pre-story leads (`toggleLead` increments `lead_count` with no cap). For every lead except the last, `advanceFromPointReveal` goes to the **next lead point**, not the story.
- **D36 single-point walk** (predates P898) — a story with exactly 1 visible point renders story-first, so `point-revealed` fires **after** the story and `advanceFromPointReveal` goes to the **chapter transition**.

`advanceFromPointReveal` (`useLetterReadingState.ts:642-665`) is the source of truth for where the button goes:

| Config | point-revealed shows | Button actually goes to | Label rendered | Correct? |
|---|---|---|---|---|
| V≥2, `lead_count = 1` (default) | the single lead point | story | "Read X's story" | ✅ |
| V≥2, `lead_count ≥ 2`, not-last lead | an early lead point | **next point** | "Read X's story" | ❌ → "Next point" |
| V = 1 (single-point, story-first) | the point, after the story | **chapter end** | "Read X's story" | ❌ → "Complete Letter" / "Next chapter" |

The two sibling CTAs already do this correctly: `story-revealed` (`:688`) and `remaining-point-revealed` (`:788`) compute their labels with inline IIFEs that mirror their advance functions. `point-revealed` is the lone hardcoded outlier.

## Reproduction Steps

**Case A — multi-lead (P898):**
1. As an author, open a doc/story with ≥3 visible points.
2. Mark **two** points as "before story" (lead) so `lead_count = 2`.
3. Seal + read the letter as the receiver.
4. On the first lead point, submit a position → reach `point-revealed` for lead #1.
5. Observe: CTA reads "Read {name}'s story", but clicking it shows the **second point**, not the story.

**Case B — single-point story (D36, default):**
1. Read a letter whose story has exactly **1 visible point** (no `lead_count` set).
2. Walk: rate story → story-revealed → "Next point" → submit position → `point-revealed`.
3. Observe: CTA reads "Read {name}'s story" even though the story was already read; clicking it ends the chapter (Complete Letter / Next chapter).

**Reproduction rate:** Case A — 100% (any `lead_count ≥ 2`). Case B — code-traced 100%, **needs live-render confirmation in `/reproduce`** (this is the only open empirical question).

## Expected Behavior

The `point-revealed` CTA label matches where the button actually goes:
- next lead point coming → **"Next point"**
- story coming (last lead) → **"Read {name}'s story"**
- chapter end coming (single-point story-first) → **"Complete Letter"** (final story) or **"Next chapter"**

## Actual Behavior

The CTA always reads **"Read {name}'s story"** on the `point-revealed` screen, regardless of destination — misleading the reader in the multi-lead and single-point cases.

## Affected Files

- `src/app/components/letters/letter-flow-content.tsx` — line ~593, hardcoded `label={`Read ${firstName}'s story`}` in the `point-revealed` phase block
- `src/app/hooks/useLetterReadingState.ts` — lines 642-665, `advanceFromPointReveal` (destination logic the label must mirror)
- Reference (already-correct siblings to mirror): `letter-flow-content.tsx:688` (`story-revealed` CTA IIFE), `:788` (`remaining-point-revealed` CTA IIFE)

## Severity

**Medium** — the reading walk still completes; the defect is a misleading CTA label that misrepresents the next action. Affects any story authored with `lead_count ≥ 2` and (pending confirmation) every single-point story. No data loss, no blocked flow.

## Fix Approach

Extract the `point-revealed` label into a **pure function** over `(effectiveLeadCount, currentPointIndex, visiblePointCount, isFinalStory)` that mirrors `advanceFromPointReveal`'s branch conditions, then render it in place of the hardcoded string — the same IIFE/pure-helper pattern the two sibling CTAs already use. A pure function keeps the regression test a cheap unit test rather than a brittle full render.

**Surface-spread check (done):** grepped the three CTA sites — only `point-revealed` is hardcoded; `story-revealed` and `remaining-point-revealed` already compute dynamically and `story-revealed`'s branches were verified correct. No other surface carries this pattern.

## Acceptance Criteria

- [ ] Multi-lead (`lead_count ≥ 2`): on a non-last lead's `point-revealed`, the CTA reads "Next point" and clicking it shows the next point.
- [ ] Multi-lead, last lead: CTA reads "Read {name}'s story" and clicking it shows the story.
- [ ] Single-point story (V=1, story-first): on the point's `point-revealed`, the CTA reads "Complete Letter" (final story) or "Next chapter" (not "Read {name}'s story").
- [ ] Default single-lead story (V≥2, `lead_count = 1`): CTA still reads "Read {name}'s story" — no regression.
- [ ] Regression test asserts the label per config `(leadCount, pointIndex, visibleCount, isFinalStory) → label` — closes the gap where P898 tested hook transitions but never the rendered CTA.
- [ ] No console errors during the affected reading flows.
