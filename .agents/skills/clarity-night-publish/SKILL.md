---
name: clarity-night-publish
description: "Turn a disagreement that is live on PROD under a tag into a published Clarity Night event page: write the description from the run's verified material (sourced, balanced across the points, one primary link per section), publish it on TEST for the founder to review on localhost, then, when he confirms, move it to PROD with the community, the gated group chat and a checked banner. Ends when the event is live; promotion is /slava:events:promote-all."
when_to_use: "After /slava:disagreement:publish (or promote-to-prod) has put a tag's points and stories on PROD and the founder has a date, time and venue for the room. DRAFT MODE (TEST only) may run earlier, right after select Gate 2, from the approved cast. NOT for hikes or runs (/slava:events:publish-run), next occurrences cloned from a series (/slava:events:re-create-event), or generic events through the web form (/slava:events:publish-event)."
version: 1.2.0
---

# /slava:disagreement:clarity-night-publish

The last stage of the disagreement family: a tag on prod becomes an event people can register for.

**Announce at start:** "Running /slava:disagreement:clarity-night-publish. I publish on TEST first; nothing moves to PROD until you confirm."

> Codified 2026-09-11 from the first run (tag `aisafety1`). Founder: *"this process that we went can
> be now codified... so next time it is faster."* Each rule keeps its reason so it is not relitigated.

---

## Draft mode — a TEST page right after select Gate 2 (P1355 P1)

The founder judges the page, not a paragraph, and on Clarity Night #2 the page was drafted while the
pipeline was still running. So the TEST page may be drafted **as soon as select's Gate 2 approves the
cast**, before any tag, point or story exists.

| Draft mode needs | Draft mode does NOT need |
|---|---|
| The approved cast, each with its `why_in_the_room` line (run file) | A live tag on prod |
| The **planned** tag — used for `/stake/<tag>` links, which stay unchecked until the PROD path | Points or stories |
| Date, venue and **this night's** run of show (rule 12) | |
| **Quotes only with a confirmation record** — see rule 4 and the three options below | Positions to have run |

**Draft mode is where the 2026-09-22 misattribution happened, so it carries rule 4 in full (P1358
R1c).** Drafting before positions means the confirmed quote list does not exist yet. That is not a
licence to quote on a caption match; it is a choice between three options, and the page names which
one it took:

1. **Run Step 4b + 4c now, for the page's quotes only.** A page carries a handful, not a run's worth —
   `positions.md` Steps 4b and 4c are per quote and cost little on a handful.
2. **Use a single-speaker quote instead.** No record needed, no cost, and most pages have the choice.
3. **Use no quote at all.** A page whose claims are footnoted to sources does not need a blockquote.

**What draft mode may never do is quote a multi-speaker source on the strength of `grep -F`.** TEST is
not a safe harbour here: the founder reviews that page and may share the link, and a false quote under
a real person's name is just as false on TEST.

**The corrections log exists before the first correction (P1367).** Draft mode's first action,
before any founder question, is `mkdir -p .private/events/<run-slug>` and creating an empty
`.private/events/<run-slug>/improvements.md`. Every founder correction to the page is appended
there **in the same turn** it is applied: the date, what he said (verbatim), the rule it implies.
P1355 required this log and it was never created once; the ~20 corrections of 2026-09-28 had to be
rebuilt from transcripts. Rules found this way move into this file generically, never as that
event's text.

Draft mode writes **only to TEST** (Step 4). The PROD path below keeps its precondition that the tag's
points are live on prod, and re-checks every `/stake/<tag>` link before Step 6.

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
| **Tag** (e.g. `aisafety1`) | The run's publish step. Confirm `/stake/<tag>` shows the points on prod. In draft mode, the planned tag. |
| **Run file** | `.private/points-runs/<slug>.md` — arguers, points, positions (schema: `docs/points-process.md`). |
| **Date, start, end, venue** | Founder decision. Ask whether the room is confirmed; if not, Step 8 drafts the ask. **Resolve the date by command, never in your head** (P1367): `node scripts/events/event-date.mjs resolve --today <YYYY-MM-DD> --time <HH:MM> "<his words>"`. Exit 3 means the phrase has two readings ("next Tuesday" on a Monday): show him both lines and write nothing until he picks. Echo the chosen line back, and write it into the handoff's `## Now` block in the same step as the DB write. |
| **Run of show for THIS night** | Founder decision, asked every time. Never copied from the previous night (rule 12). |
| **Community** | `cm` for in-person near Chiang Mai, per `docs/events/org-defaults.md`. |
| **Prod host** | `host_id` of the previous `Clarity Night #` event on prod (anon-readable). |
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

