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

**Connection:** DB password extracted from `SUPABASE_DB_URL` in `.env.local` by `scripts/migrate.sh`.

**Migration workflow (use this):**
```bash
# Push new migrations to test DB — run after creating any .sql file in supabase/migrations/
./scripts/migrate.sh

# Push same migrations to prod DB (after validating on test)
./scripts/migrate.sh --env prod

# Check status only
npx supabase migration list -p "$DB_PASSWORD"

# Generate TypeScript types (requires project link or --db-url)
npx supabase gen types typescript --project-id gfjctyxqlwexxwsmkakq > src/app/types/supabase.ts
```

**`scripts/migrate.sh` does:**
1. Extracts DB password and project ref from env file (`.env.local` by default, `.env.prod` with `--env prod`)
2. Resolves Supabase PAT: macOS keychain first, then `SUPABASE_ACCESS_TOKEN` in the env file (agent-friendly fallback)
3. Runs `supabase migration list` (shows current state — non-fatal if pooler fails)
4. Runs `supabase db push` (primary path)
5. **Management API fallback**: if `db push` fails (pooler auth, history mismatch), falls back to `POST /v1/projects/{ref}/database/query` per migration file, skipping already-applied versions. Also records each applied version into `supabase_migrations.schema_migrations` so future CLI runs stay in sync.

**Test → Prod promotion:**
```bash
# 1. Create and validate migration on test (default)
./scripts/migrate.sh

# 2. Run regression/E2E tests against test DB

# 3. Promote to prod
./scripts/migrate.sh --env prod
```
`.env.prod` must exist (see prod section in `.env.example`). It needs `VITE_SUPABASE_URL`, `SUPABASE_DB_URL`, and `SUPABASE_ACCESS_TOKEN` for the prod project.

**Migration file naming rule — CRITICAL:**
Supabase CLI tracks one history entry per 8-digit date (`YYYYMMDD`). Multiple files sharing the same date permanently block `db push`. **One migration file per day.** If you need multiple same-day migrations, use `YYYYMMDDHHMMSS` timestamps (14 digits) to ensure uniqueness.

**Known state:**
- Project linked via `supabase link --project-ref gfjctyxqlwexxwsmkakq`
- DB password in `SUPABASE_DB_URL` in `.env.local` (see prod section in `.env.example` for format)
- `supabase --db-url` / `migration up` commands do NOT work — pooler returns "Tenant or user not found" for direct pg connections from localhost (known Supabase constraint)
- Free tier: project auto-pauses after inactivity → unpause in Dashboard before running migrate.sh
- `SUPABASE_ACCESS_TOKEN` in `.env.local` is the agent-friendly PAT — add yours from the Supabase Dashboard if agents need to apply migrations autonomously

**Session pooler URL — always copy from the Connect dialog:**
When setting up a new CI job or script that needs a direct Postgres connection (e.g., `pg_dump`, backup workflows), copy the session pooler URL from: Supabase Dashboard → project → **Connect** button → Method: "Session pooler". Do NOT construct it manually.

Reason: the pooler hostname encodes the AWS region (`aws-1-ap-southeast-1`, `aws-0-us-east-1`, etc.) and this varies per project. Using the wrong region returns "Tenant not found." For the prod project (`besjtuodziykmjidubzw`) the correct URL is:
```
postgresql://postgres.besjtuodziykmjidubzw:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

**Limitations:**
- Requires Docker for `db dump` / `db diff` operations
- No direct SQL via `psql` (not installed; pooler rejects direct pg connections)

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
| **Analytics Queries (Events, Funnels)** | Mixpanel MCP | Natural language queries, dashboard management |
| **Analytics Alerts** | Mixpanel UI | Alerts are UI-only — no API or MCP support |

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

### Mixpanel MCP Authentication

Mixpanel MCP uses the official hosted server with OAuth. EU endpoint (matches our project region). Config in `.mcp.json`:

```json
{
  "mixpanel": {
    "command": "npx",
    "args": ["-y", "mcp-remote", "https://mcp-eu.mixpanel.com/mcp"]
  }
}
```

On first connection, complete the Mixpanel OAuth flow. Org MCP must be enabled in Mixpanel Settings → Org → Overview (already done).

**Capabilities:** Query events, funnels, retention, flows. Create/manage dashboards. Data discovery (events, properties). 600 req/hr limit.

**Limitations:** Cannot create or manage alerts (UI-only). No CLI equivalent — all Mixpanel interaction is MCP or Chrome.

**Prefer MCP over Chrome:** Skills like `/analytics`, `/weekly` previously used Chrome-based Mixpanel login. When MCP is available, use it instead — faster, no browser session needed.

### Sentry CLI Authentication

Authentication is configured via environment variables in `.env.local`:

```bash
SENTRY_AUTH_TOKEN=sntryu_***  # From https://sentry.io/settings/account/api/auth-tokens/
SENTRY_ORG=22minds-llc
SENTRY_PROJECT=javascript-react
```

`sentry-cli` reads these from the **process environment** — it does NOT auto-source `.env.local`. Export them first, or `sentry-cli info` returns "Unauthorized":

```bash
set -a; source <(grep -E '^SENTRY_' .env.local); set +a
sentry-cli info   # now authenticated
```

(Alternatively, on a `cf` session the Sentry MCP — `mcp__sentry__*` — is loaded and needs no manual sourcing.)

---

## Retiring a Tool

Do all three in the same session — a half-retired tool leaves the directory tracked, on disk, or
both, and the next session cannot tell whether it is still in use:

1. `git rm -r --cached --ignore-unmatch <tool-dir>` — untrack without deleting from disk
2. `rm -rf <tool-dir>`
3. Add it to `.gitignore`

Never reverse steps 1 and 3: `.gitignore` covering a still-tracked path makes `git add -A` skip the
deletion silently (see [.claude/rules/git.md](../../.claude/rules/git.md)).

*(Moved out of CLAUDE.md 2026-08-14 under the ≤350-line budget — P1081.)*

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
