# Browser MCP Tools

TEA has access to two MCP-based browser automation tools for interactive testing and debugging.

## Available Tools

### 1. Chrome DevTools MCP (`mcp__chrome-devtools__*`)

Direct Chrome DevTools Protocol access. Best for:
- Debugging existing pages
- Performance tracing
- Network inspection
- Console message capture

**Key commands:**
- `mcp__chrome-devtools__navigate_page` — Navigate to URL
- `mcp__chrome-devtools__take_snapshot` — A11y tree snapshot (preferred over screenshot)
- `mcp__chrome-devtools__take_screenshot` — Visual screenshot
- `mcp__chrome-devtools__click`, `fill`, `hover` — Interactions
- `mcp__chrome-devtools__list_network_requests` — Network inspection
- `mcp__chrome-devtools__list_console_messages` — Console capture
- `mcp__chrome-devtools__performance_start_trace` — Performance profiling
- `mcp__chrome-devtools__evaluate_script` — Run JS in page context

### 2. Playwright MCP (`mcp__playwright__*`)

Playwright automation via MCP. Best for:
- Multi-tab scenarios
- Form filling
- E2E test exploration
- Cross-browser testing

**Key commands:**
- `mcp__playwright__browser_navigate` — Navigate to URL
- `mcp__playwright__browser_snapshot` — A11y snapshot (preferred)
- `mcp__playwright__browser_take_screenshot` — Visual screenshot
- `mcp__playwright__browser_click`, `browser_type`, `browser_hover` — Interactions
- `mcp__playwright__browser_fill_form` — Fill multiple fields at once
- `mcp__playwright__browser_tabs` — Multi-tab management
- `mcp__playwright__browser_network_requests` — Network inspection
- `mcp__playwright__browser_console_messages` — Console capture

## Session Modes

### Headless vs Headed

| Mode | Flag | Use Case |
|------|------|----------|
| **Headless** | `--headless` (default) | CI, automated runs, faster |
| **Headed** | `--headed` | Debugging, visual inspection |

### Isolated vs Persistent

| Mode | Flag | Use Case |
|------|------|----------|
| **Isolated** | `--isolated` | Clean state, no cookies/storage carried over |
| **Persistent** | `--persistent` | Reuse auth state, continue previous session |

## Starting a Browser Session

### Chrome DevTools (requires Chrome with remote debugging)

```bash
# Start Chrome with debugging enabled (do this once)
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

Then use `mcp__chrome-devtools__*` tools directly.

### Playwright

Use `mcp__playwright__browser_navigate` to open a page. Playwright manages browser lifecycle automatically.

## Recommended Workflow

1. **Start with snapshot** — `take_snapshot` or `browser_snapshot` gives you element UIDs
2. **Interact using UIDs** — Click, fill, hover using the uid from snapshot
3. **Verify with snapshot** — Take another snapshot to confirm state change
4. **Screenshot for visual** — Only when you need to see actual rendering

## Common Patterns

### Test a user flow

```
1. browser_navigate to starting URL
2. browser_snapshot to see elements
3. browser_click on login button (using ref from snapshot)
4. browser_fill_form with credentials
5. browser_snapshot to verify logged-in state
```

### Debug a failing E2E test

```
1. navigate_page to the failing URL
2. take_snapshot to see current state
3. list_console_messages to check for errors
4. list_network_requests to check API calls
5. evaluate_script to inspect app state
```

### Performance investigation

```
1. performance_start_trace with reload=true
2. Interact with page
3. performance_stop_trace
4. performance_analyze_insight for specific metrics
```

## Tool Selection Guide

| Need | Use |
|------|-----|
| Quick page inspection | Chrome DevTools |
| Multi-tab testing | Playwright |
| Performance profiling | Chrome DevTools |
| Form automation | Playwright |
| Network mocking | Either (both support it) |
| Console debugging | Chrome DevTools |
| Cross-browser | Playwright |

## Integration with TEA Workflows

When TEA runs `*browser-session`:
1. Asks for tool preference (playwright/chrome-devtools)
2. Asks for mode (headless/headed, isolated/persistent)
3. Starts appropriate session
4. Provides interactive testing environment
5. Can capture results for test generation
