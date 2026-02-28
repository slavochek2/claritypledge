---
status: editing
title: The barriers nobody talks about after you stop vibe coding
rank: 2
tags: [ai-agents, solo-founder, orchestration, build-in-public]
created_at: 2026-02-27T00:00:00.000Z
---

# The barriers nobody talks about after you stop vibe coding

**Who this is for:** You've gotten past the first wall — you're writing code with Claude, maybe you've built something with real backend complexity, maybe you've moved from the IDE to the terminal. Things work. But they're unpredictable. You can't tell if a feature is really done until it breaks something else. You can't estimate how long anything will take. Debugging takes longer than building.

This is what nobody writes about: the barriers that come *after* you learn to code with AI.

---

## The progression nobody maps out

Most content about AI coding is stuck at barrier one: getting started. "Here's how to use Cursor." "Here's a prompt to build a CRUD app." Fine — that barrier is real, and clearing it feels like a superpower.

But there's a progression of barriers that follows, and each one is less talked about than the last:

1. **Frontend** — Getting something to render in a browser. Most tutorials cover this.
2. **Backend** — Auth, database, RLS, APIs that don't break. Significantly harder. Takes most people weeks.
3. **The terminal and Claude CLI** — Moving away from copy-paste in an IDE to a proper agentic loop. This is where you start building *with* agents rather than asking them for code snippets.
4. **Software delivery** — How do you keep shipping without breaking what you built? How do you make progress predictable? This is the barrier nobody talks about.

I hit all four. The last one took the longest to understand.

---

## Before I had a process: BMAD

Before I found my way to a real software delivery process, I tried [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) — a well-structured methodology for AI-native development. The problem: I didn't create it. It was designed by someone else, for a different context. Claude didn't know how to use it, the learning curve was high (days, not hours), and I always postponed getting started.

The result: I kept vibe-coding, just with a more complicated setup I wasn't using.

The lesson I missed at the time: **a process you didn't design is a process you won't follow.** Especially when you're the only one on the team.

---

## The Jed conversation

I want to say something before getting into the process itself: I met both Jed and Jordan through the AI community in Chiang Mai. That community has been one of the most useful things I've encountered in this whole journey — a group of people solving similar problems, sharing what they've figured out, cross-pollinating approaches. In a world where AI is changing white-collar work faster than anyone can track individually, this is what actually helps: people learning from each other and from the AI together. If you're not in an AI community, find one or start one.

I met Jed Tabaczynski, a software delivery consultant, through that community, and complained about my situation. I was shipping features unpredictably. No quality control. Couldn't tell if something was done until it broke something else.

His advice wasn't what I expected. He didn't tell me to treat agents like collaborators or give them better prompts. He said: **you need a software delivery process.** There are books on this. Companies have spent decades figuring out how to ship software predictably.

I didn't read the books. I asked Claude to.

I told Claude: read these books on software delivery and design a process for me — one that fits a solo founder with an AI agent as the primary executor, iterating on a live product. Two days of conversations. The result wasn't a CLAUDE.md file. It was [`docs/development-process.md`](https://github.com/slavochek2/claritypledge/blob/main/docs/development-process.md) — a document that describes exactly how a feature moves from idea to production.

The key insight wasn't the individual skills (`/create-prd`, `/ux`, `/architect`, `/dev`). It was **documenting their sequence** — and understanding that different complexity levels need different sequences. That's what led to `/pick-flow`: a meta-skill that looks at what you're building and recommends whether to use the full pipeline, a medium flow, or just inline it. Without that, every decision about process was a cognitive tax.

Since then, every time something goes wrong, the process gets better. A cascading bug reveals a gap in the spec review step. A debugging session that takes too long reveals a missing verification gate. The process is never finished — it's a living document.

---

## What changed, in numbers

The process doc itself has the honest comparison:

| | Before | After |
|---|---|---|
| Time to ship a P1 UI feature | 2–3 days including rework | ~1 hour |
| Manual testing per feature | 20 min | 5 min (UX validation only) |
| Cascading bugs | 2–3/week | Near zero |

The agent tests itself now — iterating until all tests pass before committing. I validate only the experience ("does this feel right?"), not the functionality ("does this work?"). That's the process, not the tools.

---

## /sim: what happens when you ask "what's next?"

Once the delivery process was stable — features shipping predictably, regressions rare — I started asking the next question: can I speed up user testing?

Real user testing is slow and expensive. You recruit people, schedule sessions, observe them, synthesize feedback. I asked: what if I ran browser agents as different user personas against every shipped feature?

