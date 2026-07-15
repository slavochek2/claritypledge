---
status: week
type: task
rank: 1000944.0
created_date: '2026-07-15'
tags: [infrastructure, security, gcp, backups]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P991: Backup infra hardening remainder — de-privilege the shared default compute service account

## Problem

**Situation:** A recent review of our GCS backup bucket hardening found that a purpose-built backup-writer service account was correctly scoped to least-privilege, but a separate, broader-permissioned service account shared by two other live systems still has effective access to the same buckets.

**Complication:** That shared service account isn't unused overhead — it's actively required by two live things: a scheduled VM backup job and a live product file-upload feature. Removing its broad permissions outright would break both.

**Question:** How do we give each of those two consumers its own narrowly-scoped service account, so the shared account's broad permissions can be safely removed?

## Appetite

Medium blast radius (touches two live production things — but migrated independently, not both at once). Medium reversibility (service-account changes are revertible via IAM commands, but one of the two consumers needs a brief restart to pick up a new identity, so a mistake causes real downtime, not just an instant rollback). Low decision density — the target end-state (two dedicated least-privilege service accounts) isn't ambiguous; the only judgment calls are the exact permission sets each one needs.

## Solution

1. Create a dedicated service account for the VM-based backup consumer, scoped to only the storage write path it actually needs plus its logging/monitoring needs. Migrate the VM to it (requires a stop/restart — schedule for a low-traffic window). Verify its scheduled backup job succeeds on the next run before proceeding.
2. Investigate the file-upload service's exact permission needs by reading its source and current deployment config — don't assume from the service name. Create a dedicated service account with only those permissions. Redeploy (zero-downtime for this consumer) and verify a real end-to-end upload still works.
   - **2a. The incidental finding folds into THIS step — do not do it as separate work.** Read the private infra decisions log entry dated 2026-07-15 before starting. It explains why the sequencing matters (handling it outside this redeploy creates rework), and enumerates cutover traps a naive attempt will hit. Deliberately not summarized here — see Risks below.
3. Only after both migrations are independently verified working: remove the broad permissions from the shared service account, and remove its now-unnecessary access to both backup buckets.
4. Same root cause, entangled with step 1: one of the backup buckets also grants the shared service account broad object access for a reason connected to the VM migration — fix this once step 1 is verified.
5. Independent, low-risk, can be done anytime regardless of the above: the backup workflow's integrity check only verifies file size is non-trivial, not that the backup actually completed — harden it. Add a concurrency guard to prevent an overlapping scheduled + manually-triggered run from doubling load on the source database.

## Risks / Non-Goals

### Risks
- **The VM migration requires a restart** — the service it hosts goes down for the swap window. Mitigation: schedule for low-traffic, verify the new account's permissions work via a dry run before the actual cutover, don't remove the shared account's broad access until both migrations are independently confirmed.
- **The file-upload service's exact permission needs aren't yet confirmed** — assigning too narrow a scope breaks uploads silently until a real user hits it. Mitigation: read the actual source and test a real upload against the new account before cutting over in production.
- **Step 2a has a cutover window a naive attempt will hit** — schedule it when no live session is in progress. The specific traps and their mitigations are enumerated in the private log entry; do not attempt 2a without reading it first. **Why this is not spelled out here:** describing the current state of an unfixed weakness in a public repo is the exact thing CLAUDE.md's private-vs-public rule forbids — state the fix generically, keep the mechanics private. See [docs/decisions.md](../docs/decisions.md) 2026-07-15 [security].
- Full technical specifics (exact resource names, exact current permission grants, and the incidental finding now folded into step 2a) are tracked privately, not in this public spec — see the private infra decisions log, entry dated 2026-07-15. **That entry supersedes an earlier same-day one whose assumptions were wrong** (it treated the incidental finding as standalone work, and left open whether the service was still live — it is live and load-bearing; do not delete it).

### Non-Goals
- Do NOT touch anything already fixed this session (SSH access restriction, the backup-writer account's scope, the CI trust-condition scoping) — those are done and verified.
- Do NOT attempt both service migrations in the same change — verify one fully before touching the other.
- Do NOT remove anything from the shared service account until BOTH dependent migrations are independently confirmed working.

### Alternatives Considered
- **Leave the shared account's broad permissions as-is, rely solely on the network-access restriction already in place:** acceptable as a short-term posture (which is the current state), but not the long-term answer — an application-level issue in the upload service, unrelated to network access, would still inherit the same broad project access.
- **Use a cloud provider's built-in permission-recommendation tooling** to cross-check the minimal permission set for each new account, rather than only hand-deriving it: worth trying as a sanity check before finalizing, not a replacement for verifying against actual usage.

### Rollback Strategy
Each step is independently revertible: point the VM back at the original account if its migration breaks something; redeploy the prior revision of the upload service if its migration breaks uploads; re-grant the broad permission to the shared account if removing it breaks something unforeseen. Nothing here is a one-way door.

## Done-When

- [ ] The VM-based backup consumer runs under a dedicated account with only the permissions it actually uses; its next scheduled backup run succeeds
- [ ] The file-upload service runs under a dedicated account; a real end-to-end upload through the product still works
- [ ] The incidental finding (private log, 2026-07-15) is resolved inside step 2's redeploy, per the acceptance check named in that entry; a real end-to-end upload still works afterward
- [ ] The shared default service account no longer holds broad project-wide permissions
- [ ] The shared account's broad grant on the second backup bucket is removed
- [x] The backup workflow's integrity check catches a truncated-but-nontrivial file, not just a near-empty one — **evidence:** the check logic, extracted verbatim, exits 1 on a truncated gzip (120KB) and 1 on a valid-gzip/no-footer dump (142KB), and exits 0 on a healthy 205KB fixture; the old size floor passes BOTH broken files. First real CI run is the remaining confirmation.
- [x] The backup workflow has a concurrency guard preventing overlapping runs — `concurrency: {group: db-backup, cancel-in-progress: false}`; queues rather than kills an in-flight backup. YAML parse verified.
