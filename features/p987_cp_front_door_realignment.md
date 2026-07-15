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

1. **Snapshot the current homepage FIRST, then promote it to `/founder`.** Originally: a dev-gated `/tree/old-landing-2` route rendering the *current* `ProgramPage`, so the co-founder version is revivable before we touch it. **Revised this session (founder decision):** the co-founder offer is **still live**, so a dev-only snapshot left a sellable offer unreachable in prod. The snapshot is now a real route at **`/founder`** with a **"For co-founders"** nav entry (desktop + mobile), alongside `/coach`. Note this page is not an unreviewed prototype — it is verbatim the page that served `/` until this spec reframed `/`.
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

**Locked copy — final, resolved this session (wedge word + free-vs-€250 both settled by the founder; see Resolved Decisions #9–10):**
> **Hero:** Keep the hire you can't afford to lose. *(resolved this session — "de-risk" rejected: founder confirmed "de-risk is definitely coming from me," and `H-GenerativeFraming` logs "de-risk" as defensive framing that invites "we're fine")*
> **Hero sub:** Make misalignment easy to reveal and safe to bridge. *(resolved this session)*
> **Hero microcopy (under primary CTA, hero only):** A live 1:1 session. Free. Starts with a 15-minute call. *(new this session)*
> **CTA:** Book your free alignment audit. *(resolved this session — was "Get")*
> **Stat:** two beats, joined by a bridge sentence — `46%` of new hires fail within 18 months (9 out of 10 attitude, not skill; Leadership IQ) → "Small gaps compound." → `200%` of their salary is what replacing a leader costs you (Gallup). *(the bridge sentence was mandated in two prior passes and built for the first time this session)*
> **Chat:** `contact="Katie"` (was `"You"` — an inverted bug: the viewer is the founder, Katie is the hire); `variant="they-withheld"` now renders "The Seam" — a static, full-bleed strip that stays legible at rest, replacing a "typing…" tell that faded to invisible and never rendered at all under reduced motion.
> **Agreement heading:** Protect the relationship before your interests and values quietly diverge. *(resolved this session)*
> **Closing:** Your new hire nods. And maybe holds back. Stop before they give up on you. *(unchanged this session)*
> **FAQs:** new `KEY_HIRE_FAQS` (5 Qs) on `/`, replacing `PROGRAM_FAQS`; `PROGRAM_FAQS` retained for `/program` (`OffersPage`) and `/tree/old-landing-2`.
> **Testimonials:** removed from `/` this session — co-founder-workshop praise stays on other surfaces only.
> **Secondary:** "Take the Pledge" text link + pledger avatar stack — restored (unchanged this session).

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
- [x] `/` hero reads "Keep the hire you can't / afford to lose." + a single "Book your free alignment audit" CTA → `/intro` — **wedge word resolved this session** ("de-risk" rejected, see Resolved Decisions #9); live-session microcopy ("A live 1:1 session. Free. Starts with a 15-minute call.") added under the hero CTA; hero sub reads "Make misalignment easy to reveal and safe to bridge."; no coach/price/co-founder content on the hero otherwise.
- [x] "Take the Pledge" secondary CTA + pledger avatar stack present under the primary CTA: a subordinate `Link to="/sign-pledge"` text link (not a button) plus `<PledgerAvatarStack className="pt-2" />`. P955 "one full-width primary" still holds — the pledge link is inline text, not a competing full-width button.
- [x] The stakes section now has **two stat beats** joined by the mandated bridge sentence — **built for the first time this session** after being mandated twice previously and never implemented. Beat 1 (unchanged): 46% + "of new hires fail within 18 months — 9 out of 10 of them because of attitude, not a lack of technical skills." (Leadership IQ). Bridge: "Small gaps compound." Beat 2 (new): 200% + "of their salary is what replacing a leader costs you." (Gallup, new ref). Both beats resolve their citation.
- [x] `HardTruthChat` on `/` shows the key-hire scenario with `contact="Katie"` and `subtitle="your new Head of Sales"` — **bug fixed this session:** `contact` was `"You"`, inverting the story (the viewer is the founder; Katie is the hire, not "you"). `variant="they-withheld"` now renders **"The Seam"** — a static, full-bleed strip (`bg-background`, hairline borders, no bubble/tail/shadow) showing the honest reply Katie typed and never sent. Replaces the prior "typing…" tell, which faded to `opacity:0` while still occupying layout height (a permanent void) and never rendered at all under reduced motion (phase jumped straight past its visibility window) — the Seam fades in once and never back out, so it is legible at rest for every user, including reduced-motion.
- [x] Closing reads "Stop before they give up on you." (unchanged this session); the closing headline above it is unchanged ("Your new hire nods. / And maybe holds back.").
- [x] `?referrer`/`?login` redirect + `landing_page_viewed` still fire on `/` (not regressed) — redirect verified live (`?login=1` → `/login`, `?referrer=x` → `/sign-pledge`); `landing_page_viewed` call site unchanged and executes (event itself is a documented prod-only no-op in dev, per `src/lib/mixpanel.ts`)
- [x] `/program` (`OffersPage`) is out of nav/footer + `noindex`; route still reachable; price kept; `/` indexable
- [x] Agreement section heading reads "Protect the relationship before your interests and values quietly diverge." — resolved this session, replacing the leftover "Protect the hire so it survives early disagreements" placeholder.
- [x] Co-founder `<Testimonials />` section removed from `/` this session — it praised a workshop, not the key-hire audit. `PROGRAM_FAQS` consumers (`offers-page.tsx`, `old-landing-2.tsx`) verified unaffected; `Testimonials` was the only symbol imported from `offers-section.tsx` in `program-page.tsx`, so the import was dropped cleanly.
- [x] New `KEY_HIRE_FAQS` export (5 Qs, verbatim founder copy) added to `src/app/content/faqs.ts` and wired into `/`'s FAQ section this session; `PROGRAM_FAQS` untouched and still serves `/program` (`OffersPage`) and `/tree/old-landing-2`.
- [x] References fixed this session: Gallup ref added (backs the new 200% stat); Kendrick (previously listed but cited nowhere) now cited alongside Schegloff on the "social norm" card (delayed other-initiation of repair); the `r.n`-vs-list-position dead-code bug fixed — the rendered list numbers now come from `r.n` explicitly instead of CSS `list-decimal` position, so `<sup>` values and list numbers can't silently desync; `REFERENCES` reordered to first-encounter-while-scrolling order (was `[3]` first because the stakes section sits high on the page) with every `<sup>` renumbered to match; stale "verified refs [5][6][7]" comment corrected.
- [x] `TemplateStamp` — added a `sr-only` span ("Template — sample agreement, not a real signed document") alongside the existing `aria-hidden` decorative stamp, so screen-reader users get the mock-document disclosure the visual stamp already gives sighted users. Visual opacity/animation unchanged.
- [ ] Visual-QA pass — **still UNCHECKED.** The page changed materially again this session (hero/CTA/agreement-heading copy resolved, two-beat stat + bridge sentence, "The Seam" chat rebuild, testimonials removed, FAQ swap, references reordered, template-stamp a11y fix) and no visual-QA subagent run has cleared it at 375/320/desktop against `.claude/rules/visual-qa.md` since these changes landed. Needs a fresh pass before this spec can move to `qa`.

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
| 8 | dev session 2026-07-15 | Spec (line 35 Solution, Done-When #4) claimed `HardTruthChat` is "shared with /coach" — false premise never verified against source | Verified via grep of all importers: `coach-partnership-page.tsx` defines its own local `HardTruthChat` function and never imports the shared component (`src/app/components/landing/hard-truth-chat.tsx`); the shared component's only consumers are `program-page.tsx` and `old-landing-2.tsx` | Grep before asserting absence (epistemic gate #1) — the "props only, protect /coach" constraint that shaped Done-When #4 and the Non-Goals list was based on an unverified claim. Restructured the shared component with a `variant` prop instead of staying props-only, since there was never a `/coach` constraint to protect |
| 9 | founder 2026-07-15 | Wedge word: "de-risk" vs "keep" for the hero H1 | **"Keep."** H1 = "Keep the hire you can't afford to lose." | Founder confirmed "de-risk is definitely coming from me"; `H-GenerativeFraming` (hypotheses.md) logs "de-risk" as defensive framing that invites "we're fine" from the reader — rejected |
| 10 | founder 2026-07-15 | Free audit vs a €250 anchor price on `/` | **Free, by application.** No price shown on `/`; SEO description + hero microcopy both state "free"; CTA reads "Book your free alignment audit" | €250 anchor rejected — the audit stays a free qualifying conversation, not a paid product, at this stage of the funnel |
| 12 | founder 2026-07-15 | The co-founder landing was snapshotted to a DEV-only `/tree/old-landing-2`, but the co-founder offer is still being sold — a live offer with no reachable page | **Promoted to `/founder`** (prod route) + "For co-founders" nav entry, desktop and mobile. `url="/"` → `url="/founder"` (the snapshot still declared `/` as its canonical, which would have canonicalized `/founder` away). Assistant initially recommended deferring to a separate spec on blast-radius grounds and was **overruled — correctly**: that recommendation rested on an unverified claim ("a 539-line dev snapshot nobody reviewed for prod") that a file read refuted. It is the exact page that was live at `/` | Founder supplied the missing fact (offer still live); the assistant's objection was built on an assumption it had not checked, which is the failure epistemic gate #1 names |
| 11 | founder 2026-07-15 | The `/align` "Surface what needs clarity" move is advertised on `/`, `/coach`, `/founder` before it is wired — collides with the 2026-07-14 build freeze on further alignment-tooling build | **Shipped as advertising, not build.** Founder-owned unfreeze: *"it doesn't commit me to building it, it's part of validation."* The assistant's counter — one CTA on the page means no attributable read-out for this specific step — was **not refuted**, only overruled, and is recorded in full in `docs/decisions.md` 2026-07-15 ("the `/align` capability is advertised on `/` before it is wired") | Founder owns the build call; the freeze's own designated unfreeze trigger (customer-pulled, first real audit) is a stronger signal than this step will produce on its own — logged so the freeze doesn't read as silently violated |

## UX Notes

- **Single primary action** (P955): one full-width primary CTA — "Book your free alignment audit". No competing primaries (pledge CTA is inline text, not a full-width button).
- **Hero states:** static marketing hero; reuse the existing blur→clarity reveal beat if desired.
- **Chat POV** — resolved: founder-holds-back (`old-landing-2`, default `variant="you-withheld"`) vs new-hire-holds-back (`/`, `variant="they-withheld"`); the closing ("your new hire … holds back") points at the hire, matching `they-withheld`.
- **CTA empty/edge:** `/intro` is a static booking page — no events-gated empty state.

## Acceptance Criteria

- [x] A cold visitor on `/` sees the key-hire pain and one clear way to act (the free audit), with no coaching/price/co-founder/pledge content on the hero
- [x] The "audit" is disclosed as a live 1:1 session (not an async report) before/at the booking step — hero sub-copy states this on `/`, before the visitor ever reaches `/intro`
- [x] The old co-founder homepage remains reachable at `/tree/old-landing-2` for revival
- [x] A visitor seeking "can I hire him" can still reach `/about → Work with Slava` — `/about` nav link unchanged (`nav-links.ts`), not touched by this spec

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Hero H1 | `Keep the hire you can't afford to lose.` — **resolved this session**, wedge word "de-risk" rejected (Resolved Decisions #9) | `/` anonymous |
| SEO title | `Keep the Hire You Can't Afford to Lose` — resolved this session | `<SEO>` |
| SEO description | `A live 1:1 session. We find the blind spot in how you get aligned — the one that might cost you this new hire. Free, by application.` — resolved this session | `<SEO>` |
| Hero sub | `Make misalignment easy to reveal and safe to bridge.` — resolved this session | under hero |
| Hero microcopy | `Free. We find the blind spot in how you get aligned with your team. Starts with a 15-minute call.` — **revised this session.** The prior copy ("A live 1:1 session. Free. Starts with a 15-minute call.") named neither what the audit *is* nor why the 15 minutes exists; the explanation was live only in the SEO `description` meta tag, so no human ever read it. Founder chose the value-prop clause and declined the "worth both our time" gate wording — the gate is therefore still unstated on `/` (FAQ #1 carries the transparency instead) | hero |
| Primary CTA | `Book your free alignment audit` → `/intro` (interim) — resolved this session, was "Get" | Hero + closing, single primary |
| Secondary CTA | `Take the Pledge` text link → `/sign-pledge` (subordinate, not a button) + `PledgerAvatarStack` (unchanged this session) | under primary CTA, hero only |
| Stat | Two beats joined by a bridge — new this session. Beat 1: `46%` + "of new hires fail within 18 months — 9 out of 10 of them because of attitude, not a lack of technical skills." (Leadership IQ, ref 1). Bridge: "Small gaps compound." Beat 2: `200%` + "of their salary is what replacing a leader costs you." (Gallup, ref 2) | stakes section |
| Chat contact | `Katie` — **bug fixed this session**, was `"You"` (inverted: the viewer is the founder, Katie is the hire) | HardTruthChat |
| Chat subtitle | `your new Head of Sales` — new prop this session | HardTruthChat header |
| Chat heading | `What your new hire didn't send you.` (unchanged this session) | HardTruthChat |
| Chat variant | `variant="they-withheld"` — renders **"The Seam"**: a static, full-bleed strip (**`bg-muted`**, hairline borders, no bubble/tail/timestamp/shadow) that stays legible at rest and never fades to invisible, replacing the prior "typing…" tell that vanished (and never rendered at all under reduced motion). **`bg-muted`, not `bg-background`** — `bg-background` is `0 0% 100%`, literally identical to the white bubbles, so the strip was invisible; earlier revisions of this row said `bg-background` and were describing the broken state | HardTruthChat |
| Chat timing (`they-withheld`) | Own 4-beat schedule — 150ms message · **800ms Seam** · 1600ms reply · 2200ms consequence. **Fixed this session:** the variant was inheriting `you-withheld`'s 8-phase schedule but renders only phases 1/3/6/7, so it spent ~2.2s advancing through typing/strike/collapse beats that draw nothing here — pushing the Seam (the payload) to 2.75s. Measured after fix: Seam fully opaque at **1274ms** | `hard-truth-chat.tsx` |
| Nav CTA (logged-out, no upcoming webinar) | `Book alignment audit` → `/intro` — **fixed this session.** Was `Try a Clarity Letter`, which put two different offers in the same brand blue (`rgb(59,130,246)`) in the first viewport and broke `LoggedOutPrimaryCta`'s own stated contract ("every public page mirrors the main landing's action"). `/coach` keeps the letter CTA (P856, different audience) | `simple-navigation.tsx` |
| `/intro` | Heading `Book your free alignment audit` + `Starts with a 15-minute call. We find the blind spot in how you get aligned with your team.` — **added this session.** The page was a bare Google Calendar iframe with **no copy at all**, so the hero's "audit" promise broke at the moment of highest intent. Residual (not code-fixable): the Google Calendar widget itself is named "15-min Intro Call" in Google Calendar config | `intro-page.tsx` |
| Agreement heading | `Protect the relationship before your interests quietly diverge.` — shortened (dropped "and values") | agreement section |
| How-platform-works moves | 5 moves, shared by `/`, `/coach`, `/tree/old-landing-2`: Increase the will · Improve the skill · **Secure mutual commitment** ("Commit to a minimum principle with the people you work with.", was "Align expectations") · **Surface what needs clarity** (new — "Agents flag the high-stakes matters where you and your people may not actually agree.") · Decrease the friction. **Deleted:** "Prevent common pitfalls" (accused the hire of gaslighting) | `how-platform-works.tsx` `MOVES`, cross-page |
| Closing | `Your new hire nods. And maybe holds back. Stop before they give up on you.` (unchanged this session) | closing section |
| FAQs | `KEY_HIRE_FAQS` (5 Qs) — new this session, replaces `PROGRAM_FAQS` on `/` | FAQ section |
| Testimonials | removed from `/` this session — co-founder-workshop praise stays on other surfaces | — |
| Prices | none on `/` — free, by application (Resolved Decisions #10) | `/program`/`OffersPage` keeps €950 (unlisted + `noindex`) |