The result is [`/sim`](https://github.com/slavochek2/claritypledge/blob/main/docs/technical/synthetic-usability-testing.md) — a synthetic usability testing skill. It runs browser agents as archetypes (Solo Founder, Invited Party, Coach, UX Critic) against a live feature and produces experience reports with change request candidates.

This is experimental. I don't know yet how well synthetic personas approximate real users. But the output has surfaced real issues — things that pass spec compliance but feel wrong in use. Worth noting because it's an example of the meta-pattern: once you have a solid delivery process, you can apply the same improvement thinking to the next bottleneck.

---

## The Chiang Mai meetup moment

A few months into this, I attended a [Claude meetup in Chiang Mai](https://luma.com/lrskf8sh) — same community where I'd met Jed. Someone who goes by [@LLMCoolJ](https://github.com/LLMCoolJ) on GitHub gave a presentation.

He had prompted for 30 minutes. His agent had run for 6 hours. It shipped a complete Lightning wallet app — 15 specs, 662 unit tests, 85 end-to-end tests across three browsers.

My agents were running for 30–45 minutes at a time. My first thought: *am I doing this completely wrong?*

If someone can set a pipeline running for 6 hours and get production-ready software, why was I sitting here manually reviewing every commit? Was my carefully designed process just a slower version of something that should be fully automated?

I went home and spent time with his repos: [`alby-oneshot-tasks`](https://github.com/LLMCoolJ/alby-oneshot-tasks) and [`alby-oneshot-agent-teams`](https://github.com/LLMCoolJ/alby-oneshot-agent-teams).

Two things stood out. The first was `PREAMBLE.md` — a document generated before any code was written. Parallel agents read every spec and extracted structured data: file lists, exports, routes, coding standards. Every agent in the pipeline received this as its first context. Without it, long autonomous runs drift — agents make assumptions that contradict each other. PREAMBLE solves context drift at scale.

The second was what happened around spec 9. The 3-agent team model degraded mid-build. After repeated context compactions to manage the growing session, messages between the orchestrator and teammates became unreliable. The orchestrator adapted: it started running tests itself, switched to fresh one-shot Task agents for review phases, and pivoted its whole architecture — without being told to. Specs 9–15 completed with zero fix iterations. The breakdown produced a better pipeline. That story is all in the repo README.

---

## The realization: completely different problems

After studying those repos carefully, I understood why what I saw wasn't an indictment of my approach.

@LLMCoolJ starts a *new project* and generates all features in parallel, aligns them for consistency, then runs the build. Powerful for new work. Requires the entire design to be done and consistent before a single line of code exists. The agent doesn't need to understand ongoing product decisions, user feedback, or changing hypotheses.

I'm doing *continuous incremental improvement* on a live product. Every session builds on every previous session. My agent needs to understand what already exists, why it's that way, and how not to break it. PREAMBLE doesn't help me — I need [`CLAUDE.md`](https://github.com/slavochek2/claritypledge/blob/main/CLAUDE.md) and [`development-process.md`](https://github.com/slavochek2/claritypledge/blob/main/docs/development-process.md). Context about the project as it is.

Not comparable. Both valid. Different tools for different situations.

---

## The actual insight: meta-cognition and systems thinking

Here's what I think is actually happening — and why this matters beyond software.

When you build your own software delivery process, you're not just getting better at shipping code. You're practicing **meta-cognition** — thinking about how you think, improving the system you use to do work, not just doing the work. And **systems thinking** — understanding that a delivery system has components, dependencies, and feedback loops, and that you can instrument and improve it.

These are the skills that compound in the AI age. Not coding — that's increasingly a commodity. The ability to design, operate, and continuously improve your own working system: that's durable.

Once I started applying this thinking to software delivery, I couldn't stop. Content production. Synthetic usability testing. Event management. Each one gets a documented process, a feedback loop, an improvement cycle.

The delivery process is also reflected in something concrete: a custom kanban that lives in the repo itself. Feature specs have frontmatter with status fields. Agents update the status automatically. The kanban reads the git filesystem — no separate tool to keep in sync, no Notion that agents can't write to. Everything I ship is tracked, and the tracking happens as a side effect of shipping.

---

## Where to go from here

If you recognize yourself in this — past frontend, past backend, maybe at the terminal now, struggling with predictability:

**The process, not the tools.** Don't look for the right set of Claude prompts or the right IDE plugin. Look for a delivery process you understand, designed for your specific situation, that you'll actually maintain. The tools are secondary.

**Jed Tabaczynski** ([linkedin.com/in/tabaczynski/](https://linkedin.com/in/tabaczynski/)) consults on software delivery. A few hours with him is worth it — not because he'll hand you a process, but because he'll help you understand what a process needs to do. I'd estimate I'm 10× more effective than before that first conversation, and I continue improving.

**If you want to see a continuous improvement process in practice:** The ClarityPledge repo is public at [github.com/slavochek2/claritypledge](https://github.com/slavochek2/claritypledge). The files worth reading: [`docs/development-process.md`](https://github.com/slavochek2/claritypledge/blob/main/docs/development-process.md) (the full pipeline), [`CLAUDE.md`](https://github.com/slavochek2/claritypledge/blob/main/CLAUDE.md) (agent context), `.claude/commands/slava/` (the skill library). Clone it and ask Claude: *"Analyze this software delivery process and compare it to how I'm currently working. What's missing from mine?"*

**If you want to build a new project fast from scratch:** @LLMCoolJ's repos show the autonomous pipeline in detail — including the PREAMBLE pattern and the team breakdown story. Clone [`alby-oneshot-tasks`](https://github.com/LLMCoolJ/alby-oneshot-tasks) and ask Claude to adapt the process for your stack.

The fourth barrier is real. But it's also the one that teaches you to think.

---

## Sources

- [Jed Tabaczynski on LinkedIn](https://linkedin.com/in/tabaczynski/)
- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD)
- [Claude meetup Chiang Mai — Luma](https://luma.com/lrskf8sh)
- [LLMCoolJ — alby-oneshot-tasks](https://github.com/LLMCoolJ/alby-oneshot-tasks)
- [LLMCoolJ — alby-oneshot-agent-teams](https://github.com/LLMCoolJ/alby-oneshot-agent-teams)
- [ClarityPledge repo](https://github.com/slavochek2/claritypledge)
- [docs/development-process.md](https://github.com/slavochek2/claritypledge/blob/main/docs/development-process.md)
- [docs/technical/synthetic-usability-testing.md](https://github.com/slavochek2/claritypledge/blob/main/docs/technical/synthetic-usability-testing.md)
- [CLAUDE.md](https://github.com/slavochek2/claritypledge/blob/main/CLAUDE.md)
