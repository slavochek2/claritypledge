---
name: critique-ux
description: Blind UX/UI critique of a shipped or in-progress feature — spawns a subagent with only screenshots + visual spec, returns a ranked punch list that feeds /create-spec or /change-request.
when_to_use: When a feature is implemented but "feels off" and you want structured improvement opportunities without micromanaging details yourself.
version: 1.0.0
---

# /critique-ux

Structured, bias-free UX/UI critique. Produces a ranked punch list — never implements.

> **Principle:** The agent that built it cannot fairly grade it. Critique must be blind to code and intent.

## Usage

```bash
/critique-ux p699              # Critique feature P699
/critique-ux /live             # Critique a route
/critique-ux "story-walk"      # Critique a component/flow by name
```

---

## Workflow

### Step 1: Scope the Critique

Confirm with the user in one line:
```
Critiquing: [feature / route / component]
States to capture: [entry, mid-flow, result, empty, long-text, error]
Breakpoints: [mobile 375, tablet 768, desktop 1280]
Any specific concerns? (optional — will be passed to critic alongside checklist)
```

Wait for confirmation or overrides. User concerns go in as *additional* inputs, not substitutes for the blind pass.

---

### Step 2: Capture Screenshots

For each state × breakpoint:
1. Navigate to the state (may require seeding data — state what's needed if blocked)
2. Take screenshot via Claude in Chrome (fallback: Chrome DevTools MCP)
3. Save to `~/Screenshots/critique-ux-{feature}-{state}-{bp}.png`

Record path + state + breakpoint in a table. If a state cannot be reached (auth, data, feature flag), disclose what was captured vs. skipped — do not fabricate.

---

### Step 3: Gather Reference Material

Collect — but do NOT interpret:
- Visual spec from `features/` if one exists (search `features/p{N}*.md` and `features/done/**/p{N}*.md`)
- Relevant snippets from `docs/technical/` design references, if any
- The visual-qa checklist from `.claude/rules/visual-qa.md`

Read these yourself — you'll pass the content inline to the subagent (these are small; inline them so the agent cannot mis-locate them. Subagents *can* read from disk — this is a size choice, not a capability limit).

---

### Step 4: Spawn Blind Critic Subagent

Use the Agent tool, `subagent_type: general-purpose`, `model: "sonnet"`. Prompt shape:

```
You are a senior UX/UI critic reviewing a shipped feature. You do NOT have access to the code or the implementation intent — only screenshots and the product's visual spec. Your job is to find problems, not confirm quality.

FEATURE: [name]
SCREENSHOTS: [list of absolute paths with state + breakpoint labels]
VISUAL SPEC (inlined): [content]
VISUAL QA CHECKLIST (inlined): [content of .claude/rules/visual-qa.md]
USER CONCERNS (optional, do not over-weight): [if provided]

For each screenshot, run the checklist. Then step back and assess:
1. Hierarchy — does the eye land on the primary action first?
2. Density — does spacing match the cognitive task?
3. Sibling weight — do same-level elements carry equal visual weight?
4. Narrative — across the flow, does each step pull the user forward, or do some feel like dead weight?
5. Alignment — optical centering, baseline grids, gutter consistency
6. Interaction affordance — what looks clickable vs. what actually is

Output format (strict):

## Punch List

Each item:
### [N]. [Short title]
- **Severity:** blocker | major | minor | polish
- **Where:** [screenshot ref + region]
- **Observed:** [literal — what's visible]
- **Why it matters:** [user impact, 1 sentence]
- **Confidence:** high | medium | low

Rank by severity, then by user impact within severity. Do NOT propose fixes — only describe problems. If you see no blockers, say so explicitly.

End with: "States NOT reviewed: [list, or 'none']."
```

---

### Step 5: Triage with User

Present the punch list unedited. Then ask:
```
Which items do you want to act on?

Routing:
- Visual fix on shipped UI (spec-answered or needs a decision) → /slava:build:polish p{N}
- Redesign that touches shared components or page structure → /slava:build:change-request p{N}
- Net-new improvement → /slava:build:create-spec
- Bug (broken, not just ugly) → /slava:build:create-bug

I will not implement anything from this skill. Pick items and skills will take over.
```

---

## Anti-Patterns

- **Do not** pass the code diff or implementation plan to the critic — defeats the blind-pass purpose
- **Do not** let the critic propose fixes — that role belongs to `/create-spec` / `/change-request`
- **Do not** filter the punch list before showing the user — even "minor" items may reveal a pattern
- **Do not** re-run the critic after the user disagrees with an item — the user's judgment is final on triage; the critic's job is done

---

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UX Critique: [feature]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Captured: [N] screenshots across [M] states × [K] breakpoints
Skipped: [list, or none]

[Punch list from subagent — verbatim]

Triage?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Related

- `/slava:build:polish` — implements the punch list: per-item decisions, atomic commits, blind QA, approval gate
- `/slava:build:create-spec` — for net-new improvements
- `/slava:build:change-request` — for redesigns that touch shared components or page structure
- `/slava:build:verify` — visual QA on a specific fix (different job: this skill finds issues, `/verify` confirms one is resolved)
- `.claude/rules/visual-qa.md` — checklist used by the critic
