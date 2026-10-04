---
name: messenger-card
description: "Build the portrait invite card (1080x1350) that rides along WhatsApp/Telegram group posts and warm DMs: title, hook, the banner's faces, date, venue, free pill, small QR + link"
when_to_use: "Before /slava:events:promote-groups or /slava:events:promote-dm sends anything for an event. Those skills offer it; run standalone to (re)build or adjust a card."
version: 1.0.0
---

# Messenger Card

One image that says the whole event without the caption: **what, who, when, where, free, how to
register**. Founder-approved shape from Clarity Night #2 (2026-10-02): *"so people can click and just
without reading see the whole thing."*

Not a poster (`/slava:content:gen-poster` makes print/social formats) and not the event banner (the
page header). This is the chat attachment.

## Rules that came from the founder (do not drift)

- **Portrait 4:5, 1080x1350.** A tall image fills the phone screen in a chat; a wide one is a strip.
- **Reuse the event banner's illustrated faces and names.** Never generate new people for the card —
  a generated scene was rejected on 2026-10-02 in favour of the banner faces.
- **ClarityPledge look:** off-white `#fbfaf6`, navy `#1B2A3A`, one blue accent `#3b82f6`. No photos.
- **QR small, bottom-left.** Nobody can scan the screen they are looking at; it serves forwards,
  laptops and screenshots. The real tap is the link in the caption.
- **All text is HTML rendered by the browser, never drawn by an image model** (models misspell).
- **Never state round mechanics on the card** (decisions.md 2026-09-28) — the hook is the
  change-first question, not the format.

## Steps

### 1. Gather

From prod (anon key, see `promote-all` step 1): `title`, `datetime` (format in `Asia/Bangkok`),
`location`. Banner: `event-banners/<slug>-vN.png` (highest existing N). Short link: the series short
link with `?d=YYMMDD` (see `promote-all` § Short-link cache-buster) — the QR encodes the `?d=` form;
the printed link may drop it.

Hook: one line, change-first question from the event description, plus "N thinkers disagree. Where do
you stand?" when the event has arguers.

### 2. Build

```bash
W=<scratch dir>; cp scripts/events/messenger-card.html "$W/"
curl -s -o "$W/banner.png" "<banner public url>"
curl -s -o "$W/qr.png" "https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=0&color=1B2A3A&bgcolor=FBFAF6&data=<urlencoded https short link>"
# edit ONLY the JSON block in $W/messenger-card.html (label, title, hook, tiles, when, where, pill, cta, link)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars \
  --window-size=1080,1350 --screenshot="$W/card.png" "file://$W/messenger-card.html"
sips -s format jpeg -s formatOptions 88 "$W/card.png" --out "$W/card.jpg"
```

No PIL and no ffmpeg `drawtext` on the founder machine — headless Chrome is the renderer.

### 3. Self-review, then show

READ `card.jpg`. Check: no face or emblem clipped, nothing overlapping (the pill vs the divider line
did on the first try), date not crowding the names, QR readable. Adjust `tiles` x/y and re-render.
**Then send it automatically — no asking first — to the founder's self-chat** (`self_chat.beeper_id`
in `.private/event-channels.json`) via the Beeper local API (upload + attachment, step 4), with the
planned group caption as the message text, so he sees exactly what will land at phone size. Verify
the latest message in that chat is the card (`type: IMAGE`, `isSender: true`), then tell him it is
there and wait for approval. Founder, 2026-10-04: *"when card is built automatically … send it
automatically via beeper"*. Every rebuild after an edit is sent the same way. Save the approved card to `.private/campaigns/<campaign>/invite-card.jpg`.

### 4. Hand back

Return the card path. The calling skill attaches it (Beeper: `POST /v1/assets/upload` multipart
`file=@card.jpg;type=image/jpeg` → `uploadID`, then `POST /v1/chats/{chatID}/messages` with
`{"text": <caption>, "attachment": {"uploadID", "mimeType": "image/jpeg", "type": "image"}}`).
The MCP `send_message` tool has no attachment field — use the local API.

## Where the card goes (founder, 2026-10-02)

| Message | Card? |
|---|---|
| Group posts | Yes |
| Warm DMs that already contain the link | Yes |
| "May I send you the link?" asks, nudges, respectful last messages | **No** — send the card later, with the link, to whoever says yes |
| Organiser asks (they copy text into their own listing) | No |
| Email | No (plain text + minimal HTML, see promote-email) |
