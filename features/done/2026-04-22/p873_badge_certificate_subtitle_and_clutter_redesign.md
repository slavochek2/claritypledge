---
status: all-done
type: change-request
rank: 871.0
changes: p686
tags:
  - redesign
  - p686
  - badge
created_date: 2026-06-02
completed_at: '2026-06-02'
pipeline_ran: [change-request, dev, ship]
---

# P873: Clarity Badge Certificate — Subtitle Correction + Declutter

> **Redesign of:** [P686: Badge Step 1 — Manual Certification](../22_mar_26/p686_badge_step1_manual_certification.md)
> **What was wrong:** The certificate subtitle reads "Verified recursive understanding" — it misnames the construct (the product renamed it away from "recursive understanding") and is opaque jargon to anyone who lands on a shared certificate. Separately, the body is cluttered: the certifier identity is repeated on every point row *and* in the summary, the headline metric (N/9) is the least prominent element, and the point rows are near-identical italic story excerpts with no point identity.

## Operating Mode

> This spec is an **incremental correction** to P686, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P686 (badge infrastructure, earning logic, footer pattern, share/export) are not up for re-examination.

## Problem Statement

The Clarity Badge is the certificate a verified person shares publicly — it is the propagation artifact P686 was built to test ("does the flip propagate through relationships?"). For that to work, a stranger who opens the shared certificate must understand *what was verified*. Today two things block that:

1. **The subtitle misnames and obscures.** "Verified recursive understanding" uses a construct name the product has since dropped (renamed toward "verified understanding"), and "recursive understanding" is jargon an outsider cannot parse. The badge actually certifies a deeper, meta thing: verified understanding **of the practice of verifying understanding itself** — the nine st-points are all claims about *why and how* to verify cognitive understanding. The subtitle should name that in the product's own vocabulary, and a one-line gloss should spell out the recursion in plain language.
2. **The body is unübersichtlich.** The single most important fact (calibrated on N of 9) is buried; the verifier's name is repeated on every row; and the rows read as four lookalike quotes rather than a checklist of distinct, named facets.

P686's problem statement (proof-of-alignment artifact, earned incrementally, emerges from /live) is **still valid** — this corrects how the artifact communicates, not what it certifies.

## Jobs To Be Done

- **Preserved from P686:** certifier recognizes calibrated alignment on a point; badge holder gets a shareable artifact; profile visitor sees a calibration signal without login; product owner reads a propagation signal.
- **Corrected:** *observer of the shared certificate understands what was verified and who verified it* — P686 served this job, but the current subtitle + clutter defeat it.
- **New:** none.

## Current State

`badge-certificate.tsx` (live page at `/p/:slug/badge`) and `export-badge-certificate.tsx` (PNG/social card) render, top to bottom:

- `CLARITY BADGE` (serif heading) + subtitle `Verified recursive understanding` (hardcoded — `badge-certificate.tsx:91`, `export-badge-certificate.tsx:125`).
- A thin 9-segment progress bar, with `N/9` as a small `text-xs font-mono` label beneath it.
- Summary sentence: `"[Name] is calibrated on N of 9 clarity points."` followed by `"Verified by [certifier]."`.
- A list of **only the earned** point rows (`badgePoints.map`). Each row: a long italic story excerpt, then a toggle row reading `› 1 point · Verified by [certifier] · [date]`, expandable to a position pill + point statement.
- Footer: avatar + name + "Since [date]", ClarityLogoMark seal, QR code.

**Before (current):**
```
                 CLARITY BADGE
         VERIFIED RECURSIVE UNDERSTANDING        ← misnames construct, opaque jargon

   ████████░░░░░░░░░                             ← thin 9-seg bar
                  4/9                            ← headline metric is the tiniest element

   Vyacheslav Ladischenski is calibrated on 4 of 9 clarity points.
   Verified by Vyacheslav Ladischenski.          ← verifier stated here...

   ┌──────────────────────────────────────────────────────┐
   │ "I asked someone to paraphrase what I said. They..."  │
   │  › 1 point · Verified by V. Ladischenski · Apr 25     │ ← ...and AGAIN on every row
   ├──────────────────────────────────────────────────────┤
   │ "I had a disagreement with someone close to me..."    │
   │  › 1 point · Verified by V. Ladischenski · Apr 25     │
   ├──────────────────────────────────────────────────────┤
   │ "We were discussing something important and I..."     │
   │  › 1 point · Verified by V. Ladischenski · Apr 25     │
   ├──────────────────────────────────────────────────────┤
   │ "They're known for years. We were on a call..."       │
   │  › 1 point · Verified by V. Ladischenski · May 14     │
   └──────────────────────────────────────────────────────┘
   (four near-identical italic excerpts; no point identity)
```

