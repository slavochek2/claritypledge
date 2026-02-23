---
name: kdd
description: Record decisions + meta-reflection. Run after features with trade-offs, architectural choices, or any session worth learning from. Captures what was built (why) and how the session went (process friction → process-learnings.md).
---

# Knowledge-Driven Development (KDD)

Capture knowledge that matters. Git tracks *what* changed; this captures *why* and keeps docs current.

## Doc Architecture

**Source of truth docs** (concepts live here, one place only):

| Knowledge type | Goes in |
|----------------|---------|
| Concepts (Stories, Points, Verification, etc.) | `docs/definitions.md` |
| Problem/solution/business model | `docs/lean-canvas.md` |
| What we're testing + evidence base | `docs/hypotheses.md` |
| Open questions (unresolved) | `docs/hypotheses.md` "Open Questions" section |
| Build sequence, priorities, trade-offs | `docs/decisions.md` |
| GTM, sales tactics, pitches | `features/p{N}_sales_playbook.md` |
| Pivot options | `docs/lean-canvas.md` "Alternative Approaches" section |
| Epistemology (WHY this works) | `docs/philosophy.md` |
| Cascade, √N, network effects | `docs/theory-of-change.md` |
| Service layer, component patterns | `docs/technical/architecture.md` |
| Schema, RLS, data model | `docs/technical/database.md` |
| Auth flows, session handling | `docs/technical/authentication.md` |
| Test patterns, helpers | `docs/technical/e2e-testing.md` |

**Consumer docs** (link only, never duplicate):
- `README.md` — Setup for humans
- `CLAUDE.md` — Instructions for AI

**Don't update via /kdd:**
- Historical explorations (`docs/visions/`) — archived, rarely change
- Feature specs (`features/`) — managed separately

## Feature-level vs Product-level Decisions

**Use /kdd (global docs):**
- Affects multiple features or establishes reusable pattern
- Changes product direction or mental model
- "Future me will wonder why we did this"

**Use feature spec "Decisions Made" section:**
- Only matters within this feature
- Implementation details
- Won't be referenced elsewhere

| Decision | Level | Destination |
|----------|-------|-------------|
| "Sifter-first model" | Product | `/kdd` → decisions.md |
| "Journey position above content" | Feature | feature spec |
| "N:N Story-Point relationship" | Product | `/kdd` → decisions.md |
| "Mock data for prototype" | Feature | feature spec |

---

## Guardrails

1. **Never add concept explanations to README.md or CLAUDE.md** — these are consumer docs that link to source docs
2. **Warn if knowledge would duplicate existing content** — check source docs first
3. **Suggest consolidation when detecting drift** — if same concept appears in multiple places, propose moving to single source

**Example of drift detection:**
```
⚠️ Drift detected: "Stories vs Points" explained in:
  - docs/definitions.md (source)
  - README.md lines 15-20 (duplicate)

Recommendation: Remove from README.md, link to definitions.md instead.
```

## Workflow

1. **Review recent work:**
   ```bash
   git log --oneline -10
   ```

2. **Analyze and classify** — what type of knowledge was created?
   - Decision made? → `decisions.md`
   - Hypothesis validated/added? → `hypotheses.md`
   - New open question surfaced? → `hypotheses.md` "Open Questions" section
   - Open question answered? → Update or remove from Open Questions
   - Phase complete / focus shifted? → `decisions.md`
   - Business model changed? → `lean-canvas.md`
   - GTM/sales approach changed? → `features/p105_sales_playbook.md`
   - Schema/auth/testing changed? → relevant technical doc
   - Domain concepts changed? → `definitions.md`

3. **Propose updates** — state what you'll update and why, then proceed.
   - If no updates needed: "No knowledge updates needed" and skip to step 5
   - Don't ask repeatedly for confirmation — be decisive

