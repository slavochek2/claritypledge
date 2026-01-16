# P19.1: Clarity Partners MVP — Lean User Stories

**Status:** In Progress (Stories 0-1 Complete)
**Priority:** High
**Parent:** [P19 Clarity Partners & Common Knowledge Engine](./p19_clarity-partners-common-knowledge.md)

---

## Summary

Live-first guided calibration journey where two people experience paraphrase loops together, then become Clarity Partners who can submit topics and meet to build verified understanding.

**Core insight:** The demo IS the onboarding. You can't become partners without experiencing what it means.

---

## MVP Architecture

**Goal:** Two phones, synced in real-time, each with role-specific UI.

| Aspect | Answer |
|--------|--------|
| Backend | **Supabase Realtime** — minimal sync |
| Auth | **No login** — temporary session IDs |
| Session sync | **Room codes** — join same session |
| Data persistence | **Yes** — save for analysis, sessions expire 24h |
| Two-phone UX | **Yes** — each person has their own view |

**Route:** `/clarity-demo`

---

## Key Decisions

| Decision | Answer |
|----------|--------|
| Live or async | **Live-first** (in person or video call) |
| App's role | Rating companion + record keeper |
| Commitment framing | **Experimental** ("let's explore understanding") |
| Onboarding | **Guided demo** (5 levels of increasing complexity) |
| Recording | **Fake UI for MVP** (test if it feels right) |
| Agree/disagree | **Speaker decides** if relevant per topic |
| Close enough | **Speaker can accept** < 10/10 |
| Two phones | **Yes** — synced via Supabase realtime |
| Role alternation | **Yes** — speaker/listener swap each level |
| Idea capture | **Browser speech-to-text** — tap to record, auto-transcribe |

---

## Two-Phone Architecture

### How It Works

1. **Slava creates session** → gets room code (e.g., `ABC123`)
2. **Gosha enters code** → joins session
3. **Both phones sync** via Supabase realtime subscription
4. **Role-specific UI** — each sees their role's view

### Role Assignment

| Level | Speaker | Listener |
|-------|---------|----------|
| 1 (Fact) | Slava (creator) | Gosha (joiner) |
| 2 (Disagreeable) | Gosha | Slava |
| 3 (Emotional) | Slava | Gosha |
| 4 (Deep value) | Gosha | Slava |
| 5 (Commitment) | App (text) | Both paraphrase |

Both experience being speaker AND listener before committing.

### Screen Examples

**Slava's phone (Speaker, Level 1):**
```
Level 1 of 5: Fact
You are: SPEAKER

Share something obviously true.
Say it out loud to Gosha.

[Waiting for Gosha to paraphrase...]

When ready:
[Rate Understanding]
```

**Gosha's phone (Listener, Level 1):**
```
Level 1 of 5: Fact
You are: LISTENER

Slava will share something true.
Listen, then paraphrase back.

[Waiting for Slava to rate...]
```

---

## Epic: Clarity Partners MVP

### Story 0: Create or Join Session

**As** a user
**I want** to create a session or join with a code
**So that** we can sync our phones for the demo

**Flow — Creator (Slava):**
1. Open `/clarity-demo`
2. Enter name: "Slava"
3. Tap "Create Session"
4. See room code: `ABC123`
5. Share code with partner (verbally or text)
6. Wait for partner to join

**Flow — Joiner (Gosha):**
1. Open `/clarity-demo`
2. Enter name: "Gosha"
3. Enter room code: `ABC123`
4. Tap "Join Session"
5. See: "Joined! Waiting for Slava to start..."

**Acceptance Criteria:**
- [x] Name input (required)
- [x] "Create Session" generates 6-char alphanumeric code
- [x] "Join Session" with code input
- [x] Both see each other's name when connected
- [x] ~~Creator can tap "Start Demo" when partner joined~~ → Auto-starts when joiner connects
- [x] Session stored in Supabase with realtime subscription

