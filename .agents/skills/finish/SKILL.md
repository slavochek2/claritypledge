---
name: finish
description: "The end-of-build review standard (P1505): classifies what changed, runs criteria reviewers plus external reviewers by stakes (Gemini review model always, Codex, Opus), and writes the review receipt. Called by /dev and /fix; run standalone after any ad-hoc build, or when the Stop-hook review gate asks for it."
when_to_use: "Automatically inside /dev (step 9.5) and /fix (QA gate). Standalone: at the end of any build done outside /dev or /fix, and whenever the Stop-hook review gate (verify-before-stop.py) names files to review."
version: 1.2.0
---

# /finish

Smart review dispatcher. Classifies what changed, runs the right reviews, skips what already ran.

> **Principle:** The right review for the right change. One command, zero briefing.

## Usage

```bash
/finish              # Review all changes (auto-classify)
/finish code         # Code review only (for /dev and /fix auto-mode)
/finish <file>...    # Review exactly these files — what the P1505 Stop-hook gate asks for
```

**This skill is the founder's end-of-build review standard (P1505), in one place.** The lenses
live in `criteria/code.md`; who reviews is Step 4b; proof it ran is Step 6b. Nothing else
restates them — point here. The Stop hook (`.claude/hooks/verify-before-stop.py`) blocks a
"done" over edited code that has no receipt, so this runs whether or not `/dev` or `/fix` did.

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

Union all file lists into `CHANGED_FILES`. **If files were passed as arguments, `CHANGED_FILES` is
exactly those files** — on the shared main checkout the diff also holds co-tenant work.

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
| `code` | `$(git rev-parse --git-common-dir)/.finish-reviewed` has a `{"type":"code",...}` entry whose **`sha` equals the current `HEAD`** — see the P1203 note below |
| `skills` | `$(git rev-parse --git-common-dir)/.finish-reviewed` has a `{"type":"skills","branch":"<current branch>",...}` entry newer than last commit |
| `rules` | `$(git rev-parse --git-common-dir)/.finish-reviewed` has a `{"type":"rules","branch":"<current branch>",...}` entry newer than last commit |
| `migrations` | `$(git rev-parse --git-common-dir)/.finish-reviewed` has a `{"type":"migrations","branch":"<current branch>",...}` entry newer than last commit |
| `docs` | `$(git rev-parse --git-common-dir)/.finish-reviewed` has a `{"type":"docs","branch":"<current branch>",...}` entry newer than last commit |
| `specs` | `$(git rev-parse --git-common-dir)/.finish-reviewed` has a `{"type":"specs","branch":"<current branch>",...}` entry newer than last commit |

> **P1203 — why `code` keys on `sha` and not on branch + recency.** On `main` the branch matches every
> entry, so "an entry for this branch, newer than the last commit" is satisfied by a **co-tenant's
> review of entirely unrelated work** from minutes ago — and `/finish` would then skip the code review
> altogether. Direct-to-main is routine, not exceptional. Keying on the reviewed `sha` is exact in both
> directions: same `HEAD` ⟹ the same tree was reviewed, so skipping is correct; `HEAD` moved ⟹ the
> review is stale and must re-run. Entries predating P1203 carry no `sha`, so they never match and the
> review simply runs — the safe direction. Apply the same reasoning before extending this to the other
> review types; they are not fixed here because only `code` gates a ship.

**File-argument mode never skips** (`/finish <file>...`, which the Stop-hook gate asks for): a
`.finish-reviewed` stamp is not a review receipt, so skipping would leave the gate blocking with
nothing written. Every row below applies only to the no-argument mode.

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

### Step 4b: External reviewers by stakes (P1505 — always, in addition to the subagents above)

Founder ruling 2026-10-16: start with the cheapest, add as stakes rise, and keep the bar for Codex
low. Under-reviewing costs the founder's attention later, and that costs more than reviews do.

**The main session runs this step, never a subagent.** It needs several background Bash calls and,
for Opus, an `Agent`. When `/dev` or `/fix` dispatch `/finish code` as a subagent, that subagent does
the criteria review only. The caller runs Step 4b and Step 6b in parallel with it.

**0. Snapshot first.** Before any reviewer starts, run
`python3 scripts/review_receipt.py snapshot -- <CHANGED_FILES>` and keep the printed path. The receipt
records exactly what the reviewers saw, and nothing written later.

| Reviewer | Runs when | How |
|---|---|---|
| Gemini (review model) | **every run** | write a prompt file (the `criteria/code.md` text plus the diffs), then run `~/.agents/bin/delegate-gemini --model "$(sed -n 's/^REVIEW_GEMINI_MODEL=//p' ~/.agents/model-defaults.env)" --file <prompt file>` |
| Codex | more than one file changed, OR the diff is over 50 lines, OR a long run (more than one fix round, or the work spanned over 30 minutes) | `~/.agents/bin/codex-review --prompt-file <prompt file>` (same prompt; Codex also reads the repo) |
| Opus adversary | the change touches `supabase/migrations/`, `supabase/functions/`, an auth path (`**/auth*`, `**/*session*`, RLS), `.claude/hooks/`, `.claude/settings.json`, `scripts/git-ops.sh`, `scripts/ship-gates.sh`, `scripts/pre-commit-checks.sh` or another gate | an `Agent` with `model: "opus"` and a hostile prompt that writes its report to a file. For security, data or ship tooling, escalate to `/slava:think:adversarial-review` |

The model id lives only in `~/.agents/model-defaults.env` (`REVIEW_GEMINI_MODEL`, watched by
`model-watch`). Never write it into this file.

