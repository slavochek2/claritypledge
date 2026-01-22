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

**References:** [v7_communicative_critical_rationalism.md](docs/visions/v7_communicative_critical_rationalism.md#the-measurement-stack)

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
- `docs/DECISIONS.md` (this file) - append-only log of trade-offs and reasoning
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
