---
slug: ai-running-club
title_prefix: "AI Running Club Chiang Mai"
title_format: "{prefix} #{n} — Sun {date}"
cadence: weekly
day_of_week: sunday
time_local: "09:00"
timezone: Asia/Bangkok
duration_minutes: 120
host_id: a99042ef-e740-446a-8734-389c8589cc17
default_location: "Fernpresso at Lake, Chiang Mai, Thailand"
short_link: ai-run
register_cta: "IMPORTANT please register to secure your seat:"
sola_group: 4seas
todo_today_join_type: walk-in
todo_today_exchange: free
todo_today_tags: ["running", "Networking", "Coffee", "Community"]
todo_today_category: "Sports & Fitness"
---

# Operational notes (prose, not parsed)

## Cancellation playbook

1. Set `status = 'cancelled'` on the event row (per `.claude/rules/db-access.md`: state env, disambiguate intent — this is UPDATE, not DELETE).
2. Post in WhatsApp: *"AI Running Club #N this Sunday is cancelled. Next run: [date]. See you then!"*
3. `EventDetail.tsx:263-291` handles the cancellation banner UI automatically.

## Numbering rule

`#N` = events held, not weeks elapsed. Skipped Sundays do not increment.

## Talks reservation

Description directs attendees to join the WhatsApp group and DM Slava to reserve one of 3 lightning-talk slots (5 min + 5 min Q&A). Spontaneous talks welcome if slots remain.

## Tone constraints

Direct, peer-to-peer, brief. Avoid corporate cadence ("synergy/community/journey"). Match Chiang Mai expat/digital-nomad register.

## Photos

Take 3–5 photos during every run, save as `photo_YYYY-MM-DD_HH-MM-SS.jpg` in `~/Downloads/`. Newest matching file = next event's banner. (Convention — user provides path explicitly when skill asks.)

## Luma posting

T+24h after claritypledge. Run `/promote-luma <slug>` the day after `/re-create-event` completes.

## Promo blurb (external platforms)

<!--
Single source of truth for todo.today / Facebook / Luma descriptions. promote-all reads
this block, resolves placeholders, and passes the result to each platform sub-skill, which
applies ONLY platform formatting (char limit, plain vs markdown). Edit here to change all
platforms at once. Placeholders:
  {short_url}     → claritypledge.com/events/{short_link}   (auto-resolves to the latest event in the series)
  {register_cta}  → the register_cta frontmatter value
Keep it plain text (no markdown) — the most restrictive platform (Luma contenteditable) wins.
-->

```
Morning run around the lake, then an AI discussion over coffee. All levels welcome.

{register_cta} {short_url}

• Short loop ~20 min, or long loop ~45–60 min
• Slow, conversational pace (7–10 km/h)
• Quiet lakeside paths — open air, nature

After the run: a discussion round I moderate over coffee — we go around the table: what you're working on, where you're stuck, your open AI questions, a recent surprise, and one thing you're certain about (open to challenge). Spontaneous lightning talks welcome.

Bring a hat — the sun's strong on the open paths.

{register_cta} {short_url}
```

## WhatsApp blurb

<!-- promote-all reads this section and offers it for reuse. Edit here to update for next run. -->

```
Guys, join us this Sunday for AI Running Club #2 🏃

9 AM · Fernpresso at the lake · Chiang Mai
Run together (20 or 45 min, your pace), then lightning AI talks at the café.

All levels — just show up.
claritypledge.com/events/ai-run
```
