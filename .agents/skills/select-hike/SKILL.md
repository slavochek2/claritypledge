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

### 1b. Trail status — the world's decisions, not the founder's taste

Step 1 drops trails the founder has ruled out. This step drops trails **someone else** has ruled
out: a national park that is closed for the season, ground that needs a permit or a local guide,
or a route carrying a live safety advisory. Read `.private/trail-status.json` (schema is in the
file; create from it if absent).

**Two files, two different questions. Do not merge them.** `event-exclusions.json` answers "does
the founder want this?" and never expires. `trail-status.json` answers "is this legal, open and
safe right now?" and **always** expires — that is why every entry carries `checked_on` and
`recheck_after`.

- `verdict: blocked` → drop before opening a tab, exactly like an exclusion.
- `verdict: conditional` → drop unless the named `condition` has been met. Do not offer it "with a
  caveat"; a caveat in chat is not a permit.
- `verdict: clear` **and** today is before `recheck_after` → no re-verification needed. This is the
  whole point of the file: a trail checked in September should not cost five searches in October.
- `clear` but **past** `recheck_after`, or **absent from the file entirely** → run the check below,
  then write the result back before the candidate is offered.

**The check, for any trail not already cleared.** Read the AllTrails description in full — not the
title, not the stats row. Then search in **Thai**, because a Thai park closure is announced in Thai
and the English web will not carry it. Look for four things:

1. **Is it inside a national park or wildlife sanctuary?** Most Thai parks run an annual closure,
   commonly 1 May – 31 Oct, and publish it through DNP. A park name in the description is the
   trigger, not a detail.
2. **Permit, registration, or local guide required?** Phrases like *"contact the National Park for
   a guided tour"* or *"you will need a local guide"* are disqualifying for a free drop-in hike,
   however good the trail is.
3. **Where does access actually start?** Some parks require the trek to begin at park headquarters.
   A trailhead pin that is not that place is not an entrance.
4. **Any safety advisory?** Search the Thai trail name plus `เตือนภัย` (warning), `ถูกคุกคาม`
   (threatened) and `ปิด` (closed), and check the Google Maps trailhead POI for a "Temporarily
   closed" label.

**Read the ALERT panel, not just the description.** AllTrails shows park attribution in the header
and active conditions behind a "Caution / N alert" button — neither appears in the short description
that a plain fetch returns. On 2026-09-07 Mon Cham was seeded into the status file as clean on the
strength of its description, and only a second look showed it is inside Doi Suthep-Pui National Park
AND carries a live partial-closure alert (a fallen tree since July 2026). Neither fact was
disqualifying; both belonged in the record and one belongs in the event description. Open the alert.

**Grade the evidence before it reaches the founder or the description.** An AllTrails alert is a
claim, not a fact: check whether the source it cites actually carries the notice, whether any
official announcement corroborates it, and whether anyone has reviewed the trail since. An
uncorroborated alert is worth recording in the status file and worth a heads-up in the group chat.
It does not belong in the public event description, which by the series rules carries a hazard only
when it changes what someone packs or whether they come.

**A source has to be official.** DNP (`dnp.go.th`, `portal.dnp.go.th`), the park's own page, or a
provincial authority. AllTrails, a blog, and a tour operator are leads, never the verdict — and a
review that says "we did it without a guide" proves someone broke a rule, not that the rule is
absent.

**Write the result back the same turn, pass or fail.** An entry that only lives in the transcript
is a check the next run pays for again. Record `verdict`, `checked_on`, `recheck_after`, the
`authority` and its `authority_contact` (a phone number the founder can use), the official
`sources`, and one `findings` line per independent fact. Set `recheck_after` to whichever comes
first: the end of a known closure period, or 90 days.

**Why this step exists.** 2026-09-07: Doi Langka Noi Loop was recommended to the founder on
distance, rating and a passing cafe check. Its AllTrails description said, unread, *"you will need
a local guide to go with you on the trail."* Its park had been closed since 1 May by DNP
announcement, its access required registration starting at park headquarters 100 km away, and five
weeks earlier the department had published a statement about hikers being threatened on that exact
route. The cafe gate built the same day worked perfectly. Nothing checked the trail.

### 2. Read the standing preferences — do not re-interrogate

Read `.private/hike-preferences.json` FIRST. It holds what the founder has already decided and
does not want to be asked again: the day and meet time, the distance band, how far from the city,
the cafe gate's thresholds, the never-re-offer rule, the banner requirement, and what this skill
may do without checking in. Each entry carries the date and the words it came from.

> *"improve the skills so next time the next hike will not need me to repeat and I am less in the
> loop if needed"* — founder, 2026-09-07

**Ask only what the file does not cover**, and ask it in ONE message at a moment he is already
deciding — never as a separate interruption. In a normal week that is zero questions, or one:
the banner photo, if the file's answer has gone stale.

