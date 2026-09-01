---
status: week
type: story
rank: 1000062
workstream: C2
created_date: '2026-09-01'
tags: [stories, agents, feed, profile]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1212: The agent story card contradicts its own shipped contract, and renders differently on every surface

## Problem

**Situation:** The first real disagreement run filed four agent accounts and their stories on
2026-09-01 (registry: LeCun, Bengio, Andreessen, Harari, all `env:test`, all created 14:42:40).
The founder reviewed the result across four surfaces — point detail, feed points, feed stories,
profile — and annotated six defects.

**Complication:** Five of the six are not new design questions. They are decisions **already taken
and not on screen**:

- The supporting-quote block renders **twice** on the same page — once as prose inside
  `story.content`, once again from `video_quotes` with jump links. P1141's own design places quotes
  *"Below the argument"* and its component comment records that *"quotes inline in the prose"* was
  built and **rejected**. Diagnosed during P1202 and recorded in `docs/process-learnings.md` rather
  than fixed, because the fix touches a shipped publish precondition that spec's Non-Goals forbid.
- The position chip on agent rows renders **grey**. This is **not** a defect — see Non-Goals. It is
  the machine marker working as designed, and the founder's own decision of 2026-08-19.
- **Story media does not render on the profile.** Verified 2026-09-01: `StoryMedia` is imported by
  `feed-story-card.tsx`, `story-card-with-links.tsx` and `StoryCardDetail.tsx`. The profile page uses
  its own private `StoryCardFull` (`profile-page-v2.tsx:1216`) which handles `imageUrl` upload/delete
  and never imports `StoryMedia`. A shared profile link therefore shows no video.
- The byline reads `[MACHINE] reading of {Full Name}`, per P1141's UI Contract.

**Why they shipped this way:** P1141 was closed on a **failing gate** — 53 failures across 17 check
groups — by explicit founder override, `--no-verify`, twice. Its closure note states plainly that the
failures are not fixed and that closing the card is not closing the gate.

**Question:** What does one agent story card look like, and how does it render identically wherever a
story or a point appears?

> Founder framing, verbatim: *"here is why LeCun lands on this claim — then the quotes that prove it"*

> On the byline, verbatim: *"machine is not a word that people use. Maybe we should use the word
> agent instead… each time it sounds a bit redundant to say agent reading of."*

> On profile media, verbatim: *"If I send a profile of Yann LeCun to somebody, it should render the
> full card that we have, like with the video and the timestamps, right? I mean, otherwise, it's not
> really cool, is it?"*

> On scope, verbatim: *"if it's one and they're related, then they can be adversarially reviewed
> together."*

## Appetite

**Blast radius: medium.** Four story-rendering surfaces plus the point card. Touches the sealed-letter
snapshot path, which has broken twice and needed two restore migrations. No change to points,
positions, agent provisioning, or the disagreement pipeline's drafting stages.

**Reversibility: high in code, low in public.** Every change is additive or a string change.

**The four affected pages are already publicly readable, unauthenticated, today — this is not a
prod-only concern.** Verified 2026-09-01: the `stories` read policy is
`USING (visibility = 'public' OR author_id = auth.uid())`
(`20260325120000_p586_visibility_privacy_foundation.sql:236`) — **no environment term** — and this
pipeline always writes `visibility = 'public'`. `publish.md:42` records that narrowing a gate to
prod-only on environmental grounds was attempted and **REVERTED** on 2026-08-31: *"'Test' is not
private, and that is the whole answer."* The duplicated quotes, the missing disclosure on the letter
surface and the wrong byline are live on named readings of four real people right now.

**Decision density: one open founder call** (byline form, below). The quote-duplication call was
settled by the founder 2026-09-01 — **option A**.

## Invariants

- **A story MUST NOT state, name or imply the arguer's position on any point** (P1202). Restated
  because this spec edits the surfaces that display both.
