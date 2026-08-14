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

If the private store does not exist yet, create it with this header:

```markdown
# Process Learnings (private)

Private half of the repo's deferred-work inbox — infra, credentials, absolute paths, and anything
else that must not reach the public repo. Same format and same close rule as
`docs/process-learnings.md`; `/weekly` step 2.5 reads both. This file is gitignored.
```

---

## Step 2 — Append the entry

Append at the **end** of the target file, in exactly this form:

```markdown

## <short title — the thing to do, not a category>

**Date:** YYYY-MM-DD
**Status:** proposed
**due:** week

<the note text — one to three sentences. What to do, and what makes it done or droppable.>

---
```

Rules on the shape:

- `**Status:** proposed` must be **bold and at column 1**. The readers count it with
  `grep -c '^\*\*Status:\*\* proposed'`. Unbolded or indented, a human still sees the entry and
  every mechanical count silently misses it — that mismatch is what P1081 was filed to fix.
- `**Date:**` is today, resolved with `date +%F`. Never type a date from memory.
- `**due:**` is `week` or `month`. Write it even for `week`, so the field is visible rather than
  inferred.
- Three fields and a body. **No** category, priority, assignee, or recurrence — deliberately
  rejected in the spec; the queue stops being cheap to write the moment it has a schema.
- Write a **droppable** note: say what would make this no longer worth doing. An entry that can
  only ever be resolved and never dropped is how the queue became a graveyard.
- Third-party names go in as roles, never names — in the private store too.

---

## Step 3 — Verify, then report

Confirm the write landed and the entry is machine-visible:

```bash
date +%F
grep -c '^\*\*Status:\*\* proposed' <target-store>
tail -12 <target-store>
```

The count must have risen by exactly one. If it did not, the status line is malformed — fix the
line, do not re-append.

Report in one line: `Filed to <store> (due: <week|month>) — now N open.` If it went private, say
so explicitly, and say which trigger routed it.

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
