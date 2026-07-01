---
paths:
  - ".claude/commands/slava/**/*.md"
---

# Skill Rules

Auto-loaded when editing `.claude/commands/slava/**/*.md`.

> **Trace before editing.** Before changing a skill, trace the behavior to the exact file+step that produces it and confirm that's what actually runs — don't edit the surface you assume is responsible. (Picking the wrong surface from a mental model — e.g. a rules file when the live skill is the real home — is assumption-over-tracing, the same root cause as shipping a fix without observing it run.)

---

## Archiving a Skill

When moving a skill to `archive/`, complete this checklist **before** moving the file:

1. **Find references** — grep for the skill name across all skill files and CLAUDE.md:
   ```bash
   grep -r "skill-name" .claude/commands/slava/ CLAUDE.md
   ```
2. **Check Sequential Flow** — if the skill appears in the `Sequential Flow` section of CLAUDE.md, update or remove it.
3. **Update or note references** — either update the referencing file to point to the replacement, or add a comment explaining why the reference is intentionally kept (e.g., backward-compat note).

Then add `archived_reason` frontmatter to the archived file:

```yaml
---
archived_reason: "one sentence — why archived and what to use instead (or 'no replacement')"
---
```

**Examples:**
- `"replaced by /slava:build:dev auto-close on success"`
- `"prep-spec sub-agent — /prep-spec superseded by sequential flow"`
- `"merged into archive/prep-spec-agents/alignment.md"`
- `"Notion no longer used — retired with no replacement"`

---

## Skill Frontmatter (Active Skills)

Required fields for all active skills:

```yaml
---
name: skill-name
description: One sentence — what this skill does and when to use it
when_to_use: Trigger conditions (optional but recommended)
version: 1.0.0
---
```

Namespace placement: `build/` · `maintain/` · `content/` · `client/` · `think/` · `util/` · `events/` · `script/` (scriptify twins)
No skill without a namespace — if none fits, propose a new one first.

**Exempt from frontmatter requirements:** `PRINCIPLES.md`, `shortcuts.md` (reference docs), `agent.md`/`synthesizer.md` (sub-agent files spawned by parent skills), `sifter-definitions.md` (shared definitions). These are not independently routable skills.

**Validator:** `python3 scripts/fix-skill-frontmatter.py` (dry-run) or `--apply` to fix. Pre-commit section 21 warns on staged skill files with missing frontmatter.

---

## MCP Calls — Always Include a Bash Fallback

When a skill instruction says "Use X MCP", it must also specify an explicit bash fallback for when MCP is unavailable (subagents, CI, non-interactive sessions).

**Pattern:**
```
Use Supabase MCP if available.
Fallback: curl with PROD_SUPABASE_SERVICE_ROLE_KEY from .env.local — see day-start.md step 1c for exact command.
```

**Tool hierarchy for Supabase prod queries:**
1. **curl + service role key** — prod only, universal (works in any context including subagents)
2. **Supabase MCP** — test DB only (MCP points at `gfjctyxqlwexxwsmkakq`; never use for prod). Ad-hoc SQL in main conversation context only — subagents never have MCP access.
3. **Supabase CLI** — migrations/schema only (`db push`, `db pull`, `projects api-keys`); cannot run ad-hoc SQL queries (`supabase db query` does not exist in v2.75.0)

**Why:** Without an explicit fallback, agents in subagent/CI contexts improvise — burning 10–20 tool uses on dead ends before failing.

## Branch Guard for Skill File Commits

Skill files (`.claude/commands/slava/**/*.md`) must be committed on `main`. A skill fix committed on a feature branch is stranded immediately — it is not on main right now, invisible to other sessions, and permanently lost if the branch is deleted.

**Before committing any skill file change, run:**
```bash
git branch --show-current
```

If the result is NOT `main`, stop. Use the wip-commit pattern to switch safely:

1. If you have uncommitted changes (run `git status --short` to check):
   ```bash
   git add $(git diff --name-only) $(git ls-files --others --exclude-standard) && git commit -m "wip: [what you were doing on this branch]"
   ```
   If the working tree is already clean, skip this step.
2. Switch to main:
   ```bash
   git checkout main
   ```
3. Make the skill file edit on main and commit it normally.
4. Return to your feature branch and discard the wip commit:
   ```bash
   git checkout {feature-branch} && git reset HEAD~1
   ```

**Do NOT use `git stash`** — stashes are invisible and can be lost. The wip-commit appears in `git log`, survives any git operation, and is trivially reversible with `git reset HEAD~1`.

---

## No Flags — Skills Auto-Detect

Skills never expose `--flag` options. They auto-detect from context (spec content, branch state, file changes). If a decision truly can't be auto-detected, ask once at runtime — don't make it a flag. Flags shift reasoning burden to the user; the point of a skill is to absorb that work.

## Adversarial Review — Lean Default

For "adversarial review" / "stress-test" / "critique" requests: default to ONE general-purpose critic agent with sharp framing and explicit criteria. Reserve `/slava:think:falsify` (5-phase pipeline) for production code, infrastructure, process rules, or `/kdd` follow-ups. Heavy pipeline on design playground = wrong artifact weight. Lean critic prompt shape: "Hostile reviewer. Break it." + criteria list + per-item verdict (SURVIVES/WEAK/FAILS) + word cap (≤1200).

---

## Cost Tracking

After each skill completes, silently append one line to `.private/logs/skill-costs.log`:

```
<ISO-timestamp> | <skill-name> | <model-used> | <tier>
```

Example: `2026-04-08T14:32:00Z | cleanup | sonnet | sonnet`

- `<model-used>`: the model that actually ran the skill body (haiku / sonnet / opus)
- `<tier>`: same as model-used (baseline before routing = opus)
- Create the file and parent dir if missing: `mkdir -p cp/.private/logs`
- Never surface this to the user — one silent write, then continue

---

## Subagent File Content — Always Inline

When spawning a subagent that needs file content, the main agent must read the files first and pass their content inline in the subagent prompt. Subagents cannot read from disk — they only have what's in their prompt.

**Pattern:**
```
# Main agent (before spawning):
Read file_a.md and file_b.md.
Then spawn subagent with prompt: "Here is the content of file_a.md: [content]. Here is file_b.md: [content]. Your task: ..."
```

**Why:** "Read the files yourself" in a subagent prompt is a no-op — subagents have no file access. Without inline content, the subagent either hallucinates or fails silently.
