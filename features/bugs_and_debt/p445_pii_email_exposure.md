---
status: uat
type: bug
rank: 94122.5
workstream: C1
severity: high
date_reported: 2026-02-26T00:00:00.000Z
created_date: 2026-02-26T00:00:00.000Z
source: sim
changes: p422
tags:
  - privacy
  - pii
  - agreement
locked_at: '2026-03-02T08:35:54.478Z'
---

# BUG: PII — Invited Party Email Address Exposed in Agreement UI

## Problem

The full email address of the invited party is displayed in the agreement flow UI without consent or necessity. This is a privacy issue: the agreement initiator should not need to see the invitee's raw email in the UI, and the invitee should not have their email surfaced to other parties without explicit disclosure.

## Symptoms

- Email addresses visible in agreement display (e.g., party list, confirmation screens)
- No indication that sharing email is part of the consent flow
- Found by Invited Party persona in sim run on `p422-p425-uat` branch

## Root Cause

`getPartnerName()` in `src/app/components/agreements/agreement-row.tsx` fell back to `agreement.partnerEmail` (raw DB field) when the invited party had no linked profile (`agreement.partner` was null). This is the only path to screen — the agreement detail page (`agreement-page.tsx`) already used a proper fallback chain (`partner.name → partnerDisplayName → 'Invited party'`). The row component was the single missed spot.

## Resolution

_Replace raw email with display name where email is not functionally needed. Where email IS shown (e.g., confirmation of who you're signing with), add a plain-English disclosure that both parties see each other's email._

## Verification

- Agreement flow does not expose email addresses unnecessarily
- Where email is shown, disclosure text explains why
- Display names used in agreement party labels where available
