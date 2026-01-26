# Decisions Log

Append-only log of architectural and product decisions. Newest entries at top.

**Format:**
```markdown
## YYYY-MM-DD: Decision Title

**Context:** Why this came up
**Decision:** What we chose
**Alternatives rejected:** What we didn't choose
**Consequences:** What this means going forward
```

---

## 2026-01-26: Standalone skills as source of truth, prep-spec agents as pointers

**Context:** `/prep-spec` had 12 agent prompt files in `agents/` directory. Two issues emerged:
1. "Challenge" agents (Lean Startup Coach, Innovation) were opt-in and rarely ran — but their value is catching what you *don't* see
2. Agent prompts duplicated content that could be standalone skills

**Decision:**
1. **Challenge agents default ON** — Lean Startup Coach and Innovation Agent are now opt-out, not opt-in
2. **Standalone skills as source of truth** — Created `/lean` and `/innovate` as standalone skills
3. **Agents as pointers** — `agents/lean-startup-coach.md` and `agents/innovation.md` just say "read from /lean" or "/innovate"
4. **Merged overlapping agents** — Definitions + Philosophy → `alignment.md`, Lean Canvas + Theory of Change → `business.md`

**Pattern established:**
```
/lean           ← standalone, source of truth, invokable directly
/innovate       ← standalone, source of truth, invokable directly
/prep-spec      ← orchestrator, agents are pointers to standalone skills
```

**Alternatives rejected:**
- **Keep agents as full prompts** — Duplication, can't invoke directly
- **Delete agents entirely** — Breaks prep-spec's roster table
- **Keep Challenge agents opt-in** — Defeats their purpose (catching blind spots)

**Consequences:**
- Agent count reduced 14 → 10 (with 4 redirect files)
- `/lean` and `/innovate` can be run standalone anytime
- Future agents that make sense standalone should follow this pattern
- Challenge agents run by default in prep-spec

**References:**
- [.claude/commands/lean/index.md](../.claude/commands/lean/index.md)
- [.claude/commands/innovate/index.md](../.claude/commands/innovate/index.md)
- [.claude/commands/prep-spec/SKILL.md](../.claude/commands/prep-spec/SKILL.md)

---

## 2026-01-26: Unified /dev workflow replacing /loop, /quick-dev, /bmad:dev

**Context:** Three overlapping development commands existed:
- `/loop` — 476 lines, comprehensive TDD + visual checks + debugging
- `/quick-dev` — Thin BMAD wrapper delegating to external YAML
- `/bmad:bmm:agents:dev` — Agent persona wrapper requiring "staying in character"

Users didn't know which to use. Logic was scattered. Parallelization opportunities were missed.

**Decision:** Consolidate into single `/dev` skill with:
1. **Smart parallelization** — Analyzes task dependency graph, spawns parallel agents for independent work
2. **UAT integration** — Auto-generates acceptance tests via `/generate-uat` subagent if missing
3. **Subagent verification** — `/design-audit` runs in fresh context at end
4. **Context-aware skill loading** — Auto-loads relevant skills (Vercel, Supabase) based on detected work
5. **Built-in debugging protocol** — Root cause investigation, no separate `/debugging` needed
6. **Wave-based execution** — Groups tasks into dependency waves, parallelizes within waves

**Alternatives rejected:**
- **Keep all three** — Confusing, duplicated logic, no parallelization
- **Merge into /loop** — Name doesn't convey "development workflow"
- **BMAD agent approach** — Persona overhead not needed for task execution

**Consequences:**
- `/loop`, `/quick-dev`, `/bmad:bmm:agents:dev` now redirect to `/dev`
- Single entry point for all development work
- Agents spawn for: UAT generation, parallel tasks, design audit
- Skills loaded dynamically based on context (React → Vercel practices, DB → Supabase practices)

**References:** [.claude/commands/dev.md](../.claude/commands/dev.md)

---

## 2026-01-26: Thread lines for Point → Position → Story hierarchy

**Context:** P103 quote pattern shows `{Name} {verb}:` labels on nested Stories under Points, but the visual connection between Point at top and Stories below wasn't clear. Users couldn't immediately see "this Story supports that Point."

