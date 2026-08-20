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
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `ship` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill, (d) **`ship` is not in `pipeline_plan`** → there is no "skill before `ship`" to look up, so skip the check and fall through to step 5. (`/ship` is deliberately absent from `/pick-flow`'s command list; 26 of 35 plans omit it. Do not add it there — that would resolve the predecessor to `verify` and hard-stop the ship path whenever `/verify` was skipped or `/park` was used.)
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

---

## What it does

### Gate Phase — silent unless something's wrong

Run all gates, collect results. Only prompt the user on failures. The happy path is zero prompts.

1. **Find the branch** — looks for `feature/pN*` or `feature/pN-*`

**1b. Multi-P same-branch detection** — for multi-P invocations (`/ship p798 p799`): resolve branches for all P-numbers before running individual gates. If any two P-numbers resolve to the **same branch**, add this line to each of their gate reports:
   `⚠ Shares branch feature/pXXX-... with pN (co-located specs auto-close — see git-ops.sh Phase 2b)`

   If P-numbers resolve to **different branches**, no note needed — the per-P branch name in the gate report already shows independence.

**1a. Divergence check** — run `git rev-list --count feature/pN-*..main` (behind). Record: "Branch is N commits behind main — cherry-pick handles this regardless; a gap of 100+ may indicate a stale worktree worth checking." **Do not stop; proceed regardless of behind-count.** git-ops.sh ship cherry-picks feature commits onto main's current HEAD — divergence depth is irrelevant; conflicts are caught per-commit at apply time, not by a pre-check. **Special case:** if the branch tip SHA already appears in `git log --oneline main`, reply 'spec-only' to run spec closure + branch cleanup only (steps 5-7), skipping the cherry-pick. Step 5 (spec closure) is mandatory on every path.

2. **Verify clean state** — run `git status --short` on the feature branch.
- Clean: record `✓ Clean worktree` — proceed silently.
- Dirty: **STOP** — list uncommitted files, ask: "Commit them before merging, or discard? (commit / discard / abort)". Do not proceed to merge with a dirty worktree — uncommitted review fixes will be silently lost.

2.5–3.65. **Run ship gates** — execute the mechanical gate check:
   ```bash
   ./scripts/ship-gates.sh pN
   ```
   The script is the **sole source of gate truth** — it runs gates 2.5 (spec status), 2.7 / 2.7b (code-review artifact), **3.5 (pre-deploy checklist)**, and **3.65 (deferrals)**, reading the spec branch-authoritatively. **Relay its stdout verbatim as the gate report — never re-type your own `✓` lines** (a hand-composed report can claim a gate passed that never ran; that was the whole point of folding these in).
   - Exit 0: paste the script output, proceed silently.
   - Exit non-zero: **hard stop** — paste the failing `[GATE …] FAIL:` lines, "Fix listed issues. Do NOT proceed." Do NOT ask y/n. Do NOT proceed. For gate 3.5, "fix" = apply the infra step and tick the box in the spec (the ticked box is the acknowledgement) or mark the item N/A.

3. **Run pre-commit checks** — `./scripts/pre-commit-checks.sh`
   - Pass → record `✓ Pre-commit checks passed` — proceed silently.
   - Fail → **STOP** — show output, fix issues.

3.5. **Pre-deploy checklist** — now enforced mechanically by `ship-gates.sh` gate 3.5 (step 2.5–3.65 above): any unticked `- [ ]` item under a `Pre-deploy Checklist` heading is a hard FAIL. No separate y/n ask — the ticked box (or an N/A prose section) is the auditable acknowledgement. This is a stricter, un-self-attestable replacement for the old verbal confirm.

3.6. **Deploy manifest check** — run `./scripts/check-deploy-manifest.sh --env prod`.
   - No drift → record `✓ No deploy drift` — proceed silently.
   - Drift detected → **STOP**. Route by drift type + branch location:
     - **Migration drift while on a worktree feature branch** (the common case — `/dev` defaults to worktrees): do NOT migrate before merge. `stamp-deploy-manifest.sh` refuses to run from a worktree, and migrating from main pre-merge dirties main's manifest → a guaranteed cherry-pick conflict. Route merge-first: continue through the merge (step 3.7 — push stays held, so there is no code-without-schema window), THEN migrate prod from the main repo, THEN `git-ops.sh commit-to-main` the stamp. **Still ASK before the prod migrate** (prod migrate is never pre-approved — see "After shipping" + CLAUDE.md ALWAYS-ASK): "Migrate prod now? (runs after the merge; push stays held) (y/n)". `migrate.sh --env prod` reads the PAT keychain-first — a stale keychain entry shadows a fresh `.env.prod` token (decisions.md 2026-06-02 [process]). **P887 gates:** the script itself enumerates every pending migration and refuses without explicit ack — interactive `y`, or `--yes` for non-interactive runs. Pass `--yes` only after this ASK has shown the user the enumerated pending list; a held-back client-breaking migration in that list means STOP — ship its frontend first (P886). Pending migrations carrying `-- requires-frontend: <sha>` hard-block the apply (even with `--yes`) until that commit is an ancestor of `origin/main`; pre-commit requires that marker (or `-- client-safe: <reason>`) on any new migration with client-breaking shapes. After a successful apply the script auto-runs `node scripts/prod-smoke-test.mjs` (mandatory, not optional) and exits non-zero on smoke failure — treat that as a P886-class schema-ahead-of-client incident: offer rollback of the offending grant/migration or immediate frontend ship.
     - **Function drift, or migration drift NOT on a worktree:** show output + fix commands. Ask: "Deploy these before merging? (y = run the fix commands now / n = stop, I'll handle it manually)". On "y", run the suggested commands, re-run check to confirm. Do NOT merge with drift.
   - **Manifest stamp ordering:** the migrate run that applies the migration stamps `supabase/deploy-manifest.json`. For the worktree merge-first path above, that stamp lands on **main** — commit it via `git-ops.sh commit-to-main` after the merge. For a non-worktree migrate-before-merge, commit the stamp on the **feature branch** (NOT directly on main) so it rides the merge — stamping main pre-merge creates a predictable manifest conflict.

3.65. **Deferrals** — now scanned mechanically by `ship-gates.sh` gate 3.65 (step 2.5–3.65 above): every deferral phrase should trace to a P-number (named inline, or a *new* spec filed in the branch commits — the feature's own pN is excluded). This is a **WARN, not a block** — natural-language deferral-detection has irreducible false positives, so blocking a merge on it is wrong. The value is that the scan always runs and is always in the gate report; you judge whether a flagged phrase is a real scope-drop. The grep (with the `/usr/bin/grep` ugrep-safety fix) lives in the script — do not re-run it by hand.

**Gate report** — the gate report is the **verbatim stdout of `ship-gates.sh`** plus the two agent-run checks that remain outside it (clean worktree, pre-commit, deploy drift). Do not re-type `✓` lines for anything the script covered — paste what it printed. Example on a clean run:
```
/ship pN — all gates passed.
  ✓ Clean worktree
  [GATE 2.5] PASS: spec status is 'qa' (from branch feature/pN-...)
  [GATE 2.7] PASS: code review artifact present (N code entries)
  [GATE 3.5] PASS: no pre-deploy checklist
  [GATE 3.65] PASS: no deferral phrases
  ✓ Pre-commit checks passed
  ✓ No deploy drift
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

   **On conflict:** `git-ops.sh ship` prints instructions. Resolve in the main worktree, `git add` the resolution, then:
   ```bash
   ./scripts/git-ops.sh ship pN --resume
   ```
   **Do not run `git cherry-pick --continue` yourself.** `--resume` runs it for you when `CHERRY_PICK_HEAD` is still set; a manual `--continue` clears that and forces the slower `--mark-landed` verify-then-record recovery path on the next `--resume` (still safe, just an extra step — see decisions.md 2026-06-28 [process] P972).

4. **Run fix-kanban** — Invoke `/slava:maintain:fix-kanban`

5. **Ready to push** — print:
   ```
   Ship complete. Ready to push:
     git push origin main
   Vercel auto-deploys on push.
   ```

6. **Post-push prod-health watch (P866)** — when `e2e/prod-health-smoke.spec.ts` exists. After "Ready to push", the user runs `git push origin main` themselves (never auto-pushed). Once the user **confirms the push** (this skill never auto-detects it — it asks):

   a. **Wait for the new deploy to be READY.** Fixed ~90s wait after the confirmed push, then smoke. (VERCEL_TOKEN was removed in P944 — no API polling available; alias-propagation lag is acceptable for an alert-only gate; re-run once if a transient network error is suspected.)

   b. **Smoke the prod alias** (public routes — no per-deployment URL, no protection bypass):
      ```bash
      PROD_SMOKE_URL=https://claritypledge.com npm run smoke:prod
      ```

   c. **On public-smoke pass:** print `Prod health smoke passed.` Then run the **authenticated DB smoke (P889)** — the public smoke never signs in, so prod-config auth regressions (stale baked `VITE_SUPABASE_*`, prod/test schema skew) pass it silently:
      ```bash
      node scripts/prod-smoke-test.mjs
      ```
      Exercises login → profile read → story INSERT/SELECT/DELETE → anon-access checks via the persistent smoke account (writes + deletes one test story on prod per run — accepted; it already runs daily via `/day`). On pass: print `Authenticated prod smoke passed.` Then continue to the questions below. On fail: **any non-zero exit is a FAIL** → treat exactly as a public-smoke failure → step d. Never a silent skip. Sole exception: `scripts/prod-smoke-test.mjs` does not exist on this checkout — say so explicitly and continue public-smoke-only with a warning (this inner fallback is independent of the outer `e2e/prod-health-smoke.spec.ts` fallback below).

   d. **On fail (either smoke):** surface the failing routes/errors inline (already redacted by the spec), then offer three options — **never auto-act; every option is a prod change → explicit OK:**
      - **(A) Instant rollback** — Vercel dashboard → claritypledge.com → Deployments → previous deploy → "..." → Promote to Production. ~10s. Use when the error is clearly a regression from this deploy.
      - **(B) Fix forward** — start a `/fix` session. Use when it's a known issue with a quick fix.
      - **(C) Triage as benign** — add the pattern to `PROD_HEALTH_ALLOWLIST` in `e2e/helpers/prod-health.ts`, commit, push. Use when it's known-benign vendor noise not yet allowlisted.

   **Then ask — two questions in one message:**
   "Also run `/verify pN` against prod? (y = visual UAT, recommended for UI changes / n = skip)
   Capture learnings with /kdd? (y/n)"

   If user picks y for `/verify` → invoke `/verify p{N}` (auto-detects PRODUCTION mode on main).

   **If `e2e/prod-health-smoke.spec.ts` does NOT exist** (older checkout): skip the entire watch — both smokes — and fall back to the prior offer — "Run post-deploy smoke test? (y = `/verify pN` against prod / n = skip) · Capture learnings with /kdd? (y/n)".

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
- Step 6 runs the post-push prod-health watch (P866 + P889): waits for the new deploy to be READY, smokes the public routes against prod, then runs the authenticated DB smoke (`scripts/prod-smoke-test.mjs`), and on failure of either offers rollback / fix-forward / triage — never auto-acting. It then offers `/verify` (production mode) for visual UAT, recommended for UI changes.
- **Push requires explicit user action.** `/ship` prints "Ready to push" and stops. The user runs `git push origin main` when ready. Vercel auto-deploys on push.
- **Prod migrate is NOT pre-approved** — `./scripts/migrate.sh --env prod` has its own blast radius (schema changes, RLS). Always gate it separately. The script enforces the three P887 gates structurally: it prints the full pending-migration list and refuses to apply without ack (interactive `y` or `--yes`); a pending migration carrying `-- requires-frontend: <sha>` hard-blocks the apply — `--yes` does not bypass — until that commit is an ancestor of `origin/main`; and after any successful prod apply it auto-runs the prod smoke test, exiting non-zero on failure (possible schema-ahead-of-client breakage, P886 class). Authoring side: pre-commit requires a `requires-frontend` or `client-safe` annotation on new migrations containing client-breaking shapes.

---

## Related

- `/dev` — implements the feature and creates the branch
- `/verify` — visual QA after shipping
- `/status` — see what branches are in flight
