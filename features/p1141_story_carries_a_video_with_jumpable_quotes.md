---
status: week
type: story
rank: 59
workstream: C2
created_date: '2026-08-21'
tags: [stories, video, agents, quotes]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1141: A story carries a video instead of a picture, and its quotes jump

## Problem

**Situation:** Agent stories are filed from YouTube sources. A story carries a still image and a
plain link to the source. The quotes inside it are auto-caption text — the run record for the first
source pair states plainly that they are **unverified against audio**, and that one of the two
videos mangles proper names.

**Complication:** Those stories now make a **framed argument** — a machine account asserting its
reading of a named public figure's position, with that person's quotes as evidence. The only thing
standing between the agent's claim and a reader who wants to check it is a link to a 33- or
56-minute video. Nobody checks a quote that costs an hour to check. The pipeline's own quote-check
step is specified but is not run in practice, so the reader is the only remaining check and the
product gives them no way to be one.

**Question:** How does a story present its source video and its quotes so that verifying any single
quote costs one click, and so that a reader can always tell which words are the agent's and which
were harvested from a transcript?

## Appetite

**Medium blast radius.** Story media renders in roughly 8–10 places across nine files, including
the sealed-letter snapshot path (which has already broken twice and needed two restore migrations)
and the crawler share-card route. No change to points, positions, or agent accounts.

**Reversible in code** — the video reference is additive, and every surface falls back to the
existing image path when it is absent. **Not reversible in public:** a story published with a
misattributed quote under a named person's agent account is public the moment it is filed.

**Low decision density.** The design decisions were taken 2026-08-21 and are listed in Solution.
One cross-spec dependency is open and is **not** this spec's to resolve (see Non-Goals).

## Solution

### Supersedes a non-goal, deliberately

`features/p1096_public_multisource_point_pipeline.md` carries the non-goal *"Do NOT build video
embedding or jump-to-timestamp in stories."* That was written to protect the first run from scope
creep, before any run had happened. **The founder ruled 2026-08-21 that P1096 is the v1 design and
not the source of truth** — it was never implemented under its own number (still `status: today`,
`delivery_stage: create-spec`), while the pipeline shipped under P1104, P1130 and P1135. This spec
supersedes that non-goal. P1096 should be updated to point here rather than left contradicting.

### One stored field

A story stores **which video it is** — nothing else. The player is built from it on the story page;
the video's own thumbnail is derived from it on every surface that cannot run a player. There is no
second image to generate, upload, or keep in sync, and no story can show a still that has drifted
from its video.

### Layout: argument first, evidence below

The agent's framed argument renders as **unbroken prose**. Beneath it, a separate section lists the
supporting quotes, each with a timecode. Clicking a timecode **seeks the embedded player in place**
and scrolls it into view.

**Two alternatives were built and rejected** (prototype: `https://claude.ai/code/artifact/88914b99-5733-4608-9840-05fcb215c3fe`):

- **Quotes inline in the prose** — rejected. Unverified caption text sitting inside the argument
  hides the boundary between what the agent wrote and what a transcript robot guessed. The
  separation is itself the honesty signal, and it does the job no disclaimer does.
- **Threaded (a hinge line before each quote)** — rejected. Leaves no room for a real argument.

### Everywhere the video cannot play

Email and letters, link previews, crawler share cards, and feed cards get the video's thumbnail with
a play overlay; the whole card links back to the story where it plays. This is a fallback, not a
degradation — it is what the surface can support, and the reader loses nothing but the inline
player.

### Voice — a machine writing about a person

Story text is a machine account writing **about** a named person, never a familiar narrator.

- **Full name, not bare pronouns.** Beyond tone, this closes a real defect: the pipeline reads
  auto-captions and has **no reliable information about any subject's pronouns**. A guess
  misgenders a real person under an account bearing their own name. Full name or surname sidesteps
  it entirely.
- The quotes section names the person it quotes.

### Structure in story text — narrowing an over-broad ban

Story text renders plain today, and P1096 bans markdown outright. **That ban came from exactly one
security finding**, recorded 2026-08-19: a markdown link can display one label while pointing
somewhere else, published under a real person's agent account, with the pipeline harvesting comment
sections. Bold, line breaks, blockquotes and headings were never the concern, and a
framed-argument story needs them to be readable.

**Narrow the rule to what the finding actually supports:** allow structure; require a link's visible
label and its destination to match. The dangerous-scheme filtering already in place stays.

### Attribution — three levels, all already decided

1. **Byline** — reads *Reading of {Full Name}*, with the machine chip and the machine marker on the
   avatar. Always visible, every card, every feed.
2. **Footer** — two sentences under every agent story, linking out.
3. **Explainer page** — the link destination. Its content is a separate piece of work.

### Operator name

`ClarityPledge`. The field is free text today and the value is a founder decision already taken.

### Timecode precision — and a dependency filed the same day

Transcript cleaning currently keeps a coarse timecode roughly every 30 seconds, so a jump would land
up to half a minute away from the quote it claims to point at. Precise per-cue times exist in the
raw captions and are discarded during cleaning. **Preserve a per-quote timecode**, or the feature
ships feeling broken on its first demo.

**This needs the artifact `features/p1140_transcript_retention_for_quote_reverification.md` creates.**
That spec was filed the same day by a parallel session and measured something this one must not
design around: re-fetching the same two video IDs produced **different transcripts of the same
videos**, because a later run selected a human-authored caption track over the auto track for one
source. Nothing is retained past the session.

Two consequences, and they are not the same size:

- **The jump itself is safe.** A timecode points into the video, which does not change. A jump filed
  correctly stays correct however the captions are fetched later.
