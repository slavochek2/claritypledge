---
status: week
type: task
rank: 21
workstream: design-system
created_date: '2026-10-05'
tags: [design-system, cards, visual-consistency]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
depends_on: [p1389]
---

# P1423: Remove the coloured left stripe from cards, app-wide

## Problem

> **Superseded in part (2026-10-06):** the founder saw the stripe removed and chose **option B**,
> one neutral grey stripe on list and content cards. Read *Founder Decision* below; where this
> section says "remove" for a list or content card, the shipped action is the grey stripe.


**Situation:** Cards across the app carry a 4px coloured left stripe: blue on public stories,
letters and events and on the 0-10 rating card, slate on points, grey on private items and
cancelled events. P1389 (the evening close) already removed it on its own screens — the 0-10 card
gained an `accent` switch and its event cards are static — because on the reserve screen the
stripe pulled the eye to the card instead of the question and the buttons.

**Complication:** The rest of the app still has it, so the same card looks different inside and
outside the close. The founder decided to remove it everywhere, as its own piece of work after
P1389 ships.

> Founder, P1389 round 7 (2026-10-05): "On the reserve screen the eye goes to the middle card, not
> the bottom actions (maybe the blue left stripe)."
> Founder, 2026-10-05, on doing it app-wide: "i think we can do b right now you make a spec and
> drive it to completion as orchestrator — review of spec with opus, then development,
> verification of all relevant screens, codex and opus and gemini reviews and fixing".

**Question:** Which stripes are decoration or a redundant state signal (remove), and which are
typography or structure that only looks similar (keep)?

## Appetite

Blast radius: medium — many card surfaces (feed, profile, point pages, letters, events, /live,
the letter reading flow), but styling only. Reversibility: high — class changes, a git revert.
Decision density: low — the founder decided to remove it; one scope line below needs confirming.

## Solution

> **Superseded in part (2026-10-06):** the founder saw the stripe removed and chose **option B**,
> one neutral grey stripe on list and content cards. Read *Founder Decision* below; where this
> section says "remove" for a list or content card, the shipped action is the grey stripe.


Remove the left stripe from every **card** that uses it as decoration or as a second signal of a
state the card already shows another way. Keep every left border that is **typography or
structure**, which only shares the CSS.

Classification of every `border-l-*` on main (2026-10-05, from reading each line — re-check against
the branch base before building):

| Surface | What the stripe says | Action |
|---|---|---|
| `shared/comprehension-rating-card.tsx` | decoration (blue) | none (focus screen); the `accent` prop is deleted and its one caller, `EventClosePage`, updated |
| `prototypes/events/components/EventCard.tsx` | blue = live, grey = cancelled | remove; cancelled keeps its opacity and label |
| `feed/feed-story-card.tsx`, `social/story-card-with-links.tsx`, `social/StoryCardDetail.tsx` | blue = public, grey = private | remove; private keeps its visibility icon and muted background |
| `feed/feed-point-card.tsx`, `social/point-card-with-links.tsx`, `pages/point-detail-page.tsx:634` | slate = point, grey = private | remove (same) |
| `feed/feed-skeleton.tsx` | placeholder of the above | remove, to match |
| `partners/live-content-cards.tsx` (5), `partners/live-story-card-expanded.tsx` | blue = story, muted = point | remove |
| `pages/profile-page-v2.tsx:1619, 1976` | blue = story, slate = point | remove |
| `letters/sent-tab.tsx`, `letters/drafts-tab.tsx` | blue = public, grey = private | remove; visibility stays on the inline visibility icon |
| `pages/prototypes/new-live-prototype.tsx` | design demo of the above | grey stripe, as the real card |
| `pages/design-private-page.tsx` | dated record of the private-marker decision | **keep**: its stripes are the subject of the record |
| `pages/story-detail-page.tsx` (story card wrapper) | 3px top band in the author's colour | remove (not a `border-l-*`; found by the visual review) |
| `utils/linkify.ts`, `shared/story-video-quotes.tsx`, `pages/full-article-page.tsx:397`, `pages/landing-v2.tsx`, `pages/clarity-demo-page.tsx` | quotation (blockquote) | **keep** |
| `pages/full-article-page.tsx:292, 312` | table of contents: current section | **keep** |
| `shared/source-group.tsx`, `shared/agent-profile-disclosure.tsx`, `pages/point-detail-page.tsx:404` | grouping / indented detail | **keep** |
| `pledge/pledge-card.tsx`, `pages/not-found-page.tsx`, `pages/landing-v4.tsx:847` | corner frame, CSS triangle, landing art | **keep** (not a card stripe) |

Where a card's hover state coloured only the stripe side, hover moves to the whole border, as on
cards that never had a stripe.

Scope resolved 2026-10-06: see *Founder Decision* (option B). The public/private colour is gone;
every list and content card carries the same neutral grey stripe.

## Invariants

