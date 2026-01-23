# Browser Tools Guide

This guide covers browser automation tools available to Claude agents.

## Browser Tools (via Docker MCP)

All browser tools are provided by **Docker MCP Toolkit** - no manual configuration needed.

### Playwright MCP (Default)

Tools: `mcp__MCP_DOCKER__browser_*`

- Navigate to pages, take screenshots, interact with elements
- Runs **headless by default** (containerized)
- **Inherently isolated** (each container is fresh)
- Parallel-safe for multiple agents

**Common tools:**
- `browser_navigate` - Go to URL
- `browser_snapshot` - Get accessibility tree (better than screenshot for actions)
- `browser_take_screenshot` - Visual capture
- `browser_click`, `browser_type`, `browser_fill_form` - Interactions
- `browser_console_messages` - Check for errors

### Chrome DevTools MCP

Tools: `mcp__chrome-devtools__*`

For deep browser debugging:
- Network inspection (headers, timing, failures)
- Performance traces and profiling
- Console messages with full context

**Note:** Currently disabled to test Docker MCP. Re-enable in `~/.claude/settings.json` if needed.

### Chrome Integration (`claude --chrome`)

For authenticated sessions:
- Uses your actual logged-in browser (Gmail, OAuth flows)
- Requires: Chrome + Claude extension + `claude --chrome`
- **Only way to test OAuth flows or access authenticated state**

---

## Decision Guide

| Need | Tool | Notes |
|------|------|-------|
| Quick screenshot / visual check | Docker MCP Playwright | Default choice |
| Interact with page elements | Docker MCP Playwright | Use `browser_snapshot` first |
| Run E2E test suite | `npm run test:e2e` | Playwright tests with assertions |
| Debug network/perf issues | Chrome DevTools MCP | If enabled |
| OAuth / logged-in sessions | Chrome Integration | Requires `claude --chrome` |

---

## Common Scenarios

### "Take a screenshot of the landing page"
```
1. browser_navigate to http://localhost:5001
2. browser_take_screenshot
```

### "Check for console errors"
```
1. browser_navigate to the page
2. browser_console_messages with onlyErrors: true
```

### "Fill out a form"
```
1. browser_navigate to the page
2. browser_snapshot to get element refs
3. browser_fill_form with field refs and values
```

### "Test OAuth login flow"
Ask user to restart with `claude --chrome` - Docker MCP can't access authenticated sessions.

---

## Related Docs

- [mcp-servers.md](mcp-servers.md) - All available MCP servers (not just browser)
- [e2e-testing.md](e2e-testing.md) - Playwright test suite
