---
name: park
description: "Park a feature on its branch without merging to main. Use when work is done but you're not ready to ship yet."
when_to_use: "When a feature is complete (or verified) on its branch but you want to defer merging. Triggered by /park, 'park this', 'done but don't merge yet'."
version: 1.0.0
---

# /park

Park a feature on its branch without merging. No review gates, no prompts — just a frontmatter stamp.

```
/park p665
```

---

## Pipeline Stamp (P659)

Before any other work in this skill:
1. Read spec frontmatter
2. Set `delivery_stage: park`
3. Append `park` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, park]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [park]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `park` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → proceed silently (parking is always valid as an ad-hoc action).

---

## What it does

1. **Find the spec** — resolve P-number from argument. Look in `features/p{N}_*.md` in the feature worktree or main.

2. **Write park journal** — create `.claude/worktrees/.park-journal/pN.json` to enable crash recovery:
   ```bash
   mkdir -p .claude/worktrees/.park-journal
   echo '{"pn":"pN","spec_stamped":false,"kdd_captured":false,"branch_deleted":false}' \
     > .claude/worktrees/.park-journal/pN.json
   ```

3. **Stamp spec (FIRST — before anything else)** — edit the spec frontmatter on the feature branch:
   - `delivery_stage: park` (pipeline stamp already did this, but verify it's set)
   - Commit the stamp on the feature branch (worktree pattern, `.claude/rules/git.md`): `git add features/pN_*.md && git commit -m "chore: park pN — stamp"`
   - Update journal: `spec_stamped: true`

4. **Commit stamp to main** — use `git-ops.sh commit-to-main` to send the spec update to main. This acquires main.lock and commits atomically. From the **main repo root**:
   ```bash
   cp .claude/worktrees/wN/features/pN_*.md features/   # copy stamped spec from worktree to main
   ./scripts/git-ops.sh commit-to-main \
     --message "chore: park pN — stamp" \
     --files features/pN_*.md
   ```
   Update journal: `spec_stamped_main: true`.

5. **KDD capture (optional)** — if user wants learnings captured:
   - Run `/kdd` — invoke `/slava:maintain:kdd` to capture decisions into `docs/decisions.md`
   - Commit KDD changes to main via:
     ```bash
     ./scripts/git-ops.sh commit-to-main \
       --message "docs: park pN — kdd" \
       --files docs/decisions.md
     ```
   - Update journal: `kdd_captured: true`

6. **Abandon branch** — delete worktree + release slot lock via `git-ops.sh abandon`:
   ```bash
   ./scripts/git-ops.sh abandon wN --nonce "$CP_LOCK_NONCE_wN"
   ```
   Update journal: `branch_deleted: true`

7. **Clean up journal** — delete `.claude/worktrees/.park-journal/pN.json`

8. **Report:**

```
P{N} parked. Stamp and KDD committed to main.
Feature branch feature/p{N}-xxx deleted.
Run /ship p{N} when ready to merge the feature code to main.
```

---

## When to use

- Feature is done on branch, you want to merge later (not now)
- Feature passed `/verify` but you're batching merges
- You're switching context and want to mark progress

## What it does NOT do

- Does not change `status:` — it stays whatever it was (`in-progress`, `qa`, etc.)
- Does not merge anything
- Does not run reviews or tests
- Does not move the spec to `features/done/`

---

## Related

- `/dev` — implements the feature (stops at UAT gate on branch)
- `/verify` — live UAT (sets status: qa on pass)
- `/ship` — merges to main and closes the spec