**Decision:** Add Twitter-style thread lines to show visual hierarchy:
```
Point
│
├─ AGREE
│  │
│  ├─ Alice Chen strongly agrees:
│  │  ┌──────────────────┐
│  │  │ Story content... │
│  │  └──────────────────┘
│  │
│  └─ Carol Davis agrees:
│     ┌──────────────────┐
│     │ Story content... │
│     └──────────────────┘
```

**Alternatives rejected:**
- **Indent only** — Shows nesting but no visual "connection" between elements
- **Keep as-is** — Position label + quoted box alone doesn't show relationship to Point above
- **Color coding** — Would conflict with existing position-based color semantics

**Consequences:**
- New CSS pattern for thread lines (vertical line with horizontal connectors)
- Apply to: PointDetail position sections, potentially Profile expanded views
- Pattern documented in design-system.md under "Thread Lines"
- Enables future use in any parent-child UI relationships

**References:** [p103_point_quote_pattern.md](../features/p103_point_quote_pattern.md)

---

## 2026-01-26: /live verification — Story first, Points unlock after

**Context:** Designing card-based verification in /live. Stories have linked Points. Question: how do they interact during verification?

**Decision:** Story → Verified (≥8/10) → Points unlocked for position staking.

- Partner must understand Story before staking positions on linked Points
- Points are "locked" until Story verification passes
- Enforces "can't disagree until you acknowledge their Story"

**Alternatives rejected:**
- Points and Story separate (verify independently) — Loses the "understand WHY before reacting to WHAT"
- Points first, Story optional — Backwards; claims without context invite shallow reactions
- Points always visible — No incentive to actually understand the Story

**Consequences:**
- UI shows Points as "locked, will unlock after understanding"
- <8/10 rating keeps Points locked, offers "try again"
- Creates meaningful sequence: listen → understand → react

**References:** [p85_live_verification_with_cards.md](../features/p85_live_verification_with_cards.md)

---

## 2026-01-26: /live card selection — you only see your own cards

**Context:** In /live with cards, should you see your cards, their cards, or both?

**Decision:** You only see YOUR cards. Partner sees THEIR cards on their device.

- No "shared deck" to manage
- No browsing partner's cards
- Speaker picks their own card to verify

**Alternatives rejected:**
- Shared deck with suggestions — Coordination overhead, who picks next?
- See both (my cards / their cards tabs) — Unnecessary; they pick theirs, you pick yours
- System suggests cards — Over-engineered for MVP

**Consequences:**
- Simpler UI: just "My Cards" list
- No negotiation about what to verify
- Clear ownership: your card = your verification to initiate

**References:** [p85_live_verification_with_cards.md](../features/p85_live_verification_with_cards.md)

---

## 2026-01-26: /live works without cards (cardless mode)

**Context:** What if someone has no sifted Stories/Points yet? Can they still use /live?

**Decision:** Yes. Cardless mode = existing /live flow (explain-back, rating) without a linked card.

**Alternatives rejected:**
- Require cards to use /live — Blocks new users, adds friction
- Auto-create card from conversation — Complex, AI mid-session

**Consequences:**
- [Pick cards] and [Just talk] both available
- Cardless verifications still captured (rating without card reference)
- Low barrier to entry; cards enhance but don't gate

**References:** [p85_live_verification_with_cards.md](../features/p85_live_verification_with_cards.md)

---

## 2026-01-26: "Speak freely" as escape hatch at every step

**Context:** The card verification flow has multiple steps (explain-back, rating, position staking). What if someone wants to exit?

**Decision:** "Speak freely" available at every step. Returns to open conversation.

**Alternatives rejected:**
- No escape (must complete flow) — Too rigid, people leave
- "Cancel" that aborts entirely — Too harsh; "speak freely" keeps session alive

**Consequences:**
- Every verification screen has [Speak freely] option
- Session continues even if formal flow is skipped
- Respects that conversations are fluid, not always structured

**References:** [p85_live_verification_with_cards.md](../features/p85_live_verification_with_cards.md)

---

## 2026-01-26: Session history only (not full history) for MVP

**Context:** Should /live show history of all past verifications, or just this session?

**Decision:** Session history only — shows cards verified in current /live session.

