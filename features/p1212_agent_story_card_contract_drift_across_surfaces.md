---
status: in-progress
type: story
rank: 1000062
workstream: C2
created_date: '2026-09-01'
tags: [stories, agents, feed, profile]
delivery_stage: dev
flow: dev
pipeline_plan: [create-spec, generate-tests, dev, verify]
pipeline_ran: [create-spec, dev, verify]
pipeline_skipped: ["decompose -- 5 sections but they collide on the same three files (agent-byline/machine-chip/agent-story-footer); children would conflict, not parallelise", "ux -- byline form and pill question both answered 2026-09-01, no open design question left to write as a sentence", "spec-review -- spec is same-day, not stale", "architect -- no schema, RLS or data-model change; render-path and string changes only"]
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
(`20260325120000_p586_visibility_privacy_foundation.sql:198-202`, policy *"Stories readable by
visibility"*; the first draft cited `:236`, which is the `story_points` policy — same predicate,
wrong policy) — **no environment term** — and this
pipeline always writes `visibility = 'public'`. `publish.md:42` records that narrowing a gate to
prod-only on environmental grounds was attempted and **REVERTED** on 2026-08-31: *"'Test' is not
private, and that is the whole answer."* The duplicated quotes, the missing disclosure on the letter
surface and the wrong byline are live on named readings of four real people right now.

**Decision density: one open founder call** (byline form, below). The quote-duplication call was
settled by the founder 2026-09-01 — **option A**.

## Invariants

- **A story's TEXT must not NAME the arguer's position on any point** (P1202). Restated because this
  spec edits the surfaces that display both.
  **Corrected 2026-09-01 after adversarial review — the first draft restated this invariant in its
  SUPERSEDED form** (*"state, name or imply"*). `features/done/2026-06-10/p1202_…md:74-76` records
  the founder decision of **2026-08-31: "imply" is DROPPED; the rule is 'must not NAME', tested by
  the staleness question"* — because enforcing "imply" literally failed 3 of 4 stories and passed the
  one with the weakest-grounded positions. **The invariant governs story PROSE only. The position
  itself lives in the `point_positions` link and is MEANT to render** — `PositionBadge` beside the
  byline is where P1202 puts it, and §3 of this spec exists to make that badge *more* legible, not
  less. A reviewer reading the superseded wording concluded the §5 expander must suppress agent
  position badges; that conclusion is wrong and the wording is what produced it.
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

#### §1 was blocked on a concurrent session — UNBLOCKED, verified 2026-09-01

**The file that puts quotes into `content` is `story-draft.md`, which this spec's Non-Goals forbid
touching.** `story-draft.md:444-449` carries the rule *"Quote budget: at most ONE quote per linked
point inside the story text"* — and it already documents this duplication as a **known defect, filed
for the founder, NOT fixed here.** `publish.md:280`'s row-shape table likewise still specifies
`content = the agent's summary + ONLY that speaker's verbatim quotes + the source link`.

As originally drafted this spec named no file that would implement §1, while forbidding the only one
that could. An implementer following it literally changes nothing and AC-1 fails on the first re-filed
story. **Re-verified 2026-09-01 before implementation** (`git worktree list`; `git status --short --
.claude/commands/slava/disagreement/story-draft.md`): the file has **no uncommitted edits on main**,
and the only other worktree (`w1`) is on `feature/p1207-adversarial-permission-audit`, whose 20-file
diff does not touch it. **The blocker is discharged — §1 may proceed.** Re-run those two commands at
implementation time; this is exactly the class of fact that expires (`.claude/rules/git.md`,
"Volatile state decays").

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

#### Both halves of the recommendation below were already tried and rejected IN CODE — found 2026-09-01

**This is the §3 failure repeated in §2 and it was not caught the first time.** §3 was corrected
because its citation was inverted. §2's recommendation was never checked against the component it
edits. `agent-byline.tsx` records two rejections, and the recommendation below is both of them at once:

> *"4. NOT `Agent · {Name}`. "Agent" reads in English as **representative of**, which is the one
> implication an account bearing a real person's name must never carry."* — `agent-byline.tsx:65-67`

> *"And `reading of` is not trimmable, at any size. Dropped, the marker lands on the PERSON —
> `[Machine] Daniel Bar-Tal` reads as *Daniel Bar-Tal, who is a machine* rather than as an account
> that reads him. That misread is worst on the profile header, the one surface whose whole job is
> identity and the one most likely to be mistaken for the subject's own account."*
> — `agent-byline.tsx:71-76`

