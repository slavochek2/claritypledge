---
status: week
type: story
rank: 53
workstream: clarity-canvas
created_date: '2026-10-21'
tags: [canvas, agent, sales-mastermind, onboarding]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1536: Clarity Canvas, first draft from the owner's own material

## Problem

**Situation:** The sales mastermind (`docs/goals.md` 3a) runs on each attendee's Clarity Canvas.
The canvas page is live (P1508), the nine-box set is being redesigned (P1535), and sharing a canvas
with an event is being built (P1515). The only way to get a canvas filled today is by hand: an agent
writes a markdown draft and `scripts/seed-p1508-canvas-drafts.mjs` loads it, on the test database
only.
**Complication:** Nobody wants to type their canvas, and nobody should start from a blank page
(brief decision 2026-10-14). goals.md 3a names "a small Clarity Chat step that turns each attendee's
material into a first canvas draft (to be specced)" as one of the three builds the event needs.
**Question:** How does an attendee give their agent whatever they already have about their offer
and get back a first canvas they recognise as theirs?

> Founder, 2026-10-21: "specs for material to first canvas draft, probably as done by agents, so you
> can upload stuff, appoint stuff, and then the agent does it for you. Maybe consumes markdowns, I
> guess. Well, consumes anything but practically converts to markdown and then consumes, or maybe
> links."

("appoint stuff" is read as *point to* stuff, i.e. links.)

## Appetite

Blast radius: one new flow, but it sends people's business material to an AI provider and writes
points into their account. Reversibility: medium (new edge function + one write function; drafts
are private rows that can be deleted). Decision density: a few founder calls (below).

## Solution

1. **Input.** The owner gives any mix of: files (PDF, deck, document, markdown, text), links
   (website, offer post, profile), and a free-text note ("what I sell, to whom"). Everything is
   converted to text (markdown) before the agent reads it.
2. **Draft.** The agent drafts the P1535 nine boxes as the owner's points, each with the owner's
   story in their voice, quoting or paraphrasing only what the material says. It writes **bets, not
   marketing**: "Agency owners with 5-20 staff will pay X for Y" rather than the site's slogan
   (P1535 found that self-description invites fluff). A box the material says nothing about stays
   empty and is shown to the owner as a question.
