---
status: week
type: task
rank: 39
workstream: infrastructure
created_date: '2026-10-14'
tags: [day-page, kanban, day-report, reflection]
disclosure: public
intent: cold-start
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1489: Day card logic: the founder's decision ranks first, prod changes ask him, one cause reads as one, counts say what happened, quotes check what the writer saw

## Problem

*Filed from an orchestrator brief that summarises a review of the 2026-10-14 run. No founder
conversation was available to the author, so there is no verbatim framing to quote (`intent:
cold-start`).*

**Situation:** The Day page and its terminal card are built from one report by
`tools/kanban/src/lib/day.ts` (ranking, counts, agent-work split) and
`tools/kanban/scripts/day-render.ts` (findings to cards, the 6-card terminal summary, the
`--phase issues` draft for the plain-language pass). Reflection statements are checked by
`tools/kanban/scripts/day-reflection-check.ts` against the grounding block that
`day-reflection-context.ts` renders. A review of the 2026-10-14 run found six logic defects. Each was
re-verified by command for this spec (evidence inline below).

**Complication:** On that run the only card that needed the founder ranked **#7**, one place below the
terminal card's 6-card limit, behind four single-event, zero-user Sentry notes. Cards whose fix is a
prod migration or a prod deploy defaulted to "Give to the agent", which Start fixing sends without
asking. One root cause showed as two unrelated cards. The status line counted checks that ran and
found real problems as "not worked". And the reflection checker dropped statements whose quotes were
copied exactly from what the writer had been shown.

**Question:** What must the card logic do so the board puts the founder's decisions first, never hands
a prod change to an agent by default, shows related faults together, and reports check outcomes and
quote checks truthfully?

### The six defects, as verified

1. **Ranking: a registry severity overrides the finding's own grade.**
   `toView` sets `important: issue.important === true || check?.severity === 'high'`
   (`day.ts:1226`). `day-cp-checks.tsv` marks `cp.sentry` (and `cp.rls`, `cp.tablegrants`) `high`, so
   every Sentry card is Important regardless of its finding. The ledger for the 2026-10-14 pass records
   all four Sentry findings at `--severity low`. Within a tier, `compareIssues` (`day.ts:1277-1282`)
   breaks ties by deadline, first seen, then title, and never by who has to act. Rebuilding that run's
   view from `~/.claude-day/reports/2026-10-14T07-11-34Z-*.json` with the shipped code gives this order:
   one database card, two Sentry, one database, two Sentry, and **then** the money card, the run's only
   non-agent card. It sits at #7, behind `CARD_ISSUES = 6` (`day-render.ts:73`).
   Also verified: `medium` maps to nothing (`day-render.ts:435` only promotes `high`).
2. **Prod migrations and deploys default to agent work.** A finding without its own options gets
   `DEFAULT_OPTIONS` (`day-render.ts:79-82`), and `withRecommendation` recommends the first non-park
   option, "Give to the agent". `isAgentWork` (`day.ts:1410`) then counts it as agent work and Start
   fixing sends it unanswered. `day-cp.md:131` says "Every other finding gets no options". The
   table-grant, RLS and ops deploy-drift rows in its tables (`day-cp.md:386-398, 1176-1186`) are not
   marked as questions, although the ops paragraph (`day-cp.md:1225`) and the cards' own evidence say
   prod migrate and deploy are ALWAYS-ASK. On 2026-10-14 the table-grant card and the ops deploy card
   both carried only "Give to the agent" / Park.
3. **One root cause, two cards.** The RLS-drift card and the table-grant card of that run are about the
   same table. The RLS card's own evidence says so. They have different fault keys, which is correct:
   decisions follow the fingerprint. But nothing links them, so they rank apart (#1 and #4 above).
4. **"23 of 31 checks worked" hides what happened.** `renderCard` prints
   `${view.counts.worked} of N checks worked` (`day-render.ts:708`), and `counts.worked` is
   `count('ok')` (`day.ts:1381`). On that run that is 23 ok, 7 problem, 1 skipped, 0 that failed to
   run. The 7 that ran and found real problems read as "not worked", the same as a check that never
   ran.
5. **`--phase issues` invents "didn't run" cards.** The plain-language pass's draft is built with
   `phase: 'end'` (`day-render.ts:951`). At `end`, a step with no ledger row becomes a `not-run` step
   problem (`stepProblem`, `day-render.ts:225`), and so does every registered check of an unreached step
   (`buildChecks`, `day-render.ts:265`). `allIssues` then synthesises a card for each. Mid-pass, those
   steps simply have not been reached yet. Using `phase: 'start'` would not fix it: `start` still gives
   unreached registered checks status `not-run` ("not run yet"), and `NEEDS_ISSUE` synthesises cards
   for them too.
6. **The quote checker checks text the writer never saw, and misses text it did see.** The grounding
   block shows each story as `S<n> [date · state · position] on "<statement>": <story>`
   (`day-reflection-context.ts:392`). For a story source, the checker matches only the story body
   (`day-reflection-check.ts:257`, `contains(norm(e.story), want)`). Across the five preserved
   reflection work folders (2026-10-09 to 2026-10-14), 11 of 22 candidate statements were dropped. The
   round-1 quote misses survive in only two of those folders, because round 2 overwrites `quotes.txt`
   (`day-reflection.md:98` and `:138` both write `2> "$W/quotes.txt"`). All five surviving misses were
   story-source "not found". All five quotes occur verbatim in the rendered line: four in the quoted
   statement, one in the bracket. The procedure also tells the orchestrator "The writer cannot read
   files" (`day-reflection.md:37`), which is false (subagents read files; `.claude/rules/skills.md`
   §Subagent I/O). It makes no provision for a long reply being truncated in the idle notice. That
   truncation (about 4000 characters) was reported by the review and is not reproducible from the repo.

