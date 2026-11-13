---
status: all-done
type: comment
rank: 339
workstream: infrastructure
created_date: '2026-11-13'
tags: [selfhosted, test-env, latency, investigation]
disclosure: public
pipeline_ran: [create-spec, inline, ship]
flow: inline
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 6f512474d68476f15e721222540bd53d77c972d57860b645b68180abdca3a1df
spec_review_vendors: [gemini, openrouter]
completed_at: 2026-11-13
---

# P1678: Why the self-hosted TEST server sometimes takes 3 to 6 s to answer a trivial request

## Problem

**Situation:** The self-hosted TEST server (`cp-test-supabase`, the active TEST server) serves
`localhost:5001` and every self-hosted E2E run. P1672 measured it at about 1.3 load average with
12 GB of 16 GB free, so raw capacity is not obviously short.

**Complication:** On 2026-11-13 the founder asked whether the "Saved copy · updating…" strip they saw
came from a slow test server rather than prod:

> "or maybe our test server right now not very responsive not sure.. if its test server issue or also on prod"

In 45 rounds that hit Google `generate_204`, prod and the test server at the same moment, the test
server alone was slower than 2 s in 6 rounds (3.3 to 5.7 s), on both `/auth/v1/health` and a 50-row
`stories?select=id`, while Google and prod answered in about 0.2 s. A second run of 30 rounds an hour
later found 0 slow answers. So the slowness is real, specific to the test server, and intermittent.

**Question:** What makes the test server stall for seconds on trivial requests, and does it need a fix?

## Appetite

Blast radius: low; read-only requests (to TEST, and to prod and Google as controls). Reversibility:
nothing is changed. Decision density: zero to investigate; a fix, if one is found, gets its own spec.

## Approach

1. **Sample** for 45 minutes, one **round** every 10 s. A round fires four requests at the same moment:
   test `/auth/v1/health`, test REST (`stories?select=id&limit=50`), prod `/auth/v1/health` and Google
   `generate_204`. For each, record the **phase deltas** (curl's `time_*` values are cumulative, so
   each phase is the difference from the one before): DNS, TCP, TLS, server (TLS end to first byte),
   and the total. Before the window, check that both anon keys return 200, so a wrong key cannot pass
   as "fast".
2. **E2E load per round:** count the self-hosted E2E lock directories whose owner is still alive, using
   the repo's own `readOwner` / `isStale` (`scripts/lib/e2e-lock-primitives.mjs`), separately for
   slots, the exclusive claim and the old single lock. A plain directory count would include stale
   locks from crashed runs. The counter was proved on a control directory: a live owner counted, a
   dead one ignored. Only this Mac's git checkouts take these locks; no CI workflow runs E2E against
   the self-hosted server (`grep` of `.github/workflows/`).
3. **VM side:** if criterion 2 fires, read the VM's own report once
   (`scripts/selfhosted/health.sh --source guest-attributes`, read-only). It is a snapshot every
   10 minutes, so it can only rule out a sustained problem (disk, WAL, services restarting), not explain
   a single 4 s spike.

**Definitions (pre-registered):**
- **Slow test-only round:** the slower of the two test requests takes more than 2.0 s in total, while
  Google and prod health both take under 1.0 s in the same round. The unit is the round, never the
  single request.
- **E2E-loaded round:** at least one live slot, exclusive or old lock in that round.

## Research Questions

1. In a slow test-only round, which phase holds the time: DNS, TCP, TLS or server?
2. Do slow test-only rounds happen mostly while E2E runs hold locks?
3. Are both test requests slow in the same round (something in front of both services: proxy, VM,
   network path), or only one (one service)?

## Decision Criteria

Exactly one applies, checked in this order:

1. **Not reproduced:** fewer than 5 slow test-only rounds. Record the measurement and close; the
   2026-11-13 sample stays the only evidence.
2. **E2E load:** at least 30 E2E-loaded rounds were sampled, and 70% or more of the slow test-only
   rounds were E2E-loaded. The cause is concurrent E2E load: add the numbers to P1672 (capacity) and
   P1607 (slot limit); no separate fix here.
3. **One service:** in 70% or more of slow test-only rounds only one of the two test requests is slow.
   File a fix spec for that service (GoTrue or PostgREST), with the phase numbers.
4. **In front of both:** both test requests are slow together in 70% or more of slow test-only rounds.
   File a fix spec for the shared path (Caddy, the VM or its network), with the phase numbers and the
   VM report from Approach 3.
