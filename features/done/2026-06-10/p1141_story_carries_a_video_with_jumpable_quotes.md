---
status: all-done
type: story
rank: 59
workstream: C2
created_date: '2026-08-21'
tags: [stories, video, agents, quotes]
pipeline_ran: [create-spec, architect, goal, finish, ship]
pipeline_skipped: [challenge-prd -- decisions already taken and alternatives recorded in Solution, ux -- covered by UX Notes + UI Contract + an approved visual reference]
visual_reference: 'https://claude.ai/code/artifact/6c28e57e-cb11-4144-b99f-7312428714de'
driver: heuristic
completed_at: 2026-08-27
---


## Closure — founder override of a red goal-gate, 2026-08-27

**This spec was closed on a FAILING gate, by explicit founder instruction.** Recorded here because
a bypass that leaves no trace is the thing the gate exists to prevent.

- **What was overridden:** `scripts/goal-gate.sh p1141 --tier ci`, run by `pre-commit-checks.sh`,
  which refuses to let a goalified spec move to `features/done/` while red. It reported
  **53 failures across 17 check groups**, including: hash mismatches for
  `features/verification/p1141/renders/player-blocked-320.png` and `player-loads-320.png`;
  `need 2 CONSECUTIVE trailing PASS rounds; got FAIL FAIL FAIL FAIL FAIL`; and
  `contract on this branch does not match the pin on main`.
- **How:** `git commit --no-verify`. The goal-gate has **no sanctioned override mechanism** — unlike
  the UI gate, which takes a `.ui-gate-override` file with an expiry. `--no-verify` is a banned
  command in `.claude/rules/git.md` except on explicit user instruction, which was given.
- **What was NOT skipped:** `scripts/audit-privacy.sh` was run by hand against the staged content
  before committing, so the privacy boundary was not bypassed — only the goal-gate was.
- **What this does not mean:** the 53 failures are not fixed and no claim is made that they are. The
  code has been live on `main` since 2026-08-24 (12 commits, all landed). This closes the *card*,
  not the gate.
- **Precedent note:** commit `77ba9d69` already records a founder decision to *"accept the red
  gate"* on this spec. This is the second such acceptance. A goalified spec that closes red twice
  is a signal about the gate's calibration or the spec's renders — worth one look before the next
  goalified spec is filed.
- **Three first-run criteria** from this spec were moved to **P1172** and remain owed.

# P1141: A story carries a video instead of a picture, and its quotes jump

## Run This

Run from `<cp-root>/.claude/worktrees/w3` — the claimed worktree for this spec, already on
`feature/p1141-story-video-quotes`.

    /goal ./scripts/goal-gate.sh p1141 exits 0 with its output pasted, or stop after 30 turns

Run it in **auto mode**. A goal does not change the permission mode: in Manual mode Claude
still asks before every tool call the settings do not already allow, so the loop is not
unattended and will stall on the first prompt (`code.claude.com/docs/en/goal.md`).

The bound is an `or` clause, not a trailing sentence, because the evaluator scores **the
condition** — an imperative after the full stop is not part of what it judges, and the run
would be unbounded.

`/goal` is native Claude Code, not a repo skill — the founder types it; no agent can invoke
it for them. The condition names an exit code on purpose: the loop's evaluator reads the
transcript and runs nothing, so the only trustworthy condition is one naming an artifact the
agent cannot author.

**What this does and does not guarantee.** The loop still stops on the agent's *paste* of the
exit code, and nothing here changes that. What the pinned contract buys is that forgery and
decay are caught at the merge boundary by CI, before anything reaches `main`. Expect a
walk-back that is usually-but-not-always green — not a self-proven branch.

**The loop stops at a committed branch.** Merging, migrating prod, deploying and pushing are
all ALWAYS-ASK and none of them are pre-approvable. The **test**-database migration is
authorised (RD-4); prod is not.

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

**Two alternatives were built and rejected** (layout comparison: `https://claude.ai/code/artifact/88914b99-5733-4608-9840-05fcb215c3fe`):

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
security finding**, recorded 2026-08-20 (`docs/decisions.md` — verified; earlier drafts of this spec cited 08-19): a markdown link can display one label while pointing
somewhere else, published under a real person's agent account, with the pipeline harvesting comment
sections. Bold, line breaks, blockquotes and headings were never the concern, and a
framed-argument story needs them to be readable.

**Narrow the rule to what the finding actually supports:** allow structure; require a link's visible
label and its destination to match. The dangerous-scheme filtering already in place stays.

### Attribution — three levels, all already decided

1. **Byline** — reads *[MACHINE] reading of {Full Name}*, with the machine marker on the avatar.
   Always visible, every card, every feed. The chip is a status marker and is NOT part of the
   profile link; only the name navigates.
2. **Footer** — two sentences under every agent story, linking out.
3. **Explainer page** — the link destination. Its content is a separate piece of work.

### Operator name

`ClarityPledge`. The field is free text today and the value is a founder decision already taken.

### The approved visual reference

**`https://claude.ai/code/artifact/6c28e57e-cb11-4144-b99f-7312428714de`** — approved 2026-08-21.
This is the artifact the blind reviewer grades built screenshots against; it supersedes the
layout-comparison prototype linked above, which only compared three quote treatments.

It covers, at desktop / 375 / 320: player-loads, player-blocked, no-quotes empty state, the
verified-count removal (human and agent side by side), the off-site card, and the untouched
image path. Its timecodes are live, so the seek interaction was reviewable before any code existed.

**Fidelity, measured not asserted.** Every colour and radius was diffed against the values the
running app reports — 15/15 light and 14/14 dark match byte-for-byte; body type resolves to the
same Inter stack. A screenshot comparison against the live feed then caught one thing the token
diff could not: production story cards carry a 4px `blue-500` left rail the reference had omitted.
Corrected. **The lesson is load-bearing for the review stage: matching tokens is necessary and not
sufficient — a surface can use every correct value and still not look like the product.**

**Two limits the reference cannot cover, both recorded on the page itself:**

- The player is a stand-in. A published page cannot load an external embed, so the real player's
  own chrome and aspect behaviour are unverified. Judge those in the browser after the build.
- It is built from static markup, not the real route. Per `/goalify` phase 2, an existing surface
  wants the real route driven with real auth — so a real-route render is still owed at review time
  and this artifact does not discharge it.

**Three deltas from production that this reference deliberately changes** (confirmed against the
live feed 2026-08-21, so none is drift):

1. Bylines read `Agent · {Name}` today with **no machine chip**. The UI Contract requires
   `[MACHINE] reading of {Full Name}`, with only the name clickable. The build owes all three.
2. `0 verified` renders on agent stories today — observed on every agent card in the feed.
3. Quotes currently run **inline through the prose**, which is the layout this spec replaces.

### Timecode precision — and a dependency filed the same day

Transcript cleaning currently keeps a coarse timecode roughly every 30 seconds, so a jump would land
up to half a minute away from the quote it claims to point at. Precise per-cue times exist in the
raw captions and are discarded during cleaning. **Preserve a per-quote timecode**, or the feature
ships feeling broken on its first demo.

**P1140 shipped 2026-08-21 and this dependency is met — but only halfway, and the half that is
missing is the one that breaks the feature.**

What P1140 delivered: the **raw caption file is now retained permanently**, outside both repos, at
`~/.local/share/yt-store/<video-id>/<lang>.vtt`, content-hash-gated so a differing re-fetch lands as
a numbered sibling and never overwrites. Each run records `source | track | raw_sha256 |
clean_sha256 | vtt-clean version` to `.points-run-seals/<slug>.transcripts.sha256`. A WebVTT cue
carries an exact start and end time, so **precise per-quote times now survive the session**.

What P1140 did NOT deliver, deliberately: `vtt-clean` still emits a coarse `[MM:SS]` marker only
every ~30 seconds, and nothing writes a per-quote time into the filed story.

> **The trap, stated so nobody walks into it.** The cleaned transcript is what `/slava:disagreement:prepare`
> produces and therefore what an implementer will naturally read. It has 30-second granularity. A
> jump built from it lands up to half a minute off and reads as a broken feature rather than as the
> wrong input file. **Read the retained raw `.vtt`, never the cleaned text, when resolving a quote
> to a time.**

**Capture-at-extraction is preferred but no longer the only correct path.** The original reasoning —
that a later re-fetch might return a different caption track with different cue boundaries — is
weakened now that the original bytes are pinned and retained under a recorded hash. Deriving a time
later from the stored raw track is therefore safe. Capture at extraction anyway: it is one step in
the same pass that already has the cue in hand, and it removes a lookup from every future reader.

**Known limit, accepted:** the store is machine-local (one Mac), not the database and not the repo.
Adequate while one operator files every story. If filing ever moves to another machine or another
person, durable per-quote times become a new question — do not solve it here.

Whoever builds this must read P1140 (now in `features/done/2026-06-10/`) first and not invent a
second retention mechanism.

### Hide the verified-understanding count on agent stories

Story cards render a stats row under the story text showing `{n} verified` (the ear metric).
On agent stories it reads **`0 verified`, permanently**.

This is not a low number — it is one the product's own flow can never raise. A
`story_verifications` row is created when a story's **author** rates a listener's paraphrase in a
live session. An agent account cannot sit in a session and cannot rate, so through the live-session
UI the count has no path above zero.

> **Corrected during the security review — do not carry the stronger claim forward.** An earlier
> draft of this section called the count *structurally unreachable*. It is not. The
> `story_verifications` INSERT policy
> (`supabase/migrations/20260325120000_p586_visibility_privacy_foundation.sql:389`) checks only
> `auth.uid() = speaker_id OR auth.uid() = listener_id` — it never checks that the speaker is the
> story's author. Verified: no later migration tightens it. So any authenticated user can insert a
> verification against any story, an agent's included. **The UI decision is unchanged** — hide
> unconditionally, never hide-when-zero, which is why this gap does not affect the design. But the
> reason for hiding is *"this metric does not describe an agent story"*, not *"the database makes
> it impossible"*. The RLS gap is pre-existing, in the same family as P1138/P1139, and is **not
> this spec's to fix** — filed as a follow-up.

Two reasons it must go, on a card whose entire job is signalling honesty:

- A reader who knows the metric reads `0 verified` as *nobody understood this*, when the truth is
  *this metric does not apply here*. It misinforms in the one direction the feature cannot afford.
