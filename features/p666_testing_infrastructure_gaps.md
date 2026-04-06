---
status: in-progress
type: task
rank: 1
delivery_stage: dev
pipeline_ran: [dev]
tags:
  - testing
  - e2e
  - infra
  - quality-gate
created_date: 2026-04-06T00:00:00.000Z
---

# P666: Testing Infrastructure Gaps — Systematic Fix

## Problem

**Situation:** ClarityPledge has three testing levels: Playwright E2E (Level 1), Chrome extension automation (Level 2), and manual two-browser UAT (Level 3). P644 recently fixed Level 1 infrastructure (banned `page.reload()`, added `waitForUIUpdate()`, `createTwoPartySessionRealistic()`).

**Complication:** Analysis of 9 conversation sessions (March–April 2026) revealed patterns of testing failures. Initial hypothesis was that P644's auth injection had a race condition blocking all two-party tests. **Investigation disproved this** — `addInitScript` on BrowserContext is deterministic per Playwright docs, and `p496-auth-context.spec.ts` passes all 5 tests. The actual blockers are: (a) old tests never migrated to P644 infrastructure, (b) Level 2 has no two-party capability, (c) no automated bridge between levels. The result: 12+ sessions wasted on bugs that tests said were fixed but weren't.

**Question:** What's the minimal set of fixes that makes our testing infrastructure trustworthy for two-party `/live` scenarios?

## Gap Inventory (from chat history analysis)

### Gap 1: ~~Auth Injection Race~~ Unmigrated Tests (MISDIAGNOSED → CORRECTABLE)

**Original hypothesis:** `getTestAuthContext()` has a race condition where `addInitScript` fires after page navigation, redirecting to Google OAuth. **Disproved** — `addInitScript` on a BrowserContext (not Page) is deterministic; it runs before any page script on every navigation.

**Actual root cause:** Two distinct issues masquerading as one:
1. `creator-detects-joiner.spec.ts` uses raw `browser.newContext()` without auth injection — predates P66.1 auth gate. Shows `/signup` page (not Google OAuth).
2. `p562-free-mode.spec.ts` auth works correctly, but fails on label mismatch: test expects "Free mode", UI now says "Open mode".

**Fix:** Migrate old tests to use `createTwoPartySession()`/`createTwoPartySessionRealistic()`. Update stale selectors. Optional: harden `assertNoAuthRedirect()` with `waitForLoadState('networkidle')` before URL check.

- **Impact:** Unblocks all two-party E2E tests (P644 infra works, just needs test migration)
- **Confidence:** 90% (p496 auth tests all pass; 10% uncertainty on untested `createTwoPartySessionRealistic` edge cases)
- **Status:** Root cause confirmed, fix is straightforward

### Gap 2: `page.reload()` Masked Broken Realtime Delivery (FIXED, UNBLOCKED)

Every two-party test used `page.reload()` as sync — a stronger mechanism than anything the real app uses. Tests passed, features were broken.

- **Impact:** 5+ sessions on same 4 bugs (P617, P626, P637, P638)
- **Fix:** P644 — `waitForUIUpdate()` replaces `page.reload()`, ban enforced in rules
- **Status:** Fixed — and now unblocked (Gap 1 was misdiagnosed; P644 infra works)

### Gap 3: False Realtime Assumption (FIXED)

Comment in `test-realtime.ts` stated "Realtime events do NOT propagate between Playwright contexts." Wrong — ClarityPledge uses `postgres_changes` (WAL-based), not `presence` (connection-scoped). Cross-context delivery works.

- **Impact:** 5 sessions of unnecessary workarounds
- **Fix:** P644 corrected the comment, verification experiment confirmed
- **Status:** Fixed

### Gap 4: Tests Skip Story-Selection Flow (PARTIALLY FIXED)

All E2E tests clicked Speak directly. No test covered story-selection → drawer path. P643 canary initially passed without the fix (wrong code path).

- **Impact:** 7+ sessions on P643 matryoshka bug chain
- **Fix:** Canary test written for P643
- **Status:** Covered for P643, but pattern may exist elsewhere

### Gap 5: Chrome Extension = Single Identity (OPEN, STRUCTURAL)

