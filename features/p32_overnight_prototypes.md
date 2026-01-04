# P32 Overnight Prototypes - Vision Exploration

**Date:** 2026-01-05
**Goal:** 5 cloud agents run overnight, each producing a clickable mobile-first prototype exploring the full Clarity Pledge vision with different creative personalities.

**IMPORTANT:** This spec is self-contained. Follow it step-by-step without asking questions. Make reasonable decisions when ambiguous.

---

## Your Personality: [PERSONALITY_PLACEHOLDER]

You are building a prototype with the **[PERSONALITY_NAME]** design philosophy:

> [PERSONALITY_DESCRIPTION]

Every design decision should reflect this personality. When in doubt, ask: "What would [PERSONALITY_REFERENCE] do?"

---

## Step 0: Setup (~5 min)

```bash
# 1. Create and checkout your branch
git checkout -b [BRANCH_NAME]

# 2. Create prototype directory structure
mkdir -p src/app/prototypes/[PERSONALITY_KEY]/components
mkdir -p src/app/prototypes/[PERSONALITY_KEY]/data
mkdir -p src/app/prototypes/[PERSONALITY_KEY]/design-docs

# 3. Start dev server (keep running throughout)
npm run dev
```

---

## Step 1: Read Context Documents (~15 min)

Before designing anything, read these files to understand the vision:

1. `docs/bmad/prd-p32-ideas-in-live.md` - Ideas in /live feature (P1 requirements)
2. `docs/visions/v0_theory-of-change.md` - Facilitation ladder, group features (Section 6.1)
3. `docs/visions/v1_vision-meme-platform.md` - Ideas as memes, positions, certifications
4. `src/app/content/full-article.md` - The Clarity Tax manifesto (understand the WHY)
5. `docs/inspiration/mockup-screens/*.png` - Visual inspiration (patterns only, NOT the brand)

**Key concepts to internalize:**
- Ideas exist independently (memes) — people hold positions on them
- Positions: Agree / Disagree / Don't Know (NOT True/False)
- Verification = certifying understanding (not agreement)
- Cross-disagreement understanding is the valuable signal
- Verified Listener Score = reputation

---

## Step 2: Journey Definition — PM + UX Alignment (~30 min)

### 2A: PM Defines Journey

Adopt the PM mindset. Reference: `/bmad:bmm:agents:pm`

**Your task:** Define how the user journey flows for YOUR personality. The screens are fixed, but how users move between them can vary.

**The 6 Screens (build in this order):**

| Screen | Purpose |
|--------|---------|
| `/prototype/[key]/feed` | Browse ideas, see community positions, mark your own |
| `/prototype/[key]/idea/:id` | Single idea detail — reactions, comments, verification status |
| `/prototype/[key]/profile` | User's ideas, positions, verified listener score |
| `/prototype/[key]/chat` | Async discussion, seed ideas, transition to live |
| `/prototype/[key]/live` | Real-time verification flow on selected idea |
| `/prototype/[key]/topology` | Network visualization — who verified whom on which ideas |

**Write `journey-spec.md`:**

```markdown
# Journey Spec: [Personality Name]

## User Story
As a user, I want to [primary goal based on personality]...

## Entry Point
Where does the user start? Why? (Consider your personality)

## Screen Flow
1. [Screen 1] → User does X → navigates to →
2. [Screen 2] → User does Y → navigates to →
...

## Key Interactions Per Screen
### /feed
- [List key interactions]
### /idea/:id
- [List key interactions]
... (for all 6 screens)

## Personality Expression
How does [Personality] show up in:
- Navigation patterns
- Information density
- Animation/transitions
- Typography choices
- Whitespace usage
```

### 2B: UX Critiques Journey

Switch to UX mindset. Reference: `/bmad:bmm:agents:ux-designer`

**Critique the journey spec:**
- Is the flow intuitive for mobile users?
- Does it match the personality?
- Any confusing transitions?
- Missing interactions?

**Iterate until satisfied.** Save final version to:
`src/app/prototypes/[personality]/journey-spec.md`

---

## Step 3: Screen-by-Screen Build Loop (~4-5 hours)

For EACH screen in order (feed → idea → profile → chat → live → topology):

### 3A: UX Design Phase

Adopt UX mindset. Reference: `/bmad:bmm:agents:ux-designer`

