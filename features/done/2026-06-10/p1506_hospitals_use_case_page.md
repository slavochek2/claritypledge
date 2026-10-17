---
status: all-done
type: story
rank: 41
workstream: gtm
created_date: '2026-10-16'
tags: [landing, use-case, hospitals]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
completed_at: 2026-10-17
---

# P1506: /hospitals use-case page

## Problem

**Situation:** A two-page Thai/English brochure for hospitals was written, fact-checked and reviewed over several rounds for a meeting with a hospital (source copy kept in the founder's private brochure archive). The site has use-case landings (/builders, /hiring, /coach), but nothing for healthcare.
**Complication:** The founder now meets people from the health industry in person and wants a link to show them, not a PDF.
**Question:** How do we turn the brochure into an English-only /hospitals use-case page on the existing landing pattern, keeping all its sections?

> Founder framing, verbatim: "if i meet somebody from the health industry i can show the slash hospital page"

> "So it's not a brochure, so one has to translate it properly, right?"

## Appetite

Blast radius: low (one new route, no data, no auth). Reversibility: git revert. Decision density: a few (CTA, nav visibility later).

## Invariants

- No first-person service offer ("I deliver…", "I coach…"). Clarity Pledge is the subject, as in the brochure.
- Every statistic carries an inline citation (author, year, title) linking to the primary source, plus the Sources list. Wording stays within the source: "communication was a factor in 30% of cases", never "caused 30% of errors". Sources (CRICO 2015: communication a factor in 30% of 23,658 US malpractice cases; HA Thailand Patient Safety Goals, P2 Communication). Both were checked against the original PDFs on 2026-10-16.

## Solution

A new public route `/hospitals` inside `<ClarityLandingLayout surface="public">` (the site's top menu and footer), built the way /builders and /hiring are. `/hospital` redirects to `/hospitals` (the founder says the singular out loud). `<SEO title="Clarity Pledge for Hospitals" description=… url="/hospitals" noIndex />`: unlisted pages are not indexed, and the OG title, description and image must read well when the link is pasted into LINE, WhatsApp or email. No sitemap entry. Responsive for desktop and mobile. English only. **Not linked from the nav** at launch; reachable by URL.

Content follows the brochure's English page. All 8 sections are mandatory. Copy is used verbatim, changing only line breaks and layout; any wording change is listed in the spec's build notes. The founder supplies the copy source from the private archive at build time; no private path, hospital name or meeting detail appears on the page.
1. Hero: "Reveal gaps in understanding between hospital staff before they become mistakes", plus the lead-in line and the crux "Make it normal to ask how well we understand each other".
2. What the hospital can expect (4 outcomes with icons, framed as expected).
3. Why gaps in mutual understanding stay invisible, plus the sourced 30% stat card.
4. **Interactive** 3-second exchange: step 1 is visible with a "Next" button; the visitor steps through A's question → B: 8 → A: "I'd guess you got about 4" → verified = the lower number (4) → choose "Move on" (cost: 3 seconds) or "Close the gap" (B explains back, a minute or more). Each choice shows its outcome; a "Replay" control follows. Neither path is a dead end.
5. Where gaps in understanding cost most (6 use cases).
6. How revealing gaps becomes a team norm (5 steps: See the cost → Find champions → Spread → Norm → Maintain).
7. How Clarity Pledge is different (workshop impact fades vs team norm; punchline).
8. Founder photo (`public/founder-photo.jpg`, alt "Vyacheslav Ladischenski (Slava), founder of Clarity Pledge"), name, email as a plain link (not a second button), LinkedIn; Sources list.

**Visual elements:** the brochure's own elements (3-stage people strip, A/B messaging chat with 8 vs 4 → verified badge, 5-step connected path, crux panel, workshop-vs-norm chart) are the design source, rebuilt as web components. Reuse existing site components only where they fit; the founder prefers the brochure's elements. Components live in a hospitals folder; generalise them only when the follow-up spec lands.

## Open Questions

1. Follow-up (not this spec): should the brochure's "social norm" framing and elements improve the existing landings (/builders, how-it-works)? Decide after /hospitals is live.

CTA (founder decision 2026-10-16): "Book a 15-min discovery call" → /intro, per the 2026-10-02 [product] ruling. Exactly one primary CTA on the page.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Page is found and read as a sales offer from the founder personally | MITIGATE | Invariant 1: Clarity Pledge as subject, no first-person delivery |
| Interactive exchange confuses on mobile | MITIGATE | Verify at 320/375/desktop per visual-qa rules |
| Unlinked page gets no traffic | ACCEPT | It is a share-by-link page by design |

**Non-Goals**
- Do NOT add a Thai version.
- Do NOT add it to the nav or sitemap yet.
- Do NOT change other landings or the shared layout.

## Acceptance Criteria

- [x] Visiting /hospitals shows the page with the site's top menu and footer, signed in or not; /hospital redirects there.
- [x] All 8 sections are present with the brochure's English copy; any wording change is listed in build notes.
- [x] The exchange: real buttons usable by Tab and Enter/Space; each step announced via aria-live; step 1 visible before any tap; both choices show an outcome; Replay works; with prefers-reduced-motion, steps change without animation; if JS fails, the full sequence renders as a static list.
- [x] Each statistic has an inline citation, and the standard References section (as on /builders) lists each primary source.
- [x] Page HTML carries `robots: noindex, nofollow`; no sitemap entry; no nav item links to /hospitals; link preview (OG title, description, image) is hospital-specific.
- [x] One action, "Book a 15-min discovery call" → /intro, in the hero and a closing CTA section (the landing pattern; founder ruling, redesign round). No secondary "take the pledge" button, no founder block.
- [x] Analytics: `landing_page_viewed` with `variant: "hospitals"` on load, `hospitals_exchange_step` per step, `hospitals_cta_clicked` on the CTA (verified in Mixpanel after deploy; pre-deploy, verified by unit test). `[post-deploy]` confirm events in Mixpanel.
- [x] Screenshots at 320px, 375px and desktop, including each exchange step and the chart; no overflow; touch targets ≥40px; the chart has a text alternative; reviewed by a separate QA subagent.

## Related

- Rulings: decisions.md "/" → /feed + one-CTA-per-landing (P1392); `surface` prop required on `ClarityLandingLayout` (typecheck gate).

## Build Notes

Copy source: brochure English dict (founder's private archive). Wording changes vs the brochure:
- Brand rendered as "Clarity Pledge" in body copy (brochure wordmark "ClarityPledge" is the site logo).
- Stat card: the brochure's footnote is split into an inline citation link "CRICO Strategies (2015), *Malpractice Risks in Communication Failures*" under the stat; wording of the stat sentence unchanged.
- Sources list adds the full institute name: "HA Thailand (Healthcare Accreditation Institute)".
- Exchange UI chrome not in the brochure: "Next", "Try the other choice", "Replay".
- `/hospitals` also sends `X-Robots-Tag: noindex, nofollow` (vercel.json): the static `index.html` declares `index, follow`, which a crawler that skips JS would otherwise see.
- Exchange a11y: focus moves to the next control after each step (the activated one unmounts); the live region is silent on load and is cleared-then-set so a repeated message is re-read. Known limitation, untested in a real screen reader: on reaching step 3, focus lands on "Move on" and its label may be spoken before the queued step-3 announcement.
- Analytics AC: verified by unit test pre-deploy; Mixpanel confirmation stays a post-deploy step.
- Chart axis label "in use" placed bottom-left (brochure had it unused).

Deviations:
- **B is slate, not orange.** The brochure colours B orange; `.claude/rules/src.md` bans orange in UI. A stays blue.
- **Header CTA.** The shared site header already shows a "Book a 15-min discovery call" button on every landing (same as /builders). The page body has exactly one primary CTA (hero); the shared layout was not changed (Non-Goal).
- **"If JS fails" fallback.** The site is an SPA, so with no JS there is no page at all. The honourable equivalent: an error boundary renders the full sequence as a static ordered list if the interactive exchange throws.
- **Source links.** HA Thailand → HA's own 2024 Patient Safety Goals document (backend.ha.or.th, confirmed it lists "Communication: P2"). CRICO → the Harvard Risk Management Foundation (CRICO) press release on the 2015 report; that host returns 403 to automated fetches, so its text was not re-read in this build. The founder's 2026-10-16 PDF check is the verification of record.
- **Link previews.** The SPA's client-side meta is invisible to LINE/WhatsApp/LinkedIn crawlers, so /hospitals is added to the bot-UA rewrite into `api/og.ts`, which serves a static hospital card with `robots: noindex, nofollow`. LINE's crawler UA contains `facebookexternalhit`, already in the matcher. OG image: `public/banners/hospitals-og.png` (1200×630), rendered from the brochure fonts and colours.
- `/hospital` redirects both client-side (React route) and at the edge (vercel.json, non-permanent).

### Redesign round (founder feedback after the first build)

The first build followed the print brochure's layout; the founder asked for the site's own. Changes:
- Layout rebuilt on the /builders and /hiring pattern: centred SectionHeader titles, `py-20 lg:py-28` sections alternating `bg-muted/30`, Reveal on scroll, icon tiles as cards.
- The 30% stat is its own section and counts up on scroll, as the 46% on /hiring.
- The exchange is a WhatsApp-style group chat (HardTruthChat's palette). Avatars `public/hospitals/colleague-{a,b}.jpg` are illustrations generated for this page (Gemini image model), generic, nobody real.
- Founder block removed. Sources became the standard References section; superscripts jump to it.
- CTA in the hero and a closing section; no secondary button; no Q&A.
- Clarity Group Terms specimen added (founder: yes), identical to /builders' block, no Accept button.
- [FOUNDER DECISION: two drafted headings] Certificate section: "One new team norm, in writing". Closing CTA: "Reveal the gaps before they become mistakes." (drafted from the H1). Replace freely.
- Follow-up filed as INBOX-186: reconciling the other landings (norm wording, the norm path vs HowPlatformWorks, the duplicated helpers).
- Visual QA subagent: 1 of 1 reported, 0 HIGH / 6 MEDIUM. Fixed: empty chat area, CTA label wrapping at 320px, hero sub-line stub. Dismissed after measuring: "Next" under 40px (measured ≥44px), tiny desktop text (an artefact of the halved screenshots). Set aside as consistent with the other landings: centred body paragraph, left-aligned References.
