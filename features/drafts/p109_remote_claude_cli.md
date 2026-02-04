---
status: backlog
---
# P109: Remote Claude CLI Access

## Problem Statement

I want to use Claude CLI with my full setup (skills, MCP servers, worktrees) from any device — not just my Mac.

**Current state:**
- Claude CLI works great on Mac desktop
- Dockerized backups exist for gitignored config (`.claude.md`, `.mcp.json`, etc.)
- Can't access from phone (Android) or other devices

**Desired state:**
- Work from phone, laptop, or any device
- Same skills (`.claude/commands/`)
- Same MCP servers (Notion, etc.)
- Same worktrees and git history
- Seamless switching between devices

## 5-Why Analysis

1. **Why can't I use Claude CLI from phone?**
   → Claude CLI is a terminal tool; Android has no native terminal with Claude CLI

2. **Why does that matter?**
   → I want to review code, ask questions, maybe make small changes when away from desk

3. **Why not just use Claude.ai web?**
   → No access to my skills, MCP servers, codebase context, worktrees

4. **Why not SSH into Mac?**
   → Mac must be on, awake, connected — not always reliable

5. **Why not just wait until at desk?**
   → Friction reduces usage; ideas/bugs don't wait for convenient timing

## Core Question

**What's the simplest way to get Claude CLI + full setup accessible from any device?**

## Options to Explore

| Option | Pros | Cons |
|--------|------|------|
| **A. Cloud VM (GCP)** | Always on, full Linux, use $25K credits | Monthly cost, latency, setup complexity |
| **B. Tailscale + Mac** | Free, Mac already set up | Mac must be on, battery drain |
| **C. GitHub Codespaces** | No infra management, VS Code in browser | Limited to VS Code, pricing |
| **D. Gitpod** | Similar to Codespaces | Another service to manage |
| **E. Self-hosted code-server** | Full control | Setup/maintenance overhead |

## Requirements (Draft)

### Must Have
- [ ] Access Claude CLI from Android browser/app
- [ ] Same skills available (`.claude/commands/`)
- [ ] Same MCP servers working
- [ ] Git worktrees accessible
- [ ] Persistent state between sessions

### Nice to Have
- [ ] Quick startup (< 30 seconds)
- [ ] Low cost (ideally use existing credits)
- [ ] Works offline on plane (cache/sync)

### Out of Scope
- Full IDE from phone (too small)
- Real-time pair programming

## Open Questions

1. **What's the actual use case from phone?**
   - Full development (edit, test, commit)?
   - Quick questions about codebase?
   - Code review only?
   - Just reading Claude conversations?

2. **How often would this be used?**
   - Daily?
   - Occasional (travel, commute)?

3. **Latency tolerance?**
   - Sub-second response needed?
   - Can wait a few seconds?

4. **Security requirements?**
   - API keys in cloud VM?
   - MCP server credentials?

## Next Steps

1. [ ] Clarify primary use case (question 1 above)
2. [ ] Prototype simplest option (likely Tailscale + Mac first)
3. [ ] If that's insufficient, explore GCP VM setup

---

**Status:** draft
**Created:** 2026-02-02
