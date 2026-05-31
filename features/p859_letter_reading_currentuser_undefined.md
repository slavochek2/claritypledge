---
status: in-progress
type: bug
rank: 1000765
severity: critical
workstream: letters
date_reported: '2026-05-31'
created_date: '2026-05-31'
tags: [letters, reading, runtime-error, regression]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: src/tests/p859-reproduce.test.tsx
  root_cause: "LetterReadingFlow (letter-reading-page.tsx:978) destructures `const { user } = useAuth()` at line 1041 but readerProfileOwner (lines 1102-1108) references undeclared `currentUser` — ReferenceError on render. Sibling LetterReadingFlowPublic was fixed in P852 commit 182713b7; this instance was left."
  confidence: high
  surfaces_in_scope: [letter-reading-flow]
  surfaces_deferred: []
  reproduced_at: '2026-05-31'
  evidence: "Failing canary mounts LetterReadingFlow via the emailed-recipient path → boundary captures `ReferenceError: currentUser is not defined`. Also confirmed statically: `tsc -p tsconfig.app.json` reports 6× TS2304 'Cannot find name currentUser' at lines 1102-1108, and `vite build` emits a bare free `currentUser` in the chunk."
  note: "Canary commits with the fix on the feature branch — pre-commit runs `npm test`, so a failing canary cannot land on main (would block the commit / redden main)."
---

# P859: Emailed 1-to-1 letter reading crashes — `ReferenceError: currentUser is not defined`

## Summary

A recipient who opens a 1-to-1 letter link received by email (`/letter/{id}?token=…`) while logged out hits a runtime crash: `ReferenceError: currentUser is not defined`. The `LetterReadingFlow` component references an identifier that is never declared in its scope.

## Root Cause

In `src/app/pages/letter-reading-page.tsx`, the `LetterReadingFlow` component (function declared at line 978) destructures `const { user } = useAuth();` at line 1041 — only `user` is in scope. But the `readerProfileOwner` block at lines 1102-1108 references `currentUser` six times (`currentUser`, `currentUser.id`, `currentUser.name`, `currentUser.avatarUrl`, `currentUser.avatarColor`, `currentUser.hasPledged`). `currentUser` is undeclared in this function, so evaluating it throws `ReferenceError` during render.

This is a P852 regression. P852 added `readerProfileOwner` to **both** `LetterReadingFlow` and its sibling `LetterReadingFlowPublic`. The follow-up commit `182713b7` ("fix(p852): cover avatar + public-flow runtime error") fixed the scope in `LetterReadingFlowPublic` (added `const { user: currentUser } = useAuth()` at line 1257, correct) but left `LetterReadingFlow` referencing the undeclared `currentUser`. The same bug class appeared in two siblings; one instance was fixed and one shipped.

**Evidence the bug is live (not a stale deploy):** a fresh `npm run build` of current source (commit `fa1fa4ab`, which already contains the `182713b7` fix) still emits a bare free `currentUser` in `dist/assets/letter-reading-page-*.js` — the minifier left it as a global lookup because it is undeclared (`…sender_has_pledged??!1},te=currentUser?{id:currentUser.id,name:currentUser.name??"You"…`). This is the identical pattern to the deployed prod chunk `letter-reading-page-D4-NKAgf.js` observed in the prod console.

## Reproduction Steps

1. As a logged-out user (incognito), open a 1-to-1 letter delivery link with a token: `/letter/{deliveryId}?token={token}`.
2. The cover loads; `pageState` resolves to `ready` (token path), which renders `<LetterReadingFlow>` (instantiated at line 875).
3. When `LetterReadingFlow` renders, the `readerProfileOwner` computation at line 1102 evaluates the undeclared `currentUser`.
4. Observe: `ReferenceError: currentUser is not defined` in the console; the reading flow fails to render for the recipient.

**Reproduction rate:** 100% (every render of `LetterReadingFlow`).

## Expected Behavior

The recipient opens the emailed letter and reads it without any runtime error. For an unauthenticated reader, `readerProfileOwner` is `undefined` (falls back to initials, no pledge ring) — exactly as `LetterReadingFlowPublic` already does.

## Actual Behavior

`ReferenceError: currentUser is not defined` thrown during `LetterReadingFlow` render. Observed in prod console (May 31): `ReferenceError: currentUser is not defined at wt (letter-reading-page-D4-NKAgf.js:1:23371)`.

## Affected Files

- `src/app/pages/letter-reading-page.tsx` — lines 1102-1108 (`LetterReadingFlow.readerProfileOwner` references undeclared `currentUser`; `user` is the declared identifier at line 1041)

## Severity

**Critical** — blocks the core emailed-letter recipient flow in production. A recipient who receives a 1-to-1 letter by email cannot read it.

## Fix Approach

Replace `currentUser` → `user` in lines 1102-1108 of `LetterReadingFlow`. `user` is the same `useAuth().user` (Profile) object, already declared at line 1041 and used elsewhere in the component. This mirrors how `LetterReadingFlowPublic` resolves the same data (it just named its local `currentUser`). Minimal diff, no logic change.

## Acceptance Criteria

- [ ] A logged-out recipient opening `/letter/{id}?token=…` reads the letter with no `ReferenceError` in the console.
- [ ] `LetterReadingFlow` renders for an unauthenticated reader (`readerProfileOwner` resolves to `undefined`, reader avatar falls back to initials with no pledge ring).
- [ ] An authenticated reader still sees their own avatar/pledge ring on reveal screens (no regression to `readerProfileOwner`).
- [ ] Regression test passes — renders `LetterReadingFlow` as a logged-out token reader and asserts no `ReferenceError` is thrown (covers the undeclared-identifier class for the reading-flow components).
- [ ] No console errors during the emailed-letter reading flow.
