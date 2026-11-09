---
status: week
type: story
rank: 117
workstream: canvas
created_date: '2026-11-09'
tags: [canvas, mirror-agent, ux]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

- [ ] The inventory table is in this spec and the founder approved it before the replies were built
- [ ] Before the build: the three founder messages replayed on fresh TEST canvases, 5 runs each, with a named harness that records what the model returned and what the checks dropped, written here. An unreadable link is staged deterministically, and a clear multi-sentence statement runs as a positive control
- [ ] After the build: the same set plus "one more card here they are angry", and the two-message follow-up, real model on TEST, 5 runs each, results recorded here, with no fact outside each fixture's allowed list in any point, question or option
- [ ] A test fails if a failure code has no row in the reply table: codes derived from `failRun` call sites, SQL error codes and `canvas-draft-calls.ts`, with `http_*` as one family, one known member asserted per source

## Cost Budget

Applies because the replays call Gemini. Figures per `docs/technical/metered-services.md`; plan limits come from its registry.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Gemini calls | No new call per refusal: the reply uses the run that already ran. A tap that needs drafting = 1 run, as typing does | Grows only with owners' messages | Before: 3 messages + 1 control = 4 x 5 = 20. After: 4 + 1 control + follow-up of 2 messages + link then tap = 9 x 5 = 45. Total 65 |
| Gemini spend | About $0.012 to $0.019 per run, from two runs logged on TEST 2026-11-09 | Same | 65 x $0.019 = $1.24, plus retries. Bound by per-person limits (kept in the registry); spread across test accounts if a replay is capped |
| Edge invocations | Unchanged per message | Unchanged | Self-hosted TEST: 0 of the hosted plan |
| Log lines | At most 1 new per refusal, if the cause is logged | Unchanged | 65 at most |

**Verdict:** fits, no plan limit is approached. No browser timer, loop or new retry path is added.

## Open Questions

1. Why exactly did each of the three messages refuse? Inference above; the replay settles it.
2. The 2026-11-05 decisions entry says a 5-run cap; the code says 30 (`c_cap`). Correct the log when this ships.

## Related

[P1646](done/2026-06-10/p1646_canvas_agent_thinks_with_owner_options.md) · [P1639](done/2026-06-10/p1639_canvas_refuses_owner_negatives_and_typos.md) · [P1625](done/2026-06-10/p1625_canvas_drops_short_true_points.md) · P1536
