# Browser Tools Guide

Three browser automation tools, each with a distinct purpose. No hierarchy — pick based on the task.

---

## Screenshot Path Rule

**Never write screenshots to the project directory.** Browser automation tools default to CWD (project root), creating clutter that accumulates silently.

Always pass an absolute path:
- **Transient QA screenshots:** `~/Screenshots/YYYY-MM-DD/{feature}/name.png`
- **Committed docs screenshots:** `docs/reference/{feature}/name.png` (tracked in git)

Pre-commit check #14 will **error** if PNG/JPG files are found in the project root.

---

## Tool Overview

| Tool | What It Is | Headless? | Needs User Browser? | CI? | Token Cost |
|------|-----------|-----------|---------------------|-----|-----------|
| **Playwright Tests** (`npm run test:e2e`) | Automated test framework | Yes | No | Yes | N/A (not agent-driven) |
| **Chrome DevTools MCP** (`mcp__chrome-devtools__*`) | Debugging & profiling | No* | No | No | Medium (~100-500 tokens) |
| **Claude in Chrome** (`mcp__claude-in-chrome__*`) | Visual QA in real browser | No | Yes (CLI: `claude --chrome` · VS Code ext: `@browser`, no flag) | No | High (~1,500-4,000 tokens) |

\* Configured for headless but currently opens visible browser (issue postponed)

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
- **Isolated** — each session gets a clean profile, runs without the user's Chrome
- **Works in any Claude session** — no `--chrome` flag needed
- ⚠️ **Known issue:** Currently opens visible browser despite `--headless` flag (postponed fix)
- ⚠️ **Mutually exclusive with Claude in Chrome** — opening a CDP session blocks the extension's `computer` actions. Use one or the other per conversation, not both. Close the DevTools MCP panel before switching to Claude in Chrome.

**Common tools:**
- `navigate_page` — go to URL
- `take_snapshot` — accessibility tree (low context cost, ~100-500 tokens)
- `take_screenshot` — visual capture (higher cost, ~1,500-4,000 tokens)
- `evaluate_script` — run JS in page context
- `list_network_requests` / `get_network_request` — network debugging
- `list_console_messages` — error checking
- `performance_start_trace` — profiling

**Configuration:** `~/.claude/settings.json` — configured with `--headless --isolated` flags (headless not working currently).

**Use when:** Debugging issues, profiling performance, inspecting network calls. Agent can use this independently without the user's browser.

### Claude in Chrome

**Lane:** Visual QA, authenticated sessions, ad-hoc interactive testing.

Tools: `mcp__claude-in-chrome__*`

Requires: Chrome with the "Claude in Chrome" extension installed + a direct Anthropic subscription. CLI: launch `claude --chrome` (or run `/chrome` once → "Enabled by default"). VS Code extension: no flag — type `@browser` in the prompt box.

**Unique strengths:**
- **Authenticated state** — sees your cookies, logins, extensions (OAuth flows, admin panels)
- **Vision-based interaction** — `computer` tool with coordinate-based clicks, screenshots
- **Rich page reading** — `read_page` accessibility tree, `find` for element search
- **GIF recording** — `gif_creator` for documenting interactions
- **Form filling** — `form_input` with element refs from `read_page`; returns the "previous" field value — useful for recovering auto-generated or overwritten values
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

> **Note:** Playwright MCP (`mcp__playwright__*`) and Docker MCP Playwright (`mcp__MCP_DOCKER__browser_eval`) are also available. Both return full page snapshots / accessibility trees, so they are believed to be more context-hungry than the alternatives — **this has not been measured**, so don't treat it as a reason to avoid them. Pick by job, per the Decision Guide below: Playwright is the only option that is headless *and* can authenticate *and* can open two browser contexts (`/live`).

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

### Visual QA (Chrome extension unavailable)

When Claude in Chrome is not connected, use a node Playwright script directly:

```javascript
node -e "
const { chromium } = require('./node_modules/@playwright/test');
const os = require('os');
async function main() {
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'mobile-375', width: 375, height: 812 },
    { name: 'desktop-1280', width: 1280, height: 900 },
  ];
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto('http://localhost:5200/your-page', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: os.homedir() + '/Screenshots/qa-' + vp.name + '.png' });
    await page.close();
  }
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
"
```

