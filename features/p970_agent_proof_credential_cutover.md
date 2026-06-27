---
status: week
type: task
rank: 1000952.0
created_date: '2026-06-27'
tags: [infrastructure, security, push-deploy, credentials]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P970: Agent-proof credential cutover — close P919 Phase 3 so the agent can't disable its own privacy gate

## Problem

**Situation:** The public-repo PII boundary built in **P919** is live and strong. The `main-privacy-gate` ruleset (id `17729463`, enforcement `active`, verified 2026-06-27) requires the `audit-privacy` GitHub Actions check, has `bypass_actors: []`, and reports `current_user_can_bypass: "never"` — so a PII-laden or unchecked push to `main` is rejected server-side for everyone, including the admin, and force-push/branch-deletion are blocked. The server-side scan is proven to fire (synthetic sentinel rejected, `GH013`, 2026-06-16).

**Complication:** The agent's `gh` credential still has full **`repo`** scope (verified 2026-06-27: `Token scopes: 'gist', 'read:org', 'repo', 'workflow'`). `repo` includes Administration on an owned repo. Nobody can *bypass* the rule on a push — but the agent holding admin can **delete or disable the ruleset itself** (`gh api repos/slavochek2/claritypledge/rulesets/17729463 -X DELETE`, or PATCH `enforcement` to `disabled`), push freely, then recreate it. The boundary therefore stops accidents and bypass-on-push, but **not a determined or prompt-injected agent** that neuters the gate first. This is the one unchecked Done-When box in the P919 spec.

**Question:** How do we provision and route the agent's push credential so it can push commits but **cannot administer the repo** (cannot delete, disable, or edit the `main-privacy-gate` ruleset), and remove the admin-capable token from any agent-readable location — without breaking the founder's own push and admin workflow?

**Prior context:** decisions.md records 297 commits that once leaked personal identifiers to public `origin/main` past a broken check. P919 closed the accidental-leak class; this spec closes the deliberate/injected-agent class that P919 explicitly deferred to "Phase 3."

## Appetite

**Blast radius — high.** It is the credential that authorizes every push to the public repo; a misconfiguration can lock out the agent's push path or (worse) leave the boundary open while appearing closed. **Reversibility — high per step:** re-mint a token, re-add a scope, re-login `gh` — all toggles, no data migration. **Decision density — low-medium:** the mechanism is decided (scoped fine-grained PAT, no Administration); open choices are credential *type* (fine-grained PAT vs GitHub App) and where the founder's admin path lives. These are **founder-only steps by design** — the agent intentionally must not hold the admin credential, so the agent cannot fully self-execute this.

## Solution

Move the agent's push credential to one that structurally cannot disable the gate, and take the admin credential out of agent reach. Direction (detail in `/architect` if needed; most steps are founder-run):

1. **Provision a least-privilege agent push credential.** A **fine-grained PAT** scoped to **Contents: Read/Write + Metadata: Read only** on `slavochek2/claritypledge` — **no Administration**. (GitHub App with the same permission set is the alternative — see Alternatives Considered.) The credential's inability to touch rulesets is the whole point.

2. **Verify the credential is structurally incapable of administering the gate.** With the new credential, attempt to disable the ruleset and confirm denial:
   - `gh api repos/slavochek2/claritypledge/rulesets/17729463 -X DELETE` → must return **403/404**, not 200.
   - `gh api repos/slavochek2/claritypledge/rulesets/17729463 -X PUT/PATCH` (enforcement→disabled) → must return **403/404**.
   - Paste the denial output as Done-When evidence (epistemic.md gate 7 — exercise the failure path).

3. **Route the agent push path through the scoped credential.** The agent's `gh auth` / push remote uses the fine-grained PAT, not the current full-`repo` OAuth token. The full-`repo`/admin token is **removed from every agent-readable location** (`gh auth` keyring, env vars, `.env.local`, any dotfile) and lives only in the founder's own interactive session / off-machine.

4. **Preserve a founder admin path that is NOT agent-readable.** The founder retains repo admin via the GitHub web UI under their own login (or a key the agent has no token for), so the ruleset can still be edited/rolled back by a human. Document the split.

## Risks / Non-Goals

