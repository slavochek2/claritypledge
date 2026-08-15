# MCP Servers Reference

All MCP servers are provided via **Docker MCP Toolkit**. Agents automatically have access to all enabled tools.

## Currently Enabled Servers (18)

### Browser & Automation

| Server | Tools Prefix | Purpose |
|--------|--------------|---------|
| **Playwright** | `mcp__playwright__browser_*` | Browser automation, screenshots, UI testing |
| **Chrome DevTools** | `mcp__chrome-devtools__*` | Headless debugging, performance profiling, network inspection |
| **Claude in Chrome** | `mcp__claude-in-chrome__*` | Visual QA, authenticated sessions (`claude --chrome`) |

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

## Global MCP Servers (in `~/.claude.json`)

These are configured globally for all projects, not via Docker MCP Toolkit.

### Google Workspace (work account)

Full Google Workspace access (Gmail, Drive, Docs, Calendar, Sheets, etc.).

- **Config key:** `slava-inguro-workspace`
- **Package:** `workspace-mcp` (via `uvx`)
- **Auth:** OAuth (credentials stored in `~/.google_workspace_mcp/`)
- **Account:** see `.private/docs/accounts.md`

### Gmail usage note

When searching with `search_gmail_messages` (or any Gmail tool that paginates), always fetch all pages before drawing conclusions. If the response includes a `next_page_token`, paginate first — never declare "no email found" / "approved" / "denied" while a page token remains. The matching message is often in the unfetched batch.

### Personal Gmail

Personal Gmail access via IMAP.

- **Config key:** `slavochek-gmail`
- **Package:** `gmail-mcp-imap` (via `npx`)
- **Auth:** App Password (stored in `~/.claude.json` env vars — never commit)
- **Why IMAP not OAuth:** Avoids Google Cloud project setup, zero conflict risk with workspace-mcp
- **Account:** see `.private/docs/accounts.md`

> **If App Password expires or needs rotation:** Google Account → Security → App Passwords → regenerate, then update `GMAIL_APP_PASSWORD` in `~/.claude.json`.

### Claritypledge emails — ops@ and slava@ (SMTP/IMAP scripts)

Two mailboxes on All-Inkl hosting, accessed via raw TLS scripts (no MCP — scripts only).

| Address | Purpose | Env var (user) | Env var (pass) |
|---------|---------|----------------|----------------|
| `ops@claritypledge.com` | Service account signups, transactional | `OPS_EMAIL` | `OPS_EMAIL_PASSWORD` |
| `slava@claritypledge.com` | Sending emails on Slava's behalf | `SLAVA_EMAIL` | `SLAVA_EMAIL_PASSWORD` |

- **Server:** `w00dd4f1.kasserver.com`
- **IMAP:** port 993 (TLS)
- **SMTP:** port 465 (SMTPS) — use this; port 587 is filtered on local network
- **Credentials:** `.env.local` (gitignored — never commit)
- **Read ops inbox:** `node scripts/read-ops-email.mjs` (direct IMAP, no packages)
- **Send from slava@:** use the same raw TLS pattern — see `scripts/read-ops-email.mjs` for IMAP template, SMTP mirrors it on port 465

> **To reset a password:** Log in via All-Inkl Members Area → Technische Verwaltung → KAS Login → E-Mail-Postfach → edit the mailbox. Use browser automation (Claude in Chrome) — direct JS injection works on KAS pages once logged in via the members area session link.

---

## Project-Specific MCP Servers

These servers are configured **per-project** in `.mcp.json` (not Docker MCP):

### Supabase MCP

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

### Mixpanel MCP

Analytics server for querying Mixpanel data:

```json
{
  "mcpServers": {
    "mixpanel": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://mcp-eu.mixpanel.com/mcp"]
    }
  }
}
```

| Tool | Purpose |
|------|---------|
| `mcp__mixpanel__get_events` | List tracked events |
| `mcp__mixpanel__run_segmentation_query` | Query event data |
| `mcp__mixpanel__run_funnels_query` | Funnel analysis |
| `mcp__mixpanel__run_retention_query` | Retention analysis |

See [analytics.md](analytics.md) for tracked events catalog.

### Sentry MCP

Error monitoring server:

```json
{
  "mcpServers": {
    "sentry": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://mcp.sentry.dev/mcp"]
    }
  }
}
```

| Tool | Purpose |
|------|---------|
| `mcp__sentry__search_issues` | Search for errors |
| `mcp__sentry__get_issue_details` | Get error details |
| `mcp__sentry__analyze_issue_with_seer` | AI-powered analysis |

---

## Requesting New Capabilities

If you need an MCP server that isn't enabled:

1. Check if it exists: [hub.docker.com/mcp](https://hub.docker.com/mcp)
2. Ask user to enable it via Docker Desktop MCP Toolkit
3. User restarts Claude Code after enabling

---

## Related Docs

- [browser-tools.md](browser-tools.md) - Browser automation details
- [docker-mcp-setup.md](../../features/done/4_27_jan26/docker-mcp-setup.md) - Initial setup guide
