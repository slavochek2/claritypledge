---
status: rejected
type: task
rank: 1000074
workstream: keyring
created_date: '2026-09-04'
tags: [security, privacy-gate, pre-commit, credentials]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1248: The privacy gate scans for people, not for credentials — give exposure mechanics a mechanism

## REJECTED 2026-09-04 — same day as filing, on two independent hostile reviews

Filed and rejected within hours. **Kept rather than deleted**: the measurements are reusable and the
failure is instructive — this spec repeated, inside a spec about gates, the exact epistemic failure
its own gate was meant to prevent.

**Four disqualifying findings, each re-verified by command before this closure was written:**

1. **The capability already ships.** `gitleaks 8.30.0` is installed and already runs on every commit
   (`scripts/pre-commit-checks.sh:541`, `gitleaks protect --staged`) across the full staged diff,
   `features/` included. A reviewer implemented this spec's entire proposed semantics — tier list,
   prose-only scope, code exclusion, non-zero exit — as one `[[rules]]` block of config, and
   demonstrated it flagging a spec while ignoring the same name in `src/`. This spec's Open Question
   1 said "check this first"; it then specced a bespoke build in a 1,827-line shell script anyway.

2. **The artifact it must publish is a better disclosure than the one it suppresses.** The tier list
   is an authoritative inventory of which credentials are secret-bearing. Committed to this public
   repo, that is strictly more useful to an attacker than the scattered mentions it exists to
   suppress. Gitignored, it is absent from the CI runner's fresh checkout, so the check fails **open**
   and silently — violating this spec's own "fail closed" invariant. **The repo already ruled on this
   exact move:** `.claude/rules/pii.md` records P936 rejecting name auto-detection because *"a
   committed names watchlist would itself be the disclosure."* Same mechanism, same repo, already
   decided.

3. **A name-match gate does not detect this leak, and the bypass is already committed here.** Commit
   `9911ca8d4` — this incident's own remediation — replaced every credential name with a generic
   descriptor. It passes the proposed gate with **zero** hits while the text still states which
   credentials exist, that the highest-value one has two copies, and that nothing guards them —
   verbatim what this spec's Problem section defines as the leak. The gate converts an unenforced
   judgment rule into an enforced *lexical* one, and lets the residual risk ship green with an audit
   trail saying a security gate approved it. That is worse than no gate.

4. **Nothing is left to protect. Measured 2026-09-04:** of the 46 secret-bearing names, the count
   appearing in public prose that are **not already on `origin/main`** is **zero**. The gate would
   govern an empty set.

**This spec's own numbers were wrong, in the direction that made its design look feasible** — the
finding that matters most, because it was produced *while writing a spec about verification gates*:

| Claimed | Actual |
|---|---|
| 77 names in `.env.local` | **83** — the extraction regex missed short and mixed-case names |
| 44 files already public with a secret-bearing name | **102** (107 tracked, 102 on `origin/main`) — off by 2.3× |
| "56 of 77 in public prose" (headline) | 24 names survive tiering, in 107 files — a number the next paragraph disowned |

The "44" was load-bearing: it justified the out-of-scope carve-out and the whole "legacy corpus is
small enough to be tractable" argument. It was generated with a tier list invented inline during the
measurement and promoted into the spec's central section without re-derivation —
[epistemic.md](../.claude/rules/epistemic.md) gate 9, violated by the author of a spec proposing a
verification gate.

**It also does not escape P994.** P994 died on four counts; this spec fixes one (the tier genuinely
excludes public-by-design names) and renames a second ("out of scope by construction: the files
already on `origin/main`" is the identical posture P994 was rejected for, and the real number is 102,
not 44). Counts three and four — that `gitleaks` already covers it, and that it targets identifiers
rather than the disclosure narrative — are untouched. "Warn-first" defers the unsatisfiability rather
than resolving it.

**Closing footnote — the gate fired on this closure.** The first attempt to commit this rejection
was **blocked by `audit-privacy.sh`**, because the spec quoted the repo's synthetic canary sentinel
verbatim and that sentinel is designed to block any commit containing it. The gate worked exactly as
built, on a spec arguing about gates, and its own author had to break the literal to land the text.
Recorded because it is the one piece of direct evidence in this whole episode that a privacy gate
here does fire when it should — and evidence that the sentinel mechanism P1248 proposed to imitate
already works.

