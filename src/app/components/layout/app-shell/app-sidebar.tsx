/**
 * @file app-sidebar.tsx
 * @description P1512: the signed-in desktop sidebar (lg and up). It replaces the top nav for a
 * signed-in person, so a page shows exactly one navigation.
 *
 * Expanded (248px): logo and collapse control; Today's event when there is one; Home, Chats,
 * Events, Artifacts, My Profile (SIDEBAR_ENTRY_IDS, 3c X1); at the bottom, the avatar menu with a small Tools
 * icon button beside it. Partners and Groups are in that menu: the avatar carries the pending-invitation count and is
 * the active control on their pages.
 * Collapsed (64px): the logo, which turns into the expand icon on hover or keyboard focus
 * (founder decision 5), every nav destination as an icon with a tooltip (P1539), and Tools plus the
 * avatar at the bottom. Hidden labels are aria-labels, so nothing hidden stays tabbable.
 *
 * Tools (a grid icon, tooltip "Tools") opens the same Links menu the top nav opens (EventLinksButton); the avatar opens the top nav's
 * menu items (NavigationMenuItems) minus whatever the sidebar itself lists. Entries are the shared model
 * in shell-nav.ts, which the phone bottom bar reads too.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { preloadRouteChunk } from '@/app/routes/route-preload';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CalendarCheckIcon, ChevronsUpDownIcon, LayoutGridIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import { ClarityLogo } from '@/components/ui/clarity-logo';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EventLinksButton } from '@/app/components/layout/event-links-menu';
import { NavigationMenuItems } from '@/app/components/layout/navigation-menu-items';
import { analytics } from '@/lib/mixpanel';
import { cn } from '@/lib/utils';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import {
  HOME_PATH,
  SIDEBAR_ENTRY_IDS,
  useShellEntries,
  shellMenuOmissions,
  useShellSignOut,
  useShellTodaysEvent,
  type ShellEntry,
} from './shell-nav';

const ROW_BASE =
  'relative flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const ROW_IDLE = 'text-muted-foreground hover:bg-accent hover:text-foreground';
const ROW_ACTIVE = 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200';

/** The sidebar's entries in the sidebar's own order (the shared list holds more, and in another order). */
function sidebarEntries(entries: readonly ShellEntry[]): ShellEntry[] {
  return SIDEBAR_ENTRY_IDS.map(id => entries.find(e => e.id === id)).filter((e): e is ShellEntry => !!e);
}

/** Partners, as a row of the avatar menu: it has no sidebar row any more. The badge is the pending-invitation count. */
function PartnersMenuItem({ entry }: { entry: ShellEntry }) {
  if (entry.to === null) return null;
  const { Icon } = entry;
  return (
    <DropdownMenuItem asChild>
      <Link
        to={entry.to}
        aria-current={entry.active ? 'page' : undefined}
        aria-label={entry.badge > 0 ? `${entry.label}, ${entry.badge} ${entry.badgeNoun}` : undefined}
        className={cn('cursor-pointer', entry.active && 'font-semibold text-foreground')}
      >
        <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        <Badge count={entry.badge} />
      </Link>
    </DropdownMenuItem>
  );
}

/** The count of pending partner invitations, drawn on the avatar's corner (its words are in the button's accessible name). */
function AvatarBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      data-badge
      aria-hidden="true"
      className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-background"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      data-badge
      className="ml-auto min-w-5 rounded-full bg-blue-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function SidebarRow({ entry }: { entry: ShellEntry }) {
  const { Icon } = entry;
  if (entry.to === null) {
    // Profile still loading: the slot holds its place so nothing moves when it lands.
    return (
      <li>
        <div
          aria-hidden="true"
          data-nav-slot-placeholder={entry.label}
          className={cn(ROW_BASE, 'pointer-events-none select-none', ROW_IDLE)}
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        </div>
      </li>
    );
  }
  return (
    <li>
      <Link
        to={entry.to}
        aria-current={entry.active ? 'page' : undefined}
        aria-label={entry.badge > 0 ? `${entry.label}, ${entry.badge} ${entry.badgeNoun}` : undefined}
        className={cn(ROW_BASE, entry.active ? ROW_ACTIVE : ROW_IDLE)}
        onMouseEnter={() => preloadRouteChunk(entry.id)}
        onFocus={() => preloadRouteChunk(entry.id)}
        onClick={entry.id === 'groups' ? () => analytics.track('org_events_nav_clicked', { source: 'sidebar' }) : undefined}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        <Badge count={entry.badge} />
      </Link>
    </li>
  );
}