Neither rejection was surfaced in the evidence block below. **This does not settle the founder call
— "machine" genuinely is not a word readers use, and that complaint stands.** It changes what the
call is *between*: not "is `AGENT · Name` good?" but "does the founder overrule two recorded design
findings, and if so which replacement survives the *representative-of* and *marker-lands-on-the-person*
misreads?" `AGENT · on Yann LeCun` — already listed below as the 320px alternative — is the only
candidate in this spec that survives both, because the preposition restores the account→subject
relation that `·` deletes.

Whatever form is chosen must be measured, not argued: `agent-byline.tsx:60-73` documents a truncation
fix at 320px measured to the pixel (chip right=308 vs card right=289).

[FOUNDER DECISION: exact byline form — **STILL OPEN**. Delegated to the agent 2026-09-01
(*"lets implement as you think it should"*), the agent took `AGENT · {Full Name}`, and the
delegation was **returned the same turn**: the section immediately above shows that form is *both*
recorded rejections in `agent-byline.tsx` at once, verified by reading `:65-76` directly. Taking a
delegated call is not licence to take a **falsified** one.

What is actually being decided, restated: does the founder overrule two recorded design findings —
"Agent" reading as *representative of*, and a dropped connective landing the marker on the PERSON —
and if so, which replacement survives both misreads? `AGENT · on Yann LeCun` is the only candidate
named in this spec that survives both, because the preposition restores the account→subject relation
that a bare `·` deletes; it has not been measured at 320px.

Two sub-questions, **decidable now and not blocking the above**:
- **The marker stays a bordered pill**, not plain text — `index.css:250-254` counts the pill as one
  of three non-colour WCAG 1.4.1 channels, and on the feed story card it is the *only* non-avatar
  channel present. Renaming a channel must not delete it. (Agent recommendation; reversible.)
- **The operator (`ClarityPledge`) stays in the footer** — Open Question 1. A third party on the card
  line is what `agent-byline.tsx:60-73`'s measured 320px truncation fix exists to warn about.
  (Agent recommendation; reversible.)

Ruled out already: "summary of" / "summarizing" (contradicts P1202), "reading of" (the thing being
removed), "reporting" (claims an editorial standard we do not hold).]

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

**Recommended above and not contested: bordered pill, unchanged.** Whatever token replaces `Machine`
at `machine-chip.tsx:33`, every border, padding and aria treatment stays exactly as shipped. The
*token* is blocked on the founder call; the *pill* is not.

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

#### The ordering constraint above is NOT SUFFICIENT — second adversarial review, 2026-09-01

**This spec contradicts itself.** §4 already establishes that **five of six surfaces render no quote
block at all** and are readable today *only* because the quote bodies sit inline in `story.content`.
The blocking order then protects **one** of those five. The other four break the moment §1 ships:

| Surface | Renders `content` (and so the label) | Renders `video_quotes` | After §1 |
|---|---|---|---|
| Feed story card | `feed-story-card.tsx:140` | ❌ — reads only `.durationSeconds` at `:142` | label, no quotes |
| Point detail / linked story | `story-card-with-links.tsx:314` | ❌ | label, no quotes |
| Profile (`StoryCardFull`) | `profile-page-v2.tsx:1216` | ❌ | label, no quotes |
| Live / sealed letter | `live-story-card-expanded.tsx` | ❌ (already blocked above) | label, no quotes |
| Story detail | `StoryCardDetail.tsx:345` | ✅ `:372` — the ONLY call site | correct |

**Corrected blocking precondition:** §1 ships only after **every surface that renders `story.content`
either renders `video_quotes` or suppresses the label.** Naming one component was an under-scope, and
the evidence for that was already inside §4 of this spec before the sentence was written.

Disclosure severity independent of §1: this surface shows a machine-authored reading of a real named
person as a plain bold name with no chip, no footer and no link to `/machines`, in the context where
the reader has the least surrounding signal — no site chrome, no profile to click through.

#### The §4b fix RESURRECTS the duplication on every letter sealed before §1 — found 2026-09-01

The seal RPC freezes **both halves**. `20260823120100_p1141_seal_rpc_video_fields.sql:102,105` writes
`'storyText', COALESCE(sv.content, '')` **and** `'videoQuotes', COALESCE(s.video_quotes, …)` into
`point_config`; the mapper restores both independently (`letter-snapshot-mapper.ts:182,185`).

