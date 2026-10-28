---
status: week
type: story
rank: 68
workstream: gtm
created_date: '2026-10-23'
tags: [landing, use-case, change-management, outreach]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1558: Use-case page for people leading a change that stalled

## Problem

**Situation:** The site has use-case landings (/builders, /hiring, /hospitals, co-founders, coaches). The active
market focus is mid-size organisations reached through a champion (decisions.md 2026-09-21), and the
people who own a stuck change inside them (change management, digital or business transformation,
AI adoption leads) were named as candidate invite roles in August, still with zero field contact.
**Complication:** The founder is starting discovery outreach to these people (Asia first, warm leads
anywhere) and wants a page that structures the use case, both to think it through and to link from
outreach. Nothing on the site speaks to "we agreed on the change and then nothing happened".
**Question:** What does a public use-case page for change leads say, built on the /hospitals pattern,
without promising capabilities that are not built yet?

> Founder framing, verbatim (2026-10-23): "it's very cheap for us to structure our thoughts in a use case page like we did for hospitals just so we I see it and then we see if this makes sense and then we do the outreach"

> On public vs unlisted: "use case public - why would it be private? ... who cares? what is there to lose if anything?"

> On follow-through: "who said yes to Clarity Meeting Principle, Clarity Group terms? Because then follow-through means answering Clarity Chat or answering Clarity letters." And: "it's about rewards ... for praising, we don't need to see who is not following through, but seeing who follows through."

## Appetite

Blast radius: low (one new route, one menu entry, no data, no auth). Reversibility: git revert.
Decision density: a few (route name, headline, CTA, indexing).

## Invariants

- **No unbuilt capability is presented as available.** Agent drafting from meeting transcripts, transcript
  import (P1457) and the follow-through record (P1559) are not live. The page describes them as how it
  works / what we are building, never as a feature a visitor can switch on today. A visitor who books a
  call must not discover the page oversold.
- **Recognition only.** Follow-through appears as recognition, with no ranking, and the page does not
  promise names or totals before P1559 decides. People say yes to the terms themselves.
- Every statistic carries an inline citation to a primary source, wording within the source (as P1506).
  Do NOT use the "70% of change programmes fail" figure: it is widely repeated without a primary
  empirical source.
- Clarity Pledge is the subject, no first-person service offer (as P1506).

## Solution

A public route inside `ClarityLandingLayout surface="public"`, built the way /hospitals is, added to
`AUDIENCE_LINKS` per the 2026-10-17 ruling.

**Resolved (founder, 2026-10-23 to 10-28):**
- Route `/change-managers`, menu label "For change managers", first in Use cases (the real job title;
  nobody is called a "change lead"). `/change-leads` redirects (client and server), OG covers both.
- `noIndex`, as /hospitals.
- Built on the /hospitals structure by sharing its sections, not copying them: hero → Marco chat
  (problem) → stat → Why almost nobody verifies → Reveal a gap, then close it (office cast) → Group
  Terms → How revealing gaps becomes a team norm → founder → closing "Reveal gaps in understanding
  before your rollout stalls" → References. The as-drafted sections 2 to 5 below were replaced by
  this; the offer cards and the "How the platform works" section were tried and dropped.
- Stat: IBM, Making Change Work (2008): 59% of change projects missed at least one objective or
  failed entirely; top obstacle mindsets and attitudes, not technology. In the source's words; no
  bridge line (founder deleted it).
