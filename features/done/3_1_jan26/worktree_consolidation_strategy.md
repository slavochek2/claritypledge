# Worktree Consolidation Strategy

**Date:** 2026-01-06
**Current State:** 7 worktrees with different prototype variants

---

## Current Worktrees

```
Main:      /Users/slavochek/Documents/polymet-clarity-pledge-app  [main]
Tree 1:    /Users/slavochek/Documents/claritypledge-1            [p32-3-converged-prototype]
Tree 2:    /Users/slavochek/Documents/claritypledge-2            [worktree-2]
Tree 3:    /Users/slavochek/Documents/claritypledge-3            [p32_2_2_twitter]
Tree 4:    /Users/slavochek/Documents/claritypledge-4            [p32_2_3-linkedin-like]
Tree 5:    /Users/slavochek/Documents/claritypledge-5            [worktree-5]
Tree 6:    /Users/slavochek/Documents/claritypledge-6            [p32_2_5-instagram-stories]
Tree 7:    /Users/slavochek/Documents/claritypledge-7            [worktree-7]
```

---

## Prototype Variants Discovered

Based on branch names:
- **Tree 1:** Converged prototype (p32-3-converged-prototype) - PRIMARY
- **Tree 3:** Twitter-like variant (p32_2_2_twitter)
- **Tree 4:** LinkedIn-like variant (p32_2_3-linkedin-like)
- **Tree 6:** Instagram Stories variant (p32_2_5-instagram-stories)
- **Trees 2, 5, 7:** Generic worktrees (unknown content)

---

## Goals

1. **Preserve** all prototype variants as committed branches in Git
2. **Reset** worktrees locally to reclaim disk space
3. **Keep** branches accessible for later viewing
4. **Organize** prototypes under different routes (optional)

---

## Strategy: KISS Approach

### Option A: Commit + Remove Worktrees (RECOMMENDED)

**What:** Save all work to Git, remove local worktrees, keep branches

**Steps:**

#### 1. Commit All Work in Each Worktree

```bash
# Tree 1 (converged prototype)
cd /Users/slavochek/Documents/claritypledge-1
git add .
git commit -m "Snapshot: P32.3 converged prototype"
git push origin p32-3-converged-prototype

# Tree 2
cd /Users/slavochek/Documents/claritypledge-2
git add .
git commit -m "Snapshot: worktree-2 state"
git push origin worktree-2

# Tree 3 (Twitter variant)
cd /Users/slavochek/Documents/claritypledge-3
git add .
git commit -m "Snapshot: Twitter-like variant (p32_2_2)"
git push origin p32_2_2_twitter

# Tree 4 (LinkedIn variant)
cd /Users/slavochek/Documents/claritypledge-4
git add .
git commit -m "Snapshot: LinkedIn-like variant (p32_2_3)"
git push origin p32_2_3-linkedin-like

# Tree 5
cd /Users/slavochek/Documents/claritypledge-5
git add .
git commit -m "Snapshot: worktree-5 state"
git push origin worktree-5

# Tree 6 (Instagram Stories variant)
cd /Users/slavochek/Documents/claritypledge-6
git add .
git commit -m "Snapshot: Instagram Stories variant (p32_2_5)"
git push origin p32_2_5-instagram-stories

# Tree 7
cd /Users/slavochek/Documents/claritypledge-7
git add .
git commit -m "Snapshot: worktree-7 state"
git push origin worktree-7
```

#### 2. Remove Worktrees Locally

```bash
cd /Users/slavochek/Documents/polymet-clarity-pledge-app

git worktree remove /Users/slavochek/Documents/claritypledge-1
git worktree remove /Users/slavochek/Documents/claritypledge-2
git worktree remove /Users/slavochek/Documents/claritypledge-3
git worktree remove /Users/slavochek/Documents/claritypledge-4
git worktree remove /Users/slavochek/Documents/claritypledge-5
git worktree remove /Users/slavochek/Documents/claritypledge-6
git worktree remove /Users/slavochek/Documents/claritypledge-7
```

#### 3. Branches Remain in Git

All branches are preserved remotely:
```bash
git branch -r
# origin/p32-3-converged-prototype
# origin/p32_2_2_twitter
# origin/p32_2_3-linkedin-like
# origin/p32_2_5-instagram-stories
# origin/worktree-2
# origin/worktree-5
# origin/worktree-7
```

#### 4. View Later (When Needed)

```bash
# Checkout any branch to view it
git checkout p32-3-converged-prototype
npm run dev

# Or create new worktree on demand
git worktree add ../temp-view p32_2_2_twitter
cd ../temp-view
npm run dev
# When done: git worktree remove ../temp-view
```

