---
name: create-bug
description: Create a bug report file with full diagnostic context — root cause, reproduction steps, affected files, severity, and acceptance criteria
when_to_use: When a bug is discovered and needs a tracked spec before or alongside fixing it
version: 1.0.0
---

# Create Bug

**Generate a complete bug report spec from a problem description.**

Produces a focused, actionable bug file in `features/` with:
- Summary of what's broken
- Root cause (from context, or placeholder for investigation)
- Reproduction steps
- Expected vs actual behavior
- Affected files and line numbers
- Severity classification
- Proposed fix approach
- Acceptance criteria (testable, not vague)

**Announce at start:** "I'm using the create-bug skill to generate a bug spec."

---

## Worktree guard

Before creating any file, check:
```bash
git worktree list | head -1 | awk '{print $1}'
```
Compare to `pwd`. If they differ, you are in a worktree — **stop immediately**. Tell the user:
> "Specs must be created in w0 (main). Run `cd ~/Projects/public/claritypledge` first, then re-run this skill."
Do not create any file until you are in the main repo.

---

## Quick Start

```
/create-bug "Join form shows generic error when user is unverified"
```

Or with investigation context:
```
/create-bug "Position counts show 0 after refresh — root cause is missing onMount DB call in QuotedPointCard"
```

Or pointing at an existing file:
```
/create-bug features/p275_bug-live-positions-unverified-rls.md
```

---

## When to Use

Use `/create-bug` for:
- Bugs discovered during development or QA that need a tracked spec
- Regressions you want to file before (or alongside) fixing
- Bugs with unclear root cause that need investigation framing
- Bugs surfaced from a surface audit (see `/fix` surface lens)
- **Rewriting an existing bug spec** whose scope expanded (matryoshka pattern — each fix reveals the next layer)

**Do NOT use for:**
- Any new feature or task → use `/create-spec`
- Pre-commit hook failures, CI config, or build tooling fixes (not user-facing bugs)
- CSS-only cosmetic tweaks that affect only visual appearance and cannot alter user interaction flow (color, font-size, margin between non-interactive elements)

**Relationship to `/fix`:**
- `/create-bug` creates the spec
- `/fix` reads the spec and implements the fix
- Run `/create-bug` first when the bug needs tracking, then `/fix` to implement

---

## What It Generates

### Summary
One-line description of what's broken. Factual, specific.

### Root Cause
What was found (or "Under investigation" if unknown). If context includes code traces, error messages, or prior analysis — incorporate them. Don't leave this blank if information exists.

### Reproduction Steps
Numbered steps that reliably reproduce the bug. Include: starting URL, user state (verified/unverified/guest), specific UI actions. Skip vague steps like "try to login" — be precise.

### Expected Behavior
What should happen when the steps above are followed.

### Actual Behavior
What actually happens. Include error messages, silent failures, wrong state — whatever the symptom is.

### Affected Files
File paths and line numbers where the bug lives. If unknown, list suspected areas based on description.

### Severity
- **critical** — system down, data loss, blocked login, security issue
- **high** — major feature broken for a class of users
- **medium** — feature partially works, workaround exists
- **low** — minor issue, cosmetic, rare edge case

### Fix Approach
Proposed fix — can be brief. Even a direction ("add missing `onMount` DB call") is better than empty. If root cause is unknown, describe the investigation approach instead.

**Surface spread check:** For UI bugs involving a CSS class or prop pattern, always grep for the same pattern across the codebase before proposing the fix — the same issue often exists in sibling components. Example: a `line-clamp-2` truncation bug in one card component is likely in 3–5 related components. A `compact ? 'text-sm line-clamp-2' : ...` conditional pattern means the bug is latent in any component with that prop. Check all surfaces, fix all at once. Also grep prior specs: `git log --all --oneline --grep="<topic>" | head -20` and `grep -rln "<topic>" features/done/`. If hits exist on the same subsystem, cite the most relevant P-number in the Summary and explain what the prior fix missed.

**Rejected-alternatives check — run before writing the Fix Approach:** `grep -n "<error signature|filename|subsystem>" docs/decisions.md`. The greps above surface what was *built*; decisions.md is the only place that records what was **considered and rejected, and why**. This has now missed twice: P990 proposed a Sentry `beforeSend` message filter and listed its breadth as an open question — P883 had already rejected exactly that, for exactly that reason; P913's INDEX entry records the same miss a session earlier ("grep `decisions.md` for the error signature at triage start"). If a hit contradicts your approach, cite the entry and either follow it or name the new evidence that overrides it — don't re-derive a settled question.

### Acceptance Criteria
Testable conditions that confirm the bug is fixed. Format as checkbox list. Each item should be observable without reading the code.

---

## Pipeline stamp (P659)

