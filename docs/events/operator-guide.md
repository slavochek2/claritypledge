# Event Operator Guide

How to publish and promote ClarityPledge events as an operator — on your own machine, with your own accounts, with zero shared secrets. Your support channel is Claude (in this repo), not the founder.

---

## One-time setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/slavochek2/claritypledge.git
   cd claritypledge
   ```
   General project setup: [README.md](../../README.md) (you do NOT need the full dev environment — no `npm install`, no database, no env secrets — unless you want to run the app locally).
2. **Open it in VS Code with Claude Code** — you need your own [Claude Code](https://claude.com/claude-code) subscription. Open the repo folder; Claude Code picks up the project skills automatically.
3. **ClarityPledge account** — sign up at [claritypledge.com](https://claritypledge.com) (your own account; events you create are hosted and editable by you).
4. **Platform accounts — your own:** [Luma](https://luma.com), [Eventbrite](https://eventbrite.com), [todo.today](https://todo.today), [sola.day](https://app.sola.day), Facebook. Log into each in Chrome (the promotion skills drive your logged-in browser via the Claude in Chrome extension — install it from Claude Code settings). For Facebook groups: join the groups you'll post to.
5. **Create your operator config** — `.private/event-operator.json` at the repo root (the `.private/` folder is gitignored; create it if missing). List only the platforms you have accounts for:
   ```json
   {
     "operator_name": "<the name your platform sessions are logged in as>",
     "platforms": ["luma", "todo-today", "facebook-personal"]
   }
   ```
   Valid platform values: `todo-today`, `facebook-personal`, `facebook`, `luma`, `eventbrite`, `sola`.

That's the whole setup. No API keys, no database credentials, no env files.

## The cycle: publish → promote

### 1. Publish on claritypledge.com

Go to [claritypledge.com/events](https://claritypledge.com/events) → Create Event. Fill title, date/time, location, description. The banner image **auto-generates** when you create the event (there's a Regenerate control on the event page if you want a different one). You are the host — only you (and admins) can edit or delete your event.

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
| Create / edit the event | claritypledge.com/events (the website) |
| Banner image | Auto-generated on create; Regenerate control on the event page |
| Promote to all your platforms | `/slava:events:promote-all` in Claude Code |
| Promote to one platform only | `/slava:events:promote-luma`, `promote-eventbrite`, `promote-todo-today`, `promote-sola`, `promote-facebook`, `promote-facebook-personal` |
| WhatsApp/chat blurb | `promote-all` outputs it at the end — copy-paste yourself |

## When you're stuck — ask Claude first

Ask Claude in this repo before asking the founder. It has this guide, every promotion skill, and the project docs in context. Useful prompts:

- "Walk me through promoting the next event step by step."
- "The Luma step failed at the date picker — what does the skill say to do?"
- "Explain what `.private/event-operator.json` does."

Escalate to the founder only when Claude can't resolve it. If the answer required the founder, that's a documentation bug — ask Claude to draft the fix to this guide or the skill, and propose it as a change.

## Making it yours

- **Personal variants** (your own banner styles, copy templates, extra platforms): create skills in `~/.claude/commands/` on your machine — your personal layer, loaded alongside the repo skills, no review needed, can't affect anyone else.
- **Improvements to the shared skills** (fixing a step that confused you, better instructions): edit the repo files and propose the change as a pull request — the founder reviews. Every question you had that the skills didn't answer is a candidate improvement.

## Notes

- **Model:** the skills run on whatever model your Claude Code session uses — no special configuration. If a step fails on your model, that's a skill-clarity bug worth reporting (or fixing).
- **OS:** the operator flow is OS-portable. One helper script (`scripts/event-photo-prep.sh`, banner *generation*) is founder-only and macOS-only — you never need it; your banners come from the website.
- **Privacy:** your name lives only in your local `.private/event-operator.json`, never in the repo.
