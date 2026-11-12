---
status: in-progress
type: task
rank: 331
workstream: analytics
created_date: '2026-11-12'
tags: [analytics, mixpanel, bots, tracking]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
spec_review_hash: 059fd04098766feb956453050c3191fb3fecc0504d0e7b223820e7bfaa17d1e6
spec_review_vendors: [gemini, openrouter]
---

# P1669: Analytics counts bots, hides sources, and misses the pages people use

## Problem

**Situation:** On 2026-11-12, four Mixpanel boards were built that count only bot-proof signals: clicks, new accounts, RSVPs and practice sessions. They are "Pulse", "Path to value", "Do they come back?" and "Friction". Board links are in Done-When.

**Complication:** Measured through the Mixpanel MCP on 2026-11-12, over the last 30 days:
- 3,204 unique page viewers, of whom about 260 ever clicked or scrolled. Uncrawled traffic from US and Singapore (Windows, plus Mac in Singapore) also fires the app's own events. About 410 of 459 `signup_page_viewed` users and about 400 of 408 `live_meeting_page_view` users were bots. The P1628 `is_automation` tag (`navigator.webdriver`) does not catch these.
- 74 of 87 new accounts over 90 days have `$initial_referring_domain = $direct`. Links shared in WhatsApp and Messenger pass no referrer.
- The median Mixpanel session lasts 1 second, so time on site cannot be read.
- The pages real people use most carry no named event: `/feed` (52 users), `/groups/cm` (37), `/groups/cm/join` (10), `/chats` (7), and the event `/prepare` and `/confirm` steps. 48 people produced dead taps on `/cm`. None of these can enter a funnel.

> Founder, verbatim: "what about what they visit, how long they stay, and how they click and where, you know, what functions they discover or not, and if they spend any time there or not? ... do we need more Mixpanel events to cover more of our apps since we launched?"

**Question:** How do we make Mixpanel count real people, show where they came from and how long they stayed, and cover the surfaces they actually use?

## Appetite

Blast radius: medium. It touches analytics init and track call sites on many pages; the user flow is untouched. Reversibility: git revert for code; if bots are dropped rather than tagged, a wrongly dropped real visit is not recoverable. Decision density: low, one founder call (below).

## Invariants

- Recorder and smoke behaviour from P1628 and P1648 (decisions 2026-11-05 and 2026-11-06) stay as they are. Bot filtering must not stop the health and CSP smokes from proving a real `/record`.
- No PII or capability tokens in new event properties. Paths only, never full query strings (same rule as `not_found_page_viewed`). The one exception is the named `utm_*` parameters, and their values are cut to a safe set (letters, digits, `-`, `_`, `.`, at most 64 characters) before they are stored. New events on `/chats` carry no conversation or message id.
- The public boards hold aggregate reports only: no person lists, no per-user breakdowns, no `utm_*` breakdown below the channel level. Anyone with a link can read them.
- `is_bot` is the one tag boards filter on. P1628's `is_automation` traffic also carries `is_bot: true`, so a board never has to know both names.

## Solution

