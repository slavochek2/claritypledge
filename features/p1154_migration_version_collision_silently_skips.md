---
status: rejected
type: task
rank: 67
workstream: infrastructure
created_date: '2026-08-24'
rejected_date: '2026-08-24'
tags: [migrations, prod, silent-skip, deploy, duplicate]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: anomaly
---

# P1154: Two migrations sharing a version prefix — one silently never runs

> **REJECTED 2026-08-24, hours after filing — duplicate of [P1042](p1042_migrate_silently_skips_on_version_collision.md).**
>
> P1042 (`status: week`, `severity: high`, filed 2026-08-10) already specifies this defect and its
> fix, in more detail than this spec did: record the filename in `schema_migrations.name` on apply,
> hard-fail when a skip would occur for a version recorded under a different filename, and a
> `name = NULL` fallback for historical rows. It even carries the authoring-time duplicate-prefix
> scan this spec proposed as its novel contribution — see its Fix Approach, step 3 and the
> paragraph below it.
>
> **Why it was filed anyway:** the repo's own rule is to grep before proposing to create. That grep
> (`decisions.md` for "version prefix" / "already applied, skipping") was run **during `/kdd`, after
> the spec was written and committed**, not before. It would have surfaced the 2026-08-11 entry and
> P1042 immediately. Filing first and checking second is the failure; the duplicate is only its
> symptom.
>
> **Nothing here is lost:** the 2026-08-24 prod evidence has been moved into P1042, where it
> belongs, and it materially raises that bug's priority. This file is kept rather than deleted so
> the recurrence is legible from either P-number.

## What today added to P1042

Recorded here only as provenance; the authoritative copy now lives in P1042's Evidence section.

- The collision reached prod a **second** time, five migration-days after the entry that filed P1042.
- **This one was same-tree.** The 2026-08-11 decision explicitly rejected an in-repo duplicate-prefix
  scan on the grounds that *"the colliding files lived in different worktrees, so neither tree could
  see the other."* On 2026-08-24 both colliding files were committed and sitting in the same
  `supabase/migrations/` directory — a plain `uniq -d` over the version prefixes finds them. So the
  rejected alternative would have fired this time. Neither control subsumes the other: the
  cross-worktree case needs P1042's apply-time hard-fail, the same-tree case is catchable at commit
  time.
- Concrete damage measured: `event_room_members` absent from prod (`count 0` from `pg_tables`), two
  P1114 base migrations that can never run, three follow-up migrations failing every apply with
  `42P01`, and deployed frontend code calling a room RPC that does not exist.

## Related

- **Superseded by:** [P1042](p1042_migrate_silently_skips_on_version_collision.md) — the original,
  still open.
- **Origin:** [decisions.md](../docs/decisions.md) 2026-08-11 "A `migrate.sh` success line is not
  evidence the schema changed".
- **Sibling filed the same day, not a duplicate:** [P1155](p1155_correct_alarm_rang_into_an_empty_room.md)
  — the drift alarm that reported this correctly for three days and reached nobody.
