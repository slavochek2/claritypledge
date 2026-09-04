---
status: qa
type: bug
rank: 1000065
severity: high
workstream: infrastructure
date_reported: '2026-09-03'
created_date: '2026-09-03'
tags: [live, e2e, test-infra, concurrency, p1043]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
reproduce_artifact:
  test_file: scripts/test-p1234-predev-port-guard.sh
  root_cause: "check-worktree-env.sh:kill_zombie_on_port() kills the port's occupant unconditionally; on the shared main checkout every concurrent session maps to port 5001, so one session's `npm run dev` kills the dev server another session's in-flight run is using"
  confidence: high
  scenarios_in_scope: [predev-kills-healthy-server, playwright-teardown-kills-reused-server]
  reproduced_at: 2026-09-03
  fix_shape: open
  fix_shape_why: "two credible remedies for the predev half (health-check before reaping vs refuse-and-abort with worktree guidance), and neither addresses the Playwright-teardown half, which may need a per-run port instead"
---

# P1234: Concurrent test runs on the shared main checkout kill each other's dev server, making /live suite triage meaningless

> **Repointed 2026-09-03.** This spec was filed as *"Two-party session creation never reaches
> the waiting room"*. That symptom **does not reproduce** — see
> [What has been ruled out](#what-has-been-ruled-out--by-control-not-by-argument). The title's
> other claim — that something makes the whole /live E2E suite unreadable — is true, and this
> is its confirmed cause.

## Summary

Every concurrent session working on the **main checkout** shares one dev-server port (5001).
`npm run dev` runs a `predev` hook that kills whatever holds that port, unconditionally. So one
session starting a dev server — or Playwright's `webServer` starting one — kills the server
another session's in-flight test run is using. Every remaining test in the victim run then dies
at `page.goto` with `net::ERR_CONNECTION_REFUSED`.

Those cascade failures are indistinguishable from application defects in a run summary. They are
what made a /live batch look like a uniform 16-of-16 application failure when only 6 of the 16
were real.

## Root Cause

`scripts/check-worktree-env.sh:10-29` — `kill_zombie_on_port()`:

```bash
pids=$(lsof -ti:"$port" 2>/dev/null || true)
if [[ -n "$pids" ]]; then
  echo "⚠ Killing existing process on port $port (zombie cleanup)..."
  echo "$pids" | xargs kill 2>/dev/null || true
```

There is no health check. The function is named and documented as *zombie* cleanup, but it cannot
tell a zombie from a healthy server that is actively serving another session's tests — it reaps
both. It is wired in as `predev` (`package.json:8`), so it runs on **every** `npm run dev`.

Two distinct paths reach the failure, and a health check only closes the first:

1. **predev reaps a live server.** A session runs `npm run dev` (directly, or via Playwright's
   `webServer`) while another session's server is serving. Confirmed by canary and observed live
   this session: a `npm run dev` logged `⚠ Killing existing process on port 5001` against PIDs it
   had not started.
2. **Playwright teardown reaps a reused server.** `playwright.config.ts` sets
   `reuseExistingServer: !process.env.CI`, so run B adopts run A's server rather than starting
   its own. When run A finishes, Playwright kills the server **it** started — and run B, still
   mid-flight, loses it. No predev involvement at all. **Not covered by the canary.**

## Reproduction Steps

**Deterministic (the canary):**

```bash
./scripts/test-p1234-predev-port-guard.sh    # exits 1 on Scenario 1
```

Stands a healthy HTTP server on an isolated hashed 58xx port (never 5001 — the canary must not be
able to kill a co-tenant's real server), runs the real `check-worktree-env.sh` from a synthetic
worktree cwd, and asserts the server survives.

**Observationally, in the suite:**

1. Run a /live batch: `npx playwright test e2e/p272-live-verification.spec.ts e2e/p275-live-positions.spec.ts e2e/p400-story-card-rendering.spec.ts e2e/a11y/p398-accessibility.spec.ts`
2. While it runs, have any other session on the main checkout run `npm run dev` (or start another
   Playwright run that decides to boot a server).
3. Every test that has not yet loaded its page fails in ~3s at `page.goto` with
   `net::ERR_CONNECTION_REFUSED at http://localhost:5001/`.

## Actual vs Expected

**Expected:** a test run owns a dev server for its duration. A concurrent session either gets its
own port, or is told the port is in use — it never silently removes the server under a running
suite.

**Actual:** measured on the four sampled files at 3 workers, 16 failures:

| Failures | Cause | Real defect? |
|---|---|---|
| 10 | `net::ERR_CONNECTION_REFUSED at localhost:5001`, all ~3s, all after the server died mid-run | **No** — cascade |
| 5 | `[waitForDBPresence] Timed out … clarity_sessions.joiner_name` — guest join never reaches the DB | Yes — belongs to P1043 |
| 1 | `getByRole('button', { name: /Does … understand you/i })` — creator does not detect the joiner | Yes — belongs to P1043 |

The 10 cascade failures carried no marker distinguishing them from the 6 real ones. Failure
ordering is the only tell: real failures ran 23–29s, cascade failures ~3s.

## What has been ruled out — by control, not by argument

The originally reported symptom, and the two hypotheses the first triage rested on:

| Hypothesis | Disproof | Verdict |
|---|---|---|
| Session creation never reaches the waiting room | Three runs: isolated creator-only canary **passes**; the untouched control `p-story-persistence-fixes.spec.ts` **passes** creation, share link, guest join and the `joiner_name` DB write; the four sampled files at 3 workers produced 16 failures with **0** at that assertion (`grep -c "Invite Your Partner"` = 0) | **Not reproducible** |
| Test DB is missing P1097-A, so the code-less INSERT fails | The canary's session was created with a server-minted code. `code` is `TEXT UNIQUE NOT NULL` (`20250101_initial_schema.sql:139`) and the P1097 client sends none, so a minted code proves the trigger is live | **Ruled out** |
| `recordSessionConsent` throws after P1235 rewrote the policy | Consent insert succeeded in every passing run; the policy is `user_id = auth.uid()` and the caller passes its own id | **Ruled out** |
| `hashIP()`'s third-party fetch throws and blocks the waiting room | `api.ts:3664` catches everything and falls back to a random id. It does gate the waiting room behind an awaited 3s-timeout external call, but it cannot throw | **Not the cause** (latent latency only) |

## Collateral finding — the test deploy manifest is wrong

`./scripts/check-deploy-manifest.sh --env test` reports **25** unapplied migrations, including
`20260901200000_p1097_a_server_minted_room_code` — which is provably applied (above). `879493b0f`
reconciled that manifest against `schema_migrations` earlier the same day and it is still wrong.

This is not cosmetic: it is what made the environmental hypothesis look confirmed, and it will
mislead the next agent that reads it. **Tracked by P1103** (open, backlog): its root cause —
`stamp-deploy-manifest.sh` rebuilding the migration array from whichever checkout runs it, deleting
entries applied from another worktree — is the mechanism that makes `check-deploy-manifest.sh`
report an applied migration as unapplied. Not fixed here; no new ticket needed.

## Open question — not confirmed

Vite logs `[vite] (client) Re-optimizing dependencies because vite config has changed` on start,
which force-reloads connected clients. A reload landing just after "New session" would reset the
page's `view`/`session` state and make the freshly created waiting room vanish — which would
reproduce the original symptom exactly. **Untested:** the probe requires killing a live dev server
that another session is using. Recorded as a hypothesis, not a finding.

## Invariants

- Any fix must be verified against a file **outside** the set being edited. This defect was
  distinguishable from two concurrent changes only because an untouched control was run; a
  same-file check would have been consistent with all three hypotheses.
- **A cascade failure must be distinguishable from an application failure in the run output.** The
  10 connection-refused failures were counted as /live defects by the previous triage. Whatever
  the fix, a dead dev server must not present as a product bug.
- The canary must never target port 5001. A test that can kill a co-tenant's dev server reproduces
  the defect instead of detecting it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A health check makes `predev` refuse to reap a hung-but-listening server, reintroducing the zombie it exists for | MITIGATE | Canary Scenario 2 is the control: a port holder that answers no HTTP must still be killed |
| Fixing the predev half leaves the Playwright-teardown half open, so the cascade still happens | ACCEPT | Named explicitly in Root Cause path 2. Both halves must be addressed or the remainder stated |
| Per-run ports diverge from `vite.config.ts` / `playwright.config.ts` / `check-worktree-env.sh`, which each recompute the same mapping independently | MITIGATE | Three copies of the port mapping already exist; a fix that adds a fourth is worse than the bug |
| Treated as one bug when it is several | MITIGATE | The 6 real /live failures are explicitly NOT in scope here |

**Non-Goals**
- Do NOT modify the E2E specs to work around it. The tests are asserting the correct thing.
- Do NOT fix the 6 real /live failures here (guest join not reaching the DB, creator not detecting
  the joiner) — those are P1043's.
- Do NOT fix the stale test deploy manifest here.

## Acceptance Criteria

- [x] Clicking **New session** on `/live` renders the **Invite Your Partner** waiting room with a
      usable share link — verified by `e2e/p1234-reproduce.spec.ts` (passes; code minted,
      share link read, row bound to the creator's profile id)
- [x] `p-story-persistence-fixes.spec.ts` — the untouched control — reaches a join step (it
      completes creation, share link, guest join, and the `joiner_name` DB write)
- [x] `./scripts/test-p1234-predev-port-guard.sh` exits 0: a healthy dev server survives `predev`,
      **and** a true zombie is still reaped — 4/4 scenarios pass, `EXIT_REAL=0`. Two scenarios were
      added for `epistemic.md` gate 7c: a FREE port must be ALLOWED (the fixture previously had an
      occupant in every scenario, so the refusal's false-positive rate was unmeasured), and the
      `FORCE_PORT_RECLAIM=1` escape hatch must still reclaim. Every scenario has a proven failure
      path: S1 failed pre-fix (exit 1); S2/S3/S4 fail (exit 1) against deliberately broken guards.
      Post-review, S1 and S4 also assert the guard's **exit code and abort message**, not only
      whether the fixture server lived — a guard that silently no-ops would otherwise have read as
      PASS; proven by two further broken variants (refusal exiting 0 → S1 fails; reclaim exiting 1
      → S4 fails).
- [x] A concurrent `npm run dev` during a running Playwright batch produces zero
      `ERR_CONNECTION_REFUSED` failures, or fails the run loudly as an infrastructure error rather
      than as N application failures — both halves hold. Verified end-to-end in w1 on port 5100: a
      healthy server (pid 6149, HTTP 200) survived a second `npm run dev`, which exited 1 naming the
      port; `npm run smoke` against that same server passed 3/3 and left it alive (pid 6149, HTTP
      200); `FORCE_PORT_RECLAIM=1 npm run dev` reclaimed it (pid 22857 → 23118, HTTP 200). Port 5001
      was never touched. For the residual path 2, the `infra-cascade` reporter prints a loud
      infrastructure banner — driven end-to-end, it split a 2-failure run into 1 `[infra]` + 1
      `[app]` and stayed silent on an all-application run. Independent review found the first
      classifier would have mislabelled REAL defects as `[infra]` (52 specs collect `consoleErrors`
      and several embed the array into the failure message); it now requires a Playwright call at
      the line head **and** an origin match against the base URL, with 6 added fixtures covering
      shapes the original suite structurally could not emit.
- [x] The Playwright-teardown half (Root Cause path 2) is either fixed or recorded with its
      mitigation named — **recorded, not fixed.** `playwright.config.ts` carries the reason
      (Playwright exposes no hook to decline the kill of a server it started), the named mitigation
      (run concurrent E2E batches from separate worktrees, one port each), and why a per-run
      ephemeral port was rejected — it would add a fourth divergent copy of a port mapping that
      already lives in three files, and concurrent Vite servers in one worktree share the single
      `.vite-<slot>` dep cache that `validate_vite_cache` exists to repair. Same text in
      `docs/technical/worktree-setup.md`.
- [x] The cause is stated in `docs/decisions.md` — 2026-09-04 [technical], including the two
      canary defects found while building it (unmeasured false-positive rate; a silent SKIP on the
      only must-be-ALLOWED input) and the `timeout`-not-installed probe that reported a false
      defect.

## Why this matters more than its own tests

The 2026-08-31 triage attributed /live failures to the guest-join form. Those lines were
unreachable — the files died earlier. That defect was real and is fixed (P1232), but it was not
what those runs were failing on. This spec's own first draft then made the same class of error one
level up: it attributed 16 failures to session creation, which 0 of them were failing on.

Both mistakes have the same shape — **reading a cause off a failure count without checking where
the failures actually landed.** A run whose dev server can vanish mid-flight produces failure
counts that support any hypothesis. No /live triage number is trustworthy until a dead dev server
is distinguishable from a broken product.

## Related

- **P1043** — owns the 6 real /live failures this separates out.
- **P1232 / P1231** — the two E2E repairs whose behavioural verification this blocked; both now
  verified past the creator flow.
- **P1103** — same shape as the collateral manifest finding.
- **P612** — the /live *header* CTA is a no-op while the centre button works. The centre button is
  confirmed working this session (`e2e/p1234-reproduce.spec.ts`), which is consistent with
  `p612:27`; the contradiction the first draft of this spec noted was an artifact of the
  non-reproducing symptom.