**Pros:**
- Saves disk space (~7 repos = ~1-2 GB)
- Keeps all work in Git (safe)
- Can restore anytime
- Simple

**Cons:**
- Need to checkout branch to view
- Can't compare variants side-by-side easily

---

### Option B: Merge Variants into Tree 7 with Routes

**What:** Merge all variants into one worktree, each accessible via different route

**Example:**
```
/prototype/converged     → Primary (p32-3)
/prototype/twitter       → Twitter variant (p32_2_2)
/prototype/linkedin      → LinkedIn variant (p32_2_3)
/prototype/stories       → Instagram Stories variant (p32_2_5)
```

**Steps:**

1. Move each variant to its own folder in Tree 7:
   ```bash
   src/app/prototypes/converged/    (from Tree 1)
   src/app/prototypes/twitter/      (from Tree 3)
   src/app/prototypes/linkedin/     (from Tree 4)
   src/app/prototypes/stories/      (from Tree 6)
   ```

2. Update routes in `App.tsx`:
   ```tsx
   <Route path="/prototype/converged" element={<ConvergedPrototype />} />
   <Route path="/prototype/twitter" element={<TwitterPrototype />} />
   <Route path="/prototype/linkedin" element={<LinkedInPrototype />} />
   <Route path="/prototype/stories" element={<StoriesPrototype />} />
   ```

3. Run single dev server, view all prototypes

**Pros:**
- All variants accessible in one place
- Easy to compare
- Single dev server

**Cons:**
- More complex merge
- Larger codebase
- Might have conflicting dependencies
- Not KISS

---

### Option C: Archive to Separate Branch

**What:** Create `archive/prototypes` branch with all variants organized

**Steps:**

1. Create archive branch:
   ```bash
   git checkout -b archive/prototypes
   ```

2. Copy all prototype code from trees 1, 3, 4, 6:
   ```bash
   docs/prototypes/converged/
   docs/prototypes/twitter/
   docs/prototypes/linkedin/
   docs/prototypes/stories/
   ```

3. Add README explaining each:
   ```markdown
   # Prototype Archive

   ## Converged (P32.3)
   Final converged design combining best of all variants

   ## Twitter Variant (P32.2.2)
   Feed-first, linear conversation style

   ## LinkedIn Variant (P32.2.3)
   Professional network feel, endorsements

   ## Stories Variant (P32.2.5)
   Story-first, ephemeral content style
   ```

4. Commit and push:
   ```bash
   git add docs/prototypes/
   git commit -m "Archive: P32 prototype variants"
   git push origin archive/prototypes
   ```

**Pros:**
- All variants documented in one place
- Easy to browse on GitHub
- Organized

**Cons:**
- Need to extract code to run
- Not executable directly

---

## Recommendation: Option A (KISS)

**Why:**
- Simplest approach
- Keeps Git as source of truth
- Reclaims disk space
- Can restore anytime
- Follows KISS principle

**When to view later:**
```bash
# Quick view (temporary checkout)
git checkout p32_2_2_twitter
npm run dev
# When done: git checkout main

# Or create temporary worktree
git worktree add ../temp p32_2_2_twitter
cd ../temp
npm run dev
# When done: git worktree remove ../temp
```

---

## Implementation: Option A (Step-by-Step)

### 1. Check What's Uncommitted in Each Tree

```bash
# Run this for each worktree
cd /Users/slavochek/Documents/claritypledge-1 && git status
cd /Users/slavochek/Documents/claritypledge-2 && git status
cd /Users/slavochek/Documents/claritypledge-3 && git status
cd /Users/slavochek/Documents/claritypledge-4 && git status
cd /Users/slavochek/Documents/claritypledge-5 && git status
cd /Users/slavochek/Documents/claritypledge-6 && git status
cd /Users/slavochek/Documents/claritypledge-7 && git status
```

### 2. Commit All Uncommitted Work

```bash
# For each worktree with changes:
cd /Users/slavochek/Documents/claritypledge-X
git add .
git commit -m "Snapshot: [describe what's in this tree]"
git push origin [branch-name]
```

### 3. Verify Pushed

```bash
# Check all branches are pushed
cd /Users/slavochek/Documents/polymet-clarity-pledge-app
git fetch origin
git branch -r | grep -E "(p32|worktree)"
```

### 4. Remove Worktrees

