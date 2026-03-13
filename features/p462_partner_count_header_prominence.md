---
status: week
type: story
rank: 250001.75
tags:
  - agreements
  - profile
  - ux
  - p422
created_date: 2026-02-28T00:00:00.000Z
flow: dev
locked_at: '2026-03-06T03:36:22.279Z'
uat_file: features/uat/p462.md
test_files:
  - e2e/p462-partner-count-prominence.spec.ts
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

- [ ] Partners number renders at `text-xl font-bold text-[#002B5C]` (any viewer, N>0) or `text-xl text-muted-foreground` (owner, 0 count)
- [ ] Label "Clarity Partners →" renders at `text-sm text-muted-foreground` on same line as number
- [ ] Full row is still a link to `/p/:slug/partners`
- [ ] Min tap height 44px preserved
- [ ] Non-owner with no visible agreements: renders nothing (unchanged)
- [ ] Visitor with visible agreements: shows "N Clarity Partners" with bold navy styling (same as owner N>0 state)

## Test Coverage Strategy

**Files created:**
- E2E tests: `e2e/p462-partner-count-prominence.spec.ts` (5 tests)
- UAT scenarios: `features/uat/p462.md` (5 scenarios)

**What's tested:**
- ✅ Owner 0-count: muted styling, no bold/navy (TC-01)
- ✅ Owner N-count: bold navy xl number, muted label (TC-02)
- ✅ Non-owner no visible: line not rendered (TC-03)
- ✅ Visitor with public agreement: count visible with bold styling (TC-04)
- ✅ Diamond icon present and aria-hidden (TC-05)
- ✅ Link target `/p/:slug/partners` (TC-01, TC-04)
- ✅ Min tap height 44px (TC-02)

**What's NOT tested (rationale):**
- ❌ Unit tests — no new utility/service logic, just CSS class conditionals tested via E2E
- ❌ Integration tests — no DB/API changes
- ❌ Accessibility tests — no new interactive elements (existing link unchanged)
- ❌ Smoke tests — no new routes

**Test pyramid:**
```
  /\
 /  \  5 E2E
/____\
```

Total: 5 automated tests + 5 UAT scenarios
