# src/app/data — data access

**Owns:** every read and write to Supabase from the app. Components and hooks call a
service here; they never call `supabase.from(...)` themselves.

**Shape (see docs/technical/architecture.md, Service Layer Pattern):**
- `{domain}-service.interface.ts` types, `-real.ts` Supabase, `-mock.ts` tests,
  `{domain}-service.ts` the switch callers import.
- `api.ts` is the legacy catch-all. Do not add to it; it is over the size limit.
- DB errors go through `logDbError` / `throwDbError` (`db-error-logger.ts`), never a bare
  `throw` after logging (ESLint P990 rule).

**When a file hits the size limit** (the quality ratchet blocks the commit and prints the
limit; see any file's numbers with `node scripts/quality-ratchet.cjs --measure <file>`):
- An over-limit file may not grow. New code goes in a new module; the old file only gets
  the import and the call.
- Split by **domain or query**, not by line count: an unread-count query leaving
  `letters-service.ts` becomes e.g. `letters-unread-count.ts`, never `letters-service-2.ts`.
  One module answers one question.
- Keep the public name stable: export from the new module, and import it where it is
  used. A re-export from the old file is fine while callers migrate.
- A long function with several queries splits into one helper per query, each returning
  its value (or a sentinel such as `'anon'` for "stop now") so the caller stays a short
  sequence of named steps.

**Testing:** unit tests live in `src/tests/` and mock `@/lib/supabase`; find the existing
ones with `grep -rl '<functionName>' src/tests`. Run `npx vitest run <file>`.