/** Collapsed rail: the same destination as the expanded row, icon only, name on hover/focus and as aria-label. */
function RailItem({ entry }: { entry: ShellEntry }) {
  const { Icon } = entry;
  const label = entry.badge > 0 ? `${entry.label}, ${entry.badge} ${entry.badgeNoun}` : entry.label;
  const box = 'relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  if (entry.to === null) {
    return (
      <li>
        <div aria-hidden="true" data-nav-slot-placeholder={entry.label} className={cn(box, 'pointer-events-none select-none', ROW_IDLE)}>
          <Icon className="h-5 w-5" />
        </div>
      </li>
    );
  }
  return (
    <li>
      <RailTip label={label}>
          <Link
            to={entry.to}
            aria-label={label}
            aria-current={entry.active ? 'page' : undefined}
            className={cn(box, entry.active ? ROW_ACTIVE : ROW_IDLE)}
            onMouseEnter={() => preloadRouteChunk(entry.id)}
            onFocus={() => preloadRouteChunk(entry.id)}
            onClick={entry.id === 'groups' ? () => analytics.track('org_events_nav_clicked', { source: 'sidebar' }) : undefined}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {entry.badge > 0 && <span data-badge className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />}
          </Link>
      </RailTip>
    </li>
  );
}

/** One tooltip for one rail control. Every tooltip shares the rail's single TooltipProvider. */
function RailTip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Founder, solo test 2026-11-02: Today's event stays on the collapsed rail, as an icon; its name is for screen readers and the tooltip. */
export function RailTodaysEvent({ todays }: { todays: NonNullable<ReturnType<typeof useShellTodaysEvent>> }) {
  return (
    <li>
      <RailTip label="Today's event">
        <Link
          to={todays.href}
          title={todays.event.title}
          aria-label="Today's event"
          aria-current={todays.current ? 'page' : undefined}
          data-testid="tonights-event-cta-rail"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-200 text-blue-700 transition-colors hover:bg-blue-50 aria-[current=page]:border-blue-500 aria-[current=page]:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-950"
          onClick={() =>
            analytics.track('nav_cta_clicked', { cta: 'tonights_event', device: 'desktop', registered: !!todays.event.registered })
          }
        >
          <CalendarCheckIcon className="h-5 w-5" aria-hidden="true" />
        </Link>
      </RailTip>
    </li>
  );
}

/**
 * The rail's destination list scrolls on its own when the window is short. A hairline appears on the
 * edge that has more behind it, so the cut-off row reads as scrollable rather than missing.
 */
function useScrollEdges() {
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop > 1;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges(prev => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);
  return { ref, edges, onScroll: measure };
}

/** Tools is a 40px grid icon at the bottom of the sidebar; the menu behind it is the top nav's own Links menu. */
const TOOLS_APPEARANCE = {
  // data-state=open: while its popover is open the button shows it, like a selected entry.
  className:
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground',
  // Icon only: the sr-only text is its accessible name, and EventLinksButton sets title="Tools" for the tooltip.
  content: (
    <>
      <LayoutGridIcon className="h-5 w-5" aria-hidden="true" />
      <span className="sr-only">Tools</span>
    </>
  ),
  side: 'right' as const,
  align: 'end' as const,
};

/** Collapsed rail: the same button, with a real tooltip (a native title is slow and often never shows). */
const TOOLS_APPEARANCE_RAIL = { ...TOOLS_APPEARANCE, tooltip: 'Tools' };

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** P1539: the offline strip spans the full width above the sidebar, so the sidebar starts below it. */
  belowStrip?: boolean;
}

