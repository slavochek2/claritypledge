---
status: all-done
type: task
rank: 1000791.0
created_date: '2026-06-05'
tags: [infrastructure, transcription, p858, cost, cutover]
delivery_stage: create-spec
pipeline_ran: [create-spec, dev]
completed_at: '2026-06-05'
---

# P902: P858 Prod Infra Cutover (event-driven transcription go-live)

> **Execution checklist.** This is not new design — it provisions the founder-gated prod
> infrastructure that [P858](./p858_event_driven_transcription.md) deferred.
> Target architecture: `docs/technical/infrastructure.md` → "Cloud Run: transcribe-session".
> **Run in a fresh session with full context** — step (e) is a slow ~GB GPU container build.

## Already done (do NOT redo)

- ✅ P858 code merged to `main` (unpushed). Commits `abca058a`..`d57c0426`.
- ✅ Prod DB migrated: `transcription_jobs.attempts`/`max_attempts` columns + `claim_pending_job` RPC — **verified live on prod** (service-role query returned `attempts:0,max_attempts:3`; RPC returns HTTP 200).
- ✅ `deploy-manifest.json` stamped on main (commit `88d14a48`).
- ✅ The €200 leak is already stopped: `transcribe-poll` scheduler is PAUSED.

## Problem

**Situation:** P858 (replaces the GPU keep-warm leak with event-driven transcription) is code-complete on `main` and its DB schema is live on prod, but the prod trigger/sweeper infrastructure was explicitly deferred as founder-gated pre-deploy work and never built.
**Complication:** Without that plumbing, `/live` recordings save but never transcribe — the feature is dark. Cloud Tasks API isn't even enabled on the GPU project.
**Question:** Provision the trigger chain (webhook → Cloud Tasks → Cloud Run) + sweeper + cost backstop, deploy the service, and cut over — without reintroducing a warm-GPU cost leak.

## Appetite

High blast radius (security-sensitive IAM/OIDC; a cost-sensitive GPU service that has leaked twice). Medium reversibility (each piece is individually deletable; the €30/day alarm is the backstop). Medium decision density — architecture is decided in P858; open items are project/region IDs and exact SA naming.

## Approach — execute in this order

GCP project `gen-lang-client-0869694595`, account `slava@inguro.com`, region `us-east4`. Draft each command, get per-step approval, run, verify before next step.

- [x] **(a) €30/day GCP budget alert FIRST** — the safety gate before any GPU infra exists. This is the only defense against an unanticipated keep-warm failure mode.
- [x] **(b) Enable Cloud Tasks API** (`cloudtasks.googleapis.com`) — currently disabled.
- [x] **(c) Create Cloud Tasks queue** in `us-east4`, `maxConcurrentDispatches=5` (matches L4 GPU quota = 5).
- [x] **(d) Service account + IAM/OIDC** for the webhook→tasks→Cloud Run auth chain (key-free OIDC). Least-privilege: only invoke `transcribe-session` + enqueue to the queue.
- [x] **(e) Build + deploy Cloud Run `transcribe-session`** new image (endpoints `/transcribe-async`, `/sweep`). Preserve all GPU settings (L4, `maxScale=5`, `min-instances=0`, `--concurrency=1`, `cpu-throttling=false`, `timeout=3600`). Deploy `--no-traffic`, then migrate traffic manually.
- [x] **(f) Supabase DB webhook (pg_net)** on `transcription_jobs` INSERT → enqueue to Cloud Tasks (carries `job_id` only — session fields come from `RETURNING`, never the payload).
- [x] **(g) Cloud Scheduler `tx-job-janitor`** (~2h, OIDC) → `POST /sweep`. Interval ≫ ~15-min idle window, so it does NOT keep the GPU warm. Allowlist its name in `.claude/commands/slava/day.md` cost tripwire.
- [x] **(h) Delete old `transcribe-poll`** scheduler (the leak driver — retained only as rollback until (a)–(g) verified).
- [x] **Push `main`** — was already pushed (spec note stale) → Vercel deploys the app's job-insert path. Sequence so app + trigger plumbing go live together.
- [x] **Verify end-to-end on prod** — start a real `/live` clarity session, end it, confirm the job transcribes via `/transcribe-async` and the GPU scales back to zero (no warm hold) afterward.

