# Visual QA Checklist

After taking ANY verification screenshot during UI work, check every item. Do NOT skip items. Do NOT say "looks good" without completing the list.

```
VISUAL QA CHECKLIST (per screenshot):
□ Overflow: Does any element extend beyond its container border?
□ Clipping: Are borders, shadows, rounded corners fully visible?
□ Text truncation: Is any text cut off unintentionally?
□ Spacing: Are gaps between siblings consistent and match design system?
□ Alignment: Are baselines, left edges, centers flush where expected?
□ Touch targets: Are interactive elements >= 40px height?
□ Responsive squeeze: At narrowest width, do elements degrade gracefully?
□ Edge data: What happens with count=0, count=999, very long text?
□ Contrast: Is text readable against background?
□ Compare to adjacent: Does visual weight match surrounding production components?
```

## Anti-confirmation-bias rule

After any UI change, spawn a SEPARATE subagent for visual QA:
- Give it ONLY the screenshots + this checklist
- Do NOT give it the code diff or implementation intent
- The subagent succeeds by FINDING problems, not confirming quality

The implementing agent must NOT declare "ready" based on its own screenshot review.