Chrome extension has one cookie jar — cannot authenticate as two different users simultaneously. MV3 service worker dies after ~5min idle.

- **Impact:** Two-party features (the core product) cannot be visually verified by the agent
- **Evidence:** `593ee69e.jsonl`, `04cde5b2.jsonl`
- **Status:** Open — requires architecture decision (see Open Questions)

### Gap 6: Mobile Viewport Verification Skipped (OPEN, STRUCTURAL)

Chrome extension's `resize_page` doesn't reliably reflect in screenshots. Mobile (390px) QA routinely skipped.

- **Impact:** Mobile layout bugs go undetected
- **Status:** Open — Chrome extension limitation

### Gap 7: Drift Detection Completeness (FIXED)

New UI-affecting fields could be added without adding them to drift detection. No automated guard.

- **Fix:** P644 added completeness test — surfaced 16 uncovered fields
- **Status:** Fixed

### Gap 8: Broken Import Path → "No Tests Found" (FIXED)

E2E test imported from old path. Playwright silently reported "No tests found." "1601 tests pass" was unit tests only.

- **Status:** Fixed

### Gap 9: Pre-Inserted Users Skip Join Flow (FIXED, gated on Gap 1)

`createTwoPartySession` pre-inserts both users. Real flow: guest joins mid-session.

- **Fix:** P644 added `createTwoPartySessionRealistic()`
- **Status:** Fixed — unblocked (Gap 1 was misdiagnosed)

## Solution — Phased Approach

### Phase 1: Migrate Old Tests to P644 Infrastructure (Gap 1)

**Root cause confirmed:** No auth race condition. Old tests predate the auth gate (P66.1) and were never migrated to use P644 helpers. P644 infrastructure works — `p496-auth-context.spec.ts` passes all 5 tests (verified 2026-04-06). `addInitScript` on BrowserContext is deterministic per Playwright docs.

