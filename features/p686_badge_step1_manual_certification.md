---
status: backlog
type: story
rank: 1000686.0
created_date: '2026-04-10'
tags: [badge, certification, propagation, profile]
flow: dev
delivery_stage: decompose
pipeline_plan: [create-spec, challenge-prd, ux, architect, ui, generate-tests, spec-review, spec-compact, decompose, dev, verify]
pipeline_skipped: [spec-review -- spec has been through challenge-prd + multiple manual review rounds]
pipeline_ran: [create-spec, challenge-prd, ux, architect, ui, generate-tests, spec-compact, decompose]
uat_file: features/uat/p686.md
test_files:
  - e2e/integration/p686-badge-migration.spec.ts
  - src/tests/p686-badge-service.test.ts
  - e2e/p686-badge-certification.spec.ts
  - e2e/p686-badge-certificate.spec.ts
  - e2e/p686-badge-profile.spec.ts
  - e2e/a11y/p686-badge-accessibility.spec.ts
---

# P686: Badge Step 1 — Auto-Certification from /live with Progress

## Problem

**Situation:** Workshop #1 is imminent. The Badge/Pledge split is decided (decisions.md 2026-04-09) and the propagation vision is documented (P685). Slava needs to badge people at the workshop and in 1:1 sessions to observe: do they share it? Do they want to spread it?

**Complication:** No badge infrastructure exists. The pledge certificate pattern exists and can be reused, but badge is fundamentally different — it's proof of calibrated alignment (evidence), not a commitment (promise). Badge builds incrementally per point (progress bar), unlike pledge which is binary. The certification should emerge naturally from /live sessions — not require a separate manual action.

**Question:** What is the minimum build to let certification happen automatically during /live sessions, show progress on profiles, and give badged people a shareable certificate? Badge is the measurement instrument for workshop #1 propagation signal — does the flip propagate through relationships?

## Appetite

Medium blast radius (new profile feature, new certificate page, new DB table — but doesn't touch existing pledge flow). Fully reversible (drop table, remove components). Medium decision density — core UX decisions made in this spec, certificate text is [FOUNDER DECISION].

## Solution

### Core Concept: Badge = Calibrated Alignment

Badge means: "I verified I understood this story AND I agree with its point." Not just comprehension — alignment. Each badge point proves the holder has calibrated alignment on a specific clarity point.

Certification happens automatically during /live free-mode sessions. When the certifier speaks on a story linked to an `#understanding`-tagged point, both participants rate understanding at 10/10, and the listener has filed agree or strongly agree on the point — a badge point is earned. No separate "certify" action needed — the badge emerges from the practice itself.

### Data Model

New table `badge_points`:
```
badge_points (
  id UUID PK,
  user_id UUID FK → profiles,          -- who earned the badge point
  point_id UUID FK → points,           -- which point was verified
  story_id UUID FK → stories,          -- which story was used for verification
  verified_by UUID FK → profiles,      -- the certifier (other participant)
  session_id UUID FK → sessions,       -- the /live session
  position TEXT,                        -- 'agree' or 'strongly_agree' (somewhat_agree does NOT qualify)
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, point_id)            -- one badge per point per person; re-earning is ON CONFLICT DO NOTHING
)
```

New field on `profiles`:
```
is_certifier BOOLEAN DEFAULT false     -- can this person's sessions trigger badge points?
```

Derived on profiles (not stored — computed from badge_points):
- Badge count: `SELECT COUNT(DISTINCT point_id) FROM badge_points WHERE user_id = X`
- Has badge: count > 0
- Full badge: count = 9 (all 9 clarity points verified)

**Why `is_certifier`?** Step 1 is a measurement instrument — gates who can trigger badge points to observe sharing behavior. Only Slava initially. Step 2+ opens this to anyone with badge-to-GIVE status (certifier-granting mechanism is Step 2 scope — see P685).

**Why `story_id` and `position`?** Records which story produced the alignment and what position the person took. Future analytics: which stories are most effective at producing calibration? Which points generate strongest agreement?

### Certification Trigger (Auto from /live)

During a free-mode /live session between a certifier (`is_certifier = true`) and a logged-in participant:

1. The certifier selects and speaks on a story linked to an `#understanding`-tagged point
2. Both rate understanding at 10/10 (free mode dual sliders: `freeSliderCreator === 10 && freeSliderJoiner === 10`)
3. After the round completes, check: does the listener's position on this point = `agree` or `strongly_agree`?
4. If yes → client-side insert into `badge_points` with the certifier as `verified_by`, using `ON CONFLICT (user_id, point_id) DO NOTHING`

**Preconditions (all must be true):**
- The story selector (speaker) is the certifier (`is_certifier = true`)
- The listener is a logged-in user (not a guest — guests cannot earn badge points)
- The story's linked point has `system_tags` containing `'understanding'`
- The listener has filed position `agree` or `strongly_agree` on this point (`somewhat_agree` does NOT qualify)

**Why certifier must be speaker:** The certifier tells their story; the listener demonstrates understanding. If the listener picks a story and the certifier listens, the certifier understanding the listener's story proves nothing about the listener's calibration.

**Position as hard gate:** If the listener hasn't filed a qualifying position on the certification point, no badge point fires — silent skip. No prompt, no error. The certifier guides the participant to file a position before completing the round; if they forget, the system catches it. Positions use the standard 7-point Likert scale (`PositionType`): only `agree` (+2) and `strongly_agree` (+3) qualify. `somewhat_agree` (+1) does not.

**Position data source:** Read the listener's position from `livePositions` in session state (already in memory on the certifier's client), not from the `point_positions` table (async persistence may not have completed).

**Why 10/10 and not ≥8/10:** The product uses ≥8/10 as the general verification threshold, but free mode already only triggers the celebration screen when both sliders hit exactly 10. Badge piggybacks on this existing UX trigger — not a new, stricter threshold.

**Where the check runs:** In `onRoundComplete()` (or the celebration screen transition), after free-mode 10/10 is detected. The insert runs on the certifier's client (RLS: `INSERT allowed WHERE verified_by = auth.uid() AND profiles.is_certifier = true`). The listener's client skips the insert since their `auth.uid()` doesn't match `is_certifier`. Note: client-side insert means no server-side validation of preconditions (10/10 ratings, position filed, understanding tag). Acceptable for Step 1 with a single trusted certifier. Server-side validation required when `is_certifier` expands to other users (Step 2 security debt).

**Implementation note:** `selectedStoryData` snapshot currently omits `systemTags` on points (line 1606-1614 of `clarity-live-page.tsx`). The `/architect` phase must address this — either add `systemTags` to the snapshot or look up the point's system tags from a separate source at certification time.

**Anti-point handling (Step 1):** Certifier's judgment. If a point has an anti-point, the certifier observes whether the participant demonstrates genuine understanding (not just agreeing to please). This is inherently manual in Step 1 — the certifier chooses which stories to run. Step 2+ can automate anti-point checks.


### Pre-build Task

Export current point titles and story summaries from prod to a local reference file (`docs/technical/badge-points-reference.md`). Badge certificate needs point titles — having them locally avoids runtime DB dependency for text content and provides a versioning reference. Also verify that the 9 certification points have `understanding` in `system_tags` — tag them if not already tagged.




### Badge Versioning

Points evolve over time. Badge records are frozen:
- `badge_points` records reference specific `point_id` UUIDs
- New point version = new point UUID in the DB. Old badge records still point to the original UUID.
- No explicit versioning system needed — UUID IS the version.
- Future: badge v2 with new point set = new `badge_points` entries. User can upgrade.

## Risks / Non-Goals

