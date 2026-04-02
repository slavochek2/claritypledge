---
name: find-skill
description: "Search local and external skill directories for matching skills"
when_to_use: "When looking for a skill that might already exist."
version: 1.0.0
---

# Find Skill

Search local and external skill directories to find the best skills for a given task.

## Usage

```
/find-skill research academic literature review
/find-skill debugging testing
/find-skill marketing copywriting
```

## Arguments

$ARGUMENTS - Description of the task or topic you need skills for

## Search Priority

| Priority | Source | Why |
|----------|--------|-----|
| 1 | Local `.claude/commands/` | Already installed, instant |
| 2 | External directories | Broader selection |

## Implementation

### Step 1: Parse the Task

Extract key concepts from $ARGUMENTS:
- Primary domain (research, development, marketing, etc.)
- Specific task type (literature review, debugging, copywriting, etc.)
- Tool/framework mentions

### Step 2: Search Local First

Use Grep to search `.claude/commands/` for matching skills:

```bash
# Search skill descriptions and content
Grep pattern="[keywords]" path=".claude/commands/" glob="**/*.md"
```

Extract from matches: skill name, path, description (first line after `#`)

### Step 3: Search External (Parallel)

**CRITICAL:** Make ALL WebFetch calls in a SINGLE message to execute in parallel.

In one tool-use response, call WebFetch for:
- `https://glama.ai/mcp/skills?search=[keywords]` — MCP skill registry
- `https://github.com/anthropics/courses` — Official Anthropic examples
- `https://github.com/search?q=[keywords]+claude+skill` — GitHub search

If any fetch fails, continue with results from others — don't block on failures.

### Step 4: Deduplicate & Rank

**Deduplication:** Same skill on multiple sources → keep highest-quality source

**Ranking criteria:**
| Factor | Weight | Notes |
|--------|--------|-------|
| Local match | +50 | Already installed = instant value |
| Exact keyword match | +30 | Title/description contains search term |
| Official/verified | +20 | Anthropic > verified author > community |
| Popularity | +10 | Install count, stars, forks |
| Recency | +5 | Updated within 6 months |

### Step 5: Output Results

```markdown
## Skills for: [task]

### Already Installed (Local)
| Skill | Path | Relevance |
|-------|------|-----------|
| skill-name | .claude/commands/awesome/skill.md | Direct match |

### Available to Install
| Skill | Source | Popularity | Why It Fits |
|-------|--------|------------|-------------|
| skill-name | glama.ai | 5K installs | Covers X |
| another | github | 200 stars | Handles Y |

### Install Commands

# From Glama.ai
claude mcp add skill-name

# From GitHub (manual)
# Copy the .md file to .claude/commands/
```

### Step 6: Fallback if No Results

If no good matches:
1. Suggest related skills that partially match
2. Offer to create a custom skill (`/skill-creator`)
3. Recommend native Claude capabilities that might suffice
