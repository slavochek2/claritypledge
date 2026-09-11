---
name: clarity-night-publish
description: "Turn a disagreement that is live on PROD under a tag into a published Clarity Night event page: write the description from the run's verified material (sourced, balanced across the points, one primary link per section), publish it on TEST for the founder to review on localhost, then, when he confirms, move it to PROD with the community, the gated group chat and a checked banner. Ends when the event is live; promotion is /slava:events:promote-all."
when_to_use: "After /slava:disagreement:publish (or promote-to-prod) has put a tag's points and stories on PROD and the founder has a date, time and venue for the room. NOT for hikes or runs (/slava:events:publish-run), next occurrences cloned from a series (/slava:events:re-create-event), or generic events through the web form (/slava:events:publish-event)."
version: 1.0.0
---

# /slava:disagreement:clarity-night-publish

The last stage of the disagreement family: a tag on prod becomes an event people can register for.

**Announce at start:** "Running /slava:disagreement:clarity-night-publish. I publish on TEST first; nothing moves to PROD until you confirm."

> Codified 2026-09-11 from the first run (tag `aisafety1`). Founder: *"this process that we went can
> be now codified... so next time it is faster."* Each rule keeps its reason so it is not relitigated.

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| A disagreement tag is live on prod and needs its event page | `/slava:disagreement:clarity-night-publish` ← here |
| File the points and stories to the tag (before this) | `/slava:disagreement:publish` |
| Trail run or hike from an AllTrails link | `/slava:events:publish-run` |
| Next occurrence of a recurring series, same content | `/slava:events:re-create-event` |
| Any event through the web form, operator's own account | `/slava:events:publish-event` |
| The event exists; fan it out to platforms and groups | `/slava:events:promote-all` |

---

## Inputs — gather in one message, then go quiet

| Input | Source |
|---|---|
| **Tag** (e.g. `aisafety1`) | The run's publish step. Confirm `/stake/<tag>` shows the points on prod. |
| **Run file** | `.private/points-runs/<slug>.md` — arguers, points, positions (schema: `docs/points-process.md`). |
| **Date, start, end, venue** | Founder decision. Ask whether the room is confirmed; if not, Step 8 drafts the ask. |
| **Community** | `cm` for in-person near Chiang Mai, per `docs/events/org-defaults.md`. |
| **Prod host** | `host_id` of the previous `Clarity Night:` event on prod (anon-readable). |
| **Test host** | A `role=organizer` row in the **test** `membership` table for the **test** `cm` org id. It is a different user from the prod host; reusing the prod id on test fails the org trigger. |

**Read before writing, never restate:** `docs/events/clarity-practice-event.md` (run-of-show,
recording policy, protocol silence) · the tag's source-material file if one exists
(`docs/events/<tag>-source-material.md`) · `content/voice.md`.

**Reference example — copy its structure, never its text:** the first Clarity Night.

```bash
PROD_ANON=$(grep '^PROD_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2- | tr -d '"')   # public key, routine half
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?slug=eq.clarity-night-sanders-lecun-bengio-and-leahy-disagree-on-ai-safety-where-do-you-stand-2026-09-11-rkfj&select=title,description" \
  -H "apikey: $PROD_ANON" -H "Authorization: Bearer $PROD_ANON"
```

`VITE_SUPABASE_ANON_KEY` is the **test** key on this machine and returns 401 against prod.

**Credentials.** The prod service key is in the locked half (`./scripts/keyring.sh status`). Read it
only with the helper, in-process, never from `.env.local` and never as a command argument
(`.claude/rules/credentials.md`). One `require` per process is one dialog for the founder, so give
it a reason he will recognise.

---

## Template

### Step 1 — Title

`Clarity Night: <Names> Disagree on <Topic>. Where Do You Stand?`

- **Prefix exactly `Clarity Night:`** — the series name, recorded in `docs/events/clarity-forum.md`.
  `/slava:events:re-create-event` identifies series by exact title prefix, so keep it byte-identical.
- **Names as a comma list, never "vs".** One arguer may share a point with only one other.
- **One colon, no counts** ("Four Sentences" was dropped: *"I would not say four sentences."*).

### Step 2 — Section order

An opening line on who it is for (you need not work in the field; everybody is welcome), then:

**Where · Why now · Why this evening · Agenda · Optional preparation · Sources**

The recording line closes Optional preparation, just above Sources.

### Step 3 — The rules

**Links**

1. **Every link in an event description is a black pill** (`src/index.css`, `.event-description a`).
   `*[text](https://example.com)*` renders a plain link; `**[text](https://example.com)**` keeps the pill.
2. **Pills only for primary actions:** Directions and the one Read button. At most one per section,
   and nothing clickable in front of the button (the first run unlinked four names for this).
3. **Every factual claim carries a plain footnote** `*[[n]](https://example.com)*` to its source; **Sources** is a
   short numbered list of plain links, and marker `n` is source `n`.