### Risks
- Progress bar (3/9) might feel incomplete rather than motivating. Mitigation: frame as achievement ("calibrated on 3 points!") not deficit ("6 remaining"). Test framing in workshop.
- Auto-certification could fire incorrectly if someone rates 10/10 casually. Mitigation: only fires when certifier is in the session (`is_certifier` gate). Step 1 = only Slava. Social accountability + small numbers make false positives unlikely.
- Reusing pledge components too closely might make badge feel derivative. Mitigation: different color scheme (pledge = blue accents, badge = neutral/gold?), different structure (progress bar vs. binary), different tone (evidence vs. commitment).
- Anti-point checking is manual in Step 1 (certifier judgment). Mitigation: acceptable for small numbers. Step 2+ automates.
- Client-side insert has no server-side precondition validation (ratings, position, understanding tag). Acceptable for Step 1 with single trusted certifier. Security debt for Step 2 — server-side validation required when `is_certifier` expands.

### Non-Goals
- Do NOT add UI certify button in /live (certification is automatic from 10/10)
- Do NOT gate pledge on badge (Q4 from P685 — unresolved, keep independent)
- Do NOT gate partner agreement on badge (Q5 from P685 — unresolved)
- Do NOT build verification graph visualization (Step 4 from P685)
- Do NOT build AI-assisted story drafting (Step 3 from P685)
- Do NOT change existing pledge flow or pledge certificate
- Do NOT automate anti-point checking (Step 2+)
- Do NOT support pre-registration badge claiming (account required — no badging guests or future users)
- Do NOT add double-checkmark for certifiers on profile (Step 2 consideration when more certifiers exist)
- Do NOT build badge revocation UI (admin DB update if needed; no "formerly badged" state in Step 1)

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Two incompatible "badge" definitions in `definitions.md` | Update `definitions.md` during build | Old definition (≥10 sessions + avgGap) was never built; P686 replaces it |
| 2 | /challenge-prd | [BLOCK] Single certifier contradicts propagation vision | Step 1 is measurement instrument; certifier expansion is Step 2 scope | Intentional bottleneck for workshop observation |
| 3 | /challenge-prd | [WARN] Position data source race condition | Read from `livePositions` in session state, not DB table | Already in memory on certifier's client; no async race |
| 4 | /challenge-prd | [WARN] 10/10 vs ≥8/10 threshold | 10/10 is existing free-mode celebration trigger, not new threshold | Piggybacks on existing UX |
| 5 | /challenge-prd | [WARN] Client-side insert security | Accepted for Step 1; flagged as security debt for Step 2 | Single trusted certifier |
| 6 | /challenge-prd | [WARN] Understanding tag may not be on points | Added to pre-build task: verify + tag | Tag infrastructure exists (P630); data may need seeding |
| 7 | /challenge-prd | [WARN] Building propagation before retention | Badge is measurement instrument for H-WorkshopFormat | Need badge to observe sharing behavior |

## Done-When

- [ ] `badge_points` table exists in prod with RLS (user can read own + public read for certificate)
- [ ] `is_certifier` boolean on profiles, Slava seeded as `is_certifier = true` (no badge — authority from founding, not from passing the test)
- [ ] Free-mode 10/10 on `#understanding`-tagged story auto-inserts badge_point when certifier is speaker and listener is logged in
- [ ] Badge point only fires when listener has position `agree` or `strongly_agree` on the certification point (silent skip otherwise)
- [ ] Celebration screen upgrades to "Badge point earned! N/9 verified" when badge point earned
- [ ] ✓ checkmark appears on avatar for users with ≥1 badge point
- [ ] "See their badge (N/9)" link appears on profile
- [ ] Badge certificate page at `/p/:slug/badge` shows progress, points, verifier, dates
- [ ] Share buttons work (copy link, LinkedIn, WhatsApp) — reused from pledge
- [ ] Certificate image export works — reused from pledge
- [ ] OG tags render correct preview when badge URL shared
- [ ] Badge certificate publicly viewable without login
- [ ] Points on certificate link to public point detail pages
- [ ] Certifier name on certificate links to their profile
- [ ] Existing pledge flow completely unaffected
- [ ] `definitions.md` "Calibration Badge" section updated to reflect P686 badge concept (replaces old ≥10-sessions definition)

## Acceptance Criteria

