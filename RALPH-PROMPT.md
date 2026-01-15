# Ralph Loop: Design System Compliance

Make /live and /linkedin-prototype routes achieve 10/10 design system compliance.

## SCORING RUBRIC (each page 0-10):
1. Color semantics (3pts): Blue CTAs, green=success only, no amber/orange/yellow
2. Components (3pts): shadcn/ui Buttons, no custom inline, proper variants
3. Typography (2pts): Semantic classes (text-lg), no pixel sizes
4. Consistency (2pts): Spacing, hierarchy matches landing page

## ITERATION PROCESS:
1. Start: npm run dev (port in vite.config.ts)
2. Screenshot both routes (Playwright MCP)
3. Score each using rubric, document reasoning in commit message
4. If both = 10/10 → output promise tag DESIGN COMPLETE and STOP
5. Fix highest-impact violations
6. Commit with scores in message: 'iteration N: /live 7/10, /linkedin-prototype 6/10 - fixed amber colors'
7. GOTO step 2

## SCORE DECREASE HANDLING:
- If score drops from previous iteration, PAUSE
- Document in commit: 'SPEC GAP: [what caused regression]'
- Add note to .ralph-notes.md with spec improvement suggestion
- Revert breaking change, try alternative approach
- Continue iteration

## SUCCESS CRITERIA:
Both /live and /linkedin-prototype score 10/10 on all rubric items.
When achieved, output the promise tag: `<promise>DESIGN COMPLETE</promise>`

## REFERENCE:
docs/design-system.md
