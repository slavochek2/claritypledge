# Debugging Guide

## Prod-First Protocol

> **Rule:** For runtime/data/behavior issues, query live data in the first 60 seconds. Static analysis comes after.

**Decision:**
- Build/compile/type error → static analysis is correct
- Runtime/data/behavior issue → **query prod first**

| Issue type | First tool |
|------------|-----------|
| Works locally, broken on prod | **Step 0:** Verify `VITE_*` env vars in deployed bundle: `curl -s https://claritypledge.com/assets/index-*.js \| grep "expected_string"`. VITE vars are baked at build time — a missing or corrupted value silently disables features. |
| DB data wrong | Supabase MCP: `execute_sql` on prod (ref: `besjtuodziykmjidubzw`) |
| API misbehaving | `curl` the prod endpoint, read the actual response body |
| Error in prod | Sentry MCP: `search_issues` |
| UI wrong in prod | Chrome DevTools MCP: `navigate_page` + `take_screenshot` |

**Anti-pattern:** Reading 10 files to trace data flow → discovering the DB column doesn't exist. Spend 60s querying prod first, then read code once you know what the data shows.

---

## Screenshot-Driven Debugging Protocol

> **Principle:** Always verify current codebase state before acting on screenshots.

When the user shares a screenshot for UI debugging:

### 1. BEFORE making any changes:
- Check current codebase state with grep/read to verify what code is actually rendering
- Screenshots may be stale or show code that no longer exists

### 2. Confirm understanding:
- Describe what you think the bug is
- List which files you'd change
- Wait for confirmation

### 3. Make minimal changes:
- Fix ONE root cause at a time
- Don't "fix multiple things while I'm here" — that makes rollback hard

### Anti-patterns to avoid:
- Analyzing screenshot content that doesn't exist in current code
- Making too many changes at once
- Rebuilding components from scratch instead of checking git history for working versions

---

## Database & Supabase Debugging

When diagnosing save failures or database issues, check in this order:

### 1. RLS policies first
**Most common cause of silent failures**

```sql
-- Check if policy exists for the operation
SELECT * FROM pg_policies WHERE tablename = 'your_table';
```

### 2. Migration status
Is the schema actually applied?

```bash
# Check if migration exists but wasn't applied
ls supabase/migrations/
```

### 3. Column existence
Only check this after RLS + migrations ruled out

### Why this order matters

Two sessions spent significant time on wrong hypotheses (missing columns, imports) before discovering RLS policies or unapplied migrations were the actual root cause.

---

## Ghost Blog Code Injection

From memory.md — Ghost-specific debugging patterns:

- Code injection is at Ghost Admin → Settings → Advanced → Code Injection → Open
- Site Header injects into `{{ghost_head}}` (every page)
- **NEVER use `fill()` for large content in Ghost's CM6 editor** — it types char-by-char, times out on 8KB+, and corrupts the editor. Use Ghost Admin API instead.
- For small edits (< 500 chars), `fill()` after `Meta+a` select-all is OK
- **Preferred method for code injection changes:** Use Ghost Admin API (`PUT /ghost/api/admin/settings/`) to set `codeinjection_head` directly — bypasses CM6 entirely
- CSS `:empty` does NOT match elements with whitespace text nodes (Ghost templates have them)
- Use JS `DOMContentLoaded` + class toggle for conditional styling that depends on content presence

### UI Bug Fix Process (Ghost)

When fixing visual bugs in external systems like Ghost where deploy cycles are slow:

1. **Reproduce** — screenshot the bug
2. **Diagnose FULLY before any fix** — inspect ALL contributing elements. Don't stop at the first cause. Run queries to get heights, margins, padding, flex, min-height of every element in the affected area.
3. **Write fix**
4. **Verify logic in console BEFORE deploying** — test CSS selectors with `.matches()`, test JS with `eval`. Especially: `:empty` fails with whitespace text nodes. Always check `element.childNodes.length` vs `element.children.length`.
5. **Deploy**
6. **Verify** — screenshot

**Anti-pattern**: Finding one cause → shipping fix → seeing it didn't work → finding another cause → shipping again. This wastes round-trips especially in admin UIs.

**Rule**: One deployment, fully verified. Spend extra time diagnosing upfront to avoid multiple failed deploys.

---

## Test Mock — `.maybeSingle()` vs `.single()`

When mocking Supabase query chains in tests, the mock must match the exact method called in production code. A common mismatch:

- Production code uses `.maybeSingle()` (returns `null` if no row, no error)
- Test mock chains `.single()` (throws on no row)

These are different Supabase methods and the mock chain must match exactly. Symptom: test fails with unexpected errors or mock doesn't intercept the call. Fix: check the production service method, then mirror the exact chain in the mock.

**Example (from `points-service-real.ts`):** `getMyPosition` used `.maybeSingle()` but the test mock had `.single()`. The mock never matched, so the test used a fallback path.

---

## When to Propose Removal

If two separate debug sessions (different context windows, not the same session) have been spent on the same feature or component without resolution, surface the removal option explicitly:

> "We've debugged this twice without resolution. Worth considering removing it — want to discuss?"

Before proposing removal, ask: is this a **failed approach**, or a **failed implementation of a sound approach**? If the latter, fix the spec first, not just the code.

Sunk cost is not a reason to keep perpetually broken things. Reliability is binary for users — "works 70% of the time" is broken.

---

## Known Crash Patterns

### "Invalid hook call" / "Cannot read properties of null (reading 'useEffect')"

**Diagnostic tree (follow in order):**
1. **Duplicate React instances** — most common. Check: `find node_modules -path "*/react/package.json" -not -path "*/@*" | wc -l`. If >1, or if worktree `node_modules/react/` exists, Vite may resolve two copies. Fix: add the package to `resolve.dedupe` in `vite.config.ts`.
2. **Stale Vite dep cache** — the cache dir is worktree-scoped (`vite.config.ts` `getCacheDir()`): `node_modules/.vite-<slot>` inside a worktree (e.g. `.vite-w1`), `node_modules/.vite` only in the main repo. Deleting the wrong one is a silent no-op. Derive the right one instead of guessing: `SLOT=$(basename "$PWD" | grep -oE '^w[0-9]+$'); rm -rf "node_modules/.vite${SLOT:+-$SLOT}" && npm run dev`. **Never** `rm -rf node_modules/.vite*` — that deletes every other worktree's cache too and defeats the per-worktree isolation added specifically to stop concurrent dev servers from corrupting each other's pre-bundled deps (decisions.md 2026-03-13 "Vite cacheDir isolation per worktree").
3. **Mismatched react/react-dom versions** — `node -e "console.log(require('./node_modules/react/package.json').version, require('./node_modules/react-dom/package.json').version)"`. Must match.

**Do NOT start by:** reading the component source (the error is environmental, not a code bug), checking git log, or checking package.json diff.

### UI renders but data is structurally wrong (0 items, empty list) with no console error

Also frequently a **stale Vite dep cache** (see above), not a code bug — this is the silent variant: no crash, no error, just wrong/missing content. **Check the dev server's own stdout first**, before hypothesizing about fetch logic, race conditions, or state timing — a corrupted pre-bundled dep prints its own diagnosis on startup:

```
The file does not exist at ".../node_modules/.vite-w1/deps/chunk-XXXXXXXX.js?v=..." which is in the optimize deps directory.
```

If present, clear the worktree-scoped cache dir per pattern 2 above and restart — no app-code change needed.
