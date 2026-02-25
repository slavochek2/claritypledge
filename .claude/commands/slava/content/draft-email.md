---
name: draft-email
description: Draft a cold or warm outbound email in Slava's voice — collaboration asks, venue proposals, partnership pitches. Iterates until approved, then sends via slava@claritypledge.com.
when_to_use: Any time Slava needs to send an outbound email on behalf of ClarityPledge — cold outreach, venue asks, collaboration proposals.
version: 1.0.0
---

# Draft Email

Draft, iterate, and send outbound emails in Slava's voice.

---

## Input

Ask Slava:
1. **Who is it to?** (name/org/role — or "unknown")
2. **What's the ask?** (one sentence)
3. **Any context?** (relationship, prior contact, why now)

If the email address is unknown, offer to search or ask Slava to provide it.

---

## Slava's Voice — Rules

**Do:**
- Open with a personal, grounded hook ("I arrived in Koh Phangan last week...")
- Use "I wonder if" for soft collaboration asks — never "I wanted to reach out"
- Frame the ask for the recipient's benefit, not Slava's ("for your community", "useful for your crowd")
- State explicitly that Slava will do the work — removes their objection before it forms
- Keep it short: 4–5 sentences max in the body
- Use P.S. for secondary upside (recurring cadence, future potential)
- Footer carries identity — never restate name in the opening

**Don't:**
- Say where Slava came from ("I arrived in X" is fine; "I came from Y" is not)
- Make grandiose geographic claims ("across SE Asia", "globally")
- Use formal openers ("I hope this finds you well", "My name is")
- Try to close the deal in email 1 — the ask is always permission for the next step (send a proposal, meet in person, hop on a call)
- Repeat information already visible in the footer

---

## Structure Template

```
[Personal hook — 1 sentence grounding Slava in time/place/observation]

[The ask — framed as a question or wonder, for their benefit]

[Brief credibility — specific, not grandiose. "30+ events in Europe and Asia"]

[Minimal next step — proposal, quick chat, in-person visit]

[P.S. — optional secondary upside]

Best, Slava

—
Vyacheslav Ladischenski
Founder, ClarityPledge
```

---

## Footer Format (always use this exactly)

```
Best, Slava

—
Vyacheslav Ladischenski
Founder, ClarityPledge
```

---

## Workflow

1. **Draft** the email using the template and voice rules above
2. **Show full email** including From/To/Subject — ask: "Good to send, or any changes?"
3. **Iterate** until approved — no limit on rounds
4. **Send** via `slava@claritypledge.com` using the SMTP script pattern:
   - Server: `w00dd4f1.kasserver.com`, port 465 (SMTPS)
   - Credentials: `SLAVA_EMAIL` / `SLAVA_EMAIL_PASSWORD` from `.env.local`
   - Write to `/tmp/send-email-<slug>.mjs`, run with `node`, delete after
5. **Confirm** delivery (`250 Ok: queued` = success)

---

## Subject Line Rules

- Never generic ("Following up", "Quick question")
- Specific to the ask: "Seeking collaboration: AI meetup at Inner Space"
- Keep under 60 chars
- Format: `[Action]: [specific thing]`

---

## Sending Pattern (Node.js, no packages)

```js
import tls from 'tls';
// AUTH PLAIN, port 465 SMTPS
// See /tmp/send-innerspace-email.mjs for working reference
```

Full working reference: `/tmp/send-innerspace-email.mjs` (from 2026-02-25 session — may be deleted, reconstruct from this skill if needed).
