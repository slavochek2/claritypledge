---
name: select-hike
description: "Pick the next hike and its meeting cafe by opening candidates in Chrome for the founder to choose from — never by listing them in chat"
when_to_use: "At the start of a hike run, before /publish-run. Triggered by 'select the hike', 'find a hike for Sunday', '/slava:events:select-hike'. Hands its output to /publish-run."
version: 1.0.0
---

# Select Hike + Meeting Cafe

The front half of the hike pipeline: choose the trail, choose the cafe you meet at,
and collect the founder photo — then hand all three to `/slava:events:publish-run`.

**This skill picks nothing on its own and publishes nothing.** It narrows, opens, and
records; the founder chooses.

---

## The one rule that shapes every step: open it, don't describe it

> *"open in browser all to slect form dont offeer in chat"* — founder, 2026-08-31
> *"open for me the options in google maps all of them so i can confirm"* — same session, about cafes

A trail or a cafe cannot be judged from a paragraph you wrote about it. The founder
judges from the photos, the reviews, and the map. So **every candidate set — trails and
cafes alike — is opened as real Chrome tabs, one tab per candidate, and chat carries only
a numbered index that maps to those tabs.** Never a chat-only comparison table with
descriptions standing in for the pages. Never "here are three options, which do you
prefer?" with no tabs open.

Chat says: `1. Doi Pui — Ban Khun Chang Khian (tab 2) · 7.2 km loop · 469 m`
Chat does not say: a two-paragraph pitch for each trail.

---

## Steps

### 1. Load the exclusions — before searching, not after

Read `.private/event-exclusions.json` (gitignored; create from the schema below if absent).

```json
{
  "trails": [{ "name": "Wat Pha Lat", "match": ["pha lat", "phalat"],
               "blocked_on": "2026-08-31", "reason": "Too close to Chiang Mai", "hard": false }],
  "venues": [], "areas": []
}
```

- `match` is a list of lowercase substrings tested against the candidate's trail name **and** its AllTrails URL.
- A matching candidate is **dropped before it is ever opened in a tab**. It is not shown, ranked, or "offered with a caveat" — the founder already ruled on it, and re-offering it costs him the same decision twice. That is the whole point of the file.
- Report the drops in one line so the list staying short is never mysterious: `Excluded: Wat Pha Lat (too close to Chiang Mai, 2026-08-31)`.
- `hard: true` means never again under any phrasing. `hard: false` (the default) means don't volunteer it — if the founder explicitly names it himself, it is allowed.

**Capturing a new exclusion is part of this skill, not a favour.** The moment the founder
rejects a candidate with a reason — *"what pha lat dont offer next time unless i ask for
it, this is because its too close to chiang mai"* — append it to `trails` with his reason
in his own words and today's date, in the same turn, before continuing the selection.
A rejection reason that lives only in a transcript is a decision he will have to make again.

### 2. Collect the founder's constraints — one message, then go

Ask once, together, and only for what wasn't already said:

1. **Date and start time?** (e.g. "this Sunday, 9:00")
2. **Any shape constraints?** — distance/difficulty band, closer to or further from the city, loop vs point-to-point, one-way, cafe at the end.
3. **A photo for the banner?** — see step 6; ask here so it isn't a separate interruption later.

Prior constraint sets are a starting draft, not a fresh interrogation. If the founder says
"similar to last time," read the last hike's row from prod and restate the band you inferred
in one line for confirmation rather than re-asking all three questions.

### 3. Search AllTrails via Chrome

Use `claude-in-chrome`. Search AllTrails filtered to the city and the constraint band from
step 2. Gather candidates with: name, URL, distance, elevation gain, route type, difficulty,
rating, review count, and drive time from the city centre.

Apply step 1's exclusions. Then **rank by fit to the stated constraints, and cut to 3–5** —
enough to choose from, few enough to actually look at. Ranking factors, in order: matches the
stated shape (distance/difficulty/route type), rating and review count high enough to trust,
drive time reasonable, and — when the founder asked for a cafe at the end — a plausible cafe
near the finish (confirmed in step 4, not assumed here).

