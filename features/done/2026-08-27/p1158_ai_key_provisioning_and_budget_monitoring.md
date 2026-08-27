---
status: all-done
type: task
rank: 69
workstream: infrastructure
created_date: '2026-08-26'
tags: [infrastructure, gcp, cost-control, skills]
delivery_stage: dev
completed_at: '2026-08-27'
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
---

# P1158 (partially superseded) — `/ai-keys`: provision budget-capped Gemini keys and monitor their spend

> **Closed 2026-08-27, partially superseded.** The script, registry, monitor and 60-case test suite
> shipped and work. The key type in this spec is **wrong**: it mints Vertex service-account JSON,
> and every real consumer takes a plain API key string. The corrected work — auth keys restricted
> to the Gemini API, plus sharing and `/day` monitoring — is tracked privately, and ClarityPledge's
> own capped key is cp **P1162**. Everything this spec established about caps, IAM isolation and the
> monitor's cap-absent inference carries forward unchanged.

## Problem

**Situation:** The founder holds a large Google Cloud credit balance and wants to share Gemini
access — with a person, and with autonomous agents that will hold their own keys. Google offers no
per-API-key dollar limit. Its cap granularity is *one project × one service*, so every key that
needs an independent budget needs its own isolated project.

**Complication:** Provisioning that by hand is six commands plus a browser click, and the resulting
estate is invisible: there is no place that records which keys exist, who holds them, what they were
budgeted, or what they have spent. Worse, **spend-cap budgets are not exposed by any Google API** —
verified 2026-08-24 against `gcloud` 581 (GA/alpha/beta) and the `billingbudgets` v1/v1beta1 and
`cloudbilling` v1/v1beta discovery documents, all of which contain zero references to spend caps.
A cap that was never set is therefore indistinguishable, to any script, from a cap that is working.

**Question:** How do we make issuing, adjusting, revoking and monitoring budget-capped keys a
one-sentence operation, given that the cap itself cannot be created or read back programmatically?

## Appetite

**Blast radius:** medium and outward-facing. Wrong provisioning hands a third party either broader
Google access than intended, or an uncapped key against the founder's credit balance. Contained by
the fact that each key lives in its own empty project.

**Reversibility:** high. Every artifact is disposable — revoke the key, delete the project. No data
lives in these projects by construction.

**Decision density:** low. The architecture was settled empirically before this spec (see Evidence).
The one open technical question — the spend data source — was resolved on 2026-08-26 by measurement
(see Resolved Questions).

## Solution

A single skill, `/ai-keys`, over one script, plus a private registry file.

**Verbs** (natural language routes to them; the founder never memorises flags):

| Intent | Effect |
|---|---|
| issue a key for X at N/month | create project, restrict it, mint key, write registry row, print the cap link |
| what has everyone spent | per-key table: spent against recorded budget, plus reconciliation warnings |
| change X's budget to N | update the registry, print the cap link — the cap edit itself is manual |
| revoke X | delete the service-account key, mark the row revoked |
| unpause X | print the cap link and what to set — for a cap that has tripped |

**Provisioning sequence** (all automated except where noted):

1. Create a project under the org, link billing.
2. Enable `aiplatform.googleapis.com`. **Note:** Google auto-enables ~22 dependent services
   including Cloud Storage and BigQuery; the project-isolation story rests on IAM, not on the
   enabled-service list (see Evidence).
3. Create a service account bound to a **custom role carrying only `aiplatform.endpoints.predict`**
   — not `roles/aiplatform.user`, which carries 446 permissions where one is needed.
4. Mint a JSON key; hand it to the holder; never store it in the repo.
5. Enable `orgpolicy.googleapis.com`, then apply the Model Garden org-policy allowlist so only
   Gemini publishers are callable (see Resolved Questions 2).
6. Write the registry row.
7. **Manual:** print the console URL and the exact values; the founder sets the cap.

**Registry** — `.private/ai-keys/registry.json`, one row per key:
`{name, holder, project_id, service_account, budget_eur, cap_set_at, created, status}`.
The skill is the only writer. `name` is a short human handle chosen by the operator.

**Monitoring** — an alias/script that reads per-project spend from the BigQuery billing export
(see Resolved Questions 1) and prints spend against recorded budget per key, and is callable
from `/day` unchanged. Because the cap cannot be read back, the monitor's job is not to display the
cap but to **detect its absence**: any key whose observed spend exceeds its recorded budget means
the cap was never set, was deleted, or is not firing. That inference is the compensating control for
the missing API.

Reconciliation runs in both directions: a project in the registry that no longer exists, and a
Gemini-billing project that is not in the registry, are both reported.

## Evidence (measured, not assumed — 2026-08-24/25)

