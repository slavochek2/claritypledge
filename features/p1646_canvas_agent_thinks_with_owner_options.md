---
status: in-progress
type: story
rank: 110
workstream: canvas
created_date: '2026-11-06'
tags: [canvas, mirror-agent]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 5af58fafd2e2f699ef486c98ddb597d37f378d13858a4ec0b2c8b161ab9c0aa8
spec_review_vendors: [codex, gemini, openrouter]
---

# P1646: Canvas agent thinks with the owner instead of refusing

## Problem

**Situation:** In a canvas thread the mirror agent writes points only from the owner's material, and when a message clashes with the canvas or is not supported it changes nothing and says why.
**Complication:** The founder's own prod test on a canvas holding Dropbox points:
- "Problem 'Today people do not like juice'" → `Nothing changed on the canvas. I noted: "The requested point about juice contradicts the supported offer material for Dropbox and lacks evidence."`
- "Problem make it more about orgnaizations that waste money on other tools" → `Nothing changed on the canvas. I noted: "The provided source material does not mention organizations wasting money on other tools, so the problem point was kept as supported."`

The owner is the source, yet the agent treats their statement as a claim to check against older material and refuses.
**Question:** How should the agent answer when the owner says something that conflicts with the canvas or has no support yet?

> Founder, verbatim: "it should be more helpful, like maybe with options... thinking with me. So if I say something contradictory, he would say, if you go with this, it would mean this and this and this. Do you accept version A, B, C... Not like so reluctant."
> "it should say I'm not sure this is good it contradicts this and this and this I would recommend that and that but if you want you can go with this and these options that would mean that and that please confirm ABC what you like and for example A recommended"

## Appetite

High blast radius: it changes every canvas chat reply that meets a conflict, and the model's instructions for all drafts. Reversible, but not prompt-only: the agent never sees its own earlier replies (`canvas-thread.ts` reads owner messages only, a P1536 rule), so an offered choice must be stored between turns, which needs a migration, and the model's response format needs an options field (today a one-sentence `note`, cut at 160 characters). A few founder decisions: the reply wording and which options exist.

## Solution

1. **The owner's statement about their own canvas is evidence.** A statement in the owner's thread may replace or add a point even when older material says otherwise. This is new: the prompt today tells the model to keep supported points. Nothing is added without showing the owner's words (decision 2026-11-05, P1625).
2. **A conflict gets options, not a refusal.** When the owner's message conflicts with points on the canvas, the agent replies in this order, and changes nothing until the owner picks:
   - what it conflicts with, naming the current points;
   - its recommendation, and why;
   - each option and what choosing it would mean for the canvas (for example: replace it, so Solution and Revenue should follow; add it beside the current point; keep the canvas as it is);
   - "Confirm A, B or C", with the recommended one marked.
3. **The offered choice is stored, then the owner's pick is acted on.** The run that offers options stores them with the draft (the option, its actions on current point ids, and the owner's quote). The server, not the model, refuses any write while a choice is open. A reply naming an option ("A", "go with B") applies it, with the usual note of what changed and from which words. "Keep" changes nothing and says so. A choice goes stale when the canvas changes before the pick; a stale or unknown pick is answered by offering the choice again.
4. **No facts still writes nothing, but always gives a next step.** "Make it a Dropbox canvas from memory" writes nothing, and the reply says what the owner could tell it instead. Never a bare refusal.

**Founder decisions, 2026-11-06:**
- **D1. An option changes only the box it names.** It may suggest other boxes to revisit ("Solution and Revenue may need updating, want me to?"), and acts on them only after the owner says so.
- **D2. Reply shape and wording**, approved from this draft (the agent fills the brackets):

  > I'm not sure about this. It contradicts your current [box], "[current point]". I'd recommend [X], because [reason].
  > A (recommended). [option and what it means for the canvas]
  > B. [option and what it means]
  > C. Keep the canvas as it is.
  > Reply A, B or C.

- **D3. At most three options.**
- **D4. Reverses P1625's "picking among versions is not built"**, at the founder's request.

## Invariants

- The model never invents facts about the owner's business. Owner statements are evidence; the model's own knowledge is not (P1536, as amended 2026-11-05).
- A pending choice never changes the canvas until the owner picks.
- Points carrying numbers the owner never said stay refused (P1536).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The agent offers options for things that are not conflicts, so every reply becomes a question | MITIGATE | Options only on a named conflict with a current point; a plain new point is just added |
| A pick ("A") is read against the wrong pending choice | MITIGATE | The pick applies only to the latest open choice in that thread |
| A conflict now costs two runs (offer, then pick) against the draft's 30-run cap | ACCEPT | Unchanged cap; raise only if owners hit it |
| A wrong option is published unread | ACCEPT | Same as best guess: the owner sees the change and its words |
| Unsupported is mistaken for conflicting, or the reverse | MITIGATE | Conflict = the message contradicts a current point; a statement with no current point to contradict is added as a best guess (P1625) |

