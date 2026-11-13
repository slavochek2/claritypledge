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
| A real desktop in a frameless, barless window on a headless default screen size is tagged `headless_window` | ACCEPT | Fullscreen and installed-app modes are excluded, and the size must be a headless default (800x600, 1024x768, 1280x720, 1366x768, 1920x1080). A Windows user with an auto-hidden taskbar, or a Linux tiling window manager with no panel, in a frameless window at one of those sizes still matches. Tagged, not dropped, so it is reversible; the `profile_created` check above catches it |
| A stealth bot with a normal window and user agent | ACCEPT | Not catchable in the browser without fingerprinting; `has_interacted` (real input only, never `scroll`) is the backstop for counting |
| Route view events fire before the page loads its data | ACCEPT | A group or event slug that does not exist still counts as a view; chats count only when signed in. Shared links point at real pages, so this is rare |
| `has_interacted` set before the SDK finishes loading | ACCEPT | The SDK applies queued settings before queued events, so events tracked in that first second can carry the flag. Only within the first load |
| A board embed may be refused by Mixpanel (frame headers on an unknown or unshared token) | MITIGATE | Not testable until real public links exist. The tab says what to check and links each board out |

**Non-Goals**
- Do NOT rebuild an in-app analytics dashboard.
- Do NOT change the P1640 weekly read logic, beyond using clean data.

## Cost Budget

Mixpanel is metered (`docs/technical/metered-services.md`, registry row "Mixpanel": Free plan, 1M events per month; Growth: first 1M free, then $0.00028 per event). The heartbeat is a timer (rule 2: no push signal says "still reading"; without it a reader's session has no length). A hidden tab sends nothing (rule 3).

Named inputs, read from the registry row's "Where usage is read" (`Run-Query` on `$all_events` and `$mp_web_page_view`, last 30 days): **P** = page views per month, **V** = visible seconds per page view.

| Measure | Per user (one page view) | Per hour | Per test run |
|---|---|---|---|
| `page_engaged` | `floor(min(V, 600) / 30)`, at most `600 / 30 = 20` | `3600 / 30 = 120` for one tab visible all hour on new pages, `20` on one page (cap) | 0: the P1669 e2e harness intercepts every Mixpanel call |
| `page_left` | at most `MAX_LEAVES = 3` on hides plus 1 on leaving for another route, and only when the visible time has grown | at most 4 per page view | 0 (intercepted) |
| Named view events | at most 1 (`feed_viewed`, `group_viewed`, `group_join_viewed`, `chats_viewed`, `chat_opened`, `event_prepare_viewed`, `event_rsvp_confirm_viewed`) | at most 1 per page view | 0 (intercepted) |
| Prod smokes (webdriver, send heartbeats) | pages per smoke run x 1 `page_left` (each page is open under 30 s) | | pages per smoke run x 1 |
| Tagged bots other than webdriver | 0 heartbeats, 0 `page_left`; their view events and page views were already counted before P1669 | | |

Monthly upper bound added by P1669 = `P x (20 + 4 + 1) = 25P` (every page view open 10 visible minutes, which the 1-second median session says is far from the case).

1. **Fits the plan limit today?** Yes. `25P + current monthly events` is under 1M at the 30-day counts read on 2026-11-12.
2. **Fits at 10x?** The upper bound does not: `25 x 10P` is over 1M. A realistic `V` (most page views well under 30 visible seconds, so 0 heartbeats) fits.
3. **If not:** Mixpanel Growth, $0.00028 per event above the first 1M (registry row), or raise the interval to 60 s and halve the heartbeat term.

## Done-When

- [x] The promotion skills append UTM parameters to shared event links (one sample link pasted)
- [x] Dead-tap replay findings filed (inbox note or spec)
- [x] `docs/technical/analytics.md` points at the new boards; the old empty boards are deleted


## Post-deploy verification

Founder decision 2026-11-13: these can only be shown on the live site (or need the founder's public board links), so they are checked right after deploy, before the spec counts as verified.

- [ ] Bot filter proven by controls: a headless browser and a known crawler user agent produce events tagged `is_bot: true`, while a real phone visit is counted untagged (Live Events screenshot)
- [ ] Health and CSP smokes still pass and still prove a real `/record` after the bot filter
- [ ] A test sign-up through a UTM-tagged link shows that `utm_source` on its `profile_created` event and on its user profile
- [ ] A scripted 60-second visit shows a session of 50 seconds or more in Mixpanel
- [ ] Each new event appears in Mixpanel Live Events from a real prod visit, and the Path to value board includes them
- [ ] Kanban Analytics tab embeds the five public boards (no passcode; links read from `.env.local` `MIXPANEL_BOARD_*`, never committed); the old insights section is gone and insights appear as `/day` cards. Boards: [Pulse](https://eu.mixpanel.com/project/3968494/app/boards#id=11645736), [Path](https://eu.mixpanel.com/project/3968494/app/boards#id=11645737), [Return](https://eu.mixpanel.com/project/3968494/app/boards#id=11645738), [Friction](https://eu.mixpanel.com/project/3968494/app/boards#id=11645741), [Use](https://eu.mixpanel.com/project/3968494/app/boards#id=11646127)

## Related

P1628 (automation tag), P1640 (weekly read and Analytics tab), P1645.