**Create design doc** `design-docs/screen-[name]-design.md`:

```markdown
# Screen: [Name]

## Purpose
[What does user accomplish here?]

## Layout (Mobile 375px)
[Describe top-to-bottom layout]
- Header: [what's in it]
- Main content: [what's shown]
- Bottom nav/actions: [what's there]

## Components
- [ ] Component 1: [description]
- [ ] Component 2: [description]

## Interactions
- Tap [element] → [what happens]
- Swipe [direction] → [what happens]

## Mock Data Needed
- [List data this screen needs]

## Personality Expression
- [How does personality show in this screen?]
```

### 3B: Dev Build Phase

Adopt Dev mindset. Reference: `/bmad:bmm:agents:dev`

**Build the screen:**

1. Create component file: `components/[ScreenName].tsx`
2. Use mock data from `data/mock-data.ts` (create if doesn't exist)
3. Add route to prototype router
4. Use existing UI components from `src/components/ui/` where helpful
5. Follow Tailwind CSS patterns from existing codebase
6. Mobile-first: design for 375px width

**Component template:**

```tsx
import React from 'react';
import { mockIdeas, mockUsers } from '../data/mock-data';

export function Feed() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 bg-background border-b p-4">
        <h1 className="text-lg font-semibold">Ideas</h1>
      </header>

      {/* Content */}
      <main className="p-4">
        {/* Your content here */}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
        {/* Navigation */}
      </nav>
    </div>
  );
}
```

### 3C: QA Verify Phase

**Use Playwright MCP to verify:**

1. Navigate to `http://localhost:5173/prototype/[key]/[screen]`
2. Take a screenshot
3. Check browser console for errors
4. Verify it renders (not blank, no crash)

**If errors:** Fix them before proceeding.

### 3D: UX Critique Phase

Adopt UX mindset again.

**Review the screenshot. Score 0-100 based on:**

| Criteria | Points | Check |
|----------|--------|-------|
| Renders without errors | 20 | No console errors, content visible |
| Matches personality | 25 | Clearly embodies design philosophy |
| Usable on mobile | 20 | Touch targets 44px+, readable text |
| Matches design doc | 20 | Implements what was specified |
| Visually polished | 15 | Consistent spacing, colors, typography |

**Write critique:**

```markdown
## UX Critique: [Screen Name] - Iteration [N]

**Score: [X]/100**

### What's Working
- [Good things]

### Issues to Fix (prioritized)
1. [Critical] [Issue description]
2. [Major] [Issue description]
3. [Minor] [Issue description]

### Specific Changes Needed
- Change [element] from [current] to [target]
- Add [missing element]
- Remove [unnecessary element]
```

### 3E: Dev Improve Phase

**Address each critique point.** Start with Critical, then Major, then Minor.

### 3F: Loop Until 95/100

```
Repeat: QA Verify → UX Critique → Dev Improve
Until: UX Score >= 95
Then: Move to next screen
```

**Max iterations per screen: 10.** If stuck, note issues in final-review.md and move on.

---

## Step 4: Integration (~20 min)

After all 6 screens are built:

### 4A: Wire Navigation

Ensure all screens connect:
- Feed → tap idea → Idea Detail
- Idea Detail → "Verify" button → Live
- Profile accessible from header/nav
- Chat accessible from nav
- Topology accessible from nav/profile
- Back buttons work

### 4B: Full Journey Test

**Use Playwright MCP:**

1. Start at `/prototype/[key]/feed`
2. Click through to each screen
3. Verify navigation works
4. Check console for errors throughout
5. Take screenshot of each screen

### 4C: Create Index Route

Create `src/app/prototypes/[personality]/index.tsx` that links to all screens.

---

## Step 5: Final Review (~10 min)

Adopt PM mindset. Reference: `/bmad:bmm:agents:pm`

**Write `final-review.md`:**

```markdown
# Final Review: [Personality Name] Prototype

## Overall Score: [X]/100

## Journey Completeness
- [ ] Feed: Working / Partial / Broken
- [ ] Idea Detail: Working / Partial / Broken
- [ ] Profile: Working / Partial / Broken
- [ ] Chat: Working / Partial / Broken
- [ ] Live: Working / Partial / Broken
- [ ] Topology: Working / Partial / Broken

## Personality Expression
[How well does the prototype embody the personality? Examples?]

## Best Parts
- [What came out great?]

## Rough Edges
- [What needs more work?]

## Time Spent
- Phase 1 (Journey): ~X min
- Phase 2 (Build): ~X hours
- Phase 3 (Integration): ~X min

## Recommendations for Next Iteration
- [What would you improve with more time?]
```

---

## Step 6: Final Commit & Push

```bash
git add .
git commit -m "Complete [PERSONALITY_NAME] prototype - P32 overnight

6 screens: feed, idea, profile, chat, live, topology
Personality: [PERSONALITY_DESCRIPTION]

Final score: [X]/100

[Brief notes on what's working/rough edges]

Generated with Claude Code overnight prototype workflow"

git push -u origin [BRANCH_NAME]
```

---

## Mock Data Schema

Create this in `data/mock-data.ts`:

```typescript
export type Position = 'agree' | 'disagree' | 'dont_know' | null;

export interface User {
  id: string;
  name: string;
  avatar: string;
  verifiedListenerScore: number;
  bio?: string;
}

export interface Idea {
  id: string;
  text: string;
  createdBy: string;
  createdAt: string;
  positions: Record<string, Position>;
  verificationCount: number;
  crossDisagreementCount: number;
  commentCount: number;
}

export interface Certification {
  id: string;
  ideaId: string;
  speakerId: string;
  listenerId: string;
  speakerPosition: Position;
  listenerPosition: Position;
  createdAt: string;
}

export interface Comment {
  id: string;
  ideaId: string;
  userId: string;
  text: string;
  createdAt: string;
}

export const currentUser: User = {
  id: 'current',
  name: 'You',
  avatar: '👤',
  verifiedListenerScore: 5,
};

export const mockUsers: User[] = [
  { id: '1', name: 'Alice Chen', avatar: '👩‍💼', verifiedListenerScore: 12, bio: 'Product Manager at TechCorp' },
  { id: '2', name: 'Bob Smith', avatar: '👨‍💻', verifiedListenerScore: 8, bio: 'Senior Engineer' },
  { id: '3', name: 'Carol Davis', avatar: '👩‍🔬', verifiedListenerScore: 15, bio: 'Research Lead' },
  { id: '4', name: 'David Park', avatar: '👨‍🎨', verifiedListenerScore: 6, bio: 'UX Designer' },
  { id: '5', name: 'Emma Wilson', avatar: '👩‍💻', verifiedListenerScore: 10, bio: 'Tech Lead' },
];

export const mockIdeas: Idea[] = [
  {
    id: '1',
    text: 'Remote work is more productive than office work for knowledge workers',
    createdBy: '1',
    createdAt: '2026-01-03T10:00:00Z',
    positions: { '1': 'agree', '2': 'disagree', '3': 'agree', '4': 'dont_know', '5': 'disagree' },
    verificationCount: 3,
    crossDisagreementCount: 1,
    commentCount: 5,
  },
  {
    id: '2',
    text: 'AI will replace most knowledge work within 10 years',
    createdBy: '2',
    createdAt: '2026-01-02T14:00:00Z',
    positions: { '1': 'disagree', '2': 'agree', '3': 'dont_know', '4': 'disagree', '5': 'agree' },
    verificationCount: 2,
    crossDisagreementCount: 2,
    commentCount: 12,
  },
  {
    id: '3',
    text: 'Code reviews are more valuable than automated testing',
    createdBy: '3',
    createdAt: '2026-01-01T09:00:00Z',
    positions: { '1': 'dont_know', '2': 'disagree', '3': 'agree', '4': 'agree', '5': 'disagree' },
    verificationCount: 1,
    crossDisagreementCount: 0,
    commentCount: 8,
  },
  {
    id: '4',
    text: 'Startups should prioritize speed over code quality in early stages',
    createdBy: '4',
    createdAt: '2025-12-30T16:00:00Z',
    positions: { '1': 'agree', '2': 'agree', '3': 'disagree', '4': 'agree', '5': 'dont_know' },
    verificationCount: 4,
    crossDisagreementCount: 1,
    commentCount: 15,
  },
  {
    id: '5',
    text: 'Most meetings could be replaced by async communication',
    createdBy: '5',
    createdAt: '2025-12-28T11:00:00Z',
    positions: { '1': 'agree', '2': 'agree', '3': 'agree', '4': 'disagree', '5': 'agree' },
    verificationCount: 5,
    crossDisagreementCount: 1,
    commentCount: 20,
  },
];

export const mockCertifications: Certification[] = [
  { id: '1', ideaId: '1', speakerId: '1', listenerId: '2', speakerPosition: 'agree', listenerPosition: 'disagree', createdAt: '2026-01-04T10:00:00Z' },
  { id: '2', ideaId: '1', speakerId: '2', listenerId: '1', speakerPosition: 'disagree', listenerPosition: 'agree', createdAt: '2026-01-04T10:30:00Z' },
  { id: '3', ideaId: '2', speakerId: '2', listenerId: '5', speakerPosition: 'agree', listenerPosition: 'agree', createdAt: '2026-01-03T15:00:00Z' },
];

export const mockComments: Comment[] = [
  { id: '1', ideaId: '1', userId: '2', text: 'I think this depends heavily on the type of work and team culture.', createdAt: '2026-01-03T11:00:00Z' },
  { id: '2', ideaId: '1', userId: '3', text: 'The data from our team supports this - 20% productivity increase after going remote.', createdAt: '2026-01-03T12:00:00Z' },
  { id: '3', ideaId: '1', userId: '4', text: 'What about collaboration and spontaneous conversations?', createdAt: '2026-01-03T13:00:00Z' },
];

// Helper functions
export function getUserById(id: string): User | undefined {
  if (id === 'current') return currentUser;
  return mockUsers.find(u => u.id === id);
}

export function getIdeaById(id: string): Idea | undefined {
  return mockIdeas.find(i => i.id === id);
}

export function getPositionCounts(idea: Idea): { agree: number; disagree: number; dont_know: number } {
  const counts = { agree: 0, disagree: 0, dont_know: 0 };
  Object.values(idea.positions).forEach(pos => {
    if (pos) counts[pos]++;
  });
  return counts;
}
```

---

## Technical Notes

### Routing

Add routes in a new file or extend existing router. Example approach:

```tsx
// In App.tsx or separate prototype router
<Route path="/prototype/minimal/*" element={<MinimalPrototype />} />
<Route path="/prototype/playful/*" element={<PlayfulPrototype />} />
// etc.
```

### Design System

Follow colors from CLAUDE.md:
- Primary CTA: `bg-blue-500 hover:bg-blue-600`
- Success only: `bg-green-500` (for verified states)
- NO amber/orange colors
- Use existing `src/components/ui/` components

### Playwright MCP Commands

```
Navigate: mcp__playwright__browser_navigate({ url: "http://localhost:5173/prototype/[key]/feed" })
Screenshot: mcp__playwright__browser_take_screenshot({})
Snapshot: mcp__playwright__browser_snapshot({})
Resize mobile: mcp__playwright__browser_resize({ width: 375, height: 812 })
```

---

## Time Budget (8 hours)

| Phase | Time | Notes |
|-------|------|-------|
| Setup + Read docs | 20 min | |
| Journey definition | 30 min | PM + UX back-and-forth |
| Screen 1 (Feed) | 45 min | Most complex, sets patterns |
| Screen 2 (Idea) | 40 min | |
| Screen 3 (Profile) | 40 min | |
| Screen 4 (Chat) | 40 min | |
| Screen 5 (Live) | 50 min | Complex flow |
| Screen 6 (Topology) | 45 min | Visualization |
| Integration | 20 min | |
| Final review | 10 min | |
| Buffer | ~2.5 hours | For iterations, issues |
| **Total** | ~8 hours | |

---

## Decision Rules (When Stuck)

1. **Can't decide between two approaches?** → Pick the one more aligned with your personality
2. **Feature seems too complex?** → Build simplified version, note in final-review.md
3. **Unsure about visual detail?** → Check inspiration screenshots, or pick simpler option
4. **Bug taking >15 min to fix?** → Note it, move on, come back if time permits
5. **UX score stuck at 90?** → After 5 iterations, accept and move to next screen

---

## Success Criteria

By morning, your branch should have:
- [ ] 6 clickable screens at `/prototype/[key]/*`
- [ ] Navigation between all screens works
- [ ] Personality is clearly visible in design choices
- [ ] No console errors on any screen
- [ ] `journey-spec.md` documenting the flow
- [ ] `final-review.md` with assessment
- [ ] All code committed and pushed
