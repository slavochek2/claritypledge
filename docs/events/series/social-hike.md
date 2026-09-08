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
sola_group: 4seas
register_cta: "RSVP:"
# 140-char Eventbrite cap. Measured WITH the resolved {short_url} incl. its ?d= suffix: 135.
# The link used to be hardcoded and bare (132 chars) — which unfurled a cached preview of an
# OLDER hike on any platform that caches by posted URL (observed: Telegram). See promote-all.md § "Short-link cache-buster".
# Only "first" was dropped from the original wording: keeping it measures 141, one char over.
# Do not re-lengthen without re-measuring the RESOLVED string.
promo_summary: "Morning hike near Chiang Mai. Coffee at the meeting point, then a relaxed walk. Everyone welcome. RSVP: {short_url}"
todo_today_join_type: walk-in
todo_today_exchange: free
todo_today_tags: ["Hiking", "Nature Walk", "Community", "Coffee"]
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

Coffee first — "[BEST CAFE QUOTE]" ([CAFE RATING]★, [N] reviews) — then we walk to the trailhead.

We aim for the full loop, but the mountain decides. There are many paths here, and when one does not work we take another. That is usually the best part of the day.

We walk at the pace of the slowest person, so nobody who wants to keep going gets dropped. If you would rather do a shorter day, turn back whenever you like.

**Bring:** trail shoes, 2L water, snacks, [warm jacket (it gets cooler at altitude), ]rain jacket, cap, mosquito spray, some cash.

Plan for [QUOTED] of hiking, likely more. I have blocked until [END TIME] so nobody has to watch the clock, and we will almost certainly finish earlier. [WEATHER — only if actionable, e.g. "Rain likely, around 40 percent."]

Coffee or lunch after for anyone who feels like it.

*Not a commercial or guided hike. Nobody charges and nobody leads. I walk it like everyone else, and we are all adults looking after ourselves. Nothing is guaranteed. I try to make it a good morning because I want to, not because I am responsible for it.*
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
- **The terms line ships on every hike and is not optional.** Free, unguided, unled; attendees
  responsible for themselves; no schedule, no guarantees; goodwill stated as an intention rather
  than an obligation. Founder's framing, 2026-09-07: *"out of goodwill I try to make sure people
  feel happy, but this is my personal ambition and not an official responsibility"* and
  *"I'm one of them, equal. We are all adults taking care of ourselves."* The equality clause
  is the load-bearing half — the line must read as a participant describing a walk, never as an
  organiser disclaiming liability. Two sentences,
  no more — it must read as a plain statement, not a waiver. If the 150-word ceiling bites, cut a
  highlight, never the terms.
- **The WhatsApp invite link never appears in the description.** It is written to the
  registration-gated field (`event_private_info.group_chat_url`, P1194) and renders as a
  "Join WhatsApp group" button for registered attendees only. A raw link in the public description
  hands the group to every visitor and defeats the gate. The description carries only the one-line
  pointer above, which is also a reason to register. That line is not invented here — it is the
  wording the founder shipped by hand on the 2026-09-06 event; keep it.
- **Two duration numbers, and they are not the same number.** The description quotes AllTrails'
  walk time × 1.35 plus 30 min for coffee, rounded up. The event's stored duration is that plus an
  hour of slack, rounded up to the next full hour — the OUTER bound, what someone should keep
  free. A hard end time equal to a figure the copy calls "likely more" contradicts itself, and the
  calendar invite is the version people actually plan around (founder, 2026-09-07: *"if its 6.5
  hours then end is probably 17:00?"*). Name both in one sentence and let finishing early be the
  good outcome.
- **Recompute both numbers every run; never reuse last week's.** The multiplier is 1.35 (revised
  down from 1.4 on 2026-09-07) and the end time is `start + duration_minutes` for the trail in
  hand. The Sept 13 hike's "6.5 hours" and "17:00" belong to that trail alone. A shorter trail
  that still quotes them reads perfectly plausibly and is silently wrong — nobody re-derives a
  number that looks right, which is exactly why it has to be derived rather than carried. Founder,
  2026-09-07: *"lets not fix for next time 17:00 specifically."*
- **Flexibility is the promise, not a fixed route.** Replace any "we turn back whenever people have
  had enough" phrasing with the adapt-to-the-mountain framing above, and always name the
  shorter-walk option explicitly. Founder, 2026-09-07: *"we try to walk around the distance we
  want. If there are sections that are not working well we just take a slightly different path.
  There are many paths, so expect to be flexible. We adapt to the environment."* And: *"if there
  are people who want to make a shorter hike that's totally ok with me, they can cut it short any
  time if tired."* Frame it as a feature of the walk, never as an apology or a warning.
