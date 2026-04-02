---
name: claude-md
description: Gate for CLAUDE.md changes — validates placement, redundancy, and universality before applying. Run before editing any CLAUDE.md or .claude/rules/*.md file.
when_to_use: "Before editing CLAUDE.md or .claude/rules/*.md. Always run this gate first."
version: 1.3.0
---

# /slava:claude-md

**With argument:** validates a specific proposed change before applying it.
**No argument:** audits current CLAUDE.md for redundancy, misrouted content, and bloat.

## Usage

```bash
/slava:claude-md "Add rule: always paraphrase before infra work"
/slava:claude-md "Add rule: check git status before committing | why: subagent ran git rm --cached but staged state wasn't visible in main session"
/slava:claude-md   # general audit
```

The `| why: <incident>` suffix is optional but strongly recommended when the rule was derived from a specific failure. The gate uses it to verify the rule targets the root cause, not just the symptom.

## Agent prompt — with argument (validate a change)

```
You are a documentation architect. Validate this proposed change to CLAUDE.md:

"{ARGUMENT}"

If the argument contains "| why: ...", extract the incident context and use it for check 5 below.

Read: /Users/slavochek/Projects/public/claritypledge/CLAUDE.md and .claude/rules/*.md

Step 0 — Budget check: Count total lines in CLAUDE.md. Report: "CLAUDE.md is currently X lines (target: ≤350)."
Determine proposal type: ADD (net new content), REMOVE/CONDENSE (reduces content), or NEUTRAL (rewrite same length).
If over 350 AND proposal type is ADD: this proposal must include a matching REMOVE or CONDENSE of equivalent lines before it can be approved. State this explicitly and ask the proposer to name what to remove.
REMOVE and CONDENSE proposals are always approved on budget grounds — skip the exchange requirement.

Check 5 things:
1. Universal? Needed for >80% of task types? If not → .claude/rules/ or docs/technical/
2. Routing: Principle → CLAUDE.md | File-specific → .claude/rules/X.md | Pattern → docs/technical/ | Decision → docs/decisions.md
3. Redundant? Search for similar content first.
4. Six-month test: still relevant?
5. Root cause? (only if why: context provided) Does the rule prevent the incident described, or does it only address a symptom? If symptom-only, propose a sharper formulation.

Step 6 — Drift scan: First read .claude/rules/*.md to understand which sections are already correctly delegated. Then scan all existing CLAUDE.md sections. Flag any that now fail the >80% universality test AND are not already covered by a rules file. List them as candidates for moving to .claude/rules/ or docs/technical/. This is a background observation — do not block the ADD for drift findings, just report them.

Output: ADD/REDIRECT/SKIP + exact markdown. If unambiguous, apply directly and report one line.
```

## Agent prompt — no argument (audit)

```
You are a documentation architect. Audit /Users/slavochek/Projects/public/claritypledge/CLAUDE.md and its .claude/rules/*.md files.

First: count total lines in CLAUDE.md. Report the count vs target (≤350 total).

Report: (1) duplications, (2) misrouted content — sections that fail the >80% universality test and belong in .claude/rules/ or docs/technical/, (3) stubs that belong elsewhere.
One paragraph max. Issues only — no praise.
```

## Rules files (path-triggered, not CLAUDE.md)
- `.claude/rules/features.md` → `features/**/*.md`
- `.claude/rules/database.md` → `supabase/**/*`
- `.claude/rules/src.md` → `src/**/*.{ts,tsx}`
- `.claude/rules/tests.md` → `e2e/**/*.ts`, `src/**/*.test.*`
- `.claude/rules/git.md` → `src/**`, `scripts/**`, `**/*.sh`
