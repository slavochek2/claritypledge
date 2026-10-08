---
status: in-progress
type: task
rank: 23
workstream: infrastructure
created_date: '2026-10-08'
tags: [day, reflection, kanban, ai-keys]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, challenge-prd, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1440: /day — stories reach the agent, reflection is grounded, reflection cards are CP's cards

## Problem

> Founder framing, verbatim (2026-10-08, a board story): "this generation of these cards needs to be much better because it doesn't take into consideration both private decisions which we improved, past conversations and so on"

> Founder framing, verbatim (2026-10-08, conversation): "when I click on Next and Accept, I also accept the stories. We accept the stories that I put in because I put some very important stories."

(Read as: answering a card means the stories typed on it are accepted as work for the agent. Not a
request that Next should write anything; P1432's "paging never accepts" stands.)

**Situation:** The Day board (P1399, P1432, P1435) shows two tabs the founder answers: the daily
report (issue cards) and Reflection (3–5 statements written by one Opus agent in `/day` step 9r,
each answered with a position on the 7-level scale plus an optional free-text **story**). Answers
land in `~/.claude-day/decisions.jsonl` as `{kind:"reflection", target:"rN", position, story,
run_id, at}`. "Start fixing" builds one hand-off prompt (`buildPrompt`, `tools/kanban/src/lib/day.ts:1083`)
and launches a session that reads it ("Your task from the Day page is in the file …",
`tools/kanban/scripts/day-launch.sh:23`).

**Complication — eight founder findings from the 2026-10-07 and 2026-10-08 runs:**

1. **Stories are dropped.** The prompt carries stories under *"Reflection (record these in the
   decisions log)"* (`day.ts:1137-1143`) — a logging instruction, not work. Nothing marks a story
   handled, and stories from earlier runs are only ever offered to that run's own prompt. Measured
   2026-10-08 against `decisions.jsonl`: 19 reflection lines carry a story; the 4 from the
   2026-10-04 run (and one 10-06 edit) were never in any sent prompt, and the 14 that were sent were
   sent only as "record these". Several are direct requests (a request for names and contact details
   of people a statement mentioned; "make sure reflection does not duplicate").
2. **Statements ignore what is already known.** The writer sees only the pass's facts and 14 days
   of board answers. On 10-08 it proposed running a smaller event within 7 days after a shaken
   motivation, ignoring a post-event reflection held in conversation on 10-07 (confirmed:
   `~/.agents/bin/hist "motivation"` returns the 10-07 session turns). On 10-07 the founder also
   said statements should be "high level stuff — strategy, not micromanagement", and on 10-08 that
   personal activities (hikes) are personal, not CP.
3. **No reasoning is shown.** A bare 140-character statement gives the founder nothing to weigh.
   The founder asked for "a story by my Mirror Agent … on behalf of Slava, similar like we have in
   Disagreement Pipeline", one that explains why, "referencing stuff and his research".
4. **The reflection card is not the product's point card.** The Day card (`ReflectionTab.tsx`) is a
   hand-built look-alike on the product's 7-level scale; its "Remove position" sits inside the level
   menu (`ReflectionTab.tsx:168-178`), while CP's `FeedPointCard` uses `PositionButtons` with an
   `onClear` (`src/app/components/feed/feed-point-card.tsx:360-372`). Founder: "I cannot remove
   position … it's not the same card as the point card we have in CP".
5. **Buttons read inconsistently.** The pager shows `Next` always and `Accept & next` only on an
   unanswered founder card (`DayPage.tsx:734-742`), so card 1 (an agent card) says Next and card 2
   says Accept & next. Reflection has no Accept at all.
6. **AI key budgets are half-shown.** `monitoring.cloud.keys` on the 10-08 report holds 5 keys, 3 of
   them `collected:false` with *"no billing data: unused, or not in the billing export"*. The billing
   account holds 10 budgets (`gcloud billing budgets list`, run 2026-10-08): one account-wide (400),
   one GPU leak alarm (100), and per-key budgets — 4 keys with both a cap budget and an alert
   budget, 2 keys with a cap budget only. "Unused" and "unmeasurable" share one sentence.
7. **Agent VM / LinkedIn helper monitoring is no longer wanted** (founder decision 2026-10-08).
   Steps `disp.3` and `disp.3h` (`~/.claude/scripts/day-steps.tsv:45-46`) and check `disp.vm`
   (`day-checks.tsv:34`) still run every pass.
