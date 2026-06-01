---
name: ship
description: Ship an approved feature to production. Merges feature/pN → main → closes spec (status: all-done, moves to features/done/). Push is a separate step.
when_to_use: When a feature is approved for production and lives on a feature branch.
version: 1.0.0
---

# /ship

Ship an approved feature to production.

```
/ship p422
/ship p425
```

---

## Pipeline Stamp (P659)

Before any other work in this skill:
1. Read spec frontmatter
2. Set `delivery_stage: ship`
3. Append `ship` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, ship]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [ship]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `ship` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

---

## What it does

### Gate Phase — silent unless something's wrong

Run all gates, collect results. Only prompt the user on failures. The happy path is zero prompts.

1. **Find the branch** — looks for `feature/pN*` or `feature/pN-*`

**1b. Multi-P same-branch detection** — for multi-P invocations (`/ship p798 p799`): resolve branches for all P-numbers before running individual gates. If any two P-numbers resolve to the **same branch**, add this line to each of their gate reports:
   `⚠ Shares branch feature/pXXX-... with pN (co-located specs auto-close — see git-ops.sh Phase 2b)`

   If P-numbers resolve to **different branches**, no note needed — the per-P branch name in the gate report already shows independence.

**1a. Divergence check** — run `git rev-list --count main..feature/pN-*` (ahead) and `git rev-list --count feature/pN-*..main` (behind).
- If behind-count ≤ 20: record `✓ {behind} commits behind main (cherry-pick handles it)` — proceed silently.
- If behind-count > 20: **STOP** — warn "Branch is N commits behind main — rebase or manual merge needed." Propose:
  **(A) Rebase:** `git rebase main` on feature branch, resolve conflicts, then proceed normally.
  **(B) Already merged manually:** Verify by running `git log --oneline main | grep <tip-sha>` (where `<tip-sha>` is the feature branch tip from `git rev-parse feature/pN-*`). Only declare "already merged" if the SHA appears in main's log — never infer from the feature branch log. If confirmed, reply 'spec-only' to run spec closure + branch cleanup only (steps 5-7), skipping the merge.
- **Step 5 (spec closure) is mandatory regardless of which path is chosen.**
- If user replies 'spec-only': skip steps 2-4, jump directly to step 5.

2. **Verify clean state** — run `git status --short` on the feature branch.
- Clean: record `✓ Clean worktree` — proceed silently.
- Dirty: **STOP** — list uncommitted files, ask: "Commit them before merging, or discard? (commit / discard / abort)". Do not proceed to merge with a dirty worktree — uncommitted review fixes will be silently lost.

2.5–2.7. **Run ship gates** — execute the mechanical gate check:
   ```bash
   ./scripts/ship-gates.sh pN
   ```
   - Exit 0: record gate results from script output in gate report — proceed silently.
   - Exit non-zero: **hard stop** — "Gate check failed. Fix listed issues. Do NOT proceed." Do NOT ask y/n. Do NOT proceed.

3. **Run pre-commit checks** — `./scripts/pre-commit-checks.sh`
   - Pass → record `✓ Pre-commit checks passed` — proceed silently.
   - Fail → **STOP** — show output, fix issues.

3.5. **Check Pre-deploy Checklist** — read the spec and look for a `## Pre-deploy Checklist` section.
   - No section → record `✓ No pre-deploy checklist` — proceed silently.
   - Section exists → **STOP** — show each item, ask: "These infra steps must be done before pushing. Have they all been applied to prod? (y = proceed / n = stop and apply them first)". If user says "n": stop. Do NOT merge.

3.6. **Deploy manifest check** — run `./scripts/check-deploy-manifest.sh --env prod`.
   - No drift → record `✓ No deploy drift` — proceed silently.
   - Drift detected → **STOP** — show output and fix commands. Ask: "Deploy these before merging? (y = run the fix commands now / n = stop, I'll handle it manually)". If user says "y", run the suggested commands, re-run check to confirm. Do NOT merge with drift.
   - **Manifest stamp ordering:** If deploying migrations produces an updated `supabase/deploy-manifest.json`, commit that stamp on the **feature branch** (from inside the worktree), NOT directly on main. Stamping to main before merge creates a manifest conflict when the feature branch is later rebased onto main — a predictable failure every time. The stamp travels to main naturally via the merge in step 4.

3.65. **Deferrals manifest echo** — re-run the same grep as /fix step 0b against the spec being shipped. This is the last catch.

   ```bash
   grep -n -iE 'file separately|track separately|out[- ]of[- ]scope( for| here| unless|:|\b)|punt(ed|ing)? to|left to a separate|separate spec|follow[- ]up (spec|ticket|bug)|defer(red)? (to|until|for now)|future spec|not in scope for this|acknowledged but (out of scope|separate)' features/pN_*.md
   ```

   For each hit: a P-number must be named inline in the same paragraph OR in the feature branch's commit log since main:
   ```bash
   git log --oneline main..HEAD | grep -oE 'p[0-9]+'
   ```

   Count:
   - `K` = P-numbers named inline in deferral paragraphs + P-numbers newly introduced in the feature branch commits.
   - `Unnamed` = grep hits with no P-number in the paragraph AND no matching commit.

   If `Unnamed > 0` → **STOP** — "Unnamed deferrals in pN spec. Re-run /fix step 0 to file them, then retry /ship."
   Otherwise record `K` for the gate report and continue.