### 4. Open every trail candidate in its own tab

One `tabs_create_mcp` per candidate, all opened before you write anything in chat. Then post
the numbered index — tab number, name, and the three or four numbers that distinguish them
(distance, climb, type, drive time). One line each. No pitch.

Then stop and wait. The founder picks by number or by name.

**If he rejects one with a reason, go straight to step 1's capture rule** before moving on.

### 5. Find the meeting cafe — same rule, Google Maps tabs

Once the trail is chosen, find where the group meets. The cafe is a real operational
decision: it is the meeting point printed in the description, in the group blurbs, and on
every platform, and a wrong or closed one strands people on a mountain.

1. Get the trailhead coordinates (AllTrails schema.org JSON — `publish-run` step 2 has the extraction).
2. Search Google Maps for cafes near those coordinates, biased to the **start** of the route unless the founder asked for one at the **end** (a one-way hike ending at a cafe was an explicit ask on 2026-08-31 — honour which end he named).
3. Drop anything in `venues` in the exclusions file.
4. **Open every candidate as its own Google Maps tab.** Never a chat list of cafe names.
5. Post the numbered index: name, rating, review count, distance from the trailhead, and whether the hours cover the meet time.

Then stop. The founder picks.

**Verify the chosen cafe's name the way Google spells it** — read the `h1` back from its
Maps page and use that exact string. `publish-run` step 4 explains why: a name Google cannot
resolve sends people to the wrong side of a mountain, and this is the one field where being
wrong costs someone their morning.

### 6. Photo for the banner — ask here, once

> *"next time i guess i can be asked automatically for a photo — or reminded, to upload one?"* — founder, 2026-08-31

The event banner is auto-generated at creation, and **the event page has no custom-upload
control** (confirmed 2026-08-31 — the "New banner" UI offers Unsplash search and AI regenerate
only). A real photo from a past hike therefore has to go in through the storage path, and on
2026-08-31 that turned into an unplanned mid-run detour: crop, upload, PATCH `banner_url`,
then verify at two viewport widths.

So ask for it **now**, at selection time, while the founder is already making choices:

> "Photo for the banner? Drop a path or say skip — a shot from a past hike works well. If you
> skip, the event gets the auto-generated banner and we don't revisit it."

- **Path given:** record it in the handoff. `publish-run` uploads it via `./scripts/event-photo-prep.sh <slug> <path>` after the event row exists, then verifies the crop at desktop and 375 px before anything is promoted.
- **Skipped:** the auto-generated banner stands, and the photo is **not raised again this run**. A reminder the founder already declined is just a second interruption.

Faces near the top of a wide crop get cut. When a photo is supplied, check the rendered
banner at both widths and adjust the crop offset before promotion — not after the event is
already on five platforms.

### 7. Hand off

Print the resolved selection and pass it straight into `/slava:events:publish-run`:

```
Trail:   <name> — <alltrails url>
Shape:   <distance> <type>, <elevation>m climb, ~<time>
Meet:    <cafe name as Google spells it> — <maps pin url>, <time>
Date:    <date, time, Asia/Bangkok>
Photo:   <local path | skipped>
Excluded this run: <name (reason)>, ...
```

`publish-run` owns everything downstream — description, duration, prod write, review gate.
Do not draft the description here. It builds the description by cloning the **previous** hike
from prod and swapping the trail facts, using `docs/events/series/social-hike.md` as the base
and rule set (150-word ceiling, reviewer quotes with star ratings, never an entrance fee).
That is how each run keeps the improvements of the last one.

**Collect the quote material here, though, while the tabs are open** — the best trail review
and the best cafe review, each with its star rating and review count. They are part of the
description base now, and the tabs you already opened in steps 4 and 5 are where they live.