Before any other work in this skill:
1. Read spec frontmatter
2. Set `delivery_stage: create-bug`
3. Append `create-bug` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, create-bug]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [create-bug]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `create-bug` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

**Note:** Since create-bug creates the file, set `delivery_stage: create-bug` and `pipeline_ran: [create-bug]` in the initial frontmatter (see Frontmatter section below).

---

## Workflow

```
1. GATHER → Read user's description + any provided context (error logs, file paths, screenshots)
       ↓
2. CLARIFY → Ask for severity if not clear from context (critical/high/medium/low)
       ↓
3. GET P-NUMBER → Run ./scripts/next-p-number.sh
       ↓
4. CALCULATE RANK → ./scripts/next-rank.sh {status} (bottom of ITS column; user reorders via kanban)
       ↓
5. GENERATE → Write bug spec with all sections populated
       ↓
6. SELF-REVIEW → Check completeness against quality gates
       ↓
7. CREATE FILE → features/p{N}_{slug}.md with correct frontmatter
       ↓
7.5. COMMIT TO MAIN → git add + git-ops.sh commit-to-main (spec must be tracked before /fix claims a worktree)
       ↓
8. REPORT → Tell user the file path and suggested next step (/fix)
```

---

## Rewrite Mode (Matryoshka Bugs)

When invoked with an **existing bug spec** (same P-number, `type: bug`), enter rewrite mode instead of creating a new spec.

**Trigger:** Input is a path to an existing `type: bug` spec, or a P-number that resolves to one, AND the user's intent is to update/rewrite (not create a new bug).

**Rewrite workflow:**

```
1. READ old spec completely
       ↓
2. EXTRACT INVARIANTS — architectural constraints, root-cause patterns,
   atomicity requirements, "X must always be done with Y" rules discovered
   during investigation. These go into ## Invariants (never deleted on rewrite).
       ↓
3. SEPARATE done layers from remaining layers
       ↓
4. GENERATE clean spec:
   - ## What's Fixed — done layers with commit hashes, root cause, one-liner each
   - ## Invariants — extracted from old spec (architectural rules future layers must respect)
   - ## What Remains — remaining layers, each with: reproduction steps (numbered, from session setup to observable bug), symptoms, expected behavior, root cause hypothesis, affected area
   - Standard sections (Acceptance Criteria, Key Files, Branch)
   **AC ↔ Layer rule:** Each layer in `## What Remains` MUST have a corresponding unchecked `- [ ]` in `## Acceptance Criteria`. Each layer in `## What's Fixed` MUST have a corresponding `- [x]`. This makes the AC section the single source of truth for completion — `/fix` and `/dev` use it as a hard gate before setting `status: qa`.
       ↓
5. OVERWRITE same file, same P-number
```

**What to preserve as invariants (examples):**
- "Story data and ratingInitiatedBy MUST be written atomically (single DB write)"
- "Any handler touching X must also clear Y — two separate calls create a Realtime race"
- Root-cause patterns that may recur in future layers

**What to discard:**
- Failed attempt logs, hypothesis tables, session-specific debugging notes
- Emotional notes about past failures ("this has been tried 10 times")
- Investigation plans that are no longer relevant (root cause was found)

**`## Invariants` is a sacred section** — it persists across all future rewrites. Agents may ADD to it but never delete entries without explicit user approval.

---

## Agent Behavior

### Information Gathering

If the user provides a one-liner description without context, extract what you can from the description and mark unknowns with `[To be investigated]`. Do NOT block on missing info — create the spec with what's available.

If the user provides rich context (stack traces, error messages, code snippets, prior investigation), incorporate all of it into Root Cause and Affected Files.

### Redact Real Participant Names to Roles (public repo)

This repo is public. When the bug comes from a **real production session** involving real people, write **roles, not names** on the first pass — never name a partner, client, or the founder in spec prose. Use `creator` / `joiner` / `host` / `partner` / `the founder`. Keep only opaque diagnostic identifiers that are needed to investigate and are not names/emails: **session code, profile UUIDs** are fine.

The pre-commit privacy gate (`audit-privacy.sh`) is allowlist/pattern-based and will **not** catch this — a real first name, or the founder's own name (allowlisted as the git author), passes silently. This is a recurring leak (decisions.md 2026-06-12 [process]; P929/P933/P934). Authoring in roles is the only reliable prevention — do it at write time, not as a redaction commit after.

**Severity clarification:** If severity is not obvious from context, ask exactly one question:

```
What's the severity?
- critical — system down or data loss
- high — major feature broken
- medium — partial failure, workaround exists
- low — minor / cosmetic
```

Do not ask for severity if the description makes it unambiguous (e.g., "login is broken" → high or critical).

### P-Number

