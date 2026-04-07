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
| `privacy` | `.privacy-reviewed` file exists AND timestamp is newer than last commit |
| `code` | `.finish-reviewed` has `{"type":"code",...}` entry newer than last commit |
| `skills` | `.finish-reviewed` has `{"type":"skills",...}` entry newer than last commit |
| `rules` | `.finish-reviewed` has `{"type":"rules",...}` entry newer than last commit |
| `migrations` | `.finish-reviewed` has `{"type":"migrations",...}` entry newer than last commit |
| `docs` | `.finish-reviewed` has `{"type":"docs",...}` entry newer than last commit |
| `specs` | `.finish-reviewed` has `{"type":"specs",...}` entry newer than last commit |

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

## Step 5: Fix Issues and Report

After all subagents complete:

1. **Fix all issues automatically.** Do not ask for approval — the user invoked `/finish` to get things fixed, not to review a report. Apply all fixes directly.

2. **Report concisely.** For each issue fixed, one line:
   - What was wrong (the issue)
   - Why it matters (what would have happened without the fix)
   - What the fix did

**Example output:**
```
/finish — 4 issues found, 4 fixed.

1. Stale `/review-all` ref in dev.md:459 — would route to archived skill. Updated to `/finish`.
2. Third-party names in p581:72 — PII in public repo. Anonymized.
3. Missing null check in story-card.tsx:67 — would crash on deleted points. Added optional chaining.
4. Unreleased pricing in p599:33 — competitive exposure. Replaced with [FOUNDER DECISION].

Pre-commit: PASS
```

If a fix is ambiguous or risky (could change behavior), flag it instead of auto-fixing: "Flagged: [issue] — needs your decision because [reason]."

---

## Step 6: Write Artifact

After review completes, write `.finish-reviewed`:

```json
{"type":"code","timestamp":"2026-04-03T14:00:00Z","issues_found":2,"issues_fixed":2}
{"type":"skills","timestamp":"2026-04-03T14:00:00Z","issues_found":3,"issues_fixed":3}
```

JSON-lines format — one line per review type. Append (don't overwrite) so partial runs are preserved.

---

## Notes

- **Parallel = fast.** All subagent reviews run simultaneously.
- **Auto-fix by default.** Only flag genuinely ambiguous issues.
- **Partial results OK.** If one subagent times out, fix what was found and note what was skipped.
- **Re-run is cheap.** `/finish` after fixes will skip already-reviewed types (checks `.finish-reviewed` timestamps).

## Related Skills

- `/verify` — Live UAT via Playwright/Chrome (delegated by /finish for UI changes)
- `/privacy` — PII scan (delegated by /finish for public doc changes)
- `/dev` — Implementation pipeline (calls `/finish code` at step 9.5)
- `/fix` — Bug fix pipeline (calls `/finish code` at QA gate)
- `/ship` — Shipping gate (checks `.finish-reviewed` exists)
