---
status: all-done
type: task
rank: 101
workstream: infrastructure
created_date: '2026-09-15'
tags: [kanban, process, task-inbox, privacy]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-09-15
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
store format changes and the board change is a git revert. Decision density: founder calls made
2026-09-15 (below); remaining is a disposition for each of the 16 status-less sections.

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
4. **Cards and a dedicated open endpoint.** Each card carries a source badge (public/private), its
   note number (below), `due`, and an open action. The
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
   `.private/docs/`, never here. Apply it **in a worktree**: the public store is edited by concurrent
   sessions, and `commit-to-main` stages a file whole.

   **Census, 2026-09-15** (line numbers as of commit `1b39fb31b`; each section was read):

   | Line | Section (short) | Disposition | Why |
   |---|---|---|---|
   | 148 | `/ship` direct-to-main stamp | add Status | open work, `due` present in heading |
   | 170 | Codex-vs-Opus bake-off | add Status, bold its `due` | open; `due: month` is unbolded |
   | 671 | P1067 spec not serial-safe | add Status | open test-hygiene fix |
   | 688 | `/ship` strands worktree from ~15 sites | add Status | open follow-ups |
   | 729 | `/goalify-update` improver | add Status | open, trigger-dated |
   | 834 | Harvested comments may carry private identifiers | add Status | open, unverified risk |
   | 910 | 320px overflow on story detail | add Status | open UI defect |
   | 934 | False `>>` marker claim in prepare | add Status | open skill fix |
   | 1097 | Benchmark `/create-spec` vs baseline | add Status | open, still needs a P-number |
   | 1114 | Story quote block renders twice | **graduate and delete** | its own text says "close this entry when P1212 §1 ships"; P1212 is `all-done` in `features/done/2026-06-10/`. At apply time, confirm §1's artifact exists (one quote-block render path) before deleting, per the P1250 lesson that a closed spec is not proof of delivery |
   | 1144 | Frontend ships ahead of its migration | **delete** (not status-less; `Status: filed as p1211`) | already promoted to open P1211; under decision 4 the note must not coexist with its spec. Confirm P1211 carries the note's content first |
   | 1219 | P1250 audit of 17 auto-closed specs | **move into P1250's done spec, then delete** | a record, not work: its two open outcomes (P572, P828) are tracked as `backlog` specs. Copy the table and the **corrected** totals (7 delivered / 10 not) verbatim into P1250; P1250:153 still states the superseded count. Four artifacts cite this section and must be repointed in the same commit: P1250:153, P843:23, P558:23, and decisions.md 2026-09-07 [process], "The ship that removed co-located auto-close was itself auto-closed against". Re-run the reference grep at apply time before deleting |
   | 1262 | Does anyone read session transcripts? | add Status | open question gating P1252 |
   | 1288 | `ship.md` still tells agent to run a self-running gate | add Status | open doc fix |
   | 1314 | Skill-eval merge check inert | add Status | open, blocked on early access |
   | 1347 | Make closure backstop a required check | add Status | open, waits for a real green |
   | private ×1 | — | add Status | open work; title kept out of this public file |

   **Applied 2026-09-15 by `/dev`** (census commit on `feature/p1317-inbox-cards`). Three things the
   table above did not anticipate, each found by re-running a check at apply time:
   - **The P1250 audit had six citing artifacts, not four.** `.claude/commands/slava/build/ship.md:118`
     and a comment at `scripts/git-ops.sh:3620` also cited it, and both still quoted the superseded
     "11 not delivered". All six repointed; `ship.md` lands on `main` with the skill commit.
   - **The public store's own entry about the third store** ("A second, undocumented inbox exists")
     was resolved by the fold, so it graduated too. Decisions entry: `docs/decisions.md` 2026-09-15
     [process] "Task-inbox census".
   - **The private store also held two sections closed in place** (`Status: CLOSED …`), which the
     census counted as having a status. The parser renders them unparseable, so they were graduated.
     Dispositions and verbatim text: `.private/docs/p1317-census.md`.
   Result: public 75 open / 0 unparseable, private 22 open / 0 unparseable, each equal to its
   `grep -c '^\*\*Status:\*\* proposed'`; IDs backfilled in file order, numbers 1–75 public and 1–22 private (no live ID token is written
   into this spec, per Done-When).