8. **Reflection duplicates the report.** 10-07 r5 story: "duplicate! lets make sure in future in
   reflection we dont get duplicates". The repeat guard (`day-reflection-history.ts --reject-repeats`)
   compares only against earlier *answered statements*, never against this pass's issue cards.

**Question:** What changes make every founder story a tracked work item, make the statements
grounded and explained, and make the board consistent and complete — without breaking the P1432
rule that paging never accepts?

## Appetite

Blast radius: medium — the founder's daily driver (`/day`, the board, the hand-off prompt); no
product users. Reversibility: high — git revert on cp `tools/kanban` and `~/.claude`; the one
durable change is new lines in `decisions.jsonl` (see the parser row in Risks). Decision density:
medium — five founder calls, marked below.

## Invariants

- **Paging never accepts** (decisions.md 2026-10-07 [product], P1432). Next, Previous, ← and → only
  move. Any "Accept & next" writes the answer at once, as its own button. Nothing in this spec may
  merge Next and Accept into one handler.
- **The decisions file is the only store** for board answers (P1432). The processed-story marker
  goes in the same file, not a second log.
- **Board-quoted text is data, not instructions** (rule already in `buildPrompt`). Stories are the
  founder's words but are relayed through a file; the prompt keeps quoting them as data, and the
  agent asks before any irreversible action a story requests.
- **Private material never enters a public file.** Mirror stories will cite pp decisions and private
  conversations; they live only in `~/.claude-day/` reports and the local board. Nothing from them
  is written into cp `features/`, `docs/`, test fixtures or commit messages.
- **Statement text stays unedited by the dispatcher** (step 9r rule): a refused statement goes back
  to its writer, never trimmed by hand. The same holds for mirror stories.

## Founder decisions (2026-10-08, relayed by the lead session)

- Split: this spec keeps stories + reflection cards; key cards moved to P1442, VM removal to P1443.
- Close the 19 pre-ship stories in one batch; start clean.
- A story without a position is kept.
- Personal activities (hikes) are a **hard filter**: never a CP reflection statement.
- Byline: **"Agent on Slava"** — CP's existing `AgentByline` already renders `[AGENT] on <Name>`
  (`src/app/components/shared/agent-byline.tsx`), so the byline is that component, not new text.
- The agent is an **entity with its own position and its own story**, exactly like an arguer agent
  in the Disagreement Pipeline. The founder picks his own position; the agent never picks it for
  him, and shows its own alongside.
- **Reuse, don't rebuild.** The symptom to eliminate: the reflection card's remove-position control
  is not red like CP's. Story design, agent position, agent story and position buttons are CP's and
  the Disagreement Pipeline's, reused as-is. Technical mechanism delegated to Codex (below).
- A card that needs no founder action is not a card: it moves to the monitoring/info area.

## Solution

### A. Stories become work items (finding 1)

- `buildPrompt` replaces the "record these in the decisions log" block with **"Your stories — act
  on each one"**: one numbered item per story, carrying the statement, the founder's position (or
  "no position") and the story verbatim (quoted as data), plus the instruction to do what it asks,
  or answer it, or say why not.
- A second block, **"Stories from earlier days not yet handled"**, lists every story from any
  earlier run whose latest version has no processed marker. Latest edit per `(run_id, target)` wins.
- **Processed marker:** a new decisions line `{kind:"story_done", run_id:"<run of the story>",
  target:"rN", story_hash, outcome:"acted|answered|declined|batch-closed", note, at}` — same
  `(run_id, target)` keying as the reflection line. `story_hash` = lowercase hex sha256 of the UTF-8 story after
  `\r\n`→`\n`, trim, and runs of whitespace collapsed to one space — one shared function used by
  board, server, prompt builder and CLI. A marker applies only if its `at` is later than the latest
  edit of that story (so A→B→A still reopens) and its hash matches. It closes **that version** only: editing a story
  after it was marked reopens it; a marker whose `story_hash` no longer matches is ignored.
- **Write path:** today the write route accepts decisions only for the latest run
  (`tools/kanban/server/day.ts:308-309`). Add one validated "mark story done" operation that accepts
  a historical `(run_id, target, story_hash)`, used by the board's "mark done" control and by a CLI
  the hand-off agent calls. The prompt's closing table gains a "story marked" column. The board shows
  each story's state (open / sent / done · outcome).
