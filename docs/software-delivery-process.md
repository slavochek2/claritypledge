# Software Delivery Process

**An agent-native development process built on Claude Code.**

The skills and rules in this repo are written as instructions for AI agents, not as human documentation. To understand the process, clone the repo and ask Claude Code — it reads the skill files and explains them in plain language. This document is the human-readable orientation guide.

We start with full quality gates and tell you what's safe to skip. Opt-in to quality means you forget steps under pressure. Opt-out means you only cut what you consciously choose to cut.

## Why a Pipeline

Most dev processes are checklists you run in your head. Ours is a short route of AI agents, each guarding against a specific failure mode:

| Phase | Key Skill | What It Prevents |
|-------|-----------|-----------------|
| **Define** | [`/create-spec`](../.claude/commands/slava/build/create-spec.md) | Building the wrong thing — forces "why does this matter?" before code |
| **Review the spec** | Multi-model spec review: the Gemini review model, Opus and Codex | Untested assumptions, missing edge cases, and schema or API decisions you'll regret in 6 months. Each model catches blockers the others miss, and every load-bearing claim is checked by command before it is folded in ([decisions.md](decisions.md) 2026-10-16 [process]) |
| **Build** | [`/dev`](../.claude/commands/slava/build/dev.md) | The actual implementation — iterates until tests pass, stops at UAT |
| **Review the build** | [`/finish`](../.claude/commands/slava/build/finish/SKILL.md) | Correctness bugs, code-quality and design-system misses. Runs at the end of every `/dev` and `/fix`, and the Stop hook asks for it after any ad-hoc build (P1505) |
| **Verify** | [`/verify`](../.claude/commands/slava/build/verify/SKILL.md) | "Tests pass" is not the same as "works in a browser" |
| **Ship** | [`/ship`](../.claude/commands/slava/build/ship.md) | Merging unreviewed code — its gates refuse a branch without a `/finish` review receipt |

Bugs take a shorter route: [`/reproduce`](../.claude/commands/slava/build/reproduce/SKILL.md) → [`/fix`](../.claude/commands/slava/build/fix.md) → `/ship`.

Not every task runs every step. A typo fix goes straight to `/dev`; the spec review is for specs that carry real stakes (reversed rulings, privacy, auth, data). The agent chooses the steps itself; there is no separate routing skill.

**Design and test work happens inside the spec and `/dev`:** user flows, component choices and the test plan live in the `/create-spec` Solution and Done-When, and `/dev` writes tests first. Optional helpers that remain: [`/ascii-flows`](../.claude/commands/slava/build/ascii-flows.md) (layout exploration for multi-flow features) and [`/critique-ux`](../.claude/commands/slava/build/critique-ux.md) (UX critique of a built surface).

**History:** until 2026-10-19 the route was a long pipeline (`/create-spec` → `/challenge-prd` → `/ux` → `/architect` → `/ui` → `/generate-tests` → `/decompose` → `/spec-review` → `/dev`), picked per task by `/pick-flow`. `/pick-flow` was retired on 2026-10-07; `/architect`, `/spec-review` and `/challenge-prd` on 2026-10-19 (P1514); `/ux`, `/ui`, `/generate-tests`, `/decompose` and `/prep-spec` on 2026-10-20 (P1514, no use in the prior 30 days). Their files stay in [`archive/`](../.claude/commands/slava/archive/) because old specs still carry the sections they wrote.

## Post-Ship Visual QA Loop

After a feature ships, a separate loop handles visual polish without reopening the full pipeline:

| Phase | Key Skill | What It Does |
|-------|-----------|--------------|
| **Critique** | [`/critique-ux`](../.claude/commands/slava/build/critique-ux.md) | Blind UX/UI review — spawns a subagent with screenshots + spec only (no code), returns a ranked punch list |
| **Polish** | [`/polish`](../.claude/commands/slava/build/polish.md) | Implements punch list items: per-item decision gate, atomic commits, blind visual QA subagent, founder approval per item |

