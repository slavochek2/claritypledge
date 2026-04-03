# DB Migration Safety Criteria

> Inlined into subagent prompts by `/finish`. Not a standalone skill.

You are reviewing changes to `supabase/migrations/**`. These are SQL migrations that modify the production database. The core question: **is this migration safe, idempotent, and consistent with the schema?**

## Schema Safety

- Destructive changes have explicit guards (`DROP TABLE IF EXISTS`, `DROP COLUMN IF EXISTS`)
- New columns have sensible defaults or are `NULL`able
- `ALTER COLUMN TYPE` follows correct order: drop constraints/policies/defaults first, alter type, re-add
- No data-loss operations without explicit backup step or confirmation
- Foreign key constraints specify `ON DELETE` behavior

## Idempotency

- All statements are idempotent: `CREATE OR REPLACE`, `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`
- Migration can be re-run without error (Supabase CLI requirement)
- One migration file per timestamp — no duplicate dates

## RLS (Row Level Security)

- New tables have RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- Policies follow least-privilege — no `USING(true)` on sensitive tables for anon role
- Tables with FK to `stories` must have story-visibility-scoped SELECT policies
- Any table with user data has owner-scoped policies

## Naming

- Table/column names are lowercase `snake_case`
- No SQL reserved keywords as identifiers
- Function names match existing conventions

## Cross-References

- New columns match TypeScript types in `src/app/types/supabase.ts` (or types need updating)
- `docs/technical/database.md` updated if schema changed
- If migration adds a column used by RLS, verify the policy references it correctly

## Output Format

```markdown
### Findings
| # | Finding | File:Line | Severity | Description |
|---|---------|-----------|----------|-------------|

Severity: HIGH (data loss risk/RLS gap) | MEDIUM (non-idempotent/naming) | LOW (style/docs)
```