- **Launch:** `collect()` (`day.ts:953`) and the launch route (`server/day.ts:359-365`, refuses when
  the count is 0) count open stories from earlier runs.
- A story that is only sent stays open. Sent is not processed. After a story has been sent 3 times
  without a marker it leaves the prompt body and is listed by one line ("3 stories sent 3+ times
  and still open — see the board") and shown as **stuck** on the board, where the founder can
  re-send or mark it; it is never dropped.
- **Clearing a position never deletes a story.** Today `removePosition` writes `remove:true` and
  `buildView` drops the whole answer. Clearing the position keeps the story (story-only answer);
  deleting a story is its own action (empty the text and save), with a regression test.
- **Story without a position (founder: keep):** today `setStory` returns without writing when no
  position is set (`DayPage.tsx:310`). The reflection line's `position` becomes optional when a
  story is present; validation in `day.ts` (`kind === 'reflection'` branch) accepts story-only;
  `rated` counting treats story-only as "story, no position".
- **Backfill (founder: batch-close):** one `story_done` line with `outcome:"batch-closed"` per
  pre-ship story version, written once by the same operation; the 19 do not appear in any prompt.

### B. Grounded statement writer (findings 2, 8)

The step 9r brief gains, inline (the writer cannot read files):

1. **Earlier decisions** — pp and cp `docs/decisions.md` entries from the last 14 days plus keyword
   matches (files are ~11k and ~38k lines; never pasted whole). `scripts/search-decisions.sh` covers
   cp public + cp private only (verified: it never reads pp), so pp needs its own path — extend the
   helper with a pp source or add a sibling; tested with an older matching pp decision.
2. **Recent conversations** — founder turns from `~/.agents/bin/hist --role user --since <14 days>`.
   Topics are not taken from the issue cards (the 10-08 cards were all infra; the missed context was
   about events and motivation). Query terms = words from the candidate statements' drafts, the
   founder's stories in the window, and the last 3 days of founder turns unfiltered (capped).
3. **Every founder story** from the 14-day window and every still-open story (A).
4. **This pass's issue-card titles**, with the founder's 2026-10-07 rule (cp decisions.md
   2026-10-07 [process]): strategic only, never repeat an item already on that day's board.
5. **Retrieval contract:** each source carries a stable reference (decision: file + date + heading;
   conversation: `hist` session id + timestamp; finding: title). Hard cap on pasted lines with a **reserved share for each source class** (conversations included,
   never squeezed to zero); within a class, newest first. Anything fetched but cut by the cap is
   reported as truncated (count per class), and a source that cannot be fetched is named as missing.
6. **Scope rules:** strategy, not task micromanagement. **Hard filter:** a statement about a
   personal activity (hikes, personal life) is refused, not reworded.

Mechanical backstop: `--reject-repeats` also rejects a statement matching a this-pass finding title
(same normaliser + Jaccard). Paraphrases are the checker's job (C).

### C. "Agent on Slava" — an agent entity with its own position and story (finding 3)

Same shape as a Disagreement Pipeline arguer (`/slava:disagreement:positions`,
`/slava:disagreement:story-draft`), reused as-is:

- **Entity:** one agent identity, "Agent on Slava", rendered with CP's `AgentByline`. Local to the
  Day board — no `agent_accounts` row, nothing written to Supabase. CP decides "is agent" from
  `useAgentAccountIds`; the extracted renderers take `isAgent` as a prop instead, and Day passes
  `true`. Report shape (per statement, written by step 9r into the report, never into
  `decisions.jsonl`): `agent: {name: "Slava", position: -3..3, story, sources: [{ref, quote}],
  checker: "pass"|"dropped"}`.
- **Its own position** on each statement, on the 7-level scale (-3…+3; CP's `PositionType` covers
  all seven, `src/app/types/index.ts:1121`), rendered with CP's stance renderer `PositionBadge`
  (`src/app/components/shared/PositionBadge.tsx`, as used for `authorPosition` in
  `StoryCardDetail.tsx`). The inference-strength label from `/slava:disagreement:positions` stays
  in the agent's brief and evidence only: CP has no renderer for it, and the card reuses CP as-is. It is the agent's prediction of where the founder
  stands, shown beside the founder's control. It never pre-fills or writes the founder's position.
- **Its own story** per statement, under the story-draft rules: one short story per (agent,
  statement), three-tier accuracy (quoted fact / agent's connection / speculation, labelled),
  citing sources by stable reference (B.5).
- **Checker (PS-3):** every source the writer cites carries a verbatim `quote`; the dispatcher
  first checks each quote mechanically (`grep -F` against the cited decisions file, `hist` for the
  cited session) — a quote not found fails. Then a separate agent (spawned by the dispatcher with
  the sources and quotes pasted inline) judges whether the story says what the quotes support, and rejects duplicates of issue cards. Two failed rounds → the statement is dropped and
  named in the pass evidence; never published unchecked.
- UNTESTED that the agent's story and position change how the founder answers; falsifier: after two
  weeks the founder still reports statements he cannot weigh.
- Not the product's Mirror Agent (P1431); no shared service is created.

### D. Reflection card = CP's point card, by reuse (finding 4)

**Codex advice, 2026-10-08 (option D, recommended; founder delegated this choice):** extract CP's
actual rendering and interaction code — `PositionButtons` (incl. the red clear control), the point
card body, the agent story row with `AgentByline` and the agent's own stance — into presentational
components with no analytics, Supabase, auth or context imports. CP keeps thin wrappers that supply
persistence, analytics and identity, so CP behaviour is unchanged. Kanban consumes the same
components through a source alias, after aligning React to CP's version (19), deduplicating React
resolution (CP's `vite.config.ts:236` pattern), and adding Tailwind scoped to the Day page with CP's
theme tokens (also supplied to body-level portals, which `PositionButtons` uses:
`PositionButton.tsx:536`). Rejected: direct import with stubbed providers (impersonates
Supabase-backed providers); moving the board into CP's app (couples private Day data to the product
shell); a re-skin (what drifted).

**Import inventory and injection contract** (Opus review, checked against the files):

| Component | Import | Presentational? | In the extracted core |
|---|---|---|---|
| `PositionButton.tsx` | react, react-dom portal, `./menu-clamp`, types, `position-helpers`, `position-labels`, lucide | yes | kept |
| | `@/components/ui/button`, `@/components/ui/tooltip` (radix) | yes, but new deps for kanban | kept; kanban adds shadcn's `button`/`tooltip` sources via the alias and radix as a dependency |
| | `@/lib/mixpanel` | no | removed → `onEvent?(name, props)` prop; CP wrapper passes analytics |
| | `use-intensity-learned`, `use-intensity-preview-seen` | no (per-user state) | removed → `intensityLearned` / `previewSeen` + setters as props; CP wrapper passes the hooks; Day passes local values |
| | lazy `IntensityTutorialModal` | no (product flow) | removed → optional `renderTutorial` slot; Day passes none |
| `feed-point-card.tsx` | `useAuth`, `useAnonPosition`, `useReturnState`, online-write guard, `sonner`, `useOpenPath` | no | only the card body markup is extracted; the controller stays in CP |
| `StoryCardDetail` / `point-card-with-links` story row | `useAgentAccountIds`, `useEmbedNavigation`, `GravatarAvatar`, router | no | story row body extracted with `isAgent`, `authorPosition`, `onOpen?` props |
| `AgentByline`, `PositionBadge` | `MachineChip`, `stripAgentPrefix`, tooltip | yes | reused directly |

CP regressions for each removed dependency: intensity learning, tutorial trigger, analytics event
names, clear, author stance, unknown write outcome — all with CP's existing tests, run before and
after extraction.

Consequences the build must handle (Codex, verified against the cited lines before relying on them):
- `tools/kanban/server/__tests__/day.test.ts:1108` is P1399's rule 10 ("the board bundle imports no
  product code"). This spec replaces it, recorded as a decisions.md entry at ship: a **transitive**
  boundary check — approved shared renderers allowed; any module that reaches auth, Supabase,
  telemetry or service code, directly or through an approved renderer, fails.
- Day e2e selectors change to CP semantics (`listbox`/`option`, "Clear position") while keeping the
  persistence assertions; keyboard cycling and menus above the sticky bottom bar stay covered.
- CP regressions run for every extracted component (clear, author stance, unknown write outcome).

### E. One Accept pattern; cards that need no action are not cards (finding 5)

- P1432 holds: paging never accepts. Narrowing recorded at ship: on reflection, Accept saves the
  founder's own pick (there is no recommended answer); only the Accept button writes a typed story,
  never Next. Reflection gets `Accept & next`: saves the founder's position +
  story, awaiting the write; advances only on success; stays on the card on failure. Captures a
  story still being typed. Offered once the founder has a position or a story; the agent's own
  position is never what Accept saves.
- **A card that needs no founder action is not a card.** Agent-only work ("Give to the agent" with
  nothing for the founder to choose) and other info-only items move out of the card pager into the
  monitoring/info area as a list, still sent by Start fixing, each row keeping P1432's state line
  (not sent yet / sent to the agent). The pager then holds only cards the
  founder answers, so every card has Accept, and Next only moves.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Parser rejects the new `story_done` kind | MITIGATE | `parseDecisions` has a fixed `KINDS` list (`day.ts:603`); add the kind and test that an unknown kind is skipped, not fatal |
| Brief grows past what one agent reads well | MITIGATE | Retrieval by window + keyword, hard cap on pasted lines, stated in the brief |
| Mirror story cites a source that does not say what it claims | MITIGATE | Separate checker (PS-3); failure means rewrite, never edit |
| Private text leaks into a public file via fixtures or commits | MITIGATE | Invariant above; fixtures use invented text |
| Shared extraction regresses CP | MITIGATE | CP keeps thin wrappers; CP regression tests per extracted component |
| React 19 upgrade breaks the rest of the board | MITIGATE | Full kanban unit + both e2e suites before and after |

**Non-Goals**
- Do NOT merge Next and Accept, or make paging write anything.
- Do NOT build the product's Mirror Agent (P1431) or a shared mirror-agent service.
- Do NOT write the agent entity to Supabase or create an `agent_accounts` row.
- Do NOT change CP's product behaviour while extracting components.

## Done-When

- [x] A story answered on the board appears in the next hand-off prompt as a numbered work item, not under "record these" (unit day-stories "numbered story items"; real-data copy: prompt built from a copy of decisions.jsonl lists them under "Your stories — act on each one")
- [x] A story typed with no position is saved and appears in the prompt as "no position" (e2e story-only save; unit asserts "My position: no position")
- [x] Editing a story after it was marked done reopens it; a marker for an older version does not close the newer text (test) — plus a delayed mark for A after A→B→A is refused (mark carries the version)
- [x] A run whose only work is an open story from an earlier run can still start a session (test)
- [x] A story from an earlier run with no processed marker appears under "not yet handled"; after the agent marks it, it no longer appears (route + CLI tests, e2e board list)
- [x] Every story line older than the ship date is batch-closed (count derived at run time and pasted; 19 on 2026-10-08) and none appears in a prompt — pre-ship on a copy of the real file: `--batch-close-before` closed **17** (19 story lines = 17 stories, two edited once), rerun closed 0, real file untouched. `[post-ship]` run it on ~/.claude-day after the board ships and paste the count.
- [x] The mark-done CLI writes a valid `story_done` line and refuses an unknown `(run_id, target)` (test)
- [x] A decisions file containing the new kind loads without dropping other lines, and a parser without the kind counts it as one skipped line, not corruption (test)
- [ ] Given the 2026-10-08 inputs, the step 9r brief contains the 10-07 post-event conversation reference and the 10-07 dedup rule (inspect the brief); a statement about a personal activity is refused (fixture)
- [ ] A statement matching a this-pass finding title is refused by `--reject-repeats` (failing control shown, exit 1)
- [ ] Every reflection card shows "Agent on Slava" (CP `AgentByline`) with the agent's own position and a story citing at least one source; the founder's position is never pre-filled by it; the checker's verdict per story is in the pass evidence
- [ ] The reflection card renders CP's extracted components (no copied markup); the clear control's computed colour equals CP's destructive red in a browser check; CP's own regression tests for the extracted components pass
- [ ] The kanban boundary test allows the shared renderers and refuses an import of a Supabase/analytics module (failing control shown)
- [ ] Reflection has `Accept & next` that awaits the write and stays on failure (e2e); the report pager holds only founder-answerable cards and agent-only items are listed in the info area
- [ ] The agent's position and story never appear in `decisions.jsonl` (test)
- [ ] A statement whose story fails the checker twice is dropped and named in the evidence (fixture, failing control)
- [ ] Kanban on React 19: full kanban unit suite and both e2e suites pass before and after the upgrade (counts pasted)
- [ ] Checked at 375px, 320px and desktop

## Alternatives Considered

- **Stories as a separate log file** — rejected: P1432 made the decisions file the only store.
- **Marking a story processed when it is sent** — rejected: that is today's behaviour, and the data shows sent stories were never acted on.
- **Pasting whole decisions files into the brief** — rejected: ~49k lines combined.
- **Merging Next into Accept** — rejected by P1432 (arrows recorded answers).

## Rollback Strategy

Revert the cp `tools/kanban` commit and the `~/.claude` script/manifest commit. `story_done` lines
already written stay in `decisions.jsonl`; a reverted parser must skip them (the Risks row makes this
a tested property before ship).

## Related

- P1399 (Day report + page), P1432 (Accept saved at once), P1435 — `features/done/2026-06-10/`
- P1431 — product Mirror Agent letter chat
- `/slava:disagreement:story-draft` — story voice, accuracy tiers, writer/checker split (PS-3)

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Founder quote may mean Accept bundles stories without review | Rejected | The full sentence (hist, 2026-10-08 10:10) continues "We accept the stories that I put in because I put some very important stories"; quote extended in Problem |
| 2 | /challenge-prd | [BLOCK] D1 not viable (PositionButton imports mixpanel, ui/button, hooks) | Superseded — founder rejected re-skins; Codex option D (extract presentational cores) | Imports verified with grep; Codex advice 2026-10-08 |
| 3 | /challenge-prd, Codex | [WARN/BLOCK] story_done keying, version, and edits | Applied — `(run_id, target, story_hash)`, edit reopens | Same keying as reflection lines |
| 4 | Codex | [BLOCK] Old open stories cannot launch (count 0 refusal) | Applied — collect/launch count open stories | Verified `server/day.ts:359-365` |
| 5 | Codex | [BLOCK] Historical writes refused by latest-run-only route | Applied — dedicated mark-done operation | Verified `server/day.ts:308-309` |
| 6 | Codex, Gemini, /challenge-prd | [BLOCK/WARN] Accept on reflection: save ordering, no recommended position | Applied — await write; superseded on the pick: founder keeps story-only answers, so Accept is offered with a position or a story | Verified `setStory` fires an unawaited write and drops a story with no position |
| 7 | Codex | [WARN] No retrieval contract | Applied — B.5 | — |
| 8 | Codex, Gemini | [WARN/BLOCK] Project metric is not per-key | Applied partly — 1:1 key/project asserted, multi-key projects read unmeasurable | Gemini's multi-key failure does not apply today: each key has its own project (day.md AI KEYS) |
| 9 | /challenge-prd | [WARN] Done-When items weak/nondeterministic | Applied — rewritten as deterministic checks | — |
| 10 | /challenge-prd | [WARN] C may be unnecessary | Kept, with UNTESTED label and falsifier | Founder asked for referenced reasoning explicitly |
| 11 | /challenge-prd | [WARN] Split F and G into own specs | Split: P1442 key cards, P1443 VM removal | Founder decision 2026-10-08 |
| 12 | /challenge-prd | [NOTE] Many open founder decisions | Accepted | They are listed for one answer pass |
| 13 | founder | Reflection card remove control not red like CP | Reuse CP components via extraction (D) | Re-skins drifted |
| 14 | founder | Why do cards with nothing to accept exist? | They move to the info area (E) | A card is something the founder answers |
| 15 | Codex re-review | Clearing a position discards its story | Applied — clear keeps story; separate delete | Probe reproduced it |
| 16 | Codex re-review | search-decisions.sh never reads pp | Applied — pp path required | Verified by grep |
| 17 | Codex re-review | Hash A→B→A closes the new edit | Applied — marker must postdate latest edit | — |
| 18 | Codex re-review | Cap can starve conversations | Applied — reserved share per class, truncation reported | — |
| 19 | Gemini re-review | Topics from issue cards miss off-board context | Applied — topics from drafts, stories, recent turns | — |
| 20 | Gemini re-review | Hash normalisation undefined | Applied — one shared function, defined | — |
| 21 | Gemini re-review | Unbounded re-injection of open stories | Applied — stuck after 3 sends, listed by count | — |
| 22 | Gemini re-review | Checker cannot read files | Applied — mechanical quote check by dispatcher, then judge agent | — |
| 23 | Gemini re-review | Reverted parser crashes on story_done | Rejected — `parseDecisions` skips unknown kinds as bad lines (day.ts:667-689) | Verified |
