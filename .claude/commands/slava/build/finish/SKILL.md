---
name: finish
description: "Internal review dispatcher — called by /dev and /fix for code review. Run standalone only if you coded manually without /dev."
when_to_use: "Automatically inside /dev (step 9.5) and /fix (QA gate). Standalone use: only when user coded without /dev and wants a review before /ship."
version: 1.1.0
---

# /finish

Smart review dispatcher. Classifies what changed, runs the right reviews, skips what already ran.

> **Principle:** The right review for the right change. One command, zero briefing.

## Usage

```bash
/finish              # Review all changes (auto-classify)
/finish code         # Code review only (for /dev and /fix auto-mode)
```

---

## Step 1: Gather Context

Run in parallel:

```bash
git diff --name-only                    # Unstaged changes
git diff --cached --name-only           # Staged changes
git diff main...HEAD --name-only        # All branch changes vs main
git branch --show-current               # Current branch
git log main..HEAD --oneline            # Branch commits
```

Union all file lists into `CHANGED_FILES`.

**If empty:** Report "Nothing to review — working tree clean, no commits ahead of main." → exit.

**If a P-number feature is detected** (from branch name or commits): read the feature spec for context to pass to reviewers.

---

## Step 2: Classify Changes

Apply path-pattern matching to `CHANGED_FILES`. Each file can trigger one or more review types:

| Path pattern | Review key | Reviewer |
|---|---|---|
| `src/**`, `e2e/**`, `scripts/*.ts` | `code` | Subagent with `criteria/code.md` |
| `src/app/**/*.tsx`, `src/app/**/*.css` | `uat` | Delegate to `/verify` |
| `.claude/commands/slava/**` | `skills` | Subagent with `criteria/skills.md` |
| `.claude/rules/**`, `CLAUDE.md` | `rules` | Subagent with `criteria/rules.md` |
| `supabase/migrations/**` | `migrations` | Subagent with `criteria/migrations.md` |
| `features/p*.md` (not in `done/`) | `specs` | Subagent with `criteria/specs.md` |
| `docs/**`, `features/**` (public prose) | `privacy` | Delegate to `/privacy` |
| `docs/decisions.md`, `docs/technical/**` | `docs` | Subagent with `criteria/docs.md` |

**If `/finish code` was invoked:** only run `code` type, skip all others.

Report briefly and proceed immediately — no confirmation prompt:

```
Reviewing 12 files — spawning 3 reviewers (code, skills, privacy). Skipping uat (scorecard exists).
```

Do NOT ask "proceed?" — the user invoked `/finish`, that IS the proceed.

---

## Step 3: Detect Already-Ran Reviews

For each review type, check for existing artifacts. Skip reviews that already completed:

| Review key | Detection method |
|---|---|
| `uat` | `features/uat/p{N}.md` exists with passing marks in Test Execution Log |
| `privacy` | `.claude/.privacy-reviewed` OR `$(git rev-parse --git-common-dir)/.privacy-reviewed` stamp exists AND its SHA covers all watched-path commits since `git rev-list --count origin/main..HEAD -- WATCHED_PATHS` returns 0 uncovered commits |
| `code` | `$(git rev-parse --git-common-dir)/.finish-reviewed` has a `{"type":"code","branch":"<current branch>",...}` entry newer than last commit |
| `skills` | `$(git rev-parse --git-common-dir)/.finish-reviewed` has a `{"type":"skills","branch":"<current branch>",...}` entry newer than last commit |
| `rules` | `$(git rev-parse --git-common-dir)/.finish-reviewed` has a `{"type":"rules","branch":"<current branch>",...}` entry newer than last commit |
| `migrations` | `$(git rev-parse --git-common-dir)/.finish-reviewed` has a `{"type":"migrations","branch":"<current branch>",...}` entry newer than last commit |
| `docs` | `$(git rev-parse --git-common-dir)/.finish-reviewed` has a `{"type":"docs","branch":"<current branch>",...}` entry newer than last commit |
| `specs` | `$(git rev-parse --git-common-dir)/.finish-reviewed` has a `{"type":"specs","branch":"<current branch>",...}` entry newer than last commit |

Report what was skipped: "Skipping uat — UAT scorecard p621.md exists (5/5 passing)."

---

## Step 4: Dispatch Reviews

### Subagent reviews (spawn in parallel — single message, multiple Agent calls)

For each review type that needs a subagent:

1. **Read the criteria file:** `.claude/commands/slava/build/finish/criteria/{type}.md`
2. **Read the changed files** (or their diffs if files are large)
3. **If feature spec exists:** read it for context
4. **If `docs/decisions.md` [technical] entries exist:** extract them for the code reviewer
5. **Spawn subagent** with all content inlined:

