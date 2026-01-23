# MCP Servers Reference

All MCP servers are provided via **Docker MCP Toolkit**. Agents automatically have access to all enabled tools.

## Currently Enabled Servers (18)

### Browser & Automation

| Server | Tools Prefix | Purpose |
|--------|--------------|---------|
| **Playwright** | `mcp__MCP_DOCKER__browser_*` | Browser automation, screenshots, UI testing |
| **Next.js DevTools** | `mcp__MCP_DOCKER__nextjs_*` | Next.js runtime inspection, docs search |

### Data & Productivity

| Server | Tools Prefix | Purpose |
|--------|--------------|---------|
| **Notion** | `mcp__MCP_DOCKER__notion-*` | Create/search/update Notion pages and databases |
| **Gmail** | `mcp__MCP_DOCKER__gmail_*` | Email access (requires OAuth) |
| **Google Maps** | `mcp__MCP_DOCKER__maps_*` | Geocoding, directions, place search |

### Development & DevOps

| Server | Tools Prefix | Purpose |
|--------|--------------|---------|
| **n8n** | `mcp__MCP_DOCKER__*_node*`, `*_template*` | Workflow automation, node documentation |
| **Cloud Run** | `mcp__MCP_DOCKER__cloudrun_*` | Deploy apps to Google Cloud Run |
| **Sentry** | Via OAuth | Error tracking (requires auth) |
| **Context7** | `mcp__MCP_DOCKER__get-library-docs` | Up-to-date library documentation |

### Research & Content

| Server | Tools Prefix | Purpose |
|--------|--------------|---------|
| **Wikipedia** | `mcp__MCP_DOCKER__*_wikipedia*`, `get_article` | Search and fetch Wikipedia articles |
| **Hacker News** | `mcp__MCP_DOCKER__get_stories`, `search_stories` | HN posts and comments |
| **Reddit** | `mcp__MCP_DOCKER__fetchPosts`, `searchPosts` | Subreddit content |
| **YouTube Transcript** | `mcp__MCP_DOCKER__get_transcript` | Video transcripts |
| **arXiv** | `mcp__MCP_DOCKER__arxiv_*` | Academic paper search |

### Professional Networks

| Server | Tools Prefix | Purpose |
|--------|--------------|---------|
| **LinkedIn** | `mcp__MCP_DOCKER__get_person_profile`, `search_jobs` | Profiles, job search |
| **Apify** | `mcp__MCP_DOCKER__search-actors`, `call-actor` | Web scraping actors |

---

## How to Use

Agents automatically see all enabled MCP tools. Just use them directly:

```
# Example: Search Notion
Use mcp__MCP_DOCKER__notion-search with query "meeting notes"

# Example: Get library docs
Use mcp__MCP_DOCKER__get-library-docs with libraryId and topic
```

---

## Adding New MCP Servers

New servers are added via Docker Desktop MCP Toolkit:

1. Open **Docker Desktop** → **MCP Toolkit** (sidebar)
2. Go to **Catalog** tab
3. Click **+** on desired server
4. Configure secrets/OAuth if required
5. Restart Claude Code

**Catalog:** [hub.docker.com/mcp](https://hub.docker.com/mcp) (200+ servers available)

---

## Server Configuration

Some servers require configuration:

| Server | Requires |
|--------|----------|
| Gmail | OAuth login |
| Notion | API token (configured) |
| Google Maps | API key (configured) |
| LinkedIn | Credentials |
| Sentry | OAuth login |
| Apify | API token |
| Reddit | API credentials |

Check Docker Desktop → MCP Toolkit → server settings if tools fail.

---

## Project-Specific: Supabase MCP

Supabase MCP is configured **per-project** in `.mcp.json` (not Docker MCP):

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=..."
    }
  }
}
```

See [database.md](database.md) for Supabase usage.

---

## Requesting New Capabilities

If you need an MCP server that isn't enabled:

1. Check if it exists: [hub.docker.com/mcp](https://hub.docker.com/mcp)
2. Ask user to enable it via Docker Desktop MCP Toolkit
3. User restarts Claude Code after enabling

---

## Related Docs

- [browser-tools.md](browser-tools.md) - Browser automation details
- [docker-mcp-setup.md](../../features/done/docker-mcp-setup.md) - Initial setup guide
