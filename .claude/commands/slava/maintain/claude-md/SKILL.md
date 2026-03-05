---
name: claude-md
description: Gate for CLAUDE.md changes — validates placement, redundancy, and universality before applying. Run before editing any CLAUDE.md or .claude/rules/*.md file.
version: 1.2.0
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

Before running the checks, count lines: `wc -l CLAUDE.md`. Report as: "CLAUDE.md is currently N lines."

Check 6 things:
1. Universal? Needed for >80% of task types? If not → .claude/rules/ or docs/technical/
2. Routing: Principle → CLAUDE.md | File-specific → .claude/rules/X.md | Pattern → docs/technical/ | Decision → docs/decisions.md
3. Redundant? Search for similar content first.
4. Six-month test: still relevant?
5. Root cause? (only if why: context provided) Does the rule prevent the incident described, or does it only address a symptom? If symptom-only, propose a sharper formulation.
6. Budget: if CLAUDE.md is already over 500 lines, this addition requires a corresponding removal of comparable length. Flag: "CLAUDE.md is at N lines (over budget). What will you remove?"

Output: ADD/REDIRECT/SKIP + exact markdown. If unambiguous, apply directly and report one line.
```

## Agent prompt — no argument (audit)

```
You are a documentation architect. Audit /Users/slavochek/Projects/public/claritypledge/CLAUDE.md and its .claude/rules/*.md files.

First run: `wc -l CLAUDE.md`. Include the line count in your first sentence.

Report only: (1) current line count vs. 500-line target, (2) duplications, (3) misrouted content, (4) stubs that belong elsewhere.
One paragraph max. Issues only — no praise.
```

## Rules files (path-triggered, not CLAUDE.md)
- `.claude/rules/features.md` → `features/**/*.md`
- `.claude/rules/database.md` → `supabase/**/*`
- `.claude/rules/src.md` → `src/**/*.{ts,tsx}`
- `.claude/rules/tests.md` → `e2e/**/*.ts`, `src/**/*.test.*`
- `.claude/rules/git.md` → `src/**`, `scripts/**`, `**/*.sh`
