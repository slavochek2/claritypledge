---
status: qa
type: task
rank: 1
workstream: infrastructure
created_date: '2026-10-21'
tags: [supabase, test-project, quota]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
parent: p1530
---

# P1538: Rebuild the TEST Supabase project in its own organisation

## Problem

> Founder framing, verbatim: *"Rebuild the Supabase TEST project as a new project in the empty
> free organisation, and retire the old one."*

[P1530](p1530_supabase_log_ingestion_and_egress_before_restriction.md) found that the TEST project
produced most of the organisation's over-quota usage, while production faces restriction after the
grace period. Supabase refused to transfer the project, so the TEST project is rebuilt as a new
project (`ayibkeoyukulbsjpxgaw`, Singapore, same region as prod) in a separate free organisation,
and everything that named the old ref (`gfjctyxqlwexxwsmkakq`) is repointed. The old project is
kept, never deleted. This spec covers the rebuild and the repoint; the egress and logs questions
stay with P1530.

## Appetite

Blast radius: every session that uses TEST, the env files, one CI workflow, 29 tracked files.
Reversibility: the old project still exists and the old env files are backed up privately;
switching back is one copy. Prod is untouched.

## Approach (as executed, 2026-10-21)

1. **Schema from a private dump, not a migration replay.** The migration chain does not build a
   database from empty ([decisions.md](../docs/decisions.md) 2026-08-20, P1132). A schema-only dump
   of the old project was restored into the new one and never committed; the dump-seed rejection in
   decisions.md is about publishing a dump in this public repo, which a private restore does not do.
2. **Grants reset, then replayed.** The new project's default privileges granted anon and
   authenticated broader rights on every restored function and table than the old project had
   (299 objects). Every object was reset to the Postgres default and the old dump's GRANT/REVOKE
   lines replayed; a raw-ACL comparison of both catalogs then differs only cosmetically.
3. **Data without the e2e junk.** Public data copied whole; auth users copied except the e2e
   sweeper namespace, plus the few junk users still referenced by rows (no deletes anywhere).
   Pre-existing orphan rows on the old project are reproduced as they were.
4. **Project config copied:** auth settings, templates and redirect list (browser-side, secrets
   never left the browser), storage policies and buckets, cron jobs, vault entries, realtime
   publication, 19 edge functions with matching `verify_jwt`, function secrets (verified by digest
   against the old project). Project-scoped management tokens re-minted for the new ref.
5. **Repoint** (this branch): scripts, tests, the auth canary workflow, Codex MCP config, docs,
   skills, two rules files, open specs. History keeps the old ref: decisions.md, done/archived specs,
   migrations, archived scripts, content fixtures. Untracked config (env files, MCP config, keychain)
   repointed on the machine.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The SMTP password is masked by the config API, so a config copy carries the mask | MITIGATE | Found by test (535 on signup); a new SMTP key was generated for the new project |
| The new free org runs into its own limits at today's e2e volume | DEFER | [P1532](p1532_e2e_cleanup_and_offline_pack_request_amplification.md) |
| One storage-signing key has no local copy | ACCEPT | Two test-only functions return 500 until it is provided; founder decision |
| Copied rows keep image URLs on the old project's storage; storage objects were not copied | ACCEPT | Those images break on TEST once the old project is paused; new uploads go to the new storage |

**Non-Goals:** pausing the old project (a paid plan cannot be paused; sequenced after the plan
downgrade, tracked in P1530) · fixing the pre-existing failing tests found on the way (filed as notes).

## Cost Budget

This change moves where e2e traffic lands; it does not change what a run does.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | unchanged: same code, new target | unchanged | unchanged (P1532 owns the per-run cost: about 1,500 users minted and deleted per full run) |
| Egress (bytes) | unchanged | unchanged | unchanged; now billed to the test organisation, 0 to prod's |
| Log lines | unchanged | unchanged | unchanged; now in the test organisation |
| One-time rebuild | — | — | schema dump ~0.9 MB + data dump ~5.3 MB + auth export (745 + 476 users) = about 7 MB egress from the old project, once |

Consequence: the prod organisation stops paying for e2e traffic. The test organisation's free quota
now absorbs it alone, so at today's volume TEST itself can run into its limits until P1532 lands.


## Done-When

- [x] New project schema matches the old: schema-dump diff differs only in expression formatting; raw-ACL diff differs only in one cosmetic NULL-vs-owner ACL; migration ledgers equal.
- [x] Integration suite, run per test on old and new with one worker over every file with an unexplained failure: no test passes on old and fails on new except the two that need the missing storage-signing key, and one test that fails against main's own code (terms version).
- [x] Auth email works on the new project: the P1510 auth spec passes 14/14 including a real confirmation send.
- [x] Persistent test accounts sign in on the new project; `migrate.sh` reaches it with nothing pending.
- [x] Every session notified before the switch; env files, MCP config and keychain repointed.
- [x] No live file names the old ref (`git grep` excluding the history listed above).
