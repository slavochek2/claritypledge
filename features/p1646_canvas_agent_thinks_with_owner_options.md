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
| Model calls | Offer then pick: 1 + 0 = 1 call (the same 1 call a conflicting message cost before). Offer then a re-offer: 1 + 1 = 2. The draft's cap of 30 runs bounds it: 30 x $0.0116 = $0.35 typical, 30 x $0.0660 = $1.98 ceiling, today's price | None. No timer, poll or schedule is added (rule 2: not applicable) | 95 calls with `--retries=0` (how the lead runs it). Per try (one call per seed, offer or re-offer; picks add 0): case 1+2 = 2, keep = 2, case 2b = 2, 3a = 1, 3b = 3, 3c = 3, case 4 = 2, case 5 = 2, case 6 = 2, which sums to 19 per try; 19 x 5 tries = 95. The config default is `retries: process.env.CI ? 2 : 1` (`playwright.config.ts` line 185), so a failed test repeats all its 5 tries: with the default and all 9 tests failing, 2 x 95 = 190 calls |
| Model tokens | Per call: 8,000 in (est.), 1,500 out typical (est.), 16,000 out ceiling | None | 95 x 8,000 = 760,000 in; 95 x 1,500 = 142,500 out typical; 95 x 16,000 = 1,520,000 out ceiling. Default retries, worst case: double each |
| Model cost, Gemini price from the registry | Typical $0.0116 per call, ceiling $0.0660 (table above) | None | With 0 retries, today's price: typical 0.76M x $0.75 + 0.1425M x $3.75 = $0.570 + $0.534 = $1.10; ceiling $0.570 + 1.52M x $3.75 ($5.70) = $6.27. Default retries, worst case: $2.21 typical, $12.54 ceiling. From 2027-01-01, 0 retries: typical 0.76M x $1.50 + 0.1425M x $7.50 = $1.14 + $1.07 = $2.21; ceiling $1.14 + 1.52M x $7.50 ($11.40) = $12.54; default retries, worst case $4.42 and $25.08 |
| Edge function invocations (the canvas run function; every owner message is one, a pick included) | Offer + pick = 2 | None | Owner messages per try: c1+2 3, keep 3, 2b 3, 3a 2, 3b 4, 3c 3, case 4 2, case 5 2, case 6 3 = 25 per try x 5 = 125 with 0 retries. Default retries, worst case 250 |
| Supabase requests (users, canvases, messages) | A pick adds 1 call to `_canvas_draft_choice_latest` (read) and 1 to `_canvas_draft_run_complete_choice` (write); an offer adds the same two plus 1 insert into `canvas_draft_choices`. Per message: 2 SQL function calls + at most 1 row | None | Users: 9 created + 9 deleted = 18 admin calls with 0 retries (the repo's existing helper, one call per user; 36 in the default-retries worst case). Canvases: 9 tests x 5 tries = 45 opened (worst 90). Chat rows: 125 owner messages + 125 agent replies = 250 inserts (worst 500). One hand edit per try in case 3c = 5 `canvas_draft_edit_point` calls |
| Stored data | One `canvas_draft_choices` row per offer: at most 2 options x (300 statement + 400 quote + 200 means) = 1,800, + request 2,000 + reason 200 + ids about 100 = about 4,100 bytes (upper bound). Deleted when the draft closes (`canvas_drafts_choices_on_close`) or on erasure | None | At most 40 choice rows per attempt (offers: case 1+2, keep, 2b, 3b, 3c, case 6 = 6 cases x 5 tries = 30; re-offers in 3b and 3c = 2 x 5 = 10), 40 x 4,100 B = 164 KB, deleted with the test user's drafts |
| Trigger cost on `chat_messages` (`chat_messages_canvas_choices_on_erase`) | The trigger's `WHEN` clause (`derived_refs` going from set to NULL on a canvas run's message) is false on every insert and every normal update: 0 executions per owner action. It runs only inside `erase_chat_data_for`: N erased agent replies x 1 `DELETE` = N statements, once per erasure request | None | 0 (the e2e never erases a person's chat data) |
| Realtime messages | A reply row reaches the owner's one open tab: 1 message per chat row (assumed, not measured) | None | Assumed ceiling of 10 messages per chat row, 250 x 10 = 2,500 (the 10 is an assumption). Organisation quota: 0 when TEST is self-hosted (see "Which server" below) |
| Client egress (bytes the feature adds) | The reply text posted to the owner. Bound from the caps in `canvas-choice.ts`: lead 40 + "your current " 13 + box title <= 30 + 3 contradicted points x (300 + 2 quotes) + joiners 6 = 997; recommendation 15 + 34 + ", because " 10 + reason <= 200 + 1 = 260; 2 option lines x (17 label + 16 "Replace it with " + 300 + 2 quotes + 2 full stops + means <= 200 + 1 space) = 2 x 538 = 1,076; keep line 44; "Reply A, B or C." 16; 4 line breaks. Offer <= 997 + 260 + 1,076 + 44 + 16 + 4 = 2,397 characters. Applied reply <= "Updated: Problem." 17 + "I replaced " 11 + 3 x 302 + 6 + 302 + " in Problem, from your words " 29 + quote 82 + revisit line <= 170 = 1,521 characters. Kept reply 66, no-open-choice reply 120, refused-pick reply 80. Flow offer + applied pick <= 2,397 + 1,521 = 3,918 characters, so at most about 3.9 KB (4 bytes per character would make it 15.7 KB, which no real text reaches; typical est. 700 + 250 = about 1 KB). The `canvas_draft_choices` row (<= 4,100 B) is read by the edge function inside the project, not sent to a client | None | Test run: 125 owner messages + 125 replies: at most 250 rows x 2,397 characters = 599 KB, an upper bound that treats every reply as a full-length offer. Organisation quota: 0 when TEST is self-hosted |
| Log lines the feature adds (`console.log` and `console.error` in `canvas-choice-run.ts`) | Offer: `choice offered` (line 79) + `choice done` (line 62) = 2, plus `choice dropped model actions` (line 70) only when the model also sent actions, a note or questions, so 2 to 3. Applied pick: `choice done` = 1. Keep: 1. No open choice or settled keep: 1. Refused pick: `pick refused` (line 211) + `choice done` = 2. Re-offer: 2 to 3 (it ends in an offer) or 1 (it no longer conflicts). Failures, one error line each: `choice write failed` (line 50), `choice write answered unknown status` (line 59), `choice read failed` (line 187) = 1. Offer then applied pick: 3 to 4 lines | None | Upper bound, 0 retries: 30 offers + 10 re-offers = 40 x at most 3 lines = 120; picks that call no model (case 1+2 "A", keep, 2b "B", 3a "B", 3b keep letter, case 6 "A" = 6 x 5 = 30) x at most 2 lines (a refused pick) = 60; total at most 180 lines. Seeds are first-draft runs and add none of these. Organisation quota: 0 when TEST is self-hosted |

**Which server real runs hit (evidence):** `scripts/lib/active-test.sh` `active_test_target` runs `scripts/selfhosted/flip-test-env.py active`, which reads the main checkout's `.env.test.local` and decides by `state()`: the key `VITE_SUPABASE_URL` equal to the self-hosted URL together with the key `SELFHOSTED_TEST_ORIGIN` present means self-hosted (no values are quoted here). Running `python3 scripts/selfhosted/flip-test-env.py active` on 2026-11-06 printed `selfhosted`, exit 0. The self-hosted TEST is the Compute Engine VM of the registry (P1557), so test-run egress, log lines, realtime and edge invocations land on that VM and its network pricing line, paid from credits, and the Supabase organisation's quota takes 0 of each. The Gemini calls are billed either way. The flip state can change, so the lead re-runs that command before the run: if it prints `hosted`, the per-run figures above apply to the organisation's Free plan as written.

**Rule 6 (tests count as traffic):** one attempt = 9 users, 45 canvases, 125 owner messages (250 chat rows with replies), 95 model calls, 5 hand edits. With `--retries=0` that is one attempt; with the config default (1 retry locally) a failing case repeats, so every figure doubles in the worst case. The spec never retries a failing case to get green (the lead reports it). The lead runs it once after deploying.

1. **Fits the plan limit today?** Test runs: with TEST self-hosted the organisation takes 0 of every Supabase figure above. If TEST were hosted, edge invocations are 125 per attempt / 500,000 per month = 0.025% per attempt (monthly use = 125 x runs per month + the organisation's other invocations, read from the dashboard, never written here), realtime 2,500 / 2,000,000 = 0.125% on the assumption above, and egress at most 599 KB per attempt against 5 GB (= 0.012%). Owners in production: egress per month = owners x flows per owner x at most 3.9 KB against 5 GB, so 1,000 owners x 10 flows x 3.9 KB = 39 MB (0.8%); the inputs are formula variables, not values. Log lines per month = owners x flows x 3 to 4; **the registry gives no log-ingestion figure ("n/a", only 1-day retention), so this row cannot be compared and the budget stays incomplete for it until the dashboard usage page is read.** Gemini has a price and no cap: monthly cost = (attempts per month) x $1.10 typical to $6.27 ceiling (0.76M in, 0.1425M out typical, today's price) and the owners' own use at $0.0116 per offer. The registry states no spend the founder has accepted, so the verdict on Gemini is: **fits the registry's price table, founder to accept the figure.**
2. **Fits at 10x?** 10x the owners = 10 calls per 10 conflicts, same $0.0116 each, egress 390 MB for the 1,000-owner example (7.8% of 5 GB); 10x e2e attempts on a hosted TEST = 1,250 invocations (0.25%) and $11.0 typical / $62.7 ceiling per set. Supabase: fits. Gemini: scales linearly, no cap to hit. Log ingestion: not comparable, as above.
3. **If either answer is no:** the Gemini and Supabase rows give no limit that fails. If log ingestion, once read, is over the Free plan, or egress is, the registry names Pro at $25/month ($0.09 per GB over 250 GB egress).

## Related

P1625 · P1639 · P1536 (its `conflicts` and tensions plumbing is not used for this: tensions are no longer written, and nothing asks the model for `conflicts`) · P1621 (cards by hand)
