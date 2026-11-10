---
status: in-progress
type: story
rank: 117
workstream: canvas
created_date: '2026-11-09'
tags: [canvas, mirror-agent, ux]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 0825e9cc32902a1b57510ca1ad2274c2ac8f623130330dd30fd52c19211d9741
spec_review_vendors: [codex, gemini, openrouter]
---

# P1653: The canvas agent is never a wall

## Problem

**Situation:** When the canvas agent cannot act, it posts a fixed sentence. P1646 ruled "Never a bare refusal", and the reply does carry a next step, but the same one whatever the owner sent.

**Complication:** On TEST on 2026-11-09 the founder sent three first messages. All got the same reply, and a retry got it again:

| Owner sent | Reply |
|---|---|
| `airbnb.com - make canvas` | "I could not draft a canvas from that, so nothing was changed. Tell me in your own words who you sell to, what you sell and what it costs, then try again." |
| `https://www.airbnb.com/ this canvas` | same |
| `its a car selling buisness` | same, and the same again after a retry |

All four runs failed with `nothing_supported`. The next run drafted 9 points, but from an uploaded file (`clarity-canvas.md`), so no typed message got past the wall. The reply showed the short sentence, which means no point was dropped by an evidence check: the model most likely wrote nothing (inference from `failedLine`, to be measured). `airbnb.com` is not recognised as a link at all (`URL_FIND`); the `https://` link did not fail to read, and the reply never says so. Other failures already name an unreadable link, so the wall is this path and the others in the inventory, not every reply.

> Founder, verbatim: "it still feels like a wall.. should we examine all ways how agent can block access and then make sure he always explains way forward and helps user if possible with options to select from"

**Question:** What does every block say and offer, so an owner always knows what happened and what to do next?

## Appetite

High blast radius: every owner who hits a failure, including first messages. Git revert restores behaviour, but replies already posted stay in threads, so an old button must stay safe. Decision density: the design calls were made 2026-11-09 (below); wording remains.

## Invariants

- **Nothing added without showing the owner the words it came from** (decisions 2026-11-05, P1625). Help never means inventing.
- The evidence checks stay unchanged: the two-word rule and the best-guess check (P1625, P1639). The founder's standing constraint.
- Do not tell the model to guess on any empty-canvas message: rejected on 2026-11-05 (P1639) because it invented "presented with one more card". Reversing that needs a founder decision with a real-model measurement.
- Fail-closed on prices and numbers the owner never said (P1536, decisions 2026-11-04).
- A failed run still says truthfully that nothing changed. Options never claim something the system did not do.
- P1646 D1-D4 and its choice wording stay as approved.
- **A tap adds no evidence.** A button label is fixed product text. Tapping sends only a fixed token (a letter or fixed phrase). Agent-derived text never enters the owner's message path, and a test proves a tap adds no new evidence word.
- **A reply invents nothing either.** Model-written sentences reach a reply only as today: quoted and screened. Any assumption shown names the words and source it came from, and passes the names screen. An owner's raw message is echoed only after the same screen.
- "Nothing changed" means the canvas. A read link may be kept, and the reply must not imply otherwise.

## Solution

**Founder decisions, 2026-11-09:**
- **F1. A follow-up keeps the conversation.** A run that asks a question completes as a finished run with nothing changed, so the owner's message stays in later runs. It uses 1 of the draft's 30 updates. Refused messages are still not remembered, and the shared input selector is not changed. The answer run must still behave as a first draft (all nine boxes, focus accepted), checked by a test, because a finished run may end first-draft status.
- **F2. Link only: assumption with options, recommended first, when it makes sense.** When the page was read and an assumption can be sourced, the reply states it with the words it came from, then offers A (recommended), B, C. Otherwise a plain "Is this your business?". There is no "a model for mine" option; "not mine" asks what the business does and the page is not used.
- **F3. Buttons, fixed wording.** A new tappable control in the chat reply.
- **F4. A bare domain counts as a link**: a word with a dot and a listed ending, no spaces. `airbnb.com` and `airbnb.co.uk` match; `node.js` and `e.g.` do not, pinned by a test. The reply names what it read.