7. **A verdict path that executes, inside `/prioritize`'s own contract.** `/prioritize` "never
   auto-invokes another skill" (`prioritize/SKILL.md:28`), and that rule stays. For inbox entries
   (only in repos whose stores exist) it applies verdicts it can execute itself: **resolve** (write
   the graduation entry to `docs/decisions.md`, or `.private/docs/` for private entries, then delete
   the inbox entry), **drop** (stated reason, then delete), **keep**. **Promote** is only a
   recommendation from `/prioritize`: the entry stays open, annotated with the recommendation. The
   move itself is executed by `/create-spec <note-ID>`, the **sole** promotion executor: (1) create
   the spec, (2) delete exactly that source entry, (3) verify both (spec file exists, ID gone from the
   store), (4) if step 2 or 3 fails, report `PROMOTION INCOMPLETE: <spec> created, <note-ID> still
   open` and stop. Spec first, so a failure never loses the only record; the incomplete state is
   visible, not silent. This is an owned protocol, not a filesystem-atomic operation. A promoted
   private note's `INBOX-P` ID and counter value never appear in the public spec, its commit message,
   or any tombstone. The verdict names must be reconciled
   with the skill's existing taxonomy in one table, not bolted on as a second vocabulary.
8. **Loopback bind.** `app.listen(PORT)` at `api.ts:1096` passes no host. Bind to loopback before any
   private data is served (this also closes the same exposure for the existing opportunities board).

9. **Stable note numbers, stored in the note.** Every entry carries a bold `ID` line: `INBOX-<n>` in
   the public store, `INBOX-P<n>` in the private store (e.g. `INBOX-<n>`, `INBOX-P<n>`). A bare `N<n>` was
   rejected: `N1`–`N5` are already finding labels in P1067, P1090, P1091 and P1092. `NOTE-<n>` was
   rejected too: `NOTE-1` and `NOTE-2` are review labels in P937 and P967. `INBOX-` returned 0 files
   on 2026-09-15 across `features/ docs/ .claude/ tools/kanban/ scripts/ src/ e2e/ supabase/` and the
   global skill directories, with `NOTE-` as the known-used control (3 files). The number is
   written into the entry, never derived from its position, so deleting one note renumbers nothing.
   Each store keeps its own counter in a bold `Next ID` header line. Separate sequences per store, so
   public numbering reveals nothing about how many private notes exist.
   - **Allocation (`/note`):** take a lock on the store, re-read it, validate
     `Next ID > max(existing IDs)` (a hand-written ID may have overtaken the counter; if so, raise the
     counter first), append the entry with that ID, advance the counter, verify the ID occurs exactly
     once, release the lock. This is what makes "never reused" and "unique" true; if a lock cannot be
     implemented, those two guarantees and their Done-When boxes are removed from this spec rather than
     accepted as violated.
   - **Backfill (Solution 6):** assigns IDs to every existing entry in file order and sets `Next ID`
     to one above the highest assigned.
   - **References** to a note are matched against the full `ID` token (`INBOX-<n>`), never a bare
     number or substring.
   - **Readers:** `/weekly` step 2.5 and `/monthly` show each entry's ID and accept it in commands
     (`resolve INBOX-<n>`); list ordinals remain for display only, so there is one number system.
   - A missing or duplicate ID renders the section as unparseable.

**Founder decisions (2026-09-15):**
1. **Inbox cards get their own "Inbox" column.** WIP limits on today/week/in-progress keep meaning
   committed specs; leaving Inbox is a `/prioritize` verdict. (Rejected: placing by `due:`, which
   would put about 56 cards into `week` against a limit of 10.)
2. **`/slava:maintain:prioritize` may resolve and drop inbox entries** (Solution 7). `/weekly` step
   2.5 remains a second exit.
3. **`/architect` is skipped.** The design was settled by three reviews (see Reviews). Condition:
   before any code, `/dev` records in this spec where the enable setting lives so that both launch
   paths turn it on and pp resolves to off.
