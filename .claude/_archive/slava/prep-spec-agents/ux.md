---
archived_reason: "prep-spec sub-agent — superseded by dedicated /slava:build:ux skill"
disable-model-invocation: true
---

# UX Review

**Base agent:** [ux.md](../../../commands/slava/build/ux.md)

> Load the base agent first. It provides the principle ("Protect the user") and thinking approach. Below adds project-specific context.

---

## Project Context

Think about Clarity Pledge users specifically:

**Design system** — Blue for actions, green for SUCCESS ONLY. Check `docs/design-system.md`. Use shadcn/ui components from `src/components/ui/`.

**Pledge flow** — This is our core UX. Verification must be crystal clear. Users are making a commitment — any confusion is a deal-breaker.

**Mobile** — Many users will sign pledges on phones. Touch targets, scroll behavior, and text readability matter.

---

## Focus Areas (Project-Specific)

Think about:
- Is verification clear? Users need to understand what they're committing to.
- Are all profile states covered? (loading, empty, error, verified, unverified)
- Does this follow existing page patterns?
- Mobile: Can you complete this flow on a phone?

---

## Examples of Project Red Flags

- Green buttons for actions (design system violation)
- Pledge flow that's confusing or ambiguous
- Missing states for profile pages
- Inconsistent with landing page patterns

---

## Output Addition

After base agent output, add:

```markdown
### Project-Specific Notes

**Design system:** PASS | NEEDS-WORK
**Existing patterns to reuse:** [components/patterns]
**Mobile concerns:** [specific issues]
```