**Implementation Notes (2024-12-18):**
- Route: `/clarity-demo`
- Database table: `clarity_sessions` with RLS policies
- UX improvement: Form adapts based on context (join mode hides invite note, highlights name field)
- Auto-start: No manual "Start Demo" button — demo begins when both connected

---

### Story 1: Receive Invitation Context

**As** the joiner (Gosha)
**I want** to see why Slava invited me
**So that** I understand the context before starting

**Flow:**
When Gosha joins, before demo starts:
1. Gosha sees: "Slava wants you to be their Clarity Partner"
2. Shows Slava's note (creator writes when starting)
3. Brief explanation of what Clarity Partners means
4. Waits for Slava to tap "Start Demo"

**For MVP:** Creator writes note when creating session (simple text input).

**Acceptance Criteria:**
- [x] Creator can write "why I'm inviting you" note
- [x] Joiner sees creator's note before demo starts
- [x] ~~Brief explanation of Clarity Partners concept~~ → Commitment card serves this purpose
- [x] ~~Both see "Ready to start" when connected~~ → Joiner accepts commitment, then auto-starts

**Implementation Notes (2024-12-18):**
- See [P19.1.1](./p19_1_1_invitation-commitment-screen.md) for detailed spec
- Added `PartnerCommitmentCard` component
- Joiner sees invitation screen with creator's note + commitment checkbox
- Added "What happens next" bullets for joiner context
- Creator sees "reviewing your commitment" state when joiner is on invitation screen

---

### Story 2: Complete Guided Demo (5 Levels)

**As** both participants
**I want** to experience paraphrase loops with role-specific UI
**So that** I understand what Clarity Partners means through experience

**Flow:**
Both phones sync. Roles alternate per level:

**Level 1: Fact (Speaker: Creator)**
- Creator's phone: "You are SPEAKER. Share something obviously true."
- Creator taps 🎤 → speaks → transcribed to text → becomes idea
- Joiner's phone: sees the transcribed idea, "Listen and paraphrase back."
- Joiner paraphrases verbally
- Creator rates in their app → syncs to joiner
- If <100: joiner sees correction, tries again
- When accepted: joiner sees position buttons
- Joiner taps Agree → both advance

**Level 2: Disagreeable Fact (Speaker: Joiner)**
- Roles swap
- Joiner taps 🎤 → speaks → transcribed → idea saved
- Same flow
- Joiner rates, Creator responds with position (Disagree)
- App message: "Understanding ≠ Agreement. This is the point."

**Level 3: Emotional/Personal (Speaker: Creator)**
- Creator taps 🎤 → speaks → transcribed
- May take 2-3 rounds
- After understanding: "Ask for position?" — Speaker decides
- If no: "Sometimes being understood is enough."

**Level 4: Deep Value (Speaker: Joiner)**
- Joiner taps 🎤 → speaks → transcribed
- May take 3-4 rounds
- Speaker can "Accept as understood" before 100
- Position optional

**Level 5: The Commitment (Both)**
- App displays commitment text (pre-written, not transcribed)
- BOTH paraphrase (each rates the other)
- When both understood: "Ready to commit?"

**Note:** All transcribed ideas from demo become the first items in the ideas backlog.

**Acceptance Criteria:**
- [ ] Roles alternate per level
- [ ] Each phone shows role-specific UI (Speaker vs Listener)
- [ ] Speaker sees: 🎤 record button, transcription preview, edit option
- [ ] Speaker can tap to record → browser speech-to-text → shows transcription
- [ ] Speaker can edit transcription before confirming
- [ ] Confirmed transcription syncs to Listener's phone as the "idea"
- [ ] Listener sees: idea text, waiting state, rating result, position buttons
- [ ] Speaker sees: rating slider, judgment checkbox, correction field
- [ ] Ratings sync in realtime
- [ ] Progress indicator (1-5) on both phones
- [ ] Speaker can accept < 100 ("Close enough")
- [ ] Speaker can choose whether to ask for position
- [ ] Fake "recording in progress" UI shown (red dot)
- [ ] All transcribed ideas saved to clarity_ideas table
- [ ] All round data saved to Supabase
- [ ] Demo ideas marked as level 1-4 in backlog

