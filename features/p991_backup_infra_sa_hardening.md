---
status: week
type: task
rank: 1000944.0
created_date: '2026-07-15'
tags: [infrastructure, security, gcp, backups]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

6. Same category as step 5 (make the safety net actually work), independent of all the service-account work: a defect in the backup alert's condition, found during the 2026-07-15 review and explicitly deferred here — but the handoff was dropped and never landed in this spec until now. **One-field fix.** The defect and the exact fix are in the private infra decisions log, entry dated 2026-07-15 — not restated here, per the private-vs-public rule. The alert's notification *channel* is already verified end-to-end (same entry); this is the condition, not the channel.

7. **A backup of an EMPTY database passes every check and reports success.** Found by adversarial review of the step-5 work; confirmed with a fixture — full DDL for 400 tables, every `COPY` block carrying zero rows, gzips to ~4KB: `pg_dump` exits 0, writes its completion footer, produces well-formed gzip. Size floor, `gunzip -t`, and footer check are all green. This is what a mass `TRUNCATE`, a botched migration, a restored-blank staging DB, or the connection string pointing at the wrong project produces. **Every check added in step 5 validates that the file is *shaped* like a backup; none validates that it *contains the database*.** Schema DDL alone clears the size floor, so no floor can ever catch it. Fix requires a **[FOUNDER DECISION: which table is the canary?]** — read a row count from the live DB before the dump and assert the same count appears in the verified object's `COPY` block, or assert a data-line floor. Uses only `get` on the bucket + a DB read; respects the create+get-only scope.

8. **A poisoned object can land in the bucket that nothing can verify or remove.** `pg_dump | gzip | gsutil cp -` streams bytes: when `pg_dump` dies mid-dump, gzip flushes and exits, and `gsutil` sees EOF and **finalizes the object normally** — it cannot distinguish upstream failure from end-of-input. `pipefail` then correctly fires and exits the script **at the pipeline**, so step 5's verification never runs on that object. Confirmed: pipeline exit 1, yet a valid-gzip, correctly-named, footer-less object remains. It sits for the 7-day lifecycle window, and `db-backup-writer` has no delete to clean it up. **Step 5's verification is unreachable exactly when a bad object is produced** — it is advisory, not load-bearing. Fix (create-only, no delete needed): write a sidecar marker object (e.g. `<name>.sql.gz.verified`) **only after** all checks pass, and define restore as "newest backup that has a matching marker". Unmarked poison becomes inert and ages out via the existing lifecycle rule. **Note this changes the restore procedure** — document it wherever restore is written down.

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

