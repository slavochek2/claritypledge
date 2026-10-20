/**
 * @file me-sheet.tsx
 * @description P1512: the phone's "You" sheet, opened from the bottom bar's last tab. It carries
 * what the phone bar has no room for: My Profile (a normal first row, the same person icon as the sidebar), Partners (with its
 * pending-invite badge), Tools (the same Links menu), and then the avatar menu's own items (Events,
 * Settings, Log Out, ...) via NavigationMenuItems minus what the bar's tabs already link to (Feed,
 * Groups) and the public-site sections (Use cases, Learn, Pledgers), which one "ClarityPledge website" row
 * stands for, so nothing the bar offers is repeated.
 */
import { useContext, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HistoryIcon, LayoutGridIcon, LogOutIcon, SettingsIcon, XIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { EventLinksButton } from '@/app/components/layout/event-links-menu';
import { EventLinksContext } from '@/app/components/layout/event-links-context';
import { NavigationMenuItems } from '@/app/components/layout/navigation-menu-items';
import { cn } from '@/lib/utils';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import { PHONE_TAB_IDS, shellMenuOmissions, useShellEntries, useShellSignOut } from './shell-nav';

/** Every row in the sheet: one left edge (px-2), one icon size (h-5), 44px tall. */
const SHEET_ROW =
  'flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-base font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const SHEET_ACTIVE = 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200';

/** My Profile: a normal row (the same person icon as the desktop sidebar). Inert while the profile (slug) loads. */
function ProfileRow({
  entry,
  onNavigate,
}: {
  entry: { to: string | null; active: boolean; label: string; Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }> };
  onNavigate: () => void;
}) {
  const { Icon } = entry;
  const body = (
    <>
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
    </>
  );
  if (entry.to === null) {
    return (
      <div aria-hidden="true" className={cn(SHEET_ROW, 'pointer-events-none')}>
        {body}
      </div>
    );
  }
  return (
    <Link
      to={entry.to}
      onClick={onNavigate}
      aria-current={entry.active ? 'page' : undefined}
      className={cn(SHEET_ROW, entry.active && SHEET_ACTIVE)}
    >
      {body}
    </Link>
  );
}

const TOOLS_APPEARANCE = {
  className: cn(SHEET_ROW, 'text-left'),
  content: (
    <>
      <LayoutGridIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>Tools</span>
    </>
  ),
};

/**
 * A modal dialog (the shared Radix Dialog): role="dialog", aria-modal, labelled "Menu", focus is
 * trapped inside and returns to the Me tab on close, Escape closes it. Drawn as a bottom sheet.
 */
export function MeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { pathname } = useLocation();
  const entries = useShellEntries();
  const { user } = useNavAuthState();
  const handleSignOut = useShellSignOut();
  const links = useContext(EventLinksContext);
  const toolsOpen = !!links?.open;
  // Radix returns focus only to a DialogTrigger, and the Me tab is not one: remember what had focus when
  // the sheet opened and give it back when it closes.
  const opener = useRef<HTMLElement | null>(null);

  // Arriving somewhere, or handing over to the Tools sheet, must not leave this one on top.
  useEffect(() => { onOpenChange(false); }, [pathname, onOpenChange]);
  useEffect(() => { if (toolsOpen) onOpenChange(false); }, [toolsOpen, onOpenChange]);

  const close = () => onOpenChange(false);
  // My Profile is the first row; Partners follows it.
  const profile = entries.find(e => e.id === 'profile');
  const partners = entries.find(e => e.id === 'partners');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        aria-modal="true"
        data-testid="me-sheet"
        onOpenAutoFocus={() => {
          opener.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          // What had focus when it opened; if that was nothing (the page body), the Me tab itself.
          const back = opener.current;
          const target =
            back && back !== document.body && back.isConnected ? back : document.querySelector<HTMLElement>('[data-testid="bottom-nav-me"]');
          target?.focus();
        }}
        className={cn(
          'shell-me-sheet fixed inset-x-0 bottom-0 left-0 top-auto flex w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-b-none rounded-t-[10px] border-x-0 border-b-0 p-0 pb-[env(safe-area-inset-bottom)] sm:rounded-t-[10px]',
          // The dialog primitive's centred zoom / slide animation is replaced (!) by a plain slide up: a
          // leftover scale would also shrink every row for the 200ms it runs.
          'data-[state=open]:!zoom-in-100 data-[state=open]:!slide-in-from-left-0 data-[state=open]:!slide-in-from-top-0 data-[state=open]:slide-in-from-bottom-10',
          'data-[state=closed]:!zoom-out-100 data-[state=closed]:!slide-out-to-left-0 data-[state=closed]:!slide-out-to-top-0 data-[state=closed]:slide-out-to-bottom-10',
        )}
      >
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <DialogTitle className="text-base font-semibold">Menu</DialogTitle>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <DialogDescription className="sr-only">Your profile, partners, tools and account.</DialogDescription>
        <nav aria-label="Account" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-6 pt-2">
          {user && profile && <ProfileRow entry={profile} onNavigate={close} />}
          {partners && partners.to !== null && (
            <Link
              to={partners.to}
              onClick={close}
              aria-current={partners.active ? 'page' : undefined}
              aria-label={partners.badge > 0 ? `${partners.label}, ${partners.badge} ${partners.badgeNoun}` : undefined}
              className={cn(SHEET_ROW, partners.active && SHEET_ACTIVE)}
            >
              <partners.Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{partners.label}</span>
              {partners.badge > 0 && (
                <span
                  data-badge
                  className="min-w-5 rounded-full bg-blue-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white"
                >
                  {partners.badge > 99 ? '99+' : partners.badge}
                </span>
              )}
            </Link>
          )}
          <EventLinksButton variant="sheet" appearance={TOOLS_APPEARANCE} />
          {/* What the bottom bar lacks (Events), as plain rows with no group heading, then the website row;
              the account block follows, so "ClarityPledge website" sits directly above it, as on desktop. */}
          <NavigationMenuItems
            variant="sheet"
            flat
            omitAccountGroup
            omitDestinations={shellMenuOmissions(entries, PHONE_TAB_IDS)}
            websiteLink
            onSignOut={handleSignOut}
            onItemClick={close}
          />
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
        </nav>
      </DialogContent>
    </Dialog>
  );
}
