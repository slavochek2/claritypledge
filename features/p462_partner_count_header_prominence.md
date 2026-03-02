---
status: blocked
type: story
rank: 0.75
tags:
  - agreements
  - profile
  - ux
  - p422
created_date: 2026-02-28T00:00:00.000Z
flow: dev
locked_at: '2026-03-02T08:36:50.872Z'
---

# P462: Clarity Partners Count — Header Prominence

## Problem

"✦ 6 Clarity Partners →" is the last line of the profile header, rendered as `text-sm text-muted-foreground` — same visual weight as bio text. A first-time visitor reads: name → ear count → role → pledge → calibration → bio → tiny link. Partners is last and visually smallest.

"6 Clarity Partners" = 6 people who mutually committed to listen to this person. That's a stronger signal than LinkedIn connections (which are passive). It deserves the prominence LinkedIn gives to "500+ connections" — inline in the metadata stack, number-first, navy bold.

Supersedes P452 (nav dropdown entry) — a prominent header link IS the nav entry.

## Design

LinkedIn pattern: connections count appears inline in the left-column metadata stack, below location, before action buttons. Number is visually prominent (blue), label is supporting context. No right rail.

Our adaptation:
- `✦ 6` — number at `text-xl font-bold text-[#002B5C]`
- `Clarity Partners →` — `text-sm text-muted-foreground` on the same line
- Full row remains a `<Link>` to `/p/:slug/partners`
- Minimum tap height 44px unchanged

### ASCII (both mobile and desktop — same left-aligned structure)

```
┌─────────────────────────────────────────┐
│  [AVT]  Jane Smith              [≡↗]   │
│         CEO                             │
│         See my Clarity Pledge →         │
│         ░░░░▓▓░░░ Calibrated            │
│         Bio text...                     │
│                                         │
│  ✦  6  Clarity Partners  →             │  ← number bold navy xl
└─────────────────────────────────────────┘
```

### 0-partners state (owner)
`✦  0  Clarity Partners  →` — number in `text-muted-foreground` (muted, not bold navy), rest unchanged. Still links to /partners page which has the Create Agreement CTA.

### Non-owner, no visible agreements
Renders nothing (existing behaviour unchanged).

## Files

- `src/app/components/agreements/agreements-metadata-line.tsx`

## Acceptance Criteria

- [ ] Partners number renders at `text-xl font-bold text-[#002B5C]` (owner) or `text-xl text-muted-foreground` (owner, 0 count)
- [ ] Label "Clarity Partners →" renders at `text-sm text-muted-foreground` on same line as number
- [ ] Full row is still a link to `/p/:slug/partners`
- [ ] Min tap height 44px preserved
- [ ] Non-owner with no visible agreements: renders nothing (unchanged)
- [ ] Visitor with shared agreement: still shows "You have N agreement(s) with this person" (unchanged copy, updated number styling)