- [ ] During /live free-mode session where certifier is speaker, 10/10 on #understanding story auto-badges the logged-in listener
- [ ] Badge does NOT fire when non-certifier is speaker (even on #understanding story with 10/10)
- [ ] Badge does NOT fire for guest (not logged in) listeners
- [ ] Badge does NOT fire when listener position is missing, `disagree`, `strongly_disagree`, or `somewhat_agree`
- [ ] Duplicate badge point on same (user, point) is silently ignored (UNIQUE constraint)
- [ ] Celebration screen shows badge headline when badge point earned
- [ ] Participant's profile immediately shows ✓ + "See their badge (N/9)" link
- [ ] Badge certificate shows correct progress (N/9) with verified point titles and dates
- [ ] Badge certificate is shareable (link, social, image export)
- [ ] Visitor to badge certificate sees "Join the next Clarity Workshop" CTA
- [ ] Profile correctly displays badge-only, pledge-only, and both states
- [ ] Slava has `is_certifier = true` but no badge points (founder exception — earns badge when someone certifies him)


## UX Design

### 1. User Flows

**Flow A: Badge earned during /live (certification round)**

1. Certifier (speaker) selects a story linked to an `#understanding`-tagged point
2. Both participants complete the round — free-mode dual sliders both reach 10/10
3. System checks preconditions silently: certifier is speaker, listener is logged in, listener has filed `agree` or `strongly_agree` on the point
4. If all pass → badge point inserted (ON CONFLICT DO NOTHING for duplicates)
5. Celebration screen renders with **badge headline** above the standard celebration content
6. Both participants see the upgraded celebration (listener sees "Badge point earned! N/9 verified"; certifier sees "You verified [name] on a clarity point! N/9")
7. Continue button + dual-ack pattern unchanged — badge adds a headline, does not change the interaction flow

**Silent skip paths (no user feedback, no error):**
- Listener has no position or `somewhat_agree`/`disagree`/`strongly_disagree` → standard celebration only
- Listener is a guest (not logged in) → standard celebration only
- Speaker is not a certifier → standard celebration only
- Story's point lacks `#understanding` tag → standard celebration only
- Badge point already earned for this (user, point) → standard celebration only (duplicate)

**Flow B: Profile visitor sees badge**

1. Visitor navigates to `/p/:slug`
2. Avatar renders with checkmark overlay if user has >= 1 badge point
3. Below the avatar/name row, in the navigation cluster (after pledge link, before agreements line):
   - "See their badge (N/9)" link (or "My badge (N/9)" for owner) — same inline-flex icon+text pattern as the pledge link
4. Clicking checkmark OR link → navigates to `/p/:slug/badge`
5. Checkmark is also visible in all avatar contexts where `GravatarAvatar` renders (profile cards, partner lists, etc.)

**Flow C: Badge certificate page**

1. Visitor arrives at `/p/:slug/badge` (public, no login required)
2. If user has 0 badge points → "Badge Not Found" screen (same pattern as pledge-page "not found")
3. **Owner view:**
   - Blue info banner at top: "Your Badge" + ShareDropdown (copy link, LinkedIn, WhatsApp, export image)
   - Back arrow → returns to `/p/:slug`
   - Certificate content below
4. **Visitor view:**
   - Back arrow → returns to `/p/:slug`
   - Headline: "[Name] is building calibrated alignment"
   - Certificate content
   - Below certificate: CTA card — "Join the next Clarity Workshop" → links to events page
5. Certificate content (shared between views):
   - Title section: "CLARITY BADGE" heading
   - Progress bar: visual N/9 with numeric label
   - Summary line: "[Name] is calibrated on [N] of 9 clarity points."
   - Verifier line: "Verified by [Certifier Name]." — certifier name is a link to their profile
   - Point list: all 9 points listed, verified ones marked with checkmark + title + date, unverified ones marked with empty circle + title only
   - Each verified point title links to its public point detail page
   - Signature section: avatar + name + earliest verification date (reuses pledge certificate footer pattern)
   - Seal: ClarityLogoMark in circular border (same as pledge)
   - QR code: embeds badge certificate URL

### 2. Screen Designs

**Profile Navigation Cluster — `profile-page-v2.tsx`**

Below name/role row, in the existing navigation cluster area:

```
┌─────────────────────────────────────┐
│ [Avatar]  Name         👂 N         │
│           Role · LinkedIn           │
├─────────────────────────────────────┤
│ 📜 My Clarity Pledge               │  ← existing (when hasPledged)
│ 🏅 My badge (3/9)                  │  ← NEW (when badgeCount > 0)
│ Partners: N agreements              │  ← existing
│ Calibration: [bar]                  │  ← existing
└─────────────────────────────────────┘
```

Badge link uses a distinct icon (not ScrollText). Same `inline-flex items-center gap-1 text-sm text-blue-500` styling.

Owner labels: "My Clarity Pledge" / "My badge (N/9)"
Visitor labels: "Their Clarity Pledge" / "Their badge (N/9)" — but spec says "See their badge (N/9)", which is the visitor text. Owner text: "My badge (N/9)".

When user has neither pledge nor badge, neither link shows. The links are independent — badge does not require pledge.

**Badge Certificate Page — `/p/:slug/badge`**

```
┌─────────────────────────────────────────┐
│ ← Back                                  │
│                                          │
│ ┌─ Owner banner (owner only) ──────┐    │
│ │ "Your Badge"    [Share ▾]        │    │
│ └──────────────────────────────────┘    │
│                                          │
│ ┌─ Certificate ────────────────────┐    │
│ │                                   │    │
│ │     CLARITY BADGE                 │    │
│ │  [FOUNDER DECISION: subtitle]     │    │
│ │                                   │    │
│ │  ████████░ 8/9                    │    │
│ │                                   │    │
│ │  [Name] is calibrated on 8 of    │    │
│ │  9 clarity points.                │    │
│ │  Verified by [Certifier Name →].  │    │
│ │                                   │    │
│ │  ✓ Point 1 title — Apr 5, 2026   │    │
│ │  ✓ Point 2 title — Apr 5, 2026   │    │
│ │  ✓ Point 3 title — Apr 6, 2026   │    │
│ │  ○ Point 4 title                  │    │
│ │  ✓ Point 5 title — Apr 7, 2026   │    │
│ │  ...                              │    │
│ │                                   │    │
│ │  ─────────────────────────────    │    │
│ │  [Avatar] Name      [Seal]  Date │    │
│ │           Role       QR          │    │
│ └───────────────────────────────────┘    │
│                                          │
│ ┌─ Visitor CTA (visitor only) ─────┐    │
│ │ "Join the next Clarity Workshop"  │    │
│ │ [View upcoming workshops →]       │    │
│ └──────────────────────────────────┘    │
│                                          │
│ ┌─ Visitor headline (visitor only) ┐    │
│ │ "[Name] is building calibrated    │    │
│ │  alignment"                       │    │
│ └──────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

Visitor headline appears above the certificate (same position as pledge page's "made you a promise" heading). Visitor CTA appears below the certificate (replaces witness card position from pledge page).

Certificate visual style: same parchment background (#FDFBF7), double-border frame, serif title as pledge certificate. Different title text ("CLARITY BADGE" vs "THE CLARITY PLEDGE"). Progress bar and point list are new elements that have no pledge equivalent.

Point list ordering: all 9 points in their canonical order (by point position/rank, not by verification date). Verified points show date; unverified points show title only, muted.

**Certificate Image Export (1080x1080px)**

Same fixed-size rendering approach as `ExportCertificate`. Badge version layout:

```
┌──────────────────────────────────┐
│                                   │
│         CLARITY BADGE             │
│   [FOUNDER DECISION: subtitle]    │
│                                   │
│    ████████░░░ 7/9                │
│                                   │
│  [Name] is calibrated on 7 of    │
│  9 clarity points.                │
│  Verified by [Certifier Name].    │
│                                   │
│  ✓ Point 1  ✓ Point 2  ✓ Point 3 │
│  ○ Point 4  ✓ Point 5  ✓ Point 6 │
│  ✓ Point 7  ○ Point 8  ✓ Point 9 │
│                                   │
│  ─────────────────────────────    │
│  [Name]         [Seal]    [QR]   │
│                                   │
│       claritypledge.com           │
└──────────────────────────────────┘
```

Point list in export uses compact 3-column grid (titles abbreviated if needed) to fit within 1080px. Verified points show checkmark; unverified show empty circle. No dates in export (too dense). QR code links to badge certificate URL.

### 3. Edge Cases & UI States

**Celebration screen:**

| Case | Behavior |
|------|----------|
| No badge point earned | Standard celebration — no badge headline, no change |
| Badge point earned (first ever) | Badge headline: "Badge point earned! 1/9 clarity points verified" |
| Badge point earned (subsequent) | Badge headline: "Badge point earned! N/9 clarity points verified" |
| Badge point earned (9/9 complete) | Badge headline: "Full badge earned! 9/9 clarity points verified" — distinct wording for completion |
| Duplicate badge point (already earned this point) | ON CONFLICT DO NOTHING — standard celebration only. No badge headline. No error message. |
| Certifier's view when badge fires | "You verified [name] on a clarity point! N/9" — certifier sees the badge event but framed as their action |

**Profile:**

| State | Avatar | Navigation cluster |
|-------|--------|-------------------|
| Neither | Default avatar | No pledge/badge links |
| Badge only | Avatar + checkmark | "See their badge (N/9)" |
| Pledge only | Avatar + blue ring | "Their Clarity Pledge" |
| Both | Avatar + blue ring + checkmark | "Their Clarity Pledge" + "See their badge (N/9)" (two separate links, pledge first) |

**Certificate page:**

| Case | Behavior |
|------|----------|
| 0/9 points | "Badge Not Found" page (same as pledge not-found). Link to badge page not shown on profile when 0 points — user should never reach this organically. |
| 1/9 partial | Certificate renders with 1 checked + 8 unchecked points. Progress bar at 1/9. |
| 9/9 complete | All points checked. Progress bar full. Summary line adjusts: "calibrated on all 9 clarity points." |
| Visitor (not logged in) | Full certificate visible. CTA below: "Join the next Clarity Workshop." No share controls. |
| Visitor (logged in, not owner) | Same as not-logged-in visitor. |
| Owner | Blue banner with "Your Badge" + ShareDropdown. No visitor CTA. |
| Multiple certifiers | "Verified by" shows unique certifier names, comma-separated. Each name links to their profile. (Step 1: only Slava, but data model supports multiple.) |

**Certificate image:**

| Case | Behavior |
|------|----------|
| Partial (< 9/9) | Progress bar shows actual count. Points grid shows verified/unverified. |
| Complete (9/9) | Progress bar full. All points checked in grid. |
| Long point titles | Truncated with ellipsis in 3-column grid. Full titles visible on the web certificate page. |

### 4. Accessibility

**Checkmark on avatar:**
- `role="img"` + `aria-label="Has Clarity Badge — N of 9 points verified"` on the checkmark element
- When clickable: wrap in `<a>` with `aria-label="View [Name]'s Clarity Badge (N/9 verified)"`
- Focus ring visible on keyboard navigation

**Progress bar:**
- `role="progressbar"` + `aria-valuenow={N}` + `aria-valuemin={0}` + `aria-valuemax={9}`
- `aria-label="Badge progress: N of 9 clarity points verified"`
- Visual bar is decorative; numeric "N/9" label provides text alternative

**Point list on certificate:**
- Rendered as `<ul>` with `aria-label="Clarity badge points"`
- Verified items: `aria-label="Verified: [Point title], [date]"`
- Unverified items: `aria-label="Not yet verified: [Point title]"`
- Checkmark/circle icons are `aria-hidden="true"` (label carries meaning)

**Share buttons:**
- Keyboard-accessible via ShareDropdown (existing component, already handles keyboard)
- Export button has `aria-label="Export badge certificate as image"`

**Celebration screen badge headline:**
- Badge headline is an `<h2>` with standard text — screen readers announce it naturally
- No `aria-live` needed — this is a new page state render, not an in-place update

### 5. Responsive Design

**Celebration screen:**
- Mobile-first, single column, max-w-sm centered — unchanged from current implementation
- Badge headline prepends above existing headline — no layout change needed
- Tested safe: headline + existing content fits within viewport height at 375px width

**Profile avatar checkmark:**
- Scales with avatar size classes (sm: 16px badge, md: 20px, lg: 24px, xl: 28px)
- At `sm` (40px avatar), checkmark must not overlap pledge ring gap — positioned outside ring offset
- Touch target for checkmark: minimum 44x44px hit area (larger than visual size via padding)

**Badge certificate page:**
- `container mx-auto max-w-5xl` with horizontal padding (same as pledge page)
- Certificate card: full width on mobile, max-w-3xl centered on desktop
- Progress bar: full width within certificate padding
- Point list: single column, full width
- Signature section: stacked centered on mobile, horizontal balanced on desktop (same breakpoint pattern as `ProfileCertificate`)
- QR code: hidden on mobile web view (visible in export only) — same as pledge certificate behavior

**Certificate image export:**
- Fixed 1080x1080px — not responsive (rendered offscreen for PNG capture)
- Point grid switches to 3-column at this size (point titles abbreviated)


## Technical Architecture

### Technical Analysis

**Current codebase state:**

1. **No badge infrastructure exists.** No `badge_points` table, no `is_certifier` column, no badge-related components. Greenfield addition.

2. **`selectedStoryData` snapshot gap (critical).** In `clarity-live-page.tsx:1606-1614`, the point map explicitly picks fields but omits `systemTags`:
   ```typescript
   points: storyData.points.map(p => ({
     id: p.id, statement: p.statement, context: p.context,
     tags: p.tags, positionCounts: p.positionCounts,
     userPosition: p.userPosition, profileSubjectPosition: p.profileSubjectPosition,
   })),
   ```
   `PointSummary` type already has `systemTags: string[]` — the data is available on `storyData.points[n].systemTags`, it's just not copied into the live state snapshot. **Fix:** Add `systemTags: p.systemTags` to the map. This is a one-line addition to the snapshot, not an architectural change.

3. **`livePositions` data flow.** Positions are stored as top-level JSONB keys on `live_state`: `livePositionsCreator: Record<string, PositionType | null>` and `livePositionsJoiner: Record<string, PositionType | null>`. The certifier's client has both in `confirmedLiveStateRef.current`. To read the listener's position, the certifier determines which key to read based on the listener's role (creator vs joiner).

4. **Celebration trigger.** `handleFreeRoundComplete()` at line 1523 sets `freePhase: 'success'` after verifying both sliders are 10. The `FreeModeSuccess` component renders when `freePhase === 'success'`. Badge insert should fire in this same callback, after the `freePhase: 'success'` write, so the celebration component can receive the badge result as a prop.

5. **`GravatarAvatar` already has badge support.** The `showPledgeBadge` prop renders a checkmark at bottom-right (lines 91-99). For P686, add a separate `showBadge` prop with distinct styling (the existing checkmark is blue-500 for pledge; badge checkmark needs a different visual or icon to distinguish).

6. **Pledge page is the structural template.** `pledge-page.tsx` demonstrates: slug-based profile loading, owner vs visitor detection via `session?.user?.id === profile.id`, back navigation, SEO component, `ProfileVisitorView` certificate rendering. Badge page follows this exact pattern with different content.

7. **Route registration.** Routes in `App.tsx:270-297`. Badge route `/p/:id/badge` goes between `/p/:id` and `/p/:id/pledge`. The badge page is a browse page (not focus), so BottomNav shows — no addition to `focusRoutes` in `bottom-nav.tsx` needed (same pattern as pledge page).

8. **Profile data layer.** `api.ts` uses `getProfileBySlug()` for route params. Badge count is NOT on the profiles table — it's a separate query to `badge_points`. The badge page and profile components need a `getBadgePoints(userId)` service function.

### Architecture Decisions

**AD-1: Badge service as standalone module (not added to api.ts).**
New interface-based service following the pattern in `src/app/data/`:
- `badge-service.interface.ts` — types
- `badge-service-real.ts` — Supabase implementation
- `badge-service.ts` — export (real only, no mock needed for Step 1)

This keeps the badge data layer separate from the legacy `api.ts` monolith and follows the established service pattern (events, stories, points, calibration).

**AD-2: Badge insert fires from `handleFreeRoundComplete` callback, not from the celebration component.**
The insert must happen before the celebration renders, so the celebration component receives `badgePointEarned: boolean` and `badgeCount: number` as props. If we inserted from the celebration component, the initial render would show the standard celebration, then flash-update to badge celebration after the async insert resolves.

Flow: `handleFreeRoundComplete()` → check preconditions → insert badge_point → set `freePhase: 'success'` with badge result in state → `FreeModeSuccess` reads badge props and renders accordingly.

**AD-3: Badge result passed via live state, not React state.**
Both participants need to see the badge celebration (listener sees "Badge point earned!", certifier sees "You verified [name]!"). The badge result must be in `live_state` (shared via Realtime), not React local state (private to one client). Add two new keys to `LiveSessionState`:
- `badgePointEarned?: boolean` — true when a badge point was just earned
- `badgeCount?: number` — total badge count after this point

These are cleared with the other celebration state when dual-ack resets.

**AD-4: `systemTags` added to selectedStoryData snapshot.**
One-line fix in `clarity-live-page.tsx:1610`. No separate lookup needed — `PointSummary.systemTags` is already populated by the stories service when loading stories with points.

**AD-5: Position lookup uses role-based key resolution.**
The certifier's client determines the listener's role:
- If certifier is creator → listener is joiner → read `livePositionsJoiner[pointId]`
- If certifier is joiner → listener is creator → read `livePositionsCreator[pointId]`

The certifier knows their own role from `isCreator` (already available in `clarity-live-page.tsx`). The point ID comes from `selectedStoryData.points[0].id` (the first point linked to the story — stories typically have one primary point; if multiple, use the first `#understanding`-tagged one).

**AD-6: New `BadgeCertificate` component (not extending `ProfileCertificate`).**
`ProfileCertificate` is tightly coupled to pledge content (Your Right, My Promise, Exception sections). Badge certificate has fundamentally different content (progress bar, point list, verifier). Creating a new `BadgeCertificate` component is cleaner than parameterizing `ProfileCertificate` to handle both. Reuse only the visual frame elements: parchment background, double-border, seal, QR code pattern, signature footer layout.

**AD-7: `PersonRef` type extended with `badgeCount`.**
Add `badgeCount?: number` to `PersonRef` (or pass separately). This drives the avatar checkmark and badge link on profile pages. Fetched alongside profile data.

### Security Review

**RLS policies for `badge_points`:**

| Policy | Operation | Rule |
|--------|-----------|------|
| `badge_points_select` | SELECT | `true` (public read — certificate is public) |
| `badge_points_insert` | INSERT | `auth.uid() = verified_by AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_certifier = true)` |

The INSERT policy ensures:
1. Only the certifier can write (their uid matches `verified_by`)
2. The certifier has `is_certifier = true` in profiles

**No UPDATE or DELETE policies.** Badge points are immutable. Admin correction is direct SQL.

**`is_certifier` column protection:** No RLS needed — profiles UPDATE policy already restricts updates to `auth.uid() = id`. A user can only update their own profile, and `is_certifier` is not exposed in any client-side update function. Seeded via migration. Extra safety: add `is_certifier` to the list of fields the client never sends (enforced by the service layer, not RLS).

**Client-side insert security debt (documented, acceptable for Step 1):**
The client-side insert does no server-side validation of:
- Whether both sliders were actually 10 (could be spoofed)
- Whether the position was actually filed (could be spoofed)
- Whether the story actually has `#understanding` tag (could be spoofed)

With only Slava as certifier, this is acceptable. Step 2 requires an RPC with server-side precondition checks when expanding `is_certifier` to other users.

**SECURITY DEFINER risk:** Not applicable — no triggers on `badge_points`. RLS alone handles access control.

### Implementation Approach

#### Build Sequence

**Phase 1: Database (migration)**
1. Create `badge_points` table with schema from spec
2. Add `is_certifier` boolean to `profiles` (default false)
3. RLS policies for `badge_points`
4. Seed Slava's profile: `UPDATE profiles SET is_certifier = true WHERE slug = 'slava'`

**Phase 2: Data layer**
5. Create `badge-service.interface.ts` — `BadgePoint` type, `BadgeService` interface
6. Create `badge-service-real.ts` — `insertBadgePoint()`, `getBadgePoints(userId)`, `getBadgeCount(userId)`
7. Create `badge-service.ts` — export real service

**Phase 3: Certification trigger (/live)**
8. Fix `selectedStoryData` snapshot — add `systemTags: p.systemTags` to point map in `clarity-live-page.tsx:1610`
9. Add `badgePointEarned` and `badgeCount` to `LiveSessionState` type
10. Implement badge check in `handleFreeRoundComplete()`:
    - Read `selectedStoryData.points` → find point with `systemTags.includes('understanding')`
    - Check speaker is certifier: `ratingInitiatedByIsCreator` matches the certifier's role AND certifier has `is_certifier = true`
    - Read listener's position from `livePositions{Creator|Joiner}[pointId]`
    - If position is `agree` or `strongly_agree` → call `insertBadgePoint()`
    - Write result to live state: `badgePointEarned: true, badgeCount: N`
11. Clear badge state in dual-ack reset (`handleFreeDiscussAnother`)

**Phase 4: Celebration upgrade**
12. Add `badgePointEarned`, `badgeCount`, `isFullBadge`, `partnerBadgeCount` props to `FreeModeSuccess`
13. Render badge headline when `badgePointEarned` is true
14. Role-aware copy: listener sees "Badge point earned!", certifier sees "You verified [name]!"

**Phase 5: Profile display**
15. Add `showBadge` prop to `GravatarAvatar` — distinct from `showPledgeBadge` (different icon or color)
16. Add `badgeCount` to `PersonRef` type
17. Add badge link to profile navigation cluster in `profile-page-v2.tsx`
18. Fetch badge count in profile page data loading

**Phase 6: Badge certificate page**
19. Create `BadgeCertificate` component — progress bar, point list, verifier, signature footer
20. Create `badge-page.tsx` — route, profile loading, owner/visitor views, SEO
21. Add route `/p/:id/badge` to `App.tsx`
22. Add `BadgeExportCertificate` component for 1080x1080 image export
23. Share buttons (reuse `ShareDropdown` pattern from pledge page)

**Phase 7: Pre-build data task**
24. Export certification point titles from prod to reference file
25. Verify `#understanding` tags on certification points — tag if missing

**Phase 8: Cleanup**
26. Update `definitions.md` — replace old "Calibration Badge" definition
27. OG tags for badge page via `SEO` component

#### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDD_p686_badge_points.sql` | badge_points table, is_certifier column, RLS, seed data |
| `src/app/data/badge-service.interface.ts` | BadgePoint type, BadgeService interface |
| `src/app/data/badge-service-real.ts` | Supabase implementation |
| `src/app/data/badge-service.ts` | Service export |
| `src/app/pages/badge-page.tsx` | Badge certificate page (route: `/p/:slug/badge`) |
| `src/app/components/profile/badge-certificate.tsx` | Badge certificate component |
| `src/app/components/profile/export-badge-certificate.tsx` | 1080x1080 image export variant |

#### Files to Modify

| File | Change |
|------|--------|
| `src/app/pages/clarity-live-page.tsx` | Add `systemTags` to snapshot (line 1610); badge check in `handleFreeRoundComplete`; badge state in dual-ack reset |
| `src/app/types/index.ts` | Add `badgePointEarned`, `badgeCount` to `LiveSessionState`; add `BadgePoint` type |
| `src/app/components/partners/free-mode-success.tsx` | Add badge headline props and conditional render |
| `src/components/ui/gravatar-avatar.tsx` | Add `showBadge` prop with distinct styling |
| `src/app/pages/profile-page-v2.tsx` | Add badge link in navigation cluster; fetch badge count |
| `src/App.tsx` | Add `/p/:id/badge` route |
| `docs/definitions.md` | Replace "Calibration Badge" definition |

## Test Coverage Strategy

| Layer | File | Coverage |
|-------|------|----------|
| DB schema + RLS | `e2e/integration/p686-badge-migration.spec.ts` (8) | Table shape, columns, public SELECT, certifier INSERT, non-certifier blocked, UNIQUE constraint, UPDATE/DELETE blocked |
| Business logic | `src/tests/p686-badge-service.test.ts` (19) | Badge count, position qualification (7-point Likert), all `canCertify` gates |
| Two-party /live | `e2e/p686-badge-certification.spec.ts` (10) | Happy path, 3 silent-skip paths, duplicate |
| Certificate page | `e2e/p686-badge-certificate.spec.ts` (12) | Page load, progress, points, certifier link, owner/visitor, OG meta |
| Profile display | `e2e/p686-badge-profile.spec.ts` (10) | Checkmark, badge link, navigation, pledge+badge coexistence |
| Accessibility | `e2e/a11y/p686-badge-accessibility.spec.ts` (7) | progressbar ARIA, checkmark aria-label, keyboard nav |
| Regression | `e2e/p686-smoke.spec.ts` (5) | No errors, graceful 0-badge, non-existent slug |
| Acceptance | `features/uat/p686.md` (12) | All 12 ACs as Given/When/Then |

**Not tested (rationale):** Component internals (covered by E2E), browser download APIs (real download in E2E).

**Total:** 71 automated tests + 12 UAT scenarios.

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task.

### Consistency Check Summary

**Check 1: AC Coverage** — All 12 ACs map to at least one build step. No uncovered criteria.

**Check 2: UX–Architecture Drift** — None found. Distinct badge checkmark styling (AD-6/step 15), visitor CTA (step 20), and role-aware celebration copy (step 14) all addressed in architecture.

**Check 3: Security Blockers** — All addressed: public SELECT + certifier-only INSERT RLS in Task 1; client-side security debt documented and accepted for Step 1 (Step 2 requires RPC).

---

### Task 1: Database — badge_points table, is_certifier, RLS, seed
- **Files:** `supabase/migrations/YYYYMMDD_p686_badge_points.sql` (create)
- **Spec refs:** "Solution > Data Model (lines ~47-76)", "Technical Architecture > Security Review (lines ~512-535)", "Technical Architecture > Implementation Approach > Build Sequence Phase 1 (lines ~541-545)"
- **Tests:** `e2e/integration/p686-badge-migration.spec.ts`
- **Depends on:** None
- **Verify:** `badge_points` table exists with all columns and UNIQUE(user_id, point_id); `is_certifier` on profiles; RLS allows public SELECT and certifier INSERT; Slava profile has `is_certifier = true`
- [ ] Complete

### Task 2: Badge service interface and types
- **Files:** `src/app/data/badge-service.interface.ts` (create), `src/app/data/badge-service.ts` (create)
- **Spec refs:** "Technical Architecture > Architecture Decisions > AD-1 (lines ~474-479)", "Technical Architecture > Implementation Approach > Build Sequence Phase 2 steps 5-7 (lines ~548-550)"
- **Tests:** `src/tests/p686-badge-service.test.ts`
- **Depends on:** Task 1
- **Verify:** `BadgePoint` type, `BadgeService` interface, and service export compile without errors; unit tests for interface shape pass
- [ ] Complete

### Task 3: Badge service implementation (Supabase)
- **Files:** `src/app/data/badge-service-real.ts` (create)
- **Spec refs:** "Technical Architecture > Architecture Decisions > AD-1 (lines ~474-479)", "Technical Architecture > Implementation Approach > Build Sequence Phase 2 step 6 (lines ~549)"
- **Tests:** `src/tests/p686-badge-service.test.ts` (19 tests — badge count, position qualification, canCertify gates)
- **Depends on:** Task 2
- **Verify:** `insertBadgePoint()` (ON CONFLICT DO NOTHING), `getBadgePoints(userId)`, `getBadgeCount(userId)` all compile; unit tests pass (mocked Supabase client)
- [ ] Complete

### Task 4: Types — LiveSessionState badge fields + BadgePoint
- **Files:** `src/app/types/index.ts` (modify)
- **Spec refs:** "Technical Architecture > Architecture Decisions > AD-3 (lines ~487-493)", "Technical Architecture > Implementation Approach > Build Sequence Phase 3 step 9 (lines ~554)"
- **Tests:** `src/tests/p686-badge-service.test.ts` (type checks)
- **Depends on:** Task 2
- **Verify:** `LiveSessionState` has `badgePointEarned?: boolean` and `badgeCount?: number`; TypeScript compiles with no errors
- [ ] Complete

### Task 5: /live — systemTags snapshot fix + badge certification logic
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify)
- **Spec refs:** "Technical Architecture > Technical Analysis points 2-4 (lines ~450-462)", "Technical Architecture > Architecture Decisions > AD-2, AD-4, AD-5 (lines ~482-502)", "Technical Architecture > Implementation Approach > Build Sequence Phase 3 steps 8-11 (lines ~553-561)"
- **Tests:** `e2e/p686-badge-certification.spec.ts` (10 tests — happy path, 3 silent-skip paths, duplicate)
- **Depends on:** Task 3, Task 4
- **Verify:** Add `systemTags: p.systemTags` to snapshot at line ~1610; `handleFreeRoundComplete` checks certifier/listener/position/understanding-tag preconditions; badge insert fires on pass; `badgePointEarned`/`badgeCount` written to live state; cleared in dual-ack reset
- [ ] Complete

