---
status: week
type: task
rank: 1000068
workstream: infrastructure
created_date: '2026-08-26'
tags: [infrastructure, cost-control, edge-functions, gemini]
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1162 — Cap ClarityPledge's Gemini spend, and alert when the key stops answering

> **Reopened 2026-09-05.** This spec was never worked on. It was closed by `43c46d6f9`
> *"close p1162 (co-located with p803)"* — `git-ops.sh ship` Phase 2b closes every spec whose file
> sits on the shipped branch, and P803's ship swept in four of them. All seven Done-When boxes were
> and are unticked, and [decisions.md](../docs/decisions.md) describes P1162 as *"open, untouched
> by this work"* in an entry written before the auto-close moved the file.
>
> The absence has already cost something. [P1237](done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md)
> went looking for a Gemini spend cap on 2026-09-04, found that both budgets on billing account
> `010089-354936-77CD27` are alert-only and neither is scoped to `generativelanguage.googleapis.com`,
> and recorded the cap as missing — with no idea a shipped spec claimed to have built it.
>
> **Not yet verified:** whether a cap exists on a *different* project or billing account. P1237's
> check enumerated one billing account, and `pp/docs/infra/gcp-spend-caps.md` records that each
> capped key gets its own project. Re-verify across all billing accounts before doing any work —
> `gcloud auth` had expired when this note was written. Tracked by
> [P1250](p1250_colocated_autoclose_closes_specs_nobody_did.md).

## Measured 2026-09-05 — CORRECTED 2026-09-05 (later): prod is fine; the dead key is the TEST key

> **This section previously read "the key IS dead, and prod image generation is failing now."
> That was wrong, and it was wrong in a way worth recording.** The original measurement read the
> **test** Supabase project's `GEMINI_API_KEY` and reported it as prod's. Every downstream claim
> built on it — same-key-two-stores, the 2026-02-25 update date, "prod banner generation is failing
> right now", and the rotation-does-double-duty framing — inherited the error. Re-measured below by
> command, against both Supabase projects and GCP Secret Manager.

**There are two different Gemini keys, not one.** Confirmed by SHA-256 over each stored value
(Supabase's `secrets list` returns the SHA-256 digest of the secret, which is what makes the
comparison possible without ever printing a key). **Key A** and **key B** below are labels, not
values — the digests themselves are deliberately not recorded here, because a fingerprint of a live
credential does not belong in a public repo even when it is not reversible. Reproduce them with
`scripts/check-gemini-prod-key.sh`, which prints a digest prefix to your terminal and to nothing
else:

| store | consumer | identity | length | last updated | live test |
|---|---|---|---|---|---|
| Supabase **prod** `GEMINI_API_KEY` | `generate-banner`, `generate-event-banner` | **key A** | 53 | 2026-08-24 | **HTTP 200** |
| local `.env.local` `GEMINI_API_KEY` | agent / local tooling | **key A** | 53 | — | **HTTP 200** |
| Supabase **test** `GEMINI_API_KEY` | test-env edge functions | **key B** | 39 | 2026-02-25 | **HTTP 400 `API_KEY_INVALID`** |
| GCP Secret Manager `gemini-api-key` (`gen-lang-client-0869694595`) | Cloud Run `transcribe-session` | **key B** | 39 | created 2026-03-22, single version | **HTTP 400 `API_KEY_INVALID`** |

Live test = `GET /v1beta/models` and, for the prod key, the exact call
`generate-banner/index.ts:240` constructs —
`models/gemini-3.1-flash-image-preview:generateContent`. The prod key returned a JPEG.

**So: prod banner generation is NOT failing.** The prod key is alive, and it is the same value as
the local copy — the local key was never a "working key the prod one diverged from"; they are one
key that happens to be stored twice.

**What IS dead is the other key** — the 39-character one, held identically in test Supabase and in
GCP Secret Manager, unrotated since March. Its blast radius today is small: `transcribe-session`
mounts it but never calls the Gemini API (verified — no `generativelanguage` reference anywhere in
`services/`), and test-env banner generation falls back to Unsplash/gradient like prod does. But it
is exactly the key P1237's batch transcription and P1236 would pick up, so it must be rotated before
either lands, not after.

**The real finding is the monitoring gap, and it is worse than "a key died quietly."**
`/day` does ping a production key — `~/.agents/bin/ai-keys --ping-prod`, added 2026-08-27
(`93f68476`). But it pings whatever `GEMINI_API_KEY` is set in the **ambient shell environment** of
the machine running `/day`, which is not any deployed ClarityPledge secret. On this machine that
variable is unset, so the check reports:

