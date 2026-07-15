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

# Mutating Clicks — Confirm Before Navigating Away

After a state-changing click (Resolve, Submit, Delete, Save, a toggle), confirm it landed **before** navigating away — navigating immediately can abort the in-flight request, and the click reports no error when it does. A click that produced no dialog, no toast, and no visible change is unproven, not done: reload and re-read the state, then move on. Absence of an error is not evidence of success.

Bulk actions behind a confirm dialog are self-verifying (the dialog is the feedback); single-element clicks usually are not. This is the precondition for the Click Fallback rule below — that rule says what to do once you've looked; this one says look.

# Click Fallback for React Synthetic Events

If `mcp__claude-in-chrome__computer left_click` shows no visible change (verify with a screenshot first): try `javascript_tool` with `document.querySelector('<selector>').click()` once. Do not retry `left_click` — the issue is React's synthetic event system, not a missed coordinate.

# Viewport Resize — Verify, Don't Trust

`mcp__claude-in-chrome__resize_window` can return a false "Successfully resized" message while silently no-oping below some minimum window size — `window.innerWidth` stays unchanged, which can mask real viewport-clipping bugs that only appear at true narrow widths.

For viewport-width testing (375px, 320px, etc.), use `mcp__chrome-devtools__resize_page` + `mcp__chrome-devtools__emulate` with an explicit viewport string instead (e.g. `viewport: "320x700x2,mobile,touch"`). Before trusting any narrow-viewport screenshot, confirm the resize actually took effect — check `window.innerWidth` via `evaluate_script`/`javascript_tool`.
