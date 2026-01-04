# P32 Overnight Prototypes - Vision Exploration

**Date:** 2026-01-05
**Goal:** 5 cloud agents run overnight, each producing a clickable mobile-first prototype exploring the full Clarity Pledge vision with different creative personalities.

---

## Context Documents (Required Reading)

Before starting, read these files to understand the vision:

1. **PRD:** `docs/bmad/prd-p32-ideas-in-live.md` - Ideas in /live feature
2. **Theory of Change:** `docs/visions/v0_theory-of-change.md` - Facilitation ladder, group features
3. **Meme Platform Vision:** `docs/visions/v1_vision-meme-platform.md` - Ideas as memes, positions, certifications
4. **Full Article:** `src/app/content/full-article.md` - The Clarity Tax manifesto
5. **Visual Inspiration:** `docs/inspiration/mockup-screens/*.png` - UI patterns (NOT brand, just patterns)

---

## The User Journey (All 5 Prototypes Build This)

```
/feed → /idea/:id → /profile → /chat → /live → /topology
```

| Screen | Purpose | Key Interactions |
|--------|---------|------------------|
| `/feed` | Browse ideas, see community positions | Mark position (Agree/Disagree/Don't Know), filter, search |
| `/idea/:id` | Single idea detail page | See who reacted, comments, verification count, start verification |
| `/profile` | User's ideas, positions, verified listener score | View own ideas, certifications received, trust graph |
| `/chat` | Async discussion before/after /live | Seed ideas, discuss, transition to live verification |
| `/live` | Real-time verification on selected idea | Select idea → speak → listen → rate → certify |
| `/topology` | Network visualization | Who verified whom on which ideas, cross-disagreement highlighted |

---

## Technical Constraints

- **Mobile-first:** 375px width
- **Mock data only:** No Supabase, hardcoded JSON/TypeScript data
- **React + TypeScript + Tailwind:** Use existing project stack
- **Clickable navigation:** All screens linked, can click through full journey
- **Dummy interactions:** Buttons show state changes but don't persist

---

## The 5 Personalities

| # | Personality | Design Philosophy | Branch Name |
|---|-------------|-------------------|-------------|
| 1 | **Dieter Rams Minimal** | Less is more, brutally simple, whitespace, typography-focused | `p32-prototype-minimal` |
| 2 | **Duolingo Playful** | Gamified, encouraging, micro-animations, progress indicators | `p32-prototype-playful` |
| 3 | **Linear Power-User** | Dense information, keyboard shortcuts, fast, efficient | `p32-prototype-power` |
| 4 | **Apple Premium** | Elegant, spacious, smooth transitions, premium feel | `p32-prototype-premium` |
| 5 | **TikTok Vertical** | Full-screen cards, swipe gestures, one thing at a time | `p32-prototype-vertical` |

---

## Agent Workflow (CRITICAL - Follow Exactly)

### PHASE 1: Journey Alignment (~30 min)

```
1. Invoke PM mindset (read /bmad:bmm:agents:pm)
   - Review all context documents
   - Write journey-spec.md defining YOUR interpretation of the journey
   - Consider your personality: how does [Minimal/Playful/etc] affect the flow?

2. Invoke UX mindset (read /bmad:bmm:agents:ux-designer)
   - Critique the PM's journey spec
   - Propose improvements
   - Iterate until satisfied

3. OUTPUT: Save approved journey spec to `src/app/prototypes/[personality]/journey-spec.md`
```

### PHASE 2: Screen-by-Screen Build (~4-5 hours)

For EACH screen in the journey (in order):

```
┌─────────────────────────────────────────────────────────┐
│ STEP A: UX Design                                       │
│   - Describe the screen layout, components, interactions│
│   - Consider your personality's design philosophy       │
│   - Write to screen-[name]-design.md                    │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ STEP B: Dev Build                                       │
│   - Create React component with mock data               │
│   - Add to routing (React Router)                       │
│   - Ensure it renders without errors                    │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ STEP C: QA Verify                                       │
│   - Run `npm run dev` (port based on branch)            │
│   - Use Playwright MCP to navigate to the screen        │
│   - Verify it renders, check console for errors         │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ STEP D: UX Critique                                     │
│   - Take screenshot via Playwright MCP                  │
│   - Critique against design spec and personality        │
│   - Score 0-100                                         │
│   - List specific improvements needed                   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ STEP E: Dev Improve                                     │
│   - Address each UX critique point                      │
│   - Re-run QA verify                                    │
└─────────────────────────────────────────────────────────┘
                         ↓
         Loop C → D → E until UX score >= 95
                         ↓
              Move to next screen
```

### PHASE 3: Integration & Final Review (~30 min)

```
1. Wire all screens together
   - Navigation works between all screens
   - Consistent header/navigation component
   - State flows logically (selected idea carries through)

2. QA full journey walkthrough
   - Use Playwright to click through entire flow
   - Verify no dead ends, no console errors

3. UX final review
   - Screenshot each screen
   - Grade overall cohesion
   - Note any rough edges

4. PM final grade
   - Does it match the approved journey?
   - Does personality shine through?
   - Write final-review.md with overall assessment
```

---

## File Structure

Each prototype creates:

```
src/app/prototypes/[personality]/
├── journey-spec.md           # Approved journey from Phase 1
├── components/
│   ├── Feed.tsx
│   ├── IdeaDetail.tsx
│   ├── Profile.tsx
│   ├── Chat.tsx
│   ├── Live.tsx
│   └── Topology.tsx
├── data/
│   └── mock-data.ts          # Hardcoded ideas, users, positions
├── design-docs/
│   ├── screen-feed-design.md
│   ├── screen-idea-design.md
│   └── ...
└── final-review.md           # PM's final assessment
```

---

## Mock Data Schema

Use this structure for mock data:

```typescript
// mock-data.ts

export const mockUsers = [
  { id: '1', name: 'Alice Chen', avatar: '👩‍💼', verifiedListenerScore: 12 },
  { id: '2', name: 'Bob Smith', avatar: '👨‍💻', verifiedListenerScore: 8 },
  { id: '3', name: 'Carol Davis', avatar: '👩‍🔬', verifiedListenerScore: 15 },
];

export const mockIdeas = [
  {
    id: '1',
    text: 'Remote work is more productive than office work for knowledge workers',
    createdBy: '1',
    positions: {
      '1': 'agree',
      '2': 'disagree',
      '3': 'dont_know',
    },
    verificationCount: 3,
    crossDisagreementCount: 1,
  },
  // ... more ideas
];

export const mockCertifications = [
  {
    id: '1',
    ideaId: '1',
    speakerId: '1',
    listenerId: '2',
    speakerPosition: 'agree',
    listenerPosition: 'disagree',
    createdAt: '2026-01-04T10:00:00Z',
  },
  // ... more certifications
];
```

---

## Quality Criteria (What 95/100 Means)

| Criteria | Weight | Description |
|----------|--------|-------------|
| **Renders without errors** | 20% | No console errors, no blank screens |
| **Matches personality** | 25% | Clearly embodies the design philosophy |
| **Usable on mobile** | 20% | Touch targets adequate, readable, scrollable |
| **Journey is complete** | 20% | Can click through all 6 screens |
| **Visually polished** | 15% | Consistent spacing, typography, colors |

---

## Important Notes

1. **Don't modify existing app code** — all prototype code goes in `src/app/prototypes/[personality]/`

2. **Use existing UI components** from `src/components/ui/` where helpful (Button, Card, etc.)

3. **Follow design system colors** from CLAUDE.md — blue for primary, no amber/orange

4. **Commit frequently** — every completed screen, push to your branch

5. **If stuck for >15 min** — make a decision and move on, note it in final-review.md

6. **Screenshots as inspiration only** — look at `docs/inspiration/mockup-screens/` for UI patterns but don't copy the brand or "True/False" labels

---

## Success Criteria

By morning, each of the 5 branches should have:
- [ ] 6 clickable screens (feed, idea, profile, chat, live, topology)
- [ ] Navigation between all screens works
- [ ] Personality is clearly visible in design choices
- [ ] No console errors
- [ ] journey-spec.md documenting the flow
- [ ] final-review.md with PM assessment

---

## Launch Commands

See separate section below for the 5 `/c claude` commands to launch each agent.
