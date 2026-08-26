---
name: polish
description: Post-critique visual fix loop — takes a punch list, makes design decisions, implements fixes to existing components, and verifies each one in the browser before moving on.
when_to_use: After /critique-ux produces a punch list. NOT for new surfaces (route those through /ux + /verify; /view is retired from routing as of 2026-08-20 and runs only on explicit request) and NOT for redesigns that touch shared components or page structure (use /change-request).
version: 0.1.0
---

# /polish

**Close the /critique-ux loop.** Takes a punch list, fixes visual issues on existing shipped UI, verifies each fix in the browser. Decisions are recorded before code is touched. Each item is an atomic commit — rollback is clean.

```
/critique-ux → /polish pN → done
```

**Announce at start:** "I'm using the /polish skill to fix visual issues from the critique of [feature]."

---

## Scope

✅ **Use /polish for:**
- Fixing visual issues found by `/critique-ux` on already-shipped UI
- Items where the fix touches only the feature's own components (not shared)
- Blocker and major severity items (minor/polish require `--include-minor`)

❌ **Do NOT use /polish for:**
- Components used outside this feature's route tree (e.g. `JourneyToUnderstanding`, `RatingDots`) → `/change-request`
- Page layout / structural changes → `/change-request`
- New visual surfaces → `/ux` (only if a design decision is still open) + `/verify`.
  **Not `/view`** — retired from routing 2026-08-20 (zero runs in four months); it still runs on
  explicit request. See `docs/decisions.md` 2026-08-20.
- Net-new behavior or features → `/create-spec`
- Items with no punch list input — `/polish` always requires a punch list

---

## Invocation

```bash
/polish p699                    # Reads punch list from /critique-ux output in features/p699*.md
/polish p699 --include-minor    # Also fixes minor/polish items
```

Punch list source: the skill reads the critique output written to the spec (or UAT file) by `/critique-ux`. If no critique output exists in the spec, stop: "Run /critique-ux first."

---

## Workflow

### Step 1 — Load and Filter Punch List

Read the `## Punch List` section in `features/p{N}*.md`. If `/critique-ux` wrote to `features/uat/p{N}.md` instead, read there. If both exist, use the newer file (check mtime) and announce which one was used.

Each item must have a `severity:` label (blocker/major/minor/polish) and a `where:` field. If items lack these fields: **STOP** — "Punch list items are missing structured fields. Re-run /critique-ux to emit a conforming list."

Filter:
- Default: blocker + major only
- With `--include-minor`: all items

For each item, record: severity, where, observed, spec reference (if any).

---

### Step 2 — Scope Check (per item)

Before touching any item, check:

**A. Shared component check**
Grep for the component(s) the item touches across `src/`. The question is not count — it's ownership:
- If any usage is **outside this feature's route tree** (i.e., not under the same page/route prefix) → **STOP on this item**: "This item touches `{Component}` which is also used in {other routes}. Fixing it here risks cross-feature regressions. Route to /change-request. Skipping — continuing with other items."
- If all usages are within this feature's own routes → proceed

**B. Layout/structure check**
If the fix would require changing page layout, container hierarchy, or grid — **STOP on this item**: "This item requires structural changes. Route to /change-request. Skipping."

Produce a pre-flight list before any implementation:
```
Pre-flight:
✅ Item 1 (Story counter bug) — scope OK, 1 file
✅ Item 2 (Back to Letters primary) — scope OK, 1 file  
⛔ Item 3 (GapBanner on pending) — touches GapBanner used in 5 routes → route to /change-request
✅ Item 4 (Story 2 not expanded) — scope OK, 1 file

Proceed with items 1, 2, 4. Route item 3 to /change-request. Confirm?
```

Wait for confirmation before any code or screenshots.

---

### Step 3 — Design Decision Gate (per item)

For each approved item:

**A. Spec-answerable check**
Search the feature spec for the explicit design intent that answers this item.
- Found → quote the exact line: `"Spec (§UX Design, line 80): 'Back to Letters link' — implementing as link"`
- Mark as `spec-answered`, skip to Step 4

**B. Spec-silent → ask the founder directly**
```
Item [N]: [title]
Observed: [what the critic saw]

The spec doesn't answer this. What should it look like?
(Or type "skip" to defer this item, "change-request" to file a redesign spec)
```
No inferred A/B/C options — the founder describes the intent, the skill implements it.

Record every decision as a `## Visual Fix Decisions` section appended to the **body** of `features/p{N}*.md`, immediately after `## Punch List` (not in YAML frontmatter), before any code is written:
```markdown
## Visual Fix Decisions
- Item 2: "Back to Letters" → render as plain text link (`<a>` via `Link` component), no button styling. Decision: founder, 2026-04-14.
```

**Do not write any code until ALL items in scope have either a spec-answer or a recorded decision.**

---

### Step 4 — Authenticate

Establish the browser session once. Reuse it for all per-item loops (Steps 5–8).

