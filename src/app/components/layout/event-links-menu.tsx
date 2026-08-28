/**
 * @file event-links-menu.tsx
 * @description P1179: the room's "Links" button and the bottom sheet it opens.
 *
 * PLACEMENT: a sibling of the avatar in the nav's right-hand group, at every
 * width. Decided 2026-08-28 after a prototype pass at literal widths. The nav
 * centre slot was built and rejected — it is centred on the VIEWPORT rather
 * than on the gap, so at 320px the control drifts under the avatar (the
 * documented /terms collision, simple-navigation.tsx:392-402), and the fix used
 * there (hide below 375px) is forbidden: the whole point is that the control is
 * in the same place on every phone in the room. "Centre on wide, right on
 * narrow" was rejected for the same reason and carries both placements' code.
 *
 * OPEN SHAPE: a bottom sheet, not a dropdown. It gets tapped repeatedly by
 * standing people holding a phone one-handed during a live event — the sheet
 * puts every entry in thumb reach; a top-anchored dropdown is a stretch on a
 * large phone. Accepted cost: it covers the page and needs a dismiss affordance.
 *
 * DESIGN SYSTEM: this control introduces no colour, radius or height of its own.
 * The button and the entries take ANSWER_BUTTON_CLASS — the room's existing
 * outlined-navy 44px treatment (meeting-terms-page.tsx:145, already shared with
 * /ready and /meet) — and the sheet is the existing ui/drawer primitive, which
 * is bottom-anchored in both its mobile and its desktop branch. Founder,
 * verbatim: "needs to follow our design please."
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { ANSWER_BUTTON_CLASS } from '@/app/pages/meeting-terms-page';
import { cn } from '@/lib/utils';
import { eventsService } from '@/app/data/events-service';
import { analytics } from '@/lib/mixpanel';
import { buildLinksMenu, eventSlugFromLocation, type LinksMenuEntry } from '@/app/data/event-links';
import type { EventLinkEntry } from '@/app/types';

/**
 * The button renders ONLY inside an event context. Scoping it here rather than
 * at the nav's call site is what keeps the ~30 other routes that render the
 * right-hand group geometrically unchanged (DW-1).
 */
/**
 * ONE instance of this provider owns the open state, the event fetch and the
 * sheet. The trigger below is mounted TWICE — once in each of the nav's two
 * right-hand groups (the `lg:hidden` mobile one and the desktop one), because
 * the nav renders both and hides one by breakpoint rather than unmounting it.
 *
 * Splitting them is not a style preference. Mounting the whole menu twice gave
 * two INDEPENDENT instances: two `open` states, two `getEventBySlug` calls per
 * room load, and two identical `data-testid`s in the DOM at once. Caught by
 * e2e/p1179-links-menu.spec.ts, which failed on a strict-mode locator violation
 * before it could measure anything (2026-08-28).
 */
const EventLinksContext = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
} | null>(null);

/** The trigger. Mount this wherever the avatar is; it renders null off-event. */
export function EventLinksButton() {
  const ctx = useContext(EventLinksContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      data-testid="event-links-button"
      onClick={() => ctx.setOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={ctx.open}
      className={cn(ANSWER_BUTTON_CLASS, 'inline-flex items-center rounded-md px-3 py-0')}
    >
      Links
    </button>
  );
}

export function EventLinksMenu({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [extras, setExtras] = useState<EventLinkEntry[]>([]);

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

  // Close the sheet on navigation — the attendee taps an entry and the sheet
  // must not still be covering the destination when they arrive.
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);

  const ctxValue = useMemo(() => ({
    open,
    setOpen: (v: boolean) => {
      setOpen(v);
      if (v) analytics.track('event_links_opened', { event: eventSlug });
    },
  }), [open, eventSlug]);

  if (!eventSlug) return <>{children}</>;

  const entries = buildLinksMenu(extras, eventSlug);

  const go = (entry: LinksMenuEntry) => {
    analytics.track('event_links_entry_clicked', { label: entry.label, group: entry.group, event: eventSlug });
    setOpen(false);
    navigate(entry.to);
  };

  return (
    <EventLinksContext.Provider value={ctxValue}>
      {children}
      <Drawer open={open} onOpenChange={setOpen} forceSheet>
        <DrawerContent data-testid="event-links-sheet" className="px-4 pb-6">
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
                    onClick={() => go(entry)}
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