4. **A note and a spec never both track the same item.** Promotion is a move, not a link, executed
   by `/create-spec <note-ID>` under the protocol in Solution 7 (spec first, then delete, with a
   visible `PROMOTION INCOMPLETE` state on failure). No spec points to an open note for status, so
   closing a spec never has to reach back into the notes file. (Rejected: a public spec per note
   holding the status, which gives every item two records to keep in sync and reveals the existence,
   timing and count of private notes.)
5. **Notes are numbered** (Solution 9). The founder asked for `n01`-style numbers; the prefix became
   `INBOX-<n>` / `INBOX-P<n>` after review found bare `N<n>` and then `NOTE-<n>` already in use.

The parsing module's location and the UI treatment are left to `/dev`.

**Recorded by `/dev` before code (decision 3's condition), 2026-09-15:**
- **Enable setting lives in the server, keyed on `KANBAN_PROJECT_ROOT`** (`tools/kanban/server/inbox.ts`,
  `inboxEnabled()`). Unset → inbox on. Neither cp entry point sets it: `scripts/kanban.sh` runs
  `npm run kanban`, and `npm run kanban` runs `tools/kanban` directly. pp's unchanged launcher exports
  `KANBAN_PROJECT_ROOT`, so pp resolves to off with no pp-side edit. `KANBAN_INBOX=on|off` overrides
  both. Rejected: a new env var in `scripts/kanban.sh`, which `npm run kanban` would bypass.
- **Canonical root** is the git common dir's parent (`git rev-parse --git-common-dir`), so a `kanban w1`
  launch reads the main checkout. If that cannot be proven, both stores render as `error`, never as a
  read of the launch directory.
- **Parser** is `tools/kanban/lib/inbox.ts`, shared by the board and `scripts/inbox.sh` (the CLI that
  `/note`, `/weekly`, `/monthly`, `/prioritize` and `/create-spec` call), so the board and the skills
  cannot disagree about what an entry is.
- **Unparseable cards** open by a `<store>:L<line>` key, since a section with no valid ID has no ID. The
  open endpoint accepts that key or an entry ID, never a path.

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
| Hand-edited ID lines collide or go missing | MITIGATE | `/note` assigns IDs from the store's counter; a missing or duplicate ID renders as unparseable (Solution 9) |
| `/note` and the counter race when two sessions file at once | MITIGATE | Lock + re-read + validate + verify-once allocation (Solution 9); an ID that still duplicates renders as unparseable |
| Promotion half-completes (spec created, note not deleted) | MITIGATE | Spec-first order and a reported `PROMOTION INCOMPLETE` state (Solution 7) |

**Non-Goals**
- Do NOT convert inbox entries into P-number specs, except through a separately run `/create-spec` after a promote recommendation.
- Do NOT support editing, dragging or closing entries from the board UI.
- Do NOT change the inbox file format beyond the additive `ID` and `Next ID` lines, or `/note`'s
  public/private routing. `/weekly` and `/monthly` change only to show and accept note IDs.
- Do NOT create a spec that points to an open note; promotion moves the item (decision 4).
- Do NOT change pp's board behaviour, or `/prioritize`'s behaviour against pp.
- Do NOT widen the generic `/api/open` allowlist.

## Done-When

- [x] Launched via `scripts/kanban.sh` from main, via `kanban w1`, and via `npm run kanban`, the board
      shows the same inbox cards in all three, read from the main checkout (evidence per launch)
      *(2026-09-15, pre-ship: `kanban w1` — which runs `npm run kanban` inside w1 — served the MAIN
      checkout's stores, proven by the mismatch: main's public store had 0 ID lines and rendered
      `open 0 / unparseable 78 (missing-id…)` while w1's own copy carries 75 IDs; private `22/0`. The
      main-launch path resolves the same `DEFAULT_PROJECT_ROOT` → git common dir. `[post-ship]` re-run
      `kanban main` and paste per-store counts.)*
- [x] Open-card count per store equals `grep -c '^\*\*Status:\*\* proposed' <store>`, and the
      unparseable count equals the census count left after Solution 6 (evidence pasted)
      *(`inbox.sh count`: public `open 75 unparseable 0` vs grep 75; private `open 22 unparseable 0` vs
      grep 22; census left 0 unparseable. The board reads the same parser; `[post-ship]` paste
      `/api/inbox` counts from main.)*
- [x] A newly `/note`d entry appears on the next board load with no other step; a deleted entry disappears
      *(`server/__tests__/inbox.test.ts` "a newly appended entry appears on the next load, a deleted one
      disappears — no other step": parse at request time, no cache.)*
- [x] Clicking a card opens its store in the editor at that entry's heading line; the inbox endpoint
      rejects an unknown ID, and `/api/open` still returns 403 for an inbox store path
      *(Tests: `INBOX-3` → `{kind: public, line: 13}`, line keys resolve, unknown ID 404, a path 400,
      duplicate ID 409, both real store paths 403 on `/api/open`. Live board: `INBOX-9999` → 404,
      store path on `/api/open` → 403. Editor spawn uses `code -r -g <path>:<line>`;
      `[post-ship]` one real click-through.)*
- [x] The oracle test fails when a deliberately broken parser drops or reclassifies a hand-labelled
      fixture, and passes on the correct parser (both exit codes pasted)
      *(Mutant 1, fence handling removed: 4 of 9 failed, exit 1. Mutant 2, `propose` accepted as open:
      3 of 9 failed, exit 1. Restored: 9/9, exit 0. Not committed as a test — recorded here.)*
- [x] With the private store renamed away, the board shows an "absent" state for it, not zero (screenshot, synthetic data)
      *(Fixture board with no private store: notice "Private store: absent (not created yet)", DOM
      probe confirmed; screenshots at 1200 / 375 / 320 px on synthetic data only. Endpoint test renames
      the private store and asserts `state: absent`, no `open` field.)*
- [x] A forced parse error on a fixture logs path and line only; the fixture title does not appear in the captured log
      *(Test "logs path and line only…": captured log contains `<fixture>/docs/process-learnings.md:21`
      and neither the fixture title nor its distinctive Status value.)*
- [x] `lsof -iTCP -sTCP:LISTEN` shows the API bound to loopback only
      *(Before: `node *:9051`. After: `node 127.0.0.1:9051`; `[::1]:9051` refused (curl exit 7); LAN
      address `:9051` timed out (curl exit 28). A non-loopback `Host` header is also refused with 403
      (DNS rebinding, review fix).)*
- [x] pp's board, launched with its unchanged launcher, shows no inbox column or state (screenshot); `/prioritize` run on pp shows no inbox input
      *(This branch's API under pp's exact launcher env (`KANBAN_PROJECT_ROOT`, `tasks`, worktrees
      disabled): `inboxEnabled: false`, `/api/inbox` → `{"enabled":false}`, open → 404, no store read
      logged; an empty `KANBAN_PROJECT_ROOT` also stays off. `/prioritize` 2b is gated on
      `<repo>/scripts/inbox.sh`, which pp does not have. `[post-ship]` screenshot pp's real board.)*
- [x] Every one of the 16 status-less sections has a recorded disposition and is conformed; `.claude/process-learnings.md` is folded and removed with no remaining reference
      *(Census commit `f3c7bb155`; `inbox.sh check` exit 0 on both stores; `grep -rn '\.claude/process-learnings'`
      returns only this spec and a dated decisions.md history line.)*
- [x] Every open entry carries a unique `INBOX-<n>` / `INBOX-P<n>` ID, each store's `Next ID` is above its highest ID, and the card shows the ID
      *(Public 75 ID lines, 75 unique, Next ID 76 over max 75; private 22/22, Next ID 23 over max 22.
      Cards render the ID badge — fixture screenshot.)*
- [x] Filing two notes with `/note` concurrently gives two distinct consecutive IDs; a hand-written ID above the counter is detected and the counter raised; deleting an earlier note leaves the later note's ID unchanged on the board
      *(`scripts/test-p1317-inbox-cli.sh`: concurrent adds → `INBOX-5`/`INBOX-6`, counter 7; the no-lock
      control reproduces the collision; a hand-written `INBOX-20` raises the counter to 22; deleting
      `INBOX-4` leaves `INBOX-5` locatable. 21 of 21 checks pass.)*
- [x] A fixture with a duplicate ID and one with no ID each render as unparseable
      *(Oracle: sections I/J → `duplicate-id`, K → `missing-id`; fixture board shows the missing-ID card red.)*
- [x] `/weekly` step 2.5 lists entries with their IDs and `resolve INBOX-<n>` resolves the right entry
      *(Skill text on main, `da0c6fabc` + `4ed068704`: lists via `inbox.sh list`, full-token matching,
      delete by ID. The mechanism is the CLI's `delete`, tested to remove exactly the named entry and
      nothing else, tombstone included.)*
- [x] `/create-spec <note-ID>` creates the spec then deletes the note; with the delete forced to fail it reports `PROMOTION INCOMPLETE` and the note is still present; no spec in `features/` contains an open note's full ID token
      *(`scripts/test-p1317-inbox-promote.sh`, 6/6: clean promote; forced failure prints
      `PROMOTION INCOMPLETE: … still open (delete failed)`, exit 1, note present. `grep -rnoE 'INBOX-P?[0-9]+' features/`
      outside this spec → none; this spec carries no live token.)*
- [x] Promoting a private-store fixture leaves no `INBOX-P` token or private counter value in the generated spec or its commit message
      *(Promote test: output and spec carry no `INBOX-P` or counter; a spec carrying `INBOX-P` is refused.
      The commit-message rule is instruction-level in `/create-spec`, not machine-checked.)*
- [x] Before the P1250 audit note is deleted, all four citing artifacts point at its new home in P1250 and a fresh reference grep returns no other citation
      *(Six, not four: P1250:153, P558:23, P843:23, decisions.md, `ship.md:118`, `git-ops.sh:3620` —
      all repointed in `f3c7bb155` / `da0c6fabc`.)*
- [x] First `/slava:maintain:prioritize` pass over inbox cards run; resolve / drop / keep / promote counts recorded
      *(2026-09-15. Two read-only reviewers proposed a verdict per entry; every close was re-verified by
      command before deletion. **Public: resolve 7 · drop 0 · keep 64 (12 flagged founder call) ·
      promote 4** (annotated on the entries). **Private: resolve 2 · drop 0 · keep 20** — one proposed
      private close was overturned on evidence. Record: `docs/decisions.md` 2026-09-15 [process] "First
      /prioritize pass"; private reasoning in `.private/docs/p1317-census.md`.)*
- [x] Open total (public + private) recorded on the day of that pass. `[post-ship]` Re-count 30 days
      later: if the total has not fallen below it, intake throttling (P1081's standing fallback) is
      filed as a spec that week, not re-debated
      *(**88** open at the end of the pass (public 68, private 20). The 30-day re-count is filed as an
      inbox note (`due: month`, recount on or after 2026-10-15), so it does not depend on anyone
      remembering it; that note is the 69th public entry.)*

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
  decisions.md 2026-08-28 [process], "`git-ops.sh ship` guards untracked files that would block the cherry-pick", files a follow-up "in process-learnings.md rather than as a kanban card" on
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
- **Codex gpt-5.6-sol, second pass on the post-decision delta** (FAIL, 6 findings, all confirmed):
  promotion could not be "same step"; the accepted counter race contradicted uniqueness; the P1250
  audit note has four citing artifacts, not one; readers would carry two number systems; bare
  `N<n>` was already in use (the author's earlier absence grep only matched 3-digit numbers); a
  private ID could reach a public spec on promotion. Its proposed replacement prefix `NOTE-` also
  collided (P937, P967), caught by the author's own wider grep; `INBOX-` was adopted. The census dispositions for the P1212 and P1211
  notes were independently confirmed.

## Related

- P1081 (`features/done/2026-06-10/p1081_deferred_notes_queue.md`): built the inbox close path; its accepted intake risk is what fired
- P962 (`features/done/2026-06-10/p962_kanban_pipeline_crm_board.md`): precedent for the board rendering gitignored `.private/` data locally
- decisions.md 2026-08-28 [process]: "cp's WIP limits shipped, rendered, and were never switched on — `week` reached 58 items"