**Reviews: 2 of 2 reported, no lens uncovered.** An implementation reviewer with repo access
(verdict: REJECT-LIKE-P994) and a reasoning reviewer deliberately denied repo access (verdict:
REVISE). The REJECT reasoning was stronger and its four load-bearing claims were each re-run by
command before this closure. The REVISE reviewer independently found the same tier-list drift problem
from the text alone, plus one class both the author and the implementation reviewer missed: this
repo's own mandated Pre-deploy Checklist template (`.claude/rules/features.md:248`) instructs authors
to write `vercel env add … --token "$VERCEL_TOKEN"` into spec files, and 9 files already carry
commands of that shape — so the gate would have blocked specs written exactly as the repo requires.

## What replaces it

**Nothing mechanical, and that is the finding.** The two real residues are not greppable:

1. **The disclosure narrative** — descriptor-level prose ("the prod master key has two copies and
   nothing guards them") carries the reconnaissance value, and no lexical rule reaches it.
2. **The concurrency race** — one session redacting while another pushes. This spec conceded in its
   own Open Question 3 that it would not have prevented its motivating incident; that concession was
   the refutation, filed as a footnote.

**The candidate worth pursuing instead, needing no list and publishing nothing: author
credential-topic specs in `.private/` from the start**, with a public stub carrying the reasoning.
It prevents the class at authoring time rather than detecting it at commit time. Not filed as a spec
here — it is a rule change, and it should be proposed through the CLAUDE.md gate rather than built.

---

## Original spec follows, unedited, as the record


> **Supersedes [P994](archive/p994_infra_vuln_leak_precommit_gate.md), rejected 2026-07-15.** Not a
> re-file: P994's rejection was correct on its own design and is adopted here as the central
> constraint. What has changed is that P994's chosen **residual control — "the CLAUDE.md checklist
> line" — has now failed a second time**, and this spec carries the measurement P994 never had.

## Problem

**Situation:** `scripts/audit-privacy.sh` is the repo's privacy boundary, enforced locally at
commit and server-side by the `main-privacy-gate` ruleset (P919). It scans for **personal
identifiers** — names and email addresses. Verified 2026-09-04: the script contains **zero**
references to credentials, secrets, API keys or `.env.local`. Independently recorded at
[decisions.md](../docs/decisions.md) 2026-08-13 — *"`audit-privacy.sh` — which matches only founder
identifiers"*.

**Complication:** On 2026-09-04 four commits assembled a complete credential map in public specs —
which credentials exist, where both copies of the highest-value one live, and that nothing guards
them. **Every gate passed clean, correctly**, because there was no personal data in them. Three
concurrent sessions then did three different things to the same files: one added a *new* credential
location, one redacted, one pushed the lot to public staging branches. The founder aborted the
promotion by hand at a TTY prompt. `main` was never contaminated; two ephemeral public branches
were.

CLAUDE.md's rule — *keep "unpatched security/infra vulnerability mechanics (exact resource names,
current exploit path)" out of public files* — **is the control P994 settled for**, and P994's own
Problem section called that class of control out in advance:

> *"the same class of 'remember to apply judgment' mechanism that already failed once today."*

It has now failed twice, 7 weeks apart, the second time reaching a public remote.

**Question:** What check can catch credential-exposure prose without firing on the 44 files already
carrying credential names on `origin/main` — the unsatisfiability that killed P994?

## Measured Baseline (2026-09-04)

Run by hand as a prototype of the proposed check. **These numbers are why P994's shape cannot be
rebuilt as-is.**

| Measure | Value |
|---|---|
| Credential names in `.env.local` | 77 |
| Distinct names appearing in tracked public prose (`docs/`, `features/`, `*.md`) | **56** |
| Public prose files scanned | 1,846 |
| Files naming the prod master key alone | **45** |
| Files carrying a *secret-bearing* name **already on `origin/main`** | **44** |
| Additional such files in the unpushed range | 7 |

