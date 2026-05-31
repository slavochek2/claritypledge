---
status: qa
type: bug
rank: 1000765
severity: critical
workstream: letters
date_reported: '2026-05-31'
created_date: '2026-05-31'
tags: [letters, reading, runtime-error, regression]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
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

- [x] `LetterReadingFlow` renders the reading flow without `ReferenceError: currentUser is not defined` — verified by canary `src/tests/p859-reproduce.test.tsx` (mounts the component via the emailed-recipient path, asserts `LetterFlowContent` renders and the error boundary does not trip) + `tsc -p tsconfig.app.json` reports zero `TS2304` for `currentUser` + full unit suite green (2174 passed).
- [x] Regression test passes — `src/tests/p859-reproduce.test.tsx` fails before the fix (boundary catches the ReferenceError) and passes after. Covers the undeclared-identifier render-crash class.
- [x] For an unauthenticated reader, `readerProfileOwner` resolves to `undefined` — the bug is auth-independent (the binding is missing regardless of value); the `user ? {…} : undefined` branch is the trivial path. (Note: canary drives the authenticated path because the logged-out UI routes through account creation before the reading flow; the recipient is authenticated by the time `LetterReadingFlow` mounts.)
- [ ] [post-deploy] A recipient opening `/letter/{id}?token=…` reads the letter with no `ReferenceError` / console errors during the emailed-letter reading flow — confirm live via `/verify` post-merge or on prod after deploy.
- [ ] [post-deploy] An authenticated reader sees their own avatar/pledge ring on reveal screens (visual) — confirm live via `/verify`.

## Fix Notes (resolution)

- **Root cause:** P852 added `readerProfileOwner` to both `LetterReadingFlow` and `LetterReadingFlowPublic`; commit `182713b7` fixed the scope in the public flow but left `LetterReadingFlow` referencing the undeclared `currentUser` (only `user` is in scope at line 1041).
- **Fix:** `currentUser` → `user` in `LetterReadingFlow.readerProfileOwner`; plus `avatarUrl: …avatarUrl ?? null` → `?? undefined` in **both** blocks (`PointProfileOwner.avatarUrl` is `string | undefined`; `?? null` was a pre-existing `TS2322` in the public block, newly surfaced in `LetterReadingFlow` once the `TS2304` cleared).
- **Meta (separate, not fixed here):** `pre-commit-checks.sh:74` runs bare `npx tsc --noEmit`, which against the root `tsconfig.json` (`files: []`, project references) checks nothing — a no-op type gate. The real app typecheck (`tsc -p tsconfig.app.json`) reports ~1117 errors. That is how this undeclared identifier shipped. Worth a separate ticket to make pre-commit run `tsc -b` / `-p tsconfig.app.json`.