- Headline "Everyone agreed. Then nothing changed."; CTA "Book a 15-min discovery call" → /intro.
- Open: who sees skipped check-backs (offer draft vs this spec's recognition invariant). The page
  says nothing about visibility either way.


Sections (order and copy drafted in /dev, every heading and the hero approved by the founder before build):
1. **Hero**: the stall: a change everyone agreed to in the meeting, that does not happen afterwards.
   [FOUNDER DECISION: headline.]
2. **Why agreed changes stall**: people say yes while understanding different things, and nobody checks.
   One concrete example, an AI rollout ("everyone agreed to use the assistant; three weeks later
   two people do").
3. **How it works**: the team opts into the Clarity Meeting Principle and the Clarity Group terms →
   after a meeting, each person's agent helps turn what was said into points, stories and letters →
   people answer each other in Clarity Chat → if someone disagrees with the principle itself, that goes
   through the same check (CMP10). Built vs coming is labelled per the first invariant.
4. **What you see**: follow-through shown as recognition: each person sees their own record; the team
   sees follow-through recognised. Whether by name or as a total is P1559's to decide; the page
   copy follows whatever P1559 settles, and until then stays at this level.
5. **Where it matters most**: AI rollouts, digital transformation, reorganisations (short cards).
6. **CTA**: "Book a 15-min discovery call" → /intro, exactly one primary CTA (2026-10-02 ruling, as
   /hospitals). [FOUNDER DECISION: confirm, or a different single action.]

Job titles may appear in page copy. This deliberately supersedes, for use-case pages, the August ruling
"no job titles in page copy" (decisions.md, around line 17779), founder 2026-10-23. Record it via /kdd at ship.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A team member reading the page does not see themselves in it | MITIGATE | Invariant 2; QA subagent also reads the page as a team member, not only as the change lead |
| Page oversells unbuilt features | MITIGATE | Invariant 1; built-vs-coming labelling checked in AC |
| The use case is wrong (no change lead feels this pain) | ACCEPT | The page is cheap; discovery calls test it. Revise after ~5 calls |
| Menu gets a sixth use case and grows crowded | ACCEPT | Ruling 2026-10-17 accepted the menu cost per use case |

**Non-Goals**
- Do NOT build any product capability (transcript import, agent drafting, follow-through record).
- Do NOT add a Thai or other language version.
- Do NOT change other landings or the shared layout beyond the one menu entry. **Deviation, founder-directed (2026-10-27, "reuse them everywhere"):** /hospitals sections were extracted into shared components; /hospitals renders and tracks identically (its test suite passes unchanged). Four landing redirects moved into one list (`LANDING_REDIRECTS`) so App.tsx shrinks under the quality ratchet.

## Acceptance Criteria

- [x] The page loads at the chosen route with the site's top menu and footer, signed in or not, and appears in the Use cases menu. *(Browser 2026-10-27/28: /change-managers renders with nav + footer, first in Use cases; /change-leads, /hospital, /program, /offers redirect; route + menu tests.)*
- [x] A reader can tell, for each capability mentioned, whether it works today or is being built. *(Final page names only live capabilities: the Group Terms and the 0 to 10 check. Unbuilt items (agent drafting, transcripts, follow-through record) were removed rather than labelled.)*
- [x] Follow-through appears only as recognition, with no ranking of people, and the copy does not commit to names or totals. *(Final page does not mention follow-through visibility at all; test asserts no "who didn't" phrasing.)*
- [x] Each statistic has an inline citation and a References entry; the 70% failure figure does not appear. *(IBM 2008 quotes verified in the PDF this session; Newton 1990 and Camerer 1989 carried from /hospitals; test asserts References and no 70%.)*
- [x] One primary action only, the founder-confirmed CTA, in the hero and a closing section. *(Test: exactly two primary links, both /intro.)*
- [x] Analytics: `landing_page_viewed` with the page's variant on load, and a CTA click event (unit test pre-deploy). `[post-deploy]` confirm in Mixpanel. *(Unit tests: variant change-managers, change_managers_cta_clicked, change_managers_exchange_viewed. Mixpanel confirmation is post-deploy and still to do.)*
- [x] Screenshots at 320px, 375px and desktop, reviewed by a separate QA subagent against the visual-qa checklist, plus one read-through as a team member. *(Five QA-subagent passes across versions, last on the /change-managers build; mobile text too small in full-page captures for contrast/touch-target checks, layout and overflow verified. Reviews: Gemini 4 Argon, Codex x3, Gemini flash x2.)*

## Open Questions

1. Does "change lead" cover AI rollout owners, or do they sit in IT/digital/HR? To be answered by the discovery calls, not desk research (founder 2026-10-23).

## Related

- [P1506](done/2026-06-10/p1506_hospitals_use_case_page.md): template page.
- [P1559](p1559_follow_through_record.md): Clarity Ledger counts (what this page says about follow-through).
- [P1457](p1457_clarity_chat_data_import.md), [P1437](p1437_conversation_groups_agents_check_understanding.md), [P1431](p1431_mirror_agent_letter_chat.md): import and agent drafting.
- hypotheses.md H-ChatFollowThrough; decisions.md 2026-10-23 [product], 2026-10-17 [product] (P1506), 2026-09-21 [product].
