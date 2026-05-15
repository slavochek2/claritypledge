---
paths:
  - "src/app/pages/clarity-live-page.tsx"
  - "src/app/components/partners/live-*.tsx"
  - "src/app/components/partners/live-mode-view.tsx"
  - "src/app/components/live-meeting/**/*.tsx"
  - "src/app/contexts/live-session-context.tsx"
  - "src/app/hooks/use-live*.ts"
  - "src/app/lib/live-state-merge.ts"
---

# /live Runtime — Editing Guard

This file is part of the /live two-party state machine. Bugs here are asymmetric
by default: local React state (`isLocallyRating`, refs, hooks) is invisible to
the partner — a fix that "works for me" can still be broken for the receiver.

**Before claiming a fix is complete:**
1. Read `docs/decisions.md` § "/live preload writes — never re-arm local rating flags on the initiator" (entry from 2026-05-15).
2. Read `docs/technical/e2e-testing-guide.md` § "Two-Party /live Session Tests".
3. Write or update a two-party E2E that drives the actual UI (button clicks, not `advanceSessionState` DB merges). Reference template: `e2e/p827-picker-real-flow.spec.ts`.
4. The bug is not considered reproduced until the E2E fails on the pre-fix commit AND passes on the post-fix commit. "Tests pass" without that transition is not evidence.

**Anti-canary trap:** an E2E that uses `advanceSessionState` bypasses `handleSelectStory` → `updateLiveState` → local `set*` setters. For handler bugs, this gives false confidence. See `e2e/p827-round-2-picker-preload.spec.ts` (the canary that passed while the bug shipped) vs `e2e/p827-picker-real-flow.spec.ts` (the UI-driven test that reproduced it).
