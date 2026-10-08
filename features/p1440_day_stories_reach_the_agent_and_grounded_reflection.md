---
status: week
type: task
rank: 23
workstream: infrastructure
created_date: '2026-10-08'
tags: [day, reflection, kanban, ai-keys]
disclosure: public
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1440: /day — stories reach the agent, reflection is grounded, key cards are complete

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

## Solution

### A. Stories become work items (finding 1)

- `buildPrompt` replaces the "record these in the decisions log" block with **"Your stories — act
  on each one"**: one numbered item per story, carrying the statement, the founder's position and
  the story verbatim (quoted as data), plus the instruction to do what it asks, or answer it, or say
  why not.
- A second block, **"Stories from earlier days not yet handled"**, lists every story from any
  earlier run whose latest version has no processed marker — not limited to the last run. Latest
  edit per `(run_id, target)` wins, as today.
- **Processed marker:** a new decisions line, e.g. `{kind:"story_done", run_id:"<run of the
  story>", target:"rN", story_hash:"<hash of the story text marked>", outcome:"acted|answered|declined",
  note, at}` — same `(run_id, target)` keying as the reflection line, so no composite target to
  parse. The marker closes **that version** only: editing a story after it was marked reopens it,
  and a marker whose `story_hash` no longer matches the latest text is ignored (a late agent cannot
  close a newer edit). Removing the position/story leaves nothing to process.
- **Write path:** today the board's write route accepts decisions only for the latest run and its
  targets (`tools/kanban/server/day.ts:308-309`), and `parseDecisions` requires `run_id`. Add one
  validated "mark story done" operation that accepts a historical `(run_id, target, story_hash)`,
  used by both the board's "mark done" control and the CLI the hand-off agent calls. The prompt's
  closing table gains a "story marked" column. The board shows each story's state (open / sent /
  done · outcome).
- **Launch:** `collect()` (`day.ts:953`) and the launch route (`server/day.ts:359-365`, refuses when
  the count is 0) must count open stories from earlier runs, so a run whose only work is an old open
  story can still start a session. Sent-receipt keys stay per story version.
- A story that is only sent stays open. Sent is not processed.
- **A story needs a position today:** `setStory` returns without writing when no position is set
  (`DayPage.tsx:310`), so a story typed on an unrated statement is lost. [FOUNDER DECISION: allow a
  story without a position, or keep requiring a pick and say so on the card?]
- **Backfill:** the first run after shipping surfaces all existing stories as open (the ones already
  sent were never handled as work). [FOUNDER DECISION: surface all 19, or mark the pre-ship ones
  done in one batch and start clean?]

### B. Grounded statement writer (findings 2, 8)

The step 9r brief gains, inline (the writer cannot read files):

1. **Earlier decisions** — entries from pp `docs/decisions.md` and cp `docs/decisions.md` dated in
   the last 14 days, plus older entries matched by keyword. The files are ~11k and ~38k lines, so
   whole-file pasting is not an option; retrieval is by date window + `scripts/search-decisions.sh`
   on the candidate topics.
2. **Recent conversations** — founder turns from `~/.agents/bin/hist --role user --since <14 days>`
   on the topics the pass raises (the 10-07 post-event reflection is the regression case).