- **Private must stay visible without the stripe.** decisions.md (`CardMenu` entry) records that
  list-card focus leaves the left border alone "so the `border-l-4` accent (amber = private) keeps
  its meaning". With the stripe gone, every private story, point and letter card must still show
  its visibility icon and its muted background, in list and detail views. Grep and screenshot,
  never assume.
- **`/live` keeps passing its two-party e2e.** decisions.md (P852 entry): a global restyle of
  `ComprehensionRatingCard` "would change `/live` and trip its two-party E2E guard". Run those
  specs; fix the code, not the test, if a selector depended on the stripe.
  *Status at ship:* unproven by a green run. Those specs fail 8/8 identically on unchanged main
  (user-cleanup FK error, missing story search; `docs/process-learnings.md` INBOX-126), so this
  change was checked by control run, and no /live selector keys on a stripe class.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A private card becomes indistinguishable from a public one | MITIGATE | Invariant 1: screenshot a private story, point and letter in list and detail |
| A test or selector keys on a stripe class | MITIGATE | grep `border-l-` in `src/tests` and `e2e` first; update only selectors, never assertions about meaning |
| Cards look flat without the stripe | RESOLVED | It happened; the founder chose option B (neutral grey stripe) |
| P1389 not shipped yet | RESOLVED | P1389 shipped before this was built |

**Non-Goals**
- Do NOT change quotations, the article table of contents, grouping lines or decorative art (the
  *keep* rows).
- Do NOT redesign cards (padding, shadows, radius, type) beyond what removing the stripe forces.
- Do NOT add a new private/public marker; the existing icon and background are the signal. (Private
  letters gained the muted background stories and points already use: the same marker, not a new one.)

## Founder Decision (2026-10-06): option B, one neutral grey stripe

After seeing the stripe removed everywhere, the founder found the cards too plain ("everything is
white ... nothing there") and compared four treatments side by side on the real feed, profile,
letters and events: no stripe, a grey page behind white cards, a neutral grey stripe, and the old
blue stripe. He picked **B: a single `border-l-4 border-l-slate-300` on every list or content card**
(stories, points, events, letters drafts and sent, /live content cards, the feed skeleton).
Focus screens (the 0-10 rating card, the evening close, drawer questions) carry none, which was the
original complaint. The story page's 3px author-colour top band is removed too. The stripe no longer
encodes visibility; private shows through its lock and `bg-muted/60`, now also on private letters.
Hover never recolours the stripe (`hover:border-l-slate-300`). The dated `/tree/design-private` page
keeps its stripes on purpose: they are the subject of that record.

## Done-When

- [x] No card renders a coloured stripe (except the kept `/tree/design-private` record); list and content cards carry the neutral grey one —
      `e2e/p1423-card-stripe.spec.ts` 3/3 at 375, 320 and 1280 on profile, story page, point page
      and letter drafts, asserting the grey stripe is present and no coloured left stripe or thick
      top band exists; it fails on a blue stripe and on a missing stripe (both controls run). Feed
      and events screenshotted at all three widths. Not screenshotted: /live cards, the rating card,
      sent letters, the skeleton, a cancelled event (class-only changes there).
- [x] Every *keep* row renders unchanged — the e2e exempts only blockquotes, and the feed's video
      quotes still render their grey quote line; no keep-row file is in the diff.
- [x] A private story, point and letter is still visibly private — private story page: lock +
      muted background (e2e screenshots); private point: `bg-muted/60` pinned by
      `src/tests/p1366-card-footer.test.tsx`; private letter draft: lock + muted background (e2e).
      Profiles list public stories only, so no private card renders there.
- [x] Unit tests pass (5727/5727 with a 30s timeout; pre-commit green). The touched e2e specs that
      fail do so identically on unchanged main (control runs): the profile specs (`docs/process-learnings.md` INBOX-122) and
      /live's two-party specs (INBOX-126, user-cleanup FK error + missing story search), so the
      /live invariant is verified by control, not by a green run.
- [x] Opus visual review (screenshots only, 18/18 read), Codex and Gemini reviews run on both the
      no-stripe version and option B, plus an Opus adversarial review of B: each finding checked
      against the code. Fixed: story-page top band, private letters muted, design page left intact,
      the e2e now asserts the grey stripe's presence, 120s test budget. Answered as not defects:
      `accent` prop callers (tsc clean), profile private stories (never listed), private points on
      the feed and point page (never had a private colour), and the diff-vs-moved-main artifact.

## Alternatives Considered

- **Only the two surfaces the founder named (0-10 card, event cards).** Rejected: the founder
  chose app-wide, and leaving the stripe on stories and points keeps the inconsistency P1389
  exposed.
- **A shared `accent` prop on every card, off by default.** Rejected: a switch nobody turns on is
  dead code; delete the classes instead.

## Related

- P1389 (the evening close) — removed the stripe locally; this spec makes it app-wide.
- decisions.md: `CardMenu` focus/hover entry (amber = private accent); P852 entry
  (ComprehensionRatingCard restyle vs /live's two-party guard).
