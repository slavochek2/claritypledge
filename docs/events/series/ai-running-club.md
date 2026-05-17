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
