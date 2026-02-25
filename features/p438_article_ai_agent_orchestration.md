---
status: in-progress
type: task
priority: medium
created_at: 2026-02-25
---

# P437: Blog Article — AI Agent Orchestration for Solo Founders

## Goal

Publish a practical article comparing three AI agent orchestration setups, positioning Slava as a thoughtful practitioner in the space, crediting Jordan (LLMCoolJ) and Jed Tabaczynski, and driving traffic/trust to ClarityPledge.

## The Idea

Three people stumbled into similar territory from different angles:

- **Jed Tabaczynski** — principle: treat AI agents like human collaborators; give them context, not just instructions
- **Slava (ClarityPledge)** — solo founder, interactive CLAUDE.md + skills system, iterative dev loop
- **Jordan / LLMCoolJ** — went furthest: fully autonomous spec-first pipeline; agent self-recovered mid-build when architecture failed

The hook: **an AI agent team broke down at spec 09 of 15, and the orchestrator self-recovered using Task agents instead.** That's a real story.

## Article Structure (agreed)

1. **Jed's principle** — context over instructions; why most people do it wrong
2. **Slava's setup** — CLAUDE.md + skills, interactive, solo founder tradeoffs
3. **Jordan's experiment** — spec-first autonomous pipeline, 15 specs, 662 unit tests, 85 E2E tests
4. **The breakdown** — agent teams failed at spec 09; orchestrator pivoted autonomously
5. **The framework** — spectrum from interactive → autonomous; when each makes sense
6. **30-min audit CTA** — companion GitHub repo template readers can apply to their own setup

## Key Insights to Include

- Jordan's PREAMBLE.md: auto-generated context doc passed fresh to every sub-agent (solves context drift in long autonomous runs)
- 9-phase pipeline per spec: implement → verify → unit tests → e2e → run tests → fix → screenshots → code review → commit
- Retry loops with hard limits (verify 3x, test_fix 5x) — same pattern Slava already has in /dev
- Cross-spec alignment (ALIGN_SPEC_PROMPT.md) before building — catches type/route/hook inconsistencies early
- MEMORY.md: agent adaptation log (Jordan used it; Slava has it too)
- Key finding: Slava doesn't need to adopt Jordan's patterns — interactive workflow compensates; PREAMBLE is for long autonomous runs

## Source Material

- Jordan's repos (cloned locally):
  - `/Users/slavochek/Projects/public/llmcoolj-tasks/` — Task agent approach
  - `/Users/slavochek/Projects/public/llmcoolj-agent-teams/` — experimental teams (has MEMORY.md from live build in README)
- Full research session transcript:
  - `/Users/slavochek/.claude/projects/-Users-slavochek-Projects-public-claritypledge/42882397-7d50-4d1c-996b-44dd3579bac6.jsonl`
- Jordan's email: `leadloom@proton.me` (outreach sent 2026-02-25, awaiting reply)
- Jed's LinkedIn: `linkedin.com/in/tabaczynski/` (outreach done by Slava directly)

## Next Steps

- [ ] Wait for Jordan's reply (approval to cite + link repos)
- [ ] Draft article outline (can do before reply, just don't publish)
- [ ] Write full draft
- [ ] Send draft to Jordan + Jed for review/approval
- [ ] Create companion GitHub repo ("30-min AI orchestration audit" template)
- [ ] Publish on Ghost (`/slava:content:ship-blog`)
- [ ] Coordinate co-promotion — get Jordan + Jed's preferred social handles
