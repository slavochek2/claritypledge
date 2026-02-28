---
status: today
type: bug
rank: 1
tags:
  - agreements
  - certificate
  - copy
created_date: 2026-02-28
---

# P461: Agreement Certificate Text Deviates from V3 Pledge

## Problem

`agreement-certificate.tsx` has hardcoded copy that was never aligned to the P422 spec. All three sections deviate from both the approved bilateral v3 text and `pledge-text.tsx` (the source of truth). This affects every agreement view in prod right now.

**Current (wrong):**
- YOUR RIGHT: "To have your thoughts paraphrased before being challenged or dismissed."
- OUR PROMISE: "We will paraphrase each other's perspective before responding. We will ask questions before making assumptions. We will stay curious even when we disagree."
- THE EXCEPTION: "Emergencies — where safety and urgency require immediate action — are exempt from this practice."

**Should be (bilateral v3 per P422 spec):**
- YOUR RIGHT: "When we speak, if either of us needs to know the other truly understood them, we can ask to have it mirrored back."
- OUR PROMISE: "We will explain back what we think the other meant—withholding judgment or criticism—so they can confirm or correct us. We won't pretend to understand if we don't."
- THE EXCEPTION: "If either of us can't keep this promise in the moment, we'll explain why."
- Opening tagline: "We all crave being understood. Let's commit to listen."

## Root Cause

`agreement-certificate.tsx` was implemented with invented copy instead of the bilateral adaptation specified in P422 (spec line 379–406). `pledge-text.tsx` was never referenced.

## Fix

Update the three text sections in `agreement-certificate.tsx` to match the P422 spec exactly. No DB changes, no new components.

## Files

- `src/app/components/agreements/agreement-certificate.tsx`

## Acceptance Criteria

- [ ] YOUR RIGHT matches P422 spec bilateral text
- [ ] OUR PROMISE matches P422 spec bilateral text (single paragraph, not bullet list)
- [ ] THE EXCEPTION matches P422 spec bilateral text
- [ ] Opening tagline reads "We all crave being understood. Let's commit to listen."
- [ ] Existing visual structure (headings, serif body, navy blue headings) unchanged