- **The machine marker must survive every surface and every size.** P1104 measured that a
  non-circular silhouette carries it where a portrait cannot. Do not round agent avatars, and do not
  remove the silhouette treatment to unify card styling.
- **Story content must remain fully readable with no player.** A blocked cross-origin embed fires no
  load event (P1023). Never gate story text, quotes or timecodes on the player having loaded.

## Solution

### 1. The quote block renders once — founder decision A, taken 2026-09-01

`story.content` keeps the `Supporting quotes from {Full Name}` **label** so the publish precondition
in `/slava:disagreement:publish` still passes on the text. The **quotes themselves** live only in
`video_quotes`, rendered by `story-video-quotes.tsx` with working jump links.

Recovers 478–899 characters of a 1,500-character budget — measured on the `ai-power-remedies` run B —
currently spent on a same-page duplicate with worse affordances than the copy beneath it.

Rejected: moving the publish gate to assert the label on the rendered page. Same end state, but it
changes a gate that currently protects the quote label, for no gain the founder asked for.

#### §1 is BLOCKED on the concurrent session — found by adversarial review, 2026-09-01

**The file that puts quotes into `content` is `story-draft.md`, which this spec's Non-Goals forbid
touching.** `story-draft.md:444-449` carries the rule *"Quote budget: at most ONE quote per linked
point inside the story text"* — and it already documents this duplication as a **known defect, filed
for the founder, NOT fixed here.** `publish.md:280`'s row-shape table likewise still specifies
`content = the agent's summary + ONLY that speaker's verbatim quotes + the source link`.

As originally drafted this spec named no file that would implement §1, while forbidding the only one
that could. An implementer following it literally changes nothing and AC-1 fails on the first re-filed
story. **§1 therefore cannot ship until the concurrent session releases `story-draft.md`** — this
spec's other four sections are unaffected and can proceed.

**Two edits §1 requires when unblocked:** remove the quote-budget rule from `story-draft.md:444-449`,
and correct `publish.md:280`'s row-shape table plus the `:529` label-check comment in the same change,
or the next agent reading `publish.md` reproduces the duplication.

#### The gate passes on a story with no quotes at all

`publish.md:529` is a bare `grep -F` for the label string. `publish.md:532` is universally quantified
over `video_quotes.quotes` and is **vacuously true on an empty array**. No item anywhere asserts that
quotes exist when the label does.

An arguer whose every candidate quote is dropped upstream at `/positions` Step 4b — all
`turn-inferred`, or all failing the audio check — but who still has a `video_url` passes every check
and publishes a story reading **"Supporting quotes from Yann LeCun" with nothing beneath it**:
`story-video-quotes.tsx:34` returns `null` on an empty array, so no block renders even on the detail
page. This hole exists today and §1 does not create it, but §1 makes it the visible default rather
than a masked one.

**Add:** a publish checklist item asserting `jsonb_array_length(video_quotes->'quotes') > 0` whenever
the label is present in `content`, and a `story-draft.md` rule to omit the label when zero quotes
survive verification.

### 2. Byline

Drop `[MACHINE] reading of {Full Name}`. The word "machine" is not what readers use, and "reading of"
spends three words on syntax on every card.

**"Agent" is the founder's own word** — `docs/decisions.md` 2026-08-19 records that an agent invented
a founder rejection of it and reasoned from the invention; the 17–19 August transcripts show the
founder using *"mirror agent"*, *"claimed agents"*, *"claim your agent"* throughout.

**The card names two of three parties.** The registry records `subject: Yann LeCun` and
`operator: ClarityPledge`. LeCun did not make this account. The operator currently appears only in
the footer.

[FOUNDER DECISION: exact byline form. Recommended `AGENT · Yann LeCun`, machine marker carried by the
avatar silhouette, operator surfaced adjacent rather than only in the footer. Alternative
`AGENT · on Yann LeCun` if the subject/author relation still reads ambiguously at 320px. Ruled out
already: "summary of" and "summarizing" (contradicts P1202 — a story is connective tissue, not a
summary), "reading of" (the thing being removed), "reporting" (claims an editorial standard we do not
hold).]