**Gate report** — if all gates passed, print the summary and proceed immediately (no prompt):
```
/ship pN — all gates passed.
  ✓ Clean worktree
  ✓ Gates 2.5-2.7 passed (ship-gates.sh)
  ✓ Pre-commit checks passed
  ✓ No pre-deploy checklist
  ✓ No deploy drift
  ✓ Deferrals: {K} filed during fix, 0 unnamed
  ✓ 3 commits behind main (cherry-pick handles it)
Cherry-picking...
```

### Merge Phase

3.7. **Ship via git-ops.sh** — assert main-repo root, then invoke the journaled ship subcommand:
   ```bash
   # Ensure we're at the main repo root — gates 1–3.65 may have run from inside the worktree
   REPO_ROOT=$(git rev-parse --show-toplevel)
   if [[ "$REPO_ROOT" == *".claude/worktrees/"* ]]; then
     cd ~/Projects/public/claritypledge
   fi
   ./scripts/git-ops.sh ship pN
   ```
   This handles atomically: cherry-pick all feature commits → close spec (move to `features/done/`, update frontmatter) → delete branch + worktree → print "Ready to push."

   **On conflict:** `git-ops.sh ship` prints instructions. Resolve in the main worktree, then:
   ```bash
   ./scripts/git-ops.sh ship pN --resume
   ```

4. **Run fix-kanban** — Invoke `/slava:maintain:fix-kanban`

5. **Ready to push** — print:
   ```
   Ship complete. Ready to push:
     git push origin main
   Vercel auto-deploys on push.
   ```

6. **Post-push prod-health watch (P866)** — when `e2e/prod-health-smoke.spec.ts` exists. After "Ready to push", the user runs `git push origin main` themselves (never auto-pushed). Once the user **confirms the push** (this skill never auto-detects it — it asks):

   a. **Wait for the new deploy to be READY.** Poll the Vercel deployments API for the newest production deployment until `readyState == "READY"` (max ~3 min, 15s interval). `VERCEL_TOKEN` from `.env.local`; `projectId` from the local gitignored `.vercel/project.json` (never hardcode it):
      ```bash
      export VERCEL_TOKEN=$(grep -E '^VERCEL_TOKEN=' .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"'')
      PROJECT_ID=$(jq -r .projectId .vercel/project.json)
      curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
        "https://api.vercel.com/v6/deployments?projectId=$PROJECT_ID&target=production&limit=1" \
        | jq -r '.deployments[0].readyState'   # poll until READY
      ```
      **Fallback** (token lacks deploy-read scope — `vercel projects ls --token "$VERCEL_TOKEN"` exits non-zero — or `.vercel/project.json` is absent): a fixed ~90s wait after the confirmed push, then smoke. A brief alias-propagation lag is acceptable for an alert-only gate; re-run once if a transient network error is suspected.

   b. **Smoke the prod alias** (public routes — no per-deployment URL, no protection bypass):
      ```bash
      PROD_SMOKE_URL=https://claritypledge.com npm run smoke:prod
      ```

   c. **On pass:** print `Prod health smoke passed.` Then continue to the questions below.

   d. **On fail:** surface the failing routes/errors inline (already redacted by the spec), then offer three options — **never auto-act; every option is a prod change → explicit OK:**
      - **(A) Instant rollback** — `vercel rollback --token "$VERCEL_TOKEN"` reverts prod to the previous deployment in ~10s. Use when the error is clearly a regression from this deploy.
      - **(B) Fix forward** — start a `/fix` session. Use when it's a known issue with a quick fix.
      - **(C) Triage as benign** — add the pattern to `PROD_HEALTH_ALLOWLIST` in `e2e/helpers/prod-health.ts`, commit, push. Use when it's known-benign vendor noise not yet allowlisted.

   **Then ask — two questions in one message:**
   "Also run `/verify pN` against prod? (y = visual UAT, recommended for UI changes / n = skip)
   Capture learnings with /kdd? (y/n)"

   If user picks y for `/verify` → invoke `/verify p{N}` (auto-detects PRODUCTION mode on main).

   **If `e2e/prod-health-smoke.spec.ts` does NOT exist** (older checkout): skip the watch and fall back to the prior offer — "Run post-deploy smoke test? (y = `/verify pN` against prod / n = skip) · Capture learnings with /kdd? (y/n)".

---

## Usage

```bash
/ship p422                    # ship feature/p422-* branch
/ship p422 p425               # ship multiple features at once (sequential)
```

---

## Safety checks

- Refuses if you're not on `main` after merge (something went wrong)
- Refuses if pre-commit checks fail — fix first, then retry

---

## If you're on main (no feature branch)

For small work committed directly to main, just say "push" — no need for /ship.
/ship is specifically for merging a feature branch.

---

## After shipping

- The spec is closed by /ship step 5 — /dev leaves it at `delivery_stage: dev`, NOT done. If the spec is still in `features/` after /ship completes, step 5 failed — investigate before continuing.
- Step 6 runs the post-push prod-health watch (P866): waits for the new deploy to be READY, smokes the public routes against prod, and on failure offers rollback / fix-forward / triage — never auto-acting. It then offers `/verify` (production mode) for visual UAT, recommended for UI changes.
- **Push requires explicit user action.** `/ship` prints "Ready to push" and stops. The user runs `git push origin main` when ready. Vercel auto-deploys on push.
- **Prod migrate is NOT pre-approved** — `./scripts/migrate.sh --env prod` has its own blast radius (schema changes, RLS). Always gate it separately.

---

## Related

- `/dev` — implements the feature and creates the branch
- `/verify` — visual QA after shipping
- `/status` — see what branches are in flight