### Task 6: Celebration screen — badge headline
- **Files:** `src/app/components/partners/free-mode-success.tsx` (modify)
- **Spec refs:** "UX Design > 1. User Flows > Flow A (lines ~194-210)", "UX Design > 3. Edge Cases > Celebration screen table (lines ~352-360)", "Technical Architecture > Implementation Approach > Build Sequence Phase 4 steps 12-14 (lines ~564-566)"
- **Tests:** `e2e/p686-badge-certification.spec.ts` (celebration headline assertions)
- **Depends on:** Task 4, Task 5
- **Verify:** Badge headline renders above standard celebration when `badgePointEarned=true`; listener sees "Badge point earned! N/9"; certifier sees "You verified [name]!"; 9/9 shows "Full badge earned!"; no headline when `badgePointEarned=false`
- [ ] Complete

### Task 7: GravatarAvatar — showBadge prop
- **Files:** `src/components/ui/gravatar-avatar.tsx` (modify)
- **Spec refs:** "Technical Architecture > Technical Analysis point 5 (lines ~464-466)", "UX Design > 3. Edge Cases > Profile table (lines ~362-369)", "Technical Architecture > Implementation Approach > Build Sequence Phase 5 step 15 (lines ~569)"
- **Tests:** `e2e/p686-badge-profile.spec.ts` (checkmark assertions)
- **Depends on:** None
- **Verify:** `showBadge` prop renders checkmark overlay distinct from `showPledgeBadge`; correct sizing at sm/md/lg/xl; touch target >= 44px; ARIA label "Has Clarity Badge — N of 9 points verified"
- [ ] Complete