Only the name navigates to the profile; the chip is a status marker and is not part of the link
(P1141, unchanged).

#### The chip is RELABELLED, never removed — do not misread this section

**`MachineChip` is a load-bearing disclosure channel and must survive as a bordered pill.** Only its
*text* changes (`Machine` → the approved marker) and only the connective *"reading of"* is deleted.

Why this must be stated explicitly: `src/index.css:248-254` records that on **story surfaces the
drained-chrome class is absent entirely** — the standing signal there is carried by removal (no pledge
ring, no ear count, no Verify) **plus the machine chip**. On the feed story card the chip is therefore
the *only* non-avatar marker present. `e2e/p1104-agent-marker.spec.ts:544-549` asserts it visible as
*"Channel 1"*, and `index.css:250-254` names it in the WCAG 1.4.1 argument as one of three non-colour
channels. Deleting the pill in the course of removing the word would remove the primary disclosure on
the surface with the weakest remaining signal.

The `[FOUNDER DECISION]` above must therefore also state whether the marker stays a **bordered pill**
or becomes plain text — the 1.4.1 argument depends on which.

### 3. Agent position chips stay drained — legibility solved without touching the marker

**This section reverses the change originally drafted here, on evidence found during adversarial
review.** The first draft proposed colouring the agent stance chip, citing `docs/decisions.md`
2026-08-19. That citation was **inverted**. The entry reads: the card-level grey rule *"does not
collide with [real humans whose photo is black and white] at all, because they still have a coloured
stance badge and story pill."* The coloured stance badge is what **humans** have and machines do not
— it is the discriminator that made the card-level rule safe, not permission to colour a machine's.

P1104 states the rule directly (`features/done/2026-06-10/p1104_agents_must_be_visually_distinguishable.md:72`):

> *"Every card belonging to one of these accounts renders with its colour drained — **stance badge**,
> story pill, chrome — with the avatar exempt." Founder decision 2026-08-19. Strongest single signal
> tested: it needs no squinting at 20px and carries unchanged to the profile page.*

Colouring the chip would delete the strongest machine marker from cards publishing readings of four
real people who never consented. The same decisions.md entry warns of exactly this class: *"a
disclosure mechanism can be defeated by its own styling."*

**The founder's underlying complaint is still real and is in scope**: *"it's hard to see that he
agrees."* A drained chip is correctly marked but weakly legible. Fix legibility **within** the
drained treatment — contrast, weight, glyph, or size — never by reintroducing hue. Any candidate must
be measured at 20px, 40px and 320px against the P1104 negative control (a human with a black-and-white
profile photo must still read as a person), per that spec's own method: settle marker questions by
building the specimen at real geometry and measuring, never by argument.

**A later decision settles it beyond the 08-19 reading.** `src/index.css:244-254` (P1141 amendment,
2026-08-24 — five days *after* the entry §3 originally cited) states the current rule: *"DRAIN WHAT
CLAIMS STANDING — the identity/stance cluster… On POINT surfaces the class stays, **where the stance
badge is a real colour target**."* The stance badge is drained deliberately, by a decision newer than
the one the first draft cited as permission.

**And it is enforced on rendered pixels.** `e2e/p1104-agent-marker.spec.ts:199-206` — *"row chrome is
drained of colour — measured on rendered pixels, not declared CSS"* — asserts mean saturation of
`.agent-drained-chrome` (which wraps `PositionBadge` at `point-card-with-links.tsx:302`) is `< 0.05`.
Colouring the chip fails a currently-passing pixel test. That is the correct outcome; the test is
the marker's guarantee, not an obstacle.

The timestamp comparison the founder raised does not transfer: a timecode sits **inside** the story
body, which is not part of the drained chrome, and it is not a per-account status signal — `index.css`
draws exactly that line: *"Never drain content, quotes, or controls."*