- It is inconsistent with choices already shipped. The author ear badge, collaboration, calibration
  and agreements are **already** hidden on agent surfaces, gated on the same registry lookup. This
  count was missed.

**Hide it behind the existing agent check**, the same way the author ear badge already is. Check the
Verify button on the same pass — it is offered from the same row and is equally unreachable.

Small, and it lands in files this spec already rewrites; folded in here rather than given its own
number.

### One routing question this spec must settle

The voice rules and the quotes-section label must land in **one** of `/slava:disagreement:prepare`
(produces the story drafts) or `/slava:disagreement:publish` (shapes the filed payload). Decide it
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
- **Do NOT build a user-facing way to attach a video** *in this spec*. Programmatic only — the
  pipeline sets it. No upload widget, no paste-a-URL field, no editing UI.
  **Not-now, not never — and the design must keep the door open.** The single-stored-field choice
  above already does: a story stores a video identity, and every surface derives player, thumbnail
  and fallback from it. Nothing cares whether a skill wrote that field or a person pasted a URL, so
  adding a paste-a-link input later is one input plus validation — it must not require reopening the
  layout, the fallbacks, or the sealed-letter path. **Do not add any check, schema constraint, or
  code comment that assumes the setter is a machine.** Users can already attach an image; a video is
  the same shape.
  **This Non-Goal does NOT exempt format validation** — the security review flagged that an
  implementer optimising for its letter could skip the column CHECK constraint as machine-only
  scaffolding. A format constraint is agnostic to *who* sets the value, and is required **because**
  this door is meant to open, not despite it.
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

- [x] A story with a video reference renders an embedded player where the picture used to be, on the story page
- [x] Clicking any timecode moves the player to that moment and brings the player into view, without a page reload
- [x] With the player blocked, the story still renders in full and every timecode opens the source at the right second in a new tab
- [x] A story with no video reference renders exactly as it does today, on every surface
- [x] Email/letter, feed card, and crawler share card each show the video's thumbnail with a play affordance, linking to the story
- [x] A letter sealed before this change renders identically after it
- [x] Every agent story shows the byline, the machine marker, and the footer line, with the footer link resolving
- [x] Story text renders structure (bold, breaks, blockquotes, headings); a link whose label differs from its destination does not render as a link
- [x] The voice rules and section label live in exactly one skill, with the choice stated
- [x] An agent story shows no verified-understanding count and no Verify affordance; a human story is unchanged
- [x] Per-quote timecodes are resolved from the retained raw caption file, not from the ~30s cleaned transcript

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

- [x] A reader can check any quote in an agent story in one click, without leaving the page
- [x] A reader can tell at a glance which words the machine wrote and which were quoted
- [x] A reader who arrives from email or a shared link sees the video is a video and reaches the story to play it

## UI Contract

| Element | Value | Context |
|---|---|---|
| Byline | `[MACHINE]` chip, then `reading of`, then `{Full Name}` — the name is the ONLY clickable element, and only where it is independently navigable | **Every surface that names an agent account**: story bylines, the profile header (`lg` size), both point stance rows, and the quoted-card rows on point/story/profile |
| Operator line | `Operated by ClarityPledge` | Agent profile |
| Machine chip | `Machine` | Beside the byline |
| Quotes section heading | `Supporting quotes from {Full Name}` | Below the argument |
| Timecode | `m:ss` or `mm:ss`, with a play affordance | Each quote row |
| Story footer | Two sentences: what wrote it, that it is not the person's words except where quoted, then the explainer link | Below every agent story |
| Off-site card | Thumbnail, centred play affordance, duration | Email, previews, share cards |

## Technical Architecture

### Technical Analysis

**Reuse inventory** (file:line, current behaviour, call-site count — gathered from a full read of every surface named in the spec):

| Existing thing | File:line | Today | Call sites |
|---|---|---|---|
| `useAgentAccountIds()` / `isAgentAccountId(id)` | `src/app/contexts/agent-accounts-context.tsx:97-100` | Fail-closed agent-registry membership test (`isLoading` withholds a false negative) | 11 sites / 5 files — **the** gate to extend, not replace |
| Agent-gate pattern (`isAgent`/`identityPending` → `!isAgent && !identityPending && <X/>`) | e.g. `StoryCardDetail.tsx:164-165` | Hides the ear badge, drives square avatar + `.agent-card-drained`/`.agent-drained-chrome` grayscale chrome | Same 11 sites — template for the new gates below |
| `UnderstoodBadge` | `src/components/ui/understood-badge.tsx` | Always-renders `{n} verified`, "empty state over hidden" by design comment — no hide prop | 6 render sites |
| `VerifyButton` (shared component) | `src/app/components/shared/VerifyButton.tsx` | **Dead code — zero JSX call sites.** Both real Verify buttons are inline `<button>`s | 0 |
| Inline Verify `<button>` | `StoryCardDetail.tsx:331-338`, `story-card-with-links.tsx:337-345` | Gated by `showVerifyButton && onVerify` | 2 sites |
| `StoryImage` | `src/app/components/shared/story-image.tsx` | `<img>` + lightbox + author edit affordances, `fit` prop | 9 render sites / 8 files |
| `stripAgentPrefix()` | `src/lib/utils.ts:33` | Strips the baked-in `"Agent · "` prefix off `profiles.name`, used only for avatar initials today | `gravatar-avatar.tsx` |
| `linkifyText()` | `src/app/utils/linkify.ts` | Builds React nodes (never `dangerouslySetInnerHTML`); already parses `[label]` + `(url)` with label independent of href — the exact defect the 2026-08-20 finding names | Story/point text render sites |
| `marked` (npm dep) | `package.json:54` | Already installed; used only via `src/lib/markdown.ts`'s `renderMarkdownSafe()` for ToS/events/articles, all via `dangerouslySetInnerHTML` | Not used for stories |
| `seal_and_send_letter` RPC (current body) | `supabase/migrations/20260513000000_p833_seal_rpc_version_desync.sql` | Builds `letter_story_snapshots.point_config` JSONB via one `jsonb_build_object` — the **single write chokepoint** for the frozen snapshot | — |
| `letter-snapshot-mapper.ts` | `src/app/utils/letter-snapshot-mapper.ts` | `PointConfig` interface (:22-40), `snapshotToStoryWithPoints()` (:126-189, reader path), `docStoryToSnapshot()` (:201-230, preview shim) | Both must stay in lockstep with the RPC — see Decision 7 |
| `api/og.ts` | `api/og.ts` | Vercel function, bot-UA-gated (`vercel.json` rewrites), reads `stories.banner_url` live via REST, no server-side rasterization | `/story/:id` share cards |
| `sd-guard-completeness.test.ts` | `src/tests/sd-guard-completeness.test.ts` | Generalized canary asserting the **latest** `SECURITY DEFINER` function body still contains every prior `RAISE`/`CRITICAL_TOKENS`/`CRITICAL_PREDICATES` needle | Does **not** currently catch a silently-dropped JSONB key — extend it (Decision 7) |

**Confirmed absent — net-new territory:**
- No `video`/`youtube`/`source_url` column anywhere on `stories` (full-text grep of every migration).
- No `story_quotes` or any per-quote table (`grep -rn "quote" supabase/migrations/` → zero).
- No component anywhere handles a blocked cross-origin embed — P1017 (`intro-page.tsx`) has a *fade-after-load* pattern but no *never-loaded* backstop; P1023, which specs the backstop, is unshipped (`status: week`, every AC unchecked).
- No "Machine" chip exists; today's only agent-disclosure signals are the baked `"Agent · {Name}"` name prefix, the square avatar, and the grayscale chrome.

