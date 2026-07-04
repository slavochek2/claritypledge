---
status: backlog
type: task
rank: 437904.688
created_date: '2026-06-10'
tags:
  - gtm
  - coaches
  - interview-funnel
  - distribution
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P925: Coach recruitment via interview-funnel (startup-space / accelerator-connected coaches)

> Operationalizes [goals.md](../docs/goals.md) Core Loop steps 4-6 and the GTM map in
> `.private/docs/coach-partner-journey.md`. **Do not duplicate** their content — this spec is the
> tracked *execution* layer (status, ACs, tracks); the strategy/rationale lives in those docs.

## Problem

**Situation:** The 2026-06-02 coach-distribution pivot defines the revenue path as
article → letter-gated recorded interviews → content + badged collaborators → co-delivered paid
program → accelerator/angel distribution (goals.md Core Loop). The coach-fit thesis and a 4-point
co-delivery fit spec already exist in `coach-partner-journey.md`. The `/program` page (P916, w1) is
the founder-facing surface the funnel points at.

**Complication:** Recruitment is not yet a tracked, repeatable activity — it lives in a private
strategy doc and the founder's head, re-derived each session. Two co-delivery candidates have been
assessed and both failed the fit (one a wrong-audience sales/automation consultant; one a relationship/personal-market coach, not the business market — details in `.private/docs/coach-partner-journey.md`). The binding step (goals.md step 6 — a committed co-host starts the falsifier clock) has no
owner-tracked process, and "interview lots of coaches" risks being conflated with "find the one
co-host" — volume activity that feels like progress while the binding constraint stays unmet.

**Question:** What repeatable recruitment process turns coaches across the conjecture topics into
(a) interviewed collaborators that produce content + reach, (b) a qualified co-delivery co-host, and
(c) a distribution partner — without blurring the three, and without manufacturing activity that
didn't happen?

## Appetite

- **Blast radius — medium.** Outreach + interviews touch the brand's external face and the
  collaborator pipeline; a mis-targeted campaign wastes founder time and burns warm intros, but
  changes no code and no shipped product.
- **Reversibility — high.** Outreach is per-contact and pausable; no schema, no irreversible
  publication (recorded artifacts only after a real session — see honesty constraint).
- **Decision density — HIGH.** Several founder decisions unresolved: the canonical 17-topic list and
  its coach-type mapping, the distribution partner, PS-coach prioritization. Marked below — do not
  invent.

## Approach

Run three **distinct-but-linked** tracks. Keeping them separate is the core discipline of this spec.

### Track 1 — Interview-wide recruitment (content + audience + audition)
Invite coaches across the conjecture topics (startup space, accelerator-connected) to **letter-gated
recorded mutual interviews** ("we interview each other" live-event format). The existing `/letter/ck`
letter is the **admission gate** — the "verify before you commit" instrument applied to our own
collaborator selection. Each interview = content artifact + badge candidate + collaborator audition +
an attractor that sells the program. Breadth is the point here; co-delivery fit is *not* required to
be interviewed.

### Track 2 — Co-delivery coach search (the binding step) — **SOURCE FIRST**
Find the **one** practicum co-host matching the 4-point fit spec in `coach-partner-journey.md`:
high-stakes business-dyad audience + own retention/proof-of-value pain + relationship-mode delivery +
willing to co-host. This is the step the falsifier clock waits on (goals.md step 6). It is fed by
Track 1 (a strong audition can graduate into co-delivery) but must be **tracked separately** so
interview volume never masquerades as progress on the co-host.