### 4. Media renders wherever a story renders

**Rule: media renders on every surface that renders a story; timecodes render only where clicking one
works.** A timecode that cannot seek is noise wearing a number.

Verified surface list, 2026-09-01:

**Six surfaces, not four.** The first draft of this table listed four and was built by grepping the
component name `StoryMedia` — which by construction cannot find a surface that inlines its own
markup. Two more were found during adversarial review by reading data flow instead, and both are
verified below by command (2026-09-01):

| Surface | File | Media | Byline | Chip | Footer | Quotes |
|---|---|---|---|---|---|---|
| Feed story card | `feed-story-card.tsx:140` | ✅ | ✅ | ✅ | — | ❌ |
| Point detail / linked story | `story-card-with-links.tsx:314` | ✅ | ✅ | ✅ | — | ❌ |
| Story detail | `StoryCardDetail.tsx:345` | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Profile** | `profile-page-v2.tsx:1216` (`StoryCardFull`) | ❌ | ✅ | ✅ | — | — |
| **Live / sealed letter** | `live-story-card-expanded.tsx` | ❌ | ❌ | ❌ | ❌ | ❌ |
| **SEO / share meta** | `seo.tsx` via `story-detail-page.tsx` | — | ❌ raw | — | — | — |

**`<StoryVideoQuotes>` has exactly ONE production call site** — `StoryCardDetail.tsx:372`, verified
by `grep -rn "<StoryVideoQuotes" src/` excluding tests, 2026-09-01. An earlier draft of this table
marked the feed and point-detail cards ✅ for quotes; that was inferred, not checked, and is wrong.
`feed-story-card.tsx:142` reads only `normalizeVideoQuotes(...).durationSeconds` — the duration, not
the quotes. **Five of six surfaces render no quote block at all.** They are readable today only
because the quote bodies sit inline in `story.content`.

Video and image are one rule: `StoryMedia` already picks video over image and falls back to the
image path untouched. The profile's private card predates P1141 and was missed.

### 4b. The live / sealed-letter surface carries none of the contract — and §1 breaks it further

`live-story-card-expanded.tsx` is reached from `letter-flow-content.tsx:748`, `story-walk.tsx:282`
and `letter-prediction-walk.tsx:153` — the live reading flow and letters. **This is the surface that
actually gets sent to another person.** Verified by command 2026-09-01:

- **Zero hits** for `videoQuotes|video_quotes|StoryVideoQuotes` in the file — no quote render path at all.
- Line 144 renders `StoryImage`, not `StoryMedia` — video is dropped, same defect class as the profile.
- Line 130 renders `<span className="font-semibold …">{story.authorName}</span>` — the raw stored
  name, with **no `AgentByline`, no `MachineChip`, no `AgentStoryFooter`, no `stripAgentPrefix`.**

**This is the most serious finding in the spec and it changes §1's risk profile.** Today quotes are
readable here only because they sit inline in `story.content`. §1 moves the quote bodies into
`video_quotes` — which this component never reads — so **after §1 ships, every letter through this
component shows the label with nothing under it.** Not only already-sealed letters: forward, too.
`video_quotes` was already dead data on this path; §1 is what makes that gap visible.

The footer copy compounds it: `agent-story-footer.tsx:45` reads *"Nothing here is {fullName}'s own
words except the quotes, which come from the linked…"* — a disclosure sentence that becomes false
on any surface where the quotes are absent.

**§1 MUST NOT ship before this component renders `story-video-quotes.tsx`.** Ordering, not a
follow-up.

Disclosure severity independent of §1: this surface shows a machine-authored reading of a real named
person as a plain bold name with no chip, no footer and no link to `/machines`, in the context where
the reader has the least surrounding signal — no site chrome, no profile to click through.

### 4c. Three more components carry the contract strings

Solution §2 named only `agent-byline.tsx`. Verified by command, the rename also touches:

