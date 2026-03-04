---
status: qa
delivery_stage: uat
type: task
rank: 1000003
tags:
  - agreements
  - p466
  - uat-polish
created_date: 2026-03-03
flow: dev
uat_file: features/uat/p472.md
test_files:
  - e2e/p472-agreements-polish.spec.ts
  - e2e/p472-smoke.spec.ts
---

# P472: Agreements post-UAT polish

Post-UAT fixes and UX improvements discovered during P466 review. Covers visual corrections to the creation certificate, data accuracy bugs, behavioral gaps, and design consistency.

Predecessor: P466 (agreement creation redesign)

---

## Acceptance Criteria

### A — Certificate: creation mode (agreement-certificate.tsx)

- [x] A1: In creation mode, the **entire** bottom signature row (creator slot + seal + partner slot) is hidden. A single informational line — "Agreement becomes active when both parties sign" — replaces it. Guard: render the full signature row only when `!isCreation`. This single condition covers A2 (seal hidden) and A3 (partner slot hidden) — they're sub-items of A1.
- [x] A4: Tagline "We all crave being understood..." moved above the creation block (correct reading order: header → tagline → "We, X and Y, agree to:")
- [x] A5: Partner name input has subtle underline always visible when unfocused (`border-b-2 border-[#1A1A1A]/20`), blue on focus, red on error — field looks editable, not static text
- [x] A-terms: Terms textarea has light cream tinted background (`bg-[#F5F1E8]`) that disappears on focus (`focus:bg-transparent`) — editable signal, looks like a draft being written
- [x] D3: Terms textarea uses `font-sans` for edit state; read-only display keeps serif

### A-active — Certificate: active/pending modes (agreement-certificate.tsx)

- [x] A-active-1: In active/celebration mode, signature row shows creator and partner identity blocks without "CREATOR"/"PARTNER" labels — just name (and avatar if available). One "Active since [date]" line below both names (using `partnerSignedAt`). Per-person "Signed on..." dates removed.
- [x] A-active-2: In pending mode, signature row shows creator name block (no label) + partner name (or placeholder) + seal in dashed/pending state. No signing dates.
- [x] A-active-3: Max width of the certificate page container in `create-agreement-page.tsx` increased from `max-w-2xl` to `max-w-3xl` (consistent with ProfileCertificate). Note: `agreement-page.tsx` (detail view) uses `max-w-xl` — leave it unchanged for now; the narrower width is acceptable for the read-only/active view.

### B — Bugs

- [x] B1: Partner count on profile page shows active agreements only ("N Clarity Partners") — pending, terminated excluded from count
- [x] B3: `DEFAULT_TERMS` has no placeholder brackets — `[X]` → `1`, `[month/quarter]` → `month`
- [x] B4: Pending state (`PendingView`) has "Resend Invitation" button — shown only when `isCreator === true`, same guard pattern as `ExpiredView`. Placement: below the info panel, same as `ExpiredView`.
- [x] B4+: Resend button disabled for 24h after click (client-side). localStorage key: `clarity-resend-${agreementId}`, value: ISO timestamp of last send. On mount: read key; if present and within 24h → button disabled with label "Invitation sent — can resend in Xh". Clears automatically after 24h.

### C — Behavioral gaps

- [x] C2: Invitation expiry check-at-read in `getAgreementsForProfile()` — presentation-layer only, **no DB write**. Logic: if `status === 'pending'` and `invitationExpiresAt < now()` → override returned status to `'expired'` in memory. `getAgreement()` may keep its existing write-on-read behavior; what matters is that list and detail views both display expired status consistently.
- [x] C4: `toast.success('Agreement sent — waiting for [partnerName] to co-sign.')` fires before `navigate()` on successful submission
- [x] C5: "Ready to practice? Start a /live session →" link in `CelebrationDialog` (below existing calendar link) and one-liner in `ActiveView`
- [x] C6: `TerminateDialog` copy updated to: title "End this agreement?", description "This will permanently end your Clarity Partner Agreement with [partnerName]. Both of you will be notified by email. You can still view it as history." Note: `TerminateDialog` needs a `partnerName: string` prop added (thread from `agreement.partner?.name ?? 'your partner'`). No service logic change — `terminateAgreement()` already calls `invokeAgreementEmails('terminated', ...)`.

### D — Design consistency