```bash
cd /Users/slavochek/Documents/polymet-clarity-pledge-app

# Remove all worktrees
git worktree remove /Users/slavochek/Documents/claritypledge-1 --force
git worktree remove /Users/slavochek/Documents/claritypledge-2 --force
git worktree remove /Users/slavochek/Documents/claritypledge-3 --force
git worktree remove /Users/slavochek/Documents/claritypledge-4 --force
git worktree remove /Users/slavochek/Documents/claritypledge-5 --force
git worktree remove /Users/slavochek/Documents/claritypledge-6 --force
git worktree remove /Users/slavochek/Documents/claritypledge-7 --force
```

### 5. Verify Clean

```bash
git worktree list
# Should only show main worktree
```

### 6. Document Prototype Branches

Create `docs/prototypes-archive.md`:
```markdown
# Prototype Branches Archive

All P32 prototype variants are preserved as Git branches:

- `p32-3-converged-prototype` - Final converged design (PRIMARY)
- `p32_2_2_twitter` - Twitter-like feed variant
- `p32_2_3-linkedin-like` - LinkedIn-style professional variant
- `p32_2_5-instagram-stories` - Instagram Stories ephemeral variant
- `worktree-2` - [describe contents]
- `worktree-5` - [describe contents]
- `worktree-7` - [describe contents]

## How to View

```bash
# Checkout and run
git checkout p32_2_2_twitter
npm run dev
# Browse to http://localhost:5001

# Return to main
git checkout main
```

## How to Compare

```bash
# Create temporary worktree
git worktree add ../view-twitter p32_2_2_twitter
cd ../view-twitter
npm run dev
# Browse to http://localhost:5100

# When done
git worktree remove ../view-twitter
```
```

---

## Commands to Run (Copy-Paste)

### Check Status of All Worktrees

```bash
echo "=== Tree 1 (converged) ===" && cd /Users/slavochek/Documents/claritypledge-1 && git status && \
echo "=== Tree 2 ===" && cd /Users/slavochek/Documents/claritypledge-2 && git status && \
echo "=== Tree 3 (twitter) ===" && cd /Users/slavochek/Documents/claritypledge-3 && git status && \
echo "=== Tree 4 (linkedin) ===" && cd /Users/slavochek/Documents/claritypledge-4 && git status && \
echo "=== Tree 5 ===" && cd /Users/slavochek/Documents/claritypledge-5 && git status && \
echo "=== Tree 6 (stories) ===" && cd /Users/slavochek/Documents/claritypledge-6 && git status && \
echo "=== Tree 7 ===" && cd /Users/slavochek/Documents/claritypledge-7 && git status
```

### Commit All (After Manual Review)

```bash
# Run these AFTER you review each tree's changes
cd /Users/slavochek/Documents/claritypledge-1 && git add . && git commit -m "Snapshot: P32.3 converged prototype" && git push origin p32-3-converged-prototype
cd /Users/slavochek/Documents/claritypledge-2 && git add . && git commit -m "Snapshot: worktree-2" && git push origin worktree-2
cd /Users/slavochek/Documents/claritypledge-3 && git add . && git commit -m "Snapshot: Twitter variant" && git push origin p32_2_2_twitter
cd /Users/slavochek/Documents/claritypledge-4 && git add . && git commit -m "Snapshot: LinkedIn variant" && git push origin p32_2_3-linkedin-like
cd /Users/slavochek/Documents/claritypledge-5 && git add . && git commit -m "Snapshot: worktree-5" && git push origin worktree-5
cd /Users/slavochek/Documents/claritypledge-6 && git add . && git commit -m "Snapshot: Instagram Stories variant" && git push origin p32_2_5-instagram-stories
cd /Users/slavochek/Documents/claritypledge-7 && git add . && git commit -m "Snapshot: worktree-7" && git push origin worktree-7
```

### Remove All Worktrees

```bash
cd /Users/slavochek/Documents/polymet-clarity-pledge-app && \
git worktree remove /Users/slavochek/Documents/claritypledge-1 --force && \
git worktree remove /Users/slavochek/Documents/claritypledge-2 --force && \
git worktree remove /Users/slavochek/Documents/claritypledge-3 --force && \
git worktree remove /Users/slavochek/Documents/claritypledge-4 --force && \
git worktree remove /Users/slavochek/Documents/claritypledge-5 --force && \
git worktree remove /Users/slavochek/Documents/claritypledge-6 --force && \
git worktree remove /Users/slavochek/Documents/claritypledge-7 --force && \
git worktree list
```

---

## Next Steps

1. **Run status check** to see what's uncommitted
2. **Review changes** in each tree
3. **Commit + push** all work
4. **Remove worktrees** locally
5. **Verify** branches are pushed: `git branch -r | grep p32`
6. **Document** in `docs/prototypes-archive.md`

---

*Generated: 2026-01-06*
*Purpose: Consolidate worktrees while preserving all prototype work*
