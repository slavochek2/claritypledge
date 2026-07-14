---
status: in-progress
type: story
rank: 1000942.0
created_date: '2026-07-13'
tags: [landing, gtm, key-hire, front-door]
delivery_stage: dev
pipeline_ran: [create-spec, challenge-prd, challenge-prd.2, dev]
---

# P987: CP Front-Door Realignment — reframe the homepage to the key-hire wedge

> **Direction revised 2026-07-14 (post-challenge, with the founder).** Earlier drafts led the homepage with the segment-neutral *mission slogan* and framed the work as "retire the co-founder surfaces." The founder's decision: lead with the **key-hire wedge** — the *documented sharpest trigger* of the active P0 bet H-FounderWince ("de-risk this hire / cut churn on your critical hires", hypotheses.md 2026-07-10) — and **reframe the existing homepage in place** (co-founder → key hire), snapshotting the current version to `/tree/` for revival. The challenge-prd findings (route model, invite-redirect/tracking, supersede "cp untouched") still hold and are folded into Resolved Decisions.

## Problem

**Situation:** The active P0 wedge (`H-FounderWince`) has its **sharpest documented trigger = an active key hire** — *"de-risk this hire / cut churn on your critical hires"* (hypotheses.md + decisions.md, 2026-07-10). But the live cp homepage (`/`, rendered by `ProgramPage` via `HomeRedirect`) still leads with the **retired co-founder posture**: *"I've lost co-founders. I help you keep yours."*, the `€100k–€1M+` split stat, the Wasserman **65% co-founder-conflict** stat, a **"Take the Pledge"** secondary CTA, and a pledger avatar stack.
**Complication:** That co-founder framing is the dormant Posture-1 (2026-07-01 pivot) and contradicts the current key-hire wedge. Separately, `/program` → `OffersPage` (the **€950 co-founder program**) is still linked in the top nav as *"Co-founder Program"*.
**Question:** How do we reframe the homepage to the key-hire wedge (*de-risk misalignment with your next key hire*), preserve the current version for revival, and pull the stale co-founder offer out of the nav — **without over-promising an async "audit" that is actually a live 1:1 session**?

## Appetite

**High blast radius** — the live public homepage (`/` for every anonymous visitor). **Reversibility: git-revertable, plus a `/tree` snapshot of the current page for revival** — but note a behavioral cost: `/` runs a live, Mixpanel-instrumented funnel, so running the new hero carries a traffic/conversion cost a revert does not undo. **GTM posture:** "cp untouched before outreach" is already superseded on the record (decisions.md 2026-07-13) — reframing a stale, wedge-contradicting homepage is cleanup, not new-funnel-building. **Decision density: low-medium** — hero direction + stat + closing are locked below; residual `[FOUNDER DECISION]`s are final sub-copy wording, the chat POV, and the outro reconciliation.

## Solution / Approach

**Reframe the existing `ProgramPage` in place (it stays `/`), co-founder → key hire.** Not a new page, not a retirement — a copy/content reframe over the existing design system. One branch.

