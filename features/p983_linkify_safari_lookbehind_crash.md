---
status: in-progress
type: bug
rank: 1000942
severity: high
workstream: reliability
date_reported: '2026-07-08'
created_date: '2026-07-08'
tags: [safari, linkify, crash, sentry, regex]
delivery_stage: reproduce
pipeline_ran: [create-bug, fix, reproduce]
reproduce_artifact:
  test_file: src/tests/p983-reproduce.test.ts
  root_cause: "src/app/utils/linkify.ts:70 builds URL_PATTERN with a negative lookbehind (?<!\\w). Safari/iOS added lookbehind support only in 16.4 — new RegExp(...) throws SyntaxError at construction on older Safari, before any matching. Confirmed by direct source read, not inference."
  confidence: high
  surfaces_in_scope: [linkify.ts URL_PATTERN — single shared regex, all ~10 consuming components fixed at the source]
  surfaces_deferred: []
  reproduced_at: '2026-07-08'
---

# P983: Old-Safari crash in linkifyText — negative lookbehind throws SyntaxError

## Summary

On Safari/iOS < 16.4, `linkifyText` throws `SyntaxError: Invalid regular expression: invalid group specifier name` at regex construction time, tripping the React ErrorBoundary on any component that renders linkified text (letter cards, story cards, feed, profiles). Sentry: `JAVASCRIPT-REACT-27`, 3 events, Mobile Safari 16.2 / iOS 16.2.

## Root Cause

`src/app/utils/linkify.ts:70` builds `URL_PATTERN` using a negative lookbehind: `(?<!\w)[\w-]+\.(?:com|org|...)`. JS regex lookbehind support landed in Safari 16.4 — any Safari/iOS version below that throws a `SyntaxError` the instant `new RegExp(...)` runs, before any matching happens. Because `linkifyUrls` builds this pattern inline on every call and is used by ~10 components (via `linkifyText`, introduced/unified in P540), any of those components rendering text on an affected browser crashes their subtree.

Prior related work: P540 (`features/done/22_mar_26/p540_hyperlink_consistency.md`) unified the hyperlink systems across text surfaces — this bug is a browser-compat regression in that unified regex, not present in P540's own coverage (P540 didn't test pre-16.4 Safari).

## Reproduction Steps

1. Load the app in Safari 16.2 (or any Safari/iOS < 16.4) — or force the crash by evaluating `new RegExp('(?<!\\w)x', 'gi')` in a JS engine without lookbehind support.
2. Navigate to any `/letter/:id` page (or any surface rendering user text via `linkifyText` — story cards, feed, profile bio).
3. Component calls `linkifyUrls`, which constructs `URL_PATTERN` inline — construction throws `SyntaxError`.
4. React ErrorBoundary catches the throw; the text-rendering subtree crashes.

**Reproduction rate:** 100% on Safari < 16.4; not reproducible in Node/jsdom test env (which supports lookbehind) or evergreen browsers — must assert on the regex source string or emulate the browser engine, not construct-and-catch.

## Expected Behavior

Text renders normally on all supported browsers, including Safari < 16.4. Bare domains glued to a preceding word character (e.g. `foo.com` in `xfoo.com`) stay unlinked; full `http(s)://` URLs and standalone bare domains still auto-link.

## Actual Behavior

`new RegExp(...)` throws at construction on Safari < 16.4, crashing the React subtree via ErrorBoundary. No partial rendering — the whole text block disappears behind the ErrorBoundary fallback.

## Affected Files

- `src/app/utils/linkify.ts:70` — `URL_PATTERN` regex literal uses `(?<!\w)` lookbehind
- `src/app/utils/linkify.ts:79-96` — match loop; already has adjacent-character inspection logic (`text[start - 1] === ':'`) that the fix will extend
- `src/tests/linkify.test.ts`, `src/tests/p540-linkify-markdown.test.ts` — existing coverage that must keep passing

## Severity

**High** — crashes the letter-reading page (and ~10 other text-rendering surfaces) for all Safari/iOS < 16.4 users who hit any bare-domain-adjacent text; low current event count (3) likely reflects low affected-browser traffic, not low blast radius per affected user.

## Fix Approach

Rewrite `URL_PATTERN` to be lookbehind-free while preserving intent:
- Drop `(?<!\w)` from the regex.
- In the match loop, when the match is a bare domain (doesn't start with `http`) AND `start > 0 && /\w/.test(text[start - 1])`, treat it as plain text (push the raw slice, advance `lastIndex`) instead of emitting an `<a>` — mirrors the existing dangerous-scheme skip branch at line 90.
- Add a regression test asserting the regex source string contains no `(?<` (durable guard against lookbehind reintroduction — Node/jsdom supports lookbehind, so a construct-and-catch test won't reproduce the Safari failure).
- Add a behavioral test: bare domain preceded by a word char (`xfoo.com`) stays unlinked; standalone bare domain and full URLs still link.

## Acceptance Criteria

- [ ] `npm test -- linkify` passes (existing tests + new regression test)
- [ ] Source-level guard test confirms `URL_PATTERN` source contains no `(?<`
- [ ] New test: bare domain glued to preceding word char (e.g. `xfoo.com`) renders as plain text, not a link
- [ ] Existing behavior unchanged: standalone bare domains and full `http(s)://` URLs still auto-link
- [ ] `npm run build` clean
- [ ] Manual/Chrome-MCP check on `/letter/:id` with emulated old-Safari UA: no ErrorBoundary trip
- [ ] No console errors during the affected flow
