---
status: week
type: task
rank: 71
workstream: infrastructure
created_date: '2026-08-26'
tags: [infrastructure, cost-control, edge-functions, gemini]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1162 — Cap ClarityPledge's Gemini spend, and alert when the key stops answering

## Problem

**Situation:** Three edge functions — `story-guide-chat`, `generate-banner`,
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

**Blast radius:** high and user-facing. A tripped cap takes `/chat` down for every visitor. Banner
generation degrades rather than fails — it already falls back Gemini → Unsplash → gradient
(decisions.md, event banners) — but `/chat` has no equivalent fallback path.

**Reversibility:** high on the cap itself (raise it in the console, service resumes). Medium on a
key rotation, which touches prod secrets in two environments.

**Decision density:** one founder call, below.

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

**1. Cap the spend.** Apply a monthly spend cap to the Gemini API in the project holding the
ClarityPledge key, using the mechanism proven privately (see Related). Amount is a founder call.

The key already lives in a project shared with other Google AI Studio usage. Whether ClarityPledge
gets its own isolated project — the pattern the private mechanism uses, and the only way its budget
is independent of anything else in that project — is part of the founder decision below, because it
requires rotating the prod secret.

**2. Alert on a dead key.** Add a liveness check to `/day`: issue a minimal Gemini request with the
production key and warn if it fails. Distinguish the failure classes rather than reporting one
"broken" — a cap breach, an auth failure, and a network timeout call for different responses.

**Founder decisions, made 2026-08-26:**

- **Cap: 75 USD per month.**
- **Isolate.** ClarityPledge gets its own Google Cloud project, so its budget is independent of
  anything else in the shared AI Studio project. This means the prod secret is rotated — test
  first, verified, then prod, per the Pre-deploy Checklist.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A tripped cap takes `/chat` down with no warning | MITIGATE | The `/day` ping is the warning; spend reporting gives lead time before the ceiling |
| Cap enforcement is not instant — Google documents in-flight requests completing and billing lag | ACCEPT | Overshoot is minutes of burn, bounded further by the existing per-user rate limits |
| Rotating the prod secret breaks all three functions if botched | MITIGATE | `check-edge-function-secrets.sh` gates the deploy; rotate test first, verify, then prod |
| Google's cap feature is Preview and may change | ACCEPT | Same exposure as the private mechanism; the liveness ping catches a silent regression |
| Banner generation silently degrades to gradients when capped | ACCEPT | The fallback chain is deliberate and already shipped; the `/day` warning explains why |
| Spend caps are per project × service — a shared project caps unrelated usage too | MITIGATE | Resolved: ClarityPledge gets its own isolated project (founder decision, 2026-08-26) |

**Non-Goals**

- Do NOT add a second AI provider or a fallback model for `/chat`. Out of scope.
- Do NOT change the existing per-user rate limits — they solve a different problem.
- Do NOT build a spend dashboard. Reporting belongs in `/day`.
- Do NOT rotate the key without updating the prod secret registry in the same change.

## Done-When

- [ ] A monthly spend cap is active on the Gemini API for the project serving ClarityPledge, at 75 USD per month, and the amount is recorded where the monitor can read it
- [ ] A tripped cap produces a generic user-facing message — verified by inspecting what the
      browser receives, with no project id, service name, or Google error text present
- [ ] `/day` pings the production Gemini key and warns on failure, distinguishing cap-breach from
      auth failure from timeout
- [ ] The ping's failure path has been exercised — warning confirmed to fire, not merely assumed
- [ ] `/day` reports spend against the recorded budget for this key
- [ ] All three functions verified working in prod afterwards, and
      `.private/docs/edge-function-secrets.md` updated in the same change
- [ ] Raising the cap restores service — proven, not assumed

## Pre-deploy Checklist

- [ ] If the key is rotated, the new value is set in **test** Supabase secrets, verified, then
      **prod** — never prod first
- [ ] `scripts/check-edge-function-secrets.sh --env prod` passes after any secret change
- [ ] `.private/docs/edge-function-secrets.md` reflects the new key's project and provenance
- [ ] All three consuming functions redeployed and exercised once each against prod

## Alternatives Considered

- **Rely on the existing per-user rate limits alone** — already shipped and does bound abuse per
  account. Rejected as the whole answer: it bounds a user, not the project, so total spend still
  scales with the number of accounts.
- **Alert-only budget, no hard cap** — free and cannot cause an outage. Rejected: an alert does not
  stop spend, which is the requirement.

## Rollback Strategy

Remove the cap in the console; service resumes. If the key was rotated, the previous key can be
restored to Supabase secrets and the functions redeployed — keep the old key alive until the new
one is verified in prod, then revoke it.

## Related

- P1158 — the provisioning and monitoring mechanism this depends on. **This spec should not start
  until that mechanism has been proven on keys that cannot affect production.**
- decisions.md 2026-05-15 and 2026-04-22 (P834) — prod edge-function secret hygiene, the deploy
  guard, and the rule against leaking internal error text to users.
