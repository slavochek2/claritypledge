---
status: in-progress
type: story
workstream: C2
rank: 1
tags: []
created_date: 2026-01-20T00:00:00.000Z
locked_at: '2026-02-28T09:34:21.114Z'
---
# P79: Consulting & Revenue Model

## Status: Planning

## Key Decision: Two Separate Brands

| Brand | Purpose | Revenue |
|-------|---------|---------|
| **ClarityPledge** | Movement (pledge, methodology, community) | Free / future platform revenue |
| **Slava Coaching** | Personal consulting business | Paid coaching sessions |

These are **linked but separate**:
- ClarityPledge `/about` mentions Slava as founder → links to coaching
- Slava Coaching mentions "Founder of ClarityPledge" → credibility

**Why separate:** The movement shouldn't be monetized directly. Coaching is Slava's personal business.

---

## The Funnel: Events → Coaching

**Key insight:** Events are the marketing. The coaching page is just a landing spot.

```
┌─────────────────────────────────────┐
│  Slava runs ClarityPledge events    │  ← Free or cheap
│  (online or in-person)              │
└─────────────────┬───────────────────┘
                  ↓
┌─────────────────────────────────────┐
│  Attendees experience the method    │  ← Value delivered
└─────────────────┬───────────────────┘
                  ↓
┌─────────────────────────────────────┐
│  Small pitch at end of event        │  ← "Want to go deeper?"
└─────────────────┬───────────────────┘
                  ↓
┌─────────────────────────────────────┐
│  Some book Slava Coaching           │  ← Paid sessions
└─────────────────────────────────────┘
```

**This is a virtuous loop:**
- Events validate ClarityPledge (H2)
- Events generate coaching clients
- Coaching funds more events
- More events = more validation + more clients

**Implication:** Don't optimize the coaching page. Optimize the events.

### First Event (Priority #1)

| Question | Options to Consider |
|----------|---------------------|
| **Format** | Online (Zoom) vs In-person |
| **Topic** | Clarity methodology? Or startup coaching topic? |
| **Size** | Small (5-10) vs Medium (20-30) |
| **Price** | Free vs Paid ($20-50) |
| **Pitch** | What do you offer at the end? |

**Recommendation:** Start small and free. 5-10 people, online, 60-90 min. Learn before scaling.

---

## Slava Coaching: The Business

### Entry Point: Co-founder Calibration

**Key decision (2026-02-27):** Lead with co-founder relationship calibration — not generic startup coaching. Calibration is the unfair advantage. Other services (lean startup, sales, fundraising) become upsells after clients experience the core.

### Services — Three Tiers

| Tier | Name | Price | Format |
|------|------|-------|--------|
| **1** | Co-founder Calibration Session | €350 | 90 min, pair session |
| **2** | Calibration Partner (Retainer) | €900/month | Monthly session + 2 async reviews |
| **3** | Team Calibration Workshop | €1,800 | Half-day, 3–8 people |

Session 1 is always Tier 1. Tiers 2 and 3 are upsells after value is demonstrated.

**Do NOT list yet:** Lean Startup, CustDev, Sales, Fundraising coaching — available as organic upsells but not on the page. Keeps offer focused and avoids "generalist" positioning.

### Credentials

- 10 years in sales coaching and consulting
- Raised €400k for own startup
- Founded ClarityPledge (methodology for understanding gaps)
- Direct experience with co-founder dynamics: been in the room when teams split, and when they didn't

### Site

**Domain:** ladischenski.com ✅ (confirmed available, ~€10/year on Cloudflare)
**Location:** ~/Projects/public/ladischenski-com/ (separate repo, deployed to Vercel)
**Tech:** Next.js + Tailwind — built 2026-02-27

**Why ladischenski.com over slava.coach:** slava.coach taken; .coach TLD costs ~€58/year. ladischenski.com is cheaper, .com authority, permanent personal brand regardless of service evolution.

**Why separate from claritypledge.com:** ClarityPledge is a brand/movement. ladischenski.com is Slava's personal hub. Same logic as Stripe vs Patrick Collison.

