---
status: in-progress
type: story
disclosure: public
rank: 1000077
workstream: C2
created_date: '2026-09-07'
tags: [agents, stories, feed, disclosure]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

**RESOLVED — founder decision, 2026-09-08.** Three candidates were put; the chosen line is:

> The prose here is machine-written. The quotes are {Name}'s own words, from the linked video.

It leads with what the machine did and names whose words the quotes are, which is the half a reader
is most likely to get wrong. The two rejected forms led with the operator ("An agent account
operated by ClarityPledge: everything it writes about {Name} is machine-written except the quotes")
and with two bare noun phrases ("Machine-written prose, real quotes — an agent account operated by
ClarityPledge"); the operator is already named one line above by the existing `Operated by
{operator}` row, so leading with it repeated rather than added.

The text behind the info icon is the existing footer's, verbatim except "wrote this on {Name}" →
"wrote these stories on {Name}", because on a profile "this" has no antecedent. Nothing else about
that founder-decided 2026-09-04 string is reopened.

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

Evidence below is from the running app on the test DB (w8, localhost:5800), not from reasoning
about the code. Two items are deliberately NOT ticked — see "Open at handover".

- [x] On the feed, clicking a story's timecode plays the video from that second on the same page,
      without opening a tab
      — feed timecodes render as `<button data-seconds>` (not anchors); measured on
      `/p/agent-yann-lecun`, clicking `13:22` (802s) left `location.href` unchanged, the player
      reported `data-player-ready="true"` and scrolled into view, and the screenshot shows that
      player leaving its poster for a live mid-video frame while the second card's player still
      shows its play button.
- [x] Same on the agent profile and on a point card
      — profile: 3 players mounted, 10 timecodes all BUTTON. Feed point card (`QuotedStory`):
      players mounted, all timecodes BUTTON. `getStoriesForPoints` had never selected
      `video_url`/`video_quotes`, so the point card had no video at all until this spec.
- [x] A story shorter than the clamp shows no "Show more"; a story longer than it shows one, and
      clicking it reveals more text
      — at rest: 3 stories of 603/595/870 chars, `scrollHeight === clientHeight`, zero toggles.
      With the text inflated: clientHeight 576 vs scrollHeight 1656, toggle appears, click →
      "Show less" and clientHeight 1656 (clamp off), click again → back to 576 with the control
      still present. The collapse cycle terminates and the control never vanishes.
- [x] In the feed, each agent story under a point shows that author's stance beside their byline
      — 8 chips rendered, all inside `.agent-drained-chrome`; one point carries
      `Connor Leahy — Agrees+` directly above `Yann LeCun — Disagrees+`, which is the leak.
- [x] The profile's existing stance-above-point layout is unchanged — untouched in the diff.
- [ ] No story card on any surface renders the two-sentence agent footer
      — **DEVIATION, founder call needed.** True on all five reader-facing surfaces (feed story
      card, feed point card, profile, story detail, linked story card: 0 footers measured on each).
      NOT true on the sealed-letter card, which keeps it. See "Open at handover" #1.
- [x] The agent profile shows the description, the subject's links, one disclosure line, and the
      full disclosure behind an information icon
      — description, disclosure line and info icon verified on the rendered page. The LINKS ROW is
      now verified against LIVE DATA (2026-09-08): `/p/agent-bernie-sanders` renders 5 chips —
      Wikipedia, Homepage, X, YouTube, Instagram — each read back from the DOM with its resolved
      `href` and platform kind, every one 40px tall. Read through the anon path the browser uses
      (`get_profile_by_slug`), not the service role, so the P877 column grant is proven and not
      assumed. A profile with no links still renders no row.
- [x] Every agent story on every surface still shows `AGENT · on {Full Name}`
      — measured on feed, profile, story detail and point detail; the stored `Agent · ` prefix
      does not leak.
- [x] A reader can reach "the prose is machine-written, the quotes are not" from any surface showing
      an agent story in one click, by clicking the person's name in the byline
- [x] On every surface where the footer was removed, the byline name is actually clickable —
      verified per surface, not assumed. A surface rendering the name as plain text has no route
      — per surface, by command rather than assumption:
      feed story card `BUTTON`; feed point card / `QuotedStory` `BUTTON` (×8); profile story card
      `BUTTON` (×3); story detail `BUTTON`; linked story card `BUTTON`
      (`p1259-disclosure-route-on-every-surface.test.tsx`).
      Point-detail story row: renders a `<span>` DELIBERATELY — the whole row is
      `role="button" aria-label="…'s profile" tabindex="0"`, and clicking the name was measured
      navigating `/point/709b0a25…` → `/p/agent-yann-lecun`. A nested button there would be the
      dead-nested-button defect `agent-byline.tsx` note 2 records.
      The profile HEADER byline is also a `<span>`, correctly: it is the page the route leads to.
- [x] Agent card chrome still measures desaturated on rendered pixels — `e2e/p1104-agent-marker.spec.ts`
      passes unchanged, including for the new stance chip
      — 25 passed, exit 0, with the stance chip live.

### Open at handover

1. **The sealed-letter card still renders the footer, and that is a judgement I made rather than
   one the spec settled.** `letter-snapshot-mapper.ts:228` writes `authorSlug: ''`, so on a sealed
   letter the byline name has nowhere to navigate. Removing the footer there too would satisfy the
   AC literally while breaking this spec's own Invariant — "A reader must be able to reach, from any
   surface showing an agent story, the fact that the prose is machine-written and the quotes are
   not. This spec moves where that lives; it may not remove it" — on the one surface that is
   physically SENT to another person, with no site chrome. I let the Invariant win. Three ways out,
   founder's call: (a) accept the deviation and tick the AC; (b) remove it there too, accepting the
   gap; (c) snapshot the author slug at seal time so that surface gains a route (a change to the
   seal RPC, not to this spec's render work).
2. ~~**No agent profile carries `links` yet, so the row has never been seen with data.**~~
   **CLOSED 2026-09-08, founder-authorised** (*"we can run some agents to find their links and
   insert properly"*). All four filed subjects now carry links on test. The source discipline the
   handover asked for was applied rather than waived: each URL was fetched (200, redirects
   followed) **and** cross-checked against a source independent of the link itself, because the
   fetch alone cannot establish ownership. Two things that check actually caught, which a
   200-only pass would have shipped:

   - **x.com returns 200 for a JS shell, so status alone looked like proof.** A control probe of a
     deliberately nonexistent handle returned **404**, which is what established the status code
     as discriminating at all; ownership was then taken from Wikidata's `P2002` claim (LeCun,
     Sanders), the Wikipedia article's own external link (Leahy) or the subject's personal site
     linking the handle (Bengio). Bengio has no `P2002` claim on Wikidata — his handle rests on
     his own site, which is the stronger source anyway.
   - **The https-only invariant fired on a real link, not a synthetic one.** LeCun's official
     website per Wikidata is `http://yann.lecun.com` — http, and https on that host does not
     answer at all. `normalizeProfileLinks` correctly drops it; his NYU homepage was used instead.
     This is the invariant being load-bearing in production data on its first contact with it.

   Presentation followed in the same pass, per the founder (*"just say something like Twitter and
   the link, or Instagram and link and so on. Maybe with icons."*): each chip shows the platform
   name plus its mark, never the raw URL. Platform detection matches the host **exactly or on a
   dot-anchored suffix** — `profileLinkKind` deliberately does not use `includes`, because an icon
   beside a name is a trust claim and `notx.com.evil.example` must not borrow X's mark. That
   distinction is bound by a test which was watched to FAIL under a substring implementation
   (1 failed / 33 passed), not merely asserted.

## Done-When

- [x] Screenshots at 320px, 375px and desktop for feed, profile and point card, each with a player
      mounted and a stance chip rendered
- [x] `p1212-footer-on-every-surface.test.tsx` rewritten to the new contract and passing
      — `git mv`d to `p1259-disclosure-route-on-every-surface.test.tsx` and inverted: it now
      asserts no footer, the byline still marks authorship, and the name is a real control that
      navigates. Not deleted, per the risk table.
- [x] Migration applied on test; the four filed agent profiles carry a full description and links
      — migration applied and verified on test (`profiles_bio_length_check` now
      `length(bio) <= 2000`, `profiles_links_is_array` present, `links` readable by anon, and
      `get_profile_by_slug` returns it). **Links populated 2026-09-08** for all four filed
      subjects: Yann LeCun 4, Yoshua Bengio 4, Connor Leahy 3, Bernie Sanders 5. Every URL was
      verified live (HTTP 200 following redirects) AND corroborated against a source independent
      of the account itself — Wikidata's own-property claims (P2002/P2003/P2397/P856) or the
      subject's personal site linking the handle — because a 200 from a JS-shell host proves the
      page loads, never that the handle is that person's. LeCun's Wikidata "official website" is
      `http://yann.lecun.com` and is therefore DROPPED by the https-only invariant working as
      designed; his NYU homepage (title read back as "Yann LeCun's Home Page") stands in its
      place. Descriptions: all four carry the bio written at filing time; widening them past one
      sentence is content work not attempted here.

### Independent visual review of the links row (2026-09-08)

A reviewer was given the four screenshots and the visual-QA checklist, and **not** the diff or the
intent, per `.claude/rules/visual-qa.md`. 1 of 1 spawned reported. Its claims were re-run by command
before any of them changed the code — two survived, one did not:

- **UPHELD — the row does not say whose links these are.** The nearest attribution above it is
  "Operated by ClarityPledge", so an unlabelled row of site-chrome chips reads as the OPERATOR's
  links on a page about someone else. That is the founder's *"(of the perosn only)"* constraint
  being satisfied in the data and then lost again at the presentation layer. Fixed: the row now
  carries `{subjectName} on the web`, and the ambiguous label "Homepage" became "Official site" on
  all three profiles that used it. Both are asserted by test.
- **UPHELD, but the cause is app-wide, not this change — dark mode is UNREACHABLE in this app.**
  `tailwind.config.js` sets `darkMode: ["class"]` and **nothing in `src/` ever sets that class**, so
  a `prefers-color-scheme: dark` visitor gets the light palette and every `dark:` class in the 24
  components that carry them is inert. The reviewer correctly refused to certify a "dark" screenshot
  that was not dark. Verified by forcing `documentElement.classList.add('dark')`: the chips resolve
  to `rgb(209,213,219)` on `rgba(31,41,55,.6)` with a `rgb(55,65,81)` border — legible, border
  intact. So the styling is right *if* the app ever turns dark mode on. Not this spec's job; worth
  a separate note.
- **REFUTED — "touch targets are 32-36px, all three viewports".** The reviewer measured off the
  raster and did not account for the 2× DPR on the mobile shots. `getBoundingClientRect().height`
  reads **exactly 40 at 1200px, 375px and 320px**, which is the `min-h-[40px]` doing its job. Not
  changed. This is why an agent's visual measurement is re-run rather than promoted (gate 9).

Its remaining points — that the disclosure is the lightest text on a card whose job is to disclose,
and that the chips out-weigh it — are real design observations about the surrounding card that this
spec's own layout decided deliberately (disclosure line visible on arrival, full text behind the
icon). Recorded, not acted on: changing the disclosure's weight is a founder call, not a QA fix.

## Open Questions

1. ~~The clamp multiplier is "maybe 3x"~~ **Resolved by building it.** 3× applied everywhere a
   story body is cut (`line-clamp-6`→`[18]` feed, `8`→`[24]` profile, `5`→`[15]` compact detail,
   `4`→`[12]` linked preview, 200→600 QuotedStory, 280→840 story-card-with-links ×2). Confirmed on
   the rendered page: filed agent stories of 603/595/870 chars now render whole, and no "Show more"
   appears because none of them overflows — which is the prediction change 6 made.

   **The number was never the real defect.** `line-clamp-8` is not a class Tailwind 3.4 generates
   (its default `lineClamp` scale is 1-6 and this repo does not extend it), so the profile's story
   text was NOT CLAMPED AT ALL — that, not a threshold mismatch, is why its "Show more" could not
   move anything. Measured with the Tailwind CLI, `line-clamp-6` generated and `line-clamp-8`
   absent, with `line-clamp-[18]`/`[24]` generated. Every clamp above 6 now uses the arbitrary form,
   and `p1259-clamp-classes-compile.test.ts` fails on any bare `line-clamp-N` outside the generated
   scale (proven to fail: exit 1 on a staged offender, exit 0 once removed).
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
