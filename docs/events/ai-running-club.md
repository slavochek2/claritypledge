# AI Running Club Chiang Mai — Series Operations

## Series Metadata

- **Title format:** `AI Running Club Chiang Mai #N — Sun MMM DD`
  — both series identity and date anchor; `#N` = event-count, not week-count (skips don't increment)
- **Cadence:** Every Sunday, 9:00 AM ICT (Asia/Bangkok)
- **Host UUID:** `a99042ef-e740-446a-8734-389c8589cc17` (Slava)
- **Location:** Fernpresso at Lake, Chiang Mai, Thailand
- **Two tracks:**
  - Short loop — ~20 minutes
  - Long loop — ~45–60 minutes
- **Talks:** Up to 3 lightning talks (5 min + 5 min Q&A). Reserve via WhatsApp DM to Slava.
- **WhatsApp group:** https://chat.whatsapp.com/JDVnXUypnC0HA3OkJldy7G
- **Duration:** 120 minutes
- **Timezone:** Asia/Bangkok

---

## Description Template — Literal Copy

Edit only `#N` and the date. Do not rephrase.

```markdown
Morning run around the lake, then AI talk. All levels welcome.

**What it is**
A loose, friendly group run. Two tracks so everyone fits:
- **Short loop** — ~20 minutes
- **Long loop** — ~45–60 minutes

Both at slow, conversational pace (7–10 km/h). Quiet paths around the lake, open air, nature — a peaceful corner of Chiang Mai.

**Who's it for**
Anyone curious. Builders, users, beginners, sceptics, just-passing-through. If you've used ChatGPT once, never, or every day — you're in the right place. No expertise required.

Not sure if it's for you? Come once. The run is good either way.

**What to bring:** running shoes, 1L+ water, sun protection.

---

**After the run: AI talk + discussion.**
Up to 3 lightning talks (5 min + 5 min Q&A) — share a project, an experiment, a question, a thing that surprised you. Spontaneous talks welcome if slots remain.

**[Join the WhatsApp group](https://chat.whatsapp.com/JDVnXUypnC0HA3OkJldy7G)** — last-minute updates, cancellation alerts, reserving a talk slot (DM Slava), and coordinating before/after the run.

**Plans can change.** Source of truth is this page — if we cancel, you'll see it here and we'll post in the group.

**Please RSVP** so we know who's coming and whether to wait.
```

**Tone constraints:** direct, peer-to-peer, no corporate cadence, no "synergy/community/journey" filler, no host-lecturing-locals framing.

---

## todo.today Settings

| Field | Value |
|-------|-------|
| How can people join | **Walk-in** (anyone can show up — no RSVP gate) |
| Exchange | Free |
| Tags | running, Networking, Coffee, Community |
| Category | Sports & Fitness |

---

## Publishing Checklist

Run this for every new event in the series.

1. **Confirm date and number.** Next Sunday's date + `#N` (count events held, not weeks elapsed).
2. **Prepare photo.** During the run, capture 3–5 photos. Save as `photo_YYYY-MM-DD_HH-MM-SS.jpg`. This week's run photo becomes next week's banner.
3. **Create event in claritypledge:**
   ```bash
   # Edit events/ai-run-N.json with title, datetime (UTC), description from template
   npx tsx scripts/create-event.ts events/ai-run-N.json
   # Note the slug printed to stdout
   ```
4. **Upload banner photo:**
   ```bash
   ./scripts/event-photo-prep.sh <slug> ~/Downloads/photo_YYYY-MM-DD_HH-MM-SS.jpg
   ```
5. **Visual QA** on `claritypledge.com/events/<slug>`:
   - Banner not cropped badly (swap to next candidate photo if so — script is idempotent on slug, so delete existing object in Supabase Storage first or use a new slug variant)
   - Markdown links render (WhatsApp links clickable)
   - RSVP button visible
   - Date/time shows 9:00 AM ICT
6. **Promote:** Run `/slava:events:promote-all`
   - **Same day:** todo.today + Facebook personal
   - **+24h:** Luma (avoid same-day double-post quality heuristic)
   - Approve drafts at each platform's gate
7. **Luma sanity check:** After Luma draft, confirm time renders "9:00 AM ICT / Asia/Bangkok", not converted to another timezone.

---

## Cancellation Playbook

1. In the claritypledge admin UI (or via SQL update), set `status = 'cancelled'` on the event row.
2. Post in the WhatsApp group:
   > "AI Running Club #N this Sunday is cancelled. Next run: [date if known]. See you then!"
3. No further action needed — the event page shows a cancellation banner automatically.

---

## Numbering Rule

- `#N` = total events held, not calendar weeks.
- If a Sunday is skipped (cancellation), the next event is still `#N+1` from the last one held.
- Example: #3 cancelled → next event is #4, not #3 re-run.

---

## Photo Reminder

During every run: take 3–5 photos. Name format: `photo_YYYY-MM-DD_HH-MM-SS.jpg`. These become the banner for the following week's event page.
