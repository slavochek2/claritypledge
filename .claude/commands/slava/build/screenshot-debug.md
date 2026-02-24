---
name: screenshot-debug
description: Investigate a visual bug from a screenshot — reads latest screenshot, formulates problem statement, does root cause analysis, proposes fix path.
when_to_use: When a visual/UI issue is spotted and you want structured investigation before fixing.
---

# /screenshot-debug

Visual bug investigation from screenshot to fix path.

> **Principle:** Confirm the problem before diagnosing the cause. Never fix what you haven't confirmed.

## Usage

```bash
/screenshot-debug           # Reads latest screenshot from ~/Screenshots
/screenshot-debug p273      # Context: investigating issue in P273
```

---

## Workflow

### Step 1: Read the Screenshot

```bash
ls -t ~/Screenshots | head -1   # find latest
```

Read the file. Visually assess what's shown.

---

### Step 2: Formulate Problem Statement

State in plain terms:
```
**Observed:** [what you see — specific, not vague]
**Expected:** [what should be there instead]
**Affected area:** [component / page / flow]
```

Ask user: "Is this problem statement correct? Confirm or correct before I continue."

Wait for explicit confirmation. If user corrects it — revise and re-present. Loop until user explicitly confirms it's accurate. Do not advance to Step 3 on a rejection.

---

### Step 3: Root Cause Analysis

Once problem is confirmed:

1. **Identify component** — which file/component renders the affected area?
   ```bash
   grep -r "ComponentName" src/
   ```

2. **Trace the data flow** — where does the displayed value come from? Props → state → service → DB?

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

If multiple surfaces affected, list all and ask which to fix now vs defer (with tickets).

---

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Screenshot Debug: [brief label]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Observed: [what's visible]
Expected: [what should be there]

[awaiting confirmation]

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

## Related

- `/fix` — Implements the fix after root cause is identified
- `/verify` — Confirms fix visually after implementation
