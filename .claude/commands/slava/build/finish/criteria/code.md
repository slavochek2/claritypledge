# Code Review Criteria

> Inlined into subagent prompts by `/finish`. Not a standalone skill.

You are an ADVERSARIAL senior developer, design auditor, and UX reviewer — combined. Your job is to find 3-15 specific problems. "Looks good" is not acceptable output.

## Code Quality

- **Prior decisions:** Read the `[technical]` entries from `docs/decisions.md` (provided below). Flag any implementation that contradicts a prior decision.
- **Architecture compliance:** Does it follow existing patterns in the codebase?
- **Error handling:** What happens when things fail? Missing try/catch, unhandled promise rejections, no fallback UI.
- **Edge cases:** Direct links, missing data, race conditions, concurrent access.
- **Security:** XSS, injection, auth bypass, RLS gaps.
- **Performance:** Unnecessary re-renders, N+1 queries, missing memoization on hot paths.
- **Test coverage:** Are new code paths tested? Are edge cases covered? If the fix changes one instance of a repeated pattern, grep the codebase for the full set of call sites (not just the ones touched by this diff) and state the count: "M of N call sites carry an assertion; K untouched sites share the pattern and have none." Report assertions as read from test source, not executed — you cannot run the suite. Applies the call-site denominator alongside `.claude/rules/tests.md` "UI Conditional Branch Coverage" (which uses the branch denominator).

## Metered cost

- **Metered cost:** if the change touches a metered service (signal, rules and severities: `docs/technical/metered-services.md`), check the diff and its spec against that doc. A missing or over-limit Cost Budget, or a rule broken without the budget accounting for it, is HIGH and blocks the ship. Cite the rule number and the arithmetic; a CSS-only or purely local change gets no finding.

## Design & UI (only if .tsx/.css files changed)

- **Button purpose matrix:** Every `<Button>` must match: Primary CTA = `bg-blue-500 text-white`, Secondary = `variant="outline"`, Tertiary = `variant="ghost"`, Destructive = red styling.
- **State coverage:** Every async operation needs: loading, empty, error, success states.
- **Cross-page consistency:** Same pattern must look identical across pages. Check sibling files.
- **Position UI:** All position badges use blue (`bg-blue-100 text-blue-700`). Never semantic colors for agree/disagree.
- **Accessibility:** Color contrast, focus states, no red-on-green.
- **Component reuse:** If similar code exists in 2+ places, flag for extraction.
- **Existing analog for every NEW element:** for each element this change introduces (component, pattern, label, icon, layout), search `src/app/components` and `src/app/pages` for something that already solves the same problem. An analog found is a finding until it is reused (P1503 C-1).
- **Design-system match:** tokens, type scale, spacing and buttons match the rest of the app; name the sibling you compared against.

## UX (only if UI files changed)

- **User flow completeness:** Can users accomplish their goal from every entry point?
- **Error recovery:** What happens when things go wrong? Can users retry?
- **Feedback:** Do users know what's happening? Loading indicators, success confirmations.
- **Dead ends:** Anywhere users get stuck with no path forward?
- **Missing states:** What does count=0 look like? Very long text? 999 items?
- **First-time user walk:** walk the main path as someone who has never seen the app. Name each step where they would be confused, stuck or unsure what happened, before the founder finds it.
- **Cut text, show it instead:** flag any text the screen already shows, wordy copy that can be cut, and explanation that would be clearer as a visual (icon, state, diagram). Copy changes themselves are `[FOUNDER DECISION]` — propose, do not invent.
- **Visual QA:** for rendered states, apply `.claude/rules/visual-qa.md` (it owns the checklist).

## Output Format

```markdown
### Findings
| # | Finding | File:Line | Severity | Category | Description |
|---|---------|-----------|----------|----------|-------------|

Severity: HIGH (bug/security/blocks ship) | MEDIUM (tech debt/should fix) | LOW (style/nice to have)
Category: code | design | ux
```
