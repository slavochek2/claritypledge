---
status: qa
type: bug
rank: 1000817
severity: medium
workstream: letters
tags: [letters, drawer, scroll, layout, p777, p794]
created_date: '2026-04-25'
date_reported: '2026-04-25'
changes: p777
chain_root: p777
flow: fix
delivery_stage: fix
pipeline_ran: [fix]
---

# P817: Letter rating drawer clips story text — port P794 calibration to letters

## Problem

P794 calibrated `/live`'s rating drawer clearance to 280px (worst-case `<ComprehensionRatingCard>` with Submit + Skip + Back). Letter reading + preview kept P777's 96px, which was sized for plain Submit/Next buttons (~80px tall).

The same `<ComprehensionRatingCard>` (~244–280px) renders in both surfaces, so during the letter `story-rate` phase, the rating drawer clips the last line of the story text — recipients cannot scroll to read the bottom.

Affected surfaces (3 page-wrapper call sites with `pb-[calc(env(safe-area-inset-bottom)+96px)]`):
- `src/app/pages/letter-reading-page.tsx:1141` (`LetterReadingFlow` — live letter recipient)
- `src/app/pages/letter-reading-page.tsx:1248` (`LetterReadingFlowPublic` — recipient opens from inbox; the screenshot path)
- `src/app/pages/letter-preview-page.tsx:132` (sender preview before sealing)

P794 spec line 21 explicitly noted the same fix should land in letter pages, but only the simple-button case (96px) was ever fixed by P777 — the rating-card case was missed.

## Appetite

3 one-token edits in 2 files + 1 canary test extension. No new components, no DB migration, no styling decisions. Pure port of an already-validated calibration. Single-concern bug fix; routes through `/fix`.

## Solution

Bump `+96px` → `+280px` at all three call sites listed above. Append one short sentence to each existing P777 `min-h-[100dvh]` comment pointing to P794 as the source of the magic number.

The diff at each site:

```diff
-          <div className="max-w-2xl mx-auto px-4 pb-[calc(env(safe-area-inset-bottom)+96px)]">
+          <div className="max-w-2xl mx-auto px-4 pb-[calc(env(safe-area-inset-bottom)+280px)]">
```

**Calibration sanity:** Letter `<ComprehensionRatingCard>` at `letter-flow-content.tsx:259–264` is invoked WITHOUT `onSkip`/`onBack`, so the actual card is *shorter* than /live's worst-case (Skip + Back present). 280px is therefore conservative for letters (slight over-allocation; never under). Residual risk: the letter question text wraps to 2 lines on narrow viewports (~24px headroom eaten); 280px is still within margin, but if QA on iPhone SE / 320px width finds clipping, bump to 304px in a follow-up.

**Letters use `<FixedBottomBar>` (a plain pinned `<div>`), NOT Vaul `<Drawer>`** — so the modal-body-scroll-lock part of P794 does not apply here. Only the page-padding number ports.

## Risks / Non-Goals

- **Non-goal:** Per-phase padding (Submit-only phases keep 280px, gaining ~184px dead space at max scroll). Intentionally rejected — matches P794's single-value choice for /live.
- **Non-goal:** Refactor `<FixedBottomBar>` to take a `clearance` prop. Over-engineering for 3 call sites.
- **Risk (accepted):** ~184px dead space below content on `point-engage`, `point-revealed`, `remaining-point-engage` phases (Submit-only) at max scroll. Mirrors /live's trade-off.

## Acceptance Criteria

- [x] At max scroll on letter reading `story-rate` phase, the last line of story text is fully visible above the rating drawer (`LetterReadingFlowPublic` path — recipient opens from inbox) `[verified-by-parity-+-deferred-long-story-uat]`
- [x] Same true for `LetterReadingFlow` (live letter recipient path, line 1141) `[verified-by-parity-+-deferred-long-story-uat]`
- [x] Same true for letter preview (sender's preview, line 132) `[verified-by-parity-+-deferred-long-story-uat]`
- [x] Canary test in `src/tests/p777-letter-scroll.test.tsx` passes (asserts 2 hits in reading + 1 hit in preview for `+280px`, zero hits for `+96px`)
- [x] Submit-only phases (point-engage, point-revealed, remaining-point-engage) still render correctly — no visual regression beyond the documented dead-space trade-off `[verified-by-no-runtime-semantic-change]`

## Done-When

Canary green; manual screenshot at max-scroll on `/letter/:id` reading `story-rate` phase shows story text fully visible above the rating bar; same screenshot on letter preview; no regression on Submit-only phases.

## UAT Notes

Long-story visual UAT deferred until P819 (story image rendering for letter recipients) lands, which gives a sufficiently tall test scenario. Verification basis for ACs #1-#3:
- 280px calibration is identical to /live's already-shipped P794 value, validated in production
- Letter `<ComprehensionRatingCard>` invocation lacks Skip/Back (`letter-flow-content.tsx:259–264`), so 280px is *more conservative* than /live's worst-case — never under-allocated
- Canary test (AC #4) regression-guards the value
- Pure CSS class string change — zero runtime semantic change, zero TypeScript impact

Re-validate visually post-P819 when long stories with images become testable.
