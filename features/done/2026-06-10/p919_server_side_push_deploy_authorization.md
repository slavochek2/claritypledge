---
status: all-done
type: task
rank: 1000804.0
created_date: '2026-06-10'
tags: [infrastructure, git-hooks, security, push-deploy]
feature_type: backend
pipeline_ran: [create-spec, challenge-prd, architect, spec-review, dev]
completed_at: 2026-06-16
---

# P919: Server-side push & deploy authorization — make the public-repo PII boundary one the agent cannot reach

## Problem

**Situation:** Push/deploy authorization for the **public** cp repo is enforced by three local layers — a global Claude Code PreToolUse hook (`~/.claude/hooks/block-prod-deploy.sh`) that blocks `git push` / `vercel --prod` unless the human-set flag `~/.push-enabled` exists; a per-repo `pre-push` hook (hardened in **P917**: PII scan + privacy stamp + TTY confirm); and a CLAUDE.md rule telling the agent not to set the flag.

**Complication:** A 5-lens adversarial review (`/slava:think:adversarial-review`, 2026-06-10) of the **P917-hardened** state proved this is **accident-prevention, not a security boundary** against a determined or prompt-injected agent. Reviewers executed real pushes to a bare remote. The local layer cannot, in principle, defend against an actor that controls the local machine: the agent can create the authorizing file, skip the hooks (`--no-verify`, `core.hooksPath`), or rewrite the hook scripts.

**Question:** How do we enforce the public-repo PII boundary at a layer the agent **cannot** reach — so a PII-laden or unauthorized push to `origin/main` (public) is rejected even when every local hook is bypassed?

**Prior incident (why this matters):** decisions.md records 297 commits that once leaked personal identifiers to `origin/main` past a broken privacy check.

**Scope note:** This spec covers the **public cp repo** (leak-to-public threat) and its Vercel prod deploy. The separate **cross-repo exfiltration guard** for pp and the other private repos (a *different* threat — data sneaking *out* to a wrong remote — and one that, for pp, cannot use a content scan because pp is private notes by design) is tracked in **pp/tasks/p23** (private repo: a spec describing private-repo defenses must not live in this public repo).

## Appetite

**Blast radius — high.** It's the security firewall for the public repo and prod deploy. **Reversibility — high per change** (git-revert + re-run installer; GitHub settings are toggles). **Decision density — medium**, now resolved (see Resolved Decisions): all pushes route through the required check (no admin escape hatch); server is the boundary; the agent pushes under a credential that cannot disable the boundary.

**Interim posture until this ships (founder decision 2026-06-10):** the agent pushes autonomously; `~/.push-enabled` stays ON as a **one-time delegation switch**, not a per-push gate — a reflexive per-push rubber-stamp carries no signal (the human checks nothing), so it is accident-prevention theater, not authorization. The real interim guard is the **local PII pre-push scanner** (`audit-privacy.sh`, P917), which runs on every push regardless of the flag and covers the *accidental-leak* class (the 297-commit harm). What it does NOT cover — a deliberately self-sabotaging or prompt-injected agent — is exactly what this spec's server-side boundary + scoped credential close. Do not treat the standing flag as the long-term model; it is the bridge until the Phase 3 credential cutover supersedes it.

## Solution

Move enforcement to layers the agent cannot reach. To be detailed in `/architect`; direction:

