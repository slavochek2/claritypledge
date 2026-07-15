---
status: all-done
type: task
rank: 1000947.0
created_date: '2026-07-15'
tags: [infrastructure, backups, alerting, observability]
pipeline_ran: [create-spec, dev, ship]
completed_at: 2026-07-15
---

# P995: Backup alerting goes to the founder's inbox and can't see a stopped backup for 5 days

## Problem

**Situation:** A Cloud Monitoring policy guards the prod DB backup bucket: it alerts when object count drops below 3, emailing the founder. Its condition defect was fixed and proven under P991 step 6 (it now fires — verified end-to-end).

**Complication:** Closing that step surfaced two further defects that step 6 did not cover.

1. **Wrong destination.** It emails the founder personally. This contradicts an existing decision — [docs/decisions.md](../docs/decisions.md) 2026-06-06 [process], the P866 pattern — that scheduled-gate alerts route to find-or-append GitHub issues consumed by `/day`, never the founder's inbox. `db-backup.yml`'s own alert step follows that pattern and says so in a comment. The monitoring policy, created the same day, does not. The founder cannot act on a backup alert at 3am; an agent reading `/day` can.

2. **A ~5-day blind spot on the most likely failure.** "Object count < 3" only trips once the 7-day GCS lifecycle rule has aged files out. If backups silently **stop**, the count decays 8→7→6… and nothing alerts for roughly five days. A *failed* run alerts today (`db-backup.yml` has `if: failure() || cancelled()`). A run that **never fires** does not — and the most likely cause of that is GitHub automatically disabling scheduled workflows on repos with no recent activity, which is a documented GitHub behaviour and not a hypothetical.

**Question:** How do we alert on "the backup is stale or unusable" — the thing we actually care about — on a channel an agent already reads?

## Appetite

Low blast radius (one new scheduled workflow; touches no live service, no product code, no existing workflow). Fully reversible (delete the file; revert one notification-channel field). Low decision density — the pattern is established twice over in this repo (`check-deploy-drift.yml`, `prod-health-smoke.yml`); the only real judgment is the staleness threshold.

## Solution

A scheduled GitHub Actions check that asserts the **newest backup has a matching `.verified` marker** (P991 step 8) **and is less than 25 hours old**, alerting via the same find-or-append GitHub issue pattern `check-deploy-drift.yml` uses.

Asserting freshness-plus-marker rather than object count catches all three real failures in one check:
- backups **stopped** → caught the next morning, not in ~5 days
- backups **deleted** → newest marker disappears or ages out
- backup **poisoned** (`pg_dump` died mid-stream, object finalized anyway) → object exists but has no marker

Follow the established pattern exactly. **Read [docs/decisions.md](../docs/decisions.md) 2026-06-06 [process] before implementing** — converting `check-deploy-drift` to this pattern surfaced three hidden requirements that were each paid for once already. Do not rediscover them:

- **`pipefail` is mandatory.** The default Actions `run` shell is `bash -e` **without** pipefail, so `script | tee out.txt` returns tee's `0`, the check appears to pass, and the issue step never fires — the gate goes silently unwatched. Proven locally at the time: exit 0 without, exit 1 with.
- **Exact-title matching.** `gh issue list --search "... in:title"` token-matches, so a comment or close can land on a *different* issue that merely shares title words. Match exact titles via `--json number,title` + jq `select(.title==$t)`.
- **Auto-close on recovery** — a stale open alert trains the reader to ignore the channel.

And the distinction that is easy to get backwards:
- **The check step is `continue-on-error`; the alerting steps are NOT.** A stale backup must not fail the workflow (that would email the founder — the very problem this spec closes). But a *broken alerter* must fail loudly, because an unwatched gate is no gate. Per the 2026-06-06 decision, this asymmetry is deliberate.
- **Find-or-append**, so a persisting stale backup doesn't spawn an issue per day.

**Verified fact — no new permission needed:** `db-backup-writer` already holds `storage.objects.list` via `roles/storage.objectViewer` on the bucket (confirmed live via `gcloud storage buckets get-iam-policy`). The check reuses the existing WIF identity. It must stay within create+get+list.