**A contradicted preference is updated here in the same turn.** When he says "too long", "further
out", "not that one again", write it into the file with his words and today's date before
continuing. A preference obeyed for one run and then forgotten is the interrogation rebuilding
itself.

**What the file does not do is remove decisions.** He still picks the trail from open tabs, picks
the cafe from open tabs, approves the description, and clicks Create. What it removes is
everything that used to happen before those four moments.

If a preference looks wrong for this particular week — a public holiday, he is away, he has asked
for something unusual — say so in one line and proceed on the exception. Do not silently override
the file, and do not stop for permission to follow it.

### 3. Search AllTrails via Chrome

Use `claude-in-chrome`. Search AllTrails filtered to the city and the constraint band from
step 2. Gather candidates with: name, URL, distance, elevation gain, route type, difficulty,
rating, review count, and drive time from the city centre.

Apply step 1's exclusions **and step 1b's trail status** — a `blocked` or unmet-`conditional` trail never reaches the ranking. Then **rank by fit to the stated constraints, and cut to 3–5** —
enough to choose from, few enough to actually look at. Ranking factors, in order: matches the
stated shape (distance/difficulty/route type), rating and review count high enough to trust,
drive time reasonable, and — when the founder asked for a cafe at the end — a plausible cafe
near the finish (confirmed in step 4, not assumed here).

**A trail with no qualifying cafe is not a candidate.** Step 5's cafe gate is a precondition of
the offer, not a follow-up to it: run it against each shortlisted trail BEFORE any tab opens,
and drop the trails that fail. The founder should never be shown a hike whose meeting point
does not exist yet.

### 4. Open every trail candidate in its own tab

One `tabs_create_mcp` per candidate, all opened before you write anything in chat. Then post
the numbered index — tab number, name, and the three or four numbers that distinguish them
(distance, climb, type, drive time). One line each. No pitch.

Then stop and wait. The founder picks by number or by name.

**If he rejects one with a reason, go straight to step 1's capture rule** before moving on.

### 5. Find the meeting cafe — and gate it on walking distance and opening hours

Once the trail is chosen, find where the group meets. The cafe is a real operational
decision: it is the meeting point printed in the description, in the group blurbs, and on
every platform, and a wrong or closed one strands people on a mountain.

**The gate — both halves, or the cafe does not count.**

1. **Within 15 minutes on foot of the trailhead.** Measured, never estimated, and never from
   straight-line distance — mountain roads switchback and the climb slows walking to a crawl.
   Use OSM foot routing:

   ```bash
   curl -s "https://brouter.de/brouter?lonlats=<cafeLon>,<cafeLat>|<headLon>,<headLat>&profile=hiking-mountain&alternativeidx=0&format=geojson"
   ```

   Read `total-time` (seconds) from the response. **≤ 900 s passes.** `track-length` gives metres
   for the description. Note the argument order is lon,lat — reversed coordinates return a
   plausible-looking route through the wrong country.

2. **Open at the meet time, on the event's weekday, per Google.** Open the place page and read the
   day's `aria-label` (e.g. `"Sunday, 8 AM to 5 PM"`). **A cafe with no published hours fails**,
   however good its rating — "probably open" is not a meeting point. OpenStreetMap's
   `opening_hours` tag is a lead for finding candidates, never the verdict.

**Prove the gate both ways before trusting it.** Run one cafe you expect to pass and one you
expect to fail through the identical command. If both score alike, the probe is blind and the
verdict means nothing.

Then:

1. Get the trailhead coordinates (AllTrails schema.org JSON — `publish-run` step 2 has the extraction).
2. Search Google Maps for cafes **and restaurants** near those coordinates, biased to the **start**
   of the route unless the founder asked for one at the **end** (a one-way hike ending at a cafe was
   an explicit ask on 2026-08-31 — honour which end he named).
3. Drop anything in `venues` in the exclusions file.
4. Apply the two-part gate above. **Open only survivors as tabs** — one Google Maps tab each, never
   a chat list of cafe names.
5. Post the numbered index: name, rating, review count, **measured walking minutes**, and the
   day's opening hours.

Then stop. The founder picks.

**Report the failures in one line too**, the way step 1 reports exclusions — otherwise a short list
reads as a thin area rather than as a gate doing its job: `Rejected: Lake View Cafe (22 min walk),
ร้านกาแฟผ่อห้วย (opens 10:00 Sunday)`.

**Why this gate exists.** The 2026-08-31 hike met at Cafe Leng Doi Pui, which measures **46 minutes**
on foot from its own trailhead — nobody had measured it. Asked to add the rule on 2026-09-07, the
first pass of it rejected five of nine candidate trails outright, including two whose only nearby
cafe opened at 09:30 for a 09:00 meet.

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