**Alternatives rejected:**
- Full history (all past sessions) — Needs UI for browsing, filtering; complexity
- No history — Loses context of what we've verified together

**Consequences:**
- Bottom of /live shows "This Session" with verified cards + ratings
- Full history is future enhancement
- Keeps /live focused on current conversation

**References:** [p85_live_verification_with_cards.md](../features/p85_live_verification_with_cards.md)

---

## 2026-01-26: Sifter-first model — sift before /live, not unified

**Context:** Designing P98 Sifter Prototype. Three models emerged:
- Model A: Two separate flows (/sift standalone, /live with partner)
- Model B: /live IS the sifter (AI partner mode if no human joins)
- Model C: Sifter-first, then optionally invite to /live

**Decision:** Model C — Sifter-first, /live optional.

User journey: **Clarify → Share → Verify**
1. User dumps thoughts → AI extracts Stories/Points → refine to 10/10
2. Sifted content saved to profile
3. User can then "Invite someone to verify" → starts /live with that content as context

**Alternatives rejected:**
- Model A (two separate flows) — Duplication, users confused about when to use which
- Model B (/live IS sifter) — Mixes mental models (verification vs extraction). /live is for human connection, not AI chat.

**Consequences:**
- Sifting is valuable solo (even without /live)
- /live becomes verification of *sifted* content, not raw thoughts
- Higher quality inputs to verification (already 10/10 understood by AI)
- Existing Stories/Points on profile are "already sifted" — skip to invite

**References:** [p98_sifter_prototype.md](../features/p98_sifter_prototype.md) | [p58_sifter_mvp.md](../features/p58_sifter_mvp.md)

---

## 2026-01-26: Existing profile content treated as "already sifted"

**Context:** If user has Stories/Points on their profile, should they re-sift before inviting someone to verify?

**Decision:** No. Content on profile is already sifted (reached 10/10 during original creation). User can go directly to "Invite to verify."

**Alternatives rejected:**
- Require re-sifting — Unnecessary friction; content already went through 10/10 process
- Optional re-sift — Adds UI complexity for edge case

**Consequences:**
- Profile content has two CTAs: "Invite to verify" (primary), "Refine" (secondary, if they want to re-sift)
- New content goes through Sifter; existing content skips it
- Simplifies the "what do I do with my content" decision

**References:** [p98_sifter_prototype.md](../features/p98_sifter_prototype.md)

---

## 2026-01-23: Story-Point display — cards show counts, detail pages show grouped content

**Context:** Reviewing LinkedIn-like prototype UX. The 2026-01-22 decision said "show linked items inline, not counts" but applying this everywhere created visual overload. StoryCards showed full Point position breakdowns; PointCards showed all quoted Stories; Point detail pages showed Stories flat without position grouping.

**Decision:**

