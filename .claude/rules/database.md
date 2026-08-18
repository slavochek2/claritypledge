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
2. **Column actually exists on prod?** — migration history can lie (P417). Verify directly:
   ```bash
   curl "https://<ref>.supabase.co/rest/v1/<table>?select=<col>&limit=1" \
     -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>"
   # {"code":"42703",...} = column missing despite migration showing "applied"
   ```
3. **Migration applied?** — check `supabase/migrations/` timestamps; if column missing, re-run the SQL directly via Management API

## RLS Key Patterns

- `profiles` — select: public | insert/update/delete: own row (`auth.uid() = id`)
- `witnesses` — any authenticated user can insert to any profile (by design — enables endorsements without requiring endorsee account)
- `stories`, `points`, `positions` — see [architecture.md](docs/technical/architecture.md#rls-policies)

## No Database Trigger for Profile Creation

Profile creation happens ONLY in `AuthCallbackPage.tsx` after email verification — not via trigger. Do not add triggers for this.

## Content Migration Checklist

When writing SQL to insert/update stories, points, or related content:

- **Pre-flight:** Verify target `user_id` exists in `auth.users`, not just `profiles` — profiles alone don't enable login
- **Connection:** Never construct pooler URLs manually — read from `SUPABASE_DB_URL` in `.env.local` / `.env.prod`
- **Child rows:** Every INSERT into `stories` also needs: `story_versions`, `story_points`, `point_positions` for the author
- **Idempotency:** Use `INSERT ... ON CONFLICT DO UPDATE` so the same script runs on both test (empty) and prod (existing data)
- **Schema:** Read `docs/technical/database.md` + relevant migration files before writing INSERTs — see `.claude/rules/db-access.md` for full schema discovery rules.

## Migration DELETE with Row Overrides — Trigger Side-Effect Check

Before adding an explicit-row override to a migration `DELETE` (e.g. `OR email = 'specific@example.com'`), verify the target row has no trigger side-effects:

```sql
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = '<table>'
  AND event_manipulation = 'DELETE';
```

Run on **test DB first**. If triggers exist (e.g. `log_position_change()` logging to a history table), the explicit-row delete may cascade into FK violations on orphaned child rows. Safer: rely on the activity guard conditions instead of hardcoding row identifiers.

## Seed and Sync Scripts — Never Override User-Set State

Seeds and sync scripts must be idempotent **and** non-destructive to values the user has explicitly set. Before writing a value, check if it already exists.

- Use `ON CONFLICT DO NOTHING` (not `ON CONFLICT DO UPDATE`) unless the update is the explicit intent
- Use `UPDATE ... WHERE column IS NULL` to fill only unset values
- Never assume the DB is in a factory/default state

**Why:** A deploy that silently resets a value the user deliberately changed is a trust violation, not expected behavior. If a safety constraint requires rejecting a user-set value, reject it explicitly — never auto-revert silently.

## Commit Migrations from the Worktree, Not from Main

When working in a worktree, always commit migration files from the **worktree branch** — never from `main`.

`supabase/migrations/` is a native per-worktree checkout, so a migration written on the branch is not visible from main's `git status`. The trap is the reverse: the `migrate.sh` workaround (see worktree-setup.md) copies the migration into the main repo, where it sits untracked and looks committable. Committing it from `main` puts the migration on `main` before the feature is ready to ship.

The same rule applies to `supabase/deploy-manifest.json`.

```bash
# ✅ Correct — from inside the worktree branch
git add supabase/migrations/YYYYMMDDHHMMSS_description.sql
git commit -m "feat(pN): add migration for ..."

# ❌ Wrong — committing from main while the feature is on a worktree branch
# (a copy left behind by the migrate.sh workaround looks committable but belongs on the feature branch)
```