## Risks / Non-Goals

### Risks
- **Reintroducing a warm-GPU leak.** Mitigation: build the €30/day alarm (a) first; confirm the sweeper interval (~2h) ≫ idle window; never add a sub-idle-window poll.
- **OIDC/IAM misconfig** → either auth failures (jobs never trigger) or over-broad permissions. Mitigation: least-privilege SA; verify the trigger fires with a single real job before relying on it.
- **`transcribe-poll` deleted before the new path is proven** → no transcription. Mitigation: delete (h) only after (a)–(g) verified end-to-end.
- **Keychain PAT shadow** (seen 2026-06-04): `migrate.sh`/Supabase tooling reads keychain-first; a stale `Supabase CLI` entry shadows `.env.prod`. Workaround: shadow `security` on PATH.

### Non-Goals
- Do NOT re-run the P858 DB migrations (already applied to prod — verified).
- Do NOT change P858 application or service code (it shipped; this is infra only).
- Do NOT make transcription synchronous to avoid the cool-down (a few GPU-minutes/session is the intended, bounded cost — re-architecting reintroduces request-timeout fragility).
- Do NOT add a 5-min (or any sub-idle-window) poll under any circumstances.

## Done-When

- [x] €30/day budget alert active on the GPU project (verified it exists).
- [x] A real `/live` session recording transcribes end-to-end via the event-driven path (job: pending → processing → completed).
- [x] After the job completes, `transcribe-session` scales to zero (no standing instance, no warm-GPU hold).
- [x] `transcribe-poll` deleted; `tx-job-janitor` present and OIDC-authed.
- [x] `main` pushed and Vercel app live with the job-insert path.
- [x] `/day` cost tripwire does not flag `tx-job-janitor` as a leak (allowlisted).

## Rollback Strategy

Each piece is individually reversible: pause/delete `tx-job-janitor`, disable the DB webhook, roll Cloud Run traffic back to the prior revision, delete the Cloud Tasks queue. The DB schema is additive (harmless if left). If the cutover misbehaves, re-pausing the trigger returns prod to today's safe state (transcription off, no leak).

## Execution Notes (2026-06-05)

Executed per checklist. Deviations & findings:

- **(a)** GCP budgets can't be daily → €30 **monthly** budget with stacked current-spend thresholds (100%→1000%), so a €30/day leak alerts within ~a day and every €30 after. Budget `5013ffe1`, scoped to the GPU project.
- **(c)** Queue `transcribe-jobs` already existed (disabling the API doesn't delete queues); config matched spec.
- **(d)** Two SAs: `tx-task-invoker` (run.invoker on transcribe-session only; used by Cloud Tasks OIDC + janitor) and `tx-enqueuer` (enqueuer on queue + actAs invoker; its key is the chain's only long-lived secret, stored as Supabase secret `GCP_ENQUEUER_SA_KEY`). **Security find:** `allUsers` had run.invoker — the GPU service was publicly invokable. Removed; probes now 403.
- **(f)** pg_net can't mint Google OAuth → edge function bridge `enqueue-transcription` (--no-verify-jwt, static `x-webhook-secret`, task name = job id for dedup). Prod-only pg_net trigger `tx_jobs_enqueue` created ad-hoc (NOT a repo migration: contains the secret and must not exist on test).
- **(e)** TWO image regressions surfaced by the rebuild (old running image predated them):
  1. `useradd -r` (sec-hardening 448c4c66) registers but never creates /home/appuser → Errno 13 on HF cache writes. Fix: `-m -d /home/appuser`.
  2. `torchaudio` unpinned → CUDA-13 wheel beside torch<2.6 (CUDA 12.1) → `libcudart.so.13` OSError at pyannote import. Fix: pin `torchaudio>=2.1.0,<2.6.0`.
- **Verified:** synthetic invalid-code job exercised the whole chain (INSERT→trigger→edge fn→Tasks→OIDC→claim→validation-fail) in seconds; real session BWMBTV then completed end-to-end (4 segments, en, 68s) on revision `transcribe-session-00029-w2n` (image `:p858-cutover-3`).
- **Push main** was already done before this session (spec note was stale).
- Scale-to-zero is enforced by config (`min-instances=0`, no pollers); next `/day` GPU check observes it empirically.
