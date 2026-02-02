---
description: 'Publish Git docs (roadmap, theory-of-change, features) to public-facing Notion pages.'
---

# /notion-publish

Publish Git documentation to public Notion pages. Creates a readable, non-developer-friendly view of your roadmap, vision, and features.

**Announce at start:** "I'm using the /notion-publish skill to sync Git docs to your public Notion."

## Usage

```
/notion-publish [--target <page-id>] [--docs <list>] [--features] [--dry-run]
```

**Examples:**
- `/notion-publish` — Publish all configured docs to default target
- `/notion-publish --docs roadmap,theory-of-change` — Publish specific docs only
- `/notion-publish --features` — Publish feature previews from features/*.md
- `/notion-publish --dry-run` — Preview what would be published

---

## Prerequisites

Before first run:

1. **Create a public parent page in Notion** (e.g., "Clarity Pledge Public")
2. **Share it with "docker mcp" bot** (Add connections → docker mcp)
3. **Note the page ID** (from URL: notion.so/Your-Page-**abc123def456**...)
4. **Optionally make it public:** Share → Publish → Enable "Share to web"

---

## What This Skill Does

1. **Read Git docs** — Parse markdown files from `docs/`
2. **Transform to Notion format** — Convert markdown to Notion blocks
3. **Create/update Notion pages** — Idempotent sync (update if exists, create if not)
4. **Build roadmap board** — Create database view of features
5. **Add metadata** — "Last synced from Git" timestamp

---

## Default Document Set

| Git Source | Notion Page Title | Description |
|------------|-------------------|-------------|
| `docs/roadmap.md` | Roadmap | What we're building and when |
| `docs/theory-of-change.md` | How It Works | The cascade mechanism |
| `docs/hypotheses.md` | What We're Testing | Validation status |
| `docs/lean-canvas.md` | Business Model | Problem, solution, customers |
| `docs/philosophy.md` | Why This Works | Epistemological foundation |

---

## Process

### Step 1: Verify Target

Check if target page exists and is accessible:

```
Use mcp__MCP_DOCKER__API-get-page with page_id
If 404: "Target page not found. Create a page in Notion and share with 'docker mcp' bot."
If 403: "No access to target page. Share it with 'docker mcp' bot."
```

If no target specified, search for existing "Clarity Pledge Public" page:
```
Use mcp__MCP_DOCKER__API-post-search with query "Clarity Pledge Public"
```

### Step 2: Read Git Docs

For each doc in the publish set:

```
Read file content
Extract: title (first H1), sections, content
Parse frontmatter if present
```

### Step 3: Transform to Notion Blocks

Convert markdown to Notion block format:

| Markdown | Notion Block Type |
|----------|-------------------|
| `# Heading` | heading_1 |
| `## Heading` | heading_2 |
| `### Heading` | heading_3 |
| Paragraph | paragraph |
| `- bullet` | bulleted_list_item |
| `1. numbered` | numbered_list_item |
| `> quote` | quote |
| ``` code ``` | code |
| `| table |` | table |
| `[link](url)` | Rich text with link |
| `**bold**` | Rich text with bold annotation |
| `*italic*` | Rich text with italic annotation |
| `![image](url)` | image (if URL) or skip (if local path) |

**Special handling:**
- Remove internal links to other Git files (e.g., `[roadmap](roadmap.md)`)
- Convert relative links to absolute where possible
- Strip developer-only sections (marked with `<!-- dev-only -->`)
- Add "Source: Git" footer with sync timestamp

### Step 4: Create/Update Pages

For each document:

**Check if page exists:**
```
Search children of target page for matching title
Use mcp__MCP_DOCKER__API-get-block-children with target page_id
```

**If exists:** Update content
```
Use mcp__MCP_DOCKER__API-delete-block to clear existing content
Use mcp__MCP_DOCKER__API-patch-block-children to add new content
```

**If not exists:** Create new page
```
Use mcp__MCP_DOCKER__API-post-page with parent=target, title=doc title
Use mcp__MCP_DOCKER__API-patch-block-children to add content
```

### Step 5: Build Feature Database (Optional)

If `--features` flag is set, create a roadmap database:

**Database schema:**
| Property | Type | Source |
|----------|------|--------|
| Name | title | Spec title |
| Status | select | Active / Done / Planned |
| Phase | select | From roadmap phases |
| Description | rich_text | First paragraph of spec |
| Priority | select | P0-P9 from spec |
| Git Link | url | Link to spec file on GitHub |

**Populate from:**
- `features/*.md` → Status: Active
- `features/done/*.md` → Status: Done
- Roadmap phases not yet started → Status: Planned

### Step 6: Add Sync Metadata

Add footer to each page:
```
---
📄 Source: Git repository
🔄 Last synced: {timestamp}
🔗 View source: {github-url-if-available}

This page is automatically generated. Edits here will be overwritten.
To suggest changes, contact the team.
```

### Step 7: Summary

```
Published to Notion!

Pages updated:
  ✅ Roadmap (updated)
  ✅ How It Works (created)
  ✅ What We're Testing (updated)
  ⏭️ Business Model (skipped - no changes)

Feature database: 9 active, 41 done

Public URL: https://notion.site/Clarity-Pledge-Public-abc123

Next sync: Run /notion-publish again after Git changes
```

---

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--target <page-id>` | auto-detect | Notion page ID to publish under |
| `--docs <list>` | all | Comma-separated doc names: roadmap,theory-of-change,hypotheses,lean-canvas,philosophy |
| `--features` | false | Also publish feature database from features/*.md |
| `--dry-run` | false | Show what would be published without making changes |
| `--force` | false | Overwrite even if content hasn't changed |

---

## Configuration

Store publish settings in `.claude/notion-publish.json`:

```json
{
  "target_page_id": "abc123def456...",
  "docs": {
    "docs/roadmap.md": {
      "title": "Roadmap",
      "include": true
    },
    "docs/theory-of-change.md": {
      "title": "How It Works",
      "include": true
    },
    "docs/hypotheses.md": {
      "title": "What We're Testing",
      "include": true
    }
  },
  "feature_database": true,
  "github_base_url": "https://github.com/your-org/clarity-pledge/blob/main/"
}
```

If config doesn't exist, create it on first run with user input.

---

## Markdown → Notion Conversion Details

### Tables

Markdown tables convert to Notion tables:

```markdown
| Column A | Column B |
|----------|----------|
| Cell 1   | Cell 2   |
```

→ Notion table block with table_rows

### Code Blocks

````markdown
```typescript
const x = 1;
```
````

→ Notion code block with language="typescript"

### Callouts/Quotes

```markdown
> **Note:** Important information here
```

→ Notion callout block with icon based on keyword (Note, Warning, Tip)

### Internal Links (Stripped)

```markdown
See [authentication.md](technical/authentication.md) for details.
```

→ "See authentication.md for details." (link removed, text kept)

### Developer-Only Sections (Stripped)

```markdown
<!-- dev-only -->
This section is for developers only.
<!-- /dev-only -->
```

→ (entire section removed from public version)

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Target page not found | Error with setup instructions |
| No access to target | Error: "Share page with 'docker mcp' bot" |
| Doc file not found | Warning: "Skipping {doc} - file not found" |
| Markdown parse error | Warning: "Couldn't parse {doc} - publishing as plain text" |
| Notion API rate limit | Retry with exponential backoff |
| Page has manual edits | Warning: "Page has been edited since last sync. --force to overwrite" |
| Very long document | Split into multiple Notion blocks (API limit: 100 blocks per request) |

---

## Example Session

```
> /notion-publish

Checking target page...
Found "Clarity Pledge Public" (page_id: 2ca4e141...)

Reading Git docs...
  ✓ docs/roadmap.md (260 lines)
  ✓ docs/theory-of-change.md (305 lines)
  ✓ docs/hypotheses.md (180 lines)

Publishing to Notion...
  Creating "Roadmap"... done
  Creating "How It Works"... done
  Creating "What We're Testing"... done

Adding sync metadata...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Published successfully!

Pages: 3 created, 0 updated
Public URL: https://notion.site/Clarity-Pledge-Public-2ca4e141

To make public: Notion → Share → Publish → Enable "Share to web"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Related Skills

- `/notion-groom` — Sync private Notion kanban with Git specs
- `/kdd` — Record decisions (may trigger re-publish)

---

## MCP Tools Used

- `mcp__MCP_DOCKER__API-get-page` — Check page exists
- `mcp__MCP_DOCKER__API-post-page` — Create new pages
- `mcp__MCP_DOCKER__API-patch-page` — Update page properties
- `mcp__MCP_DOCKER__API-get-block-children` — Read existing content
- `mcp__MCP_DOCKER__API-patch-block-children` — Add content blocks
- `mcp__MCP_DOCKER__API-delete-block` — Clear old content before update
- `mcp__MCP_DOCKER__API-post-database` — Create feature database
- `mcp__MCP_DOCKER__API-post-database-query` — Check existing entries
- `Read` — Read Git doc files
- `Glob` — Find feature specs
