---
status: week
type: story
rank: 1000077
workstream: C2
created_date: '2026-09-07'
tags: [agents, stories, feed, disclosure]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1259: Agent story surfaces leak their own evidence

## Problem

**Situation:** The `ai-power-remedies-d` run filed 4 points, 8 stories and 8 positions to test on
2026-09-07 — four real named people, verified quotes, jumpable timecodes, positions on record. That
artifact is the whole argument for the pipeline existing.

**Complication:** Read on the rendered page, the surfaces around those stories give most of it away.
The timecode — the mechanism that says *don't trust the machine, watch the person say it* — only
seeks a player on one surface out of six; everywhere else it throws the reader to YouTube in a new
tab. A "Show more" control renders and does nothing. Story previews cut at roughly 190 characters
**in the feed** (`line-clamp-6` at `text-sm`, `feed-story-card.tsx:228`) against bodies of 545–858,
so no one has yet read a filed agent story in place. **The profile clamps differently**
(`line-clamp-8` at `text-base`, `profile-page-v2.tsx:1527`), which is why the dead-toggle symptom in
change 6 appears there and the truncation symptom appears in the feed — two clamps, two surfaces,
not one number disagreeing with itself. And a point with two
opposed stories under it gives the reader no indication that the two authors disagree.

**Question:** Which of those surfaces do we fix, and what is the honest minimum disclosure once the
repeated agent footer comes off the story cards?

Founder framing, verbatim, across the 2026-09-07 review and seven annotated screenshots:

> "when I click on a timestamp, we stay on the same page in the same way we do that when we are on
> a story card."

> "missing here to see position directly!" · "we need this in feed too!" · "here we can put the
> positions above each story?"

> "i think we can allow in all app more chars before we cut of maybe 3x more?"

> "this button here does nothing! siwting it moves nothing!"

> "i would remove it from stories and put only below desiption on profile of agents thats it..? or
> maybe hdide under icon? or shortern and hide rest under informaiton icon in agents profiel"

> "descirption for agnets misses clickable social profiel links (of the perosn only)"

## Appetite

**Blast radius: high.** Six surfaces render agent stories and the disclosure change touches every
one of them. Mounting a live player on the feed changes what a scrolling reader downloads.

**Reversibility: medium.** All render-path except one additive migration (a longer bio column plus a
links column). Revertible by git revert; the migration is additive and needs no rollback.

**Decision density: low-to-medium.** The placement calls are made (below). One founder decision
remains open on exact disclosure wording.

## Invariants

- **An agent card's chrome renders with its colour drained; the avatar is exempt.** The new stance
  chip must live inside `.agent-drained-chrome` and therefore render grey. A coloured stance badge
  is precisely the discriminator that marks a card as *human-authored* — `p1104:72`,
  `src/index.css:244-254`, and enforced on rendered pixels by
  `e2e/p1104-agent-marker.spec.ts:199-206` (`meanSaturation < 0.05`). Colouring the agent's stance
  chip to make it legible would delete the strongest disclosure marker on public readings of four
  real people who never consented. See [decisions.md](../docs/decisions.md) 2026-09-01.
- **The byline string `AGENT · on {Full Name}` is settled and is not in scope.** Both `Agent · {Name}`
  and dropping the connective are recorded as tried and rejected — `agent-byline.tsx:65-76`,
  [decisions.md](../docs/decisions.md) 2026-09-04. Do not reopen it while editing these surfaces.
- **A reader must be able to reach, from any surface showing an agent story, the fact that the prose
  is machine-written and the quotes are not.** This spec moves where that lives; it may not remove it.
  **Moving it requires naming the ROUTE, not only the destination** — see the blocking founder
  decision in Solution change 2. Both adversarial reviewers found independently that removing the
  footer from cards, while the byline chip is settled as not-a-link, leaves no clickable path at all
  and makes the one-click criterion unsatisfiable.