```
ERROR: GEMINI_API_KEY is not set — the production key could NOT be checked. This is not a pass.
exit=2
```

It fails safe rather than reporting a false green — that part of its design is right, and `/day`'s
documented reading of `ai_keys_ping_exit=2` is *"NOT checked this run"*. But the practical coverage
of ClarityPledge's keys is **zero**, and has been since the ping shipped. A key died in March and
neither the ping nor any spend check could have said so: a dead key spends nothing.

**Sizing consequence.** The prod key and the local/agent key are the same key in the same project,
`gen-lang-client-0869694595`, whose Gemini gross was **EUR 47.42 in August** — largely local
tooling. So capping that project *would* let ordinary local work take prod down with it. The
project split decided below is what resolves that, and it now has a second reason: prod banners and
local agent work currently share not just a project but a **credential**.

## Problem

**Situation:** Three edge functions — `story-guide-chat` (source deleted by P803 2026-09-02; the deployed copy is retired per that spec — re-scope this cap to the two that remain), `generate-banner`,
`generate-event-banner` — share one Gemini API key. The key is restricted to the Gemini API and is
service-account-backed, but it carries **no spend limit**. It bills against the founder's personal
Google Cloud credit balance.

**Complication:** Nothing bounds what these functions can spend. Per-user rate limits exist for
banner generation (5 per 5 minutes, 20 per day — decisions.md 2026, `ai_rate_limits`), but they cap
*a user*, not *the project*. A traffic spike, a loop, or an abusive account is bounded only by how
many accounts exist. There is also no signal when the key stops working: it would surface as a user
report, not an alert.

**Question:** How do we put a monthly ceiling on this key without turning a spend cap into an
unannounced outage of `/chat`?

> Founder framing, verbatim: *"maybe we need the fourth key for ClarityPledge and also limit it to
> $50 per month"* — and, separately: *"maybe /day should also check if the gemini api key in prod
> works.. like making a short ping.. otherwise warn me"*

## Appetite

**Blast radius:** **lower than this spec originally assessed, and the reason matters.** The
original assessment was *"high and user-facing — a tripped cap takes `/chat` down for every
visitor."* That rested on `story-guide-chat`, which P803 retired on 2026-09-02. The remaining prod
consumers are the two banner functions, and both **degrade rather than fail** — the Gemini →
Unsplash → gradient fallback chain is already shipped (decisions.md, event banners). So a tripped
cap today produces worse-looking banners, not an outage.

Two caveats keep this from being a licence to size the cap tightly. Recovery is asymmetric: lifting
a cap within the same billing month leaves the service uncapped until the 1st unless the amount is
raised first. And P1236, if it lands, puts Gemini in the live path of every room — restoring a
genuinely user-facing blast radius. The two-project split below is what keeps that future
consumer from sharing a fuse with the banners.

**Reversibility:** high on the cap itself (raise it in the console, service resumes). Medium on a
key rotation, which touches prod secrets in two environments.

**Decision density:** two founder calls, both made — see Founder decisions below.

## Invariants

- **A tripped cap must never surface Google's error text to a user.** Prod edge functions already
  route internal failures to generic user-facing strings, with detail kept in `console.error`
  (decisions.md 2026-05-15, P834). A cap breach is an internal failure and must obey the same rule —
  `"Spend cap breached for project…"` naming a project id must not reach a browser.
- **The prod secret registry stays authoritative.** Any key change updates
  `.private/docs/edge-function-secrets.md` in the same step; `check-edge-function-secrets.sh` is the
  deploy-time guard and must still pass (P834).
- **A monitor that cannot run must never read as healthy.** Applies to both the spend check and the
  liveness ping.

## Solution

Two independent pieces. They share a subject and nothing else, and either can ship without the
other.

**1. Cap the spend.** Apply a monthly spend cap to the Gemini API in each ClarityPledge project,
using the mechanism proven privately (see Related).

The key today lives in a project shared with other Google AI Studio usage, so its spend is not
separable from local tooling. Isolation — the pattern the private mechanism uses, and the only way a
budget is independent of anything else in that project — requires rotating the prod secret. Amounts
and the project split are settled below.

