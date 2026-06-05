---
description: Browser automation URL safety guard
globs: "*"
---

# Browser URL Safety

Never navigate browser automation tools (Chrome DevTools MCP, Claude in Chrome, Playwright) to `chrome-extension://` or `chrome://` URLs. These URLs trigger Chrome security errors ("Cannot access a chrome-extension:// URL of different extension") that block the entire automation session.

If a target URL starts with `chrome-extension://` or `chrome://`, skip the navigation and report to the user what was blocked and why.

# Auth-Gated Pages

Chrome DevTools MCP is headless with no cookies — it cannot access auth-gated pages (blank page). Use Claude in Chrome (real browser, has cookies) or Playwright with test accounts for authenticated routes.

# chrome-devtools take_screenshot — File Path Restriction

`mcp__chrome-devtools__take_screenshot` rejects a `filePath` outside the session's workspace roots (`~/Screenshots` and `/tmp` silently fail). Write to a path inside the repo or worktree root.

# Click Fallback for React Synthetic Events

If `mcp__claude-in-chrome__computer left_click` shows no visible change (verify with a screenshot first): try `javascript_tool` with `document.querySelector('<selector>').click()` once. Do not retry `left_click` — the issue is React's synthetic event system, not a missed coordinate.
