/**
 * @file shell-nav.ts
 * @description P1512: the signed-in shell's navigation model — the entries, their active rule and
 * the data behind their badges. ONE module read by the desktop sidebar and the phone bottom bar,
 * so the two can never list different destinations.
 *
 * A .ts file on purpose: components live in the sibling .tsx files, and mixing hooks and
 * constants into a component file breaks Fast Refresh (`react-refresh/only-export-components`).
 */
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDaysIcon,
  HomeIcon,
  LandmarkIcon,
  MessageSquareIcon,
  ShapesIcon,
  UserIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import { useUnreadSharedCount } from '@/app/hooks/useUnreadSharedCount';
import { useOpenLiveInvite } from '@/app/hooks/useOpenLiveInvite';
import { usePendingPartnerInvitationCount } from '@/app/hooks/usePendingPartnerInvitationCount';
import { useTonightsEvent, tonightsEventHref, type TonightsEvent } from '@/app/hooks/useTonightsEvent';
import { EVENTS_LIST_TO, EVENTS_NAV_TO, PRICING_PATHS, PUBLIC_NAV_GROUPS } from '@/app/components/layout/nav-links';
import { useChatUnreadCount } from '@/app/pages/chat/chat-state';

/** Where the signed-in home lives: the feed (P1545). `/` forwards here once the session has restored. */
export const HOME_PATH = '/feed';
/** The chat list and every conversation under it (P1545: was /home). */
export const CHATS_PATH = '/chats';
/** Letters and canvases (P1545: replaces /letters). */
export const ARTIFACTS_PATH = '/artifacts';

export type ShellEntryId = 'home' | 'chats' | 'groups' | 'artifacts' | 'events' | 'partners' | 'profile';

export interface ShellEntry {
  id: ShellEntryId;
  label: string;
  /** null while the profile (slug) is still loading: the slot is held but inert. */
  to: string | null;
  Icon: LucideIcon;
  active: boolean;
  /** Blue count pill, hidden at 0. */
  badge: number;
  /** aria-label suffix, e.g. "unread" gives "Letters, 3 unread". */
  badgeNoun: string;
}

/** True when `pathname` is under `prefix` (the route itself or a child), never a lookalike sibling. */
function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Active rule per entry. Pure, so it can be tested without rendering. */
export function isShellEntryActive(id: ShellEntryId, pathname: string, slug: string | null): boolean {
  switch (id) {
    case 'home':
      return pathname === HOME_PATH;
    case 'chats':
      // Chats owns the list and every conversation under it (/chats/c/...).
      return isUnder(pathname, CHATS_PATH);
    case 'groups':
      // Groups owns /groups and its subtree. Events has its own entry now, so the event routes no
      // longer light Groups (isEventsNavActive in nav-links still serves the top nav).
      return isUnder(pathname, EVENTS_NAV_TO);
    case 'artifacts':
      return isUnder(pathname, ARTIFACTS_PATH);
    case 'events':
      return isUnder(pathname, '/events');
    case 'partners':
      return !!slug && pathname === `/p/${slug}/partners`;
    case 'profile':
      // /p/:slug/partners belongs to the Partners entry; every other /p/ page is a profile.
      return (pathname.startsWith('/p/') && !pathname.endsWith('/partners')) || pathname === '/me';
  }
}

/**
 * The entries every shell surface lists, in order, with live badges. Partners and My Profile need
 * the profile's slug: while it loads (isProfilePending) they are inert slots with `to: null`; with
 * a settled profile that has no slug Partners is omitted rather than rendered as a broken link.
 *
 * Tools is NOT here: it is the Links menu component (EventLinksButton), not a route.
 */
