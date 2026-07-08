---
status: all-done
type: bug
rank: 1000942
severity: high
workstream: reliability
date_reported: '2026-07-08'
created_date: '2026-07-08'
tags: [safari, linkify, crash, sentry, regex]
pipeline_ran: [create-bug, fix, reproduce, fix.2]
reproduce_artifact:
  test_file: src/tests/p983-reproduce.test.ts
  root_cause: "src/app/utils/linkify.ts:70 builds URL_PATTERN with a negative lookbehind (?<!\\w). Safari/iOS added lookbehind support only in 16.4 — new RegExp(...) throws SyntaxError at construction on older Safari, before any matching. Confirmed by direct source read, not inference."
  confidence: high
  surfaces_in_scope: [linkify.ts URL_PATTERN — single shared regex, all ~10 consuming components fixed at the source]
  surfaces_deferred: []
  reproduced_at: '2026-07-08'
date_resolved: '2026-07-08'
root_cause: "linkify.ts:70 URL_PATTERN used a negative lookbehind (?<!\\w), unsupported before Safari 16.4 — new RegExp() threw SyntaxError at construction on older Safari/iOS."
resolution: "Dropped the lookbehind from URL_PATTERN; replicated its word-char-adjacency check in the match loop as an explicit branch (mirrors the existing dangerous-scheme skip branch). Fixed a related off-by-one in the new branch's push guard (start+url.length vs lastIndex) discovered during testing. Deferred an identical pre-existing off-by-one in the dangerous-scheme branch to P984."
completed_at: 2026-07-08
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

Text renders normally on all supported browsers, including Safari < 16.4. A second bare-domain match glued directly onto a prior match's tail with no gap (e.g. `bar.com` in `example.combar.com`) stays unlinked as plain text; full `http(s)://` URLs and standalone bare domains still auto-link. (Correction during fix: a domain like `xfoo.com` in isolation is NOT this case — the greedy `[\w-]+` character class always absorbs a leading word-char prefix into a single match starting at that prefix, so `xfoo.com` correctly links as one domain both before and after this fix. The lookbehind was only ever load-bearing for the two-matches-glued-together case.)

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

- [x] `npm test -- linkify` passes (existing tests + new regression test) — 60/60 across linkify.test.ts, p540-linkify-markdown.test.ts, p983-reproduce.test.ts
- [x] Source-level guard test confirms `URL_PATTERN` source contains no `(?<`
- [x] New test: second bare domain glued directly onto a prior match's tail (e.g. `bar.com` in `example.combar.com`) renders as plain text, not a link — corrected from the original AC wording (`xfoo.com` in isolation was the wrong scenario; see Expected Behavior correction above)
- [x] Existing behavior unchanged: standalone bare domains and full `http(s)://` URLs still auto-link
- [x] `npm run build` clean
- [ ] [post-deploy] Manual check on a real Safari < 16.4 device/BrowserStack on `/letter/:id`: no ErrorBoundary trip. **Not achievable in this environment pre-ship**: Chrome DevTools MCP only spoofs the UA string; V8 always supports regex lookbehind, so no Chrome-based tool can reproduce or falsify the Safari-specific `SyntaxError` either way. Substitute verification performed instead: (a) source-level guard test proves the lookbehind is gone, (b) app loads with linkify-consuming components rendered and zero console errors in Chrome, (c) full unit suite green (2653/2672, pre-existing skips only). True confirmation requires real old-Safari hardware or BrowserStack.
- [x] No console errors during the affected flow — confirmed via Chrome DevTools MCP on the public homepage (renders `feed-story-card`/`feed-point-card`, both linkify consumers)