- **Any URL rendered as a link from the new `links` field must pass a scheme allowlist
  (`https:` only) applied at render, not only at write.** An unvalidated JSONB list rendered as
  anchors on a public page accepts `javascript:` and `data:` URLs. The field is operator-written
  today, which is not a reason to skip it — the invariant is what keeps it true when it stops being.

## Solution

Six changes, grouped by the leak each closes.

### Leak 1 — the evidence does not work where people meet it

**1. Mount a real player on the surfaces that today render a still.** `StoryMedia` already takes
`mode: 'player' | 'thumbnail'` and `StoryVideoQuotes` already takes an optional `onSeek`. Only
`StoryCardDetail` passes both. Extend to the feed story card, the feed point card, the profile and
the point card; each passes `mode="player"` and wires `onSeek` to seek in place, exactly as the
story detail surface does today. `StoryVideoQuotes`' existing open-in-new-tab fallback stays as the
blocked-player path and needs no change.

**6. Fix the dead "Show more".** The control renders when `strippedContent.length > STORY_THRESHOLD`
(400 chars, `profile-page-v2.tsx:1218`) while the truncation is done by `line-clamp-8`. A ~550-char
story fits inside 8 lines, so the button appears and toggling it changes nothing visible. **Decide
visibility by measured overflow** (`scrollHeight > clientHeight` on the text element, re-measured on
resize), not by a character count. Character thresholds and line clamps never agree and this is the
second surface where they have disagreed.

**5. Raise the preview clamp.** Roughly 3× today's, applied wherever a story body is clamped. Note
this interacts with change 6: once the clamp is generous, most agent stories fit whole and the
toggle correctly stops appearing on its own.

### Leak 2 — the disagreement is invisible in the feed

**4. Show each story author's stance next to their byline, in the feed only.** The profile already
renders `AGENT · on {Full Name} · {stance}` above the point card and **stays exactly as it is**.
In the feed, the chip attaches to the nested *story's* byline, below the point rather than above it.
Founder, on the screenshot: *"like we do in profile but below.. (profile stay same).. talking about
feed only."* The value comes from `point_positions` for that (author, point) pair. Renders drained,
per the invariant.

### Leak 3 — the agent has no identity, and repeats its disclosure until it is furniture

**2. Move the agent footer off story cards.** `AgentStoryFooter` currently renders on all six
surfaces. Remove it from the story surfaces; it lives on the agent profile, below the description.
The `AGENT · on {Full Name}` chip remains on every surface, so authorship is never unmarked.

**3. Give the agent profile a real description plus the subject's own links.** `profiles.bio` is
capped at 160 characters (`20260223_p414_profile_bio.sql`), which is why the four filed bios are one
sentence each. Widen it, and add a links field carrying the **subject's** public profiles only —
Wikipedia, personal site, YouTube, X, Instagram. Founder: *"of the perosn only"* — never
ClarityPledge's own channels, which would read as the operator's links on a page about someone else.

On the profile, below the description: **one short disclosure line, with the full text and the "How
agent accounts work →" link behind an information icon.** This is the founder's third option
(*"shortern and hide rest under informaiton icon"*), chosen over the other two because the bare
one-line version drops the sentence that does the real work (*which parts are machine-written*) and
the full block reproduces on the profile the wall of text being removed from the cards.

