# Browser Tools Guide

This guide covers browser automation tools available to Claude agents.

---

## Default Behavior: Headless + Isolated

> **Principle:** Browser automation should always run **headless** and **isolated** by default.

| Mode | Why Default |
|------|-------------|
| **Headless** | Faster, no visual distraction, works in CI, doesn't steal focus |
| **Isolated** | No session conflicts between agents, clean state, auto-cleanup |

**Exception:** If an agent needs visual debugging (to see what's happening), they must explicitly request headed mode and explain why.

**Configuration:**
- Chrome DevTools MCP: `--headless --isolated` flags in `~/.claude/settings.json`
- Playwright: Defaults to headless; use `--headed` flag only when debugging

---

## Chrome DevTools MCP (Default)

Tools: `mcp__chrome-devtools__*`

**Primary tool for browser automation.** Connects to a real Chrome browser.

- Navigate to pages, take screenshots, interact with elements
- Network inspection (headers, timing, failures)
- Performance traces and profiling
- Console messages with full context
- More reliable for visual testing (real browser rendering)

**Common tools:**
- `list_pages` - See open tabs
- `navigate_page` - Go to URL
- `take_screenshot` - Visual capture
- `get_console_logs` - Check for errors

**Troubleshooting:** With `--isolated` mode, each session gets a fresh profile. If you still get "browser already running" errors, kill stale processes: `pkill -f "chrome-devtools-mcp"`

---

## Docker MCP Playwright (Backup)

Tools: `mcp__MCP_DOCKER__browser_eval`

**Backup option** when Chrome DevTools unavailable or for parallel-safe isolated testing.

- Runs **headless** in container
- **Inherently isolated** (each container is fresh)
- Parallel-safe for multiple agents
- May have environment setup issues

**Usage:** Single tool with `action` parameter:
- `action: "start"` - Start browser
- `action: "navigate"` - Go to URL
- `action: "screenshot"` - Visual capture
- `action: "console_messages"` - Check for errors

### Chrome Integration (`claude --chrome`)

For authenticated sessions:
- Uses your actual logged-in browser (Gmail, OAuth flows)
- Requires: Chrome + Claude extension + `claude --chrome`
- **Only way to test OAuth flows or access authenticated state**

---

## Snapshot vs Screenshot: Context Cost Guide

**Default to snapshot.** Screenshots consume 10-20x more context tokens.

| Tool | Context Cost | Use When |
|------|--------------|----------|
| `take_snapshot` | ~100-500 tokens | Structure, elements, text, form state |
| `take_screenshot` | ~1,500-4,000 tokens | Visual bugs, styling, layout, showing user |

### Decision Rule

> **Checking content/structure?** → Snapshot
> **Checking appearance?** → Screenshot

| Task | Tool | Why |
|------|------|-----|
| "Is the button on the page?" | Snapshot | Structure check |
| "Does the button look right?" | Screenshot | Visual check |
| "Find the login form UID" | Snapshot | Element discovery |
| "Check the color of the header" | Screenshot | Styling check |
| "Verify form has 3 fields" | Snapshot | Structure check |
| "Debug layout overflow" | Screenshot | Visual bug |

**Math:** 10 snapshots ≈ 2-5K tokens. 10 screenshots ≈ 20-40K tokens.

---

## Tool Selection Guide

| Need | Tool | Notes |
|------|------|-------|
| Check page structure/elements | Chrome DevTools / Playwright | Use `take_snapshot` |
| Visual verification | Chrome DevTools / Playwright | Use `take_screenshot` |
| Interact with page elements | Chrome DevTools / Playwright | Use snapshot first to get UIDs |
| Run E2E test suite | `npm run test:e2e` | Playwright tests with assertions |
| Debug network/perf issues | Chrome DevTools MCP | Network inspector, perf traces |
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