`Clarity Night #<N>: <Topic>. <Names>` (P1355 P2)

- **Prefix exactly `Clarity Night #<N>:`**, where `N` is the previous night's number plus one (read
  it from the newest `Clarity Night #` title on prod). Numbering is the founder's decision of
  2026-09-22 (*"Clarity Night #2, (better)"*); the series name and format live in
  `docs/events/clarity-forum.md`. `/slava:events:re-create-event` matches the series by the prefix
  `Clarity Night`, which the number does not change.
- **Topic first, then the names** (#2: *"Clarity Night #2: AI and Your Ikigai. Sinek, Tan, Naval,
  Watts and Brooks"*). The ending after the names stays open until the founder settles it.
- **Only names a stranger would recognise.** The test is binary: the person has an English Wikipedia
  article. Lived-experience voices (`voice: lived`) are **never** named in the title, even when they
  are in the room.
- **Names as a comma list, never "vs".** One arguer may share a point with only one other.
- **One colon, no counts in the title** ("Four Sentences" was dropped: *"I would not say four sentences."*).

### Step 2 — Section order (P1355 P3, revised P1367)

An opening, then these five headings, in this order, and nothing else:

1. **A short opening** — who it is for. It is also the link preview, so it stands alone.
2. **Why now**, with the one explainer image (rule 16).
3. **Agenda.**
4. **Prepare for the event** — the people, then the one button.
5. **How Clarity Nights are different** — why revealing a gap in understanding is rewarded here,
   ending with a plain link to the community (founder, 2026-09-22: *"this is not why, this is how
   is Clarity Night special"*). No sentence cap: on 2026-09-28 the founder wrote this section
   himself as one paragraph of nine sentences.
6. **Sources.**

**There is no Where section and no separate "Who is in the room".** The venue lives in the event's
location field, and the header's location link opens the venue's pin (rule 11). The people live in
*Prepare for the event*.

- **Prepare for the event:** one lead-in sentence, then one bullet per arguer built from the run
  file's `why_in_the_room` lines (P4): **bold name**, who they are in a few words, and one verified
  quote (rule 4). **Recognisable people first; lived-experience voices last.** Names are never
  linked, and nothing is clickable before the button (rule 2). The section closes with the one
  button to `/stake/<tag>?tab=stories`. **Never** leave a placeholder as an HTML comment in the
  text: the promote skills copy the raw description to other platforms.
- **Agenda counts are approximate** until positions has run ("about five contested points"), then
  exact.

**The page is checked by command, on the draft file, before any DB write** (P1367):

```sh
node scripts/points/page-check.mjs <desc.md>; echo $?
```

It checks the heading list and order, sentence length, negation openers, "we quoted", product
vocabulary, the Sources rule, the one plain `/meet` link, unlinked names, the one pill, round-rule
mechanics and dashes. `REJECT` lists each finding; fix the draft, never the check. It checks shape
and a closed word list only; the founder still reviews the rendered page.

### Step 3 — The rules

**Links**

1. **Every link in an event description is a black pill** (`src/index.css`, `.event-description a`).
   `*[text](https://example.com)*` renders a plain link; `**[text](https://example.com)**` keeps the pill.
2. **Pills only for primary actions:** the one Read button (the venue has no section, so no Directions pill). At most one per section,
   and nothing clickable in front of the button (the first run unlinked four names for this).
3. **Every factual claim carries a plain footnote** `*[[n]](https://example.com)*` to its source; **Sources** is a
   short numbered list of plain links, and marker `n` is source `n`.

**Claims**

4. **Verify first-hand:** open the source, or `curl` it and `grep -F` the quote in the raw HTML. A
   fetch-tool summary is not a source (first run: a summary said a CEO signed a letter; the article
   named only chief scientists).

   **A `grep -F` hit proves the WORDS EXIST. It says nothing about who spoke them — so a quote from a
   multi-speaker source may go on the page only with a Step 4b + 4c confirmation record behind it
   (P1358 R1c).** Enumerate every quote the page shows and run the predicate; the stage reads its
   exit code:

   ```sh
   node scripts/points/page-quote-check.mjs <page-quotes.json>; echo $?
   # {quotes:[{text, person, basis, seconds,
   #   confirmation:{step_4b, evidence, step_4c, window, speaker}}], confirmed:[…from the run file]}
   ```

   `REFUSE` = at least one quote is attributed on nothing better than a caption match. Single-speaker
   sources need no record and never did. Pass `confirmed` once positions has run, so the page's list
   is checked against the run file's rather than against itself.

   **The predicate checks the LIST YOU HAND IT, and nothing extracts that list from the page — so
   enumeration is yours, and an incomplete list passes.** Unlike the marker check above (*"checked by a
   script, not by eye"*), this one cannot see the page. Build the list by reading the page's own
   blockquotes and attributed lines top to bottom, and **paste the count beside the exit code**
   (*"7 quotes enumerated, exit 0"*) so the number is reviewable. A quote you forgot to list is exactly
   the 2026-09-22 failure with the check added and not run. Named by review, 2026-09-28.

   **Measured 2026-09-22, on this skill's own TEST page.** *"we sacrifice happiness in order to be
   successful…"* [34:13] was published under the guest; the **host** said it, and the guest's reply
   twenty seconds later argues the opposite. It arrived from exactly the `grep -F` above, about an hour
   before any diarization ran. The words were real, the page was wrong, and nothing in this rule
   looked at the speaker.
5. **Dates in the reader's timezone.** Decode an X post id to UTC and convert to Asia/Bangkok; US
   press dates are often a day earlier.
6. **Balance "Why now" against the agenda.** Write down which side of each point every item
   supports. If they all point one way, add the strongest current evidence for the other side, or
   cut. The page must not answer the room's first question before anyone stakes it.
7. **Blockquote only confirmed, verbatim, contiguous text**; never trim a speaker's own caveat.

**Language**

8. **No product vocabulary** ("stories", "agents", "points" as concepts); "four points" in plain
   English and the Stories tab named for navigation are fine. The Clarity Meeting Principle is named
   once in agenda item 1 and **linked once, plain**: `*[Clarity Meeting Principle](https://claritypledge.com/meet)*`,
   never a pill (founder, 2026-09-28: *"maybe okay link it"*, superseding "never linked"). That
   naming is a recorded Clarity Night deviation from protocol silence; see the event doc.
9. **Stories are machine-written:** "backed by their own quotes", never "in their own words".
10. **No em or en dashes**, short sentences, no promise about publication, no call to action.
    Short means checked: `page-check.mjs` fails any prose sentence over its word limit.
17. **No negation opener.** Neither the page nor any section starts with what the event is not
    (founder, 2026-09-28: *"Why do you start with negation?"*).
18. **Never "we quoted".** The page shows quotes; it does not narrate quoting them.
19. **Never imply the people spoke about the event's frame term** when they did not. If the topic
    word is ours, say what they argue about in their own terms (2026-09-28: *"none of them said a
    word about Ikigai… Six well-known experts argue about AI work in meaning"*).
20. **No talk videos in Sources.** Each person's story already carries their source; Sources holds
    only the claims in *Why now*.
21. **The round rule is what the room does, never page copy.** In each round nobody disagrees while
    the lower of the two understanding numbers is under 8, and numbers are given only if the
    listener opted in (decisions.md 2026-09-17 [product]). The page states the social norm, never
    the mechanics: no scores, no scale, no threshold (founder, 2026-09-28: *"maybe we shouldn't talk
    here about mechanics"*).

**Sections**

11. **Venue link:** the event's location field holds the venue name and street address as its Google
    Maps listing gives it, and the page header's location link must open **the single venue pin**
    (check in a browser: a pin, not a list). There is no venue section in the description.
12. **Agenda:** this night's run of show, asked as an input and **never copied from the previous
    night**. The room format for in-person nights is in the event doc (trios since 2026-09-28);
    describe it in plain words, rounds and minutes included. The demo volunteer is not described;
    the closing step uses the founder's own words; an optional dinner is listed only when he names
    one. Re-taking positions per point happens in the room whether or not the listing says so.
13. **The contested points link:** the agenda item where everybody takes a position links
    `/stake/<tag>` as a plain link; the button in *Prepare for the event* links
    `/stake/<tag>?tab=stories`.
14. **Recording:** when the night is recorded, the one line the event doc's *Recording policy*
    describes, in its current wording, at the end of *How Clarity Nights are different*.
15. **Never the group chat in the description**, not the link and not a pointer.
16. **At most one explainer image**, hosted on our own storage (`event-banners/descriptions/`) in the
    same environment as the event: the page drops images from anywhere else (P1352). Moving to PROD
    means uploading the file to prod storage and swapping the URL; a test-storage URL renders nothing there.

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

**Build the banner now, on TEST, before the founder reviews the page** — draft mode included. Follow
Step 6.3's banner rules (template, faces, one flat band, fixed height) and upload it to the TEST
event; Step 6.3 later only re-uploads the approved file to prod storage.

- Start the dev server from the main checkout and read its port from the log (5001 on the first run).
  A blank page mid-session usually means a co-tenant build flooded the file watcher: restart it.
- The founder reviews the page, not a paragraph (*"no need to show me text, i can correct it on
  live event"*). Apply each round to test and reload.

### Step 5 — Self-check before asking for PROD

Paste the evidence; do not ask to move to PROD until all pass.

- [ ] Marker `n` equals Sources item `n` for every `n` — checked by a script, not by eye
- [ ] Every quote found with `grep -F` in its raw source
- [ ] `page-quote-check.mjs` exits 0 on the page's enumerated quotes, with **the verdict word and the
      exit code both pasted** — `CONFIRMED` means the quotes were matched against the run file's
      confirmed list, `CONFIRMED-SELF-ATTESTED` means they were checked only against themselves (no run
      file supplied, which is the normal draft-mode state). Exit 0 alone does not distinguish them
- [ ] **The enumerated count equals the page's own quote count, both numbers pasted** — derive the
      page's count by command, never by eye (`grep -c '^>' <page-description-file>`, or the equivalent
      over the description field), and compare it with `quotes.length` in the JSON you passed. The
      marker item above already solved this problem with *"checked by a script, not by eye"*; a page
      showing four blockquotes and enumerating three otherwise passes with exit 0, which is the
      2026-09-22 failure with the check added and not run (review, 2026-09-28)
- [ ] Every date converted to Asia/Bangkok
- [ ] The rule-6 balance table exists, with items on both sides of the points argued first
- [ ] `page-check.mjs` exits 0 on the description, output pasted (the five sections of Step 2,
      one pill, one plain `/meet` link, rules 8, 10, 17 to 21)
- [ ] `node scripts/events/event-date.mjs check --env test <slug>` exits 0, or the mismatch is
      named to the founder (a TEST slug is hand-written; PROD slugs take the event date since P1367)
- [ ] The handoff's `## Now` block names this page and the resolved date; `node scripts/events/run-status.mjs <run-slug>` exits 0
- [ ] The header location link opens the venue's pin
- [ ] Title starts `Clarity Night #<N>:` with N = previous + 1, comma list, no "vs"
- [ ] Zero em and en dashes (counted)
- [ ] Rendered at desktop and at a **confirmed** 375 px: `chrome-devtools` `emulate`, then read
      `window.innerWidth` (`resize_window` silently clamps near 500). No horizontal overflow.
      Without a browser, say the mobile check was not run; never report it as passed.

### Step 6 — Move to PROD, only when the founder confirms it in this turn

1. **Create** with `npx tsx scripts/create-event.ts <file.json>`, input shaped like the Step 4 row
   but with `"host_id": "<prod host>"` and `"org_slug": "cm"` instead of `org_id` (it resolves the
   org, generates the slug, and prints `SLUG=`). It sets no banner and no group chat.
   It reads the prod service key through the per-access lock (P1316), so it raises one
   authorization dialog — tell the founder **Allow**, never "Always Allow"; a declined dialog creates
   nothing. Every prod service-role call in this skill now goes through the lock.
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
   # Matches "Clarity Night #N:" and the pre-numbering "Clarity Night:" titles; the regex drops any
   # other title that merely starts with the words (the ilike alone would admit them).
   rows = call(f"/rest/v1/events?title=ilike.Clarity%20Night*&id=neq.{NEW}&order=datetime.desc&limit=10&select=id,title")
   prev = next(r for r in rows if re.match(r"Clarity Night( #\d+)?:", r["title"]))
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
3. **Banner — an illustrated line-up, built from the committed template** (P1355 P6). The built-in
   generator is not used for a Clarity Night: on Clarity Night #2 it misspelled names and painted
   the people on a stage, which reads as them attending, and the banner was rebuilt five times.
   - **Faces:** an illustrated line-up of the **recognisable** arguers only — never photoreal, never a
     lived-experience voice. The image model draws the faces and nothing else.
   - **Names:** HTML text from `scripts/events/lineup-banner.html`, screenshotted in a browser — never
     drawn by the image model. Edit only the template's JSON block (people, motif).
   - **Motif:** accurate to the topic (Clarity Night #2: the four overlapping ikigai circles).
   - **Layout:** everything in one flat row inside the template's middle band. **Never change the
     banner height** (founder, 2026-09-22: *"otherwise the event description not visible"*); the
     template is built for the fixed-height slot.
   - **Check it on the real page** at 320, 375, ~1500 and 1920 px (confirmed widths, see Step 5).
   - **Upload** through the existing custom-banner route — storage upload plus a `banner_url` PATCH,
     as `/slava:events:publish-run` 8b does — in the event's own environment. The TEST upload already
     happened in Step 4; here the same approved file goes to **prod** storage and the prod row.
   - **Phone variant (P1354):** if the faces or names go illegible at 375px (the wide banner squeezed
     into the 192px phone slot), set `events.banner_mobile_url` as well. `BannerDisplay` shows it only
     below the `md` (768px) breakpoint; `banner_url` is unaffected at every other width. It is
     **hand-set only** (no generator, no host UI): `PATCH /rest/v1/events?id=eq.<id>` with the service
     role key, like the other direct-DB steps here. Compose it from the same illustrated faces — the
     template's JSON with the people laid out 2-row/3-column, or whatever grid reads best at ~2:1 —
     rather than fresh art, so the two banners match. Confirm it at 375px like the desktop crop.
4. **Render check on prod, signed out** (an isolated browser context): title, venue link, the five
   Step 2 sections in order, and the locked group-chat state a stranger sees. Then
   `node scripts/events/event-date.mjs check --env prod <new slug>` must exit 0, and the handoff's
   `## Now` block is rewritten for PROD.

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

Rewrite the handoff's `## Now` block (fields in `scripts/events/run-status.mjs`), then report the prod URL, the short link's state (live, or waiting on push), the banner's state, and
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
- [ ] Prod rendered signed out with the venue link and the five Step 2 sections, and the banner passed the look-and-crop check at 320, 375, ~1500 and 1920 px
- [ ] If a phone-specific banner was set (`banner_mobile_url`), it was confirmed legible at 375px too

## Related Skills

- `/slava:disagreement:run-pipeline` and `/slava:disagreement:publish` — the stages before this one
- `/slava:events:publish-run` — step 8c, the group-chat procedure this reuses
- `/slava:events:promote-all` — the next step
- `docs/events/clarity-practice-event.md` — run-of-show, recording policy, protocol silence