**The tiering is the whole design problem.** Of the 56, a large share are legitimately public and
must never be flagged: `VITE_*` build config, `NEXT_PUBLIC_*` (public by definition), `*_ANON_KEY`
(anon keys are published clients-side by design), feature flags, `SENTRY_ORG`, `GCP_PROJECT`,
service URLs. **P994 died precisely here** — it proposed blocking identifiers that
`google-github-actions/auth` requires as plaintext workflow inputs, making its own Done-When #1 and
#2 mutually unsatisfiable.

**Context matters as much as the name.** Two live examples, both of which a naive matcher flags and
both of which are fine: `features/p1242_*` names an auth-token variable inside a code example, and
`features/done/**/p1189_*` names the master key while describing a defect that is **fixed**. The
signal is not "a credential name appears" but "public prose discloses where a *currently unguarded*
credential lives."

## Appetite

**Blast radius: high** — a gate on the commit path for every session; a false positive blocks
unrelated work and gets the check switched off. **Reversibility: high** — additive check, deletable.
**Decision density: one** — where the warn/block line sits (below).

## Invariants

- **Never weaken or reroute the existing personal-identifier checks.** This is additive. The PII
  patterns, the allowlists and the server-side required check keep their current behaviour exactly.
- **The gate must be exercised against the corpus it did NOT write** ([epistemic.md](../.claude/rules/epistemic.md)
  gate 7c). A refusal whose fixture contains only inputs it should reject has an unmeasured
  false-positive rate — the failure mode that killed P994 and that gate 7c exists to name.
- **A canary must prove it fires**, following the existing the repo's existing synthetic canary sentinel (the literal is deliberately not reproduced here — it is designed to block any commit containing it, and it blocked this spec's own first commit attempt)
  pattern: a synthetic sentinel matching no real credential, so the gate is falsified without
  planting a real one on the remote.
- **Fail closed on its own error, never on ambiguity.** A broken check must not silently pass; an
  *uncertain* match must warn rather than block.

## Solution

A tiered, prose-scoped credential-disclosure check inside `scripts/pre-commit-checks.sh`, sharing
`audit-privacy.sh`'s allowlist conventions but kept as its own named check so its verdicts and its
failures are attributable.

**Three things distinguish it from P994:**

1. **A curated secret-bearing tier**, not the whole env keyspace. The list is data, kept where the
   credential registry already lives, and explicitly excludes `VITE_*`, `NEXT_PUBLIC_*`, `*_ANON_KEY`,
   URLs, project/org identifiers and feature flags. Publishing a name that is public by design is
   not a finding.
2. **Scoped to prose, not code.** `docs/**/*.md` and `features/**/*.md`. Source and scripts
   legitimately reference env vars; excluding them removes the largest false-positive class at zero
   cost to the signal.
3. **Warn before it blocks.** Ship in warn mode against the existing corpus, measure the real
   false-positive rate over a stated period, and only then promote to blocking with the surviving
   pattern set. P994 proposed a block against an unmeasured corpus and was unsatisfiable on day one.

[FOUNDER DECISION: after the warn period, does this become a hard block, or stay an advisory that
prints and continues? A block on the commit path is the strongest control and the one most likely to
be bypassed with `--no-verify` when it misfires. The existing UI gate's expiring-override-file shape
is a third option — see decisions.md 2026-08-24 on the goal-gate having no sanctioned override.]

**Out of scope by construction:** the 44 files already on `origin/main`. This gate governs new
content; retro-redacting published history is a separate decision with a different cost profile, and
P994 correctly noted that a gate which ignores what is already published while blocking new
legitimate work is the worst of both.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| False positives on legitimate infra docs get the check disabled | **MITIGATE** | The tier list, the prose scope, and the warn-first period exist for this. It is the exact failure that killed P994; treat the measured false-positive rate as the ship gate, not an afterthought |
| A curated tier list drifts as `.env.local` gains keys | MITIGATE | The list is checked against the live key names by the same run; an unclassified new name warns rather than blocks |
| The check is bypassable with `--no-verify` | ACCEPT | True of every local hook, already documented in git.md. Local hooks are accident-prevention; the server-side required check is the boundary |
| Naming a credential is not the same as disclosing its location — the check cannot tell | ACCEPT | It will over-flag relative to the real concept. That is why it warns first and why the tier list is narrow; a human reads the warning |
| Retro-scanning the 44 published files produces noise nobody acts on | DEFER | Unblocked by a founder decision on whether published history is in scope at all |
| Server-side coverage lags the local check | DEFER | Add to `privacy-scan.yml` only after the warn period sets the pattern list; shipping an unmeasured pattern to the required check can block every push |

