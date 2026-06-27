---
globs: "*"
---

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
□ One primary action: At most ONE full-width primary button per view? (P955 — competing primaries split intent; deterministically blocked by the p955-gate)
□ No dead controls: No disabled submit/primary button rendered as decoration in an empty/initial state? (P955 — model state correctly, don't render-then-disable; deterministically blocked by the p955-gate)
□ Responsive squeeze: At narrowest width, do elements degrade gracefully?
□ Edge data: What happens with count=0, count=999, very long text?
□ Contrast: Is text readable against background?
□ Compare to adjacent: Does visual weight match surrounding production components?
□ Hierarchy: Does visual hierarchy guide the eye to the primary action first?
□ Density: Does spacing density match the cognitive task (spacious for reflection, dense for scanning)?
□ Sibling weight: Do elements at the same level carry equal visual weight (no orphan heavy/light items)?
□ State match: Does the screenshot depict the claimed application state? If a gate (auth, mic, feature flag) prevented reaching it, disclose what was verified vs. what was not.
```

## Multi-viewport before "ready"

Take screenshots at 375px, 320px, AND desktop before reporting any visual work as ready. "Looks good at desktop" is not verification. Click interactive states (dropdowns, buttons) and screenshot those too. Mobile-narrow (320px) is the most common overflow surface.

## Annotated screenshots — restate before editing

When the user shares an annotated screenshot, write one sentence per annotation: "I see [annotation text] pointing at [element] — I'll [proposed change]." Wait for confirmation before editing any code. 10 seconds prevents wrong-edit cycles.

## Anti-confirmation-bias rule

After any UI change, spawn a SEPARATE subagent for visual QA:
- Give it ONLY the screenshots + this checklist
- When a Visual Specification exists in the spec, pass it to the QA subagent alongside this checklist — it enables the 3 design-quality questions (Hierarchy, Density, Sibling weight) to be evaluated against concrete intent
- Do NOT give it the code diff or implementation intent
- The subagent succeeds by FINDING problems, not confirming quality

The implementing agent must NOT declare "ready" based on its own screenshot review.
