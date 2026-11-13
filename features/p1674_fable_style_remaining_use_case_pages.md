---
status: week
type: story
rank: 335
workstream: website
created_date: '2026-11-13'
tags: [landing, design, use-cases]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1674: The remaining use-case pages move to the fable style

## Problem

**Situation:** P1671 moved `/builders` and `/change-managers` to the fable layout (shared components in `src/app/components/landing/fable/`), with P1670's wordless hero drawing: five people, the same blue yes over every head, a different shape inside each, and the closing line for screen readers only. The other five use-case pages, `/founder` (co-founders), `/hiring`, `/hospitals`, `/communities` and `/coach`, still use the older style.
**Complication:** The founder wants every use-case page in one style. The 2026-11-12 ruling said each remaining page would be decided one by one; the founder decided all five on 2026-11-13. Founder, verbatim:

> "Bring the remaining use-case pages into the new fable design ... same style as /builders and /change-managers; the wordless hero picture ... ONLY where the page's story is 'everyone said yes, each understood something different'."

**Question:** Can the five pages take the fable style, with the picture only on the two whose story is a group, without losing any analytics event, redirect, link, SEO setting or locked copy, and without changing `/builders` or `/change-managers`?

## Appetite

Blast radius: medium. Five live public pages; `/hiring`, `/coach` and `/founder` also handle pledge-invite links; the shared fable components also render `/builders` and `/change-managers`. Reversibility: git revert. Decision density: low; one open founder call (the two hero examples, decided from a visual preview).

## Decisions already made

- **D1 (founder, 2026-11-13):** the picture goes on `/hospitals` and `/communities` only.
- **D2 (founder, 2026-11-13):** `/founder`, `/hiring` and `/coach` get the fable style without the picture. Their stories are two people (co-founders; a founder and Katie, the new hire; a coach and a client). The founder accepted that a mixed set is fine: the style is shared, the picture is content and must match the page's own story.
- **D3:** on pages without the picture, the hero is text only and uses the full content width (no empty right column): eyebrow, headline, the page's existing sub-line(s), the page's own button(s) and links, pledgers, and the page's existing scroll cue (label and target; `/coach`'s is an untargeted decorative arrow, `<ScrollIndicator />` with no props, and stays that way). The page's own sections then follow **in their existing order** (on `/hiring` and `/founder` the stakes stat comes before the chat, and stays there).
- **D4 (lifts a freeze):** P1004 re-homed `/hiring` "intact + dormant-revivable". The founder's instruction to restyle `/hiring` lifts that freeze for style only; copy stays (Invariants).
- **D5:** `/coach` keeps its own page-local chat ("When the hard truth is difficult to say", the deleted-message beat) and its own Venn diagram; they are restyled in place, not swapped for the shared landing components (`p915-coach-reframe` pins them).

## Invariants

### Behaviour

- **Invite links keep working.** `?referrer=` (truthy) navigates to `/sign-pledge`; otherwise `?login=` (truthy) navigates to `/login`. Same targets, same precedence, same truthiness checks, on `/hiring` (`program-page.tsx:208-211`), `/coach` (`coach-partnership-page.tsx:540-543`) and `/founder` (`old-landing-2.tsx:205-208`). `/hospitals` and `/communities` have none, and none is added.
- **Routes:** `/hiring` and `/coach` (App.tsx `:408`, `:418`), `/founder` (App.tsx `:1090`, PROD-REACHABLE), `/hospitals` and `/communities` (`USE_CASE_LANDINGS`) stay reachable in a production build; `LANDING_REDIRECTS` (`/hospital`, `/group-terms`, …) unchanged; nav "Use cases" order unchanged (`p1087-nav-groups.test.tsx`); `/tree` prototypes stay dev-only.
- **`/builders` and `/change-managers` do not change.** Any prop added to a shared fable component has a default that reproduces today's output exactly. Evidence: their tests stay green (below) and before/after screenshots of both pages match.

### Analytics: same events, same properties, same values, same triggers