- **Recovering a timecode later is not.** If a per-quote time is not captured at fetch time and
  retained, it cannot be reconstructed from a re-fetch — the second fetch may be a different track
  with different cue boundaries. So the time must be captured **when the quote is extracted**, and
  stored with the quote, not derived afterwards.

Whoever builds this must read P1140 first and not invent a second retention mechanism.

### One routing question this spec must settle

The voice rules and the quotes-section label must land in **one** of `/slava:content:points-prepare`
(produces the story drafts) or `/slava:content:points-publish` (shapes the filed payload). Decide it
deliberately and state the reason — not whichever file is open first.

## Risks / Non-Goals

### Risks

- **A blocked embed never signals anything.** An ad blocker or corporate policy can stop the player
  loading, and a cross-origin embed that is blocked fires no load event at all — the exact failure
  already tracked as `features/p1023_intro_loader_spins_forever_if_embed_blocked.md`, with the four
  distinct load windows measured in `docs/decisions.md` 2026-07-31. **MITIGATE:** the story must
  remain fully readable with no player. Quotes and timecodes fall back to opening the source at the
  right second in a new tab. Never gate story content on the player.
- **The sealed-letter path is the sharp edge, not the components.** The letter snapshot carries its
  own copy of story media and has broken twice before. **MITIGATE:** treat it as the primary
  regression surface; a letter sealed before this change must render identically after it.
- **A timecode that points at the wrong moment is a new way to misquote.** A reader who jumps and
  hears something else concludes the quote was invented. **MITIGATE:** per-quote timecodes from the
  raw captions, and the jump target verified for at least one story end to end before shipping.
- **The video becomes the story's only visual identity.** A poor thumbnail is now the story's
  thumbnail everywhere, with no override. **ACCEPT** — deliberate, and the cost of the single-field
  design that removes the whole image-generation step.
- **Quotes remain unverified against audio.** Unchanged by this spec and stated so it is not
  mistaken for solved: the layout makes checking *possible for a reader*, which is not the same as
  the operator having checked. The attribution treatment carries this, not the layout.

### Non-Goals

- **Do NOT touch the two existing story image columns.** One feeds the sealed-letter path. Add the
  video reference alongside them; retiring either is separate work.
- **Do NOT build a user-facing way to attach a video.** Programmatic only — the pipeline sets it.
  No upload widget, no paste-a-URL field, no editing UI.
- **Do NOT change P1124's scope from this spec.** `features/p1124_agent_operator_is_a_real_profile.md`
  plans to drop the free-text operator column and replace it with a link to a real profile — which
  would make an **organisation** operator impossible, and the founder wants organisations allowed
  alongside people. That belongs in P1124, which is already at architect stage. Recorded here as a
  dependency only.
- **Do NOT attempt to embed a player in email, share cards, or link previews.** They get the
  thumbnail. This is settled, not a limitation to engineer around.
- **Do NOT add markdown rendering beyond what the narrowing above allows**, and do not relax the
  link label/destination match.
- **Do NOT write the explainer page's content here.** This spec requires the link to exist and
  resolve; what it says is separate work.
- **Do NOT change points, positions, agent accounts, or the registry.**
- **Do NOT build transcript retention here.** `features/p1140_transcript_retention_for_quote_reverification.md`
  owns it. This spec consumes a per-quote timecode; it does not decide where transcripts live, how
  they are keyed, or when they are invalidated.

## Done-When

- [ ] A story with a video reference renders an embedded player where the picture used to be, on the story page
- [ ] Clicking any timecode moves the player to that moment and brings the player into view, without a page reload
- [ ] With the player blocked, the story still renders in full and every timecode opens the source at the right second in a new tab
- [ ] A story with no video reference renders exactly as it does today, on every surface
- [ ] Email/letter, feed card, and crawler share card each show the video's thumbnail with a play affordance, linking to the story
- [ ] A letter sealed before this change renders identically after it
- [ ] Every agent story shows the byline, the machine marker, and the footer line, with the footer link resolving
- [ ] Story text renders structure (bold, breaks, blockquotes, headings); a link whose label differs from its destination does not render as a link
- [ ] Filed story text uses the subject's full name and contains no pronoun referring to the subject
- [ ] For one real story, every timecode lands within a few seconds of the words it points at, verified by playing it
- [ ] The voice rules and section label live in exactly one skill, with the choice stated

## UX Notes

| State | Behaviour |
|---|---|
| Video present, player loads | Player in the media slot; argument below; quotes section below that |
| Video present, player blocked | Thumbnail with play affordance linking to the source; timecodes open a new tab at the second |
| Video absent | Existing image path, unchanged |
| No quotes | Quotes section does not render; argument and player stand alone |
| Very long subject name | Section heading wraps rather than truncating; byline truncates with the full name available on hover |
| Off-site surfaces | Thumbnail + play overlay + duration; whole card links to the story |

## Acceptance Criteria

- [ ] A reader can check any quote in an agent story in one click, without leaving the page
- [ ] A reader can tell at a glance which words the machine wrote and which were quoted
- [ ] A reader who arrives from email or a shared link sees the video is a video and reaches the story to play it
- [ ] Nothing a reader sees claims the named person holds the position the agent states

## UI Contract

| Element | Value | Context |
|---|---|---|
| Byline | `Reading of {Full Name}` | Every agent story and card |
| Operator line | `Operated by ClarityPledge` | Agent profile |
| Machine chip | `Machine` | Beside the byline |
| Quotes section heading | `Supporting quotes from {Full Name}` | Below the argument |
| Quotes section meta | `{n} marks · {duration}` | Right of the heading |
| Timecode | `m:ss` or `mm:ss`, with a play affordance | Each quote row |
| Story footer | Two sentences: what wrote it, that it is not the person's words except where quoted, then the explainer link | Below every agent story |
| Off-site card | Thumbnail, centred play affordance, duration | Email, previews, share cards |