**Non-Goals**
- Do NOT add buttons or chips for the options in this spec; options are text the owner answers in chat.
- Do NOT change publishing, sharing or the run cap.
- Do NOT change the two-word evidence rule or the best-guess check (P1625, P1639).

## Acceptance Criteria

- [ ] A fixture canvas whose Problem is "Teams lose files across devices": the owner sending "the problem is organisations waste money on other tools" gets a reply naming that point, a recommendation, at least two options each with one line of what it means for the canvas, and a request to confirm one; the canvas is unchanged and the choice is stored
- [ ] Replying with the letter of a replace or add option applies exactly that option, and the reply says what changed and from which words; "keep" changes nothing and says so
- [ ] A pick with no open choice, or after the canvas changed, is answered by offering the choice again; nothing is written
- [ ] A plain new point with nothing to contradict is added as before, with no question
- [ ] "Make it a Dropbox canvas from memory" writes nothing, and the reply asks for a fact the owner can give
- [ ] A number the owner never said stays refused when an option is applied
- [ ] Real model on TEST, 5 runs per case above, each case passing at least 4 of 5, recorded in the spec
- [ ] Existing canvas suites pass

## Cost Budget

Per [metered-services.md](../docs/technical/metered-services.md): this design calls Gemini (one model call per offer or re-offer), calls Supabase (a stored-choice table, two new SQL functions, two cleanup triggers) and its real-model e2e creates and deletes test users, so it applies. Registry rows used: Gemini API, `gemini-3.8-flash` (the draft model, `MIRROR_MODEL`), and Supabase Free plan, both read 2026-10-27 and 2026-10-21 in the registry. Prices: $0.75 input and $3.75 output per 1M tokens through 2026-12-31, then $1.50 and $7.50.

**Where a number is an estimate:** the prompt size and the typical output size are estimates, not measurements (marked "est."). The ceilings are the code's own limits: output `MAX_OUT_TOKENS = 16_000`, thinking included (`canvas-draft.ts`); input est. 8,000 tokens = about 5,900 for the rules (the whole `canvas-prompt.ts` is 23,592 bytes, divided by 4, which over-counts because the file also holds code) plus about 2,100 for the data block (est.). Typical output est. 1,500 tokens. The seed message is a first draft of nine boxes and may output more than that.

**Cost of one model call (the unit used below)**

| Case | Input | Output | Cost |
|---|---|---|---|
| Typical, today's price | 8,000 x $0.75 / 1M = $0.0060 | 1,500 x $3.75 / 1M = $0.0056 | $0.0116 |
| Ceiling, today's price | $0.0060 | 16,000 x $3.75 / 1M = $0.0600 | $0.0660 |
| Typical, from 2027-01-01 | 8,000 x $1.50 / 1M = $0.0120 | 1,500 x $7.50 / 1M = $0.0113 | $0.0233 |
| Ceiling, from 2027-01-01 | $0.0120 | 16,000 x $7.50 / 1M = $0.1200 | $0.1320 |

**Which messages call the model** (`canvas-choice-run.ts` header): an offer = 1 call, as a conflicting message costs today; a pick (a letter, "keep", "recommended") = 0 calls, the server applies the stored option; a pick on a stale or settled choice (a re-offer) = 1 call; a pick with no open choice = 0 calls.

