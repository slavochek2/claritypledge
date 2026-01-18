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

2. Ask: "Any decisions worth recording? [Enter to skip]"

3. If user provides context, append to `docs/decisions.md` using this format:

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

   For each feature file, briefly assess:
   - Is the feature fully implemented and shipped?
   - Are there remaining TODOs or future phases?

   Ask: "Any completed features to move to `features/done/`? [List files or Enter to skip]"

   If user confirms, move the file(s):
   ```bash
   git mv features/pNN_feature.md features/done/
   ```

## Rules

- Append at TOP of file (after the header section, before existing entries)
- Never edit old entries - append-only
- If user skips, just acknowledge and exit
- Keep entries concise but complete
