---
name: kdd
description: Record decisions to docs/decisions.md. Run manually after finishing features with interesting trade-offs, when making architectural choices worth remembering, or when confusion about past decisions signals one should have been recorded.
---

# Knowledge-Driven Development (KDD)

Capture decisions that matter. Git tracks *what* changed; this captures *why*.

## Scope

Record decisions that **affect code, architecture, or product behavior**:
- Technical choices (libraries, patterns, data models)
- Product decisions (UI scales, user flows, feature scoping)
- Architecture (auth patterns, data structures, API design)

**Don't record:**
- Philosophy or vision (that belongs in `docs/visions/`)
- Hypotheses to test (that belongs in `docs/hypotheses.md`)
- Feature planning (that belongs in `features/`)

**Rule of thumb:** If the decision affects what gets built or how, record it. If it's about *why we believe something*, it belongs in vision docs.

## Workflow

1. Show recent commits on current branch:
   ```bash
   git log --oneline -10
   ```

2. **Analyze and propose** (don't just ask):
   - Review commits and identify architectural/product decisions
   - If decisions found: state what you'll record and why, then proceed (or ask once if genuinely ambiguous)
   - If no decisions: say "No significant decisions to record" and move to step 5
   - Don't repeatedly ask for confirmation - be decisive

3. Append to `docs/decisions.md` using this format:

```markdown
## YYYY-MM-DD: Decision Title

**Context:** Why this came up
**Decision:** What we chose
**Alternatives rejected:** What we didn't choose
**Consequences:** What this means going forward
**References:** [filename.md](path/to/file.md) | [another.md](path/to/another.md#section)
```

Use markdown links with relative paths from repo root. Link to specific sections with `#anchor` when relevant.

4. Confirm: "Appended to docs/decisions.md"

5. **Feature file housekeeping:** Check if any feature docs in `features/` are now complete:
   ```bash
   ls features/*.md
   ```

   Assess which features are complete based on the commits/work just done. If any are complete:
   - State which file(s) you're moving and why
   - Move them (use `mv` if untracked, `git mv` if tracked):
     ```bash
     mv features/pNN_feature.md features/done/
     ```

   If none are complete, skip silently.

## Rules

- **Be decisive** - analyze and propose, don't repeatedly ask for permission
- Append at TOP of file (after the header section, before existing entries)
- Never edit old entries - append-only
- If user says skip, acknowledge and exit
- Keep entries concise but complete
