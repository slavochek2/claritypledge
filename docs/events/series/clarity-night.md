---
slug: clarity-night
title_prefix: "Clarity Night"
title_format: "{prefix} #{n}: {topic}"
cadence: on-demand
timezone: Asia/Bangkok
default_location: "Zuzalu Library, 4Seas Nimman, Chiang Mai"
sola_group: 4seas
# Series short link: /night resolves to the nearest upcoming Clarity Night (api/series-redirect.ts).
# Always posted with the ?d=<YYMMDD> cache-buster (promote-all.md § "Short-link cache-buster").
# Per-topic links (e.g. /aisafety) are optional extras, never required.
short_link: night
# Narrows the operator's platform list (promote-all step 0). Eventbrite is off for all events.
platforms: ["todo-today", "facebook-personal", "facebook-groups", "luma", "sola"]
---

# Clarity Night — series doc

What the night is and how it is named: [clarity-forum.md](../clarity-forum.md) (series name, title
format) and [clarity-practice-event.md](../clarity-practice-event.md) (run-of-show). Creating the
event page: `/slava:disagreement:clarity-night-publish`. This file owns only **how a Clarity Night is
promoted**, because it is promoted differently from hikes and runs, and on 2026-09-14 the whole plan
had to be rebuilt by hand (founder: *"save the settings somehow to indicate how it is promoted
because it's promoted differently"*).

**Who, by name, lives in `.private/event-channels.json` under the `clarity-night` type** — group
chat IDs, the organisers to ask, the working sheet. This public file names roles only.

## Promotion recipe

Codified from event #1 (AI safety, 2026-09-18), promoted 2026-09-14 and 2026-09-15. Run the steps
in this order. Steps 4 to 6 are **part of the run, not the optional DM stage** hikes have.

**Two phases, always (founder, 2026-09-29).** Phase 1 = steps 1 and 2: publish on every platform,
Social Layer included, as soon as the event is on prod. Phase 2 = steps 3 to 6 (groups, organiser
asks, DMs, email) — **always last**, after the audience reflection below. Track every step in the
state cache (`~/.private/event-state/<slug>.json`) as done or skipped-with-reason; event #1 ended
with Luma and Facebook groups still `pending` and nobody noticed.

**Audience reflection (start of phase 2, every night).** Before drafting a single message:
1. Refresh the Beeper mirror, then re-sweep 1:1 chats for people the founder discussed Clarity
   Nights with since the last night — they may be missing from the list.
2. From the previous night's campaign folder: who replied, who registered, who came, who ignored.
   Decide per person: stay on personal invites, move to email only, or drop.
3. Sync ClarityPledge users into the newsletter audience before the email step.
4. Carry-over items from `.private/event-channels.json` → `carry_over_for_next_night`.

**Copy per night:** the long group copy and the short platform blurb are derived from **this
event's description**, never reused from the last night (the saved blurbs are event #1's pattern).

### 0. Kickoff checks

- **Beeper must be loaded** (the `cf` launch alias). Steps 3 to 5 are Beeper sends. Check before
  step 1, not when step 3 arrives.
- **Links:** the per-topic short link with `?d=<YYMMDD>` everywhere, 4Seas included (founder,
  2026-10-02: the event is listed on Sola, but there is no need to spread Sola links).
- **Messenger card:** build it first with `/slava:events:messenger-card`; group posts and warm DMs
  carry it.

### 1. Platforms — `/slava:events:promote-all`

todo.today, Facebook personal, Luma, Social Layer (group `4seas`). Eventbrite is off.
Facebook groups: discover suitable Chiang Mai groups (expats, digital nomads, AI, self-development)
from the founder's joined groups and record per-group eligibility **with the event types it fits**
in `.private/event-operator.json` — the existing list was built for hikes.

### 2. Community calendar

Make sure the event is in the CM events calendar, coloured the way the private type entry says.

### 3. Group chats — one combined confirmation

- **Targets:** the `clarity-night` type's `groups` in `.private/event-channels.json`. The founder's
  own Clarity Nights group comes first and is never skipped.
- **4Seas:** post in the community's **General** channel. The founder's understanding is that the
  community's announcement channel is not open for member posts.
- **Copy is the long version, not the platform blurb:** an opener in the founder's voice
  (*"Guys, I'd like to invite you to a free discussion ..."*, day, time, venue), who it is for
  (everyone, not only experts), a short sourced "why now", the format in three sentences, then
  "Details, sources & registration: <link>". Translate for non-English groups; never post English
  into them.

### 4. Organiser asks — a special tier, before personal DMs

People who run other communities' announcement posts. They are not invitees; each gets **one short
message asking to include the event in their next announcement**, with the ClarityPledge short link. Show every draft first and send **exactly one** message per
organiser. On 2026-09-14 one organiser received two versions because a draft was sent before the
founder's rewrite.

Offer a small favour back where one genuinely exists (event #1: an offer to build a copy-paste
event overview for an organiser who already shares daily listings). Never invent one.

### 5. Personal DMs — `/slava:events:promote-dm`, expanded

