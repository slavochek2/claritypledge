---
slug: social-hike
title_prefix: "Social Hike"
title_format: "{prefix}: {trail_name}"
cadence: weekly
day_of_week: sunday
time_local: "09:00"
timezone: Asia/Bangkok
duration_minutes: 270
host_id: a99042ef-e740-446a-8734-389c8589cc17
default_location: "{cafe_pin_url}"
short_link: hike
register_cta: "RSVP:"
promo_summary: "Morning hike near Chiang Mai. Coffee at the meeting point first, then a relaxed walk. Everyone welcome. RSVP: claritypledge.com/hike"
todo_today_join_type: walk-in
todo_today_exchange: free
todo_today_tags: ["hiking", "Outdoors", "Community", "Coffee"]
todo_today_category: "Sports & Fitness"
---

# Operational notes (prose, not parsed)

**This series changes its trail every week.** That makes it unlike the other series docs
here: the frontmatter above is what stays constant, and everything trail-specific
(`{trail_name}`, `{cafe_pin_url}`, distance, climb, quotes) is resolved per occurrence by
`/slava:events:select-hike` and `/slava:events:publish-run`.

## Why this file exists

Before it, the hike had no series doc at all. Two consequences, both real and both measured
on 2026-08-30 and 2026-09-06:

1. The **event description** was rebuilt from a blank template every run, so every wording
   improvement was discarded. The Sept 6 description added AllTrails reviewer quotes and
   star ratings to both the trail and the cafe. The Aug 30 one had neither. Without this
   file, run three starts from the template again and loses both.
2. The **platform promo blurb** had no `## Promo blurb` block to read, so the promotion
   stage fell through to its generated fallback on every single run — while the WhatsApp
   and Telegram group blurbs, which *do* have a saved home, carried over cleanly in four
   languages. One of three copy surfaces had memory.

## Description base — start here, don't start blank

`publish-run` builds the description from this shape, filling the bracketed fields from the
chosen trail and cafe. It is the Sept 6 description generalized — the best version so far,
which is the point.

```
Morning hike this [DAY]. Everyone welcome.

**[TRAIL NAME]**, [PARK NAME]
[DISTANCE] [TYPE], [ELEVATION]m climb, about [TIME] of walking. [2-3 HIGHLIGHTS]. "[BEST TRAIL QUOTE]" — one recent hiker ([RATING]★, [N] reviews).
[View on AllTrails]([ALLTRAILS_URL])

**Meet [TIME] at [CAFE NAME]**, [AREA].
[Directions]([CAFE_PIN_URL])

Coffee first — "[BEST CAFE QUOTE]" ([CAFE RATING]★, [N] reviews) — then we walk to the trailhead. Relaxed pace, we turn back whenever people have had enough.

**Bring:** trail shoes, 2L water, snacks, [warm jacket (it gets cooler at altitude), ]rain jacket, cap, mosquito spray, some cash.

[WEATHER — only if actionable, e.g. "Rain likely, around 40 percent."]

[WhatsApp group]([WHATSAPP_LINK]) for questions and cancellations.

Coffee or lunch after for anyone who feels like it.
```

**Rules that survived founder edits — do not undo them.**

- **Hard ceiling 150 words.** The founder cut the template from 350 to 113 words on
  2026-08-24 with the note "cut the bullshit."
- **Quotes are the improvement of 2026-09-06 and are now part of the base.** One for the
  trail, one for the cafe, each with its star rating and review count, each pulled from
  AllTrails / Google Maps reviews. Founder's own instruction: *"take some great descriptions
  from all trails, some quotes, best quotes... so people have a taste for where we meet and
  also the trail. Exclude things that make it sound too hard or too shitty."* Pick genuinely
  positive, concrete quotes; never a hedged or discouraging one.
- **Never state an entrance fee** — no amount, no range, even when AllTrails gives one.
  "some cash" in the bring-list is the only permitted form.
- **Warm jacket only when the trail gains real altitude** (founder added it for Doi Pui:
  *"bring warm jacket because on higher altitude its usually a bit colder"*). Drop the
  clause on low trails.
- No em dashes in the prose. Short sentences. Facts stay, framing goes.

## Promo blurb (external platforms)

<!--
Single source of truth for todo.today / Facebook / Luma descriptions. promote-all reads this
block, resolves placeholders, and passes the result to each platform sub-skill, which applies
ONLY platform formatting. Edit here to change all platforms at once. Placeholders:
  {short_url}     → claritypledge.com/events/hike  (auto-redirects to the latest hike)
  {register_cta}  → the register_cta frontmatter value
  {trail_name} {park} {distance} {type} {elevation} {walk_time} {highlights}
  {cafe_name} {area} {meet_time} {date} {altitude_clause}
Keep it plain text (no markdown) — the most restrictive platform wins.
-->

```
{register_cta} {short_url}

Morning hike this Sunday, {date}. Everyone welcome, no experience needed.

{trail_name}, in {park}
Meet {meet_time} at {cafe_name}, {area}. Coffee first, then we walk to the trailhead. Plan for about {duration} total.
{distance} {type}, {elevation}m of climb, about {walk_time} of walking. Relaxed pace, we turn back whenever people have had enough.
{highlights}
Bring trail shoes, 2L of water, snacks, {altitude_clause}a rain jacket, a cap, mosquito spray and some cash.
Coffee or lunch after for anyone who feels like it.

{register_cta} {short_url}
```

**Freshness guard (mechanical, not a judgement call).** Before this blurb goes to any
platform, assert the resolved text contains the current event's date string and the current
`{cafe_name}`. If either is missing, stop — the text is carried over from a past hike. This
mirrors the staleness check the group blurbs already run, and exists for the same reason:
saved copy is the thing that compounds, and also the thing that can silently describe last
month's trail. A stale blurb has zero unresolved placeholders and passes every other check.

## Link discipline

`claritypledge.com/hike` is the only destination, and it appears twice — once at the top,
once as the closing CTA. The short link auto-redirects to the newest hike, so never hardcode
a per-event slug in saved copy. Three things match this series by its exact title prefix
(`/hike` resolution, the group-chat mapping, and the short-link redirect) and all three fail
silently if the prefix drifts. Renaming "Clarity Hike" to "Social Hike" on 2026-08-24 broke
all three at once with no error.

## Cancellation playbook

1. Set `status = 'cancelled'` on the event row (UPDATE, not DELETE — state env per `.claude/rules/db-access.md`).
2. Post in the coordination WhatsApp group.
3. The event page renders the cancellation banner automatically.
