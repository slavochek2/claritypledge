---
name: note
description: File one deferred-work item into the repo's task inbox — dates it, sets due:, and routes public vs private. The write path for anything worth doing later that is not being done now.
when_to_use: "Whenever something worth doing later surfaces and is not being done now — friction, a follow-up, a re-run on a date, a proposed fix, a threshold to check. File it instead of asking the founder to remember it. Triggered by /note, 'note this', 'file that for later', 'remind me next week/month'."
version: 1.0.0
---

# /note — file one item into the task inbox

> **The rule this skill exists to enforce: file it, don't ask the human to remember it.**
> If you are about to write "remember to…", "you'll want to check X on [date]", or "worth
> revisiting later" — that is a `/note`, not a sentence. The behaviour this replaces is real:
> the session that specced this skill told the founder to personally remember a 14-day
> follow-up, because no write path was discoverable to it (P1081).

Writes **one** entry. Does not read, close, or reorganise the queue — `/weekly` step 2.5 does
that (`due: week`), `/monthly` does it for `due: month`.

---

## Usage

```
/note "text"                 → due: week   (default — surfaces in the next /weekly)
/note "text" month           → due: month  (surfaces in /monthly only)
```

No flags beyond that. If the caller gave no text, ask for the one line — do not invent it.

---

## Step 1 — Route: public or private

**Decide before writing.** This repo is public (AGPL-3.0); the private store is gitignored.
Apply [.claude/rules/pii.md](../../../rules/pii.md) and CLAUDE.md's *Private vs Public Files* rule
at write time — `audit-privacy.sh` is a backstop against mechanical patterns, **not** the control,
and it will not flag an arbitrary name or an infra detail.

Route to `.private/docs/process-learnings.md` when the text names any of:

- infrastructure specifics — hostnames, project refs, VM names, bucket names, cron identifiers
- credentials, secrets, key locations, or auth mechanics
- unpatched security mechanics (the exact resource or current exploit path)
- absolute user paths (`/Users/<name>/…`, `~/.claude/…`, project-encoded paths)
- a private individual — user, customer, interviewee, partner, contact — or their email/UUID
- personal life circumstances, private business detail, or GTM/strategy specifics

Otherwise route to `docs/process-learnings.md`.

**When unsure, route private and say so.** A wrongly-private note costs one move later; a wrongly-
public one cannot be recalled from a public repo — `git revert` does not remove it from history.

If the private store does not exist yet, the CLI in Step 2 creates it with the standard header —
do not hand-create it.

---

## Step 2 — File the entry through the CLI — never hand-append

Every entry carries a numbered ID (`INBOX-<n>` public, `INBOX-P<n>` private), and only the CLI can
make that ID unique: it takes a lock, re-reads the store, raises the `Next ID` counter past any
hand-written ID, appends, advances the counter, and verifies the new ID occurs exactly once (P1317).
Two sessions filing at the same moment get two consecutive IDs. A hand-appended entry has no ID and
shows on the kanban's Inbox column as **unparseable**.

```bash
./scripts/inbox.sh add --store public --title "<short title — the thing to do, not a category>" --due week <<'NOTE'
<the note text — one to three sentences. What to do, and what makes it done or droppable.>
NOTE
```

`--store private` for a private note. The CLI prints the new ID and writes:

```markdown
## <title>

**ID:** INBOX-<n>
**Date:** YYYY-MM-DD
**Status:** proposed
**due:** week

<body>

---
```

Rules on the shape:

- `--due` is `week` or `month`. Pass it even for `week`, so the field is visible rather than inferred.
- The title is one line. The body may not contain a `## ` heading, a bold `Status` / `ID` / `due`
  field line, or a code fence — the CLI refuses them (exit 2), because a reader would parse them as
  structure.
- An ID, three fields and a body. **No** category, priority, assignee, or recurrence — deliberately
  rejected in the spec; the queue stops being cheap to write the moment it has a schema.
- Never write or edit an `ID` or `Next ID` line by hand.
- Write a **droppable** note: say what would make this no longer worth doing. An entry that can
  only ever be resolved and never dropped is how the queue became a graveyard.
- Third-party names go in as roles, never names — in the private store too.

Exit codes: `0` filed · `2` bad input · `4` post-write check failed · `5` lock held too long (another
session is filing; retry once, then report) · `6` public store absent (it is committed — report it,
do not recreate it).

---

## Step 3 — Verify, then report

```bash
./scripts/inbox.sh count --store <public|private>
./scripts/inbox.sh check --store <public|private>   # must exit 0
```

The open count must have risen by exactly one and `check` must exit 0. If `check` names a section,
fix that section at the source; do not re-add the note.

Report in one line: `Filed INBOX-<n> to <store> (due: <week|month>) — now N open.` If it went
private, say so explicitly and say which trigger routed it — and keep its `INBOX-P` ID out of any
public file and any commit message.

---

## Do not

- Do not create the note anywhere else — not in project root, not in a new file, not in
  `docs/decisions.md`. Two stores exist; there is no third.
- Do not edit, reword, reorder, or de-duplicate existing entries. Append only. The store holds
  live content, including an unfilled pre-commitment.
- Do not mark anything `Status: done`. Entries leave the store or stay open (see the close rule
  in `/weekly` step 2.5).
- Do not file work that is being done right now — that is a spec (`/slava:build:create-spec`) or
  a bug (`/slava:build:create-bug`), not a note.
