---
status: week
type: task
rank: 1000804.0
created_date: '2026-06-10'
tags: [infrastructure, git-hooks, security, push-deploy]
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
---

# P919: Server-side push & deploy authorization — close the agent-bypassable local-hook gap

## Problem

**Situation:** Push/deploy authorization is enforced by three local layers — a global Claude Code PreToolUse hook (`~/.claude/hooks/block-prod-deploy.sh`) that blocks `git push` / `vercel --prod` unless the human-set flag `~/.push-enabled` exists; per-repo `pre-push` hooks (cp's was just hardened in **P917**: PII scan + privacy stamp + TTY confirm); and a CLAUDE.md rule telling the agent not to set the flag.

**Complication:** A 5-lens adversarial review (`/slava:think:adversarial-review`, 2026-06-10) of the **P917-hardened** state proved this is **accident-prevention, not a security boundary** against a determined or prompt-injected agent. Reviewers executed real pushes to a bare remote. The local layer cannot, in principle, defend against an actor that controls the local machine: the agent can create the authorizing file, skip the hooks, or rewrite the hook scripts.

**Question:** How do we enforce push/deploy authorization at a layer the agent **cannot** reach — so a PII-laden or unauthorized push is blocked even when every local hook is bypassed?

**Prior incident (why this matters):** decisions.md records 297 commits that once leaked personal identifiers to `origin/main` past a broken privacy check. The public repo + a private repo (pp) holding legal/health/financial notes are both in scope.

## Appetite

**Blast radius — high.** It's the security firewall for the public repo and prod deploy. **Reversibility — high per change** (git-revert + re-run installer; GitHub settings are toggles). **Decision density — medium** — two genuine founder calls: (1) drop the admin/bypass token for agent pushes; (2) whether the target is a true injection-resistant boundary or "local = accident-guard, server = boundary."

## Solution

Move enforcement to layers the agent cannot reach. To be detailed in `/architect`; direction:

1. **Server-side content re-scan.** A required CI status check that re-runs `scripts/audit-privacy.sh` against the **pushed ref range** on GitHub. The server re-scans regardless of local hook state, `--no-verify`, `core.hooksPath`, or a rewritten local hook.
2. **Branch protection without admin bypass for agent pushes.** Make the required check non-bypassable on `main` (the current admin token bypasses it — see C5 in evidence). Decide the credential the agent pushes under so it is subject to the check. **[FOUNDER DECISION RESOLVED 2026-06-10: route ALL pushes — founder's included — through the required check. No admin escape hatch. Rationale: an escape hatch is a human-shaped hole the agent could pressure the founder toward; removing it makes the boundary real. Cost accepted: no force-push past a failing scan.]**
3. **Vercel prod deploy gated on the required check**, not on an agent-held `VERCEL_TOKEN` (ladischenski-com's token currently allows arbitrary prod deploy with no content scan — see H-deploy).
4. **Remote-allowlist guard for pp + the unguarded repos.** A shared installed pre-push that hard-blocks a push to any non-allowlisted remote URL (the exfiltration threat), plus the P917 install pattern extended to the 6 currently-unguarded repos.
5. **Authorization model decision.** **[FOUNDER DECISION RESOLVED 2026-06-10: formally accept "local hooks = accident-prevention, server = the boundary" and document it.** Not building an out-of-band per-push approval in this iteration — the server-side CI re-scan + non-bypassable branch protection IS the boundary. Document the threat model explicitly so the accident/boundary split is unambiguous.]

## Risks / Non-Goals

### Risks
- **CI re-scan diverges from local `audit-privacy.sh`.** MITIGATE: CI invokes the same script from the pushed ref; add a test that the same range yields the same verdict locally and in CI.
- **Breaking the founder's own push workflow** when admin bypass is removed. MITIGATE: design the human path (approved check or explicit escape) before tightening; exercise it once before relying on it.
- **False sense of safety from a green CI gate that never fired.** MITIGATE: per epistemic.md gate 7, plant a PII commit and confirm the server check **blocks** before trusting it.

### Non-Goals
- Do NOT attempt to make local hooks injection-proof — the review proved that is impossible (agent can rewrite them). Local hooks stay as accident-prevention only.
- Do NOT remove the `~/.push-enabled` convenience flag for the human accident-prevention use.
- Do NOT widen the `block-prod-deploy.sh` substring matcher further — the review showed it is an enumerable speed bump; a 2026-06-10 stopgap already added `core.hooksPath` / `gh` ref-mutation / broader-vercel patterns, which is as far as that layer should go.
- Do NOT change application code — this is infra only.

### Alternatives Considered
- **Keep hardening local hooks** (more matcher patterns, immutable hook files via `chflags`). REJECTED: the review demonstrated `--no-verify` / `-c core.hooksPath` / `gh api …/git/refs` bypass git hooks entirely regardless of patterns, and a local-only script the enforced party can edit is not a boundary.
- **GitHub secret-scanning / push-protection only.** PARTIAL: catches secrets, not the project's personal-identifier patterns; needed as a complement, not a replacement for the `audit-privacy.sh` re-scan.

### Rollback Strategy
Each change is independently reversible: revert the CI workflow file; toggle branch-protection settings back; restore the Vercel deploy hook; re-run `scripts/install-hooks.sh`. No data migration.

## Done-When

- [ ] A push containing a known PII pattern is **blocked server-side** even when invoked with `git push --no-verify` AND with `git -c core.hooksPath=/dev/null push` (both bypasses exercised, server still blocks — paste the failing check).
- [ ] The required check cannot be bypassed by the credential agents push under (admin-bypass decision implemented and verified).
- [ ] A Vercel production deploy cannot be triggered without the required check passing (token-only deploy path closed or gated).
- [ ] pp (and the other currently-unguarded repos) block a push to a non-allowlisted remote URL.
- [ ] The server check has been seen to FAIL on a planted PII commit (not just pass on clean) — exit/status pasted.

## Adversarial Review Findings (evidence base)

A 2026-06-10 5-lens adversarial review (`/slava:think:adversarial-review`) red-teamed the P917-hardened state. **Problem-class summary only — full exploit-level detail, severities, and the proven bypass commands are in `.private/docs/security-log.md` (gitignored; this is a public repo):**

- **The authorizing artifact is agent-controllable.** The push-authorization flag and the privacy-review stamp are local files the agent can create or forge; "don't touch them" is a rule, not a mechanism.
- **Git hooks are not a boundary.** Standard git features bypass per-repo pre-push hooks entirely, and the hook scripts are writable by the agent's run-user.
- **No server-side net.** The current admin credential bypasses branch protection; GitHub does not re-run the content scan.
- **Coverage gaps.** Several repos under `~/Projects` have no pre-push guard; one has a deploy-token path with no content scan.
- **Precision confirmed (validates the review skill):** the review did NOT re-flag the two fixes shipped earlier this session (one-shot PII override removed; global hook fails closed) and correctly refuted one overstated finding.

These motivate the server-side direction above. Exploit specifics live in `.private/docs/security-log.md`.
