---
status: week
type: story
rank: 332
workstream: website
created_date: '2026-11-12'
tags: [landing, design, use-cases]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
spec_review_hash: 89c880cc66d433ff66ebbd5684f89b25bb105facd9a350de3889d016c39d7ea6
spec_review_vendors: [gemini, openrouter]
---

# P1671: Live /builders and /change-managers move to the fable style, with the wordless hero drawing

## Problem

**Situation:** The fable redesign (P1665, P1667, P1670) exists only as two dev-only prototypes, `/tree/landing-fable` and `/tree/landing-fable-change`. P1670 gave both a wordless hero drawing: the same blue yes over every head, and a different shape inside each. Live `/builders` and `/change-managers` still use the older style.
**Complication:** The founder wants the use-case pages in one style, and wants the redesign brought from the prototypes to the real pages. Founder, verbatim:

> "can we redo in that sense all use cases ... So we have them in the same style, right? And we bring them, so we basically bring it from tree to the real page"

The two pictures use different counts (4 and 5 people), and the founder wants them consistent: "Maybe only five, because then five is a better number".
**Question:** Can the two live pages switch to the fable style without losing their analytics or invite redirects?

## Appetite

Blast radius: medium. Two live public pages, including `/builders`, which also handles invite links. Reversibility: git revert. Decision density: low; the founder decided the scope, the count and the line on 2026-11-12.

## Invariants

- **Invite links keep working** (decisions.md, the ruling that moved the landing to /builders). Today (`build-right-thing-landing.tsx:134-140`): `?referrer=` navigates to `/sign-pledge`, otherwise `?login=` navigates to `/login`. Same targets, same precedence.
- **Analytics carry over unchanged.** Today's events, verified in code:

| Page | Event | Properties | Fired by |
|---|---|---|---|
| /builders | `landing_page_viewed` | `variant: "build-right-thing"`, `referrer` from the query | page load, once |
| /builders | `alignment_audit_cta_clicked` | `location` (the CTA size) | each discovery-call CTA |
| /change-managers | `landing_page_viewed` | `variant: "change-managers"` | page load, once |
| /change-managers | `change_managers_cta_clicked` | `location` | each discovery-call CTA |
| /change-managers | `change_managers_pledge_clicked` | none | the hero "Take the Pledge" link |

  Any CTA or pledge link the fable layout adds fires the event its page already uses for that action. The `/tree` prototypes fire no analytics and no redirects.
- **SEO stays as it is**: /builders keeps its `SEO` props (title "Build the Right Thing", `url="/"`, indexed); /change-managers keeps `url="/change-managers"` and `noIndex`.
- **The hero copy stays locked** (the P1004 UI Contract on /builders: eyebrow, headline and sub-line verbatim).
- **Prod routes stay reachable and the `/tree` prototypes stay dev-only.**
- The P1670 drawing's properties hold on the live pages: plays once, then holds; static under reduced motion; the full story stays available to screen readers; at least 3:1 contrast; no overflow at 320px.

## Solution

1. **Live pages render the fable layout.** `/builders` renders the builders fable page and `/change-managers` the change-managers one, with each live page's analytics, redirects and SEO carried over. The live URLs stay the same. The implementing agent decides whether the live route renders the fable component or the live page adopts its sections, as long as the invariants hold.
2. **Five people on both pictures.** The builders example gains a fifth person, with a name, a `did` line and a picture, so the drawing shows five heads. The builders closing line becomes **"One sentence. Five meanings. All five shipped."** (founder-approved 2026-11-12). Any other visible "four" in the builders example follows the same count.
3. **The headlines stay as they are.** The builders headline is NOT changed: the silent-disagreement wording is to be tested in a champion conversation first.
4. **Record the reversal** in `docs/decisions.md`: the 2026-11-11 ruling ("stays a dev-only prototype until more readers back it") is reversed by founder decision on 2026-11-12.

**Build and review:** one Opus builder in a worktree; the main session verifies. Code review by Gemini, Codex and GLM. Visual QA by a separate reviewer that gets only screenshots and the visual checklist (`.claude/rules/visual-qa.md`).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A redirect or analytics event is lost in the swap | MITIGATE | Invariants above; tests assert the redirects and that each event still fires |
| The outside reader who preferred the old style (P1665) is right | ACCEPT | Founder decision 2026-11-12; revert is one commit |
| Shared section components drift between the fable and live pages | MITIGATE | Reuse the shared components, no copies; the P1667 drift tests stay green |
| A fifth builders person is invented copy | ACCEPT | Founder approved five people and the new line; the name and `did` follow the existing example's style and are reviewable in the diff |

**Non-Goals**
- Do NOT change the other use-case pages (co-founders, hiring, hospitals, communities, coaches); each is decided later.
- Do NOT change hero copy, CTA text or section copy beyond the five-people change. The section *set and order* follows the fable pages (for example the fable gap exchange replaces "How the platform works" on /builders), which is the point of this spec.
- Do NOT push or deploy.

## Acceptance Criteria

- [ ] `/builders` and `/change-managers` show the fable style with the wordless drawing of five people (screenshots at 320px, 375px and desktop)
- [ ] The builders closing line reads "One sentence. Five meanings. All five shipped."
- [ ] On `/builders`, `?referrer=x` lands on `/sign-pledge` and `?login=1` lands on `/login` (test)
- [ ] Every event in the Invariants table fires with its properties from its action, and the `/tree` prototypes fire none (test)
- [ ] `/tree/landing-fable*` stay dev-only; the live routes stay reachable in a production build; SEO props match the Invariants (test)
- [ ] The decision reversal is recorded in `docs/decisions.md`
- [ ] Independent visual QA (screenshots and checklist only) reports no blocking issue
- [ ] Founder views both live pages locally and approves

## Related

- P1670 (closed): the wordless hero drawing
- P1667, P1665 (closed): the fable redesign prototypes
- decisions.md 2026-11-11 [product]: the ruling this spec reverses
