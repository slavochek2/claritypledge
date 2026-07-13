---
status: week
type: story
rank: 1000942.0
created_date: '2026-07-13'
tags: [landing, gtm, mission-slogan, front-door]
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
---

# P987: CP Front-Door Realignment — mission-slogan homepage + retire co-founder ProgramPage + land outro slogan

## Problem

**Situation:** The 2026-07-13 outro decision (`docs/decisions.md`) pinned the public slogan to the **durable mission layer** — *"Alignment isn't agreement, it's verified understanding. No AI can be aligned without it."* — with a **free alignment audit** as the only CTA and a `claritypledge.com` pill. That decision lives only in `decisions.md`.
**Complication:** The bare domain the outro sends people to (`/`, anonymous) currently renders `ProgramPage` (P916) — the **stale co-founder-pair pitch** (`"I've lost co-founders. I help you keep yours."`, the `€100k–€1M+` split stat, a paid co-founder program). That is the exact posture the 2026-07-01 founder-wedge pivot made dormant, and it directly contradicts the freshest asset. Separately, `outro.html` still hardcodes the same stale hook, so the video branding lane (Stage 5) is blocked.
**Question:** How do we make `claritypledge.com`'s front door carry the mission slogan + free-audit CTA, retire the contradicting co-founder surface without deleting it, and unblock video branding — while keeping coaching disclosed at the pre-qual/audit-invitation layer, never on the hero?

## Appetite

**High blast radius** — this is the live public homepage (the `/` route for every anonymous visitor and the destination the video outro advertises). **Medium reversibility** — pure code + copy on a branch; `ProgramPage` is kept dormant (unlisted, not deleted) so the co-founder posture is revivable via `git revert` + re-listing. **Decision density: medium** — the mission slogan itself is already locked (2026-07-13, marked "may refine"); remaining `[FOUNDER DECISION]`s are the audit-CTA label, the sub-copy, and the audit destination route.

## Solution / Approach

Three connected changes, one branch:

1. **Homepage redo (`/`).** Replace `ProgramPage` as the anonymous `/` surface with a mission-layer landing: the locked slogan as hero + a single **free alignment audit** CTA. No coach info on the hero (see Non-Goals — coaching is disclosed later, at the pre-qual layer). Reuse the existing design system / `ClarityLandingLayout`; this is a copy+routing change, not a new design language. The audit-CTA destination (a booking link, a form route, or a new `/audit` page) is a `[FOUNDER DECISION]` — resolve before build.
2. **Retire `ProgramPage` / `/program`.** Remove it as the `/` anonymous surface and unlist it: drop from any nav/footer, keep the route reachable only by direct URL, add `noindex` so search can't surface the dormant pitch. Dormant, not deleted — revivable.
3. **Land the mission slogan into `outro.html`.** Replace the hardcoded co-founder hook + stat in `.claude/commands/slava/util/video-brand-pass/assets/outro.html` with the locked copy (body + CTA + `claritypledge.com` pill), unblocking the branding stage. Per the skill: after editing the template, re-run `brand.sh` and run the visual-QA pass on the new render before calling it done.

**Locked slogan copy (from `docs/decisions.md` 2026-07-13, `[FOUNDER DECISION]`, may refine):**
> Misalignment costs you: rework, mistrust, turnover.
> Alignment isn't agreement, it's verified understanding.
> No AI can be aligned without it.
> Get your free alignment audit.

## Risks / Non-Goals

### Risks
- **Live front door goes dark or off-brand mid-change.** Mitigation: branch + UAT gate; multi-viewport visual-QA (375/320/desktop) before `/ship`; `ProgramPage` stays intact behind an unlisted route so nothing is destroyed.
- **Audit CTA points nowhere** (the same gap the outro currently has). Mitigation: the CTA destination is a blocking `[FOUNDER DECISION]` — do not build the hero until it's resolved.
- **`noindex` on `/program` accidentally leaks to `/`.** Mitigation: scope the meta directive to the `/program` route only; verify `/` remains indexable.

### Non-Goals
- **Do NOT put coach info, "work with me", or Slava-as-coach content on the hero.** Coaching is disclosed at the pre-qual/audit-invitation layer (a separate `.private` edit), and via the existing quiet `/about → "Work with Slava"` door. The hero stays mission + free audit only.
- **Do NOT add prices anywhere** on the homepage or `/program`.
- **Do NOT delete `ProgramPage` or the co-founder copy** — unlist + `noindex` only. It must stay revivable.
- **Do NOT modify `/about`** — its "Work with Slava → ladischenski.com" link is the intended quiet door; leave as-is.
- **Do NOT touch the `ladischenski-com` repo** (price stripping / redirect is separate, cross-repo work).
- **Do NOT edit `discovery-questions.md`** here — the coaching-disclosure line and the $99→1:1 offer-mechanic rewrite are separate direct `.private` edits, not part of this spec.
- **Do NOT redesign the landing visual language** — reuse the existing design system; this is copy + routing.

### Rollback Strategy
`git revert` the branch merge. `ProgramPage` is untouched behind its route, so re-listing it (restore nav entry, remove `noindex`, re-point `/`) fully restores the prior co-founder front door. `outro.html` reverts with the same commit.

## Done-When

- [ ] Anonymous `/` renders the mission-slogan hero + a single free-alignment-audit CTA — no coach info, no prices, no co-founder copy
- [ ] The audit CTA resolves to a working destination (booking/form/route) — no dead link
- [ ] `/program` is reachable only by direct URL, absent from nav/footer, and returns `noindex`; `/` remains indexable
- [ ] `outro.html` carries the locked mission slogan (co-founder hook + `€100k–€1M+` stat gone); `brand.sh` re-run and the outro render passes visual-QA
- [ ] Visual-QA pass (separate subagent) clears the hero at 375px, 320px, and desktop against `.claude/rules/visual-qa.md`
- [ ] `/about`, prices, and the `ladischenski-com` repo are unchanged (verified by diff scope)

## UX Notes

- **Hero states:** happy path only (static marketing hero). The blur→clarity reveal beat already used on `ProgramPage`/`/coach` is reusable for the slogan's key line if desired (`[FOUNDER DECISION]`).
- **Single primary action** (P955): exactly one full-width primary CTA on the hero — the free alignment audit. No competing primaries.
- **Empty/edge:** if the audit destination is an events-gated route, handle the "no live audit slot" state gracefully (mirror the existing `WebinarCTA` `hasEvent` pattern rather than rendering a dead button).

## Acceptance Criteria

- [ ] A cold visitor landing on `claritypledge.com` sees the mission and one clear way to act (the free audit), with no mention of coaching, price, or co-founders
- [ ] A visitor who deliberately seeks "can I hire him" can still reach `/about → Work with Slava` (quiet door intact)
- [ ] The video outro's `claritypledge.com` pill now lands on a page whose message matches the outro's message

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Hero body | Locked slogan copy (above) — exact wording `[FOUNDER DECISION]`, may refine | `/` anonymous |
| Primary CTA label | `[FOUNDER DECISION]` (e.g. "Get your free alignment audit") | Hero, single primary |
| CTA destination | `[FOUNDER DECISION]` — booking link / form / `/audit` route | Hero CTA target |
| Prices | none | Homepage + `/program` |
| `/program` meta | `noindex` | Dormant route only |
| Coach info on hero | none | Disclosed at pre-qual layer instead |
