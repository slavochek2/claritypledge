---
paths:
  - "supabase/**/*"
---

# Database Rules

## Migration Naming

Use 14-digit timestamps: `YYYYMMDDHHMMSS_description.sql`

Multiple files with the same 8-digit date (e.g., `20260206_a.sql`, `20260206_b.sql`) cause `db push` to fail permanently — always use sub-second timestamps for same-day migrations.

## After Creating a Migration

```bash
./scripts/migrate.sh
```

Extracts DB password from `.env.local` automatically. Run this — don't ask.

## Schema Decision Gate

- **Ask first:** Schema changes to core tables (profiles, points, clarity_sessions)
- **No asking needed:** Running `./scripts/migrate.sh` on an existing migration file

## Debugging Save Failures — Check in This Order

1. **RLS policies** (most common cause of silent failures)
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'your_table';
   ```
2. **Migration applied?** — check `supabase/migrations/` timestamps
3. **Column existence** — only after ruling out RLS + migrations

## RLS Key Patterns

- `profiles` — select: public | insert/update/delete: own row (`auth.uid() = id`)
- `witnesses` — any authenticated user can insert to any profile (by design — enables endorsements without requiring endorsee account)
- `stories`, `points`, `positions` — see [architecture.md](docs/technical/architecture.md#rls-policies)

## No Database Trigger for Profile Creation

Profile creation happens ONLY in `AuthCallbackPage.tsx` after email verification — not via trigger. Do not add triggers for this.
