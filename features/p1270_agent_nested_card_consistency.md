---
status: in-progress
type: story
rank: 1000078
workstream: product
created_date: '2026-09-08'
tags: [agent-accounts, feed, profile, design-system]
disclosure: public
delivery_stage: dev
pipeline_plan: [create-spec, challenge-prd, generate-tests, dev, verify]
pipeline_ran: [create-spec, challenge-prd, generate-tests, dev]
pipeline_skipped: ["architect -- no schema or auth change; the query edit adds columns to an existing SELECT", "decompose -- five sections already independently sequenced, the shape P1212/P1259 used"]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1270: Two nesting directions, two layouts — agent card drift across profile and feed

## Problem

**Situation:** A point can be expanded to show the stories under it, and a story can be
expanded to show the points under it. These are the same idea — a nested card attributed to
an author — and they are implemented by two components that share nothing: `QuotedStory`
(`point-card-with-links.tsx:713`) and `QuotedPointCard` (`quoted-point-card.tsx`).

**Complication:** The two have drifted on every axis. `QuotedPointCard` puts the author row
**outside** the box; `QuotedStory` puts it **inside**. The thread line is used on three
surfaces and missing on the fourth. The profile drops story media entirely. The feed drops
the stance on nested points. Each gap was introduced by a spec that only looked at one
direction.

**Question:** What is the single nested-card pattern, and which surfaces are off it?

> Founder framing, verbatim, on the feed screenshot:
> *"dont you think this should be outside for consistency purpsose? like why we reinvient the wheel?"*
> and *"we also have these lines from point to each individual story why not reuse?"*

Five defects, confirmed by command:

| # | Defect | Evidence |
|---|---|---|
| 1 | Profile renders no story media (video, photo, timecodes) | `profile-page-v2.tsx:339` SELECT omits `image_url`, `video_url`, `video_quotes`; mapper `:370-384` never sets them |
| 2 | Feed points tab has no thread line | `grep -c ThreadLine src/app/components/feed/feed-point-card.tsx` → `0` |
| 3 | Agent stance badge renders grey | `.agent-drained-chrome` at 10 call sites; founder reversal, below |
| 4 | Feed stories tab shows no stance on nested points | `stories-service.interface.ts:105` — `profileSubjectPosition` "deliberately NOT supplied" |
| 5 | `QuotedStory` byline sits inside the box | `point-card-with-links.tsx:855-861` vs `quoted-point-card.tsx:132-160` |

Defect 1 is the **third instance** of one omission: `feed-point-card.tsx:293` and
`point-detail-page.tsx:432` both carry a P1212 comment reading *"the conversion dropped them
silently"*. The profile was missed on both passes.

Defect 4 is not a discovery — `feed-story-card.tsx:394` records it as
*"an OPEN FOUNDER QUESTION recorded in the spec, not a settled piece of §5."* This spec
answers it.

## Appetite

**Blast radius:** medium-high — five surfaces, and §5 touches the only route to the agent
disclosure page. **Reversibility:** high, git revert; no migration, no data change.
**Decision density:** two founder calls, both made in the filing conversation (§3 and the
option-A ruling in §5).

## Invariants

- **An agent account's identity cluster stays visually distinct from a human's.** The square
  black-and-white avatar, absent pledge ring, absent ear count and the `AGENT · on {Name}` byline
  are the marker set **after this spec**. The colour drain on the stance badge was part of it and
  is removed by §3 — the founder ruling recorded there is that the photo and the word carry the
  disclosure while the badge carries the content. **Two channels is the floor, and it must hold on
  every branch:** §6 exists because a branch rendering **zero** markers is live on `main` today,
  which is why §3 may not ship without it.
- **Every render branch that shows an agent story must carry at least the square avatar and the
  `AGENT` word.** This is stated as a goal, not a fact: §6 exists because it is **already false
  on `main`** in the embed branch. The unit of verification is the render BRANCH, not the file —
  decisions.md 2026-09-08 [technical], "Moving a guarantee out of a component means enumerating
  render BRANCHES, not files", where an identical move left four branches with no route.
