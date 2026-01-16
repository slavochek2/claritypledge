# P32.4 Final Review Checklist

**Before Running /loop Commands**

---

## ✅ Pre-Implementation Review (COMPLETE)

### Design System
- [x] Design system audit completed
- [x] Hybrid approach (Option C) chosen
- [x] P32.4_00b spec created for unification
- [x] Color consistency verified (iOS blue → Tailwind blue)

### UX Design Review
- [x] All 12 story specs reviewed
- [x] Design coherence confirmed
- [x] Visual hierarchy approved
- [x] User flows validated
- [x] Missing patterns identified and addressed

### Improvements Applied
- [x] Cancel/Exit handling added to LiveSession (P32.4_08b)
- [x] Long-press timing fixed to 300ms (P32.4_07)
- [x] First-time tooltip added for discoverability (P32.4_07)
- [x] Empty state visuals specified (P32.4_05)
- [x] Loading states added to ReactionsModal (P32.4_04)
- [x] Navigation pattern improved (navigate(-1)) (P32.4_09)
- [x] Accessibility guidelines documented

---

## 📋 User Approval Required

### Questions for Slava:

**1. Design System Unification (P32.4_00b)**
- [ ] Approve running P32.4_00b FIRST (before all other stories)
- [ ] Understand this changes all prototype colors to match landing page
- [ ] Accept 1 hour of prep work before main implementation

**2. Improvements Made**
- [ ] Review [p32_4_improvements_summary.md](p32_4_improvements_summary.md)
- [ ] Approve all changes (Cancel buttons, tooltips, loading states, etc.)
- [ ] Confirm improvements address concerns

**3. Accessibility Approach**
- [ ] Review [p32_4_accessibility_guidelines.md](p32_4_accessibility_guidelines.md)
- [ ] Approve P2 priority for prototype (basic keyboard support)
- [ ] Agree P1 for production (full WCAG AA compliance)

**4. Implementation Order**
- [ ] Approve 3-phase execution plan:
  - Phase 1: Foundation (P32.4_00-04) - 1-2 hours parallel
  - Phase 2: Features (P32.4_05-08, 11) - 1-2 hours parallel
  - Phase 3: Integration (P32.4_09-10) - 1.5 hours sequential
- [ ] Total time estimate: 4-5 hours (or 10 hours sequential)

**5. Risk Acceptance**
- [ ] Understand this modifies prototype (not production /live)
- [ ] Accept mock data limitations (no real Supabase calls)
- [ ] Agree to visual review after Phase 1 (foundation complete)

---

## 🚀 Ready to Execute?

### Execution Command Summary

#### Step 0: Design System Unification (MUST RUN FIRST)
```bash
/loop "Implement P32.4_00b per @features/p32_4_00b_design_system_unification.md"
```

**Wait for completion. Verify:**
- [ ] No hardcoded hex colors in prototype
- [ ] Feed looks cohesive with landing page
- [ ] Blue color matches (`#3B82F6` / `blue-500`)
- [ ] No console errors

---

#### Phase 1: Foundation Components (Run in Parallel)
```bash
/loop "Implement P32.4_00 per @features/p32_4_00_create_idea_modal.md"
/loop "Implement P32.4_01 per @features/p32_4_01_feed_header_cleanup.md"
/loop "Implement P32.4_02 per @features/p32_4_02_story_badges.md"
/loop "Implement P32.4_03 per @features/p32_4_03_feed_attribution.md"
/loop "Implement P32.4_04 per @features/p32_4_04_idea_card_stats_redesign.md"
```

**Checkpoint after Phase 1:**
- [ ] Feed header has 2 rows (not 3)
- [ ] Story badges visible
- [ ] Attribution line shows on ideas
- [ ] Stats above buttons (not inside)
- [ ] ReactionsModal opens when clicking stats
- [ ] Mobile (375px) looks clean
- [ ] Desktop (≥768px) hover states work

---

#### Phase 2: Feature Components (Run After Phase 1)

**Wait for P32.4_04 to complete, then:**
```bash
/loop "Implement P32.4_05 per @features/p32_4_05_profile_redesign_after_04.md"
```

**Wait for P32.4_00 to complete, then:**
```bash
/loop "Implement P32.4_06 per @features/p32_4_06_chat_plus_button_after_00.md"
/loop "Implement P32.4_11 per @features/p32_4_11_feed_fab_after_00.md"
```