3. **Every founder story** from the 14-day window and every still-open story (A).
4. **This pass's issue-card titles**, with the rule "never restate an issue the report already
   carries" — titles are already in the brief today. The founder already made this a rule on
   2026-10-07 (decisions.md 2026-10-07 [process], "/day 2026-10-07 reflection": challenges must be
   strategic and must not repeat an item already on that day's board) but it never reached the
   brief; this puts it there.
5. **Retrieval contract:** each pasted source carries a stable reference (decision: file + date +
   heading; conversation: `hist` session id + timestamp; finding: fingerprint title). A hard cap on
   pasted lines with a stated priority (open stories, then this pass's findings, then last-14-day
   decisions, then keyword matches, then conversations). A source that cannot be fetched is named as
   missing in the brief, never silently dropped.
6. **Scope rules:** strategy, not task micromanagement; personal activities are not framed as CP
   work. [FOUNDER DECISION: is "personal vs CP" a hard filter or only a framing rule?]

Mechanical backstop: `--reject-repeats` also rejects a statement that matches a this-pass finding
title (same normaliser + Jaccard), named on stderr, same retry loop as today. It cannot catch a
paraphrase; the checker in C does.

### C. Mirror Agent story per statement (finding 3)

Reuse the Disagreement Pipeline's story pattern from `/slava:disagreement:story-draft`, not its
filing: a machine account's reading on a named person's behalf, **one short story per (person,
statement)**, three-tier accuracy (quoted fact / agent's connection / speculation, labelled), and
**PS-3: the agent that checks a story is not the agent that wrote it**. Concretely:

- The statement writer returns each statement with a story (short — a few sentences) explaining why
  it matters, citing its sources by reference (decision date + heading, conversation date, report
  finding), shown on the card as *"Mirror Agent on behalf of Slava"*.
- A separate checker agent verifies each cited source exists and says what the story claims, and
  rejects duplicates of issue cards (B.4). A failed check sends the statement back to the writer;
  after two failed rounds the statement is dropped (3–5 rule permitting) and the drop is named in
  the pass evidence, never published unchecked.
- Why not B alone with a one-line "why": the founder asked for reasoning with references, and the
  10-08 failure was a claim with no source behind it — a checker is the only part that tests a
  source. UNTESTED that the story changes how the founder answers; falsifier: after two weeks the
  founder still reports statements he cannot weigh.
- The product's Mirror Agent is a design, not a shipped surface (`docs/definitions.md` "Mirror
  Agent", decisions 2026-08-19); P1431 is building the in-app one. This spec uses the label on the
  Day board only and does not create a shared mirror-agent component.
- [FOUNDER DECISION: the exact byline text.]

### D. Reflection card = the CP point card (finding 4)

The kanban app is a separate package (React 18, plain CSS; CP is React 19 + Tailwind) and imports
nothing from `src/` today. CP's `PositionButtons` (`src/app/components/shared/PositionButton.tsx`)
imports `@/lib/mixpanel`, `@/components/ui/button`, `@/hooks/*`, a lazy tutorial modal and portals,
so importing it as-is would pull product analytics and Tailwind into the founder tool. Options:

- **D1:** import CP's component directly. Rejected — the dependencies above.
- **D2 (recommended):** extract the position vocabulary (levels, labels, side mapping, icons) and
  the clear behaviour into a dependency-free module both apps use, re-skin `ReflectionTab.tsx` to
  CP's point-card look, and add a parity test that fails when the two label/level sets differ.
  Recommend D2 because of *correctness*: the shared module removes vocabulary drift and the parity
  test catches the rest, without adding Mixpanel and Tailwind as runtime dependencies (*runtime
  complexity*) of a local tool.

/architect decides the extraction boundary. Removing a position must be a
visible control as on CP, not only a menu item. The mirror story renders where CP renders a linked story.

### E. One Accept pattern (finding 5)

Keep P1432's split. Change what is inconsistent:

- Reflection gets `Accept & next`: saves the current position + story and advances. Order is
  fixed: capture the story draft as typed (not only on blur), await the write, and advance only on
  success; on failure stay on the card and say so. Covers typing then clicking Accept, and keyboard
  activation. A statement has no recommended position, so Accept is offered only once a position is
  picked (recommended: P1432 rejected approving unread choices).
  [FOUNDER DECISION: confirm Accept needs a pick, or should the writer propose a position?]
- On cards with nothing to accept (agent cards, answered cards) the pager shows `Next`; the card's
  state line says why there is no Accept. An always-present but disabled Accept is banned by the
  P955 gate. [FOUNDER DECISION: is that acceptable, or is a different shape wanted?]

### F. Key cards (finding 6)

- **Term:** "key card" = one AI key with its project, its budgets (cap and/or alert), its cap state
  and this month's spend. [FOUNDER DECISION: the term.] Definition lives in the private AI-keys
  infra doc (pp `docs/infra/`) and the ai-keys skill; the board shows it, cp docs do not define it.
- The Monitor tab lists **every budget on the billing account**, grouped: account budget, leak
  alarms, then one key card per key showing spend vs cap, cap state (`spendCap.outputState`), and
  alert budget present or missing.
- Three distinct states, never one sentence: **spent** (a number), **unused this month** (positive
  evidence of zero use), **unmeasurable** (no source answered). Proposed oracle for "unused": the
  project's Gemini API request count from Cloud Monitoring is 0 for the month. This is a project
  metric; it is a per-key answer only because each key sits in its own project (`day.md` AI KEYS
  section: "each in its own project"). The board asserts that 1:1 mapping from the registry and
  shows "unmeasurable" for any project holding more than one key. A metric query that returns no
  time series is "unmeasurable", not zero. UNVERIFIED — /architect must run it against one key known
  to be used and one known to be unused; if both return the same answer the oracle is rejected.

### G. Remove agent-VM monitoring (finding 7)

Remove `disp.3`, `disp.3h` from `day-steps.tsv`, `disp.vm` from `day-checks.tsv`, the step prose in
`~/.claude/commands/day.md` (~lines 1115–1195) and the VM references in
`tools/kanban/server/__tests__/day-render.test.ts`, in **one change**: `day-step.sh check-sync`
fails in both directions when manifest and day.md disagree. Also check
`~/.claude/commands/slava/util/agent-vm-heal.md`, which references the step. The `agent-vm-health`
/ `agent-vm-heal` skills stay. Sequencing: day.md currently has another session's staged edits — G
lands after that session commits.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Parser rejects the new `story_done` kind | MITIGATE | `parseDecisions` has a fixed `KINDS` list (`day.ts:603`); add the kind and test that an unknown kind is skipped, not fatal |
| Brief grows past what one agent reads well | MITIGATE | Retrieval by window + keyword, hard cap on pasted lines, stated in the brief |
| Mirror story cites a source that does not say what it claims | MITIGATE | Separate checker (PS-3); failure means rewrite, never edit |
| Private text leaks into a public file via fixtures or commits | MITIGATE | Invariant above; fixtures use invented text |
| "Unused" oracle is blind (returns 0 for everything) | MITIGATE | Known-used + known-unused control before trust |
| Backfilled stories flood the first prompt | ACCEPT | One-time; the founder decision above can batch-close |
| Re-skinned card drifts from CP's point card again | MITIGATE | Shared vocabulary module + parity test (D2) |

**Non-Goals**
- Do NOT merge Next and Accept, or make paging write anything.
- Do NOT build the product's Mirror Agent (P1431) or a shared mirror-agent service.
- Do NOT change budgets, caps or keys — the board reads them only.
- Do NOT delete the agent-VM skills or the VM itself.
- Do NOT edit `~/.claude/commands/day.md` while another session holds staged edits there.

## Done-When

- [ ] A story answered on the board appears in the next hand-off prompt as a numbered work item, not under "record these"
- [ ] Editing a story after it was marked done reopens it; a marker for an older version does not close the newer text (test)
- [ ] A run whose only work is an open story from an earlier run can still start a session (test)
- [ ] Accept & next on reflection with a just-typed story saves both before advancing, and stays on the card when the write fails (e2e)
- [ ] A story from an earlier run with no processed marker appears in today's prompt under "not yet handled"; after the agent marks it, it no longer appears
- [ ] The board shows each story as open / sent / done, and a story can be marked done by hand
- [ ] A decisions file containing the new kind loads on the board without dropping other lines (test)
- [ ] Given the 2026-10-08 inputs, the step 9r brief contains the 10-07 post-event conversation reference and the 10-07 dedup rule (inspect the brief, deterministic); a checker test refuses a fixture story whose cited source does not contain the claimed text
- [ ] A statement matching a this-pass finding title is refused by `--reject-repeats` (failing control shown, exit 1)
- [ ] Every reflection card shows a Mirror Agent story with at least one source reference, and the checker's verdict per story is in the pass evidence
- [ ] The reflection card uses the shared position vocabulary (parity test fails on a deliberately changed label), and its visible clear control writes a remove line (e2e), checked at 375px, 320px and desktop
- [ ] Reflection has `Accept & next`; on report and reflection, every card either has Accept or a state line saying why not
- [ ] The Monitor tab lists every budget `gcloud billing budgets list` returns at render time (count matches; 10 on 2026-10-08), each key card showing spend vs cap, cap state, and one of spent / unused / unmeasurable
- [ ] The "unused" oracle returns different answers for a known-used and a known-unused key (pasted)
- [ ] `day-step.sh check-sync` prints SYNC OK after G; a /day pass runs with no VM step or check
- [ ] All [FOUNDER DECISION] items answered in this spec

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
| 2 | /challenge-prd | [BLOCK] D1 not viable (PositionButton imports mixpanel, ui/button, hooks) | Applied — D2 recommended + parity test | Imports verified with grep |
| 3 | /challenge-prd, Codex | [WARN/BLOCK] story_done keying, version, and edits | Applied — `(run_id, target, story_hash)`, edit reopens | Same keying as reflection lines |
| 4 | Codex | [BLOCK] Old open stories cannot launch (count 0 refusal) | Applied — collect/launch count open stories | Verified `server/day.ts:359-365` |
| 5 | Codex | [BLOCK] Historical writes refused by latest-run-only route | Applied — dedicated mark-done operation | Verified `server/day.ts:308-309` |
| 6 | Codex, Gemini, /challenge-prd | [BLOCK/WARN] Accept on reflection: save ordering, no recommended position | Applied — await write, require a pick (founder confirms) | Verified `setStory` fires an unawaited write and drops a story with no position |
| 7 | Codex | [WARN] No retrieval contract | Applied — B.5 | — |
| 8 | Codex, Gemini | [WARN/BLOCK] Project metric is not per-key | Applied partly — 1:1 key/project asserted, multi-key projects read unmeasurable | Gemini's multi-key failure does not apply today: each key has its own project (day.md AI KEYS) |
| 9 | /challenge-prd | [WARN] Done-When items weak/nondeterministic | Applied — rewritten as deterministic checks | — |
| 10 | /challenge-prd | [WARN] C may be unnecessary | Kept, with UNTESTED label and falsifier | Founder asked for referenced reasoning explicitly |
| 11 | /challenge-prd | [WARN] Split F and G into own specs | [FOUNDER DECISION: one spec or three (A–E / F / G)?] | Independent code; recommend split so G ships once day.md is free |
| 12 | /challenge-prd | [NOTE] Many open founder decisions | Accepted | They are listed for one answer pass |