**First action (ahead of Track 1's breadth):** build a **narrow targeted shortlist of ~5-10 named
candidate coaches** who plausibly hit all four points, then run a no-pitch fit conversation with each
(listen for point 2 — their *own* retention pain — in their words; goals.md "no pitch"). Output is a
yes/no fit verdict per name, not interviews-done.

**Market (already decided — not reopened here):** the search targets **co-founder / business-partner
pairs**. `coach-partner-journey.md`: *"picking the co-delivery coach IS picking the program's market.
Keep it business-partner unless a deliberate pivot to the relationship/couples market is chosen."*
This matches the frozen positioning + the `/program` page (w1) + accelerator distribution. The
shortlist profile follows from this; no confirmation needed.

### Track 3 — Distribution partner (OPEN)
Identify who forwards event invites to high-stakes founder pairs (accelerator / angel as distributor,
credibility transfer — goals.md step 6). **Raised as an open question by the founder; filed OPEN, not
solved.** No partner is named in this spec.

### Verification sub-step (applies to Tracks 1 & 2)
Before deep investment in any coach, verify fit/quality (audience, own-pain, mode). For
psychological-safety coaches specifically: hypotheses.md (2026-04-02) already **falsified the strong
PS claim** (teams get PS benefits without verification) and **confirmed only the weak claim** (false
agreement in high-difference environments). So PS-coach outreach must test the *falsifiable frontier*
("even with safety to speak, do your high-stakes clients still walk away falsely agreeing?") — never
assume PS is the hook.

## Risks / Non-Goals

### Risks
- **Volume masks the binding constraint.** Many interviews feel like progress while no co-host
  commits. *Mitigation:* Track 2 has its own status line; the weekly retro counts co-host signals
  separately from interviews done.
- **Leading questions confirm nothing.** Coaches sell their own category; asking "is X important?"
  yields yes. *Mitigation:* outreach/interview scripts test the falsifiable frontier in the coach's
  own words (goals.md "listen for the coach's *own* pain, no pitch").
- **Re-treading falsified ground.** PS-as-headline is already dead in our research. *Mitigation:* the
  verification sub-step routes PS coaches to the weak-claim frontier only.

### Non-Goals
- Do NOT merge Track 1 and Track 2 into a single "recruit coaches" effort — keep co-host search
  distinct and separately tracked.
- Do NOT name or commit a distribution partner in this spec (Track 3 is OPEN, founder decision).
- Do NOT manufacture the appearance of activity that didn't happen (fake journey videos, fabricated
  "N coaches use this", recorded artifacts before a real session exists). Honesty line is
  load-bearing — this is a clarity company (`coach-partner-journey.md`).
- Do NOT re-cut the frozen founder-facing positioning (lean-canvas 2026-06-04) as part of outreach
  copy — a coach-audience pain hook is permitted (audience-specific), the founder cut is not touched.
- Do NOT build new letter infrastructure — use the existing `/letter/ck` (the `/letter/min` / P851
  rewrite stays deferred with its own trigger).

## Done-When

- [ ] **FIRST: Track 2 shortlist exists** — ~5-10 named candidate coaches fitting the 4-point profile
      in the working-assumption market (co-founder / business-partner pairs), built before Track 1's
      broad list.
- [ ] A repeatable recruitment process is written down (target sourcing → letter gate → interview →
      audition/fit verdict), tracked here rather than re-derived per session.
- [ ] Track 1: a target list of conjecture-topic coaches (startup-space / accelerator-connected)
      exists, with the letter-gate admission step defined; first invites sent.
- [ ] Track 2: the 4-point co-delivery fit is applied to each candidate with a recorded verdict;
      status reflects whether a qualifying co-host has committed (the falsifier-clock trigger).
- [ ] Track 3: the distribution-partner question is captured as an explicit OPEN founder decision
      with candidate criteria — not silently filled.
- [ ] PS-coach contacts (if pursued) are approached on the weak-claim frontier, not the falsified
      strong claim (verifiable from the outreach script).
- [ ] Every recorded/published artifact corresponds to a session that actually happened.

## Founder Decisions (do not fill — surface and ask)

- [ ] **The canonical list of the 17 conjecture topics** and which coach-type maps to each.
- [ ] **Distribution partner** (Track 3) — who, and through which accelerator/angel relationship.
- [ ] **PS-coach priority** — are psychological-safety coaches a priority sub-segment, given the
      strong claim is falsified and only the weak claim survives?

## Open Questions for /architect

1. Does this task need any tooling (a target-tracking sheet, an outreach log in `.private/`), or is
   it run entirely through existing surfaces (`/letter/ck`, the program page, manual outreach)?
2. Where does interview-subject / co-host candidate tracking live — extend
   `.private/docs/coach-partner-journey.md`, or a new `.private/` outreach log?