**1. Profile cards (StoryCard, PointCard) — show counts, not inline content**
- StoryCard: Show "🔗 2 points" count. Clicking opens story to see Points.
- PointCard: Show "📖 2 stories" OR collapsible "Your 2 stories" (only THIS user's stories on their profile)
- Rationale: Cards are for scanning. Curiosity drives clicks to detail pages.

**2. Story detail page — show all linked Points inline**
- One user's story links to Points they found relevant. Show them.
- This is per-user content, makes sense inline.

**3. Point detail page — group Stories by position**
- Stories explain positions. Different users have different positions.
- Layout: Position sections (Agree/Disagree/Unsure), each containing Stories from users with that position.
- No "All" tab — default view shows all positions grouped. Tabs filter to single position.
- No icons on tabs — just "Agree (2)" | "Disagree (0)" | "Unsure (2)"
- No recursive quoting — Stories on Point page don't re-quote the Point
- Empty positions: Show section with "(no stories yet)" for discoverability

**4. Position badge placement**
- When viewing all positions: Show position badge (e.g., "Agrees") ABOVE story content
- When filtered to single position: Hide badge (redundant)

**Alternatives rejected:**
- Inline everything everywhere (original decision) — Visual overload on cards
- Hide Stories on Point detail (just show counts) — Loses the "why" behind positions
- Flat Story list on Point page — Ignores that Stories explain specific positions

**Consequences:**
- Updates 2026-01-22 decision: "inline not counts" applies to DETAIL pages, not cards
- StoryCard and PointCard components simplified
- Point detail page needs refactor: position-grouped layout
- Remove "Verify" button from Point detail (outdated)
- Remove checkmark/x/dash icons from position tabs

**References:** [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md) | 2026-01-22 decision below

---

## 2026-01-23: Event page — no tabs, outcomes focus, card selection inside /live

**Context:** Designing event verification flow (P85) for physical events. Originally had Info/Feed tabs on event page. Realized "feed" was wrong mental model.

**Decision:**
- **No tabs on event page** — Single page with info + participants + outcomes
- **No "feed"** — At physical events, people match in person. Don't need digital content discovery.
- **Card selection happens inside /live** — Same UI pattern everywhere (profiles and /live sessions)
- **Event page shows outcomes** — Verification count, avg understanding, leaderboard with ears (👂)
- **Ears = calibration reputation** — Shows on participant list, creates social proof

**Alternatives rejected:**
- Info/Feed tabs — Added complexity, feed doesn't fit physical event model
- Digital partner matching — Unnecessary for in-person events
- Content browsing on event page — Wrong place; browse profiles or select inside /live
- Separate "explore" feed — Just use same card component everywhere

**Consequences:**
- Event page is simpler (one view)
- Card selection UI component shared between profiles and /live
- Event outcomes section drives H2 (visibility) and H0b (FOMO)
- No presence system needed — link/QR sufficient for /live pairing

**References:** [p85_event_verification_flow.md](../features/p85_event_verification_flow.md) | [hypotheses.md](hypotheses.md#h2-visibility-changes-group-behavior-)

---

## 2026-01-23: H0b hypothesis — Social FOMO drives adoption

**Context:** Realized that showing calibration scores (ears 👂) on participant lists serves dual purpose: visibility (H2) and social FOMO (new hypothesis).

**Decision:** Added H0b hypothesis to test whether seeing others' calibration motivates non-participants to verify.

**Alternatives rejected:**
- Merging with H0 — H0 is self-revelation ("I didn't realize I was miscalibrated"), H0b is social ("others have it, I want it")
- Deferring — FOMO is core to event outcomes design, need to track it from first event

**Consequences:**
- H2 test event should track: Did seeing others' ears drive participation?
- Event outcomes section explicitly shows leaderboard to trigger FOMO
- Success criteria: Users mention wanting calibration after seeing others' scores

**References:** [hypotheses.md](hypotheses.md#h0b-social-fomo-drives-adoption-)

---

## 2026-01-23: Build order — Verification flow before Sifter

**Context:** Was unclear whether to build Sifter (P58) or verification flow (P85) first. Both seemed necessary for H2 test.

**Decision:** Verification flow (P85) before Sifter (P58). Manual seeding is sufficient for H2 test.

**Alternatives rejected:**
- Sifter first — Would automate seeding but verification loop needs to work first
- Both in parallel — Too much scope, verify the core loop first

**Consequences:**
- Phase 0: P85 Event Verification Flow (connect /live to content)
- Phase 3: Sifter (after verification works)
- First event can use manually seeded Stories/Points
- Proves loop works before automating the seeding

**References:** [roadmap.md](roadmap.md#build-phases) | [p58_sifter_mvp.md](../features/p58_sifter_mvp.md)

---

## 2026-01-22: Calibration display — inline bar with 7-level brackets

**Context:** Calibration was shown as a separate card (sidebar on desktop, below profile on mobile). Discussed making it part of the profile card, and needed to define meaningful labels for calibration gaps.

**Decision:**
- **Placement:** Inline inside profile card, below stats (one unified "who is this person" card)
- **Visual:** Single horizontal bar with two icons positioned on it:
  - 👂 Ear (Lucide `Ear`) = Listener calibration
  - 🎤 Mic (Lucide `Mic`) = Speaker calibration
- **Direction:** Left = underconfident, Right = overconfident (intuitive: "over" = more = right)
- **7-level brackets** (gap = actual - self, on 1-10 rating scale):

| avgGap | Label |
|--------|-------|
| < -2 | Very overconfident |
| -2 to -1 | Overconfident |
| -1 to -0.5 | Somewhat overconfident |
| -0.5 to +0.5 | Well calibrated |
| +0.5 to +1 | Somewhat underconfident |
| +1 to +2 | Underconfident |
| > +2 | Very underconfident |

- **Tooltips:** Hover icon shows state + explanation (e.g., "Overconfident as Listener: How well you predict you understand others")

**Alternatives rejected:**
- Two separate bars (listener/speaker) — More visual noise, single bar with two markers is cleaner
- Percentage display ("78%") — Doesn't communicate direction (over vs under)
- Emoji icons — Too colorful/distracting, grey Lucide icons better
- Green center line — Too prominent, subtle grey tick mark instead
- 3-level brackets (over/calibrated/under) — Not granular enough, 7 mirrors position scale

**Consequences:**
- `InlineCalibration` component in `CalibrationDisplay.tsx` handles this
- Full `CalibrationDisplay` component still exists for other contexts if needed
- Bar direction is inverted from mathematical convention (positive gap = left)

**References:** [CalibrationDisplay.tsx](../src/app/prototypes/linkedin-like/components/shared/CalibrationDisplay.tsx) | [types.ts](../src/app/prototypes/shared/types.ts#L267-L300)

---

## 2026-01-22: Story-Point relationship is N:N (many-to-many)

**Context:** Designing data model for Stories and Points. Initially considered 1:N (each Point belongs to one Story). User raised: "What if multiple Stories reference the same Point?"

**Decision:** N:N relationship with junction table `story_points`. A Story can link to multiple Points; a Point can be linked from multiple Stories.

**Key insight:** Users don't manually create Points — AI extracts them from Stories and handles linking. The "add existing point" UX isn't user-facing, it's AI-facing. This removes the main argument against N:N (creation flow complexity).

**Why N:N wins:**
- AI can deduplicate Points across Stories (same claim, multiple experiences)
- Enables "join existing Point" feature (P58 future enhancement)
- Matches philosophy: Points are shared claims, Stories are personal context
- No user-facing UX burden since AI handles linking

**Alternatives rejected:**
- 1:N (Point belongs to one Story) — Forces Point duplication when multiple Stories support same claim; doesn't match how Points work (global claims, not owned)

**Consequences:**
- Data model needs `story_points` junction table instead of `story_id` FK on points
- AI Sifter must check for existing matching Points before creating new ones
- Point detail pages show all linked Stories (already implemented in prototype)

**References:** [p58_sifter_mvp.md](../features/p58_sifter_mvp.md#data-model) | [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md)

---

## 2026-01-22: Show linked items inline, not counts

**Context:** StoryCard showed a "🔗 1" badge for linked Points count, then displayed only 1 Point below. PointCard similarly showed a "📖 1" count then 1 Story. Users asked "why show a count when I could just see the actual items?"

**Decision:**
- Remove count badges for linked items (Pin count on Stories, BookOpen count on Points)
- Show ALL linked items inline (max 3, with "+N more" overflow link)
- On profile pages, prioritize profile owner's stories first in PointCard
- Remove `hideLinkedPoints` prop — always show linked content

**Alternatives rejected:**
- Keep count badge + show 1 item — Redundant; count is information about data we could just show
- Expand/collapse toggle — Adds interaction cost, hides value-adding content by default
- Always show all (no limit) — Could get unwieldy with 10+ linked items

**Consequences:**
- Cards are slightly taller when multiple linked items exist
- Simpler component API (no `hideLinkedPoints` prop)
- Users see full context without clicking
- Overflow links drive navigation to detail pages when >3 items

**References:** [roadmap.md](roadmap.md#q2-how-do-stories-link-to-multiple-points) — MVP was "1:1" but prototype now shows many-to-many

---

## 2026-01-21: Feed shows Points with Stories from your network

**Context:** Points in the feed feel random. No indication WHY a Point is relevant to you. Discussed showing quoted Stories from people you know (same event attendees, future Clarity Partners).

**Decision:**
- Points in feed show QuotedStory from people in your network (attended same event)
- Show up to 3 relevant Stories max if multiple matches
- This explains "why am I seeing this?" — someone you know shared their experience

**Alternatives rejected:**
- Badge only ("Sarah from TechConf quoted") — Less context, Stories ARE the context
- Sort boost without showing — User doesn't understand why order changed
- Dedicated "From network" tab — Fragments the feed unnecessarily

**Consequences:**
- PointCard in feed needs to filter linkedStories by user's event co-attendees
- Reuse existing `QuotedStory` component
- When Clarity Partners (P83) ships, add that as another relevance signal

**References:** [p83_clarity_partners.md](../features/p83_clarity_partners.md) — future expansion

---

## 2026-01-21: Story visibility model — Private / Shared / Public

**Context:** Designing P60 (Exploration UX) revealed unclear story visibility. Original spec said "private by default" but didn't define how stories become visible to others, especially within events.

**Decision:** Three visibility levels:
- **Private** — Only author sees (drafts)
- **Shared** — Event participants see (event feed)
- **Public** — Everyone sees (global feed, profile)

"Shared" chosen over "event-private" because it's extensible — future: shared with specific individuals via chat.

**Alternatives rejected:**
- Two levels (private/public) — No event scoping
- "Event-private" label — Too specific, doesn't extend to future sharing

**Consequences:**
- Story model needs `visibility` field: `private | shared | public`
- Event feed shows `shared` stories from that event
- Future chat sharing can reuse `shared` + recipient list

**References:** [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md)

---

## 2026-01-21: Verification only makes sense with story author

**Context:** P60 exploration surfaced question: can I verify understanding of Sarah's story with Bob (not Sarah)?

**Decision:** No. Verification is always 1:1 with the story author. The goal is confirming YOU understood THEIR experience — a third party can't validate that.

**Alternatives rejected:**
- Allow any pair to verify any story — Doesn't make sense epistemologically
- Group verification — Too complex, dilutes the 1:1 understanding check

**Consequences:**
- "Verify" button must indicate WHO you'll verify with (show author)
- /live session is always requester + story author
- Stories must have exactly one author (no co-authored stories)

**References:** [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md) | [p55_understanding_verification_loop.md](../features/done/p55_understanding_verification_loop.md)

---

## 2026-01-21: Global notification bell for verification requests

**Context:** How does a story author know someone wants to verify? Options: email, event-page-only badge, or global in-app notifications.

**Decision:** Global bell icon in top-right nav with badge count. Tapping shows dropdown with pending requests.

**Alternatives rejected:**
- Email only — Users are on platform at events, email is friction
- Event-page-only badge — User might browse elsewhere, misses notification
- No notifications (polling) — Poor UX, author never knows

**Consequences:**
- Need notification infrastructure (bell icon, badge, dropdown)
- First notification type: verification request
- Pattern extends to future notifications (chat messages, etc.)

**References:** [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md)

---

## 2026-01-21: Verification stays event-scoped for MVP

**Context:** P60 spec said "anyone can request verification from any public story" but this creates spam and requires network/connection features labeled "post-MVP."

**Decision:** Verification only available within events for MVP. The "Verify" button appears on shared stories within an event context, not on random public stories.

**Alternatives rejected:**
- Open verification (anyone can request) — Spam risk, no coordination mechanism
- Connection-gated (must connect first) — Requires network feature, too heavy for MVP
- Chat-coordinated — Requires chat feature, too heavy for MVP

**Consequences:**
- "Verify" button only on event-scoped stories
- No network/connections needed for MVP
- Event = implicit trust boundary / social graph
- Public story feed can exist but without "Verify" buttons

**References:** [p60_navigating_stories_and_points.md](../features/p60_navigating_stories_and_points.md)

---

## 2026-01-19: Avatar ring effect via background-padding, not Tailwind ring utilities

**Context:** P75 Compact Profile Card needed a blue ring around pledger avatars. During code review, discovered the initial implementation used `ring-blue-500` which only sets color without visible ring (requires `ring` or `ring-2` for thickness).

**Decision:** Use `p-1 bg-blue-500` on the avatar container to create the ring effect. The 4px padding with solid blue background creates a visually identical ring around the circular avatar.

**Alternatives rejected:**
- `ring-2 ring-blue-500` — Tailwind's ring utility, but ring appears outside the element's box model which can cause layout issues with adjacent content
- Inline avatar implementation with ring (chosen for P75, but identified as tech debt) — P76 will refactor to use `GravatarAvatar` component with `isPledger` prop

**Consequences:**
- Simple, predictable ring that's part of the avatar's box model
- P76 will standardize this pattern in `GravatarAvatar` component with `isPledger` prop
- Ring width is fixed at 4px (`p-1`); larger avatars may want `p-1.5` or `ring-3`

**References:** [compact-profile-card.tsx](../src/app/components/profile/compact-profile-card.tsx) | [p76_pledger_avatar_distinction.md](../features/p76_pledger_avatar_distinction.md)

---

## 2026-01-19: Service abstraction pattern with feature flag for backend rollout

**Context:** P61 Events feature needed to transition from mock data to real Supabase backend without breaking existing UI or requiring big-bang deployment.

**Decision:**
1. **Interface-based service abstraction** — Both `events-service-mock.ts` and `events-service-real.ts` implement same `EventsService` interface
2. **Feature flag switch** — `VITE_USE_REAL_EVENTS_API` env var selects which implementation to use
3. **Archive mock data** — Move to `_archive/` folder rather than delete, keeping tests working and reference available

**Alternatives rejected:**
- Direct replacement (delete mock, add real) — too risky, no rollback path
- Branch-based deployment — harder to test real API locally while keeping prod stable
- Runtime feature flag in UI — unnecessary complexity, env var is simpler

**Consequences:**
- Can test real API locally while prod stays on mock
- Pattern reusable for future features (Stories, Points) needing gradual backend rollout
- Tests import mock service directly, unaffected by env var

**References:** [events-service.interface.ts](../src/app/data/events-service.interface.ts) | [events-service.ts](../src/app/data/events-service.ts) | [p61.1_events_production.md](../features/p61.1_events_production.md)

---

## 2026-01-18: Position scale and calibration approach for Points

**Context:** Needed to define how users track positions on Points and how the system identifies "good listeners" without gatekeeping.

**Decision:**
1. **7-point Likert scale (-3 to +3)** for positions on Points — standard in social science, balances granularity with cognitive ease
2. **Decentralized calibration** — no gatekeeping; weight contributions by track record instead
3. **Personal baseline for conversion** — compare user's conversion rate to their own history, not global rates

**Alternatives rejected:**
- -5 to +5 scale — too granular, people struggle to distinguish adjacent values
- -2 to +2 scale — loses nuance between "disagree" and "strongly disagree"
- Pre-certified "expert listeners" — gatekeeping creates dogmatic traps
- Global conversion baselines — confounded by topic and selection bias

**Consequences:**
- Data model: `position` column as smallint (-3 to 3), per-user conversion history
- No admin role needed for "certifying" listeners — system self-calibrates

**References:** [philosophy.md](philosophy.md#the-measurement-stack)

---

## 2026-01-18: /kdd entries now reference source files

**Context:** Decision log entries explain *what* was decided but don't point to *where* to learn more. Makes the log less navigable.

**Decision:** Add a `**References:**` field to the /kdd format with markdown links to relevant files and sections.

**Alternatives rejected:** None — pure improvement.

**Consequences:** Entries are now navigable; readers can dig deeper into the source material.

**References:** [SKILL.md](.claude/commands/kdd/SKILL.md)

---

## 2026-01-18: Brand architecture — "ClarityPledge" stays as umbrella name

**Context:** The product expanded from "just a pledge" to a full Sensemaking Platform (see product pivot decision below — pledge alone had unclear growth path, events became the growth engine). Question arose: is "ClarityPledge" too specific for an expanding toolkit?

**Decision:** Keep "ClarityPledge" as the umbrella brand because:
- The Pledge embeds the product's DNA — closed-loop communication, explain-back verification
- It's a "values-based brand" (like Patagonia) where the name signals the philosophy, not the feature set
- The .com domain with two real English words is a significant branding asset
- The Pledge becomes the "why" behind the "what" — all tools exist to uphold the Pledge's values

**Alternatives rejected:**
- Rebrand to generic umbrella (e.g., "ClearSync", "SenseForge") — loses the unique origin story and moral hook
- Parent/child architecture (broader company name + "Clarity Pledge" as one product) — adds complexity without clear benefit
- Keep name but downplay pledge feature — feels like false advertising if the pledge isn't central

**Consequences:**
- Every tool must genuinely support "closed-loop communication" — the name is a promise
- Marketing angle: "Tools for people who value clarity" or "Communication tools for those who value understanding"
- The Pledge is now a "graduation" feature (~1% of users) rather than the entry point
- Risk accepted: name sounds "formal/serious" — may not fit if we later add playful features

---

## 2026-01-17: Product pivot — Sensemaking Platform with Events as growth engine

**Context:** The Clarity Pledge product (sign pledge → profile → endorsements) is live but has unclear growth path. Vision docs (v7, v0 theory of change, P58 Sifter) describe a larger Sensemaking Platform. We needed to decide: two products or one? What's the build sequence?

**Decision:** One product, two user journeys:
- **Journey A:** Event attendee → verifier → maybe pledger (1%)
- **Journey B:** Organic visitor → pledger → maybe event host
- Events are the growth engine (organizers bring users)
- Pledge becomes a "graduation" feature for ~1% of engaged users
- Stories AND Points both needed — Points filter where to verify, Stories provide what to verify

**Build sequence (5 days):**
1. Events backend (worktree-4)
2. /live connection from event (skip QR, "verify with [person]")
3. Stories + Points in profile (mockup with fake data)
4. Sifter (mockup + AI agent)
5. Calibration banner (understanding gap metrics)

**Alternatives rejected:**
- Stories only, Points later — Without Points, you verify randomly. Points tell you WHERE understanding gaps matter.
- Sifter first — Complex to build. Mockup-first approach validates UX before backend investment.
- Two separate products — Same auth, same profiles, shared components. One codebase, two journeys.
- Full backend before mockups — Mockups with fake data let us validate UX faster.

**Consequences:**
- `mvp_pledge.md` to be archived — it describes old product
- New `product-vision.md` needed — single source of truth for Sensemaking Platform
- `CLAUDE.md` needs Product Overview section
- P55 likely outdated — needs review against new direction
- /live enhancement: verify Stories, suggest Points for position-taking
- Calibration = Understanding Gap (self-rating vs speaker verification after explain-back)

---

## 2026-01-17: P66 - Live meeting hosting requires authentication

**Context:** Anyone could start a Clarity Live meeting without an account. We wanted accountability and quality by requiring registration.

**Decision:** Gate meeting hosting behind auth, but keep joining open:
- Guests on `/live` → redirected to `/signup`
- Guests on `/live/CODE` → can join (invited participants don't need accounts)
- Logged-in users → can host meetings
- Non-pledged users (has_pledged=false) CAN host — they're still verified users

**Alternatives rejected:**
- Require pledge to host — too restrictive; many users want to try meetings before committing to pledge
- Show different page content based on auth — adds complexity; redirect is simpler
- Auto-redirect back to `/live` after signup — KISS principle; user can navigate via nav

**Consequences:**
- Analytics event stays `try_meeting` (renaming breaks historical data)
- Button text changed from "Try a Clarity Meeting" → "Start a Clarity Meeting" to match gated UX
- P66.1 added page-load redirect (not just button-click gate)

---

## 2026-01-17: Knowledge-Driven Development (KDD) adoption

**Context:** Documentation goes stale immediately. Feature docs are written once during planning but never updated after implementation. Trade-offs and "why" decisions are lost to git commit history where they're hard to find.

**Decision:** Adopt a minimal knowledge capture system:
- `docs/decisions.md` (this file) - append-only log of trade-offs and reasoning
- `/kdd` skill - manual command to capture decisions when they matter
- `features/archive/` - where completed feature docs go after merge

**Alternatives rejected:**
- CHANGELOG.md - Git log already tracks changes; we need "why" not "what"
- ARCHITECTURE.md - CLAUDE.md already covers this
- Pre-merge hooks - Too much friction; manual discipline is enough
- Auto-archival with pattern matching - Fragile and over-engineered

**Consequences:**
- Run `/kdd` after finishing features with interesting trade-offs
- Move feature docs to `features/archive/` manually after merge
- This file grows indefinitely (append-only) - newest at top for easy reading
