---
status: all-done
type: story
rank: 41
workstream: clarity-canvas
created_date: '2026-10-16'
tags: [canvas, lean-canvas, points, stories]
disclosure: public
pipeline_ran: [create-spec, dev, dev.2, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
completed_at: 2026-10-21
---

# P1508: Clarity Canvas, an owner's canvas built from their points

## Problem

**Situation:** A lean canvas is the set of bets a business rests on. Clarity Pledge already stores
bets as points (agree/disagree, versions) with stories behind them, and tags points from hashtags.
A canvas view was designed in May (playground `clarity-canvas/`, v1 to v10) and parked pending
demand; it was never built, and no owner's canvas exists in production.
**Complication:** The next event (`docs/goals.md` 3a, a two-session sales mastermind) runs on each
attendee's lean canvas: people understand, then challenge, each other's riskiest boxes. That needs
a real canvas in the product, and this event is the demand the 2026-05-19 parking decision waited
for.
**Question:** What is the smallest proper Clarity Canvas, built from existing points, stories and
components, that an owner can open and others can read?

> Founder, 2026-10-16: "we are creating a clarity canvas, a proper one, with points and stories on
> clarity pledge that takes into v10 and v9 maybe into account. And that reuses the components that
> we have and it is clear, short and brief and fulfills the thing."

> Founder, on where it lives: "let's go for artifact because slash stake is not artifact in that
> sense. It's just a filter on top of feed."

Outcome: the founder's own canvas lives in Clarity Pledge.

## Appetite

Blast radius: one new surface plus the system-tag set, which the feed and `/stake` also read.
Writes: the seed, and a database rule that only the service role writes box tags.
Reversibility: medium (system-tag set and a database rule; no canvas record).
Decision density: the fifth round's two founder decisions are answered (2026-10-20: D1 box order = the recommended default; the spread's info-button copy, D6). Founder answers of 2026-10-19 are in the event-redesign change request below.

## Solution

- **A canvas is an owner's artifact with its own address**, not a `/stake` tag filter. It belongs
  to one owner and is identified by a project tag. Its contents are that owner's current-version
  points carrying the project tag, placed into boxes by box tags, per the 2026-05-19 ruling that the
  canvas is a tag-grouped view and the lean canvas is one layout.
- **Box tags are system tags, never parsed from hashtags** (review 2026-10-17). Typed hashtags
  cannot carry them: `extractHashtags` matches `#(\w+)` (`src/lib/utils.ts:185`). Today's system
  tags are a fixed set (`src/lib/feed-utils.ts:21-31`); extend it with one box-tag pattern
  (twelve keys) and check the feed and `/stake` still separate user and system
  tags. **Write path:** clients cannot write `system_tags` (insert hard-codes `[]`,
  `points-service-real.ts:215`; a trigger restores them on update, p630 migration). So: the founder seed runs as a service-role script; no client write path in this
  spec (see Who edits).
  The project tag is a plain user tag, typed as a hashtag as today. A point with the project tag
  and no box tag is not shown. One box per point (v9 rule, `v9-SPEC.md:158`).
  **Write guard:** box tags are written only by the service role; the database rejects or strips
  them on any authenticated write, tested by a direct API write, not only through
  the app's service. **Versions:** no product path creates point versions today; box-tag
  carry-forward moves to the chat spec, which creates versions.
  **Readers of the system-tag set:** extending it touches hashtag extraction, tag filters in the
  points and stories services, and sequence ordering on `/stake` and the feed; box-tag pills are
  hidden on cards the way v-tags are (allowed card change).
- **New read path.** No existing service fits: `getPublicPointsFeed` takes one tag and no owner
  (`points-service-real.ts:777`), `getPointsByValidator` has an owner and no tag (`:307`), and both
  filter to public (`:801`, `:327`). Add one read: owner + project tag + box tags, returning what
  the point card needs, linked stories batch-fetched (never per card).
- **Visibility.** The owner sees all their own points on their canvas, private included (owner SELECT
  policy, p586 migration lines 278-282). Anyone else sees public points only, until the follow-up
  sharing spec.
