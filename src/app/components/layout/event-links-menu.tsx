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
 * DESIGN SYSTEM: this control introduces no colour, radius or height of its own.
 * The button and the sheet entries take ANSWER_BUTTON_CLASS — the room's
 * existing outlined-navy 44px treatment (meeting-terms-page.tsx:145, already
 * shared with /ready and /meet). The navy it carries is the brand navy,
 * deliberate and confirmed with the founder 2026-08-31 — this file names no
 * colour of its own, which the design-system suite asserts by scanning it. The dropdown uses the nav's own menu-item treatment for
 * the same reason: it must read as part of the nav, not as a second system.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ANSWER_BUTTON_CLASS } from '@/app/pages/meeting-terms-page';
import { cn } from '@/lib/utils';
import { eventsService } from '@/app/data/events-service';
import { pointsService } from '@/app/data/points-service';
import { storiesService } from '@/app/data/stories-service';
import { analytics } from '@/lib/mixpanel';
import { buildLinksMenu, eventSlugFromLocation, isSafeTag, type LinksMenuEntry } from '@/app/data/event-links';
import type { EventLinkEntry } from '@/app/types';

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
const EventLinksContext = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
  entries: LinksMenuEntry[];
  go: (entry: LinksMenuEntry) => void;
} | null>(null);

/**
 * The trigger. Mount this wherever the avatar is; it renders null off-event.
 *
 * `variant` picks the open shape and MUST match the breakpoint of the group it
 * is mounted in — see the file header.
 */
