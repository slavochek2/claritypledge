# Git Worktree Setup for Parallel Development

This project uses git worktrees to enable parallel development with multiple AI agents working simultaneously on different feature explorations.

## Overview

**Main Repository:** `/Users/slavochek/Documents/polymet-clarity-pledge-app` (port 5001)

**Worktrees:**
- Tree 1: `/Users/slavochek/Documents/claritypledge-1` (port 5100, branch: `worktree-1`)
- Tree 2: `/Users/slavochek/Documents/claritypledge-2` (port 5200, branch: `worktree-2`)
- Tree 3: `/Users/slavochek/Documents/claritypledge-3` (port 5300, branch: `worktree-3`)
- Tree 4: `/Users/slavochek/Documents/claritypledge-4` (port 5400, branch: `worktree-4`)
- Tree 5: `/Users/slavochek/Documents/claritypledge-5` (port 5500, branch: `worktree-5`)
- Tree 6: `/Users/slavochek/Documents/claritypledge-6` (port 5600, branch: `worktree-6`)
- Tree 7: `/Users/slavochek/Documents/claritypledge-7` (port 5700, branch: `worktree-7`)

## Port Configuration

Each worktree has a unique dev server port configured in `vite.config.ts`:

```typescript
export default defineConfig({
  server: {
    port: 5100, // Unique per worktree
    strictPort: true, // Fail if port already in use
  },
  // ... rest of config
})
```

**Important:** These port configurations are committed to each worktree's branch to ensure persistence across resets.

## Starting a Dev Server

```bash
# Tree 1
cd /Users/slavochek/Documents/claritypledge-1
npm run dev  # Starts on http://localhost:5100

# Tree 2
cd /Users/slavochek/Documents/claritypledge-2
npm run dev  # Starts on http://localhost:5200

# ... and so on
```

## Viewing All Worktrees

```bash
git worktree list
```

Output:
```
/Users/slavochek/Documents/polymet-clarity-pledge-app  56e5f28 [main]
/Users/slavochek/Documents/claritypledge-1             850cb2f [worktree-1]
/Users/slavochek/Documents/claritypledge-2             56e5f28 [worktree-2]
...
```

## Resetting a Worktree

When you need to reset a worktree to a clean state:

### Option 1: Soft Reset (Keep Port Config)

If the port configuration is committed to the branch (recommended):

```bash
# From main repo
cd /Users/slavochek/Documents/polymet-clarity-pledge-app

# Reset to branch HEAD (discards uncommitted changes)
cd ../claritypledge-1
git reset --hard HEAD
git clean -fd  # Remove untracked files

# Or reset to match main branch
git fetch origin
git reset --hard origin/main
```

Port configuration survives because it's committed to the branch.

### Option 2: Full Worktree Removal and Recreation

If you need to completely recreate a worktree:

```bash
# From main repo
cd /Users/slavochek/Documents/polymet-clarity-pledge-app

# Remove worktree
git worktree remove ../claritypledge-1

# Recreate with same branch
git worktree add ../claritypledge-1 worktree-1

# Port config automatically restored (if committed to branch)
cd ../claritypledge-1
npm install  # May need to reinstall dependencies
```

## Important: Port Config Persistence Strategy

**Current Strategy:** Port configurations are **committed to each worktree branch**.

**Why:**
- Automatic persistence across resets
- No manual scripts needed
- Clear separation per worktree

**Trade-off:**
- Each worktree branch diverges slightly from main
- **Never merge port config commits back to main**

### Checking Port Config Status

```bash
cd /Users/slavochek/Documents/claritypledge-1
git log --oneline vite.config.ts

# Should show commit with port configuration
```

### If Port Config Was Lost

If you accidentally reset and lost the port config:

```bash
# Edit vite.config.ts manually and add:
server: {
  port: 5100,  # Use correct port for this tree
  strictPort: true,
},

# Commit to the branch
git add vite.config.ts
git commit -m "Configure dev server port for worktree-1"
```

## Creating New Worktrees

To add additional worktrees (e.g., Tree 4):

```bash
# From main repo
cd /Users/slavochek/Documents/polymet-clarity-pledge-app

# Create new worktree with new branch
git worktree add ../claritypledge-4 -b worktree-4

# Configure port in new worktree
cd ../claritypledge-4

# Edit vite.config.ts to add:
# server: { port: 5400, strictPort: true }

# Commit the port config
git add vite.config.ts
git commit -m "Configure dev server port for worktree-4"

# Install dependencies
npm install

# Start dev server
npm run dev  # Should start on http://localhost:5400
```

**Available ports for new worktrees:** 5400, 5500, 5600, 5700, etc.

## Workflow: Parallel Feature Development

### 1. Exploration Phase
Multiple agents work in parallel worktrees, each exploring different implementations:

```bash
# Tree 1: Minimalist UI approach
# Tree 2: Feature-rich UI approach  
# Tree 3: Mobile-first approach
```

### 2. Review Phase
Compare implementations by visiting their dev servers:
- http://localhost:5100 (Tree 1)
- http://localhost:5200 (Tree 2)
- http://localhost:5300 (Tree 3)

### 3. Selection Phase
Choose the winning implementation and merge it to main:

```bash
cd /Users/slavochek/Documents/polymet-clarity-pledge-app

# Merge winning branch (e.g., worktree-2)
git merge worktree-2 --no-ff

# Important: Revert the port config commit before merging
# or use interactive rebase to exclude it
```

### 4. Cleanup Phase
Reset losing worktrees for next exploration:

```bash
# Option A: Keep worktrees, reset to main
cd ../claritypledge-1
git fetch origin
git reset --hard origin/main

# Option B: Remove and recreate worktrees
cd /Users/slavochek/Documents/polymet-clarity-pledge-app
git worktree remove ../claritypledge-1
git worktree add ../claritypledge-1 worktree-1
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 5100
lsof -i :5100

# Kill the process
kill -9 <PID>

# Or just let Vite fail (strictPort: true will error instead of using next port)
```

### Worktree Locked

```bash
# If "worktree already locked" error
git worktree unlock ../claritypledge-1
```

### Dependencies Out of Sync

```bash
# If node_modules differ between worktrees
cd ../claritypledge-1
rm -rf node_modules package-lock.json
npm install
```

## Best Practices

1. **Always commit port configs to worktree branches** - Ensures persistence
2. **Never merge port config commits to main** - Use interactive rebase to exclude them
3. **One dev server per worktree** - strictPort prevents accidental port conflicts
4. **Clean up after exploration** - Reset or remove worktrees after merging winner
5. **Document branch purpose** - Use descriptive branch names (`feat/minimalist-ui` better than `worktree-1`)

## References

- Vision doc: [docs/visions/v3. AI orchestration.md](../visions/v3.%20AI%20orchestration.md)
- CLAUDE.md: [Root README for AI agents](../../CLAUDE.md)