- **Reuse the real components.** Inside a box each point shows as a **compact** form of the
  production point card (statement + positions): a new prop on the same component (none exists
  today, `feed-point-card.tsx:67-73`), not a look-alike.
  Opening it shows the full production point card with its stories in a side panel on desktop and
  a full-screen sheet on mobile (v10's own depth model). The card gains a `'canvas'` value in its `surface` prop
  (`feed-point-card.tsx:67`, used for analytics); no other card behaviour changes.
- **Layout.** Desktop: the twelve titled boxes as a grid within one screen; points stack inside a box
  and the box scrolls vertically. Mobile: boxes stacked with titles; a box with several points
  swipes sideways with snap and an "n / N" counter. No canvas/letter switcher. *(Superseded: the
  layout, box overflow and card are now set by the change-request rounds and the Acceptance
  Criteria below — 3 cards plus "N more", no sideways swipe, statements up to five lines.)*
- **Seed (founder, 2026-10-19):** the founder's canvas from the playground decomposition
  (`data-v9.js`, an older canvas; freshness does not matter), points **and** stories, inserted by a
  service-role script under the founder's account. Test database first, with one point private so
  the owner/private checks can be tested. Production later, all public, only on the founder's
  explicit go in that session. The three ikigai boxes start empty.
- **Who edits (founder, 2026-10-17):** owners do not edit the canvas directly; their agent does,
  in Clarity Chat (follow-up spec). In this spec the canvas is read-only on screen and box tags are
  written only by the service-role seed. The author-only definer write path moves to the chat spec.
- **Card size** *(superseded by the change-request rounds: statement up to five lines, no buttons in a box card)*: compact card = statement clamped to 2 lines + the existing `PositionButtons` with
  its `compact`/`narrow` props (icon-only below 270px already exists). Clicking opens the side
  panel, not `/point/:id`. If twelve boxes still don't fit, drop tag pills and footer; no variant loop.
- **Build order:** one `/dev` run builds the real route on test data and stops at the UAT gate;
  the founder's review there is the prototype review.

**Address (founder, 2026-10-19):** `/canvas/<handle>/<projectTag>`. No canvas record: a canvas is
fully derived from owner + project tag until the artifacts + sharing spec adds one. The page title
shows the owner's name and the project tag; no other copy is invented.
**Every canvas has exactly one project tag** (a plain user hashtag on each of its points); it is what
lets one owner keep separate canvases and keeps their other points out. The founder's canvas uses
`#claritypledge`.
**Boxes (founder, 2026-10-17): a Clarity Canvas is the lean canvas's nine boxes plus three ikigai
boxes: what I love, what I'm good at, what the world needs** (the fourth ikigai circle, what I can
be paid for, is the lean canvas's revenue box). Twelve boxes in total.
**Box tags and titles (founder approved 2026-10-19, per the no-agent-authored-tags rule):**

| Box tag | Title |
|---|---|
| `canvas:problem` | Problem |
| `canvas:segments` | Customer Segments |
| `canvas:uvp` | Unique Value Proposition |
| `canvas:solution` | Solution |
| `canvas:channels` | Channels |
| `canvas:revenue` | Revenue Streams |
| `canvas:cost` | Cost Structure |
| `canvas:metrics` | Key Metrics |
| `canvas:advantage` | Unfair Advantage |
| `canvas:love` | What I love |
| `canvas:good-at` | What I'm good at |
| `canvas:world-needs` | What the world needs |

The nine keys match the seed (`data-v9.js`). **Layout (founder, 2026-10-19):** desktop uses the
standard lean-canvas shape with the three ikigai boxes as a row underneath; if that cannot fit one
1440x900 screen, fall back to a plain 4x3 grid in the table's order.

## UX Notes

- Empty box: titled, subdued, reads "Empty" to everyone, no call to action (owners change the canvas through their agent).
- Unknown canvas or owner: not-found page.
- Signed-out viewer: reads public points; position buttons follow the card's existing signed-out
  behaviour.
- Superseded point versions are not shown.
- Signing out or switching account clears private points, stories and the open panel at once.
- Loading: box skeletons. Read error: one error message for the page, no partial grid.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Owners don't want their canvas public | DEFER | Prerequisite for the event; owned by the follow-up artifacts + sharing spec. This spec shows the owner everything and others public points only. |
| Anyone can tag a point with someone else's project tag | MITIGATE | Only the owner's own points appear. |
| Full cards don't fit twelve boxes on one screen | MITIGATE | Compact card in the box, full card in the side panel. |
| Sideways swipe fights page scroll on mobile | MITIGATE | Superseded: no sideways swipe since the event redesign (3 cards plus "N more"). |
| Prototype drifts from production cards | MITIGATE | Prototype imports the production components. |

**Non-Goals**
- Do NOT add sharing, group or event visibility, or inbox listing.
- Do NOT wire Clarity Chat, uploads or agents (P1500 and siblings).
- Do NOT build a canvas creation UI or any on-screen editing; owners change their canvas through their agent (follow-up).
- Do NOT add a letter view or switcher; do NOT touch P1332.
- Do NOT change point or story card behaviour beyond the compact form, the open-panel override, hiding box-tag pills, the `'canvas'` surface value, and the fifth round's reuse changes: the card's optional `owner` prop with the owner-row decision shared with the profile card and a header slot on `PointCardShell` (D5); the point page's position block extracted (D6) and a spread row on point cards (D13); a compact variant of `StanceColumn` (D8); one allowlist entry in the P1364 drift guard (D7). Feed, `/stake`, profile, Day board, point and compare pages render exactly as before apart from the sixth round's spread row, card order and button counts (R3–R5).
- Do NOT build a visitor preview on this page (fifth round D9: P1515 owns it).
- Do NOT add the spread to `/live`, the letter flow, or story cards quoting a point (sixth round R4).
- Do NOT add version tags or a version picker (fifth round D10).
- Do NOT build the v10 "viewing as" lens (follow-up).

## Acceptance Criteria

Rewritten for the fifth round (2026-10-20). Criteria the fifth round changes are replaced; a tick is kept only where its evidence (a test or a measurement) survives the round. Two former ticks are reopened because their tests asserted the box counts that D3 removes.

- [x] The founder opens their canvas at its own address (`/p/<handle>/canvas/<name>`, R14) and sees their points in the eleven titled boxes, private ones included, counted by cards and "See all N" (R12). Evidence: e2e `p1508-clarity-canvas.spec.ts`, 31/31 on 2026-10-21 — "smoke: the owner sees their canvas…".
- [x] Signed out, the same address shows only the public points. Evidence: same suite — "signed out, the same address shows only the public points".
- [x] A point by another user with the same project tag does not appear; a point with no box tag does not appear.
- [x] A signed-in user's direct API write cannot set a box tag (only the service-role seed can).
- [x] After signing out on the owner's canvas, no private point or story stays on screen.
- [x] The feed and `/stake` pages show the same tags as before for existing points.
- [x] An unknown canvas address shows not-found.
- [x] **Layout (R1, R12):** eleven boxes under four numbered layers — Why I do this (What I love · What I'm good at · What the world needs), The core bet (Customer Segments · Problem · Solution), How we win (Unfair Advantage · Distribution · Key Metrics), How it pays (Offers & Pricing · Cost Structure, each half the row at three columns); no rules between layers; three columns at 1024px and wider, two from 640px, one below; same order at every width, and Previous / Next follow it. No Unique Value Proposition box. No sideways page scroll at 375px or 320px. Evidence: "R1: four layers in reading order…", "layers are numbered and spaced, with no rules…", "at 375px / 320px boxes and cards stack…"; unit `p1508-clarity-canvas.test.tsx` "eleven founder-approved boxes in four layers".
- [x] **Header (R10, R12):** "Clarity Canvas" (h1) on its own line; under it the owner's photo (pledge ring when pledged), "by <full name>" linking to the profile, "·" (hidden on phones, where the row wraps), the canvas name (a menu when the owner has more than one canvas), then the "Compare positions" pill right after it; no sales call-to-action, no site footer; no overflow at 320px. Evidence: "header (R10)…", "D2: the owner's photo carries the pledge ring…", visual QA at 1440/375/320 (separate subagent, 2026-10-20).
- [x] **Boxes (D3, R2, R12):** a grey box surface holding white cards; header with the box icon; no count beside the title; at most 2 cards, the most contested first, then "See all N" at the bottom right, which opens the whole box as a list in the point panel without moving the grid; a card there opens the point, and Back returns to the list; an empty box shows to everyone, with no call to action. Evidence: "D3 + founder contrast pass…", "R2: "N more" opens the box in the panel…", "R2: a point past a box's first two…", "an empty box shows to everyone…"; unit "the most contested card first".
- [x] **Cards (D4):** a box card is text to read with no buttons and an open chevron; the whole card opens the point; under the statement, always the seven-level spread and "Contested" when at least two agree and two disagree, or "No positions yet"; nothing else, except the compare columns when Compare is set. Evidence: "every card shows its spread, always…"; unit `p1508-canvas-fifth-round.test.tsx` D4 block.
- [x] **Open point card (D5):** the panel's card shows the owner as their profile does (owner row above a quoted box for others; the own-card header for the owner; "No position" when the owner holds none); the story control shows only the owner's story, "Your story" / "Their story", never two "Your story" controls. Feed, `/stake`, profile and Day board cards unchanged apart from R3–R5. Evidence: "D5: a visitor sees the owner exactly as the owner's profile shows them…"; unit D5 block; `p1508-card-regression.test.tsx`.
- [x] **Positions (D6, R13):** under the card, the point page's shared "Filter by position" block. Its filter lives in the canvas and resets when the point changes; an expanded story is remembered per point; tabs, rows and spread count from one positions read; the owner's row keeps its story button (R13), and the owner's story is not listed again under "without position". The spread row with its info popover sits on the card. Escape inside the popover or an expanded story closes only that. Evidence: "opening a point shows its stories behind one tap…", "the spread lives on the open card (founder)…"; unit D6 block (R13 cases mutation-checked); `p1508-point-page-spread.test.tsx`.
- [x] **Panel (D7, R12):** no "N of M"; the box title stays in a header with its icon; Previous and Next are outlined blue, hidden at the ends, and walk every point in reading order; below 1024px a full-screen sheet with the back arrow; Back closes an opened point and stays on the canvas, including from the address; Previous / Next add no Back steps; a position taken in the panel persists; "+ Add a story" writes the story in place. Evidence: "Previous and Next walk the canvas…", "Back closes an open point…", "review fix: browser Back on a point opened from a link…", "founder follow-up: "+ Add a story" writes the story in place…".
- [x] **Compare (D8, R12, R14):** the "Compare positions" pill (the whole pill opens the list; "No one" once someone is chosen; `?with=`). The viewer is compared with the chosen person ("You"); signed out, the owner is. The owner is listed first and not on their own canvas. Compact columns under the spread; "No position" in muted text. No link to the full compare page (R14). `/compare` unchanged. Evidence: "Compare sets two people side by side…".
- [x] **Canvas picker:** lists the owner's canvases (visitors: those with a public point; the owner: all), switches between them at `/p/<handle>/canvas/<name>`, and keeps `?with=`. Evidence: "the canvas picker lists the owner's canvases…".
- [x] **Card order and spread everywhere (R3, R4):** feed, `/stake`, profile and point-page cards and the canvas's open card: statement, tags, spread row, then the position buttons. `/live`, the letter flow and story cards unchanged. Evidence: unit `p1508-canvas-sixth-round.test.tsx` R3–R5 blocks, `p1508-point-page-spread.test.tsx`, `p1508-card-regression.test.tsx`.
- [x] **No counts on buttons (R5):** wherever the spread row shows, the position buttons carry no count badges; the "Filter by position" tabs still show counts. Evidence: unit "statement, tags, spread row, then buttons with no counts" (feed, stake, profile) and the R5 control (counts remain without the spread row).
- [x] **Reserved `canvas_` tags (R9):** typing `#canvas_x` creates no tag; a signed-in user's direct API write of a `canvas_` system tag is refused on insert and update; the picker lists only the owner's `canvas_` tags and the address uses the name without the prefix; no card shows a `canvas_` tag. Evidence: e2e "R9: a signed-in user cannot give a point a canvas_ tag through the API…"; unit "R9: canvas_<name> is a reserved system tag…", "R9: canvas tags are never pills".

**Known limitations (review findings set aside, 2026-10-21):** a mixed-case owner handle in the address does not reuse the remembered canvas (one extra read); a same-address link click does not force a fresh read; a failed picker read fails the whole canvas, as before. The `/stake` test "a never-staked cmp7 point is listed…" fails on main as well (strict-mode duplicate text), not caused here.

## Change Request — event redesign (founder, 2026-10-19)

After the first UAT the founder found the canvas unreadable ("occupied by action buttons… you cannot just read it") and asked where agreement and disagreement show. Critiqued by Gemini Argon, Codex Sol and an Opus designer (3 of 3 reported); all three recommended **read first, act on open**. Founder decisions:
- **Names are visible to everyone** (positions on public points are already public; policy is not to hide). Visitors may look before they vote.
- **The page may scroll**, but the canvas must stay small and readable: a box shows at most 3 cards plus "N more". This reverses the earlier one-screen AC at 1440x900.
- **Custom CTA for the event**: the sales call-to-action is hidden on the canvas; the page's own intro carried the instruction (an agent draft; the intro was removed in the second round, so no marker remains).
- **Empty boxes** *(superseded in the fourth round: shown to everyone, so the grid keeps its shape)*: hidden from visitors; the owner sees them. Filling them is content work (refreshed canvas draft, founder approval before any seed).
- **"Most disputed first" view**: deferred until there are real positions to sort (founder: "okay with this view if you think this is really important").
- Not built: the perspective switcher and the Letter view from the prototype.

**Second round (founder, same day, after UAT of the above):** "this thing that says Vyacheslav strongly agree, one agree, one story is cluttered"; "why are we reinventing stuff… can we not reuse patterns"; "in the beginning I just want to read… sometimes I want to compare with a specific person… or an overview"; box order "should start with customer segment first, then the problem… then the solution, then what you love and how it helps the world, and then the rest"; the header's intro line "is not needed… I just need my photo"; the project tag should not send people to the feed. Built: the Read / Positions / Compare tabs (the feed's tab row, the compare page's columns), the reading order as a plain three-column grid (the lean-canvas shape is dropped), the photo header, the tag not linking out. The content was refreshed on TEST from an up-to-date draft (critiqued by Gemini Argon), with a seven-person demo; open founder questions on that content are listed with the draft, not here.

**Third round (founder, same day):** "I don't see that it's a clarity canvas"; the photo "takes a lot of place"; "should we have icons for different boxes… ikigai boxes, are they different or not… is it two layers"; Positions "I just activate to show positions, I'm not sure it's another tab… there is a better visualization… a spread"; going back from an open card; "if there are many stories… weird if they're all open". Built: "Clarity Canvas" in a compact header; one layer with box icons and the ikigai boxes marked; the tabs replaced by a Positions switch and a Compare pill (the feed's own control shapes); a seven-bar spread per card; Back closes the open point; stories folded as in the feed; the owner's separate stance line dropped (the positions list marks the owner).

**Fourth round (founder, 2026-10-20, built in `e034423b5`):** "I'm not sure if bars is the best way"; "does it even make sense to show positions… we just can show the spread and that's it"; Ikigai "above the canvas, not below"; "proper boxes"; "compare with… contains an item that is called compare with"; select the canvas by tag; hide the footer. Built: the classic Lean Canvas grid with an Ikigai frame above it, the spread always on (switch, legend, story count and "You:" line removed), a canvas picker over the owner's project tags (`getCanvasProjectTags`), "Compare: No one", the owner's position above the open point, no footer, empty boxes shown to everyone. Reviewed: Gemini Argon ×3, Codex, a visual QA agent (3 of 3 reported).

## Change Request — fifth round: consistency pass (founder, 2026-10-20)

> Founder: "we should check everything for reusability of components, points, cards, where positions are, how positions are"; "it's inside the card… consistent" (the profile's point card); "reuse" (the point page's "Filter by position" block); "user looks at his own card… your story… another user looks into it, their story"; "why my name doesn't have a pledge ring"; "problem card so much space, key metrics so little space… we call the whole thing Clarity Canvas"; "why does it say 16 of 24… delete it"; "spread is weird… contested"; "didn't we say that we don't want to work with colors representing specific positions?"; "what happens if I compare position and the other person didn't set position?"; versions "up to you… reason through yourself".

Decisions, each with the evidence it rests on. Revised after an adversarial review of the first draft (Gemini Argon and an Opus reviewer that checked every code claim: 2 of 2 reported; 9 BLOCKs between them, all addressed below).

| # | Decision | Why |
|---|---|---|
| D1 | **One grid, twelve equal boxes, no sub-frames. Box order (founder, 2026-10-20: the recommended default):** row 1 Customer Segments · Problem · Solution · Unique Value Proposition; row 2 What I love · What the world needs · What I'm good at · Unfair Advantage; row 3 Channels · Key Metrics · Cost Structure · Revenue Streams. Four columns from 1280px, two from 640px, one below. | Founder, round 5: "customer segment on top then below problem, then solution and unique value proposition, then key metrics and channels… enough space for the Ikigai things inside the lean canvas… call the whole thing Clarity Canvas"; round 2: "start with customer segment first, then the problem… then the solution, then what you love and how it helps the world". Row 1 follows both word for word; Ikigai sits inside, not on top (the first draft put it on top, which both reviewers flagged as the round-4 shape). Unfair Advantage joins the Ikigai row as the remaining box about the owner (agent's call). Alternative considered (Gemini): columns of pairs — Segments over Problem, UVP over Solution, Channels over Key Metrics, Ikigai down the fourth column; rejected as default because a phone would then read Segments, UVP, Channels, "What I love" in a row-by-row stack. A row is as tall as its tallest box (max 3 cards plus "N more"), so short boxes beside a full one still show space: accepted. Four columns only from 1280px because at 1024px a card is ~190px wide and the compare columns would wrap (Opus). |
| D2 | **Header:** "Clarity Canvas" as the page's h1 at the top (`text-3xl md:text-4xl font-bold`, the design system's H2 scale); under it one row, owner left (ring on; name links to the profile with `hover:underline`, the name-link convention in `feed-story-card.tsx` and `StoryCardDetail.tsx`), canvas picker and Compare right. | The ring was suppressed by `showRing={false}` (`canvas-page.tsx`); the profile and the point page keep it at small sizes (P852). Founder: "one on the left side, one on the right side"; "if we say Clarity Canvas, it has to be big… the title of everything". `docs/design-system.md` names no person-link style, so the codebase's own convention is used. |
| D3 | **Boxes:** sentence-case titles (the uppercase was an agent addition, not in `docs/design-system.md`), outline icons in the title's colour (filled would differ from every other Lucide icon in the product); no counts; "N more" opens the rest in the box; "Empty" to everyone, no call to action. | Owners change the canvas through their agent (Who edits; P1500), so an empty box has nothing to offer on screen. |
| D4 | **Spread:** grey bars (`bg-foreground/40`) on a baseline, a taller tick at the centre level; bars, not a line (a line reads as change over time; the founder's "with a line" is the baseline); "Contested" (founder's word) as muted text at the end of the row, not a pill and not top right; no positions → "No positions yet". The card holds no info button: it is one button, and a button inside it is a control inside a control. Direction (disagree left, agree right) is explained in the panel's info popover (D6). | `docs/design-system.md` §Position Badges: positions are styled uniformly — "Disagree isn't negative, Agree isn't positive" — so no colour per position. "Contested" belongs beside the bars it summarizes; top right takes width from the statement at 320px. |
| D5 | **Open point card = the profile's card shape, on the card the canvas already uses.** `FeedPointCard` gains an optional `owner` prop (owner id, name, photo, colour, pledged, ear count, position, agent flag), filled once by the page: the ear count is read once per canvas with `calibrationService.getEarsCount`, skipped for agents (P1104). The decision "owner row above a quoted box for others, own-card header for the owner" (`point-card-with-links.tsx` `showQuotePattern`, the agent checks, `AgentByline`) is moved into one shared piece that both `PointCardWithLinks` and `FeedPointCard` render; `PointCardShell` gains an optional header slot. With `owner`, the card's stories are the owner's only, labelled by the profile's rule (`listStoryLabel`), and the viewer's own-story link follows the profile's slot rule. Owner without a position: the row shows with muted "No position". The canvas's `OwnerStance` goes. | Why not render `PointCardWithLinks`: it needs the profile's page-local adapter (`profile-page-v2.tsx` `AdaptedPoint`), and a second adapter copy is the P1270 failure class (a mapper silently dropped story media); it also hands position saving to its parent, while `FeedPointCard` owns the hardened saving logic (P1369/P1420). Why owner stories only: the profile's label is right only because the profile passes the owner's stories (P470); the canvas passes every author's, so "Their story" would sit over someone else's story (Opus BLOCK). The seed leaves some points without an owner position (`scripts/seed-p1508-canvas.mjs`), so the no-position case is real. |
| D6 | **Positions = the point page's "Filter by position" block,** extracted from `point-detail-page.tsx` (`FilterTabs`, the groups, `PositionHolderCard`, the story regions, and "Perspectives without position") into one shared component. The filter value and its setter are props: the point page keeps `?filter=`; the canvas keeps it in component state, reset per point (the point page's setter replaces the history entry without state, which would erase the canvas panel's Back mark). The expanded story is keyed by point id (`useReturnState('point-holder-expanded')` would otherwise carry one point's open story to the next). The owner's row shows no story toggle on the canvas (the owner's story is in the card). Its stories come from the canvas's existing batch read, `storiesService.getStoriesForPoints` over the canvas's point ids, which already returns every author's linked stories the reader may see (not only the owner's); no new read. Header: spread, "Contested", info popover (shadcn `Popover`, as `BannerCredit.tsx` uses it; `MobileTooltip` needs a long press). Must pass unchanged: `e2e/p542-story-collapse.spec.ts`, `e2e/p621-unlink-point-detail.spec.ts`, `e2e/p1104-agent-marker.spec.ts`, `e2e/a11y/p542-accessibility.spec.ts`, `e2e/a11y/p800-accessibility.spec.ts`, `e2e/a11y/p1104-agent-marker-accessibility.spec.ts`, `src/tests/p1364-point-filter.test.tsx`, `src/tests/p1364-back-drift-guard.test.ts`. | Founder: "reuse"; and asked for the spread "in details at minimum": the point page's block is that place, so the shared block carries it to both. Stories link out as they do on the point page (public stories only today); P1515 hides link-outs for shared content when it lands. Answers the founder's "I can see their stories and click on them": yes. Reset stays the block's own (tap the active tab again). |
| D7 | **Panel chrome:** no "N of M"; box title kept (Previous / Next cross boxes); Previous / Next as ghost `Button`s, "Previous" / "Next" (today's "Next point" was the inconsistency); below 1024px the sheet uses `FocusHeader`'s compact back arrow with `onBack` = the panel's close, added to the P1364 drift guard's allowlist with that reason (it closes a panel, never leaves a page). | Founder: "delete it"; "the buttons are not design consistent"; "should there be a back button". `FocusHeader` with only a fallback would step browser history and could leave the canvas when the point was opened from the address (Opus). |
| D8 | **Compare:** label "Compare"; "No one" is the reset, so no separate reset button (the canvas picker is navigation, not a filter). Who is compared: the viewer with the chosen person; signed out, the owner with them. Columns under the spread, as a compact variant (`text-xs`) of the compare page's `StanceColumn`; "No position" muted; the card stays. | `/compare` hides such statements (`compare-positions.ts`, `if (!m \|\| !t) continue`) because it lists matches; the canvas is a fixed layout and hiding cards would move boxes under the reader (founder: "disorienting… everything jumping"). `StanceColumn` today renders every label as a `text-base` blue pill, which wraps to three lines in a narrow box. |
| D9 | **"View as visitor" moves to P1515.** Today: open the canvas in a private window. | A preview built in the page cannot match a signed-out view: the card reads the session itself, the owner's own position stays lit, "+ Add a story" shows, and a click would write the owner's real position (Opus). P1515 replaces this page's reads with one server function serving everyone, and there "visitor" means two things (a stranger, an admitted attendee), so the preview belongs with it. |
| D10 | **Versions: no version tags.** One project tag is one canvas; another project is another tag. Point versions already exist as schema (`points.superseded_by`; `docs/decisions.md` 2026-04-24 [technical]), and positions stay on the version people agreed to (2026-04-24 [product]); the canvas always shows current versions. A version tag adds a second tag to keep in sync on every point, and a point co-tagged into two canvases must sit in the same box in both. What supersede does not record is a canvas-level history (a point moved between boxes or removed); seeing or forking an earlier canvas belongs with an artifact record (P1515) and the agent (P1500), later. Not enforced: a co-tag such as `#claritypledge_v2` would still be listed by the picker (Known Limitations). | Founder: "up to you… the agent can support that in the future; we don't really need anything now". The first draft said a v2 tag would strand positions on v1; that is wrong for unchanged points that are co-tagged (same ids, positions kept) — corrected here (Gemini). |
| D11 | **No spread on `/feed` or `/stake`** in this spec. | Feed cards already show counts on their position buttons; a second picture on every card competes with them. Revisit after the event: INBOX-198. |
| D13 | **Founder review of the build (2026-10-20):** (a) the header is one breadcrumb, owner / Clarity Canvas / project, Compare on the right; (b) the spread moves out of the "Filter by position" block onto the point card itself, with the info button beside it (the open card and the /point card); (c) contrast: "white on white… hard to see anything" — grey boxes holding white cards, icons in tinted circles, filled grey menus; (d) "Contested" is important, so it is a readable label, not muted text. | Founder on the first build of this round: "the spread… must live somehow on the point card"; the block's spread header read as a "separate, weird position"; "the cards and boxes all look like white on white and the icons on the boxes are barely visible"; "the drop-down menus look the same as the canvas boxes"; "'contested' — barely visible — but this one is important". Header and spread placement chosen by the founder from options. |
| D12 | **Privacy unchanged:** the owner sees everything, others public points and stories; P1515 adds sharing and replaces these reads. | The reused components show only what the canvas reads return. |

Fonts: card statements stay `text-sm` (boxes are for scanning).

## Change Request — sixth round (founder, 2026-10-20)

Ten open questions from the fifth-round review, walked one at a time with a recommendation each; the founder's answers below. Supersedes D1, D3's "3 cards", D7's ghost buttons, D11, D13a's breadcrumb, and the fifth-round Non-Goals on the feed and `/stake` spread.

| # | Decision | Why |
|---|---|---|
| R1 | **Eleven boxes in four named layers, three columns.** Layer labels (founder's words): **Who I am** — What I love · What I'm good at · What the world needs; **The core bet** — Customer Segments · Problem · Solution; **How we win** — Unfair Advantage · Distribution · Key Metrics; **Money in, money out** — Offers & Pricing · Cost Structure (each half the row on desktop). Unique Value Proposition is dropped (`canvas:uvp` leaves the box list; its points move to Solution or Unfair Advantage, one by one, on founder approval). Renames are titles only: `canvas:channels` = "Distribution", `canvas:revenue` = "Offers & Pricing"; no key changes. Three columns from 1024px, two from 640px, one below; the layer label sits above its boxes at every width. | Founder: "it starts with what I love, what I'm good at, what the world needs"; UVP "is either in solution or unfair advantage… we might not need it"; "this is cool… one understands why there are four layers". Eleven boxes fill three columns only with the half-width money row, which is also the classic lean canvas's bottom strip. |
| R2 | **Up to 2 cards per box, then "N more".** "N more" opens the whole box in the point panel (side panel on desktop, sheet on phone) as a list of its cards; a card opens that point in the same panel; Back returns to the box list. The grid never moves. | Founder: "why would you have many cards in each"; "do we want the jumping or I should be scrolling" — neither: the panel keeps the canvas still. |
| R3 | **One card order everywhere a point card shows its spread:** statement · tags · the spread row (spread, "Contested", info button) · position buttons last. "Contested" keeps its place beside the spread, with a two-way arrow icon (Lucide `ArrowLeftRight`) instead of the fork. | Founder: "putting that contested tag away from the spread makes it less powerful… they are connected"; "contested is like polarized… not sure this is a sign for polarized". Reading the evidence before acting. |
| R4 | **The spread on every point card:** feed, `/stake`, profile, the point page and the canvas. Not on `/live` and the letter flow (conversations, not browsing), and not on story cards that quote a point. Replaces D11; INBOX-198 closes. | Founder: "we want to make sure that all point cards everywhere have it… maybe only /live and /letter are kept as is"; "lets do it as part of this too". |
| R5 | **No counts on position buttons wherever the spread shows.** Exact counts stay in the point page's "Filter by position" tabs. | Founder: counts on buttons are "too much revealing and priming", "busy", and already absent on phones (icon-only buttons below 270px). |
| R6 | **Previous / Next = `Button variant="outline"`** (white, grey border). | Founder: "shouldn't they be like having a border"; the button rules make a real alternative `outline`. Light blue rejected: blue is the screen's main action. |
| R7 | **Owner positions and owner stories: no change to the screen or the seed now.** An owner's point at less than "strongly agree" is a signal that the statement needs a next version; finding it, and the experience behind each point, is the Mirror agent's job in Clarity Chat (filed to the inbox for P1500). | Founder: "if I slightly agree with my own point, then I didn't express it right… this is what my Mirror agent should help me". Test data: 24 points, owner 8 strongly agree, 10 agree, 4 slightly agree, 2 unsure; 2 of 24 carry an owner story. |
| R8 | **Several canvases, drafted as content after the build:** sales mastermind, hospital, 100–1,000 organisations (the current test canvas mixes these segments); a fourth for the dormant founder/key-hire market only if the founder asks. The agent drafts points, positions and stories (with sources) in `.private/`; nothing reaches the test database before founder approval. | Founder: "one for sales mastermind, one for hospital and one for 100-1000 organisations". |
| R9 | **Reserved `canvas_` namespace.** A canvas's project tag is `canvas_<name>` (e.g. `canvas_claritypledge`); the picker lists only `canvas_` tags (closes the co-tag Known Limitation); the address keeps the short name (`/canvas/<handle>/claritypledge`). The `canvas_` tag is a **system** tag, like the box tags: the existing system-tag guard (migration 20261019120000) already refuses it from any client insert and restores it on a client update, so no new migration; a typed `#canvas_…` never becomes a tag (hashtag extraction drops system tags). A canvas no longer reads the user tag. Cards do not show `canvas_` tags or any `canvas:` tag, including the retired `canvas:uvp`. The existing test canvas gets `canvas_claritypledge` on founder approval (its `#claritypledge` user tag stays). | Founder: "start with canvas underscore and then the name of the project… disallow users to create tags that start with canvas underscore… reserved". |
| R10 | **Header:** "Clarity Canvas" as the title on its own line; under it the owner's photo (ring), "by <name>" (name links to the profile), "·", and the project name, which is itself the canvas menu (chevron only when the owner has more than one canvas); Compare on the right. Same order on phone and desktop. | Founder: "clarity canvas and then person slash the name"; the picker and the project name were the same thing twice; "by" tells a visitor whose canvas this is (founder: ok). |
| R11 | **Feeling lost (question 10):** answered by R1, R2 and the panel; nothing more now. | Founder: ok. |
| R12 | **Founder follow-up, after seeing round six:** layer names "Why I do this" (ikigai's three: love, good at, world needs — "Who I am" did not fit "what the world needs") and "How it pays" (was "Money in, money out"); layers numbered 01–04 in plain grey, separated by space, no rules (the rules and the blue number pills distracted); in each box the most contested card first (the smaller side biggest), Previous / Next follow it; "See all N" (was "N more", which promised one card and opened all), bottom right; a quiet chevron on every box card (nothing invited a click; phones have no hover); the panel header carries the box icon at text-base in a header bar; Compare is a blue filled pill "Compare with someone…" right after the canvas name; Previous / Next blue-edged; the owner's full name stays. Layers are not collapsible. | Founder in review, with Gemini 4 Argon as designer for the header, affordance, layer and naming questions. Rejected: a "Details" button on every card (22 identical buttons), hover-only affordance, "+ Add point" in empty space (owners edit through their agent), per-layer background colours (box-in-box nesting, competes with Contested and the blue actions). |
| R13 | **Founder, 2026-10-20: the owner's row in "Filter by position" keeps its story button too.** Reverses D6's "no toggle on the owner's row": the list is where people look for each person's story, so hiding it there read as "no story". The card above and the row open the same story. `storyShownAbove` is removed from `PointPositionsBlock`. **Open question, not built:** the founder's idea of layers that change at different speeds ("Why I do this" stable, core bets side by side, lower layers depending on the bet, plus history over time). Today each bet is its own canvas sharing points; decide after real use whether grouping or history is the missing piece. **Follow-up:** the canvas loads in about 3.6 s because about 21 reads run partly one after another. | Keeping the suppression: avoids showing one story twice, but the founder's own row then looks storyless. |
| R14 | **Founder, 2026-10-21:** (a) a canvas lives under its owner's profile: `/p/<handle>/canvas/<name>` (`canvasPath`); the old `/canvas/<handle>/<name>` never shipped, so no redirect. (b) No "Full comparison" link: that page lists points without their boxes, and a point on a canvas always belongs to a box; comparing inside the canvas covers it. (c) Ship the canvas code before P1515: on prod no canvas exists (box and `canvas_` tags are service-role only, and the draft loader refuses any project but test), so the page is dormant until P1515 lets an owner share. The founder's two canvases (sales mastermind, organisations) are reviewed by hand before any reaches prod; hospital and the merged claritypledge canvas are dropped. | Keeping `/canvas/...`: a canvas is a person's, like their profile. Building P1515 on this branch: a long-lived branch drifts from main, and P1515's privacy change deserves its own review and rollback. |

**Evidence for the founder's "known pre-existing" p542 failures (2026-10-20):** "focus returns to chevron on Escape from within expanded card" and "profile page stories tab is unchanged (regression)" each fail 3 of 3 runs in isolation on both `f0ef6ed20` and HEAD, at the same assertion (`p542-accessibility.spec.ts:223`, `p542-story-collapse.spec.ts:311`); control: the same story-collapse file on HEAD passes 5 of 12. Not a fifth-round regression.

## Known Limitations

Recorded from the /dev review (2026-10-19); none blocks the canvas.

| Limitation | Label | Note |
|---|---|---|
| Position counts read at most 1,000 position rows per page (the API row cap) | ACCEPT | Shared with /feed and /stake (pre-existing). The founder canvas is ~17 points; an event of 20 attendees is ~340 rows. Server-side aggregation if a canvas ever approaches the cap. |
| The owner's own positions are read by a canvas-local strict query, not the shared helper | ACCEPT | Keeps the shared helper's lenient behaviour unchanged for feed/stake. |
| Focus can reach the browser's own chrome from the panel only via the browser's keys | ACCEPT | The page behind is inert and Tab wraps inside the panel. |
| Guard-spec cleanup ignores delete errors (the canvas spec surfaces them) | ACCEPT | Rows carry a per-run marker; worst case is a stranded test row. |
| *(Superseded since the event redesign: a box shows 3 cards plus "N more", no fade.)* On desktop a box holding more than fits shows the next card as a sliver under the fade | ACCEPT | The intended "more below" cue (visual QA round 2: reads slightly like a glitch in Revenue Streams). |
| The canvas picker lists every user tag on the owner's box-tagged points, so a second tag on a canvas point shows as its own canvas | ACCEPT | Public points only for visitors, so nothing private is listed; it is clutter, not a leak. Revisit if owners co-tag. |
| The canvas picker reads at most 1,000 points (the API row cap) | ACCEPT | Far above any real canvas. |

## Related

- P1515 sharing an artifact with events and groups (replaces this page's reads with one server function, amends the panel's card contract, and now owns the visitor preview) · P1500 Clarity Canvas from event threads (chat follow-up) · P1512 Clarity Chat v1 release · P1332 canvas to letter (backlog) ·
  P611 renderer (rejected) · P1181 community-scoped visibility (branch, parked) · P1503 Clarity Chat prototype
- Rulings: `docs/decisions.md` 2026-05-19 [product] x3 (parked pending demand; tag-grouped schema
  view; four curation principles). This spec resumes the parked canvas on the event (closest to
  recovery signals 2 and 4) and makes it an owner artifact rather than `/d/<docId>?view=canvas`;
  recorded in `docs/decisions.md` 2026-10-19 [product].
- Design reference: `~/Projects/public/superdesign-playground/clarity-canvas/` (v9-SPEC.md, v10-SPEC.md, v10-mvp.html)

## Open Questions

1. Founder: "practically it will live in drafts ... then it's a bit hidden somewhere buried which is
   fine for the beginning" — how owners find their canvas is left to the artifacts spec.
