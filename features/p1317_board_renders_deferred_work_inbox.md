---
status: week
type: task
rank: 101
workstream: infrastructure
created_date: '2026-09-15'
tags: [kanban, process, task-inbox, privacy]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1317: Inbox entries have no card and no verdict path, so the queue only grows

## Problem

**Situation:** Deferred work goes to the task inbox via `/note`: `docs/process-learnings.md`
(public, committed) and `.private/docs/process-learnings.md` (gitignored, for infra, credentials
and absolute paths). `/weekly` step 2.5 and `/monthly` read both. The kanban (`tools/kanban`) scans
only `features/`, `content/articles/` and `.private/crm/opportunities/`, so no inbox entry ever
appears as a card. A third store, `.claude/process-learnings.md` (1 entry, 2026-02-28), is read by
nothing.

**Complication:** the queue grows and almost never shrinks, and the one exit it has defaults to doing
nothing.

| Measure | Value | Source |
|---|---|---|
| Open at P1081 ship, 2026-08-14 | 9 public / 2 private | `docs/process-learnings.md`, "Did the close path actually shrink the queue" entry |
| Open on 2026-09-15 | 62 public / 20 private | `grep -c '^\*\*Status:\*\* proposed'` per store |
| Public store churn since 2026-08-14 | 63 commits, +1384 / −77 lines | `git log --since=2026-08-14 --numstat -- docs/process-learnings.md` |
| Last `/weekly` run | 2026-09-08 | `~/.claude_weekly_last_run` |
| `## ` sections with no anchored `Status` line | 15 public / 1 private | `awk` over `## ` sections outside code fences |
| Status values in use | `proposed` ×82, `filed` ×1, empty ×2 | `grep -ho '^\*\*Status:\*\* [a-z-]*'` over both stores |

`/weekly` step 2.5 ran within the window and closed close to nothing, because its batched prompt
defaults to *keep*. **Visibility is necessary but not sufficient.** The board is where priority is
decided (WIP limits, `/slava:maintain:prioritize`), and inbox entries never reach it. But a card that
nobody can issue a verdict on would just move the pile to a new screen. Meanwhile 16 sections are
invisible to every reader today, so the true open count is unknown. P1081's accepted risk ("only if
the count rises") has fired.

**Question:** How does every open inbox entry, public and private, automatically get a card with an
ID and a link, **and** a verdict path that can actually close it, without copying entries and
without publishing private content?

> Founder framing, verbatim: "generally speakign our stystem needs to be improved .. so those
> private things always get a card ? so we need to reflect the system not just fix once? otherwise
> we are not tracking them anywhere..?"

## Appetite

