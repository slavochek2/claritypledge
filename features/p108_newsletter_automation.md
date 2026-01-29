# P: Newsletter Automation

**Status:** Active (Phase 0.0)
**Created:** 2026-01-28
**Goal:** Automated content pipeline from creation to multi-platform distribution

---

## Context

Newsletter serves two purposes:
1. **Audience building** — Warm leads for coach outreach
2. **Content documentation** — Captures learnings from validation journey

**Decision:** Ghost self-hosted + n8n for independence and automation.

**Timing:** Full automation is Phase 2+. Start with manual, automate after validation.

---

## Architecture (Target State)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Create    │────▶│  Transcribe │────▶│   Draft     │
│   Content   │     │  (Whisper)  │     │  (Claude)   │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Approve +  │
                                        │  Reflect    │
                                        └──────┬──────┘
                                               │
          ┌────────────────────────────────────┼────────────────────────────────────┐
          ▼                                    ▼                                    ▼
   ┌─────────────┐                      ┌─────────────┐                      ┌─────────────┐
   │   Ghost     │                      │  LinkedIn   │                      │  Twitter    │
   │  (Email)    │                      │  (Post)     │                      │  (Post)     │
   └─────────────┘                      └─────────────┘                      └─────────────┘
          │
          ▼
   ┌─────────────┐
   │  Supabase   │
   │  User Sync  │
   └─────────────┘
```

---

## Phases

### Phase 1: Manual (Week 1-2)

| Component | How |
|-----------|-----|
| Write content | You + Claude |
| Newsletter | Ghost self-hosted (Google Cloud credits) |
| LinkedIn | Copy-paste from newsletter |
| Twitter | Copy-paste excerpt |
| Subscriber list | Ghost only |

**Setup:** Ghost self-hosted on Google Cloud (using $25K credits)

**Goal:** Validate content resonates, build habit, 100 subscribers

### Phase 2: Semi-Automated (Week 3+, after first event)

| Component | How |
|-----------|-----|
| n8n workflow | Ghost publish → triggers LinkedIn/Twitter |
| Image generation | AI-generated headers |
| Scheduling | Weekly cadence automated |

**Goal:** Reduce friction, maintain consistency

### Phase 3: Full Pipeline (After PMF)

| Component | How |
|-----------|-----|
| Audio → transcript | Whisper (Google Cloud) |
| Transcript → draft | Claude API |
| Subscriber = User | Ghost webhook → Supabase |
| Podcast integration | RSS feed from Ghost |

**Goal:** Events/interviews automatically become content

---

## Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Newsletter platform | Ghost (self-hosted) | Full control, API, database access |
| Automation | n8n (self-hosted) | Open source, flexible |
| Hosting | Google Cloud | $25K credits available |
| Email sending | TBD | Postmark, SendGrid, or SES |

---

## Subscriber = User Sync (Future)

**Idea:** Every newsletter subscriber is also a Clarity Pledge user.

**How it would work:**
1. New Ghost subscriber triggers webhook
2. n8n catches webhook
3. Creates user in Supabase
4. Links `newsletter_subscriber_id` to user profile

**Benefits:**
- One source of truth
- Newsletter is onboarding funnel
- Can track: subscriber → user → coach/team

**Deferred until:** 100+ subscribers, validated that it matters

---

## Content Cadence

| Frequency | Content Type |
|-----------|--------------|
| Weekly | Newsletter issue (reflection on learnings) |
| Per issue | LinkedIn post (excerpt/teaser) |
| Per issue | Twitter thread (key insight) |
| Monthly | Podcast/interview (if started) |

---

## Not Building Now

- Full automation pipeline
- AI image generation
- Podcast hosting
- Subscriber = User sync
- Multi-platform scheduling

**Focus:** Manual posting, validate content resonates, build habit.

---

## Related

- [roadmap.md](../docs/roadmap.md) — Phase 0.0 mentions newsletter
- [p_coach_validation.md](p_coach_validation.md) — Newsletter invites from coach conversations
- [lean-canvas.md](../docs/lean-canvas.md) — Newsletter as channel
