# Browser Tools Guide

Three browser automation tools, each with a distinct purpose. No hierarchy — pick based on the task.

---

## Tool Overview

| Tool | What It Is | Headless? | Needs User Browser? | CI? | Token Cost |
|------|-----------|-----------|---------------------|-----|-----------|
| **Playwright Tests** (`npm run test:e2e`) | Automated test framework | Yes | No | Yes | N/A (not agent-driven) |
| **Chrome DevTools MCP** (`mcp__chrome-devtools__*`) | Headless debugging & profiling | Yes | No | No | Medium (~100-500 tokens) |
| **Claude in Chrome** (`mcp__claude-in-chrome__*`) | Visual QA in real browser | No | Yes (`claude --chrome`) | No | High (~1,500-4,000 tokens) |

---

## When to Use Each

### Playwright Tests

**Lane:** Repeatable automated testing.

- E2E test suites (`e2e/*.spec.ts`)
- Regression testing in CI
- Two-party `/live` session simulation (multiple browser contexts)
- Assertions with `expect()`, auto-retry, test reports
- Parallel workers, sharding

```bash
npm run test:e2e         # Headless
npm run test:e2e:headed  # Visual debugging
npm run test:e2e:ui      # Playwright UI
```

**Use when:** You need tests that run the same way every time, without a human present.

### Chrome DevTools MCP

**Lane:** Headless debugging, performance profiling, network inspection.

Tools: `mcp__chrome-devtools__*`

**Unique strengths:**
- **Performance profiling** — `performance_start_trace`, `stop_trace`, `analyze_insight`
- **Network inspection** — request/response headers, timing, failures
- **Console capture** — errors, warnings with full context
- **Headless + isolated** — runs without the user's Chrome, each session gets a clean profile
- **Works in any Claude session** — no `--chrome` flag needed

**Common tools:**
- `navigate_page` — go to URL
- `take_snapshot` — accessibility tree (low context cost, ~100-500 tokens)
- `take_screenshot` — visual capture (higher cost, ~1,500-4,000 tokens)
- `evaluate_script` — run JS in page context
- `list_network_requests` / `get_network_request` — network debugging
- `list_console_messages` — error checking
- `performance_start_trace` — profiling

**Configuration:** `~/.claude/settings.json` — runs with `--headless --isolated` flags.

**Use when:** Debugging issues, profiling performance, inspecting network calls. Agent can use this independently without the user's browser.

### Claude in Chrome

**Lane:** Visual QA, authenticated sessions, ad-hoc interactive testing.

Tools: `mcp__claude-in-chrome__*`

Requires: `claude --chrome` + Chrome with Claude extension installed.

**Unique strengths:**
- **Authenticated state** — sees your cookies, logins, extensions (OAuth flows, admin panels)
- **Vision-based interaction** — `computer` tool with coordinate-based clicks, screenshots
- **Rich page reading** — `read_page` accessibility tree, `find` for element search
- **GIF recording** — `gif_creator` for documenting interactions
- **Form filling** — `form_input` with element refs from `read_page`
- **JavaScript execution** — `javascript_tool` for arbitrary JS in page context

**Common tools:**
- `tabs_context_mcp` — always call first to see available tabs
- `tabs_create_mcp` — open new tab (don't reuse tabs from other sessions)
- `navigate` — go to URL
- `read_page` — accessibility tree with interactive element refs
- `computer` — screenshot, click, type, scroll, zoom
- `javascript_tool` — run JS in page context
- `find` — search for elements on page
- `gif_creator` — record interactions as GIF

**Use when:** You need to see the real page as a user sees it, test authenticated flows, or do ad-hoc visual checks during a conversation.

> **Note:** Playwright MCP (`mcp__playwright__*`) and Docker MCP Playwright (`mcp__MCP_DOCKER__browser_eval`) are also available. However, both are **token-heavy** (send full page snapshots/accessibility trees). Use Chrome DevTools MCP or write custom Playwright scripts for agent automation when needed.

---

## Decision Guide

| Task | Tool | Why |
|------|------|-----|
| **Automated Testing** |
| "Run the E2E test suite" | Playwright Tests | Automated, repeatable, CI-ready |
| "Test the `/live` session flow" | Playwright Tests | Needs two browser contexts |
| **Debugging & Performance** |
| "Is there a console error on this page?" | Chrome DevTools MCP | Network inspection, console errors |
| "Why is this page slow?" | Chrome DevTools MCP | Performance profiling unique to DevTools |
| "What API calls does this page make?" | Chrome DevTools MCP | Network inspection with full headers |
| **Visual QA & Authenticated Flows** |
| "Does the landing page look right?" | Claude in Chrome | Visual verification, real rendering |
| "Test the login flow with my account" | Claude in Chrome | Needs authenticated state |
| "Fill out the pledge form and check it works" | Claude in Chrome | Interactive, visual feedback |
| "Check the Ghost admin panel" | Claude in Chrome | Needs authentication |
| "Debug a layout overflow" | Claude in Chrome | Visual bug needs screenshots |
| **Ad-Hoc Agent Verification** |
| "Does this page load without errors?" | Custom Playwright script | Quick verification, low setup |
| "Navigate and verify element exists" | Chrome DevTools MCP | Headless, no script needed |

---

## Snapshot vs Screenshot: Context Cost

**Default to snapshot.** Screenshots consume 10-20x more context tokens.

| Tool | Context Cost | Use When |
|------|-------------|----------|
| `take_snapshot` / `read_page` | ~100-500 tokens | Structure, elements, text, form state |
| `take_screenshot` / `computer(screenshot)` | ~1,500-4,000 tokens | Visual bugs, styling, layout |

**Rule of thumb:**
- Checking content/structure → Snapshot
- Checking appearance → Screenshot

**Math:** 10 snapshots ≈ 2-5K tokens. 10 screenshots ≈ 20-40K tokens.

---

## Common Patterns

### Check page health
```
1. Chrome DevTools: navigate_page → URL
2. take_snapshot → verify elements present
3. list_console_messages → check for errors
4. list_network_requests → check for failures
```

### Visual QA (interactive)
```
1. Claude in Chrome: tabs_context_mcp → get context
2. navigate → URL
3. computer(screenshot) → see the page
4. read_page(interactive) → check interactive elements
```

### Debug performance
```
1. Chrome DevTools: navigate_page → URL
2. performance_start_trace(reload=true)
3. performance_stop_trace
4. performance_analyze_insight → specific metrics
```

### Test OAuth / authenticated flow
```
Requires: claude --chrome (user must be logged in)
1. Claude in Chrome: tabs_context_mcp
2. navigate → authenticated page
3. read_page → verify logged-in state
4. Interact with authenticated features
```

---

## Troubleshooting

**Chrome DevTools "browser already running":**
- Try `list_pages` to reconnect to existing session
- Kill stale processes: `pkill -f "chrome-devtools-mcp"` (not `pkill -f "chrome"` — that kills Chrome itself)

**Claude in Chrome not responding:**
- Check Chrome has the Claude extension installed and enabled
- Verify `claude --chrome` was used to start the session
- Call `tabs_context_mcp` to refresh tab state

**Playwright tests failing locally but passing in CI (or vice versa):**
- Check port — dev server must be running on the correct worktree port
- See [e2e-testing.md](e2e-testing.md) for full setup

---

## Related Docs

- [e2e-testing.md](e2e-testing.md) — Playwright test suite details
- [live-session-testing.md](live-session-testing.md) — `/live` two-party test simulation
- [mcp-servers.md](mcp-servers.md) — All available MCP servers
