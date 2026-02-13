---
status: planned
tests: [h-stories-solve-cold-start]
measures: [o-story-usage]
start_date: 2026-02-15
end_date: 2026-03-15
sample_size: 20
---

# E-Story-Creation: Story Creation Pilot

## Experiment Protocol

**What we're testing:** Whether users will create stories and use them as context for /live verification.

**Method:**
1. Build story creation feature (P126)
2. Invite 20 pilot users (mix of previous /live users + new)
3. Prompt: "Share a story that matters to you"
4. Observe: Do they create? Do they verify?
5. Measure: Story creation rate, verification frequency, qualitative feedback

**Timeline:**
- **Weeks 1-2:** Build story feature + recruit pilot users
- **Weeks 3-4:** Pilot running, collect data
- **Week 5:** Analyze results, decide next steps

## Measurements

**Quantitative:**
- **Story creation rate:** % of pilot users who create ≥1 story
- **Verification frequency:** Verifications per story (via /live)
- **Session quality:** Understanding gap reduction (compare to pre-story baseline)
- **Retention:** Do story authors return to see who verified?

**Qualitative:**
- **Exit interviews:** "Did stories make /live feel more purposeful?"
- **Observation:** Do users ask "on what?" less?
- **Sentiment:** "Stories feel natural" vs "Stories feel forced"
- **Friction points:** Where do users get stuck during story creation?

**Data collection:**
- Database events: `story_created`, `/live_session_completed`, `verification_recorded`
- User feedback surveys (exit interviews after 4 weeks)
- Analytics: Drop-off points in story creation flow

## Sample Size

**Target:** 20 pilot users

**Composition:**
- 10 previous /live users (returning users, know the protocol)
- 10 new users (cold start test, never used /live)

**Justification:** Small enough to iterate quickly, large enough to spot patterns. Not seeking statistical significance — just signal detection.

**Recruitment:**
- Previous /live users: Email invite to past participants
- New users: Outreach to rationalist communities (LessWrong, EA Forum)
- Coaches: Invite 2-3 aligned coaches to test with clients

## Assumptions (Experimental)

**Experimental-level assumptions (NOT strategic):**
1. 20 users sufficient to spot signal (not statistical significance, just pattern detection)
2. 4-week timeframe long enough for habits to form (or not)
3. Pilot users willing to give feedback (recruit engaged users)
4. Story creation feature works technically (no major bugs blocking usage)
5. Mix of returning + new users reveals different signals (cold start vs retention)

**Dependencies:**
- H1 validated (/live protocol works)
- P126 shipped (story creation feature)
- P128 shipped (/live beginning screen linking to stories)

## Success Threshold

**Proceed to C2 (First Workshops) if:**
- ≥50% of users create at least 1 story
- ≥30% of users verify understanding of stories
- Qualitative feedback: "Stories make /live feel purposeful"
- "On what?" question disappears (users have answer)

**Why these thresholds:**
- 50% creation = majority find value, not just early adopters
- 30% verification = stories actually used (not just created and forgotten)
- Qualitative = stories solve the cold start problem (purposeful, not forced)

## Kill Threshold

**Abandon H-Stories hypothesis if:**
- <20% story creation rate after 4 weeks (too low engagement)
- Stories exist but verification rate <10% (stories don't trigger /live usage)
- Qualitative: "Stories feel forced" (poor UX fit)
- High drop-off during story creation (friction too high)

**Next steps if killed:**
- Return to cold start problem
- Test alternative triggers (pre-seeded topics, event prompts)
- Consider: Is the problem /live friction, not lack of context?

## Experimental Design Decisions

**Decision 1: Manual story creation (not AI-assisted)**
- **Chosen:** Users write stories manually
- **Why:** Test whether people WANT to create stories first, before adding AI complexity
- **Alternative rejected:** AI-assisted story extraction (Sifter) — adds variables, harder to isolate signal

**Decision 2: Holistic verification (not Points-based)**
- **Chosen:** Author rates 0-10 "did they get it?" (Phase 4a pattern)
- **Why:** Test simplest version first; add Points (structured claims) only if holistic proves too vague
- **Alternative rejected:** Points-based verification — premature optimization before cold start solved

**Decision 3: Mix of returning + new users**
- **Chosen:** 50/50 split (10 returning, 10 new)
- **Why:** Returning users test retention (do stories bring back /live users?); new users test cold start (do stories onboard fresh users?)
- **Alternative rejected:** All new users — loses signal on whether stories re-engage dormant users

**Decision 4: 4-week timeline**
- **Chosen:** Feb 15 - Mar 15 (4 weeks)
- **Why:** Long enough for habits to form, short enough to iterate quickly
- **Alternative rejected:** 8-week timeline — too slow if hypothesis fails

## Analysis Plan

**Week 5 (after pilot ends):**

1. **Quantitative analysis:**
   - Story creation rate (% of 20 users who created ≥1 story)
   - Verification rate (% of stories that got verified)
   - Cohort comparison (returning vs new users)
   - Retention: % of story authors who returned after creation

2. **Qualitative analysis:**
   - Exit interview coding (themes: "purposeful" vs "forced")
   - Friction point analysis (where did users drop off?)
   - Sentiment: Net Promoter Score for Stories feature

3. **Decision matrix:**
   - If ≥50% creation + ≥30% verification → **Proceed to C2** (First Workshops)
   - If 30-50% creation → **Iterate** (reduce friction, test again)
   - If <20% creation → **Kill H-Stories**, test alternatives

**Deliverable:** Analysis report with recommendation (proceed / iterate / kill)

## Related Documents

**Hypothesis tested:**
- [h-stories-solve-cold-start.md](../hypotheses/h-stories-solve-cold-start.md)

**Outcomes measured:**
- [o-story-usage.md](../outcomes/o-story-usage.md)

**Track context:**
- [c1-stories-live-events.md](../tracks/c1-stories-live-events.md)

**Features required:**
- P126: Story creation (profiles)
- P128: /live beginning screen
- P124: Event rooms (for workshop pairing)