Keep the Cloud Monitoring policy as an **independent backstop** — it does not share a failure domain with GitHub Actions, which matters for a control whose whole job is catching the case where the GitHub-run backup stopped. A GHA check watching GitHub-run backups is partially self-referential; the monitoring policy is not. Move its notification channel off the founder's personal inbox to `ops@claritypledge.com` as an **unpolled backstop mailbox** — explicitly not a channel any agent reads.

## Risks / Non-Goals

### Risks
- **The check shares a failure domain with the thing it watches.** If GitHub disables scheduled workflows on this repo, it disables *both* the backup and this check — the watcher goes silent exactly when the watched thing fails. Mitigation: this is precisely why the Cloud Monitoring policy stays alive as an independent second signal. **MITIGATE** — do not delete the policy as "redundant"; the redundancy is the point.
- **A 25h threshold on a 24h schedule leaves ~1h of slack.** A backup that runs late (queued behind the concurrency group) could trip a false alert. Mitigation: 25h is one hour of headroom on a 03:00 UTC daily cron; widen only if a real false positive appears, never preemptively. **ACCEPT.**
- **`/day`'s ops-issue guidance names only two known issue titles** ("Deploy drift detected on prod", "Prod health smoke"). A new backup-stale title will appear in its raw `gh issue list` output but have **no interpretation guidance** — the agent sees the text without knowing what to do. Fixing that is a one-line edit to `day.md`, which is a **skill edit requiring founder approval**. **MITIGATE — flag and ask; do not assume approval.**
- **Alert fatigue if the issue never auto-closes.** Mitigation: implement the auto-close arm, and prove it (see Done-When). **MITIGATE.**

### Non-Goals
- Do NOT re-do P991 steps 6/7/8 — done, proven, committed as `d45f63db`. This spec consumes the `.verified` marker; it does not redesign it.
- Do NOT expand `db-backup-writer`'s IAM scope. The check must work within create+get+list. If it appears to need more, that is a signal the design is wrong, not the scope.
- Do NOT delete the Cloud Monitoring policy — it is the independent backstop (see Risks).
- Do NOT route this alert to any inbox an agent is expected to poll. The GitHub issue is the agent-facing channel; `ops@` is a silent backstop only.
- Do NOT edit `day.md` without explicit founder approval.
- Do NOT add a webhook or Pub/Sub hop to make Cloud Monitoring open GitHub issues — the runtime units are not worth it; that is what the GHA check is for.

### Alternatives Considered
- **Route the Cloud Monitoring alert to `ops@claritypledge.com` and teach `/day` to read it over IMAP.** Rejected as the primary fix: `/day` reads GitHub issues today and reads no mailbox at all. This adds an IMAP dependency and a second alerting surface for zero gain over an issue, and alerts split across two channels get read in neither. `ops@` survives only as the silent backstop channel.
- **Make Cloud Monitoring open a GitHub issue via a webhook or Pub/Sub → Cloud Function hop.** Rejected: adds a network hop, a function, and an auth path — several new runtime failure modes — to reach a channel a plain scheduled workflow already reaches with none.
- **Just lower the object-count threshold.** Rejected: it does not address the blind spot at all. No count threshold can distinguish "backups stopped 4 days ago, files still aging out" from "healthy", because during that window the count is legitimately high.
- **Have `db-backup.yml` itself assert freshness.** Rejected: a workflow that never runs cannot report that it never ran. The check must be a separate trigger.

### Rollback Strategy
Delete `.github/workflows/backup-staleness.yml` and close any open issue it filed. Revert the notification channel with a one-field `PATCH` to the existing alert policy. No IAM was changed, so there is nothing to un-grant. Nothing here is a one-way door.

## Done-When