Verified in code 2026-11-13. Nothing is added or removed, except the three exchange events in Solution item 4 (founder-approved).

| Page | Event | Properties (exact values) | Fired by |
|---|---|---|---|
| /hiring | `landing_page_viewed` | `variant: "program"`, `referrer` from the query | page load, once |
| /hiring | `alignment_audit_cta_clicked` | `location: "hero"` on **both** buttons (hero `:277` and closing `:492` both pass `size="hero"`) | the two discovery-call buttons |
| /coach | `landing_page_viewed` | `referrer` from the query, **no `variant`** | page load, once |
| /founder | `landing_page_viewed` | `variant: "old-landing-2"`, `referrer` | page load, once |
| /founder | `webinar_cta_clicked` | `location: "hero"` on **both** buttons (`:262`, `:434`), `has_event` | the two event-aware `WebinarCTA`s |
| /hospitals | `landing_page_viewed` | `variant: "hospitals"` | page load, once |
| /hospitals | `hospitals_cta_clicked` | `location: "hero"` / `"closing"` | the two discovery-call buttons |
| /hospitals | `hospitals_pledge_clicked` | none | the hero "Take the Pledge" link |
| /hospitals | `hospitals_exchange_viewed` | none (`analytics.track(cast.viewEvent)`, `gap-exchange.tsx:121`) | gap exchange scrolled into view, once |
| /communities | `landing_page_viewed` | `variant: "communities"` | page load, once |
| /communities | `communities_cta_clicked` | `location: "hero"` / `"closing"` | the two "Learn how it works" buttons → `/prepare` |
| /communities | `communities_manifesto_clicked` | none | the closing manifesto link |
| /communities | `communities_exchange_viewed` | none | gap exchange scrolled into view, once |
| /hiring, /coach, /founder, /hospitals | `founder_clip_play` | `location: "founder_credibility"` | the talk clip in `FounderCredibility` (`founder-credibility.tsx:112`) |

Untracked today, and staying untracked: `/coach`'s discovery-call buttons (`TryLetterCTA`) and pledge links, and the pledge links on `/hiring` and `/founder`. The cast and Sentry `surface` of each gap exchange (`HOSPITAL_CAST`, `COMMUNITY_CAST`) also stay as they are. The `/tree` prototypes keep their current behaviour: the prototype-only `tree_landing_fable_exchange_viewed` (via `FABLE_CAST`) and `founder_clip_play`, neither of which reaches analytics outside a production build.

### Buttons, links and anchors

- **Each page keeps its own actions, in hero and closing alike.** The shared fable hero and closing band today hardcode the builders discovery-call button (`AuditCTA`, `fable-sections.tsx:63`, `:209`) and the hero adds a "Take the Pledge" link. Per page, today:
  - `/hiring`: hero discovery call (calendar icon) + "Take the Pledge"; closing discovery call.
  - `/coach`: hero discovery call + "Take the Pledge"; closing discovery call + "Take the Pledge".
  - `/founder`: hero `WebinarCTA` + `WebinarDateLine` + "Take the Pledge"; closing `WebinarCTA` + `WebinarDateLine` (the next experiment when one is upcoming, else the discovery call).
  - `/hospitals`: hero discovery call + "Take the Pledge" (tracked); closing discovery call.
  - `/communities`: hero "Learn how it works" → `/prepare`, **no pledge link**; closing "Learn how it works" → `/prepare` + the manifesto link.
- **Every link keeps its `href`, `target` and `rel`:** the above, the pledger strip (`/pledgers`), the founder section's talk and credential links, the `/founder` testimonials' external links, every citation superscript and every reference URL.
- **Anchors that cues or links target keep their ids:** `#stakes`, `#references` (where present), `/communities` `#why` and `#terms`, `/coach` `#how`, `#agreement`, `#book`.

### Copy and sections