### Task 8: Profile page — badge link in navigation cluster + badge count fetch
- **Files:** `src/app/pages/profile-page-v2.tsx` (modify)
- **Spec refs:** "UX Design > 1. User Flows > Flow B (lines ~211-218)", "UX Design > 2. Screen Designs > Profile Navigation Cluster (lines ~247-268)", "Technical Architecture > Implementation Approach > Build Sequence Phase 5 steps 16-18 (lines ~570-572)"
- **Tests:** `e2e/p686-badge-profile.spec.ts` (10 tests — checkmark, badge link, pledge+badge coexistence)
- **Depends on:** Task 3, Task 7
- **Verify:** Badge count fetched on profile load; checkmark shows on avatar when badgeCount >= 1; "My badge (N/9)" / "See their badge (N/9)" link appears in nav cluster; pledge and badge links coexist independently; no link shown when badgeCount = 0
- [ ] Complete

### Task 9: BadgeCertificate component
- **Files:** `src/app/components/profile/badge-certificate.tsx` (create)
- **Spec refs:** "UX Design > 1. User Flows > Flow C (lines ~221-241)", "UX Design > 2. Screen Designs > Badge Certificate Page (lines ~269-318)", "Technical Architecture > Architecture Decisions > AD-6 (lines ~504-506)", "UX Design > 4. Accessibility (lines ~392-415)"
- **Tests:** `e2e/p686-badge-certificate.spec.ts` (component-level assertions), `e2e/a11y/p686-badge-accessibility.spec.ts`
- **Depends on:** Task 3
- **Verify:** Progress bar renders with correct ARIA; all 9 points listed in canonical order; verified points show checkmark + title + date, unverified show muted circle + title; certifier name links to profile; verified point titles link to public point detail pages
- [ ] Complete