- [x] A stale backup (newest verified marker older than 25h) opens a GitHub issue — **proven by fixture, seen to fire**: unmodified `check-backup-staleness.sh` run against a stale-marker fixture (verified_at 30h ago) exits 1 with the real error text; the `gh issue create` step's exact command was run live against a disposable issue (#4, public repo, closed after). The `pipefail` guard itself was independently proven both directions on the same command (exit 0 without `set -o pipefail`, exit 1 with it) — the exact trap the spec calls out.
- [x] An unmarked-but-present newest object (the P991 step-8 poison case) is treated as stale, not healthy — proven: fixture with no `.verified` marker exits 1 (`ERROR: no .verified marker ... unverified or poisoned object`), not argued from the code.
- [x] A healthy bucket opens no issue, and **auto-closes** a previously-open one — **partial evidence, flagged honestly:** the "opens no issue" arm is proven (healthy fixture exits 0, so the workflow's `if: steps.staleness.outcome == 'failure'` gate is structurally false — same conditional mechanism as `check-deploy-drift.yml`). The **auto-close `gh issue close` mutation was not exercised by the workflow's own command** — my personal `gh` token is create-only on this repo (403 on comment/close/edit via both REST and GraphQL, confirmed live); issues #4 and #5 were closed manually via the GitHub UI (Chrome), not via the script's `gh issue close` line. The close/comment code is byte-identical to `check-deploy-drift.yml`'s, which auto-closes live today, and the workflow runs under `github.token` (not my restricted PAT) with `issues: write` declared — different, properly-scoped credentials. Confirm on the first real cron run or a `workflow_dispatch` after push.
- [x] The check does not fail the workflow run itself (alert-only) — `continue-on-error: true` on the staleness step, identical mechanism to `check-deploy-drift.yml` (already proven live per decisions.md 2026-06-06). Structural, not independently re-run in Actions this session.
- [x] `db-backup-writer`'s IAM bindings on the bucket are **unchanged** from `objectCreator` + `objectViewer` — verified: `gcloud storage buckets get-iam-policy` before and after this work returns byte-identical bindings, same etag `CAc=`.
- [x] The Cloud Monitoring policy still exists and still fires, with its channel no longer pointing at the founder's personal inbox — verified via the Monitoring REST API: policy `1036502131796248667` unchanged (`enabled: true`, same `COMPARISON_LT` / `ALIGN_MIN` condition proven firing under P991 step 6), `notificationChannels` now points only at a newly created, verified `ops@claritypledge.com` channel (verification code fetched live via `read-ops-email.mjs`, confirmed `verificationStatus: VERIFIED`). Old personal-inbox channel left intact (unused) for the Rollback Strategy's one-field revert.
- [x] `/day` surfaces the issue when one is open — confirmed by running it: created a disposable issue titled "Backup stale or unverified" (#5) and ran the literal `gh issue list --state open --limit 50` command from `day.md`'s Repo Health step — the issue appears in the raw output. Scoped to the ops-issues detection mechanism itself, not a full end-to-end `/day` run (Sentry/Mixpanel/reflection are unrelated to this change). Issue #5 closed after.
- [x] The `day.md` interpretation gap is either fixed (with founder approval) or explicitly recorded as accepted — fixed with explicit founder approval: added a one-line "Backup stale or unverified" entry to `day.md`'s ops-issues paragraph, mirroring the existing drift/prod-health entries. **Committed on `main` inside a concurrent session's commit `f58d929d`** (a different session ran `git commit` on the same file while my hunk was staged via `git add -p`, sweeping it in) — the content is verified correct and live (`git show f58d929d` contains the new sentence), but the commit message doesn't mention it. Flagging per Transparency Principle rather than amending someone else's commit.

## Origin

Found while closing **P991** step 6 (`features/p991_backup_infra_sa_hardening.md`). P991 owns the service-account de-privileging and the backup-integrity checks; this spec owns the alerting channel and the staleness signal. Deliberately filed separately: P991 already carries two unrelated halves and five open Done-When items, and this work neither blocks nor depends on its remaining service-account migration.

**Note on the P-number:** `scripts/next-p-number.sh` returned `994`, which collides with the rejected `features/archive/p994_infra_vuln_leak_precommit_gate.md` (commit `7f3297d4`). The script excludes `archive/` by design. `995` was verified free by hand. **The script has a live bug** — see the separate note filed against it.
