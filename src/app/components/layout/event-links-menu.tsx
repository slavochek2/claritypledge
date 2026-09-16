/**
 * @file event-links-menu.tsx
 * @description P1179: the room's "Links" button and the menu it opens.
 *
 * PLACEMENT: a sibling of the avatar in the nav's right-hand group, at every
 * width. Decided 2026-08-28 after a prototype pass at literal widths. The nav
 * centre slot was built and rejected — it is centred on the VIEWPORT rather
 * than on the gap, so at 320px the control drifts under the avatar (the
 * documented /terms collision, simple-navigation.tsx:392-402), and the fix used
 * there (hide below 375px) is forbidden: the whole point is that the control is
 * in the same place on every phone in the room.
 *
 * OPEN SHAPE — TWO shapes, by breakpoint (revised 2026-08-31, founder):
 *   - Below `lg`: a bottom SHEET. It gets tapped repeatedly by standing people
 *     holding a phone one-handed during a live event; the sheet puts every
 *     entry in thumb reach and a top-anchored dropdown is a stretch on a large
 *     phone. This is the case the control was designed for and it is unchanged.
 *   - At `lg` and above: an anchored DROPDOWN, the same primitive and the same
 *     `align`/`sideOffset` the nav's own "Use cases" group uses. Founder,
 *     verbatim: "on desktop it just like slides up ... it should be like we
 *     have the use cases you know at the top and then I click". A full-width
 *     panel rising from the bottom of a desktop viewport for five links reads
 *     as a phone control on a monitor, and there is no thumb-reach argument to
 *     pay for it there.
 *
 * The two triggers are ALREADY breakpoint-exclusive (the nav renders both
 * right-hand groups and hides one with CSS), so each one owns the shape that
 * belongs to its breakpoint. Nothing measures the viewport at runtime.
 *
 * CONTENT — P1323: three tabs, Points · Letters · Tools. One flat list became a
 * segmented panel when the contents outgrew it: six standing collections plus nine
 * letters plus three tools is 18 entries, and P1310 had already had to cap this sheet
 * after the 8th entry ran to -83px at 320x568. The tab names are the founder's own
 * ("instruments is a point collection... maybe we want to call it just points").
 *
 * The per-event "This event" group and its FIRST position (founder 2026-08-31:
 * "tonight should be the first link if the event has it") are RETIRED — see the
 * provider below for why, and note the panel is now a FIXED shape as a result.
 *
 * WHY Radix `Tabs` AND NOT THE PROTOTYPE'S MARKUP. `/tree/links-menu` is the approved
 * reference, and its segmented control is hand-rolled `role="tab"` buttons whose selected
 * state is an arbitrary Tailwind value carrying the brand navy as a RAW HEX LITERAL. That
 * cannot come here: p1179-design-system-reuse.test.ts scans THIS FILE as source text and
 * asserts it contains no raw hex, no arbitrary radius and no height token other than the
 * shared 44px.
 *
 * (The literal is deliberately not quoted in this comment. The scan reads raw source and
 * cannot tell a comment from a class name, so writing the value here — even to explain why
 * it is banned — fails the very check being described. Measured: it did.) `@/components/ui/tabs` renders the same
 * segmented look entirely in design tokens (`bg-muted` / `data-[state=active]:bg-background`)
 * and brings roving tabindex, arrow-key navigation and correct aria for free. The
 * prototype's RENDERING wins over this spec's rules, but a green design-system test that
 * predates both wins over a throwaway prototype page.
 *
 * DESIGN SYSTEM: this control introduces no colour, radius or height of its own.
 * The button and the sheet entries take ANSWER_BUTTON_CLASS — the room's
 * existing outlined-navy 44px treatment (meeting-terms-page.tsx:145, already
 * shared with /ready and /meet). The navy it carries is the brand navy,
 * deliberate and confirmed with the founder 2026-08-31 — this file names no
 * colour of its own, which the design-system suite asserts by scanning it. The dropdown uses the nav's own menu-item treatment for
 * the same reason: it must read as part of the nav, not as a second system.
 */

import { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ANSWER_BUTTON_CLASS } from '@/app/pages/meeting-terms-page';
import { cn } from '@/lib/utils';
import { analytics } from '@/lib/mixpanel';
import { buildLinksMenu, eventSlugFromLocation, type LinksMenuEntry } from '@/app/data/event-links';
import { EventLinksContext, type TriggerOverride } from '@/app/components/layout/event-links-context';

