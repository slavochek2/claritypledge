# P32.4 Review Prompts

**Purpose:** Prompts for architect and UX designer to review P32.4 specifications before implementation

**Date:** 2026-01-06

---

## For Architect Review

### Prompt:

```
/bmad:bmm:agents:architect

Review P32.4 specifications for technical soundness and architecture quality.

Context:
- We've split P32.4 into 12 stories based on critique feedback from P32.3
- Stories are organized in 3 phases: Foundation → Features → Integration
- One story (P32.4_10) modifies PRODUCTION code (/live), rest are prototype
- Design system has been unified (P32.4_00b)

Please review:

1. **Dependency Graph Correctness**
   - Review @features/p32_4_implementation_guide.md dependency graph
   - Are dependencies correctly identified?
   - Are there missing dependencies?
   - Can the parallel execution groups actually run in parallel?

2. **Technical Approach**
   - Review all 12 spec files (P32.4_00 through P32.4_11)
   - Are component patterns sound?
   - Are state management approaches correct?
   - Are navigation state passing patterns safe?

3. **Production Integration (P32.4_09, P32.4_10)**
   - Review @features/p32_4_09_wire_prototype_to_live.md
   - Review @features/p32_4_10_create_idea_during_live.md
   - Is the prototype → production /live integration safe?
   - Is the Supabase integration approach correct?
   - Are there race conditions or edge cases we missed?

4. **Mock Data Strategy**
   - Review mock data expansion approach across specs
   - Is the "expand as needed" strategy sound?
   - Are there data modeling issues?

5. **Edge Cases**
   - Are the P1/P2/P3 edge case tiers appropriate?
   - Are there critical missing edge cases?
   - Should any P2 cases be promoted to P1?

6. **Testing Strategy**
   - Are the "Tests That Must Pass" sections adequate?
   - Are there missing test scenarios?
   - Should we define E2E test coverage?

Please provide:
- ✅ Approved items
- ⚠️ Concerns that need addressing
- ❌ Blockers that must be fixed before implementation
- 💡 Suggestions for improvement (optional)

Focus on: Architecture quality, production safety, technical correctness.
```

---

## For UX Designer Review

### Prompt:

```
/bmad:bmm:agents:ux-designer

Review P32.4 specifications for design coherence and UX quality.

Context:
- We've split P32.4 into 12 stories based on 13 critique points from P32.3
- Design system has been unified to match landing page (Hybrid approach)
- Stories address: Feed clutter, profile sparseness, chat improvements, verification flows
- Mobile-first (375px) but desktop-friendly (≥768px)

Please review:

1. **Design System Unification**
   - Review @features/p32_4_design_system_audit.md
   - Review @features/p32_4_00b_design_system_unification.md
   - Is the Hybrid approach (Option C) sufficient?
   - Should we do full unification (Option A) instead?
   - Are acceptable differences actually acceptable?

2. **Design Coherence Across Stories**
   - Review all 12 spec files (P32.4_00 through P32.4_11)
   - Do the stories form a cohesive UX when stitched together?
   - Are there visual inconsistencies between stories?
   - Does the prototype flow well end-to-end?

3. **Interaction Patterns**
   - Review P32.4_07 (message verification - hover/long-press)
   - Review P32.4_08 (idea detail verify button)
   - Are interaction patterns consistent?
   - Are mobile/desktop patterns appropriate?
   - Are there accessibility issues?

4. **Visual Hierarchy**
   - Review P32.4_04 (stats above buttons)
   - Review P32.4_05 (profile redesign)
   - Does the visual hierarchy make sense?
   - Is information prioritized correctly?

5. **User Flows**
   - Review P32.4_09 (wire prototype to /live)
   - Does the prototype → /live → prototype flow make sense?
   - Are there confusing transitions?
   - Should returnTo navigation be more obvious?

6. **Missing Patterns**
   - Are there design patterns from critique that weren't addressed?
   - Are there visual inconsistencies we missed?
   - Should any stories be split further or combined?

Please provide:
- ✅ Approved items
- ⚠️ Concerns that need addressing
- ❌ Blockers that must be fixed before implementation
- 💡 Suggestions for improvement (optional)

Focus on: Design coherence, user experience, visual consistency.
```

---

## Expected Outputs

After both reviews, you should receive:

### From Architect:
- Technical approval or list of blockers
- Identification of missing edge cases
- Validation of production integration safety
- Test scenario recommendations

### From UX Designer:
- Design approval or list of visual issues
- Confirmation of design system unification approach
- Validation of interaction patterns
- User flow recommendations

---

## Next Steps After Reviews

1. **If both approve:** Proceed with P32.4_00b → P32.4_00-11 implementation
2. **If concerns raised:** Address concerns, update specs, re-review
3. **If blockers found:** Fix blockers before any implementation

---

## How to Use These Prompts

### Option 1: Run Agents Directly
```bash
# Copy-paste the architect prompt
/bmad:bmm:agents:architect
[paste prompt]

# Copy-paste the UX designer prompt
/bmad:bmm:agents:ux-designer
[paste prompt]
```

### Option 2: Save for Later
- Keep this file open
- When ready to review, copy-paste prompts
- Agents will have full context from @ file references

---

*Generated: 2026-01-06*
*Purpose: Pre-implementation review checklist*