3. **Write.** One server-side call creates the canvas (P1515's canvas record) and its points,
   stories and the owner's own positions as **private**, in the owner's account, in one batch. This
   is the seed script's write logic moved server-side; P1515's w11 branch already has a private-points
   version of the seed (commit `1d7119934`).
4. **Review.** The owner lands on their canvas page. Accepting the draft = sharing it with the event
   (P1515); no separate "accept" state. Before sharing, the owner can re-run with more material or a
   correcting note, which replaces the unshared draft.

**Where: amended 2026-10-22 (founder). The draft happens in a thread with your mirror.**
Steps 1-4 above (the engine) are unchanged; only the entry point and the input path move.

- **+ Canvas** (the Artifacts page's create menu, P1545) and the event preparation's "Draft my
  canvas" step both open a **new thread with the owner's mirror** (threads in the mirror: P1546).
  The mirror opens the thread by asking for material: files, links, a note.
- **Upload in chat.** The composer gets an upload control next to the existing paperclip
  (`src/app/pages/chat/Composer.tsx:188`, today "Attach a point or story"), available in mirror
  threads. Files are converted to text (markdown) server-side and the originals are not kept
  (Invariant). Links and the note are ordinary messages in the thread.
- **The mirror runs the draft** when the owner says so in the thread (a "Draft my canvas" action
  under the mirror's reply, not a keyword), and replies with the result: a link to the canvas,
  the boxes left empty as questions, and any input it could not read.
- **Corrections after the first draft** are further messages in the same thread. Re-running before
  sharing replaces the draft (step 4).

> Founder, 2026-10-22: "when a person says new Clarity Canvas it opens a new thread with your Mirror
> Agent and the Mirror Agent says, hey, you know, upload stuff ... upload button near the paperclip
> where you can attach things or upload markdowns or whatever."

**Depends on P1544** (the mirror on prod and its privacy text) **and P1546** (threads in the mirror). Founder,
2026-10-22: "make the mirror launch before". The engine (steps 1-3) can be built and tested on the
test database in parallel; nothing goes live before P1544 is live.

[FOUNDER DECISION: the mirror's opening line in a new canvas thread, the upload control's label,
and what the thread says about where the material goes.]

## Box guide (v1, the drafting agent's brief)

What each P1535 box means and what a good draft point looks like. The agent's prompt is built from
this table; the founder edits it here first. Every point is a bet someone could disagree with.

| Box | What it means | A good point | Not this |
|---|---|---|---|
| Customer Segments | The specific people who pay, narrow enough to find ten of them | "Café owners with 1-3 shops who do their own books" | "Small businesses" |
| Problem | What hurts them today, in their words | "Every tax deadline turns into a panic" | A list of features |
| Solution | What you do about it | "Receipts by chat, books done monthly" | A slogan |
| Go-to-market strategy | Where these people are and how they first hear of you | "Two owner groups online plus one supplier's referrals" | "Social media" |
| Offers & Pricing | What they buy and for how much | "2,500 baht a month per shop" | "Affordable" |
| How I'll know it's working | A number and a date that would prove you wrong | "10 paying shops in three months" | "Growth" |
| Values | **Something you give something up for.** Proof is a cost you keep paying for it (founder, 2026-10-23: a value is "something you sacrifice for"; e.g. honesty that costs you long discussions with strangers, and you have them anyway) | "Intellectual honesty: I correct myself in public even when it loses the argument" | A word with no cost behind it ("integrity") |
| When my strengths become weaknesses | The trait that helps you and also hurts the business | "I'm precise, so I over-explain reports nobody reads" | A humble-brag |
| Who else wins when I win? | Who benefits beyond you and the customer | "Their accountant at tax time" | "The world" |

Material that shows no cost behind a value leaves Values empty and asks the owner the question
("What do you keep doing even when it costs you?").

## Invariants

- **Nothing invented.** Every point and story traces to the material or the owner's note. A box with
  no source stays empty. The seed format's `NO SOURCE FOUND` rule carries over.
- **Private until the owner shares.** A draft is never public and is readable only by its owner until
  the owner shares the canvas (P1515: no public switch, shared content only through checked functions).
- **`canvas:` system tags are written only by the service role** (decisions.md 2026-10-19).
- **Material is data, never instructions.** Text from a website or file cannot change what the agent
  does or where it writes. Proven by a real-model red-team test with a control, as P1520 did, not by
  unit tests.
- **No material goes to an AI provider in prod until the privacy policy names it.** Today
  `src/app/content/privacy.md:387` lists Gemini for the story guide, generated banners and
  transcription; canvas material is not among them. Same gate pattern as P1520:
  the server reports availability, and the client shows no draft control when it is off.
- **Original files are not kept** after the draft is written.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Login-walled links (LinkedIn) return nothing | MITIGATE | Say which link could not be read; ask for a PDF export or pasted text |
| Draft echoes marketing copy instead of bets | MITIGATE | Prompt writes falsifiable bets; checked on 3 real attendees' material before the event |
| Wrong box for a point | ACCEPT | Owners correct it in session 1, in pairs; that correction is the design input for the mirror |
| Prompt injection through material | MITIGATE | Invariant above; red-team suite |
| Supabase organisation over plan (P1530) | ACCEPT | Net-additive traffic is tiny (Cost Budget); counts as over the limit until the founder accepts the upgrade |
| Event 1 runs before this ships | ACCEPT | Fallback by hand: founder runs an agent locally and loads the result with the P1515 private seed, pointed at prod |
| Large decks exceed the request size | MITIGATE | Convert to text before sending; cap file size (limit set in /dev, UNVERIFIED today) |

**Non-Goals**
- Do NOT build updates after the first draft from transcripts or chat (P1500).
- Do NOT add file upload outside mirror threads in this spec (amended 2026-10-22: upload in
  mirror threads is now IN scope; direct messages and channels stay out).
- Do NOT add canvas editing on screen (decisions.md 2026-10-19: owners edit through their agent).
- Do NOT change the event room or pairing (P1529).

## UX Notes

- Happy path: material in → progress while it runs (duration UNVERIFIED until measured) → canvas
  page with filled boxes and empty boxes marked as questions.
- Works on a phone at 375px: latecomers do it at the door.
- Error: per input, say what could not be read; the draft still runs on the rest.
- Empty: no material and no note → the button is not offered (no disabled primary, P955).
- Loading: shows progress and survives a page reload; a second press does not start a second draft.

## Acceptance Criteria

- [ ] An owner with a website link and one PDF gets a canvas whose points all trace to those inputs
      (checked against the material, on test, for 3 real attendees' material with their permission).
- [ ] A box with no source in the material is empty and shown as a question.
- [ ] The draft is invisible to a signed-out visitor, another signed-in user and an event attendee
      until the owner shares it (curl + browser evidence on test).
- [ ] After sharing with the event, an attendee reads it and takes positions (P1515 path).
- [ ] A link that cannot be read is named in the result; the rest is still drafted.
- [ ] Re-running before sharing replaces the draft; no duplicate points remain.
- [ ] Injection control: material containing instructions to write elsewhere or make content
      public changes nothing outside the owner's private draft (real-model test, with a control that
      shows the test can fail).
- [ ] With AI availability off, no draft control is shown.
- [ ] + Canvas and the preparation step each open a new mirror thread that asks for material; a
      PDF uploaded in that thread is drafted, and the original file is not stored afterwards.
- [ ] The mirror's reply in the thread links the canvas and names empty boxes and unreadable inputs.
- [ ] Works at 375px and 320px (screenshots).

## Cost Budget

Model for the budget: `gemini-3.8-flash` (registry: $0.75 input, $3.75 output per 1M tokens through
2026-12-31). Founder, 2026-10-21: "gemini 3.8 is ok for this".

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests (Supabase) | 1 edge call + 1 batched write inside it = 2 per draft x ≤3 drafts = ≤6 | event-prep peak: 20 attendees x 2 = 40 | e2e, model stubbed: 3 drafts x 2 = 6, plus 2 test users created and deleted = 4 auth calls |
| Egress (bytes) | response ≈1 KB x ≤3 = ≈3 KB; the canvas page load afterwards is P1508's existing read (size UNVERIFIED) | 20 x 1 KB = 20 KB | 3 x 1 KB = 3 KB |
| Log lines | 1 per draft + ≤6 per failing draft (5 unreadable links + 1 model error) = ≤7 per draft x 3 = ≤21 | 20 x 7 = ≤140 | ≤21 |
| Gemini tokens x price | input ≤63k (60k material cap + 3k prompt) x $0.75/1M = $0.047; output ≤14.5k (9 boxes x 3 points x 240 tokens ≈ 6.5k + 8k thinking) x $3.75/1M = $0.054; ≈$0.10 per draft x ≤3 = ≤$0.30 | 20 x $0.10 = $2.00 | stubbed: $0; real-model red-team: 5 drafts x $0.10 = $0.50 |

1. **Fits the plan limit today?** Edge invocations: drafts per month = active preparers x ≤3, against
   the registry's 500,000. Gemini: monthly cost = drafts per month x $0.10, on a dedicated
   budget-capped key (`/slava:util:ai-keys`). Supabase: the organisation is over plan (P1530), so by
   the 2026-10-21 ruling this is over the limit until the upgrade is accepted, even though it adds
   little traffic.
2. **Fits at 10x?** 200 drafts per hour = 400 requests and $20 per hour: Supabase limits fit; the
   Gemini cost fits only within the key's cap.
3. **Upgrade:** Supabase Pro, from $25/month (registry).

## Pre-deploy Checklist

### Secrets to provision
- [ ] Dedicated spend-capped Gemini key issued via `/slava:util:ai-keys`, set as an edge-function
      secret on test, then prod.
- [ ] Availability flag set on test; on prod only after the privacy policy item below is live.

### Deploy commands
- [ ] Privacy policy (`src/app/content/privacy.md`, processor table) names canvas material as sent
      to the AI provider; amended text live before the prod flag is set.
- [ ] New edge function deployed to prod after merge (`/push` handles function deploys).

### Post-deploy verification
- [ ] One real draft on prod from the founder's own material; canvas private until shared.
- [ ] Sentry shows no new errors from the function in the first 10 minutes.

## Open Questions

0. **Blocking before /dev (2026-10-22).** Start only after **P1535** (nine boxes, `feature/p1535-canvas-nine-boxes`) and **P1515** (sharing, `feature/p1515-artifact-sharing`) have shipped: this spec writes P1535's boxes into P1515's canvas record, and both are still moving on their branches. P1515 phase 5 (founder, 2026-10-22) makes a canvas **one canvas with many versions, sharing covers every version**. Step 4's "re-running replaces the unshared draft" must be re-read against that: a re-run probably creates a new version instead. Reconcile before building.
1. Keep the extracted text (not the files) privately as the owner's source, so later updates (P1500)
   can reread it? Agent leans yes; founder call.
2. Can an owner re-run after sharing, or do changes after sharing go only through the mirror?
3. Order: build after P1535 (box set) and P1515 (canvas record + private sharing) merge, or in
   parallel against their branches?

## Related

- [P1508](done/2026-06-10/p1508_clarity_canvas_owner_artifact.md) canvas page ·
  P1535 nine boxes (branch `feature/p1535-canvas-nine-boxes`) ·
  [P1515](p1515_artifact_sharing_events_and_groups.md) sharing ·
  [P1500](p1500_clarity_chat_canvas_from_event_threads.md) updates from event threads ·
  [P1529](p1529_canvas_event_host_coordination.md) host and pairing ·
  [P1457](p1457_clarity_chat_data_import.md) chat data import ·
  [P1332](p1332_canvas_to_letter_skill.md) canvas to letter ·
  P1520 mirror (availability-gate pattern, spend-capped key) ·
  [P1544](p1544_mirror_launch_on_prod.md) mirror on prod (blocks go-live) ·
  [P1546](p1546_threads_in_every_chat.md) threads in the mirror (blocks the entry point) ·
  [P1545](p1545_menu_and_artifacts.md) Artifacts page, + Canvas
