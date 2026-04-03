---
name: ship
description: Zero-friction commit. Fixes auto-fixable issues inline, commits with a generated message, refreshes kanban. No questions unless something requires judgment.
when_to_use: "Any time the user says 'commit', 'ship it', 'wrap and commit', or 'push this'. Replaces the manual commit + confirmation cycle."
archived_reason: "replaced by commit-commands:commit skill and autonomous commit rule in CLAUDE.md"
disable-model-invocation: true
---

# /ship

Commit everything clean. Zero questions.

> **Contract:** If it's auto-fixable, fix it. If it needs judgment, surface it once and wait. Otherwise, ship.

## Steps

### 1. Pre-flight (run in parallel)

```bash
git status --short
./scripts/pre-commit-checks.sh 2>&1
```

### 2. Auto-fix blockers (no asking)

| Blocker | Fix |
|---------|-----|
| ESLint fixable errors | `npx eslint --fix <files>` |
| Frontmatter drift | `python3 scripts/fix-frontmatter.py` |

**Stop and surface:** TypeScript type errors (could mask logic bugs), failing tests (fix the code, not the test), secrets scan hits.

### 3. Stage and commit

Use explicit file names from `git status` — never `git add .`.

Generate commit message:
- Format: `type(scope): description` (max 72 chars)
- Types: `feat` / `fix` / `chore` / `refactor` / `test` / `docs`

```bash
git add <explicit file list>
git commit -m "<generated message>"
```

### 4. Post-commit (parallel, silent)

```bash
python3 scripts/fix-frontmatter.py 2>/dev/null
curl -s "http://localhost:9050/api/features?refresh=true" > /dev/null
```

### 5. Output (concise)

```
Shipped: <hash> — <message>
Files: <N> changed
[Auto-fixed: <what> — only if something was fixed]
[Needs attention: <only real blockers>]
```

## What /ship does NOT do

- Does not push to remote (run `git push` explicitly or use `/commit` skill)
- Does not move feature specs to done (that's `/dev` or `/fix`)
- Does not run `/kdd` (call it separately)

## After deploying to production

For changes touching stories, auth, or RLS — run:
```bash
node scripts/prod-smoke-test.mjs
```
Takes ~3s. Verifies the live DB end-to-end.

## Difference from /wrap

`/wrap` = visibility check, asks if you want to commit.
`/ship` = commits immediately, no asking.