**2. Alert on a dead key.** Add a liveness check to `/day`: issue a minimal Gemini request with the
production key and warn if it fails. Distinguish the failure classes rather than reporting one
"broken" — a cap breach, an auth failure, and a network timeout call for different responses. The
cap breach is distinguishable by its text: the 403 names the cap and the service
(`Spend cap breached for project: <num> for service: …`), which a quota refusal does not.

**This ships first** — see Sequencing below.

**Founder decisions, made 2026-08-26, revised 2026-09-05:**

- **Isolate.** ClarityPledge gets its own Google Cloud project(s), so its budget is independent of
  anything else in the shared AI Studio project. This means the prod secret is rotated — test
  first, verified, then prod, per the Pre-deploy Checklist.
- **Two projects, not one — superseding the single 75 USD cap decided 2026-08-26.** A cap is scoped
  to one project x one *service*, and every Gemini consumer here is the same service
  (`generativelanguage.googleapis.com`); Vertex is ruled out by P1236's invariant. So user-facing
  image generation and bursty batch transcription can only be separated by **project**. Sharing one
  means a P1237-style batch run can trip the cap and dark banner generation for every visitor.

  | Project (provisioned 2026-09-05) | Consumers | Spend cap (gross/mo) |
  |---|---|---|
  | `aikey-cp-prod-inte-81368` | `generate-banner`, `generate-event-banner` | **50** |
  | `aikey-cp-batch-81413` | P1237 batch transcription, P1236 if it lands, agent tooling | **75** |

  **Currency: EUR, not USD.** The billing account `010089-354936-77CD27` is denominated in EUR, and
  a cap is set in the billing account's currency — there is no per-budget currency choice. So these
  are EUR 50 / EUR 75, roughly 8% more headroom than the USD figures decided. On a fuse carrying
  ~10x headroom that difference is immaterial, and is recorded rather than silently converted.

- **Each cap is paired with a separate alert-only budget at a much lower amount** (order of 10% of
  the cap). The alert is the sensor; the cap is the fuse. They must not sit near each other: a fuse
  sized just above normal load fires on noise, and mid-month recovery is bad — per the console's own
  dialog, lifting a cap within the same billing month leaves the service **uncapped until the 1st**
  unless the amount is raised first.
- **Set each cap ~5% below intent.** Overshoot = enforcement lag x burn rate, not a fraction of the
  budget (`pp/docs/infra/gcp-spend-caps.md`).

### Why these amounts — and what they are NOT

**Caps count gross cost; credits are explicitly excluded.** P1237 verified credit coverage on
`generativelanguage.googleapis.com` live against the billing export: **99.3% (Jul), 99.4% (Aug),
97.3% (Sep to date)**. So 125 USD of gross ceiling is on the order of **1-3 USD of actual money**.

These numbers are therefore **not a budget**. They are a fuse on the **credit runway**, which is the
scarce resource — and because caps count gross, the fuse bounds credit burn at the same figure.

Headroom at these amounts, against measured unit costs:

- Banner generation — 50 USD is roughly 1,200 `gemini-3.1-flash-image-preview` images per month at
  ~0.04 USD each (**unit price UNVERIFIED — confirm against Google's current pricing before treating
  50 as calibrated**). Existing per-user rate limits are 5 per 5 min / 20 per day.
- Batch transcription — 75 USD is roughly 475 audio-hours at **EUR 0.158 per audio-hour**, measured
  directly by P1237 from a response usage block (25.0 audio tokens/sec at EUR 1.755 per million).

**Sizing input still missing — but for a different reason than first recorded.** Prod's
image-generation gross is not *unmeasurable*; it is *unseparable*. The prod key and the local/agent
key are the same credential in the same project, so the project's EUR 47.42 August gross mixes both
and no query can split them. 50 USD is headroom-derived, not load-derived. The split below is what
makes prod's own figure observable for the first time — provision, run one month, then tighten
against real data rather than leaving a number nobody has checked against traffic.

**Open question for the founder, not blocking this spec:** the remaining GCP credit balance and its
expiry date is the denominator for all of the above. Worth recording in
`pp/docs/infra/gcp-spend-caps.md`.

### Sequencing — part 2 first

Part 2 has no blast radius and closes a gap that is real right now — just not the one first
recorded. Nothing user-facing is broken; what is broken is the **coverage**. `/day`'s `--ping-prod`
reads an ambient `GEMINI_API_KEY` that is unset on this machine, so it has never checked a
ClarityPledge key, and the key that *did* die in March was invisible to every spend check because a
dead key spends nothing.

Part 1 is the piece that can itself cause an outage, and the ping is also what would report a
tripped cap. Ship the ping before the caps.

