---
status: future
priority: p3
summary: "Test whether group visibility of verification changes behavior and trust patterns"
tests: [H4, H2]
answers: []
---

# M8: Visibility Changes Behavior

**Build:** Event page with visible calibration, verification pairing UI

**Done when:** >50% of attendees do at least one /live verification; >60% report "worth it"

**Kill signal:** No behavior change from visibility

**Blocked until:** M5 completes (need enough users for group dynamics)

## Hypothesis: Visibility changes group behavior

**What we're testing:** When a group can SEE who verified understanding with whom (on which topics), does their behavior change? Do they seek verification? Do they trust verified listeners more?

**Includes testing:**
- **H4:** Visibility changes behavior (group dynamics)
- **H2:** Calibration revelation motivates action (self-insight)

**How to test:** Run 30-person event with:
- Topics provided by organizer (not user-created Stories for MVP)
- /live verification between attendees
- Calibration visible on event page
- Observe: Do people seek verification? Does visibility change behavior?

**Success criteria:**
- >50% of attendees do at least one /live verification
- >60% report "worth it" post-event
- Qualitative: Room rewards "I was wrong" over "I won"

**Critical observation (2026-01-27):** Cannot test until we solve the cold start problem. Users need content (topics) or organizer-provided prompts to verify understanding ABOUT. The "what" must exist before visibility can change behavior around it. Event organizers provide this trigger — individuals don't have it intrinsically.

## H2: Calibration revelation motivates action

**What we're testing:** When users see their calibration gap (how well they THINK they communicate vs how well they ACTUALLY do), does this motivate them to:
1. Improve their own communication
2. Help others calibrate
3. Seek verification

**How to test:**
- Show calibration metrics at event (per person)
- Track: Do users with visible gaps seek more /live sessions?
- Survey: "Did seeing your gap surprise you? Motivate you?"

**Success criteria:**
- Users report "I didn't realize I was this miscalibrated"
- Verification rate higher for users who saw their gap
- **Ongoing use:** They use /live in their own meetings after workshop
