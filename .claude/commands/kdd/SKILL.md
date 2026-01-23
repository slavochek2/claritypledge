---
name: kdd
description: Record decisions to docs/decisions.md. Run manually after finishing features with interesting trade-offs, when making architectural choices worth remembering, or when confusion about past decisions signals one should have been recorded.
---

# Knowledge-Driven Development (KDD)

Capture knowledge that matters. Git tracks *what* changed; this captures *why* and keeps docs current.

## Scope

This skill manages two categories of documentation:

### Strategic Docs (the "why")

| Doc | What goes there | Update when... |
|-----|-----------------|----------------|
| `docs/DECISIONS.md` | Technical/product trade-offs | You chose X over Y for a reason |
| `docs/hypotheses.md` | What we're testing, validation status | Hypothesis validated, invalidated, or added |
| `docs/roadmap.md` | Build phases, current focus | Phase complete, priorities shift |
| `docs/lean-canvas.md` | Business model, customer segments | Business model changes |

### Technical Docs (the "how")

| Doc | What goes there | Update when... |
|-----|-----------------|----------------|
| `docs/technical/database.md` | Schema, RLS, data model | Schema changes implemented |
| `docs/technical/authentication.md` | Auth flows, session handling | Auth patterns change |
| `docs/technical/e2e-testing.md` | Test patterns, helpers | Testing approach evolves |
| `docs/domain-model.md` | Core concepts (Stories, Points, etc.) | Domain model changes |

**Don't update via /kdd:**
- Philosophy/vision docs (`docs/visions/`) — rarely change
- Feature specs (`features/`) — managed separately

## Workflow

1. **Review recent work:**
   ```bash
   git log --oneline -10
   ```

2. **Analyze and classify** — what type of knowledge was created?
   - Decision made? → `DECISIONS.md`
   - Hypothesis validated/added? → `hypotheses.md`
   - Phase complete / focus shifted? → `roadmap.md`
   - Business model changed? → `lean-canvas.md`
   - Schema/auth/testing changed? → relevant technical doc
   - Domain concepts changed? → `domain-model.md`

3. **Propose updates** — state what you'll update and why, then proceed.
   - If no updates needed: "No knowledge updates needed" and skip to step 5
   - Don't ask repeatedly for confirmation — be decisive

4. **Update docs** using appropriate format:

   **For DECISIONS.md** (append at TOP, after header):
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
- **DECISIONS.md is append-only** — never edit old entries
- **Technical docs are living** — update to match current reality
- **One commit can touch multiple docs** — that's fine
- If user says skip, acknowledge and exit
