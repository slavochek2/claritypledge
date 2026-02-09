---
status: future
priority: p3
summary: "Test whether verified pairs create more verified pairs — network effect and organic growth"
tests: [H7]
answers: []
---

# M11: Cascade Propagates

**Build:** Network effect tracking, verification graph visualization

**Done when:** Organic verification growth (not just event-driven); network effect visible in data

**Kill signal:** No organic growth; verification only happens when prompted by events

**Blocked until:** M10 completes (need working verification loop at scale)

## Hypothesis: Cascade propagates

**What we're testing:** Do verified pairs create more verified pairs? Does the network grow organically once seeded?

**How to test:**
- Track: After A verifies B, does B verify C?
- Measure: Verification graph growth rate
- √N theory: Do we need fewer verifications than expected to achieve "everyone knows someone who verified"?

**Success criteria:**
- Organic verification growth (not just event-driven)
- Network effect visible in data

**Full theory:** See [theory-of-change.md](../theory-of-change.md) for cascade mechanism and √N analysis.
