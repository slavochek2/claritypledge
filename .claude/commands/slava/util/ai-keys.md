---
name: ai-keys
description: "Provision budget-capped Gemini keys, monitor their spend, and revoke them"
when_to_use: "When issuing a Gemini key to a person or an agent, checking what everyone has spent, changing someone's budget, revoking a key, or restoring access after a spend cap has tripped. Triggered by /ai-keys, 'issue a key for X', 'what has everyone spent', 'change X's budget', 'revoke X', 'X hit their cap'."
version: 1.0.0
---

# /ai-keys

Issue, monitor, and revoke budget-capped Gemini keys. One project per key, because
Google's spend-cap granularity is one project times one service — that is the only
way two holders get independent budgets.

Everything runs through `scripts/ai-keys.sh`. Never hand-run gcloud for this: the
registry is the inventory, and a key issued outside the script is invisible to it
until the drift check catches it.

## The one thing to understand before using this

**Google exposes no API for spend caps.** Not to create one, not to read one back.
The cap is a console click, and a cap that was never set looks identical, to every
script, to a cap that is working.

So the monitor does not display caps. It *infers their absence*: spend climbing past
the recorded budget means the cap was never set, was deleted, or is not firing. That
inference is the whole safety story. Treat `WARN_CAP_ABSENT` as an incident.

Enforcement lags about 4 to 5 minutes once a cap is crossed, so overshoot is lag times
burn rate — cents for a person, a few dollars for a hard-looping agent. Set caps about
5 percent below the true ceiling.

## Routing

| The founder says | Run |
|---|---|
| issue a key for X at N a month | `--issue --name X --holder WHO --budget N` |
| what has everyone spent | collect spend, then `--report` (see below) |
| change X's budget to N | `--set-budget --name X --budget N` |
| I set the cap | `--mark-cap-set --name X` |
| revoke X | `--revoke --name X` |
| X hit their cap | `--unpause --name X` |
| where do I set the cap again | `--cap-url --name X` |

Always dry-run an issue or a revoke first (`--dry-run`) and show the founder the plan
before running it live. Issuing creates a real project and a real key; revoking
destroys a credential someone may be actively using.

## Monitoring

```bash
scripts/ai-keys.sh --collect-spend > /tmp/ai-keys-spend.tsv
gcloud projects list --format='value(projectId)' > /tmp/ai-keys-projects.txt
scripts/ai-keys.sh --report \
  --spend-tsv /tmp/ai-keys-spend.tsv \
  --projects-file /tmp/ai-keys-projects.txt
```

Exit 0 means a clean estate. Exit 1 means findings. Exit 2 means the monitor could not
run — which is not the same as a clean estate, and must never be reported as one.

**Findings and what each means:**

- `WARN_CAP_ABSENT` — spend passed the recorded budget. The cap is not protecting this
  key. Treat as an incident: check the console, and consider revoking until it is fixed.
- `NO_BILLING_DATA` — no billing rows for this project. Either the export has not
  backfilled yet (up to ~24h after enabling) or something is wrong with the export.
  This is an **unmonitored** key, not an unused one. Never report it as zero spend.
- `WARN_CAP_UNRECORDED` — nobody has claimed a cap was ever set here. Set it, then
  `--mark-cap-set`.
- `DRIFT_REGISTRY_ONLY` — a registry row whose project no longer exists.
- `DRIFT_PROJECT_ONLY` — a project the registry does not know about. Two shapes:
  one billing Vertex (a key issued outside this skill), and one carrying
  `orphan=likely-partial-provision` — a project left behind when issuing failed
  part-way. The orphan has no billing linked, so it appears in **no** spend export;
  it is visible only via `--projects-file`. Always pass that flag, or orphans are
  undetectable.

## Setup, once

`--collect-spend` reads the BigQuery billing export. Enabling that export is
console-only (there is no API for it either), configured at the **billing account**
level, where it then covers every project including ones created later. Set
`AI_KEYS_BILLING_DATASET` to the export table. Until the first rows land, every key
reports `NO_BILLING_DATA` — which is correct, not a bug.

## What issuing actually does

Creates an isolated project, links billing, enables `aiplatform` and `orgpolicy`, then
binds the service account to a **custom role carrying exactly one permission**,
`aiplatform.endpoints.predict`. Not `roles/aiplatform.user`, which carries 446.

Isolation rests on that IAM binding, not on the enabled-service list — Google
auto-enables about 22 dependent services including Cloud Storage and BigQuery, and
that is fine, because the identity cannot touch them. Measured on a live project: VM
creation refused, bucket listing refused despite Storage being enabled, enabling a new
API refused, partner models (Claude, Grok) unreachable while Gemini returned 200 in
the same run.

The registry row is written **before** the key is minted, and the write is checked.
A key that exists without a registry row would be invisible to the monitor; a row
without a key is merely untidy and the drift check catches it. If issuing fails after
the project exists, the script prints the project id and the exact teardown command —
run it, or you have created an orphan.

**One control is not active as shipped:** the Model Garden org-policy allowlist. Its
constraint name could not be verified against a live Organization Policy API, and
inventing one would apply nothing while reporting success. Issuing therefore prints
`MODEL_ALLOWLIST_NOT_APPLIED`. Partner models are expected to be unreachable through
the predict-only IAM role alone — that is the measured primary control — but treat
the second layer as absent until the negative test confirms otherwise. Set
`AI_KEYS_MODEL_CONSTRAINT` once the name is verified to activate it.

The key JSON prints to stdout once. Hand it over out of band. It is never written to a
repo path, `.private/` included.

## Registry

`.private/ai-keys/registry.json`, gitignored. The script is its only writer — do not
hand-edit it, or the drift check starts reporting on your edits instead of on reality.

Changing a budget deliberately clears `cap_set_at`, so the monitor keeps flagging the
key until the founder confirms the cap was actually moved to match.

## Tests

`scripts/ai-keys.test.sh` — hermetic, no network. Exercises cap-absent detection,
no-data-versus-zero, both drift directions, cent-level budget boundaries, and the
exit-2 environment errors. Run it after any change to the script.