**Founder decision, 2026-11-10 (after the replay showed the model writes nothing on all three messages, every time):**
- **F5. An empty answer gets the model's own question, in the owner's words only.** Founder, on scripted follow-ups: "It cannot always be scripted what comes after... based on what I said, there is a creative freedom to help me guess on which kind of box am I talking to." When a run writes nothing, the reply shows ONE of the questions the model already returns, chosen for the box it judges most likely, and only if every content word of the question appears in the owner's message (the same screen as points). Otherwise a plain fixed question. The instructions gain one line: when nothing fits a box, ask about the most likely box and name it. That line is about questions only; "never guess to fill it" stays word for word. This narrows Solution 3 ("the model's `questions` ... are not promoted") for this case; since it changes the instructions, the after-build real-model runs must show no question with a word outside the owner's message.

**1. The inventory (first deliverable, founder checks it before replies are built).** One table of every way the agent blocks an owner, read from the code at build time: trigger, today's words, whether the owner sees anything at all, retry policy, proposed words and options. Covered set, to extend if more is found:

- **Run failures with a reply:** `nothing_supported`, `no_readable_material`, unparsable, blocked or empty model answers, `too_large`, `timeout`, provider failures (`capped` as failed, `http_*`, `network`), `write`, `internal`, file extraction failures, `choice_stale`, `choice_write`, `choice_read`.
- **Failures with no reply today:** `abandoned`, `transcript_failed`, `message_gone`, `draft_closed`, `not_offered`, `gone`, and a run whose failure write was lost.
- **Refused requests:** every code in `canvas-draft-calls.ts`, including `NOT_READY`, `GONE`, `TIMEOUT` (no text today), `busy_elsewhere`, `cap_reached`, `stale_view`, `not_retryable`, `expired`, `draft_empty`, `no_changes`, `TOO_MANY_DRAFTS`, `RUN_ACTIVE`, and the daily limit (`state = capped`).
- **Finished, but the owner got little:** "Nothing changed" and `hold` replies, the file path that applies nothing, points left out, scope and per-box drops, truncation.

**2. The contract.** Every block answers in plain words: what happened, what is unchanged, and the one best next step for this cause. Where the owner has a real choice, it offers buttons. Where nothing helps (`DISABLED`), it says so and offers no retry.

**3. Causes come from what the run knows, and are never invented.** The reply states only causes the code established: the inventory's cause column defines them, and codes in one row (such as the `http_*` family) share one explanation. **The product composes follow-up questions and assumptions, not the model:** fixed text plus the owner's words or the page's own title or description, copied verbatim and screened. The model's `note` and `questions` carry no source, so they are not promoted into this reply, and a model that writes nothing still gets a question. `canvas-reply.ts` deliberately hides drop counts and invented points on a failed run; that stays unless the founder reverses it.

**4. The first-message cases.** Link only follows F2 and F4. One clear line: measure first. If the model writes nothing, do not change its instructions (Invariants); the product asks a fixed question quoting the owner's words. Copying a page's own words is not the guess P1639 rejected, since no model writes the assumption. An empty-box question in a reply reverses a P1536 rule, so the inventory names this for approval.

**5. An explicit retry table.** Each code gets show or hide, tested, and the client reads the code it already receives. `nothing_supported` is not assumed to repeat: the model varies and a link can time out, so its row is set from the replay. Daily limit never shows retry. `capped`, `http_*` and upload cases are classified row by row.

[FOUNDER DECISION: the wording of each reply and button, approved from the inventory table.]

## Inventory (for founder approval)

