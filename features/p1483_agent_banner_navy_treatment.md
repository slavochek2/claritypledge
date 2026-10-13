---
status: week
type: change-request
drafted_by: opus
exec_model: opus
exec_effort: medium
rank: 1000108.0
changes: p1453
tags:
  - redesign
  - p1453
  - profile
  - banner
  - agents
created_date: 2026-10-13
disclosure: public
delivery_stage: change-request
pipeline_ran: [change-request]
---

# P1483: Agent profile banners get a strong navy treatment

> **Redesign of:** [P1453: Artist-style profile banners, signed "after <artist>"](done/2026-06-10/p1453_artist_style_profile_banners.md)
> **What was wrong:** P1453 decided (2026-10-09) that agent banners show "the full, unfiltered art"
> with "No color filter". Once all 10 prod agents had full-color artist banners (2026-10-13), an
> agent's banner was indistinguishable from a person's at the banner level. The founder reversed the
> decision: agents must be told apart from people by the banner itself.

## Operating Mode

> This spec is an **incremental correction** to P1453, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P1453 are not up for re-examination.

## Problem Statement

Founder, verbatim (2026-10-13):

> "no we do the fitler for agents! to distinishg them from people"

> "i mena color or less/no/diffent color is easy"

> "strong  navy lets proceed - so current and future agnets get this while peopel get colored"

P1453's Question asked for banners "with agents visually distinct". P1453 answered that with
disclosure elsewhere on the page (the `Agent ·` prefix, `AgentByline`, `AgentProfileDisclosure`) and
no banner treatment. On prod that leaves a visitor scanning profiles with the same full-color
painted banner on a person and on an agent. A color difference is the cheapest signal to read: no
learning, one rule — **agents are navy, people are in color**.

## Jobs To Be Done

- **Preserved from P1453:** every profile gets an artist-style banner signed "after <artist>"; AI
  generation disclosed in alt text and tooltip; owners keep regenerate/remove; agents get banners
  through the operator path only.
- **Corrected:** "agents visually distinct" — now delivered at the banner itself, not only by text
  elsewhere on the page.
- **New:** none.

## Current State

`src/app/pages/profile-page-v2.tsx:972` renders `<BannerDisplay bannerUrl credit … heightClassName="h-[120px] md:h-[160px]">`
for every profile, human or agent, with no treatment. The page already knows the profile is an agent:
`const isAgent = isAgentAccountId(profile?.id)` (`profile-page-v2.tsx:265`, from
`useAgentAccountIds()`), which it uses for the square avatar (`rounded-sm` vs `rounded-full`, line 1011).
`BannerDisplay` (`src/app/components/shared/banner/BannerDisplay.tsx`) has no treatment prop.

**Before (current, phone):**
```
┌──────────────────────────────────────┐
│  [full-color painting]  after Leonardo│   ← same look as a person's banner
├──────────────────────────────────────┤
│ ▢ avatar   ⊙ AGENT on                 │
│            Yann LeCun                 │
└──────────────────────────────────────┘
```

## Root Cause

A design decision, not a code fault. P1453 Decision D-A (line 54): *"agent banners use the full,
unfiltered art and NO banner badge … No color filter (a grey filter collides with the P1104 finding;
the heavy duotone flattened styles)."* Both stated reasons were about **which** filter, not about
whether agents need one. Grey stays rejected (P1104: real human photos are greyscale, so grey cannot
mean "machine"). The "flattened styles" cost is accepted by the founder: telling agents apart
outranks style variety on agent banners.

## Redesign

On agent profiles only, a navy layer sits over the banner image and under the signature:

- color `#1e3a8a` (Tailwind blue-900), `mix-blend-mode: color`, opacity `0.75`.
- `color` blend keeps the image's own luminosity and replaces hue/saturation, so the picture stays
  legible and the stored `ink` (chosen from luminance, P1453 Decision 5) stays valid.
- applied at display time — no image regeneration, no data change; every current and future agent
  gets it the moment their profile renders.