Event #1 reached 65 people by DM, far beyond the reused list of the previous non-hike campaign. The
founder expects that breadth by default.

1. **Build the list wide:** the previous campaign's list, plus a sweep of every Beeper 1:1 chat with
   a Chiang Mai contact over the last 12 months, including misspelled city tags ("Chaing Mai",
   "Xhiang Mai"). **Paginate to the end of the window** and say which months were covered. Event #1's
   sweep stopped three months short.
2. **Hard exclusions first:** `.private/event-contact-exclusions.json`, previously declined, people
   known to be away.
3. **Read the last real exchange with each person**, not only the activity date. Classify: close
   (recent, two-way) / not close / skip, with a one-line reason.
4. **Working surface is a Google Sheet** the founder edits: name, network, chat ID, last exchange,
   recommendation, hook, status (yes/no), message draft. Send only rows he marked yes, and re-read
   the sheet right before sending.
5. **Tone by closeness.** Close contacts get the link directly. Everyone else gets a short message
   **asking whether they would like the link**. The founder's reasoning (2026-09-14): asking
   permission first is more polite from someone he is not close with. When unsure, ask.
6. **Personal, short, in their language.** Use a real hook from the last exchange. Write German,
   Russian, etc. where that is how he talks with the person. One or two sentences for thin contacts.
7. **People without a 1:1 chat** (only shared groups) cannot be messaged by chat ID. List them for the
   founder to open a chat once. Never drop them silently.
8. **Verify each send landed**, and record sent / skipped-with-reason in the sheet before closing.

### 6. Email to past attendees — last

- **Audience:** people who registered for any past Chiang Mai ClarityPledge event (prod
  `event_rsvps`), minus other cities (Koh Phangan), minus anyone already DM'd, previously declined,
  or already registered for this event. Show the list before sending.
- **From the founder personally** (`Slava <slava@claritypledge.com>` via Mailgun), plain and short:
  what, when, where, link. No "you came before" framing (founder: no value in it). Subject in
  invitation form, e.g. *"You're invited: <topic> at <venue>"*.
- **Test once** to the founder's personal inbox. Repeated near-identical tests to the same address
  pushed the test into spam on 2026-09-15; a single clean test did not.
- **Verify delivery** from Mailgun events (delivered, not just queued) and report the count. Event #1:
  42 of 42 delivered.

### 7. Close-out

Record what was sent, skipped and left open in the campaign folder
(`.private/campaigns/<city>-<topic>-<date>/`) and the sheet, so the next Clarity Night reuses the
list instead of re-deriving it.

## Platform copy — pattern (founder-approved for #2, 2026-09-29)

Rewrite per night from the event description; keep this shape: **change-first question** (not the
topic word), who disagrees and **how their positions were derived** (stories from their own talks,
predicted positions), the aim (honesty despite differences, a revealed gap is rewarded), the research
framing (open, independent, applied cognitive science; format improved from audience feedback), who is
welcome, why register. **Never state the round mechanics** (decisions.md 2026-09-28). Two cuts:
long (Facebook, Luma, Social Layer, Facebook groups) and ≤ 1000 characters (todo.today, title ≤ 80).

Long cut:

```
AI is changing work faster than most of us can adjust. Does it help you do what you love, earn from it, and find more meaning? Or does it take that away?
Details & registration: claritypledge.com/night?d=261006

People who have thought hard about this disagree. Simon Sinek fears our humanity will suffer. Garry Tan sees one person building alone, no permission needed. Naval Ravikant, Alan Watts and Arthur Brooks each land somewhere else. From their own talks on YouTube we extracted the stories that explain their reasoning and experience, and predicted which position each would take on six contested points.

How the night works: take your position, then talk it through in groups of three. The aim is an environment where we can be honest with each other despite differences in opinions, interests and values, so that we learn from each other instead. Admitting a gap in your understanding is rewarded here.

Clarity Nights are part of an open, independent research project in applied cognitive science. We improve the format every time based on critical feedback from the audience.

Free. You don't need to be technical or have any particular skill to take part. Everyone is welcome. Please register so you can take positions on the six contested points beforehand.

Tue 6 Oct, 18:30 · Zuzalu Library, 4Seas Nimman, Chiang Mai
Register: claritypledge.com/night?d=261006
```

Short cut (todo.today):

```
AI is changing work faster than most of us can adjust. Does it help you do what you love, earn from it, and find more meaning? Or does it take that away?
Details & registration: claritypledge.com/night?d=261006

Simon Sinek, Garry Tan, Naval Ravikant, Alan Watts and Arthur Brooks disagree. From their own talks on YouTube we extracted their stories and predicted where each stands on six contested points.

Take your position, then talk it through in groups of three. The aim: be honest with each other despite different opinions, interests and values, and learn from each other. Admitting a gap in your understanding is rewarded here.

Part of an open, independent research project in applied cognitive science. We improve the format every time based on audience feedback.

Free. No particular skill needed. Everyone is welcome.

Tue 6 Oct, 18:30 · Zuzalu Library, 4Seas Nimman, Chiang Mai
Register: claritypledge.com/night?d=261006
```

