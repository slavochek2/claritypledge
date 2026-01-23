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

### Step 3: Find Related Files

If given a spec, look for UAT:
- `{spec_basename}_uat.md`
- `{spec_basename}_acceptance_tests.md`

If given a UAT, look for spec:
- `{uat_basename}.md` (e.g., `p61.md` from `p61_uat.md`)
- `{uat_basename}_tech_spec.md`

**Both are optional** — Ralph Orchestrator works with just a spec file.

### Step 4: Generate Ralph Orchestrator Commands

**Primary output: Ralph Orchestrator**

Generate two forms:

**Form 1: Inline command (quick start)**

```bash
ralph run -p "Implement {FEATURE_NAME} per {SPEC_PATH}. Success criteria: {CRITERIA_SUMMARY}. Verify with browser MCP tools. Commit after each component."
```

**Form 2: PROMPT.md file (recommended for complex specs)**

Generate a `PROMPT.md` file in project root:

```markdown
# {FEATURE_NAME} Implementation

## Spec
{SPEC_PATH}

## Success Criteria
{EXTRACTED_SUCCESS_CRITERIA}

## Implementation Protocol
1. Read spec section relevant to current component
2. Implement using TDD (test first when applicable)
3. Verify with Playwright MCP or Chrome DevTools MCP
4. Commit after each component: `feat({feature_slug}): add {component}`
5. Continue until all success criteria met

## Components to Implement
{COMPONENT_LIST}

## Verification
Use browser MCP tools to verify:
- UI renders correctly
- Interactions work as specified
- No console errors

## Completion
When ALL success criteria are met, output: COMPLETE
```

Then run:
```bash
ralph run
```

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

**Complete output structure:**

```
# {FEATURE_NAME} — Ralph Commands

## Complexity Analysis
- Requirements: {N}
- Risk keywords: {list or "none"}
- Integration points: {N}
- Recommendation: {/loop | Ralph Orchestrator | Ralph Orchestrator + chunk}

---

## Step-by-Step Instructions

### Prerequisites (one-time setup)

1. **Install Ralph** (if not already installed):
   ```bash
   npm install -g @ralph-orchestrator/ralph-cli
   # or: brew install ralph-orchestrator
   ```

2. **Initialize Ralph in your project** (if no ralph.yml exists):
   ```bash
   ralph init --backend claude
   ```

   **Using git worktrees?** Commit `ralph.yml` to share across worktrees, but gitignore `.agent/`:
   ```bash
   git add ralph.yml && echo ".agent/" >> .gitignore
   ```

### Run the Task

**Option A: Using PROMPT.md (recommended)**

```bash
# Step 1: Create PROMPT.md
cat > PROMPT.md << 'EOF'
{PROMPT_MD_CONTENT}
EOF

# Step 2: Run Ralph
ralph run --no-tui
```

**Option B: One-liner with inline prompt**

```bash
ralph run --no-tui -p "{INLINE_PROMPT}"
```

### Monitor Progress

- Ralph shows iteration count and what it's doing
- State is saved to `.agent/memories.md` and `.agent/tasks.jsonl`
- Press `Ctrl+C` to stop if needed
- Use `ralph run --continue` to resume interrupted sessions

---

## Quick Reference

| Command | When to use |
|---------|-------------|
| `ralph run --no-tui` | ✅ Recommended (works in all terminals) |
| `ralph run` | Standard terminals only (iTerm2, Terminal.app) |
| `ralph run --continue` | Resume interrupted session |
| `/loop` | Simple interactive tasks (inside Claude) |
| `/ralph-loop` | ⚠️ Deprecated — avoid for new work |

### Common Issues

| Problem | Solution |
|---------|----------|
| TUI blank/blinking | Use `--no-tui` flag |
| "claude not found" | Run from terminal where `claude` command works |
| Nothing happens | Check PROMPT.md exists: `cat PROMPT.md` |
| Wrong: `-p file.md` | Pass description, not file path: `-p "Implement X per file.md"` |
```

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

