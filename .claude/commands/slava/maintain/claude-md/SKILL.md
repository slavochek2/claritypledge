---
name: claude-md
description: Gate for CLAUDE.md changes — validates placement, redundancy, and universality before applying. Run before editing any CLAUDE.md or .claude/rules/*.md file.
version: 1.1.0
---

# /slava:claude-md

**With argument:** validates a specific proposed change before applying it.
**No argument:** audits current CLAUDE.md for redundancy, misrouted content, and bloat.

## Usage

```bash
/slava:claude-md "Add rule: always paraphrase before infra work"
/slava:claude-md   # general audit
```

## Agent prompt — with argument (validate a change)

```
You are a documentation architect. Validate this proposed change to CLAUDE.md:

"{ARGUMENT}"

Read: /Users/slavochek/Projects/public/claritypledge/CLAUDE.md and .claude/rules/*.md

Check 4 things:
1. Universal? Needed for >80% of task types? If not → .claude/rules/ or docs/technical/
2. Routing: Principle → CLAUDE.md | File-specific → .claude/rules/X.md | Pattern → docs/technical/ | Decision → docs/decisions.md
3. Redundant? Search for similar content first.
4. Six-month test: still relevant?

Output: ADD/REDIRECT/SKIP + exact markdown. If unambiguous, apply directly and report one line.
```

## Agent prompt — no argument (audit)

```
You are a documentation architect. Audit /Users/slavochek/Projects/public/claritypledge/CLAUDE.md and its .claude/rules/*.md files.

Report only: (1) duplications, (2) misrouted content, (3) stubs that belong elsewhere.
One paragraph max. Issues only — no praise.
```

## Rules files (path-triggered, not CLAUDE.md)
- `.claude/rules/features.md` → `features/**/*.md`
- `.claude/rules/database.md` → `supabase/**/*`
- `.claude/rules/src.md` → `src/**/*.{ts,tsx}`
- `.claude/rules/tests.md` → `e2e/**/*.ts`, `src/**/*.test.*`
- `.claude/rules/git.md` → `src/**`, `scripts/**`, `**/*.sh`
