---
status: week
type: task
rank: 90
workstream: infrastructure
created_date: '2026-11-03'
tags: [testing, self-hosted, supabase, guard]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1606: Switch hosted TEST off by default; switching it on is an explicit founder decision

## Problem

**Situation:** Three non-production Supabase servers exist. Test 1 is the old hosted project in production's paid organisation (`gfjctyxqlwexxwsmkakq`). Test 2 is the hosted free-plan project (`ayibkeoyukulbsjpxgaw`), default until 2026-10-28. Test 3 is the self-hosted server, the one default since then (P1557, P1591).
**Complication:** On 2026-11-02 a build note carried a stale reason, and an agent ran heavy test walks on Test 2 for about a day until it stopped answering (overload is likely, unproven). A warning (P1602) cannot prevent this, because an agent can state a stale reason and continue. A keychain dialog would ask the founder to approve something he cannot judge, and leaves the dashboard and other stored copies open.
**Question:** How does Test 2 stay available for the rare case that needs real Supabase, without any agent being able to drift onto it?

> Founder framing, verbatim: "lets switch off then - so we cna swithc on any time if needed and it beocmes explicit deciion"

## Appetite

Blast radius: every workflow that still reaches Test 2, including scheduled checks, skills and a set of security-relevant specs. Reversibility: restoring the project in the dashboard; the code changes revert with git. Decision density: the choice is made; two naming and retirement calls remain below.

## Invariants

- Test 2 is paused unless the founder has decided otherwise for a named use. No agent restores it, by API or by driving a logged-in browser, even when told a restart would help, unless the founder asks for that restore in the same turn.
- A run aimed at a paused Test 2 fails with a message that says what to do. It never falls back silently to another server, and it never retries in a loop.
- Moving the hosted-only specs must not reduce what they check. A spec that skips on Test 3 counts as not moved. (P1591 records why silent skips and stale copies matter; epistemic gate 7c applies to every new refusal.)
- Production is read at most, and only for a schema comparison, through the existing read-only and keychain paths. The rebuild never copies production rows.
- A rebuild follows the P1538 procedure (decisions.md 2026-10-21: private schema dump, then grant reset and replay). Migration replay from empty is known to fail (P1132, P1538).

## Solution

1. **Before the pause, move what would raise a false alarm or stop work.** The scheduled auth canary and any `/day` check that reads Test 2 stop depending on it. Enumerate first: the ratchet allowlist `scripts/hosted-test-readers.allowlist`, `.env.local` readers and `.mcp.json`. For each, record whether it moves, is removed, or stays and refuses clearly. This reverses the 2026-10-30 ruling that `.env.local` stays pointed at hosted TEST for the raw-SQL suite and the rollback path, so item 3 and the record in `docs/decisions.md` must say so.
2. **Pause Test 2.** The founder does this in the dashboard, once no running session depends on it (check open worktrees first; the founder refused downtime for concurrent sessions on 2026-10-21).
3. **Move the hosted-only specs.** The specs that only run on Test 2, because they use its Management API for raw SQL (the five named by `test:e2e:hosted-sql`, plus any others found by searching the skip conditions), get a raw-SQL route on Test 3 and run there by default. The route uses a database connection reached the way the existing self-hosted tooling reaches it; it does not add a public HTTP endpoint.
4. **Refuse clearly.** Playwright, the dev server and `migrate.sh --env hosted-test` stop with a message naming the request form below when Test 2 is the target and no founder decision is recorded for this run. Build on P1602's check rather than beside it.
5. **Request form.** An agent that believes Test 2 is needed asks the founder in two lines: what only real Supabase can show, and the failed Test 3 run that proves it. Justified: behaviour of Supabase's own platform that Test 3 cannot reproduce (gateway, hosted auth, captcha, rate limits). Not justified: Test 3 lacks a key or feature (fix Test 3), speed, or a note saying so.
6. **Bring it level before use, and pause after.** A documented recipe: restore, compare Test 2's schema with production's, rebuild by the P1538 procedure if they differ, confirm an empty diff, use it, pause it. Reading production's schema takes the existing keychain approval.
7. **Find out which stored tokens can restore the project.** Check each by a harmless read of its permissions, never by performing a restore. Narrow or remove any that can, and record specifics in `.private/docs/security-log.md`.
8. **Test 1.** `[FOUNDER DECISION: delete Test 1, recommended and pending his yes.]` It cannot be paused without moving production's organisation off the paid plan, which is a separate decision (P1530). Before deletion: compare its contents with Test 2 and Test 3, including storage objects, and download a backup. After deletion: drop its ref from `scripts/lib/test-target.mjs` and the SQL purge guard, by a new migration.

