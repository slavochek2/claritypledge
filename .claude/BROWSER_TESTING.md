# Browser Testing Workflow for Agents

## Problem
Agents repeatedly fail to verify UI changes due to browser tool conflicts and missing systematic approach.

## Solution: Standard Testing Protocol

### 1. Clean Browser State (ALWAYS DO THIS FIRST)
```bash
pkill -9 -f chrome; pkill -9 -f playwright
sleep 1
```

### 2. Use Playwright (Primary Tool)
- Playwright MCP is most reliable for agent-driven testing
- Has full page screenshots, console logs, snapshots
- ⚠️ Avoid concurrent use with Chrome DevTools MCP (browser tool conflicts)

### 3. Standard Test Sequence

```typescript
// 1. Navigate
mcp__playwright__browser_navigate({ url: "http://localhost:5001/..." })

// 2. Wait for load
sleep 2

// 3. Full page screenshot
mcp__playwright__browser_take_screenshot({ fullPage: true, type: "png" })

// 4. Check console errors
mcp__playwright__browser_console_messages()

// 5. Get page snapshot for finding elements
mcp__playwright__browser_snapshot()
```

### 4. For Auth-Required Features

**Check if logged in first:**
```typescript
// Look for "Sign up" vs user profile in screenshot/snapshot
// If not logged in, can't test auth-required features
// Document: "Cannot verify - requires login"
```

### 5. Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| "Browser already in use" | `pkill -9 -f chrome; pkill -9 -f playwright` |
| Chrome DevTools opens visible browser | Known issue — headless flag not working (postponed) |
| Tools conflict | Don't run Playwright + Chrome DevTools concurrently |
| Can't see button | Check if feature requires login |
| Page still loading | `sleep 2` before screenshot |

## For This Project Specifically

### Event "Verify Together" Button
- **Requires:** User must be logged in
- **Location:** Event detail page, Participants section
- **Visible when:** `isLoggedIn && !isSelf && !isOccupied && !currentUserInSubRoom`

### Waiting Room
- **Requires:** User must be initiator of sub-room
- **URL:** `/events/{slug}/waiting/{subRoomId}`
- **Test:** Create sub-room while logged in, verify navigation

## E2E Test Alternative

For features requiring complex auth flows, suggest writing Playwright E2E test instead:
```bash
npm run test:e2e
```

Test file: `e2e/event-waiting-room.spec.ts`
