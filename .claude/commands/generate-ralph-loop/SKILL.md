---
name: generate-ralph-loop
description: Generate commands for Ralph Orchestrator (external tool) or Claude Code's internal /ralph-loop. Reads a spec or UAT file, analyzes complexity, and outputs ready-to-run commands. Primary output is Ralph Orchestrator (solves context compaction). Internal /ralph-loop is deprecated fallback for simple tasks.
---

# Generate Ralph Loop

Generate ready-to-run commands for iterative AI development loops.

**Primary output:** Ralph Orchestrator commands (external tool, no context compaction)
**Fallback:** Claude Code's internal `/ralph-loop` (deprecated, for simple tasks only)

## Why Ralph Orchestrator over internal /ralph-loop?

| Aspect | Ralph Orchestrator (external) | /ralph-loop (internal) |
|--------|------------------------------|------------------------|
| Context | Fresh each iteration | Compacts over time |
| State | Files (`.agent/memories.md`) | Degrades with compaction |
| Long loops | ✅ Reliable | ❌ Forgets earlier work |
| Setup | Requires `ralph` CLI installed | Built into Claude Code |
| Best for | Complex features, 10+ iterations | Simple tasks, <5 iterations |

## Usage

```
/generate-ralph-loop <path-to-spec-or-uat> [options]
```

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `<path>` | Yes | - | Path to spec file (e.g., `features/p89_swipeable_card_view.md`) or UAT file |
| `--spec` | No | auto-detect | Path to tech spec (overrides auto-detection) |
| `--uat` | No | auto-detect | Path to UAT file (if separate from spec) |
| `--max-iterations` | No | 30 | Safety limit for iterations |
| `--preset` | No | spec-driven | Ralph preset: `spec-driven`, `tdd-red-green`, `feature` |
| `--internal` | No | false | Force output of internal /ralph-loop (deprecated) |
| `--prompt-file` | No | false | Generate PROMPT.md file instead of inline command |

## Important: How to Run Ralph

**CRITICAL:** Ralph requires either a PROMPT.md file OR an inline prompt string. It does NOT read spec files directly from the `-p` flag.

### ❌ WRONG (common mistake)
```bash
# This passes a FILE PATH as prompt text — Ralph won't read the file!
ralph run -p features/p89_swipeable_card_view.md
```

### ✅ CORRECT Methods

**Method 1: Create PROMPT.md file (recommended)**
```bash
# Step 1: Create PROMPT.md with your task
echo "Implement P89 per features/p89_swipeable_card_view.md" > PROMPT.md

# Step 2: Run Ralph (it reads PROMPT.md automatically)
ralph run --no-tui
```

**Method 2: Inline prompt with task description**
```bash
# Pass the DESCRIPTION, not the file path
ralph run --no-tui -p "Implement P89 Swipeable Card View per features/p89_swipeable_card_view.md. Create ViewToggle, CardStack components."
```

### Why `--no-tui`?

The TUI (terminal UI) has compatibility issues with some terminals like **Ghostty**. Use `--no-tui` for reliable text output that works everywhere.

| Flag | When to use |
|------|-------------|
| `ralph run` | Standard terminals (iTerm2, Terminal.app) |
| `ralph run --no-tui` | Ghostty, or if TUI shows blank/blinking screen |

## Workflow

### Step 0: Check Ralph Orchestrator Installation

First, verify Ralph Orchestrator is available:

```bash
ralph --version
```

If not installed, include installation instructions in output:

```
Note: Ralph Orchestrator not detected.
Install with: npm install -g @ralph-orchestrator/ralph-cli
Or: brew install ralph-orchestrator
```

### Step 0.5: Initialize Ralph (one-time per project)

```bash
ralph init --backend claude
```

This creates `ralph.yml` config file.

**Worktree tip:** If you use git worktrees, you have two options:

1. **Commit ralph.yml to git** — all worktrees share the same config:
   ```bash
   ralph init --backend claude
   git add ralph.yml
   echo ".agent/" >> .gitignore  # Keep memories per-worktree
   git commit -m "chore: add ralph config"
   ```

2. **Init per worktree** — run `ralph init --backend claude` in each worktree separately

Recommended: Commit `ralph.yml`, gitignore `.agent/` (memories/tasks are session-specific).

### Step 1: Analyze Spec Complexity (Smart Recommendation)

Read the spec file and extract:
- **Requirements count** — Count `- [ ]` checkboxes, success criteria, "must", "should", "will" statements
- **Risk keywords** — `auth`, `payment`, `migration`, `security`, `breaking change`, `RLS`
- **Integration points** — External APIs, DB schema changes, third-party services
- **Component count** — New components listed in spec

**Decision logic:**

| Condition | Recommendation |
|-----------|----------------|
| Requirements < 8 AND no risk keywords AND integrations < 2 | `/loop` (simple, interactive) |
| Requirements < 15 AND minimal risk | Ralph Orchestrator |
| Complex (15+ req, risk keywords, many integrations) | Ralph Orchestrator + suggest chunking |

**Output order (most to least recommended):**

1. **Simple specs:** `/loop` first, then Ralph Orchestrator as alternative
2. **Medium specs:** Ralph Orchestrator (primary), internal /ralph-loop (deprecated fallback)
3. **Complex specs:** Ralph Orchestrator only, with suggestion to chunk into smaller specs

### Step 2: Read and Parse Input File

The input can be a **spec file** or **UAT file**. Detect by:
- UAT files: contain `UAT-X.Y` patterns, scorecard tables with ⬜/✅/❌
- Spec files: contain "Success Criteria", "Components", "Solution" sections

**From spec files, extract:**
1. **Feature name** — From heading or filename
2. **Success criteria** — Bullet points under "Success Criteria" section
3. **Components** — Listed components to implement
4. **Key decisions** — From "Key Design Decisions" or similar sections

**From UAT files, extract:**
1. **Feature name** — From heading or filename
2. **Test count** — Count all `UAT-X.Y` entries
3. **Current score** — Count ✅ vs total tests
4. **Categories** — List of category headings

### Step 3: Find or Generate UAT

If given a spec, look for UAT:
- `{spec_basename}_uat.md`
- `{spec_basename}_acceptance_tests.md`

If given a UAT, look for spec:
- `{uat_basename}.md` (e.g., `p61.md` from `p61_uat.md`)
- `{uat_basename}_tech_spec.md`

**If UAT doesn't exist:** Call `/generate-uat {spec_path}` to create it before generating the Ralph command. UAT gives Ralph concrete checkboxes to verify against.

### Step 4: Generate Ralph Orchestrator Command

**Output the simple one-liner only:**

```bash
ralph run --no-tui -p "Implement {FEATURE_NAME} per {SPEC_PATH}. {BRIEF_CONTEXT}. {UAT_CLAUSE}. Before complete: run /bmad:bmm:workflows:code-review and /design-audit, fix all issues."
```

Where:
- `{BRIEF_CONTEXT}` = 1-2 sentences max (key components, constraints)
- `{UAT_CLAUSE}` = "Verify against {uat_path}" (if UAT exists)

**Always include quality gates:** `/bmad:bmm:workflows:code-review` and `/design-audit`

**Keep it short.** Ralph will read the spec file for details.

**DO NOT output:**
- Long PROMPT.md heredocs
- Detailed success criteria lists
- Step-by-step implementation orders
- Component breakdowns

If the one-liner fails, THEN suggest creating a PROMPT.md as fallback.

### Step 5: Generate Deprecated Internal Command (Fallback)

**Only if `--internal` flag used or spec is very simple:**

```
---

## ⚠️ Deprecated: Internal /ralph-loop

The internal `/ralph-loop` runs inside Claude's context window, which compacts over long loops.
Use Ralph Orchestrator instead for reliable iteration.

**If you still want to use internal loop (simple tasks only):**

/ralph-loop "{PROMPT}" --max-iterations {MAX_ITERATIONS} --completion-promise "<promise>{FEATURE_NAME} COMPLETE</promise>"
```

