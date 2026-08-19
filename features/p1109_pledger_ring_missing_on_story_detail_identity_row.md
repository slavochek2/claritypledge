---
status: qa
type: bug
rank: 41
severity: medium
date_reported: '2026-08-19'
date_resolved: '2026-08-19'
created_date: '2026-08-19'
tags: [avatar, pledge-ring, story-detail, props-drilling]
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: src/tests/p1109-reproduce.test.tsx
  root_cause: "QuotedPoint sub-component's props interface (StoryCardDetail.tsx ~493) never declared authorHasPledged or authorAvatarColor; call site (~421) passes only authorAvatarUrl; render (~566) hardcodes isPledger={false} with no avatarColor — dropping data present on story.authorHasPledged / story.authorAvatarColor since the component boundary."
  confidence: high
  surfaces_in_scope: [story-detail-identity-row]
  surfaces_deferred: []
  reproduced_at: '2026-08-19'
  surfaces_deferred_correction: "Found false during /fix code review — 3 more GravatarAvatar sites in StoryCardDetail.tsx had the same bug class (missing avatarColor) and were not caught by /reproduce's surface audit. All 3 fixed in this diff (see Resolution). 1 sibling at different files (ClaritySessions.tsx, profile-page-v2.tsx) deferred to P1112."
---

# P1109: Pledger ring and avatar colour never render on the story-detail identity row

## Summary

On the story detail page, the identity row above a linked point renders the author's avatar with the pledge ring forced off and the avatar colour dropped, so a pledger appears as a non-pledger with a default-coloured avatar.

## Root Cause

**Not a stray hardcode — a props interface that never declared the fields.**

`StoryCardDetail.tsx` renders the author avatar correctly in three places (`:195-197`, `:273`, `:739-741`), each reading `isPledger={story.authorHasPledged ?? false}` from the story object, whose type explicitly includes `authorHasPledged` (`:39`).

The identity row lives in a **sub-component** further down the same file. Its props interface (`:493`) declares `authorAvatarUrl?` but **neither `authorHasPledged` nor `authorAvatarColor`**. The call site at `:421` therefore passes only `authorAvatarUrl={story.authorAvatarUrl}`, and the render at `:565-567` has nothing to read — so it passes `isPledger={false}` literally and omits `avatarColor` entirely.

The data is present on the story object the whole time. It is dropped at the component boundary.

Its structural twin does it correctly: `story-card-with-links.tsx:577-581` carries the same verbatim comment (*"Identity-and-position row: reserved for the other person. Hidden when viewer === story author."*) and reads `isPledger={authorHasPledged ?? false}` with `avatarColor` passed.

**This is a recurring class in this repo.** `docs/decisions.md:11076` records P745: a `mapRecord` helper hardcoded `inviterIsPledger: false` and `inviterAvatarColor: null`, "silently discarding the data returned by `getOpenLiveInviteForUser`" — the fetch worked, the helper zeroed its output, and it was caught only by post-merge review. `docs/decisions.md:13255` records P697, the fetch-layer version: `avatar_url`, `avatar_color` and `has_pledged` omitted from a select, "invisible to TypeScript (the fields are optional) and invisible in unit tests." Same failure shape, three layers.

Found during adversarial review of P1107 (rejected, `features/archive/2026-08/`).

**Confirmed via `/reproduce` (2026-08-19):** all cited line numbers verified current. `StoryWithAuthor` carries both `authorHasPledged?: boolean` and `authorAvatarColor?: string` (`src/app/types/index.ts:1042,1046`); the sub-component's destructured props and TS interface (`StoryCardDetail.tsx:475-518`) have neither. Canary test `src/tests/p1109-reproduce.test.tsx` renders `StoryCardDetail` with a pledged author and a distinct `authorAvatarColor`, and fails on `expect(identityRowAvatar).toHaveAttribute('data-pledger', 'true')` — `data-pledger` is `null`, proving the ring is absent exactly as described.

## Reproduction Steps

1. Sign in as any user — call them the **viewer**.
2. Ensure a second user — the **author** — has `has_pledged: true` and a non-default `avatar_color`, and has written a story that is linked to a point.
3. Navigate to `/story/{that story id}` as the viewer (the viewer must NOT be the author — the row is hidden when viewer === author).
4. Look at the identity row above the linked point.
5. Observe: no blue ring around the author's avatar; initials render on the default colour rather than the author's own.
6. For contrast, view the same author's story card in the feed — the ring and colour render correctly there.

**Reproduction rate:** 100% — the value is a literal, not a condition.

## Expected Behavior

The identity row shows the author's pledge ring when they have signed, and their own avatar colour, matching every other surface that renders that author.

## Actual Behavior

No ring, ever, for any author. Avatar colour falls back to the component default. A pledger is visually indistinguishable from a non-pledger on this one row.

## Affected Files

- `src/app/components/social/StoryCardDetail.tsx:493` — sub-component props interface, missing `authorHasPledged` and `authorAvatarColor`
- `src/app/components/social/StoryCardDetail.tsx:421` — call site, passes `authorAvatarUrl` only
- `src/app/components/social/StoryCardDetail.tsx:565-567` — the render, `isPledger={false}` literal, no `avatarColor`
- `src/app/components/social/story-card-with-links.tsx:577-581` — the correct twin, for reference

## Severity

**Medium** — the pledge ring is a trust signal, not decoration (`point-detail-page.tsx:780` records the P852 decision to restore it at compact size, "semantic correctness over clip aesthetics"). It is silently absent for every pledger on this row, with no workaround and no error. Not high: nothing is blocked, and no false claim is made — a signal is missing rather than wrong.

## Fix Approach