Established on a live throwaway project before this spec was written:

- **The cap fires, and names itself.** Blocking arrived as
  `403 — Spend cap breached for project: … for service: aiplatform.googleapis.com`.
- **Enforcement lag is ~4–5 minutes**, measured by two independent watchers (4 min and 5 min) from
  the moment the cap was crossed. Overshoot is therefore *lag × burn rate*, not a multiple of the
  budget — a normal user overshoots by cents, a hard-looping agent by a few dollars.
- **Credits do not hide spend.** Google's docs: "The cost calculations for spend caps are based on
  gross costs and don't include savings and credits." Credit-funded usage still accrues.
- **The lag held during a Google billing-reporting incident** that was active throughout the test,
  indicating enforcement runs off an estimate stream independent of the degraded reporting path.
- **Lockdown holds via IAM, not via service enablement.** With the key's identity: VM creation
  refused, bucket listing refused *despite Cloud Storage being enabled*, and enabling a new API
  refused. The role carries zero `serviceusage` permissions — no self-escalation.
- **Partner models are unreachable and cannot be self-enabled.** Claude (4 endpoint variants) and
  Grok returned 404 while Gemini returned 200 in the same run — a control that failed on the first
  attempt (IAM propagation, ~90s) and was re-run until the control passed. The role holds only
  `aiplatform.consents.get`: it can read whether consent exists, never grant it.

## Risks / Non-Goals

**Risks**

| Risk | Mitigation |
|---|---|
| Cap silently absent — unverifiable by API | Monitor flags spend > recorded budget; skill prints the link and records `cap_set_at` as an explicit claim to be falsified |
| Overshoot on a runaway agent | Recommend budgets set ~5% below intent; document that overshoot ≈ 5 min of burn |
| Registry drifts from Google | Two-way reconciliation in the monitor |
| Key material leaks into the public repo | Registry lives in `.private/`; key JSON is emitted to stdout and never written to a repo path |
| Spend cap is a Preview feature and may change | Isolate the manual step behind one function so a future API drops in cleanly |
| Estate sprawl — one project per key | Registry is the inventory; `revoke` deletes the project |
| Billing export not yet backfilled reads as zero spend | Monitor prints `no billing data yet`, never `EUR 0.00`, for a key with no rows (Resolved Questions 1) |

**Non-Goals**

- Do NOT build a Kanban view or any web UI. The registry file plus a printed table is the interface.
- Do NOT attempt browser automation for the cap. A 10-second click beats a selector that breaks silently.
- Do NOT add a third-party gateway (Cloudflare, LiteLLM, OpenRouter). Evaluated and rejected — see Alternatives.
- Do NOT store service-account key JSON anywhere in the repository, `.private/` included.
- Do NOT use `roles/aiplatform.user`. Custom role, one permission.
- Do NOT widen scope to non-Gemini providers.
- Do NOT depend on `gcloud alpha` or `gcloud beta` components — neither is installed (Resolved Questions 2).

## Done-When

- [ ] `/ai-keys` issues a key end-to-end and prints the cap link with exact values to enter
- [ ] Issued keys use a custom role carrying only `aiplatform.endpoints.predict` — verified by describing the role
- [ ] Negative tests pass for a freshly issued key: VM creation, bucket listing, API enablement, and a partner-model call are all refused, **with a Gemini call succeeding in the same run as the control**
- [ ] Registry row written on issue and updated on budget change and revoke
- [x] Monitor prints spend against recorded budget for every live key
- [x] Monitor emits a warning when spend exceeds recorded budget (cap-absent detection), proven by simulating that condition
- [x] Monitor distinguishes "no billing data yet" from "zero spend" — proven with a key that has no export rows
- [x] Monitor reports both drift directions (registry-without-project, project-without-registry)
- [ ] `revoke` removes access — proven by a call failing after it
- [ ] Two keys provisioned with independent caps, and one hitting its cap does not affect the other
- [ ] Raising a tripped cap restores access — the monthly unpause path, proven end-to-end
- [ ] Adversarial review completed and findings resolved or consciously accepted
- [x] No secret, billing-account ID, or absolute user path committed to the public repo

## Build Evidence (2026-08-26)

`scripts/ai-keys.sh` + `scripts/ai-keys.test.sh` + `/ai-keys`. Suite: **60/60 hermetic
cases**, no network. Mutation-checked twice — disabling the cap-absent comparison fails
5 cases, removing orphan detection fails 3 — so the inferences the design rests on are
bound by tests rather than passing vacuously (epistemic gate 7).

**Closed above.** Remaining items need live provisioning and the founder's console
clicks, and cannot be closed from a terminal.

**Two carried gaps, stated rather than hidden:**