## Root Cause

Two independent mechanisms:

1. **Subtitle.** P686 deferred the subtitle as `[FOUNDER DECISION: subtitle]` and never decided it. It was later hardcoded to "Verified recursive understanding" by a content-rename commit (`5747ff38`, "rename CP construct 'common belief' → 'recursive understanding'"), not by a design decision. When the construct was renamed again (recursive → verified understanding), the hardcoded string at `badge-certificate.tsx:91` and `export-badge-certificate.tsx:125` was left stale — now both wrong and opaque.

2. **Clutter.** Three layout choices compound:
   - Certifier identity is rendered in the summary (`badge-certificate.tsx:128–137`) **and** on every point row (`:173–182`) — pure repetition whenever the verifier is constant across rows (the common case).
   - The `N/9` metric is `text-xs font-mono` under the bar (`:116–118`) — the headline number is the least prominent element on the certificate.
   - Each row leads with a long italic story excerpt and a `1 point` prefix (`:150–171`) with **no point identity**. The `stGroup` (`st1`…`st9`) is already computed in `badge-service` (`getBadgePointsWithDetails` → `BadgePointDetail.stGroup`) but is never surfaced in the row, so four rows read as lookalike quotes.

## Redesign

Decided copy (founder decisions, locked this session):

- **Subtitle:** `Verified understanding of the clarity protocol` — "protocol" is the product's own term (`definitions.md`: "comprehension protocol", "explain-back protocol"). Styling unchanged (uppercase, small, muted, tracked).
- **Gloss (new, one line, plain language):** `[Name] is verified, point by point, to understand how clarity is reached — and why — and endorses it.` This exposes the recursion the subtitle compresses, for outside viewers. ("…and endorses it" reflects the real earning gate: a point is earned only on an `agree`/`strongly_agree` position — `clarity-live-page.tsx:330`.)

Structural intent:

- **Hero the `N / 9`.** Make the count the visually dominant element; demote the 9-segment bar to a supporting role beneath it. Keep `role="progressbar"` + aria attributes.
- **State the verifier once.** "Verified by [certifier]" stays in the summary block; **remove it from every point row.** Rows keep date only.
- **Give each row a clarity-point identity.** Label each earned row by its `stGroup` (`st1`…`st9`, already on `BadgePointDetail` — no new data/query). Drop the `1 point ·` prefix. The story excerpt becomes secondary to the point label.
- **Apply identically to the export variant.** `export-badge-certificate.tsx` must match, or the shared social/PNG card stays stale.

**After (redesign):**
```
                 CLARITY BADGE
   VERIFIED UNDERSTANDING OF THE CLARITY PROTOCOL   ← product's own word; meta in one phrase

                  ┌─────────┐
                  │  4 / 9  │                       ← hero numeral, primary metric
                  └─────────┘
            ▰▰▰▰░░░░░  clarity points               ← bar demoted to support

   Vyacheslav is verified, point by point, to understand
   how clarity is reached — and why — and endorses it.   ← gloss: recursion in plain words
   Verified by Vyacheslav Ladischenski.                  ← verifier stated ONCE

   ✓ st1   "I asked someone to paraphrase what I said..."   Apr 25
   ✓ st3   "I had a disagreement with someone close..."     Apr 25
   ✓ st6   "We were discussing something important..."      Apr 25
   ✓ st8   "They're known for years. We were on a call..."  May 14
   (each row carries its clarity-point identity; no repeated verifier, no "1 point ·")
```

**Composition (decided):**
- The hero `N/9` **replaces** the "is calibrated on N of 9 clarity points" sentence — the count appears once (in the hero); the gloss carries the meaning. This avoids stating the count three times (hero, sentence, bar).
- Rows stay **earned-only** (current behavior). An all-9 checklist (showing unearned facets as a motivational ladder) is a deliberate non-goal here (not planned).
- The live subtitle uses balanced wrapping so the longer copy does not orphan a word ("PROTOCOL") on its own line on mobile.

**Render-vs-spec deviation (rows):** the implementation keeps the story excerpt as each row's primary element, with the `stGroup` label as secondary metadata — rather than making the label primary as the Redesign prose suggested. Decided after seeing the live render at 320/375/desktop: a raw `st7` leading a row reads as internal jargon to an external certificate viewer, whereas the human story excerpt is the meaningful content. The label still gives each row a distinct identity. Recorded as a deliberate deviation, not a miss.

## Predecessor Sections Superseded

