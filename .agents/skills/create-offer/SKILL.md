---
name: create-offer
description: Generate a personalized offer page + WhatsApp message after a coaching session. Deploys to ladischenski.com/for/{name}/.
when_to_use: "After a free coaching session, when you need to create a personalized offer page and send it to the lead."
version: 1.0.0
---

# /create-offer

Generate a personalized offer page and WhatsApp message after a coaching session.

**Announce at start:** "Running /create-offer."

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| Post-session offer page + WhatsApp message | `/create-offer` ← here |
| Cold outreach email to someone you haven't met | `/draft-email` |
| Event promotion posters | `/gen-poster` |

---

## Input

Ask Slava for the following (all required unless marked optional):

1. **Who?** Names, relationship (couple / co-founders / team), any relevant context (profession, how they found you)
2. **What happened?** Key moments from the session — what surprised you, what they struggled with, what went well
3. **Habits to keep** (2-3) — things they're already doing well
4. **Habits to build** (2-3) — new behaviors to introduce
5. **Package** — number of sessions, duration, what each session covers, bonus session details
6. **Price** — amount in EUR
7. **Wise payment link** — full URL (e.g., `https://wise.com/pay/r/...`)
8. **Personal hook for WhatsApp P.S.** (optional) — e.g., collaboration angle, profession-specific connection

---

## Reference Template

**Always read these files first** before generating — they are the source of truth for structure, styling, and design system:

- `~/Projects/public/ladischenski-com/public/for/victoria/index.html` — offer page template
- `~/Projects/public/ladischenski-com/public/for/victoria/thanks.html` — thank you page template

---

## Design System (ladischenski.com)

- Background: `#F7F4EE` (warm parchment)
- Text: `#18181b` (near-black), `#3f3f46` (body), `#52525b` (secondary), `#71717a` (muted)
- Accent: `#A0522D` (sienna), hover: `#8B4513`
- Border: `#d4cfc6`
- Fonts: Fraunces (serif, headings) + DM Sans (body)
- Container: `max-width: 42rem`, centered
- Keep cards: green icon `#16a34a`, bg `#f0fdf4`
- Build cards: sienna icon `#A0522D`, bg `#fef3e2`

---

## Workflow

### Step 1: Read the template

```bash
# Read both template files
cat ~/Projects/public/ladischenski-com/public/for/victoria/index.html
cat ~/Projects/public/ladischenski-com/public/for/victoria/thanks.html
```

### Step 2: Generate the offer page HTML

Customize the template with session-specific content:

| Section | What to customize |
|---|---|
| `<title>` | "For {Names}" |
| Header `.label` | "For {Names}" |
| Header `h1` | Session-specific headline (not generic) |
| Intro paragraph | 1 sentence framing the habits section |
| Habits to keep | 2-3 static cards (green category) |
| Habits to build | 2-3 static cards (sienna category) |
| "What I'd suggest" intro | Reference the €250 gift value, loss-aversion framing |
| Session timeline | 3 items (sessions 1, 2, 3/bonus) with descriptions tailored to their needs |
| Tagline under "Clarity Practice" | What they'll walk away with — specific to their situation |
| Price box | Amount + format ("Online or in person — flexible scheduling") |
| Guarantee | Keep as-is: "Zero risk: full refund after session 1" |
| CTA link | Wise payment URL |
| Web3Forms `subject` | "Offer decline — {Names}" |
| Web3Forms `from_name` | "Offer Page ({FirstName})" |
| Web3Forms `redirect` | `https://ladischenski.com/for/{firstname}/thanks.html` |

**Framing adjustments by relationship type:**

| Type | Adjust |
|---|---|
| Couple | "love each other", "when a real conflict hits", personal tone |
| Co-founders | "partnership", "when a real disagreement hits", business tone |
| Team | "team alignment", "when priorities diverge", professional tone |

**Must include in `<head>`:**
```html
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23A0522D'/><text x='16' y='23' text-anchor='middle' font-family='Georgia,serif' font-size='20' font-weight='bold' fill='white'>L</text></svg>">
```

### Step 3: Generate thanks.html

Copy from Victoria's template. Only change the `<title>` if needed. Keep it minimal.

### Step 4: Generate WhatsApp message

```
Hey {Name}! 🙏 Thank you both for {today/yesterday} — {1-2 sentences referencing something specific from the session that surprised or impressed you}.

I put together some thoughts on what I took away and ideas for how to build on what you started:
ladischenski.com/for/{firstname}

The ClarityPledge app is free — I'd love for you both to keep exploring with it: claritypledge.com

If you have 2 min, I'd really appreciate your honest take: tally.so/r/Gx0vZ2

P.S. {Personal hook — optional but recommended}
```

Output the WhatsApp message to terminal. Do NOT send it.

### Step 5: Self-check before writing

- [ ] Names appear in: header, habits cards (where relevant), Web3Forms subject, WhatsApp message
- [ ] Wise payment link is a real URL (not placeholder)
- [ ] `noindex, nofollow` meta tag present
- [ ] Favicon SVG data URI in `<head>`
- [ ] Web3Forms redirect URL matches the output path: `https://ladischenski.com/for/{firstname}/thanks.html`
- [ ] Web3Forms access key: `5c88ffaa-4e5a-4c82-9c73-e7fb0ad3ad01`
- [ ] Form submits natively (no JS fetch interception — Web3Forms blocks CORS)
- [ ] No personal info that shouldn't be on a public URL
- [ ] WhatsApp message references something specific (not generic)
- [ ] Habits to keep and habits to build each have 2-3 items
- [ ] Session timeline has 3 items with session-specific descriptions
- [ ] Headline is specific to this session (not reused from Victoria's)

### Step 6: Save files

```bash
mkdir -p ~/Projects/public/ladischenski-com/public/for/{firstname}
# Write index.html and thanks.html
```

### Step 7: Local preview

Start a local server and tell the user:

```bash
cd ~/Projects/public/ladischenski-com/public/for/{firstname} && python3 -m http.server 8099 &
```

"Preview at http://localhost:8099 — review the page and WhatsApp message. Let me know when ready to deploy."

### Step 8: Deploy

After user approval:

```bash
cd ~/Projects/public/ladischenski-com && git add public/for/{firstname}/ && git commit -m "deploy: offer page for {firstname}" && git push origin main
```

Report: "Live at ladischenski.com/for/{firstname}"

---

## Quality Gates (Agent Self-Review)

Before writing files, verify:

- [ ] Read the Victoria template first — don't generate from memory
- [ ] Relationship type (couple/co-founders/team) reflected in tone and framing
- [ ] Two-step reveal works: buttons hide, step-2 or decline-section shows
- [ ] Decline form uses native POST (no JS fetch) with Web3Forms redirect field
- [ ] Price appears only in the revealed step-2 section (not visible on initial load)
- [ ] All URLs are absolute (ladischenski.com, not localhost) in the HTML

---

## Related Skills

- `/draft-email` — cold/warm outbound email (not post-session offers)
- `/gen-poster` — event promotion visuals
- `/upload-to-ladischenski-temp` — upload arbitrary files to ladischenski.com/temp/