**Chosen by the founder 2026-10-13** after a side-by-side of real prod profile headers at phone width
(agent with generated portrait, agent with ink-painting banner, initials-only agent) across: none,
strong navy, medium navy (0.45), dot screen, scan lines. Strong navy reads as one coherent "agent"
look with the cool grey-blue generated portraits and the slate initials square; lines vanished at
real size; dots read as a print defect; medium navy read as a faded photo. Codex (blind, neutral
labels) ranked dots first and strong navy second ("a human could choose blue"); overruled — every
human banner is a varied generated painting, so a uniform navy only ever means agent.

**After (phone):**
```
┌──────────────────────────────────────┐
│  [same painting, navy]  after Leonardo│   ← signature NOT tinted
├──────────────────────────────────────┤
│ ▢ avatar   ⊙ AGENT on                 │
│            Yann LeCun                 │
└──────────────────────────────────────┘
person's profile: unchanged, full color, round avatar
```

## Predecessor Sections Superseded

| Section | P1453 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Decided 2026-10-09 (D-A), line 54 | "agent banners use the full, unfiltered art" | Superseded | Redesign above |
| D-A, line 54 | "No color filter (a grey filter collides with the P1104 finding; the heavy duotone flattened styles)." | Superseded (grey still rejected) | Redesign above |
| Prototype evidence, line 41 | "A heavy navy duotone on agents flattened every style into similar blue texture. Pending a decision." | Resolved the other way | Founder choice, 2026-10-13 |
| Post-deploy check, line 173 | "A newly provisioned agent has an **unfiltered** artist banner" | Partially superseded — the stored image stays unfiltered; the displayed one is navy | AC 5 below |

D-A's "NO banner badge" half is **not** reversed: no badge is added.

## Requirements

1. `BannerDisplay` gains one optional prop for the agent treatment. Absent = byte-identical
   behavior (events, stories, human profiles), following P1453's opt-in `credit` pattern.
2. The treatment covers the banner image only — never the gradient fallback, never the signature,
   never the owner/loading controls.
3. The profile page passes it when `isAgent` is true.

## Invariants

Carried forward from P1453 in full:
- An existing banner is never replaced without the owner (or, for agents, the operator) asking.
  *(Display-time treatment replaces no stored asset.)*
- The credit always reads "after <artist>". It never imitates a real signature.

New:
- A person's profile banner is never tinted — including while the agent registry is still loading
  (`isAgent` is false until `useAgentAccountIds` resolves, so a human can never pass through a navy
  frame).
- The "after <artist>" signature stays readable on the treated agent banner.

## What Stays the Same

Stored banners and `banner_credit`; every edge function, the pool, picker, vision check and ink
computation; event and story banners; the generated agent avatars (P1104 frozen palette); the
`Agent ·` prefix, `AgentByline`, `AgentProfileDisclosure`; alt text and tooltip; no badge; social
(OG) previews keep showing the untreated art (P1453 risk row, ACCEPT — unchanged).

## Surfaces in Scope

**In scope:**
- `src/app/components/shared/banner/BannerDisplay.tsx` — optional treatment prop + overlay layer
- `src/app/pages/profile-page-v2.tsx` — pass it when `isAgent`
- a render test and the P1453 e2e/visual check extended to an agent profile

**Out of scope:** edge functions, migrations, stored images, `BannerCredit.tsx`, avatars, events,
stories, OG images, `/provision-agent` (the skill's banner step needs no change).

## Acceptance Criteria

- [ ] An agent's profile banner renders with the navy treatment at 320px, 375px and desktop; a
      person's profile banner renders in full color at the same widths (screenshots).
- [ ] The "after <artist>" signature is not tinted and is readable on treated agent banners — checked
      on a cream-ink and a sepia-ink agent (e.g. after Leonardo, after Josetsu).
- [ ] `BannerDisplay` without the new prop renders identically to today (render test); event and
      story banners unchanged.
- [ ] A human profile never shows the treatment, including before the agent registry has loaded
      (render test with the registry pending).
- [ ] The gradient fallback (agent with no banner) is not tinted.
- [ ] All existing P1453 tests still pass.
- [ ] Regression: the original failure — an agent banner indistinguishable from a person's — is
      shown fixed by a side-by-side agent/person screenshot at 375px.

## Next Steps

Scope is clear and targeted (one opt-in prop, one call site) → `/dev`.
