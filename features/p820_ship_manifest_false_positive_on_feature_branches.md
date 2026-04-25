---
status: backlog
type: bug
rank: 1001
severity: low
date_reported: '2026-04-25'
created_date: '2026-04-25'
tags: [process, ship, deploy-manifest]
---

# P820: /ship manifest drift check gives false positive when stamp is on main but not feature branch

## Summary

When a deploy-manifest stamp commit lands on `main` after a feature branch was cut, `check-deploy-manifest.sh --env prod` run from the feature branch sees "drift" — even though prod is fully up to date. Every agent running `/ship` on that branch hits the gate, asks the user to re-deploy already-deployed migrations, and blocks the ship.

This has happened at least twice (P816 ship, one earlier ship).

## Root Cause

`check-deploy-manifest.sh` reads `supabase/deploy-manifest.json` from the **current branch** (feature branch), compares it against prod. If a stamp commit (`e2bf3f5c` for P800) landed on `main` after the feature branch was created, the feature branch manifest is stale — it doesn't include that stamp — even though prod is correct.

## Fix Approach

Option A (recommended): When on a feature branch, `check-deploy-manifest.sh` should compare the **main branch copy** of `supabase/deploy-manifest.json` against prod, not the feature branch copy. The manifest evolves only via stamp commits that go to main; a feature branch copy is always a subset.

Option B: `git-ops.sh ship` rebases the feature branch before running the manifest check, ensuring the branch manifest matches main.

Option C: The check passes if `git merge-base HEAD main` shows the manifest was last touched on main (i.e., the feature branch didn't modify it).

## Acceptance Criteria

- [ ] Running `/ship pN` on a feature branch that hasn't modified `supabase/deploy-manifest.json` never shows false drift for migrations stamped on main
- [ ] True drift (feature branch deployed a migration but forgot to stamp) is still caught