Auth pattern (explicit):
```javascript
// Refresh session via Supabase REST (same as /verify and /critique-ux)
const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
  method: 'POST',
  headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ refresh_token: REFRESH_TOKEN }),
});
// Inject access_token into localStorage before navigation
await page.addInitScript(({ key, val }) => localStorage.setItem(key, val), { key: AUTH_KEY, val: AUTH_VAL });
```

Credentials: read from `.env.local` or `.env.test.local` (same worktree env as dev server). Keep the session open for the full run.

---

### Step 5 — Per-Item Fix Loop (screenshot → implement → verify → approve)

Repeat this loop for each approved item, one at a time. Do not start item N+1 until item N is approved or reverted.

**5a. Screenshot before state**
Navigate to the relevant route at the item's described state. Screenshot at desktop 1280 + mobile 375 (or viewport-specific if the item only applies to one).
Save to: `~/Screenshots/{YYYY-MM-DD}/polish-{feature}/{item-N}-before-{viewport}.png`
For items spanning multiple routes: screenshot each route, label separately.

**5b. Implement**
- Read the relevant source file(s)
- Apply the minimal change that satisfies the recorded decision
- No new components, no new Tailwind tokens, no layout changes
- If a prop doesn't exist on a component: STOP and ask — do not invent props

**5c. Build gate**
`npm run build` — if it fails, fix the type error, re-run once. If still failing: stop and report. Do not proceed.

**5d. E2E selector check**
Diff the changed files for removed or renamed `data-testid`, `aria-label`, role attributes, or stable visible text strings. For each one removed or changed, grep `e2e/` for the exact string. List any hits with `file:line`. Do not silently update tests; do not silently leave them broken — flag each hit to the founder.

**5e. Commit**
```bash
git add {explicit file paths} && git commit -m "polish(p{N}): {item title}"
```
- One commit per item — rollback is `git revert {hash}`, not `git reset --hard`
- Never batch multiple items in one commit

**5f. Screenshot after state**
Reload the same route at the same state. Screenshot at same viewports.
Save to: `~/Screenshots/{YYYY-MM-DD}/polish-{feature}/{item-N}-after-{viewport}.png`

---

### Step 6 — Blind Visual QA (per item)

Spawn a separate subagent (`model: "sonnet"`) with ONLY the before/after screenshots + the visual-qa checklist. Do NOT pass the code diff or decision to the subagent. The subagent's job is to find problems, not confirm quality.

Subagent prompt shape:
```
You are a visual QA reviewer. You have two screenshots of the same UI state: before a fix and after.
Before: [path]
After: [path]
Claimed fix: [item title — no implementation details]

Visual QA Checklist:
[inline content of .claude/rules/visual-qa.md]

Answer: Is the claimed issue visually resolved in the "after" screenshot?
Also: Did the fix introduce any new visual issues? Run the full checklist on the "after" screenshot.
Output: RESOLVED / NOT RESOLVED / NEW ISSUE FOUND — with specific observations.
```

If subagent says NOT RESOLVED or NEW ISSUE FOUND:
- Diagnose the root cause
- Patch and re-commit (this is attempt 2 — original implementation was attempt 1)
- Re-run blind QA subagent
- If still failing after attempt 2: **stop, report, mark as Failed** — do not present for founder approval

---

### Step 7 — Founder Approval Gate (per item)

Present before/after pair + QA verdict:

```
Item [N]: [title]
Before: ~/Screenshots/.../item-N-before.png
After:  ~/Screenshots/.../item-N-after.png
QA verdict: RESOLVED (blind subagent confirmed)
Decision applied: [recorded decision text]
Commit: abc1234

✅ Approve / ❌ Revert (git revert abc1234) / ⚠️ Needs adjustment (describe)
```

Wait for explicit per-item response. If "revert": `git revert {hash} --no-edit`. If "needs adjustment": take instruction, patch, re-run Steps 5–8 for this item.

---

### Step 8 — Output Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/polish: p{N} — [feature name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fixed:   [N items] — commits: [hash list]
Skipped: [items routed to /change-request]
Failed:  [items that didn't resolve after 2 attempts]
Reverted: [items founder rejected]

E2E selectors to update: [list, or none]
Screenshots: ~/Screenshots/{date}/polish-{feature}/

Next: /change-request for skipped items (if any)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## What `/polish` Does NOT Own

- Does NOT update E2E tests (flags them, defers to founder)
- Does NOT redesign layout or shared components
- Does NOT write new components
- Does NOT touch `pipeline_ran` in spec frontmatter (post-pipeline operation)
- Does NOT merge to main — leaves commits on the feature branch; `/ship` handles merge

---

## Related Skills

- `/critique-ux` — produces the punch list that feeds this skill
- `/view` — for new visual surfaces pre-build (different job)
- `/change-request` — for items routed out of scope by Step 2
- `/verify` — for post-ship smoke testing (narrower: confirms one thing works, not a fix loop)
- `/fix` — for pure code bugs with no visual decision component