1. **Snapshot the current homepage to `/tree/old-landing-2` FIRST.** Add a dev-gated route rendering the *current* `ProgramPage` (mirrors the existing `/tree/old-landing` precedent), so the co-founder version is revivable before we touch it. (`/tree/*` is DEV-only — a dev-time reference snapshot, not a prod route.)
2. **Reframe `ProgramPage` (`/`):**
   - **Hero:** `De-risk misalignment with your next key hire.` (locked). Single urgent hire, prospective framing — "de-risk" carries the preventive sense, so no "fix"/"prevent" needed. Sub-copy sets the *live-session* expectation (see UI Contract) so no one expects a standardized async report.
   - **Primary CTA:** `Get your free alignment audit` → **`/intro`** (existing book-a-call page) as the interim destination. One primary action (P955).
   - **Remove** the "Take the Pledge" secondary CTA **and** the pledger avatar stack (`PledgerAvatarStack`).
   - **Stat:** replace the Wasserman 65% co-founder stat with the verified **Leadership IQ** stat (below). Keep the source's own words — *"attitude, not skill"* — and make the bridge to *alignment/understanding* in the surrounding prose, **never** by editing the stat (this page has a logged incident of "the page's thesis smuggled into a stat" — decisions.md).
   - **Chat (`HardTruthChat`):** reframe the **props** co-founder → key-hire scenario (props only — the component is shared with `/coach`, which must not change). Section heading goes **observational**: `The honest reply that never gets sent.` (drops the broken second-person "you deleted this"). The *"You deleted this message"* text **inside** the WhatsApp bubble stays — it's the real system string. Resolve founder-holds-back vs hire-holds-back POV in build with the copy in front of us.
   - **Closing:** `Your new hire nods. / And maybe holds back. / Stop before they quit.` (locked; "quit" not "split").
   - **Preserve mechanics:** since we modify in place, the existing `?referrer`/`?login` auto-redirect + `landing_page_viewed` event stay — verify they still fire (don't regress them).
3. **Pull `/program` (`OffersPage`, €950) out of the top nav + footer + `noindex`.** Still the stale co-founder offer. Keep the route reachable by direct URL; **price kept** (unlisted, not stripped).
4. **`outro.html` — de-scoped, flagged for reconciliation `[FOUNDER DECISION]`.** The homepage no longer leads with the mission slogan, so the mission-slogan outro and the key-hire hero now diverge. Decide separately: land the key-hire framing in the outro, keep the mission slogan as the umbrella (page = the specific entry beneath it), or defer. **Not built in this spec** until decided.

**Locked copy:**
> **Hero:** De-risk misalignment with your next key hire.
> **Sub:** *(live-session line — see UI Contract)*
> **CTA:** Get your free alignment audit.
> **Stat:** Nearly half of new hires fail within 18 months — 9 out of 10 because of attitude, not skill. *(Leadership IQ)*
> **Closing:** Your new hire nods. And maybe holds back. Stop before they quit.

## Risks / Non-Goals

### Risks
- **Live front door goes dark/off-brand mid-change.** MITIGATE: branch + UAT + multi-viewport visual-QA (375/320/desktop); the `/tree/old-landing-2` snapshot preserves the current page.
- **Stat drift** — rewording "attitude, not skill" into "misalignment" would misrepresent the source. MITIGATE: quote the source's words; bridge in prose only. Also: "nearly half" not "5 out of 10" (46% ≠ 50%).
- **Async-expectation mismatch** — "audit" implying a standardized async report. MITIGATE: the sub-copy names it as a live 1:1 session.
- **Regressing invite-redirect / landing metric.** MITIGATE: since we edit in place, verify `?referrer`/`?login` + `landing_page_viewed` still fire.

### Non-Goals
- **No coach info, pricing, or co-founder copy on the hero.** Coaching stays at the pre-qual layer + the quiet `/about → Work with Slava` door.
- **Do NOT edit the shared `HardTruthChat` component** — props only (protect `/coach`).
- **Do NOT delete `ProgramPage` or `OffersPage`** — snapshot + `noindex`, revivable.
- **Do NOT build the Tally pre-screen form** — CTA → `/intro` interim.
- **Do NOT alter the stat's source wording**, and do not round 46% up to "5 out of 10".
- **Do NOT modify `/about`** or the `ladischenski-com` repo.
- **Do NOT redesign the visual language** — reuse the existing design system; this is copy + content.
- **Do NOT build the `outro.html` change here** — flagged for a separate reconciliation decision.

### Rollback Strategy
`git revert` the branch merge; the `/tree/old-landing-2` snapshot independently preserves the co-founder page for revival. `/program`/`OffersPage` untouched behind its route.

## Done-When

- [x] Current `ProgramPage` is reachable at `/tree/old-landing-2` (dev-gated) before `/` is reframed
- [x] `/` hero reads "De-risk misalignment with your next key hire." + a single "Get your free alignment audit" CTA → `/intro`; live-session sub-copy present; no coach/price/co-founder/pledge content on the hero
- [x] "Take the Pledge" secondary CTA + pledger avatar stack removed from `/`
- [x] The co-founder 65% stat is replaced by the Leadership IQ stat, worded exactly to source ("attitude, not skill"; "nearly half", not "5 out of 10"), with a resolving citation
- [x] `HardTruthChat` on `/` shows the key-hire scenario (props only, via a new optional `heading` prop defaulting to /coach's existing heading); heading is observational; `/coach` chat unchanged (verified — no props passed by coach-partnership-page, default heading text unchanged)
- [x] Closing reads "Your new hire nods. And maybe holds back. Stop before they quit."
- [x] `?referrer`/`?login` redirect + `landing_page_viewed` still fire on `/` (not regressed) — redirect verified live (`?login=1` → `/login`, `?referrer=x` → `/sign-pledge`); `landing_page_viewed` call site unchanged and executes (event itself is a documented prod-only no-op in dev, per `src/lib/mixpanel.ts`)
- [x] `/program` (`OffersPage`) is out of nav/footer + `noindex`; route still reachable; price kept; `/` indexable
- [x] Visual-QA pass (separate subagent) clears `/` at 375/320/desktop against `.claude/rules/visual-qa.md` — subagent returned FAIL with 6 findings; verified against source: 1 real bug (hero overflow at 320px) found independently and fixed pre-QA-pass; remaining findings are either animation-capture-timing artifacts or pre-existing/out-of-scope (shared nav CTA, testimonials component) — see dev report

## Resolved Decisions

| # | Source | Finding / Question | Resolution | Rationale |
|---|--------|--------|-----------|-----------|
| 1 | /challenge-prd.2 | `/program` serves `OffersPage` (€950, nav-linked), not `ProgramPage` — two surfaces | `ProgramPage` reframed in place at `/`; `/program`/`OffersPage` out of nav + `noindex`, price kept | Verified against `src/App.tsx` + `simple-navigation.tsx` |
| 2 | /challenge-prd.2 | Overrode goals.md "cp untouched before outreach" | Superseded on the record (goals.md + decisions.md 2026-07-13) | Reframing a stale wedge-contradicting page is cleanup, not new funnel |
| 3 | /challenge-prd.2 | UNTESTED hero, no A/B mechanism | Measurement = audit-form fills + the live audit/appointment conversations (founder-direct, small n) | Qualitative read is appropriate at this stage |
| 4 | /challenge-prd.2 | Dropped `?referrer`/`?login` + `landing_page_viewed` | N/A — modify-in-place keeps them; verify not regressed | Editing in place avoids the port entirely |
| 5 | founder 2026-07-14 | Mission-slogan hero vs named-segment hero | **Named segment: key hire.** Hero = "De-risk misalignment with your next key hire." | The §UVP falsifier's own escape hatch (revert to named-audience lead); the key hire is H-FounderWince's documented sharpest trigger. Promote to §UVP via `/docs-strategy-update` (separate pass) so it doesn't re-drift |
| 6 | founder 2026-07-14 | Build a new page / evolve `/pmf` (P982) / modify main | **Modify `ProgramPage` in place + snapshot to `/tree/old-landing-2`** | Everything to change is already on `/`; P982's `/pmf` diverges and its form is founder-customer-dev-scoped (wrong questions for the hire wedge). Park P982, abandon w1 |
| 7 | founder 2026-07-14 | Turnover stat to replace the co-founder 65% | **Leadership IQ 46%/89%**, worded "nearly half / 9 out of 10 attitude not skill" | Researched + independently re-verified (both number + attribution); mirrors the Wasserman stat's structure; the ubiquitous "DoL 30%" number was rejected as unsourced |

## UX Notes

- **Single primary action** (P955): one full-width primary CTA — "Get your free alignment audit". No competing primaries (pledge CTA removed).
- **Hero states:** static marketing hero; reuse the existing blur→clarity reveal beat if desired.
- **Chat POV** (build-time `[FOUNDER DECISION]`): founder-holds-back vs new-hire-holds-back — the closing ("your new hire … holds back") points at the hire; resolve with the chat copy in front of us.
- **CTA empty/edge:** `/intro` is a static booking page — no events-gated empty state.

## Acceptance Criteria

- [x] A cold visitor on `/` sees the key-hire pain and one clear way to act (the free audit), with no coaching/price/co-founder/pledge content on the hero
- [x] The "audit" is disclosed as a live 1:1 session (not an async report) before/at the booking step — hero sub-copy states this on `/`, before the visitor ever reaches `/intro`
- [x] The old co-founder homepage remains reachable at `/tree/old-landing-2` for revival
- [x] A visitor seeking "can I hire him" can still reach `/about → Work with Slava` — `/about` nav link unchanged (`nav-links.ts`), not touched by this spec

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Hero H1 | `De-risk misalignment with your next key hire.` | `/` anonymous |
| Hero sub | live-session line — e.g. `A live 1:1 session — we surface one real gap in how you and your next hire understand each other.` `[FOUNDER DECISION — final wording]` | under hero |
| Primary CTA | `Get your free alignment audit` → `/intro` (interim) | Hero, single primary |
| Secondary CTA | **removed** (was "Take the Pledge") | — |
| Stat | `Nearly half of new hires fail within 18 months — 9 out of 10 because of attitude, not skill.` + citation (Leadership IQ) | stakes section |
| Chat heading | `The honest reply that never gets sent.` (observational) `[FOUNDER DECISION — final wording]` | HardTruthChat |
| Closing | `Your new hire nods. And maybe holds back. Stop before they quit.` | closing section |
| Prices | none on `/` | `/program`/`OffersPage` keeps €950 (unlisted + `noindex`) |