---

### Story 3: Accept or Decline Partnership

**As** a user who completed the demo
**I want** to decide whether to become Clarity Partners
**So that** I'm only committing if I see value

**Flow:**
After Level 5:
1. Both phones show: "Become Clarity Partners?"
2. Each taps: [Yes, commit] or [Not yet]
3. Choices sync — both see result:
   - Both Yes → "You're now Clarity Partners!"
   - Either No → "No problem. You can try again anytime."

**Acceptance Criteria:**
- [ ] Both phones show decision screen simultaneously
- [ ] Each user's choice syncs to partner
- [ ] Both must accept for partnership
- [ ] Shows combined result
- [ ] Partnership status saved to Supabase

---

### Story 4: Post-Demo — Go to Ideas Backlog

**As** new Clarity Partners
**I want** to see my ideas backlog
**So that** I can add ideas and start a meeting when ready

**Flow:**
After partnership accepted:
1. Both see: "You're Clarity Partners!"
2. "Add ideas you want your partner to understand, then start a meeting."
3. Goes to Ideas Backlog screen

**Acceptance Criteria:**
- [ ] Confirmation message shown
- [ ] Automatically transitions to backlog view
- [ ] Session remains active for future meetings

---

### Story 5: Add Ideas to Backlog (Async)

**As** a Clarity Partner
**I want** to add ideas anytime (voice or text)
**So that** I have a backlog ready for meetings

**Flow:**
1. Open backlog (during session or later via code)
2. Tap "Add Idea"
3. Choose input method:
   - 🎤 **Voice:** Tap record → speak → auto-transcribe → edit if needed → save
   - ⌨️ **Text:** Type idea → save
4. Idea appears in backlog, syncs to partner

**Acceptance Criteria:**
- [ ] Either partner can add ideas anytime
- [ ] Voice input: tap 🎤 → browser speech-to-text → shows transcription
- [ ] Can edit transcription before saving
- [ ] Text input: simple text field alternative
- [ ] Ideas saved to Supabase immediately
- [ ] Ideas sync to partner's backlog view
- [ ] Each idea shows: author, text, status (pending/discussed)
- [ ] Ideas visible only to this partnership (session-scoped)
- [ ] Can add multiple ideas

---

### Story 6: Select Ideas for Meeting (Agenda)

**As** Clarity Partners starting a meeting
**I want** to select which ideas to discuss
**So that** we have a focused agenda