### Booking

**Google Calendar Appointment Schedules** (not Cal.com):
- Already available via Google Workspace
- One slot type: "30-min intro call, no pitch"
- Switch to Cal.com + Stripe at client 5–6 when manual invoicing becomes friction

### Discovery

Content CTA pattern — append to every blog post, LinkedIn piece, event description:
> "I work with co-founders on alignment gaps — the ones you don't see until they're expensive. [30-min intro call, no pitch.](LINK)"

Private reference doc: `.private/docs/slava-coaching.md`

---

## ClarityPledge Revenue (Future)

Keep this separate from Slava Coaching. Future options:

| Model | Description | When |
|-------|-------------|------|
| **Event Organizer SaaS** | Tools for organizers to run Clarity events | After H2 validated |
| **Enterprise** | Private instance for large orgs | After product-market fit |

---

## Open Questions (Need Answers)

### Priority 1: First Event

| Question | Why It Matters |
|----------|----------------|
| **What's the event topic?** | Clarity methodology? Lean startup? Customer dev? |
| **Online or in-person?** | Online = easier to start. In-person = higher impact. |
| **When?** | Date creates urgency. Pick one. |
| **Who do you invite?** | Your network. LinkedIn? Slack communities? Friends? |
| **What's the pitch at the end?** | "Book a 1:1 session" or "Join my next workshop"? |

### Priority 2: Coaching Page (Can Wait)

| Question | Why It Matters |
|----------|----------------|
| **Bio** — 2-3 sentences about you? | Core of the page |
| **Prices** — What do you charge per session? | Cal.com needs this |
| **Photo** — Do you have a good headshot? | Trust signal |
| **Domain** — slava.coach? ladischenski.com? Other? | Where it lives |

### Success Metrics

| Question | Why It Matters |
|----------|----------------|
| **What's a "win" for first event?** | 5 attendees? 10? Good feedback? |
| **What's a "win" in 30 days?** | 1 paid coaching session? 3 events run? |

---

## Next Steps (Revised Priority)

**Phase 1: First Event (do this first)**
1. [ ] Pick event topic and format
2. [ ] Pick a date (within 2 weeks)
3. [ ] Create simple event page (Luma, Eventbrite, or just a Google Form)
4. [ ] Invite 20+ people, aim for 5-10 attendees
5. [ ] Run event, pitch coaching at end
6. [ ] Learn what worked

**Phase 2: Coaching Infrastructure (2026-02-27 — IN PROGRESS)**
1. [x] Decide services + pricing (three tiers, calibration-first)
2. [x] Choose domain: ladischenski.com
3. [x] Write private reference doc: `.private/docs/slava-coaching.md`
4. [ ] Register ladischenski.com on Cloudflare (user action)
5. [ ] Build ladischenski.com (Next.js, in progress)
6. [ ] Set up Google Calendar Appointment Schedules
7. [ ] Point DNS to Vercel
8. [ ] Add CTA to LinkedIn bio
9. [ ] Add CTA to next blog post/LinkedIn piece

---

## ClarityPledge Changes Needed

Minimal:

| Change | Why |
|--------|-----|
| Update `/about` page | Add link to Slava Coaching site |
| Optional: `/co-create` | Could mention "or work with Slava directly" |

No new features required in the platform.

---

## Related

- [theory-of-change.md](../docs/theory-of-change.md) — H2 validation requires events
- P78 (User Personas) — Event Organizer persona = Slava first
- [lean-canvas.md](../docs/lean-canvas.md) — Revenue streams section

## Changelog

| Date | Change |
|------|--------|
| 2026-02-27 | Major update: calibration-first positioning, three tiers, ladischenski.com domain confirmed, Google Calendar for booking, site build started |
| 2026-01-25 | Added funnel model: events → coaching. Reprioritized: run event first, build page second |
| 2026-01-25 | Clarified two-brand strategy, updated services based on real demand, added KISS proposal |
| 2026-01-20 | Initial spec from innovation strategy session |
