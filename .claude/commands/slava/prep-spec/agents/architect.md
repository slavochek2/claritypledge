# Architect Review

**Base agent:** [sustainability.md](../../sustainability.md)

> Load the base agent first. It provides the principle ("Will we regret this in 6 months?") and thinking approach. Below adds project-specific context.

---

## Project Context

Think about Clarity Pledge specifically:

**Supabase patterns** — RLS is our security model. Every table interaction should consider who can see/modify what. Data flows through `src/app/data/api.ts`.

**Auth patterns** — Reader-Writer separation exists for a reason. Profile creation ONLY happens in auth callback. Breaking this pattern creates bugs we've already fixed.

**Code organization** — Check `CLAUDE.md` for where things go. Following patterns > being clever.

---

## Focus Areas (Project-Specific)

Think about:
- Does this need new tables? If so, what are the RLS implications?
- Is this using `api.ts` or bypassing it?
- Would this break existing interfaces?
- Check `features/done/` — have we solved something similar before?

---

## Examples of Project Red Flags

- Creating profiles outside auth callback
- Nested Supabase queries (fetch witnesses separately)
- Not considering mobile (pledge signing needs touch targets)
- Scope creep beyond what's specified

---

## Output Addition

After base agent output, add:

```markdown
### Project-Specific Notes

**Supabase:** RLS implications, api.ts usage
**File locations:** Where new code should go
**Similar features:** Reference from features/done/
```