- `machine-chip.tsx:33` — the chip's visible text is the literal word `Machine`. §2's recommended
  `AGENT · {Name}` requires this string to change; the spec previously discussed only its colour.
- `agent-story-footer.tsx:45` — *"A machine account operated by ClarityPledge wrote this reading of
  {fullName}."* Contains both banned strings.
- `seo.tsx` via `story-detail-page.tsx` — builds `Story by ${story.authorName}` from the raw stored
  name, bypassing `stripAgentPrefix`. Client-rendered, so many crawlers will not execute it; in
  scope for correctness, not urgency.

**No byline string is stored anywhere** — verified: the snapshot mapper copies `videoUrl` and
`videoQuotes` into the sealed blob (`letter-snapshot-mapper.ts:184-185`) but passes `authorName`
through live at render time. So the rename propagates to already-sealed letters automatically and
does **not** collide with the Non-Goal on stored data.

### 5. Point↔story expander parity

The link between a point and its stories renders three different ways:

- Profile point cards: `> 1 story` expander ✅
- Feed point cards: no expander ❌
- Feed story cards: no linked-point expander ❌
- Point detail: expander ✅

Make the expander with counts present on all four, both directions.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The sealed-letter snapshot carries its own copy of story media and has broken twice | MITIGATE | Primary regression surface. A letter sealed before this change must render identically after |
| Removing quotes from `story.content` breaks the publish precondition | MITIGATE | The label string stays in the text; only the quote bodies move. Assert the precondition still passes before merging |
| **§1 deletes quotes from the live/letter surface, forward as well as backward** | MITIGATE | **Blocking order:** `live-story-card-expanded.tsx` must render `story-video-quotes.tsx` BEFORE §1 ships. Verified 2026-09-01: that file has zero `videoQuotes` references |
| The agent disclosure contract is entirely absent on the live/letter surface | MITIGATE | Add byline, chip and footer there; it is the surface actually sent to another person |
| `agent-story-footer.tsx` claims "nothing here is their own words except the quotes" on a surface with no quotes | MITIGATE | Footer copy must be conditional on quotes rendering, or the surface must render them |
| Already-published stories carry duplicated quotes in stored content | ACCEPT | Four test-env stories. Re-file rather than migrate |
| Byline change invalidates P1141's UI Contract and its tests | MITIGATE | **Four** test files, not one: `p1141-pipeline-rules.test.ts`, `p1141-agent-story-chrome.test.tsx` (asserts `machine-chip.textContent === 'Machine'` at :44, footer verbatim at :130,:164), `e2e/p1104-agent-marker.spec.ts` (chip visible as Channel 1, :544-549), `e2e/a11y/p1104-agent-marker-accessibility.spec.ts` (aria-labels). Update all four deliberately, never as drift |
| The new byline form regresses name truncation at 320px | MITIGATE | `agent-byline.tsx:60-73` documents a measured truncation fix for the current layout, caught by two blind reviewers. The replacement form needs the same measurement before it ships |
| Any legibility fix on the drained chip erodes the machine marker | MITIGATE | Hue is forbidden. Measure every candidate at 20px/40px/320px against the P1104 negative control before adopting |
| The drained-card CSS `filter` breaks positioned descendants (P1104 shipped finding) | MITIGATE | Any new element added inside a drained container must be checked for `position: fixed` / portal descendants |
| **§1 cannot be implemented without editing `story-draft.md`, which the concurrent session holds** | DEFER | Unblocked when that session releases the file. §§2–5 proceed independently. Do NOT ship §1 before then |
| The publish gate passes on label-present + zero-quotes | MITIGATE | Add the `jsonb_array_length > 0` assertion; hole pre-exists §1 but §1 makes it visible |
| `publish.md` row-shape table contradicts §1 after the change | MITIGATE | Correct `:280` and the `:529` comment in the same change as the `story-draft.md` edit |