**Can run anytime:**
```bash
/loop "Implement P32.4_07 per @features/p32_4_07_chat_message_verification_buttons.md"
/loop "Implement P32.4_08 per @features/p32_4_08_idea_detail_verify_button.md"
/loop "Implement P32.4_08b per @features/p32_4_08b_prototype_live_session.md"
```

**Checkpoint after Phase 2:**
- [ ] Profile shows rich idea cards
- [ ] Profile empty states work
- [ ] Chat message hover shows verify button
- [ ] Chat long-press opens context menu (mobile)
- [ ] Idea detail has verify button
- [ ] Feed FAB visible (bottom-right)
- [ ] LiveSession mockup works

---

#### Phase 3: Integration (Run Sequentially)

**Wait for P32.4_07, P32.4_08, P32.4_08b to complete, then:**
```bash
/loop "Implement P32.4_09 per @features/p32_4_09_wire_prototype_to_live.md"
```

**Wait for P32.4_09 to complete, then:**
```bash
/loop "Implement P32.4_10 per @features/p32_4_10_create_idea_during_live.md"
```

**Final Checkpoint:**
- [ ] Chat message → LiveSession → back to Chat works
- [ ] Idea detail → LiveSession → back to Idea works
- [ ] LiveSession Cancel/Exit buttons work
- [ ] Escape key closes LiveSession
- [ ] Create idea during live session works (P32.4_10)
- [ ] All navigation returns to correct page

---

## 🎨 Visual Review (After Phase 1)

Use Playwright MCP to take screenshots:

```bash
# Start dev server
npm run dev

# In another terminal, use Playwright MCP tools:
# 1. Navigate to /prototype/converged (Feed)
# 2. Take screenshot (mobile 375px)
# 3. Take screenshot (desktop 768px+)
# 4. Compare to landing page colors
```

**Verify:**
- [ ] Blue matches landing page
- [ ] Gray-50 background feels cohesive
- [ ] No visual jarring when transitioning pages
- [ ] Stats above buttons looks good
- [ ] Attribution line readable

---

## ⚠️ Known Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Color unification breaks design | Low | Medium | Visual review after P32.4_00b |
| Navigation edge cases | Medium | Low | Browser history pattern handles it |
| Loading states slow on mock data | Low | Low | 300ms simulated delay, feels instant |
| Accessibility gaps | Medium | Low | Guidelines documented, P2 for prototype |
| Hover tooltip annoying | Low | Low | Shows once, 3s auto-dismiss, localStorage |

---

## 📊 Success Criteria

### For Each Story:
- [ ] All P1 tests pass
- [ ] Works on mobile (375px)
- [ ] Works on desktop (≥768px)
- [ ] No console errors
- [ ] Matches design references

### For P32.4 Overall:
- [ ] All 12 stories complete (+ P32.4_00b)
- [ ] End-to-end verification flow works
- [ ] Prototype → LiveSession integration works
- [ ] Design system consistent
- [ ] No regressions in existing functionality

---

## 🎯 Final Sign-Off

### UX Designer (Sally)
- [x] Design system unification approach approved
- [x] All improvements applied and reviewed
- [x] Accessibility guidelines documented
- [x] Edge cases addressed
- [x] Ready for implementation ✅

### Architect (Pending)
- [ ] Technical approach reviewed
- [ ] Mock data expansion strategy sound
- [ ] Navigation pattern validated
- [ ] Supabase integration approach (P32.4_10) approved

### User (Slava)
- [ ] Approve design system unification (P32.4_00b first)
- [ ] Approve all improvements
- [ ] Accept 4-5 hour implementation time
- [ ] Ready to execute

---

## 🚦 GO / NO-GO Decision

**Status:** ⏳ Awaiting User Approval

**Once approved, execute in this order:**
1. ✅ P32.4_00b (Design system unification) - **MUST BE FIRST**
2. ✅ Phase 1 (Foundation) - Can run in parallel
3. ✅ Phase 2 (Features) - Can run in parallel after dependencies
4. ✅ Phase 3 (Integration) - Must run sequentially

**Estimated Total Time:** 4-5 hours (parallel) or 10 hours (sequential)

---

*Generated: 2026-01-06*
*Status: Ready for user approval*
*Next: User signs off, then execute P32.4_00b*