Blast radius: medium. It touches the kanban server and UI, which also serve pp's board
(pp's launcher, `~/Projects/private/<repo>/scripts/kanban.sh`, runs this codebase via env), plus
`/slava:maintain:prioritize`, which is a **global** skill
(`~/.claude/commands/slava/maintain/prioritize/SKILL.md`, outside this repo) also run against pp,
so its inbox input must be gated to repos that have inbox stores. Reversibility: high, since no
store format changes and the board change is a git revert. Decision density: two founder calls
(below), plus a disposition for each of the 16 status-less sections.

## Invariants

- **Inbox files stay the single source of truth.** The board reads them; nothing copies entries into
  `features/` or anywhere else. A card exists exactly while its entry is in the file. No sync step.
- **Private content never leaves the local user.** Nothing derived from the private store (titles,
  bodies, IDs, counts) is committed, written to a log, persisted to browser storage, or served on a
  non-loopback interface. Parse errors log path and line number only, never file content.
- **An absent store is never rendered as zero**, carrying forward decisions.md 2026-08-14 [process]
  (P1081): *"a reader wired to a store that is not there is indistinguishable from a healthy empty
  queue."* This applies only when the inbox feature is enabled.
- **No section is silently dropped.** The store format has no "closed" state: closing means deleting
  the entry (`docs/process-learnings.md:27`, graduation rule). So a `## ` section is either **open**
  (`Status` exactly `proposed`) or **unparseable** (missing, empty, or any other value, including
  typos like `propose` and the one `filed`). Unparseable sections render as visible cards, never
  hidden. Malformed entries are fixed at the source, not tolerated by a looser board regex.

## Solution

1. **Enabled for cp on every documented launch path, off for pp.** Both documented entry points,
   `scripts/kanban.sh` and `npm run kanban` (`package.json:24`, which bypasses the launcher), must
   enable cp's inbox stores. pp, which embeds the codebase with its own `KANBAN_PROJECT_ROOT`, must
   resolve to "feature off": no column, no absent-state, no cards, and never a path into cp's
   private file. Where this config lives is for `/architect`.
2. **Canonical store location, whatever the launch directory.** Today `DEFAULT_PROJECT_ROOT` derives
   from the working directory (`api.ts:26`) and `kanban w1` `cd`s into the worktree first
   (`scripts/kanban.sh:94`). Inbox stores must resolve to the main checkout even on a worktree launch.
   Worktree copies of the public store are stale and must never be read.
3. **Parse at request time.** Split each store at column-1 `## ` headings outside code fences and
   classify each section per the invariant (open / unparseable), with `due:` (bolded only) and the
   heading title.
4. **Cards and a dedicated open endpoint.** Each card carries a source badge (public/private), a
   local ID (not a P-number, outside `next-p-number.sh`'s sequence), `due`, and an open action. The
   action calls a **new inbox endpoint that accepts only an entry ID**. The server resolves the
   canonical store and the heading line and opens the editor at that line (the existing
   `code -r <path>` at `api.ts:955` cannot target a line). The generic path-based `/api/open` is
   left unchanged and gains no inbox paths.
5. **Coverage oracle independent of the parser.** Synthetic fixtures with a hand-written expected
   count include: exact `proposed`, a `propose` typo, an empty Status, an unbolded Status, a missing
   Status, an unbolded `due:`, a `## ` inside a code fence, and a `Status` line inside a code fence.
   The test asserts rendered open and unparseable counts against the hand label, not against a regex
   the parser shares (epistemic gates 7, 7b, 7c).
6. **Census and disposition before the board ships.** For each of the 16 status-less sections
   (public: `docs/process-learnings.md` lines 148, 170, 671, 688, 729, 834, 910, 934, 1097, 1114,
   1219, 1262, 1288, 1314, 1347; private: 1), record one disposition in this spec: *add Status* (it is
   an open entry), *merge* into the entry it belongs to (a sub-heading, not an entry), or *graduate
   and delete*. Also fold `.claude/process-learnings.md`'s one entry into the public store and delete
   the file (first check whether `/slava:maintain:cleanup` already covers registry-to-disk drift).
   Separate commit, so it survives a revert of the board change. Private dispositions are recorded in
   `.private/docs/`, never here.
7. **A verdict path that executes, inside `/prioritize`'s own contract.** `/prioritize` "never
   auto-invokes another skill" (`prioritize/SKILL.md:28`), and that rule stays. For inbox entries
   (only in repos whose stores exist) it applies verdicts it can execute itself: **resolve** (write
   the graduation entry to `docs/decisions.md`, or `.private/docs/` for private entries, then delete
   the inbox entry), **drop** (stated reason, then delete), **keep**. **Promote** is only a
   recommendation: the entry stays open, annotated with the recommendation, until a separately run
   `/create-spec` files the spec and the entry is then deleted. The verdict names must be reconciled
   with the skill's existing taxonomy in one table, not bolted on as a second vocabulary.
8. **Loopback bind.** `app.listen(PORT)` at `api.ts:1096` passes no host. Bind to loopback before any
   private data is served (this also closes the same exposure for the existing opportunities board).

[FOUNDER DECISION 1: where do inbox cards live? (a) their own "Inbox" column, so WIP limits on
today/week/in-progress keep meaning "committed specs" and leaving Inbox is a `/prioritize` verdict;
(b) placed into week/month by `due:`. Under (b), `week` would receive about 56 cards (35 public + 14
private due-week, plus 7 open public entries with no `due:`, which `/weekly` treats as week) against
a limit of 10, before any of the 16 status-less sections are counted. Recommendation: (a).]

[FOUNDER DECISION 2: may `/slava:maintain:prioritize` resolve and drop inbox entries (Solution 7),
or does closing stay exclusive to `/weekly` step 2.5? Recommendation: allow it. Step 2.5 has been the
only exit since 2026-08-14 and defaults to keep; a second exit that must reach a verdict per entry is
the part that can shrink the queue.]

Stable-ID scheme, config location, the parsing module and the UI treatment belong to `/architect`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Private titles leak through logs (`/tmp/kanban.log` is world-readable, tee'd at `tools/kanban/scripts/run-once.sh:28`; `api.ts:257` logs full error objects) | MITIGATE | Invariant: path + line only in logs; a test asserts no fixture title reaches captured log output |
| Private titles leak through browser storage, evidence screenshots, or a network-reachable API | MITIGATE | No card state persisted to `localStorage`; evidence screenshots use synthetic fixtures; loopback bind (Solution 8) with `lsof` evidence |
| Parser drops or misclassifies entries in a hand-written file | MITIGATE | Two-state classification + hand-labelled oracle (Solution 5) |
| Feature silently off on a documented launch path, board looks healthy | MITIGATE | Solution 1 + Done-When covers both entry points |
| Visibility without closure just relocates the pile | MITIGATE | Solution 7 + the 30-day Done-When target with a pre-committed consequence |
| Census rewrites 16 hand-written sections under time pressure | MITIGATE | One recorded disposition per section before implementation, separate commit |
| 82+ cards swamp the board | MITIGATE | Founder decision 1 + first `/prioritize` pass |
| IDs change when a heading is edited | ACCEPT | IDs are local and nothing stores them; revisit only if a skill starts referencing them |

**Non-Goals**
- Do NOT convert inbox entries into P-number specs, except through a separately run `/create-spec` after a promote recommendation.
- Do NOT support editing, dragging or closing entries from the board UI.
- Do NOT change the inbox file format, `/note`'s routing, or the `/weekly` and `/monthly` readers.
- Do NOT change pp's board behaviour, or `/prioritize`'s behaviour against pp.
- Do NOT widen the generic `/api/open` allowlist.

## Done-When

- [ ] Launched via `scripts/kanban.sh` from main, via `kanban w1`, and via `npm run kanban`, the board
      shows the same inbox cards in all three, read from the main checkout (evidence per launch)
- [ ] Open-card count per store equals `grep -c '^\*\*Status:\*\* proposed' <store>`, and the
      unparseable count equals the census count left after Solution 6 (evidence pasted)
- [ ] A newly `/note`d entry appears on the next board load with no other step; a deleted entry disappears
- [ ] Clicking a card opens its store in the editor at that entry's heading line; the inbox endpoint
      rejects an unknown ID, and `/api/open` still returns 403 for an inbox store path
- [ ] The oracle test fails when a deliberately broken parser drops or reclassifies a hand-labelled
      fixture, and passes on the correct parser (both exit codes pasted)
- [ ] With the private store renamed away, the board shows an "absent" state for it, not zero (screenshot, synthetic data)
- [ ] A forced parse error on a fixture logs path and line only; the fixture title does not appear in the captured log
- [ ] `lsof -iTCP -sTCP:LISTEN` shows the API bound to loopback only
- [ ] pp's board, launched with its unchanged launcher, shows no inbox column or state (screenshot); `/prioritize` run on pp shows no inbox input
- [ ] Every one of the 16 status-less sections has a recorded disposition and is conformed; `.claude/process-learnings.md` is folded and removed with no remaining reference
- [ ] Both founder decisions recorded in this spec
- [ ] First `/slava:maintain:prioritize` pass over inbox cards run; resolve / drop / keep / promote counts recorded
- [ ] Open total (public + private) recorded on the day of that pass. `[post-ship]` Re-count 30 days
      later: if the total has not fallen below it, intake throttling (P1081's standing fallback) is
      filed as a spec that week, not re-debated

## Alternatives Considered

- **Generate P-number specs from inbox entries.** Rejected: copies drift, and private entries would
  publish unfixed security details into the public repo, which the Private vs Public rule forbids.
- **One-time import of today's entries.** Rejected: stale within a week. The founder asked for the
  system, not a one-off fix.
- **Board visibility only (this spec's first draft).** Rejected after review: `/weekly` step 2.5
  already surfaces every due-week entry weekly and the queue still grew, so a card with no executing
  verdict path would not change the outcome.
- **Add inbox paths to the generic `/api/open` allowlist.** Rejected after review: a client-supplied
  path cannot target a line, and widening a prefix allowlist admits worktree copies and siblings.
- **Let `/prioritize` invoke `/create-spec` on promote.** Rejected: breaks the skill's
  never-auto-invoke rule. Promote stays a recommendation.
- **Throttle intake now.** Deferred, not rejected: it is P1081's standing fallback, and the 30-day
  Done-When pre-commits to it if closing does not shrink the queue.
- **Move all deferred work into `features/` and retire the inbox.** Rejected: P1081 deliberately kept
  a low-ceremony store for items that do not warrant a spec (decisions.md 2026-08-14 [process]), and
  decisions.md `:10843` files a follow-up "in process-learnings.md rather than as a kanban card" on
  purpose.

## Rollback Strategy

Revert the kanban and `/prioritize` commits. No store data is migrated. The census/conformance commit
(Solution 6) is separate and stays.

## Reviews

2026-09-15, three independent passes on drafts of this spec (3 of 3 reports received). Findings were
re-verified by command before being folded in; refuted ones are listed so they are not re-raised.
- **Gemini 3.8 Flash** (REJECT, 5 findings): pp fallback contradiction and line-targeting on open
  were confirmed. "w0 has no `.private/`" was refuted (w0 is the main checkout). The fenced-heading
  split was refuted for current data (0 fenced headings or Status lines) but kept as a fixture. The
  open founder decision is intentional.
- **Fable** (3 BLOCK / 5 WARN / 3 NOTE): confirmed the visibility-only framing fails on churn
  evidence, the tautological parity test, the world-readable log, and missed entries. Minor counts
  differed (7 open without `due:`, not 8; 35 due-week, not 36).
- **Codex gpt-5.6-sol** (FAIL, 6 findings, all confirmed): no closed state exists, worktree launch
  reads the wrong root, `npm run kanban` bypasses the launcher, `/prioritize` cannot invoke
  `/create-spec`, conflicting open contracts, and 16 status-less sections rather than 2.

## Related

- P1081 (`features/done/2026-06-10/p1081_deferred_notes_queue.md`): built the inbox close path; its accepted intake risk is what fired
- P962 (`features/done/2026-06-10/p962_kanban_pipeline_crm_board.md`): precedent for the board rendering gitignored `.private/` data locally
- decisions.md 2026-08-28 [process]: "cp's WIP limits shipped, rendered, and were never switched on — `week` reached 58 items"