- **Copy stays locked.** Every visible string (eyebrows, headlines, sub-lines, section headings and body, chat dialogue, stats, CTA labels, citations, references, FAQ, testimonials) stays verbatim; only layout, type, colour and motion change. In particular `/hospitals` is the hospital brochure verbatim (`hospitals-page.tsx:4`), including its norm-path line "New staff onboard fast, digitally." (not the shared default "New joiners …"); `/communities` follows the 2026-11-12 [product] ruling (order hero → member chat → why → exchange → terms → closing; both buttons to `/prepare`; manifesto secondary; **no TEMPLATE stamp** on the terms). Where a shared fable section hardcodes a heading, list or stamp that differs from the page's copy (`ReasonsSection` title, `NormSection` path text, `PromiseSection` stamp and frame), the page's copy is passed in; the shared default never leaks onto these pages. `PromiseSection`'s Group Terms frame is not used for `/hiring`, `/coach` and `/founder`'s `AgreementCertificate`.
- **Sections stay, in order; only their look changes.** Each page keeps its section set and order. Sections with a fable equivalent (stakes band, reasons, gap exchange, norm path, founder, close, references) use the shared fable component with the page's copy; the others (`KeyHireCalculator`, the "Everybody assumes" stat cards, `MisunderstandingVenn`, `AgreementCertificate`, Group Terms specimen, the hospital value tiles, `Testimonials`, the FAQ) are kept and restyled in the fable look. Numbering follows `change-fable.tsx` and `builders-fable.tsx`: sections with an arguing heading carry the next index (`01`, `02`, …): "Everybody assumes", "Why almost nobody verifies", the illusion/Venn section, the agreement or terms section, the hospital value tiles, the norm path. Unnumbered: hero, chats, stat band, `KeyHireCalculator`, the gap exchange, founder, testimonials, FAQ, close, references.
- **Stat bands:** the number and sentence stay verbatim (the rendered text still reads e.g. `30%`, no space; `p1506:96`); the band's `visual` is a bar filled to that percentage, as on `/change-managers`; a count-up may stay. `/hiring`'s second line "Small understanding gaps compound." stays as its own line inside the band, in valid markup (no `<p>` in `<p>`). The only section change is the swap in Solution item 4.
- **The P1670 drawing's properties hold where it appears:** five people with five distinct shapes; plays once, then holds; static under reduced motion; the full story, closing line included, is screen-reader only; at least 3:1 contrast; no overflow at 320px.

### Tests

- **Baseline (main at `7e8c81eaa`, run 2026-11-13): these unit suites pass, 153/153,** and stay green: `p915-coach-reframe`, `p969-reproduce`, `p958-reproduce`, `p1506-hospitals-page`, `seo-canonical`, `navigation-acceptance-full`, `p1586-loading-states-guard`, `p1671-fable-live-pages`, `p1667-landing-fable`. Also green: the other suites protecting `/builders` and `/change-managers` (`p1670-landing-fable-hero-animation`, `p1558-change-managers-page`) and `e2e/p1667-landing-fable.spec.ts`.
- **Already stale, pre-existing:** `e2e/p958-webinar-date-line` and parts of `e2e/p987-verify` and `e2e/landing-no-horizontal-scroll` visit `/`, which redirects to `/feed`. The builder does not fix or edit them, and reports their result on main beside the branch result.
- **Test edits:** a test that pins copy, an event, a link or section order is never edited. A test that pins the old layout's structure, which a decision in this spec necessarily changes, may be updated, each edit listed in the build report with its reason. Known cases, both in `p1506-hospitals-page.test.tsx`: `:135` pins the hero's only button to "Why it matters", and the picture hero (D1) adds the "See an example" cue, as on `/builders`; `:129` counts primary buttons by the old colour class `bg-blue-500`, and fable buttons are `bg-blue-600` (hero) and white (closing band). The count of two primary actions stays asserted, by label and target.

## Solution