5. **Mixed:** none of the above. Record the numbers and the observed mix and close as unexplained; a
   second window only if the founder asks.

If fewer than 30 E2E-loaded rounds were sampled, criterion 2 cannot be judged: say so explicitly
rather than reading the absence of load as the absence of a cause.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A 45-minute window misses the spikes | ACCEPT | Criterion 1 covers it; another run is cheap |
| No E2E run happens in the window, so load cannot be judged | ACCEPT | Stated explicitly in the outcome (above); a deliberate E2E run is a later step only if the founder wants it |
| The two test requests add load to the machine they measure | ACCEPT | Two tiny requests every 10 s, next to E2E suites of hundreds |

**Non-Goals**
- Do NOT change the VM, its size, Caddy or the slot limit in this spec.
- Do NOT change anything on prod. Prod receives one read-only health request per round as a control.

## Done-When

- [x] A 45-minute measurement is recorded in this spec: rounds taken, slow test-only rounds, the phase
      holding the time in each, whether one or both test requests were slow, and E2E-loaded rounds
      (see Findings)
- [x] Exactly one Decision Criterion is named as the outcome, with its numbers, and its follow-up is
      done (numbers added to P1672/P1607, a fix spec filed, or the spec closed as not reproduced or
      unexplained). Outcome: criterion 1, not reproduced. `[post-push]` close with `/ship p1678`

## Findings (2026-11-13)

Window 19:02:14 to 19:47:09 local (45 min), sampler v2 (phase deltas, live-lock counter proved on a
control directory, both anon keys checked for 200 before the window).

| Measure | Value |
|---|---|
| Rounds | 214 |
| E2E-loaded rounds (a live slot, exclusive or old lock) | 111 |
| Slow test-only rounds (test above 2.0 s, Google and prod both under 1.0 s) | **4** |
| ...of which E2E-loaded | 0 |
| ...both test requests slow / only one | 1 / 3 |
| Rounds where all four requests failed (HTTP 000, Google included) | 11 |
| Rounds where at least one request failed | 19 |

The 4 slow test-only rounds, phase holding the time:

| Time | Test health | Test REST | Prod | Google |
|---|---|---|---|---|
| 19:03:09 | 0.248 s | 3.675 s, TCP 3.007 s | 0.170 s | 0.165 s |
| 19:17:53 | 0.242 s | 8.932 s, TCP 8.690 s | 0.158 s | 0.197 s |
| 19:19:17 | 8.875 s, TCP 8.675 s | 8.875 s, TCP 8.666 s | 0.143 s | 0.173 s |
| 19:46:02 | 0.996 s | 2.535 s, TCP 2.287 s | 0.999 s | 0.950 s |

Medians over all 214 rounds: test health 0.30 s, test REST 0.34 s, prod health 0.27 s, Google 0.23 s.

**Outcome: criterion 1, not reproduced** (4 slow test-only rounds, below 5). What the data does say,
without deciding anything from it:

- No sign that E2E load causes it: 111 loaded rounds, none of them slow. But every loaded round held a
  **single** slot (`1 0 0`); multi-slot or exclusive load never occurred in the window, so heavier load
  is untested.
- Every slow test-only request spent its time in **TCP connect** (2.3 to 8.7 s), never in TLS or in
  GoTrue/PostgREST. That rules out the services; it does not separate the network path from the VM's
  own network stack (a dropped connection attempt on either side looks the same).
- In 11 rounds all four requests failed together (Google included): this Mac's connection was down. The
  other 8 rounds with a failure are timeouts on a stalled connection that the requests with longer
  limits survived (Google gives up at about 10 s, the test requests at 20 s). Such drops and stalls are
  what P1677's strip reports as "Saved copy · updating…" or "Offline".
- Sampler artifact: on a failed request curl reports `time_starttransfer` 0, so the sampler's server
  delta is negative on those rows. It does not touch the 4 slow rounds, which all returned 200.

Findings reviewed by Gemini from the raw data (2 HIGH, 3 MEDIUM): the median claim was false (recomputed:
0.301, 0.336, 0.269, 0.227 s); the frontmatter claim does not apply (`features.md` does not require
`title` or `p_number`); the failure count, the load claim, the TCP attribution and the rounding were
corrected above.

## Time Box

One 45-minute window plus the analysis. A second window only if the founder asks.

## Deliverable

The findings in this spec, and the follow-up named by the criterion.

## Related

- P1677: the prod side of the same question (offline strip telemetry)
- P1672: isolated TEST lanes, which measured this VM's capacity
- P1607: self-hosted E2E slot lock
