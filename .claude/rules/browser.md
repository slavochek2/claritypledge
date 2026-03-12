---
description: Browser automation URL safety guard
globs: "*"
---

# Browser URL Safety

Never navigate browser automation tools (Chrome DevTools MCP, Claude in Chrome, Playwright) to `chrome-extension://` or `chrome://` URLs. These URLs trigger Chrome security errors ("Cannot access a chrome-extension:// URL of different extension") that block the entire automation session.

If a target URL starts with `chrome-extension://` or `chrome://`, skip the navigation and report to the user what was blocked and why.
