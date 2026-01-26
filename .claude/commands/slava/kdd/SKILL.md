---
name: kdd
description: Record decisions to docs/decisions.md. Run manually after finishing features with interesting trade-offs, when making architectural choices worth remembering, or when confusion about past decisions signals one should have been recorded.
---

# Knowledge-Driven Development (KDD)

Capture knowledge that matters. Git tracks *what* changed; this captures *why* and keeps docs current.

## Doc Architecture

**Source of truth docs** (concepts live here, one place only):

| Knowledge type | Goes in |
|----------------|---------|
| Concepts (Stories, Points, Verification, etc.) | `docs/definitions.md` |
| Problem/solution/business model | `docs/lean-canvas.md` |
| What we're testing | `docs/hypotheses.md` |
| Build sequence, priorities | `docs/roadmap.md` |
| Trade-offs, "why X over Y" | `docs/decisions.md` |
| Epistemology (WHY this works) | `docs/philosophy.md` |
| Cascade, √N, network effects | `docs/theory-of-change.md` |
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
  - docs/roadmap.md lines 8-12 (duplicate)

Recommendation: Remove from README.md and roadmap.md, link to definitions.md instead.
```

## Workflow

1. **Review recent work:**
   ```bash
   git log --oneline -10
   ```

2. **Analyze and classify** — what type of knowledge was created?
   - Decision made? → `decisions.md`
   - Hypothesis validated/added? → `hypotheses.md`
   - Phase complete / focus shifted? → `roadmap.md`
   - Business model changed? → `lean-canvas.md`
   - Schema/auth/testing changed? → relevant technical doc
   - Domain concepts changed? → `definitions.md`

3. **Propose updates** — state what you'll update and why, then proceed.
   - If no updates needed: "No knowledge updates needed" and skip to step 5
   - Don't ask repeatedly for confirmation — be decisive

4. **Update docs** using appropriate format:

   **For decisions.md** (append at TOP, after header):
   ```markdown
   ## YYYY-MM-DD: Decision Title

   **Context:** Why this came up
   **Decision:** What we chose
   **Alternatives rejected:** What we didn't choose
   **Consequences:** What this means going forward
   **References:** [file.md](path/to/file.md)
   ```

   **For hypotheses.md:**
   - Change status emoji (⏳ → 🔄 → ✅)
   - Add validation notes
   - Add new hypotheses if discovered

   **For roadmap.md:**
   - Update "Current Focus" quote block
   - Mark phases ✅ DONE
   - Update "What's done" / "What's next"

   **For technical docs:**
   - Keep them accurate to current implementation
   - These are Claude's context shortcuts — save future re-reading

5. **Feature housekeeping:**
   ```bash
   ls features/*.md
   ```
   If any features are complete based on the work done:
   ```bash
   mv features/pNN_feature.md features/done/
   ```

## Rules

- **Be decisive** — analyze and propose, don't repeatedly ask
- **decisions.md is append-only** — never edit old entries
- **Technical docs are living** — update to match current reality
- **One commit can touch multiple docs** — that's fine
- If user says skip, acknowledge and exit