**Flow:**
1. Both see combined backlog (both partners' ideas)
2. Either can tap "Start Meeting"
3. See checkbox list of all pending ideas
4. Select ideas for this meeting
5. Tap "Begin Meeting"
6. Selected ideas become the agenda

**Acceptance Criteria:**
- [ ] Shows all pending ideas from both partners
- [ ] Checkbox selection for agenda
- [ ] Shows who authored each idea
- [ ] "Begin Meeting" starts with selected ideas
- [ ] Can select 1 or more ideas
- [ ] Selection syncs between phones

---

### Story 7: Run Clarity Meeting Loop

**As** Clarity Partners in a meeting
**I want** to do a paraphrase loop on each agenda idea
**So that** we build verified understanding

**Flow:**
1. See agenda: list of selected ideas
2. Current idea highlighted
3. Idea author = Speaker, Partner = Listener
4. Speaker explains (verbally)
5. Listener paraphrases (verbally)
6. Speaker rates in app:
   - Accuracy slider (0-100)
   - Judgment flag (checkbox)
   - Correction text (if needed)
7. Rating syncs to Listener's phone
8. If < 100: Listener sees correction, loop continues
9. If accepted: Speaker chooses "Ask for position?"
10. If yes: Listener taps Agree / Disagree / Neutral
11. Idea complete → next idea or finish

**Acceptance Criteria:**
- [ ] Shows agenda progress (e.g., "Idea 2 of 4")
- [ ] Idea author = Speaker
- [ ] Role-specific UI (Speaker rates, Listener responds)
- [ ] Rating syncs in realtime
- [ ] Loop continues until Speaker accepts
- [ ] Position optional (Speaker decides)
- [ ] All rounds saved to Supabase per idea
- [ ] Fake recording UI shown
- [ ] Can skip idea (mark as skipped)
- [ ] "Next Idea" or "Finish Meeting" when done

---

### Story 8: Meeting Summary (Post-Meeting)

**As** Clarity Partners who finished a meeting
**I want** to see results for each idea we discussed
**So that** I understand what we accomplished

**Flow:**
After last idea or "Finish Meeting":
1. Both see: "Meeting Complete!"
2. Summary shows each idea discussed:
   - Idea text
   - Author
   - Rounds taken
   - Final accuracy accepted
   - Position (if given): Agree/Disagree/Neutral
   - Outcome: Understood / Skipped
3. Options: [Add More Ideas] [End Session]

**Acceptance Criteria:**
- [ ] Shows all ideas from this meeting
- [ ] Per-idea stats: rounds, final accuracy, position
- [ ] Clear outcome per idea
- [ ] Both phones show same summary
- [ ] Can return to backlog to add more ideas
- [ ] "End Session" closes gracefully

---

### Story 9: View Ideas Backlog (Between Meetings)

**As** a Clarity Partner
**I want** to see my backlog and past meeting results
**So that** I can track progress over time

**Flow:**
1. Rejoin session (enter code again, or bookmark)
2. See backlog with all ideas:
   - Pending ideas (not yet discussed)
   - Discussed ideas (with outcome)
3. Can add new ideas
4. Can start new meeting

**Acceptance Criteria:**
- [ ] Shows all ideas: pending + discussed
- [ ] Discussed ideas show: rounds, accuracy, position, outcome
- [ ] Can filter: Pending / Discussed / All
- [ ] "Add Idea" always available
- [ ] "Start Meeting" when partner is online

---

### Story 10: View Partner List

**Deferred** — not in MVP.

Future: Show all partnerships, cross-session history, calibration scores.

---

## Data Model (Supabase)

```sql
-- Sessions (partnership container, expires after 7 days)
CREATE TABLE clarity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- 6-char room code
  creator_name TEXT NOT NULL,
  creator_note TEXT, -- "why I'm inviting you"
  joiner_name TEXT,
  state JSONB NOT NULL DEFAULT '{}', -- current UI state for sync
  demo_status TEXT CHECK (demo_status IN ('waiting', 'in_progress', 'completed')),
  partnership_status TEXT CHECK (partnership_status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP DEFAULT (now() + interval '7 days')
);

CREATE INDEX idx_clarity_sessions_code ON clarity_sessions(code);

-- Demo rounds (onboarding flow, levels 1-5)
CREATE TABLE clarity_demo_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES clarity_sessions(id) ON DELETE CASCADE,
  level INT NOT NULL, -- 1-5
  round_number INT NOT NULL,
  speaker_name TEXT NOT NULL,
  listener_name TEXT NOT NULL,
  speaker_accuracy INT NOT NULL, -- 0-100
  judgment_flag BOOLEAN DEFAULT false,
  correction_text TEXT,
  position TEXT CHECK (position IN ('agree', 'disagree', 'neutral', 'skipped')),
  created_at TIMESTAMP DEFAULT now()
);

-- Ideas backlog (added anytime, discussed in meetings)
CREATE TABLE clarity_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES clarity_sessions(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'in_meeting', 'discussed', 'skipped')) DEFAULT 'pending',
  -- Results (populated after discussion)
  rounds_count INT,
  final_accuracy INT,
  position TEXT CHECK (position IN ('agree', 'disagree', 'neutral')),
  discussed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

-- Meeting sessions (each time they meet)
CREATE TABLE clarity_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES clarity_sessions(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT now(),
  ended_at TIMESTAMP,
  ideas_discussed INT DEFAULT 0
);

-- Meeting rounds (per idea, per meeting)
CREATE TABLE clarity_meeting_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES clarity_meetings(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES clarity_ideas(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  speaker_accuracy INT NOT NULL, -- 0-100
  judgment_flag BOOLEAN DEFAULT false,
  correction_text TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Enable realtime for sync
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_ideas;

-- Auto-cleanup expired sessions (run via cron or edge function)
-- DELETE FROM clarity_sessions WHERE expires_at < now();
```

---

## Screens Needed (Mobile-First, Two-Phone)

### Session Setup
1. **Start Screen** — Enter name, Create or Join
2. **Waiting Room (Creator)** — Shows code, waits for joiner
3. **Waiting Room (Joiner)** — Enter code, see invite note

### Demo (Role-Specific)
4. **Demo: Speaker View** — Prompt, rate button, slider, correction
5. **Demo: Listener View** — Prompt, waiting state, result, position buttons
6. **Demo: Level Transition** — "Level complete! Next: [Role]"

### Partnership
7. **Partnership Decision** — Yes/Not yet (both phones)
8. **Partnership Result** — Confirmed or declined

### Ideas Backlog
9. **Ideas Backlog** — All ideas (pending + discussed), Add Idea button
10. **Add Idea Form** — Text input, Save button
11. **Idea Detail** — Shows idea + results if discussed

### Meeting Setup
12. **Select Ideas (Agenda)** — Checkbox list of pending ideas

### Meeting (Role-Specific)
13. **Meeting: Agenda View** — Progress through selected ideas
14. **Meeting: Speaker Loop** — Idea, rating UI
15. **Meeting: Listener Loop** — Idea, waiting, result, position

### Post-Meeting
16. **Meeting Summary** — Results per idea, Add More / End Session

**Total: ~16 screen states** (many share components)

---

## Speech-to-Text (Browser API)

**Implementation:** Use Web Speech API (SpeechRecognition)

```typescript
// Basic usage
const recognition = new webkitSpeechRecognition(); // or SpeechRecognition
recognition.continuous = false;
recognition.interimResults = true;
recognition.lang = 'en-US';

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  setTranscription(transcript);
};

recognition.start(); // on tap 🎤
```

**Browser Support:**
- Chrome (desktop + mobile): ✅ Full support
- Safari (iOS): ✅ Supported (webkit prefix)
- Firefox: ❌ Not supported
- Edge: ✅ Supported

**Fallback:** If speech-to-text unavailable, show text input only.

**UX Flow:**
1. User taps 🎤 button
2. Browser asks for microphone permission (first time)
3. Recording indicator appears
4. User speaks
5. Real-time transcription shown
6. User taps "Done" or pauses
7. Final transcription shown with edit option
8. User confirms or edits → saves

---

## Out of Scope (MVP)

- User accounts / persistent login
- Partner list (future feature)
- Calibration score display (data saved, not shown)
- Public scores
- Push notifications for async updates
- Audio recording storage (transcription only, no audio files saved)
- External transcription API (using browser's free Web Speech API)

---

## Success Metrics

| Metric | What It Tells Us |
|--------|------------------|
| Session completion rate | Do people finish the demo? |
| Partnership acceptance rate | Do they see value? |
| Rounds per level | How hard is understanding? |
| "Close enough" usage | Is 100 too strict? |
| Meeting topics added | Do they continue after demo? |
| Post-session survey | Do they feel closer? |
| Qualitative feedback | What felt awkward? |

---

## Next Steps

1. [x] ~~Review this doc — any gaps?~~
2. [ ] Draft commitment text (Level 5)
3. [x] ~~Create Supabase tables~~ → `clarity_sessions` created (2024-12-18)
4. [x] ~~Build `/clarity-demo` with realtime sync~~ → Story 0 complete (2024-12-18)
5. [ ] Test between founders (Slava + Gosha)
6. [ ] Iterate based on experience
7. [ ] Implement Story 2: Guided Demo (5 Levels) with speech-to-text

