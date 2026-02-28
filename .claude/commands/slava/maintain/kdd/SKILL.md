---
name: kdd
description: Record decisions + meta-reflection. Run after features with trade-offs, architectural choices, or any session worth learning from. Captures what was built (why) and surfaces session friction as chat output only — no file logging.
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
| Test patterns, helpers | `docs/technical/e2e-testing-guide.md` |

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
   - `[product]` — strategy, positioning, business model, UX model, customer definition → read by `/create-prd`, `/ux`, `/spec-review`
   - `[technical]` — schema, code patterns, data model, infrastructure, service design → read by `/architect`, `/review-all`, `/spec-review`
   - `[process]` — workflows, skills, dev tooling, testing, agent setup → no active skill filters this tag; serves as human-readable context in `/day-end` and `/weekly` when they scan decisions.md

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

4.5. **Update done-features index:**

   After any feature is closed (moved to `features/done/`), append it to `features/done/INDEX.md`.

   Find the right domain section and add one line:
   ```
   - **P{N}** ({Mon YY}) {Title} — {≤15-word learning: gotcha, pattern, or key decision}
   ```

   **Domain sections** (add new ones if needed):
   - Live Session / Real-time
   - Points & Stories
   - Database / RLS / Migrations
   - Navigation & Routing
   - UI / Design System
   - Auth & Verification
   - Infrastructure / Process

   **What makes a good learning:** A gotcha ("DROP CONSTRAINT before ALTER COLUMN TYPE"), a pattern ("use atomic transaction, not sequential calls"), or a decision ("positions use optimistic updates, not refetch"). Not a summary of what was built.

   **Update the `Last updated:` date** at the top of the file.

   **Skip if:** No features were closed this session (running `/kdd` standalone on infra/docs work with no spec to close).

5. **Feature housekeeping:**

   **Skip if running after `/dev` or `/fix`** — those auto-close features already. This step only applies when running `/kdd` standalone after work done outside the standard flow (e.g., direct code edits, infra changes, manual migrations).

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

5.25. **Privacy gate — if source was claude-conversations:**

   If any doc updates in this session were synthesized from personal claude.ai conversations (not code sessions), run `/maintain:privacy` before committing. claude-conversations contain personal context (named individuals, relationship details, personal struggles) that must not land in public docs.

   Signal: session involved reading files from `~/projects/private/claude-conversations/` or the user mentioned a conversation by name.

5.5. **Session wrap checklist:**

   Run in parallel:
   ```bash
   git status --short          # uncommitted changes?
   python3 scripts/fix-frontmatter.py --dry-run 2>/dev/null | head -5   # frontmatter drift?
   curl -s "http://localhost:9050/api/features?refresh=true" > /dev/null  # refresh kanban
   ```

   Report:
   - If uncommitted changes exist: list them. Ask: "Commit now or leave for next session?"
   - If frontmatter drift detected: mention it. Offer to run `fix-kanban`.
   - Confirm: "Kanban refreshed."

6. **Meta-reflection** — output to chat only (no file logging):

   **6.1 Extract problems (subagent):**

   Spawn a `general-purpose` subagent with the full conversation context and this task:
   > "Read this conversation. Extract problems, friction points, mistakes, and inefficiencies. Consolidate near-identical incidents into one item. Cap at 10 items max. Exclude routine tool calls and confirmations — only report things a human would call a mistake or waste. For each item identify: (1) what happened, (2) category: wrong-assumption / unnecessary-question / repeated-step / missed-signal / scope-creep / tool-fumble / missing-context / process-gap, (3) severity: minor / moderate / significant. Return a structured list only — no solutions yet."

   **6.2 Triage each extracted problem:**

   If subagent finds no problems — output "Clean session." and stop.

   If subagent returns more than 6 items, filter to the 3–4 highest-severity ones before triaging.

   Triage paths:
   - **Trivial / obvious fix**: single clear action, no real trade-off → apply now, report as: `- [What happened] → [action taken]`
   - **Requires decision**: multiple legitimate options with real trade-offs → generate a `/simplify` block (see 6.3)
   - **No obvious fix, worth tracking**: problem is understood but no action is clear yet → append to `docs/process-learnings.md` as `Status: proposed` (feeds `/weekly` step 2.5)

   Present all decision blocks in a single numbered message, then apply trivial fixes.

   **6.3 `/simplify` block format for decisions:**

   ```
   **Situation:** [1 sentence — what friction occurred]

   **Options:**
   A) [option] — [tradeoff] | mechanical: yes/no
   B) [option] — [tradeoff] | mechanical: yes/no
   C) [option] — [tradeoff] | mechanical: yes/no   ← only if a genuine third path exists

   **Recommendation:** [Option X] — prevents this by [mechanism]. Main risk: [Y].

   Reply: "A", "B", or "C"
   ```

   *mechanical = prevents the problem automatically without future discipline. Prefer mechanical solutions. Use 3 options only when a genuine middle path exists — don't invent one to fill the format.*

   End with: "Reply with choices, e.g. 1=A, 2=B."

   If it requires `/claude-md` gate or user judgement: flag as a block, don't act unilaterally.

   **process-learnings graduation rule:** When a `Status: proposed` item gets resolved (fix applied, decision made): (1) delete it from process-learnings.md, (2) add a `[process]` entry to decisions.md. Never leave `Status: done` entries — done = graduated. An empty file is healthy.

## Rules

- **Be decisive** — analyze and propose, don't repeatedly ask
- **decisions.md is append-only** — never edit old entries
- **Technical docs are living** — update to match current reality
- **One commit can touch multiple docs** — that's fine
- If user says skip, acknowledge and exit
