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
# Pull schema from remote database
supabase db pull

# Generate TypeScript types
supabase gen types typescript --local > src/types/supabase.ts

# Dump database schema
supabase db dump --db-url="<connection-string>" --schema public
```

**Limitations:**
- Requires Docker for pg_dump operations
- Project-based workflow (not ideal for ad-hoc queries)
- No direct SQL execution (use `psql` for that)

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

### Supabase CLI Authentication

The Supabase CLI uses the connection string from `.mcp.json` for database operations:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://postgres.***:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
      ]
    }
  }
}
```

For CLI operations, you can pass `--db-url` directly or use project linking.

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
