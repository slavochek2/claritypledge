---
status: done
type: task
rank: 1000937.0
created_date: '2026-06-16'
tags: [infrastructure, vercel, security, deploy, privacy]
delivery_stage: done
pipeline_ran: [create-spec]
---

# P944: ladischenski.com Vercel team-split — deploy-credential isolation

> Delegated Vercel half of **P919** Done-When #4. P919 itself closes on its GitHub-credential half (#2). This spec closes the remaining direct-deploy bypass.

## Problem

**Situation:** P919 Phases 1+2 closed the *git-push* privacy bypass — a GitHub ruleset (`main-privacy-gate`, required check `audit-privacy`, no bypass actors) now blocks any un-privacy-scanned commit from reaching `main`, and thus claritypledge.com production, via git.

**Complication:** The agent still holds a Vercel token (`VERCEL_TOKEN` in `cp/.env.local`) that is **team-scoped** to `team_n9ENfrLfDLfX9oXkLd3eZAFV` ("Slava's projects"), which contains **both** cp and ladischenski.com. With it the agent can run `vercel deploy --prod` against the **cp** project directly — publishing whatever is in the local working directory straight to claritypledge.com, bypassing the GitHub repo and the CI privacy gate entirely. Verified: there is **no ambient `vercel login` session** (`vercel whoami` → no credentials; `auth.json` empty), so this token is the agent's *only* Vercel deploy capability.

**Question:** How do we ensure the agent retains the ability to auto-deploy ladischenski.com (which deploys *uncommitted* content — generated posters, client offer pages — and so genuinely cannot use git-integration), while having **no** credential that can deploy cp?

## Appetite

Medium-high blast radius (transfers a **live** custom domain, `ladischenski.com`, between Vercel teams). Partially reversible (the project/domain can be transferred back; tokens can be re-minted). Low decision density — the approach is decided; remaining work is execution + verification.

## Solution

Move the **ladischenski.com** project (and its domain) to a **new, free Hobby Vercel team**. cp stays in "Slava's projects." Then:

1. Mint a token **team-scoped to the new ladischenski team** — it can deploy ladischenski but, being a different team from cp, **cannot deploy or read cp**.
2. Store it in `ladischenski-com/.env.local`; repoint the 3 CLI-deploy skills to read it from there.
3. **Revoke** the current team tokens (`claude new`, `claritypledge-dev-2026-04-21`) and **remove `VERCEL_TOKEN` from `cp/.env.local`**. This is the actual close — the agent loses all cp-deploy capability.
4. cp's post-deploy readiness poll falls back to its existing no-token path (`ship.md` ~line 146: fixed wait + smoke); `vercel rollback` and `vercel env add` for cp become **manual founder actions** (dashboard).

## Risks / Non-Goals

### Risks
- **Live-domain transfer gap.** ladischenski.com uses All-Inkl nameservers (`ns5/ns6.kasserver.com`) with an A record → `76.76.21.21` (Vercel anycast). DNS does **not** change on transfer — only the Vercel-side domain association. Risk is limited to a brief remove-from-old-project / add-to-new-project window. *Mitigation:* do the domain move quickly, verify with `curl -I https://ladischenski.com` immediately after; cert is already issued and the A record is unchanged, so re-validation should be fast.
- **Hobby tier is non-commercial-use only.** ladischenski.com is a personal site → compliant. *Do not* move it to Hobby if it ever becomes commercial (would need Pro).
- **Minting the team-scoped token may require an account-level token.** Vercel CLI mint (`vercel tokens add`) may reject team-only tokens as the *authenticating* credential. *Mitigation:* mint the new team-scoped token via the **dashboard** (its scope dropdown offers the new team directly), or use a short-lived Full-Account token created+revoked for the mint.

### Non-Goals
- Do NOT move or alter the **cp** project or its team.
- Do NOT leave ANY cp-deployable token in agent-readable storage (`.env.local`, shell profile) after cutover.
- Do NOT attempt project-scoped tokens — empirically broken (see Alternatives).
- Do NOT change ladischenski.com's DNS/nameservers at All-Inkl.
- Do NOT re-enable a standing cp deploy credential to "keep `/ship` rollback automated" — manual is the intended end-state.