## Example 1: Spec File Input

**Input:**
```
/generate-ralph-loop features/p89_swipeable_card_view.md
```

**Output:**
```
# P89 Swipeable Card View — Ralph Commands

## Complexity Analysis
- Requirements: 12 success criteria
- Risk keywords: none
- Integration points: 1 (P85 position scale)
- Recommendation: Ralph Orchestrator

---

## Step-by-Step Instructions

### Prerequisites (one-time setup)

1. **Install Ralph** (if not already installed):
   ```bash
   npm install -g @ralph-orchestrator/ralph-cli
   ```

2. **Initialize Ralph in your project** (if no ralph.yml exists):
   ```bash
   ralph init --backend claude
   ```

### Run the Task

**Option A: Using PROMPT.md (recommended)**

```bash
# Step 1: Create PROMPT.md
cat > PROMPT.md << 'EOF'
# P89 Swipeable Card View Implementation

## Spec
features/p89_swipeable_card_view.md

## Success Criteria
- [ ] View toggle switches between List and Card views
- [ ] Card View shows full-screen swipeable cards
- [ ] Swipe right = Agree (+2), left = Disagree (-2), down = Skip
- [ ] Stories: swipe = next, no position recorded
- [ ] Dropdown tap opens intensity options (P85 pattern)
- [ ] Participant avatar row filters content in both views
- [ ] Content type tabs filter Stories/Points/All
- [ ] Desktop keyboard shortcuts work in Card View
- [ ] Progress indicator shows position in stack
- [ ] Undo toast appears after Point swipes
- [ ] /live button appears on Story cards with correct text
- [ ] /live button shows mock toast (prototype)

## Components to Implement
1. ViewToggle — List/Cards switch
2. CardStack — Swipeable card container
3. SwipeableCard — Individual card with gesture handling
4. ParticipantRow — Horizontal avatar filter
5. ContentTypeTabs — Stories/Points/All filter
6. SwipeHint — Visual hint showing swipe directions

## Protocol
1. Start with ViewToggle component
2. Implement one component at a time
3. Verify with Playwright MCP after each component
4. Commit: `feat(p89): add {component}`

## Completion
When ALL success criteria pass, output: COMPLETE
EOF

# Step 2: Run Ralph
ralph run --no-tui
```

**Option B: One-liner with inline prompt**

```bash
ralph run --no-tui -p "Implement P89 Swipeable Card View per features/p89_swipeable_card_view.md. Add ViewToggle, CardStack, SwipeableCard components. Swipe right=Agree, left=Disagree, down=Skip. Verify with browser MCP."
```

---

## Quick Reference

| Command | When to use |
|---------|-------------|
| `ralph run --no-tui` | ✅ Recommended (works in all terminals including Ghostty) |
| `ralph run` | Standard terminals only (iTerm2, Terminal.app) |
| `ralph run --continue` | Resume interrupted session |

### ⚠️ Common Mistake

```bash
# ❌ WRONG - passes file path as prompt text
ralph run -p features/p89_swipeable_card_view.md

# ✅ CORRECT - passes description that references the file
ralph run --no-tui -p "Implement P89 per features/p89_swipeable_card_view.md"
```
```

## Example 2: Simple Spec

**Input:**
```
/generate-ralph-loop features/p95_fix_button_color.md
```

**Output:**
```
# P95 Fix Button Color — Ralph Commands

## Complexity Analysis
- Requirements: 3
- Risk keywords: none
- Integration points: 0
- Recommendation: /loop (simple task)

---

## Recommended: /loop

This is a simple task (3 requirements, no integrations).
Just run `/loop` interactively inside Claude Code — faster than setting up Ralph.

---

## Alternative: Ralph Orchestrator

If you prefer automated iteration:

```bash
# Create PROMPT.md
echo "Fix button color per features/p95_fix_button_color.md" > PROMPT.md

# Run Ralph
ralph run --no-tui
```
```