Read from the code, then corrected against the pre-build replay (Done-When). Every proposed sentence is **PROPOSED**: wording is a founder decision. The P1646 choice wording is **APPROVED** and stays verbatim. "Nothing changed on the canvas" is true of the canvas only and never says a read link was dropped (a link read during a failed run stays kept as material, but a failed run's message and links are not read by later runs). Where the table says "no place", the path has no open thread to show a message in, and the reason is given. `{...}` is filled by the product from the owner's own words or the page's own title, screened.

**Needs a yes or no from the founder, beyond the wording:**
- F5 puts the model's own question in a reply for the box it judges most likely. This reverses the P1536 rule that an empty-box question never appears in a reply (it sits under its box), and narrows Solution 3. **Approved by the founder 2026-11-10** (see F5).
- Retry on `nothing_supported` is hidden (replay: 15 of 15 identical). Retry on every other row follows the tables below.
- Whether the `http_*` family splits (see Open Questions).

### A. Run failures that post a reply

| Cause | Owner sees today | Proposed words (PROPOSED) | Buttons | Retry |
|---|---|---|---|---|
| **Model wrote nothing** (`nothing_supported`; measured: 0 actions, nothing dropped, 15 of 15 runs) | "I could not draft a canvas from that, so nothing was changed." then "Tell me in your own words who you sell to, what you sell and what it costs, then try again." | F5: "Nothing changed on the canvas." then the model's own question for the most likely box, shown only if every content word of it is in the owner's message. Otherwise the fixed fallback: "I could not draft a canvas from that. Nothing changed on the canvas. Who do you sell to, and what do you sell?" (fallback words PROPOSED) | none (the owner answers in the thread) | hide. The replay was identical every time, so a retry on an unchanged message does not help; the question is the next step |
| **A point failed the evidence check, none survived** (`nothing_supported`, evidence variant) | "I could not draft a canvas from that: I could not tie what I found to your own words, so nothing was changed." + the same hint | "I could not tie what I found to your own words. Nothing changed on the canvas. Tell me in your own words who you sell to and what you sell." | none | hide (the next step is saying it with more detail). Not replayed: no replay run failed this way |
| **Link read, but only a thin page came back** (the airbnb case: a 32 character redirect notice) | the short sentence above; the link is not named, because only failed reads are listed | "I could only read a redirect page from {domain}." then, per F2, the plain "Is this your business?" | [Yes, this is my business] [Not mine] (labels PROPOSED, fixed text; "Not mine" asks what the business does and drops the page) | hide |
| **Link unreadable** (`nothing_supported` or `no_readable_material` with an unreadable list) | names the link and why, then "Send a PDF export or paste the text and I will use it." | keep, and add "Nothing changed on the canvas." before it | none | hide (staged replay: 5 of 5 failed the same way) |
| **Nothing from the owner to read** (`no_readable_material`; only focus or fork runs, a message run always has its own text) | the short sentence + hint | "There was nothing from you to read, so nothing changed on the canvas. Send a few lines about your business, or upload a file." | none | hide (a retry repeats the empty input) |
| **Model answer garbled** (`unparsable`) | "I could not draft your canvas from that. Nothing was changed. Try again, or add more about what you sell and to whom." | "My answer came back garbled, so nothing changed on the canvas. Try again." | none | show |
| **Model answered with no text** (`empty`) | same words | "I got no answer back, so nothing changed on the canvas. Try again." | none | show |
| **Model service declined** (`blocked`: a safety filter) | same words | "The writing service would not answer that one, so nothing changed on the canvas. Say it in other words and send it again." | none | hide (same input, same block) |
| **Request too big** (`too_large`: even without the cuttable material it does not fit, so the canvas and rules count) | "That is more than I can read in one go. Nothing was changed. Try a shorter file, or fewer files." | "Your canvas and message together are more than I can read in one go. Nothing changed on the canvas. Send a shorter message." | none | hide (same input) |
| **Took too long** (`timeout`: the 120 second run deadline; the step is not recorded) | "That took too long, so nothing was changed. Please try again." | "That took too long, so nothing changed on the canvas. Try again." | none | show |
| **Provider limit** (`capped` as failed: the model service answered 429 or 403; NOT the owner's daily limit) | "I could not draft your canvas just now. Nothing was changed. Please try again in a few minutes." | "The writing service is limited right now, so nothing changed on the canvas. Try again in a few minutes." | none | show |
| **Provider error** (`http_*` family: any other error status) | same words | "The writing service had a problem, so nothing changed on the canvas. Try again in a few minutes." | none | show (founder call: split 4xx hide, 5xx show) |
| **Could not reach the service** (`network`) | same words | "I could not reach the writing service, so nothing changed on the canvas. Try again in a minute." | none | show |
| **Save failed** (`write`; also what malformed model output becomes today) | "I drafted your canvas but could not save it. Please try again." | "I could not save that draft, so nothing changed on the canvas. Try again." | none | show |
| **Unexpected error** (`internal`) | "Something went wrong and nothing was changed. Please try again." | "Something went wrong on my side, so nothing changed on the canvas. Try again." | none | show |
| **Choice could not be saved** (`write` or `choice_write` on a pick) | "I could not save that just now, so nothing changed. Please try again." | same, with "on the canvas" | none | show |
| **Choice could not be read** (`choice_read`) | the same save sentence (wrong cause) | "I could not look up your choice just now, so nothing changed on the canvas. Reply with your pick again." | none | hide (the next step is to pick again) |
| **Canvas moved while applying a pick** (`choice_stale`) | "The canvas changed while I was applying your pick, so nothing changed. Reply with your pick again." | unchanged | none | hide |
| **Earlier request could not be re-checked** (re-offer, same causes as the draft rows) | "I could not check that just now. Nothing was changed. Please try again." | share the draft rows' per-cause words above | none | follow the draft row for the cause |
| **File not a supported type** (`unsupported`) | "I could not read that file. Nothing was changed." (this one sentence for every upload cause) | "I cannot read that kind of file. Nothing changed on the canvas. Try a PDF, a Word document, a deck, an image or a text file." | none | hide |
| **No text in the file** (`unreadable`) | the same sentence | "I found no text in that file. Nothing changed on the canvas. Try another copy, or paste the text here." | none | hide |
| **File over 8 MB** (`too_large` upload) | the same sentence | "That file is over 8 MB. Nothing changed on the canvas. Send a smaller file." | none | hide |
| **File reading took too long** (`timeout` upload) | the same sentence | "Reading that file took too long. Nothing changed on the canvas. Send it again." | none | hide (the file was not kept) |
| **Reading service limited** (`capped` upload: 429 or 403; today's toast wrongly says the daily limit) | the same sentence | "The reading service is limited right now. Nothing changed on the canvas. Send the file again in a few minutes." | none | hide |
| **Reading service failed** (`model_error` upload; the file may be fine, today's toast blames the file) | the same sentence | "I could not read the file because the reading service had a problem. Nothing changed on the canvas. Send the file again." | none | hide |
| **Draft holds 10 files** (`limit`) | the same sentence (wrong cause) | "This draft already holds 10 files. Nothing changed on the canvas. Start a new draft to add more." | none | hide |
| **File save failed, denied, unexpected** (`write`, `denied`, `internal` upload) | the same sentence | one line each, same shape: what failed, "Nothing changed on the canvas.", send the file again | none | hide |

### B. No reply today

| Cause | Owner sees today | Proposed words (PROPOSED) | Buttons | Retry |
|---|---|---|---|---|
| **Did not finish in time** (`abandoned`: queued over 3 minutes or running over 5; also the end of a lost failure write, and of a send whose start was refused) | only a Try again button, no sentence | "That did not finish, so nothing changed on the canvas. Try again." | none | show |
| **Voice note not understood** (`transcript_failed`) | the voice bubble reads unavailable, plus a Try again button that then says "Send the file again." | "I could not make out that voice note, so nothing changed on the canvas. Record it again or type it." | none | hide |
| **Other canvas offer gone** (`not_offered`, a focus switch) | a Try again button that then says "Send the file again." | "That other canvas is no longer offered, so nothing changed." | none | hide |
| **Message deleted** (`message_gone`) | nothing | no place: the owner deleted the message, a reply would hang under nothing | | hide |
| **Draft closed** (`draft_closed`) | the closed-thread line only | no place: the thread is closed and the closed line already says why; the failure write posts only on an open draft | | hide |
| **Run already ended** (`gone`: late invocation, no write by design) | the run row already shows what ended it | no place: nothing is written | | n/a |
| **Daily limit** (state `capped`, code `cap`) | words today: "I have reached my daily limit for canvas updates, so nothing was changed. Please try again tomorrow." | unchanged words, no button | none | never shown |

### C. Refused requests

| Cause | Owner sees today | Proposed words (PROPOSED) | Buttons | Retry |
|---|---|---|---|---|
| **Could not start, a lock was busy** (`BUSY` from the edge; it does not prove a draft is being written) | toast "A draft is already being written. It will show here when it is done."; the run then ends as `abandoned` | "I could not start that a moment ago. Try again." | none | show after it ends |
| **A run is active** (`busy`, `busy_elsewhere`) | `busy`: the same toast; `busy_elsewhere`: "Another of your canvases is updating." in the send slot | keep both | none | n/a |
| **30 updates used** (`cap_reached`) | "This draft has used all its revisions. Publish it, or discard it and start a new draft." and the cap lines | keep | the existing Publish and Start over controls | n/a |
| **Screen is behind** (`stale_view`) | on send: "That did not go through. Try again."; on offers and Undo: "This draft changed since you last looked. Check it, then try again." | send uses the offers sentence too | none | n/a |
| **Retry not possible** (`not_retryable`: an upload not kept, a voice note whose transcript failed, a deleted message, a focus offer gone, or not the newest run) | "Send the file again." for all of them | one sentence per run kind: file "Send the file again."; voice "Record it again or type it."; other "That cannot be tried again. Send your message again." | none | n/a |
| **Offer gone or material expired** (`not_offered`, `expired`) | "That canvas can no longer be started from here." / "Send the material again to start this canvas." | keep | none | n/a |
| **Nothing to publish** (`draft_empty`, `no_changes`) | "Nothing to publish yet" | keep | none | n/a |
| **Too many drafts, run active** (`TOO_MANY_DRAFTS`, `RUN_ACTIVE`) | "You have too many open canvas drafts. Publish or discard one first." / "That draft is being written right now. Try again in a minute." | keep | none | n/a |
| **Not ready** (`NOT_READY`: voice transcript pending, or a retried upload with no file) | nothing on send; the generic sentence on retry | voice: "Still preparing that. It will run when it is ready." file: "Send the file again." | none | n/a |
| **Run gone** (`GONE`) | nothing | no place: the run already ended | | n/a |
| **Upload timed out** (`TIMEOUT`, extraction) | no text for the code; the thread reply is the generic file sentence | see A, file reading took too long | none | hide |
| **Drafting off** (`DISABLED`) | "Canvas drafting is not available right now."; a queued run then ends as `abandoned` with Try again | same words | none | hide while drafting is off |
| **Terms not accepted** (`TERMS_NOT_ACCEPTED`) | "Accept the updated terms to use your mirror agent." | keep | a link to the terms, if one exists | hide |
| **Service or sign-in fault** (503, 401, 405, 500) | "That did not go through. Try again." | keep | none | show |
| **Daily limit at start** (`CAPPED` from the edge) | "Canvas drafting has reached today's limit. Try again tomorrow." | keep (true for this case; today the same code is also used for a provider limit on file reading, fixed in A) | none | never shown |

### D. Finished, but the owner got little

| Cause | Owner sees today | Proposed words (PROPOSED) | Buttons | Retry |
|---|---|---|---|---|
| **No change made** ("Nothing changed" reply) | "Nothing changed on the canvas." plus ` I noted: "{model note}"` | add a next step only where the cause is established (the message made no change to any box) | none | n/a |
| **Pick or choice replies** (`hold`) | "Nothing changed on the canvas. You chose to keep it as it is." and the other fixed hold lines | keep. The choice layout itself is **APPROVED, P1646 D2, verbatim:** "I'm not sure about this. It contradicts your current [box], "[current point]". I'd recommend [X], because [reason]." / "A (recommended). [option and what it means for the canvas]" / "B. [option and what it means]" / "C. Keep the canvas as it is." / "Reply A, B or C." The other P1646 lines carry founder-decision markers in code and approval is not shown there | the letters, as today | n/a |
| **File applied nothing, other business found** (J9) | "Your new file is also about A. This canvas stays about F." | keep | the existing offer rows | n/a |
| **Points left out** | names up to three, e.g. "I couldn't add "{point}" because it doesn't match what you said closely enough. Say it once more with a bit more detail, like who it is about and what happened." | keep | none | n/a |
| **Drops by scope, cap or price** | never shown | not proposed: stays hidden unless the founder reverses the hiding in Solution 3 | | n/a |
| **Material cut** | "Some of what you sent was too long, so I read only part of it." | keep | none | n/a |

### What the code says that the spec did not
- Only `nothing_supported` and `no_readable_material` name an unreadable link. Every other failure reply never mentions links.
- The short failed sentence is blind to one thing besides the model writing nothing: points dropped by the names screen are counted but not shown on a failed run. The replay shows this did not happen in the three founder messages (nothing dropped).
- Try again shows for any failed newest run, whatever its code. The code is already read from the run row but the button does not use it.
- A first draft that completes with no actions on an empty, focus-less draft takes the first-draft branch and inserts an Undo step, so a question-only completion may show an Undo control (read from the SQL, not executed).
- Refused messages are not remembered by the selector, and a done question run counts as 1 of the 30 (confirmed in the SQL). `c_cap` is 30. The 2026-11-05 decisions entry was not read.

### Where in code
- Run failures and replies: `supabase/functions/_shared/canvas-run.ts` (`failureOf`, `failRun`, `askModel`, `fitOrFail`), `canvas-reply.ts` (`failedLine`, `buildDraftReply`), `canvas-choice-run.ts` and `canvas-choice.ts` (choice replies), `canvas-read.ts` (`blocked`, `empty`, `unparsable`), `canvas-fit.ts` (`too_large`).
- Upload failures and edge answers: `canvas-handlers.ts` (`failUpload`, `readUploadText`, `keepUpload`, `refuseBegin`), `canvas-draft/index.ts` (`DISABLED`, terms).
- Links: `canvas-material.ts` (`URL_FIND`, `FAILURE_TEXT`), `canvas-thread.ts` (`gatherLinks`).
- SQL: `supabase/migrations/20261030080000_p1536_v6_engine.sql` (`_canvas_draft_expire`, `_canvas_draft_run_fail`, refusals, `c_cap`) and `20261103010000_p1536_server_review_fixes.sql` (begin, complete, retry, `first_draft`).
- Client: `src/app/data/canvas-draft-calls.ts` (codes), `src/app/pages/chat/canvas-thread-copy.ts` (`DRAFT_ERROR_TEXT`), `CanvasRetry.tsx` and `canvas-retry-trailing.tsx` (retry), `canvas-offer-copy.ts`, `use-canvas-actions.ts`, `use-canvas-uploads.ts`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A link stays as owner material after "Yes, my business": page facts count as the owner's | ACCEPT | Same as any link today, and the owner just confirmed it. "Not mine" removes the page from later runs |
| Follow-ups use up the 30 updates | ACCEPT | F1; few follow-ups per draft. Hitting the cap has its own way forward |
| Refused runs still cost money and count toward the daily limit | ACCEPT | Unchanged. They do not count toward the 30 |
| A word is read as a domain | MITIGATE | Real-looking domains only; the reply names what it read |
| An old button is tapped after the canvas moved on | MITIGATE | A tap on a stale button says so and changes nothing |
| A button text matches the pick reader by accident | MITIGATE | Labels are checked against it in a test |
| Tests pass while real model behaviour broke (P1625, P1646) | MITIGATE | Real-model runs in Done-When |

**Non-Goals**
- Do NOT change the two-word rule, the best-guess check or the model's instruction not to guess.
- Do NOT change the shared input selector.
- Do NOT cover agents other than the canvas agent.
- Do NOT address a message that both contradicts a point and adds a fact.
- Do NOT build "a model for mine".

## Acceptance Criteria

- [ ] `airbnb.com - make canvas` as a first message is read as a link, and the reply names it and gives options with one recommended, or a plain question when no assumption can be sourced
- [ ] Tapping the "my business" option drafts from the page and shows the words each point came from; tapping "not mine" (wording to be approved) removes the page from the draft's material, asks what the business does, and a later run proves the page's words are not in its input
- [ ] Sending `its a car selling buisness`, then answering the follow-up, gives a run that uses both messages
- [ ] Every assumption or question shown in those runs can be traced to the owner's words or the named page, judged per fixture against a written list of allowed facts
- [ ] Two failures in different inventory rows get different explanations; two in the same row get the same one
- [ ] The retry control follows the approved table on TEST for a stubbed timeout and a refusal, and is absent at the daily limit
- [ ] Every path that shows no reply today and still has a thread to show it in shows words and a next step, proven through the real path that posts or displays it, or in an integration test where it cannot be staged live. A path with no such place is marked so in the inventory with the reason
- [ ] Tapping a button adds no new evidence word, and a stale button changes nothing

## Done-When

- [x] The inventory table is in this spec and the founder approved it before the replies were built (approved 2026-11-10: the pattern and every PROPOSED sentence as written; `http_*` keeps retry shown for the whole family, no 4xx/5xx split)
- [x] Before the build: the three founder messages replayed on fresh TEST canvases, 5 runs each, with a named harness that records what the model returned and what the checks dropped, written here. An unreadable link is staged deterministically, and a clear multi-sentence statement runs as a positive control

### Pre-build replay results (2026-11-10, self-hosted TEST)

Harness `e2e/p1653-replay.spec.ts` (`P1653_REPLAY=1`), functions from this branch (`FUNCTIONS: trusted (start match, end match)`), 25 sends, 25 claims, 25 parsed log lines joined by run id, all 5 groups complete, control proven end to end. Counts come from the temporary counts-only log line, not from reply wording.

| Fixture | Runs | Outcome | Model returned | Checks dropped |
|---|---|---|---|---|
| `airbnb.com - make canvas` | 5 | 5 of 5 failed, `nothing_supported` | 0 actions every time; a note and 9 questions every time | nothing |
| `https://www.airbnb.com/ this canvas` | 5 | 5 of 5 failed, `nothing_supported` | 0 actions; a note and 9 questions | nothing |
| `its a car selling buisness` | 5 | 5 of 5 failed, `nothing_supported` | 0 actions; a note and 9 questions | nothing |
| Control (used cars to families, warranty, price range) | 5 | 5 of 5 drafted, 3 or 4 boxes | 4 actions every time | 1 point by the evidence check in 1 of 5 runs |
| Staged unreadable link (`localhost`) | 5 | 5 of 5 failed, `nothing_supported`, reply names the unreadable link | 0 actions; a note and 9 questions | nothing |

**Findings.**
- Open Question 1 is answered: the model writes nothing on all three messages, every time, and the evidence checks drop nothing. The wall is the product's reply to an empty answer, not the checks.
- The model does return a note and a question for each of the nine boxes on every failed run; `canvas-reply.ts` does not show them (by design, Solution 3).
- `airbnb.com` is not read as a link (no link material): F4 confirmed.
- `https://www.airbnb.com/` is read, but the page text is only "Redirecting to www.airbnb.com.sg" (32 characters), so the model has no business facts. F2's assumption with options cannot source an assumption from this page as read today; the inventory names this case.
- The earlier missing reply on the staged link did not recur (5 of 5 replied).
- [ ] After the build: the same set plus "one more card here they are angry", and the two-message follow-up, real model on TEST, 5 runs each, results recorded here, with no fact outside each fixture's allowed list in any point, question or option
- [ ] A test fails if a failure code has no row in the reply table: codes derived from `failRun` call sites, SQL error codes and `canvas-draft-calls.ts`, with `http_*` as one family, one known member asserted per source

## Cost Budget

Applies because the replays call Gemini. Figures per `docs/technical/metered-services.md`; plan limits come from its registry.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Gemini calls | No new call per refusal: the reply uses the run that already ran. A tap that needs drafting = 1 run, as typing does | Grows only with owners' messages | Before: 3 messages + 1 control + 1 staged unreadable link = 5 x 5 = 25 per pass. Spent so far: 26 (a first pass whose run reads were blind, plus a 2-run probe check); the measured re-run is capped by the harness at 30 model attempts. After: 4 + 1 control + follow-up of 2 messages + link then tap = 9 x 5 = 45. Total at most 26 + 30 + 45 = 101 |
| Gemini spend | A few cents at most per run, from two runs logged on TEST 2026-11-09 (figures in the registry) | Same | 101 runs at the upper per-run figure, plus retries: a small fixed test cost. Bound by per-person limits (kept in the registry); spread across test accounts if a replay is capped |
| Edge invocations | Unchanged per message | Unchanged | Self-hosted TEST: 0 of the hosted plan |
| Log lines | A temporary counts-only line per parsed run during the replay, removed before ship. None in the shipped product unless a cause log is added (at most 1 per refusal) | Unchanged | 101 at most |
| Database reads (product) | One read of the newest agent reply per button tap, to tell an open question from a stale one; a tap makes no model call | Grows only with taps, at most one per redirect question | A few, one per tapped fixture |
| Database reads (harness only) | None in the product | None | Up to about 16 run-row reads per try plus material, reply and spend reads, against self-hosted TEST, which is not metered |

**Verdict:** fits, no plan limit is approached. The product adds no browser timer, loop or retry path. The replay harness polls TEST's database while it waits for each run; that loop is test-only and unmetered.

- [ ] Remove the temporary `canvas-draft: parsed` measurement line from `canvas-run.ts` before ship

## Open Questions

1. Why exactly did each of the three messages refuse? Inference above; the replay settles it.
2. The 2026-11-05 decisions entry says a 5-run cap; the code says 30 (`c_cap`). Correct the log when this ships.
3. Founder call: should the `http_*` family split into 4xx (hide retry: a rejected request will be rejected again) and 5xx (show retry)? The inventory keeps it one family with retry shown until decided.

## Related

[P1646](done/2026-06-10/p1646_canvas_agent_thinks_with_owner_options.md) · [P1639](done/2026-06-10/p1639_canvas_refuses_owner_negatives_and_typos.md) · [P1625](done/2026-06-10/p1625_canvas_drops_short_true_points.md) · P1536
