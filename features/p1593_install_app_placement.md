---
status: week
type: story
rank: 84
workstream: product
created_date: '2026-10-29'
tags: [pwa, navigation, mobile, install]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1593: "Add to home screen" lives in the avatar menu, plus one return-visit nudge

## Problem

**Situation:** The install capability works today. Android gets the native prompt, iPhone gets an instruction drawer, and an already-installed app (standalone mode) hides every prompt. The offer currently appears in three places: an Install card in Settings, a thin banner at the end of a /live session, and a link inside the agreement celebration dialog.

**Complication:** Nobody finds the Settings card. The founder found it and it felt wrong there ("it's weird it says app, so I need to go into settings"). The other two compete with asks that matter more on those screens:

> "There are many celebration dialogues like events, subscription, subscribe to event, but there are other things there that are competing. You know, maybe there is a WhatsApp button, maybe there is learn about community and so on."

**Question:** Where does the install offer live permanently, and when (if ever) do we raise it unprompted?

> Founder framing: "Shouldn't it be a menu item, like a click on the mobile on my avatar, and it's maybe one of the first install?"

Installing pays off when a person comes **back**, not at the moment they finish something. So the unprompted offer targets return visits, not celebrations.

## Appetite

Blast radius: low to medium. It touches the shared avatar menu (every signed-in page) and the mobile bottom bar. Reversibility: git revert, with no schema change. Decision density: zero open. The founder delegated the CTA text and placement details to agents on 2026-10-29: "up to agents to decide".

## Invariants

- **One primary per view (P1433 D2, visual-qa P955).** The return-visit nudge must never be stacked with the "Today's event" strip. When both apply, Today's event wins and the nudge is not rendered.
- **Never offered to someone already installed.** Every surface hides when the app runs standalone (the existing installed check).

## Solution

1. **Avatar menu item "Add to home screen".** It goes in the shared avatar menu, in the account group above Sessions/Settings, so it appears in every place that renders the menu: the mobile Me sheet, the desktop top-nav dropdown, and the app sidebar avatar menu. Behaviour:
   - It is hidden when the app is installed.
   - On Android/Chromium with a captured prompt, it fires the native prompt.
   - On iOS it opens the existing iOS instruction drawer.
   - On desktop it shows only when the browser can actually prompt. Desktop browsers without a prompt (e.g. Safari or Firefox desktop) get no item.
2. **Return-visit nudge (mobile only).** It shows for signed-in people on a mobile layout, not installed, on their 2nd or later visit, and only where the platform can act (native prompt available, or iOS). It renders as a dismissible strip in the same slot above the bottom tabs that "Today's event" uses, and Today's event takes precedence. Tapping it behaves like the menu item. Closing it starts the existing 30-day dismiss cooldown. A "visit" is a new browser session, counted on the device; exact mechanics are the implementer's call.
3. **Remove** the Install card from Settings, the install link from the celebration dialog, and the install banner from /live session end. Delete the components if nothing else uses them.
4. **Analytics:** keep the existing install events and add source values `avatar_menu` and `return_nudge`. Retire the sources for the removed surfaces.

### Constraints from the spec review (Gemini, verified by grep 2026-10-29)

- **The Me sheet omits the account group.** `me-sheet.tsx` and the desktop dropdown render `NavigationMenuItems` with `omitAccountGroup` and list their own account block. So the item must be added to each surface's account block (Me sheet, top-nav dropdown, sidebar avatar menu), not only inside `NavigationMenuItems`' account group.
- **The iOS drawer needs one shell-level owner.** Today each removed surface mounts its own drawer. Lift drawer open state into `PwaInstallProvider` (e.g. `openInstall(source)` that prompts natively or opens the drawer) and mount the drawer once at the app root, so closing the menu or sheet does not unmount it.
- **Nudge layout:** the strip is a row holding two sibling buttons (CTA area, × close), never a button nested inside a button. The × gets its 40px touch target from the full strip height (`h-10`) and a ≥40px width.
- **Visit counting:** count a visit when ≥30 minutes have passed since the last recorded activity on this device (persistent storage timestamp). Reloads and route changes within a visit never increment the count.
- **Prompt timing:** on non-iOS, the item appears only once `canPrompt` is true. Accept that it may be absent if the menu opens before `beforeinstallprompt` fires, and don't show a placeholder. Menus are opened by a tap, and no layout shift happens while a menu is closed.

CTA text: **"Add to home screen"**. Agents chose it under the founder's delegation, because it describes the iPhone action literally and also reads correctly on Android.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| iOS never confirms an install, so the nudge can return after the cooldown for someone who did install | ACCEPT | Once they open from the icon, standalone mode hides it for good |
| Nudge shows on a page that already has a primary bottom action | MITIGATE | Render only in the Today's-event slot, never alongside it |
| Removing celebration/session-end surfaces lowers prompt count | ACCEPT | Deliberate founder call (2026-10-29), to stop competing with WhatsApp/community asks |
| Native prompt event not yet captured when the menu opens | MITIGATE | Item hidden (non-iOS) until a prompt is available, so it's never a dead control |

**Non-Goals**
- Do NOT change the service worker, the manifest, or the update-on-resume flow (P1416).
- Do NOT add a nudge on desktop.
- Do NOT add install asks to any other celebration or event dialog.
- Do NOT restyle the avatar menu beyond adding the item.

## UI Contract

- Menu item label: `Add to home screen`, with a phone/download icon matching the other menu icons.
- Nudge strip: same height and type scale as the "Today's event" strip. Text `Add Clarity Pledge to your home screen`, an × close button with a ≥40px touch target, `aria-label="Dismiss"`.

## Acceptance Criteria

- [ ] Signed in on a mobile browser (not installed), the avatar menu shows "Add to home screen". Tapping it opens the iOS drawer on iPhone and the native prompt on Android.
- [ ] On desktop Chrome (not installed) the avatar menu shows the item and it triggers the native prompt. On a desktop browser that cannot prompt, the item is absent.
- [ ] In the installed app, the item and the nudge are absent.
- [ ] Settings no longer shows an Install card. The celebration dialog and /live session end no longer show install links.
- [ ] On a first visit no nudge appears. On a later visit (mobile, signed in, not installed) the strip appears above the bottom tabs.
- [ ] On an event day the "Today's event" strip shows and the nudge does not.
- [ ] Closing the nudge hides it, and it stays hidden after reload.
- [ ] Unit tests cover the visibility rules (installed / desktop / iOS / first visit / dismissed / today's event), and existing tests for the removed surfaces are updated or removed.
- [ ] Checked in a browser at 375px, 320px and desktop.

## Related

- P493: the original install banner. P838/P1416: PWA update behaviour. P1433 D2: the Today's-event strip and one-primary rule.
- Rulings: 2026-10-05 (P1416), 2026-09-28 (SW only in prod builds, so install prompts can't be tested under `vite dev`; use a preview build or mock the prompt).