Always run the canonical script:
```bash
./scripts/next-p-number.sh
```

Never compute manually. If script is unavailable, halt and warn the user.

### Rank Calculation

Assign rank to the bottom of the column the spec lands in — **`week` for a new bug**, matching the frontmatter below:

```bash
NEW_RANK=$(./scripts/next-rank.sh week)
```

**Never compute rank from a global `max(rank)`.** Rank only orders specs *within* one
column, so a global maximum ratchets forever: one out-of-scale rank drags every later
spec above it, and every agent-filed spec then sorts below every hand-ordered one
regardless of content. That is what produced the 2026-08-14 renumber (75 of 122 open
specs stranded in a 1,000,000 band). `next-rank.sh` scopes the maximum to one column.

### File Location

Always create in `features/` root (not `bugs_and_debt/`, not `drafts/`):

**Filename format:** `features/p{N}_{slug}.md`

Where `{slug}` is lowercase, underscores, derived from the summary (e.g., "Position counts show 0 after refresh" → `position_counts_zero_after_refresh`).

---

## Frontmatter

```yaml
---
status: week
type: bug
rank: {calculated}
severity: critical | high | medium | low
workstream: {infer from context, or omit if unclear}
date_reported: {today YYYY-MM-DD}
created_date: {today YYYY-MM-DD}
tags: [{relevant tags, 2-4}]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---
```

**Bug-specific fields to add after resolution (not at creation):**
- `date_resolved: YYYY-MM-DD`
- `root_cause: brief explanation`

**Do NOT add at creation:** `date_resolved`, `completed_at`.

---

## Template

```markdown
---
status: week
type: bug
rank: {N}
severity: {severity}
workstream: {workstream}
date_reported: {YYYY-MM-DD}
created_date: {YYYY-MM-DD}
tags: [{tags}]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P{N}: {Title}

## Summary

{One-line description of what's broken. Factual, specific.}

## Root Cause

{What was found. Or "Under investigation — see Reproduction section for observed symptoms." Never leave empty.}

## Invariants

{Architectural constraints discovered during investigation. Omit section for new bugs — add during rewrite mode when patterns emerge. This section persists across all future rewrites.}

## Reproduction Steps

1. {Starting state: URL, user role (verified/guest/unverified)}
2. {Action}
3. {Action}
4. {Observe: bug occurs here}

**Reproduction rate:** {100% / intermittent / rare}

## Expected Behavior

{What should happen.}

## Actual Behavior

{What actually happens. Include error messages or silent failures.}

## Affected Files

- `{path/to/file.tsx}` — {line number or description of where the issue is}
- `{path/to/file.ts}` — {description}

{If unknown: "Under investigation — suspected areas listed above."}

## Severity

**{Critical / High / Medium / Low}** — {one sentence justification}

## Fix Approach

{Proposed fix or investigation direction. Even a brief direction is better than empty.}

## Acceptance Criteria

- [ ] {Observable condition 1 — what the user sees, not what the code does}
- [ ] {Observable condition 2}
- [ ] {If applicable: regression test passes — `e2e/p{N}-*.spec.ts`}
- [ ] {No console errors during the affected flow}
```

---

## Quality Gates (Agent Self-Review)

Before creating the file, verify:

- [ ] Summary is one line, factual, specific (not vague like "button doesn't work")
- [ ] Root cause has content — at minimum "Under investigation" with supporting context
- [ ] Reproduction steps are numbered and specific (include URL, user state, exact actions)
- [ ] Expected vs actual are clearly distinct (not the same thing rephrased)
- [ ] Severity is set with justification
- [ ] At least one affected file listed (or "suspected area" with rationale)
- [ ] Acceptance criteria are observable by a human tester — no "code is correct" criteria
- [ ] Frontmatter has all required fields: status, type, rank, severity, date_reported, created_date, tags
- [ ] File path follows `features/p{N}_{slug}.md` format
- [ ] No real participant names in the body — real-session people are written as roles (creator/joiner/host/partner/founder); only session code + profile UUIDs remain (public repo; the pre-commit gate won't catch names)

**If any gate fails:** Fix it before writing the file. Do not write a partial spec.

---

## Example Output

### Input
```
/create-bug "Guest users see a generic 'Save failed' error when creating a story — should see a verification prompt instead"
```

### Output

```markdown
---
status: week
type: bug
rank: 32.0
severity: high
workstream: C1
date_reported: '2026-02-19'
created_date: '2026-02-19'
tags: [unverified, guest, create-story, error-handling]
---

# P400: Guest users see generic "Save failed" error on story creation

## Summary

Unverified guest users get a generic "Save failed. Please check your connection." error when attempting to create a story — the correct behavior is a verification prompt.

## Root Cause

The `create-story-page.tsx` submit handler doesn't check `user.isVerified` before calling the API. The RLS policy on `stories` blocks unverified users, which causes the Supabase insert to fail. The catch block surfaces a generic connection error instead of explaining the real issue.

## Reproduction Steps

1. Sign in as a guest (unverified) user — `is_verified: false` in profiles table
2. Navigate to `/story/create`
3. Fill in story title and body
4. Click "Save story"
5. Observe: toast shows "Save failed. Please check your connection."

**Reproduction rate:** 100%

## Expected Behavior

Unverified users should see a clear toast: "Verify your email to create a story — check your inbox or resend below." Story is not created. No misleading connection error.

## Actual Behavior

Toast: "Save failed. Please check your connection." — implies a network issue when the real cause is an unverified account blocked by RLS.

## Affected Files

- `src/app/pages/create-story-page.tsx` — submit handler, ~line 85 — missing `isVerified` check before API call
- `supabase/migrations/` — RLS policy on `stories` table blocks unverified users (correct behavior, wrong error surface)

## Severity

**High** — affects all guest users who attempt to create stories; misleading error erodes trust in the product.

## Fix Approach

Add `useVerificationGate` hook call at the top of the submit handler (P273 introduced this hook). One line: `if (!checkVerified('create a story')) return;`. The hook shows the correct verification toast automatically.

## Acceptance Criteria

- [ ] Unverified guest sees "Verify your email to create a story..." toast — not "Save failed"
- [ ] Verified user can create a story without interruption
- [ ] No console errors during either flow
- [ ] Regression test passes: `e2e/p400-guest-story-create.spec.ts`
```

---

## After File Creation

Tell the user:

```
Created: features/p{N}_{slug}.md

Severity: {severity}
Next step: Run `/reproduce p{N}` to confirm the bug and write a failing test.
Then: `/fix p{N}` to implement the fix.
```

If root cause is unknown, add:
```
Root cause marked "Under investigation" — run /reproduce to form hypotheses and confirm with evidence.
```

If bug is trivial (self-evident one-liner), add:
```
This looks trivial enough to skip /reproduce. To skip it, say "skip reproduce" when you run `/fix p{N}`. Silence will route you through `/reproduce` by default.
```

**Never** add a "skip /reproduce" hint based on:
- An architect plan being referenced (plan ≠ observed-failing canary)
- A `pipeline_plan` that omits `/reproduce` (pipeline_plan may have been stamped without `/pick-flow` classifying)
- "The root cause is visible in the code" (visible ≠ trivial; race conditions and RLS bugs often have root cause visible but require non-trivial reproduction)

Only add the skip hint when the fix is a literal one-line change AND the user has shown intent to skip.

---

## Related Skills

- `/reproduce` — Confirm the bug with evidence: root cause hypothesis, failing test, surface audit. **Default next step.**
- `/fix` — Implement the fix from this spec (reads reproduce artifact → fix → verify)
- `/create-spec` — Structured spec with 5-field skeleton (use for features, not bugs)
- `/kdd` — Capture learnings after fix is complete

**Flow:**
```
/create-bug → /reproduce → /fix → /ship
```

---

## Implementation

When invoked, follow this directive:

```
You are a Bug Spec Creator agent. Your job is to generate a complete, actionable bug report from the user's description and any available context.

Input: {user_input}

Steps:
1. Extract all relevant context from the input: error messages, file paths, stack traces, user state, reproduction steps already provided.
2. If severity is ambiguous, ask exactly one question to clarify it.
3. Run ./scripts/next-p-number.sh to get the P-number.
4. Calculate rank: `./scripts/next-rank.sh week` — per-column, never a global max
5. Generate the full bug spec using the template above.
6. Run self-review quality gates — fix any failures before writing.
7. Create the file at features/p{N}_{slug}.md
8. Report: file path, severity, and next step (/fix).

Critical constraints:
- DO NOT block on missing information. Use "Under investigation" where context is absent.
- DO NOT use generic descriptions. Every section must be specific.
- DO NOT invent file paths or line numbers if you don't know them. Say "suspected area" instead.
- DO ask about severity if genuinely unclear — that's the only acceptable blocking question.

Self-review gates MUST all pass before writing the file.

After writing the file, immediately commit it to main:
```bash
git add features/p{N}_{slug}.md
./scripts/git-ops.sh commit-to-main --message "feat(p{N}): file bug spec — {short title}" --files features/p{N}_{slug}.md
```
This is required. `git-ops.sh ship` will refuse to cherry-pick if the spec is untracked on main (see decisions.md 2026-04-27 process entry).

After committing, tell the user: "Hit the Refresh button in the kanban to see the new card (http://localhost:9050 → Refresh)."
```