| Section | P686 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Subtitle | `[FOUNDER DECISION: subtitle]` (later hardcoded "Verified recursive understanding") | Superseded | "Verified understanding of the clarity protocol" + plain-language gloss |
| Progress bar priority | "Progress bar: visual N/9 with numeric label" (small label under bar) | Superseded (layout only) | Hero `N/9` numeral; bar demoted to support. Aria attributes preserved. |
| Summary sentence | "[Name] is calibrated on N of 9 clarity points." | Superseded | Removed; count → hero numeral, descriptive clause → protocol gloss |
| Per-point row | "verified ones marked with checkmark + title + date" | Superseded | Row labeled by `stGroup` (st1…st9) + excerpt + date; `1 point` prefix and per-row "Verified by" removed |
| Verifier placement | "Verified by [Certifier Name →]" in body | Extended/clarified | Stated exactly once; per-row repetition removed |

Everything else in P686 (problem framing, JTBD, footer/seal/QR, share/export/OG behavior, earning logic) is **still valid**.

## Requirements

1. Subtitle on both certificate variants reads exactly: **"Verified understanding of the clarity protocol"**.
2. A one-line gloss appears in the body, in plain language, naming what the protocol is (no "recursive" jargon). Decided wording: "[Name] is verified, point by point, to understand how clarity is reached, and why, and endorses it."
3. The `N/9` count is the visually dominant element on the certificate; the segmented bar is supporting. The "is calibrated on N of 9 clarity points" sentence is removed — the count appears once (in the hero), not three times.
4. "Verified by [certifier]" appears exactly once on the certificate; it is removed from every point row.
5. Each earned point row displays its clarity-point identity (`st1`…`st9`), sourced from existing `BadgePointDetail.stGroup`. The `1 point ·` prefix is removed.
6. The export (PNG/social) certificate matches the live certificate in copy and hierarchy.

## What Stays the Same

- Badge data model, `badge-service*`, and earning logic (`clarity-live-page.tsx`) — untouched.
- The certifier/agreement/`is_certifier` logic — untouched.
- Footer: avatar, name, "Since [date]", ClarityLogoMark seal, QR code — unchanged.
- Progress semantics (still out of 9) and aria attributes — unchanged.
- Share buttons, image export mechanism, OG tags — behavior unchanged (only the rendered copy/layout inside the image changes).

## Surfaces in Scope

**In scope:**
- `src/app/components/profile/badge-certificate.tsx` (live certificate — primary)
- `src/app/components/profile/export-badge-certificate.tsx` (PNG/social export — must match)

**Unaffected (not changing):**
- `src/app/data/badge-service*.ts`, `src/app/pages/clarity-live-page.tsx`, `src/app/pages/badge-page.tsx` (data + earning + page shell)
- DB migrations, RLS, `point_positions` / `badge_points` schema
- Profile page badge link, share/OG infrastructure

## Acceptance Criteria

- [x] Subtitle reads "Verified understanding of the clarity protocol" on **both** the live and export certificates (no "recursive understanding" string remains in either file)
- [x] A one-line gloss in the body names the protocol in plain language, no "recursive" jargon
- [x] The `N/9` metric is the visually dominant element; the segmented bar is supporting; the "is calibrated on N of 9" sentence is gone (count appears once)
- [x] Point rows are earned-only (no unearned/all-9 checklist introduced)
- [x] "Verified by [certifier]" renders exactly once; it does not appear on any point row
- [x] Each earned point row is labeled by its clarity-point identity (`st1`…`st9`); the `1 point ·` prefix is gone
- [x] Export PNG matches the live certificate's copy and hierarchy
- [x] Footer (avatar/seal/QR) and share/OG behavior are visually unchanged
- [x] Edge states: partial verified on the live render (4/9 at 320/375/desktop); 0-badge is gated upstream by `badge-page` (certificate not rendered); full shows `9 / 9` in the hero (the old "all 9 clarity points" sentence was intentionally removed with the count-sentence)
- [x] P873 introduces no new test failures — verified against base commit `85f811c3` (base: 7 failed / 9 passed; P873: 6 failed / 11 passed — P873 fixed one). The 6 remaining failures are **pre-existing** P686 test debt (P701 stGroup-collapse makes the no-tags test seeding render 1 row not 3; plus stale a11y / back-link selectors), unrelated to this redesign (pre-existing on `main` before this branch).

## Implementation Notes

Implemented via `/dev` discipline (a Sonnet subagent in worktree w2). `/ux` skipped (copy + hierarchy decided) and `/polish` N/A (its scope card excludes layout/structural changes). eslint / `tsc` / pre-commit clean. Visual-QA pass at 320/375/desktop plus a blind QA subagent; the one genuine issue it surfaced (mobile subtitle orphan) was fixed with balanced wrapping. The blind reviewer's other flags were either approved decisions, the pre-existing P686 footer, or false positives.