### Task 10: BadgeExportCertificate — 1080x1080 image export
- **Files:** `src/app/components/profile/export-badge-certificate.tsx` (create)
- **Spec refs:** "UX Design > 2. Screen Designs > Certificate Image Export (lines ~321-347)", "UX Design > 3. Edge Cases > Certificate image table (lines ~383-390)"
- **Tests:** `e2e/p686-badge-certificate.spec.ts` (export assertions)
- **Depends on:** Task 9
- **Verify:** Fixed 1080x1080px; 3-column point grid; no dates in export; QR code embeds badge certificate URL; partial and complete badge render correctly
- [ ] Complete

### Task 11: badge-page.tsx — route, owner/visitor views, SEO, share
- **Files:** `src/app/pages/badge-page.tsx` (create), `src/App.tsx` (modify)
- **Spec refs:** "UX Design > 1. User Flows > Flow C (lines ~221-241)", "UX Design > 2. Screen Designs > Badge Certificate Page (lines ~269-314)", "Technical Architecture > Technical Analysis points 6-8 (lines ~465-471)"
- **Tests:** `e2e/p686-badge-certificate.spec.ts` (12 tests — page load, owner/visitor, OG meta, CTA), `e2e/p686-smoke.spec.ts`
- **Depends on:** Task 9, Task 10
- **Verify:** Route `/p/:slug/badge` registered in App.tsx; owner sees blue banner + ShareDropdown; visitor sees headline above + CTA card below; 0-badge shows "Badge Not Found"; OG tags render badge preview; public access (no login required)
- [ ] Complete

### Task 12: Pre-build data task — export point titles + verify understanding tags
- **Files:** `docs/technical/badge-points-reference.md` (create)
- **Spec refs:** "Solution > Pre-build Task (lines ~107-110)"
- **Tests:** None (data verification only)
- **Depends on:** Task 1
- **Verify:** Reference file contains all 9 certification point titles; all 9 points have `understanding` in `system_tags` (or migration adds missing tags); file checked in
- [ ] Complete

### Task 13: definitions.md update
- **Files:** `docs/definitions.md` (modify)
- **Spec refs:** "Done-When (line ~172)", "Resolved Decisions row 1 (lines ~147)"
- **Tests:** None
- **Depends on:** None
- **Verify:** "Calibration Badge" definition in `definitions.md` reflects P686 badge concept (proof of calibrated alignment, auto-certification from /live, progress bar); old ≥10-sessions definition removed
- [ ] Complete

---

