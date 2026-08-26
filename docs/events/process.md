# Event Publishing Process

How Clarity Pledge events are created, published, promoted, and shared into community group chats.

> **Second operators:** this doc is the founder-internal process (founder accounts, founder machine). The operator path is [operator-guide.md](operator-guide.md) — publishing via `/publish-event` and promotion via `/promote-all` with your own accounts.

This is the event counterpart to [video-process.md](../video-process.md) — same shape: a
create/asset/promote pipeline of independent, CLI-and-browser-driven skills, with one orchestrator
that sequences them and adds a combined resume view, never reimplementing any stage.

---

## The Pipeline

```
CREATE                      ASSETS          PROMOTE (platforms)     PROMOTE (groups)     OPTIONAL
──────                      ──────          ───────────────────     ────────────────     ────────
Gate 1 — which               /slava:        /slava:events:          /slava:events:       promote-dm
creation path?                content:       promote-all             promote-groups       promote-whatsapp
 · publish-event          →   gen-poster  →  (todo.today, FB      →  (WhatsApp /       →  promote-email
 · publish-run (AllTrails)                    personal, Luma,         Telegram chats)      — NOT auto-chained;
 · re-create-event (clone)                    Eventbrite, Sola)                             separate opt-in
```

**One-command path:** `/slava:events:run` sequences all four stages, stopping at exactly four
human gates (kickoff, one combined copy review, the platform browser gates it inherits from
`promote-all`, and the group blast-radius confirmation it inherits from `promote-groups`). See
"The orchestrator" below. Each stage skill also stays independently invocable — use it directly
when you only want one stage.

---

## Creation — which skill to use

Three sibling skills, deliberately not merged (they take genuinely different inputs — a form, an
AllTrails URL, a prior event to clone):

| Skill | Invoke | Input | When to use |
|-------|--------|-------|-------------|
| Publish event | `/slava:events:publish-event` | Fills the `/events/new` form directly in the operator's own browser | General-purpose, operator-safe path. Default choice when there's no AllTrails link and no prior occurrence to clone. |
| Publish run | `/slava:events:publish-run` | An AllTrails link + date/time + optional post-run idea | Trail run, hike, or trail walk — anything with a specific trail. |
| Re-create event | `/slava:events:re-create-event` | The most recent occurrence of a named recurring series (e.g. AI Running Club) already in prod | Weekly/recurring series publish. Requires at least one prior event in the series — the first event of any new series is still created manually via `scripts/create-event.ts`. |

---

## Event Types

### Trail Run
An outdoor run, hike, or trail walk. Optional post-run breakfast/discussion.

**Skill:** `/slava:events:publish-run`
**Key defaults:** pace 7–10 km/h (not a hike); timezone always local to the event's own city
(resolved from the event's `location` field — never hardcode a city here); attendance open (no
cap); location = meeting point at or near the trailhead, resolved via Google Maps from AllTrails
coordinates; manifesto link always included in the post-run section.

---

### Discussion / Breakfast *(future)*
A structured or semi-structured conversation, typically over food or coffee. No trail link needed;
location is a specific cafe or venue; post-run discussion becomes the main event.
**Skill:** TBD (`/publish-discussion` does not exist yet).

---

### Live /live Session *(future)*
Online clarity practice session using the /live feature. Location: online
(claritypledge.com/live). Duration: typically 60–90 min.
**Skill:** TBD (`/publish-live` does not exist yet).

---

### Workshop *(future)*
Longer format, structured agenda, specific learning outcome.
**Skill:** TBD (`/publish-workshop` does not exist yet).

---

## The orchestrator (`/slava:events:run`)

`/slava:events:run` is the one-command path over the four stages above: it **sequences the
existing stage skills**, it never reimplements them. Fix a weak result (a bad blurb, a missed
platform, a wrong-audience default) in the owning stage skill, never in the orchestrator.

**Four human gates, and no more** — events genuinely need more than `/video-publish`'s two,
because the platform browser-clicks cannot be automated:

1. **Kickoff** — which creation path (the table above), plus that path's own founder-only inputs,
   plus which of the four stages are in scope for this run.
2. **One combined copy review** — the platform promo blurb and every language's group blurb,
   resolved and shown together, once, before any stage that would use them runs. Without this, the
   platform stage and the groups stage would each stop for their own copy review — a duplicate
   approval turn the orchestrator exists to remove.
3. **Per-platform browser gates** — inherited unchanged from `promote-all`'s own per-platform
   stops. The orchestrator adds zero approval turns around them.
4. **Group-send blast-radius confirmation** — inherited unchanged from `promote-groups` (type the
   exact count for 6+ groups).

**Resume behavior — this is the fix this orchestrator exists for.** The platform cache
(`~/.private/event-state/<slug>.json`) initializes all five platforms to `pending` up front, so
done-vs-pending is always derivable from it alone. The groups cache
(`~/.private/event-state/<slug>.groups.json`) is only created once a group send actually happens —
an abandoned groups leg leaves **no file at all**, indistinguishable from an event that legitimately
never had one. So the orchestrator writes its own third file at kickoff,
`~/.private/event-state/<slug>.run.json`, declaring which stages are in scope for that run
**before any stage executes**. Absence of a groups result, checked against that declared scope, is
what reveals an abandoned leg — not absence of the groups file by itself. This is the July 5
failure (groups silently dropped, undetected for seven weeks) made visible on every subsequent run.

