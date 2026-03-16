---
status: week
type: feature
rank: 250007.75
workstream: R1
created_date: 2026-03-16
flow: dev
tags: []
uat_file: features/uat/p538.md
test_files:
  - e2e/p538-agreement-share.spec.ts
  - e2e/p538-smoke.spec.ts
---

# P538: Agreement Download Image & Share Dropdown

## Problem

The Clarity Pledge page has a "Download Image" button and a "Share" dropdown (copy link, LinkedIn, email invite). The Partner Agreement page has no equivalent — users can't easily share or download their active agreement.

## Solution

Copy the ShareDropdown pattern from the pledge page into a new `AgreementShareDropdown` component. Agreement-specific content:

- **Export certificate**: New `ExportAgreementCertificate` — renders the agreement certificate (both names, terms, gold seal) as a 1080x1080 PNG-exportable layout with inline styles (html-to-image compatibility). Gold seal uses inline `#D4AF37` border, not Tailwind classes. QR code links to `https://claritypledge.com/agreements/{id}`.
- **Download filename**: `clarity-agreement-{displayId}.png` (e.g. `clarity-agreement-A-0042.png`)
- **Agreement URL**: Constructed as `${window.location.origin}/agreements/${agreement.id}` — passed as prop to `AgreementShareDropdown`
- **Share text**: "We made a Clarity Partner Agreement — a mutual commitment to clarity in our communication." + both names + agreement URL
- **LinkedIn post text**: Agreement-specific (both names, bilateral language)
- **Email invite**: Subject: "{currentUserName} wants to share a Clarity Partner Agreement". Body references both parties and agreement URL. Current user name resolved from `agreement.creator?.name` or `agreement.partner?.name` based on `isCreator`.
- **Visibility**: Show only on `active` agreements, for either party. Non-party visitors see the certificate but not the toolbar (requires `visibility: 'public'` on the agreement for the page to render at all — private agreements show the locked/sign-in screen instead).

Reuse the same toolbar layout (Download Image button + Share dropdown with chevron) positioned above the certificate, matching the pledge page pattern.

## Technical Notes

Key files to create:
- `src/app/components/agreements/agreement-share-dropdown.tsx` — the dropdown (copied pattern from `share-dropdown.tsx`)
- `src/app/components/agreements/export-agreement-certificate.tsx` — PNG export layout

Key files to modify:
- `src/app/pages/agreement-page.tsx` — add toolbar to `ActiveView`

Dependencies: `html-to-image` (already installed for pledge export)

## Acceptance Criteria

- [ ] Active agreement page shows "Download Image" + "Share" toolbar above certificate
- [ ] Download produces a PNG of the agreement certificate with both names, terms, seal
- [ ] Share dropdown has: Copy Link, Share on LinkedIn (with guide modal), Invite by Email
- [ ] Share text references both parties and the agreement URL
- [ ] Toolbar hidden for non-active states (pending, declined, expired, terminated)
- [ ] Toolbar hidden for non-parties (visitors)

## Test Coverage Strategy

**What's Tested:**
- ✅ Toolbar visibility on active agreement for creator (E2E)
- ✅ Toolbar visibility on active agreement for partner (E2E)
- ✅ Share dropdown items present: Copy Link, LinkedIn, Email (E2E)
- ✅ Toolbar hidden on pending agreement (E2E)
- ✅ Toolbar hidden for non-party visitor (E2E)
- ✅ Page loads without console errors (smoke)

**What's NOT Tested (rationale):**
- ❌ PNG export rendering — `html-to-image` is a browser API, real download verified via UAT
- ❌ Clipboard copy — browser API, verified via UAT
- ❌ LinkedIn/email link opens — external browser behavior, UAT only
- ❌ Export certificate visual layout — no visual regression tooling, UAT covers
- ❌ Declined/expired/terminated toolbar hidden — same code path as pending (toolbar only renders inside `ActiveView`); pending test covers the branch

**Test Pyramid:**
```
     /\
    /  \   3 E2E flows (5 tests)
   /____\
  /      \  1 Smoke test
 /________\
```

**Files:**
- `e2e/p538-agreement-share.spec.ts` — 3 flows, 5 tests
- `e2e/p538-smoke.spec.ts` — 1 test
- `features/uat/p538.md` — 9 UAT scenarios

Total: 6 automated tests + 9 UAT scenarios