**Total tasks:** 13 | **Can parallelize:** Task 1, Task 7, Task 13 (no dependencies); Task 2+Task 4 after Task 1; Task 12 after Task 1 | **Must be sequential:** Task 1 → Task 2 → Task 3 → Task 5 → Task 6; Task 1 → Task 4 → Task 5; Task 9 → Task 10 → Task 11; Task 3 + Task 7 → Task 8

## Related

- P685: Badge & Propagation Vision (parent vision spec)
- P567: False belief workshop curriculum (the 9 points being certified on)
- P606: The Clarity Flip Workshop
- `src/app/content/pledge-text.tsx`: Pledge text pattern to reuse for badge text
- `src/app/pages/pledge-page.tsx`: Pledge certificate page to reuse for badge page
- `src/app/components/profile/profile-certificate.tsx`: Certificate component to extend
- `src/app/components/partners/free-mode-success.tsx`: Celebration screen to upgrade
- Future: Post-flip journaling spec (P687, backlog)

## Component Strategy

### Component Inventory

**shadcn/ui primitives available** (in `src/components/ui/`):
`button`, `dropdown-menu`, `dialog`, `drawer`, `tooltip`, `popover`, `accordion`, `checkbox`, `input`, `textarea`, `label`, `slider`, `scroll-area`, `sonner` (toasts), `clarity-loader`, `clarity-logo`, `gravatar-avatar`, `person-avatar`, `ear-badge`, `understood-badge`

**App components relevant to P686** (in `src/app/components/`):
- `profile/profile-certificate.tsx` — pledge certificate (parchment frame, seal, QR, signature footer)
- `profile/export-certificate.tsx` — 1080x1080 pledge image export (inline styles for html-to-image)
- `profile/pledge-certificate-view.tsx` — owner/visitor views with ShareDropdown + WitnessCard
- `profile/share-dropdown.tsx` — share menu (copy link, LinkedIn guide, email, image export)
- `agreements/agreement-share-dropdown.tsx` — near-duplicate of share-dropdown with agreement-specific text
- `layout/focus-header.tsx` — back button for focus pages
- `layout/certificate-page-shell.tsx` — max-w-3xl centered wrapper
- `partners/free-mode-success.tsx` — celebration screen (10/10 success)
- `seo.tsx` — OG tags + JSON-LD
- `shared/ShareDialog.tsx` — generic share dialog (stories/points/profiles)

### Component Map

| UI Element | Classification | Source | Justification |
|------------|---------------|--------|---------------|
| Badge headline on celebration | **Extend** | `free-mode-success.tsx` | Add `badgePointEarned`, `badgeCount`, `isFullBadge` props; prepend headline block conditionally. No structural change to existing layout. |
| Avatar checkmark overlay | **Extend** | `gravatar-avatar.tsx` | Add `showBadge` prop + `badgeSlug` for click target. Reuses existing `showPledgeBadge` sizing/positioning maps. Distinct icon: `Shield` or `Award` instead of `Check` to differentiate from pledge badge. |
| PersonAvatar badge pass-through | **Extend** | `person-avatar.tsx` | Add `badgeCount` + `badgeSlug` props, pass to GravatarAvatar as `showBadge={badgeCount > 0}` + `badgeSlug`. |
| PersonRef type | **Extend** | `src/app/types/index.ts` | Add `badgeCount?: number` field (AD-7). |
| Profile badge link | **Extend** | `profile-page-v2.tsx` | Insert badge link in navigation cluster between pledge link and agreements line. Same `inline-flex items-center gap-1 text-sm text-blue-500` pattern. Icon: `Award` from lucide-react. |
| Badge certificate component | **New** | — | `src/app/components/profile/badge-certificate.tsx`. AD-6: different content structure from `ProfileCertificate` (progress bar + point list vs. pledge sections). Reuses visual frame elements: parchment `bg-[#FDFBF7]`, double-border `8px solid #002B5C` + `outline 2px`, seal `ClarityLogoMark`, QR `QRCodeSVG`, signature footer layout. |
| Badge certificate page | **New** | — | `src/app/pages/badge-page.tsx`. Follows `pledge-page.tsx` pattern: slug-based loading, owner/visitor detection, SEO, back navigation. |
| Badge export certificate | **New** | — | `src/app/components/profile/export-badge-certificate.tsx`. Follows `export-certificate.tsx` pattern: 1080x1080 fixed size, inline styles, `forwardRef` for html-to-image. |
| Badge share dropdown | **Reuse** | `share-dropdown.tsx` | Extract share infrastructure into parameterized component OR pass badge-specific text/export ref to existing ShareDropdown. See Extraction Plan below. |
| Progress bar | **New** | — | Inline in `badge-certificate.tsx`. Simple `div` with `role="progressbar"`, `aria-valuenow`, filled/empty segments. Not a reusable component — single use, ~15 lines. No shadcn Progress needed. |
| Point list | **New** | — | Inline in `badge-certificate.tsx`. `<ul>` with 9 items, each showing verified/unverified state. Single use within certificate. |
| Back button | **Reuse** | `focus-header.tsx` | Badge page is a browse page (BottomNav shows), but back arrow follows same pattern as pledge page's inline back button. Use same inline approach as pledge-page for consistency. |
| Certificate page shell | **Reuse** | `certificate-page-shell.tsx` | `max-w-3xl mx-auto px-4` wrapper. |
| SEO component | **Reuse** | `seo.tsx` | OG tags for badge page. No extension needed — existing props cover title, description, url, type, profile. |
| Visitor CTA card | **New** | — | Inline in `badge-page.tsx`. "Join the next Clarity Workshop" + link to events. ~20 lines, single use. Same border/padding pattern as pledge page's witness CTA card. |
| Route registration | **Extend** | `src/App.tsx` | Add `/p/:id/badge` route. |
| Badge service | **New** | — | `src/app/data/badge-service*.ts` (3 files per AD-1). Data layer, not UI — included for completeness. |
| LiveSessionState type | **Extend** | `src/app/types/index.ts` | Add `badgePointEarned?: boolean`, `badgeCount?: number`. |
| Badge text content | **New** | — | `src/app/content/badge-text.ts`. Title, subtitle, summary template — mirrors `pledge-text.tsx` pattern. [FOUNDER DECISION] content. |

### Composition Trees

**Celebration Screen (upgraded) — `free-mode-success.tsx`**

```
FreeModeSuccess
├── [NEW] Badge headline block (conditional: badgePointEarned === true)
│   ├── <h2> "Badge point earned!" / "You verified [name]!" (role-aware)
│   └── <p> "N/9 clarity points verified"
├── Celebration header (existing)
│   ├── emoji
│   ├── <h2> "You understood [name] perfectly!" (existing, now secondary)
│   └── <p> rounds message + story title
├── Journey box (existing, unchanged)
└── Continue button + dual-ack (existing, unchanged)
```

**Profile Page (badge additions) — `profile-page-v2.tsx`**

```
ProfilePageV2
├── ... (existing header/avatar section)
│   └── GravatarAvatar
│       └── [EXTENDED] showBadge overlay (when badgeCount > 0)
│           └── <a> → /p/:slug/badge
│               └── Award icon (lucide)
├── Navigation cluster (existing)
│   ├── Pledge link (existing)
│   ├── [NEW] Badge link (when badgeCount > 0)
│   │   └── <Link> "My badge (N/9)" / "See their badge (N/9)"
│   │       └── Award icon + text
│   ├── AgreementsMetadataLine (existing)
│   └── InlineCalibration (existing)
└── ... (rest of profile)
```

**Badge Certificate Page — `badge-page.tsx`**

