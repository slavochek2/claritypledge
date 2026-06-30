# Event Operator Guide

How to publish and promote ClarityPledge events as an operator — on your own machine, with your own accounts, with zero shared secrets. Your support channel is Claude (in this repo), not the founder.

## Fastest start: let the agent walk you through it

After cloning the repo and opening it in Claude Code, paste this:

```
I'm a new event operator. Read docs/events/operator-guide.md and walk me
through the one-time setup step by step — verify each step actually worked
before moving to the next. Then do a dry-run explanation of my first
publish + promote cycle.
```

The rest of this guide is the reference behind that walkthrough.

---

## One-time setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/slavochek2/claritypledge.git
   cd claritypledge
   ```
   General project setup: [README.md](../../README.md) (you do NOT need the full dev environment — no `npm install`, no database, no env secrets — unless you want to run the app locally).
2. **Open it in [VS Code](https://code.visualstudio.com/) with [Claude Code](https://claude.com/claude-code)** — you need your own Claude Code subscription. In VS Code: File → Open Folder → pick the `claritypledge` folder you just cloned, then open the Claude Code panel. **To check the project skills loaded:** type `/` in the Claude chat box — you should see entries starting with `slava:events:` in the list. ("Running a skill" just means typing its name, like `/slava:events:promote-all`, into the chat box and pressing Enter.)
3. **ClarityPledge account** — sign up at [claritypledge.com](https://claritypledge.com) (your own account; events you create are hosted and editable by you).
4. **Platform accounts — your own:** [Luma](https://luma.com), [Eventbrite](https://eventbrite.com), [todo.today](https://todo.today), [sola.day](https://app.sola.day), Facebook. Log into each in Chrome — the promotion skills drive your logged-in browser through the **Claude in Chrome** extension (Chrome Web Store, search "Claude in Chrome", sign in with your Claude account). To activate it in VS Code: type `@browser` in the Claude chat box when a skill needs the browser (in a terminal session instead: run `/chrome` once and pick "Enabled by default"). Requires a direct Anthropic subscription (Pro or higher) and an up-to-date Claude Code. For Facebook groups: join the groups you'll post to.
5. **Create your operator config** — easiest: ask Claude in the chat box:
   > "Create my operator config — my name is [name as it appears on my platform accounts] and I use [Luma, todo.today, ...]."

   It creates `.private/event-operator.json` at the repo root for you (gitignored — your name never enters the repo). Doing it by hand instead, the file looks like:
   ```json
   {
     "operator_name": "<the name your platform sessions are logged in as>",
     "platforms": ["luma", "todo-today", "facebook-personal"]
   }
   ```
   Valid platform values: `todo-today`, `facebook-personal`, `facebook`, `luma`, `eventbrite`, `sola`. List only platforms you have accounts for.

That's the whole setup. No API keys, no database credentials, no env files.

Two things worth knowing upfront:
- **First run per platform:** the first time a skill drives each site (Luma, Facebook, ...), Chrome asks for a one-time extension permission for that domain. The skill will tell you — click Allow on the site, re-run, done.
- **Same Chrome:** log into claritypledge.com and the platforms in the **same Chrome profile** that has the Claude in Chrome extension — that's the browser the skills drive.

## Staying current

Before each cycle, ask Claude: **"pull the latest changes"** (it runs `git pull`). The skills improve between your cycles — running stale ones causes confusing failures that look like your mistake but aren't.

## The cycle: publish → promote

### 1. Publish on claritypledge.com

Two ways:
- **Assisted (recommended):** run `/slava:events:publish-event` in Claude Code — it asks for the details (or clones one of your past events, asking only what changes), fills the form in your browser, double-checks the date, and you click Create.
- **By hand:** go to [claritypledge.com/events](https://claritypledge.com/events) → Create Event. Fill title, date/time, location, description.

Either way the banner **auto-generates** on create (the event page has Regenerate + keyword-search controls if you want a different one). You are the host — only you (and admins) can edit or delete your event.

The claritypledge.com event page is the canonical home: every platform listing links back to it, and it's where people register.

### 2. Promote across platforms

In Claude Code (in this repo), run:

```
/slava:events:promote-all
```

It picks up your operator config, finds the upcoming event, downloads its banner, and walks platform-by-platform through *your* configured list — filling each platform's create-event form in your browser. **The skills never publish anything**: at each platform it stops, shows you the filled form, and *you* click Publish/Create. Reply `next` / `skip` / `abort` to move through the queue. It's resume-safe — abort anytime, re-run later, it continues where it stopped.

## Where to use what

| Task | Tool |
|---|---|
| Create the event | `/slava:events:publish-event` (assisted) or claritypledge.com/events by hand |
| Edit / delete your event | the event page on claritypledge.com (you're the host) |
| Banner image | Auto-generated on create; Regenerate control on the event page |
| Promote to all your platforms | `/slava:events:promote-all` in Claude Code |
| Promote to one platform only | `/slava:events:promote-luma`, `promote-eventbrite`, `promote-todo-today`, `promote-sola`, `promote-facebook`, `promote-facebook-personal` |
| WhatsApp/chat blurb | `promote-all` outputs it at the end — copy-paste yourself |
| Post into recurring group chats | `/slava:events:promote-groups` (see below) |

## Group chat distribution (`promote-groups`)

For recurring event types — hikes, running clubs, workshops — that always go to the same WhatsApp or Telegram groups, you can configure a one-time mapping and skip re-selecting groups by hand each time.

### How it works

1. Run `/slava:events:promote-groups` after publishing an event
2. It reads `.private/event-channels.json` to find which groups this event type maps to
3. It resolves the blurb (from config or the series doc), sends a test to your self-chat, asks for approval, then posts to each verified group

Groups are verified before each send (platform, display name, group status) — if verification fails, the group is skipped and flagged, never silently posted.

### Config file: `.private/event-channels.json`

Create this file at the repo root — it is gitignored (local to your machine). Minimal example for a hike and a running club:

```json
{
  "types": [
    {
      "type": "hike",
      "match": ["Clarity Hike"],
      "blurb": "🥾 Clarity Hike this {date} — Buddha Footprint → Doi Pui Peak, 9am.\nDetails & RSVP: {short_url}",
      "groups": [
        { "platform": "whatsapp", "name": "CM Hikers", "chatID": "<beeper-chatID>", "verified_name": "CM Hikers" }
      ]
    },
    {
      "type": "ai-running-club",
      "match": ["AI Running Club"],
      "groups": [
        { "platform": "whatsapp", "name": "CM Runners", "chatID": "<beeper-chatID>", "verified_name": "CM Runners" }
      ]
    }
  ]
}
```

**Fields:**

| Field | Required | Description |
|---|---|---|
| `type` | Yes | Key for this event type (used in state files for idempotency) |
| `match` | Yes | Array of literal title prefixes, matched case-insensitively. First match wins. No wildcards. |
| `blurb` | No | Inline blurb template with `{date}`, `{short_url}`, `{n}` placeholders. Use for event types with no series doc (e.g. hikes). |
| `groups[].platform` | Yes | `whatsapp` or `telegram` |
| `groups[].chatID` | Yes | Beeper chat ID. Find it via the Beeper MCP `list_chats` call. |
| `groups[].verified_name` | Yes | Exact display name of the group as it appears in Beeper — used as a hard check before each send. |
| `groups[].status` | No | Set to `"declined"` to permanently skip this group with no override. Absent or `"active"` = eligible. |

**Matching rules:**
- `match` patterns are anchored prefixes — `"Clarity Hike"` matches `"Clarity Hike #3"` but not `"Annual Clarity Hike"` or `"Anti-Hike Workshop"`
- First entry with a matching prefix wins; no union of multiple entries
- Patterns must not be empty or contain `%` (the validator will refuse to run)

**Finding chatIDs:** Ask Claude in this repo — "List my Beeper chats" — while the Beeper MCP is connected (requires a `cf` session). Copy the chatID for each group you want to add.

### State and idempotency

The skill writes per-group status to `~/.private/event-state/<slug>.groups.json` (separate from the `<slug>.json` used by `promote-all`). Idempotency is keyed by `{type, chatID}` — if you reschedule an event under a new slug but the same type and groups, already-posted groups are recognized and skipped.

## When you're stuck — ask Claude first

Ask Claude in this repo before asking the founder. It has this guide, every promotion skill, and the project docs in context. Useful prompts:

- "Walk me through promoting the next event step by step."
- "The Luma step failed at the date picker — what does the skill say to do?"
- "Explain what `.private/event-operator.json` does."
- "The browser isn't responding to the skill — is the Claude in Chrome extension connected?"

Escalate to the founder only when Claude can't resolve it. If the answer required the founder, that's a documentation bug — ask Claude to draft the fix to this guide or the skill, and propose it as a change.

## Improving banners

Your options, from zero-setup to shared change:

1. **Steer the site banner (works today):** on your own event's page you have banner controls — **Regenerate**, or type your own **search keywords** to pull a different image.
2. **Custom banner on the promotion platforms (works today):** the promote skills upload the banner from a local file (`~/Downloads/clarity-event-photo.jpg`). Replace that file with your own design — or tell Claude "use my banner at `<path>` for the platforms" — and every platform gets your image. The claritypledge page keeps its auto-generated one.
3. **Your own banner skill (when it becomes routine):** automate your variant in `~/.claude/commands/` (personal layer, no review needed). When it proves out over a few events, propose it as a PR into the shared skills.
4. **Custom banner on claritypledge.com itself:** not yet self-serve (image storage is founder-gated). Ask the founder once — it's a small, known change waiting for the first operator who needs it.

## Making it yours

Honest capability map — two different powers:

- **ADD new things — fully yours, no review:** skills in `~/.claude/commands/` on your machine (your own banner prep, copy templates, an extra platform, a chat-distribution routine). Loaded alongside the repo skills; can't affect anyone else. Note: personal skills **add** capabilities — they cannot override how a shared repo skill behaves.
- **CHANGE how a shared skill works** (different copy format, a confusing step, your Facebook group list beyond the config): the path is a pull request. Don't do it by hand — ask Claude: *"prepare this skill change and help me propose it as a PR."* The founder reviews; every question the skills didn't answer is a candidate improvement.
- **Chat distribution is yours to invent:** the cycle ends with a paste-ready WhatsApp blurb. Which groups, which contacts, what cadence — your judgment, your network. A perfect first personal skill.
- **Recurring event?** A series doc (`docs/events/series/`) gives it a reusable promo blurb and a stable short link that always points to the latest occurrence. Ask Claude about creating one (the short link itself needs a one-time founder deploy).

## Notes

- **Model:** the skills run on whatever model your Claude Code session uses — no special configuration. If a step fails on your model, that's a skill-clarity bug worth reporting (or fixing).
- **OS:** the operator flow is OS-portable. One helper script (`scripts/event-photo-prep.sh`, banner *generation*) is founder-only and macOS-only — you never need it; your banners come from the website.
- **Privacy:** your name lives only in your local `.private/event-operator.json`, never in the repo.
- **Ignore `docs/events/process.md`** — that's the founder-internal process doc (founder accounts, founder defaults). This guide is the operator path.
