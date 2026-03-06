---
status: done
type: task
rank: 500005.5
workstream: foundation
created_date: 2026-03-06
completed_at: "2026-03-06"
flow: dev
delivery_stage: shipped
tags: [refactor, layout]
uat_file: features/uat/p482.md
test_files:
  - e2e/p482-certificate-width.spec.ts
---

# TASK: P482 — CertificatePageShell refactor

## Goal

Extract a shared `CertificatePageShell` width wrapper for all certificate-rendering pages. Fix width inconsistency where agreement detail uses `max-w-xl` (576px) while create/accept use `max-w-3xl` (768px).

## Context

7 agreement/pledge pages use 5 different max-widths. Only 4 pages render certificates — 3 already use `max-w-3xl`, one outlier uses `max-w-xl`. Non-certificate pages (declined, email confirm, sign) have intentionally different widths.

## Architecture (from /architect review)

**New component:** `src/app/components/layout/certificate-page-shell.tsx`
- Props: `children`, `className?`, `parchment?` (adds `min-h-screen bg-[#F5F3EF]`)
- Unified width: `max-w-3xl mx-auto px-4`

**Files to change:**

| Action | File | Change |
|--------|------|--------|
| Create | `src/app/components/layout/certificate-page-shell.tsx` | New shared wrapper |
| Fix | `src/app/pages/agreement-page.tsx` | 4x `max-w-xl` -> shell (main bug) |
| Adopt | `src/app/pages/create-agreement-page.tsx` | Replace inline `max-w-3xl` with shell |
| Adopt | `src/app/pages/accept-agreement-page.tsx` | Replace inline width+bg with shell (`parchment`) |

**Intentionally skipped:**
- `pledge-page.tsx` — inner already `max-w-3xl`, outer `5xl` needed for witness section
- `declined-agreement-page.tsx` — no certificate, `max-w-md` correct
- Email confirm pages — no certificates
- `sign-pledge-page.tsx` — form only, no certificate

## Test Coverage Strategy

**What's tested:**
- E2E: all 3 certificate pages render with `data-testid="certificate-page-shell"` at max-w-3xl (768px)
- E2E: width consistency cross-page comparison (detail vs create)
- UAT: parchment background preserved on accept page, non-certificate pages unchanged

**Files:**
- `e2e/p482-certificate-width.spec.ts` (4 tests)
- `features/uat/p482.md` (4 scenarios)

## Acceptance Criteria

- [x] All certificate-rendering pages use `CertificatePageShell`
- [x] Agreement detail page matches create/accept width
- [x] No visual regression on accept (parchment bg preserved)
- [x] Tests pass
