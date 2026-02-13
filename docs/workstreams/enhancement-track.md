# Enhancement Track (E-track)

## What Belongs Here

**Definition:** Product improvements that require validation — features that enhance core value once basic traction exists.

**Classification criteria:**
- Improvements to validated features (not net-new capabilities)
- Conditional on core traction (need users first)
- Enhance existing workflows (don't create new ones)
- Require testing to validate value

**Examples:**
- E1: Points + AI (structured verification instead of holistic)
- E2: Scale + Partners + Async (Slack integration, async verification)

---

## Time Horizon

**3-9 months** — Conditional track

Enhancement track is **CONDITIONAL** on core traction. Only invest here once Stories + /live are validated.

**Characteristics:**
- Medium time horizon (build on validated foundation)
- Requires existing users (can't test enhancements without usage)
- Risk: over-engineering before validation (premature optimization)

---

## Resource Constraints

**Required capabilities:**
- Engineering (AI integration, async infrastructure)
- Design (UX improvements to existing flows)
- Existing user base (need people to test enhancements)

**Not required:**
- New hypotheses (enhancements improve existing value, don't test new bets)
- Large scale (can test with small user base)

---

## Decision Framework

**Choose E-track if the work:**
- Improves existing validated features (not net-new)
- Requires testing to validate value (not obviously needed)
- Depends on core traction (need users first)
- Enhances user experience (but isn't critical to core loop)

**Don't choose E-track if:**
- Core loop not validated yet → defer or move to C-track/R-track
- Work is net-new capability → C-track or X-track
- Work is infrastructure → foundation
- Work is far-future → V-track

---

## Active Hypotheses

See `/docs/hypotheses/` for full details:
- H-Points-Improve-Clarity: Structured claims improve verification precision
- H-AI-Story-Extraction: AI can extract claims from stories
- H-Async-Scales-Access: Async verification scales beyond real-time

---

## Success Criteria

**Track succeeds if:**
- Points adoption >30% (users prefer structured over holistic)
- AI extraction accuracy ≥80% (verified by authors)
- Async verification retention ≥50% (users return)

**Track fails if:**
- Core loop not validated (defer enhancements)
- Users prefer holistic verification (Points add friction)
- Async verification doesn't work (loses fidelity)

**KILL SIGNAL:** If Stories + /live aren't validated by month 6, pause E-track work entirely.