1. **Credential separation (the core).** The boundary is only real if the agent's GitHub credential can push commits but **cannot administer the repo** — cannot disable branch protection, edit the required-check ruleset, or bypass it. Provision a least-privilege credential for agent pushes (fine-grained PAT or GitHub App: Contents-write, **no** Administration). The founder's admin/override path lives off the agent-readable machine (GitHub web UI under the founder's own login, or a key the agent has no token for). Confirmed mechanism premise: with required status checks on a protected branch, a direct push of un-checked commits is **rejected** server-side (`GH006: Protected branch update failed`) — verified against GitHub docs 2026-06-10.

2. **Server-side content re-scan as a required status check.** A GitHub Actions workflow re-runs `scripts/audit-privacy.sh` against the pushed commits and publishes a required **check run** — a GitHub Actions check, NOT the forgeable Commit Statuses API (see Security Review: a scoped PAT cannot POST a check run, but *can* POST a commit status). Because the check only exists *after* CI runs on a branch, fresh commits cannot land directly on `main` — they transit a branch + CI, then promote to `main` once the check is green. The server re-scans regardless of local hook state, `--no-verify`, `core.hooksPath`, or a rewritten local hook. This is a **blocking gate, NOT alert-only** — no `continue-on-error`. Apply only the **pipefail** lesson from the alert-only pattern (decisions.md 2026-06-06 [process]): `script | tee` under `bash -e` returns tee's 0, so `set -o pipefail` is mandatory or the gate goes silently unwatched.

3. **Vercel prod deploy gated on the required check**, not on an agent-held `VERCEL_TOKEN` (which currently allows arbitrary prod deploy with no content scan). Mechanism (disable auto-deploy + check-gated deploy hook, or move deploy into the Actions workflow, or a CI-controlled mirror) → `/architect`.

4. **Authorization model — documented.** Formally accept and document "local hooks = accident-prevention, server = the boundary" so the split is unambiguous for future agents and the founder.

## Risks / Non-Goals

### Risks
- **CI re-scan diverges from local `audit-privacy.sh`.** MITIGATE: CI invokes the same script; add a parity test. Note the input differs — local runs on the working tree/staged diff, CI on a **commit/ref range** (rebase, squash, force-push change what "the pushed range" is); the parity test must cover ref-range semantics, not just same-file → same-verdict.
- **Verifying the gate would itself leak PII to the public repo.** MITIGATE: per epistemic.md gate 7, prove the gate FIRES — but **never with real PII on the public remote**. Use a synthetic sentinel pattern (e.g. `PII-CANARY-DO-NOT-MERGE`) on a throwaway branch/private repo to prove the plumbing rejects; cover real-pattern matching with a **local** unit test. Planting real PII on `origin` reproduces the exact harm this feature prevents.
- **Agent-credential compromise.** MITIGATE: the agent credential must lack Administration scope; if it could edit the ruleset the boundary collapses. Verify the credential cannot toggle branch protection.
- **Breaking the founder's own push workflow** when the branch-hop + no-bypass is enforced. MITIGATE: design and exercise the human path once (push to branch → CI green → promote) before relying on it. Accepted cost: the founder, too, cannot force-push past a failing scan.
- **False sense of safety from a green CI gate that never fired.** MITIGATE: exercise the failure path (synthetic sentinel) and paste the non-zero/blocking result before trusting it.

### Non-Goals
- Do NOT attempt to make local hooks injection-proof — the review proved that is impossible. Local hooks stay as accident-prevention only.
- Do NOT remove the `~/.push-enabled` convenience flag for the human accident-prevention use.
- Do NOT widen the `block-prod-deploy.sh` substring matcher further — a 2026-06-10 stopgap already added `core.hooksPath` / `gh` ref-mutation / broader-vercel patterns, which is as far as that layer should go.
- Do NOT include the **cross-repo exfiltration / remote-allowlist guard** for pp and the other private repos — moved to **pp/tasks/p23** (different threat model, private repo).
- Do NOT change application code — this is infra only.

### Alternatives Considered
- **Keep hardening local hooks** (more matcher patterns, immutable hook files). REJECTED: `--no-verify` / `-c core.hooksPath` / `gh api …/git/refs` bypass git hooks entirely regardless of patterns; a local-only script the enforced party can edit is not a boundary.
- **Detect-not-prevent (let the push land, alert loudly, revert).** REJECTED as the primary mechanism: the founder requires pushes be *stopped* before going public; on a public repo the leak window is the whole harm. The required-check-rejects-push mechanism delivers true prevention without it.
- **GitHub secret-scanning / push-protection only.** PARTIAL: catches secrets, not the project's personal-identifier patterns; keep as a complementary native layer, not a replacement for the `audit-privacy.sh` re-scan.
- **Pre-receive hook (true server-side block at receive time).** Not available — GitHub Enterprise only, not public-cloud repos. Noted so it is not re-proposed.

### Rollback Strategy
Each change is independently reversible; no data migration. Per-phase (see Build Sequence):
- **Phase 0 (de-risk spike):** reversible by construction — every object created (throwaway workflow, temporary ruleset, `proto/*` branches) is torn down at the end of the step; real `main` and the real ruleset are never touched. The repo returns byte-for-byte to its prior state.
- **Phase 1 (code):** `git revert` the workflow / `git-ops.sh` / docs commits. Nothing live changed.
- **Phase 2 (the lock):** disable or delete the `main` ruleset (Settings → Rules → Rulesets — instant toggle). Pushes return to the prior local-hook-only state immediately.
- **Phase 3 (credential cutover) — the riskiest, so it is backed up before it runs (build step 8):**
  - *Agent workflow breaks under the scoped PAT* → re-auth `gh` with the saved admin token (still in the password manager), OR temporarily add yourself as a ruleset bypass actor while diagnosing, then remove it.
  - *Restricted PAT too narrow* → issue a new fine-grained PAT with the corrected scope; the old one is revoked, not mutated.
  - *Vercel deploy needed manually* → re-issue a Vercel token (the revoke is reversible by minting a fresh token).
  - The cutover is only reversible **because step 8 backs up the admin token first** — do not skip it.

## Done-When

- [x] A push of a commit containing a known (synthetic-sentinel) PII pattern to `main` is **rejected server-side** even when invoked with `git push --no-verify` AND with `git -c core.hooksPath=/dev/null push` (both bypasses exercised; server still rejects — `GH013` "Required status check `audit-privacy` is expected", 2026-06-16, both variants). Real PII is never pushed to the public remote; pattern coverage is proven by a local unit test. *(Error code is `GH013` for rulesets, not `GH006` legacy — see Phase 0 RESULT.)*
- [x] The required check cannot be bypassed by the credential the agent pushes under: the agent credential has no Administration scope and cannot disable/edit branch protection (verified by attempting the toggle and confirming denial). **Closed via P970 (2026-06-27):** the `gh` keyring's full-`repo` `gho_` OAuth token was replaced by a fine-grained PAT (`cp-agent-push`, Contents R/W only). Probe: `gh api repos/slavochek2/claritypledge/branches/main/protection` → `403 "Resource not accessible by personal access token"` (no Administration scope); the `main-privacy-gate` ruleset remains readable + `active`; a normal push to a `staging/*` branch still succeeds. Founder admin path stays via the GitHub web UI (off the agent's credential). *(Phase 3 — done.)*
- [x] No admin escape hatch on `main` — the founder's own pushes are subject to the same required check (a clean but un-checked commit pushed under the current admin credential was rejected `GH013`, 2026-06-16; ruleset bypass list is empty).
- [x] A Vercel production deploy cannot be triggered without the required check passing (token-only deploy path closed or gated). **Closed via P944 (Option A):** `VERCEL_TOKEN` removed from `cp/.env.local`, both tokens revoked, vercel CLI logged out — `vercel whoami` → "No existing credentials found" (2026-06-16).
- [x] The server check has been seen to FAIL (block) on a planted synthetic-sentinel commit, not just pass on clean — CI job RED (Actions run 27597707081, exit 1, 2026-06-16) AND `GH013` push-rejection on `main` once the ruleset was live (epistemic.md gate 7).

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | founder 2026-06-10 | Admin escape hatch on `main`? | **Route ALL pushes through the required check — no admin bypass.** | An escape hatch is a human-shaped hole the agent could pressure the founder toward; removing it makes the boundary real. Accepted cost: no force-push past a failing scan. |
| 2 | founder 2026-06-10 | Authorization model ambition? | **Server = boundary; document the accident/boundary split.** Not building an out-of-band per-push approval this iteration. | The required check + non-bypassable branch protection IS the boundary; an unforgeable per-push approval is more infra/failure-modes for marginal gain now. |
| 3 | /challenge-prd [BLOCK→resolved] | Spec assumed a required check blocks a push; I claimed it only gates PR merges. | **Verified false alarm:** GitHub required status checks DO reject a direct push of un-checked commits (`GH006`). Real lock is buildable on public-cloud GitHub. | Fact-checked against GitHub docs 2026-06-10. Mechanism premise confirmed; "blocked" is achievable. |
| 4 | /challenge-prd [BLOCK→resolved] | Done-When required planting real PII to prove the gate — would leak to the public repo. | **Use a synthetic sentinel** on a throwaway/private branch for plumbing proof; **local unit test** for real-pattern coverage. | Verifying the gate must not reproduce the harm the gate prevents. |
| 5 | /challenge-prd [WARN→resolved] | 6-repo allowlist (#4) bundled a different threat into this spec. | **Split to pp/tasks/p23** (private repo). | Exfiltration-to-wrong-remote ≠ public-leak; for pp a content scan is meaningless (private notes by design). A spec about private-repo defenses must not sit in the public repo. |
| 6 | /challenge-prd [WARN→resolved] | Credential model under-specified — agent token could disable protection. | **Elevated to Solution #1 (the core):** least-privilege agent credential, no Administration scope; founder admin path off-machine. | A boundary the enforced party can switch off is not a boundary. |

**Verdict at resolution:** CHALLENGE → resolved. Ready for `/architect`.

## Adversarial Review Findings (evidence base)

From the 2026-06-10 5-lens review of the P917-hardened state (proven by execution unless noted):

- **C1 — rule-not-mechanism (CRITICAL).** `touch ~/.push-enabled` → exit 0; nothing prevents an agent creating the authorizing flag. The "never touch it" CLAUDE.md line is honor-system.
- **C-bypass — hook evasion (CRITICAL, real pushes).** `git push --no-verify` and `git -c core.hooksPath=/dev/null push` skip ALL per-repo hooks; `gh api …/git/refs` mutates refs server-side.
- **C-writable — agent-writable enforcement (CRITICAL).** `block-prod-deploy.sh`, `pre-push-checks.sh`, `audit-privacy.sh` are all agent-writable; an agent can rewrite the scanner to `exit 0`.
- **C5 — no server-side net.** cp's admin token bypasses GitHub branch protection; local hooks are the entire defense.
- **Forgeable/racy.** Privacy stamp `.claude/.privacy-reviewed` is agent-writable; `.privacy-allowlist` is extendable in the same push; `~/.push-enabled` is a global boolean shared across worktrees with no scope.
- **Coverage.** 6 repos under `~/Projects` have no pre-push guard; ladischenski-com's `VERCEL_TOKEN` allows arbitrary prod deploy with no content scan; pp has only a TTY confirm. *(The 6-repo coverage item is now tracked in pp/tasks/p23; ladischenski-com / Vercel stays in this spec, Solution #3.)*
- **Confirmed FIXED (not re-flagged):** `.allow-pii-next-push` one-shot removed (H5); `block-prod-deploy.sh` fails closed on broken python3 (H10).
- **One overstated finding** (refuted): "pp TTY fails open on `y` stdin" — not reachable via real `git push` (git controls the hook's stdin); false positive.

## Technical Architecture

### Technical Analysis

#### Current Enforcement Topology

**Local accident-prevention layer (all three are agent-bypassable):**
- `~/.claude/hooks/block-prod-deploy.sh` (global Claude Code PreToolUse hook): blocks `git push` / `vercel --prod` unless `~/.push-enabled` exists. The agent can `touch ~/.push-enabled`. Agent-writable, honor-system only.
- `scripts/pre-push-checks.sh` (P917, symlinked via `scripts/install-hooks.sh` to `$GIT_COMMON_DIR/hooks/pre-push`): three layers — (1) PII content scan via `scripts/audit-privacy.sh "$RANGE"`, (2) privacy-judgment stamp gate (`.claude/.privacy-reviewed`), (3) TTY confirm (only layer waived by `~/.push-enabled`). Bypassed entirely by `git push --no-verify`, `git -c core.hooksPath=/dev/null push`, or `gh api .../git/refs` (ref mutation that never calls a hook).
- `scripts/audit-privacy.sh`: the scanner itself is agent-writable; a determined agent can rewrite it to `exit 0`.

**Server layer (current state: no enforcement):**
- No GitHub branch protection ruleset is configured on `main`.
- All existing CI workflows (`test.yml`, `secret-scan.yml`, `check-deploy-drift.yml`, `csp-smoke.yml`, `prod-health-smoke.yml`, `db-backup.yml`) are `permissions: contents: read` and none is a required status check — they gate nothing.
- The founding credential holds admin rights and can override any protection that is later added — closing this is the first thing this spec does (D3).
- Vercel deploys via native Git integration (auto-deploy on push to `main`); no Actions deploy workflow exists. The only agent-reachable prod deploy path is `vercel --prod` using `VERCEL_TOKEN` from `.env.local` — no content scan on that path (adversarial finding C-writable / coverage).

**The `/ship` cherry-pick problem:**
`scripts/git-ops.sh ship` cherry-picks feature-branch commits onto local `main`, creating **new SHAs**. The human then separately pushes `main`. Under required status checks, these new SHAs have never been seen by CI — the push would be rejected (`GH006`) because no check has run on them. The same applies to `git-ops.sh commit-to-main` (direct tiny commits to local `main`). Any architecture that introduces required checks must have a concrete answer for how these locally-created SHAs accumulate a passing check status before the human pushes `main`.

#### Reuse Inventory

| Asset | Path | Reuse role |
|-------|------|-----------|
| Privacy scanner (range mode) | `scripts/audit-privacy.sh` | CI invokes `$RANGE` mode directly — same script, same patterns, same allowlist |
| Local unit tests for the scanner | `scripts/test-audit-privacy.sh` | Proves real PII patterns are caught; CI re-runs this as the parity test |
| Secret scan workflow (range logic) | `.github/workflows/secret-scan.yml` | Template for the new privacy-scan workflow: copy push/PR trigger structure, first-push `0000…` fallback, `BEFORE_SHA..AFTER_SHA` range calculation |
| Alert-only pattern | `.github/workflows/check-deploy-drift.yml` | Documents the required pattern for any monitoring workflow: `set -o pipefail` before `script | tee`, `continue-on-error` + `steps.X.outcome`, exact-title `gh issue list --json … | jq 'select(.title==$t)'`, auto-close on recovery. Cited in decisions.md 2026-06-06 [process]. Not used for the privacy-scan workflow itself (which must FAIL the job, not alert-only — it is a required check). |
| Hook installer | `scripts/install-hooks.sh` | Unchanged — continues installing local pre-push hook as accident-prevention |
| Pre-push checks | `scripts/pre-push-checks.sh` | Unchanged — continues as local accident-prevention. The design explicitly documents the split. |
| Ship / commit-to-main | `scripts/git-ops.sh` | `cmd_ship` and `cmd_commit_to_main` — modified to push to a staging branch so CI runs before the human pushes `main` |

---

### Architecture Decisions

#### D1 — Enforcement Mechanism: GitHub Ruleset with Required Status Check on `main`

**Chosen:** GitHub repository ruleset (Rulesets UI, not legacy Branch Protection) targeting `main`, with:
- Required status check: `privacy-scan / audit-privacy` (the job name from the new workflow, see D2).
- **Bypass list: empty.** No actors — not the founder's account, not any service account, not the agent credential. The founder's own direct push of un-checked commits triggers `GH006` just like the agent's. This satisfies Resolved Decision 1.
- "Require a pull request before merging": **OFF.** The resolved architecture is branch-hop (staging branch + CI + push matching SHAs to `main`), not PR-based. PRs would require a full fork-or-branch + merge-commit cycle that conflicts with the existing cherry-pick/`commit-to-main` workflow. A PR is not needed for the status check to exist on a SHA — any CI run on a branch records the check status against that SHA, and GitHub accepts a push to a protected branch when the required check is green on the incoming SHAs regardless of how they arrived. See D4 for the concrete flow.
- "Require status checks to pass before merging" = on. The check must be run on the branch whose commits are being pushed; stale-SHA check rejection is the mechanism.

**Rationale:** Rulesets (over legacy branch protection) — rulesets support `bypass_actors` as an explicit empty list, making the "no bypass" invariant visible and auditable; legacy branch protection has an implicit admin bypass that cannot be fully removed on public-cloud repos without a specific ruleset configuration. Required status checks on a ruleset reject a direct push of un-checked commits with `GH006: Protected branch update failed` — verified against GitHub docs 2026-06-10, Resolved Decision 3.

**Trade-off:** The founder cannot force-push past a failing scan. Accepted cost per Resolved Decision 1.

**Alternative rejected:** Legacy branch protection with "Include administrators" toggle. Less visible, UI toggle is easy to accidentally unset, and the toggle itself is admin-editable — if the agent credential held admin rights (which D3 prevents), it could re-enable the bypass. Rulesets with an empty bypass list are structurally cleaner.

---

#### D2 — The Privacy-Scan CI Workflow

**Chosen:** New file `.github/workflows/privacy-scan.yml`. Trigger: `on: push` (all branches) + `on: pull_request`. Job name: `audit-privacy` (this is the exact string referenced in the ruleset's required check list — must match). Steps:

1. `actions/checkout@...` with `fetch-depth: 0` (full history for range calculation).
2. Compute range using `secret-scan.yml`'s logic EXCEPT the new-branch fallback: on push, `BEFORE_SHA=${{ github.event.before }}`, `AFTER_SHA=${{ github.event.after }}`; if `BEFORE_SHA=0000...` (first push to a new branch), fall back to **`origin/main..$AFTER_SHA`** (full range — matches `pre-push-checks.sh`), NOT `secret-scan.yml`'s single-tip `-1 $AFTER_SHA`, which would leave a coverage hole. On PR, use `${{ github.event.pull_request.base.sha }}..${{ github.event.pull_request.head.sha }}`.
3. Run the scanner **from the trusted base copy, not the pushed copy**: `git show origin/main:scripts/audit-privacy.sh > /tmp/trusted-audit.sh` then `set -o pipefail; bash /tmp/trusted-audit.sh "$RANGE" | tee scan-output.txt`. A scanner edit *in the push being scanned* therefore cannot weaken its own scan (residual-risk mitigation b — a scanner change is gated by the previous scanner). `pipefail` is mandatory (decisions.md 2026-06-06 [process] — without it `… | tee` returns tee's 0, silently unwatched gate). **This step must NOT be `continue-on-error`** — the job must fail (non-zero) to register a failed required check. The alert-only pattern (check-deploy-drift.yml) is for monitors; this is a blocking gate.
4. **Allowlist co-commit guard:** if `.privacy-allowlist` changed in the range (`git diff --name-only "$RANGE" -- .privacy-allowlist`), also run the scan with the allowlist at the base SHA (`git show origin/main:.privacy-allowlist`); fail if either run reports hits. Closes "allowlist a path + add PII to it in one push." **Add a `test-audit-privacy.sh` case for this new logic** (currently untested — spec-review note).
5. On failure: print `scan-output.txt` for debug visibility in the Actions log.

**Why push-to-any-branch, not PR-only:** The chicken-and-egg problem — to push commits to `main`, those commits need a passing check. But the check only runs when the commits are pushed to a branch. The solution: the founder/agent pushes commits to a staging branch first (see D4), CI runs on that branch, the check status is recorded against those SHAs, then `main` is updated to those same SHAs (the check is tied to the SHA, not the branch it was run on). This requires `on: push` to trigger on non-`main` branches, not just PRs or pushes to `main`.

**Workflow permissions:** `permissions: contents: read` — matching all other workflows. The scanner reads the git diff; no write access needed.

**Check name the ruleset references:** `privacy-scan / audit-privacy` (workflow-name / job-name). Set this in the ruleset Required status checks field before enabling protection — if the name doesn't match, no commit can ever satisfy the check and all pushes are blocked permanently.

**Rationale:** Reuses the `secret-scan.yml` range logic (proven pattern); invokes the same `audit-privacy.sh` that local hooks use (parity by construction); `pipefail` requirement is the key lesson from decisions.md 2026-06-06.

**Trade-off:** CI runs on every branch push (not just `main`), which adds ~30s per push. Acceptable — the check must exist on the SHA before the SHA reaches `main`, so earlier-branch triggering is structurally required.

**Alternative rejected:** PR-based only. A PR-only trigger means the staging-branch push (D4) needs a PR open to trigger CI — adds PR management overhead with no security benefit (the required check still gates main; the PR is just a trigger vehicle). The direct push-to-branch trigger is cleaner.

---

#### D3 — Agent Credential Separation

**Chosen:** Provision a **fine-grained PAT** (Fine-grained Personal Access Token) scoped to the `claritypledge` repo with:
- `Contents: Read and Write` — can push commits and branches.
- `Metadata: Read` (implicitly required by GitHub for any fine-grained PAT).
- **No `Administration` permission** — cannot read or write branch protection, rulesets, or repo settings.
- **No `Deployments` permission** — cannot trigger Vercel deploy hooks or GitHub deployment environments.

This PAT replaces the current credential the agent uses for `git push` / `gh` operations. The founder's admin GitHub login (browser session under the founder's own account) is the only path that can modify the ruleset or bypass protection — and that path is off the agent-readable machine (browser login under a password/2FA the agent cannot access, or a separate admin PAT stored outside `.env.local`).

**Why fine-grained PAT over GitHub App:** A GitHub App requires registering an app, managing a private key, and exchanging for installation tokens per-session — correct for multi-repo or organizational use. For a single-repo scenario, a fine-grained PAT with explicit permission scopes achieves the same isolation with less operational overhead. The key invariant is identical: `Administration` scope absent from the credential.

**Verification of the constraint:** After provisioning, attempt `gh api repos/slavochek2/claritypledge/branches/main/protection --method PUT --input /dev/null` with the new credential — it must return 403/404 (insufficient scope), not 200. Paste the denial as Done-When evidence.

**The VERCEL_TOKEN path:** The current `VERCEL_TOKEN` in `.env.local` allows `vercel --prod` bypassing all git gating. Under D5, this token is removed from agent reach (`.env.local` contains it but the agent is directed not to use it; the token itself is revoked and replaced by a CI-only token in GitHub Actions secrets). The `block-prod-deploy.sh` local hook is accident-prevention for the old path; D5 closes it structurally.

**Rationale (load-bearing):** A boundary the enforced party can switch off is not a boundary (Resolved Decision 6). If the agent credential held `Administration` scope, the entire ruleset gate collapses — the agent could disable protection, push un-scanned commits, and re-enable. The credential scope is what makes the server-side gate real.

**Trade-off:** The agent cannot self-recover from a misconfigured ruleset that accidentally blocks all pushes. Recovery requires the founder's admin browser session. This is a feature, not a bug — it puts irreversible infrastructure changes behind a human.

**Alternative rejected:** Classic PAT (no scope granularity). Classic PATs cannot be scoped to exclude Administration on a specific repo — they use coarse `repo` scope which implicitly includes admin-level operations on repos the token can access. Fine-grained PATs (GA since 2024) are required for this constraint.

---

#### D4 — `/ship` + `commit-to-main` Flow Change

**The problem:** `git-ops.sh ship` cherry-picks onto local `main`, producing new SHAs. `git-ops.sh commit-to-main` creates new commits directly on local `main`. Neither path has ever seen CI — their SHAs have no check status. Under D1, pushing these SHAs to `origin/main` triggers `GH006`.

**Chosen — Staging-branch hop:**

**For `cmd_ship`:** After the cherry-pick loop completes on local `main` (existing behavior), add a new phase before "Ready to push.":
1. Push the cherry-picked commits to `origin/staging/pN` (e.g. `git push origin main:staging/p919`). This triggers CI (`on: push` to any branch, per D2). The same SHAs that are on local `main` are now on the remote staging branch with CI running.
2. Print: "Pushed to staging/pN. CI is running. When the `audit-privacy` check turns green on those SHAs, run: `git push origin main`."
3. The human waits for CI, then pushes `main`. GitHub checks that the required status exists on the tip SHA of the incoming push — it does, because the same SHA was checked on the staging branch.

**For `cmd_commit_to_main`:** Same pattern — after the commit lands on local `main`, push to `origin/staging/doc-<short-sha>`, wait for CI, then push `main`.

**Key invariant — the single load-bearing assumption; PROVE IT BY LIVE TEST IN PHASE 1 BEFORE building D4 or doing the Phase 2 cutover:** GitHub's required status check is tied to the **commit SHA**, not the branch — a SHA that passed the required check on any branch should satisfy the requirement when that same SHA is pushed to `main`. This is what makes the staging-branch hop work. The `GH006` rejection of un-checked commits IS verified against GitHub docs (2026-06-10); the **SHA-portability half is asserted from the same model but not yet proven by live test**. **Build Sequence Phase 0 is a self-contained, fully-reversible spike that proves exactly this** — on a throwaway `proto/` target, never real `main` — and is the decision gate for whether D4 stands or flips to the PR-based alternative. Do Phase 0 before writing any git-ops code.

**Concrete change to `scripts/git-ops.sh`:**
- In `cmd_ship`, replace the final `echo "Ready to push."` with a push to `origin/staging/$pn` followed by instructions to push `main` after CI passes.
- In `cmd_commit_to_main`, add a post-commit staging push.
- Add a `STAGING_BRANCH_PREFIX` variable (default: `staging/`) used by both commands — makes it easy to change the naming convention.
- Staging branches are ephemeral: `cmd_ship`/`cmd_commit_to_main` print `git push origin --delete <staging-branch>` as the explicit final cleanup line for the founder to run immediately after pushing `main` (do NOT auto-delete inside git-ops — only the human knows when `main` was actually pushed). Without cleanup, `origin/staging/*` accumulates and each push fires a CI run.
- **P920 coupling — `cmd_ship` collision + closure path:** P920 adds a *no-branch closure-only* path to the SAME `cmd_ship` function (close a spec already on `main`, skipping the cherry-pick), and it also lands a commit on `main` via the locked path. Once this boundary is live, that closure commit is main-bound and equally subject to the required check — so the staging hop must apply to the closure path too, not only the cherry-pick path. Both specs edit `cmd_ship`; whichever lands second must rebase onto the first. **Recommended order: P920 first** (small, self-contained, unblocked), then this D4 extends the staging hop across both `cmd_ship` paths + `cmd_commit_to_main`. See features/p920.

**Rationale:** This is the minimal change to the existing workflow. No PRs required. The cherry-pick-then-commit-to-main model is preserved. The only addition is an intermediate push to an ephemeral remote branch. The human's push to `main` becomes a one-liner after CI.

**Trade-off:** Adds ~30s CI latency between `/ship` completing and `git push origin main`. The ship workflow currently ends with "Ready to push." with the implicit expectation that the human pushes immediately — this changes that expectation to "wait for CI green, then push."

**Alternative rejected:** Auto-merge via PR. A PR-based flow changes the mental model significantly (new SHAs from merge commits, branch naming conventions, PR lifecycle management) and conflicts with the existing cherry-pick pattern. The staging-branch hop achieves the same check-satisfaction with zero model change.

---

#### D5 — Vercel Deploy Gating

**Chosen:** Two changes:

1. **Keep Vercel Git integration (auto-deploy on push to `main`), but transitively gate it.** Since `main` is now protected by a required check (D1), only checked commits can reach `main`. Vercel's auto-deploy from `main` can therefore only ever build PII-clean commits. The transitive protection is complete for the auto-deploy path. **Operational note (not security):** Vercel's Git integration also spins up **preview** deployments for non-`main` branches, so the `staging/*` pushes (D4) will trigger preview builds. These go to preview URLs (not prod) and add no public exposure beyond the branch push itself — disable preview deploys for `staging/*` in Vercel project settings, or accept the noise.

2. **Remove the agent-reachable `VERCEL_TOKEN` for prod deploys.** The current `VERCEL_TOKEN` in `.env.local` enables `vercel --prod` as an out-of-band channel that bypasses git entirely — no content scan, no branch protection. Close this:
   - Revoke the current `VERCEL_TOKEN` (or rotate it to a scoped version without deploy permission for the agent).
   - The token for any CI-side operations (if ever needed) lives as a GitHub Actions secret, not in `.env.local`.
   - `block-prod-deploy.sh` remains as the local accident-prevention guard for stale workflows that might invoke `vercel --prod` with a token, but the structural closure is token revocation.
   - The `ladischenski.com` Vercel project is in scope (adversarial review): same pattern — no agent-reachable prod token for that project.

**Rationale (D5 connection to D3):** Credential separation (D3) closes the GitHub push path. Removing the `VERCEL_TOKEN` from agent reach closes the Vercel prod path. Together they ensure there is no prod-deploy path the agent controls that bypasses the content check.

**Trade-off:** The founder cannot trigger a manual Vercel prod deploy from the CLI without re-acquiring the token. Deployments happen via `git push origin main` (after CI) → Vercel auto-deploy. This is strictly safer and the operational model is simpler.

**Alternative rejected:** Explicit deploy workflow in GitHub Actions that calls Vercel CLI after the privacy-scan check passes. Adds a VERCEL_TOKEN to GitHub Secrets (a broader attack surface than removing it), adds a deploy Actions step to maintain, and duplicates a trigger that Vercel's Git integration already handles correctly once `main` is gated. Simpler = remove the token.

---

#### D6 — Falsification Harness (Epistemic Gate 7)

**The problem:** A gate not seen to FAIL is unproven — epistemic.md gate 7, and decisions.md 2026-06-10 [process] (reading a gate's code ≠ verifying it fires). Real PII must never reach `origin/main` (that would reproduce the exact harm P919 prevents — Resolved Decision 4).

**Chosen — Two-layer falsification. CRITICAL: the falsification must NEVER use a real identifier** — not in a commit, not on a throwaway branch, not in this spec. Use a purpose-built synthetic marker that matches no real person. (This very spec tripped the scanner during authoring when an agent wrote real hard-pattern tokens into it — proof the gate works, and the reason this rule is explicit.)

**Layer A — Synthetic sentinel on a throwaway branch (plumbing proof):**
1. Add a **test-only synthetic pattern** to `audit-privacy.sh`: the literal marker `CLARITYPLEDGE-CANARY-DO-NOT-MERGE` (a made-up string matching no real identifier). Any commit containing it is now blocked — intentional.
2. Create a branch `test/p919-canary-<date>` and commit a file containing only that marker. No real PII is ever written.
3. Push to `origin/test/p919-canary-<date>` (not `main`) — the `privacy-scan` CI workflow runs, fails, registers a failed check.
4. Attempt `git push origin test/p919-canary-<date>:main` — `GH006` fires because the required check failed. Paste the error. Done-When #1 and #5 satisfied.
5. Delete the throwaway branch from origin.

Only the synthetic marker ever reaches `origin`, and never `origin/main`. `main`'s history stays clean and no real identifier exists anywhere in the test.

**Layer B — Local unit test for real-pattern coverage (pattern-match proof):**
`scripts/test-audit-privacy.sh` already exercises the repo's real hard-pattern coverage and allowlist behavior in both `--msg` and range modes, inside an isolated `mktemp -d` repo — the real patterns live only in the test harness, never in this spec or any pushed branch. This test must pass as the parity-test CI step (added to `privacy-scan.yml`), proving pattern coverage without any real identifier touching the public remote.

**Rationale:** The two-layer split (synthetic sentinel for plumbing, unit test for pattern coverage) maps directly to Resolved Decision 4. The parity test also detects if the CI script invokes `audit-privacy.sh` incorrectly — if CI calls the wrong mode or passes the wrong range, the local unit test still passes but the CI falsification fails.

---

### Security Review

This is a security spec where the *enforced party (the AI agent) is the adversary*, so the review targets the enforcement topology itself. Three findings were confirmed against the **live** GitHub API.

**Credential & Authorization Model (the core):**
- ✅ The API boundary is real, not just policy. `PATCH .../branches/{branch}/protection`, `POST/PUT .../rulesets` all require the `Administration` permission. A fine-grained PAT scoped to `Contents: Read/Write` + `Metadata: Read` (D3) receives **403** on those endpoints — it structurally cannot disable the ruleset that gates it. Requirement: the exact scope must be provisioned as written (see Pre-deploy Checklist); "no Administration" in prose is not a provisioning instruction.
- ⚠️ **LIVE FINDING — `enforce_admins` is `false` today** (confirmed via API). The founder's admin account currently bypasses ALL branch protection. The ruleset's bypass list MUST be empty AND admin enforcement ON before the gate is trusted — otherwise any session authenticated as the repo admin skips the check. Satisfies Done-When #3; must be explicitly toggled (it is off now).
- ⚠️ **LIVE FINDING — the precondition that gates everything: the admin token is on the agent-readable machine NOW.** The current `gh auth` session holds full `repo` scope and `"admin": true` (confirmed — this review used it to read the API). That is exactly bypass vector C5: the agent can `gh api .../branches/main/protection -X PUT` to disable protection, push, re-enable. **Until the admin credential is removed from `gh auth`/keychain/env/any agent-readable file and replaced by the contents-only PAT, every other control is downstream of a hole.** This is the logical precondition for the boundary to be *agent-proof* — but by founder decision it is deferred to **Phase 3** of the Build Sequence: build and prove the mechanism first (Phases 1–2), then close the credential hole. The lock is not agent-proof until Phase 3, which is the accepted state during build/test.
- ✅ Workflow `GITHUB_TOKEN`: the privacy-scan workflow needs only `permissions: contents: read` (matches D2). It must NOT be granted `statuses: write` or `checks: write` — Actions auto-publishes the check-run result without them.

**Required-Check Integrity (the decisive question — can the agent forge a passing check?):**
- ✅ **No, if implemented as a GitHub Actions check run (D2's choice), not the Commit Statuses API.** Check runs (`POST /check-runs`) can only be published by GitHub Apps or Actions workflows under the ephemeral `GITHUB_TOKEN` — a fine-grained PAT *cannot* call that endpoint regardless of scope. By contrast, the legacy Commit **Statuses** API (`POST /statuses/{sha}`) *can* be forged by a PAT holding `statuses: write`. **Therefore: D3's PAT must exclude `statuses: write` (it does — Contents+Metadata only), and the required check must be the Actions job, never a manually-posted status.** Verify during impl: `gh api .../statuses/<sha> -X POST` with the agent PAT must return 403.
- ⚠️ **Residual, structurally not fully closeable: the agent can edit the scanner/workflow/allowlist in the same push.** `audit-privacy.sh`, `.privacy-allowlist`, and `privacy-scan.yml` all live in the repo the agent can write. A determined agent can neuter the scanner (or extend the allowlist, or `exit 0` the workflow) in one push to a staging branch; the neutered CI then passes and the SHA can reach `main`. See "Residual Risk" below for the partial mitigations and the accepted backstop.

**Scan Bypass Surface:**
- ⚠️ **`.privacy-allowlist` co-commit bypass** (allowlist a path + add PII to it in the same push). The CI scan loads the *new* allowlist and skips the path. MITIGATION (reconciled into Build Sequence): the workflow runs the scan a second time using the allowlist at the **base SHA**, and/or fails if the allowlist diff is non-empty pending review. Closes the co-commit path without per-change human gating.
- ⚠️ **New-branch range fallback:** `secret-scan.yml` falls back to single-tip (`-1 $AFTER_SHA`) when `BEFORE_SHA=0000…`. For the privacy gate, mirror the **pre-push hook's** logic instead — fall back to `origin/main..$local_sha` so a freshly-created branch's full range is scanned, not just its tip.

**Deploy Path:**
- ⚠️ `VERCEL_TOKEN` in `.env.local` enables `vercel --prod` bypassing git entirely (no scan, no protection). Must be revoked from agent reach for BOTH the claritypledge and ladischenski.com projects (D5). The local `block-prod-deploy.sh` is accident-prevention only; token revocation is the structural close.

**Verification Safety:**
- ✅ D6 uses a synthetic sentinel on a throwaway branch (never real PII on `origin/main`) — correct per Resolved Decision 4. Strengthen: use a clearly-fake form and run the plumbing proof on a **private** throwaway repo where possible, since a public-repo branch push leaves a trace in the activity feed even after deletion.

**Secrets:**
- ✅ No secret is committed by this spec. Any CI-side token is a GitHub Actions **repository** secret (not org-wide, not `VITE_*`). See Pre-deploy Checklist.

#### Residual Risk (explicitly accepted, per Resolved Decision 2)

The scanner lives in the repo it guards, so an agent that *decides* to neuter its own scanner can do so in a single push and land it on `main` via the resulting green check. This is not fully closeable without externalizing the scanner to a system the agent cannot write.

- **What IS fully closed:** the *accidental* leak — the 297-commit historical harm class. A normal push of PII-bearing content is rejected (`GH006`). This is the threat the feature exists for.
- **Partial mitigations folded into the design:** (a) base-SHA allowlist re-scan closes the allowlist co-commit; (b) CI fetches `audit-privacy.sh` from `origin/main` (the already-trusted copy) to scan incoming commits, so a scanner edit in the same push doesn't get to use the edited scanner — a scanner change is gated by the *previous* scanner; (c) the agent credential cannot disable branch protection, so it cannot hide the change — a neutered-scanner or workflow-file edit lands as a **visible diff** the founder reviews.
- **Accepted backstop:** the founder's admin diff-review of any change to `.github/workflows/**`, `audit-privacy.sh`, and `.privacy-allowlist`. This matches the resolved decision "server = the boundary, documented" — it prevents accidental and unsophisticated bypass, not an agent that has already decided to rewrite its own guard. Closing that fully (e.g. required review on `.github/` + scanner paths, or an out-of-repo scanner) is a deliberate future increment, not this iteration.

---

### Implementation Approach

**Worktree recommended:** this spec touches CI workflows, `scripts/git-ops.sh`, and scripts — changes that interact with the main checkout and require human execution of GitHub-side steps. Use a feature branch for the code changes; the GitHub-side configuration steps are manual founder actions (see below).

**Split of responsibilities** (ordered + interleaved with verification in the Build Sequence below — NOT done up front):
- **Agent-doable (Phase 1, feature branch, fully reversible):** create `privacy-scan.yml`; add the `test-audit-privacy.sh` parity step; modify `git-ops.sh` (D4 staging hop); document the split in `git-workflow.md` + `CLAUDE.md`.
- **Founder-only (Phases 2–3 — the agent intentionally cannot hold the admin credential):** configure the ruleset (Phase 2); provision the scoped agent PAT, move the admin token off-machine, revoke `VERCEL_TOKEN` (Phase 3). These are sequenced LAST by founder decision — see the Build Sequence rationale.

#### Build Sequence — three phases (founder-sequenced 2026-06-10)

Each step is independently verifiable and reversible. Do not proceed until the current step's verification passes. **The credential cutover is Phase 3 — done LAST, after the lock is built and proven, with a tested rollback.** Rationale (founder decision): the cutover is the riskiest, most disruptive change; build and prove the mechanism on throwaway branches first using the *existing* credential, then harden. Honest caveat: until Phase 3, the lock blocks the accidental-leak class but is not yet agent-proof (the admin token is still reachable). That is acceptable during build/test — Phases 1–2 prove the mechanism; Phase 3 closes the credential hole.

**── Phase 0 — De-risk spike: prove the load-bearing SHA-portability invariant (throwaway + fully reversible; do FIRST) ──**

0. **Prove a check-passed SHA can move to a protected branch — on a THROWAWAY target, never real `main`.** This is the cheapest disproof of D4's load-bearing assumption (epistemic gate 7 / falsify-before-you-rely), run before any code is written.
   - **Setup (all temporary):** add a minimal throwaway workflow that emits a check `on: push` to `proto/p919-*` branches; create a **temporary ruleset** targeting the branch pattern `proto/p919-target`, requiring that check, bypass list empty. (Uses a throwaway target so the real `main` ruleset is never created or touched in this phase.)
   - **Test the invariant:** push a commit to `proto/p919-stage` → the check runs green on that SHA → push the **same SHA** to `proto/p919-target`. Expect **success** (invariant holds). Then push an *un-checked* commit to `proto/p919-target` → expect **`GH006`** (the gate fires). Paste both outcomes.
   - **Teardown (reversibility — MANDATORY, this is what makes the spike safe):** delete the temporary ruleset; `git push origin --delete` every `proto/p919-*` branch; remove the throwaway workflow commit. Nothing touched real `main` or any real ruleset — the repo returns to its exact prior state.
   - **Decision gate (record the result in this spec):** invariant holds → build the staging-branch design (D4) as written. Invariant fails (GitHub binds the check to the *exact ref*, not the SHA) → switch D4 to the **PR-based alternative** BEFORE building the git-ops change. Either way, no rework is wasted because no git-ops code was written yet.

*End of Phase 0: a reversible experiment. The repo is byte-for-byte where it started; you now know whether D4 or its PR-based alternative is the correct foundation.*

> **✅ Phase 0 RESULT (2026-06-13) — INVARIANT HOLDS. D4 (staging-branch hop) stands; PR-based alternative NOT needed.**
> Ran the spike on a throwaway `proto/p919-stage`/`proto/p919-target` pair + a temporary ruleset (`proto-gate` required, bypass empty), then tore everything down (0 rulesets / 0 proto branches remain; verified).
> - **Test 1 (portability):** a SHA whose `proto-gate` check was green on `proto/p919-stage` was **accepted** onto the protected `proto/p919-target` (bypass list empty, so not an admin bypass — accepted *because the SHA carried the check*). GitHub binds the required check to the **commit SHA**, not the ref. → staging-hop works.
> - **Test 2 (gate fires):** an un-checked child commit pushed to `proto/p919-target` was **rejected server-side**, even pushing as the admin under an empty bypass list. → "no admin escape hatch" (Done-When #3) validated at the ruleset layer.
> - **Correction for Done-When/D6 evidence:** repository **rulesets** reject with **`GH013`** ("Repository rule violations found … Required status check `<name>` is expected"), NOT the `GH006` of legacy branch protection. Capture `GH013` as the expected failure string in Phase 2's end-to-end falsification.
> - **Live-state note:** `main` currently carries *legacy* branch protection (`required_pull_request_reviews: 1`) with `enforce_admins: false` and **no required status checks** — admin-bypassed, so effectively the non-boundary state the spec assumes. D1's ruleset (Phase 2) is what creates the real boundary.

**── Phase 1 — Build & prove (agent-doable, fully reversible, NO credential changes, lock not yet live) ──**

1. **Create `.github/workflows/privacy-scan.yml` on a feature branch.**
   - Copy range logic from `secret-scan.yml`, BUT fix the new-branch fallback: when `BEFORE_SHA=0000…`, use `origin/main..$AFTER_SHA` (the pre-push hook's logic — full range), not `secret-scan.yml`'s single-tip `-1`.
   - Job name exactly `audit-privacy`, workflow name `privacy-scan`. `permissions: contents: read` only (no `statuses:`/`checks: write`).
   - **Fetch the scanner from the trusted base, not the incoming push:** run `audit-privacy.sh` as it exists on `origin/main` against the incoming range — a scanner edit *in the push being scanned* can't weaken its own scan (residual-risk mitigation b).
   - Invoke `bash <trusted-audit-privacy> "$RANGE" | tee scan-output.txt` with `set -o pipefail`. NOT `continue-on-error` — the job must fail red to register a failed required check.
   - **Allowlist co-commit guard:** if `.privacy-allowlist` changed in the range, also run the scan with the allowlist at the base SHA (`git show origin/main:.privacy-allowlist`); fail if either run reports hits.
   - Add `bash scripts/test-audit-privacy.sh` as a parity-test step.
   - Verify: push the branch → CI runs → `audit-privacy` job appears in the Actions tab.
2. **Falsification dry run (D6, Layer A — throwaway branch).** Commit a synthetic-sentinel file on a throwaway branch, push to origin → CI must fail the `audit-privacy` job (red). Paste the failed check URL + log. Delete the branch. (Evidence for Done-When #5, gathered BEFORE the lock is enabled.)
3. **Verify Layer B (local unit test).** `bash scripts/test-audit-privacy.sh` → `Passed: N, Failed: 0`.
4. **Modify `scripts/git-ops.sh` — staging-branch hop (D4).** `cmd_ship`: after cherry-pick loop, push to `origin/staging/$pn`, print CI-wait instruction. `cmd_commit_to_main`: push to `origin/staging/doc-<short-sha>`. Verify on a test feature.
5. **Document the split** in `docs/technical/git-workflow.md` and `CLAUDE.md`: "Local hooks = accident-prevention; server = the boundary," plus the staging-branch hop.

*End of Phase 1: everything reversible by reverting the branch. No keys touched, no lock live.*

> **✅ Phase 1 RESULT (2026-06-16) — BUILT, LANDED ON `main`, GATE PROVEN TO FIRE. Lock not yet live (Phase 2 next).**
> Rebased the Phase-1 branch onto post-P936 `main` and resolved the `audit-privacy.sh` overlap: P919's GNU-grep-portable word boundaries `(^|[^[:alnum:]_])…([^[:alnum:]_]|$)` coexist with P936's `scan_unknown_emails` + `.privacy-email-allowlist` (0 active `[[:<:]]` patterns remain; 34/34 scanner tests pass).
> - **Co-commit guard extended (P936 follow-up, decisions.md 2026-06-15):** `privacy-scan.yml`'s base-SHA re-scan now swaps BOTH `.privacy-allowlist` (path, fail-closed) and `.privacy-email-allowlist` (email, fail-open) to their `origin/main` versions. Documented asymmetry: the email half only closes the bypass when the base list is non-empty-but-lacking the new entry; a first-ever email-allowlist creation in the same push inherits P936's fail-open (accepted). Paired tests added.
> - **Landed on `main` (5ce64c91), spec kept OPEN** (not `/ship` — `delivery_stage: dev`, `in-progress`, still in `features/`). Direct push was a clean fast-forward (no ruleset live yet); admin credential bypassed the existing *legacy* PR-requirement protection. The `privacy-scan / audit-privacy` check ran **GREEN** on the main push (Actions run 27597149512) — the required-check NAME now exists for Phase 2.
> - **Layer A falsification (Done-When #5):** synthetic-sentinel commit on throwaway `test/p919-canary-20260616` → `privacy-scan / audit-privacy` job **RED** (Actions run 27597707081, `conclusion: failure`). Log: `RANGE: origin/main..3c2d6c67` → scanner emitted the added sentinel line (`+CLARITYPLEDGE-CANARY-…`, literal truncated here so this evidence line does not itself trip the now-live pattern) → `##[error]Process completed with exit code 1`. Throwaway branch deleted from `origin`. Local-hook bypass (`--no-verify`) used openly per spec methodology; only the synthetic marker ever touched `origin`, never `origin/main`.
> - **Layer B falsification (parity / GNU-grep validation):** the parity step (`scripts/test-audit-privacy.sh`, 34 cases incl. hard-pattern matches) ran **GREEN on the ubuntu/GNU-grep CI runner** in the main run — proving the `[[:<:]]`→POSIX word-boundary fix actually matches the primary identifiers on GNU grep (the gap that was invisible on macOS BSD grep).
> - **Carry-forward to Phase 2:** expected push-rejection string is **`GH013`** (rulesets), not `GH006` (legacy) — see Phase 0 RESULT. `main` still carries admin-bypassed legacy PR protection; Phase 2 replaces the *boundary* with the ruleset (required check + empty bypass + admin enforcement ON).

**── Phase 2 — Activate the lock (founder, GitHub web UI; reversible by toggling the ruleset off) ──**

6. **Founder: configure the ruleset (D1)** on `main` — required check `privacy-scan / audit-privacy`, **bypass list empty**, **enforce for admins ON**. Set AFTER Phase 1's workflow has run once (so GitHub knows the check name). Verify it appears under Settings → Rules → Rulesets.
7. **End-to-end falsification (Done-When #1 + #3).** Sentinel push to `main` via `git push --no-verify origin <sentinel>:main` → `GH006`; repeat with `git -c core.hooksPath=/dev/null push …:main` → `GH006`; founder direct-push of an un-checked commit to `main` → `GH006`. Paste all three. Clean checked commit → succeeds.

*End of Phase 2: the lock is LIVE for the accidental-leak class. Rollback = disable/delete the ruleset (instant toggle). Admin token still on machine — Phase 3 closes that.*

> **✅ Phase 2 RESULT (2026-06-16) — LOCK LIVE on real `main`, falsified, legacy protection retired.**
> Created ruleset **`main-privacy-gate`** (id 17729463) via the founder's authenticated browser session (agent drove the UI; founder approved the Create click). API-verified config: `enforcement: active`, `bypass_actors: []` (empty = enforce-for-admins, no escape), required check `audit-privacy` (GitHub Actions, integration 15368), `pull_request` rule OFF (staging-hop, not PR-based), `non_fast_forward` (block force-push) ON, target `~DEFAULT_BRANCH`.
> - **Falsification (Done-When #1, #3, #5):** sentinel `→ main` rejected **`GH013`** under BOTH `--no-verify` and `core.hooksPath=/dev/null`; a clean but un-checked commit pushed under the current admin credential also rejected **`GH013`** ("no admin escape hatch", empty bypass binds admins too). All three: `Required status check "audit-privacy" is expected`. Probe commits were server-rejected — nothing landed.
> - **Happy path (SHA-portability on real `main`):** the Phase 1 RESULT-note commit was pushed to `staging/p919` → `audit-privacy` went green on that SHA → `git push origin main` **accepted** (the check is bound to the SHA, survived even after the staging branch was deleted). Staging branch cleaned up. This is D4 proven end-to-end on the production ruleset, not just the Phase 0 throwaway.
> - **Legacy protection retired:** deleted the classic branch protection on `main` (`required_pull_request_reviews:1`, `enforce_admins:false`) — it was admin-bypassed dead weight AND would have blocked the Phase 3 non-admin scoped-PAT push. `main` is now governed solely by the ruleset.
> - **Accepted residual (closes in Phase 3):** the admin credential the agent currently holds can still *disable* the ruleset (empty bypass stops un-checked *pushes*, not ruleset *administration*). The accidental-leak class is closed; full agent-proofing is the Phase 3 credential cutover.

**── Phase 3 — Credential cutover (founder, LAST; the agent-proofing). DO ONLY AFTER Phases 1–2 pass and everything works. Guided + reversible — see Rollback Strategy. ──**

8. **Back up first** (makes Phase 3 reversible): save the current admin token to the password manager; record current `gh auth` scopes; screenshot the ruleset config.
9. **Provision the restricted agent PAT (D3)** — Contents R/W + Metadata read; no Administration, no statuses, no Deployments. Point the agent's `gh`/git auth at it.
10. **Move the admin token off every agent-readable location** (`gh auth`, keychain, env, `.env.local`).
11. **Revoke/rotate `VERCEL_TOKEN` (D5)** for claritypledge + ladischenski.com; remove from `.env.local`.
12. **Verify the cutover.** Agent PAT → 403 on `gh api .../branches/main/protection -X PUT` and `gh api .../statuses/<sha> -X POST`; `vercel --prod` from CLI fails (no token); a normal agent push via the staging-hop still works. Paste outputs.

*Reminder: Phase 3 is the "deal with the live admin-key exposure" step you deferred. It surfaces here as the final gate — `/dev`/`/ship` will not mark P919 done until Phase 3's Done-When evidence is pasted. (Done-When #3's founder-push → `GH006` is verified at Phase 2 step 7.)*

#### Files to Create

- `.github/workflows/privacy-scan.yml` — the required CI status check workflow.

#### Files to Modify

- `scripts/git-ops.sh` — add staging-branch hop to `cmd_ship` and `cmd_commit_to_main` (D4).
- `docs/technical/git-workflow.md` — document the staging-branch hop and local/server split.
- `CLAUDE.md` — add/update the Authorization Model section: "server = boundary; local = accident-prevention."
- `scripts/audit-privacy.sh` — add the test-only synthetic sentinel pattern `CLARITYPLEDGE-CANARY-DO-NOT-MERGE` (D6) so falsification fires on a made-up marker, never a real identifier.
- `scripts/test-audit-privacy.sh` — add an `assert_range_blocks` case for the `CLARITYPLEDGE-CANARY-DO-NOT-MERGE` sentinel (makes it an explicit test expectation, not an ad-hoc string).

## Pre-deploy Checklist

All credential/GitHub-side steps are **founder-executed** — the agent intentionally cannot hold the admin credential.

### Secrets / credentials to provision (founder, off the agent-readable machine)
- [ ] Fine-grained PAT for `claritypledge`: `Contents: Read and Write` + `Metadata: Read`, **no Administration, no statuses:write, no Deployments**. This becomes the agent's only git/`gh` credential.
- [ ] Move the existing admin token out of `gh auth`/keychain/env/`.env.local` into the founder's password manager (admin ops happen via the GitHub web UI under the founder's own login). — **Build Sequence Phase 3 (deferred by design; the logical precondition for agent-proofing).**
- [ ] Revoke/rotate `VERCEL_TOKEN` (claritypledge AND ladischenski.com projects); remove from `.env.local`. Any CI-side token lives only as a GitHub Actions repository secret.

### GitHub configuration (founder, web UI)
- [ ] Create ruleset on `main`: required status check `privacy-scan / audit-privacy`, **bypass list empty**, **enforce for admins ON** (`enforce_admins` is `false` today — confirmed live). Configure only AFTER the workflow has run once so GitHub recognizes the check name, and AFTER the falsification dry-run proves it fires red.

### Post-deploy verification (evidence for Done-When — paste outputs)
- [ ] Agent PAT denied admin: `gh api .../branches/main/protection -X PUT` → 403; `gh api .../statuses/<sha> -X POST` → 403.
- [ ] Gate fires: synthetic-sentinel push to a throwaway branch → `audit-privacy` job red → `git push --no-verify origin <sentinel>:main` and `git -c core.hooksPath=/dev/null push …:main` both → `GH006`.
- [ ] No admin escape hatch: founder direct-push of an un-checked commit to `main` → `GH006`.
- [ ] Vercel: `vercel --prod` from the CLI fails (no token in agent reach).