**Note:** Use `require('./node_modules/@playwright/test')` (not `playwright` or `@playwright/test` — those fail from project root without tsx). Screenshots land in `~/Screenshots/`.


### Agent-driven UI verification (Playwright MCP)
```
1. mcp__playwright__browser_navigate({ url: "http://localhost:5001/..." })
2. sleep 2                                    # let the page settle
3. mcp__playwright__browser_take_screenshot({ fullPage: true, type: "png" })
4. mcp__playwright__browser_console_messages() # check for errors
5. mcp__playwright__browser_snapshot()         # element refs for interaction
```
For auth-required features, confirm logged-in state first (look for "Sign up" vs a user
profile in the snapshot). If not logged in, say "Cannot verify — requires login" rather
than reporting a pass. For complex auth flows, write an E2E spec instead: `npm run test:e2e`.

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

## Concurrency Constraints

**Browser automation tools support single-session use only.**

When orchestrating multiple agents (e.g., `/finish` spawning 4 parallel agents), only one agent can use browser tools at a time.

**Why:** Chrome DevTools MCP, Playwright MCP, and Claude in Chrome are designed for single-agent precision testing. They cannot handle concurrent connections from multiple agents.

**Symptoms of concurrent use:**
- "MCP server busy" errors
- Port conflicts
- Session corruption
- Visible browser windows popping up unexpectedly
- Agents timing out waiting for browser access

**Solution: Sequential boundaries**
- ✅ **Parallel:** Code review, static analysis, file operations (no browser needed)
- ❌ **Sequential required:** Visual verification, E2E tests, browser automation

**Pattern:**
```
Phase 1 (Parallel): Design Audit + Code Review + UX Review
Phase 2 (Sequential): Visual Verification (runs alone, owns the browser)
```

This ensures browser tools are never contended.

---

## Troubleshooting

**Never mass-kill browser processes.** Do not run `pkill -f chrome` / `pkill -9 -f chrome`
under any circumstances. It kills the real browser, and SIGKILL during an automation launch
corrupts Chrome extension state — this has happened once, taking out Bitwarden, LastPass,
Grammarly, PhantomBuster and React DevTools, each needing a manual Repair
([decisions.md](../decisions.md) 2026-05-19). Also banned by name in `CLAUDE.md`.
Target the specific process, or free a port with `lsof -ti:PORT | xargs kill`.

**Chrome DevTools "browser already running":**
- Try `list_pages` to reconnect to existing session
- Kill stale processes: `pkill -f "chrome-devtools-mcp"` (never `pkill -f "chrome"` — see above)

**Playwright MCP "browser already in use":**
- Kill the specific process, never a bare `chrome` match — see above

**Chrome DevTools opens a visible browser window:** known issue, headless flag not taking
effect. Postponed — not a sign anything is misconfigured.

**Feature-specific test targets:**
- *Event "Verify Together" button* — requires login; Event detail page → Participants section;
  visible when `isLoggedIn && !isSelf && !isOccupied && !currentUserInSubRoom`
- *Waiting room* — requires being the sub-room initiator; `/events/{slug}/waiting/{subRoomId}`;
  create a sub-room while logged in, then verify navigation (`e2e/event-waiting-room.spec.ts`)

**Claude in Chrome not responding:**
- Check Chrome has the Claude extension installed and enabled
- Verify `claude --chrome` was used to start the session
- Call `tabs_context_mcp` to refresh tab state

**Playwright tests failing locally but passing in CI (or vice versa):**
- Check port — dev server must be running on the correct worktree port
- See [e2e-testing-guide.md](e2e-testing-guide.md) for full setup

---

## Related Docs

- [e2e-testing-guide.md](e2e-testing-guide.md) — Playwright test suite details
- [live-session-testing.md](live-session-testing.md) — `/live` two-party test simulation
- [mcp-servers.md](mcp-servers.md) — All available MCP servers