**Dependencies verified this session:**
- **P1140** (`features/done/2026-06-10/p1140_transcript_retention_for_quote_reverification.md`) shipped the raw-`.vtt` retention store (`~/.local/share/yt-store/<video-id>/<lang>.vtt`, content-hash-gated, machine-local). It is a `pp/scripts` mechanism with no `src/` code — resolving a per-quote timecode means reading the raw `.vtt`, never the ~30s `vtt-clean` output, inside the filing skill (Decision 10), not inside the app.
- **P1096** (`status: today`, never built under its own number) is the spec whose non-goal this supersedes; its ban text is narrower than P1141's spec text implies — it bans "video embedding or jump-to-timestamp" and separately "markdown rendering... Story text renders plain with links made clickable." Both sit at `features/p1096_public_multisource_point_pipeline.md:100-101`.
- **P1124** (`status: week`, `delivery_stage: architect`) already plans to replace `agent_accounts.operator_name` (free text) with a `profiles` FK, which would make an organisation operator impossible — confirmed at `features/p1124_agent_operator_is_a_real_profile.md:128-131`. P1141 must render `Operated by ClarityPledge` against the **current** free-text column only; nothing here should assume the future FK shape.
- **2026-08-20** `docs/decisions.md:786-870` (not 2026-08-19 as this spec's Solution section states — a one-day citation slip worth a follow-up correction, not a blocker) is the actual entry recording the disguised-link finding: *"`linkify.ts:17` emits an anchor whose label is independent of its href, and `/slava:disagreement:prepare` harvests comment sections... XSS is blocked; phishing under a named person's account was not."*
- The sealed-letter "three-layer write contract" is itself a named prior decision (`docs/decisions.md:13666`, P751): any field on `stories` reaching the letter flow needs the RPC, the mapper's `PointConfig` interface + reader, **and** the preview shim updated together, or it silently drops — this has broken exactly this way twice (P751/P777, then regressed and needed a third restore, P819) and once more in an unrelated way (P833, a silent-drop-whole-story bug from a stale `INNER JOIN`).

### Architecture Decisions

**Decision 1 — Video identity is exactly one column, and it stores the canonical watch URL, not an embed URL or a bare ID.**
`ALTER TABLE stories ADD COLUMN video_url TEXT` (nullable). `src/lib/video.ts` provides `parseVideoUrl(url)` → `{ provider: 'youtube', videoId } | null`, from which the embed URL, the thumbnail URL, and the "open at timestamp" URL are all cheaply re-derived. An unrecognized/malformed URL parses to `null` and every surface treats that identically to an absent video (Done-When: "renders exactly as it does today").
*Rationale:* the pipeline already has the source video's plain URL on hand (it's what's shown today as "a plain link to the source"); storing that same string needs no new provider-detection step at filing time. Storing an embed URL instead would make re-deriving the plain watch-link needed for the blocked-embed fallback harder (reverse-parsing an embed URL). Storing a bare ID would hard-code "always YouTube" into the schema, where the parser is the natural place to keep that assumption swappable.
*Trade-off:* every read path calls `parseVideoUrl()` instead of reading pre-split fields — cheap, pure, and memoizable; not a real cost.
*Alternative rejected:* a `video_provider` + `video_id` pair of columns — rejected because it duplicates information already recoverable from one URL and adds a second place at which a two-column pair could disagree (the exact "drift" that "one stored field" is trying to prevent, just moved one level down).

**Decision 2 — Quotes + their timecodes + the video's duration live together in one JSONB column, not a new table.**
`ALTER TABLE stories ADD COLUMN video_quotes JSONB NOT NULL DEFAULT '{"quotes": [], "durationSeconds": null}'::jsonb`, shaped `{ quotes: { text: string; seconds: number }[]; durationSeconds: number | null }`.
*Rationale:* quotes have no independent identity, no separate RLS need (they inherit the parent story's visibility automatically by living in the same row — no join, no second RLS policy surface for the Security agent to review), and nothing in Done-When requires querying an individual quote in SQL. Duration is folded in here rather than becoming a third sibling column on `stories`, because (a) the "one stored field, nothing else" language in Solution scopes specifically to the *video's identity* (Decision 1), not to the separately-flagged-as-open "Per-quote timecodes" question this decision answers, and (b) `yt-dlp`'s `info.json` — already fetched by P1140's retention pipeline for every source video — carries a `duration` field for free, so populating it costs zero new external API calls or quota. Off-site cards and the quotes-section meta line (`{n} marks · {duration}`) both read `durationSeconds` from this same column; nothing re-derives it live, so surfaces that can never mount a player (email, crawler card) still satisfy the UI Contract's duration requirement.
*Trade-off:* no per-quote SQL querying/indexing — acceptable, nothing in this spec needs it.
*Alternative rejected:* a child `story_quotes` table — rejected because it would need its own RLS policy (new security-review surface for no behavioural gain), a join on every story render, and buys nothing since quotes are always read/written atomically with their parent story.

**Decision 3 — Programmatic seek uses the YouTube IFrame Player API, not a raw `<iframe src>` swap.**
A raw iframe can be re-pointed at `...&start=N`, but that reloads the video — the spec requires seeking "in place," no reload. `src/lib/video.ts` gets a `loadYouTubeApi()` singleton loader (resolves immediately if `window.YT.Player` already exists); a new `StoryVideoPlayer` component constructs one `YT.Player` per mount and exposes `seekTo(seconds)` (calls `player.seekTo(seconds, true); player.playVideo();`) via a ref.
*Trade-off:* one third-party script load per story-detail page view — acceptable, it's the only mechanism that supports non-reloading seek.
*Alternative rejected:* `postMessage` to a plain iframe using YouTube's older postMessage API — rejected, it's the same capability with a worse-documented, more error-prone protocol than the maintained IFrame Player API wrapper around the identical mechanism.

**Decision 4 — The blocked-embed case is a net-new component, built from P1017's proven pattern plus the backstop timer P1017 deliberately does not have.**
No existing component in `src/` detects a never-fires-`onLoad` iframe (confirmed by grep — only `intro-page.tsx`, `letter-live-overlay.tsx`, `ShareDialog.tsx`, `useEmbedNavigation.ts` touch `iframe`/`onLoad`, none has a blocked-detection backstop). `StoryVideoPlayer` starts a 10-second timer on mount (cleared by the IFrame API's `onReady`); if it fires before `onReady` (or `onError` fires first — a real signal, unlike a fully network-blocked load), it swaps to the blocked-state UI: the same `VideoThumbnailCard` used everywhere else, with a play affordance to the source, and every quote timecode becomes a new-tab link to `getTimestampUrl(videoUrl, seconds)` instead of a `seekTo()` call.
*Rationale for 10s, not a founder decision:* this is a technical timing constant, not CTA copy/pricing/tone — it doesn't need founder sign-off. `docs/decisions.md` 2026-07-31 measured a *successful* cross-origin embed (Google Calendar) at roughly 7.5s end to end; 10s gives margin above a normal load before assuming "blocked," rather than false-flagging a slow-but-working embed.

> **⚠ CHALLENGED — verified against the source entry, and it does not support a fixed constant.**
> Two corrections to the rationale above.
>
> **The number.** The 2026-07-31 entry does not report ~7.1s. It reports **four** windows —
> HTML→React ~85ms, React→lazy chunk ~302ms, chunk→`onLoad` ~5.5s, `onLoad`→paint ~1.6s — and a
> total wait it elsewhere calls **~7.6s**. Close enough not to change the conclusion, but the
> figure was not in the doc.
>
> **The pattern, which does change it.** That same entry's decision (3) is titled *"A timing
> constant tuned on one connection is a latent bug."* It records a fixed 2200ms constant that
> worked on a fast link and **would have missed by ~7s on slow 3G**, and prescribes deriving the
> value instead: `clamp(embedFetchDuration × 0.45, 2200ms, 12000ms)`. A fixed 10s is the exact
> shape that decision rejects — on a slow connection a perfectly good player exceeds it and the
> reader is told the embed is blocked when it is merely loading.
>
> **Why it is not a straight copy of the prescribed formula, either.** The derivation needs
> `embedFetchDuration`, and a *blocked* embed never produces one — that is the whole point of
> P1023. So the derived-clamp cannot be lifted as-is.
>
> **To settle during build:** derive the threshold from a signal that exists before any load event
> — a same-origin timing probe, `navigator.connection`, or the measured time-to-first-render of the
> page itself — and clamp it, rather than hardcoding one number. If no such signal proves workable,
> record *that* explicitly and pick the constant from the slow-connection end, not the fast one:
> a false "blocked" notice on a working player is worse than a few extra seconds of waiting,
> because the fallback it triggers sends the reader off-site.
*Non-negotiable constraint carried through:* story content (argument + quotes list) never waits on this timer — it renders immediately regardless of player state, satisfying the spec's Risk mitigation directly.

**Decision 5 — `StoryImage` stays untouched; a new `StoryMedia` wrapper picks video vs. image, so every existing image-only call site keeps working with zero behaviour change.**
`StoryMedia` takes `imageUrl` and `videoUrl`/`videoDuration`; if `parseVideoUrl(videoUrl)` succeeds it renders `StoryVideoPlayer` (detail contexts) or `VideoThumbnailCard` (card/off-site contexts) as appropriate to the mode it's given; otherwise it renders the existing `StoryImage` unchanged. This satisfies the Non-Goal's "do not touch the two existing image columns" literally — `StoryImage` and `image_url`/`banner_url` are never edited, only wrapped.

**Decision 6 — Only the story's dedicated detail surface mounts a live player; every card/feed/preview surface gets the thumbnail treatment and links in.**
The spec says "the player is built from it **on the story page**" (singular) and separately specifies "Off-site surfaces: thumbnail + play overlay." `story-detail-page.tsx` (and `StoryCardDetail` when rendered in its full/`isDetailView` mode) mount `StoryVideoPlayer` + the quotes section with live seek. `story-card-with-links.tsx`, `feed-story-card.tsx`, and `profile-page-v2.tsx`'s card-mode renders use `VideoThumbnailCard` — thumbnail, centred play affordance, duration — and the whole card links into the story page, matching the Non-Goal's "do not embed a player in... previews" and avoiding N simultaneous video embeds in a scrolling feed.
*Alternative rejected:* live player inline in every feed card — rejected, no runtime-observable requirement calls for it, and it multiplies concurrent iframes/YT.Player instances for no stated benefit.

**Decision 7 — Extend the sealed-letter three-layer contract for `videoUrl`/`videoQuotes`; no backfill migration is needed this time.**
Add `'videoUrl', s.video_url` and `'videoQuotes', s.video_quotes` to `seal_and_send_letter`'s `jsonb_build_object` (new migration, `CREATE OR REPLACE` on top of the current `p833` body verbatim, per the repo's own diff-against-prior convention). Add both fields to `PointConfig` in `letter-snapshot-mapper.ts`, to `snapshotToStoryWithPoints()`'s return, and to `docStoryToSnapshot()`'s preview shim — the same three files the P751 finding names as the complete contract. Add a `CRITICAL_PREDICATES` entry to `sd-guard-completeness.test.ts` for the new `jsonb_build_object` keys, plus a sibling canary test to `p819-seal-rpc-imageurl-canary.test.ts` (e.g. `p1141-seal-rpc-video-canary.test.ts`), so a future `CREATE OR REPLACE`-from-a-stale-base regression — which has already happened twice for `imageUrl` alone — is caught mechanically instead of by luck.
*Why no backfill, unlike P751/P777:* those needed backfilling because `image_url` already had values on `stories` before letters existed and the RPC simply never wrote the key. Here `video_url`/`video_quotes` are brand-new columns — every story sealed before this change legitimately has no video, so the new keys being *absent* from old snapshots is the **correct** value, not a gap: the reader treats a missing key exactly like `videoUrl: null` and falls back to the image, which is precisely Done-When's "a letter sealed before this change renders identically after it."
*The reading surface reuses the same components as the live story page:* `explain-back-view-page.tsx` (and any other letter-reading surface) feeds `StoryMedia`/`StoryVideoQuotes` from the mapper's resolved `videoUrl`/`videoQuotes` props instead of live `stories` columns — same components, different data source, so the interactive seek behaviour is available in a sealed letter too, not just on the live story page (nothing in Non-Goals restricts this; the "no player in email/previews" ban is explicitly about email/share-cards/link-previews, not the in-app letter-reading page).

**Decision 8 — Markdown narrowing extends `linkify.ts` (React-node output), not `src/lib/markdown.ts`/`marked` (HTML-string + `dangerouslySetInnerHTML`).**
Today's story-text rendering is inherently XSS-safe because it never touches `innerHTML` — `linkifyText()` builds React elements directly. Switching story rendering to `renderMarkdownSafe()` would trade a proven-safe trust model for one that needs its own sanitizer (`sanitizeHref()`, strip-HTML) to reach equivalent safety, for a feature that only needs a handful of inline structures. `linkify.ts` gets small, independent, line/regex-based handlers for bold (`**text**`), line breaks, blockquote lines (`>`), and headings (`#`/`##`, mapped to `h3`/`h4` scaled for card context, never `h1`) — a narrow parser matching exactly what the spec allows, not a general CommonMark implementation.
*Link label/destination match (closes the 2026-08-20 finding directly):* the existing `[label]` + `(url)` handler is extended to normalize both sides (strip scheme, strip trailing slash) and compare; on a mismatch the bracket text renders as **plain, non-clickable text** — fail-safe, content preserved, no disguised link ever reaches the DOM. The existing scheme allowlist (`https?://` only, in `linkify.ts`) is untouched.
*Alternative rejected:* switch to `marked` for stories — rejected, no dependency needs adding either way (it's already installed for other surfaces), but it would be a regression in trust model for zero new capability the narrow parser can't already provide.

**Decision 9 — The crawler's static `og:image` gets the derived thumbnail directly; the play-overlay only exists on surfaces we render as HTML ourselves.**
`api/og.ts` never rasterizes — it only points a meta tag at an existing URL (confirmed: no server-side image composition exists anywhere in the function). `VideoThumbnailCard` (a real HTML/CSS component: `<img>` + an absolutely-positioned SVG play icon + a duration badge) is the "off-site card" the UI Contract describes, and it's used everywhere we control the DOM: feed/profile/preview cards and any HTML email/letter template. The crawler's `STORY_COLUMNS` gains `video_url`; `ogForStory()` derives the thumbnail via the same pure `parseVideoUrl`/`getThumbnailUrl` functions from `src/lib/video.ts` (no React/DOM dependency, safe to import from a Vercel serverless function) and falls back to `banner_url` when absent, unchanged from today. No play icon is compositely baked into the OG image itself — that's an industry-wide limitation of static meta-tag cards (Slack/Twitter/Discord unfurls never show a custom overlay on the raw image), not a deviation from this spec's UI Contract, which is describing surfaces this app renders directly.

**Decision 10 — The voice rules and the quotes-section label live in `/slava:disagreement:prepare`, not `/slava:disagreement:publish`.**
`disagreement:prepare` already owns every rule of this exact class — "never impute a position," "bald restatement," attribution-basis labelling per quote — and produces the actual story-draft text, including per-arguer quote selection. `disagreement:publish` explicitly disclaims authorship ("This skill files; it does not author... wrong text ⟹ re-run prepare") and only enforces mechanical, uniform string requirements at filing time (the existing `#<event-tag>` presence check is the direct precedent). Full-name-not-pronouns and the `Supporting quotes from {Full Name}` label are both drafted narrative content, so they belong where narrative content is drafted. `disagreement:publish` gains one new Quality Gate line asserting the label string is present verbatim in the read-back, mirroring how it already asserts the hashtag is present — a mechanical backstop, not a second place authoring the rule.
**Per-quote timecode extraction is also assigned to `disagreement:prepare`:** it is the skill that already has each raw source video open for quote selection, and P1140's own guidance is explicit — resolve from the retained raw `.vtt`, never the `vtt-clean` ~30s output — which only the drafting step, not the filing step, has reason to touch.

**Decision 11 — `P1096`'s superseded non-goal gets a pointer update, not a rewrite.**
Per this spec's own "Supersedes a non-goal, deliberately" section, `features/p1096_public_multisource_point_pipeline.md`'s non-goal text (lines 100-101) is edited to note it's superseded by P1141, rather than left standing in silent contradiction. P1096's separate markdown non-goal is left alone — this spec narrows, not lifts, that ban, so P1096's text stays accurate on that point.

### Security Review

Spec is at `delivery_stage: architect`, i.e. mostly undesigned code (the video-reference column, the
player, the seek/postMessage wiring, and the "label must match destination" link check do not exist
yet). Findings below are split between (a) what current code already does and (b) what the spec
requires but has not yet been built, which I could only review as a *requirement*, not verify as
code. Labeled accordingly.

**RLS Policies:**
- ✅ `stories` INSERT is correctly bound: `WITH CHECK (auth.uid() IS NOT NULL AND author_id = auth.uid() AND EXISTS(... is_verified = true))` (`supabase/migrations/20260809150000_p1032_bind_insert_author_predicates.sql:29-34`). Agent-authored stories go through the same client insert path as human stories (agent accounts are real `auth.users` rows minted by the P1104 RPC, per `docs/decisions.md` 2026-08-20 "agent provisioning ... mint the `auth.users` row via RPC"), so this predicate genuinely gates agent-authored rows too. Adding a new nullable video-reference column to `stories` does not weaken this row-level predicate — Postgres RLS `WITH CHECK` here is row-scoped, not column-scoped.
- ⚠️ **Adding the column with no column-level constraint means the predicate above does not constrain its *value*.** Any authenticated, verified profile (human or agent, since the policy doesn't distinguish) can set the new video-reference column to any string via a raw REST insert — the app's own UI not exposing an input for it is not an enforcement boundary. No CHECK constraint exists yet because the column doesn't exist yet; **this must be added at the schema level** (format-restricted, e.g. an 11-char YouTube ID pattern) before build, not left to client-side validation alone. See "The video reference field" below for the consequence if this is skipped.
- ⚠️ **Unrelated pre-existing gap, surfaced because the spec leans on it as a security argument (see "The verified-count hide" below):** `story_verifications` INSERT policy (`supabase/migrations/20260325120000_p586_visibility_privacy_foundation.sql:389-393`) is `WITH CHECK (auth.uid() IS NOT NULL AND (auth.uid() = speaker_id OR auth.uid() = listener_id))`. It does **not** check `speaker_id = stories.author_id`. Any authenticated user can insert a row naming *themselves* as `speaker_id` against *any* `story_id`, including an agent story, with `speaker_rating >= 8` (the `accuracy_achieved` generated column and the `trg_story_verification_count` trigger, `supabase/migrations/20260204_stories_points_calibration.sql:228-244`, do the rest) — producing a nonzero `understood_count` on a story an agent "wrote." This means the spec's stated rationale — "a `story_verifications` row is only created when the story's author rates a listener's paraphrase" — is an **application-layer** assumption, not a database-enforced invariant. It does not break P1141's actual UI plan (the count is unconditionally hidden for agent accounts, not conditionally hidden-when-zero), but it means the "structurally unreachable" framing in the spec is not accurate as a security claim, only as a description of what the *live-session UI* currently allows. Pre-existing, not introduced by this spec, out of P1141's scope to fix — but worth a follow-up in the same family as P1138/P1139 (unconditionally-bound-except-for-one-column write predicates).
- **Unverified:** I did not find (nor did the spec name) a migration that already adds the video-reference column, so I cannot verify its actual DDL — only state what it must contain.

**Authentication:**
- ✅ Agent accounts authenticate as real `auth.users` rows (P1104), so `auth.uid()` in every policy above resolves correctly for agent-authored writes; no separate/parallel identity path to audit.

**Authorization:**
- ✅ `supabase/migrations/20260819170000_p1104_agents_cannot_self_promote.sql` closes the self-promotion path (an agent flipping its own `is_verified`) — not directly this spec's surface, but confirms the agent-account write boundary was previously hardened, and is not touched by P1141.
- ⚠️ **The Non-Goal "Do NOT add any check, schema constraint, or code comment that assumes the setter is a machine"** is in direct tension with "add a column-level constraint restricting the video-reference format" above. These are not actually in conflict — a format constraint (must look like a video ID) is agnostic to *who* sets it — but an implementer optimizing for the letter of the Non-Goal could reasonably skip format validation because it reads as "machine-only" scaffolding. State this explicitly in the architecture doc: the format CHECK constraint is required regardless of setter identity, precisely *because* the door is meant to open to user-supplied values later.

**Input Validation:**
- ⚠️ **Comment-harvested text reaches rendered story content unsanitized-for-HTML-injection today, but is currently rendered safely by construction — this changes if the markdown narrowing is implemented as `dangerouslySetInnerHTML`.** Traced: `/slava:disagreement:prepare` harvests YouTube comment sections into quote/argument candidates → filed via `/slava:disagreement:publish` → `stories.content` → rendered today via `linkifyText()` (`src/app/utils/linkify.ts`), which builds **React elements via `createElement`**, not `dangerouslySetInnerHTML`. Any HTML/script text in a harvested comment is inert — it becomes a React text-node child and is escaped by React's rendering, same as any other user string on this site. This is a real, load-bearing safety property of the *current* renderer and it is structural, not incidental.
  - **The markdown narrowing as specced requires switching away from that structural safety.** `linkifyText` cannot produce bold/headings/blockquotes; the only renderer in this codebase that can is `src/lib/markdown.ts`'s `safeMd` + `dangerouslySetInnerHTML` (see `EventDetail.tsx:565` for the existing pattern). `safeMd.html()` and `.image()` are stubbed to return `''`, which does strip raw `<script>`/`<img>`/HTML tags and markdown images — so XSS via raw HTML is still blocked if `safeMd` (or something equivalently configured) is reused. But this is a **new attack surface class** relative to `linkifyText`, not a continuation of it, and the spec doesn't name which renderer will be used. State this explicitly in the architecture: reuse `safeMd`'s HTML-stripping renderer overrides, do not build a new one from `marked` defaults.
  - **The link renderer this spec narrows the ban to does not exist yet, and the closest existing analogue does not implement the promised check.** `safeMd`'s current `link()` override (`src/lib/markdown.ts:161-167`) validates the href **scheme** only (`sanitizeHref`, http/https/mailto) — it does not compare `text` to `href` at all. `linkify.ts`'s `MARKDOWN_PATTERN` handling (the exact code the 2026-08-20 finding names) has the identical gap: label and destination are fully independent strings. **The "label must match destination" rule is a net-new check that has to be written; it is not a tightening of anything that already exists.** This is the highest-risk gap in the spec: the Done-When item ("a link whose label differs from its destination does not render as a link") describes the intended *outcome*, not an implementation, and no implementation detail (exact-match vs. normalized-match, compared before or after markdown/entity decoding, case sensitivity, trailing-slash handling) is specified. Enumerated bypass classes the naive form of this check ("does `text === href`?") does **not** catch even when correctly implemented:
    1. **Homograph / IDN domains.** `[https://аpple.com](https://аpple.com)` (Cyrillic а, U+0430) passes a strict string-equality check — label and destination are byte-identical and both are lies. A same-string check cannot defend against this; it needs separate Unicode-confusable / mixed-script detection on the domain, which the spec does not mention and which "label matches destination" cannot express as a rule.
    2. **Normalization-timing bypass.** If the match check runs on the *raw markdown source* before URL/percent-decoding, an attacker can encode part of the href (`%2E` for `.`, punycode `xn--`) so the visible label (decoded by the browser at render time) differs from what the raw-string comparison saw. If it runs *after* decoding but the decoder used for the check differs from the browser's own URL parser, the same class of mismatch is possible in the other direction. State explicitly: normalize with the same parser (`new URL()`) used for `sanitizeHref`, and compare post-parse, not pre-parse.
    3. **Reference-style links** (`[text][ref]` ... `[ref]: https://evil.com`) — `marked` supports these. If the check is written against the inline `[text]` + `(url)` syntax only (mirroring `linkify.ts`'s current regex, which does not handle reference syntax at all), reference-style links bypass the check entirely by construction, not by cleverness.
    4. **Autolinks** (`<https://evil.com>`) — visible text equals the href by definition, so these trivially "pass" any label/destination match, but that doesn't make them safe standing alone; verify the scheme allowlist (`sanitizeHref`) still applies to autolink tokens, since `safeMd`'s renderer overrides `link()` but `marked`'s autolink tokenizer may route through a different renderer hook depending on version — needs an explicit test, not an assumption.
    5. **Nested markup inside the label** (`[**Real Site**](https://evil.com)`) is not a bypass of the *matching* rule (label "Real Site" plainly ≠ "https://evil.com", so it should already be rejected by any sane rule) — but confirms the matching rule cannot be pure string equality against the rendered label; it has to compare the *raw label token* to the href, or comparison logic subtly diverges from what the reader visually sees.
  - **Unverified — not yet built:** none of the above can be checked against real code; they are requirements the eventual implementation must satisfy. Flagging them now because "narrow the rule to what the finding actually supports" is the spec's own framing, and the finding supports a check that does not exist anywhere in this codebase today — it has to be designed, not just "narrowed to."
- ✅ Dangerous-scheme filtering the spec says "stays" does genuinely exist and is real: `sanitizeHref()` (`src/lib/markdown.ts:29-36`) and the auto-URL/`javascript:`-adjacent guard in `linkify.ts:96-104` both allowlist `http`/`https`(/`mailto` in markdown.ts). This part of the spec's claim is accurate.
- ⚠️ **Private individuals in harvested comment text.** Per `.claude/rules/pii.md`, named public figures being quoted is not a PII violation, but the pipeline harvests *comment sections*, which are written by arbitrary YouTube users — private individuals. If a comment happens to contain another private commenter's name, handle, or other identifier and that comment text is selected as quote/argument material, it would publish a private individual's identifier on a public page under an agent account, which **is** a `.claude/rules/pii.md` violation (roles-not-names doesn't apply here since this is arbitrary third-party harvested text, not authored prose the agent chose to write about a role). Nothing in the spec or in `/slava:disagreement:prepare` (as referenced) mentions filtering harvested comment text for third-party identifiers before it can be selected as quote source material. This is a provenance gap independent of the markdown question: **unverified against the disagreement:prepare skill's actual selection logic** — I did not read that skill file end-to-end for this review; flagging as a question the pipeline review should answer, not as a confirmed defect.

**Data Protection:**
- ✅ Quoted public figures are handled correctly per `.claude/rules/pii.md` — public figures cited from public recordings are explicitly not a violation.
- ⚠️ See the private-individuals-in-comments item above (Input Validation) — same underlying provenance question, filed here too because it's a disclosure risk, not just a rendering risk.

**Third-Party Embed:**
- **Unverified — not yet built.** No YouTube (or other video) iframe embed exists anywhere in this spec's surface yet; I could not review actual `sandbox`/`allow`/`referrerpolicy` attributes, postMessage origin validation, or seek-mechanism code because none of it has been written. What I can say from the existing codebase:
  - **There is no established secure-iframe pattern in this repo to inherit.** Every existing iframe (`intro-page.tsx:92`, `chiang-mai-page.tsx:69`, `letter-live-overlay.tsx:15`, the embed HTML string generator in `ShareDialog.tsx:60`) sets `src`, dimensions, and `title` only — **none sets `sandbox`, `allow`, or `referrerpolicy`.** The new embed cannot copy an existing pattern and be safe; it needs sandbox attributes (at minimum `allow-scripts allow-same-origin allow-presentation`, scoped to what the YouTube iframe API actually requires) and an explicit `allow` policy (`accelerometer`, `encrypted-media`, `picture-in-picture` as needed, nothing broader) designed fresh, not copy-pasted from a page that never needed it.
  - **`ShareDialog.tsx:60-61` already has a postMessage listener pattern to model from** (`window.addEventListener("message", ...)` checking `e.data.type === "claritypledge-embed-resize"` and comparing `f.contentWindow === e.source`) — but note this listener does **not** check `e.origin`, only that the source window matches a specific iframe element. That's an acceptable pattern for a resize-height message (low consequence if spoofed) but is **not sufficient to copy verbatim** for a seek-to-timestamp mechanism if the eventual design sends commands *into* the YouTube iframe via postMessage (as the YouTube IFrame API requires) — the *outgoing* postMessage should target the specific known origin (`https://www.youtube.com`) explicitly via `postMessage(msg, 'https://www.youtube-nocookie.com')` rather than `'*'`, and if the page ever listens for *incoming* messages from the player (state/ready events), it must validate `event.origin` against the YouTube embed origin before trusting `event.data`. Neither direction has been designed yet.
  - **Clickjacking:** an embedded cross-origin player sitting inside a page that also renders machine-written argument text is a plausible overlay target (an attacker framing the ClarityPledge story page itself, not the YouTube embed, in order to trick a user into clicking somewhere on the page) — but this is a property of the *page*, not the embed, and existing pages already carry this general exposure or lack of it depending on `X-Frame-Options`/CSP, which I did not check as part of this review (out of scope: unrelated to what P1141 changes). Flagging only because "cross-origin iframe on a page with machine content" was named explicitly in the brief — the iframe being embedded does not increase ClarityPledge's own clickjacking surface; what would increase it is a change to how the *story page itself* can be framed, which this spec doesn't touch.

**Markdown Narrowing (dedicated section):**
- **The narrowing is supported by the 2026-08-20 finding's *scope*, but the finding does not support "narrow to bold/breaks/blockquotes/headings + link-match" as a *sufficient* fix — it only identifies the link-spoofing vector.** Verified the finding itself: `docs/decisions.md:837`, "A markdown link inside a quote publishes a disguised link under a real person's agent story. `linkify.ts:17` emits an anchor whose label is independent of its href, and `/slava:disagreement:prepare` harvests comment sections. At the gate the operator reads raw text; the viewer sees a clean link elsewhere. XSS is blocked; phishing under a named person's account was not." This is exactly what the spec says it is: one finding, about link labels, not about bold/headings/blockquotes, which the finding never mentions and never needed to reject. **The spec's characterization of the finding is accurate.**
- **What the relaxed renderer can newly emit that the flat ban prevented, beyond the link case already covered above:**
  - Headings and blockquotes styled as UI chrome inside user/harvested-derived content — a comment-sourced quote rendered as an `<h1>` or blockquote could visually impersonate the page's own structural elements (a fake "Editor's note:" blockquote, a fake section heading breaking up the argument to look like a second, unrelated claim). This is a **visual-spoofing** risk distinct from the link-phishing one the finding named, and the spec doesn't address it. Lower severity than the link case (no destination to steal a click toward), but it's a new capability the ban was also implicitly preventing and the spec's narrowing doesn't discuss it at all.
  - Line breaks/bold inside a *quote* (not the argument prose) could be used to make harvested comment text visually mimic the "Byline"/"Quotes section heading" typographic treatment (**bold** text matching the weight of `Supporting quotes from {Full Name}`), again a spoofing-adjacent risk the flat ban foreclosed and the narrowing reopens, not discussed in the spec.
  - Both of the above are **markdown structure applied to content whose *source* is attacker-influenced** (harvested comments), which is the operative risk class throughout this review — the finding's own text names this precisely ("`/slava:disagreement:prepare` harvests comment sections") and the same provenance applies beyond just links.
- **The narrowing's implementation does not exist yet** (see Input Validation above) — the label/destination match is a new mechanism, not a restriction of an existing one, and its correctness against homograph/reference-link/normalization-timing bypasses is entirely unverified because there is no code to check. Recommend the architecture doc pin down: (1) which renderer function implements the check (reuse `safeMd`, don't hand-roll a third), (2) exact match semantics (parsed-URL comparison, not raw string), (3) explicit rejection of reference-style link syntax if not intentionally supported, (4) a homograph/mixed-script check on the destination host as a *separate* rule from label-matching, since label-matching cannot express it.

**Additional — sealed-letter snapshot path (per the brief's item 6):**
- ✅ Confirmed the mechanism: `seal_and_send_letter` (`SECURITY DEFINER`, redefined across many migrations) denormalizes `stories.image_url` into `letter_story_snapshots.point_config` JSONB at seal time (`supabase/migrations/20260418120000_p751_letter_snapshot_image_url.sql`). This is real, load-bearing, and matches the spec's claim that the letter path "carries its own copy of story media."
- ⚠️ **The "broken twice" the spec references is directly verifiable, and its root cause is exactly the risk this spec's whole approach depends on avoiding.** `p751` added `imageUrl` to the snapshot JSONB; a later redefinition of the same function silently dropped the key (evidenced by `supabase/migrations/20260425183500_p819_seal_rpc_restore_imageurl.sql`, which re-adds it, plus a backfill migration `p777_backfill_letter_snapshot_image_url.sql` for rows sealed while the field was missing). This function has been redefined by at least a dozen subsequent P-numbers after P751/P819 (P833, P897/P898, P904, P914, P952, P964, P975, P977/P979, P1066, P1067...) — **any one of those redefinitions is a candidate to have silently dropped the field again**, and I did not diff the *current* live definition against the P819 one to confirm `imageUrl` is still present today (that check is straightforward — `grep imageUrl` in the latest migration that touches this function — but out of scope for a spec that hasn't added the video field yet). **This is the single most concrete, evidenced risk in the whole review for "MITIGATE: a letter sealed before this change must render identically after it"**: the mechanism that already broke this exact class of field, twice, on the exact same function, is the mechanism the new video-reference field will also have to be threaded through. Recommend: when building, (1) grep the current live `seal_and_send_letter` body for `imageUrl` first to confirm it's still present (baseline correctness check before adding a new field alongside it), and (2) add a migration-time or CI assertion that the snapshot JSONB's key set is a superset of `{imageUrl, videoRef, ...}` rather than relying on manual review of a function that has been redefined a dozen-plus times.
- **Unverified:** whether a sealed letter could be made to render something it did not originally contain — this would require the snapshot to reference *live* story state rather than a point-in-time copy. Given the JSONB is denormalized (copied values, not a live join) at seal time, the structural answer is "no, by design" — but I did not check whether the eventual video-reference rendering component, when given a snapshot's `videoRef` value, re-resolves anything live (e.g., re-fetching current thumbnail/title from YouTube by ID at render time rather than using only what's in the frozen snapshot). If it does, that reintroduces exactly the "renders something it did not originally contain" risk for a field that's supposed to be immutable. Flag as an implementation-time check, not a current defect (nothing to check yet).

**Additional — the verified-count hide (per the brief's item 7):**
- ✅ **Purely cosmetic, confirmed by reading the actual hook.** `useAgentAccountIds()` (`src/app/contexts/agent-accounts-context.tsx`) is a client-side registry fetched once per app session (`getAgentAccounts()`), exposed as a synchronous `Set` membership test. It gates **rendering only** — nothing about the write path (`story_verifications` INSERT, the `Verify` button's underlying RPC) is closed by this lookup; it purely decides whether a UI badge/button is drawn. This matches every existing consumer (`story-card-with-links.tsx`, `StoryCardDetail.tsx`, `feed-story-card.tsx`, `point-detail-page.tsx`, `profile-page-v2.tsx` — all read-path only, all pre-existing from P1104, none of them touch a write path).
- ✅ **Fail-closed as designed**, and this matters for the new consumer P1141 adds: `isLoading` stays `true` forever on fetch failure (deliberate, documented in the file's own header), so a page that gates render on `isLoading` will keep showing its existing loading state rather than ever mis-classify an agent story as human (or vice versa) due to a registry fetch failure. P1141's new "hide `0 verified` and Verify affordance for agent stories" consumer must hold render on `isLoading` the same way every existing consumer does, or it inherits the opposite failure: a slow/failed registry fetch would let an agent story render the (structurally-forgeable, per the RLS finding above) verified count and a live Verify button before the registry resolves.
- ⚠️ **The underlying write path is not "closed to agent accounts" — it's merely unreached in practice by the live-session UI, and (per the RLS finding above) not actually closed by the database either.** The spec's own words — "structurally unreachable" — describe the *live-session flow* (an agent can't sit in a `/live` session and rate a listener), which is true as an *application* fact. It is not true as a *database* fact: nothing in `story_verifications`' RLS references `stories.author_id` at all, so nothing stops a human account from forging a `story_verifications` row against an agent story with themselves as `speaker_id`. This doesn't undermine the P1141 UI change (hide unconditionally, not hide-when-zero), but it does mean the security argument the spec makes for *why* hiding is safe ("the count has no path to ever exceed zero") is incorrect, and should not be relied on to justify skipping a defense-in-depth check elsewhere. Recommend noting this distinction explicitly in the shipped spec rather than carrying the "structurally unreachable" framing forward as if it were DB-enforced.

---

#### Summary of what I could NOT verify (explicitly unverified, not asserted)
1. The actual DDL of the new video-reference column (doesn't exist yet).
2. Whether `imageUrl` currently survives in the live `seal_and_send_letter` definition today (grep-able, not done in this pass — scoped out since the video field isn't added yet).
3. Whether `/slava:disagreement:prepare`'s comment-harvesting logic already filters third-party (non-subject) identifiers before selecting quote/argument material — I did not read that skill file end-to-end.
4. Any postMessage/seek implementation, sandbox/allow attributes, or the label/destination match algorithm — none of this code exists yet; reviewed as *requirements* only.
5. Marked's exact tokenizer routing for autolinks/reference-links in this codebase's pinned `marked` version (whether they go through the same `link()` renderer override as inline links) — would need a quick runtime check once the renderer is actually built.

**Flagged for that review, not resolved here:** (1) `video_url` needs a host allowlist (`youtube.com`/`youtu.be`/`youtube-nocookie.com` only) enforced before any value reaches an `<iframe src>` — `parseVideoUrl()` returning `null` for anything else is the intended enforcement point, but confirm no path can bypass it, especially given the Non-Goals text deliberately keeps a future user-facing paste-a-link path open. (2) The link label/destination match logic in `linkify.ts` (Decision 8) is the direct fix for the 2026-08-20 finding — confirm the normalization can't be bypassed (encoded characters, whitespace, mixed case) to still show a mismatched label as clickable. (3) The sealed-letter three-layer contract (Decision 7) has a documented two-time-plus-a-regression history of silently dropping a field; confirm the new `CRITICAL_PREDICATES` entries actually fail the canary when the key is missing (per epistemic gate 7, exercise the failure path, don't just add the assertion).

### Implementation Approach

**Worktree recommended:** this spec touches two `.claude/commands/slava/content/` skill files, a database migration, the sealed-letter RPC + mapper, and 10+ `src/` files across cards/feed/profile/detail surfaces — well past the single-worktree-slot threshold.

#### Build Sequence

1. **Database migration** — `stories.video_url` + `stories.video_quotes` (Decisions 1, 2). Run `./scripts/migrate.sh`.
   **Include a format CHECK constraint on `video_url`** (security review, RLS §1). The `stories`
   INSERT policy is row-scoped and does not constrain any column's *value*: any authenticated,
   verified profile can set this column to an arbitrary string through a raw REST insert, and the
   UI not exposing an input is not an enforcement boundary. The constraint is required regardless
   of setter identity — see the Non-Goal note above.
2. **Sealed-letter contract** — new `seal_and_send_letter` migration (Decision 7), `letter-snapshot-mapper.ts` updates, `sd-guard-completeness.test.ts` `CRITICAL_PREDICATES` entry, new canary test. Exercise the canary's failure path before moving on (drop the key locally, confirm the test fails, per epistemic gate 7).
3. **`src/lib/video.ts`** — `parseVideoUrl`, `getEmbedUrl`, `getThumbnailUrl`, `getTimestampUrl`, `loadYouTubeApi` (Decisions 1, 3, 9). Unit-testable in isolation, no DOM dependency for the URL functions.
4. **Shared components** — `StoryVideoPlayer` (Decisions 3, 4), `VideoThumbnailCard` (Decisions 6, 9), `StoryMedia` (Decision 5), `StoryVideoQuotes` (the quotes section + seek wiring), `AgentByline` + `MachineChip` + `AgentStoryFooter` (reusing `stripAgentPrefix()`).
   **`StoryVideoPlayer` must be designed fresh, not copied** (security review, Third-Party Embed).
   Every existing iframe in this repo (`intro-page.tsx:92`, `chiang-mai-page.tsx:69`,
   `letter-live-overlay.tsx:15`, `ShareDialog.tsx:60`) sets only `src`/size/`title` — **none sets
   `sandbox`, `allow`, or `referrerpolicy`.** There is no secure pattern here to inherit. Required:
   an explicit `sandbox` scoped to what the IFrame API actually needs, a narrow `allow` policy, a
   `referrerpolicy`, **outgoing `postMessage` targeting the literal player origin — never `'*'`**,
   and `event.origin` validated on any inbound message. `ShareDialog.tsx:60`'s listener checks
   `contentWindow === e.source` but **not** `e.origin`; adequate for a resize hint, not for a
   seek-command channel — do not copy it verbatim.
5. **Wire the detail surfaces** — `story-detail-page.tsx`, `StoryCardDetail.tsx`'s detail-mode render (live player + quotes + agent byline/footer + `isAgent` gate on `UnderstoodBadge`/Verify at all 3 of its agent-check sites).
   **Gate on `identityPending`, not on `isAgent` alone** (security review, verified-count hide).
   `useAgentAccountIds()` keeps `isLoading` true forever on fetch failure — deliberately
   fail-closed — and every existing consumer holds render on it. A new consumer that reads
   `isAgent` while the registry is still loading renders an agent story as a human one, complete
   with the count this spec removes.
6. **Wire the card/feed/profile surfaces** — `story-card-with-links.tsx`, `feed-story-card.tsx`, `profile-page-v2.tsx` (thumbnail-mode `StoryMedia`, `isAgent` gate on their `UnderstoodBadge`/Verify sites, `AgentByline`).
7. **Wire the letter-reading surface** — `explain-back-view-page.tsx` (or the correct reading page) sourcing `StoryMedia`/`StoryVideoQuotes` from the mapper's snapshot output (Decision 7).
8. **Crawler card** — `api/og.ts` `STORY_COLUMNS` + `ogForStory()` (Decision 9).
9. **Markdown narrowing** — `linkify.ts` (Decision 8), including the label/destination match.
   **The match is a net-new check, not a tightening** (security review, Input Validation): no
   label/destination comparison exists anywhere today — `safeMd`'s `link()` override
   (`src/lib/markdown.ts:161-167`) validates the *scheme* only, and `linkify.ts`'s
   `MARKDOWN_PATTERN` treats label and href as independent strings. Naive `text === href` is
   insufficient. Required, each verified by its own test:
   (a) compare **parsed URLs** via the same `new URL()` parser `sanitizeHref` uses — post-parse,
       never raw-string, or percent/punycode encoding splits what the check saw from what the
       browser renders;
   (b) a **separate** mixed-script / confusable check on the destination host — a homograph domain
       (Cyrillic `а` in `аpple.com`) is byte-identical in label and href and passes any match rule,
       so matching cannot express this;
   (c) **reference-style links** (`[text][ref]`) — `marked` supports them and the current regex
       does not see them at all; reject explicitly if unsupported;
   (d) **autolinks** (`<https://…>`) trivially satisfy any match — confirm the scheme allowlist
       still applies to autolink tokens in this codebase's pinned `marked` version, by test, not
       assumption;
   (e) compare the **raw label token**, not the rendered label, so nested markup
       (`[**Real Site**](https://evil.com)`) cannot diverge the comparison from what the reader sees.
   **Decision 8's choice of `linkify.ts` over `marked`/`dangerouslySetInnerHTML` exceeds the
   security review's recommendation and should be held** — it keeps the React-element trust model
   under which harvested HTML is inert by construction, rather than relying on renderer overrides
   to strip it.
10. **Skill updates** — `prepare.md` (voice rules, label, raw-`.vtt` timecode extraction — Decision 10), `publish.md` (Quality Gate line, row-shape update for `video_url`/`video_quotes`).
    **Open provenance question, not resolved by this spec** (security review, Data Protection):
    `/slava:disagreement:prepare` harvests YouTube comment sections, which are written by arbitrary private
    individuals. If a comment carrying a third party's name or handle is selected as quote material,
    it publishes a private individual's identifier on a public page — a `.claude/rules/pii.md`
    violation that the public-figure exemption does not cover. The security agent flagged this as
    **unverified** (it did not read the skill's selection logic end to end). Answer it during this
    step, or scope it out in writing — do not let it pass silently.
11. **P1096 pointer update** (Decision 11), `docs/technical/database.md` schema doc update.
12. **End-to-end verification** — one real story, every timecode played and checked against the source (Done-When), at desktop/375/320 against the approved visual reference.

#### Files to Create

- `supabase/migrations/<timestamp>_p1141_stories_video_reference.sql`
- `supabase/migrations/<timestamp>_p1141_seal_rpc_video_fields.sql`
- `src/lib/video.ts`
- `src/app/components/shared/story-video-player.tsx`
- `src/app/components/shared/story-video-quotes.tsx`
- `src/app/components/shared/story-media.tsx`
- `src/app/components/shared/video-thumbnail-card.tsx`
- `src/app/components/shared/agent-byline.tsx`
- `src/app/components/shared/machine-chip.tsx`
- `src/app/components/shared/agent-story-footer.tsx`
- `src/tests/p1141-seal-rpc-video-canary.test.ts`

#### Files to Modify

- `src/app/components/social/StoryCardDetail.tsx` — all 3 agent-gate sites, image→`StoryMedia` swap, quotes section, `UnderstoodBadge`/Verify gating, byline/footer
- `src/app/components/social/story-card-with-links.tsx` — same treatment, card mode
- `src/app/components/feed/feed-story-card.tsx` — card mode, `UnderstoodBadge` gating
- `src/app/pages/profile-page-v2.tsx` — card mode across its 4 agent-check sites
- `src/app/pages/story-detail-page.tsx` — live player + quotes mount point
- `src/app/pages/explain-back-view-page.tsx` — letter-reading surface sourced from the snapshot mapper
- `src/app/utils/linkify.ts` — bold/breaks/blockquote/heading + label/destination match
- `src/app/utils/letter-snapshot-mapper.ts` — `PointConfig` + both mapper functions
- `src/tests/sd-guard-completeness.test.ts` — new `CRITICAL_PREDICATES` entries
- `src/app/types/index.ts` / `src/app/types/supabase.ts` — `video_url`, `video_quotes`, `VideoQuote`, `StoryVideoQuotes` types
- `api/og.ts` — `STORY_COLUMNS`, `ogForStory()` thumbnail derivation
- `.claude/commands/slava/disagreement/prepare.md` — voice rules, quotes-section label, raw-`.vtt` timecode extraction
- `.claude/commands/slava/disagreement/publish.md` — Quality Gate line, row-shape update
- `features/p1096_public_multisource_point_pipeline.md` — non-goal pointer update
- `docs/technical/database.md` — new `stories` columns documented

## Resolved Decisions

Taken 2026-08-21 in the `/goalify` decision sweep. **Append-only** — nothing above this line
was rewritten.

**RD-1 — The agent-story footer, verbatim.** The UI Contract required two sentences and named
none. Decided:

> A machine account operated by ClarityPledge wrote this reading of {Full Name}. Nothing here
> is {Full Name}'s own words except the quotes, which come from the linked video.
>
> `How machine accounts work →`

Leads with the machine, names the quote exception second, and the link label is the third
element the UI Contract already called for. `{Full Name}` interpolates the same value the
byline uses.

**RD-2 — The explainer link resolves to a new `/machines` holding page.** No explainer route
exists today: `grep '<Route' src/App.tsx` returns no `/machines`, no `/agents`, and
`content/articles/` carries no agent-explainer piece. Done-When requires the footer link to
**resolve**, so this spec adds the route and a one-paragraph holding page — and nothing more.
The Non-Goal *"Do NOT write the explainer page's content here"* stands: the page's real
content is separate work, and this decision exists so the URL is stable when that work lands.
Pointing at `/about` was rejected — it resolves and tells the reader nothing about machine
accounts, which is a link that works and misleads.

**RD-3 — Harvested comment text is not filtered for third-party identifiers.** The architect's
security review flagged that `/slava:disagreement:prepare` harvests comment sections written by private
individuals, and that `publish.md:181` documents comment text surviving into a quoted
span in `stories.content`. **The founder ruled 2026-08-21 that a public comment on a public
video is public speech and is quotable, and that no filter is warranted.** Recorded as a
decision, not as an open gap — do not re-raise it inside this spec's build.

The distinction the ruling covers, stated once so a later reader is not guessing at its scope:
it covers the commenter's own words. The narrower case the review actually raised — a person
*named inside* someone else's comment, who never posted — is covered by the same ruling.
Nothing in P1141 widens either path: comments feed the **opposing-camp** stage, and this
spec's quotes section carries **subject-transcript** quotes only.

**RD-4 — The loop may run `./scripts/migrate.sh` against the TEST database.** Without it the
sealed-letter contract — the surface this spec's own Appetite names as the sharp edge, already
broken twice — would reach `/ship` never having been exercised against a real database. Prod
migration remains ALWAYS-ASK and is not pre-approved by this decision.

## Verification Contract

**Pinned to main.** The gate reads this section's digest from `main`, never from the branch it
is judging — otherwise a loop can delete the row it is about to fail. Adding a heading inside
this section breaks the digest; put new prose above it.

**19 rows over the 13 Done-When and 4 Acceptance-Criteria lines: 14 MECHANICAL, 2 COMPARABLE,
3 HUMAN-ONLY.** HUMAN-ONLY is 15%, under goalify's 25% refusal bar. All three HUMAN-ONLY rows
are the same class of thing: they need a story to have been **filed**, which means running the
publish pipeline under an agent account — an external, irreversible, ALWAYS-ASK action the
loop may not take. They are not taste; they are out of the loop's reach by design.

| line | class | decided by | artifact |
|---|---|---|---|
| DW-1 player renders where the picture used to be; DW-5 card and off-site surfaces get the thumbnail with a play affordance and link into the story | MECHANICAL | `npx vitest run src/tests/p1141-story-media.test.tsx` | src/tests/p1141-story-media.test.tsx |
| DW-2 a timecode seeks in place and brings the player into view with no reload; DW-3 a blocked player still renders the whole story and every timecode opens the source at the right second; AC-1 one click to check a quote | MECHANICAL | `npx vitest run src/tests/p1141-video-seek.test.tsx` | src/tests/p1141-video-seek.test.tsx |
| DW-4 an absent or unparseable video is treated exactly as today; the host allowlist is the enforcement point and nothing bypasses it | MECHANICAL | `npx vitest run src/tests/p1141-video-lib.test.ts` | src/tests/p1141-video-lib.test.ts |
| DW-7 byline, machine chip and the RD-1 footer render with a resolving RD-2 link; DW-12 no verified count and no Verify affordance on an agent story, a human story unchanged, render held while the registry is still loading | MECHANICAL | `npx vitest run src/tests/p1141-agent-story-chrome.test.tsx` | src/tests/p1141-agent-story-chrome.test.tsx |
| DW-8 structure renders, and a link whose label differs from its destination does not render as a link across all five bypass classes the security review enumerated | MECHANICAL | `npx vitest run src/tests/p1141-linkify-structure.test.tsx` | src/tests/p1141-linkify-structure.test.tsx |
| DW-6 the seal RPC writes videoUrl and videoQuotes, and imageUrl still survives alongside them | MECHANICAL | `npx vitest run src/tests/p1141-seal-rpc-video-canary.test.ts` | src/tests/p1141-seal-rpc-video-canary.test.ts |
| DW-6 the three-layer snapshot contract holds and a letter sealed before this change maps identically after it | MECHANICAL | `npx vitest run src/tests/p1141-letter-snapshot-contract.test.ts` | src/tests/p1141-letter-snapshot-contract.test.ts |
| DW-6 the generalized SECURITY DEFINER canary still passes with the new predicates added | MECHANICAL | `npx vitest run src/tests/sd-guard-completeness.test.ts` | src/tests/sd-guard-completeness.test.ts |
| DW-5 the crawler card derives the thumbnail from the video and falls back to banner_url when absent | MECHANICAL | `npx vitest run src/tests/p1141-og-video-thumbnail.test.ts` | src/tests/p1141-og-video-thumbnail.test.ts |
| DW-11 the voice rules and the section label live in exactly one skill with the choice stated; DW-13 timecodes resolve from the retained raw caption file and never from the cleaned transcript; the P1096 non-goal points here; every UI Contract and RD-1 string appears verbatim | MECHANICAL | `npx vitest run src/tests/p1141-pipeline-rules.test.ts` | src/tests/p1141-pipeline-rules.test.ts |
| DW-4 nothing else regressed — the whole unit suite is the baseline, green at pin time | MECHANICAL | `npx vitest run` | package.json |
| DW-1 DW-2 DW-3 DW-4 DW-12 AC-1 driven on the real route with real auth at 320, 375 and desktop | MECHANICAL | `npx playwright test e2e/p1141-story-video.spec.ts` | e2e/p1141-story-video.spec.ts |
| the video_url CHECK constraint rejects a non-allowlisted host through a raw REST insert; video_quotes defaults to the empty shape; the sealed snapshot carries both keys under a real database | MECHANICAL | `npx playwright test e2e/integration/p1141-video-schema.spec.ts` | e2e/integration/p1141-video-schema.spec.ts |
| no test in this set is neutered — no it.fails, no test.fails, no .skip( — and the row fails when the files are absent, not passes vacuously | MECHANICAL | `bash -c 'ls src/tests/p1141-*.test.ts* >/dev/null 2>&1 && ! grep -rqE -e "it\.fails" -e "test\.fails" -e "\.skip\(" src/tests/p1141-*'` | src/tests/p1141-*.test.ts* |
| AC-2 a reader can tell at a glance which words the machine wrote and which were quoted | COMPARABLE | blind-reviewer | features/verification/p1141/review-round-*.md |
| AC-3 a reader arriving from email or a shared link sees the video is a video and reaches the story to play it | COMPARABLE | blind-reviewer | features/verification/p1141/review-round-*.md |
| DW-9 filed story text uses the subject's full name and carries no pronoun referring to the subject | HUMAN-ONLY | founder | — |
| DW-10 for one real story, every timecode lands within a few seconds of the words it points at, verified by playing it | HUMAN-ONLY | founder | — |
| AC-4 nothing a reader sees claims the named person holds the position the agent states | HUMAN-ONLY | founder | — |

### The blind reviewer

**It must not be the agent that built the thing.** That is the one durable constraint here:
every defect across the four rounds P1083 needed was found by a reviewer given renders and
nothing else, and every rejected version had already passed its own implementer's review.

**Given:** the approved visual reference
(`https://claude.ai/code/artifact/6c28e57e-cb11-4144-b99f-7312428714de`) as the named
reference, and renders of the built surfaces at **320px, 375px, desktop, and the empty state**
— story page with the player loaded, story page with the player blocked, a story with no
quotes, a feed card, an off-site thumbnail card, and an untouched image-path story.

**The real-route render is owed and the artifact does not discharge it.** The reference is
static markup, and the spec says so on its own page. Renders must come from the real route
driven with real auth (`getTestAuthContext()` in `e2e/helpers/auth-context.ts`), not from a
component fed mock props — a component in isolation cannot reach the gated states where every
recorded UI complaint has come from.

**Judge the player's own chrome in the browser.** The reference's player is a stand-in; a
published page cannot load an external embed, so the real player's chrome and aspect
behaviour are unverified by the reference and must be judged against the build.

**Matching tokens is necessary and not sufficient.** The reference's own fidelity pass caught
a 4px `blue-500` left rail on production story cards that a 15/15 colour-token diff had
missed. A surface can use every correct value and still not look like the product.

**Forbidden:** the diff, the spec, the rationale, this contract, and any statement of what the
build was trying to do.

**Writes** `features/verification/p1141/review-round-N.md` itself: `VERDICT: PASS|FAIL`, then
one `SCREENSHOT: <sha256>  <path>` line per image judged. The gate re-hashes every image and
never trusts a hash it is handed.

### Evidence

| file | holds |
|---|---|
| `contract.sha256` | the pin |
| `review-round-N.md` | the verdict and the image hashes |
| `assumptions.md` | every call the loop made alone. There is no escalation clause — the agent decides, logs, continues. The log is the price of not being interrupted |
| `feedback.md` | **two numbers**: corrections given, and turns consumed. Quality bought with runaway spend reads as success on a one-axis scoreboard |
| `features/uat/p1141.md` | the UAT scorecard. The gate fails on an unmarked row and on a skip whose reason is outside `NOT-BUILT / ENV-UNAVAILABLE / HUMAN-ONLY / SUPERSEDED`. It does not exist yet — this spec never ran `/generate-tests` |

### Red-first (run 2026-08-21, before the loop existed)

| command | result at pin time |
|---|---|
| `npx vitest run src/tests/p1141-video-lib.test.ts` | **exit 1** — `No test files found`. Same for all nine `p1141-*` vitest rows: the files do not exist |
| `npx playwright test e2e/p1141-story-video.spec.ts` | **exit 1** — `No tests found`. The webserver did start, so the local tier is live, not aspirational |
| the anti-cheat row | **exercised on all three paths**: exit 1 with no files, exit 0 with a clean file, exit 1 with `it.fails` present. A first draft of this row passed *vacuously* when the files were absent — `grep`'s error inverted to success under `!`. Rewritten to require the files first |
| `npx vitest run` | **exit 0** — 274 files, 3054 tests. Green **by design**: this row is a regression baseline, not a red-first assertion, and it is labelled as such |
| `npx vitest run src/tests/sd-guard-completeness.test.ts` | **exit 0** — the existing canary passes and must keep passing once extended. Its failure path is **unproven at pin time**; per epistemic gate 7 the build must drop the key locally and watch it go red before this row counts as evidence |

**Unproven at pin time, flagged rather than counted as evidence:** the nine `p1141-*` vitest
rows fail only with *"no test files found"* — a genuine non-zero exit, but it proves the
absence of a file, not that any assertion has teeth. This spec never ran `/generate-tests`, so
unlike P1114 there is no red-with-real-assertions baseline behind them. The two Playwright
rows additionally need a seeded story carrying a video and the RD-4 test migration applied.

---

## Three acceptance rows ship OPEN, and this says which

Fourteen of the seventeen Acceptance-Criteria / Done-When rows are ticked, each against the
evidence named in its row of `features/uat/p1141.md`. **Three are deliberately NOT ticked:**

- DW-9 — filed story text uses the subject's full name and no pronoun referring to them
- DW-10 — for one real story, every timecode lands within a few seconds of the words it points at
- AC-4 — nothing a reader sees claims the named person holds the position the agent states

All three need a story **filed** through the publish pipeline under an agent account. That is an
external, irreversible action requiring explicit founder approval, so no agent may take it to
close its own acceptance row. The MECHANISM behind each is asserted mechanically — the pronoun
rule lives in exactly one skill and `p1141-pipeline-rules.test.ts` pins that; timecodes are
resolved from the retained raw caption file, never the cleaned ~30s transcript, and that is
pinned too. What is unverified is the OUTPUT: the actual filed text, and whether a real timecode
lands on the words it claims.

They are recorded open rather than ticked because a ticked box is a claim of evidence, and there
is none for these. Closing them is a founder action: file one story, read it, play it.

AC-2 and AC-3 (the COMPARABLE blind-reviewer rows) ARE ticked. `features/uat/p1141.md` marks them
`ENV-UNAVAILABLE`, which `features/verification/p1141/assumptions.md` A-16 later supersedes: the
contract itself prescribed the mechanism the loop had written off, five blind review rounds then
ran, and they found eight real defects. The scorecard row is stale; A-16 is the current state.

## Amendment — 2026-08-24, after founder review in a real browser

### Amendment 2 — one name, every surface

Founder review of `/p/machine-daniel-bar-tal`: the profile header read `Agent · Daniel Bar-Tal`
while the feed card for the same account read `Machine reading of Daniel Bar-Tal`. A survey found
**fourteen places that name an agent account, of which only three used `AgentByline`** — the
other eleven printed the raw stored name: the profile header and three card rows in
`profile-page-v2.tsx`, both point stance rows in `point-detail-page.tsx`, two rows each in
`story-card-with-links.tsx` and `StoryCardDetail.tsx`, and one in `point-card-with-links.tsx`.
The same account therefore had two identities, decided by which page the reader was on.

Counted, not estimated — `grep -rn "<AgentByline" src/app` returns 14 today and returned 3 at
`be04fae0`. An earlier draft of this paragraph said "ten surfaces"; that was a loose count of
rendering contexts rather than call sites, and code review caught it.

All fourteen now render `AgentByline`. Three consequences the UI Contract row above now carries:

1. **`reading of` is not trimmable at any size.** Dropped, the marker lands on the person —
   `[Machine] Daniel Bar-Tal` reads as *Daniel Bar-Tal, who is a machine*. The risk is highest on
   the profile header, the one surface whose whole job is identity and the one likeliest to be
   mistaken for the subject's own account, which is why `lg` carries the same three parts as `sm`.
2. **No handler means no button.** Nine of the ten sites sit inside a card that is itself the
   link, so the name renders as a `<span>`. A `<button>` with nothing behind it is the dead-control
   defect the visual-QA checklist blocks by name, plus a phantom tab stop.
3. **The stored name is unchanged and still carries `Agent · `.** Every `aria-label` is built from
   it, so WCAG 2.5.3 (Label in Name) needs re-checking rather than assuming: the visible label is
   now `Machine reading of {Name}` while the accessible name is `{Agent · Name}'s profile`. The
   visible string is no longer a substring of the accessible one. See the a11y note below.

**WCAG 2.5.3 — re-derived, not assumed.** 2.5.3 binds the accessible name to contain the visible
*text of the label* for speech-input users. The interactive element here is the name alone
(`{Full Name}`), not the whole byline: the chip and the connective are static text siblings, not
part of any control's label. `Daniel Bar-Tal` remains a substring of
`Agent · Daniel Bar-Tal's profile`, so 2.5.3 holds. It would NOT hold if the chip or connective
were ever moved inside the interactive element.


The build was driven against real seeded data and the founder reviewed it on screen. Four
things in the UI Contract changed as a result. Recorded here as an amendment rather than
edited away silently, because `src/tests/p1141-pipeline-rules.test.ts` binds this document to
the code and a future reader needs to know these strings moved.

This is a **spec edit, not a change-request**: P1141 has never been merged to `main` and has
never shipped, so there is no delivered behaviour to file against.

1. **The byline is `[MACHINE] reading of {Full Name}`, and only the name is clickable.**
   Previously `Reading of {Full Name}` with the chip beside it — but every call site wrapped
   the whole byline in the profile-navigation button, which made the chip a link. A status
   marker that navigates is wrong: it invites a click that answers a question the reader did
   not ask. `Agent · {Name}` was considered and rejected for display — "agent" reads in
   English as *representative of*, the one implication an account bearing a real person's name
   must never carry. The stored name keeps its `Agent ·` marker, which the database enforces
   and every off-platform surface still reads.

2. **The quotes-section meta line is deleted.** It read `{n} marks · {duration}`. The count is
   visible by looking, and the video's total length answers a question nobody asked at that
   position.

3. **The drain is scoped to the identity cluster, never to content or controls.** See the
   amendment note in `src/index.css`. On story surfaces this removes the colour channel
   entirely; the remaining non-colour markers are the square avatar, the chip and the footer.

4. **No trailing `Source:` line in filed story text.** The embedded player and the per-quote
   timecode links already carry the source, and under this spec's own link narrowing such a
   sentence renders as dead plain text because its label does not match its destination.

## Deferred — first-run checks moved to P1172

Three criteria on this spec described a **future run**, not the artifact: they required a filed
agent story that does not exist yet. They cannot be checked at ship time and would block this spec
permanently. Moved verbatim to **P1172**, which names its trigger (the first real agent story is
filed). Moving them does not discharge them — they are still owed.