1. **Bot traffic:** keep known non-human traffic out of every count, using signals readable in the browser (user agent, headless traits, no interaction before leaving). Geography is evidence for checking the result, never the rule. Prefer tagging (`is_bot`) over dropping unless tagging leaves the boards unusable. Choose by CLAUDE.md's ranked reasons (user outcome, correctness, ...) and record why. "No interaction before leaving" cannot be a send-time tag: page views flush within 1 second (P881), before anyone has interacted or left. It becomes a separate super property, `has_interacted`, registered on the first tap, scroll or key press, so a board can count "interacted, not a bot" without the bot tag guessing. Bots tagged `is_bot` are not session-recorded unless the P1628 smoke opt-in is set.
2. **Sources:** adopt a UTM convention for every link the founder shares, applied by the event-promotion skills, so new accounts show their real channel. Carry first-touch UTM onto the account at sign-up.
3. **Visit length:** a session timeout alone will not fix the median, because a visitor who reads without clicking emits no events. Add a light engagement heartbeat on visible pages, or a page-leave event that carries time on page, then set the session definition. Heartbeat: `page_engaged` while the tab is visible, at a fixed interval, capped per page so an idle tab cannot run up event volume. Crawler user agents send no heartbeat. Keep the session definition timeout-based; confirm the current setting rather than assume it.
4. **Coverage:** add named events for the pages listed in Problem. Events for viewing the feed (`/feed`), viewing a group (`/groups/:slug`), completing a group join (`/groups/:slug/join`), opening a chat (`/chats`), and viewing the event prepare (`/events/:slug/prepare`) and RSVP confirm (`/events/:slug/confirm`) steps. Then add them to the "Path to value" board. For dead taps, review session replays on `/cm` and on hike-type event pages (`/events/:slug`) and file what people expected to be tappable.
5. **Kanban Analytics tab:** replace the in-house tab with the five Mixpanel boards, embedded from their public links, with no passcode (founder decision 2026-11-12). The links live only in `.env.local` as `MIXPANEL_BOARD_*` and never in committed code. The founder enables Public Boards in Mixpanel Project Settings, which only the owner can do. The current P1640 insights section is removed from the tab. Insights move to `/day` as cards, shown only when something changed, and each card says what happened, how many people, and where to look. The cards keep Confirm and Dismiss, which write the same P1640 ledger. The tab's seven-question sections go too, since the boards replace them; the weekly read script, gate and stored reads are unchanged. The embed link is each board's public share link (`https://eu.mixpanel.com/p/<token>`). The internal board links in Done-When need a login and cannot be embedded. If a `MIXPANEL_BOARD_*` value is set but is not a public link, the tab names it rather than showing nothing.
6. Update `docs/technical/analytics.md` (Dashboards section) to point at the new boards. The founder approved removing the empty old boards on 2026-11-12 ("fix yes").

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A bot filter drops real people (e.g. privacy browsers) | MITIGATE | Before ship: unit fixtures for privacy browsers (Brave, Firefox, Safari, DuckDuckGo, Samsung Internet, in-app WhatsApp and Messenger browsers) must classify as human. After ship: any account whose `profile_created` carries `is_bot: true` is a false positive and a fail. A before/after count cannot separate the filter from normal traffic swings |
| Historical data stays polluted | ACCEPT | Boards already use bot-proof signals; clean data starts at ship |
| Session settings are project-wide and change old reports | ACCEPT | Old session numbers are meaningless anyway |

**Non-Goals**
- Do NOT rebuild an in-app analytics dashboard.
- Do NOT change the P1640 weekly read logic, beyond using clean data.

## Done-When

- [ ] Bot filter proven by controls: a headless browser and a known crawler user agent produce events tagged `is_bot: true`, while a real phone visit is counted untagged (Live Events screenshot)
- [ ] Health and CSP smokes still pass and still prove a real `/record` after the bot filter
- [ ] A test sign-up through a UTM-tagged link shows that `utm_source` on its `profile_created` event and on its user profile
- [ ] A scripted 60-second visit shows a session of 50 seconds or more in Mixpanel
- [ ] Each new event appears in Mixpanel Live Events from a real prod visit, and the Path to value board includes them
- [ ] The promotion skills append UTM parameters to shared event links (one sample link pasted)
- [ ] Dead-tap replay findings filed (inbox note or spec)
- [ ] Kanban Analytics tab embeds the five public boards (no passcode; links read from `.env.local` `MIXPANEL_BOARD_*`, never committed); the old insights section is gone and insights appear as `/day` cards. Boards: [Pulse](https://eu.mixpanel.com/project/3968494/app/boards#id=11645736), [Path](https://eu.mixpanel.com/project/3968494/app/boards#id=11645737), [Return](https://eu.mixpanel.com/project/3968494/app/boards#id=11645738), [Friction](https://eu.mixpanel.com/project/3968494/app/boards#id=11645741), [Use](https://eu.mixpanel.com/project/3968494/app/boards#id=11646127)
- [ ] `docs/technical/analytics.md` points at the new boards; the old empty boards are deleted

## Related

P1628 (automation tag), P1640 (weekly read and Analytics tab), P1645.