**Never publishes.** No stage the orchestrator sequences clicks Publish or Create — every such
click stays the user's, inherited from the stage skill that owns it. The optional DM/WhatsApp/email
stage is never auto-chained; it is offered once, opt-in, after the platform and group stages
complete.

---

## Group-Chat Promotion

Separate from the public-platform fan-out (`promote-all`) and from personal DMs (`promote-whatsapp`
/ `promote-dm`): posting the event blurb into recurring **community group chats** (WhatsApp,
Telegram) that are mapped by event type.

**Skill:** `/slava:events:promote-groups`
**Input:** event slug, URL, or title (resolves to slug before any state read/write)
**Config:** `.private/event-channels.json` — maps event-title prefixes to eligible groups, each
carrying a `platform`, `chatID`, `verified_name`, and `lang`
**Guards (stricter than DMs — this is "DMs but irreversible and to hundreds"):** a hard-refuse
config validator; per-language blurb resolution with a mandatory missing-language stop; a
deterministic staleness check (the resolved blurb must contain the current event's date token —
not a judgment call); a link-liveness check before any send; a mandatory self-chat transport probe,
re-run on any mid-run copy revision; fail-closed identity verification per group before sending;
verify-by-content (not by timestamp) after every send, with no blind resend after a connection
error; a typed blast-radius confirmation for 6+ groups; per-group state written immediately, never
batched.

**State is isolated from `promote-all`** — `<slug>.groups.json` is a separate file, never appended
to or read from `<slug>.json`.

---

## Publishing Flow (any event)

1. Choose type → use the relevant creation skill (see the decision table above)
2. Skill asks minimal questions → generates description → publishes to prod
3. Review the live event page
4. Generate posters → `/slava:content:gen-poster` (creates shortlink + QR + 5 formats)
5. Promote (platforms, then groups — see below and the orchestrator above)

## Promotion Channels

### todo.today ✓
A community event platform.

**Skill:** `/slava:events:promote-todo-today`
**Input:** event slug or "latest upcoming"
**Account:** the operator, from `.private/event-operator.json` (default: Vyacheslav Ladischenski)

**Key conventions:**
- Photo: the event's claritypledge.com banner (auto-generated); Unsplash generation is the
  founder-only fallback
- Description: no links except the claritypledge event page (registration + full info)
- Always state: "Registration is required. Full details and sign-up: claritypledge.com/events/[slug]"
- Exchange: Free · Walk-In: unchecked · Venue: select from the operator's local venue list
- Photo upload and every date/time field are confirmed write→wait→re-read — a write that looks
  correct in an immediate screenshot has silently reverted before

---

### Facebook Groups ✓
Promote as a Facebook Event in relevant local groups (expat, nomad, community, fitness).

**Skill:** `/slava:events:promote-facebook`
**Input:** event slug or "latest upcoming"
**Account:** the operator's own personal Facebook account

**How it works:**
- Searches Facebook for relevant local groups by the event's own `location` field (never a
  hardcoded city) plus an event-type term
- Fills the Create Event form in each eligible public group
- Stops before submitting — user reviews and publishes each form manually
- Lists private groups not yet joined for manual follow-up

**Key conventions:**
- Location: meeting point name + city, read from the event
- One link only: `claritypledge.com/events/[slug]` (UTM-tagged for channel attribution)
- Time zone: GMT+7
- **Known groups come only from `.private/event-operator.json`'s `facebook_groups` array — there
  is no hardcoded city default.** A prior version of this skill defaulted to two groups from one
  specific city whenever the config was absent, which silently sent every event in any other city
  to the wrong audience. If the config is absent or empty, the skill stops and asks rather than
  guessing a city.

---

### Facebook (Personal Profile) ✓
Create a Facebook Event from the operator's own personal profile — the sibling flow to Facebook
Groups above, targeting the personal-profile event type instead of a group.

**Skill:** `/slava:events:promote-facebook-personal`
**Input:** event slug or "latest upcoming"
**Key conventions:** visibility always Public; date/time fields are filled **last**, after every
other field, because Facebook's start time silently resets on any unrelated field edit — an
undocumented behavior confirmed in production. Every date/time write and the cover-photo upload are
confirmed write→wait→re-read before moving on.

---

### Luma ✓
Create a Luma event page.

**Skill:** `/slava:events:promote-luma`
**Key conventions:** the date/time picker rejects programmatic input entirely — the user enters it
manually and the skill re-reads the rendered values from a screenshot (after a brief wait, since a
value that looks correct immediately can silently revert) against the expected prod values before
the user clicks Create Event. The cover-photo upload is confirmed the same write→wait→re-read way.

---

### Eventbrite ✓
Create an Eventbrite event (draft).

