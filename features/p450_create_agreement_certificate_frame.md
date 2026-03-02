---
status: today
type: story
rank: 1000002.25
tags:
  - p422
  - agreements
  - ceremony
  - ux
changes: p422
created_date: 2026-02-26T00:00:00.000Z
locked_at: '2026-03-02T08:36:17.791Z'
---

# P450: Create Agreement Form — Certificate Frame + Pledge Text

## Problem

The create agreement form (`/agreements/new`) is a plain white form with no ceremony. The agreement *view* (`/agreements/:id`) has the full certificate frame (navy border, cream background). The creation step should feel like drafting a real document — ceremony starts when you begin, not only when you look at the result.

Two gaps:
1. No certificate frame on the create form
2. No pledge commitment text — the form only has editable terms (logistics), not the standard behavioural commitment from the Clarity Pledge

## Design

Approved ASCII:

```
╔══════════════════════════════════════════════════╗
║          C L A R I T Y   P L E D G E            ║
║      "We all crave being understood"             ║
║  ──────────────────────────────────────────────  ║
║                                                  ║
║  When we speak, if you need to know I truly      ║
║  understand you, please ask me to mirror back    ║
║  what I heard. I will explain back what I think  ║
║  you meant—withholding judgment or criticism—so  ║
║  you can confirm or correct me. I won't pretend  ║
║  to understand if I don't. If I can't keep this  ║
║  promise in the moment, I'll explain why.        ║
║                              [fixed, read-only]  ║
║  ──────────────────────────────────────────────  ║
║                                                  ║
║  Partner email                                   ║
║  [______________________________________________] ║
║                                                  ║
║  Our terms                                       ║
║  ┌──────────────────────────────────────────┐   ║
║  │ Scope: Professional / all communication  │   ║
║  │ Frequency: [X] sessions per [period]     │   ║
║  │ ...                                      │   ║
║  └──────────────────────────────────────────┘   ║
║                                                  ║
║  Visibility   ● Private   ○ Public               ║
║                                                  ║
║        [ ✦  Seal & Invite Partner ]              ║
╚══════════════════════════════════════════════════╝
```

## Implementation Notes

- Certificate frame: reuse `AgreementCertificate` component styles (navy border, cream bg) — already exists in `src/app/components/agreements/agreement-certificate.tsx`
- Pledge text: pull from `PLEDGE_TEXT` in `src/app/content/pledge-text.tsx` (v3 — exact text, not paraphrased). Render as read-only paragraph inside the frame, above the divider.
- Button copy: change "Create & Send Invitation ★" → "✦ Seal & Invite Partner"
- Visibility: move to bottom (currently near top)
- No DB changes, no new components

## Acceptance Criteria

- [ ] Create form has certificate frame (navy border, cream background)
- [ ] Pledge commitment text (YOUR RIGHT + MY PROMISE + THE EXCEPTION condensed) appears inside the frame, above the email field, read-only
- [ ] Text matches `PLEDGE_TEXT` exactly — pulled from `pledge-text.tsx`, not hardcoded
- [ ] Button reads "✦ Seal & Invite Partner"
- [ ] Visibility toggle is below the terms textarea
- [ ] All existing validation still works