**Non-Goals**
- Do NOT modify the existing personal-identifier patterns, allowlists, or `privacy-scan.yml`'s
  current behaviour.
- Do NOT scan git history or attempt to redact published commits.
- Do NOT block on `VITE_*`, `NEXT_PUBLIC_*`, anon keys, service URLs or project identifiers — P994's
  fatal move.
- Do NOT extend scope to `src/` or `scripts/`; code referencing env vars is correct and expected.

## Done-When

- [ ] The check flags a newly-staged public spec that names a secret-bearing credential — observed,
      with the message naming the file, the name and what to do instead
- [ ] **The failure path is exercised and its non-zero exit pasted** ([epistemic.md](../.claude/rules/epistemic.md)
      gate 7) — not "it should fail because…"
- [ ] A canary sentinel matching no real credential proves the gate fires, following the existing
      that same sentinel pattern; the canary file is allowlisted so defining the
      sentinel does not block its own commit
- [ ] **Run against all 1,846 existing public prose files and the false-positive count recorded in
      this spec** (gate 7c). The two known must-pass cases — a code example naming an auth-token
      variable, and a shipped spec describing a fixed defect — pass without a flag
- [ ] A commit touching only `src/` or `scripts/` and referencing env vars is unaffected — verified
- [ ] The founder decision on warn-vs-block is recorded in this spec before the mode changes
- [ ] `./scripts/pre-commit-checks.sh` still passes on a clean tree, and total runtime is recorded
      before and after

## Alternatives Considered

- **P994's design — denylist infra identifiers, block at commit.** Rejected there and here: the
  identifiers were public by design, making its Done-When self-contradictory. Carried forward as the
  constraint this spec is built around rather than as a rejected sibling.
- **Keep relying on the CLAUDE.md checklist (P994's residual control).** Rejected on evidence: it is
  the control that failed on 2026-07-15 and again on 2026-09-04. Two failures of the same control,
  the second reaching a public remote, is the reason this spec exists.
- **Server-side only, in `privacy-scan.yml`.** Rejected as the *first* move: the server gate runs
  after the content is already pushed to a staging branch, so it cannot prevent publication — only
  promotion to `main`. The local hook is the only pre-publication point. Revisit after the warn
  period.
- **`gitleaks` with custom rules.** Not assessed. It already runs for code; whether its rule engine
  can express "secret-bearing name in prose but not in code" without duplicating the tier list is
  genuinely open — worth 30 minutes before building bespoke.

## Open Questions

1. **Can `gitleaks`' existing rule engine do this?** Not assessed. If it can, the bespoke check is
   unnecessary and the tier list becomes a gitleaks config. Check this first.
2. **Are the 44 already-published files worth a retro pass?** Deferred above; needs a founder call on
   cost versus a benefit that obscurity does not really provide.
3. **Does the concurrency case need its own control?** This gate would not have prevented the
   2026-09-04 incident's worst property — that one session's redaction raced another session's push.
   A commit-time check catches the *authoring*, which is upstream of it, but nothing here addresses
   two sessions disagreeing about whether content is publishable. Possibly out of scope; recorded so
   the next reader does not assume this spec closed it.

## Related

- **Supersedes:** [P994](archive/p994_infra_vuln_leak_precommit_gate.md) — rejected 2026-07-15;
  its rejection reasoning is this spec's central constraint.
- **Motivating incident:** [P1239](p1239_encrypt_the_critical_credential_half_with_per_access_unlock.md)
  and [P1214](p1214_credential_separation_and_privilege_reduction.md) — the specs that assembled the
  map, redacted in `9911ca8d4`. Full detail in `.private/docs/security-log.md`.
- **Same gate, different gaps:** [P1049](p1049_pre_commit_staged_content_read_gaps.md) — staged-content
  read gaps in the same pre-commit path.
- **Boundary context:** P919 — the server-side required check and why the staging hop is public.
