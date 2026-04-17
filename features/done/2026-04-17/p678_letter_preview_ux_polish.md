---
status: all-done
completed_at: 2026-04-17
type: bug
rank: 1000678.0
tags:
  - letters
  - preview
  - ux
created_date: 2026-04-09T00:00:00.000Z
pipeline_ran: [fix]
---

# P678: Letter Preview UX Polish — Progress Bar, Counter, Background, Prediction

## Problem

Four UX issues identified in letter preview/reading pages after P673/P676 implementation:

1. **"Story X of Y" counter leaks structure.** Shows total story count but hides per-story point count — misleading. The progress bar already communicates position; the text is redundant and reveals the letter's structure prematurely.
2. **Progress bar has no sub-story granularity.** The bar stays static through multiple screens within one story (point-engage → point-revealed → story-rate → ...). The current segment only fills when the story completes — not as the user progresses through it.
3. **Author's confidence shows "Pending..." in preview mode.** `useLetterReadingState` sets `prediction: null` in preview mode (no DB reveal), causing the confidence display to show "Pending...". The author's predictions exist in compose-page state but aren't bridged to preview.
4. **Cream background feels dated.** `CertificatePageShell parchment` gives `#F5F3EF` cream background on both preview and reading pages. White is cleaner and more consistent with the /live component aesthetic adopted in P673/P676.

## Acceptance Criteria

- [ ] Progress bar segments fill partially for the current story (proportional to phase progress within that story)
- [ ] "Story X of Y" text removed from both preview and reading pages
- [ ] Preview page shows white background (no `parchment` prop on `CertificatePageShell`)
- [ ] Reading page shows white background (no `parchment` prop)
- [ ] Author's confidence number shows in preview (not "Pending...") when predictions were set during compose
- [ ] When navigating directly to preview URL (no predictions in sessionStorage), shows "(no prediction set)" instead of "Pending..."

## Files

| File | Change |
|------|--------|
| `src/app/components/letters/letter-progress-bar.tsx` | Add `storyProgress: number` prop; partial-fill current segment |
| `src/app/pages/letter-preview-page.tsx` | Pass storyProgress, remove "Story X of Y", remove parchment, read predictions from sessionStorage |
| `src/app/pages/letter-reading-page.tsx` | Pass storyProgress, remove "Story X of Y", remove parchment |
| `src/app/pages/letter-compose-page.tsx` | Persist predictions to sessionStorage on change |
| `src/app/hooks/useLetterReadingState.ts` | Accept `previewPredictions: Map<string, number>`, use in preview submitStoryRating |