export function useShellEntries(): ShellEntry[] {
  const { pathname } = useLocation();
  const { slug, isProfilePending } = useNavAuthState();
  // P1545: the Artifacts badge is unread "Shared with you" (letters sent to you + canvases shared with you).
  const { count: unreadShared } = useUnreadSharedCount();
  const { invite } = useOpenLiveInvite();
  const { count: partnerInviteCount } = usePendingPartnerInvitationCount();
  // P1512: unread chats ride on the Chats entry (0 outside the chat provider).
  const unreadChats = useChatUnreadCount();

  const make = (
    id: ShellEntryId,
    label: string,
    to: string | null,
    Icon: LucideIcon,
    badge = 0,
    badgeNoun = 'unread',
  ): ShellEntry => ({ id, label, to, Icon, active: to !== null && isShellEntryActive(id, pathname, slug), badge, badgeNoun });

  const entries: ShellEntry[] = [
    make('home', 'Home', HOME_PATH, HomeIcon),
    make('chats', 'Chats', CHATS_PATH, MessageSquareIcon, unreadChats, unreadChats === 1 ? 'unread chat' : 'unread chats'),
    make('groups', 'Groups', EVENTS_NAV_TO, LandmarkIcon),
    // The open live invite is a row at the top of Shared with you, so it counts there too.
    make('artifacts', 'Artifacts', ARTIFACTS_PATH, ShapesIcon, unreadShared + (invite ? 1 : 0)),
    make('events', 'Events', EVENTS_LIST_TO, CalendarDaysIcon),
  ];
  if (isProfilePending) {
    entries.push(make('partners', 'Partners', null, UsersIcon));
  } else if (slug) {
    entries.push(
      make(
        'partners',
        'Partners',
        `/p/${slug}/partners`,
        UsersIcon,
        partnerInviteCount,
        partnerInviteCount === 1 ? 'pending invitation' : 'pending invitations',
      ),
    );
  }
  entries.push(make('profile', 'My Profile', isProfilePending ? null : slug ? `/p/${slug}` : '/me', UserIcon));
  return entries;
}

/**
 * The phone bottom bar's tabs, in order. "Me" is the bar's own last tab, not an entry.
 * P1543: Events replaces Groups on the phone bar (founder, 2026-10-22). Groups stays one tap away in the
 * Me sheet, which lists whatever the bar lacks. P1545: Home is the feed, Chats its own tab, Artifacts replaces Letters.
 */
export const PHONE_TAB_IDS: readonly ShellEntryId[] = ['home', 'chats', 'events', 'artifacts'];

/**
 * The destinations a surface's own nav already links to. The menus behind it (the phone Me sheet, the
 * desktop avatar menu) leave these out instead of listing them a second time; deriving the set from
 * the entries means a menu can never drift from the nav it sits beside. `ids` narrows to a surface
 * that lists only some entries (the phone bar); omitted, every entry counts (the desktop sidebar).
 */
export function shellNavDestinations(entries: readonly ShellEntry[], ids?: readonly ShellEntryId[]): string[] {
  return entries.filter(e => e.to !== null && (!ids || ids.includes(e.id))).map(e => e.to as string);
}

/** The public-site groups a member reaches through the "ClarityPledge website" row, not through the shell's menus. */
const WEBSITE_GROUPS: readonly string[] = ['Use cases', 'Learn'];
/** ...and Pledgers, which the website's own menu lists. */
const WEBSITE_PATHS: readonly string[] = ['/pledgers'];

/**
 * What the shell's menus (the phone Me sheet, the desktop avatar menu) leave out of the public sections:
 * everything the surface's own nav lists, plus what lives on the public website (Use cases, Learn,
 * Pledgers), which one "ClarityPledge website" row now opens.
 */
export function shellMenuOmissions(entries: readonly ShellEntry[], ids?: readonly ShellEntryId[]): string[] {
  const website = PUBLIC_NAV_GROUPS.filter(g => WEBSITE_GROUPS.includes(g.label)).flatMap(g => g.items.map(i => i.to as string));
  return [...shellNavDestinations(entries, ids), ...website, ...WEBSITE_PATHS];
}

/**
 * Today's event for the shell: the same event the top nav's "Today's event" button showed, with
 * the same two exclusions — never on the page it points to (the page already is where the button
 * would go), and never on the paid-offer pages (P1351). Null when there is nothing to show.
 */
export function useShellTodaysEvent(): { event: TonightsEvent; href: string } | null {
  const event = useTonightsEvent();
  const { pathname } = useLocation();
  if (!event || PRICING_PATHS.includes(pathname)) return null;
  const href = tonightsEventHref(event);
  if (pathname === href) return null;
  return { event, href };
}

/**
 * Log out from a shell surface, then land on "/" (which sends a signed-out visitor to the feed).
 * A failed sign-out leaves the person where they are; the menu that called it closes either way.
 */
export function useShellSignOut(): () => Promise<void> {
  const { signOut } = useNavAuthState();
  const navigate = useNavigate();
  return async () => {
    try {
      await signOut();
      navigate('/');
    } catch {
      /* signed in still: stay on the page */
    }
  };
}