1. **All five pages render in the fable style**, matching `/builders` and `/change-managers`: hero, type scale, colours, section shells, motion and closing band. Each page becomes a fable composition (as `change-fable.tsx`) or adopts the shared sections in place; the implementing agent decides, provided every invariant holds.
2. **The shared fable components gain caller-owned options, each defaulting to today's output:** the hero's picture is optional (text-only, full width, D3); the hero's sub-line is optional and accepts rich content (citations; `/coach`'s two lines); the hero and closing band take the page's own actions (buttons, pledge or manifesto link, `WebinarDateLine`) and `location` values; the closing band takes an optional line under its heading (`/hiring`, `/coach`, `/founder` have one); the hero's scroll cues take the page's label and target; `ReasonsSection`, `NormSection` and the terms section take the page's heading, items and stamp setting; sections take ids where the page needs them.
3. **Hero picture on `/hospitals` and `/communities`** with a new five-person example each. Five distinct `picture` keys per example, so five distinct shapes; every person `outcome: "diverged"` (as `/builders`: each followed their own reading). New keys extend the `AgreedPicture` union.

   [FOUNDER DECISION: both examples are drafted placeholders, rewritten after review (the first hospital draft read as negligence; the first community draft reused "Maya" from the page's chat with a different story). Names, lines and closing lines need founder approval. The graphic shows none of these words; screen readers get all of them.]

   **/hospitals** (a communication gap, no clinical harm implied)
   - when: "Morning hand-over" · said: "Keep the family in the loop." · agreed: "5 of 5 nodded" · later: "By evening · what “in the loop” meant"
   - Anna: phoned the daughter (`phone`) · Ben: waited for the family to ask (`wait`) · Clara: left it for the doctor's round (`doctor`) · David: told the patient, not the family (`patient`) · Eva: wrote it in the notes (`notes`)
   - punchline (the closing line): "One hand-over. Five meanings."

   **/communities** (the announcement the member chat below shows, in its locked wording; nobody from the chat appears)
   - when: "Last meetup · announcements" · said: "Next month we're changing the meetup format." · agreed: "5 of 5 said “sounds good”" · later: "At the next meetup · what the new format meant"
   - Ravi: came ready for small groups (`groups`) · Jo: prepared a short talk (`talk`) · Ines: expected it to be online (`online`) · Ken: planned for a shorter evening (`short`) · Lea: came for open discussion (`open`)
   - punchline (the closing line): "Five said “sounds good”. Five different meetups."

4. **"How the platform works" on `/hiring`, `/coach`, `/founder` becomes the gap exchange** (founder approved 2026-11-13: "I'm OK with demo"; it is the existing 0-10 exchange, nothing new to develop). These pages render `HowPlatformWorks`, which carries the unbuilt "agents flag" claim (decisions.md 2026-10-28). As on `/builders` (P1671), the section becomes the gap exchange using the existing office cast's intro and close (as `BUILDERS_CAST` does), keeping the section's `id` (`/coach` `#how`). The other person's role label follows each page's story: [FOUNDER DECISION, drafted: "Teammate" on `/hiring` (unchanged), "Co-founder" on `/founder`, "Client" on `/coach`; one word each]. Each gets its own event: `hiring_exchange_viewed`, `coach_exchange_viewed`, `founder_exchange_viewed` (no properties; Sentry surfaces `hiring-exchange`, `coach-exchange`, `founder-exchange`). These three events and this one section swap are the only additions.

**Build and review:** one Opus builder in a worktree; the main session verifies. Code review by Gemini, Codex and GLM. Visual QA by a separate reviewer that gets only screenshots (each page scrolled to the end and given time for the chats to finish before capture, since sections fade in on scroll) and `.claude/rules/visual-qa.md`. The founder views all five pages locally.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| An event, a property value, a redirect or an SEO prop is lost in the swap | MITIGATE | Invariants tables; a test per page asserts each event fires with its exact values from its action, the redirects (both parameters together, empty values), and the SEO props |
| A shared component's default leaks onto these pages (builders button, pledge link, "New joiners", TEMPLATE stamp, `location: "closing"`) | MITIGATE | Caller-owned options (Solution 2); tests assert each page's own labels, targets, values and copy |
| A new option on a shared component changes `/builders` or `/change-managers` | MITIGATE | Defaults reproduce today's output; their tests green; before/after screenshots |
| The three text-only heroes look emptier above the fold | ACCEPT | D2/D3: a mismatched picture costs more than a missing one; the hero uses the full width and the page's own sections follow |
| Large pages (`/coach` 764 lines, `/hiring` 536) trip the quality ratchet | MITIGATE | Split by responsibility per `src/app/pages/CLAUDE.md`, never at an arbitrary line |
| `/communities` has no page test today | MITIGATE | The build adds one covering its events, actions, copy order and picture |
| The hero examples are invented copy | ACCEPT | `[FOUNDER DECISION]`, approved before build |

**Non-Goals**
- Do NOT change `/builders` or `/change-managers`.
- Do NOT change copy beyond the two hero examples and the swap in item 4.
- Do NOT add, remove or rename analytics events or properties, except the three exchange events in item 4.
- Do NOT change nav, routes, redirects, `/pricing`, `/intro` or `/prepare`.
- Do NOT fix the pre-existing stale e2e tests.
- Do NOT push or deploy.

## Acceptance Criteria

- [ ] All five pages show the fable style (screenshots at 320px, 375px and 1440px, each page scrolled to the end before capture)
- [ ] `/hospitals` and `/communities` show the five-person picture with the approved examples and five distinct shapes; `/hiring`, `/coach`, `/founder` show a full-width text-only hero followed by their own sections in their existing order
- [ ] Each page's hero and closing actions keep their label, target and event, with the exact `location` values in the table; `/founder` still switches between the next experiment and the discovery call; `/communities` shows no pledge link (test)
- [ ] On `/hiring`, `/coach` and `/founder`: `?referrer=x` lands on `/sign-pledge`, `?login=1` on `/login`, both together on `/sign-pledge`, empty values stay on the page (test)
- [ ] Every event in the Analytics table fires with its exact properties from its action, and the untracked actions still fire nothing (test)
- [ ] Copy checks: `/hospitals` keeps "New staff onboard fast, digitally."; `/communities` terms carry no TEMPLATE stamp; `/coach` keeps its hero lines and deleted-message chat (test)
- [ ] The drawing on both picture pages is static under reduced motion and its full story, closing line included, is screen-reader only (test)
- [ ] SEO props match the SEO table; routes reachable in a production build; `/tree` stays dev-only (test)
- [ ] The baseline suites pass; `/builders` and `/change-managers` before/after screenshots match; any test edit is listed with its reason; stale e2e results reported beside main's
- [ ] Independent visual QA (screenshots and checklist only) reports no blocking issue
- [ ] Founder views all five pages locally and approves

## SEO (unchanged, verified in code)

| Page | Title | url | Indexing / other |
|---|---|---|---|
| /hiring | "Keep the Key Hire You Can't Afford to Lose" | `/hiring` | indexed; description unchanged |
| /coach | "Clarity Pledge for Coaches" | `/coach` | indexed; description unchanged |
| /founder | "Clarity Program for Co-Founders" | `/founder` | indexed; description unchanged; keep `url="/founder"` (the file's header note) |
| /hospitals | `HOSPITALS_OG.title` | `/hospitals` | `noIndex`; `HOSPITALS_OG` image and description |
| /communities | "Clarity Group Terms for communities" | `/communities` | indexed; description unchanged |

## Related

- P1671 (closed): `/builders` and `/change-managers` in the fable style; the pattern this spec follows
- P1670 (closed): the wordless hero drawing
- P1004 (closed): `/hiring` re-homed and frozen (D4 lifts the freeze for style)
- P1506, P1558 (closed): `/hospitals`, `/change-managers` shared sections
- decisions.md 2026-11-12 [product] (fable adoption; other pages one by one), 2026-11-12 [product] (/communities structure), 2026-10-28 [technical] (shared sections, per-page cast), 2026-10-28 (HowPlatformWorks claim follow-up)