So a letter sealed **today** carries the quote bodies twice: inline inside frozen `storyText`, and
again in frozen `videoQuotes`. The moment `live-story-card-expanded.tsx` renders
`story-video-quotes.tsx` — the fix §4b requires — **every pre-§1 sealed letter shows its quotes
twice**, which is the precise defect §1 exists to delete. Snapshots are immutable, so re-filing the
story does not repair an already-sealed letter, and old and new letters diverge permanently.

This falsifies the Acceptance Criterion *"a letter sealed before the change renders identically after
it"* — §4b **guarantees** it will not, by design. That AC is replaced below.

**Smallest fix:** the letter surface renders the `video_quotes` block only when the frozen `storyText`
does not already contain the quote bodies — test the first quote's text against `storyText` at render
— **or** the seal RPC writes a `quotesInContent: false` marker from the §1 cutover onward and the
renderer branches on it. Decide which before §4b is implemented; both are testable against a snapshot
fixture without sealing a real letter.

#### The snapshot stores NO story-author identity — latent, not reachable today

Verified: the seal RPC's `point_config` carries `storyText`, `imageUrl`, `videoUrl`, `videoQuotes`
and per-point data — and **no story author id, name or agent flag**
(`20260823120100_p1141_seal_rpc_video_fields.sql:101-138`). The byline is therefore *derived*, and it
is derived to the **letter sender**: `letter-flow-content.tsx:398-403` passes `senderName` into the
mapper, and `story-walk.tsx:95-96` states the assumption in a comment — *"Author of the story = sender
(sender wrote the stories)."*

If an agent story could enter another person's letter, the recipient would see machine-authored prose
bylined with a **human's** name — false attribution on the highest-risk surface. **It cannot today:**
`20260326100454_p551_clarity_docs.sql:92-105` restricts `doc_stories` INSERT to
`stories.author_id = auth.uid()`, so a sender can only attach their own stories.

Two things follow. RLS is the *only* barrier — a service-role write (which the disagreement pipeline
uses) bypasses it entirely. And adding `AgentByline` to this surface per §4b **must not** derive
agent-ness from the mapped `authorName`, because that name is the sender's: it needs the story's own
author identity, which the snapshot does not carry. **§4b's byline work therefore has a schema
dependency the spec did not name.** Scope decision for the founder: add author id + agent flag to the
snapshot contract now, or restrict §4b on this surface to quotes + media and file the byline
separately.

### 4c. Three more components carry the contract strings

Solution §2 named only `agent-byline.tsx`. Verified by command, the rename also touches:

- `machine-chip.tsx:33` — the chip's visible text is the literal word `Machine`. §2's recommended
  `AGENT · {Name}` requires this string to change; the spec previously discussed only its colour.
- `agent-story-footer.tsx:45` — *"A machine account operated by ClarityPledge wrote this reading of
  {fullName}."* Contains both banned strings.
- `seo.tsx` via `story-detail-page.tsx` — builds `Story by ${story.authorName}` from the raw stored
  name, bypassing `stripAgentPrefix`. Client-rendered, so many crawlers will not execute it; in
  scope for correctness, not urgency.

~~**No byline string is stored anywhere**~~ — **FALSE, corrected 2026-09-01 after adversarial
review.** The narrow claim is right (the snapshot mapper copies `videoUrl` and `videoQuotes` into the
sealed blob at `letter-snapshot-mapper.ts:184-185` but takes `authorName` from its caller at `:142`,
`:193`). The general sentence is wrong, and it is wrong about the thing §2 changes:

**`Agent · ` IS a stored byline marker, enforced by the database.** `profiles.name` holds
`Agent · {Subject}`; `20260819120000_p1104_agent_accounts.sql:206-209` **reserves that prefix** at
`upsert_my_profile` (*"display name may not use the reserved 'Agent ·' marker prefix"*), and
`20260819140000_p1104_harden_agent_prefix_guard.sql` hardens the reservation against ZWSP and
Cyrillic-homoglyph bypass. `stripAgentPrefix` removes it **at render**, deliberately, so it never
becomes the visible byline — `agent-byline.tsx:66-69`: *"The STORED name keeps its `Agent ·` marker —
the database enforces it, and it is what reaches off-platform surfaces and aria-labels, which is why
`stripAgentPrefix` is applied here at render rather than at the source."*

Three consequences §2 must address:

1. Six a11y assertions depend on the STORED form reaching aria-labels
   (`e2e/a11y/p1104-agent-marker-accessibility.spec.ts:92,109,121,130,141,157` — each
   `.toContain('Agent ·')`). §2 changes visible text only, so these should pass unchanged; the Risk
   table's claim that this file needs updating **over-states** the work.
2. Any surface that forgets `stripAgentPrefix` leaks the raw stored marker — which is exactly the
   defect §4d below documents as still live.
3. The stored marker is a **reserved namespace an impersonator cannot claim**. Making it the visible
   byline collapses a distinction the DB spends two migrations enforcing.

### 4d. A SEVENTH surface — the nested linked-story card. Found 2026-09-01, second review

§4 claimed six surfaces and claimed the census was built by reading data flow rather than by grepping
a component name. **The census is still incomplete.** `LinkedStoryCard`
(`StoryCardDetail.tsx:826-866`) is a private compact card rendered inside a `QuotedPoint`'s
linked-stories expander (`StoryCardDetail.tsx:745-751`), publicly reachable by expanding a point
beneath any story. It is the surface **§5 is about to make more reachable**, on three more pages.

What it has: `agent-card-drained`, `data-agent-row="true"`, the square agent silhouette, and
`EarBadge` correctly suppressed (`:846-860`). So it is **not undisclosed** — it carries the P1104
channels.

What it lacks, verified by reading the component:

- **`:861` renders raw `{story.authorName}`** — no `stripAgentPrefix`, no `AgentByline`. This leaks
  the stored `Agent · {Name}`, which is the exact defect `agent-byline.tsx:39-41` records as fixed on
  every other surface: *"the feed said `Machine reading of X` while the profile header and every
  stance row said `Agent · X`, the raw stored name. Same account, two identities, decided by which
  file a reader happened to be looking at."* One file was missed.
- No `MachineChip`, no `AgentStoryFooter`, no media, no quotes.

**§2's rename does not reach this file** — it renders no byline component at all — so shipping §2
alone *widens* the two-identities drift rather than closing it.

**Searched and cleared** (stated so the next reviewer does not re-derive them):

- `live-content-cards.tsx` — `LiveStoryCard` / `ContentPicker` / `StoryCardPreview` /
  `SelectedContentDisplay` render `story.content` + `authorName` + `StoryImage` with no agent
  handling, but have **zero importers** outside the file (only `PointCardPreview` is imported, by
  `live-mode-view.tsx:41`). Dead code — a latent surface, not a live one. Wiring any of it back
  reintroduces the gap.
- `letter-position-story-dialog.tsx:160-190` — renders raw `authorName`, `story.content` and a
  **round** `GravatarAvatar` with no agent handling, reached live from `story-walk.tsx:199` and
  `letter-flow-content.tsx:1130`. Not agent-reachable today: `getLetterPositionStories(deliveryId,
  userId, senderId)` scopes it to the letter's sender and receiver. Latent, same class.

### 5. Point↔story expander parity

The link between a point and its stories renders three different ways:

- Profile point cards: `> 1 story` expander ✅
- Feed point cards: no expander ❌
- Feed story cards: no linked-point expander ❌
- Point detail: expander ✅

Make the expander with counts present on all four, both directions.

#### Built 2026-09-03 — and the table above was stale in one row

Verified against the code before building: the **profile story card already had** the
reverse-direction expander (`profile-page-v2.tsx:1555-1563`, `pointsExpanded`). The real
gaps were exactly two, both on the feed. Point detail and the profile point card were
already correct.

The feed point card renders the **same `QuotedStory`** the profile point card renders,
rather than its own excerpt — a second excerpt renderer would be a ninth surface with its
own label handling, agent treatment and truncation rule, which is the drift this spec
exists to close, reintroduced by the section meant to close it.

**Two defects found in `QuotedStory` while wiring it, both browser-verified:**

1. It rendered story text through `stripHashtags` alone, so the profile point card's story
   expander printed the quote label with no block beneath it — **§1's defect on an EIGHTH
   surface.** The census in `p1212-quote-label-parity.test.tsx` missed it because the
   census lists files and this component is module-private to a *point*-card file.
2. It rendered the **stored** author name, leaking the reserved `Agent · ` prefix (measured
   4× on the feed) — **§4d's defect in the component §4d did not reach.** The risk table's
   *"§5 makes this card MORE reachable, so §5 must not ship before §4d"* binds here: §5 is
   what puts this component on the feed.

