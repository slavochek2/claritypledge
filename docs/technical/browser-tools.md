# Browser Tools Guide

This guide covers all browser automation and inspection tools available to Claude agents.

## MCP Servers Available

### Supabase MCP

Direct database access and management:
- Execute SQL queries against the database
- List tables and view schemas
- Inspect database functions and triggers
- View RLS policies
- Useful for debugging data issues and exploring schema

### Playwright MCP (`--isolated` mode)

For visual UI inspection during development:
- Navigate to pages and take screenshots
- Check mobile (375px) and desktop views
- Verify console for errors
- Use for `/loop` visual checks when UI is involved
- Runs in isolated mode: fresh browser profile each session, enables parallel agents

### Chrome DevTools MCP (`--isolated` mode)

For deep browser debugging:
- Network inspection (headers, timing, failures)
- Performance traces and profiling
- Memory leak investigation
- Runs in isolated mode: fresh browser profile each session, enables parallel agents

### Chrome Integration (beta, `claude --chrome`)

Browser automation via Chrome extension:
- Uses your actual logged-in browser sessions (Gmail, Google Docs, OAuth flows)
- Real-world testing with authenticated state
- Requires: Chrome + Claude extension (v1.0.36+) + visible browser window
- Enable with `claude --chrome` or `/chrome` command
- **This is the only way to test OAuth flows or access authenticated state**

---

## Browser Tools Decision Guide

**Choose the right tool based on what you need:**

| Need | Tool | Mode | Parallel-Safe |
|------|------|------|---------------|
| Quick screenshot / visual check | Playwright MCP | isolated, headless | Yes |
| Run test suite / CI | `npm run test:e2e` | headless | Yes |
| Debug network/perf/memory | Chrome DevTools MCP | isolated, headless | Yes |
| OAuth / logged-in sessions | Chrome Integration | headed, persistent | No |

---

## When to Use Each Tool

### Default choice: Playwright MCP

- Fast, headless, parallel-safe (isolated profile)
- Use for: screenshots, visual verification, UI testing
- Limitation: No access to logged-in state (fresh browser each session)

### Playwright E2E (`npm run test:e2e`)

- Use for: Actual tests with assertions, `/loop` validation
- Different from Playwright MCP - this runs the test suite, not ad-hoc browser actions

### Chrome DevTools MCP

- Use when: Need network requests, headers, timing, performance traces
- Same limitations as Playwright MCP (isolated profile)

### Chrome Integration (`claude --chrome`)

- Use when: Testing OAuth flows, Google login, or any authenticated state
- Requires user to start Claude with `--chrome` flag
- **Detection:** If Chrome Integration tools fail or aren't available, ask the user to restart with `claude --chrome`

---

## Isolation & Headless Mode

Both Playwright MCP and Chrome DevTools MCP run with `--isolated --headless`:

| Setting | What it means |
|---------|---------------|
| **Isolated** | Multiple Claude sessions can run in parallel without browser conflicts |
| **Headless** | No visible browser window (faster, doesn't interrupt workflow) |
| **Trade-off** | Each session starts with a fresh browser (no cookies, no login state) |

**If you need persistent state or visible browser:** Ask user to use Chrome Integration (`claude --chrome`)

---

## Common Scenarios

### "I need to take a screenshot of the landing page"
Use **Playwright MCP** - fast, isolated, no setup needed.

### "I need to verify the OAuth login flow works"
Use **Chrome Integration** (`claude --chrome`) - only tool with access to real browser sessions.

### "Tests are failing and I need to see network requests"
Use **Chrome DevTools MCP** - inspect headers, timing, response bodies.

### "I need to run the full E2E test suite"
Use `npm run test:e2e` - runs Playwright tests with assertions.

### "Multiple agents are working in parallel"
Use **Playwright MCP** or **Chrome DevTools MCP** in `--isolated` mode - both are parallel-safe.
