---
status: qa
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
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p1660-strip-hashtags.test.ts
  root_cause: "stripHashtags builds #tag(?=[\\s.,;:!?)]|$) with no leading boundary and a lookahead that accepts . and : mid-token, so a tag inside a URL fragment or before .js/:3 is removed"
  confidence: high
  surfaces_in_scope: [src/lib/utils.ts stripHashtags]
  surfaces_deferred: []
  reproduced_at: 2026-11-10
spec_review_hash: ba8ebbb6f3a1520e771d34b09b3fc6b50ddbc68250413f3a14c537149381fb21
spec_review_vendors: [gemini, openrouter]
date_resolved: 2026-11-11
root_cause: "stripHashtags matched #tag with no leading boundary and a lookahead that accepted . and : mid-token, and the extractors used /#(\\w+)/ with no link masking, so URL fragments were stripped from links and saved as story tags"
resolution: "One link mask (linkify's URL_RUN, www., markdown targets) for extraction and stripping; a whole-token rule shared by both, as a captured prefix (no regex lookbehind, P983); pinned inline-deletion behaviour unchanged"

---

# P1660: stripHashtags breaks links and cuts tokens it should not touch

## Summary

`stripHashtags()` removes `#tag` wherever it appears, including inside a URL's fragment and from the front of a longer token. Story and point text then renders with broken links and orphan suffixes. It runs on 27 call sites (`grep -rn "stripHashtags(" src`, excluding tests and the definition), so the main card surfaces are affected. Found by the P1638 experiment at `ca9c0bd465dc`, re-verified on main `c6dd21917` on 2026-11-10. Builds on P630 (decisions.md ~33789), which added the system-tag auto-detection and did not touch the matching rule.

## Root Cause

`src/lib/utils.ts:213` builds the pattern `#${tag}(?=[\s.,;:!?)]|$)`, and the extractors use `/#(\w+)/g`:

1. **No leading boundary, and links are not excluded.** `#climate` inside `https://a.com/p#climate` matches, so the fragment is removed before `linkifyText`/`LinkedText` runs and the link points somewhere else. The extractors read the same fragment as a tag, and `create-story-page.tsx:183` (with five other callers) **saves** it as the story's tag.
2. **The lookahead accepts `.` and `:` even when the token continues.** `#node.js` with tag `node` leaves `.js`.

## Reproduction Steps

Vitest on a copy (`import { stripHashtags } from '@/lib/utils'`):

| Input | tags | Output today |
|---|---|---|
| `See https://a.com/p#climate now` | `[climate]` | `See https://a.com/p now` |
| `[x](https://a.com/p#climate)` | `[climate]` | `[x](https://a.com/p)` |
| `on #node.js here` | `[node]` | `on .js here` |

In the app, post a story containing `https://example.com/page#climate #climate`, then open it in the feed. The link drops `#climate`.

**Reproduction rate:** 100%.

## Expected Behavior

- A `#` that is part of a URL or a markdown link target is never touched.
- A tag immediately followed by `.` or `:` and then a word character is not a tag match, so `#node.js` stays.

**Not changed by this fix, pinned by `src/tests/stripHashtags.test.ts`:** a tag inside a sentence is still removed with its word ("About #leadership and #trust" becomes "About and"). That is the tested design, not a defect. Whether to keep the word instead ("About leadership and trust") is a product call: [FOUNDER DECISION: keep inline tag words?]. It is raised in the P1638 triage report and not decided here.

## Actual Behavior

See the table above.

## Affected Files

- `src/lib/utils.ts` (`extractHashtags`, `extractAllHashtags`, `stripHashtags`)
- Callers are unchanged: 27 `stripHashtags` sites and 7 `extractHashtags` sites, same signatures and return types

## Severity

**Medium.** It corrupts user-authored text and links on the main card surfaces, and it only triggers on content with inline tags or fragment URLs.

## Fix Approach

Folded from the spec review (Gemini and GLM, 2026-11-11). Each point was checked against the code.

1. **One link mask for extraction and stripping alike** (`maskLinks`). `https?://…` (linkify's own `URL_RUN`, so exactly what the app renders as a link), `www.…` and markdown link targets `](…)` are replaced by private-use-character placeholders (no `#`, no word characters) before any tag is read. They are restored right after the tag pass and **before** the whitespace tidy.
2. **A tag is a whole token, for extraction and stripping alike** (a captured prefix, never a regex lookbehind: Safari before 16.4 throws on lookbehind, P983). It starts after no letter, combining mark, digit, `_`, `#` or `/` in any script (Unicode-aware: `issue#12`, `café#x` and a scheme-less `example.com/#x` are not tags), and extraction stops at a continuing `.x`/`:x` exactly as stripping does, so `#node.js` is never saved as `node`. A `:` continuation still extracts the prefix (`#canvas:problem` saves `canvas`), as P1508's test pins, while stripping leaves that token whole. Markdown targets may carry a title (`[x](#a "Title")`).
3. **Trailing boundary** `(?=\s|[,;!?)]|[.:](?!\w)|$)`: `.` and `:` end a tag only when the token ends there.
4. Unchanged: P630 system-tag detection, inline deletion (pinned), and the newline-preserving tidy.

## Known Limitations

- `?`, `!`, `;` and `)` still end a tag mid-token (`#node?js`), a shape not seen in stories.
- A tag inside markdown link **text** (`[#climate](https://example.com/x)`) is extracted (saved) but not stripped from the label, like the other end-rule cases below.
- A tag glued to the end of a link with no space (`[x](https://a.com/p)#climate`) is masked with the link: neither saved nor stripped.
- `#ai#tech` (no space) is left as typed and saves no tag, where it previously saved both.
- Tags already saved from a URL fragment before this fix stay on their stories until the story is edited; the fix changes what is extracted from now on. [FOUNDER DECISION: clean existing stored tags on prod?]
- Text that already contains the private-use placeholder characters (U+E000/U+E001) is not link-masked.
- Unchanged from before: a tag wrapped in `**bold**`, quotes or brackets, glued to an em dash (`priority—#trust—matters`), or followed by `-` or `'` (`#ai-powered`, `#trust's`), is extracted but not stripped; a non-ASCII tag body (`#été`) is cut at the first non-ASCII letter.
- Slash-joined tags (`#climate/#energy`) are left exactly as typed, neither saved nor stripped: `/` next to `#` is read as part of a link path, because a broken link costs more than a missed tag.
- A scheme-less link with a query (`example.com/search?q=#climate`) is not masked; the app does not render it as a link either.
- A `)` inside a markdown link title (`[x](https://example.com/x "Climate (2026) #climate")`) ends the mask early, and a tag written inside a markdown target's parentheses is masked.

## Acceptance Criteria

- [x] `See https://a.com/p#climate now` with tag `climate` keeps `https://a.com/p#climate`, and so do `[x](https://a.com/p#climate)` and `www.a.com/p#climate`
- [x] `on #node.js here` with tag `node` and `see issue#climate there` are unchanged
- [x] A tag at sentence end before a period or colon is still stripped, as today
- [x] `extractHashtags` returns no tag for a URL fragment (`https://`, `www.` or markdown target) or for `issue#12`, and still returns a real tag beside a link
- [x] Every existing assertion in `src/tests/stripHashtags.test.ts`, `src/tests/extractHashtags.test.ts`, `src/tests/p1212-quote-label-parity.test.tsx` and `src/tests/p1212-expander-parity.test.tsx` passes unchanged
- [x] Regression tests in `src/tests/p1660-strip-hashtags.test.ts` cover each new case and fail on the pre-fix code
