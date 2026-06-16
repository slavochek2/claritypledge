---
name: publish-event
description: "Publish an event on claritypledge.com by driving the /events/new form in the operator's browser — fresh or cloned from a past event"
when_to_use: "When an event needs to exist on claritypledge.com, before any promotion. Operator-safe: own account, own browser, zero secrets. NOT /re-create-event (founder-only DB series automation) and NOT /publish-run (AllTrails trail-run flow)."
version: 1.0.0
---

# Publish Event on claritypledge.com

Fills the site's own create-event form in the operator's logged-in browser. Stops before submitting — **the user clicks Create Event**. This skill never publishes anything.

**Announce at start:** "Running /publish-event."

## Input

Nothing required. Optionally: a past event slug to clone, or event details inline.

---

## When to use this vs the sibling skills

| Situation | Skill |
|---|---|
| Any event, fresh or re-created with changes, via the website | `/publish-event` ← here |
| Next occurrence of a recurring series, founder machine (service key + series doc) | `/re-create-event` |
| Trail event (run, hike, walk) built from an AllTrails link, founder machine | `/publish-run` |
| Event already exists — promote it | `/slava:events:promote-all` |

---

## Steps

### 0. Load operator config

Read `.private/event-operator.json` (same file `/promote-all` uses). Absent → founder defaults (operator = Vyacheslav Ladischenski). Only `operator_name` is needed here.

### 1. Fresh or clone?

Ask: "New event from scratch, or re-create a previous one with changes?"

**Clone path** — query prod for recent events WITH the host name joined (anon key — public read; do NOT use the Supabase MCP, it points at the test DB):

```bash
# Public anon key — safe to publish (it ships in the site's JS bundle).
# Rotated? Current value: VITE_SUPABASE_ANON_KEY in .env.prod.
ANON_KEY="${VITE_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlc2p0dW9keml5a21qaWR1Ynp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1OTgyNTQsImV4cCI6MjA4MDE3NDI1NH0.Z0Ap-VDprOzBRVEWF1wOXwVnNlCaqvv8i9JCCgiPsFY}"
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?select=slug,title,datetime,duration_minutes,location,description,host:profiles!events_host_id_fkey(name)&order=datetime.desc&limit=10" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
```

- **Default the pick-list to events whose `host.name` matches `operator_name`** (the operator's own past events).
- If the operator has none yet, you may offer other hosts' events **as a template only**, with this explicit warning: "The new event will be YOURS — you become the host; it is a separate event, not linked to the original or its series."
- Prefill every field from the chosen event, then ask one question: "What changes? (usually just the date)"

**Fresh path** — gather: title, date + time + timezone, duration, location (physical place or meeting URL), description (markdown supported).

**Disclosure (both paths), state verbatim before proceeding:** "Once you click Create, the event is immediately PUBLIC on claritypledge.com/events — there is no draft mode. (You can delete your own events afterwards.)"

**Description guidance:** the event page is the canonical registration link — every platform promotion will point back to it. The description should stand alone: what happens, who it's for, what to bring.

### 2. Login gate

Open `https://claritypledge.com` via claude-in-chrome. Verify the session is logged in as the operator (`operator_name`) — check the profile/avatar menu. Not logged in → tell the user to sign in at claritypledge.com and re-run. Abort cleanly (no further tool calls).

### 3. Fill the form

Navigate to `https://claritypledge.com/events/new`. Read the page (`read_page` with `filter: "interactive"`) and fill:

| Field | Element | How to set |
|---|---|---|
| Title | text input | `form_input` verbatim |
| Date / time | date + time inputs | `form_input`; if a custom picker ignores it, hand to the user (note it in Known limitations) |
| Timezone | select | pick the event's local timezone |
| Duration | select | closest option to intended duration |
| Location | text input | place name or meeting URL |
| Description | textarea | `form_input`, markdown supported |

### 4. Date gate — confirm machine values, not the screenshot

Read back what the form will actually submit via `javascript_tool` (input `.value` properties for date, time, timezone, duration). Screenshots show rendering; submission uses the underlying values — this distinction caused a real wrong-date publication on Luma.

> Confirm before you create — these are the values the form will submit:
>
> | Field | Form will submit | You intended |
> |---|---|---|
> | Date | `<read value>` | `<intended>` |
> | Time | `<read value>` | `<intended>` |
> | Timezone | `<read value>` | `<intended>` |
>
> Reply `confirmed: <ISO datetime>` to proceed, or `fix` / `abort`.

### 5. Stop — user creates

> Form ready. Click **Create Event** — once, then wait (a double-click can create the event twice). Reply `created` when the event page loads.

**Do NOT click Create Event.** Only the user submits.

### 6. Post-create evidence

1. Look up the new event via the anon-key curl from step 1 (filter `&title=eq.<urlencoded title>&order=created_at.desc`). **Duplicate check:** two rows with the same title created within the last minute → flag immediately: "Two copies exist — delete one from the event page (you're the host)."
2. The banner auto-generates in the background — wait a few seconds, then screenshot the live event page so the user can judge the banner themselves (a successful HTTP fetch does not prove the banner fits — a fallback stock image also loads fine). If they dislike it: the banner controls on the event page offer Regenerate and keyword search.
3. Report: "Evidence produced: event live at `claritypledge.com/events/<slug>` [screenshot]. Awaiting your confirmation."

### 7. Further material

- Next step: `/slava:events:promote-all` — fans the event out to your configured platforms.
- Setup and the full operator path: [docs/events/operator-guide.md](../../../../docs/events/operator-guide.md)
- `/re-create-event` is the founder-only sibling (series automation via direct DB access) — not needed for the operator path; this skill's clone mode covers re-creating with changes.
- Short links (`claritypledge.com/events/<short>`): require a founder deploy, one per recurring series — ask once if your event recurs.

---

## Conventions

- **Never publishes.** The user clicks Create Event — no exceptions.
- **Operator identity** from `.private/event-operator.json`; never hardcoded.
- **Prod reads via anon key** (public data, RLS-guarded); never the Supabase MCP (test DB).
- **Machine-value date confirmation** before any create — screenshots are not evidence of what submits.
- **Clone ownership is explicit:** cloning another host's event creates a NEW event owned by the operator — always warned, never silent.
- **The claritypledge event page is the canonical registration URL** — all platform promotions link back to it.
- **No state cache.** Single-page flow; if interrupted, re-run — refilling is cheap.

---

## Known limitations (as of 2026-06-05)

- (none yet — section will be populated from the first real run; candidates: date-picker programmability, mobile form variants)

---

## Related Skills

- `/slava:events:promote-all` — promotion fan-out after publishing
- `/slava:events:re-create-event` — founder-only series re-creation (DB path)
- `/slava:events:publish-run` — founder-only AllTrails trail-run events
