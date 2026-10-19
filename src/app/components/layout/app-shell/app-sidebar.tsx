/**
 * @file app-sidebar.tsx
 * @description P1512: the signed-in desktop sidebar (lg and up). It replaces the top nav for a
 * signed-in person, so a page shows exactly one navigation.
 *
 * Expanded (248px): logo and collapse control; Today's event when there is one; Home, Feed,
 * Groups, Letters, Events, Partners, Tools, My Profile; the avatar menu at the bottom.
 * Collapsed (64px): ONLY the logo, which turns into the expand icon on hover or keyboard focus
 * (founder decision 5). Nothing else is rendered while collapsed, so nothing hidden stays tabbable.
 *
 * Tools opens the same Links menu the top nav opens (EventLinksButton); the avatar opens the same
 * menu items the top nav's avatar opened (NavigationMenuItems). Entries are the shared model in
 * shell-nav.ts, which the phone bottom bar reads too.
 */
import { Link } from 'react-router-dom';
import { CalendarCheckIcon, ChevronsUpDownIcon, LayoutGridIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import { ClarityLogo } from '@/components/ui/clarity-logo';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EventLinksButton } from '@/app/components/layout/event-links-menu';
import { NavigationMenuItems } from '@/app/components/layout/navigation-menu-items';
import { analytics } from '@/lib/mixpanel';
import { cn } from '@/lib/utils';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import {
  HOME_PATH,
  useShellEntries,
  useShellSignOut,
  useShellTodaysEvent,
  type ShellEntry,
} from './shell-nav';

const ROW_BASE =
  'relative flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const ROW_IDLE = 'text-muted-foreground hover:bg-accent hover:text-foreground';
const ROW_ACTIVE = 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200';

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
          className={cn(ROW_BASE, 'pointer-events-none animate-pulse select-none opacity-50', ROW_IDLE)}
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
        onClick={entry.id === 'groups' ? () => analytics.track('org_events_nav_clicked', { source: 'sidebar' }) : undefined}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        <Badge count={entry.badge} />
      </Link>
    </li>
  );
}

/** Tools wears the sidebar-row skin; the menu behind it is the top nav's own Links menu. */
const TOOLS_APPEARANCE = {
  className: cn(ROW_BASE, ROW_IDLE, 'text-left'),
  content: (
    <>
      <LayoutGridIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">Tools</span>
    </>
  ),
  side: 'right' as const,
  align: 'start' as const,
};

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const entries = useShellEntries();
  const todays = useShellTodaysEvent();
  const { user, hasPledged, isProfilePending } = useNavAuthState();
  const handleSignOut = useShellSignOut();

  const shellClass =
    'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-muted/40 p-2 lg:flex';

  if (collapsed) {
    return (
      <nav
        aria-label="Main"
        data-nav="sidebar"
        data-collapsed="true"
        className={cn(shellClass, 'w-16 items-center')}
      >
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
            data-testid="tonights-event-cta"
            className="mb-2 flex min-h-10 items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
            onClick={() =>
              analytics.track('nav_cta_clicked', { cta: 'tonights_event', device: 'desktop', registered: !!todays.event.registered })
            }
          >
            <CalendarCheckIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Today's event</span>
          </Link>
        )}
        <ul aria-label="Menu" className="space-y-0.5">
          {entries
            .filter(e => e.id !== 'profile')
            .map(entry => (
              <SidebarRow key={entry.id} entry={entry} />
            ))}
          <li>
            <EventLinksButton variant="dropdown" appearance={TOOLS_APPEARANCE} />
          </li>
          {entries
            .filter(e => e.id === 'profile')
            .map(entry => (
              <SidebarRow key={entry.id} entry={entry} />
            ))}
        </ul>
      </div>

      <div className="mt-2 border-t border-border pt-2">
        {isProfilePending || !user ? (
          <div aria-hidden="true" data-nav-slot-placeholder="avatar" className="flex min-h-12 items-center gap-3 px-1.5">
            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          </div>
        ) : (
          <DropdownMenu
            modal={false}
            onOpenChange={open => {
              if (open) analytics.track('nav_menu_opened', { trigger: 'avatar', device: 'desktop' });
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Menu"
                className="flex min-h-12 w-full items-center gap-3 rounded-lg px-1.5 text-left text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <GravatarAvatar
                  name={user.name}
                  avatarColor={user.avatarColor}
                  photoUrl={user.avatarUrl}
                  size="sm"
                  isPledger={hasPledged}
                />
                <span className="min-w-0 flex-1 truncate">{user.name}</span>
                <ChevronsUpDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-64">
              <NavigationMenuItems onSignOut={handleSignOut} />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  );
}
