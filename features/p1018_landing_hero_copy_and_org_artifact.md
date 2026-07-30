---
status: week
type: story
rank: 1000957.0
created_date: '2026-07-30'
tags: [landing, copy, organizations, certificate]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1018: Landing hero copy + swap the proof artifact to the org COA

> **Retroactive spec.** The work was implemented inline from conversation before a spec
> existed, then this spec was filed to satisfy the ship gates. Recorded honestly rather
> than back-dated: `.claude/rules/src.md` limits inline `src/` edits to one-line constant
> or typo changes, and this exceeded that. The branch and its seven commits were
> originally labelled `p1011`, which collided with the already-shipped
> `features/done/2026-06-10/p1011_sentry_noise_and_stale_jwt_empty_inbox.md`; branch and
> commit messages were renumbered to `p1018` before ship.

## Problem

**Situation:** `/` (the build-right-thing landing) opened with "Your team agrees. And ships
faster. / Wrong. Again. Wrong. Again." and showed, two-thirds down, a bilateral Clarity
Partner Agreement certificate signed by two placeholder celebrities.

**Complication:** Three defects, found by reading and by measurement, not by conversion data:
1. "Your team agrees." had no object. The nearest available one was the following sentence,
   so it could read as "your team agrees that AI ships fast" — a fact nobody agrees on.
2. At `lg:text-6xl` the setup line measured 974px against an 896px container, orphaning its
   last word onto a third line directly above the blue reveal and stealing its emphasis slot.
3. The page's offer scope is the organization ([decisions.md](../docs/decisions.md)
   2026-07-30 `[product]`), and the visitor arriving at the CTA is one person booking a
   15-minute call — but the proof artifact was a two-party contract requiring a counterparty
   who has agreed to nothing.

**Question:** What should the hero say, and which shipped artifact should the page show as proof?

## Appetite

Low blast radius — one page, one file, no shared component modified. `/coach`, `/founder` and
`/hiring` keep the bilateral certificate and are untouched. Fully reversible (`git revert`, copy
only). High decision density: every string is a `[FOUNDER DECISION]` and the hero block is
marked LOCKED by the P1004 UI Contract, so nothing here could be chosen by the agent.

## Solution

**Hero H1** — three beats, the loop as the blue blur-reveal:

```
Your team agreed on the spec.
AI shipped it fast.
Wrong. Again. And again.
```

Naming the spec supplies the missing object and aims "Wrong." at the spec rather than the
code — the code is faithful to a wrong instruction. Container widened `max-w-4xl` →
`max-w-5xl`; `text-balance` on the H1 and the reveal span.

**Section 7b** — swap `AgreementCertificate` for the single-party Clarity Organization Terms
(`CertificateFrame` + `CertificateOathBody` from `COA_VERSIONS`), keep the `TEMPLATE`
watermark, and reheading to name the social cost:

```
Make it normal to admit "I don't understand"
Reveal gaps easily. Bridge them safely.
```

**Closing CTA** — "catching" → "revealing" (consistent verb), and its paragraph is deleted
because that line moved up to 7b, where it introduces the artifact instead of restating a close.

## Risks / Non-Goals

### Risks
- **Copy is unvalidated.** No conversion evidence exists for any line on this page, and no
  viewer has seen any variant. Mitigation: none available — this is a bet, recorded as one.
- **"AI" in the H1 moves toward a saturated category.** All 30 competitor heroes in the
  SatScan are post-artifact AI tooling; [decisions.md](../docs/decisions.md) records
  pre-artifact as the empty position. Carried as an open risk, not resolved.
- **The page can outrun the deliverable** — it promises org-scale outcomes while the CTA books
  a 60-minute audit with two people. Watch for buyers arriving org-scoped and receiving a pair session.

### Non-Goals
- Do NOT change `/coach`, `/founder`, or `/hiring` — those pages address pairs, and the
  bilateral certificate is correct there.
- Do NOT modify the shared `SectionHeader` or `CertificateFrame` components — both are used by
  other landing pages. Local overrides only.
- Do NOT fork the oath copy for marketing. `VERIFIED_UNDERSTANDING_OATH` backs the pledge, the
  agreement and the COA; landing-specific wording would either diverge from the real document
  or edit the text people actually accept.
- Do NOT render the join page's "Accept terms & join" button — a live action on a marketing
  page is a dead control (P955 gate).
- Do NOT touch `lean-canvas.md` or `hypotheses.md` here — those hand off to
  `/slava:maintain:docs-strategy-update`.

## Done-When

- [x] H1 renders on three lines at 1440 with no orphaned word and no horizontal scroll
- [x] H1 renders without overflow at 375 and 320, verified with `innerWidth` confirmed
- [x] Section 7b shows the Clarity Organization Terms with the `TEMPLATE` watermark visible
- [x] The oath body is byte-identical to `/org/:slug/join` (same `COA_VERSIONS` constant)
- [x] No Accept button rendered on the landing page
- [x] SEO description matches the rendered H1
- [x] `./scripts/pre-commit-checks.sh` passes, including the P955 UI gate
- [x] Independent visual-QA pass finds no defect attributable to this change
- [x] Independent code review finds no blocking issue

## Acceptance Criteria

- [x] A visitor reading the hero can tell what the team agreed *on*
- [x] The proof artifact matches the page's audience — one person, org scope
- [x] No page other than `/` changes

## UI Contract

| Element | Value |
|---------|-------|
| H1 line 1 | `Your team agreed on the spec.` |
| H1 line 2 | `AI shipped it fast.` |
| H1 line 3 (blue, blur-reveal) | `Wrong. Again. And again.` |
| Hero sub-line | `Get your engineers off the treadmill.` |
| Hero container | `max-w-5xl` |
| Section 7b heading | `Make it normal to admit "I don't understand"` |
| Section 7b subtitle | `Reveal gaps easily. Bridge them safely.` |
| Closing CTA H2 | `Stop building wrong features. / Start revealing hidden misunderstandings.` |
| Artifact | `CertificateFrame` + `CertificateOathBody`, `COA_VERSIONS[CURRENT_COA_VERSION]` |
| Watermark | `TemplateStamp animate` |

## Decisions Made

- **"Reveal", never "catch".** Catch = I detect *your* gap (asymmetric, policing); reveal = the
  gap is surfaced by whoever holds it. The document's own sections are YOUR RIGHT and MY
  PROMISE, so a catch-framed heading would contradict the oath it introduces.
- **First person, not second.** "You don't understand" is an accusation and inverts the artifact.
- **Rejected `Wrong. Again. Wrong. Again.`** — a stutter nobody speaks; depicts two events where
  the shipped line implies an open-ended run; measured 814px against line 1's 849px, a 35px
  delta that flattened the block. 714px opens the taper to 135px.
- **Rejected `Stop shipping wrong specs`** for the closing H2 — a spec is not shipped, the thing
  built from it is. Kept `Stop building wrong features.`: the hero already owns the spec framing
  as the diagnosis, so the close should land the cost.
- **The COA intro ("not legally binding…") is deliberately absent.** It is pre-acceptance framing
  for the join page; nobody accepts anything here, and the watermark plus absent Accept button
  already mark the document as a specimen.

## Known Imperfection

At 320px only, the 7b heading break strands the opening quote and "I" at a line end. Not fixable
by `whitespace-nowrap` — at the 30px base size the quoted phrase alone is 300px against 288px
available, so forcing it unbreakable would overflow. Readable, no clipping; accepted.
