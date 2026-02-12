---
status: week
type: story
milestone: C2
sort_order: 0.078125
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

### Services (Based on Real Demand)

What people actually ask Slava for:

| Service | Description |
|---------|-------------|
| **Lean Startup Coaching** | Lean canvas, MVP strategy, iteration |
| **Customer Development Coaching** | Interview techniques, insight synthesis |
| **Sales Coaching** | Early sales, founder-led sales |
| **Fundraising Coaching** | Pitch prep, investor strategy |

### Credentials

- 7 years running consulting agency (has old testimonials)
- Raised $400k for own startup
- Founded ClarityPledge (methodology for understanding gaps)
- Hands-on experience: multiple co-founder separations, corporate, startups

### KISS Solution: One-Page Site

**What it needs:**

1. **Who you are** — 2-3 sentence bio + photo
2. **What you offer** — 4 services listed above
3. **Why trust you** — credentials above
4. **Book now** — Cal.com links with prices

**No blog, no case studies page, no testimonials section (yet).**

### Tech Options

| Option | Effort | Cost |
|--------|--------|------|
| Cal.com profile only | Zero | Free |
| Carrd one-pager | 1 hour | $19/year |
| Vibe-coded page | 2-3 hours | Domain cost |

**Recommendation:** Start with Carrd or Cal.com profile. Add custom site later if needed.

### Booking & Payment

**Cal.com** (not Calendly):
- Free tier includes Stripe payments
- Open source (fits brand)
- Embeddable
- Each event type = mini service page with description + price

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

**Phase 2: Coaching Page (after first event)**
1. [ ] Set up Cal.com with Stripe
2. [ ] Create coaching session types with prices
3. [ ] Build simple one-pager (Carrd or Cal.com profile)
4. [ ] Link from ClarityPledge `/about`

**Why this order:** The event teaches you what to put on the coaching page. Don't guess — learn from real attendees first.

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
| 2026-01-25 | Added funnel model: events → coaching. Reprioritized: run event first, build page second |
| 2026-01-25 | Clarified two-brand strategy, updated services based on real demand, added KISS proposal |
| 2026-01-20 | Initial spec from innovation strategy session |
