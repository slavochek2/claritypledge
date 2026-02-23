# Event Publishing Process

How Clarity Pledge events are created, published, and managed.

## Event Types

### Trail Run
An outdoor run on a specific trail. Optional post-run breakfast/discussion.

**Skill:** `/slava/events/publish-run`
**Input:** AllTrails link + date/time + optional post-run idea
**Time to publish:** ~2 minutes

**Template event:** [Clarity Run: Phaeng Noi Waterfall Loop](https://claritypledge.com/events/clarity-run-phaeng-noi-waterfall-loop-2026-02-25-jizou5) — use as copy reference.

**Key defaults:**
- Pace: 7–10 km/h (not a hike)
- Duration: 150 min (run + optional breakfast)
- Timezone: Asia/Bangkok (Ko Phangan)
- Attendance: open (no cap)
- Location: meeting point at or near trailhead — resolved via Google Maps from AllTrails coordinates
- Manifesto link always included in post-run section

---

### Discussion / Breakfast *(future)*
A structured or semi-structured conversation, typically over food or coffee.
- No trail link needed
- Location: specific cafe or venue
- Post-run discussion becomes the main event
- Skill: TBD (`/slava/events/publish-discussion`)

---

### Live /live Session *(future)*
Online clarity practice session using the /live feature.
- Location: online (claritypledge.com/live)
- Duration: typically 60–90 min
- Skill: TBD (`/slava/events/publish-live`)

---

### Workshop *(future)*
Longer format, structured agenda, specific learning outcome.
- Skill: TBD (`/slava/events/publish-workshop`)

---

## Publishing Flow (any event)

1. Choose type → use the relevant skill
2. Skill asks minimal questions → generates description → publishes to prod
3. Review the live event page
4. Promote (see promotion channels below)

## Promotion Channels

### todo.today ✓
A community event platform popular on Ko Phangan.

**Skill:** `/slava/events/promote-todo-today`
**Input:** event slug or "latest upcoming"
**Time:** ~3 minutes
**Account:** logged in via ops@claritypledge.com

**Key conventions:**
- Host name: Vyacheslav Ladischenski
- Photo: Unsplash image relevant to event type
- Description: no links except the claritypledge event page (registration + full info)
- Always state: "Registration is required. Full details and sign-up: claritypledge.com/events/[slug]"
- Exchange: Free · Walk-In: unchecked · Venue: select from Koh Phangan list

---

### Facebook Groups ✓
Promote as a Facebook Event in relevant local groups (expat, nomad, community, fitness).

**Skill:** `/slava/events/promote-facebook`
**Input:** event slug or "latest upcoming"
**Time:** ~5 minutes
**Account:** logged in via personal Facebook (Vyacheslav Ladischenski)

**How it works:**
- Searches Facebook for relevant local groups by location keywords
- Fills the Create Event form in each eligible public group
- Stops before submitting — user reviews and publishes each form manually
- Lists private groups not yet joined for manual follow-up

**Key conventions:**
- Location: meeting point name + city (e.g. "Zoo Cafe, Ko Phangan")
- One link only: claritypledge.com/events/[slug]
- Time zone: GMT+7
- Audience: "In person"

**Known groups (Ko Phangan):**
- Koh Phangan expats community — 8.4K members, public ✓
- Digital Nomads Koh Phangan — search to confirm current status

---

### Pending documentation
- [ ] Instagram
- [ ] Direct invites

## Database

- **Prod project:** `besjtuodziykmjidubzw`
- **Host ID (Slava):** `a99042ef-e740-446a-8734-389c8589cc17`
- **Status lifecycle:** `upcoming` → `completed` (datetime-based, no auto-trigger)
- **Timezone:** always store in UTC, display in local timezone via `Asia/Bangkok`

## Description Conventions

- Open with: "Please join me for..." (personal, inviting)
- Breakfast/discussion always framed as **entirely optional**
- "The run is the run" — the event stands alone without the post-run
- All external links open in new tab (handled by markdown renderer)
- Always include: AllTrails link, Google Maps link, What to bring, Manifesto link
- Never include: long bio (host profile is clickable on the event page)
