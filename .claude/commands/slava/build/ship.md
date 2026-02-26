---
name: ship
description: Ship an approved feature to production. Merges feature/pN → main → pushes → Vercel deploys → closes spec (status: done, moves to features/done/).
when_to_use: When a feature is approved for production and lives on a feature branch.
---

# /ship

Ship an approved feature to production.

```
/ship p422
/ship p425
```

---

## What it does

1. **Find the branch** — looks for `feature/pN*` or `feature/pN-*`
2. **Verify clean state** — no uncommitted changes on the feature branch
3. **Run pre-commit checks** — `./scripts/pre-commit-checks.sh`
4. **Merge to main** — `git merge feature/pN --no-ff` (preserves branch history)
5. **Push** — `git push origin main` → Vercel auto-deploys
6. **Confirm** — report the deployment URL
7. **Close the spec** — move spec to `features/done/`, update frontmatter:
   - `status: done`
   - `completed_at: YYYY-MM-DD`
   - Remove `delivery_stage` line (if present)
   ```bash
   ls -d features/done/*/ 2>/dev/null | sort -V | tail -1  # find current sprint folder
   mkdir -p features/done/{folder}/uat
   git mv features/pN_name.md features/done/{folder}/
   git mv features/uat/pN.md features/done/{folder}/uat/ 2>/dev/null || true
   ```
   Commit: `chore: close pN — {title}`
8. **Run fix-kanban** — Invoke `/slava:maintain:fix-kanban`
9. **Clean up** — delete the local feature branch
10. **Ask:** "Capture learnings with /kdd? (y/n)"

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
- The pre-push git hook will still prompt for final confirmation (human in the loop)

---

## If you're on main (no feature branch)

For small work committed directly to main, just say "push" — no need for /ship.
/ship is specifically for merging a feature branch.

---

## After shipping

- Vercel deployment takes ~60s — check claritypledge.com
- If the feature had a spec: it should already be in `features/done/` (closed by /dev)
- Run `/verify` if you want visual QA of the live site

---

## Related

- `/dev` — implements the feature and creates the branch
- `/verify` — visual QA after shipping
- `/status` — see what branches are in flight
