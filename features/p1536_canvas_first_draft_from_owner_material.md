---
status: in-progress
type: story
rank: 53
workstream: clarity-canvas
created_date: '2026-10-21'
tags: [canvas, agent, sales-mastermind, onboarding]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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
2. **Draft.** *Amended 2026-10-28 (founder): points only, no stories. A story under each point would be the
   model's paraphrase signed as the owner's; the owner adds their own stories on the canvas. The quote check below
   is unchanged.* The agent drafts the P1535 nine boxes as the owner's points, each with the owner's
   story in their voice, quoting or paraphrasing only what the material says. It writes **bets, not
   marketing**: "Agency owners with 5-20 staff will pay X for Y" rather than the site's slogan
   (P1535 found that self-description invites fluff). A box the material says nothing about stays
   empty and is shown to the owner as a question.
3. **Write.** One server-side call creates the canvas (P1515's canvas record) and its points,
   stories and the owner's own positions as **private**, in the owner's account, in one batch. This
   is the seed script's write logic moved server-side; P1515's w11 branch already has a private-points
   version of the seed (commit `1d7119934`).
4. **Review.** *Amended 2026-10-26: see "Versions, drafts and updates" below.* The draft is a
   **draft version**, visible only to its owner. The owner revises it in the thread; **Publish**
   makes it a version the canvas's audience reads. Re-running before Publish replaces the draft's points.

**Where: amended 2026-10-22 (founder). The draft happens in a thread with your mirror.**
Steps 1-4 above (the engine) are unchanged; only the entry point and the input path move.

- **+ Canvas** (the Artifacts page's create menu, P1545) and the event preparation's "Draft my
  canvas" step both open a **new thread with the owner's mirror** (threads in the mirror: P1546).
  The mirror opens the thread by asking for material: files, links, a note.
  *P1545 (founder, 2026-10-23):* the Artifacts page shipped its **New artifact** menu with Letter only; Canvas was left out because no create path existed. This spec adds the **Canvas** item to that menu (`src/app/pages/artifacts/artifacts-header.tsx`). The label stays "New artifact".
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

## Versions, drafts and updates (founder, 2026-10-26)

Creating and updating are one engine: every run makes a new **draft version** of the canvas.

1. **Draft, then publish.** A draft version is readable only by its owner. **Publish** turns it
   into a version the canvas's audience reads (P1515: sharing belongs to the canvas, so no
   re-sharing). Before publishing, the owner revises in the thread and each revision replaces the
   draft's points. A draft that is never published stays private. Deleting versions is out of scope.
2. **One thread per draft.** After Publish, a further change request in that thread gets: "This
   version is published. Start a new version?" with a button. The button opens a **new mirror
   thread** with the published version already attached, exactly as if the owner had picked it from
   the paperclip. Nothing starts quietly.
3. **Paperclip lists canvas versions** next to points and stories, so a new thread can start from
   any version, not only the newest.
4. **Version labels are automatic** ("v1", "v2", … plus the date). The owner never names a version.
5. **Two speeds, chosen by the owner each time.** *Superseded 2026-10-28 (founder, after testing v2): one button
   that drafts straight away (the fast speed below), and the mirror's reply lists "What I decided on my own". The
   owner corrects by replying and tapping Update draft. The question round confused him in testing ("Create new
   version" answered with questions instead of a canvas) and costs a second model call.*
   - *Fast:* "make your own decisions". The mirror drafts, and the draft ends with **"What I decided
     on my own"**, listing each conflict and the choice made. Publishing is still one tap. This is
     the event's between-rounds path (2.5-hour event: no time for a slow pass).
   - *Slow (default):* before drafting, the mirror shows each tension between the current version and
     the new material as an option with its pick and why ("simplify" style: options to correct, not
     open questions). The owner answers or says "just decide".
   - Either speed can take, as material, a thread elsewhere that the owner can read, e.g. the event
     transcript thread, instead of uploads.
6. **Points never change.** This is already enforced (no update path for users on `points`). Each
   version is built from:
   - **unchanged point** (same words, same box): **reused**. The version tag is added to the
     existing point, so its positions and stories carry over. *This changes P1515 phase 5 "each
     version keeps its own positions" for unchanged points; agreed 2026-10-26.*
   - **reworded point** (clearly the same claim): a new point that **supersedes** the old one, so
     the positions that pushed the change stay reachable (P800).
   - **same words, moved box**: a new point (the box lives on the point) that supersedes the old
     one, so its positions stay reachable.
   - **anything else** (new claim, split, merge, unsure): a new point, with no link.
     Bias rule: when unsure, don't link. A missing link only loses a breadcrumb. A wrong link points
     earlier supporters at a claim they never backed. Every link appears in the draft ("Problem:
     reworded from v1"); the slow speed lets the owner correct links, and the fast speed lists them
     under "What I decided on my own".
   - A canvas reads **only its owner's own points**. Reusing another person's identical point is out
     of scope (see Non-Goals).
7. **A version shows its own points, superseded or not.** Today the canvas read filters
   `superseded_by IS NULL` (`20261022170000_p1515_canvas_versions.sql:165`). With supersede between
   versions, opening v1 would show empty boxes. Opening a specific version must show exactly the
   points carrying that version's tag.

8. **Data rules (from the 2026-10-26 Gemini review, each checked against the migrations).**
   - **A version has a published state.** `canvas_versions` has no such column today
     (`20261022170000_p1515_canvas_versions.sql:32-40`). Readers other than the owner see only
     published versions, through the canvas read and through any point link.
   - **Supersede links are written at Publish, never during drafting.** Otherwise an abandoned or
     revised draft leaves a published point superseded by a private one (hidden on every
     heads-only list, pointing nowhere for readers).
   - **Link only to a head.** If the old point is already superseded (e.g. a draft started from v1
     after v2 reworded it), make a new point with no link. One successor per point stays true.
   - **Revising or discarding a draft** deletes only the points that draft created, and removes the
     draft's version tag from reused points. It never deletes a reused point.
   - **One open draft per canvas.** Opening a second draft thread while one is open continues the
     open one. The label (v2, v3…) is assigned at Publish, so abandoned drafts leave no gaps.
   - **From someone else's words, no facts.** Material from a transcript or a copy of another
     person's message can challenge or reshape the owner's bets. It never becomes a point stating a
     fact about that person or their business (e.g. their churn figure), in fast speed too.

9. **Rules from the Gemini 4 Argon review (2026-10-26, each checked).**
   - **Link fetching is locked down (SSRF).** https only; refuse private, loopback and link-local
     addresses, re-checked after every redirect (≤3 redirects); cap response size and time. A refused
     link is named as unreadable.
   - **Extracted text lives with the draft.** Converted text is stored privately with the thread
     from upload until the draft is published or discarded, so a reload or a slow-speed question
     loses nothing. Original files are deleted once converted. Keeping the text *after* Publish is
     still Open Question 1.
   - **Paperclip with an open draft:** the mirror asks "You have an open draft (from vN) in another
     thread. Continue it there, or discard it and start from the version you picked?" Never silent.
   - **Draft-only data is stored with the draft version, not on points:** the pending supersede
     pairs (old → new) chosen in the draft, and each empty box's question. Questions are shown to the
     owner only; readers see an empty box.
   - **Name vs label.** `canvas_versions.name` is required at insert and keys `?v=`; a draft gets an
     internal name, and a separate label (v1, v2…) is set at Publish.
   - **Sharing an unpublished canvas.** With no published version, readers see "Nothing published
     yet", and the owner's share flow says "Publish first". The first canvas follows the same
     draft → Publish path.
   - **Runs as a background job**, like the mirror's replies, not one synchronous request; progress
     survives a reload. Slow speed costs two model calls per draft. Revisions per draft are capped
     (cap set in /dev, UNVERIFIED today).

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
| My next milestone (P1589 title) | A number and a date that would prove you wrong | "10 paying shops in three months" | "Growth" |
| Guiding values (P1589 title) | **Something you give something up for.** Proof is a cost you keep paying for it (founder, 2026-10-23: a value is "something you sacrifice for"; e.g. honesty that costs you long discussions with strangers, and you have them anyway) | "Intellectual honesty: I correct myself in public even when it loses the argument" | A word with no cost behind it ("integrity") |
| My current biggest challenge (P1581 title) | The one obstacle you see as most likely to stop this working right now, with the number that shows it | "Getting café owners to a first call: only 3 of my last 20 messages got a reply" | A complaint with no number ("finding time", "scaling") |
| Hypotheses I've falsified (P1581 title) | Something you expected about the business, tested, and found wrong: what you expected, what happened, what you changed | "I expected owners to want per-receipt pricing; all five I offered it to chose a flat monthly fee, so I dropped it" | A lesson with no test behind it |

*2026-10-28: the last two rows were rewritten for P1581's new titles (the old meanings, "strengths become
weaknesses" and "who else wins", no longer match the boxes). Founder may edit. The copy-prompt's per-box text
(`canvas-thread-copy.ts`) was reviewed by Gemini 4 Argon and Codex the same day.*

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
- **Other people's words never appear under their name in a canvas.** Material can include other
  people's words (an event transcript, Clarify copies). The draft writes the owner's own bets in the
  owner's voice. It never quotes or names another person, because a canvas can be shared by public
  link. A partner's reasons reach a canvas only through the partner-approved story request
  (P1574).

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
- Updates ARE in scope (amended 2026-10-26): a new draft version from thread material, including an
  event transcript thread the owner can read. Automatic per-event pipelines stay in P1500.
- Do NOT reuse another person's identical point in a canvas. Whether identical public statements are
  one point app-wide is a separate open question.
- Do NOT draft stories on a partner's behalf here (P1574).
- Do NOT add version deletion, owner-chosen version names, or a visible point author.
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
- [ ] Revising a draft version replaces its points; no duplicate points remain.
- [ ] A draft version is invisible to everyone the canvas is shared with until Publish; after
      Publish they read it with no new share (curl + browser evidence on test).
- [ ] A change request in a thread whose version is published offers "Start a new version?"; the
      button opens a new thread with that version attached.
- [ ] The paperclip lists canvas versions; picking an older one starts the draft from it.
- [ ] Unchanged points are reused (positions on them show in the new version); reworded points
      supersede their predecessor; other changes are new points with no link. Every link is named
      in the draft.
- [ ] Opening v1 after v2 superseded some of its points still shows all of v1's points.
- [ ] Every draft lists "What I decided on my own" (one speed since 2026-10-28; the slow speed's
      tension options were removed by the founder after testing v2).
- [ ] A draft built from an event transcript thread names no other person in its points.
- [ ] Injection control: material containing instructions to write elsewhere or make content
      public changes nothing outside the owner's private draft (real-model test, with a control that
      shows the test can fail).
- [ ] With AI availability off, no draft control is shown.
- [ ] + Canvas and the preparation step each open a new mirror thread that asks for material; a
      PDF uploaded in that thread is drafted, and the original file is not stored afterwards.
- [ ] The mirror's reply in the thread links the canvas and names empty boxes and unreadable inputs. *(2026-10-29, visual QA: the
      link is the draft card's Open under the reply; the reply text carries no address, since chat text is plain and an
      address showed as unclickable noise.)*
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
| Slow speed and revisions | tension pass + draft = 2 calls x $0.10 = $0.20 per draft; with a cap of 5 revisions per draft version: ≤5 x $0.20 = ≤$1.00 per version | 20 x $0.20 = $4.00 | stubbed: $0 |

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

## Resolved Decisions

- 2026-10-26 (founder): Open Question 0 is resolved. P1535, P1515, P1544 and P1546 have shipped. A
  re-run creates a new **draft version**, not a replacement of a shared one (see "Versions, drafts and
  updates").
- 2026-10-26: changes after publishing go through a new draft version in a new thread. A published
  version never changes.
- 2026-10-26: build directly on main's shipped P1535/P1515 (old Q3 is moot).

## Open Questions

1. Keep the extracted text (not the files) privately as the owner's source, so a later version can
   reread it? Agent leans yes; founder call.
2. [FOUNDER DECISION: privacy-policy sentence, a soft update (no re-acceptance).] Draft for the
   mirror section: "Your mirror agent can turn what you give it (messages, files, links, and copies
   of other chats you can read) into a draft of your Clarity Canvas. The draft is visible only to
   you until you publish it; a published version is visible to whoever you shared the canvas with,
   including anyone with its link. Drafts state your own views and do not quote or name other
   people." Uploaded files are listed in the processor table as sent to Gemini and not kept.

## Known limitations (from /dev review, 2026-10-26)

Accepted after three review rounds (Gemini 4 Argon, Codex, Opus adversary); each is a shape the
reviewers reproduced but that is exotic or costs more than it saves now.

- **Names are a heuristic.** Points naming another person are dropped when the name appears as a
  speaker label or a mid-sentence run of capitalised words in a file, link or someone else's lines.
  Lower-case names, a lone first name and one-word speaker labels get through; a place name only a
  file used can cause a false drop.
- **"Nothing invented" is a heuristic.** A point must share two content words with an owner quote
  and every number must appear in owner material. It is not a semantic truth check; the real-model
  red-team (AC14) is still owed.
- **DNS rebinding** between the address check and the fetch is not closed (the edge runtime cannot
  pin the address). Bounded: https only, ≤5 links, 1 MB and 8 s each.
- **A reworded point whose old point is no longer a head** carries no link into the next revision,
  and a moved point reworded later from its base words can be refused as unverified.
- **A dead run** blocks drafting for 5 minutes and is charged its full reservation.
- **Canvas names over 56 characters** list a canvas whose page is not found.
- **Mirror replies in an open draft thread:** the mirror answers each owner message (spec places
  "Draft my canvas" under its reply), one model call per message.

- **Message grouping after the opener (update threads):** the owner's first message can group visually with
  the base-version card above it, because grouping skips the opener drawn between them (LOW, v2 review).
- **P1576 overlap on the shared test database:** P1576's `mirror_request_reply` (applied after P1536's) dropped the
  "no mirror job in a canvas thread" rule there. The client never requests a reply in a canvas thread, so the app is
  unaffected; whichever of P1536/P1576 ships second rebuilds that function on the other's body.
- **The question round is gone from the engine, not from the database (v3, 2026-10-28):** `_canvas_draft_run_begin`
  still accepts a tensions run and `_canvas_draft_tensions_complete` still exists. Both are service-role only and no
  code calls them; an old tab that asks for the slow speed gets a normal draft. Remove them in a later migration.
- **Self-hosted TEST has canvas drafting off:** the founder's rule keeps paid AI keys off the self-hosted test server
  (P1557), and its secrets push replaces the server's whole secrets file from a Mac copy that does not exist, so the
  canvas secrets were not added there. Real-AI drafting and the integration suite run on hosted TEST.

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
