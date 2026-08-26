---
name: create-skill
description: Create a new project skill. Derives full template from conversation before writing — prevents thin first drafts.
when_to_use: "Use when creating a new skill for this project. NOT for editing existing skills (edit directly). NOT for archiving skills (follow the archiving checklist in .claude/rules/skills.md)."
version: 1.0.0
---

# /create-skill

Create a new skill file for this project.

**Announce at start:** "Running /create-skill."

---

## When to use this vs other approaches

| Situation | Approach |
|---|---|
| Creating a new skill from scratch | `/create-skill` ← here |
| Editing an existing skill | Edit the file directly |
| Archiving a skill | Follow archiving checklist in `.claude/rules/skills.md` |
| Quick one-off agent instruction (no reuse) | Don't create a skill — write inline |

---

## Workflow

### Step 1: Lean challenge

Before doing any file work, answer three questions from the conversation context:

1. **Real friction?** Has this manual step appeared at least twice, or did the user explicitly name it as recurring pain? If this is the first time the problem surfaced, say: "This has only come up once — want to solve it inline first and create the skill after it recurs?"
2. **Clear trigger?** Can you write a one-sentence `when_to_use` that unambiguously distinguishes when to invoke this skill vs not? If not, the skill boundary is unclear — ask.
3. **Duplication check:** Scan existing skills for overlap:
   ```bash
   ls ./.claude/commands/slava/**/*.md 2>/dev/null
   grep -r "name:" ./.claude/commands/slava/ --include="*.md" | grep -v archive
   ```
   If an existing skill covers >50% of the intended scope, name it and ask whether to extend that skill instead.

If all three pass, proceed. If any fails, surface the issue and wait for user decision.

---

### Step 2: Determine namespace and filename

**Namespace rules** (from `.claude/rules/skills.md`):
- `build/` — dev lifecycle: creating, building, shipping features
- `maintain/` — repo health, audits, automation
- `content/` — writing, copy, publishing
- `think/` — analysis, decisions, frameworks
- `util/` — cross-cutting utilities
- `events/` — event-specific workflows

No skill without a namespace. If none fits, propose a new one and wait for approval before proceeding.

**Filename conventions:**
- Lowercase, underscores (not hyphens): `create_skill.md` not `create-skill.md`
- Exception: existing skills in this repo use hyphens (`create-skill.md`, `change-request.md`) — match the existing convention in the target namespace
- Derive from the skill's primary verb + noun: `create-skill`, `change-request`, `design-audit`

Check actual filenames in the target namespace before deciding:
```bash
ls ./.claude/commands/slava/{namespace}/
```

---

### Step 3: Read existing skills in the target namespace (subagent)

Spawn a subagent (`model: "sonnet"`) to analyze 2-3 existing skills in the same namespace for conventions and quality bar:

```
You are a skill analyst. Read these skill files in full:
{paths to 2-3 skills in the same namespace}

Extract and return:

1. STRUCTURE PATTERN — how are sections ordered? What sections appear in every skill vs optionally?
2. WORKFLOW STYLE — numbered steps, flowchart, prose? How granular are the steps?
3. SELF-CHECK PATTERN — is there a checklist? Where does it appear (before or after writing)?
4. SUBAGENT PATTERN — do skills spawn subagents? How is the prompt structured?
5. ANNOUNCE PATTERN — how does the skill announce it's running?
6. TEMPLATE QUALITY — does the skill include a full output template? Is it populated with examples?
7. QUALITY GATES — what prevents a thin/wrong output from being written?

Then: given the new skill being created ({skill name and purpose from conversation}),
identify which patterns from the above apply and which sections this skill needs.
Return as a structured list — not prose.
```

Use subagent output to calibrate the new skill's structure. Do not write from memory.

---

### Step 4: Derive full template from conversation

Before writing a single character of the skill file, derive the complete output template from the conversation context.

This is the most important step. A skill that produces a thin output will be rebuilt. The template must match what was actually designed in the conversation.

**Scan the conversation for:**
- The full output format agreed upon (sections, fields, content)
- Any ASCII mockups, table structures, or examples that were shown
- Constraints discussed ("must include X", "never do Y")
- What triggers this skill (exact phrasing the user would use)
- What the agent should do first (ask? read? run a script?)
- What the agent should never do (scope constraints)

**Then draft:**
1. The complete output template (every section, with placeholder text showing intent)
2. The workflow (numbered steps the agent follows)
3. The self-check checklist (verifies output quality before writing)

**Show the draft to the user as terminal output** — not a file. Ask:

```
Here's the full template I'll encode into the skill:

[paste the derived template with all sections]

And the workflow:
[numbered steps]

Does this match what you designed? Any sections missing or wrong?
```

**Wait for thumbs-up before writing the file.** If the user says "looks good" or equivalent, proceed. If they flag a gap, revise and show again.

---

### Step 4.5: Adversarial design review (conditional)

Run this **only when the skill encodes consequential logic** — being wrong causes real harm. Trip the gate if the skill touches any of:

- security / secrets / credentials
- DB mutations, money, or anything irreversible
- external actions (email, social, PRs, posting, sending)
- a **process rule that gates other work** (review gates, ship gates, audit skills)

If none apply (content, formatting, status, convenience skills), **skip** — a red team on a thin skill is wrong-artifact-weight.

When it trips, spawn **one** general-purpose critic (per the "Adversarial Review — Lean Default" rule in `.claude/rules/skills.md` — one sharp critic, not `/falsify`) **before writing the file**. Pass the full derived design + the verified facts from the conversation inline. Prompt shape:

```
You are a hostile reviewer. Find where this skill's design FAILS — gives a false
sense of safety, misses the dangerous case, or takes a harmful action. Be concrete,
do NOT be agreeable. [paste full design + verified facts]
Return a ranked list (CRITICAL/HIGH/MED): scenario · why the design misses it ·
specific fix. Prioritize the few that would actually bite. Under 500 words.
```

Fold every CRITICAL/HIGH fix into the design, then re-show the deltas to the user before writing. (This is the pass that caught 4 real failure modes in `/slava:maintain:secret-audit`'s design — including one already demonstrated live.)

---

### Step 5: Write the skill file

**Path:** `./.claude/commands/slava/{namespace}/{filename}.md`

**Required frontmatter:**

```yaml
---
name: {skill-name}
description: {One sentence — what it does and when to use it}
when_to_use: "{Specific trigger conditions — unambiguously distinguishes when to invoke vs not}"
version: 1.0.0
---
```

**Required sections (adapt to skill type):**

```markdown
# /{skill-name}

{One-line description of what the skill does.}

**Announce at start:** "Running /{skill-name}."

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| {this skill's situation} | `/{skill-name}` ← here |
| {adjacent situation} | `/{other-skill}` |

---

## Workflow

### Step 1: {First action}

{What the agent does. Concrete. Include bash commands, subagent prompts, or questions to ask.}

---

### Step N: Self-check before writing

- [ ] {Gate 1 — what must be true before writing}
- [ ] {Gate 2}
- [ ] {Gate 3}

---

### Step N+1: Write the output

{Where the file goes, naming convention, frontmatter if applicable.}

---

### Step N+2: Confirm and hand off

{What the agent says after completing. File path, what was created, suggested next step.}

---

## Template

{Full output template with placeholder text. Every section the output must contain.}

---

## Quality Gates (Agent Self-Review)

Before writing, verify:

- [ ] {Gate tied to a specific section or field}
- [ ] {Gate}

---

## Related Skills

- `/{related-skill}` — {one sentence on when to use it instead}
```

---

### Step 6: Self-check before writing the file

- [ ] Lean challenge passed — real friction, clear trigger, no duplication
- [ ] Namespace confirmed — fits an existing namespace or new one approved
- [ ] Filename matches existing conventions in the namespace (check actual files, not memory)
- [ ] Subagent ran — structure derived from existing skills in namespace, not assumed
- [ ] Full template derived from conversation — not invented, not thin
- [ ] Step 4.5 consequence test applied — adversarial critic run (CRITICAL/HIGH fixes folded in) OR consciously skipped as a low-consequence skill
- [ ] Draft shown to user — explicit thumbs-up received before writing
- [ ] Frontmatter complete: `name`, `description`, `when_to_use`, `version: 1.0.0`
- [ ] `when_to_use` is unambiguous — can distinguish invoke vs not without reading the body
- [ ] Announce line present: `**Announce at start:** "Running /{skill-name}."`
- [ ] Self-check checklist in the skill — prevents thin output from being written
- [ ] Quality gates section present — at least 3 specific gates
- [ ] Related skills section present — at least one entry

**If any gate fails:** Fix before writing. A skill with a missing section will be rebuilt in the next session.

---

### Step 7: Confirm and hand off

```
Created: .claude/commands/slava/{namespace}/{filename}.md

Trigger: /{skill-name}
Namespace: {namespace}
Template sections: {count}
Self-check gates: {count}

Next: Run "/{skill-name}" to test it on the current task if applicable.
Or: Run "/kdd" if there are learnings from this session worth capturing.
```

---

## Quality Gates (for this skill's own output)

Before writing the skill file, verify:

- [ ] Lean challenge explicitly answered — not skipped
- [ ] Subagent ran to read existing namespace skills — not skipped
- [ ] Draft template shown as terminal output before file was written
- [ ] User explicitly approved the draft (not assumed)
- [ ] Frontmatter has all four required fields
- [ ] Skill body has: announce line, when-to-use table, numbered workflow, self-check, template, quality gates, related skills
- [ ] File path is absolute and uses correct namespace

---

## Related Skills

- `/slava:build:change-request` — file a redesign spec; also uses draft-first pattern for predecessor analysis
- `/slava:build:create-spec` — create a full feature spec; use when the output is a tracked feature, not a skill
- `/slava:maintain:claude-md` — gate for changes to CLAUDE.md; run before adding skill invocation rules there
- `/slava:maintain:kdd` — capture learnings after a skill is created or a session surfaces new patterns