## Appetite

**Blast radius:** one surface, the founder's daily board and its terminal card. It also covers the
reflection step that feeds that board. No product code, no database. A ranking mistake shows the wrong
card first. A wrong agent-work split can send a prod change to an agent unanswered, so that half carries
an invariant.
**Reversibility:** git revert. One schema-tolerant addition (an optional cause key on findings) is
ignored by older readers.
**Decision density:** four founder calls, marked below. Two of them supersede shipped rulings.

## Solution

### 1. Ranking: the finding's grade wins; within a tier, the founder's cards first

- A **written** card (one a finding produced) is Important exactly when its finding says so:
  `--severity high`, or a sidecar's explicit `important`. The check's registry severity applies
  **only to synthesised cards** (a check with no finding: did-not-run, unproven, problem-without-card).
  Those cards have no finding grade to defer to.
- `compareIssues` adds one key between tier and deadline: **cards that need the founder** (the
  recommendation is not agent work, i.e. `!isAgentWork`) before agent work. The rest of rule 7 is
  unchanged (urgent+important, urgent, important, rest; then deadline, first seen, title).
- `day-cp.md`'s Sentry rule (`:481`) currently tells the producer to record **every** new Sentry issue
  at `--severity high`. That contradicts what the producer actually wrote on 2026-10-14, and with the
  rule above it would make every Sentry note Important again. Replace it with a grade from the
  issue's own impact. Recommended default: high when at least one real user is affected or the issue
  recurs within the window; low for a single event with no users.

`[FOUNDER DECISION: supersede P1399 rule 7 ("important = set by the check's own severity, not the agent's mood") for written cards. Recommended: yes. The finding's grade is written per fault from what the check returned (users affected, money over, a hole open), which is the opposite of a mood, and the registry grade cannot tell a zero-user note from an outage. Alternative B: keep the registry as a ceiling, so a finding can lower Important but never raise it. B would strip Important from the run's money card, whose check is registry "normal".]`

`[FOUNDER DECISION: the Sentry grading threshold above (">= 1 real user, or recurring" = high). Recommended as written.]`

### 2. Prod migrations and deploys are founder decisions with real options

- **Producer side.** `day-cp.md` marks the table-grant drift, RLS drift and ops deploy-drift rows as
  questions for the founder, with their own options, a recommendation and its Fit / Risk / Evidence. The
  options are what he can actually choose. Proposed defaults: "Apply it to prod now", "Wait for <the
  in-flight fix>", Park.
- **Renderer backstop.** The check registry gains a per-check marker meaning "a fix of this needs the
  founder's yes". A finding on such a check that arrives **without** its own options is never given
  `DEFAULT_OPTIONS`. It becomes a founder card (no agent recommendation, counted under "needs you",
  never sent by Start fixing unanswered). It also gets a visible marker that its options are missing,
  so the producer gap is not silent. `cp.ops` covers more than deploy drift, so for it the marker is
  scoped to the deploy-drift fault key, not the whole check.

`[FOUNDER DECISION: does choosing "Apply it to prod now" on the Day page authorise the agent to run the prod migration or deploy, or does it hand the agent the task while the agent still stops for an in-session yes? Recommended: the agent still asks. The Day page is not a forgery-proof approval channel, and CLAUDE.md's ALWAYS-ASK list and the push/deploy rule stay untouched.]`

`[FOUNDER DECISION: the option labels above are placeholders; confirm or replace.]`

### 3. Related cards are shown as related, never merged