Add `authorHasPledged?: boolean` and `authorAvatarColor?: string` to the sub-component's props interface, pass both from the call site alongside the existing `authorAvatarUrl`, and read them at the render: `isPledger={authorHasPledged ?? false}` and `avatarColor={authorAvatarColor}`. Match the twin at `story-card-with-links.tsx:577-581` rather than inventing a shape.

**Do not** widen this into the other five `isPledger={false}` sites found by grep — `agreement-certificate.tsx:86`, `session-list.tsx:115`, `badge-certificate.tsx:191` and `:255`, `live-mode-view.tsx:645`. Each was checked: they render either a certificate (deliberate) or a name string with no profile row behind it, so `false` is correct there. **Only** the StoryCardDetail site has the data available and drops it.

**Test the failure first.** Per `.claude/rules/epistemic.md` gate 7, a test that passes after the fix proves nothing on its own — assert the ring is absent before, present after.

## Resolution

**Fixed:** 2026-08-19

Applied the fix approach as specified: added `authorHasPledged?: boolean` and `authorAvatarColor?: string` to `QuotedPoint`'s props interface, passed both from the call site, and read them at the render (`isPledger={authorHasPledged ?? false}`, `avatarColor={authorAvatarColor}`).

**Scope widened during code review (`/finish` pass):** the review found 3 more `GravatarAvatar` sites in the *same file* with the identical bug class — `isPledger` wired correctly, `avatarColor` never passed, silently falling back to the component default (`#0044CC`):
- `StoryCardDetail.tsx:193` (quote-pattern header row) — one-line addition, `story: StoryWithAuthor` already carries `authorAvatarColor`.
- `StoryCardDetail.tsx:273` (main story-header avatar) — same.
- `StoryCardDetail.tsx:741` (`LinkedStoryCard`, shown when a point's linked-stories list is expanded) — required widening the local `LinkedStory` Pick type (line 37-39) to include `authorAvatarColor`. Verified against the fixture, not just the type: `stories-service-real.ts:103` already fetches `avatar_color` and maps it to `authorAvatarColor` on every `getStoriesForPoints` row, so the data was present at runtime and only dropped at this type boundary. **Second `/finish` pass found this call site is currently unreachable within `StoryCardDetail.tsx`** — `hideLinkedStories` is hardcoded `true` (JSX boolean shorthand) at the file's only `<QuotedPoint>` call site (line 437), and `QuotedPoint`/`LinkedStoryCard` are both file-private (not exported), so no prop combination renders `LinkedStoryCard` in production today. The fix is still correct (matches the type contract, ready for if that hardcode is ever lifted) but has no render path to test against — documented in the canary rather than silently left uncovered.

User confirmed fixing all 3 in the same commit rather than deferring.

**Also fixed during QA (two `/finish code` passes):** hardened the canary's avatar selector from `.find()` (picks first match) to `.filter()` + length assertion, since two other sites share the identical `!w-5` class (the quote-pattern header row, and the unreachable `LinkedStoryCard`) and could co-render. Added a second canary case for the non-pledged branch (ring must stay absent) per the UI Conditional Branch Coverage rule. Second `/finish code` pass found only 1 of 4 fixed sites had regression coverage — added assertions for the main story-header avatar (reachable in the default fixture) and a new test rendering `context="point-detail"` + `authorPosition` for the quote-pattern header row. The 4th site (`LinkedStoryCard`) is documented as untestable-because-unreachable above, not silently skipped.

**Filed separately (not fixed here — different files, pre-existing, out of scope):** P1112 tracks the same bug class at `ClaritySessions.tsx:104` and `profile-page-v2.tsx:1745`.

**Files changed:**
- `src/app/components/social/StoryCardDetail.tsx` — 4 `GravatarAvatar` call sites now pass `avatarColor`; `QuotedPoint` props interface widened; `LinkedStory` type widened
- `src/tests/p1109-reproduce.test.tsx` — canary hardened; covers 3 of 4 fixed sites (identity row, header avatar, quote-pattern row) plus the non-pledged branch; 4th site is unreachable dead code, documented not tested

**Regression test:** `src/tests/p1109-reproduce.test.tsx` (3 tests)

## Acceptance Criteria

- [x] Viewing another person's story detail, a pledged author's avatar shows the blue ring on the identity row above the linked point — verified via `src/tests/p1109-reproduce.test.tsx` (`data-pledger="true"`) and a live Playwright screenshot (test fixture with `avatar_color: '#E24A90'`, ring renders via the fixed `ring-blue-500` Tailwind class, decoupled from fill colour)
- [x] The same author's avatar shows their own colour, not the default, on that row — verified via canary (`backgroundColor` matches the fixture colour) and the same screenshot
- [x] A non-pledged author still shows no ring on that row — the fix is not "always show the ring" — added a second canary case (`shows no pledge ring... for a non-pledged author`) asserting `data-pledger` is absent
- [x] The row remains hidden when the viewer is the author (the existing P793 guard is unchanged) — `currentUserId !== storyAuthorId` condition untouched by this diff; full suite (2839 tests) still green
- [x] The feed card and story detail now agree for the same author — screenshots of both, pasted — live Playwright screenshots of `/point/{id}` (Perspectives list) and `/story/{id}` (story-header avatar + identity row) show consistent ring + colour for the same test author
- [x] Regression test asserts ring-absent before the fix and ring-present after — confirmed failing pre-fix (`data-pledger` null) and passing post-fix during this session, for the originally-reported identity row. Coverage extends to 2 of the 3 additional sites found during review (header avatar, quote-pattern row); the 4th (`LinkedStoryCard`) is currently unreachable dead code in this file, so its fix is verified by type/data-flow tracing only — see Resolution section
- [x] No console errors during the flow — no console errors observed during Playwright verification runs
