---
paths:
  - "src/**"
  - "e2e/**"
  - "scripts/**"
  - "supabase/**"
  - ".claude/commands/**"
  - "features/**"
---

# DB Access — Local First, Zero Unnecessary Queries

## Schema Discovery = Always Local

Never query a live database to answer "what columns does table X have?" The schema is fully represented locally:

1. `docs/technical/database.md` — human-readable table/column reference (read this first)
2. `supabase/migrations/*.sql` — authoritative DDL, full history
3. `src/app/types/supabase.ts` — TypeScript types (may lag behind migrations)

If local schema doesn't match prod, that's a migration bug — not a reason to query.

## Tool Hierarchy (follow in order)

| Need | Tool | Approval? |
|------|------|-----------|
| Schema/columns | `Read` local files (see above) | No |
| Table list | `mcp__supabase__list_tables` | No |
| Migration status | `mcp__supabase__list_migrations` | No |
| Live row counts/data | `curl` GET against REST API (state env explicitly) | No |
| Data mutations | `curl` POST/PATCH against REST API (state env explicitly) | Yes — always ask user |
| Ad-hoc SQL | `mcp__supabase__execute_sql` | Yes — **schema discovery: never; debugging/RLS: when curl can't** |

**Key rule:** Everything read-only should require zero approval prompts. If you're about to use a tool that needs user approval just to *look* at something, you're using the wrong tool.

## Supabase MCP = Test DB Only

The Supabase MCP in `.mcp.json` points at `gfjctyxqlwexxwsmkakq` (**test** project). Every `mcp__supabase__*` call hits test, not prod.

- **Prod project ref:** `besjtuodziykmjidubzw`
- **Prod reads:** `curl` the REST API with the prod anon key from `.env.prod`
- **Never assume MCP = prod.** If user says "check prod," use curl with prod credentials.

## State Environment Before Any Live Call

Before any query that hits a live database, state which environment:
- "Querying **test** DB for..." or "Querying **prod** DB for..."
- If user didn't specify which env, **ask** — don't default.

## Don't Query What You Can Read

Common wasteful patterns to avoid:
- Querying `information_schema.columns` → Read `docs/technical/database.md` instead
- Running `SELECT * FROM table LIMIT 1` to check structure → Read migration files
- Using `execute_sql` to count rows when `curl` GET with `?select=count` works
- Querying test DB then prod DB → decide which one first, query once