**Part 2 is a fix to an existing check, not a new one.** `ai-keys --ping-prod` already classifies
the failures this spec asks for — `KEY_PING_OK`, `KEY_CAP_TRIPPED` (matched on the 403's *"Spend cap
breached"* text), `KEY_PING_MODEL_UNAVAILABLE`, `KEY_PING_FAILED`, `KEY_PING_UNKNOWN` — and exits 2
rather than 0 when it cannot run. What it lacks is a way to reach the *deployed* secret. Supabase
never returns a secret's value, only its SHA-256 digest, so the check must: compare the digest of a
locally-held copy against the digest Supabase reports for the deployed secret, and ping the copy
only if they match. A mismatch is itself the finding — it means the local copy is stale and the ping
would have been testing the wrong credential, which is precisely the error this spec was built on.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A tripped cap goes unnoticed | MITIGATE | The `/day` ping is the warning, and it distinguishes a cap breach from an auth failure by the 403's text; spend reporting gives lead time before the ceiling. (`/chat` is no longer a consumer — `story-guide-chat` was retired by P803.) |
| Cap enforcement is not instant — Google documents in-flight requests completing and billing lag | ACCEPT | Overshoot is minutes of burn, bounded further by the existing per-user rate limits |
| Rotating the prod secret breaks both banner functions if botched | MITIGATE | `check-edge-function-secrets.sh` gates the deploy; rotate test first, verify, then prod |
| Google's cap feature is Preview and may change | ACCEPT | Same exposure as the private mechanism; the liveness ping catches a silent regression |
| Banner generation silently degrades to gradients when capped | ACCEPT | The fallback chain is deliberate and already shipped; the `/day` warning explains why |
| Spend caps are per project × service — a shared project caps unrelated usage too | MITIGATE | Resolved: ClarityPledge gets its own isolated projects (founder decision, 2026-08-26) |
| A batch transcription run trips the cap and darks user-facing banner generation | MITIGATE | Resolved: batch and prod-interactive are separate projects with separate caps (founder decision, 2026-09-05) |
| A cap lifted mid-month leaves the service uncapped until the 1st | MITIGATE | Always raise the amount before lifting; `ai-keys --unpause` prints this sequence rather than a bare lift |
| Caps are console-only and invisible to every script — one never set looks identical to one that works | MITIGATE | Both amounts recorded in the `ai-keys` registry; `/day` flags any key whose spend exceeds its recorded budget |

**Non-Goals**

- Do NOT add a second AI provider or a fallback model for any consumer. Out of scope.
- Do NOT change the existing per-user rate limits — they solve a different problem.
- Do NOT build a spend dashboard. Reporting belongs in `/day`.
- Do NOT rotate the key without updating the prod secret registry in the same change.

## Done-When

- [x] Two ClarityPledge projects exist, each with its own Gemini key: prod-interactive (the two
      banner functions) and batch (transcription / agent tooling)
      — `aikey-cp-prod-inte-81368` and `aikey-cp-batch-81413`, provisioned 2026-09-05, both
      billing-linked and both verified answering
- [x] A monthly **spend-cap-enforcement** budget is active on `generativelanguage.googleapis.com`
      in each — created 2026-09-05 and verified by opening each budget's own detail page, not by
      trusting the creation toast:
      - `cp-prod-interactive cap 50` — **Spend cap configured**, €50.00, *Service "Gemini API" in
        Project "ai-key cp-prod-interactive"*
      - `cp-batch cap 75` — **Spend cap configured**, €75.00, *Service "Gemini API" in Project
        "ai-key cp-batch"*
- [x] An alert-only budget exists alongside each cap at roughly 10% of the cap amount
      — **superseded, and the separate budget is not needed.** A spend-cap budget carries its own
      notification thresholds, defaulted to 50% / 80% / 100% (€25 / €40 / €50 and
      €37.50 / €60 / €75), emailing billing admins and project owners. That is the sensor this
      spec asked for, already at a lower number than the fuse. A second alert-only budget would
      duplicate it.
- [x] Both amounts are recorded in the `ai-keys` registry where `/day` can read them
      — `budget_eur: 50` / `budget_eur: 75`, plus `--mark-cap-set` on each. Note the tool's own
      wording: *"This is a claim to be falsified by `--report`, not a verified fact."* The registry
      records that someone said a cap exists; the console detail pages above are the actual
      evidence.
- [ ] A tripped cap produces a generic user-facing message — verified by inspecting what the
      browser receives, with no project id, service name, or Google error text present
- [x] `/day` pings the **deployed** ClarityPledge Gemini key(s) — not an ambient environment
      variable — and warns on failure, distinguishing cap-breach from auth failure from timeout
      — `scripts/check-gemini-prod-key.sh`, wired into `day-cp.md` as `=== GEMINI PROD KEY (P1162) ===`
- [x] The check verifies the locally-held copy still matches the deployed secret's SHA-256 digest
      before pinging it, and reports a mismatch as a finding rather than pinging the wrong key
      — exercised: a wrong local key produces `KEY_DIGEST_MISMATCH`, exit 1, and no ping is sent
- [ ] The dead 39-character key (test Supabase + GCP Secret Manager `gemini-api-key`) is rotated or
      explicitly retired, and `transcribe-session` re-verified afterwards
- [x] The ping's failure path has been exercised — warning confirmed to fire, not merely assumed.
      Evidence, all real non-zero exits:
      - digest mismatch → `KEY_DIGEST_MISMATCH`, **exit 1**
      - no local key reachable → `GEMINI-PROD-KEY-CHECK-DID-NOT-RUN`, **exit 2** (explicitly not a pass)
      - the genuinely dead 39-char key, classified against **real Google output** rather than a
        fixture → `KEY_PING_FAILED — API_KEY_INVALID`, **exit 1**
      - the self-test proven capable of failing: mutating one expected verdict makes it report
        `FAIL dead key` and **exit 1**
      - digest matches **and** the key is dead (the end-to-end path, via a stubbed secrets
        listing) → `KEY_PING_FAILED`, **exit 1**
      - Supabase CLI emits text instead of JSON → **exit 2**, "did not run"
      - duplicate `GEMINI_API_KEY` rows → **exit 2**, "did not run"
      - a sibling secret named `GEMINI_API_KEY_OLD` does **not** confuse the lookup (structural
        JSON parse, not `grep`)
      - **Not exercised:** `KEY_CAP_TRIPPED` is matched only against a synthetic 403 body, because
        no cap exists yet to trip. Re-verify against a real refusal once the caps are created.

### Adversarial review, 2026-09-05

Codex reviewed the committed script cold and returned **DO NOT SHIP** with three findings. Two —
the API key on curl's command line, and a predictable shared `/tmp` response file — had been found
and fixed independently in the same pass; the third was new:

- **Supabase CLI output format.** The check parsed JSON while the CLI's own `--help` documents
  `text` as the default. Verified: the installed CLI emits JSON without the flag, so Codex's stated
  failure does not reproduce, and the worst case was exit 2 ("could not run") rather than a false
  green. Fixed anyway — the flag is now passed explicitly and the response parsed structurally,
  because an undocumented default that a CLI upgrade can flip is a monitor that silently stops
  monitoring.

The argv fix was proven with a control that first had to be made to work: a probe against a
connection-refused port and another against the test harness's own command line both reported "no
leak" for the known-bad form as well as the fixed one. Only a blackhole-IP target held the process
open long enough to show the key in `curl`'s argv for the old form and nothing for the new one.

**Coverage: 1 of 2 external reviewers reported.** The second (Gemini, via
`~/.agents/bin/delegate-gemini`) was **refused by the delegation gate** — the payload matched its
private-path pattern on `.env`. Policy is to do the work inline rather than reshape a payload to
pass a security scan, so that lens was run inline instead; it produced the argv finding and one
hypothesis (that the liveness ping bills for a generated image) that measurement **refuted** —
the ping returns `totalTokenCount: 1` and produces no image bytes.
- [ ] `/day` reports spend against the recorded budget for **each** of the two keys
- [ ] Both banner functions verified working in prod afterwards (`story-guide-chat` is retired —
      see Problem), and `.private/docs/edge-function-secrets.md` updated in the same change
- [ ] Raising the cap restores service — proven, not assumed

## Execution steps — part 1 (founder; the agent cannot do these)

Spend caps are **console-only**: `gcloud billing budgets` has no cap flag on any track, the
Budgets API discovery documents contain zero hits, and a created cap does not appear in
`budgets list`. Step 1 (provisioning) is scriptable and is now done; steps 2-4 are console-only
and step 5 touches prod secrets, so both remain founder actions. Billing account
`010089-354936-77CD27` is the only open one.

**Step 1 is DONE (2026-09-05).** Both keys are provisioned, each in its own project, each
restricted to `generativelanguage.googleapis.com`, both billing-linked to `010089-354936-77CD27`,
both verified answering (`models.list` -> HTTP 200). Key strings are recoverable at any time with
`~/.agents/bin/ai-keys --key-string --name <name>` — they do not need to be stored anywhere.

> **Steps 2-4 are now DONE too (2026-09-05).** Both caps are live and verified `Configured`, and
> both amounts are in the registry. The keys are no longer unbounded. What remains is step 5
> onward: moving the prod banner secret onto the new key, retiring the dead 39-character key, and
> exercising a real cap trip on the batch project.

2. For **each** project, at
   `https://console.cloud.google.com/billing/010089-354936-77CD27/budgets` → **Create budget** →
   **Spend cap enforcement** (*not* Alerts only) → scope to that one project and the Gemini API
   (`generativelanguage.googleapis.com`) → amount **50** / **75**, set ~5% below intent.
   Stopping after step 1 of the wizard silently creates nothing.
3. Create a second, **alert-only** budget per project at roughly a tenth of the cap.
4. `~/.agents/bin/ai-keys --mark-cap-set --name <name>` for each — the registry is the only place
   a cap's existence is recorded, because nothing can read one back.
5. Move the prod banner secret onto `cp-prod-interactive`: **test Supabase first**, verify, then
   prod. Update `.private/docs/edge-function-secrets.md` in the same change and re-run
   `scripts/check-edge-function-secrets.sh --env prod`.
6. Re-run `./scripts/check-gemini-prod-key.sh` — it must print `digest OK` against the **new**
   deployed secret. A `KEY_DIGEST_MISMATCH` here means step 5 updated one store and not the other.
7. Rotate or retire the dead 39-character key (test Supabase + GCP Secret Manager
   `gemini-api-key`), and re-verify `transcribe-session` afterwards.
8. Once a cap exists, exercise a real trip on the **batch** project (never prod-interactive) and
   confirm the `KEY_CAP_TRIPPED` branch fires on a genuine 403 — the one classifier branch still
   verified only against a synthetic body.

## Pre-deploy Checklist

- [ ] If the key is rotated, the new value is set in **test** Supabase secrets, verified, then
      **prod** — never prod first
- [ ] `scripts/check-edge-function-secrets.sh --env prod` passes after any secret change
- [ ] `.private/docs/edge-function-secrets.md` reflects the new key's project and provenance
- [ ] Both consuming banner functions redeployed and exercised once each against prod

## Alternatives Considered

- **Rely on the existing per-user rate limits alone** — already shipped and does bound abuse per
  account. Rejected as the whole answer: it bounds a user, not the project, so total spend still
  scales with the number of accounts.
- **Alert-only budget, no hard cap** — free and cannot cause an outage. Rejected *as the whole
  answer*: an alert does not stop spend, which is the requirement. Not rejected as a component —
  the design above runs an alert-only budget alongside each cap, at roughly a tenth of it, as the
  sensor that fires long before the fuse.
- **One ClarityPledge project with a single 75 USD cap** — the 2026-08-26 decision. Rejected
  2026-09-05: a cap covers one project x one service, and batch transcription and user-facing image
  generation are the same service, so one project makes a background batch run capable of darkening
  the banners. Separating them costs one extra project and one extra key.
- **Size the caps against real prod load rather than headroom** — the honest sizing. Not available:
  the prod key does not authenticate, so prod Gemini spend is currently zero and there is nothing to
  size against. Deferred, not rejected — tighten after one month of real data.

## Rollback Strategy

**Not "remove the cap".** Per the console's own confirm dialog, a cap enforced and lifted within the
same billing month **does not trigger again for the rest of the month unless the amount is
increased** — so a bare lift leaves the key uncapped until the 1st. To restore service: raise the
amount first, then lift. Services can take up to an hour to fully resume. If you will not raise the
amount, leave the key paused. `~/.agents/bin/ai-keys --unpause --name <key>` prints this sequence.

If the key was rotated, the previous key can be restored to Supabase secrets and the functions
redeployed — keep the old key alive until the new one is verified in prod, then revoke it.

## Related

- P1158 — the provisioning and monitoring mechanism this depends on. **This spec should not start
  until that mechanism has been proven on keys that cannot affect production.**
- decisions.md 2026-05-15 and 2026-04-22 (P834) — prod edge-function secret hygiene, the deploy
  guard, and the rule against leaking internal error text to users.