Routing from the punch list:
- Visual fix on shipped UI → `/polish`
- Redesign touching shared components or page structure → `/change-request` (files a new spec, then the same route)
- Net-new capability → `/create-spec`
- Broken code (not design) → `/fix`

## Core Principles

These live in [PRINCIPLES.md](../.claude/commands/slava/PRINCIPLES.md) and guide every agent:

1. **Principles scale, rules don't.** Understand the WHY so you can handle novel situations.
2. **Quality by default, speed by exception.** Every gate exists because something broke without it.
3. **Evidence over declaration.** Never say "done" — show test output, screenshots, query results.
4. **Falsify before you rely.** Test claims. Simulate failures. Don't trust what you haven't verified.
5. **Transparency over convenience.** Never silently work around problems. Report them.

## Beyond the Pipeline

The process includes 30+ skills for thinking, maintenance, and learning. That's a lot. Most sit idle until you need them — you don't memorize `man` pages either. Three worth knowing about:

- **`/slava:dd:frame-analyze`** — structured root-cause analysis (SCQ + 5-Why) for bugs with unclear cause *
- **[`/kdd`](../.claude/commands/slava/maintain/kdd/SKILL.md)** — captures decisions and learnings after shipping, so context survives across sessions
- **`/dd:conjecture` + `/dd:critic`** — form a hypothesis, then try to kill it before building on it *

\* The `/dd:*` thinking skills are global (installed in `~/.claude/commands/`, not in this repo). They're portable — ask Claude Code "show me how /slava:dd:frame-analyze works" to see the skill file and adapt it.

Also part of the workflow:

- **`/dd:think`** — structured problem discovery rooted in critical rationalism: formulate the problem, generate conjectures, try to falsify them, then act on what survives. Prevents building on unexamined assumptions. *
- **`/content:*`** — content pipeline ([`content/`](../.claude/commands/slava/content/)) for blog drafts, image generation, email
- **Visual kanban** — every task gets a spec file with structured frontmatter (status, type, priority, delivery stage). `npm run kanban` renders [`features/`](../features/) as a visual board on port 9050, so you always see what's in flight, blocked, or done.

Full skill catalog: [`.claude/commands/slava/`](../.claude/commands/slava/).

## Known Limitations

This process was built for a solo founder + AI agent workflow on a single TypeScript codebase. It adds real overhead: new contributors face a learning curve reading 30+ skill files, and the token cost of agents reading specs and rules adds up. Multi-repo and team workflows are untested. The pipeline is strongest for full-stack features with database changes; for pure frontend polish, it's often more process than the work needs.

## Talk to This Repo

This process lives in the repo, not in this document. Clone it and let Claude Code read the skills, rules, and decision history directly.

```bash
git clone https://github.com/slavochek2/claritypledge
cd claritypledge
```

Then open Claude Code and ask:

- **"Explain your delivery process step by step"** — assembles a complete picture from the skill files
- **"How did your delivery process evolve?"** — reads `docs/decisions.md` and git history
- **"Compare my delivery process to yours"** — describe how you build and Claude maps similarities and gaps
- **"Which of your skills would work for my project?"** — recommends what's portable vs ClarityPledge-specific
- **"Show me how /finish works"** — reads the skill file and explains the logic

**Adapt for your project:**

Copy skills from `.claude/commands/` into your repo. The principles and route structure (create-spec, dev, finish) are stack-agnostic. What you'll customize: file paths, test commands, linting rules, deployment targets, and any project-specific review criteria in `/finish`.

Start with `/create-spec` + `/dev` + `/finish` — that's the minimum viable pipeline. Add gates as you feel the pain of not having them.

---

*The authoritative source is the repo itself — skill files in `.claude/commands/slava/`, rules in `.claude/rules/`, and decision history in `docs/decisions.md`.*
