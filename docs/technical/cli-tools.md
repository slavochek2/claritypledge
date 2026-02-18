# CLI Tools Guide

Command-line tools installed alongside MCPs for scripting, CI/CD, and automation tasks.

---

## Available CLIs

### Supabase CLI (v2.75.0)

**Installed:** `brew install supabase/tap/supabase`

**Use for:**
- Schema migrations (`supabase db pull`, `supabase db push`)
- TypeScript type generation (`supabase gen types`)
- Local development (`supabase start`)
- Database dumps (`supabase db dump`)

**Connection:** Uses connection string from `.env.local` or `.mcp.json`

**Common commands:**
```bash
# Apply pending migrations (agent-autonomous — no project linking needed)
DB_URL=$(python3 -c "import json; print(json.load(open('.mcp.json'))['mcpServers']['supabase']['args'][2])")
supabase migration up --db-url "$DB_URL"

# Check migration status
supabase migration list --db-url "$DB_URL"

# Generate TypeScript types
supabase gen types typescript --db-url "$DB_URL" > src/types/supabase.ts

# Dump database schema
supabase db dump --db-url "$DB_URL" --schema public
```

**Agent migration workflow (autonomous — use this):**
```bash
# 1. Get DB URL (always available in .mcp.json)
DB_URL=$(python3 -c "import json; print(json.load(open('.mcp.json'))['mcpServers']['supabase']['args'][2])")

# 2. Apply migrations
supabase migration up --db-url "$DB_URL"

# 3. Verify with the dogfooding test
npm run test:e2e -- e2e/integration/
```

**Known state:**
- Supabase CLI access token expired — `supabase projects list` returns 401. Use `--db-url` workaround above instead.
- Project not linked (no `.supabase/config.json`). `--db-url` bypasses this requirement.
- To restore full CLI auth: go to https://app.supabase.com/account/tokens → create Personal API Token → add to `.env.local` as `SUPABASE_ACCESS_TOKEN` → run `supabase link --project-ref gfjctyxqlwexxwsmkakq`
- Free tier: project auto-pauses after inactivity. If `supabase migration up` returns "Tenant or user not found" → unpause in Supabase Dashboard first.

**Limitations:**
- Requires Docker for `pg_dump` operations
- No direct SQL execution via CLI (use Supabase MCP for read queries, or `psql` for DDL when needed)

---

### Sentry CLI (v3.2.0)

**Installed:** `brew install getsentry/tools/sentry-cli`

**Configuration:** `.env.local` contains:
```bash
SENTRY_AUTH_TOKEN=sntryu_***
SENTRY_ORG=22minds-llc
SENTRY_PROJECT=javascript-react
```

**Use for:**
- Release management (`sentry-cli releases new`)
- Sourcemap uploads (`sentry-cli sourcemaps upload`)
- Issue querying (`sentry-cli issues list`)
- Deploy tracking (`sentry-cli deploys new`)

**Common commands:**
```bash
# List recent issues
sentry-cli issues list --org 22minds-llc

# Create a new release
sentry-cli releases new <version>

# Upload sourcemaps
sentry-cli sourcemaps upload --release <version> ./dist
```

**Integration:** Already integrated in `vite.config.ts` via `@sentry/vite-plugin` for automatic sourcemap uploads.

---

## CLI vs MCP: When to Use Each

**Current strategy: Hybrid** — Keep both CLIs and MCPs, use them for different purposes.

| Task | Use | Why |
|------|-----|-----|
| **Database Queries (Exploratory)** | Supabase MCP | Conversational, structured tools |
| **Migrations & Schema Management** | Supabase CLI | Project workflow, version control |
| **Type Generation** | Supabase CLI | Build step, automation |
| **Debug Sentry Issues (Ad-hoc)** | Sentry MCP | Conversational, no need to remember issue IDs |
| **Release Management** | Sentry CLI | CI/CD, scripting |
| **Sourcemap Uploads** | Sentry CLI (via Vite) | Build automation |

---

## Setup Notes

### Supabase MCP Authentication

The Supabase MCP uses the official HTTP transport (OAuth-based). Config in `.mcp.json`:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=gfjctyxqlwexxwsmkakq"
    }
  }
}
```

After adding/changing this config, authenticate by running `claude /mcp` in a regular terminal (not inside Claude Code), selecting "supabase" → "Authenticate".

**Note:** The old `@modelcontextprotocol/server-postgres` approach with a direct connection string was replaced because the pooler auth broke ("Tenant or user not found"). The official MCP is more stable.

### Supabase CLI Authentication

The CLI requires a separate access token (not related to the MCP). Run `supabase login` in a terminal — it opens a browser OAuth flow. For CLI operations you can also pass `--db-url` directly or use project linking.

### Sentry CLI Authentication

Authentication is configured via environment variables in `.env.local`:

```bash
SENTRY_AUTH_TOKEN=sntryu_***  # From https://sentry.io/settings/account/api/auth-tokens/
SENTRY_ORG=22minds-llc
SENTRY_PROJECT=javascript-react
```

These are automatically loaded by `sentry-cli` when run from the project directory.

---

## Security Notes

- **`.env.local`** is gitignored — contains `SENTRY_AUTH_TOKEN`
- **`.mcp.json`** is gitignored — contains database credentials
- Never commit these files
- Never use `git add .` or `git add -A` (can accidentally stage secrets)

---

## Troubleshooting

**Supabase CLI says "command not found":**
```bash
which supabase  # Should show /opt/homebrew/bin/supabase
brew install supabase/tap/supabase  # If not installed
```

**Sentry CLI says "Unauthorized":**
```bash
sentry-cli info  # Check auth status
# Add SENTRY_AUTH_TOKEN to .env.local if missing
```

**Docker not running (Supabase CLI):**
```bash
# Supabase CLI pulls Docker images for pg_dump
# Make sure Docker Desktop is running
```

---

## Related Docs

- [mcp-backup-recovery.md](mcp-backup-recovery.md) — MCP configuration safety
- [database.md](database.md) — Database access patterns
- [analytics.md](analytics.md) — Sentry error tracking setup