- **Prompt:** every snapshotted file must be in the review input. Use the diff for tracked files, and the **full
  content** for new or untracked ones, since `git diff` shows nothing for them. The UI lenses go in only when UI files changed (`src/app/**/*.tsx`, `*.css`).
  - Text-only reviewers judge layout and the first-time walk from the code.
  - The rendered half (screenshots, `.claude/rules/visual-qa.md`) belongs to the main session or `/verify`.
- **Launch:** start each external reviewer as its **own** `run_in_background` Bash call, writing its output to a
  file under the scratchpad. When it finishes, require `[ -s <file> ]` and an `ASK-MODEL:` first line
  with `exit=0`.
- **Failures:** a non-zero exit, a model MISMATCH, an empty file, or a missing `REVIEW_GEMINI_MODEL` key all
  mean **that review did not run**, whatever else the output says.
  - Re-run it once by a different route (for example without `--model`, falling back to the default
    `GEMINI_MODEL`, and say so).
  - If `delegate-gemini` exits 2 (its credential-shape scan refused the payload), run `codex-review` as the
    evidence reviewer instead. Never edit the payload to get past the scan.
  - Otherwise report it as missing. Never count it as clean.
- **Count:** state `<received> of <spawned>`, naming any reviewer that is missing. Opus counts here but is not receipt
  evidence, because the receipt needs at least one `ask-model` output. A receipt written with a reviewer
  missing must say so in the report.
- **Freshness:** a fix applied after the snapshot is unreviewed code, and `write` will refuse it.
  - Re-snapshot and re-review the changed files. Every new snapshot needs **at least one external
    (`ask-model`) reviewer**, alongside whichever reviewer found the fixed issues, or no receipt can be written.
  - Stopping rule (decisions.md 2026-10-14 [process], "Overnight autonomous batch — when to stop review rounds"):
    fix every finding a reviewer reproduces on a shape this repo actually produces, or one that falsely blocks
    a legitimate workflow. Record exotic shapes as "Known limitations" in the spec. "Zero findings" is not
    the bar for parser-shaped gates; "no realistic open finding" is.

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

**Subagent mode — skip this step and Step 6b.** When `/finish` is dispatched as a subagent by `/dev` (step 9.5) or `/fix` (QA gate step 1), the caller writes the stamp and the receipt itself in step 9.5a / 1a. Subagents cannot reliably run this step — only standalone `/finish` invocations reach Step 6.

After review completes, write the shared stamp at `<git-common-dir>/.finish-reviewed` (resolves to the main repo from any worktree, mirroring `.privacy-reviewed`, P950/P1002):

```bash
GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SHA="$(git rev-parse HEAD)"
PN="p{N}"   # the spec reviewed; "-" only when there genuinely is none
echo "{\"type\":\"code\",\"pn\":\"$PN\",\"branch\":\"$BRANCH\",\"sha\":\"$SHA\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"issues_found\":2,\"issues_fixed\":2}" >> "$GIT_COMMON_DIR/.finish-reviewed"
```

**Write the JSON compactly — no space after the colons.** The ship gate now tolerates `"type": "code"` as well, but three writers and one reader sharing an unspecified literal is what produced the defect: a real review of `feature/p1197-navtrace` (4 issues found, 3 fixed) failed gate 2.7 for months purely because its entry was written with spaces. Match this template exactly.

JSON-lines format — one line per review type, each carrying the `pn` it reviewed (P1203), the `sha` that was HEAD at review time, and the `branch` it was reviewed on (the file is shared across every worktree, so `branch` lets gate 2.7 distinguish this branch's review from a concurrent worktree's review of an unrelated feature — P1002). **`sha` is not read by gate 2.7's matching logic at all** — gate 2.7 matches on `branch` (feature-branch arm) or `pn` (no-branch arm) only. `sha` is consumed by two separate freshness checks: this skill's own Step 3 skip-detection (`sha == HEAD`), and gate 2.7b's warn-only staleness check, which on the no-branch path compares the entry's `sha` against current `HEAD` via `git merge-base --is-ancestor` (added alongside this note — the no-branch arm previously had no staleness signal at all). Append (don't overwrite) so partial runs are preserved.

### Step 6b: Review receipt (P1505; written by whoever ran Step 4b)

After findings are fixed or set aside, and after any re-review of fixes:

```bash
python3 scripts/review_receipt.py write --snapshot <path from Step 4b.0> --evidence <each ask-model output file>
```

`write` refuses in these cases. Each one means the review did not cover the code as it is now:
- no evidence file is a successful `ask-model` run written after the snapshot
- a file changed after the snapshot

Fix the review, never the evidence. The receipt is what clears the Stop-hook gate.

**Every finding ends in one of two states:**
- FIXED
- listed to the founder with one line on why it was set aside

Never absorb one silently. This is decisions.md 2026-10-05 [process], a proposed rule that this skill adopts.

---

## Notes

- **Parallel = fast.** All subagent reviews run simultaneously.
- **User-approved fixes.** `/finish` presents findings and asks before applying. This matches how `/dev` and `/fix` use it (they inherit the same approval gate).
- **Partial results OK.** If one subagent times out, fix what was found and note what was skipped.
- **Re-run is cheap.** `/finish` with no arguments skips already-reviewed types (checks `.finish-reviewed`). File-argument mode never skips.

## Related Skills

- `/verify` — Live UAT via Playwright/Chrome (delegated by /finish for UI changes)
- `/privacy` — PII scan (delegated by /finish for public doc changes)
- `/dev` — Implementation pipeline (calls `/finish code` at step 9.5)
- `/fix` — Bug fix pipeline (calls `/finish code` at QA gate)
- `/ship` — Shipping gate (checks `.finish-reviewed` exists)
