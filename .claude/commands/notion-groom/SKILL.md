---
description: 'Sync Notion kanban with Git source of truth. Clean up stale items, identify gaps, ask user decisions.'
---

# /notion-groom

Synchronize your private Notion kanban with Git (source of truth). Research items, identify blindspots, enrich descriptions, and correlate with strategic docs.

**Announce at start:** "I'm using the /notion-groom skill to sync your Notion kanban with Git."

## Usage

```
/notion-groom [--mode sync|deep|blindspots] [--dry-run] [--status <status>]
```

**Examples:**
- `/notion-groom` — Quick sync (status matching, orphan detection)
- `/notion-groom --mode deep` — Deep groom each item (research, enrich, correlate)
- `/notion-groom --mode blindspots` — Find gaps in coverage vs roadmap/hypotheses
- `/notion-groom --dry-run` — Show what would change without modifying

---

## What This Skill Does

### Mode: `sync` (default) — Quick Cleanup
1. **Read Notion kanban** — Fetch all items from `[C] Kanban` database
2. **Read Git features/** — List active specs and done specs
3. **Find disconnects:**
   - Notion items with no Git spec
   - Git specs not reflected in Notion
   - Status mismatches (Notion says "Done" but not in `features/done/`)
   - Stale items (no activity for 14+ days)
4. **Ask user questions** — One decision at a time
5. **Update systems** — Apply decisions to Notion and/or Git

### Mode: `deep` — Research & Enrich Each Item
For each Notion item, I will:

1. **Understand the item:**
   - Read any linked spec or page content
   - Search codebase for related code
   - Check if similar features exist

2. **Correlate with strategy:**
   - Which roadmap phase does this belong to?
   - Which hypothesis would this validate? (H0-H5)
   - Does this connect to theory-of-change mechanisms?

3. **Enrich the item:**
   - Suggest clearer title (e.g., "[US] AI umderstamding" → "AI-Assisted Story Understanding")
   - Add context from related docs
   - Link to related specs/items
   - Suggest priority based on roadmap alignment

4. **Ask for your input:**
   - "Does this interpretation match your intent?"
   - "Should I update the title/description?"
   - "This seems related to H2 — should I link it?"

### Mode: `blindspots` — Find What's Missing
Compare your Notion kanban against strategic docs to find gaps:

| Source | What I Check | Blindspot Example |
|--------|--------------|-------------------|
| `docs/roadmap.md` | Each phase has Notion items | "Phase 3 (Sifter) has no active items" |
| `docs/hypotheses.md` | Each hypothesis has validation path | "H0b (social FOMO) has no spec testing it" |
| `docs/theory-of-change.md` | Key mechanisms have implementation | "Topology Map mentioned but no item for it" |
| `Requested by users` field | User requests are addressed | "5 users requested X but it's not on roadmap" |
| Feature dependencies | Blocked items have blockers tracked | "P85 needs P60 but P60 not in Notion" |

**Output:** A prioritized list of blindspots with suggested actions.

---

## Process

### Step 1: Gather Data

**From Notion:**
```
Use mcp__MCP_DOCKER__API-post-database-query on database 2ca4e141-6e62-8080-bdef-d8fd0f973686
Extract: Name, Status, Type, Prio, Created Time, Last Edited, Feature Github URL
```

**From Git:**
```
Glob: features/*.md → Active specs
Glob: features/done/*.md → Completed specs
Extract feature numbers (p{N}) from filenames
```

### Step 2: Correlate Items

Build a correlation table:

| Notion Item | Git Spec | Status Match | Action Needed |
|-------------|----------|--------------|---------------|
| [US] Events | p61_events.md | Yes (Done/done) | None |
| [US] AI stuff | None | N/A | Ask: Create spec? |
| None | p97_tdd.md | N/A | Ask: Add to Notion? |
| [US] Old thing | None | Backlog 30d | Ask: Still relevant? |

**Correlation rules:**
- Match by `Feature Github URL` property if set
- Match by name similarity (fuzzy match) if no URL
- Match by feature number (p{N}) in name

### Step 3: Identify Issues

**Issue types:**

| Issue | Detection | Question to Ask |
|-------|-----------|-----------------|
| **Orphan in Notion** | Notion item, no Git spec, Status != Rejected | "Should this become a spec?" |
| **Orphan in Git** | Git spec exists, no Notion item | "Add to Notion for tracking?" |
| **Status mismatch** | Notion=Done but not in features/done/ | "Is this actually done?" |
| **Stale backlog** | Backlog + last_edited > 14 days | "Still relevant or reject?" |
| **Missing link** | Notion item has spec but no Feature Github URL | "Link to {spec}?" |
| **Vague title** | Name doesn't describe actionable work | "What does '{name}' mean?" |

### Step 4: Ask Questions (Interactive)

Present issues one at a time using AskUserQuestion:

```
Issue 1 of 12: Orphan in Notion

"[US] AI umderstamding" (Backlog, created 14 days ago)
No Git spec found. What should we do?

Options:
1. Create spec → I'll draft features/p{next}_ai_understanding.md
2. Keep in backlog → Leave as idea for later
3. Reject → Mark as Rejected in Notion
4. Tell me more → Explain what this is about
```

**Decision flow:**
```
Create spec → Ask for brief description → Write spec draft → Link in Notion
Keep → No change
Reject → Update Notion status to "Rejected"
Tell me more → User explains → Re-ask with context
```

### Step 5: Apply Changes

For each decision:

**If "Create spec":**
1. Determine next feature number: `ls features/*.md | grep -o 'p[0-9]*' | sort -t'p' -k2 -n | tail -1`
2. Ask user for 1-2 sentence description
3. Create minimal spec file:
   ```markdown
   # P{N}: {Title}

   **Status:** Draft
   **Created:** {date}
   **Source:** Notion groom from "[US] {original name}"

   ## Problem

   {user's description}

   ## Success Criteria

   - [ ] TBD — flesh out before implementation
   ```
4. Update Notion item:
   - Set `Feature Github URL` to spec path
   - Optionally update name to match spec title

**If "Reject":**
1. Update Notion status to "Rejected"
2. Optionally add note about why

**If "Link":**
1. Update Notion `Feature Github URL` property

**If "Add to Notion":**
1. Create new Notion page in kanban database
2. Set Name, Type (User Story), Status (based on spec location)
3. Set Feature Github URL

### Step 6: Summary

After all decisions, show summary:

```
Groom complete!

Changes made:
- Created 2 new specs: p105_ai_understanding.md, p106_content_strategy.md
- Rejected 3 stale items
- Linked 4 Notion items to existing specs
- Added 1 Git spec to Notion

Remaining issues:
- 2 items need your input later (marked "To groom" in Notion)

Next steps:
- Review draft specs and flesh out success criteria
- Run /notion-publish to update public roadmap
```

---

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--mode <mode>` | sync | `sync` (quick), `deep` (research each item), `blindspots` (find gaps) |
| `--dry-run` | false | Show what would change without modifying anything |
| `--status <status>` | all | Only groom items with this status (Backlog, Today, Week, etc.) |
| `--type <type>` | all | Only groom items of this type (User Story, Bug, Task, etc.) |
| `--stale-days <N>` | 14 | Consider items stale after N days without edit |
| `--item <name>` | none | Groom a specific item by name (deep mode only) |

---

## Deep Groom Process (--mode deep)

For each item, I follow this research flow:

### Step D1: Understand Intent
```
Read the Notion item title and any page content
Ask myself: "What is the user trying to accomplish?"
If unclear: Ask user to clarify before proceeding
```

### Step D2: Search for Context
```
Grep codebase for related terms
Check docs/roadmap.md for related phases
Check docs/hypotheses.md for related hypotheses
Check features/*.md for related specs
Check features/done/*.md for prior art
```

### Step D3: Propose Improvements
Present findings and suggestions:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Deep Groom: "[US] AI umderstamding"

📍 Current State:
   Status: Today | No description | No linked spec

🔍 What I Found:
   - Related to Phase 3 (Sifter) in roadmap
   - Would help validate H1 (AI can detect Story vs Point)
   - Similar to done/p58_sifter_mvp.md
   - Code exists: src/app/components/sift/ (prototype)

💡 Suggestions:
   1. Rename to: "AI-Assisted Content Understanding"
   2. Link to Phase: Sifter (Phase 3)
   3. Link to Hypothesis: H1
   4. Set Priority: P2 (after current P85 work)
   5. Description: "Improve AI's ability to distinguish
      Stories from Points in user input"

What would you like to do?
  [1] Apply all suggestions
  [2] Apply some (I'll ask about each)
  [3] Skip this item
  [4] Tell me more about your intent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step D4: Update Notion
If approved, update the Notion item with:
- Improved title
- Rich description with context
- Links to related items (via Relations)
- Appropriate tags
- Priority based on roadmap alignment

---

## Blindspot Detection (--mode blindspots)

### What I Compare

| Strategic Doc | What Should Exist | Blindspot Detection |
|---------------|-------------------|---------------------|
| `docs/roadmap.md` | Each phase should have items in Notion | Missing: "Phase X has no items" |
| `docs/hypotheses.md` | Each H0-H5 should have validation path | Missing: "H3 has no spec testing it" |
| `docs/theory-of-change.md` | Key mechanisms need implementation | Missing: "√N cascade has no tooling" |
| `Requested by users` (Notion) | Requests should be on roadmap or rejected | Unaddressed: "5 users asked for X" |
| Feature dependencies | Blockers should be tracked | Missing: "P85 needs X but X not tracked" |

### Blindspot Report Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLINDSPOT REPORT

🔴 Critical (blocking current work):
   1. P85 depends on "card selection" but no item exists
      → Suggest: Create "[US] Card selection in /live"

🟡 Strategic (gaps in hypothesis coverage):
   2. H0b (social FOMO) has no validation spec
      → Suggest: Add to P85 success criteria
   3. H3 (recursive teachability) not being tested
      → Suggest: Create future spec or mark as "post-H2"

🟢 Nice-to-have (user requests not addressed):
   4. 3 users requested "dark mode" — not on roadmap
      → Suggest: Add to backlog with P6 or reject with reason
   5. "Offline mode" requested but no decision recorded
      → Suggest: Record decision in decisions.md

Actions:
  [1] Create items for critical blindspots
  [2] Review each blindspot individually
  [3] Export report to docs/blindspots.md
  [4] Skip for now
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Notion Database Schema Reference

The `[C] Kanban` database has these relevant properties:

| Property | Type | Usage |
|----------|------|-------|
| Name | title | Item title |
| Status | select | Backlog, To groom, Week, Today, In Progress, Blocked, Done, Rejected |
| Type | select | Bug, Task, User Story, Sprint, Epic, Question, Hypothesis |
| Prio | select | 24h fix, P0-P9 |
| Feature Github URL | url | Link to Git spec (our correlation key) |
| Created Time | created_time | For staleness detection |
| Last edited time | last_edited_time | For staleness detection |
| Tags | multi_select | productivity, marketing, events, development, content, community, pledge |

**Database ID:** `2ca4e141-6e62-8080-bdef-d8fd0f973686`

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Notion API unavailable | Error: "Can't connect to Notion. Check Docker MCP is running." |
| No issues found | "Everything is in sync! No action needed." |
| User skips all questions | "Skipped all items. Run again when ready to decide." |
| Item has children (Epic) | Show child count, ask about Epic as a whole |
| Multiple specs match one Notion item | Ask user which spec to link |

---

## Example Session

```
> /notion-groom

Reading Notion kanban... found 30 items
Reading Git features/... found 9 active, 41 done
Correlating...

Found 7 issues to resolve:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Issue 1/7: Orphan in Notion

"[US] Content consumption strategy"
Status: Today | Created: 3 days ago | No Git spec

What should we do?
  [1] Create spec (Recommended)
  [2] Keep in backlog
  [3] Reject
  [4] Tell me more about this
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> 1

Brief description for the spec:
> Strategy for how users consume content - feed vs search vs recommendations

Creating features/p105_content_consumption_strategy.md...
Linking in Notion...
Done! Next issue...

[...continues for remaining issues...]
```

---

## Related Skills

- `/notion-publish` — Publish Git docs to public Notion pages
- `/prep-spec` — Prepare a detailed spec from an idea
- `/kdd` — Record decisions after finishing features

---

## MCP Tools Used

**Notion:**
- `mcp__MCP_DOCKER__API-post-database-query` — Read Notion kanban
- `mcp__MCP_DOCKER__API-patch-page` — Update Notion page properties
- `mcp__MCP_DOCKER__API-post-page` — Create new Notion page
- `mcp__MCP_DOCKER__API-get-page` — Read full page content
- `mcp__MCP_DOCKER__API-patch-block-children` — Update page content/description

**Git & Codebase:**
- `Glob` — Find Git spec files
- `Grep` — Search codebase for related code
- `Read` — Read spec content, roadmap, hypotheses
- `Write` — Create new spec files

**Strategic Docs Read (for correlation):**
- `docs/roadmap.md` — Phase alignment
- `docs/hypotheses.md` — H0-H5 correlation
- `docs/theory-of-change.md` — Mechanism coverage
- `docs/decisions.md` — Prior decisions on similar topics

---

## Data Safety

| Action | Reversible? | How to Undo |
|--------|-------------|-------------|
| Update Notion title | Yes | Notion page history |
| Update Notion description | Yes | Notion page history |
| Add Notion relations/links | Yes | Remove the relation |
| Create Git spec | Yes | `git checkout` or delete file |
| Update Notion status | Yes | Notion page history |

**Nothing is deleted.** All changes are additive or updateable. Notion keeps 30+ days of page history.
