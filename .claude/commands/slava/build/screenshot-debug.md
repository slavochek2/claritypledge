---
name: screenshot-debug
description: Investigate a visual bug from a screenshot — reads latest screenshot, formulates problem statement, does root cause analysis, proposes fix path.
when_to_use: When a visual/UI issue is spotted and you want structured investigation before fixing.
version: 1.0.0
---

# /screenshot-debug

Visual bug investigation from screenshot to fix path.

> **Principle:** Confirm the problem before diagnosing the cause. Never fix what you haven't confirmed.

## Usage

```bash
/screenshot-debug           # Reads latest screenshot from ~/Screenshots
/screenshot-debug p273      # Context: investigating issue in P273
/screenshot-debug "note"    # Freeform note — context only, does NOT skip any step
```

User args are additional context, not workflow overrides. All steps (0-4) execute in order regardless of arguments.

---

## Workflow

### Step 0: Orient — Which App Instance Generated This Screenshot?

Before reading the screenshot, confirm the source context:

```bash
git branch --show-current          # which branch is active?
git worktree list                  # any active worktrees?
lsof -ti:5173 -ti:3000 -ti:4173 | head -5   # which dev server ports are running?
```

State the context explicitly:
```
Running: branch [{branch}] | worktrees: [{list or none}] | dev server: port {N}
```

If a worktree is active and the screenshot may have come from it, say so — investigation may need to target the worktree codebase, not main.

---

### Step 1: Read the Screenshot

```bash
ls -t ~/Screenshots | head -1   # find latest
```

Read the file. Visually assess what's shown.

**Common ambiguous elements** — check before interpreting:
- `N/M` near an input → likely character counter (N chars of M max), not a date
- Small text below/beside inputs → validation message or helper text
- Colored badges/pills → status indicators, not decorative
- Numbers near icons → counts (notifications, items), not IDs

If any element's purpose is ambiguous, cross-reference the code before interpreting:
```bash
grep -r "visible-text-or-number" src/   # search for literals visible in the screenshot
```
Name uncertain elements as "unknown element showing [exact text]" in Step 2 rather than guessing their purpose. If grep returns no matches, note the element as unidentified and ask the user in Step 2.

---

### Step 2: Formulate Problem Statement

**Step 2 is mandatory — never skip it.** Even if prior context, user args, or an existing spec make the problem seem obvious, produce the 5-field statement. The value is forcing precise observation before diagnosis.

Use these exact five fields — do not rename, merge, or omit any:
```
**Visible:** [literal text, position, styling — no interpretation]
**Interpretation:** [what you believe this element is — flag confidence: certain / uncertain]
**Problem:** [what's wrong, given your interpretation]
**Expected:** [what should be there instead]
**Affected area:** [component / page / flow]
```

The Visible/Interpretation split is the core value of this step — collapsing them defeats the purpose.

Ask user: "Is this problem statement correct? Specifically, I interpreted [element] as [interpretation] — is that right? Confirm or correct before I continue."

Wait for explicit confirmation. If user corrects it — revise and re-present. Do not advance to Step 3 on a rejection. If the user says to skip or move on, proceed with their latest correction as the working hypothesis, flagged as unconfirmed.

---

### Step 3: Root Cause Analysis

Once problem is confirmed:

1. **Identify component** — which file/component renders the affected area?
   ```bash
   grep -r "ComponentName" src/
   ```

2. **Trace the data flow** — where does the displayed value come from? Props → state → service → edge functions → storage → DB? If the trace reaches an API or edge function, check the response directly (curl, network tab, or `supabase functions logs`) before assuming a frontend bug.

3. **Check for surface recurrence** — does this same issue likely exist elsewhere?
   ```bash
   grep -r "same pattern" src/
   ```

4. **Formulate root cause hypothesis:**
   ```
   **Root cause:** [specific — e.g., "position counts not fetched on initial mount in ProfilePage"]
   **Evidence:** [what in the code supports this]
   **Confidence:** High / Medium / Low
   ```

---

### Step 4: Propose Fix Path

```
**Approach:** [1-2 sentences — what needs to change]
**Files to change:** [list]
**Risk:** [what could break]
**Suggested next step:** /fix p{N} OR inline fix
```

If multiple surfaces of the **same bug** are affected, list all and ask which to fix now vs defer (with tickets).

**Inline fix guard:** If proposing an inline fix (not handing off to `/fix`), verify you are not on `main` first. Create a feature branch before applying any changes.

**Scope boundary:** If the screenshot reveals **unrelated bugs** beyond the one being investigated, list them separately: "I also spotted [N] other issues: [list]. Create tickets, or investigate now?" Do not silently expand scope.

---

## Output Format

Use the five fields from Step 2 above, wrapped in the border below. Do not redefine or subset the fields here.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Screenshot Debug: [brief label]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Five fields from Step 2]

"Is this correct? I interpreted [X] as [Y] — right?"

— after confirmation —

Root cause: [specific]
Evidence: [code path or grep result]

Fix path:
  Files: [list]
  Approach: [1-2 sentences]
  Spawn /fix? (y/n)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Visual Verification Fallback Chain

**Data prerequisite:** Before launching browser verification, query the DB or check local state to confirm the scenario is reproducible in the dev environment. If the bug requires specific data (e.g., a user with a position + story on the same point), verify that data exists first. No data = no visual verification — report this and ask the user how to proceed.

When the user asks to verify a fix visually (or `/verify` is invoked after this skill):

1. **Check MEMORY.md ACTION_NEEDED items** for browser tools before attempting. If a tool is flagged as known-broken, skip it entirely.
2. **Claude in Chrome** — try first (if not flagged). One attempt only.
3. **If it fails** (error, blank page, no response, extension disconnected) → **Chrome DevTools MCP** — headless, no extension needed. One attempt only.
4. **If both fail** → ask the user to verify manually.

**One-retry rule:** If a tool doesn't produce a usable screenshot on the first attempt, switch to the next tool immediately. Never retry the same tool twice.

---

## Related

- `/fix` — Implements the fix after root cause is identified
- `/verify` — Confirms fix visually after implementation