### Step 6: Output Format

**Keep output minimal:**

```
# {FEATURE_NAME} — Ralph Command

**Requirements:** {N} | **Risk:** {keywords or "none"} | **Recommendation:** {/loop | Ralph}

---

## Run

```bash
ralph run --no-tui -p "{SHORT_PROMPT}"
```

**Stop:** `Ctrl+C` (graceful) or `pkill -f ralph` (force kill from another terminal)

---

**If it fails:** Create PROMPT.md with more detail, then `ralph run --no-tui`
```

That's it. No long setup instructions, no heredocs, no component lists.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Spec not found | Error with suggestion to check path |
| No success criteria in spec | Warning: "No explicit success criteria found. Consider adding a Success Criteria section." Generate command anyway using inferred criteria from description. |
| Very simple spec (<8 req) | Recommend `/loop` first, Ralph as alternative |
| Very complex spec (20+ req) | Recommend chunking: "Consider breaking into smaller features for better iteration." |
| Ralph not installed | Include installation instructions: `npm install -g @ralph-orchestrator/ralph-cli` |
| `--internal` flag | Output internal /ralph-loop command (with deprecation warning) |
| `--prompt-file` flag | Generate PROMPT.md file in project root instead of inline command |
| UAT file provided | Use UAT for structured tracking (update scorecard during iteration) |

## Example 1: Medium Spec (with UAT)

**Input:**
```
/generate-ralph-loop features/p89_swipeable_card_view.md
```

**Output:**
```
# P89 Swipeable Card View — Ralph Command

**Requirements:** 12 | **Risk:** none | **Recommendation:** Ralph

---

## Run

```bash
ralph run --no-tui -p "Implement P89 Swipeable Card View per features/p89_swipeable_card_view.md. Build ViewToggle, CardStack, SwipeableCard. Verify against features/p89_uat.md. Before complete: run /bmad:bmm:workflows:code-review and /design-audit, fix all issues."
```

**Stop:** `Ctrl+C` (graceful) or `pkill -f ralph` (force kill)

---

**If it fails:** Create PROMPT.md with more detail, then `ralph run --no-tui`
```

## Example 2: Spec without UAT

**Input:**
```
/generate-ralph-loop features/p85_event_verification_flow.md
```

**Behavior:**
1. No `features/p85_uat.md` found
2. Calls `/generate-uat features/p85_event_verification_flow.md` to create it
3. Then outputs command with UAT reference

## Example 3: Simple Spec

**Input:**
```
/generate-ralph-loop features/p95_fix_button_color.md
```

**Output:**
```
# P95 Fix Button Color

**Requirements:** 3 | **Risk:** none | **Recommendation:** /loop

---

This is simple. Just run `/loop` interactively.

If you prefer Ralph:
```bash
ralph run --no-tui -p "Fix button color per features/p95_fix_button_color.md. Before complete: run /bmad:bmm:workflows:code-review, fix all issues."
```
```

---

## Operational Notes

### Stopping Ralph

| Method | When to use |
|--------|-------------|
| `Ctrl+C` | During execution — graceful stop |
| `pkill -f ralph` | From another terminal — force kill |

### Initialization Reminder

Before running Ralph for the first time in a worktree:

```bash
ralph init --backend claude
```

**What `--backend claude` does:**
- Configures Ralph to use Claude as the AI backend (vs. GPT, Gemini, etc.)
- Creates `ralph.yml` with backend settings
- Does NOT read CLAUDE.md — it just sets which AI provider to use

The AI will still read CLAUDE.md through Claude Code's normal context loading.

**Worktree options:**
1. **Commit `ralph.yml`** — Share config across worktrees (recommended)
2. **Init per worktree** — Run `ralph init --backend claude` in each one