- [x] D1: `profile-connections-page.tsx` shows two sections: "Active" (N items) and "Pending invitation" (N items) — flat list becomes grouped. Sections with 0 items are hidden. Count badge = active only.
- [x] D2: CTA copy changed from "Seal & Send Invitation ✦" to "Seal & Send ✦" (drop "Invitation", keep "Seal" — bilateral commitment metaphor)
- [x] D-visibility: Default visibility changed from `private` to `public` in `create-agreement-page.tsx`. Visibility buttons reordered: Public first (left), Private second (right).
- [x] Calendar: `CelebrationDialog` replaces hardcoded Google Calendar text link with `<AddToCalendarButton>` — Google primary + dropdown (Outlook.com, Microsoft 365). ICS download hidden when no date provided (no start/end date pre-filled for this use case).

  **Calendar component interface:**
  - Define `CalendarEventData` with optional `startDate?: Date`, `endDate?: Date` (separate from events' `ICSEventData` which requires non-optional dates)
  - When no date: show Google/Outlook/O365 links only (open calendar app with event title, user picks date)
  - ICS button hidden (not disabled) when `startDate` absent
  - Extract from `src/app/prototypes/events/components/RsvpConfirm.tsx` and utils in `src/app/prototypes/events/utils.ts`
  - Calendar event title: "Clarity /live session with [partnerName]"

---

## Technical Notes

**Files to change:**
- `src/app/components/agreements/agreement-certificate.tsx` — A1, A4, A5, A-terms, D3, A-active-1, A-active-2
- `src/app/pages/create-agreement-page.tsx` — A-active-3 (max-w-3xl), B3, D2, D-visibility, C4
- `src/app/pages/agreement-page.tsx` — B4, B4+, C5 (ActiveView), C6 (TerminateDialog + partnerName prop)
- `src/app/components/agreements/celebration-dialog.tsx` — C5, Calendar
- `src/app/data/agreements-service.ts` (or agreements-service-real.ts) — C2 expiry in `getAgreementsForProfile()`
- `src/app/components/agreements/agreements-metadata-line.tsx` — B1
- `src/app/pages/profile-connections-page.tsx` — D1

**New shared component:**
- `src/app/components/shared/add-to-calendar-button.tsx` — extracted from events `RsvpConfirm.tsx`; defines its own `CalendarEventData` interface with optional `startDate?`/`endDate?`.
- **Do NOT import from `src/app/prototypes/`** — prototypes are experimental and not meant as production imports. Instead, **copy** the three URL-building functions (`getGoogleCalendarUrl`, `getOutlookUrl`, `getOffice365Url`) directly into the new component file. They are pure functions with no prototype-specific dependencies. ICS button hidden when no date.

**Key constraint — A1 (creation mode signature row):**
- **Current state:** The signature row (lines ~277–320 of `agreement-certificate.tsx`) renders unconditionally — there is NO existing `isCreation` guard around it.
- **What to add:** Wrap the row in a ternary: `{isCreation ? <p className="text-xs text-[#1A1A1A]/40 font-sans mt-3">Agreement becomes active when both parties sign.</p> : <div className="pt-5 border-t-2 border-[#002B5C]">...full row...</div>}`
- **Also remove (P466 residue inside the row, now superseded by hiding the row):**
  - The `hideNameText={isCreation}` prop on the creator `SignatureSlot` call — no longer needed
  - The `{isCreation && <p className="text-xs ...">will sign upon acceptance</p>}` block at the bottom of the row — replaced by the top-level ternary
- This single ternary covers A2 (seal) and A3 (partner slot) — no separate guards needed

**Key constraint — A-active (active mode signature row):**
- **Do NOT remove the label `<p>` from `SignatureSlot` unconditionally** — this would silently break `MutedCertificate` (used in declined/expired/terminated views, not in the "files to change" list).
- Instead: add `hideLabel?: boolean` prop to `SignatureSlot`. Pass `hideLabel={isActive}` (where `isActive = variant === 'active' || variant === 'celebration'`) and `hideLabel={isPending}` for pending mode — both active and pending drop the CREATOR/PARTNER labels.
- Active/celebration: show `partnerSignedAt` formatted as "Active since [date]" as a single line below both names; suppress individual `signedAt` from each slot.
- **Remove:** The existing "Active since [date]" paragraph rendered outside `<AgreementCertificate>` in `ActiveView` (`agreement-page.tsx`) — once A-active-1 adds it inside the certificate, the outer copy creates a duplicate.
- Pending: creator name + partner name/placeholder, no dates, no labels.

**Key constraint — C2 expiry:**
- The service query for `getAgreementsForProfile()` already includes `'pending'` status in its filter (along with `'active'` and `'terminated'`). C2 runs on the pending results that are returned.
- Check-at-read: if `status === 'pending'` and `invitationExpiresAt < now()` → override status to `'expired'` in-memory before returning, **no DB write**.
- Behavior after C2: agreements reclassified to expired-in-memory will NOT appear in D1's "Active" or "Pending invitation" sections (D1 only shows active and pending). This is correct — an expired invitation is neither active nor pending. They are visible at the detail URL.
- The consistency goal: a pending agreement past its expiry date shows as expired in the detail view (`getAgreement()`) AND is absent from the connections list (D1) — both are "expired" treatment. If `getAgreement()` has already DB-written it as expired, it's excluded from the list query entirely; if not yet DB-written, C2 reclassifies it and it still drops out of D1. Both paths are consistent.
- `getAgreement()` retains its existing write-on-read behavior — no change to it.

**Key constraint — Calendar (no date):**
- Google Calendar: omit `dates` param → opens event creation UI, user picks date/time
- Outlook/O365: same — omit date params
- ICS download: hidden when no `startDate` (requires a date to generate a valid .ics file)
- `CalendarEventData` interface is separate from events' `ICSEventData` — do not modify events utils

**Key constraint — B4+ localStorage:**
- Key format: `clarity-resend-${agreementId}` (string)
- Value: ISO timestamp string (e.g. `new Date().toISOString()`)
- On mount: `const stored = localStorage.getItem(key); if (stored && Date.now() - new Date(stored).getTime() < 86400000) { setResendDisabled(true); }`
- Cooldown label: "Resend available in Xh" (show remaining hours, rounded up)

**Key constraint — B4 isCreator guard:**
- `PendingView` currently receives `{ agreement, isPartner }` — it does **not** have an `isCreator` prop yet. Add `isCreator: boolean` to `PendingView`'s props and thread it from the call site (where `isCreator` is already computed in the parent).
- Resend button: `{isCreator && <Button ...>Resend Invitation</Button>}`
- Mirror `ExpiredView` placement exactly (below the info panel)

**Key constraint — C6 TerminateDialog:**
- Add `partnerName: string` prop to `TerminateDialog`
- Thread from `agreement.partner?.name ?? 'your partner'` at call site in `agreement-page.tsx`
- No change to `terminateAgreement()` service method

---

## Skipped (falsified — not building)

- A6: Visibility default public (original skip) — **reversed**: D-visibility now adds this as it was confirmed valuable
- C1: Cancel invitation — redundant once C2 expiry ships
- C3: Decline reason capture — co-founders talk; adds friction to decliner
- C7: Preview invitation email — fixed template, not cold outreach
- D4: Visitor-initiated agreement from profile — marketplace feature
- D5: Terms negotiation in-app — catastrophic complexity vs benefit

---

## Test Coverage Strategy

P472 is a pure UI/UX polish feature — no new DB migrations, no new API endpoints, no new routes. The test strategy reflects this.

### Automated tests

**`e2e/p472-smoke.spec.ts`** — 4 tests, no auth/DB fixtures needed.
Fast regression: app root loads, `/agreements/new` redirects unauthenticated users cleanly, `/agreements/:id` handles a non-existent UUID gracefully (not-found, not crash). Run first in CI to catch regressions before the behavioral suite.

**`e2e/p472-agreements-polish.spec.ts`** — 7 flows, ~20 tests, authenticated with DB fixtures.

| Flow | Criteria covered | Approach |
|------|-----------------|----------|
| Flow 1 — Create page defaults | D2 (CTA copy), D-visibility (default + button order), B3 (no brackets in terms), A1 (signature row hidden), A4 (tagline position), A5 (input visible) | `setTestSession` as creator; no partner needed |
| Flow 2 — PendingView resend | B4 (resend button for creator), B4+ (localStorage cooldown) | `createTestAgreement` with `status: 'pending'`; cooldown tested via `addInitScript` |
| Flow 3 — Connections grouping | D1 (Active/Pending sections, correct order) | One active + one pending agreement per owner |
| Flow 4 — Metadata line count | B1 (active-only count) | One active + one pending; visitor asserts count = 1 |
| Flow 5 — TerminateDialog | C6 (title, description) | `createTestAgreement` with `status: 'active'`; creator opens dialog |
| Flow 6 — /live link ActiveView | C5 (href="/live" in active page) | Same active agreement fixture |
| Flow 7 — Calendar regression | Calendar (old hardcoded link gone) | Unauthenticated smoke check |

### Not automated (covered by UAT)

| Item | Why not automated |
|------|------------------|
| A5 underline visual (cream tint, dark underline) | CSS pixel-level check — browser visual only |
| A-terms cream background | Same — visual check |
| D3 font-sans in edit state | Font family assertion unreliable in E2E |
| A-active-1/2 label removal | Requires active/pending agreement with two real accounts |
| A-active-3 max-w-3xl width | Visual comparison, not a behavioral check |
| CelebrationDialog calendar button | Requires full two-account acceptance flow |
| C4 toast-before-navigate timing | Too flaky to assert reliably in E2E |
| B4 non-creator (partner) cannot see Resend | Requires partner_profile_id set; see UAT B4-02 |
| C2 expiry check-at-read | Requires DB manipulation (set `invitation_expires_at` in the past) |

### No unit tests

The localStorage cooldown logic (`clarity-resend-${agreementId}`, 24h window, remaining hours display) is tested end-to-end in Flow 2 via `addInitScript` injection. The logic is a single conditional (`Date.now() - new Date(stored).getTime() < 86400000`) — not complex enough to warrant a separate unit test file. If the cooldown is later extracted into a shared hook, add unit tests at that time.