[FOUNDER DECISION: the exact one-line disclosure that stays visible on the profile. It has to carry
"machine-written prose, real quotes" in one clause. Current full text, for reference: "An agent
account operated by ClarityPledge wrote this on {Name}. Everything except the quotes is
machine-written; the quotes come from the linked video."]

**The ROUTE is the byline's name — DECIDED by the founder, 2026-09-07, verbatim:**

> "if people are interested, who is this agent? They click and they read it there. I guess that
> makes more sense. Otherwise, we have a lot of redundancy, huge amount of text on every story."

Both adversarial reviewers raised the same objection — remove the footer and the byline chip is
settled as not-a-link, so no clickable path to the disclosure remains. **The objection is answered,
not overruled: the chip is not the link; the NAME beside it is, and it already navigates to the
profile on every surface today.** That is the route, and it is why the profile disclosure has to be
worth landing on.

Two consequences the reviewers' objection makes explicit, and both are requirements:

- **The name must navigate on every surface showing an agent story**, not most of them.
  `AgentByline` renders the name as a `<span>` rather than a button wherever no `onNameClick` is
  passed — deliberately, so a dead control is never rendered. Wherever a story card removes the
  footer, that call site must pass the handler, or that surface has no route.
- **The disclosure must be visible on arrival, not behind the info icon**, for a reader who came
  looking for it. The one-line version is the landing text; the icon expands the rest.

## Alternatives Considered

- **Make the `AGENT` chip itself the disclosure affordance — tap it for the explanation.** Rejected:
  `agent-byline.tsx:37-48` records the chip as deliberately *not* a link, because a status marker
  that navigates invites a click answering no question, and it cost a round to get right. Reopening
  it here would repeat the P1212 failure of editing a component without reading what it documents.
- **Colour the agent stance chip so the disagreement reads at a glance.** Rejected against the
  invariant above — it deletes the human/machine discriminator and fails a passing pixel test.
- **Keep a one-line footer on story cards instead of removing it.** Rejected by the founder: the
  repetition across every card in a feed is the complaint, and one line per card still repeats.
- **Raise the character threshold only, and leave "Show more" alone.** Rejected: it hides the defect
  at current story lengths rather than fixing it, and the two measures still disagree at other lengths.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Live players on a scrolling feed cost bandwidth and main-thread work | MITIGATE | Lazy-mount on scroll into view; keep the thumbnail until then |
| Removing the footer from cards weakens disclosure for a reader who never clicks through | ACCEPT | The `AGENT · on {Name}` chip stays on every surface and states authorship; the founder's reasoning is that repeated text stops being read at all. Revisit if a reader misreads a card as the subject's own |
| `p1212-footer-on-every-surface.test.tsx` will fail by design | MITIGATE | Rewrite the assertion to the new contract — footer on the profile, chip on every surface. Do not delete the test |
| A longer bio invites unverified biographical claims about real people | MITIGATE | Bios are subject to the same source discipline as story prose; two of the four filed bios would have been wrong from memory — a role written in the present tense that the subject had already left, and a company led *until* a date now past. Both caught only by checking a source |
| Player on the point card may collide with the card's own click target | DEFER | Surfaces during implementation; `StoryCardDetail` already solved the sibling case with `stopPropagation` |
| **The `/machines` explainer the moved disclosure links to is UNSHIPPED** — `features/p1142` sits in `features/`, not `features/done/`. This spec removes the footer from six surfaces and concentrates the disclosure on a page whose "How agent accounts work →" link resolves to a holding page | MITIGATE | Verified by path, 2026-09-07. Either P1142 ships first, or the profile disclosure must be self-contained — the full text behind the info icon has to stand alone without the link. Do not ship change 2 relying on that page existing |
| Link rendering is a public-page XSS surface | MITIGATE | `https:`-only scheme allowlist at render, per the invariant. Found by adversarial review, not by the author |
| The page the disclosure links to still says **"machine"** — heading and body, `machines-page.tsx:13,16,17` — while the byline and footer moved to **"agent"** on 2026-09-04 | MITIGATE | Rename the visible copy to "agent accounts"; leave the `/machines` route alone (renaming a live route is a redirect decision, already out of scope). This is the page a reader lands on *specifically* to find out what these accounts are, so the word has to match the one that sent them there — and this spec makes that landing the primary disclosure route, which raises the cost of the mismatch |

**Non-Goals**
- Do NOT change the byline string or the `MachineChip` component.
- Do NOT colour any agent card chrome.
- Do NOT change the profile's existing stance-above-the-point layout — feed only.
- Do NOT touch `point_positions`, the tag trigger, or anything in the publish pipeline.
- Do NOT rename the `/machines` route while changing the link label.

## UX Notes

- **Player, loading:** thumbnail with a play affordance until mounted; no layout shift on mount.
- **Player, blocked (embed disabled):** existing `playerBlocked` path — timecodes fall back to
  open-in-new-tab links, unchanged.
- **Timecode clicked BEFORE the lazy mount completes:** the click must be honoured, not dropped —
  queue the requested seconds and seek once the player is ready. A click that silently does nothing,
  or that plays from 0, reproduces change 6's defect on a different control. A second click while
  pending replaces the queued value rather than queuing twice.
- **Stance chip, missing position:** a story whose author has no `point_positions` row for that
  point renders no chip. Do not render an empty or "unknown" chip. **This is a silent hole in the
  feature's own purpose** — the surface exists to show disagreement and stays quiet exactly where
  the data is missing — so log it rather than swallow it; there is no completeness constraint
  requiring a filed story to carry a position.
- **Show more, story shorter than the clamp:** no control renders at all.
- **Overflow measurement, before layout settles:** a `scrollHeight`/`clientHeight` comparison run
  while the element is hidden, off-screen, virtualized, or before the web font loads returns 0 and
  suppresses the control permanently. Re-measure on font load and on becoming visible, not only on
  resize. The failure mode of getting this wrong is a *missing* control, which is quieter than the
  dead control it replaces.
- **Social links, none set:** the row is absent, not an empty placeholder.

## Acceptance Criteria

- [ ] On the feed, clicking a story's timecode plays the video from that second on the same page,
      without opening a tab
- [ ] Same on the agent profile and on a point card
- [ ] A story shorter than the clamp shows no "Show more"; a story longer than it shows one, and
      clicking it reveals more text
- [ ] In the feed, each agent story under a point shows that author's stance beside their byline
- [ ] The profile's existing stance-above-point layout is unchanged
- [ ] No story card on any surface renders the two-sentence agent footer
- [ ] The agent profile shows the description, the subject's links, one disclosure line, and the
      full disclosure behind an information icon
- [ ] Every agent story on every surface still shows `AGENT · on {Full Name}`
- [ ] A reader can reach "the prose is machine-written, the quotes are not" from any surface showing
      an agent story in one click, by clicking the person's name in the byline
- [ ] On every surface where the footer was removed, the byline name is actually clickable —
      verified per surface, not assumed. A surface rendering the name as plain text has no route
- [ ] Agent card chrome still measures desaturated on rendered pixels — `e2e/p1104-agent-marker.spec.ts`
      passes unchanged, including for the new stance chip

## Done-When

- [ ] Screenshots at 320px, 375px and desktop for feed, profile and point card, each with a player
      mounted and a stance chip rendered
- [ ] `p1212-footer-on-every-surface.test.tsx` rewritten to the new contract and passing
- [ ] Migration applied on test; the four filed agent profiles carry a full description and links

## Open Questions

1. The clamp multiplier is "maybe 3x" — a founder preference stated with a question mark. Once
   change 6 lands, most agent stories fit whole regardless, so the exact number may not matter.
   Pick 3× and confirm on the rendered page.
2. ~~Where do the social links live?~~ **Resolved while filing.** `p966` is ClarityPledge's *own*
   footer/schema links and is unrelated to per-subject links. The repo precedent for a links list on
   a row is `20260828120000_p1179_event_links.sql` — `ADD COLUMN links JSONB NOT NULL DEFAULT
   '[]'::jsonb`. Follow that shape on `profiles`; no new table.

## Related

- `features/done/2026-06-10/p1212_agent_story_card_contract_drift_across_surfaces.md` — built the
  current cross-surface contract this spec amends
- `features/done/2026-06-10/p1141_story_carries_a_video_with_jumpable_quotes.md` — built the player,
  the quote block and the `thumbnail`/`player` split
- `features/p1142_how_agent_accounts_work_page.md` — the `/machines` explainer the footer links to
- `features/p500_feed_card_harmonization.md` — backlog, overlapping feed-card surface
