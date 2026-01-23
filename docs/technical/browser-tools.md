# Browser Tools Guide

This guide covers all browser automation and inspection tools available to Claude agents.

## MCP Servers Available

### Docker MCP Browser Tools (Primary)

Browser automation via Docker MCP Toolkit (`mcp__MCP_DOCKER__browser_*`):
- Navigate to pages and take screenshots
- Check mobile (375px) and desktop views
- Verify console for errors
- Use for `/loop` visual checks when UI is involved
- Managed by Docker Desktop — no manual config needed

**Key tool:** `mcp__MCP_DOCKER__browser_eval` with action parameter:
- `action: 'start'` — Start browser session
- `action: 'navigate'` — Navigate to URL
- `action: 'screenshot'` — Visual screenshot
- `action: 'click'`, `'type'`, `'fill_form'` — Interactions
- `action: 'evaluate'` — Run JavaScript in browser
- `action: 'console_messages'` — Console capture
- `action: 'close'` — Close browser session

### Chrome DevTools MCP (`mcp__chrome-devtools__*`)

For deep browser debugging:
- Network inspection (headers, timing, failures)
- Performance traces and profiling
- Memory leak investigation

### Supabase MCP

Direct database access and management:
- Execute SQL queries against the database
- List tables and view schemas
- Inspect database functions and triggers
- View RLS policies
- Useful for debugging data issues and exploring schema

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

| Need | Tool | Parallel-Safe |
|------|------|---------------|
| Quick screenshot / visual check | Docker MCP Browser | Yes |
| Run test suite / CI | `npm run test:e2e` | Yes |
| Debug network/perf/memory | Chrome DevTools MCP | Yes |
| OAuth / logged-in sessions | Chrome Integration | No |

---

## When to Use Each Tool

### Default choice: Docker MCP Browser Tools

- Fast, managed by Docker Desktop
- Use for: screenshots, visual verification, UI testing
- Tools: `mcp__MCP_DOCKER__browser_*`

### Playwright E2E (`npm run test:e2e`)

- Use for: Actual tests with assertions, `/loop` validation
- Different from Docker MCP - this runs the test suite, not ad-hoc browser actions

### Chrome DevTools MCP

- Use when: Need network requests, headers, timing, performance traces
- Tools: `mcp__chrome-devtools__*`

### Chrome Integration (`claude --chrome`)

- Use when: Testing OAuth flows, Google login, or any authenticated state
- Requires user to start Claude with `--chrome` flag
- **Detection:** If Chrome Integration tools fail or aren't available, ask the user to restart with `claude --chrome`

---

## Common Scenarios

### "I need to take a screenshot of the landing page"
Use **Docker MCP Browser** - fast, no setup needed.
```
mcp__MCP_DOCKER__browser_eval({ action: 'start' })
mcp__MCP_DOCKER__browser_eval({ action: 'navigate', url: 'http://localhost:5001' })
mcp__MCP_DOCKER__browser_eval({ action: 'screenshot' })
```

### "I need to verify the OAuth login flow works"
Use **Chrome Integration** (`claude --chrome`) - only tool with access to real browser sessions.

### "Tests are failing and I need to see network requests"
Use **Chrome DevTools MCP** - inspect headers, timing, response bodies.

### "I need to run the full E2E test suite"
Use `npm run test:e2e` - runs Playwright tests with assertions.

### "Multiple agents are working in parallel"
Use **Docker MCP Browser** or **Chrome DevTools MCP** - both are parallel-safe.
