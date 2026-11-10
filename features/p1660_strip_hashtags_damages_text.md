---
status: week
type: bug
rank: 330
severity: medium
date_reported: 2026-11-10
created_date: 2026-11-10
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [hashtags, story-display, links, p1638]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1660: stripHashtags breaks links and deletes words from stories and points

## Summary

`stripHashtags()` removes `#tag` wherever it appears, including inside a URL's fragment and mid-sentence. Story and point text then renders with broken links, missing words and orphan suffixes. It runs on 28 call sites (`grep -rn "stripHashtags(" src` excluding tests), so the main card surfaces are affected. Found by the P1638 experiment at `ca9c0bd465dc`, re-verified on main `c6dd21917` on 2026-11-10. Builds on P630 (decisions.md ~33789), which added the system-tag auto-detection and did not touch the matching rule.

## Root Cause

`src/lib/utils.ts:213` builds the pattern `#${tag}(?=[\s.,;:!?)]|$)`:

1. **No leading boundary.** `#climate` inside `https://a.com/p#climate` matches, so the fragment is removed before `linkifyText`/`LinkedText` runs and the link points somewhere else.
2. **The lookahead accepts `.` and `:` even when the token continues.** `#node.js` with tag `node` leaves `.js`.
3. **Every occurrence is removed, not only the trailing tag list.** A tag used as a word in a sentence is deleted: "We need #climate action now" becomes "We need action now", and "Talk #ai, #tech, more" becomes "Talk , , more".

## Reproduction Steps

Vitest on a copy (`import { stripHashtags } from '@/lib/utils'`):

| Input | tags | Output today |
|---|---|---|
| `See https://a.com/p#climate now` | `[climate]` | `See https://a.com/p now` |
| `[x](https://a.com/p#climate)` | `[climate]` | `[x](https://a.com/p)` |
| `We need #climate action now` | `[climate]` | `We need action now` |
| `Talk #ai, #tech, more` | `[ai, tech]` | `Talk , , more` |
| `on #node.js here` | `[node]` | `on .js here` |

In the app, post a story containing `https://example.com/page#climate #climate`, then open it in the feed. The link drops `#climate`.

**Reproduction rate:** 100%.

## Expected Behavior

- A `#` that is part of a URL or markdown link target is never touched.
- A tag immediately followed by `.`/`:` and a word character is not a tag match (`#node.js` stays).
- **Agent decision, reversible (flagged for founder review):** a tag inside a sentence keeps its word and loses only the `#` ("We need climate action now"). Tags in a trailing run, meaning at the end of the text or alone on a line, are still removed, because the tag pills show them. The founder can overrule this at QA. Today's behavior deletes the word, which changes what the author wrote, and that is the defect regardless of styling.

## Actual Behavior

See the table above.

## Affected Files

- `src/lib/utils.ts:201-229` (`stripHashtags`)
- `src/tests/` (existing stripHashtags tests: `grep -rln stripHashtags src/tests`)
- Callers are unchanged (28 sites). Same signature and return type.

## Severity

**Medium.** It corrupts user-authored text and links on the main card surfaces, and it only triggers on content with inline tags or fragment URLs.

## Fix Approach

1. Leading boundary: match only at the start of the text or after whitespace or `(`. Use `(?<=^|[\s(])`, and skip any match inside a URL token (protect `https?://\S+` and `](...)` spans by masking them before the replace and restoring them after).
2. Trailing boundary: `(?=\s|[,;!?)]|[.:](?!\w)|$)`.
3. Two passes: (a) remove tags in a trailing run, at the end of the text or alone on a line; (b) for remaining in-sentence matches, replace `#tag` with `tag`.
4. Keep the P630 system-tag behavior: system tags (`isSystemTag`) are always removed, never kept as words.
5. Keep the newline-preserving tidy at `:223-228`.

## Acceptance Criteria

- [ ] A story with `https://a.com/p#climate` and tag `climate` renders the link with `#climate` intact
- [ ] `[x](https://a.com/p#climate)` keeps its fragment
- [ ] "We need #climate action now" renders "We need climate action now"
- [ ] "Talk #ai, #tech, more" renders "Talk ai, tech, more"
- [ ] "on #node.js here" with tag `node` is unchanged
- [ ] A trailing tag list ("text\n\n#climate #ai") is still removed, and system tags (`#st8`) are always removed
- [ ] Paragraph breaks still survive (existing newline tests pass)
- [ ] Regression tests in `src/tests/p1660-strip-hashtags.test.ts` cover every row and fail on the current code