`[FOUNDER DECISION: names. Proposed: "TEST" means Test 3 only, Test 2 becomes "PARITY", Test 1 is retired.]`
`[FOUNDER DECISION: a date to decide whether to delete Test 2. Proposed: 2027-02-01. Supabase's docs give paused free projects a one-year restore window.]`

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| An agent restores Test 2 through the founder's logged-in browser | ACCEPT | Only a rule stops this. The founder may log out of Supabase in the browser agents use; a keychain would not close this either, because the dashboard shows the key |
| A stored token can restore the project | MITIGATE | Solution item 7 |
| Worktrees on older branches keep their own scripts and env copies | MITIGATE | A paused project refuses them anyway; the refusal message arrives once they rebase |
| Test 2 cannot carry the agents if Test 3 dies | ACCEPT | It is not a rollback for a multi-agent load, and this spec stops claiming so. Test 3 has its own rebuild recipe (P1584) |
| Self-hosted differs from Supabase in ways no default run shows | ACCEPT | This is what the request form exists for |
| The founder approves a request under pressure | MITIGATE | The form requires a failed Test 3 run as evidence |

**Non-Goals**
- Do NOT move Test 2's keys into the keychain. Rejected below.
- Do NOT downgrade production's organisation. P1530 owns that.
- Do NOT touch P1536's work in `w1`.
- Do NOT delete Test 1 or Test 2 under this spec without the founder's explicit yes.
- Do NOT push or deploy without the founder's say-so.

## Done-When

- [ ] Test 2 is paused, shown by a read of its status after the founder's click
- [ ] With Test 2 paused, a day's scheduled checks raise no false alarm: the auth canary and `/day` run clean or say plainly what they no longer cover
- [ ] A Playwright run, a dev server and `migrate.sh --env hosted-test` aimed at Test 2 each refuse with the message, exit non-zero and do not retry, with exit codes pasted (known-bad control)
- [ ] The same three commands on the default self-hosted path pass unchanged (known-good control, epistemic gate 7c)
- [ ] The moved specs run on Test 3 and report passed, not skipped; a deliberately broken check makes at least one of them fail
- [ ] An agent holding the service key gets no answer from Test 2 through any stored copy, proven by trying each copy against the paused project
- [ ] The token permission check is recorded privately, and no remaining stored token can restore the project
- [ ] The level-and-use recipe exists and names the two-line form; a first real run of it is not required
- [ ] The founder decisions above are recorded in `docs/decisions.md`, including the reversal of the `.env.local` ruling

## Alternatives Considered

- **Keychain for Test 2's keys (the earlier proposal):** per-read dialogs the founder cannot judge, several per test run, with the same key in other files and visible in the dashboard. Rejected by the founder 2026-11-03.
- **Delete Test 2 now (Gemini 4 Argon's preference):** rests on a fresh copy taking minutes from migrations; decisions.md and P1557 record that replay fails from empty. Deleting also removes the only real Supabase environment and cannot be undone.
- **Upgrade Test 2 to a paid plan:** a recurring cost, already rejected 2026-10-28, and agents would still drift onto it.
- **Warning only (P1602):** an agent can state a stale reason and continue.

## Rollback Strategy

Restore the project in the dashboard and revert the commits. The specs moved to Test 3 can stay there.

## Related

Promoted from the task inbox in part, 2026-11-03: the hosted TEST catch-up note stays open until this ships, because it is droppable only once Test 2 is retired. P1602 (warning, unlanded on its branch) · P1591 · P1557 · P1584 · P1538 · P1530 · P1132 · decisions.md 2026-10-29 "One default TEST server", 2026-10-21 "A Supabase project is rebuilt from a private schema dump"