/**
 * ONE instance of this provider owns the open state, the event fetch and the
 * entry list. The trigger below is mounted TWICE — once in each of the nav's two
 * right-hand groups (the `lg:hidden` mobile one and the `hidden lg:flex` desktop
 * one), because the nav renders both and hides one by breakpoint rather than
 * unmounting it.
 *
 * Splitting them is not a style preference. Mounting the whole menu twice gave
 * two INDEPENDENT instances: two `open` states, two `getEventBySlug` calls per
 * room load, and two identical `data-testid`s in the DOM at once. Caught by
 * e2e/p1179-links-menu.spec.ts, which failed on a strict-mode locator violation
 * before it could measure anything (2026-08-28).
 *
 * The dropdown variant renders its entries only while OPEN, and only the visible
 * trigger can be opened — so the two variants never put two entry lists in the
 * DOM at once, and the testid stays unique.
 */
/**
 * The trigger. Mount this wherever the avatar is; it renders null off-event.
 *
 * `variant` picks the open shape and MUST match the breakpoint of the group it
 * is mounted in — see the file header.
 */
export function EventLinksButton({
  variant = 'sheet',
  owner = 'nav',
}: {
  variant?: 'sheet' | 'dropdown';
  /**
   * Which chrome this instance belongs to. The nav's instances stand down when a page has
   * ADOPTED the trigger; a page's instance renders only then. Exactly one is live at a
   * time, which is what keeps `data-testid="event-links-button"` unique in the DOM.
   */
  owner?: 'nav' | 'page';
}) {
  const ctx = useContext(EventLinksContext);
  if (!ctx) return null;
  if (ctx.override === 'decline') return null;
  if (owner === 'nav' && ctx.override === 'adopt') return null;
  if (owner === 'page' && ctx.override !== 'adopt') return null;

  const triggerClass = cn(ANSWER_BUTTON_CLASS, 'inline-flex items-center rounded-md px-3 py-0');

  if (variant === 'sheet') {
    return (
      <button
        type="button"
        data-testid="event-links-button"
        onClick={() => ctx.setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={ctx.open}
        className={triggerClass}
      >
        Links
      </button>
    );
  }

  return <EventLinksDropdown ctx={ctx} triggerClass={triggerClass} />;
}

/** The three tabs, in render order. Values are the `group` field on every entry. */
const TABS = [
  { value: 'points' as const, label: 'Points' },
  { value: 'letters' as const, label: 'Letters' },
  { value: 'tools' as const, label: 'Tools' },
];

/**
 * The panel body — IDENTICAL at every breakpoint, which is the P1323 contract. Only the
 * chrome around it differs (sheet below `lg`, anchored dropdown at `lg` and up).
 *
 * `renderEntry` is injected because the two chromes wrap a row differently: the sheet uses
 * a plain button carrying ANSWER_BUTTON_CLASS, the dropdown uses the nav's own menu-item
 * treatment so it reads as part of the nav. The GROUPING and the tab state live here once.
 */
function LinksMenuTabs({
  entries,
  renderEntry,
}: {
  entries: LinksMenuEntry[];
  renderEntry: (entry: LinksMenuEntry, key: string) => React.ReactNode;
}) {
  return (
    <Tabs defaultValue="points" className="w-full">
      {/* STICKY, measured necessary: at 320x568 the Letters tab is taller than the sheet, and
          with the switch inside the scroll container, scrolling down to the ninth letter
          scrolled Points / Letters / Tools off the top — changing tabs meant scrolling back
          up first. Pinned under the title, the switch is reachable from any scroll position.
          `bg-background` on the wrapper, not just the pill, so rows passing underneath do not
          show through the pill's rounded corners and its padding. */}
      <div className="sticky top-0 z-10 bg-background pb-2">
        <TabsList className="grid w-full grid-cols-3" data-testid="event-links-tabs">
          {TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value} data-testid={`event-links-tab-${t.value}`}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {TABS.map(t => (
        <TabsContent
          key={t.value}
          value={t.value}
          className="flex flex-col gap-2"
          data-testid={`event-links-panel-${t.value}`}
        >
          {entries
            .filter(e => e.group === t.value)
            .map((entry, i) => renderEntry(entry, `${entry.group}-${entry.label}-${i}`))}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/**
 * A row's visible text. The `stN` hint trails the label at reduced weight — the codes are
 * internal taxonomy and may not LEAD (decisions.md: "do not surface them as primary labels
 * on outward-facing surfaces"), but they are what the founder says out loud in a room, so
 * dropping them entirely would make the menu unspeakable.
 *
 * `truncate` on the label, not on the row: at 320x568 a label is cut around 24-28
 * characters and the hint is what gets lost first if the row truncates as a whole. Keeping
 * the hint outside the truncating span means the code survives and the words give way,
 * which is the right way round for someone being told "tap st5".
 */
function EntryText({ entry, wrap = false }: { entry: LinksMenuEntry; wrap?: boolean }) {
  return (
    <>
      {/* min-w-0 lets the label shrink inside a flex row; without it neither truncation nor
          wrapping engages and a long label pushes the code out of the panel instead.

          `wrap` is for the PHONE SHEET. Measured at 320x568: four of the nine approved letter
          labels truncated to "Agreement is not underst…" / "Grading your own underst…" —
          cutting exactly the words that carry the meaning, on a list whose words ARE the
          content. The sheet's rows are `min-h-11 py-4`, so they grow to two lines safely.
          The desktop dropdown keeps `truncate` as a guard only: at w-80 every approved
          label measured whole. */}
      <span className={cn('min-w-0', wrap ? 'break-words leading-snug' : 'truncate')}>{entry.label}</span>
      {entry.hint && <span className="ml-2 shrink-0 text-xs font-normal opacity-60">{entry.hint}</span>}
    </>
  );
}

/**
 * The DESKTOP panel body. Same three segments and the same rows as the sheet — but built from
 * `DropdownMenuItem`, not Radix `Tabs` and plain buttons. That split is deliberate and was
 * forced by two defects found in adversarial review (Gemini 3.8) and REPRODUCED in a real
 * browser at 1280px before this was written:
 *
 *   1. KEYBOARD: `DropdownMenuContent` is a WAI-ARIA menu. It swallows Tab (focus never
 *      leaves the menu container) and its arrow-key roving focus only visits
 *      `role="menuitem"` children. With Tabs + plain buttons inside, Tab, ArrowDown and
 *      ArrowRight all left focus stuck on the container — measured: zero `focusin` events
 *      across five key presses. No tab and no row was reachable by keyboard.
 *   2. CLOSE ON SELECT: a plain button does not run the menu's select handler, so opening a
 *      letter (new tab — no route change, so the close-on-navigate effect never fires) left
 *      the dropdown standing open behind it. Measured: dropdownStillOpen === true.
 *
 * Both were regressions: before P1323 the rows were `DropdownMenuItem`s. As menu items, arrow
 * keys walk the segments and then the rows, typeahead works, Enter selects, and a row CLOSES
 * the menu by default. A segment calls `preventDefault()` in `onSelect` so switching tabs
 * keeps the menu open.
 *
 * The phone SHEET keeps real Radix Tabs: a Drawer is a dialog, not a menu, so Tab moves
 * through it normally and tab semantics are the correct ones there. "The body is identical at
 * every breakpoint" is the VISUAL contract; the element roles follow the container.
 */
function LinksMenuDropdownBody({
  entries,
  go,
}: {
  entries: LinksMenuEntry[];
  go: (entry: LinksMenuEntry) => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('points');

  return (
    <>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" data-testid="event-links-tabs">
        {TABS.map(t => (
          <DropdownMenuItem
            key={t.value}
            data-testid={`event-links-tab-${t.value}`}
            data-active={tab === t.value}
            aria-current={tab === t.value ? 'true' : undefined}
            // Keep the menu open: switching segments is navigation WITHIN the panel.
            onSelect={e => { e.preventDefault(); setTab(t.value); }}
            className="justify-center rounded-md px-2 py-1 font-medium text-muted-foreground focus:bg-background/60 focus:text-foreground data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow"
          >
            {t.label}
          </DropdownMenuItem>
        ))}
      </div>
      <div className="mt-2 flex flex-col" data-testid={`event-links-panel-${tab}`}>
        {entries
          .filter(e => e.group === tab)
          .map((entry, i) => (
            <DropdownMenuItem
              key={`${entry.group}-${entry.label}-${i}`}
              data-testid="event-links-entry"
              // Default onSelect behaviour closes the menu — which is the fix for defect 2.
              onSelect={() => go(entry)}
              className="cursor-pointer justify-between"
            >
              <EntryText entry={entry} />
            </DropdownMenuItem>
          ))}
      </div>
    </>
  );
}

/**
 * The desktop shape. It owns its OWN open state deliberately: the provider's
 * `open` drives the bottom sheet, and reusing it here would mount the sheet
 * underneath the dropdown — the overlay would swallow the clicks the dropdown
 * is trying to receive. Two shapes, two states, one entry list.
 */
function EventLinksDropdown({
  ctx,
  triggerClass,
}: {
  ctx: NonNullable<React.ContextType<typeof EventLinksContext>>;
  triggerClass: string;
}) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  // Same contract as the sheet: never still covering the destination on arrival.
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger data-testid="event-links-button" className={triggerClass}>
        Links
      </DropdownMenuTrigger>
      {/* `align="end"`: the trigger sits in the nav's RIGHT-hand group, so an
          "end"-aligned panel stays inside the viewport. The nav's own left-hand
          "Use cases" group uses align="start" for the mirrored reason. */}
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        // P1323: w-80, not the original w-64. Measured in a browser at 1280px: the nine
        // approved letter labels need ~218px at text-sm plus the stN code and row padding
        // (~270px). At w-64 (256px) three of them truncated — "Shared belief vs common be…" —
        // on a MONITOR, where there is no width reason to cut founder-approved copy. w-80
        // holds the full ~30-character label budget event-links.ts documents.
        className="w-80"
        data-testid="event-links-menu"
        data-shape="dropdown"
      >
        <LinksMenuDropdownBody entries={ctx.entries} go={ctx.go} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EventLinksMenu({
  enabled,
  children,
}: {
  /**
   * P1323: whether this page is a product surface. Comes from `ClarityLandingLayout`'s
   * required `surface` prop via `SimpleNavigation` — the ONE place that mounts this.
   *
   * When false the provider is not installed, so every `EventLinksButton` beneath it
   * renders null (it returns null with no context). That is deliberately the same
   * mechanism the old location gate used, so the "exactly one trigger in the DOM"
   * property e2e/p1179-links-menu.spec.ts asserts is unchanged.
   */
  enabled: boolean;
  children?: React.ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<TriggerOverride>(null);

  /**
   * P1323 REMOVED the per-event extras machinery that used to live here: the
   * `getEventBySlug` fetch, the `liveTags` emptiness probe, its `PROBE_CAP` fan-out
   * limit, the fail-open-on-error branch and `visibleExtras`.
   *
   * They existed to serve the "This event" group, which is retired — an extra carried a
   * TAG, i.e. the same thing a Points entry carries, and no UI to write `events.links`
   * ever existed, so 0 of 14 prod events had one. The column and the `EventLinkEntry`
   * type are kept, so restoring the capability is a code change against data that is
   * still there.
   *
   * Two consequences worth stating, because they were load-bearing before:
   *   - The menu no longer performs ANY network call to render. It was one
   *     `getEventBySlug` plus up to 8 concurrent feed probes per room mount.
   *   - The panel is a FIXED shape. The variable-height region above the tabs is gone,
   *     which is what made the 9-letter list safe to add at 320px.
   *
   * `eventSlugFromLocation` STAYS. It is not part of the retired group: it is what puts
   * `?event=` on a Points entry so a stake surface opened from inside a room still knows
   * which room. Removing it would silently drop event attribution from every stake link.
   */
  const eventSlug = eventSlugFromLocation(location.pathname, location.search);

  // Close on navigation — the attendee taps an entry and the menu must not
  // still be covering the destination when they arrive.
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);

  const entries = useMemo(() => buildLinksMenu(eventSlug), [eventSlug]);

  const ctxValue = useMemo(() => ({
    open,
    setOpen: (v: boolean) => {
      setOpen(v);
      if (v) analytics.track('event_links_opened', { event: eventSlug });
    },
    entries,
    go: (entry: LinksMenuEntry) => {
      analytics.track('event_links_entry_clicked', { label: entry.label, group: entry.group, event: eventSlug });
      setOpen(false);
      // P1310: `newTab` entries point at a static page outside the SPA router
      // (`/presi`), which `navigate()` would resolve to the 404 route. Opened in
      // a new tab so the room this attendee is standing in keeps running behind
      // it. `noopener` because the deck must not reach back into this window.
      // The path is still internal and still built in event-links.ts — see the
      // no-URL invariant there.
      if (entry.newTab) {
        window.open(entry.to, '_blank', 'noopener,noreferrer');
        return;
      }
      navigate(entry.to);
    },
    override,
    setOverride,
  }), [open, eventSlug, entries, navigate, override]);

  /**
   * P1323: THE LOCATION GATE IS GONE. This used to read
   * `if (!linksMenuAppliesTo(pathname, search)) return <>{children}</>` — a path predicate
   * that mounted the menu only inside a room or on a `?event=`-carrying stake URL.
   *
   * That predicate was the defect: the destinations it guards are entirely
   * event-independent, so an event-shaped mount rule meant a `/stake/understanding` link
   * shared without `?event=` opened the same page with no menu at all.
   *
   * The decision moved to where a route is DECLARED — `ClarityLandingLayout`'s required
   * `surface` prop, read by `SimpleNavigation`, which is the only thing that mounts this
   * provider. So this component no longer decides WHERE it appears; it only decides what
   * it contains. Do not reintroduce a path check here: a regex in this file is exactly the
   * list the prop exists to avoid.
   */
  if (!enabled) return <>{children}</>;

  return (
    <EventLinksContext.Provider value={ctxValue}>
      {children}
      <Drawer open={open} onOpenChange={setOpen} forceSheet>
        {/* P1310: the sheet is `fixed bottom-0 h-auto` (drawer.tsx), so it grows UPWARD
            with no cap — past the top of a short phone once the list is long enough.
            Measured at 320x568 with the 8th entry (Slides) added: the sheet ran to
            -83px, taking the "Links" title and cmp7 off-screen. The same page on prod,
            one entry shorter, clipped nothing — so this is a real ceiling that the
            entry list had simply not reached yet, not a pre-existing defect. Capping
            here rather than in drawer.tsx: this is the one sheet whose content is a
            list that grows, and every other Drawer caller keeps its current behaviour.
            The cap itself lives in index.css as `.event-links-sheet` — this file names
            no height token of its own, which the P1179 design-system suite asserts by
            scanning it, and a fix should meet that standard rather than relax it. */}
        <DrawerContent data-testid="event-links-menu" data-shape="sheet" className="event-links-sheet px-4 pb-6">
          <DrawerTitle className="px-0 pt-4 pb-2 text-base font-semibold">Links</DrawerTitle>
          <DrawerDescription className="sr-only">
            {eventSlug
              ? 'Destinations for this event. The list does not change during the event.'
              : 'Destinations for this session.'}
          </DrawerDescription>
          {/* The tabs and the entries scroll together; the title does not — so the heading
              that names the sheet stays on screen no matter how long a tab's list is. With
              the per-event group retired (P1323) the tallest case is a FIXED one: nine
              letters. That is what makes AC-3b testable rather than data-dependent. */}
          {/* Kept on ONE line deliberately: p1310-mobile-nav asserts the sheet's scroll
              container as source text with `<nav className="[^"]*overflow-y-auto`, which
              cannot span a line break. Wrapping these attributes fails a green test that is
              pinning real behaviour (P1310's viewport cap), not formatting. */}
          <nav className="flex flex-col gap-2 overflow-y-auto overscroll-contain" aria-label={eventSlug ? 'Event links' : 'Links'}>
            <LinksMenuTabs
              entries={entries}
              renderEntry={(entry, key) => (
                <button
                  key={key}
                  type="button"
                  data-testid="event-links-entry"
                  onClick={() => ctxValue.go(entry)}
                  className={cn(ANSWER_BUTTON_CLASS, 'w-full rounded-md px-4 text-left flex items-center justify-between gap-2')}
                >
                  <EntryText entry={entry} wrap />
                </button>
              )}
            />
          </nav>
        </DrawerContent>
      </Drawer>
    </EventLinksContext.Provider>
  );
}
