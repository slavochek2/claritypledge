---
status: done
type: bug
severity: low
date_reported: 2026-03-06
completed_at: "2026-03-07"
p_number: 485
title: Certificate signature block avatars visually misaligned
date_resolved: 2026-03-06
root_cause: Flex container used items-start with no equal-width columns
resolution: Changed to items-center + flex-1 on SignatureSlot for balanced layout
---

# P485: Certificate signature block avatars visually misaligned

## Bug Description

**Reported:** 2026-03-06
**Severity:** Low (cosmetic)

**Symptoms:**
- Two partner avatars/names at bottom of agreement certificate look visually unbalanced
- Long name vs short name creates asymmetry
- Center seal sits higher than avatars due to `items-start` alignment

**Root cause:** Flex container uses `items-start justify-between` with no equal-width columns.

**Fix:** Changed to `items-center` + `flex-1` on signature slots, removed compensating `pt-1` on seal.

**Files changed:**
- src/app/components/agreements/agreement-certificate.tsx