1. **Model Garden org-policy allowlist is NOT applied.** The constraint name could not
   be verified against a live Organization Policy API (not enabled; enabling it was
   out of scope for this run). Rather than invent a name that would apply nothing while
   reporting success, `--issue` prints `MODEL_ALLOWLIST_NOT_APPLIED`. The measured
   primary control — partner models unreachable through the predict-only IAM role — is
   unaffected, but the second layer is absent until the constraint name is verified and
   `AI_KEYS_MODEL_CONSTRAINT` is set. The Done-When negative test remains the check
   that matters here.
2. **The `--issue` live path has never run.** Only its dry-run is under test. Every
   registry mutation it performs is covered hermetically, but the gcloud sequence
   itself is unexercised, and no green count bounds it (gate 7b).

**Review:** one code reviewer, 1 of 1 reported: 5 HIGH, 3 MEDIUM. Each claim was
re-verified by command before acting (gate 9). Seven fixed in `c259a147`; one rejected
with evidence — the `.agents/skills/` copy is generated by `scripts/sync-agent-skills.sh`
(P1151), the repo's own sync mechanism, not a hand-maintained duplicate. The worst
finding was real and load-bearing: a `--budget "50 EUR"` typo fell through `jq tonumber`,
emptied the registry row, and let provisioning mint a **real key with no registry entry**
— invisible to the very monitor that exists to inventory it. Registry writes now happen
before the key mint and are checked.

## Alternatives Considered

- **Cloudflare AI Gateway** — free on the BYOK path and its spend limits do hard-block with a 429.
  Rejected: budgets attach to request metadata rather than to issued keys, and Cloudflare's own docs
  state AI Gateway tokens cannot be scoped to a single gateway, recommending separate accounts for
  tenant isolation. Weaker isolation than the Google-native path, plus a vendor in the request path.
- **Self-hosted gateway (LiteLLM)** — genuine per-key dollar budgets with hard denial. Rejected for
  now: introduces a process that must stay alive, whose outage takes down every key at once.
- **Plain key with alert-only budget** — free and trivial. Rejected: alerts do not stop spend, which
  is the entire requirement, and it does not scale to agent-held keys.
- **Browser automation for the cap** — rejected as a Non-Goal above.

## Rollback Strategy

Delete the skill and script; the registry is inert data. Provisioned projects are unaffected and
remain individually deletable. Nothing in this work modifies existing repo behaviour, so rollback is
`git revert` plus optional `gcloud projects delete` per estate entry.

## Resolved Questions

1. **Spend data source — RESOLVED 2026-08-26: BigQuery billing export, configured once at the
   billing-account level.** Measured against the throwaway project that served real Gemini traffic
   on 2026-08-24:
   - Cloud Monitoring **token-count metrics carry no data**. Descriptors exist
     (`aiplatform.googleapis.com/generate_content_input_tokens_per_minute_per_base_model` and the
     `eu_multi_region_*` family) but `timeSeries` returns empty over the traffic window. Descriptor
     existence is not data existence — descriptors are published for every project regardless of use.
   - **The probe is not blind**: the identical `timeSeries` call against
     `serviceruntime.googleapis.com/api/request_count` on the same project over the same window
     returns populated points, carrying a `GenerateContent` method label and a `credential_id` label
     naming the calling service account. `quota/rate/net_usage` likewise returns only
     `online_prediction_requests` — request counts, never tokens.
   - Therefore the token-metric option is **falsified**: the input it needs does not exist. Request
     counts alone are a poor cost estimator, since cost tracks tokens, not calls.
   - The billing-export option is adopted. Its latency does not harm the monitor's actual job:
     cap-absence shows up as spend that keeps climbing past the recorded budget, which is still
     unmistakable a few hours later. No real-time surface exists on any path, so nothing is given up.
   - **Bonus:** the export is configured per *billing account* and covers every linked project, with
     `project.id` on each row. One setup covers all present and future keys, and supplies the
     project-without-registry direction of reconciliation for free.
   - **Manual step:** enabling billing export is console-only — there is no API for it, same class as
     the spend-cap click. One-time setup, not per-key.
   - **First rows can lag ~24h after enabling.** The monitor must report `no billing data yet` for a
     key with no rows, never `EUR 0.00` — an untracked key must not read as an unused one.

2. **Org Policy API enablement — RESOLVED 2026-08-26.** Confirmed not enabled on the current quota
   project. `gcloud org-policies` is GA — no `alpha`/`beta` component required, and neither is
   installed on this machine, so the script must not depend on them. Enabling
   `orgpolicy.googleapis.com` is an explicit step in the provisioning sequence, not an assumption.

## Open Questions

None blocking `/dev`.

## Related

- `docs/decisions.md` — to be written by `/kdd` after this ships.