- **Thread lines wrap all expanded children, including single items** — decisions.md 2026-03-17
  [product], "ThreadLine is the universal 'belongs to' visual pattern".

## Solution

Standardise on `QuotedPointCard`'s pattern in both nesting directions: **attribution row
outside the box, content in the box, thread line connecting.**

### §1 — Profile fetches story media
Add `image_url, video_url, video_quotes` to the SELECT at `profile-page-v2.tsx:339` and map
them in the adapter. No component change: `QuotedStory` already renders media when given it.

### §2 — Thread line in the feed points tab
Wrap the expanded story list in `ThreadLineGroup`/`ThreadLineItem`, matching the other three
surfaces. Component already exists and is already imported elsewhere.

### §3 — The agent stance badge renders blue
Remove `.agent-drained-chrome` from all 10 call sites, and delete the now-dead class and its
CSS rule. **Ships together with §6 in one change** — never before it, never after. §6 is the
condition that makes this safe.

**Corrected 2026-09-08 by reading all ten sites** (this section previously said "remove it from
the stance badge at all 10 sites", which misdescribes nine of them). NINE of the ten wrap the
whole BYLINE ROW — `AgentByline` plus the `PositionBadge` — and only
`point-card-with-links.tsx:858` wraps the badge alone. That distinction turns out not to change
the edit, and the reason is what makes the class safe to delete outright:

- `MachineChip` is `text-gray-500` (`machine-chip.tsx:51`) — already monochrome, so the filter
  never changed it.
- The ear badge, the only other coloured thing in those rows, is gated `!isAgent` and therefore
  can never be present when the class is.
- Which leaves `PositionBadge` as the ONLY pixel `filter: grayscale(1)` was acting on, anywhere
  in the product.

So the class is inert the moment the badge leaves it. Leaving it in place would keep a
compositing layer and a name that no longer means "these pixels are grey" — the exact drift
`index.css` warns about in its own note. Delete the rule; correct the comment.

**Founder ruling, 2026-09-08, after two rounds in which the agent's arguments for keeping it
grey were both falsified.** What a reader sees on an agent card today is three markers saying
"machine": the square black-and-white photo, the word `AGENT` beside the name, and the grey
badge. Only the third costs anything — it is the one carrying the content (whether the machine
read the subject as agreeing or disagreeing) and the only one made hard to read.

Two claims that were used to defend the drain, both checked and both false:

1. *"Colour signals standing, and agents hold none"* (`p1104:73`). `PositionBadge.tsx:70` is a
   single hardcoded `bg-blue-100 text-blue-700` for every human — identical for a founding
   pledger with 40 ear-verifications and a signup from this morning. Colour never encoded
   standing, so draining it removes no standing signal; it invents a distinction absent on the
   human side.
2. *"The avatar is exempt from the drain, so the card keeps a colour channel."* True of the
   test fixture only. `e2e/p1104-agent-marker.spec.ts:14` states the fixtures *"carry no
   `avatar_url` and render initials"*, so the `saturation > 0.15` exemption assertion measures
   a coloured initials block. The same file records the production number at `:97-98`:
   *"Measured mean saturation on a real product photo: 0.00."* Production agent avatars are
   black-and-white portraits.

**Also fix the fixture problem**, or the guard keeps passing on something production does not
render. A guard proven only against initials does not bind a photo.

**Re-aim, do not delete, the two guards.** They must bind the markers that now carry the
disclosure — the square avatar shape and the `AGENT` word — instead of badge saturation:
`e2e/p1104-agent-marker.spec.ts:200-206` and `src/tests/p1259-stance-chip-in-feed.test.tsx:104-115`
(whose negative control at `:122-133` also inverts). Watch each fail before trusting it.

**Correct the stale channel count** in `src/index.css:279-282`, which names "the square avatar,
the MACHINE chip and the footer disclosure" — `AgentStoryFooter` has exactly one production
call site (`live-story-card-expanded.tsx:330`, a `/live` Non-Goal), so that count is already
wrong by one before this spec touches anything.

### §4 — Stance on nested points in the feed stories tab
Supply `profileSubjectPosition` from the feed query so `QuotedPointCard`'s existing author
header renders. Purely additive — no layout change; the row appears where the profile already
shows it.

### §5 — `QuotedStory` byline moves outside the box
Lift the avatar + `AGENT · on {Name}` + stance row above the quoted box, matching
`QuotedPointCard`. Preserve `onNameClick` on the name in every branch.

**[FOUNDER DECISION — made 2026-09-08, option A]** The stance renders on the story byline **in
the feed only**; the profile keeps its single stance above the point. On a profile the owner
and the story author are usually the same account, so carrying stance in both places renders
the same fact twice. Layout becomes uniform; stance placement stays surface-specific.

### §6 — Embed surface renders an agent story with ZERO markers
On `/point/:id?embed=true`, `embedStories` is built from every linked story
(`point-detail-page.tsx:420-422`) while `getStoryAuthor` resolves against position holders
(`:485-487`) and returns `undefined` when they diverge. `QuotedStory` gates its entire byline
block on `{author && ...}` (`point-card-with-links.tsx:771`), so avatar, `AGENT` chip, name and
stance all disappear together — leaving a machine-written reading of a real named person with
no indication a machine wrote it, and no disclosure route.

Gate the marker set on `isAgent` (derivable from `story.authorId` with no lookup) rather than on
a successful author lookup. This is the most serious defect in this spec and it exists today.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| §5 or §6 strands the marker set on an unvisited render branch | MITIGATE | Enumerate branches by name and count: the 10 `.agent-drained-chrome` sites, the `{author && ...}` gate at `point-card-with-links.tsx:771`, and the embed branch at `point-detail-page.tsx:387`. The census `SURFACES` list has no embed case today — add one and prove it binds by reintroducing the defect |
| §3's shape-based direction cue reads as a new status, not an intensity | MITIGATE | Settle by rendering a specimen and looking, per P1104's own rule — never by argument in a spec |
| §6's `isAgent` gate renders a byline for a story whose author never resolved | ACCEPT | A marker with no name is strictly better than no marker; the name is additive when the lookup succeeds |
| §1 increases the profile query payload | ACCEPT | Three columns on an existing RLS-scoped batch query |
| §4 adds a stance row to a dense feed surface | ACCEPT | Same row the profile already renders; founder asked for it explicitly |
| `index.css:279-282` names a three-channel count that is stale | MITIGATE | `AgentStoryFooter` has exactly one production call site (`live-story-card-expanded.tsx:330`, a `/live` Non-Goal), so story surfaces already run at two channels. Correct the comment; do not rely on the old count either way |
| Unifying `QuotedStory` and `QuotedPointCard` into one component | DEFER | Unblocked once both use the same layout and the difference is props, not structure |

**Non-Goals**
- Do NOT ship §3 without §6 in the same change — §6 is the precondition, not a follow-up.
- Do NOT change the avatar treatment (square, unringed) or the ear-count suppression.
- Do NOT merge `QuotedStory` and `QuotedPointCard` in this spec.
- Do NOT change the profile's stance-above-the-point placement (option A).
- Do NOT touch `/live` surfaces (`live-mode-view`, `live-story-card-expanded`).

## Acceptance Criteria

- [x] On `/p/agent-connor-leahy`, a nested story with a video renders the video, its timecode
      quote pills, and a photo when the story has one — `p1270-profile-story-media.test.tsx` 4/4
- [x] On `/feed?tab=points`, expanded stories under a point are connected by a thread line —
      `grep -c ThreadLine feed-point-card.tsx` â 7 (was 0). `[post-deploy]` confirm visually
- [x] An agent's stance badge renders blue, and the card still reads as machine-authored:
      square black-and-white photo plus the `AGENT` word, on every surface — now proven on
      RENDERED PIXELS, not just structurally: badge background `rgb(219,234,254)` with
      `filter: none`, avatar `border-radius: 4px`; e2e 26 passed EXIT=0
- [x] On `/feed?tab=stories`, expanding the points under a story shows the author row with
      stance above each nested point — `p1270-feed-nested-stance.test.tsx` 5/5
- [x] On both feed and profile, a nested story's author row sits above the box, not inside it —
      `p1270-quoted-story-byline-outside.test.tsx` 6/6, asserted as DOM containment
- [x] On `/point/:id?embed=true`, an agent story whose author holds no position on that point
      still renders the square avatar and the `AGENT` word — census `EMBED_NO_AUTHOR` branch;
      reintroducing the defect exits 1
- [x] Clicking the agent name on every surface that renders one still opens the disclosure page —
      census `ROUTED_SURFACES` 4/4 assert tagName BUTTON + navigate target

## Done-When

- [x] `grep -c ThreadLine src/app/components/feed/feed-point-card.tsx` returns non-zero → **7**
- [x] The census test enumerates every branch named in the Risks table above, including embed,
      and reintroducing the §6 defect makes it exit non-zero — **EXIT=1**, 22 passed / 2 failed,
      both failures on the `EMBED_NO_AUTHOR` branch (AGENT word + square avatar). Restored: 24/24
- [x] The re-aimed guards bind the square shape and the `AGENT` word, and each is watched
      failing before it is trusted — **unit guard EXIT=1** on the inverted invariant
      (`'agent-drained-chrome inline-flex'` should not contain `agent-drained-chrome`);
      **e2e guard EXIT=1** with the drain reintroduced on the position row, badge measuring
      **0.00011 saturation** against the required >0.15, on rendered pixels. Restored: e2e
      `p1104-agent-marker` 26 passed EXIT=0, a11y 8 passed EXIT=0
- [x] The agent-marker fixture renders a real photo, not initials, so the guard binds what
      production ships — a black-and-white-portrait case added to the file's existing
      `photographic avatar branch` block (whose own fixture is `FF0000` red and vacuous the
      same way). It asserts shape + the word and deliberately reads no colour on the avatar,
      because a B&W photo and a greyscaled one measure alike
- [x] `index.css`'s channel-count comment names the channels that actually exist — the dead
      `.agent-drained-chrome` rule is deleted and the stale three-channel count corrected to two
- [x] Visual comparison of opened story and point cards, profile vs feed, at 375px and desktop
      — plus 320px, which is where the only real defect turned up (the name truncating to fit
      the badge). Measured, not eyeballed: names untruncated, avatar never orphaned, no
      horizontal overflow, badge `rgb(219,234,254)` with `filter: none`, avatar radius 4px, at
      1280 / 375 / 320 on both surfaces. Profile correctly carries NO stance on the story
      byline (option A); the feed does

## Test Coverage Strategy

Written by `/generate-tests`. Every RED test below was **watched failing before being trusted**
(epistemic gate 7); the exit code and the failing assertion are recorded, not inferred.

### The three load-bearing artifacts

These were written in the main session rather than delegated, because each one is a case where
a spec-only reader reproduces the defect it is meant to catch.

**1. The render-branch census — `src/tests/p1259-disclosure-route-on-every-surface.test.tsx`**

Extended in place rather than duplicated. A second census file is the exact failure this one
already carries a note about: a list that enumerates COMPONENTS while calling itself a list of
BRANCHES. The list is now two-level, and the levels differ for a stated reason:

| List | Members | Contract |
|---|---|---|
| `ROUTED_SURFACES` | 4 — all with a RESOLVING author lookup | name renders as a real control that navigates |
| `MARKER_SURFACES` | 5 — the above plus `EMBED_NO_AUTHOR` | square avatar + the `AGENT` word. Never zero |

`EMBED_NO_AUTHOR` passes `getStoryAuthor={() => undefined}` — not a contrived value, but
literally what `point-detail-page.tsx:485-487` returns for a story whose author holds no
position on the point. **Every one of the four pre-existing entries passed a resolving lookup**,
which is precisely why the census could not see §6: the fixture, not the component list, was what
had never been varied.

RED, watched: `EXIT=1`, 14 passed / 1 failed, failing at `getByTestId('agent-byline')` — the
byline is absent because `{author && ...}` gated it away. Correct reason, not an import error.

**2. The re-aimed unit guard — `src/tests/p1259-stance-chip-in-feed.test.tsx`**

Inverted, not deleted, with the falsified reasoning kept in the header so it is not re-derived.
Three tests now:

- *chip renders UNDRAINED* — RED, watched: `EXIT=1`, `expected 'agent-drained-chrome inline-flex'
  not to contain 'agent-drained-chrome'`.
- *agent card carries BOTH non-colour channels* — square avatar + the `AGENT` word, asserted
  directly rather than inferred from a filter.
- *human card carries NEITHER* — **the negative control had to be re-aimed too, and that is the
  lesson.** Its predecessor asserted a human chip is not drained; under §3 nothing is drained on
  either side, so that assertion now passes unconditionally — it would go green against a build
  that stamped the agent markers onto every human in the product. A control that cannot fail is
  not a control.

The two channel assertions pass on today's code, so gate 7 is satisfied for them by **opposed
controls rather than a mutation**: the identical assertion pair returns `rounded-sm` /
not-`rounded-full` for an agent and `rounded-full` / not-`rounded-sm` for a human. A known-good
and a known-bad input, scored on one metric, returning opposite verdicts.

**3. The e2e guard and the fixture that made it unfalsifiable — `e2e/p1104-agent-marker.spec.ts`**

The old pair asserted `meanSaturation < 0.05` on the drain (a class §3 deletes) and
`> 0.15` on the avatar, as proof the card retained a colour channel. **The second measured the
fixture, not the product.** `test-agent-account.ts:68-72` seeds `avatar_color: '#0044CC'` and no
photo — saturated on purpose so the measurement "could tell the difference" — while this same
file records the production number at `:97-98`: *"Measured mean saturation on a real product
photo: 0.00."* The assertion passed at fixture saturation while the thing it claimed to protect
measured 0.00. Green bounded the fixture, not the truth (gate 7b).

Replaced by: the stance badge renders COLOURED; `.agent-drained-chrome` has count 0 in the DOM
(counting is the assertion — a survivor means a missed call site); and a new
**black-and-white-portrait** case.

The B&W case went into the file's **existing** `photographic avatar branch` block rather than a
new global fixture — that block already existed and was found by reading before writing. Its own
fixture is `FF0000` **red**, so its `sat > 0.15` avatar assertion is vacuous in the identical
way. The new test asserts shape and the word, and deliberately reads **no** colour on the avatar,
because a B&W photo and a greyscale-filtered one measure alike — which is the whole point.

### Collateral corrected while re-aiming

`e2e/a11y/p1104-agent-marker-accessibility.spec.ts` — *"the marker is not conveyed by colour
alone"* said **both** non-colour channels must be present and then asserted exactly **one**. The
word was never checked by any assertion in that file. Survivable while a third channel existed;
not survivable once these two ARE the disclosure. Both are now asserted.

### Regression check

`p1212-quotes-on-every-surface` and `p1141-agent-story-chrome` run clean alongside the changes:
54 tests, 52 passed, **2 failed — both the intentional RED tests above**, no collateral damage.

### What is NOT covered, stated plainly

- **jsdom computes no filters.** Every unit assertion here is structural. The pixel claims live
  in the e2e file and have not been run in this session — Playwright was not executed.
- **The e2e re-aims are RED-by-construction and unrun.** They assert post-§3 state against
  pre-§3 code. They must be run and watched failing, then passing, during `/dev`.
- **`agent_accounts` avatar generation is unbuilt** (P1096), so even the B&W fixture is a
  stand-in for a portrait that does not exist yet. It is the closest available input to
  production, not production.

## Alternatives Considered

- **Keep the stance badge grey (the original §3, and `main` today).** Rejected by the founder on
  2026-09-08, after the two arguments defending it were each checked and found false — both are
  written out in §3 with the commands behind them. Reinstating grey means overturning those two
  findings, not re-stating a preference.
- **Ratify two channels explicitly, then un-drain.** A coherent route: story surfaces already
  run at two channels, so point surfaces would only match them. Rejected *for now* because that
  parity was reached by accident — the drain left story surfaces as inert and miscoped, under a
  channel count that was already wrong, so nobody ever decided two was enough. If the founder
  wants colour after seeing the §3 specimen, this is the honest path to it, and it fixes the
  stale count either way.
- **Option B — drop the profile's stance above the point.** Rejected: contradicts the standing
  "profile stay same" ruling.
- **Option C — stance on the story byline everywhere.** Rejected: renders the same fact twice
  where owner and author coincide.
- **Merge the two components now.** Rejected as scope.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] §3's citation does not support un-draining | §3 rewritten to legibility-without-colour | The cited entry concerns the MachineChip's **border**. `e2e/a11y/p1104-agent-marker-accessibility.spec.ts:179-181` says the drain **is** the colour signal and the word is one of two non-colour backups — the opposite of the spec's reading |
| 2 | /challenge-prd | [BLOCK] `index.css` names stance as what claims standing | Original §3 withdrawn | `index.css:267-268` reads "DRAIN WHAT CLAIMS STANDING — the identity/**stance** cluster", and `:276-277` "On POINT surfaces the class stays, where the stance badge is a real colour target". The spec had argued stance was content, quoting the sentence that refutes it |
| 3 | /challenge-prd | [BLOCK] Non-Goal "drain still governs ear and pledge chrome" is false | Non-Goal removed | Ear is gated `!isAgent` while the class applies only when `isAgent` — mutually exclusive at all 10 sites; the pledge ring is on the avatar, outside the filter. The drain's only effect on an agent card **is** the stance badge, so "narrowing" was deletion |
| 4 | /challenge-prd | [BLOCK] Embed branch renders zero markers | Added as §6 | Verified independently before the challenge report arrived; more serious than anything the original §3 addressed |
| 5 | /challenge-prd | [WARN] §2's "violates an existing ruling" overstated | Softened to a supporting citation | The 2026-03-17 ruling names `PointCardWithLinks` and `LiveStoryCardExpanded`; `feed-point-card` postdates it |
| 6 | founder, 2026-09-08 | Stance placement on profile vs feed | Option A | Layout uniform; stance stays surface-specific to avoid rendering the same fact twice |
| 7 | founder, 2026-09-08 | **Supersedes rows 1–3.** Those three retired the *spec's original argument* for colour, which was built on a misread citation. They did not settle the question | Badge renders blue; §3 rewritten on new evidence | The argument was replaced, not repeated. `PositionBadge.tsx:70` is one hardcoded blue for every human regardless of pledges or ear count, so colour never encoded standing; and the avatar-exemption defence holds only against the fixture's coloured initials, not the 0.00-saturation photos production ships. Rows 1–3 remain accurate about the old argument and are kept for that reason |
| 8 | founder, 2026-09-08 | §3 alone would take the embed branch from zero markers to zero markers plus a blue badge | §3 and §6 ship as one change | §6 is the precondition. Shipping §3 first adds colour to the one branch that has no disclosure at all |

## Related

- `features/done/2026-06-10/p1212_agent_story_card_contract_drift_across_surfaces.md` — fixed
  the same media omission on two of three surfaces
- `features/done/2026-06-10/p1259_agent_story_surfaces_leak_their_own_evidence.md` — added the
  feed stance chip, relocated the disclosure to the byline name, and left §4's question open
- `features/done/2026-06-10/p1104_agents_must_be_visually_distinguishable.md` — the marker set
- `decisions.md` 2026-09-01 (drain ruling, reversed here) · 2026-09-08 (the word is the
  channel) · 2026-09-08 (render branches, not files) · 2026-03-17 (ThreadLine is universal)