### Risks
- **Lockout of the agent push path.** A too-narrow scope (e.g. missing Metadata:Read) can break `gh`/push. MITIGATE: provision + smoke-test a real push to a `staging/*` branch before revoking the old token; keep the old token recoverable until the new path is proven green.
- **False closure — token swapped but admin token still reachable.** The boundary is only real once the admin token is gone from ALL agent-readable locations. MITIGATE: after cutover, grep `gh auth status`, env, and `.env.local` to confirm no `repo`/admin-scoped token remains; the verification in Solution #2 must be run *as the agent's resolved credential*, not the founder session.
- **Fine-grained PAT expiry.** Fine-grained PATs require an expiry; an expired token silently breaks pushes. MITIGATE: record expiry date + renewal owner in the accounts registry (`.private/docs/accounts.md`); prefer a GitHub App (no expiry) if renewal toil is unacceptable — see Alternatives.
- **Breaking the founder's own workflow.** MITIGATE: confirm the founder's web-UI admin path and a working human push once before relying on it.

### Non-Goals
- Do **NOT** weaken, edit, or recreate the `main-privacy-gate` ruleset — it is correct as-is. This spec changes only the *credential*, not the gate.
- Do **NOT** widen `block-prod-deploy.sh` or any local hook — local hooks remain accident-prevention only (P919 settled this).
- Do **NOT** re-touch the Vercel deploy path — already closed by P944 (`VERCEL_TOKEN` revoked, CLI logged out).
- Do **NOT** include the cross-repo exfiltration guard for pp / private repos — different threat, tracked in `pp/tasks/p23`.
- Do **NOT** change any application code — this is infra/credential only.

### Alternatives Considered
- **GitHub App installation token (instead of fine-grained PAT).** Pros: no expiry, finer audit trail, installation-scoped. Cons: more setup (app registration, private key, token-minting step in the push path). Either satisfies the core requirement (Contents-write, no Administration); choose at `/architect`. The PAT is the lower-runtime-surface path (no token-minting hop); the App removes the expiry failure mode.
- **Leave admin token in place, rely on `current_user_can_bypass: never`.** Rejected: that property blocks bypass *on push*, not *deletion of the ruleset*. An admin-scoped token can DELETE the ruleset entirely, which removes the requirement before pushing. This is exactly the open hole.
- **Org-level / SSO-enforced restrictions.** Rejected for now: the repo is under a personal account, not an org; introducing an org is disproportionate to closing this one credential gap.

### Rollback Strategy
- Re-login `gh` with the founder's full-`repo` token (or re-mint it) — restores the prior push path instantly.
- The ruleset is untouched, so there is nothing to roll back on the enforcement side.
- No data migration; every step is a credential toggle.

## Done-When

- [x] The agent's resolved push credential has **no Administration scope** (verified 2026-06-27): non-destructive admin probe `gh api repos/slavochek2/claritypledge/branches/main/protection` → `403 "Resource not accessible by personal access token"`. (Used the read-only protection-GET probe rather than an actual ruleset `DELETE`, which would have removed the gate if the token *had* been admin — same proof, no destructive action.)
- [x] No `repo`-scoped or admin-capable GitHub token remains in the `gh` keyring: `gh auth status` shows `Token: github_pat_…` (fine-grained), not the prior `gho_` OAuth token with `repo` scope. *(Note: `.env.local` still holds a separate scoped `GITHUB_PAT` "Mira" token — Contents+PRs R/W, non-admin — left as-is.)*
- [x] A normal agent push to a `staging/*` branch still succeeds (2026-06-27: empty-commit test push → `PUSH OK`, full pre-commit + privacy gate ran), and `main` still requires the green `audit-privacy` check (ruleset `active`, unchanged).
- [x] The founder retains an admin path to edit/disable the ruleset that is NOT reachable from the agent's session — GitHub web UI under the founder login (unaffected by the keyring swap).
- [x] The open Done-When box in `features/done/2026-06-10/p919_server_side_push_deploy_authorization.md` is checked, with a pointer to this spec. **Remaining:** record the `cp-agent-push` credential + expiry in the accounts registry (`.private/docs/accounts.md`) — see Next.

## Residual / Next

- **Old `gho_` OAuth token not revoked on GitHub's side.** The swap removed it from the machine, but the "GitHub CLI" OAuth-app grant still exists in the founder's GitHub account and could be re-authorized via `gh auth login` (interactive). Optional hardening: revoke the GitHub CLI OAuth app authorization in GitHub → Settings → Applications. Accepted residual for now (no longer agent-readable).
- **Record the credential** in `.private/docs/accounts.md`: name `cp-agent-push`, scope Contents R/W + Metadata R, repo `slavochek2/claritypledge`, expiry (founder-set on creation), renewal owner = founder.