4. **Update docs** using appropriate format:

   **For decisions.md** (append at TOP, after header):
   ```markdown
   ## YYYY-MM-DD [tag]: Decision Title

   **Context:** Why this came up
   **Decision:** What we chose
   **Alternatives rejected:** What we didn't choose
   **Consequences:** What this means going forward
   **References:** [file.md](path/to/file.md)
   ```

   **Tag is required.** Pick exactly one:
   - `[product]` — strategy, positioning, business model, UX model, customer definition
   - `[technical]` — schema, code patterns, data model, infrastructure, service design
   - `[process]` — workflows, skills, dev tooling, testing, agent setup

   **Quick classification:** if it affects how users experience the product → `[product]`. If it affects how the code is structured → `[technical]`. If it affects how the team/agents work → `[process]`.

   **For hypotheses.md:**
   - Change status emoji (⏳ → 🔄 → ✅)
   - Add validation notes
   - Add new hypotheses if discovered
   - Add/update Open Questions section when unresolved questions surface
   - Remove/update Open Questions when answered

   **For technical docs:**
   - Keep them accurate to current implementation
   - These are Claude's context shortcuts — save future re-reading

5. **Feature housekeeping:**
   ```bash
   ls features/*.md
   ```
   If any features are complete based on the work done, update frontmatter before moving:
   ```yaml
   status: done
   completed_at: '{today YYYY-MM-DD}'
   ```
   Then move:
   ```bash
   git mv features/pNN_feature.md features/done/
   ```
   **Do NOT skip `completed_at`** — kanban "Done Today" column filters on this field.

6. **Meta-reflection** — review how the session went:

   Scan the conversation for friction signals and turn them into actionable improvements.

   **Three precise signals to look for (most diagnostic):**
   - AI expressed uncertainty mid-task → the rule/context under-specifies something
   - AI diagnosed its own error in-session → that diagnosis IS the improved instruction
   - AI suggested a different approach mid-task → missing context in the original brief

   **Additional signals:**
   - Same manual step repeated 2+ times (skill candidate)
   - Same mistake type appeared in 2+ recent sessions (encode it immediately — 2 is enough)
   - A question that came up repeatedly (missing CLAUDE.md rule or doc section)
   - A guardrail that would have prevented a mistake

   **For each finding, classify and act:**

   | Signal | Action |
   |--------|--------|
   | Repeated manual steps (2+) | Propose a new skill → user runs `/skill-creator` |
   | Missing CLAUDE.md rule | Rewrite the specific rule → user runs `/claude-md "..."` |
   | Architecture confusion | Update relevant `docs/technical/*.md` |
   | Process decision worth recording | Add to `decisions.md` with `[process]` tag |
   | Agent pattern worth encoding | Propose as skill or CLAUDE.md addition |

   **Required format — before/after, not open-ended proposals:**
   ```
   🔴 Friction: [what happened]
   Root cause: [why]
   Before: [the current rule/prompt/instruction that failed, or "none"]
   After: [the rewritten version — a specific sentence, not a vague idea]
   Action: skill | claude-md | doc update | decisions.md
   ```

   **Optional: run `/insights` first** — Claude Code's built-in command surfaces conversation patterns before you do this manually. Run it in a fresh terminal, then use its output as additional input here.

   If no friction detected: "Clean session — no process improvements identified."

   **Don't manufacture findings.** Only report friction that actually occurred.

   **Log all findings to `docs/process-learnings.md`** — append new entries at the top:

   ```markdown
   ## YYYY-MM-DD — [session/feature name]
   **Friction:** [what happened]
   **Root cause:** [why]
   **Before:** [current rule/prompt/instruction, or "none"]
   **After:** [rewritten version]
   **Action:** skill | claude-md | doc update | decisions.md
   **Status:** proposed
   ```

   Change `Status` to `done` once the fix is applied. `/weekly` reviews this log to surface chronic patterns.

## Rules

- **Be decisive** — analyze and propose, don't repeatedly ask
- **decisions.md is append-only** — never edit old entries
- **Technical docs are living** — update to match current reality
- **One commit can touch multiple docs** — that's fine
- If user says skip, acknowledge and exit