export function AppSidebar({ collapsed, onToggle, belowStrip = false }: AppSidebarProps) {
  const entries = useShellEntries();
  // P1542: kept on the event's own pages, where it is the one active row (Events stands down in shell-nav).
  const todays = useShellTodaysEvent({ keepOnOwnPage: true });
  // VQA round 4: one lit row. This instance's own answer decides it, so Events cannot stay lit while a second
  // read of today's event (shell-nav) is still settling; the CTA itself is filled only when current.
  const shownEntries = todays?.current ? entries.map(e => (e.id === 'events' ? { ...e, active: false } : e)) : entries;
  const { user, hasPledged, isProfilePending } = useNavAuthState();
  const handleSignOut = useShellSignOut();
  const scroll = useScrollEdges();
  const partners = entries.find(e => e.id === 'partners');
  // Pages no sidebar entry owns (Groups, Partners) light the avatar, which is where they now live.
  const avatarActive = entries.some(e => !SIDEBAR_ENTRY_IDS.includes(e.id) && e.active);
  const partnerCount = partners?.badge ?? 0;
  const avatarName = partnerCount > 0 && partners ? `Menu, ${partnerCount} ${partners.badgeNoun}` : 'Menu';

  const shellClass = cn(
    'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-muted/40 p-2 lg:flex',
    belowStrip && 'lg:top-7',
  );

  const avatarMenu = (compact: boolean) => {
    if (isProfilePending || !user) {
      return (
        <div aria-hidden="true" data-nav-slot-placeholder="avatar" className={cn('flex items-center gap-3', compact ? 'h-10 w-10 justify-center' : 'min-h-12 px-1.5')}>
          <div className="h-10 w-10 rounded-full bg-muted" />
        </div>
      );
    }
    // Collapsed rail: the avatar gets the same tooltip as the other rail controls (its name); expanded shows the name itself.
    const tip = (trigger: ReactElement) => (compact ? <RailTip label={user.name}>{trigger}</RailTip> : trigger);
    return (
      <DropdownMenu
        modal={false}
        onOpenChange={open => {
          if (open) analytics.track('nav_menu_opened', { trigger: 'avatar', device: 'desktop' });
        }}
      >
        {tip(<DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={avatarName}
            aria-current={avatarActive ? 'page' : undefined}
            data-testid={compact ? 'rail-avatar' : undefined}
            className={cn(
              'flex items-center text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              avatarActive ? ROW_ACTIVE : 'hover:bg-accent',
              compact ? 'h-10 w-10 justify-center rounded-full' : 'min-h-12 w-full gap-3 rounded-lg px-1.5',
            )}
          >
            <span className="relative flex shrink-0">
              <GravatarAvatar
                name={user.name}
                avatarColor={user.avatarColor}
                photoUrl={user.avatarUrl}
                size="sm"
                isPledger={hasPledged}
              />
              <AvatarBadge count={partnerCount} />
            </span>
            {!compact && (
              <>
                <span className="min-w-0 flex-1 truncate">{user.name}</span>
                <ChevronsUpDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>)}
        <DropdownMenuContent
          side={compact ? 'right' : 'top'}
          align={compact ? 'end' : 'start'}
          sideOffset={8}
          // The popover is at least as wide as the sidebar's content (the account row shares its row with the Tools icon, so the trigger alone is narrower and wrapped "ClarityPledge website"), and scrolls inside the room it has.
          className={cn(
            'max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto min-w-[14.5rem]',
            !compact && 'w-[var(--radix-dropdown-menu-trigger-width)]',
          )}
        >
          {/* Partners and Groups live here (3c X1). The sidebar already lists Home, Chats, Events ...: the menu does not repeat them, nor the public-site sections (one website row stands for them). */}
          {partners && <PartnersMenuItem entry={partners} />}
          <NavigationMenuItems onSignOut={handleSignOut} omitDestinations={shellMenuOmissions(entries, SIDEBAR_ENTRY_IDS)} websiteLink flat />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (collapsed) {
    return (
      <nav
        aria-label="Main"
        data-nav="sidebar"
        data-collapsed="true"
        className={cn(shellClass, 'w-16 items-center')}
      >
        <TooltipProvider delayDuration={150} skipDelayDuration={600}>
        <RailTip label="Expand sidebar">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          aria-expanded={false}
          data-testid="sidebar-toggle"
          className="group flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* The logo is what shows; hover or keyboard focus swaps it for the expand icon. */}
          <ClarityLogo size="sm" iconOnly className="group-hover:hidden group-focus-visible:hidden" />
          <PanelLeftOpenIcon
            className="hidden h-5 w-5 text-muted-foreground group-hover:block group-focus-visible:block"
            aria-hidden="true"
          />
        </button>
        </RailTip>
        <ul
          ref={scroll.ref}
          onScroll={scroll.onScroll}
          aria-label="Menu"
          data-scroll-top={scroll.edges.top}
          data-scroll-bottom={scroll.edges.bottom}
          className={cn(
            'mt-2 flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto border-y border-transparent',
            scroll.edges.top && 'border-t-border',
            scroll.edges.bottom && 'border-b-border',
          )}
        >
          {todays && <RailTodaysEvent todays={todays} />}
          {sidebarEntries(shownEntries).map(entry => (
            <RailItem key={entry.id} entry={entry} />
          ))}
        </ul>
        <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
          <EventLinksButton variant="dropdown" appearance={TOOLS_APPEARANCE_RAIL} />
          {avatarMenu(true)}
        </div>
        </TooltipProvider>
      </nav>
    );
  }

  return (
    <nav aria-label="Main" data-nav="sidebar" className={cn(shellClass, 'w-[248px]')}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <Link
          to={HOME_PATH}
          aria-label="ClarityPledge"
          className="flex min-h-10 min-w-0 items-center rounded-lg px-1.5 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ClarityLogo size="sm" />
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse sidebar"
          aria-expanded={true}
          data-testid="sidebar-toggle"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PanelLeftCloseIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Scrolls on its own when the window is short, so the avatar menu below never leaves the screen. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {todays && (
          <Link
            to={todays.href}
            title={todays.event.title}
            aria-current={todays.current ? 'page' : undefined}
            data-testid="tonights-event-cta"
            className="mb-2 flex min-h-10 items-center gap-3 rounded-lg border border-blue-200 px-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 aria-[current=page]:border-blue-500 aria-[current=page]:bg-blue-100 aria-[current=page]:ring-1 aria-[current=page]:ring-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-950 dark:aria-[current=page]:bg-blue-950"
            onClick={() =>
              analytics.track('nav_cta_clicked', { cta: 'tonights_event', device: 'desktop', registered: !!todays.event.registered })
            }
          >
            <CalendarCheckIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Today's event</span>
          </Link>
        )}
        <ul aria-label="Menu" className="space-y-0.5">
          {sidebarEntries(shownEntries).map(entry => (
            <SidebarRow key={entry.id} entry={entry} />
          ))}
        </ul>
      </div>

      <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
        <div className="min-w-0 flex-1">
        {avatarMenu(false)}
        </div>
        <EventLinksButton variant="dropdown" appearance={TOOLS_APPEARANCE} />
      </div>
    </nav>
  );
}