```
badge-page.tsx
├── SEO (reused)
├── container div (max-w-5xl, same as pledge-page)
│   ├── Back button (inline, same pattern as pledge-page)
│   ├── [Owner] Blue info banner
│   │   └── BadgeShareDropdown (copy link, LinkedIn, export)
│   │       └── ExportBadgeCertificate (hidden, offscreen ref)
│   ├── [Visitor] Headline: "[Name] is building calibrated alignment"
│   ├── CertificatePageShell (max-w-3xl wrapper)
│   │   └── BadgeCertificate
│   │       ├── Title section ("CLARITY BADGE" + subtitle)
│   │       ├── Progress bar (div, role="progressbar")
│   │       ├── Summary line ("[Name] is calibrated on N of 9...")
│   │       ├── Verifier line ("Verified by [Name →]")
│   │       ├── Point list (<ul>, 9 items)
│   │       │   ├── Verified: ✓ + title link + date
│   │       │   └── Unverified: ○ + title (muted)
│   │       └── Signature footer (avatar + name + seal + QR/date)
│   │           ├── GravatarAvatar (reused)
│   │           ├── ClarityLogoMark seal (reused)
│   │           └── QRCodeSVG (reused)
│   └── [Visitor] CTA card: "Join the next Clarity Workshop"
└── [NOT FOUND state] "Badge Not Found" (same pattern as pledge not-found)
```

**Badge Export (1080x1080) — `export-badge-certificate.tsx`**

```
ExportBadgeCertificate (forwardRef)
├── Title ("CLARITY BADGE" + subtitle)
├── Progress bar (inline styles)
├── Summary + verifier text
├── Point grid (3-column, inline styles)
│   ├── ✓/○ icon per point + abbreviated title
├── Signature row
│   ├── Avatar circle (inline, same as export-certificate.tsx)
│   ├── Seal SVG (inline ClarityLogoMark)
│   └── QRCodeSVG
└── Watermark ("claritypledge.com")
```

### Visual Specification

**1. Visual Hierarchy**

| Zone | Primary element | Token / Value |
|------|----------------|---------------|
| Celebration badge headline | "Badge point earned!" | `text-xl font-semibold text-green-600` (SUCCESS state — consistent with existing celebration headline) |
| Celebration badge subtitle | "N/9 clarity points verified" | `text-sm text-muted-foreground` |
| Certificate title | "CLARITY BADGE" | `text-3xl md:text-4xl font-serif tracking-wide text-[#1A1A1A] dark:text-foreground` + `fontFamily: '"Playfair Display", Georgia, serif'` (matches pledge certificate) |
| Certificate subtitle | [FOUNDER DECISION] | `text-xs text-[#1A1A1A]/60 dark:text-muted-foreground uppercase tracking-[0.2em] font-sans` |
| Progress bar filled | N/9 segments | `bg-blue-500` (action/CTA blue per design system) |
| Progress bar empty | remaining segments | `bg-muted` (`hsl(240 4.8% 95.9%)`) |
| Progress label | "N/9" | `text-sm font-medium text-foreground` |
| Summary line | "[Name] is calibrated..." | `text-lg leading-relaxed text-[#1A1A1A] dark:text-foreground font-serif` |
| Verifier link | "[Certifier Name]" | `text-[#0044CC] hover:underline` (action blue) |
| Verified point | "✓ Point title — date" | icon: `text-green-600` (SUCCESS), title: `text-foreground`, date: `text-muted-foreground text-sm` |
| Unverified point | "○ Point title" | icon + title: `text-muted-foreground` |
| Avatar checkmark (badge) | Award/Shield icon | `bg-green-600 text-white` (SUCCESS indicator, distinct from pledge's `bg-blue-500`) with `border-2 border-white` |
| Badge nav link | "My badge (N/9)" | `inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 hover:underline` (matches pledge link) |
| Visitor CTA | "Join the next Clarity Workshop" | `border border-blue-500/30 bg-gradient-to-br from-blue-50/50` (matches pledge witness CTA) |

**2. Emotional Register**

| Surface | Register | Why |
|---------|----------|-----|
| Celebration badge headline | Reward / achievement | Matches existing celebration tone. Green SUCCESS state signals completion of a meaningful action. |
| Certificate page | Formal / evidential | Parchment frame, serif type, seal — mirrors pledge certificate gravitas but content is evidence ("calibrated"), not commitment ("I commit"). |
| Profile checkmark | Quiet signal | Small visual indicator, not celebratory. Conveys status without drawing attention from the profile content itself. |
| Visitor CTA | Invitational | Warm but not pushy. "Join" language, not "Sign up" or "Buy". Community-oriented. |

**3. Negative Constraints**

- NO green action buttons (green is SUCCESS state only — checkmark icon, celebration headline)
- NO amber, orange, yellow, or purple anywhere
- NO gold/metallic tones (spec mentions "neutral/gold?" in risks — resolved: use green for badge checkmark to signal verified/earned status, blue for interactive elements)
- NO commercial upsell language on badge certificate ("workshop invitation only" per spec)
- NO animation on the progress bar (static state display, not a loading indicator)
- Badge checkmark MUST be visually distinct from pledge badge — different icon (`Award` vs `Check`) AND different background color (`green-600` vs `blue-500`)
- Certificate DOES NOT extend `ProfileCertificate` (AD-6) — no pledge text sections, no pledge version handling

**4. Spacing Per Zone**

| Zone | Spacing tokens | Reference |
|------|---------------|-----------|
| Celebration badge headline | `mb-2` below badge headline before existing celebration header. Existing header already has `space-y-2 mb-4`. | Matches existing `free-mode-success.tsx` rhythm |
| Certificate title section | `space-y-2 pb-6 border-b-2` (same as pledge certificate) | `profile-certificate.tsx:66` |
| Progress bar | `mt-6 mb-4` within certificate body | Between title section and summary |
| Point list | `space-y-2` between items, `mt-6` above list | Comfortable scanning density |
| Signature footer | `pt-8 border-t-2` (same as pledge) | `profile-certificate.tsx:141` |
| Badge nav link on profile | `mt-1` (same as pledge link) | `profile-page-v2.tsx:894` |
| Visitor CTA card | `mt-16` (same gap as pledge witness CTA below certificate) | `pledge-certificate-view.tsx:139` |

**5. Animation / Transition**

| Element | Behavior |
|---------|----------|
| Badge headline on celebration | No entrance animation — renders with the celebration screen as a single state transition (same as existing headline). The celebration screen itself is a page state change, not an in-place update. |
| Badge nav link on profile | `animate-[clarity-appear_300ms_ease-out_forwards]` — same fade-in as agreements line and calibration bar (loaded async). |
| Avatar checkmark | No animation — static indicator. Matches pledge ring behavior. |
| Progress bar | No animation — static filled state. Not a loading bar. |
| Share dropdown | Existing dropdown-menu animation (Radix `data-[state=open]` transitions). No change. |

### Extraction Plan

**ShareDropdown duplication (HIGH priority).**
`share-dropdown.tsx` and `agreement-share-dropdown.tsx` are structurally near-identical (~90% shared code). Badge needs a third variant. Rather than creating `badge-share-dropdown.tsx` (third copy), extract the shared infrastructure:

**Proposed extraction:** Create `src/app/components/profile/certificate-share-dropdown.tsx` — a parameterized component accepting:
- `url: string` — the shareable URL
- `entityName: string` — "Pledge" / "Badge" / "Agreement"
- `ownerName: string` — for email subject/body templates
- `linkedInPostText: string` — pre-composed LinkedIn text
- `exportRef: RefObject<HTMLDivElement>` — ref to the offscreen export component
- `exportFileName: string` — download filename

The three callers (`pledge-certificate-view.tsx`, `agreement-share-dropdown.tsx`, `badge-page.tsx`) pass their specific text and export ref. The dropdown structure, copy-to-clipboard, LinkedIn guide modal, email template, and download logic are shared.

**Recommendation:** Do this extraction in Phase 6 (Badge certificate page) when the badge share is being built. Refactor the existing two callers in the same pass. Scope: ~3 files modified, 1 file created, net code reduction.

**Certificate frame duplication (MONITOR, do not extract yet).**
`BadgeCertificate` will reuse the visual frame (parchment bg, double-border, seal, QR, signature footer) from `ProfileCertificate`. These are inline Tailwind classes, not extracted components. If a third certificate type emerges, extract a `CertificateFrame` wrapper. For now, copy the frame classes — two instances does not justify extraction overhead.

