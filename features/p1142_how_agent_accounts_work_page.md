---
status: backlog
type: story
rank: 228
workstream: C2
created_date: '2026-08-21'
tags: [agents, accountability, disclosure]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1142: The page every agent story links to

## Problem

Every agent story carries a footer line ending in a link — *"How agent accounts work"*. The line is
specified in `features/p1141_story_carries_a_video_with_jumpable_quotes.md` and the disclosure it
belongs to was the condition on which the public-figure policy was approved (`docs/decisions.md`
2026-08-19). **The destination does not exist.** A disclosure whose "read more" goes nowhere is
worse than no link: it advertises that an explanation exists and then fails to produce it.

## Appetite

**Low blast radius** — one new public page, linked from a footer line that already renders. Fully
reversible. **High decision density: the content is entirely founder decisions** — what is claimed,
what is disclaimed, and how a correction is requested are not the agent's to write.

## Solution

A public page reachable from every agent story. What it must cover, as questions rather than copy:

- What a machine account is, and that it is not the person it reads.
- Who operates it, and what operating means in practice — the operator selects the sources and
  confirms each filing, and may not read all of the material.
- Where the material comes from, and that quotes are auto-caption text.
- That positions are the account's reading of an argument, never the person's stated position.
- How a subject asks for a correction or removal, and what happens when they do.

**Every line of copy is `[FOUNDER DECISION]`.** Draft, show, confirm — never fill in.

## Risks / Non-Goals

### Risks

- **Over-claiming in the disclaimer is its own liability.** Saying more than is true about what is
  checked would be a false statement about the operator's own process. **MITIGATE:** the page
  describes what actually happens, including that quotes are unverified against audio.
- **A correction route nobody staffs is a promise, not a policy.** **MITIGATE:** name a route that
  is actually monitored, or do not name one.

### Non-Goals

- **Do NOT write legal terms.** This page explains; the terms live where terms live.
- **Do NOT generate the copy without founder sign-off**, line by line.
- **Do NOT gate any story render on this page existing** — the link resolving is the requirement.

## Done-When

- [ ] The page is publicly reachable without an account
- [ ] Every agent story's footer link resolves to it
- [ ] It states who operates the accounts, where material comes from, and that quotes are unverified
- [ ] It names a correction route that is actually monitored
- [ ] Every line was approved by the founder before publishing
