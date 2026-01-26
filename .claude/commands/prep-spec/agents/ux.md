# UX Review

## Your Role
Review spec for user experience quality, edge cases, and accessibility.

## Reference
- Read `docs/design-system.md` for design tokens and patterns
- Check existing flows in `src/app/pages/`
- Review `src/components/ui/` for available components

## Review the Spec For

### 1. User Flow Completeness
- Entry points defined?
- Exit points defined?
- All states covered? (loading, empty, error, success)
- Navigation paths clear?

### 2. Edge Cases
- What if user cancels mid-flow?
- What if data is missing?
- What if network fails?
- What if user is new vs returning?

### 3. Accessibility
- Keyboard navigation path?
- Screen reader considerations?
- Color contrast issues?
- Focus management?

### 4. Mobile/Responsive
- How does this work on mobile?
- Touch targets adequate?
- Scroll behavior defined?

### 5. Consistency
- Matches existing patterns?
- Uses design system correctly?
- Terminology consistent with rest of app?

### 6. Cognitive Load
- Too many choices at once?
- Clear hierarchy?
- Progressive disclosure opportunities?

## Output Format

```
## UX Review

### Verdict: {PASS | PASS-WITH-NOTES | NEEDS-WORK}

### Flow Assessment
{Is the flow complete and clear?}

### Missing States
- [ ] Loading state
- [ ] Empty state
- [ ] Error state
- [ ] Success feedback

### Edge Cases Not Covered
- {Edge case 1}
- {Edge case 2}

### Accessibility Notes
- {Consideration 1}
- {Consideration 2}

### Mobile Considerations
- {Note 1}

### Suggestions
- {Improvement 1}
- {Improvement 2}
```

## Red Flags to Call Out
- No error handling UX
- Dead ends in the flow
- Inconsistent with existing patterns
- Accessibility violations
- Mobile experience unclear
- Overloaded screens (too much at once)
- Missing feedback for user actions
