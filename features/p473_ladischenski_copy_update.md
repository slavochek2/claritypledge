---
status: today
type: feature
rank: 1000004
workstream: C2
created_date: 2026-03-03
tags: [ladischenski, copy, acquisition]
# For complete frontmatter specification, see docs/technical/feature-specs.md
---

# P473: ladischenski.com copy update — co-founder focus, AI meetup Lab as channel hook

## Why This Matters

ladischenski.com is the primary booking channel for Calibration Labs (C2 milestone). The current copy positions Slava as a co-founder coach ("I've lost co-founders. I help others keep theirs.") — the core framing stays, but two things need updating:

1. **The channel picture is incomplete.** The site currently implies "reach out for a session" as the main CTA. But the real acquisition path is: attend a free Calibration Lab → experience the gap → create a partner agreement. The Lab is the front door, not a one-on-one booking.

2. **AI business meetups are now a Lab venue.** Slava is running Calibration Labs at AI-adjacent communities (AI business meetup in ~1 week). The site should acknowledge this cast-wide approach without abandoning the co-founder positioning.

**What NOT to do:** Do not pivot the site to "AI calibration" or "listening to AI" as primary positioning. That angle was considered and set aside (see `docs/decisions.md` 2026-03-03 [product]: AI calibration as demo vehicle). AI is a Lab venue, not the product.

## Strategic Context

- `docs/decisions.md` 2026-03-03: "Content-led inbound is primary outbound channel; direct cold outreach dropped"
- `docs/decisions.md` 2026-03-03: "AI calibration as demo vehicle (not a market); pivot to AI market considered and rejected"
- `docs/lean-canvas.md` Channels (Track 2): Calibration Lab workshops are PRIMARY; content-led inbound is secondary. Direct outreach dropped.
- `docs/milestones/c2-workshops.md` Channel 1: cast wide — founders, operators, coaches, AI practitioners

## What Needs to Change

**Primary CTA:** shift from "book a session" to "join a free Calibration Lab" — this is the actual offer.

**Headline / hook:** keep co-founder angle but make the Lab the offer. Something like:
> "Most co-founders think they understand each other. Most don't. Find out where your gaps actually are — free, 90 minutes."

**Venue language:** optionally add one line that Labs run in founder communities and AI-adjacent events — signals that entry points are varied without making AI the headline.

**Services section:** keep the retainer / session pricing as-is (valid for inbound), but de-emphasize it relative to the Lab CTA.

## Copywriting Exploration (Part of This Task)

Before rewriting, explore: **what's the best copywriting approach for this type of site?**

Questions to answer:
- What copywriting frameworks apply here (PAS, AIDA, story-led, etc.)?
- What's the right voice for Slava's personal brand vs. a product brand?
- Should the Lab be positioned as a "workshop", "session", "experiment", or "lab"? Each signals different things.
- How do you write a CTA that doesn't feel like a sales page when the offer is free?
- Are there reference sites / personal coaching brands doing this well?

This research should inform the rewrite, not just produce one. Output: a short brief (positioning + voice + CTA approach) before touching any code.

## Repo

`~/Projects/public/ladischenski-com` — separate from cp. Next.js 16, React 19, Tailwind CSS 4. Deploy via `vercel deploy --prod`.

See `MEMORY.md` > ladischenski.com for full stack, deploy command, and design system notes.

## Steps

1. Research: copywriting frameworks for personal coaching / calibration product (see Exploration above)
2. Draft: positioning brief (hook + voice + CTA approach), review before writing any code
3. Implement: update headline, sub-headline, primary CTA, services section
4. Deploy: `vercel deploy --prod` with token from `.env.local`

## Done When

- [ ] Copywriting brief drafted and reviewed
- [ ] Headline positions the free Calibration Lab as the primary offer
- [ ] AI business meetups mentioned without making AI the headline product
- [ ] "Book a session" CTA de-emphasized (still present for inbound, not the lead)
- [ ] Deployed to production
