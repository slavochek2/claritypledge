# Debugging Guide

## Prod-First Protocol

> **Rule:** For runtime/data/behavior issues, query live data in the first 60 seconds. Static analysis comes after.

**Decision:**
- Build/compile/type error → static analysis is correct
- Runtime/data/behavior issue → **query prod first**

| Issue type | First tool |
|------------|-----------|
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

## When to Propose Removal

If two separate debug sessions (different context windows, not the same session) have been spent on the same feature or component without resolution, surface the removal option explicitly:

> "We've debugged this twice without resolution. Worth considering removing it — want to discuss?"

Before proposing removal, ask: is this a **failed approach**, or a **failed implementation of a sound approach**? If the latter, fix the spec first, not just the code.

Sunk cost is not a reason to keep perpetually broken things. Reliability is binary for users — "works 70% of the time" is broken.