Both are pinned by **render** tests, not census rows. A census row was tried first and was
decorative — reverting the fix left the suite green, because the `suppresses label` grep
matched the surviving *import* rather than its use. That is §1's own failure mode one layer
up, and it is why §5's tests render components instead of grepping them.

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
| §1 requires editing `story-draft.md`, previously held by a concurrent session | RESOLVED | Verified free 2026-09-01 (no uncommitted edits; `w1` is on p1207 and does not touch it). Re-check at implementation time |
| The publish gate passes on label-present + zero-quotes | MITIGATE | Add the `jsonb_array_length > 0` assertion; hole pre-exists §1 but §1 makes it visible |
| **§1's blocking order named ONE surface while §4 documents FIVE that render no quotes** | MITIGATE | **Corrected §4b.** Feed, point-linked story and profile each render `content` (and so the label) and never `video_quotes`. §1 ships only when every `content`-rendering surface renders quotes or suppresses the label |
| **§4b's fix makes pre-§1 sealed letters render quotes TWICE** | MITIGATE | Seal RPC freezes `storyText` AND `videoQuotes` (`…p1141_seal_rpc_video_fields.sql:102,105`). Legacy branch required before §4b ships; snapshots are immutable so re-filing cannot repair one |
| **The letter snapshot stores no story-author identity — the byline is derived to the SENDER** | ACCEPT (latent) | Not reachable today: `doc_stories` INSERT requires `stories.author_id = auth.uid()` (`p551_clarity_docs.sql:92-105`). But §4b cannot add `AgentByline` there from the mapped name, and service-role writes bypass the RLS that closes it |
| **`LinkedStoryCard` leaks the raw stored `Agent · ` name and §2 does not reach it** | MITIGATE | `StoryCardDetail.tsx:861` renders `{story.authorName}` with no `stripAgentPrefix`. §5 makes this card MORE reachable, so §5 must not ship before §4d |
| **§2 recommends a byline form rejected in-code, twice** | MITIGATE | `agent-byline.tsx:65-67` rejects `Agent · {Name}`; `:71-76` rejects dropping "reading of". Founder decision must be taken against those findings, not around them |
| The first draft restated P1202's invariant in its superseded form | MITIGATE | Fixed in Invariants. "imply" was dropped by founder decision 2026-08-31; a reviewer following the old wording concluded §5 must delete agent position badges — the opposite of §3 |
| `publish.md` row-shape table contradicts §1 after the change | MITIGATE | Correct `:280` and the `:529` comment in the same change as the `story-draft.md` edit |

**Non-Goals**
- Do NOT change story prose rules, length ceiling or accuracy tiers — **P1202 owns them**, shipped 2026-09-01.
- Do NOT touch `docs/story-craft.md`. `story-draft.md` **is in scope** and is required by §1 — the concurrent-session hold was verified discharged 2026-09-01 (see §1). `publish.md` is in scope for the same reason.
- Do NOT regenerate or redesign agent avatars. Verified 2026-09-01: `portrait: none` is deliberate per founder ruling 2026-08-26; initials-on-slate is the portrait channel for subjects with no rights-cleared photograph, and `/gen-agent-avatar`'s step-0 rights check correctly refused. **UNVERIFIED, stated rather than implied:** the 20px/40px distinguishability measurement behind P1104 was run on portrait-vs-photograph pairs. `provision-agent.md` Step 2b skips the size gate entirely (*"There is nothing to gate at 40px"*), so the initials-on-slate branch all four live agents use has **never been measured** against a real member's initials-on-colour circle. The square-vs-circle argument is content-independent and plausibly generalises; it is an inference, not a measurement.
- Do NOT change the feed or profile default tab order — decided 2026-09-01 to leave unchanged pending a real reader test.
- Do NOT colour agent stance chips, story pills or card chrome. The drained card is the machine marker (P1104:72, founder decision 2026-08-19) and the avatar is the only exempt element.
- Do NOT fix the `story_verifications` RLS gap noted in P1141.

## Acceptance Criteria