**Claims**

4. **Verify first-hand:** open the source, or `curl` it and `grep -F` the quote in the raw HTML. A
   fetch-tool summary is not a source (first run: a summary said a CEO signed a letter; the article
   named only chief scientists).
5. **Dates in the reader's timezone.** Decode an X post id to UTC and convert to Asia/Bangkok; US
   press dates are often a day earlier.
6. **Balance "Why now" against the agenda.** Write down which side of each point every item
   supports. If they all point one way, add the strongest current evidence for the other side, or
   cut. The page must not answer the room's first question before anyone stakes it.
7. **Blockquote only confirmed, verbatim, contiguous text**; never trim a speaker's own caveat.

**Language**

8. **No product vocabulary** ("stories", "agents", "points" as concepts); "four points" in plain
   English and the Stories tab named for navigation are fine. The Clarity Meeting Principle is named
   once in the agenda with its one-line meaning and **never linked** (`/meet` stays unlinked). That
   naming is a recorded Clarity Night deviation from protocol silence; see the event doc.
9. **Stories are machine-written:** "backed by their own quotes", never "in their own words".
10. **No em or en dashes**, short sentences, no promise about publication, no call to action.

**Sections**

11. **Where:** venue name, the venue's street address as its Google Maps listing gives it, then a
    Directions pill whose Maps query **lands on the single place** (check in a browser: a pin, not a list).
12. **Agenda:** five or six steps in the founder's words. Re-taking positions per point happens in
    the room whether or not the listing says so.
13. **Optional preparation:** one sentence, then one button to `/stake/<tag>?tab=stories`; agenda
    item 1 links `/stake/<tag>` as a plain link. (`?tab=` opens Stories once P1296 ships; until then,
    Points with the Stories tab one tap away.)
14. **Recording:** the one line the event doc's *Recording policy* describes, in its current wording.
15. **Never the group chat in the description**, not the link and not a pointer.

---

## Workflow

### Step 4 — Publish on TEST; the founder reviews the real page

**`scripts/create-event.ts` is PROD-only (its URL is hardcoded). Never run it in this step.**
Insert on test in-process:

```python
import json, urllib.request
env = {k: v.strip('"') for k, v in (l.split("=", 1) for l in open(".env.local").read().splitlines()
       if l.split("=", 1)[0] in ("VITE_SUPABASE_URL", "TEST_SUPABASE_SERVICE_ROLE_KEY"))}
U, K = env["VITE_SUPABASE_URL"], env["TEST_SUPABASE_SERVICE_ROLE_KEY"]
assert "gfjctyxqlwexxwsmkakq" in U, "not the TEST project, stop"
H = {"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json", "Prefer": "return=representation"}
row = {"slug": "<slug>", "title": "<title>", "description": open("<desc.md>").read(),
       "datetime": "<UTC ISO, e.g. 2026-09-18T11:00:00+00:00 for 18:00 Bangkok>", "duration_minutes": 150,
       "timezone": "Asia/Bangkok", "location": "<venue, street address>", "status": "upcoming",
       "host_id": "<test host>", "org_id": "<test cm org id>"}
r = urllib.request.Request(f"{U}/rest/v1/events", data=json.dumps(row).encode(), headers=H, method="POST")
print(json.loads(urllib.request.urlopen(r).read())[0]["slug"])
```

Links in the description are absolute prod URLs, so they work from the test page. Revisions are a
`PATCH` of `description` on the same row.

- Start the dev server from the main checkout and read its port from the log (5001 on the first run).
  A blank page mid-session usually means a co-tenant build flooded the file watcher: restart it.
