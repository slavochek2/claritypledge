---
status: in-progress
type: task
rank: 79
workstream: infrastructure
created_date: '2026-10-28'
tags: [testing, infrastructure, self-hosted, monitoring]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1584: Self-hosted TEST server: scheduled health, weekly upkeep, recipe

## Problem

**Situation:** P1557 moved TEST to a self-hosted Supabase server. Its daily health (reachable,
certificate, disk, WAL) is read by /day's `cp.selfhosted` check through
`scripts/selfhosted/health.sh`.
**Complication:** A /day check runs only when a session opens. Reachability and certificate need no
credentials and belong in a scheduled workflow. Nothing yet reports when the stack's images fall
behind, and the setup exists only as P1557's commits, not as a recipe another machine could follow.
**Question:** Which upkeep runs on a schedule, which stays in /day and /weekly, and what does the
written recipe contain?

> Founder framing, verbatim: "should something be wired into /day or /week to maintain, secure and
> monitor the test server?"

Moved out of P1557 so the switch could ship; P1557's Done-When names this spec.

## Appetite

Blast radius: low (monitoring and docs; the server itself is unchanged). Reversibility: git revert.
Decision density: low; one founder call below.

## Solution

1. **Scheduled workflow** for reachability and certificate days left, over public HTTPS, opening a
   GitHub issue on failure, the same alert route as the other scheduled checks.
2. **Disk and WAL move into the scheduled workflow** through a narrowly scoped GCP service account
   that can only read the VM's health (founder decision 2026-10-28: "ok yes"). /day's
   `cp.selfhosted` then reads the workflow's result instead of probing over SSH.
3. **Weekly drift report** in /weekly: running image tags against the pinned stack version, pending
   OS security updates on the VM, whether a reboot is pending after an unattended upgrade
   (`/var/run/reboot-required`; unattended upgrades install security fixes daily but never reboot),
   and whether the auth e-mail templates still match prod's. Report only; an agent proposes the
   upgrade or reboot.
4. **Recipe** in the pp recipe system: create the VM, run the stack, apply migrations, deploy
   functions (including the shared import map), load the vault, flip the env, point hand-started dev
   servers at it (`.env.development.local`), set up Google sign-in, set up the founder-only mail
   relay and the prod e-mail templates, roll back.
5. **Hosted TEST stays as the warm fallback** (founder, 2026-10-28). `migrate.sh` and
   `deploy-functions.sh` keep it current, so switching back is one `flip-test-env.py hosted`. Free
   projects pause after inactivity, and a paused project fails the hosted leg of every TEST migrate
   while self-hosted, now the real target, sits behind it. The weekly report flags a paused hosted
   project. Re-decide at 2026-12-01: keep, or retire it and make TEST migrations self-hosted only.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A workflow alert fires for a planned VM stop | ACCEPT | Rare; the issue says so in one line |
| The recipe drifts from the scripts it describes | MITIGATE | The recipe names the scripts and their flags; it does not restate their logic |

**Non-Goals**
- Do NOT put GCP credentials in CI without the founder decision above.
- Do NOT auto-upgrade the stack; the weekly report proposes, a human approves.

## Done-When

- [ ] A scheduled workflow checks reachability and certificate, and an issue opens when the check is
      made to fail once (proven by pointing it at an unreachable host).
- [ ] /weekly shows the self-hosted image drift, pending OS updates, a pending reboot, and e-mail
      template drift against prod.
- [ ] The recipe exists in the pp recipe system and a dry read against the scripts finds no step
      they no longer support.
- [ ] /day's `cp.selfhosted` comment names the workflow instead of "filed".

## Related

- [P1557](p1557_self_hosted_supabase_test_database.md): the switch this follows.
- decisions.md 2026-08-09 [process]: monitoring is a scheduled workflow; /day stopgaps are knowing.