```
Agent(
  description="{type} review",
  subagent_type="general-purpose",
  model="sonnet",
  prompt="You are reviewing {type} changes for ClarityPledge.

[CRITERIA FILE CONTENT INLINED]

## Changed Files
[FILE CONTENTS OR DIFFS INLINED]

## Feature Context (if available)
[SPEC SUMMARY]

## Prior Technical Decisions (for code review)
[decisions.md [technical] entries]

Find all specific issues (expect 3-15 for typical changes). If genuinely clean, state what you checked and why no issues were found."
)
```

### Delegated reviews

- **`uat`:** Report "UAT needed — run `/verify` after fixing any issues from this review."
- **`privacy`:** Invoke `/privacy` directly (it handles its own scanning and `.privacy-reviewed` stamp).

---

## Step 5: Present Findings and Apply Approved Fixes

After all subagents complete:

1. **Present concisely.** For each issue found, one line:
   - What was wrong (the issue)
   - Why it matters (what would happen without the fix)
   - What the fix would do

2. **Ask for decision:**
   "Fix issues before closing? (all HIGH / select / skip)"
   - `all HIGH` — apply fixes for every HIGH issue; leave MEDIUM for user review.
   - `select` — user picks which issues to fix by number.
   - `skip` — no fixes applied; findings recorded in stamp with `issues_fixed: 0`.

3. **Apply only what user approved.** Never auto-apply without explicit consent — this is the user's decision point.

4. **Flag ambiguous issues separately.** If a fix could change behavior beyond the stated issue (e.g., tightens a validator in a way that might reject prior-valid input), present it as "Flagged — needs your decision because [reason]" and do NOT include it in `all HIGH` bulk-apply.

**Example output:**
```
/finish — 4 issues found.

HIGH:
1. Stale `/review-all` ref in dev.md:459 — would route to archived skill. Fix: update to `/finish`.
2. Missing null check in story-card.tsx:67 — would crash on deleted points. Fix: add optional chaining.

MEDIUM:
3. Third-party names in p581:72 — PII risk in public repo. Fix: anonymize.
4. Unreleased pricing in p599:33 — competitive exposure. Fix: replace with [FOUNDER DECISION].

Fix issues before closing? (all HIGH / select / skip)
```

After user decision, apply approved fixes and proceed to Step 6.

### Manifest drift check (supabase changes detected)

After applying fixes, if the branch touches `supabase/migrations/` or `supabase/functions/`, run:

```bash
if git diff --name-only main..HEAD | grep -qE '^supabase/(migrations|functions)/'; then
  if ! ./scripts/check-deploy-manifest.sh --env prod 2>/dev/null; then
    echo "⚠ Prod manifest drift detected — run before /ship:"
    echo "  ./scripts/migrate.sh --env prod     (if migrations pending)"
    echo "  supabase functions deploy ...       (if edge functions pending)"
    echo "This won't block /ship, but you'll hit the same gate there."
  fi
fi
```

**Non-blocking** — `/finish` continues regardless of drift. Surfaces the warning while the work is fresh; the hard gate remains at `/ship` step 3.6. Do NOT write anything to `.finish-reviewed` for this check.

---

## Step 6: Write Artifact

**Subagent mode — skip this step.** When `/finish` is dispatched as a subagent by `/dev` (step 9.5) or `/fix` (QA gate step 1), the caller writes the stamp itself in step 9.5a / 1a. Subagents cannot reliably run this step — only standalone `/finish` invocations reach Step 6.

After review completes, write the shared stamp at `<git-common-dir>/.finish-reviewed` (resolves to the main repo from any worktree, mirroring `.privacy-reviewed`, P950/P1002):

```bash
GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "{\"type\":\"code\",\"branch\":\"$BRANCH\",\"timestamp\":\"2026-04-03T14:00:00Z\",\"issues_found\":2,\"issues_fixed\":2}" >> "$GIT_COMMON_DIR/.finish-reviewed"
```

JSON-lines format — one line per review type, each carrying the `branch` it was reviewed on (the file is shared across every worktree, so this lets gate 2.7/2.7b distinguish this branch's review from a concurrent worktree's review of an unrelated feature — P1002). Append (don't overwrite) so partial runs are preserved.

---

## Notes

- **Parallel = fast.** All subagent reviews run simultaneously.
- **User-approved fixes.** `/finish` presents findings and asks before applying. This matches how `/dev` and `/fix` use it (they inherit the same approval gate).
- **Partial results OK.** If one subagent times out, fix what was found and note what was skipped.
- **Re-run is cheap.** `/finish` after fixes will skip already-reviewed types (checks `.finish-reviewed` timestamps).

## Related Skills

- `/verify` — Live UAT via Playwright/Chrome (delegated by /finish for UI changes)
- `/privacy` — PII scan (delegated by /finish for public doc changes)
- `/dev` — Implementation pipeline (calls `/finish code` at step 9.5)
- `/fix` — Bug fix pipeline (calls `/finish code` at QA gate)
- `/ship` — Shipping gate (checks `.finish-reviewed` exists)