**Skill:** `/slava:events:promote-eventbrite`
**Key conventions:** multi-step wizard (tickets + publish are separate steps the user drives) — the
skill stops before the ticket/publish steps for the user to complete manually.

---

### Social Layer ✓
Create a Social Layer (sola.day) event under a community group.

**Skill:** `/slava:events:promote-sola`
**Pre-condition:** the series has a `sola_group` (Social Layer group handle) in its frontmatter —
events cannot be hosted on a bare profile. Skipped entirely by `promote-all` when absent.

---

### Group Chats (WhatsApp / Telegram) ✓
Post the event blurb into recurring community group chats — see "Group-Chat Promotion" above for
the full guard list. This is the channel that used to get silently dropped with no signal anywhere
(the July 5 failure); the orchestrator's run record exists specifically to make that visible.

**Skill:** `/slava:events:promote-groups`

---

### Posters ✓
Generate visual assets for print and social media distribution.

**Skill:** `/slava:content:gen-poster`
**Input:** event slug + optional vibe keywords
**Output:** 5 formats (A5 print, Facebook, WhatsApp, LinkedIn, Square) + zip bundle, hosted at
`ladischenski.com/temp/{slug}/`

**How it works:**
- Generates 3 hero images at 4K via Nano Banana Pro (portrait, landscape, square)
- Builds HTML templates with event data, QR code, shortlink
- Screenshots at 2x DPR via Playwright for crisp output
- Self-reviews against quality checklist, iterates if needed
- Uploads folder + zip to ladischenski.com/temp/

---

### Direct Invites ✓
Personalized messages to contacts via Beeper — WhatsApp DMs and optional email, separate from both
the public-platform fan-out and the group-chat posting above.

**Skill:** `/slava:events:promote-dm` (orchestrates `/slava:events:promote-whatsapp` and
optionally `/slava:events:promote-email`)
**Input:** event URL + contact list or tags

**How it works:**
- Generates templates in EN/RU/DE
- Loads contacts from master CRM list
- Searches Beeper, personalizes based on recent chat
- Creates CSV for review → bulk send after approval
- Can attach a poster from `/slava:content:gen-poster` output

---

### Pending documentation
- [ ] Instagram

## Database

- **Prod project:** `besjtuodziykmjidubzw`
- **Status lifecycle:** `upcoming` → `completed` (datetime-based, no auto-trigger)
- **Timezone:** always store in UTC, display in local timezone via the event's own city (never
  hardcode a single city — the operation runs events in multiple cities)

## Description Conventions

- Open with a personal, inviting line ("Please join me for..." or similar)
- Breakfast/discussion always framed as **entirely optional**
- "The run is the run" — the event stands alone without the post-run
- All external links open in new tab (handled by markdown renderer)
- Always include: AllTrails link (trail events), Google Maps link, What to bring, Manifesto link
- Never include: long bio (host profile is clickable on the event page)

---

## Skills Reference

All 14 files under `.claude/commands/slava/events/`, one row each:

| Skill | Invoke | Stage | What |
|-------|--------|-------|------|
| Publish event | `/slava:events:publish-event` | Create | General-purpose event creation via the `/events/new` form, operator-safe |
| Publish run | `/slava:events:publish-run` | Create | Trail run/hike/walk from an AllTrails link |
| Re-create event | `/slava:events:re-create-event` | Create | Clone the latest occurrence of a recurring series into a new one |
| Promote all | `/slava:events:promote-all` | Promote (platforms) | Fan out sequentially across todo.today, Facebook personal, Luma, Eventbrite, Social Layer, with per-platform user gates |
| Promote todo.today | `/slava:events:promote-todo-today` | Promote (platforms) | Fill the todo.today Create Event form |
| Promote Facebook (groups) | `/slava:events:promote-facebook` | Promote (platforms) | Fill Create Event forms in relevant local Facebook groups |
| Promote Facebook (personal) | `/slava:events:promote-facebook-personal` | Promote (platforms) | Fill the Facebook personal-profile Create Event form |
| Promote Luma | `/slava:events:promote-luma` | Promote (platforms) | Fill the Luma create-event form |
| Promote Eventbrite | `/slava:events:promote-eventbrite` | Promote (platforms) | Create an Eventbrite draft event |
| Promote Social Layer | `/slava:events:promote-sola` | Promote (platforms) | Create a sola.day event under the series' community group |
| Promote groups | `/slava:events:promote-groups` | Promote (groups) | Post the event blurb into mapped WhatsApp/Telegram group chats — the channel that used to get silently dropped |
| Promote DM | `/slava:events:promote-dm` | Optional (opt-in) | Orchestrate personal WhatsApp + optional email outreach to a contact list |
| Promote WhatsApp | `/slava:events:promote-whatsapp` | Optional (opt-in) | Send personal WhatsApp DMs via Beeper to a contact list |
| Promote email | `/slava:events:promote-email` | Optional (opt-in) | Send personalized promo emails via Mailgun to a contact list |
| **Orchestrate** | `/slava:events:run` | All | Sequences Create → Assets → Promote (platforms) → Promote (groups) in one pass, four human gates, combined resume view |
