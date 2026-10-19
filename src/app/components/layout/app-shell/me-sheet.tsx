/**
 * @file me-sheet.tsx
 * @description P1512: the phone's "Me" sheet, opened from the bottom bar's last tab. It carries
 * what the phone bar has no room for: My Profile, Partners (with its pending-invite badge), Tools
 * (the same Links menu), and then the avatar menu's own items (Events, Settings, Log Out, ...) via
 * NavigationMenuItems, so nothing the old avatar menu offered is lost.
 */
import { useContext, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HistoryIcon, LayoutGridIcon, LogOutIcon, SettingsIcon } from 'lucide-react';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { EventLinksButton } from '@/app/components/layout/event-links-menu';
import { EventLinksContext } from '@/app/components/layout/event-links-context';
import { NavigationMenuItems } from '@/app/components/layout/navigation-menu-items';
import { cn } from '@/lib/utils';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import { useShellEntries, useShellSignOut } from './shell-nav';

const SHEET_ROW =
  'flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-base font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const TOOLS_APPEARANCE = {
  className: cn(SHEET_ROW, 'text-left'),
  content: (
    <>
      <LayoutGridIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>Tools</span>
    </>
  ),
};

export function MeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { pathname } = useLocation();
  const entries = useShellEntries();
  const { user, hasPledged } = useNavAuthState();
  const handleSignOut = useShellSignOut();
  const links = useContext(EventLinksContext);
  const toolsOpen = !!links?.open;

  // Arriving somewhere, or handing over to the Tools sheet, must not leave this one on top.
  useEffect(() => { onOpenChange(false); }, [pathname, onOpenChange]);
  useEffect(() => { if (toolsOpen) onOpenChange(false); }, [toolsOpen, onOpenChange]);

  const close = () => onOpenChange(false);
  // My Profile first, then Partners.
  const personal = ['profile', 'partners']
    .map(id => entries.find(e => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} forceSheet>
      <DrawerContent data-testid="me-sheet" className="shell-me-sheet px-4 pb-6">
        <DrawerTitle className="sr-only">Menu</DrawerTitle>
        <DrawerDescription className="sr-only">Your profile, partners, tools and account.</DrawerDescription>
        <nav aria-label="Account" className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain">
          {user && (
            <div className="flex items-center gap-3 px-2 py-2">
              <GravatarAvatar
                name={user.name}
                avatarColor={user.avatarColor}
                photoUrl={user.avatarUrl}
                size="sm"
                isPledger={hasPledged}
              />
              <span className="min-w-0 flex-1 truncate text-base font-semibold">{user.name}</span>
            </div>
          )}
          {personal.map(entry =>
            entry.to === null ? null : (
              <Link
                key={entry.id}
                to={entry.to}
                onClick={close}
                aria-current={entry.active ? 'page' : undefined}
                aria-label={entry.badge > 0 ? `${entry.label}, ${entry.badge} ${entry.badgeNoun}` : undefined}
                className={cn(SHEET_ROW, entry.active && 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200')}
              >
                <entry.Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {entry.badge > 0 && (
                  <span
                    data-badge
                    className="min-w-5 rounded-full bg-blue-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white"
                  >
                    {entry.badge > 99 ? '99+' : entry.badge}
                  </span>
                )}
              </Link>
            ),
          )}
          <EventLinksButton variant="sheet" appearance={TOOLS_APPEARANCE} />
          {/* The account block sits right under the person's own entries; the public sections follow. */}
          <div className="mt-1 flex flex-col border-t border-border pt-1">
            <Link to="/sessions" onClick={close} className={SHEET_ROW}>
              <HistoryIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              Session History
            </Link>
            <Link to="/settings" onClick={close} className={SHEET_ROW}>
              <SettingsIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              Settings
            </Link>
            <button
              type="button"
              onClick={() => { close(); void handleSignOut(); }}
              className={cn(SHEET_ROW, 'text-left')}
            >
              <LogOutIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              Log Out
            </button>
          </div>
          <div className="mt-1 flex flex-col border-t border-border pt-1">
            <NavigationMenuItems variant="mobile" omitAccountGroup onSignOut={handleSignOut} onItemClick={close} />
          </div>
        </nav>
      </DrawerContent>
    </Drawer>
  );
}
