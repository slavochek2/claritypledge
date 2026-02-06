# Manifesto Series — Epic

Series of 7 blog posts that walk new readers through the ideas in [The Clarity Tax](https://claritypledge.com/manifesto), one section at a time. Each post follows the full article's natural arc but adds the founder's personal experiences via the `/interview` skill.

## Why This Exists

The full manifesto is ~15,000 words. Most people won't read it in one sitting. This series:
1. Chunks it into digestible weekly posts
2. Adds personal "build in public" voice (the manifesto is academic; the blog is personal)
3. Serves as the onboarding funnel — educate new readers, build trust, pull toward action
4. Becomes an automated drip sequence for new subscribers (eventually)

## Audience

Same as `content/strategy.md`: calibrated listeners who already practice verification and are frustrated others don't. These posts validate their experience and give them language for it.

**For people who already read the manifesto:** These posts are the STORIES BEHIND each section — why it was written, what personal experiences shaped it, what the founder learned. Not a repeat. A companion. Each post links back to the relevant manifesto section for readers who want the full academic treatment.

## Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Number of posts | 7 (one per article section, no appendices) | Appendices are too technical for blog. They become downloadable resources. |
| Source material | Follow the full article's section order exactly | Natural arc that builds. No remixing. |
| What differentiates from manifesto | Personal stories from `/interview` + "build in public" voice | Same ideas, different lens. Manifesto = framework. Blog = journey. |
| CTA progression | Escalates from low-friction to high-commitment | See per-post specs below |
| Frontmatter convention | `series: manifesto`, `series_order: N`, `series_total: 7` | Agents discover epic by convention: `_series-{name}.md` |
| Ghost organization | Tag: `manifesto-series`, separate Ghost section | Keeps manifesto posts visually distinct from regular build-in-public posts |
| Newsletter structure | Two Ghost newsletters: "Manifesto Series" + regular blog | Subscribers can opt into either or both |
| Drip automation | NOT NOW. Set up when content is done + 50+ subscribers | Content first, plumbing later. See "Drip Sequence Plan" below. |
| Length per post | 800-1200 words | Shorter than article sections. Interview adds, trimming removes — net similar. |
| Publishing cadence | One per week during initial publish | After all 7 exist, they become a static "Start Here" resource |
| Existing Post #1 | Rewrite to follow Section I | Current version is a mashup of multiple sections. Keep the title, rewrite the body. |

## Drip Sequence Plan

**Current state:** Ghost doesn't support native drip sequences. Posts publish as newsletter when you hit send.

**How others solve this:**
- Substack: built-in "welcome sequence" (we're not on Substack)
- ConvertKit/Beehiiv: native drip automation (free tier handles 1000 subs)
- Ghost creators: Ghost webhook → Zapier → ConvertKit sequence
- Custom: Ghost Admin API + Mailgun scheduled sends

**Our plan:**
1. **Now:** Write and publish all 7 posts. They live on the blog as a tagged section ("Manifesto Series") with a "Start Here" landing page linking them in order.
2. **When we have 50+ subscribers:** Set up ConvertKit free tier. Ghost "member.added" webhook → Zapier → ConvertKit automation sequence. New subscribers get one manifesto post per week via email, linking to the blog post.
3. **Regular blog posts** (build-in-public, AI coding, etc.) go through the normal Ghost newsletter, separate from the manifesto drip.

**Why not now:** Premature optimization. We don't have the content yet, and automation without subscribers is wasted effort. The "Start Here" page serves the same purpose manually.

## Per-Post Specs

Each spec defines: article section used, what to keep, what to trim, interview prompts for extracting personal stories, CTA, and how it connects to the previous/next post.

---

### Post 1: "I Got It. We Don't Need to Waste Time on This."

**Article Section:** I — The Frustration
**Status:** Exists at `content/blog/i-got-it-we-dont-need-to-waste-time.md` — needs rewrite to follow article section, not mashup

**Keep from article:**
- Opening hook ("Can you play back what you understood?")
- Audience validation (this is for you — the person who does the work)
- The frustration of intellectual integrity being blocked
- Spillover list (organizations, relationships, society)

**Trim:**
- The four-part solution roadmap ("Together we will...") — readers discover this post by post
- "The Vision" paragraph — save for Post 7
- Dense terminology (epistemic, coordination failure externality) — use plain language

**Interview prompts:**
- "When was the first time you asked someone to play back what they heard and got punished for it?"
- "What environment taught you to verify — was it work, a relationship, or something else?"
- "What's the emotional cost of seeing this every day and not being able to fix it?"

**CTA:** "Try paraphrasing in one conversation today. Just once. See what happens."
**Builds on:** Nothing — this is the entry point
**Hands off to:** Post 2 — "Same words, different worlds. Next time: why 'clean your room' means something different to everyone who hears it."

---

### Post 2: "Clean Your Room"

**Article Section:** II — The Universal Experience
**Status:** Not started

**Keep from article:**
- "Clean your room" example (different mental models)
- "Meet at 7" friendship example
- "I need space" relationship example
- The pattern recognition: same structure across all domains

**Trim:**
- Transition to organizational measurement (that's Post 3)

**Interview prompts:**
- "What's your 'clean your room' moment — when did you realize the same words meant completely different things to two people?"
- "In your romantic relationship, what phrase caused the most damage because each of you heard it differently?"
- "When did it click that this wasn't just miscommunication but a structural problem?"

**CTA:** "This week, when someone says they agree with you, ask: 'What does that mean to you?' You'll be surprised."
**Builds on:** Post 1 validated the frustration. Now we show it's EVERYWHERE.
**Hands off to:** Post 3 — "This isn't just personal. Organizations lose $1.2 trillion a year to this. Next: the bill nobody sees."

---

### Post 3: "The Bill Nobody Sees"

**Article Section:** III — The Organizational Cost
**Status:** Not started

**Keep from article:**
- $1.2 trillion annual stat
- 80% of leaders think comms are clear / 50% of employees agree
- Sarah & David story (product manager + engineer)
- Clarity Tax definition (latency in error correction)
- Clarity Debt as leading indicator

**Trim:**
- Formal Coordination Failure Externality framework (too academic for blog)
- Strategic Ambiguity deep dive (save for Post 5)

**Interview prompts:**
- "Tell me about the most expensive misunderstanding you witnessed at a multinational"
- "The co-founder separation — was there a specific moment of misalignment that started the crack?"
- "Have you ever calculated the actual cost of a miscommunication you experienced?"

**CTA:** "Calculate this for your team: how many hours last month were spent on rework that started with 'I thought you meant...'?"
**Builds on:** Post 2 showed it's everywhere. Now we prove it's EXPENSIVE.
**Hands off to:** Post 4 — "If everyone agrees this is a problem, why does it keep happening? Next: the cognitive blindspot that makes this invisible."

---

### Post 4: "The Blindspot You Can't See"

**Article Section:** IV — The Root Cause (Epistemic Fragility)
**Status:** Not started

**Keep from article:**
- Illusion of Transparency + tapping study (50% predicted vs 2.5% actual)
- Curse of Knowledge
- Mental models concept (maps in our heads)
- "Agile development" means different things to different people
- Healthcare proof: teach-back = 60% fewer readmissions
- "You cannot debug your own code while running it"

**Trim:**
- Formal epistemic fragility framework (use plain language)
- Naive Realism deep dive (too philosophical for blog)
- Premature Epistemic Closure cycle (too academic)
- Curiosity limitations section (interesting but makes the post too long)

**Interview prompts:**
- "When did you first learn about these biases? What was the 'oh shit' moment?"
- "Have you done the tapping experiment yourself? What happened?"
- "The healthcare proof — teach-back saves lives. Why hasn't every industry copied this?"

**CTA:** "Start a Clarity Session with someone you work with. Five minutes. You'll both be surprised."
**Builds on:** Posts 1-3 showed the problem. Now we reveal WHY it persists — your brain is structurally blind to it.
**Hands off to:** Post 5 — "It's not just cognitive bias. The rules of conversation are broken. Next: three structural forces that make verification almost impossible."

---

### Post 5: "The Three Asymmetries"

**Article Section:** V — The Broken Contract
**Status:** Not started

**Keep from article:**
- Three Asymmetries (Role, Information, Vulnerability) — this is the centerpiece
- Default assumptions (speed > accuracy, fluency > verification)
- Five psychological motives for refusing to verify
- The Measurement Gap (75% of research uses self-reports)
- The incentive gap (creator of ambiguity pays none of the cost)

**Trim:**
- Governance failure framing (too policy-like)
- Peer-governed accountability preview (save for Post 6)

**Interview prompts:**
- "Which asymmetry hits closest to home? Role, Information, or Vulnerability?"
- "Tell me about a time you stopped asking for verification because the other person punished you for it — the vulnerability asymmetry in action"
- "The measurement gap — you're building a tool to fix this. What made you realize nobody was measuring actual understanding?"

**CTA:** "Share this post with someone who 'gets it' — another calibrated listener who's tired of paying the price."
**Builds on:** Post 4 showed the cognitive blindspot. Now we show the STRUCTURAL forces.
**Hands off to:** Post 6 — "So what actually works? Next: a simple protocol that changes everything."

---

### Post 6: "What Actually Works"

**Article Section:** VI — The Solution (The Clarity Principle)
**Status:** Not started

**Keep from article:**
- The Clarity Principle as operational Golden Rule
- The Clarity Pledge (commitment statement)
- The opt-in mechanism (Clarity Agreement)
- Understanding Gap Test (the diagnostic)
- Clarity Protocol (State → Playback with "because" → Calibrate)
- Handling objections ("too slow", "culturally rude", "power dynamics")

**Trim:**
- Learning Organization disciplines reference (too business-school)
- Reinforcement loop / Celebration Engine (save for a future deep-dive post)
- Excessive formalism in the protocol description

**Interview prompts:**
- "How did you discover paraphrasing? What was the first time you tried it deliberately?"
- "You built a tool for this — what was the first experiment? What happened?"
- "The objections — 'too slow', 'rude'. Which one do you hear most? How do you respond?"
- "What's the Clarity Pledge mean to you personally — not the marketing version?"

**CTA:** "Come to a Clarity Event. Or sign the Clarity Pledge. Or both."
**Builds on:** Posts 1-5 built the problem. Now we deliver the solution.
**Hands off to:** Post 7 — "One conversation at a time. Next: from individual practice to something bigger."

---

### Post 7: "One Conversation at a Time"

**Article Section:** VII — From Individual to Societal Movement
**Status:** Not started

**Keep from article:**
- Start as an individual (three starting points)
- Scale through example, not mandates
- The existential imperative (increasing power + declining coordination)
- The democratic dividend (informed disagreement)
- "The Vision" paragraph (saved from Post 1 — this is where it belongs)

**Trim:**
- Aumann's Agreement Theorem (too academic)
- Three types of disagreement taxonomy (simplify)
- Formal Epistemic Alliance concept (use plain language)

**Interview prompts:**
- "Why are you building this? The real reason, not the pitch."
- "What's the dream? If this works, what does the world look like in 10 years?"
- "Your background — multinationals, startups, relationships. How did all of that lead here?"
- "What scares you about this project? What might not work?"

**CTA:** "Join the movement. Explore coaching. Read the full manifesto."
**Builds on:** Everything. This is the capstone.
**Hands off to:** Link to full manifesto + "Start Here" page + coaching landing page (when it exists)

---

## For Agents

### Interview Agent (`/interview`)

Before interviewing for any manifesto post:
1. Read THIS document (`_series-manifesto.md`)
2. Read `content/voice.md` and `content/strategy.md`
3. Check which post number you're working on
4. Use ONLY the interview prompts for that post — don't ask about topics covered in other posts
5. Know what came before (previous posts' topics) and what comes after (next post's topic)
6. The goal is to extract PERSONAL STORIES that make this post different from the manifesto section it's based on

### Prepare-Blog Agent (`/prepare-blog`)

Before writing any manifesto post:
1. Read THIS document
2. Read the corresponding article section (the skeleton)
3. Read interview output (the personal layer)
4. Read any completed earlier posts in the series (for continuity)
5. Follow the "Keep" and "Trim" specs for that post
6. Include the CTA and hand-off to next post
7. Ensure citations follow `voice.md` standards

### Ship-Blog Agent (`/ship-blog`)

When publishing manifesto posts:
1. Tag with `manifesto-series` in Ghost
2. Ensure series order is correct
3. Link back to relevant manifesto section
4. Include "Part X of 7" indicator

## Frontmatter Convention

```yaml
---
title: "Post Title"
status: draft | preparing | review | published
series: manifesto
series_order: 1
series_total: 7
---
```

Agents discover series epic by convention: `content/blog/_series-{series}.md`