- Findings may carry an optional **cause key**: a fixed lowercase slug, same rules as a fault key.
  Cards sharing a cause key keep their own fingerprints, decisions and history. They are ordered
  **adjacent**, at the position of the best-ranked member, and each says which card it shares a cause
  with.
- `day-cp.md` tells the producer to set the cause key when RLS drift and table-grant drift name the same
  table (and wherever else one fault shows under two checks).
- The visible marker's exact place on the card is coordinated with P1471. This spec owns the data and
  the order. P1471 owns the card layout.

### 4. Counts say what happened

- `view.counts` distinguishes **ran clean**, **ran and found problems**, **failed to run** (not-run /
  unproven) and **skipped**. A check that ran and found a problem is never counted as failing to run.
- The terminal card's line says those outcomes. Proposed: `31 checks: 23 clean · 7 found problems ·
  1 skipped`, with "N failed to run" shown only when N > 0.

`[FOUNDER DECISION: wording, and whether the Day page's status line ("✓ N worked · ✕ M didn't work", fixed by the 2026-10-12 P1463 ruling) changes to the same three outcomes. Recommended: the terminal card changes here, and the page line takes the same words as a text-only change to StatusLine. It is sequenced with P1471, which is changing which chips that line carries. If the founder keeps the page wording, only the terminal card changes.]`

### 5. A mid-pass phase that never invents "didn't run"

- `day-render.ts` gets a third phase for the plain-language pass's draft: `--phase issues` builds with
  it instead of `end`. In it, a step with **no ledger row** is "not reached yet". It produces no step
  problem, its registered checks produce no not-run status, and no card is synthesised for either.
  Everything else is read exactly as at `end`: a step that ran and failed, and a step that ran but did
  not report its check (`unproven`).
- `end` is unchanged. The final render still turns every missing step and check into a "didn't run"
  card.
- **Coordination:** a parallel change reorders `~/.claude/commands/day.md` so step 9p runs after every
  finding step. That change owns *when* 9p runs. This spec owns the code side, so that a 9p run at any
  point emits no card for a step not yet reached.

### 6. The quote checker checks exactly what was rendered

- A story quote verifies against **the rendered grounding line**, the same string the writer was shown
  (bracket, quoted statement and story, after the same normalisation and clip). One rendering function
  serves both `day-reflection-context.ts` and the checker, so the two cannot drift. Decision, finding
  and conversation sources are audited the same way: each verifies against the rendered text, or
  against a superset of it that the writer could have seen.
- Matching stays **exact word matching** with the existing 3-word minimum. An invented quote, or a quote
  from text that was clipped away before the writer saw it, still misses.
- `day-reflection.md`: delete "The writer cannot read files". The writer writes each round's reply to
  the work folder by design (`$W/reply-1.json`, `$W/reply-2.json`) and returns the path. The procedure
  reads the file, so a reply longer than an idle notice carries is never lost. Each round's quote misses
  go to their own file (`quotes-1.txt`, `quotes-2.txt`), never overwritten, so a run's drops can be
  attributed afterwards.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A producer under-grades a real outage, and it loses Important | MITIGATE | Sentry gets an impact rule (§1); synthesised cards keep registry severity; urgent (did not run) is untouched |
| A finding on a needs-yes check arrives without options and reads as a dead card | MITIGATE | Backstop card is a founder card with a visible "options missing" marker (§2) |
| Matching against the bracket lets a meta phrase verify ("agree", a date) | ACCEPT | Existing 3-word minimum; a 3-word span of the bracket proves the writer saw that line, which is what the check is for |
| Cause keys are set inconsistently, so related cards stay apart | ACCEPT | Same failure as today, no worse; fixable in the runbook |
| P1471 and this spec both touch `DailyReport.tsx` | MITIGATE | This spec touches it only for the status-line words (if the founder takes it) and the group marker. Build after P1471 lands, or rebase onto it |
| The parallel day.md reorder lands first or second | ACCEPT | §5 is correct whatever order 9p runs in |

**Non-Goals**
- Do NOT change the Day page's layout, card anatomy, footer or pager. That is P1471.
- Do NOT merge fault keys or change fingerprint rules. Decisions must keep following a fault.
- Do NOT change `CARD_ISSUES` (6). The fix is the order, not a longer list.
- Do NOT reorder `~/.claude/commands/day.md` steps. A parallel change owns that.
- Do NOT add semantic or fuzzy quote matching. It was rejected in the 2026-10-09 P1445 ruling.
- Do NOT change the Start fixing launch contract (P1399 rule 9) beyond which cards count as agent work.

## Invariants

- **No card whose fix is a prod migration or a prod deploy is sent by Start fixing without the
  founder having answered it.** It holds whether the producer wrote options or not.
- "Did not run" never reads as clean at `end`. The mid-pass phase is used only for the plain-language
  draft and is never written as the final report.
- Only the founder parks. Park is never the recommendation (unchanged).
- A quote verifies only if its exact words appear in text the writer was shown. An invented quote
  misses. (P1445, 2026-10-09.)
- Fixtures and tests in this public repo use invented text. Real run data is used only for local
  evidence and is never committed or quoted.

## Done-When

- [ ] Rebuilding the view from the unchanged 2026-10-14 report file in `~/.claude-day/reports/`
      places the run's money decision card in the terminal card's top 6, and none of the four Sentry
      cards carries "Important". Evidence: the printed order. Tests use an invented fixture with the
      same shape: one founder card, four low-severity notes on a registry-high check, two high cards.
- [ ] Within one tier, a founder card ranks above an agent card that would otherwise win on first-seen
      or title (unit test with that tie).
- [ ] A synthesised card for a registry-high check that did not report still ranks Important
      (regression control for §1).
- [ ] A finding on the table-grant check with no options renders with no "Give to the agent"
      recommendation, is not agent work, counts under "needs you", and is not in the Start fixing
      payload when unanswered (unit test). `day-cp.md`'s table-grant, RLS and deploy-drift rows carry
      options, verified by reading the diff.
- [ ] Two findings sharing a cause key render adjacent in the view and the terminal card. Each keeps
      its own fingerprint, and a decision on one leaves the other unanswered (unit test).
- [ ] The terminal card for the 2026-10-14 report says 23 clean, 7 found problems, 1 skipped, and no
      "failed to run". A fixture with one not-run check shows "1 failed to run", which a problem check
      never increments.
- [ ] `--phase issues` over a ledger whose later steps have no rows emits **zero** cards for those
      steps or their checks. The same ledger at `--phase end` still emits them (control). A step that ran
      without reporting its check still yields its unproven card in the mid pass.
- [ ] Re-running `--quotes` on the 2026-10-14 reflection candidate with that run's sources: the three
      story quotes that missed now verify. A copy with one word changed in each of those quotes misses
      all three (control). The same pair is in the invented-fixture test suite, for statement, bracket
      and story positions, plus a quote from clipped-away text, which must miss.
- [ ] `day-reflection.md` no longer says the writer cannot read files. It names the per-round reply
      files and the per-round quote-miss files. `[post-run]` re-check on the next real `/day`: both
      rounds' files exist in the work folder.
- [ ] Existing day tests pass (`tools/kanban` test suite for `day`, `day-render`,
      `day-reflection-*`), and kanban typecheck is clean.
- [ ] The four founder decisions above are recorded in this spec.

## Alternatives Considered

- **Raise the 6-card limit.** Rejected: the founder's card would still sort below notes. The order is
  the defect.
- **Registry severity as a ceiling (Alternative B in §1).** Keeps P1399 rule 7 to the letter. It would
  demote the run's money card, whose check is registry "normal". Left to the founder.
- **Infer related cards from evidence text** (same table name). Rejected: prose matching. A fixed cause
  key is the same discipline as fault keys.
- **Build the 9p draft with `phase: 'start'`.** Rejected, verified: `start` still marks unreached
  registered checks `not-run` and synthesises cards for them.
- **Match story quotes against the stored story plus statement** (not the rendered line). Rejected: it
  would also verify text the clip removed before the writer saw it. Only the rendered line is what
  was shown.

## Rollback Strategy

Each section is an independent commit in `tools/kanban` and the two runbooks (`day-cp.md`,
`day-reflection.md`). Revert per section. The optional cause key and the registry marker are ignored
by the reverted readers (tolerant reading, `day.ts` rule 3).

## Related

- RELATED: [P1471](p1471_day_page_footer_and_card_declutter.md): Day page layout, footer, status-line
  chips on phones. This spec does not overlap its layout. §3's marker placement and §4's page wording
  are coordinated with it.
- [P1463](done/2026-06-10/p1463_day_page_attention_pass.md): the status-line ruling (2026-10-12) that
  §4's page wording would supersede.
- [P1468](done/2026-06-10/p1468_day_page_one_list_and_goals.md): current page structure.
- [P1399](done/2026-06-10/p1399_day_report_by_who_acts_and_day_page_on_the_personal_board.md): rule 7
  (ordering) and rule 9 (Start fixing contract).
- [P1445](done/2026-06-10/p1445_day_grounded_reflection_agent_on_slava_cp_cards.md): grounded
  reflection and the exact-quote check.
- A parallel change to `~/.claude/commands/day.md` step ordering (another agent, same day).

## Next Steps

- `/challenge-prd features/p1489_day_card_logic_ranking_founder_decisions_status_counts_quote_check.md`,
  then the founder decisions, then `/dev`.
