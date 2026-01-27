# Docker MCP Toolkit Setup for Claude Code

Instructions for setting up Docker MCP Toolkit to manage MCP servers instead of manual configuration.

## Why Use Docker MCP?

- **One-click deployment** — No manual JSON editing or dependency management
- **200+ pre-built servers** — Curated, security-vetted MCP servers
- **Cross-client support** — Works with Claude Code, Claude Desktop, Cursor
- **Security defaults** — Containers limited to 1 CPU, 2GB RAM, no filesystem access by default

## Prerequisites

- Docker Desktop **v4.48+**
- Claude Code CLI installed

## Setup Steps

### 1. Enable MCP Toolkit in Docker Desktop

1. Open **Docker Desktop**
2. Go to **Settings** → **Beta features**
3. Enable **"Docker MCP Toolkit"**

### 2. Install MCP Toolkit Extension

1. In Docker Desktop, go to **Extensions**
2. Search for **"MCP Toolkit"**
3. Click **Install**
4. It will appear in your Docker Desktop sidebar

### 3. Add MCP Servers from Catalog

1. In Docker Desktop, select **MCP Toolkit** from sidebar
2. Go to the **Catalog** tab
3. Browse [hub.docker.com/mcp](https://hub.docker.com/mcp) or search within Docker Desktop
4. Click the **+** icon to add servers you need

**Popular servers:**
- `mcp/github` — GitHub integration
- `mcp/filesystem` — File system access
- `mcp/postgres` — PostgreSQL database
- `mcp/playwright` — Browser automation

### 4. Connect Claude Code as Client

1. In MCP Toolkit, go to the **Clients** tab
2. Find **"Claude Code"** (or "Claude Desktop")
3. Click **Connect**
4. Restart Claude Code if it's running

### 5. Verify Connection

Run in terminal:
```bash
claude mcp list
```

You should see `MCP_DOCKER` with "connected" status.

Test with a prompt:
> "Use the GitHub MCP server to show me my open pull requests"

## Remove Manual MCP Configs

After Docker MCP is working, remove your manual configs to avoid duplicates:

**Claude Code global config:**
```bash
# Check current config
cat ~/.claude/settings.json

# Edit and remove mcpServers section if present
```

**Project-level config:**
```bash
# Check for .mcp.json in your project root
ls -la .mcp.json
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `claude mcp list` shows nothing | Restart Docker Desktop, then restart Claude Code |
| Servers not appearing | Check Docker Desktop → MCP Toolkit → Catalog tab |
| Connection failed | Ensure Docker Desktop v4.48+ and MCP Toolkit enabled in Beta features |

## Sources

- [Add MCP Servers to Claude Code with MCP Toolkit](https://www.docker.com/blog/add-mcp-servers-to-claude-code-with-mcp-toolkit/)
- [Get started with Docker MCP Toolkit](https://docs.docker.com/ai/mcp-catalog-and-toolkit/get-started/)
- [Docker MCP Catalog](https://hub.docker.com/mcp)
- [MCP Toolkit Docs](https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/)
