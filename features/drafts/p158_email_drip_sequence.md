---
status: backlog
type: task
priority: p2
tags: [content, ghost, email, automation]
rank: 125365.0
created_date: 2026-02-06
---

# P158: Email Drip Sequence for New Subscribers

## Problem

New blog subscribers should receive the 7-post manifesto series automatically over time, not just see it in the archive. Ghost doesn't support native drip sequences.

## Solution

Set up automated email sequence: new subscriber triggers weekly delivery of manifesto posts.

## Prerequisites

- [ ] All 7 manifesto posts written and published on Ghost (see `content/blog/_series-manifesto.md`)
- [ ] 50+ subscribers (threshold for automation investment)
- [ ] "Start Here" landing page on Ghost linking posts in order (manual fallback)

## Options Evaluated

| Approach | Effort | Cost | Notes |
|----------|--------|------|-------|
| **ConvertKit free tier + Zapier** | Low | Free (<1000 subs) | Ghost webhook → Zapier → ConvertKit sequence. Standard pattern. |
| **Beehiiv** | Medium | Free tier available | Would mean migrating newsletter from Ghost. Not worth it. |
| **Custom script (Ghost API + Mailgun)** | Medium | Free (Mailgun already set up) | More control, more maintenance. |
| **Ghost native** | N/A | N/A | Ghost doesn't support drip sequences. |

## Recommended Approach

**ConvertKit free tier + Zapier:**
1. Create ConvertKit account (free, handles 1000 subscribers)
2. Create 7-email automation sequence in ConvertKit, each linking to the Ghost blog post
3. Zapier: Ghost "member.added" webhook → add to ConvertKit → start sequence
4. Cadence: 1 email per week (7 weeks total)
5. After sequence completes, subscriber stays on regular Ghost newsletter only

## Sequence Content

Each email links to the published Ghost post + adds a personal intro line:

| Week | Post | Email subject line (draft) |
|------|------|---------------------------|
| 0 | #1: "I Got It" | "The moment you knew they didn't understand" |
| 1 | #2: "Clean Your Room" | "Same words. Different worlds." |
| 2 | #3: "The Bill Nobody Sees" | "$1.2 trillion. Every year." |
| 3 | #4: "The Blindspot" | "Your brain can't see this" |
| 4 | #5: "Three Asymmetries" | "Why verification is structurally impossible" |
| 5 | #6: "What Works" | "A protocol that actually changes things" |
| 6 | #7: "One Conversation" | "From you to everyone" |

## What This Is NOT

- Not a replacement for the Ghost newsletter (regular posts still go through Ghost)
- Not a sales funnel (it's education + trust building)
- Not urgent (manual "Start Here" page works until we have enough subscribers)

## When to Start

After all 7 manifesto posts are published AND subscriber count reaches 50+. Until then, the "Start Here" page on Ghost serves the same purpose.

## Related

- Series epic: `content/blog/_series-manifesto.md`
- Content strategy: `content/strategy.md`
- Ghost blog docs: `docs/technical/ghost-blog.md`