- [x] The VM-based backup consumer runs under a dedicated account with only the permissions it actually uses; its next scheduled backup run succeeds — **evidence:** VM cut over to a dedicated write-only account (create-only on one bucket + logging/monitoring). A **cron-driven** run (fired by cron itself, confirmed in syslog, not a manual invocation) completed with exit 0 and zero failure strings. Identity proven by the written object's ACL owner, not by exit code. Negative tests via direct JSON API: cannot delete even its own object (403), cannot list the bucket (403), no compute-API reach (403).
- [x] The file-upload service runs under a dedicated account; a real end-to-end upload through the product still works — **evidence:** full product chain exercised (real JWT → edge fn → shared secret → signing service → signed URL → PUT = HTTP 200). The returned signed URL's `X-Goog-Credential` names the new dedicated account, proving it is the signer. Negative tests: cannot read an existing recording (403), cannot list its own bucket (403), **cannot reach the DB-backup bucket (403)**, no compute-API reach (403).
- [x] The incidental finding (private log, 2026-07-15) is resolved inside step 2's redeploy, per the acceptance check named in that entry; a real end-to-end upload still works afterward — **evidence:** the value is now a secret reference, not a literal, in the deployed config (the exact acceptance check that entry names); rotated to a fresh value; the superseded value is now rejected (401) and a request with no secret is rejected (401, fail-closed).
- [ ] The shared default service account no longer holds broad project-wide permissions — **BLOCKED, premise was wrong: see "Half A stop point" below**
- [ ] The shared account's broad grant on the second backup bucket is removed — **BLOCKED: ineffective in the order specified; see "Half A stop point" below**
- [x] The backup workflow's integrity check catches a truncated-but-nontrivial file, not just a near-empty one — **evidence:** the check logic, extracted verbatim, exits 1 on a truncated gzip (120KB) and 1 on a valid-gzip/no-footer dump (142KB), and exits 0 on a healthy 205KB fixture; the old size floor passes BOTH broken files. First real CI run is the remaining confirmation.
- [x] The backup workflow has a concurrency guard preventing overlapping runs — `concurrency: {group: db-backup, cancel-in-progress: false}`; queues rather than kills an in-flight backup. YAML parse verified.
- [x] The backup alert's condition defect (step 6, private log 2026-07-15) is fixed and the alert demonstrably fires — **evidence:** condition patched to `ALIGN_MIN` / `300s` alignment (was `ALIGN_MEAN` / `86400s`, confirmed live via the Monitoring REST API before the change; `gcloud alpha monitoring` is unavailable without a component install). Armed at a deliberately-true threshold (`<100`, live count 8), founder confirmed receipt of the alert email — the fired path is now proven end-to-end, not just the channel. Threshold reverted to `3`; aligner fix retained and re-verified after revert.
- [x] A backup of an empty/near-empty database FAILS the workflow (step 7) — **evidence:** zero-row fixture (full DDL, every `COPY` at 0 rows) passes `gunzip -t` AND the footer check AND any size floor — confirming no structural check can catch it. Gate logic extracted verbatim: empty source → exit 1; source 3 rows / object 0 rows → exit 1; `psql` read failure → exit 1; healthy → exit 0. Canary is `public.profiles`.
- [x] A backup whose `pg_dump` died mid-stream cannot be mistaken for a good one (step 8) — **evidence:** reproduced under **bash** (a first attempt under zsh gave a false result and was discarded): pipeline exits 1, the verification block below it never runs, and a valid-gzip footer-less 177-byte object is finalized in the bucket regardless. Naive "newest object" selection picks that poison; the marker rule picks the last good backup, which then passes gzip + footer + sha-vs-marker.
- [x] The restore procedure is documented — **evidence:** `docs/technical/db-restore.md` created. **It did not exist anywhere before**: a grep of `docs/`, `scripts/`, `.github/` and `README.md` for `pg_restore` / restore steps / the bucket name returned only the backup workflow itself. 8 backups existed with no written way to use them.

## Half A stop point (2026-07-15)

**Steps 1, 2, 2a: done and independently verified** (evidence in Done-When above). Each consumer was migrated separately and verified before the next was touched, per the Non-Goals.

**Steps 3–4: stopped, not attempted — the spec's premise is factually wrong.**

This spec (and the private log it defers to) both assert the shared account is required by **two** live consumers. A live enumeration found **four** — two more were never in scope, one of which is serving real production traffic today, in a different region than the others (which is likely why both the spec and the review missed it). Removing the broad permission now would break live product functionality with no dedicated account in place. That is exactly what this spec's own Non-Goals forbid.

**Step 4 is also mis-ordered, independent of the above.** The bucket in question uses the legacy (non-uniform) access model, and its legacy ACL grants owner-equivalent access to *any* project editor. The shared account holds the broad project-wide role, so it is a project editor — meaning it retains full access to that bucket **via the ACL no matter what IAM binding is removed**. Removing the binding alone is cosmetic; step 4 only becomes real once step 3 lands (or the bucket moves to uniform access). The step-1/step-4 entanglement the Solution describes is genuine, but the stated order does not achieve the goal.

**Also note:** the least-privilege scope for the file-upload service is *not* create-only. Overwrite is a live code path (a fixed-name per-session object written by both participants), and in this storage system overwriting requires delete. Create-only would have 403'd the second participant's write and been swallowed by a non-throwing catch — silent data loss, precisely the risk this spec's Risks section names. The deployed role grants create+delete but **not** read/list, preserving the "cannot read existing recordings" property.

**Follow-up filed:** see P998 — migrate the third consumer, decide the fourth, then land steps 3–4. Full mechanics (identities, the four consumers, exact grants) are in the private infra decisions log, 2026-07-15 — deliberately not restated here, per the private-vs-public rule, because steps 3–4 describe a **live, unfixed** over-permission.

**Steps 5–8** (backup integrity) are complete and were pushed; the restore itself was subsequently proven end-to-end by P997.

**Known-unproven — now CLOSED by P997 (2026-07-15):** this spec left "no full restore of a real prod dump has ever been run" as the highest-value untested claim. P997 executed the documented restore procedure against a real prod backup into a scratch Postgres: the canary table matched the marker exactly and the tables that matter restored correctly. The only failures were platform-managed roles/extensions absent from bare Postgres, which a real restore target (a fresh managed project) has natively. See `docs/decisions.md` 2026-07-15 [technical] (P997).
