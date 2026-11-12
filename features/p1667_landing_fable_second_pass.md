---
status: qa
type: task
rank: 329
workstream: landing
created_date: '2026-11-12'
tags: [landing, design-exploration, prototype]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1667: Second pass on the landing redesign: a hero picture people can read, on both main use-case pages

## Problem

**Situation:** P1665 put a visual redesign of `/builders` on main as a dev-only prototype at `/tree/landing-fable`. Its hero shows an unlabelled drawing of one line splitting into five.
**Complication:** Readers do not understand the drawing, and on a phone the hero is 949px tall on a 740px screen, so the first screen ends in the middle of the drawing. The prototype is also missing from the `/tree` hub, and a signed-in viewer sees the app sidebar around it, not the public site menu. Last, it restyles `/builders` only, while the active market focus ([lean-canvas.md](../docs/lean-canvas.md) §Customer Segments) is served by `/change-managers`.
**Question:** Make a second version that a first-time reader understands without explanation, on a phone as well as a desktop, for both pages, still dev-only.

> Founder, verbatim (2026-11-12): "people don't understand the visualization. And I think also on mobile, one has to scroll down and it's a bit weird that I scroll down and then I see the rest."

> "I give you another shot on this one. And feel free to improve also anything else on the same page."

> "it should be visible in the menu, right? I mean, also if anything is not visible in the menu, I guess we should consider how to make it visible"

> "for change managers and for builders are our two main things [...] for change managers, we have the how revealing gaps becomes a social norm. Don't you think we maybe need in both, in builders also, this kind of thing? I'm not sure how platform works."

> "it has to be mobile friendly [...] I leave it up to you to make the rest of the decisions"

The founder's screenshot of the page marks the signed-in app sidebar as "weird..".

## Appetite

Blast radius: low. Both routes are registered only under `import.meta.env.DEV`; production pages keep their rendered output. Reversibility: git revert. Decision density: low. The founder delegated the design decisions; the drafted example wording and the adopt-or-not call stay with the founder.

## Solution

1. **A hero picture that explains itself.** Replace the unlabelled lines with a labelled example in three beats: the sentence the team agreed on, everyone's yes, and what each person then did. One component, two data sets:
   - builders: four people say yes and ship four different things;
   - change managers: five say yes, one changes how they work.
   It carries a visible "Illustration" label, because the example is invented, not data.
   `[FOUNDER DECISION: the example sentence and the per-person outcomes are agent-drafted placeholders]`
2. **Phone layout.** The first screen holds the headline, the sub-line and the call button and ends there. The picture is its own titled block directly below, so nothing is cut at the fold. On desktop the picture sits beside the headline.
3. **Change managers in the same look.** New dev-only route `/tree/landing-fable-change` with the `/change-managers` copy, citations and section order.
4. **Builders gets the norm path.** On `/tree/landing-fable`, "How the platform works" is replaced by the gap exchange and "How revealing gaps becomes a team norm", the sections `/change-managers` already uses. Reason: decisions.md 2026-10-28 records that the platform section claims an agent feature that is not built, and the founder asked for this section on builders.
5. **Readability.** The outside reader found the first version "a bit less readable". Darken the grey headline line, keep body text at 16px or larger, and reduce the tight letter-spacing on long headings.
6. **The `/tree` hub lists every `/tree` page.** Add both landings and every other route that is registered but unlisted. A test reads the registered routes and fails when one is missing from the hub.
7. **Public menu when signed in.** On these two pages a signed-in viewer sees the public site menu, as on `/builders`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The invented example reads as a real customer case | MITIGATE | Visible "Illustration" label; generic first names, no company |
| Readers still do not understand the picture | ACCEPT | This is what the next reader round tests (decisions.md 2026-11-11 falsifier) |
| Prototype copy drifts from the production pages | ACCEPT | Dev-only exploration; re-sync only if adopted (as P1665) |
| A shared production component changes while being reused | MITIGATE | Additive exports only; the existing page tests for `/change-managers` and `/hospitals` must stay green |

**Non-Goals**
- Do NOT change the rendered output of `/builders`, `/change-managers`, `/hospitals` or any other production page.
- Do NOT expose either route in production.
- Do NOT change the builders headline. One prospect's agency-shaped problem is not enough to re-aim the page; it is a possible separate use-case page later.
- Do NOT reword the IBM stat or the "five moves" titles (decisions.md 2026-10-28, 2026-06-23).
- Do NOT adopt the redesign. That stays a later founder decision.