- **Keep the two promises separate — they are about different people.** "We wait" applies to
  whoever wants to keep walking; "leave early" is a free choice for whoever doesn't. Collapsing
  them into one line like *"turn back whenever you like, nobody is left behind"* contradicts
  itself: it offers you the exit and then calls taking it abandonment (founder, 2026-09-07 — *"we
  dont leave behind those who want to walk, not those who want to make shorter path"*). Two
  sentences, one per promise, and let leaving read as a decision rather than a failure.
- **Write it the way Pinker's *The Sense of Style* asks: classic prose, a window onto the thing.**
  Point at the mountain, not at the writing. Cut every "come expecting to", "it is worth noting",
  "we stay flexible" — metadiscourse about the walk instead of the walk. Prefer the concrete
  subject doing the acting ("the mountain decides") over the abstraction ("adapt to the
  environment"). Cut hedges that add no information. Shorter is the test: the 2026-09-07 rewrite
  said more in 65 words than its predecessor did in 95.
  The commonest offender is a sentence whose only subject is the sentence before it. *"Turn back
  whenever you like. That is a choice, not a problem."* — the second adds no fact and quietly
  implies someone might have thought it was a problem. Founder, 2026-09-07: *"not sure what is its
  value."* Give the permission once, plainly, and stop.
- **The description does NOT mention the group chat at all. The terms line ends it.** `EventDetail`
  renders the group-chat block immediately after the description and before the RSVP block, and
  that block ships its own copy in both states — the locked one reads *"Register and you'll get an
  invitation to our private WhatsApp group, right here — last-minute changes, cancellations, and
  coordinating rides to the mountain."* A pointer line in the description is that same sentence
  twice, back to back, which is how it read on 2026-09-07 before it was removed. Let the component
  speak; end the description with the terms.
- No em dashes in the prose. Short sentences. Facts stay, framing goes.

## Banner from a group photo — the recipe, so it is not re-derived

The event page renders the banner at about **5.85:1** on desktop (1497x256) and **1.95:1** on
mobile (375x192), `object-fit: cover`, centred. A portrait group photo cannot fill either without
cutting people: a naive upload on 2026-09-07 sliced everyone at chest height and removed the
kneeling person from the frame entirely.

**What works:** crop a horizontal band that contains every face with headroom, then pad left and
right with a blurred copy of the same photo out to the desktop ratio. Faces survive both widths;
only the blurred fill is lost on mobile.

```bash
# SRC is the prepped photo. Adjust the crop Y offset until every face has headroom.
ffmpeg -y -i "$SRC" -filter_complex "\
[0:v]crop=1440:560:0:915[fg];\
[0:v]scale=3276:-1,crop=3276:560:0:ih/2-280,boxblur=34:2,eq=brightness=-0.04[bg];\
[bg][fg]overlay=(W-w)/2:0[out]" -map "[out]" -frames:v 1 -q:v 2 banner.jpg
```

Upload with `x-upsert: true` — `event-photo-prep.sh` skips an object that already exists, so a
re-crop uploaded through it silently does nothing.

**Then look at it at both widths before promoting.** The founder's requirement is that no face and
no person is cropped out; a successful upload is not evidence of that.

## Promo blurb (external platforms)

<!--
Single source of truth for todo.today / Facebook / Luma descriptions. promote-all reads this
block, resolves placeholders, and passes the result to each platform sub-skill, which applies
ONLY platform formatting. Edit here to change all platforms at once. Placeholders:
  {short_url}     → claritypledge.com/hike?d=<YYMMDD event date>  (bare-domain form; auto-redirects to
                    the latest hike; the ?d= cache-buster is MANDATORY — a bare short link
                    unfurls a cached preview of an older hike on Telegram/WhatsApp/FB/Sola.
                    Canonical rule: promote-all.md § "Short-link cache-buster")
  {register_cta}  → the register_cta frontmatter value
  {trail_name} {park} {distance} {type} {elevation} {walk_time} {highlights}
  {cafe_name} {area} {meet_time} {date} {altitude_clause} {duration}
Keep it plain text (no markdown) — the most restrictive platform wins.
-->

```
{register_cta} {short_url}

Morning hike this Sunday, {date}. Everyone welcome, no experience needed.

{trail_name}, in {park}
Meet {meet_time} at {cafe_name}, {area}. Coffee first, then we walk to the trailhead. Plan for about {duration} total.
{distance} {type}, {elevation}m of climb, about {walk_time} of walking. Relaxed pace. We wait for whoever is slowest, and you can cut it short whenever you like.
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

`{short_url}` (which resolves to `claritypledge.com/hike?d=<YYMMDD>`) is the only
destination, and it appears twice — once at the top,
once as the closing CTA. The short link auto-redirects to the newest hike, so never hardcode
a per-event slug in saved copy. Three things match this series by its exact title prefix
(`/hike` resolution, the group-chat mapping, and the short-link redirect) and all three fail
silently if the prefix drifts. Renaming "Clarity Hike" to "Social Hike" on 2026-08-24 broke
all three at once with no error.

## Cancellation playbook

1. Set `status = 'cancelled'` on the event row (UPDATE, not DELETE — state env per `.claude/rules/db-access.md`).
2. Post in the coordination WhatsApp group.
3. The event page renders the cancellation banner automatically.