export function EventLinksButton({ variant = 'sheet' }: { variant?: 'sheet' | 'dropdown' }) {
  const ctx = useContext(EventLinksContext);
  if (!ctx) return null;

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
        className="w-64"
        data-testid="event-links-menu"
        data-shape="dropdown"
      >
        {ctx.entries.map((entry, i) => {
          const prev = ctx.entries[i - 1];
          const separator = prev && prev.group !== entry.group && entry.group === 'tools';
          const heading = entry.group === 'event' && (!prev || prev.group !== 'event');
          return (
            <div key={`${entry.group}-${entry.label}-${i}`}>
              {separator && <DropdownMenuSeparator data-testid="event-links-separator" />}
              {heading && (
                <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                  This event
                </DropdownMenuLabel>
              )}
              <DropdownMenuItem
                data-testid="event-links-entry"
                onSelect={() => ctx.go(entry)}
                className="cursor-pointer"
              >
                {entry.label}
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EventLinksMenu({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [extras, setExtras] = useState<EventLinkEntry[]>([]);
  /**
   * The per-event tags that actually have something behind them.
   *
   * `null` means "not resolved yet", and is rendered as NO event entries rather
   * than as all of them. Showing them first and removing them a moment later
   * would make the menu twitch during a live event, which is the one moment it
   * must not; and an entry that vanishes under a thumb is worse than one that
   * arrives a beat late. See the founder note below for why this exists at all.
   */
  const [liveTags, setLiveTags] = useState<ReadonlySet<string> | null>(null);

  const eventSlug = eventSlugFromLocation(location.pathname, location.search);

  // The list is static for the whole event, so this is fetched once per slug and
  // never refreshed while the room is running. An event whose row cannot be read
  // still gets the five standard entries — the menu must not fail closed
  // mid-event over an optional column.
  useEffect(() => {
    let cancelled = false;
    if (!eventSlug) { setExtras([]); return; }
    eventsService.getEventBySlug(eventSlug)
      .then(ev => { if (!cancelled) setExtras(ev?.links ?? []); })
      .catch(() => { if (!cancelled) setExtras([]); });
    return () => { cancelled = true; };
  }, [eventSlug]);

  /**
   * AUTO-HIDE (2026-08-31, founder): a configured event link whose tag has NO
   * points and NO stories is dropped from the menu.
   *
   * Founder, verbatim: "I don't think we need to include the link to tonight or
   * whatever if ... we don't have points with tags that ... need to appear in a
   * given event." What he saw was a "Tonight" entry that opened an empty
   * surface — the event had the tag configured, but nothing had been staked
   * under it. A menu entry is a promise that there is something at the other
   * end; an empty one is a dead end that the operator has to remember to avoid
   * creating. This makes the menu enforce that instead of the operator.
   *
   * SCOPED TO THE `event` GROUP ONLY. cmp7/cmp3/cmp10 are the framework's
   * permanent surfaces and are not hidden when empty: a room where nobody has
   * staked yet would otherwise render a menu with only Transcribe and Start a
   * Session, which reads as broken rather than as empty.
   *
   * The emptiness test is the STAKE SURFACE'S OWN query, not a raw row count —
   * `getPublicPointsFeed` ends in a `totalPositions > 0` filter (P543), so a
   * tag with rows that the feed will not render still shows nothing. Counting
   * rows here would put the menu and the destination out of step: the entry
   * would survive and still open an empty page, which is the exact defect.
   */
  useEffect(() => {
    let cancelled = false;
    const tags = Array.from(new Set(
      (extras ?? [])
        .map(e => (e && typeof e === 'object' ? e.tag : null))
        .filter((t): t is string => isSafeTag(t))
    ));
    if (!eventSlug || tags.length === 0) { setLiveTags(new Set()); return; }
    setLiveTags(null);
    Promise.all(tags.map(async tag => {
      try {
        const [points, stories] = await Promise.all([
          pointsService.getPublicPointsFeed(1, 0, tag, undefined, true),
          storiesService.getPublicStoriesFeed(1, 0, tag, true),
        ]);
        return (points?.length ?? 0) + (stories?.length ?? 0) > 0 ? tag : null;
      } catch {
        // A probe that FAILS must not delete the entry. An outage would
        // otherwise silently empty the "This event" group mid-room, which is
        // indistinguishable to the attendee from the host never having set it.
        return tag;
      }
    })).then(resolved => {
      if (!cancelled) setLiveTags(new Set(resolved.filter((t): t is string => t !== null)));
    });
    return () => { cancelled = true; };
  }, [eventSlug, extras]);

  // Close on navigation — the attendee taps an entry and the menu must not
  // still be covering the destination when they arrive.
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);

  const visibleExtras = useMemo(
    () => (liveTags === null ? [] : (extras ?? []).filter(e => e && isSafeTag(e.tag) && liveTags.has(e.tag))),
    [extras, liveTags]
  );

  const entries = useMemo(
    () => buildLinksMenu(visibleExtras, eventSlug),
    [visibleExtras, eventSlug]
  );

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
      navigate(entry.to);
    },
  }), [open, eventSlug, entries, navigate]);

  if (!eventSlug) return <>{children}</>;

  return (
    <EventLinksContext.Provider value={ctxValue}>
      {children}
      <Drawer open={open} onOpenChange={setOpen} forceSheet>
        <DrawerContent data-testid="event-links-menu" data-shape="sheet" className="px-4 pb-6">
          <DrawerTitle className="px-0 pt-4 pb-2 text-base font-semibold">Links</DrawerTitle>
          <DrawerDescription className="sr-only">
            Destinations for this event. The list does not change during the event.
          </DrawerDescription>
          <nav className="flex flex-col gap-2" aria-label="Event links">
            {entries.map((entry, i) => {
              const prev = entries[i - 1];
              // The approved reference's separator falls before Transcribe —
              // i.e. at the stake→tools group change, drawn from the grouping
              // rather than from a row in the data.
              const separator = prev && prev.group !== entry.group && entry.group === 'tools';
              const heading = entry.group === 'event' && (!prev || prev.group !== 'event');
              return (
                <div key={`${entry.group}-${entry.label}-${i}`}>
                  {separator && <hr className="my-2 border-border" data-testid="event-links-separator" />}
                  {heading && (
                    <p className="pt-2 pb-1 text-xs uppercase tracking-wide text-muted-foreground">
                      This event
                    </p>
                  )}
                  <button
                    type="button"
                    data-testid="event-links-entry"
                    onClick={() => ctxValue.go(entry)}
                    className={cn(ANSWER_BUTTON_CLASS, 'w-full rounded-md px-4 text-left')}
                  >
                    {entry.label}
                  </button>
                </div>
              );
            })}
          </nav>
        </DrawerContent>
      </Drawer>
    </EventLinksContext.Provider>
  );
}
