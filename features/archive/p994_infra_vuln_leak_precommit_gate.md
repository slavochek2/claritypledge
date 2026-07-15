---
status: rejected
type: task
rank: 1000947.0
created_date: '2026-07-15'
tags: [infrastructure, security, pre-commit, tooling]
pipeline_ran: [create-spec]
---

# P994: Pre-commit gate for infra-vulnerability-mechanics leaking into public docs

## REJECTED 2026-07-15 — premise falsified

The identifiers this spec proposes to denylist (GCP project ID/number, workload-identity-provider
path, `*.iam.gserviceaccount.com` SA email) are **already on the public remote, by design**:
`google-github-actions/auth` requires them as plaintext workflow inputs
(`.github/workflows/db-backup.yml`), and a shipped public spec (`features/done/24_mar_26/p495_*`)
carries a literal project ID. They are *identifiers, not secrets*.

This makes the spec's own Done-When #1 (block SA-email patterns in `features/`+`docs/`) and
Done-When #2 (no false positives on the existing corpus) **mutually unsatisfiable** — p495 lives in
`features/done/`. Combined with Non-Goal "do NOT scan git history", the gate would not address what
is already published, while blocking legitimate infra config.

It also targets the wrong half of the triggering incident: the risk was the **vulnerability
narrative** (live exploit path + plaintext secret on a named prod service), which this spec defers
as an "optional second signal". No salvageable core: `gitleaks protect --staged` already scans the
full staged diff including `features/`, and `audit-privacy.sh` is server-enforced via
`privacy-scan.yml` (the real boundary — local hooks are bypassable).

**Residual control:** the CLAUDE.md checklist line added 2026-07-15, correctly scoped to
vulnerability mechanics rather than identifiers. See `docs/decisions.md` 2026-07-15 [security].

## Problem

**Situation:** This repo has a real mechanical secret-scanning gate (`scripts/pre-commit-checks.sh` → gitleaks for code, plus a grep backstop for config/root files, plus a dedicated check for unrecognized personal email addresses in feature specs). CLAUDE.md also documents a checklist an agent should apply before creating any public-repo file (personal identifiers, private business details, and — as of today — "unpatched security/infra vulnerability mechanics").

**Complication:** That last item is currently *soft guidance only* — a line an agent is supposed to remember to apply, not a mechanical block. Today, a spec-creation flow produced a draft (never committed) that named an exact GCP project ID, exact service account emails, and described a live, unpatched IAM misconfiguration's exact exploit path plus an incidental live plaintext-secret exposure on a named production service — the same category of failure the personal-email check already catches mechanically for a different content type, but with no equivalent gate for infra identifiers or vulnerability narrative.

**Question:** Can we add a mechanical pre-commit check that blocks a commit containing this org's specific sensitive infra identifiers (or vulnerability-narrative language near them), so this doesn't depend on an agent remembering to self-apply the CLAUDE.md checklist?

## Appetite

Low blast radius (a new, additive check in an existing pre-commit script — doesn't touch build/deploy/runtime code). High reversibility (delete the check or its patterns; nothing else depends on it). Low decision density — the main open question is where to draw the line between "specific enough to be a real signal" and "broad enough to cause false-positive noise," which is a known, previously-hit failure mode in this exact script (see prior art below).

## Solution

Add a new check to `scripts/pre-commit-checks.sh`, modeled on the existing "unrecognized email addresses in feature specs" check (same script, same enforcement style — grep-based, scoped to specific file patterns, blocks the commit with a clear message on match):

1. **Denylist of this org's specific infra identifiers** — GCP project IDs/numbers, service account email patterns (`*.iam.gserviceaccount.com`), and other org-specific tokens that should never appear literally in `features/`, `docs/`, or other public-tracked paths. Exact list to be derived from what's already correctly kept in `.private/` (grep that directory for the identifier patterns actually in use, rather than inventing a pattern set from scratch).
2. **Optional second signal (needs a design decision, not prescribed here):** a heuristic for vulnerability-narrative language appearing near an infra identifier (e.g., words like "exploit," "current grant," "unpatched" near a resource-name-shaped token) — investigate whether this adds real signal or just noise before committing to it; the identifier denylist alone may be sufficient.
3. Scope the check to the same file universe as the existing personal-email check (`features/`, `docs/`) — not code directories, where gitleaks + the existing grep backstop already apply and where legitimate references to config *names* (not values) are expected and already a known false-positive source (see P868).

## Risks / Non-Goals

### Risks
- **False positives on legitimate config-name references** — P868 (`services/` grep-scanner exclusion) already hit exactly this failure mode: a crude grep matching an env-var *name* even when only a placeholder/test value follows it. Mitigation: scope narrowly to files where a project-specific identifier has no legitimate reason to appear (features/docs), not files where env-var *names* are routinely and legitimately discussed (code, tests).
- **Denylist goes stale** — new services/projects get identifiers that aren't in the list yet. Mitigation: this is a backstop, not the only defense; the CLAUDE.md checklist item added today remains the first line of judgment, this is the second line that doesn't depend on memory.
- **A determined rewrite could still evade a literal-string denylist** (e.g., identifier split across lines, base64-encoded, paraphrased). Not defended against here — this closes the "forgot to think about it" case, not an adversarial-evasion case, which is a different and much larger problem.

### Non-Goals
- Do NOT attempt to build a general-purpose vulnerability-narrative classifier (NLP/LLM-based detection) — start with the cheap, deterministic literal-identifier denylist; only add the harder heuristic if the identifier-only version proves insufficient in practice.
- Do NOT scan code directories with this new check — that's gitleaks' + the existing grep backstop's job, and re-scoping into code dirs reopens the exact false-positive class P868 already fixed.
- Do NOT make this check retroactively scan git history — this spec is about blocking future commits, not auditing past ones (a separate, one-time task if ever needed).

### Alternatives Considered
- **Rely solely on the CLAUDE.md checklist (today's fix), no mechanical gate:** rejected as insufficient — it's the same class of "remember to apply judgment" mechanism that already failed once today.
- **A pre-push hook instead of pre-commit:** rejected — catching it at commit time (before it's even in local history) is strictly better than catching it at push time; this repo's existing privacy gate already runs at commit time via `pre-commit-checks.sh`, follow the same pattern.

### Rollback Strategy
Remove the new check block from `pre-commit-checks.sh` — it's additive and self-contained, no other script or workflow depends on it.

## Done-When

- [ ] `pre-commit-checks.sh` blocks a commit that introduces this org's known GCP project ID or service-account email pattern into `features/` or `docs/`
- [ ] The check does NOT false-positive on the existing corpus of committed specs/docs (run against current `features/` + `docs/` as a regression check before merging)
- [ ] The check's failure path has actually been exercised and confirmed non-zero exit (per this repo's epistemic gate 7 — a gate that's never been seen to fail is unproven)
- [ ] A clear, actionable error message on match (points to `.private/` as the destination, same UX as the existing email-address check)
