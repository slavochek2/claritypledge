---
name: promote-facebook
description: "Create Facebook Events in local groups for a ClarityPledge event"
when_to_use: "After event is published on claritypledge.com."
version: 1.3.0
---

# Promote Event on Facebook Groups

Promotes a Clarity Pledge event by creating Facebook Events in relevant local groups. Stops before submitting each — user reviews and publishes.

## Input

Event slug or "latest". If not provided, use the most recent upcoming event from prod DB.

---

## Steps

### 1. Get event data from prod

`curl` the prod REST API with the public anon key (no CLI auth or org membership needed; events are public-read — RLS guards the data):

```bash
# Public anon key — safe to publish (it ships in the site's JS bundle).
# Rotated? Current value: VITE_SUPABASE_ANON_KEY in .env.prod.
ANON_KEY="${VITE_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlc2p0dW9keml5a21qaWR1Ynp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1OTgyNTQsImV4cCI6MjA4MDE3NDI1NH0.Z0Ap-VDprOzBRVEWF1wOXwVnNlCaqvv8i9JCCgiPsFY}"
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?order=datetime.asc&status=eq.upcoming&limit=1" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
```

(Or filter by `&slug=eq.<slug>`.) Fields needed: `title`, `slug`, `datetime`, `duration_minutes`, `location`, `description`.

Parse datetime in `Asia/Bangkok` (UTC+7) to get local date, start time, and end time (start + duration_minutes).

### 2. Prepare cover photo

The banner normally already exists — claritypledge.com auto-generates it on event creation. Download it (portable, no credentials):

```bash
SLUG="<event-slug>"
PUBLIC="https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public/event-banners/${SLUG}.jpg"
LOCAL="$HOME/Downloads/clarity-event-photo.jpg"
curl -s -o "$LOCAL" -w "HTTP:%{http_code} bytes:%{size_download}\n" "$PUBLIC"
```

**If the banner is missing (404/400):** founder machine (`PROD_SUPABASE_SERVICE_ROLE_KEY` set) → `./scripts/event-photo-prep.sh <slug> "<query>"` (founder-only, macOS-only). Operator machine (no key) → stop: "Open the event on claritypledge.com (banner auto-generates), then re-run."

### 3. Discover relevant Facebook groups

Use Claude-in-Chrome. Check the session is logged in as **the operator** (from `.private/event-operator.json`; default: Vyacheslav Ladischenski) before proceeding.

**Precondition:** the operator must be a member of the target groups — group event creation and discovery both run on the operator's own Facebook identity and memberships. Results differ per operator; that's expected.

Open a new tab and search Facebook for groups matching the event's location. **Always derive search terms from the event's `location` field** — pattern: `"<city> expats"`, `"<city> community"`, `"Digital Nomads <city>"`, plus an event-type term (`"<city> running"` / `"<city> AI"` / etc.). Never assume a default city.

For each result, note:
- Group name + member count
- Public or private
- Already a member?
- Has an Events tab?

**Prioritise:** Public groups with an Events tab. Skip private groups not yet a member of — list them separately for manual follow-up.

**Known groups:** read the optional `facebook_groups` array from `.private/event-operator.json` — each operator maintains their own list and grows it run over run.

**Config absent or `facebook_groups` empty — fail closed, no hardcoded defaults.** A prior version of this skill defaulted to two Koh Phangan groups whenever the config was missing, which meant every Chiang Mai (or any non-Ko-Phangan) event silently posted into the wrong-city audience — `.private/event-operator.json` has never existed on this operator's machine, so this default fired on every run. If `facebook_groups` is absent or empty, **stop here** and ask: "No known Facebook groups configured for this operator. Add a `facebook_groups` array to `.private/event-operator.json` (see schema in step 0 of `promote-all.md`), or reply with group names/URLs to search for this run only (not saved)." Do not proceed to group discovery on an assumed city.

### 4. For each eligible group — fill the Create Event form

Navigate to the group's Events tab → click **Create Event**.

#### 4a. Cover photo

Upload the Unsplash photo downloaded in Step 2 using the cover photo field at the top of the form.

#### 4b. Fill the form fields

| Field | Value |
|-------|-------|
| Event name | verbatim from DB (max 100 chars) |
| Start date | local date (Asia/Bangkok) |
| Start time | local time (Asia/Bangkok) |
| End date | same as start date |
| End time | start time + duration_minutes |
| Time zone | GMT+7 |
| In person / virtual | In person |
| Location | meeting point name + city (e.g. "Zoo Cafe, Ko Phangan") — use "Just use [text]" if no match |
| Who can see it? | the group (already pre-filled) |
| Description | see template below |

**Do NOT click "Create event".** Take a screenshot of the completed form.

### 5. Description template

**Rules:**
- One link only: the claritypledge event page (registration + full details)
- No WhatsApp links, AllTrails links, or any other URLs

For trail runs:
```
[1-line hook]
Full details & registration: claritypledge.com/events/[SLUG]?utm_source=facebook&utm_medium=community-group&utm_campaign=[SLUG]

• [distance] loop through [terrain]
• [elevation]m elevation gain · [key highlight]
• Pace: 7–10 km/h (this is a run, not a hike)

📍 Meet at [TIME]: [VENUE], [brief location note]
[Entry fee if applicable]

What to bring: trail shoes, water (1.5L+), snacks, small backpack

Registration is required. Full details and sign-up:
claritypledge.com/events/[SLUG]?utm_source=facebook&utm_medium=community-group&utm_campaign=[SLUG]
```

### 6. Report to user

For each group processed, show:
- Group name + member count
- Screenshot of completed event form
- Status: ready to submit / skipped (reason)

Also list any **private groups not yet joined** so the user can request to join and rerun later.

**Do NOT submit any form.** User reviews each and publishes manually.

---

## Conventions

- **Account**: the operator from `.private/event-operator.json` (default: Vyacheslav Ladischenski) — verify session before starting
- **One link only**: `claritypledge.com/events/[slug]?utm_source=facebook&utm_medium=community-group&utm_campaign=[slug]` — registration page and source of truth, tagged for channel attribution (P1134 — see `docs/technical/analytics.md`)
- **Cover photo**: the event's claritypledge.com banner (auto-generated); Unsplash generation is the founder-only fallback
- **End time**: always fill — start time + duration_minutes from DB
- **Location**: use the meeting point name; choose "Just use [text]" if Facebook doesn't find the exact venue
- **Time zone**: always GMT+7 (Asia/Bangkok)
- **Private groups**: flag but do not attempt to join automatically — list for manual follow-up
- **No hardcoded city defaults**: `facebook_groups` must come from `.private/event-operator.json`, or the operator supplies groups for this run explicitly. Never assume Koh Phangan (or any city) when the config is absent.
