---
paths:
  - "supabase/**/*"
---

# Database Rules

## Migration Naming

`YYYYMMDDHHMMSS_description.sql`, with the version **generated from the current time in UTC, to the second** (`date -u +%Y%m%d%H%M%S`), never typed by hand. Sessions run in different time zones, so local time can number a later file lower. Hand-typed round times (`…120000`, `…190000`) are what collide across concurrent sessions: most existing migration files end in `0000`, and [decisions.md](../../docs/decisions.md) 2026-08-24 "Two migration-collision guards" records five collisions. A same-second collision stays possible and the duplicate-version checks in `migrate.sh` and pre-commit still catch it. A "highest version + 1" helper is not the fix: two sessions read the same highest value (decisions.md 2026-09-09 "A P-number is owned from the moment of the CLAIM", P1279, is that race for P-numbers).

Multiple files sharing an 8-digit date only (`20260206_a.sql`, `20260206_b.sql`) make `db push` fail permanently: the full 14 digits are required.

## After Creating a Migration

```bash
./scripts/migrate.sh
```

Extracts DB password from `.env.local` automatically. Run this — don't ask.

**Before `migrate.sh` applies a migration that creates or replaces a function to shared TEST, run it inside a rolled-back transaction that also calls each of those functions:** `BEGIN; <migration>; <calls>; ROLLBACK;`, then `migrate.sh`, then the integration canary that calls the function, which is still the last check before the work is reported done. A plpgsql body compiles clean and can still fail on every call (a bad setting name, a missing column), and applying it to shared TEST then breaks that path for everyone until the next migration. Three traps:
- **The migration's own `BEGIN;`/`COMMIT;` must be removed first** (about 1 in 6 function migrations has them): an inner `COMMIT;` applies the migration for real and turns the closing `ROLLBACK` into a no-op. Afterwards, check the function's body on TEST is still the old one.
- **Call as the real caller, not as `postgres`:** after the migration and before the calls, `SET LOCAL ROLE authenticated;` plus `SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);` (or `anon`). The owner bypasses grants and RLS, and `auth.uid()` is NULL for it, so a call as `postgres` can pass while every real caller fails.
- **Statements that cannot run in a transaction** (`CREATE INDEX CONCURRENTLY`, some `CREATE EXTENSION`): dry-run only the function part.

Sources: [decisions.md](../../docs/decisions.md) 2026-09-08 "Applying a migration is not exercising what it creates" and 2026-09-09 "verify it in a rolled-back transaction — and control-probe the rollback in both directions first" (P1236); founder 2026-11-14, after P1631's invalid setting name broke every erasure on TEST.

## No New Public Media Buckets in Supabase Storage (P1385)

A migration that creates a storage bucket for public media (video, posters, curated images) is the wrong host: prod CSP `media-src` allows only `storage.googleapis.com`, and the dev server sends no CSP, so it passes locally and is blocked on the live site. Upload to `gs://claritypledge-story-images` and build URLs with `publicMediaUrl()` (`src/lib/public-media.ts`).

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