| Measure | Per owner | Per hour | Per test run (one attempt of the spec file) |
|---|---|---|---|
| Model calls | Offer then pick: 1 + 0 = 1 call (the same 1 call a conflicting message cost before). Offer then a re-offer: 1 + 1 = 2. The draft's cap of 30 runs bounds it: 30 x $0.0116 = $0.35 typical, 30 x $0.0660 = $1.98 ceiling, today's price | None. No timer, poll or schedule is added (rule 2: not applicable) | 85 calls. Per try (one call per seed, offer or re-offer; picks add 0): case 1+2 = 2, keep = 2, 3a = 1, 3b = 3, 3c = 3, case 4 = 2, case 5 = 2, case 6 = 2, which sums to 17 per try; 17 x 5 tries = 85. Playwright retries locally once (`retries: process.env.CI ? 2 : 1`), so a failed test repeats all its 5 tries: worst case all 7 fail = 2 x 85 = 170 calls |
| Model tokens | Per call: 8,000 in (est.), 1,500 out typical (est.), 16,000 out ceiling | None | 85 x 8,000 = 680,000 in; 85 x 1,500 = 127,500 out typical; 85 x 16,000 = 1,360,000 out ceiling. Worst case with retries: double each |
| Model cost, Gemini price from the registry | Typical $0.0116 per call, ceiling $0.0660 (table above) | None | Typical: 0.68M x $0.75 + 0.1275M x $3.75 = $0.510 + $0.478 = $0.99. Ceiling: $0.510 + 1.36M x $3.75 ($5.10) = $5.61. Worst with retries: $1.98 typical, $11.22 ceiling. From 2027-01-01 the same calls cost: typical 0.68M x $1.50 + 0.1275M x $7.50 = $1.02 + $0.96 = $1.98; ceiling $1.02 + 1.36M x $7.50 ($10.20) = $11.22 |
| Edge function invocations (the canvas run function; every owner message is one, a pick included) | Offer + pick = 2 | None | Owner messages: c1+2 3, keep 3, 3a 2, 3b 4, 3c 3, case 4 2, case 5 2, case 6 3 = 22 per try x 5 = 110. Worst with retries 220 |
| Supabase requests (users, canvases, messages) | A pick adds 1 call to `_canvas_draft_choice_latest` (read) and 1 to `_canvas_draft_run_complete_choice` (write); an offer adds the same two plus 1 insert into `canvas_draft_choices`. Per message: 2 SQL function calls + at most 1 row | None | Users: 7 created + 7 deleted = 14 admin calls (the repo's existing helper, one call per user; worst 28 with retries). Canvases: 7 tests x 5 tries = 35 opened (worst 70). Chat rows: 110 owner messages + 110 agent replies = 220 inserts (worst 440). One hand edit per try in case 3c = 5 `canvas_draft_edit_point` calls |
| Stored data | One `canvas_draft_choices` row per offer: at most 2 options x (300 statement + 400 quote + 200 means) = 1,800, + request 2,000 + reason 200 + ids about 100 = about 4,100 bytes (upper bound). Deleted when the draft closes (`canvas_drafts_choices_on_close`) or on erasure | None | At most 35 choice rows per attempt (offers: case 1+2, keep, 3b, 3c, case 6 = 5 cases x 5 tries = 25; re-offers in 3b and 3c = 2 x 5 = 10), 35 x 4,100 B = 143.5 KB, deleted with the test user's drafts |
| Trigger cost on `chat_messages` (`chat_messages_canvas_choices_on_erase`) | The trigger's `WHEN` clause (`derived_refs` going from set to NULL on a canvas run's message) is false on every insert and every normal update: 0 executions per owner action. It runs only inside `erase_chat_data_for`: N erased agent replies x 1 `DELETE` = N statements, once per erasure request | None | 0 (the e2e never erases a person's chat data) |
| Realtime messages | Not measured. | None | Not measured; assumed ceiling of 10 messages per chat row, 220 x 10 = 2,200 of the registry's 2,000,000 (0.11%). The 10 is an assumption |
| Egress and log lines | Not measured | None | Not measured. The model's reply is Gemini traffic, not Supabase egress. These two cells stay open until read from the dashboard usage page after the first real run (`.private/docs/usage/` holds the values, never this file); the metered-services doc counts an unread limit as an incomplete budget |

**Rule 6 (tests count as traffic):** one attempt = 7 users, 35 canvases, 110 owner messages (220 chat rows with replies), 85 model calls, 5 hand edits. Local retry doubles every figure for a failed case. The spec never retries a failing case to get green (the lead reports it). The lead runs it once after deploying.

1. **Fits the plan limit today?** Supabase Free edge function invocations: 110 per attempt / 500,000 per month = 0.022% per attempt; monthly use = 110 x (runs per month) + the organisation's other invocations, so it fits as long as (runs per month x 110) stays under the limit left after the dashboard's current figure (read from the dashboard, never written here). Realtime: 2,200 / 2,000,000 = 0.11% per attempt on the assumption above. Gemini has a price and no cap: monthly cost = (attempts per month) x $0.99 typical to $5.61 ceiling (today's price) and the owners' own use at $0.0116 per call (1 call per conflict). The registry states no spend the founder has accepted, so the verdict on Gemini is: **fits the registry's price table, founder to accept the figure.** Egress and log ingestion: **unread, budget incomplete for those two rows** until the dashboard reading above.
2. **Fits at 10x?** 10x the owners = 10 calls per 10 conflicts, same $0.0116 each; 10x e2e attempts = 1,100 invocations (0.22%) and $9.9 typical / $56.1 ceiling per set. Supabase: fits. Gemini: scales linearly, no cap to hit.
3. **If either answer is no:** the Gemini and Supabase rows give no limit that fails. If Supabase egress or logs, once read, are over the Free plan, the registry names Pro at $25/month ($0.09 per GB over 250 GB egress).

## Related

P1625 · P1639 · P1536 (its `conflicts` and tensions plumbing is not used for this: tensions are no longer written, and nothing asks the model for `conflicts`) · P1621 (cards by hand)