## Done-When

- [x] `/tree/landing-fable` and `/tree/landing-fable-change` render in dev with no console errors. Evidence: `e2e/p1667-landing-fable.spec.ts` smoke test on both pages (10 of 10 passed), plus a browser console read after scrolling each page end to end (empty; the same read returned a planted error, so the probe is not blind).
- [x] At 375px and 320px width: no horizontal overflow on either page, and the first screen ends below the call button with no part of the picture visible above the fold. Evidence: the same e2e file measures it at 320x640, 375x740 and 430x932. Failure path: with the full-screen column removed the 430px test fails (card at 735, expected 932 or lower).
- [x] The hero picture shows the agreed sentence, the yes count and each person's outcome as readable text, plus the "Illustration" label, at 320px, 375px and desktop width. Evidence: `src/tests/p1667-landing-fable.test.tsx` (text and tick-or-empty mark per person, both pages) and the screenshot review below.
- [x] `/tree/landing-fable` no longer renders "How the platform works" and does render the gap exchange and the team-norm section. Evidence: same unit test, section order asserted.
- [x] The `/tree` hub links to both pages, and a test fails when a route registered in `tree-routes.tsx` is missing from the hub (failure path shown once). Evidence: `src/tests/p1667-tree-hub-lists-every-route.test.ts`; with the builders entry removed it exits 1 and names `/tree/landing-fable`. The hub now lists all 35 `/tree` routes.
- [x] Signed in, both pages show the public site menu and no app sidebar. Evidence: `src/tests/p1667-tree-landing-signed-in-chrome.test.tsx` renders the real layout signed in. Control: `/tree/old-landing` keeps the sidebar. Failure path: with one page taken off the list the test exits 1 and the sidebar is back. Not checked by eye in a signed-in browser.
- [x] Both routes are DEV-guarded on the same line, and the existing tests for `/change-managers`, `/hospitals` and the shell route audit pass unchanged. Evidence: 154 of 154 across the seven test files; the production build's always-loaded chunk does not contain either path.
- [x] A separate visual check (screenshots only, no code) at 320px, 375px and desktop reports no open overflow, clipping or contrast finding. Evidence: two passes by a reviewer who saw screenshots only. Pass 1: 17 findings, the one HIGH a capture artifact (the phone image exceeded the browser's maximum height and repeated). Pass 2 on whole captures: "Nothing is broken, missing, overflowing or unreadable", 7 polish notes. Exception, stated so it is not read as clean: the shared pledger strip cuts off its avatar initials. That clipping is in a production component and shows on the live pages too, so it is filed in the task inbox, not fixed here.

## Review

Reviewers: Gemini ok (4 runs) · GLM ok (2 runs; 15 findings, 8 verified and fixed, 0 unverified, 7 dropped or set aside) · Codex ok (3 runs) · criteria reviewer ok · Opus not triggered · 10 of 10 received. The closing Gemini run on the final code reports no HIGH or MEDIUM defect.

Set aside, with the reason:
- The numbered sections and the shared chat sections use two heading sizes on one page. The shared sections are production components and keep their own headings; restyle only if the design is adopted.
- Under reduced motion the reasons, stats and norm rows still fade in, as every production landing does. Only the new example card was changed to appear at once.
- The pledger strip is left-aligned here with an override on the shared component. A proper alignment option on that component is part of adopting the design.
- The 12px small-caps label at the top of the example card stays; the time-turn label below it was raised.

## Known limitations

- The hub test reads source text. It does not see a path built from a constant or a template, or a comment glued to code with no space before `//`. Both files write every path as a plain string today.
- From 640px to 1023px the hero keeps the phone layout: a full-screen text column, then the example. It is clean but leaves a lot of empty space on a tablet held upright.
- The example's sentences, names and outcomes are drafted placeholders `[FOUNDER DECISION]`.

## Related

- [p1665](done/2026-06-10/p1665_landing_fable_exploration.md): the first pass.
- [p1558](done/2026-06-10/p1558_change_leads_use_case_page.md): the `/change-managers` page whose sections are reused.
- decisions.md 2026-11-11 [product] (the redesign stays dev-only until readers back it) and 2026-10-28 [product] (change managers page; the unbuilt claim in "How the platform works").
