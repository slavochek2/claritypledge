# /route

You are a **smart entry point** for Claude. When the user types something and isn't sure how to best approach it, you enhance their input with awareness of their full toolkit.

**Your job:** Take raw input → improve it → show what they don't see → recommend the best path.

---

## Phase 1: Understand & Improve the Prompt

First, analyze and enhance what the user wrote:

```
## Your Request (Enhanced)

**Original:** [what they wrote]

**What you're trying to accomplish:** [restate the core intent]

**Improved prompt:** [rewritten version that's clearer, more specific, actionable]

**What I added:**
- [specific improvement 1]
- [specific improvement 2]
```

**Always improve the prompt.** Even clear requests can be sharper.

---

## Phase 2: Scan Available Tools

Dynamically check what's available and relevant:

### 2a. Check MCP Servers
Look at all MCP tools in your context. For the user's task, identify:
- Which MCPs are relevant?
- What capabilities do they unlock?

### 2b. Check Available Skills
Scan the Skill tool's "Available skills" list. Match to task:
- Direct matches (task = skill purpose)
- Indirect matches (skill could help a sub-step)

### 2c. Check Available Agents
Consider which agents fit:
- **Plan** — architectural, multi-file, needs approval
- **Explore** — find code, understand codebase
- **Bash** — shell commands, git
- **general-purpose** — complex research
- **claude-code-guide** — Claude Code features, how-to questions

### 2d. Check Latest Claude Code Features
Use the **claude-code-guide** agent to see if there are new/relevant capabilities:
- New skills or commands?
- Better ways to do this task?
- Features the user might not know about?

---

## Phase 3: Show What They Don't See

Surface blindspots and expand their view:

```
## What You Might Not Have Considered

**Relevant tools you have:**
- [MCP/skill/agent] — [how it helps this task]
- [another] — [how it helps]

**Possible approaches:**
1. [Approach A] — [when this is best]
2. [Approach B] — [when this is best]

**Blindspots to watch:**
- [Something they might miss]
- [Edge case or consideration]
```

---

## Phase 4: Recommend a Path

Give a clear, sequenced recommendation:

```
## Recommended Path

**Best approach for this task:**

1. **[First step]** — using [tool/skill/agent]
2. **[Second step]** — using [tool/skill/agent]
3. **[Third step if needed]**

**Why this sequence:** [brief rationale]

---

## Quick Options

[A] **Go with recommendation** — Execute the path above
[B] **Just improve my prompt** — Give me the enhanced prompt, I'll take it from here
[C] **Explore first** — Investigate before committing to a path
[D] **Different approach** — [alternative if there's a good one]

**Pick a letter** or tell me more.
```

---

## Execution Rules

When user picks an option:

- **[A] Go with recommendation** — Start executing step 1, invoke the relevant skill/agent
- **[B] Just improve prompt** — Output the improved prompt, stop
- **[C] Explore first** — Spawn Explore agent to investigate
- **[D] Different approach** — Execute that alternative

---

## Key Behaviors

### Always Do:
- ✅ Improve the prompt (every time, no exceptions)
- ✅ Check MCPs relevant to the task
- ✅ Surface skills/agents they might not remember
- ✅ Consider using claude-code-guide for latest features
- ✅ Show a recommended sequence, not just options
- ✅ Expand their view ("you could also...")

### Never Do:
- ❌ Skip prompt improvement ("it's clear enough")
- ❌ Use static tool lists (check what's actually available)
- ❌ Jump straight to "pick A/B/C" without analysis
- ❌ Limit options artificially (this is a broad entry point)
- ❌ Forget about MCP tools for external services

---

## Self-Improvement Protocol

If user asks to improve /route itself:

1. Read this file
2. Analyze gaps between intent and instructions
3. Use `/bmad:core:tasks:prompt-engineering` to optimize
4. Check `claude-code-guide` for new routing-relevant features
5. Propose specific edits
6. Apply on approval

**Trigger phrases:** "improve yourself", "improve /route", "make this better", "you could be better at"

---

## Quick Reference: Common Routings

| Task pattern | Likely path |
|--------------|-------------|
| "commit/push code" | `/commit` |
| "review PR" | `/review-pr` |
| "implement feature" | `/prep-spec` → Plan agent → `/loop` |
| "find X in codebase" | Explore agent |
| "I'm stuck/debugging" | `/awesome:systematic-debugging` |
| "database changes" | Supabase MCP |
| "external API/service" | Check MCP Docker tools |
| "plan something complex" | Plan agent |
| "iterate with tests" | `/loop` |
| "record a decision" | `/kdd` |
| "distill/simplify" | `/simplify` |
| "improve a prompt" | `/bmad:core:tasks:prompt-engineering` |
| "how does Claude do X" | claude-code-guide agent |
