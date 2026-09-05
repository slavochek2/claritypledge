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

## Measured 2026-09-05 — the key IS dead, and prod image generation is failing now

Both halves of this spec stopped being hypothetical on the same day, found incidentally while
sizing a Gemini cap for [P1236](p1236_server_side_live_transcription_for_rooms.md).

**One key, two stores, same value.** The GCP Secret Manager secret `gemini-api-key` (mounted on
Cloud Run `transcribe-session`) and the Supabase secret `GEMINI_API_KEY` (read by
`generate-banner` and `generate-event-banner`) are **the same key** — confirmed by SHA-256, not by
assumption. Supabase's copy was last updated 2026-02-25.

**That key no longer authenticates.** Tested against the exact call `generate-banner/index.ts:240`
constructs — `models/gemini-3.1-flash-image-preview:generateContent?key=…`:

| key | result |
|---|---|
| the deployed prod key | **HTTP 400, `API_KEY_INVALID`, "API key not valid"** |
| the key in local `.env.local` | HTTP 200, returns an image |

Not a restriction and not a quota: the same 400 comes back from `models.list`, from the `?key=`
form and the `x-goog-api-key` header form, and from the transcription endpoint. **Prod banner
generation is failing right now.** Since when is unknown — which is precisely the gap this spec's
part 2 was filed to close, in the founder's own words: *"maybe /day should also check if the gemini
api key in prod [works]"*. It died, and nothing said so.

**Sizing consequence — $50 does not fit the current project.** A spend cap is scoped to one
**project x one service**, never to one key. The prod key and the local/agent key both bill to
`gen-lang-client-0869694595`, whose Gemini gross was **€47.42 in August** — largely local tooling,
not prod. Cap that project at $50 and ordinary local work trips it and takes prod down with it,
which is exactly the user-facing blast radius the Appetite section warns about.

So the cap and the fourth key are **not two options, they are one sequence**: provision the
ClarityPledge key in its **own project** (pp P45's project-per-key rule is what makes budgets
independent), move both stores onto it, then cap that project. Isolated, prod's own Gemini spend is
small and there is real headroom. **Amounts and the project split are settled in Founder decisions
below (2026-09-05): two projects, 50 USD prod-interactive and 75 USD batch** — the single-project
framing in this paragraph is what that decision supersedes.

**Rotation is now doing double duty** — it fixes a dead key *and* creates the isolation the cap
needs. It touches prod secrets in two places (GCP Secret Manager and Supabase), so it stays a
founder-approved action, and the prod secret registry must be updated with it per the Invariants.

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

  | Project | Consumers | Spend cap (gross/mo) |
  |---|---|---|
  | ClarityPledge prod-interactive | `generate-banner`, `generate-event-banner` | **50 USD** |
  | ClarityPledge batch | P1237 batch transcription, P1236 if it lands, agent tooling | **75 USD** |

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

**Sizing input still missing:** prod's actual image-generation gross is unmeasurable today, because
the prod key does not authenticate (measured above) so recent prod Gemini spend is zero. The
project's EUR 47.42 August gross was largely local tooling. 50 USD is headroom-derived, not
load-derived. Fix the key, let one month run, then tighten against real data rather than leaving a
number nobody has checked against traffic.

**Open question for the founder, not blocking this spec:** the remaining GCP credit balance and its
expiry date is the denominator for all of the above. Worth recording in
`pp/docs/infra/gcp-spend-caps.md`.

### Sequencing — part 2 first

Part 2 (the `/day` liveness ping) has no blast radius and closes a gap that is costing something
*right now*: the prod key is dead and nothing said so. Part 1 is the piece that can itself cause an
outage, and the ping is also what would report a tripped cap. Ship the ping before the caps.

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

- [ ] Two ClarityPledge projects exist, each with its own Gemini key: prod-interactive (the two
      banner functions) and batch (transcription / agent tooling)
- [ ] A monthly **spend-cap-enforcement** budget is active on `generativelanguage.googleapis.com`
      in each — **50 USD** prod-interactive, **75 USD** batch — each verified as `Configured` in the
      budget list, not merely created
- [ ] An alert-only budget exists alongside each cap at roughly 10% of the cap amount
- [ ] Both amounts are recorded in the `ai-keys` registry where `/day` can read them
- [ ] A tripped cap produces a generic user-facing message — verified by inspecting what the
      browser receives, with no project id, service name, or Google error text present
- [ ] `/day` pings the production Gemini key and warns on failure, distinguishing cap-breach from
      auth failure from timeout
- [ ] The ping's failure path has been exercised — warning confirmed to fire, not merely assumed
- [ ] `/day` reports spend against the recorded budget for **each** of the two keys
- [ ] Both banner functions verified working in prod afterwards (`story-guide-chat` is retired —
      see Problem), and `.private/docs/edge-function-secrets.md` updated in the same change
- [ ] Raising the cap restores service — proven, not assumed

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
