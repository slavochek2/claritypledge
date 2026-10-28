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

## Cost Budget

Every metered surface this adds, per run of the hourly workflow (runs per month = 24 x 30 = 720) and per
weekly upkeep run (4 per month). Nothing here is per user or per test run.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Compute API reads (`getGuestAttributes`) | n/a | 1 per run = 720/month | n/a |
| IAM credential exchanges (STS + access token) | n/a | 2 per run = 1,440/month | n/a |
| Guest-attribute writes (in-VM metadata server, not an API call) | n/a | 4 per report x 6 reports = 24/hour | n/a |
| GitHub API (issue list, plus a create/comment/close on change) | n/a | 1 to 2 per run = up to 1,440/month | n/a |
| Supabase Management API (weekly: one hosted `select 1`, one prod auth-config read) | n/a | 2 per week = 8/month | n/a |
| Actions minutes (public repo) | n/a | about 1.5 min per run = 1,080 min/month | n/a |
| VM egress, the only billed byte path (Compute Engine row: internet egress per the network pricing page) | n/a | hourly: two TLS handshakes, one for the cert read and one for the reachability probe (each reads 4,862 bytes, measured 2026-10-28 with `openssl s_client`) + the probe's 401 answer (399 bytes, measured with curl) = 4,862 x 2 + 399 = 10,123 bytes per run x 720 = about 7.3 MB/month; weekly: two template fetches (3,909 + 3,755 bytes, the served files) plus their two handshakes (4,862 x 2) = 17,388 bytes x 4 = about 70 KB/month. Total about 7.4 MB/month | n/a |
| Bytes not billed to us | n/a | guest-attribute read (4 values, about 0.5 KB) and IAM exchanges go Google API to GitHub runner; the VM reporter talks only to the in-VM metadata server; issue lookups, upstream `versions.md` (about 7 KB weekly) and the Management API replies (under 1 KB each) land on the runner or the Mac | n/a |
| Log lines | n/a | one 5-line run log per run; failures add one issue comment per hourly run while the alert stays open | n/a |

1. **Fits today?** Fits. Compute API and IAM credential calls are not billed (Compute Engine row: billing is
   per VM resource, not per API call), and 720 reads a month sits far under the per-minute read quota.
   GitHub-hosted runners are free for a public repo. The Management API calls are 8 a month. The VM-side
   reporter is one `df` and one `psql` every 10 minutes on a VM that is already paid for.
   VM egress of about 7.4 MB/month is about 0.007 GB, a fraction of a cent at the registry's per-GB egress
   price, paid from credits.
2. **Fits at 10x?** Fits: 10x is a run every 6 minutes, about 74 MB/month of VM egress (0.07 GB), still a
   fraction of a cent, and no other billed unit. The reporter's 10-minute cadence is the floor anyway.
3. **No upgrade needed.**

**Rule 2 (polling needs a reason):** push is not available. The point is to notice the VM going silent,
and a dead VM cannot push. Hourly is the interval: reachability and disk change on the scale of hours,
and /day reads the result once a day. The VM reporter is local (no network beyond the metadata server),
so its 10-minute cadence costs no metered unit.

## Known limitations

- **The Workload Identity binding is repo-wide, not per workflow.** Any workflow on `main` that asks for
  an ID token can impersonate both `cp-test-health-reader` and the existing `db-backup-writer`. The new
  account itself can only read this VM's guest attributes, but this hourly workflow is one more job whose
  third-party actions (the pinned Google auth and SDK actions) hold an ID token the backup writer also
  accepts. Narrowing both to their
  own workflow needs an `attribute.workflow_ref` mapping on the shared provider, which the backups also
  use. [FOUNDER DECISION: narrow the shared provider's bindings per workflow, or accept repo-wide.]
- **Issue lookup reads the newest 100 open issues** (the repo-wide P1155 pattern; P1567 rejected
  paginating as exotic). A failed lookup creates rather than appends (P1567), so a lookup that keeps
  failing during an outage opens one duplicate issue per hour.
- **Caddy runs on the host network**, which the container block cannot cover. It is the internet-facing
  process: if it were compromised it could write a false health report and read the VM's account token
  (that account has no roles). No container mounts the Docker socket (checked 2026-10-28), so no
  container can start a host-network one. The block is IPv4: Docker IPv6 is off on the stack's networks.
- **The template check covers the two templates TEST customises** (magic link and confirmation) and
  confirms the auth service fetches them. Subjects and the other templates are GoTrue defaults on
  purpose (decisions.md 2026-10-28, P1557).
- **A planned VM stop adds an issue comment every hour** until it starts again (ACCEPT, above).

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