**Non-Goals**
- Do NOT change story prose rules, length ceiling or accuracy tiers — **P1202 owns them**, shipped 2026-09-01.
- Do NOT touch `docs/story-craft.md`. `story-draft.md` is held by a concurrent session and is **required** by §1 — see the blocking note in §1; §§2–5 must not wait on it.
- Do NOT regenerate or redesign agent avatars. Verified 2026-09-01: `portrait: none` is deliberate per founder ruling 2026-08-26; initials-on-slate is the portrait channel for subjects with no rights-cleared photograph, and `/gen-agent-avatar`'s step-0 rights check correctly refused. **UNVERIFIED, stated rather than implied:** the 20px/40px distinguishability measurement behind P1104 was run on portrait-vs-photograph pairs. `provision-agent.md` Step 2b skips the size gate entirely (*"There is nothing to gate at 40px"*), so the initials-on-slate branch all four live agents use has **never been measured** against a real member's initials-on-colour circle. The square-vs-circle argument is content-independent and plausibly generalises; it is an inference, not a measurement.
- Do NOT change the feed or profile default tab order — decided 2026-09-01 to leave unchanged pending a real reader test.
- Do NOT colour agent stance chips, story pills or card chrome. The drained card is the machine marker (P1104:72, founder decision 2026-08-19) and the avatar is the only exempt element.
- Do NOT fix the `story_verifications` RLS gap noted in P1141.

## Acceptance Criteria

- [ ] On a story with quotes, the `Supporting quotes from {Name}` heading and its quotes appear **exactly once** on every surface that renders them
- [ ] No surface renders the label with zero quotes beneath it — publish refuses to file such a story
- [ ] Every timecode shown seeks the player in place; no timecode is displayed where clicking does nothing
- [ ] The byline reads the approved form on all six surfaces, with no occurrence of "MACHINE" or "reading of" in `agent-byline.tsx`, `machine-chip.tsx` or `agent-story-footer.tsx`. The `/machines` explainer page is exempt — its prose defines the term
- [ ] An agent row's position chip is legible as Agree vs Disagree vs Unsure **without hue** — measured at 20px, 40px and 320px
- [ ] `e2e/p1104-agent-marker.spec.ts` still passes unmodified on the drained-chrome saturation assertion
- [ ] The machine marker pill is present on every story surface after the rename — the feed story card has no other non-avatar channel
- [ ] The P1104 negative control still passes: a human with a black-and-white profile photo renders circular, ringed, ear count present, **not** drained
- [ ] Opening an agent's profile shows the story's video, playable, at desktop / 375 / 320
- [ ] A letter containing an agent story renders its video, its quotes, its byline, its machine chip and its footer — verified at desktop / 375 / 320
- [ ] `agent-story-footer`'s "except the quotes" sentence never appears on a surface where no quotes render
- [ ] A point card shows a story-count expander on feed, profile and point detail; a story card shows a linked-point expander on feed and profile
- [ ] A letter sealed before the change renders identically after it

## Done-When

- [ ] Both `p1141-pipeline-rules.test.ts` and `p1141-agent-story-chrome.test.tsx` updated to the new contract, passing
- [ ] A test asserts `live-story-card-expanded.tsx` renders quotes — failing before the fix, passing after
- [ ] The publish precondition asserting the quote label still passes against a re-filed story
- [ ] No surface renders `StoryMedia` conditionally on a code path the profile does not reach

## Open Questions

1. Should the operator (`ClarityPledge`) appear on the card itself or stay in the footer? Founder raised it as *"whose profile is it?"* — unresolved.

## Related

- **P1141** (`features/done/2026-06-10/`) — predecessor. Shipped the video, quotes and byline contract this spec revises. Closed on a red gate.
- **P1202** (`features/done/2026-06-10/`) — owns story prose rules. Not revised here.
- **P1172** — holds P1141's deferred first-run checks; the timecode-accuracy check lands with this work.
- **P1104** — agent visual distinguishability. Avatar rules unchanged.
- `docs/process-learnings.md` — "The story quote block renders twice on the detail page" is discharged by section 1.