### Alternatives Considered
- **Project-scoped Vercel token** (`vercel tokens add --project`): the clean fix that would avoid a team split. **Empirically falsified** — both the REST API and the upgraded v54 CLI return `projectId is not supported (400)` on this account (2026-06-16). Documented but non-functional ("still in development" per Vercel Community). This is why the team-split is necessary.
- **Drop the standing token entirely** (manual ladischenski deploys): works today, zero infra, but loses unattended poster/offer auto-deploy. Rejected — founder elected to keep automation.
- **Vercel project-level Deployment Protection / git-only deploys**: does not exist; Deployment Protection gates *viewing* deployments, not *creating* them via CLI.

### Rollback Strategy
Transfer the ladischenski project + domain back to "Slava's projects"; restore `VERCEL_TOKEN` in `cp/.env.local` from a freshly minted team token; revert the 3 skill edits + `ship.md` edit (single git revert). DNS untouched throughout, so rollback has no DNS dependency.

## Migration Plan

1. **[founder, dashboard]** Create a new Hobby Vercel team (e.g. "ladischenski").
2. **[founder, dashboard]** Transfer the `ladischenski.com` project + domain from "Slava's projects" to the new team.
3. **[agent]** Verify the live site: `curl -I https://ladischenski.com` returns 200; spot-check a page renders.
4. **[founder/agent]** Mint a token **team-scoped to the new team**; store in `ladischenski-com/.env.local`.
5. **[agent]** Repoint deploy skills to ladischenski's own token: `.claude/commands/slava/content/gen-poster.md`, `.claude/commands/slava/client/create-offer.md`, and the `upload-to-ladischenski-temp` flow (currently read `VERCEL_TOKEN` from cp's `.env.local`).
6. **[agent]** Verify scope: new token **CAN** deploy ladischenski (`vercel deploy --prod` succeeds) and **CANNOT** access cp (`GET /v9/projects/{cp_id}` → 403/404 with the new token).
7. **[agent]** Update `ship.md`: document that cp readiness uses the no-token fallback, and `vercel rollback` / `vercel env add` for cp are manual founder actions.
8. **[founder/agent]** Revoke `claude new` + `claritypledge-dev-2026-04-21`; remove `VERCEL_TOKEN` from `cp/.env.local`.
9. **[agent]** Confirm the agent can no longer deploy cp: with cp's `.env.local` token gone and no ambient login, `vercel deploy --prod` from cp fails for lack of credentials.

## Done-When

> **Pivot (2026-06-16):** Hobby team creation blocked (Vercel allows only one Hobby team per account — Create Team offers only Pro Trial). Executed **Option A** instead: ladischenski.com switched to git-based auto-deploy; all Vercel tokens revoked; agent loses all Vercel deploy capability (cp AND ladischenski). ladischenski skills repointed to `git push origin main`. This closes the security hole with fewer moving parts than the team-split.

- [x] `VERCEL_TOKEN` is absent from `cp/.env.local` and `ladischenski-com/.env.local`; `claude new` + `claritypledge-dev-2026-04-21` are revoked.
- [x] Evidence: `vercel whoami` → "No existing credentials found"; `vercel deploy --prod` from cp dir cannot proceed (2026-06-16).
- [x] ladischenski.com git integration wired: push to `main` → Vercel auto-deploy. First git-triggered prod deploy confirmed READY; `curl -I https://ladischenski.com` → `HTTP/2 200`, `age: 0` (2026-06-16).
- [x] 3 deploy skills repointed to `git add … && git commit && git push origin main` (`gen-poster.md`, `create-offer.md`, `upload-to-ladischenski-temp.md`).
- [x] `ship.md` updated: deploy-status poll → fixed 90s wait; rollback → Vercel dashboard instruction.
- [x] P919 Done-When #4 marked closed; P919 ready to close on its remaining items (#1, #2, #3, #5).