**Concrete tasks:**
1. ~~`creator-detects-joiner.spec.ts`~~ — file doesn't exist (likely removed or never created). SKIP.
2. [x] `p562-free-mode.spec.ts` — updated "Free mode" → "Open mode" and "Does…understand you" → "Did…understand you" selectors to match current UI labels. Note: test now correctly exposes a Realtime delivery bug (listener doesn't receive sealed-bid initiation) — this was previously masked by `page.reload()`.
3. [x] Audit complete — see **Unmigrated Test Audit** below.
4. [x] Hardened `assertNoAuthRedirect()` with `await page.waitForLoadState('networkidle')` before URL check.
5. [x] Infrastructure proof tests pass: 3/3 (`createTwoPartySession`, `createTwoPartySessionRealistic`, auth determinism). See `e2e/p666-two-party-infra-proof.spec.ts`.

**Scope:** This phase can be run standalone via `/dev p666` — agent should focus on Phase 1 only, then stop at UAT gate. Phases 2-4 are separate work.

### Unmigrated Test Audit (Phase 1, Task 3)

The following files use raw `browser.newContext()` without going through `getTestAuthContext()`/`createTwoPartySession()`. They predate P644 and will fail on auth-gated routes.

**Two-party /live tests (high priority — need auth + session helpers):**
- `speak-freely-button.spec.ts` — 9 test cases, all raw contexts (largest unmigrated file)
- `partner-left-meeting.spec.ts` — 3 test cases, raw contexts
- `p-story-persistence-fixes.spec.ts` — 2 test cases, raw contexts

**Non-/live tests (may not need auth injection — verify case by case):**
- `p398-session-history-summary.spec.ts` — 3 test cases, raw contexts (session history page)
- `p400-story-card-rendering.spec.ts` — 3 test cases, raw contexts
- `p412-reviewer-position-removal-hides-point.spec.ts` — 1 test case, raw contexts
- `p566-upload-reliability.spec.ts` — 7 test cases, raw contexts (upload tests)

**Already using P644 helpers (no migration needed):**
- `p562-free-mode.spec.ts` — uses `createTwoPartySession()` ✓
- `p496-auth-context.spec.ts` — uses `getTestAuthContext()` ✓
- `e2e/helpers/auth-context.ts` — IS the helper (uses `browser.newContext()` internally) ✓
- `e2e/helpers/test-session.ts` — IS the helper ✓

**Special cases:**
- `save-auth.ts` — auth state persistence helper, raw context is intentional
- `verify-prod-agreements.spec.ts` — prod verification, uses own auth flow

### Phase 2: Two-Party Chrome Automation (Gap 5) → P668

Split into its own spec: `features/p668_two_party_chrome_automation.md`. Architecture decision needed before implementation — see P668 for options.

### Phase 3: Harden `/fix` Phase 1 — Mandatory Reproduction Gate

**Decision:** No standalone `/reproduce` skill. Embed a hard gate in `/fix` Phase 1 instead. Reasoning: the 17+ wasted sessions happened because reproduction was assumed, not verified. A gate fixes that. A separate optional skill doesn't — it just gives a nicer way to do the thing that was already being skipped.

**Current `/fix` Phase 1:** "Reproduce the bug" — in practice means "read the steps and write a canary test that you assume captures them."

**Proposed `/fix` Phase 1:**
```
Phase 1 �� Reproduce (GATE: must pass before Phase 2)
  1a. Read spec reproduction steps
  1b. Write a minimal Playwright script that follows the steps LITERALLY
      (no shortcuts, no page.reload(), no auth injection unless bug is about unauth'd flow)
  1c. Run it. Does it FAIL in the way the bug describes?
      - YES → proceed to Phase 2 with this as the canary
      - NO → STOP. Diagnose: are the steps wrong, or is Playwright unable to reach this path?
  1d. If Playwright can't reach the path:
      - Log: "Playwright limitation: [specific reason]"
      - Write the canary to test the closest observable behavior
      - Flag: "This canary is a proxy — manual verification required at UAT"
```

**Also:** Add to `/create-bug`: "Reproduction steps must be specific enough for Playwright to follow literally — no implied context." When a canary can only be a proxy, require `canary: proxy` in spec frontmatter so UAT knows to verify manually.

### Phase 4: Mobile Viewport (Gap 6)

Investigate Chrome extension `resize_page` limitation. May require Chrome DevTools MCP as alternative for mobile screenshots (headless, no cookie-jar issue).

## Risks / Non-Goals

**Risks:**
- Phase 1 test migration may surface additional stale tests beyond the two identified
- Two-party Chrome automation (Phase 2) may hit MV3 service worker timeout in longer flows

**Non-Goals:**
- Fixing specific bugs (P643 layers 3-4) — this spec fixes the infrastructure that makes those fixes verifiable
- Performance testing, accessibility testing, stress testing — separate concerns
- CI integration for Chrome extension tests — Level 2 is local-only by design

## Done-When

- [x] Two-party E2E tests actually run (not just exist) — proved with 3 passing proof tests in `e2e/p666-two-party-infra-proof.spec.ts` (createTwoPartySession, createTwoPartySessionRealistic, auth determinism)
- [ ] At least one two-party scenario verifiable at Level 2 (Chrome automation, two identities) — Phase 2 (P668)
- [ ] `/fix` Phase 1 attempts reproduction before canary writing (not just reads spec steps) — Phase 3
- [ ] Mobile viewport verification has a working path (Chrome extension fix or DevTools alternative) — Phase 4

## Open Questions for Phase 2

1. Can Claude in Chrome open two tabs with different auth sessions via `tabs_create_mcp`? Or does the single cookie jar apply per-browser, not per-tab?
2. Can Chrome DevTools MCP inject auth tokens via `evaluate_script` (similar to Playwright's `addInitScript`)? If so, it could serve as a second "identity" alongside Chrome extension.
3. Is P447's `localhost` vs `127.0.0.1` trick (separate cookie jars) actually reliable across OS/Chrome versions?

## References

- **P644:** Two-party test infrastructure (the foundation this builds on)
- **P447:** Two-party simulation (backlog draft in `features/drafts/`)
- **P643:** The matryoshka bug that exposed most of these gaps
- **Chat history analysis:** 9 conversations, March–April 2026
- **Infrastructure mapper:** Complete inventory of Playwright, /sim, Chrome tools, test accounts
