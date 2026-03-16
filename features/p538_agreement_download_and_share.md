---
status: week
type: feature
rank: 250007.75
workstream: R1
created_date: 2026-03-16
flow: dev
tags: []
---

# P538: Agreement Download Image & Share Dropdown

## Problem

The Clarity Pledge page has a "Download Image" button and a "Share" dropdown (copy link, LinkedIn, email invite). The Partner Agreement page has no equivalent — users can't easily share or download their active agreement.

## Solution

Copy the ShareDropdown pattern from the pledge page into a new `AgreementShareDropdown` component. Agreement-specific content:

- **Export certificate**: New `ExportAgreementCertificate` — renders the agreement certificate (both names, terms, gold seal) as a PNG-exportable layout
- **Download filename**: `clarity-agreement-{displayId}.png` (e.g. `clarity-agreement-A-0042.png`)
- **Share text**: "We made a Clarity Partner Agreement — a mutual commitment to clarity in our communication." + both names + agreement URL
- **LinkedIn post text**: Agreement-specific (both names, bilateral language)
- **Email invite**: "See our Clarity Partner Agreement" with agreement URL
- **Visibility**: Show only on `active` agreements, for either party

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

## Testing

_Generated via `/generate-tests`._