- The founder reviews the page, not a paragraph (*"no need to show me text, i can correct it on
  live event"*). Apply each round to test and reload.

### Step 5 — Self-check before asking for PROD

Paste the evidence; do not ask to move to PROD until all pass.

- [ ] Marker `n` equals Sources item `n` for every `n` — checked by a script, not by eye
- [ ] Every quote found with `grep -F` in its raw source
- [ ] Every date converted to Asia/Bangkok
- [ ] The rule-6 balance table exists, with items on both sides of the points argued first
- [ ] Exactly one pill in Optional preparation; Directions resolves to the venue's pin
- [ ] Title starts `Clarity Night:`, comma list, no "vs"
- [ ] Zero em and en dashes (counted)
- [ ] Rendered at desktop and at a **confirmed** 375 px: `chrome-devtools` `emulate`, then read
      `window.innerWidth` (`resize_window` silently clamps near 500). No horizontal overflow.
      Without a browser, say the mobile check was not run; never report it as passed.

### Step 6 — Move to PROD, only when the founder confirms it in this turn

1. **Create** with `npx tsx scripts/create-event.ts <file.json>`, input shaped like the Step 4 row
   but with `"host_id": "<prod host>"` and `"org_slug": "cm"` instead of `org_id` (it resolves the
   org, generates the slug, and prints `SLUG=`). It sets no banner and no group chat.
   **Known gap:** this script reads the prod service key from the `.env.local` plaintext copy,
   around the per-access gate (tracked in the private process-learnings inbox, 2026-09-11). Until
   that is fixed, **say so when you ask to move to PROD** and run it only on the founder's word. Every
   other prod service-role call in this skill goes through the helper.
2. **Group chat: publish-run step 8c's *procedure*, not its code** (8c passes the key in `argv`).
   In-process, one dialog per process, and never print the invite URL:

   ```python
   import json, re, sys, urllib.request
   sys.path.insert(0, "scripts/lib"); from keyring import require
   K = require("PROD_SUPABASE_SERVICE_ROLE_KEY", reason="Clarity Night group chat, <new slug>")
   P = "https://besjtuodziykmjidubzw.supabase.co"
   def call(path, data=None, method="GET", prefer="return=representation"):
       h = {"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json", "Prefer": prefer}
       r = urllib.request.Request(P + path, json.dumps(data).encode() if data is not None else None, h, method=method)
       return json.loads(urllib.request.urlopen(r).read() or b"[]")
   NEW = "<new event id>"
   prev = call(f"/rest/v1/events?title=ilike.Clarity%20Night%3A*&id=neq.{NEW}&order=datetime.desc&limit=1&select=id,title")[0]
   url = call(f"/rest/v1/event_private_info?event_id=eq.{prev['id']}&select=group_chat_url")[0]["group_chat_url"]
   page = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})).read().decode("utf-8", "ignore")
   m = re.search(r'og:title" content="([^"]*)', page)
   print("from:", prev["title"], "| invite resolves to:", m.group(1) if m else "UNKNOWN, open it in a browser")
   ```

   It must resolve to the **Clarity Nights group inside the community**, never the community's own
   link (that lands people in announcements, where members cannot post). State which event it came
   from, get the founder's yes, then in a second process write the row with
   `Prefer: resolution=merge-duplicates`, set `has_group_chat`, and read back printing only
   `bool(group_chat_url)`. An empty read-back means the button will not render.
3. **Banner.** The generator accepts only the **signed-in host**; a service key cannot trigger it.
   The founder logs in on claritypledge.com and the host controls appear on the banner strip. Then
   **look at it**: it is given the title, so it may paint the named people on a stage, which reads
   as them attending. If so, regenerate with keywords about the room (*library evening, people in a
   discussion circle*). Then check the crop at desktop and a confirmed 375 px (publish-run's rule:
   faces near the top of a wide crop get cut).
4. **Render check on prod, signed out** (an isolated browser context): title, venue, all six
   sections, and the locked group-chat state a stranger sees.

### Step 7 — Short link, once per topic

Read `SERIES` in `api/series-redirect.ts` first; if the topic has a key, stop here. Otherwise mirror
`/hike`: add the topic as a title `ILIKE` pattern keyed on the **topic**, not on "Clarity Night"
(not every night shares a topic), and add `/<topic>` to `vercel.json`. Before committing, run the
function's own query against prod, **including `status=eq.upcoming` and the 5-hour grace cutoff**,
and confirm it returns exactly this event and no unrelated upcoming event, plus a `/hike` control.
Edit and commit in one step with `./scripts/git-ops.sh commit-to-main` so nothing sits uncommitted on
the shared checkout. **Live only after the founder pushes.**

### Step 8 — Venue confirmation message, if the room is not confirmed

Copy-paste ready: plain text between `---` separators, no blockquote, no em dashes, written as the
founder. An apology only if it is actually late; the link (the short link once live); the topic in
one line; the ask, with room, date and time, in its own paragraph; critical feedback welcome. This
skill drafts it; the founder sends it.

### Step 9 — Hand off

Report the prod URL, the short link's state (live, or waiting on push), the banner's state, and
everything waiting on the founder: log in for the banner, push, venue confirmation.
Next: `/slava:events:promote-all`.

---

## What this skill does NOT do

- File points or stories, or create agent accounts (`/slava:disagreement:publish`, `/slava:content:provision-agent`)
- Push or deploy, promote, or click Create or Publish on any platform
- Write the group-chat link into the description, a repo file, or the transcript
- Chain TEST into PROD: Step 6 waits for the founder's word in the same turn

## Quality gates (prod only; Step 5 covers the copy)

- [ ] The founder confirmed the move to PROD in the same turn, after hearing the Step 6.1 known gap
- [ ] The group-chat read-back printed `True`
- [ ] Prod rendered signed out with the venue and all six sections, and the banner passed the look-and-crop check

## Related Skills

- `/slava:disagreement:run-pipeline` and `/slava:disagreement:publish` — the stages before this one
- `/slava:events:publish-run` — step 8c, the group-chat procedure this reuses
- `/slava:events:promote-all` — the next step
- `docs/events/clarity-practice-event.md` — run-of-show, recording policy, protocol silence
