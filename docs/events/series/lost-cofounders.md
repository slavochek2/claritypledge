---
slug: lost-cofounders
title_prefix: "Clarity Experiment #"
title_format: "{prefix}{n}: {subtitle}"
title_n1_subtitle: "I've Lost Co-Founders. Here's How to Keep Yours."
cadence: on-demand
scheduling_rule: "Schedule ONLY when a real co-founder pair has confirmed a date. No autopilot cadence — an experiment that has no confirmed pair must not appear as a future public event."
day_of_week: thursday
time_local: "15:30"
timezone: Asia/Bangkok
duration_minutes: 60
host_id: a99042ef-e740-446a-8734-389c8589cc17
default_location: "Online — Google Meet"
meet_link: "https://meet.google.com/rdi-qdab-qca"
series_param: lost-cofounders
register_route: "/events/experiment"
short_link: experiment
register_cta: "Reserve two seats, yours and your co-founder's:"
---

# Operational notes (prose, not parsed)

## What this doc is

The reusable template for the **Clarity Experiment** live session series — the talk
Slava gives to acquire founders. Title + full event description below are the
single source of truth. When a pair confirms a date, this is what you clone into a
real public event (via `/slava:events:publish-event` or `scripts/seed-webinars.ts`),
then promote.

**Source-of-truth note:** the same `DESCRIPTION` text is currently duplicated in
`scripts/seed-webinars.ts` and `scripts/update-webinar-descriptions.ts`. Treat THIS
doc as canonical; when you change the copy here, sync those two scripts (they patch
prod).

## Scheduling rule (the whole reason future events were removed)

An experiment goes public **only after a co-founder pair has confirmed a date.**
There is no draft/hidden event state in the DB — any event row with a future date is
immediately public and `/events/experiment` redirects straight to it. So:

- No confirmed pair → no event row. `/events/experiment` cleanly shows
  "No upcoming sessions — check back soon."
- Pair confirms → create one real event from this template, fill the featured-pair
  block below, publish, promote, forward the live link.

## Featured pair (per-occurrence — fill before forwarding to a pair)

The base description below is host-only (Slava). If a specific guest pair is featured,
fill this block and splice it into the description before publishing. Until a pair
confirms, this stays as placeholders — this doc is what you forward so they see how
they'll be advertised.

```
**This session features [GUEST 1 NAME] & [GUEST 2 NAME].**
[GUEST 1 NAME] — [one-line bio / company / role].
[GUEST 2 NAME] — [one-line bio / company / role].
[1–2 sentences: what this pair will run live and why a watching pair should care.]
```

[FOUNDER DECISION: whether each occurrence features a guest pair, and exactly where
the block sits in the description — top hero vs. after "Why both of you". Not assumed.]

## Constants

- **Title (#1):** `Clarity Experiment #1: I've Lost Co-Founders. Here's How to Keep Yours.`
- **Numbering:** `#N` = experiments held, not weeks elapsed.
- **Registration:** all CTAs point at `/events/experiment` (canonical, P957); the
  legacy `/events/webinar` permanently redirects there. Don't hand out raw event slugs.
- **Format:** free, live, 60 min. Agenda: Presentation 20 · Live demo 10 · Q&A 30.

## Tone constraints

Direct, peer-to-peer. The proven copy below is approved — don't paraphrase it when
cloning. Edit only the title subtitle, the featured-pair block, and the date.

## Event description (canonical copy — clone verbatim)

About **65% of startups that fail, fail on co-founder conflict** [1]. But across 14 co-founders, I learned the hard way: most of those conflicts were never real disagreements. They were misunderstandings nobody checked, a silent assumption about equity, a "we agreed on this" that you didn't.

In this **free 60-minute live session** I'll show you the one habit that surfaces those gaps before they cost you months.

**Reserve two seats, yours and your co-founder's.**

---

**Why almost nobody checks.** You genuinely believe you were clear. Your co-founder genuinely believes they understood. You're both wrong, because nobody verified. Even people who communicate for a living miss it: 8 in 10 leaders think they're clear, half their people don't agree [2][3]. There's a specific social reflex that makes checking feel awkward, exactly when the stakes are highest, so we skip it. In the session I'll name that reflex, show the two cognitive biases that make the gap nearly certain, and give you the one move that flips it, in under a minute, without making it weird.

**What you'll learn**
- **My story.** How I raised €398k *without product-market fit*, and why verifying understanding was the factor that closed the round, the sale, and the product. It's the same skill behind the best operators and the strongest partnerships.
- **What multiple co-founder splits taught me.** I lost the early ones to misunderstandings I didn't yet know how to catch: a co-founder who silently assumed we'd revisit the equity split (9 months lost), a technical co-founder who disagreed that 5 prospect rejections were enough to know the product was failing (7 months lost). I'll show how each gap hid as "conflict," and the question that would have surfaced it in week one.
- **Partnerships that lasted.** Two co-founders, 3.5 and 3 years respectively — here's the mechanism that held them. The 3.5-year one disagreed with me constantly, carried real risk, and it held because every time he pushed back, I made sure we actually understood each other before deciding. Disagreement stopped being friction the moment it was verified.
- **The fix.** How to rule out misunderstanding before you treat something as a real disagreement, when values and interests actually clash.

**Why both of you.** This works best as a pair. You'll watch the exact move that surfaces a hidden gap, live, and leave able to run it with your co-founder yourselves using the free tool, in the session or after. Solo attendees get the theory; pairs get the mirror. Strong founders do this on purpose, it's not a sign anything's broken. Register, then forward your co-founder the confirmation.

**What to expect.** Every session is live, so no two run exactly the same. What's constant: you'll leave with the one habit that surfaces the gaps before they cost you, and at the end I'll share the Co-Founder Program with a founding discount for everyone who attends.

> "Real substance, not surface-level coaching. He opened up new perspectives around communication I hadn't fully seen before." — [Jan Barbarič](https://www.linkedin.com/in/janbarbari), Founder

**Agenda (60 min, live):** Presentation 20 · Live demo 10 · Q&A 30 (bring your own stories)

**Your host.** I'm Slava. I raised €398k without product-market fit, built B2B SaaS for six years, and closed it down. I studied why partnerships break, published a 60-page research paper on trust-building, and built ClarityPledge so founders can verify understanding before it costs them. I've lost co-founders. I help you keep yours.

**Free platform, optional program.** The ClarityPledge app is **free and open source** — that's the tool you'll practice with, and it's yours to keep. At the end of the session I'll spend a few minutes on the **paid Co-Founder Program** for pairs who want structure, facilitation, and a signed Clarity Partner Agreement, with a **founding discount for everyone who attends**. The session and the free tool stand on their own, whether or not the program is for you.

**Reserve two seats, yours and your co-founder's. Free.**

*Sources: [1] Wasserman, HBS (via Entrepreneur.com) · [2] Axios HQ · [3] Radical Candor, The Trust Gap · [4] Newton 1990, Stanford · [5] Camerer, Loewenstein & Weber 1989 · [6] Schegloff, Jefferson & Sacks 1977*