- [x] On a story with quotes, the `Supporting quotes from {Name}` heading and its quotes appear **exactly once** on **every surface that renders the heading** — not "every surface that renders them", which the first draft used and which a surface rendering zero quotes satisfies vacuously
- [x] No surface renders the label with zero quotes beneath it — publish refuses to file such a story *(the checklist item is `publish.md:557`, asserting `jsonb_array_length(video_quotes->'quotes') > 0` from the read-back whenever `content` holds the label)*
- [x] ~~Every timecode shown seeks the player in place~~; **no timecode is displayed where clicking does nothing** — **AC AMENDED 2026-09-04, flagged for the founder.** The first clause assumed every surface has a player. Only `StoryCardDetail` mounts one (`:383` passes `onSeek`, seeking in place); the five card surfaces render a thumbnail, so their timecodes are links opening the source **at that second** — which is what §4's own rule ("timecodes only where clicking works") asks. The substantive guarantee — no dead timecode anywhere — holds on all six and is what is ticked. Measured live at 320/375/desktop: 5 timecodes, all ≥40px touch targets, all with a `?t=<seconds>` href
- [x] The byline reads the approved form on all **seven** surfaces (the six in §4 plus `LinkedStoryCard`, §4d), with no occurrence of "MACHINE" or "reading of" in `agent-byline.tsx`, `machine-chip.tsx` or `agent-story-footer.tsx`. The `/machines` explainer page is exempt — its prose defines the term. *(Unblocked 2026-09-04 by the founder's footer ruling: the footer now reads "An agent account operated by ClarityPledge wrote this on {Name}". "machine-written" survives in its second sentence by the same decision — it describes how the words were produced and is not the account's noun. Rendered live and asserted verbatim in `p1141-agent-story-chrome.test.tsx`.)*
- [x] `LinkedStoryCard` renders the agent name through `AgentByline`/`stripAgentPrefix`, not raw `story.authorName` — no surface leaks the stored `Agent · ` prefix (§4d)
- [x] A repo-wide check passes: no component renders `story.authorName` for an agent account without going through `stripAgentPrefix` or `AgentByline` *(grepped 2026-09-04: every raw-name render site is inside an `isAgent ? <AgentByline/> : name` branch. **One unguarded site found and left as-is with the reason recorded** — `story-walk.tsx:202` renders `View {authorName}'s story →`, but `getLetterPositionStories(delivery, user, sender)` scopes that map to the receiver and the sender, and neither can be an agent account. Safe by scope, not by guard — flagged here so a future change to that scoping is not silent.)*
- [x] An agent row's position chip is legible as Agree vs Disagree vs Unsure **without hue** — measured at 20px, 40px and 320px *(unchanged by this spec: `machine-chip.tsx` keeps its bordered-pill treatment, only its token changed `Machine`→`Agent`. Asserted at `p1141-agent-story-chrome.test.tsx:100-101` and by `e2e/p1104-agent-marker.spec.ts`, which passes unmodified on the saturation assertion.)*
- [x] `e2e/p1104-agent-marker.spec.ts` still passes unmodified on the drained-chrome saturation assertion *(33 passed 2026-09-04. The file's only diff on this branch is two COMMENTS restating the new byline wording — `git diff main...HEAD` shows the `meanSaturation` helper and every assertion byte-identical.)*
- [x] The machine marker pill is present on every story surface after the rename — the feed story card has no other non-avatar channel *(the chip ships inside `AgentByline`, so it reaches every surface the byline does; verified live at 320/375/desktop and in the surface census)*
- [x] The P1104 negative control still passes: a human with a black-and-white profile photo renders circular, ringed, ear count present, **not** drained *(inside the 33 passing marker tests; plus a new negative control asserting a human story never carries the agent footer)*
- [x] Opening an agent's profile shows the story's video, playable, at desktop / 375 / 320 *(measured live on `/p/agent-yann-lecun` 2026-09-04 — thumbnail present at all three, zero horizontal overflow, zero elements past the viewport; at 320 the chip's right edge is 206 against a card right edge of 304, so no truncation)*
- [x] A letter containing an agent story renders its video, its quotes, its byline, its machine chip and its footer — **VERIFIED BY RENDER TEST, NOT IN A BROWSER. Stated plainly rather than ticked as if measured.** `p1212-quote-label-parity.test.tsx` renders `LiveStoryCardExpanded` on real sealed-snapshot fixtures and asserts all five elements, including the legacy branch that must NOT double-render quotes. The three narrow-viewport measurements were taken on the profile surface, which composes the same `StoryMedia`, `StoryVideoQuotes`, `AgentByline` and `AgentStoryFooter`. Reaching a sealed letter in a browser needs an authenticated receiver on a real delivery; **not done, and the founder should treat this line as render-verified only**
- [x] `agent-story-footer`'s "except the quotes" sentence never appears on a surface where no quotes render *(`hasQuotes` is computed from `normalizeVideoQuotes(...).quotes.length > 0` at all five call sites; on false the component renders "Nothing here is {Name}'s own words." instead)*
- [x] A point card shows a story-count expander on feed, profile and point detail; a story card shows a linked-point expander on feed and profile (§5, 2026-09-03 — the two feed surfaces were the gap; profile and point detail already had it, and the profile story card already had the reverse direction)
- [x] ~~A letter sealed before the change renders identically after it~~ — **falsified by §4b, replaced 2026-09-01.** §4b deliberately adds video, quotes, byline, chip and footer to that surface, so identical rendering is not the goal and never was achievable. Replaced by the two below
- [x] A letter sealed **before** §1 renders its quotes **exactly once** — the frozen inline copy in `storyText` and the frozen `videoQuotes` copy must not both render (§4b legacy branch)
- [x] No letter loses content it rendered before the change: every quote, timecode and image visible in a pre-change sealed letter is still visible after
- [x] No surface derives an agent byline from a name the snapshot does not own — the letter surface's `authorName` is the **sender's** (§4b, `story-walk.tsx:95-96`)

## What shipped, and the three things that did not (2026-09-04)

**§2's rename is complete in both halves.** The `agent-` predicate shipped 2026-09-04 and, for
several hours, **nothing called it** — the profiles guard trigger, `upsert_my_profile` and
`create_or_reuse_agent_account` all still named `is_reserved_machine_slug`. A predicate with no
call site is a spec section whose mechanism is absent from the code, which is the failure
`docs/process-learnings.md` records going unnoticed for five months. `20260904170000` is the call
sites; `20260904190000` makes the rename's collision guard raise instead of skipping silently.

**Two adversarial reviews (Opus × 2) over the whole branch diff produced 12 findings; 10 were
acted on, 1 documented, 1 rejected on evidence.** Both reviewers reported in full. The two that
mattered most were live defects a fully green suite was certifying:

- The preview path sealed `storyAuthorId` **without** `storyAuthorName`, so a sender previewing a
  letter saw agent chrome picked from the id and their **own** name printed beside it. The two
  tests written to cover exactly this both hand-built their `point_config` — they exercised the
  reader and never the builder. This is the third time in this spec that an assertion sat one
  layer away from the change.
- Two slug-guard bypasses, both also live on the shipped `machine-` guard: `ᴀgent-<name>`
  (U+1D00 — the fold table carried the small-capital G, E, N and T and missed A) and
  `-agent-<name>` (a leading separator makes `regexp_split_to_array` emit an empty first token).
  Closed by `20260904180000` on both guards, with `-agentic-systems` and `-my-agent` asserted as
  controls so the fix cannot widen into a land-grab.

**THREE THINGS ARE OPEN, and none of them is an oversight to be quietly closed later.**

1. **[FOUNDER DECISION: the footer's wording — OPEN.]** `agent-story-footer.tsx` still reads
   *"A machine account operated by ClarityPledge wrote this reading of {fullName}."* After §2,
   **"machine" appears there and nowhere else a reader sees.** This is a disclosure sentence, not
   a byline, so the §2 decision does not automatically reach it.

2. **[FOUNDER DECISION: footer coverage — OPEN, and entangled with 1.]** `AgentStoryFooter`
   renders on **2 of 6** story surfaces (`StoryCardDetail`, `live-story-card-expanded`). The feed,
   the profile card and the linked-story card carry the byline and chip but no footer — so a feed
   reader now sees `AGENT · on Yann LeCun`, a video thumbnail and verbatim quotes attributed to a
   real living person, with no operator disclosure on the surface. Pre-existing and untouched by
   this branch. Deliberately **not** fixed here: propagating the footer would put the word
   "machine" on three more surfaces while decision 1 is open. Mitigating fact, verified: all three
   cards navigate to the story detail page, which does carry the footer — the disclosure is one
   click away, not absent.

3. **[FOUNDER DECISION: `profileSubjectPosition` on the feed — OPEN.]** The feed's query
   deliberately does not supply it, so `QuotedPointCard`'s whole author header — including the
   byline and its chip — renders on the profile and not on the feed. **The two surfaces share the
   component and do not render identically.** "Rendered through `QuotedPointCard`" is what the
   parity test asserts and all it asserts; the call site now says so in as many words rather than
   reading as achieved parity.

**Filed separately, not fixed here:** the tilde gap. `machine~sam-harris` and `agent~x` are
mintable today — the combining-mark strip keeps `[:alnum:] [:space:] [:punct:]` and Unicode
classes `~` as Sm, a math symbol, so it is stripped rather than treated as a separator. Same for
`+ < = > | $ ^` and backtick. Live since `20260824140000`.
`e2e/integration/p1212-agent-slug-reservation.spec.ts` asserts the **current wrong behaviour** so
the day it is fixed the test fails loudly instead of passing silently. A character-class security
fix should not ride an unrelated namespace rename.

## Implementation — the two A/B arms, merged (2026-09-04)

This spec was built **twice**, as the arms of a `/dev` A/B benchmark from one base commit.
**The benchmark is void** — see `docs/decisions.md` 2026-09-03: its oracle, this spec's seven
Done-When canaries, were `it.skip` and had never executed, and were satisfiable by prose once
un-skipped. Neither arm can be scored. Both arms' work is kept; nothing was discarded on the
strength of a measurement that did not happen.

**The arms were complementary, not duplicate** — each silently built a different subset of this
spec and neither announced the gap:

| | arm A (`feature/p1212-…`) | arm B (`bench/p1212-noskill`, deleted) |
|---|---|---|
| §1 quote block | ✅ (also landed at the skill layer on main) | ✅ (superseded by arm A's) |
| §3 chips · §5 expander | ✅ | — |
| §4 · §4d media, nested card | ✅ | ✅ |
| §4b seal RPC + migration | — | ✅ **lifted onto arm A** |
| §2 byline | — blocked | — blocked |

**§2 is resolved.** Founder decision 2026-09-04: **`AGENT · on {Full Name}`**. It overrules the two
findings recorded in `agent-byline.tsx`, which still stand as written — `on` is what survives both
(it restores the account→subject relation a bare `·` deletes) and is shorter than `about` against
the measured 320px fix. **The footer is NOT changed** and still reads "A machine account operated by
ClarityPledge wrote this reading of {name}" — a different disclosure level, outside the decision
taken, so "machine" now appears there and nowhere else on the surface. **Open for the founder.**

**Three assertions in this spec's own suites were vacuous, each proven so by a known-bad control
and each now binding:** the §5 parity suite passed on bare text (it asserted the statement STRING,
not the component); the five §4b tests inject `authorId` into props and never call the mapper, so
deleting the mapper's read left all 32 green; and `p1141-pipeline-rules` greps FILE TEXT, so its
`reading of` case stayed green on a doc comment after the JSX stopped rendering it. This is the
same defect four times in one spec, including in the canaries meant to certify it.

## Done-When

- [x] Both `p1141-pipeline-rules.test.ts` and `p1141-agent-story-chrome.test.tsx` updated to the new contract, passing *(47 passed; both carry the reworded footer strings verbatim)*
- [x] A test asserts `live-story-card-expanded.tsx` renders quotes — failing before the fix, passing after
- [x] The publish precondition asserting the quote label still passes against a re-filed story *(`publish.md`'s label grep is unchanged; §1 keeps the label in `content` and moves only the bodies)*
- [x] No surface renders `StoryMedia` conditionally on a code path the profile does not reach
- [x] A test asserts `LinkedStoryCard` renders the stripped subject name, never the raw stored `Agent · ` prefix — failing before the fix, passing after (§4d)
- [x] A snapshot-fixture test asserts a pre-§1 sealed letter renders its quote block once, not twice (§4b legacy branch) — failing before the fix, passing after
- [x] A test asserts every surface that renders the quote LABEL also renders the quote bodies — parameterised over the surface list, so adding a surface without quotes fails *(`p1212-quotes-on-every-surface.test.tsx`, plus the new `p1212-footer-on-every-surface.test.tsx` doing the same for the disclosure)*

## Open Questions

1. Should the operator (`ClarityPledge`) appear on the card itself or stay in the footer? Founder raised it as *"whose profile is it?"* — unresolved.

## Related

- **P1141** (`features/done/2026-06-10/`) — predecessor. Shipped the video, quotes and byline contract this spec revises. Closed on a red gate.
- **P1202** (`features/done/2026-06-10/`) — owns story prose rules. Not revised here.
- **P1172** — holds P1141's deferred first-run checks; the timecode-accuracy check lands with this work.
- **P1104** — agent visual distinguishability. Avatar rules unchanged.
- `docs/process-learnings.md` — "The story quote block renders twice on the detail page" is discharged by section 1.
