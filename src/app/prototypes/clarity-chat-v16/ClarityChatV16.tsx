/**
 * @file ClarityChatV16.tsx
 * @description P1509 v16 prototype at /tree/clarity-chat-v16. v16 reads the TEST project: the viewer is whoever is signed
 * in (a seeded Bob or Dana persona, real-data.ts), and Home, the Share picker, profiles, Letters, Groups, Events and
 * Partners render rows from the app's existing services. STILL MOCK, and labelled so in state.ts / mock-data.ts: chats,
 * channels, threads, unread, archive, the mirror and the live transcript. A position taken on a card, joining or leaving
 * a group stay local overlays (no position or membership write). `?real=loading|error|empty` forces every real surface
 * into that state.
 * v16 iteration (founder decisions 2026-10-17): desktop (>= 1024px) is the collapsible sidebar, a phone gets the bottom bar
 * and a profile sheet; Chats first; ONE partner verb (Invite partner -> Invite sent -> Partner) whose recipient must be a
 * seeded persona before any request is made; Transcribe in every chat header (says "Coming soon": see TranscribeButton);
 * Invite to Clarity Live only in a 1:1's menu; General is members only; a forwarded thread is one card; the mirror shows
 * its role and has Rename.
 * P1509 v15 prototype at /tree/clarity-chat-v15. Rule: WIRE, DON'T INVENT. Real production components
 * render wherever they take mock props (FeedPointCard, FeedStoryCard, OrgHeader, OrgCard, PersonRow, BannerDisplay,
 * CertificateFrame, AgreementCertificate, AgreementRow, LetterStatusBadge, EventCard, HomeSideRail, the shadcn Tabs);
 * where a component reads live data or auth, its structure is copied and the placeholder is labelled in code.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import {
  Archive, ArrowLeft, CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, ChevronRight, Forward, Handshake, HomeIcon, LandmarkIcon,
  Globe, LayoutGrid, Lock, LogOut, MailIcon, MapPin, MessageCircle, MessagesSquare, MessageSquareText, Mic, PanelLeftClose, PanelLeftOpen, Pencil, Play, Plus, Reply,
  MoreHorizontal, Search, Settings, Shield, Trash2, UserIcon, UsersIcon, Video, X, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { ClarityLogo } from '@/components/ui/clarity-logo';
import { CompactProfileCard } from '@/app/components/profile/compact-profile-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedSkeleton } from '@/app/components/feed/feed-skeleton';
import { LinksInNewTabContext } from '@/app/components/shared/links-in-new-tab';
import { HomeSideRail, HomeTopBlock } from '@/app/components/feed/home-side-rail';
import { OrgHeader } from '@/app/components/organizations/org-header';
import { OrgCard } from '@/app/pages/org-directory-page';
import { EventCard } from '@/app/prototypes/events/components/EventCard';
import { PersonRow as ProdPersonRow } from '@/app/components/shared/PersonRow';
import { BannerDisplay } from '@/app/components/shared/banner';
import { CertificateFrame, CertificateOathBody } from '@/app/components/agreements/certificate-frame';
import { AgreementCertificate } from '@/app/components/agreements/agreement-certificate';
import { AgreementRow } from '@/app/components/agreements/agreement-row';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { LetterStatusBadge } from '@/app/components/letters/letter-status-badge';
import { AUDIENCE_LINKS, EVENTS_LIST_TO, EVENTS_NAV_TO, PUBLIC_NAV_GROUPS } from '@/app/components/layout/nav-links';
import { buildLinksMenu, type LinksMenuEntry } from '@/app/data/event-links';
import { COA_VERSIONS, CURRENT_COA_VERSION } from '@/app/content/coa-versions';
import { formatLocalDateTime } from '@/app/utils/format-time';
import { CURRENT_AGREEMENT_VERSION } from '@/app/content/agreement-versions';
import { TERMS_PLACEHOLDER } from '@/app/pages/create-agreement-page';
import type { AgreementVisibility, ClarityAgreement } from '@/app/data/agreements-service.interface';
import type { Organization, OrgMember } from '@/app/data/organizations-service.interface';
import type { EventAttendee, LetterDelivery, PointSummary, PointWithUserPosition, PositionType, Profile as ProfileData, StoryWithAuthor } from '@/app/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Avatar, clock, Composer, Divider, HIT, Message, MirrorAvatar, MsgText, OutlineButton, PrimaryButton, QuietButton, QuoteBar, RealBoundary, RealEmpty, RealError, RealSkeleton, SidePanel, Tip, ToolButton, Toolbar, TOOL_ICON, useDismiss } from './kit';
import {
  COPY, EVENTS, GROUPS, MOBILE_TABS, PEOPLE, PLACE_LABEL, PLACES, SIDEBAR_KEY,
  type LetterBox, type MobileTab, type PersonId, type Place, type Shareable, type ViewerId,
} from './mock-data';
import {
  acceptInvite, archive, archivedChats, archivedUnreadCount, canMessage, canSee, chatById, chatTitle, chatsInTab, claimMirror, clarify, defaultMirrorName,
  comment, deleteMsg, dmWith, editMsg, eventDay, eventOf, eventWhen, filterShareables, forward, groupActivity, groupOf, groupSections, initialState, invitePartner,
  isArchived, isGoing, isMember, joinGroup, lastMsg, leaveGroup, liveLinesLeft, markUnread, mirrorChatId, mirrorLabel, msgsOf, nextLiveLine, openChat, otherOf,
  partnerState, positionOf, renameMirror, repliesOf, retry, search, send, sendVoice, setPosition, sharedWith, summary, tabsFor, toggleRsvp, totalUnread, unarchive, unreadOf,
  visibleChats, type Chat, type Msg, type State, type Tab,
} from './state';
import {
  CHAT_EVENT_REF, cancelRsvp, chatEventOf, chatGroupOf, loadDeliveries, loadChatEventAttendees, loadEventDetail, loadEventsList, loadFeed, loadGroupDetail, loadGroupMembers, loadGroupsDirectory, loadLetters, loadMyShareables, loadPartners, loadProfile,
  loadMyEvents, loadSharedWith, onTestProject, partnerStatesFrom, rsvp, sendPartnerInvite, signInAsPersona, useIsAdmin, useRealOverride, useRealQuery, viewerOf,
  type EventDetail, type EventsList, type FeedData, type MyEvent, type GroupDetail, type GroupsDirectory, type LetterRowData, type PartnersData, type Query,
} from './real-data';
import { isSeededPersonaEmail, PERSONA_IDS, personaEmail, personaFromSlug, personaSlug } from './personas';
import { supabase } from '@/lib/supabase';

const HOVER = '[@media(hover:hover)]:hover:bg-gray-100';
const MENU_ITEM = cn('flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-gray-900', HOVER);
const MENU_HEAD = 'px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500';
/** Production's org-page ORG_TAB_CLASS (not exported). */
const ORG_TAB_CLASS = 'min-h-11 rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 text-base data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none';
/** Production's letters-page trigger class. */
const LETTER_TAB_CLASS = 'min-h-11 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none px-4 py-3';

const PLACE_ICON: Record<Place | MobileTab | 'tools', LucideIcon> = { home: HomeIcon, chats: MessagesSquare, letters: MailIcon, tools: LayoutGrid, groups: LandmarkIcon, events: CalendarDays, me: UserIcon };

/** Desktop is >= 1024px (Tailwind lg): the sidebar. Below it: the bottom bar and the profile sheet. The same query production's home rail uses. */
const DESKTOP_QUERY = '(min-width: 1024px)';
function useIsDesktop(): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(DESKTOP_QUERY).matches === true);
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP_QUERY);
    if (!mq) return;
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener('change', change);
    return () => mq.removeEventListener('change', change);
  }, []);
  return on;
}

/** The pending sign-out of a persona after the page unmounted; a remount in the same tick cancels it. */
let leaveTimer: ReturnType<typeof setTimeout> | null = null;
/** The persona sign-in that is in flight, if any. Leaving the page (or pagehide) aborts it so a late answer can never apply a session. */
let pendingSignIn: AbortController | null = null;
const abortPendingSignIn = () => { pendingSignIn?.abort(); pendingSignIn = null; };

/* ---------- URL state + history-based back ---------- */

type Loc = { view?: string; chat?: string; thread?: string; members?: string; group?: string; person?: string; with?: string; tab?: string; event?: string };
const LOC_KEYS: (keyof Loc)[] = ['view', 'chat', 'thread', 'members', 'group', 'person', 'with', 'tab', 'event'];

/**
 * Push a screen, or go back. Back is history: `navigate(-1)` when this tab has an in-app entry to return to,
 * else (a deep link) a replace to `fallback`. The in-app stack is tracked from the router's own location keys, so
 * the browser's Back and the on-screen arrows agree.
 */
function useNav() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navType = useNavigationType();
  const stack = useRef<string[]>([]);
  useEffect(() => {
    const s = stack.current;
    const k = location.key;
    if (navType === 'PUSH') s.push(k);
    else if (navType === 'REPLACE') { if (s.length) s[s.length - 1] = k; else s.push(k); }
    else {
      const i = s.lastIndexOf(k);
      stack.current = i >= 0 ? s.slice(0, i + 1) : [k];
    }
  }, [location.key, navType]);
  const loc: Loc = Object.fromEntries(LOC_KEYS.map((k) => [k, params.get(k) ?? undefined]).filter(([, v]) => v)) as Loc;
  const go = (next: Loc, replace = false) => {
    const p = new URLSearchParams();
    /* The prototype's own switches survive every navigation: ?state= (mock chat modes) and ?real= (forced real-data state). */
    for (const k of ['state', 'real']) { const v = params.get(k); if (v) p.set(k, v); }
    for (const k of LOC_KEYS) { const v = next[k]; if (v) p.set(k, v); }
    navigate({ pathname: location.pathname, search: `?${p.toString()}` }, { replace });
  };
  const back = (fallback: Loc) => {
    if (stack.current.length > 1) navigate(-1);
    else go(fallback, true);
  };
  return { loc, go, back, mode: params.get('state') };
}


/* ---------- small pieces ---------- */

const dayLabel = (st: State, chat: Chat) => {
  const ev = eventOf(chat);
  return ev ? eventDay(st, ev) : 'Today';
};

/** An event channel is a calendar; General is the group's members-only channel, so it is a lock (v16). */
const ChannelMark = ({ chat, size = 'list', onBlue = false }: { chat: Chat; size?: 'list' | 'sm'; onBlue?: boolean }) => {
  const Icon = chat.eventId ? CalendarDays : Lock;
  return (
    <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-full', onBlue ? 'bg-white text-blue-600' : 'bg-blue-600 text-white', size === 'list' ? 'h-12 w-12' : 'h-8 w-8')}>
      <Icon className={size === 'list' ? 'h-5 w-5' : 'h-4 w-4'} />
    </span>
  );
};

const ChatAvatar = ({ st, chat, size = 'list' }: { st: State; chat: Chat; size?: 'list' | 'sm' }) =>
  (chat.kind === 'mirror' ? <MirrorAvatar owner={st.viewer} size={size} /> : chat.kind === 'dm' ? <Avatar person={otherOf(st, chat)} size={size} /> : <ChannelMark chat={chat} size={size} />);

const rowTitle = (st: State, c: Chat, inSection = false) =>
  c.kind !== 'channel' ? chatTitle(st, c) : c.eventId ? chatTitle(st, c) : inSection ? COPY.general : `${groupOf(c)?.name} · ${COPY.general}`;

const Badge = ({ n, className }: { n: number; className?: string }) => (n > 0 ? <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white', className)} aria-label={`${n} unread`}>{n}</span> : null);

function Header({ onBack, title, children, backAlways = false }: { onBack?: () => void; title: ReactNode; children?: ReactNode; backAlways?: boolean }) {
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-2 border-b px-2 lg:px-4">
      {onBack && <button type="button" aria-label="Back" onClick={onBack} className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', !backAlways && 'lg:hidden', HOVER)}><ArrowLeft className="h-5 w-5" /></button>}
      <div className="min-w-0 flex-1">{title}</div>
      {children}
    </header>
  );
}

const PageTitle = ({ children }: { children: ReactNode }) => <h1 className="truncate text-base font-semibold text-gray-900">{children}</h1>;
/** A page with a header and a scrolling body. */
function Page({ testId, title, onBack, mobileBack = false, children, actions }: { testId: string; title: ReactNode; onBack?: () => void; /** A place in the desktop sidebar: Back shows on a phone only. */ mobileBack?: boolean; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid={testId}>
      <Header backAlways={!!onBack && !mobileBack} onBack={onBack} title={<PageTitle>{title}</PageTitle>}>{actions}</Header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function RepliesLink({ replies, onOpen, live }: { replies: Msg[]; onOpen: () => void; live?: boolean }) {
  const faces = [...new Set(replies.map((r) => r.who))].slice(0, 3);
  return (
    <button type="button" onClick={onOpen} className="-ml-1 mt-0.5 flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-blue-700 hover:bg-white" data-testid="replies-link">
      <span className="flex -space-x-1.5">{faces.map((p) => <Avatar key={p} person={p} size="xs" />)}</span>
      {COPY.replies(replies.length)}
      {live && <span className="text-xs font-medium text-gray-500">· live</span>}
    </button>
  );
}


/**
 * A production page the prototype does not have a copy of opens in a NEW TAB, as every other in-app link here does. Only a same-origin
 * path qualifies (one leading slash): anything else (a scheme, a protocol-relative URL, nothing) is ignored, never opened.
 */
export function openInApp(href: string | null | undefined) {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return;
  window.open(href, '_blank', 'noopener,noreferrer');
}

/** A link inside a production block (a profile's pledge, a point) opens its real page in a new tab. */
const stayInPrototype = (e: MouseEvent) => {
  const a = (e.target as HTMLElement).closest('a');
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
  openInApp(a.getAttribute('href'));
};

/* ---------- production cards with real rows (v16) ---------- */

const CREATED = '2026-10-01T00:00:00.000Z';
const ZERO: Record<PositionType, number> = { strongly_agree: 0, agree: 0, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 };
const total = (c: Record<PositionType, number>) => Object.values(c).reduce((a, b) => a + b, 0);

/**
 * The counts with my position moved from the one the server knew to the one shown. Production's counts include the
 * viewer's own position, so a local change (never written) must move one count from the old bucket to the new.
 */
function shiftCounts<C extends Record<string, number>>(counts: C, server: PositionType | null, shown: PositionType | null): C {
  if (server === shown) return counts;
  const next: Record<string, number> = { ...counts };
  if (server) next[server] = Math.max(0, (next[server] ?? 0) - 1);
  if (shown) next[shown] = (next[shown] ?? 0) + 1;
  return next as C;
}

function overlayPoint(p: PointWithUserPosition, viewerId: string, shown: PositionType | null): PointWithUserPosition {
  const server = p.userPosition?.position ?? null;
  if (server === shown) return p;
  const counts = shiftCounts({ ...ZERO, ...p.positionCounts }, server, shown);
  return {
    ...p, positionCounts: counts, totalPositions: total(counts),
    userPosition: shown ? { id: `pos-${viewerId}-${p.id}`, pointId: p.id, userId: viewerId, position: shown, createdAt: CREATED, updatedAt: CREATED } : undefined,
  };
}
function overlaySummary(p: PointSummary, shown: PositionType | null): PointSummary {
  const server = p.userPosition ?? null;
  return server === shown ? p : { ...p, positionCounts: shiftCounts({ ...ZERO, ...p.positionCounts }, server, shown), userPosition: shown };
}

/** What the cards need from the prototype: my positions, where Details goes, and a click on an author. */
type CardCtx = { st: State; viewerId: string; /** Open a production path in a new tab. */ onOpen: (path: string) => void; onPosition: (pointId: string, p: PositionType | null, server: PositionType | null) => void; onDetails: (kind: 'point' | 'story', id: string) => void; onSlug: (slug: string) => void };
const Cards = createContext<CardCtx | null>(null);

/** What the real surfaces share: who is signed in, whether they are an admin, the groups directory, and the bridge back to the chat mock. */
type RealContext = {
  profileId: string; name: string; email: string | null; isAdmin: boolean;
  groups: Query<GroupsDirectory>;
  /** The partners read: the Partners page, and the Invite partner -> Invite sent -> Partner states. */
  partners: Query<PartnersData>;
  /** A real RSVP changed: keep the chat mock's seat for the matching event in step, so its channel opens or closes. */
  onRsvp: (eventSlug: string, going: boolean) => void;
};
const RealCtx = createContext<RealContext | null>(null);
const useReal = () => useContext(RealCtx)!;
/** A member of a real group: on the roster the service returned, or joined here, and not left here (the last two are local overlays). */
const memberOfOrg = (st: State, dir: GroupsDirectory | undefined, org: Organization) =>
  ((dir?.myOrgIds.includes(org.id) ?? false) || st.joined[st.viewer].includes(org.slug)) && !st.left[st.viewer].includes(org.slug);
const myOrgsOf = (st: State, dir: GroupsDirectory | undefined) => (dir?.orgs ?? []).filter((o) => memberOfOrg(st, dir, o));
const GROUP_DEFAULT: Record<string, PositionType> = { agree: 'agree', unsure: 'unsure', disagree: 'disagree' };

/**
 * WRAPPER around a production card, so it never writes. The real cards save positions with `sendPositionWrite`
 * (Supabase) and open `/point/:id` / `/story/:id`. This wrapper catches, in the capture phase, a click on a
 * position segment (`[data-testid="<group>-group"]`), on `Details →`, or on any link, and answers it locally: the
 * position comes back to the card through its own `userPosition` prop. `server` says which position the service
 * returned for the point, so a click on that same position clears it. A link to a test persona's profile opens it here.
 * An anonymous viewer's FeedPointCard keeps its own localStorage path (no network), so the wrapper lets it through.
 */
function MockCard({ own, quotedIds = [], quotedStoryIds = [], serverPosition, letAnonThrough = false, children, testId, strip = false }: {
  /** The card's own subject: a point, or a story. */
  own: { kind: 'point' | 'story'; id: string };
  /** A story's linked points, in the order the card renders them (its quoted point cards). */
  quotedIds?: string[];
  /** A point's linked stories, in the order the card renders them (its quoted stories). */
  quotedStoryIds?: string[];
  serverPosition: (pointId: string) => PositionType | null; letAnonThrough?: boolean; children: ReactNode; testId: string;
  /** A card offered for sharing or sitting in a chat: no ⋯ menu, no "+ Add a point". */
  strip?: boolean;
}) {
  const ctx = useContext(Cards)!;
  const { session } = useAuth();
  const box = useRef<HTMLDivElement>(null);
  useStripChrome(box, strip);
  const indexIn = (sel: string, el: Element) => [...(box.current?.querySelectorAll(sel) ?? [])].indexOf(el);
  const capture = (e: MouseEvent) => {
    const el = e.target as HTMLElement;
    /* Nested cards carry no id in the DOM: they render in `linkedPoints` / `linkedStories` order, so a card's index IS its record. */
    const quoted = el.closest<HTMLElement>('[data-testid="quoted-point-card"]');
    const quotedStory = el.closest<HTMLElement>('[data-testid="quoted-story"]');
    const pointId = quoted
      ? quotedIds[indexIn('[data-testid="quoted-point-card"]', quoted)]
      : own.kind === 'point' ? own.id : undefined;
    const seg = el.closest<HTMLElement>('[data-testid$="-group"]');
    if (seg) {
      if (letAnonThrough && !session) return;
      e.preventDefault(); e.stopPropagation();
      const pick = GROUP_DEFAULT[(seg.dataset.testid ?? '').replace(/-group$/, '')];
      if (pointId && pick) ctx.onPosition(pointId, pick, serverPosition(pointId));
      return;
    }
    const btn = el.closest('button');
    if (btn && /Details/.test(btn.textContent ?? '')) {
      e.preventDefault(); e.stopPropagation();
      if (quoted) { if (pointId) ctx.onDetails('point', pointId); }
      else if (quotedStory) { const id = quotedStoryIds[indexIn('[data-testid="quoted-story"]', quotedStory)]; if (id) ctx.onDetails('story', id); }
      else ctx.onDetails(own.kind, own.id);
      return;
    }
    /*
     * A story card's "+ Add a point" navigates with react-router's `navigate` (not `useOpenPath`), which would leave the prototype in
     * this tab and sign the persona out: it opens the same page in a new tab. Point cards and nested cards go through `useOpenPath`,
     * which the LinksInNewTab provider around the prototype already turns into a new tab; their own controls ("…more", video quotes,
     * the author link) are left to run.
     */
    if (own.kind === 'story' && btn?.getAttribute('aria-label') === 'Add a point to this story') {
      e.preventDefault(); e.stopPropagation();
      ctx.onOpen(`/story/${encodeURIComponent(own.id)}?addPoint=true`);
      return;
    }
    const a = el.closest('a');
    if (a) {
      e.preventDefault(); e.stopPropagation();
      const slug = a.getAttribute('href')?.split('/p/')[1]?.split(/[?#/]/)[0];
      if (slug) ctx.onSlug(slug); else openInApp(a.getAttribute('href'));
    }
  };
  return <div ref={box} data-testid={testId} onClickCapture={capture}>{children}</div>;
}

/**
 * v16: production's cards carry authoring chrome (the ⋯ menu, a story author's "+ Add a point") that has no place on a card
 * offered for sharing or sitting in a chat. The cards are production components, so the chrome is hidden, not removed (React
 * still owns the nodes); expand and Details stay.
 */
const CARD_CHROME = '[aria-label^="More actions for this"], [aria-label="Add a point to this story"]';
/** Every production card in v16 loses its ⋯ (Delete is a write to the test project; Edit leaves the tab and drops the persona session). */
const CARD_MENU = '[aria-label^="More actions for this"]';
function useStripChrome(ref: RefObject<HTMLElement | null>, on: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const selector = on ? CARD_CHROME : CARD_MENU;
    const hide = () => el.querySelectorAll<HTMLElement>(selector).forEach((n) => { n.hidden = true; n.style.display = 'none'; });
    hide();
    const watch = new MutationObserver(hide);
    watch.observe(el, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [ref, on]);
}

/** A real point in production's FeedPointCard, my position overlaid. */
export function RealPointCard({ point, linkedStories, testId = 'share-point', strip = false }: { point: PointWithUserPosition; linkedStories?: StoryWithAuthor[]; testId?: string; strip?: boolean }) {
  const ctx = useContext(Cards)!;
  const shown = positionOf(ctx.st, point.id, point.userPosition?.position ?? null);
  return (
    <MockCard testId={testId} strip={strip} own={{ kind: 'point', id: point.id }} serverPosition={(id) => (id === point.id ? point.userPosition?.position ?? null : null)} letAnonThrough quotedStoryIds={linkedStories?.map((x) => x.id)}>
      <FeedPointCard point={overlayPoint(point, ctx.viewerId, shown)} linkedStories={linkedStories} />
    </MockCard>
  );
}

/** A real story in production's FeedStoryCard, its linked points with my positions overlaid. */
export function RealStoryCard({ story, linkedPoints, testId = 'share-story', strip = false }: { story: StoryWithAuthor; linkedPoints?: PointSummary[]; testId?: string; strip?: boolean }) {
  const ctx = useContext(Cards)!;
  const serverOf = (id: string) => linkedPoints?.find((p) => p.id === id)?.userPosition ?? null;
  return (
    <MockCard testId={testId} strip={strip} own={{ kind: 'story', id: story.id }} quotedIds={linkedPoints?.map((p) => p.id)} serverPosition={serverOf}>
      <FeedStoryCard story={story} currentUserId={ctx.viewerId} linkedPoints={linkedPoints?.map((p) => overlaySummary(p, positionOf(ctx.st, p.id, p.userPosition ?? null)))} />
    </MockCard>
  );
}

/** A shared point or story (picker, composer, a message): its real row in its production card. */
export function ShareCard({ item, full = false }: { item: Shareable; full?: boolean }) {
  const width = full ? 'w-full' : 'max-w-md';
  const { point, story, linkedPoints } = item.real;
  return (
    <div className={cn('mt-1', width)}>
      {item.kind === 'point' && point && <RealPointCard point={point} strip />}
      {item.kind === 'story' && story && <RealStoryCard story={story} linkedPoints={linkedPoints} strip />}
    </div>
  );
}

function VoiceNote({ secs }: { secs: number }) {
  return (
    <div className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-full bg-gray-100 pl-1 pr-4" data-testid="voice-note">
      <button type="button" aria-label="Play voice message (coming soon)" onClick={() => toast('Playback is coming soon.')} className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white"><Play className="h-4 w-4" /></button>
      <span className="flex items-end gap-0.5" aria-hidden="true">{[3, 6, 4, 8, 5, 9, 4, 6, 3, 7, 5, 4].map((h, i) => <span key={i} className="w-0.5 rounded bg-gray-400" style={{ height: h * 2 }} />)}</span>
      <span className="text-xs tabular-nums text-gray-600">{clock(secs)}</span>
      <span className="text-xs text-gray-500" data-testid="voice-soon">Playback: {COPY.comingSoon}</span>
    </div>
  );
}


/* ---------- one message ---------- */

/** Right-click (or a long press on a touch screen) on a message: Reply, Forward, Thread, Mark as unread, and for my own Edit and Delete. */
function ContextMenu({ at, canEdit, canDelete, onClose, onReply, onForward, onThread, onMarkUnread, onEdit, onDelete }: {
  at: { x: number; y: number }; canEdit: boolean; canDelete: boolean; onClose: () => void; onReply: () => void; onForward: () => void; onThread?: () => void; onMarkUnread: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(onClose, true, [ref]);
  const pick = (f: () => void) => () => { onClose(); f(); };
  const x = Math.max(8, Math.min(at.x, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 216));
  const y = Math.max(8, Math.min(at.y, (typeof window !== 'undefined' ? window.innerHeight : 768) - 280));
  return (
    <div ref={ref} role="menu" aria-label="Message menu" data-testid="message-menu" style={{ left: x, top: y }} className="fixed z-50 w-52 rounded-xl border bg-white p-1 shadow-xl">
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onReply)}><Reply className="h-4 w-4 text-gray-500" />Reply</button>
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onForward)}><Forward className="h-4 w-4 text-gray-500" />Forward</button>
      {onThread && <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onThread)}><MessageSquareText className="h-4 w-4 text-gray-500" />Thread</button>}
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onMarkUnread)}><MessagesSquare className="h-4 w-4 text-gray-500" />{COPY.markUnread}</button>
      {canEdit && <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onEdit)}><Pencil className="h-4 w-4 text-gray-500" />Edit</button>}
      {canDelete && <button type="button" role="menuitem" className={cn(MENU_ITEM, 'text-red-700')} onClick={pick(onDelete)}><Trash2 className="h-4 w-4" />Delete</button>}
    </div>
  );
}

/** The thread count, "Thread · 3 replies" (a forwarded thread is one card with this as its button). */
const threadLabel = (n: number) => `Thread · ${COPY.replies(n)}`;

/** Hover (or a tap on a phone) shows Reply, Forward, Thread, Clarify (v15 #10). Right-click or a long press opens the full menu. */
function MessageRow({ st, msg, own, compact, highlight, replies, onPerson, onReply, onForward, onThread, onRetry, onEdit, onDelete, onClarify, onMarkUnread, onOrigin, liveThread }: {
  st: State; msg: Msg; own: boolean; compact: boolean; highlight?: boolean; replies?: Msg[]; liveThread?: boolean;
  onPerson: (p: PersonId) => void; onReply: () => void; onForward: () => void; onThread?: () => void; onRetry: () => void;
  onEdit: (text: string) => void; onDelete: () => void; onClarify?: () => void; onMarkUnread: () => void;
  /** v16: a forwarded card links to the chat it came from. */
  onOrigin?: (chatId: string) => void;
}) {
  const [selected, setSelected] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const li = useRef<HTMLLIElement>(null);
  useDismiss(() => setSelected(false), selected, [li]);
  const act = (f: () => void) => () => { setSelected(false); f(); };
  const editable = own && !msg.failed && !msg.voice && !msg.transcribed && !msg.agent;
  const mirror = mirrorLabel(st);
  const origin = msg.from && onOrigin && visibleChats(st).some((c) => c.id === msg.from) ? msg.from : undefined;
  const toolbar = msg.failed || draft !== null ? undefined : (
    <Toolbar shown={selected}>
      <ToolButton label="Reply" onClick={act(onReply)}><Reply className={TOOL_ICON} /></ToolButton>
      <ToolButton label="Forward" onClick={act(onForward)}><Forward className={TOOL_ICON} /></ToolButton>
      {onThread && <ToolButton label="Thread" onClick={act(onThread)}><MessageSquareText className={TOOL_ICON} /></ToolButton>}
      {/* v11's Clarify: the agent's face and the word. The tip names my mirror and its role. */}
      {onClarify && (
        <Tip label={`${COPY.clarify} with ${mirror}`}>
          <button type="button" onClick={act(onClarify)} aria-label={`${COPY.clarify} with ${mirror}`} data-testid="clarify-button" className="flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 lg:h-9 lg:px-2">
            <MirrorAvatar owner={st.viewer} size="xs" /><span className="text-sm font-medium">{COPY.clarify}</span>
          </button>
        </Tip>
      )}
    </Toolbar>
  );
  const save = () => { if (draft !== null) onEdit(draft); setDraft(null); };
  const openMenu = (at: { x: number; y: number }) => { setSelected(false); setMenu(at); };
  const quote = msg.quote && (origin ? (
    <button type="button" onClick={() => onOrigin!(origin)} data-testid="reply-quote" aria-label={`Open the original in ${rowTitle(st, chatById(st, origin)!)}`} className="my-1 block min-h-10 w-full max-w-md rounded-lg border-l-2 border-blue-600 bg-gray-50 py-1 pl-2 pr-2 text-left hover:bg-gray-100">
      <span className="block text-xs font-semibold text-blue-700">{PEOPLE[msg.quote.who].name}</span>
      <span className="block truncate text-sm text-gray-600">{msg.quote.text}</span>
      <span className="block text-xs font-medium text-blue-700">In {rowTitle(st, chatById(st, origin)!)}</span>
    </button>
  ) : (
    <div className="my-1 border-l-2 border-blue-600 pl-2" data-testid="reply-quote">
      <p className="text-xs font-semibold text-blue-700">{PEOPLE[msg.quote.who].name}</p>
      <p className="truncate text-sm text-gray-600">{msg.quote.text}</p>
    </div>
  ));
  const body = msg.table
    ? <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg border bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-900" data-testid="table-post"><UsersIcon className="h-4 w-4" aria-hidden="true" />{msg.text}</p>
    : msg.text && <MsgText>{msg.text}{msg.edited && <span className="ml-1.5 text-xs text-gray-500" data-testid="edited-mark">(edited)</span>}</MsgText>;
  return (
    <li ref={li} data-msg={msg.id}>
      <Message person={msg.who} agentName={msg.agent ? mirror : undefined} time={msg.time} compact={compact} highlight={highlight} selected={selected} onSelect={msg.failed ? undefined : () => setSelected((s) => !s)} onPerson={onPerson} toolbar={toolbar}
        onContextMenu={msg.failed ? undefined : (e) => { e.preventDefault(); openMenu({ x: e.clientX, y: e.clientY }); }}
        onLongPress={msg.failed ? undefined : openMenu}>
        {msg.fwdFrom && (
          <p className="text-xs font-medium text-blue-700" data-testid="forwarded-label">
            {COPY.forwardedFrom} <button type="button" onClick={() => onPerson(msg.fwdFrom!)} className={cn(HIT, 'font-semibold hover:underline')}>{PEOPLE[msg.fwdFrom].name}</button>
          </p>
        )}
        {msg.chatId.startsWith('mirror-') && msg.quote && !msg.agent && <p className="text-xs font-medium text-blue-700" data-testid="clarify-label">Sent to {mirror} to clarify</p>}
        {quote}
        {draft !== null ? (
          <div className="mt-1" data-testid="edit-message">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit message" rows={2} autoFocus
              onKeyDown={(e) => { if (e.key === 'Escape') setDraft(null); if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); } }}
              className="block w-full resize-none rounded-lg border px-3 py-2 text-base outline-none focus:border-gray-500 md:text-[15px]" />
            <div className="mt-1 flex gap-2">
              <OutlineButton onClick={() => setDraft(null)}>Cancel</OutlineButton>
              <PrimaryButton className="min-h-10" onClick={save}>Save</PrimaryButton>
            </div>
          </div>
        ) : msg.threadCard && onThread && replies && replies.length > 0 ? (
          /* v16: a forwarded post with a thread is ONE card; its button opens the full thread. */
          <div className="mt-1 max-w-md overflow-hidden rounded-xl border bg-white" data-testid="thread-card">
            {(msg.text || msg.table) && <div className="px-3 py-2">{body}</div>}
            <button type="button" onClick={onThread} data-testid="thread-card-open" className={cn('flex min-h-11 w-full items-center gap-2 bg-gray-50 px-3 text-left text-sm font-semibold text-blue-700', msg.text && 'border-t', HOVER)}>
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />{threadLabel(replies.length)}
            </button>
          </div>
        ) : body}
        {msg.voice && <VoiceNote secs={msg.voice} />}
        {msg.share && <ShareCard item={msg.share} />}
        {msg.transcribed && !msg.table && <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500" data-testid="transcribed-mark"><Mic className="h-3 w-3" aria-hidden="true" />{COPY.transcribed}</p>}
        {msg.failed && (
          <div className="mt-1 flex items-center gap-2 text-xs text-red-700" data-testid="send-failed">
            {COPY.notSent}
            <QuietButton className="text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={onRetry}>{COPY.retry}</QuietButton>
          </div>
        )}
        {onThread && !msg.threadCard && replies && replies.length > 0 && <RepliesLink replies={replies} onOpen={onThread} live={liveThread} />}
      </Message>
      {menu && (
        <ContextMenu at={menu} canEdit={editable} canDelete={editable || (own && !msg.failed && !msg.agent)} onClose={() => setMenu(null)} onReply={onReply} onForward={onForward} onThread={onThread} onMarkUnread={onMarkUnread}
          onEdit={() => setDraft(msg.text)} onDelete={onDelete} />
      )}
    </li>
  );
}

function MessageList({ label, msgs, render }: { label: string; msgs: Msg[]; render: (m: Msg, compact: boolean) => ReactNode }) {
  return <ul aria-label={label} className="flex flex-col gap-0.5">{msgs.map((m, i) => render(m, i > 0 && msgs[i - 1]!.who === m.who && !m.fwdFrom && !m.table))}</ul>;
}


/* ---------- chat list ---------- */

/** Review #7: a deliberate swipe only (a scroll that drifts sideways must not archive). */
export const SWIPE_ARCHIVE_PX = 100;

function ChatRow({ st, chat, active, onOpen, onArchive, archived, inSection = false }: { st: State; chat: Chat; active: boolean; onOpen: () => void; onArchive: () => void; archived: boolean; inSection?: boolean }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const last = lastMsg(st, chat.id);
  const unread = unreadOf(st, chat.id);
  const mirror = chat.kind === 'mirror';
  const who = last && (last.agent ? '' : last.who === st.viewer ? 'You: ' : chat.kind === 'channel' ? `${PEOPLE[last.who].name.split(' ')[0]}: ` : '');
  const body = mirror && !st.mirror[st.viewer] ? COPY.mirrorAsk : last ? summary(last) : 'No messages yet';
  const live = !!eventOf(chat)?.live;
  useDismiss(() => setMenu(false), menu, [ref]);
  return (
    <li ref={ref} data-chat={chat.id} className="relative">
      <button
        type="button"
        onClick={onOpen}
        onContextMenu={(e) => { e.preventDefault(); if (!mirror) setMenu(true); }}
        onTouchStart={(e) => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; }}
        onTouchEnd={(e) => {
          const t = e.changedTouches[0];
          const start = touch.current;
          touch.current = null;
          if (!mirror && start && t && start.x - t.clientX > SWIPE_ARCHIVE_PX && Math.abs(t.clientY - start.y) < (start.x - t.clientX) / 2) onArchive();
        }}
        aria-current={active ? 'true' : undefined}
        className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', inSection ? 'min-h-[60px]' : 'min-h-[68px]', active ? 'bg-blue-600 text-white' : HOVER)}
      >
        {mirror ? <MirrorAvatar owner={st.viewer} size="list" /> : chat.kind === 'dm' ? <Avatar person={otherOf(st, chat)} size="list" /> : <ChannelMark chat={chat} onBlue={active} />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn('truncate text-[15px] font-semibold', active ? 'text-white' : 'text-gray-900')} data-testid="row-title">{rowTitle(st, chat, inSection)}</span>
            {live && <span className={cn('shrink-0 rounded-full px-1.5 text-[11px] font-semibold', active ? 'bg-white text-blue-700' : 'bg-red-50 text-red-700')}>LIVE</span>}
            <span className={cn('ml-auto shrink-0 text-xs', active ? 'text-blue-100' : 'text-gray-500')}>{mirror ? 'Pinned' : last?.time}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-sm', active ? 'text-blue-50' : 'text-gray-600')}><span className={active ? 'text-white' : 'text-blue-700'}>{who}</span>{body}</span>
            {unread > 0 && <span className={cn('flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold', active ? 'bg-white text-blue-700' : 'bg-blue-600 text-white')} aria-label={`${unread} unread`} data-testid="row-unread">{unread}</span>}
          </span>
        </span>
      </button>
      {menu && (
        <div role="menu" className="absolute right-3 top-2 z-10 flex gap-1 rounded-lg border bg-white p-1 shadow-md" data-testid="row-menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); onArchive(); }} className={cn('flex min-h-10 items-center gap-2 rounded-md px-3 text-sm', HOVER)}><Archive className="h-4 w-4" />{archived ? 'Unarchive' : 'Archive'}</button>
          <button type="button" aria-label="Close" onClick={() => setMenu(false)} className={cn('flex h-10 w-10 items-center justify-center rounded-md', HOVER)}><X className="h-4 w-4" /></button>
        </div>
      )}
    </li>
  );
}

type Folder = { id: Tab; label: string; unread: number };

function FolderTabs({ folders, active, onPick }: { folders: Folder[]; active: Tab; onPick: (t: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Folders" className="flex min-w-0 shrink-0 gap-0.5 overflow-x-auto border-b px-0.5 [scrollbar-width:none]" data-testid="folder-tabs">
      {folders.map((t) => (
        <button key={t.id} ref={(el) => { if (el && t.id === active) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }} type="button" role="tab" aria-selected={t.id === active} onClick={() => onPick(t.id)} className={cn('inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap border-b-2 px-1.5 text-[13px] font-medium', t.id === active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900')}>
          {t.label}<Badge n={t.unread} className="h-[18px] min-w-[18px] px-1 text-[10px]" />
        </button>
      ))}
    </div>
  );
}


/* ---------- the profile menu, the sidebar, the phone tab bar and profile sheet ---------- */

/** Learn: production's PUBLIC_NAV_GROUPS "Learn" group, the in-app items (Manifesto, About). */
const LEARN = (PUBLIC_NAV_GROUPS.find((g) => g.label === 'Learn')?.items ?? []).filter((i) => i.to === '/manifesto' || i.to === '/about');
const PRODUCT = PUBLIC_NAV_GROUPS.find((g) => g.label === 'Product')?.items ?? [];
const EVENTS_ITEM = PRODUCT.find((i) => i.to === EVENTS_LIST_TO);
const PLEDGERS_ITEM = PRODUCT.find((i) => i.to === '/pledgers');
const ADMIN_LINKS = [{ to: '/admin/users', label: 'Users' }, { to: '/admin/topics', label: 'Topics' }] as const;

type MenuActions = { onProfile: () => void; onPartners: () => void; onSettings: () => void; onLogOut: () => void; onTools: () => void; onInvite: () => void; onEvents: () => void };

/**
 * The account menu: production's labels (navigation-menu-items.tsx, simple-navigation.tsx, nav-links.ts). Use cases and Learn
 * sit next to Settings (v16: there is no "More"). The phone sheet adds what the sidebar has outside this menu: Invite partner,
 * Events and Tools.
 */
function ProfileMenuItems({ a, onPick, phone = false }: { a: MenuActions; onPick: (f: () => void) => () => void; /** The phone has no sidebar, so Invite partner, Events and Tools live here. */ phone?: boolean }) {
  const { isAdmin } = useReal();
  const out = (to: string, label: string, Icon?: LucideIcon) => (
    <a key={to} href={to} target="_blank" rel="noreferrer" role="menuitem" className={MENU_ITEM}>{Icon ? <Icon className="h-4 w-4 text-gray-500" /> : <span className="w-4" />}{label}</a>
  );
  const logOut = <div className="mt-1 border-t pt-1"><button type="button" role="menuitem" className={MENU_ITEM} onClick={onPick(a.onLogOut)} data-testid="log-out"><LogOut className="h-4 w-4 text-gray-500" />Log Out</button></div>;
  return (
    <>
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={onPick(a.onProfile)}><UserIcon className="h-4 w-4 text-gray-500" />My Profile</button>
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={onPick(a.onPartners)}><Handshake className="h-4 w-4 text-gray-500" />Partners</button>
      {phone && <button type="button" role="menuitem" className={MENU_ITEM} onClick={onPick(a.onInvite)} data-testid="menu-invite"><Handshake className="h-4 w-4 text-gray-500" />{COPY.invite}</button>}
      {phone && <button type="button" role="menuitem" className={MENU_ITEM} onClick={onPick(a.onTools)} data-testid="menu-tools"><LayoutGrid className="h-4 w-4 text-gray-500" />{PLACE_LABEL.tools}</button>}
      {phone && EVENTS_ITEM && <button type="button" role="menuitem" className={MENU_ITEM} onClick={onPick(a.onEvents)} data-testid="menu-events"><CalendarDays className="h-4 w-4 text-gray-500" />{EVENTS_ITEM.label}</button>}
      {out('/sessions', 'Session History', CalendarDays)}
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={onPick(a.onSettings)}><Settings className="h-4 w-4 text-gray-500" />Settings</button>
      {/* On a phone Log Out sits right after Settings, so it is on screen without scrolling the sheet (the long reading lists come after). */}
      {phone && logOut}
      <div role="group" aria-label="Use cases"><p className={MENU_HEAD}>Use cases</p>{AUDIENCE_LINKS.map((l) => out(l.to, l.label, l.Icon))}</div>
      <div role="group" aria-label="Learn"><p className={MENU_HEAD}>Learn</p>{LEARN.map((l) => out(l.to, l.label, l.Icon))}</div>
      {PLEDGERS_ITEM && out(PLEDGERS_ITEM.to, PLEDGERS_ITEM.label, PLEDGERS_ITEM.Icon)}
      {isAdmin && (
        <div role="group" aria-label="Admin" data-testid="admin-group"><p className={MENU_HEAD}>Admin</p>{ADMIN_LINKS.map((l) => out(l.to, l.label, Shield))}</div>
      )}
      {!phone && logOut}
    </>
  );
}

/** The profile picture at the sidebar's bottom-left: it opens the account menu upward. */
function MeButton({ viewer, name, collapsed, a }: { viewer: ViewerId; name: string; collapsed: boolean; a: MenuActions }) {
  const [on, setOn] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(() => setOn(false), on, [ref, btn]);
  return (
    <div className="relative">
      <button ref={btn} type="button" aria-label="My account" aria-expanded={on} onClick={() => setOn(!on)} data-testid="sidebar-me"
        className={cn('flex min-h-11 items-center gap-2.5 rounded-lg px-1.5 text-left', HOVER)}>
        <Avatar person={viewer} size="sm" />
        <span className="sr-only">{name}</span>
      </button>
      {on && (
        <div ref={ref} role="menu" aria-label="My account" className={cn('absolute z-50 max-h-[70vh] w-64 overflow-y-auto rounded-xl border bg-white p-1 shadow-xl', collapsed ? 'bottom-0 left-full ml-2' : 'bottom-full left-0 mb-1')} data-testid="me-menu">
          <ProfileMenuItems a={a} onPick={(f) => () => { setOn(false); f(); }} />
        </div>
      )}
    </div>
  );
}

function readCollapsed(): boolean {
  try { return window.localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(v: boolean) {
  try { window.localStorage.setItem(SIDEBAR_KEY, v ? '1' : '0'); } catch { /* storage blocked: the toggle still works for this visit */ }
}

/**
 * The desktop sidebar (>= 1024px), modelled on Claude / ChatGPT: logo (Home) and collapse at the top; Search; Invite partner;
 * the places Chats, Home, Groups, Letters, Events; then, at the bottom-left, the profile picture and Tools side by side.
 */
function Sidebar({ st, viewer, name, place, tools, a, onPlace, onHome, onSearch, onInvite, onTools }: {
  st: State; viewer: ViewerId; name: string; place: Place | null; tools: boolean; a: MenuActions;
  onPlace: (p: Place) => void; onHome: () => void; onSearch: () => void; onInvite: () => void; onTools: () => void;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => setCollapsed((c) => { writeCollapsed(!c); return !c; });
  const unread = totalUnread(st);
  const item = (on: boolean) => cn('relative flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm font-medium', on ? 'bg-blue-50 text-blue-700' : cn('text-gray-800', HOVER));
  /* A sidebar row: icon + label, or (collapsed) the icon alone with its tip. */
  const row = (key: string, label: string, Icon: LucideIcon, onClick: () => void, opts: { on?: boolean; n?: number; testId?: string } = {}) => {
    const body = (
      <button type="button" onClick={onClick} aria-current={opts.on ? 'page' : undefined} aria-label={collapsed ? label : undefined} data-testid={opts.testId} className={cn(item(!!opts.on), collapsed && 'justify-center px-0')}>
        <span className="relative"><Icon className="h-5 w-5 shrink-0" aria-hidden="true" />{collapsed && <Badge n={opts.n ?? 0} className="absolute -right-3 -top-2 ring-2 ring-gray-50" />}</span>
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
        {!collapsed && <Badge n={opts.n ?? 0} />}
      </button>
    );
    return <li key={key}>{collapsed ? <Tip label={label} side="right">{body}</Tip> : body}</li>;
  };
  return (
    <nav aria-label="Sidebar" data-testid="sidebar" data-collapsed={collapsed || undefined}
      className={cn('flex shrink-0 flex-col border-r bg-gray-50 p-2', collapsed ? 'w-[64px]' : 'w-[248px]')}>
      <div className={cn('mb-1 flex items-center gap-1', collapsed ? 'flex-col' : 'justify-between')} data-testid="sidebar-top">
        <button type="button" onClick={onHome} aria-label="Clarity Pledge, Home" data-testid="sidebar-logo" className={cn('flex min-h-11 min-w-0 items-center rounded-lg px-1.5', HOVER)}>
          <ClarityLogo size="sm" iconOnly={collapsed} />
        </button>
        <Tip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
          <button type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggle} data-testid="sidebar-toggle" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-600', HOVER)}>
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        </Tip>
      </div>
      <ul aria-label="Actions" className="space-y-0.5">
        {row('search', 'Search', Search, onSearch, { testId: 'sidebar-search' })}
        {row('invite', COPY.invite, Handshake, onInvite, { testId: 'sidebar-invite' })}
      </ul>
      <ul aria-label="Places" className="mt-2 space-y-0.5 border-t pt-2">
        {PLACES.map((p) => row(p, PLACE_LABEL[p], PLACE_ICON[p], () => onPlace(p), { on: place === p, n: p === 'chats' ? unread : 0 }))}
      </ul>
      <div className="flex-1" />
      <div className={cn('flex gap-1 border-t pt-2', collapsed ? 'flex-col items-center' : 'items-center')} data-testid="sidebar-bottom">
        <MeButton viewer={viewer} name={name} collapsed={collapsed} a={a} />
        {/* Tools: icon and label side by side, always visible, quiet. */}
        {collapsed ? (
          <Tip label={PLACE_LABEL.tools} side="right">
            <button type="button" onClick={onTools} aria-label={PLACE_LABEL.tools} aria-current={tools ? 'page' : undefined} data-testid="sidebar-tools" className={cn('flex h-11 w-11 items-center justify-center rounded-lg text-gray-500', HOVER)}><LayoutGrid className="h-5 w-5" aria-hidden="true" /></button>
          </Tip>
        ) : (
          <button type="button" onClick={onTools} aria-current={tools ? 'page' : undefined} data-testid="sidebar-tools" className={cn('flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-sm text-gray-500', tools && 'bg-blue-50 text-blue-700', HOVER)}>
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />{PLACE_LABEL.tools}
          </button>
        )}
      </div>
    </nav>
  );
}

/** The phone's bottom bar: Chats, Home, Groups, Letters, Profile. Profile opens a sheet instead of a page. */
function BottomTabs({ st, active, onTab }: { st: State; active: MobileTab | null; onTab: (p: MobileTab) => void }) {
  const unread = totalUnread(st);
  return (
    <nav aria-label="Places" data-testid="bottom-tabs" className="flex shrink-0 border-t bg-white">
      {MOBILE_TABS.map((p) => {
        const Icon = PLACE_ICON[p];
        return (
          <button key={p} type="button" onClick={() => onTab(p)} aria-current={active === p ? 'page' : undefined} className={cn('relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', active === p ? 'text-blue-700' : 'text-gray-600')}>
            <span className="relative flex h-6 w-6 items-center justify-center">{p === 'me' ? <Avatar person={st.viewer} size="xs" /> : <Icon className="h-6 w-6" aria-hidden="true" />}{p === 'chats' && <Badge n={unread} className="absolute -right-3 -top-1.5 ring-2 ring-white" />}</span>
            <span className="leading-4">{PLACE_LABEL[p]}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** How far a finger must drag the sheet down before it lets go. */
export const SHEET_DISMISS_PX = 80;

/**
 * The phone's profile menu: a bottom sheet. It closes on a swipe down, on a tap outside it and on Esc. (Not a page.)
 * The drag follows the finger; letting go past SHEET_DISMISS_PX closes, short of it springs back.
 */
function BottomSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const start = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const giveFocusBack = useGiveFocusBack();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        ref={panel} hideCloseButton data-testid="sheet" aria-label={label} aria-labelledby={undefined} aria-describedby={undefined} onCloseAutoFocus={giveFocusBack} style={{ transform: drag ? `translateY(${drag}px)` : undefined }}
        className={cn(SHEET_CLASS, 'sm:max-w-none sm:rounded-t-2xl sm:inset-x-0 sm:bottom-0 sm:left-0 sm:top-auto sm:translate-x-0 sm:translate-y-0')}
        onTouchStart={(e) => { start.current = (panel.current?.querySelector('[data-sheet-scroll]')?.scrollTop ?? 0) === 0 ? (e.touches[0]?.clientY ?? null) : null; }}
        onTouchMove={(e) => { const y = e.touches[0]?.clientY; if (start.current !== null && y !== undefined) setDrag(Math.max(0, y - start.current)); }}
        onTouchEnd={(e) => {
          const y = e.changedTouches[0]?.clientY;
          const dy = start.current !== null && y !== undefined ? y - start.current : 0;
          start.current = null;
          if (dy > SHEET_DISMISS_PX) onClose(); else setDrag(0);
        }}
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <div className="flex shrink-0 justify-center pb-1 pt-2" aria-hidden="true"><span className="h-1 w-10 rounded-full bg-gray-300" /></div>
        <div data-sheet-scroll className="min-h-0 overflow-y-auto px-2 pb-3">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- pages ---------- */

/** A person's profile: the real profile row of their test persona (api.getProfileBySlug). "You share" is the chat mock's roster. */
function Profile({ st, person, onBack, onMessage, onInvite }: { st: State; person: PersonId; onBack: () => void; onMessage: () => void; onInvite: () => void }) {
  const self = person === st.viewer;
  const q = useRealQuery<ProfileData | null>(() => loadProfile(personaSlug(person)), [person], { emptyValue: null, isEmpty: (p) => p === null });
  /* "You share" is read from the real rows (group memberships and event RSVPs), never from the chat mock's roster. */
  const { profileId, groups } = useReal();
  const mine = myOrgsOf(st, groups.data).map((o) => ({ slug: o.slug, name: o.name }));
  const shared = useRealQuery<string[]>(() => loadSharedWith(profileId, personaSlug(person), mine), [profileId, person, mine.map((m) => m.slug).join()], { emptyValue: [], isEmpty: () => false, enabled: !self && groups.status === 'ready' });
  const ps = self ? null : partnerState(st, person);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="profile">
      <Header backAlways onBack={onBack} title={<PageTitle>{self ? 'My profile' : 'Profile'}</PageTitle>} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50">
        <div className="mx-auto flex max-w-xl flex-col gap-3 px-3 py-4">
          <div onClickCapture={stayInPrototype}>
            <RealBoundary q={q} what="this profile" empty={<p>{PEOPLE[person].name} has no profile in the test project yet. Run the persona seed script.</p>}>
              {(p) => p && <CompactProfileCard profile={p} isOwner={self} />}
            </RealBoundary>
          </div>
          {/* Their Stories and Points, and the comparison, live on production's own pages: links into them (new tab), nothing written here. */}
          <div className="flex flex-wrap gap-2" data-testid="profile-links">
            <Button asChild variant="outline" className="min-h-10"><a href={`/p/${encodeURIComponent(personaSlug(person))}`} target="_blank" rel="noreferrer">See full profile</a></Button>
            {!self && <Button asChild variant="outline" className="min-h-10"><a href={`/compare/${encodeURIComponent(personaSlug(person))}`} target="_blank" rel="noreferrer">Compare with me</a></Button>}
          </div>
          {!self && canMessage(st, person) && <PrimaryButton className="w-full" onClick={onMessage}><MessageCircle className="h-4 w-4" />{COPY.message}</PrimaryButton>}
          {ps === 'none' && <OutlineButton className="w-full" onClick={onInvite} data-testid="profile-invite"><Handshake className="h-4 w-4" aria-hidden="true" />{COPY.invite}</OutlineButton>}
          {ps === 'pending' && <p className="text-center text-sm font-medium text-gray-700" data-testid="profile-invite-sent">{COPY.inviteSent}</p>}
          {ps === 'partner' && <p className="text-center text-sm font-medium text-blue-700" data-testid="profile-partner">{COPY.partner}</p>}
          {!self && (
            <p className="px-1 text-sm text-gray-500" data-testid="you-share">
              {groups.status === 'error' || shared.status === 'error' ? <>Could not load what you share. <button type="button" onClick={groups.status === 'error' ? groups.retry : shared.retry} className="inline-flex min-h-10 items-center font-medium text-blue-700 underline">Retry</button></>
                : shared.status === 'loading' ? 'Looking up what you share…'
                  : shared.data && shared.data.length > 0 ? `You share: ${shared.data.join(', ')}` : 'You share no group or event.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const PersonRow = ({ p, onPerson }: { p: PersonId; onPerson: (p: PersonId) => void }) => (
  <li><button type="button" onClick={() => onPerson(p)} className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-left', HOVER)}><Avatar person={p} size="sm" /><span className="min-w-0"><span className="block text-[15px] text-gray-900">{PEOPLE[p].name}</span><span className="block text-xs text-gray-500">{PEOPLE[p].role}</span></span></button></li>
);

/**
 * General: its members (the group's roster). An event channel (v16): that event's RSVPs, read from the real attendee list
 * (`getEventAttendees` for the event seeded under the same mock id), not a roster typed here.
 */
function Members({ chat, onBack, onPerson }: { chat: Chat; onBack: () => void; onPerson: (p: PersonId) => void }) {
  const ev = eventOf(chat);
  const going = useRealQuery<EventAttendee[] | null>(() => loadChatEventAttendees(ev!.id), [ev?.id], { emptyValue: [], isEmpty: (a) => !a || a.length === 0, enabled: !!ev });
  if (!ev) {
    return <GroupMembers chat={chat} onBack={onBack} onPerson={onPerson} />;
  }
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="members">
      <Header backAlways onBack={onBack} title={<PageTitle>{going.data ? `${going.data.length} going` : 'Going'}</PageTitle>} />
      <RealBoundary q={going} what="who is going" empty={<p>No one has reserved a seat yet.</p>}>
        {(rows) => (
          <ul className="overflow-y-auto py-2" aria-label="Going">
            {(rows ?? []).map((a) => {
              const p = personaFromSlug(a.slug);
              return p ? <PersonRow key={a.profileId} p={p} onPerson={onPerson} /> : (
                <li key={a.profileId} className="flex min-h-14 items-center gap-3 px-4"><WhoAvatar slug={a.slug} name={a.name} /><span className="text-[15px] text-gray-900">{a.name}</span></li>
              );
            })}
          </ul>
        )}
      </RealBoundary>
    </div>
  );
}

/** General's Members: the group's REAL members (`getMembers`, as the group page lists them); a person who is a test persona opens their profile. */
function GroupMembers({ chat, onBack, onPerson }: { chat: Chat; onBack: () => void; onPerson: (p: PersonId) => void }) {
  const slug = chat.groupId ?? '';
  const members = useRealQuery<OrgMember[]>(() => loadGroupMembers(slug), [slug], { emptyValue: [], isEmpty: (m) => m.length === 0, enabled: !!slug });
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="members">
      <Header backAlways onBack={onBack} title={<PageTitle>{members.data ? `${members.data.length} members` : 'Members'}</PageTitle>} />
      <RealBoundary q={members} what="the members" empty={<p>No members yet.</p>}>
        {(rows) => (
          <ul className="overflow-y-auto py-2" aria-label="Members">
            {rows.map((m) => {
              const p = personaFromSlug(m.slug);
              return p ? <PersonRow key={m.profileId} p={p} onPerson={onPerson} /> : (
                <li key={m.profileId} className="flex min-h-14 items-center gap-3 px-4"><WhoAvatar slug={m.slug} name={m.name} /><span className="text-[15px] text-gray-900">{m.name}</span></li>
              );
            })}
          </ul>
        )}
      </RealBoundary>
    </div>
  );
}

/** A person's avatar: the persona's chat-world face when the slug is a test persona, else the production avatar from the row's name. */
function WhoAvatar({ slug, name, size = 'sm' }: { slug: string | null | undefined; name: string; size?: 'xs' | 'sm' }) {
  const persona = personaFromSlug(slug);
  if (persona) return <Avatar person={persona} size={size} />;
  return <GravatarAvatar name={name} avatarColor={undefined} photoUrl={undefined} isPledger={false} showRing={false} size="sm" className={size === 'xs' ? '!h-5 !w-5 !text-[10px]' : '!h-8 !w-8 !text-xs'} />;
}

/** Newest group activity first (the chat mock's message order); a group with no chat yet sorts after those that have one. */
const byActivity = (st: State) => (a: Organization, b: Organization) => groupActivity(st, chatGroupOf(b.slug)) - groupActivity(st, chatGroupOf(a.slug)) || a.name.localeCompare(b.name);

/** The Groups place: your groups, sorted by latest activity (the memberships the service returned), then a quiet Browse groups button. */
function GroupsPage({ st, onGroup, onBrowse }: { st: State; onGroup: (slug: string) => void; onBrowse: () => void }) {
  const dirQ = useReal().groups;
  const browse = <OutlineButton onClick={onBrowse} data-testid="browse-groups"><Search className="h-4 w-4" />Browse groups</OutlineButton>;
  return (
    <Page testId="groups-page" title="Your groups">
      <RealBoundary q={dirQ} what="your groups" empty={<><p>You are not in any group yet. No public groups exist in this project yet.</p>{browse}</>}>
        {(d) => {
          const mine = myOrgsOf(st, d).sort(byActivity(st));
          return (
            <>
              <ul aria-label="Your groups" className="py-2">
                {mine.map((g) => {
                  const n = (groupSections(st).find((x) => x.groupId === chatGroupOf(g.slug))?.chats ?? []).reduce((sum, c) => sum + unreadOf(st, c.id), 0);
                  return (
                    <li key={g.id}><button type="button" onClick={() => onGroup(g.slug)} className={cn('flex min-h-16 w-full items-center gap-3 px-4 text-left', HOVER)}>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white"><LandmarkIcon className="h-5 w-5" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-gray-900">{g.name}</span>{d.memberCounts?.[g.id] != null && <span className="block text-xs text-gray-500">{d.memberCounts[g.id]} members</span>}</span>
                      <Badge n={n} />
                      <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    </button></li>
                  );
                })}
                {mine.length === 0 && <li className="px-6 py-8 text-center text-sm text-gray-500" data-testid="real-empty">You are not in any group yet.</li>}
              </ul>
              <div className="px-4 pb-6">{browse}</div>
            </>
          );
        }}
      </RealBoundary>
    </Page>
  );
}

/** A copy of OrgDirectoryPage's structure, its cards the production OrgCard (the card's link is kept in the prototype). */
function DirectoryPage({ st, onBack, onGroup }: { st: State; onBack: () => void; onGroup: (slug: string) => void }) {
  const dirQ = useReal().groups;
  const open = (g: Organization) => (e: MouseEvent) => { if ((e.target as HTMLElement).closest('a')) { e.preventDefault(); onGroup(g.slug); } };
  return (
    <Page testId="directory-page" title="Clarity Groups" onBack={onBack}>
      <div className="px-4 py-6">
        <div className="mx-auto max-w-5xl space-y-8">
          <header className="min-w-0">
            <h1 className="text-2xl font-bold sm:text-3xl">Clarity Groups</h1>
            <p className="mt-2 max-w-prose text-base text-muted-foreground">Communities practising calibrated communication together. Go into one to see its events and members.</p>
          </header>
          <RealBoundary q={dirQ} what="groups" empty={<p>No public groups yet.</p>}>
            {(d) => (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[...d.orgs].sort((a, b) => Number(memberOfOrg(st, d, b)) - Number(memberOfOrg(st, d, a)) || byActivity(st)(a, b)).map((g) => (
                  <li key={g.id} onClickCapture={open(g)} data-group={g.slug}>
                    <OrgCard org={g} memberCount={d.memberCounts?.[g.id] ?? null} participation={d.participation[g.id]} eventSummary={d.eventSummaries[g.id]} isMine={memberOfOrg(st, d, g)} />
                  </li>
                ))}
              </ul>
            )}
          </RealBoundary>
          <p className="text-sm text-muted-foreground">Looking for a single event? <a href={EVENTS_LIST_TO} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700">Browse all events</a>.</p>
        </div>
      </div>
    </Page>
  );
}

type GroupTab = 'events' | 'members' | 'about' | 'chats';

/** What `?real=empty` shows on a group page: the header with every tab empty. */
const stubGroup = (slug: string): GroupDetail => ({
  org: { id: `stub-${slug}`, slug, name: GROUPS.find((g) => g.id === slug)?.name ?? slug, blurb: null, description: null, visibility: 'public', hasEvents: true },
  members: [], myRole: null, upcoming: [], past: [],
});

/** The profile slug in a production link (`/p/<slug>`), if it is one. */
const slugOfHref = (a: Element | null) => a?.getAttribute('href')?.split('/p/')[1]?.split(/[?#/]/)[0];

/**
 * A copy of production OrgPage (org-page.tsx): the real OrgHeader, then Events / Members / About tabs in `?tab=`
 * (the default, Events, carries no param), plus v15's Chats tab (the group's channels, still the chat mock). The org,
 * its roster and its events are the service rows (organizationsService + eventsService); Members renders the real
 * PersonRow per member (production renders PledgerGrid, which needs its own data shape).
 */
function GroupPage({ st, slug, tab, onTab, onBack, onEvent, onChannel, onPerson, onJoin, onLeave }: {
  st: State; slug: string; tab: GroupTab | undefined; onTab: (t: GroupTab | undefined) => void; onBack: () => void; onEvent: (eventSlug: string, groupSlug: string) => void; onChannel: (id: string) => void;
  onPerson: (p: PersonId) => void; onJoin: () => void; onLeave: () => void;
}) {
  const { profileId, groups } = useReal();
  const q = useRealQuery<GroupDetail | null>(() => loadGroupDetail(slug), [slug, profileId], { emptyValue: stubGroup(slug), isEmpty: () => false });
  const missing = <Page testId="group-page" title="Group" onBack={onBack}><p className="px-4 py-8 text-sm text-gray-600">This group does not exist.</p></Page>;
  if (q.status === 'loading') return <Page testId="group-page" title="Group" onBack={onBack}><RealSkeleton what="this group" /></Page>;
  if (q.status === 'error') return <Page testId="group-page" title="Group" onBack={onBack}><RealError what="this group" onRetry={q.retry} /></Page>;
  if (!q.data) return missing;
  const { org, members, myRole, upcoming, past } = q.data;
  /* The membership read can fail on its own (myRole null): the directory's memberships still count. */
  const member = (myRole !== null && !st.left[st.viewer].includes(slug)) || memberOfOrg(st, groups.data, org);
  const organizers = members.filter((m) => m.role === 'organizer').length;
  const events = [...upcoming, ...past];
  const chatGroup = chatGroupOf(slug);
  /* A group with no events has no Events tab: it opens on About, as production's org-page does. */
  const firstTab: GroupTab = org.hasEvents ? 'events' : 'about';
  const shownTab: GroupTab = !tab || (tab === 'events' && !org.hasEvents) ? firstTab : tab;
  const chans = chatGroup ? groupSections(st).find((x) => x.groupId === chatGroup)?.chats ?? [] : [];
  return (
    <Page testId="group-page" title={org.name} onBack={onBack}>
      <div className="min-w-0 px-4 py-6" data-group={slug} onClickCapture={(e) => { const a = (e.target as HTMLElement).closest('a'); if (a && !a.target) { e.preventDefault(); openInApp(a.getAttribute('href')); } }}>
        <div className="mx-auto min-w-0 max-w-4xl space-y-6">
          <OrgHeader org={org} memberCount={members.length} isMember={member} myRole={member ? (myRole ?? 'member') : null} organizerCount={organizers} participation={groups.data?.participation[org.id]}
            onJoin={onJoin} onLeave={onLeave} onShowMembers={() => onTab('members')} currentUserId={profileId} />
          <Tabs value={shownTab} onValueChange={(v) => onTab(v === firstTab ? undefined : (v as GroupTab))}>
            <TabsList className="h-auto w-full min-w-0 justify-start gap-4 overflow-x-auto overflow-y-hidden rounded-none border-b border-border bg-transparent p-0 [scrollbar-width:none] sm:gap-6" data-testid="group-tabs">
              {org.hasEvents && <TabsTrigger value="events" className={ORG_TAB_CLASS}>Events</TabsTrigger>}
              <TabsTrigger value="members" className={ORG_TAB_CLASS}>Members</TabsTrigger>
              <TabsTrigger value="about" className={ORG_TAB_CLASS}>About</TabsTrigger>
              <TabsTrigger value="chats" className={ORG_TAB_CLASS}>Chats</TabsTrigger>
            </TabsList>
            <TabsContent value="events" className="pt-4">
              {events.length > 0 ? (
                <div className="space-y-6" data-testid="group-events">
                  {([['Upcoming', upcoming, false], ['Past', past, true]] as const).filter(([, list]) => list.length > 0).map(([label, list, isPast]) => (
                    <section key={label} aria-label={`${org.name} ${label.toLowerCase()} events`}>
                      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{label} ({list.length})</h3>
                      <ul className="space-y-3">
                        {list.map((e) => (
                          <li key={e.id}><button type="button" onClick={() => onEvent(e.slug, slug)} className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:border-blue-500/50 hover:shadow">
                            <CalendarDays className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
                            <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-gray-900">{e.title}</span><span className="block truncate text-sm text-muted-foreground" data-testid="group-event-meta">{formatLocalDateTime(e.datetime, { timeZone: e.timezone })} · {e.location}{isPast ? ' · past' : ''}</span></span>
                            <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                          </button></li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : <RealEmpty>No events yet. Events this group schedules will be listed here.</RealEmpty>}
            </TabsContent>
            <TabsContent value="members" className="pt-4">
              {members.length > 0 ? (
                <div className="space-y-2" data-testid="group-members" onClickCapture={(e) => { const a = (e.target as HTMLElement).closest('a'); const p = personaFromSlug(slugOfHref(a)); if (a) { e.preventDefault(); e.stopPropagation(); if (p) onPerson(p); else openInApp(a.getAttribute('href')); } }}>
                  {members.map((m) => <MemberRow key={m.profileId} m={m} />)}
                </div>
              ) : <RealEmpty>No members yet.</RealEmpty>}
            </TabsContent>
            <TabsContent value="about" className="pt-4">
              <div className="mx-auto max-w-2xl space-y-6" data-testid="group-about">
                <div className="space-y-4 rounded-lg border border-border bg-card p-6 md:p-8">
                  <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-relaxed">This group runs on the <button type="button" onClick={onJoin} className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700">Clarity Group Terms</button>. Every member accepts them on joining.</p>
                  {org.description ? <p className="break-words text-base leading-relaxed">{org.description}</p> : <p className="text-base text-muted-foreground">This group has not written an About yet.</p>}
                </div>
                {!member && <Button onClick={onJoin} className="min-h-11 w-full bg-blue-500 text-white hover:bg-blue-700">Join this group</Button>}
              </div>
            </TabsContent>
            <TabsContent value="chats" className="pt-4">
              {chans.length > 0 ? (
                <ul aria-label={`${org.name} channels`} className="overflow-hidden rounded-xl border bg-white" data-testid="group-chats">
                  {chans.map((c) => <li key={c.id}><button type="button" onClick={() => onChannel(c.id)} className={cn('flex min-h-12 w-full items-center gap-3 px-3 text-left', HOVER)}><ChannelMark chat={c} size="sm" /><span className="min-w-0 flex-1 truncate text-sm text-gray-900">{rowTitle(st, c, true)}</span><span className="text-xs text-gray-500">{c.eventId ? 'RSVPs only' : COPY.membersOnly}</span></button></li>)}
                </ul>
              ) : <p className="py-8 text-center text-sm text-muted-foreground" data-testid="group-chats">{chatGroup ? 'Join the group to see its chats.' : 'This group has no chats in the prototype.'}</p>}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Page>
  );
}

const MemberRow = ({ m }: { m: OrgMember }) => (
  <ProdPersonRow profileId={m.profileId} slug={m.slug ?? ''} name={m.name} avatarColor={m.avatarColor ?? '#2563eb'} avatarUrl={m.avatarUrl} isPledger={m.hasPledged} showEarBadge={false} linkToProfile={!!m.slug} />
);

/** A copy of org-join-page's structure: the real CertificateFrame and CertificateOathBody with the current Clarity Group Terms. Joining is a local overlay. */
function JoinPage({ st, slug, onBack, onJoined }: { st: State; slug: string; onBack: () => void; onJoined: (name: string) => void }) {
  const dirQ = useReal().groups;
  const coa = COA_VERSIONS[CURRENT_COA_VERSION];
  return (
    <Page testId="join-page" title="Join group" onBack={onBack}>
      <RealBoundary q={dirQ} what="this group" empty={<p>This group does not exist.</p>}>
        {(d) => {
          const g = d.orgs.find((o) => o.slug === slug);
          if (!g) return <p className="px-4 py-8 text-sm text-gray-600">This group does not exist.</p>;
          const member = memberOfOrg(st, d, g);
          return (
            <div className="px-4 pb-16 pt-6">
              <div className="mx-auto max-w-2xl space-y-6">
                <div>
                  <h1 className="text-center text-2xl font-bold md:text-3xl">{member ? `${g.name} — terms` : `Join ${g.name}`}</h1>
                  <p className="mt-2 text-center text-muted-foreground">{coa.intro}</p>
                </div>
                <CertificateFrame ariaLabel="Clarity Group Terms" title={coa.title} kicker="A commitment to every member" epigraph="We all crave being understood. Let's commit to listen.">
                  <CertificateOathBody sections={[coa.yourRight, coa.myPromise, coa.exception]} />
                  <div className="space-y-2 pt-2">
                    {member ? (
                      <Button variant="outline" className="min-h-11 w-full" onClick={onBack}>Back to {g.name}</Button>
                    ) : (
                      <>
                        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-center text-sm text-gray-800" data-testid="prototype-note">Not saved: prototype. Joining changes this screen only; nothing is written to the group.</p>
                        <Button onClick={() => onJoined(g.name)} size="lg" className="min-h-11 w-full bg-blue-600 py-4 text-base font-semibold text-white hover:bg-blue-700 md:py-6 md:text-lg" data-testid="accept-join">Accept terms &amp; join</Button>
                        <p className="text-center text-[10px] text-[#1A1A1A]/60 md:text-xs">Accept the terms to join {g.name}.</p>
                      </>
                    )}
                  </div>
                </CertificateFrame>
              </div>
            </div>
          );
        }}
      </RealBoundary>
    </Page>
  );
}

/**
 * v15 #3: an event page modelled on production EventDetail: the real BannerDisplay, a Back that returns to THIS
 * event's group, the Details / room tab row (production label: "Join now" near the start, else "Event Room"), the
 * title card (date, location), Reserve a seat then the "You're going!" card (the real rsvpToEvent / cancelRsvp, unchanged),
 * the topic-vote area ("Coming soon": the production TopicsPage reads live topics and writes votes), the organizer and the Participants
 * card of real PersonRows, and "Open event chat" to the matching channel of the chat mock.
 */
function EventPage({ st, slug, groupHint, onBack, onGroup, onChat, onPerson }: { st: State; slug: string; groupHint?: string; onBack: () => void; onGroup: (groupSlug: string | null) => void; onChat: (chatId: string) => void; onPerson: (p: PersonId) => void }) {
  const { profileId, onRsvp } = useReal();
  const q = useRealQuery<EventDetail | null>(() => loadEventDetail(slug, profileId, groupHint), [slug, profileId, groupHint], { emptyValue: null, isEmpty: () => false });
  const forcedEmpty = useRealOverride() === 'empty';
  const [busy, setBusy] = useState(false);
  /* What the last successful write made true, until the next read lands: so the control never offers the stale action. */
  const [seat, setSeat] = useState<boolean | null>(null);
  useEffect(() => { setSeat(null); }, [q.data]);
  const keep = (e: MouseEvent) => { const a = (e.target as HTMLElement).closest('a'); if (!a) return; e.preventDefault(); e.stopPropagation(); const p = personaFromSlug(slugOfHref(a)); if (p) onPerson(p); else openInApp(a.getAttribute('href')); };
  const frame = (body: ReactNode, title = 'Event') => <Page testId="event-page" title={title} onBack={onBack}>{body}</Page>;
  if (q.status === 'loading') return frame(<RealSkeleton what="this event" />);
  if (q.status === 'error') return frame(<RealError what="this event" onRetry={q.retry} />);
  /* An empty state shows nothing it did not read: no made-up date, no organiser. */
  if (forcedEmpty) return frame(<RealEmpty>No details for this event yet.</RealEmpty>);
  if (!q.data) return frame(<p className="px-4 py-8 text-sm text-gray-600">This event does not exist.</p>);
  const { event, attendees, org } = q.data;
  const going = seat ?? q.data.going;
  const ended = event.status === 'completed' || new Date(event.datetime).getTime() + event.durationMinutes * 60_000 < Date.now();
  const cancelled = event.status === 'cancelled';
  const chatEvent = chatEventOf(event.slug);
  const chat = chatEvent ? st.chats.find((c) => c.eventId === chatEvent) : undefined;
  const canChat = !!chat && visibleChats(st).some((c) => c.id === chat.id);
  const toggle = async () => {
    setBusy(true);
    try {
      const ok = going ? await cancelRsvp(event.id, profileId) : await rsvp(event.id, profileId);
      if (!ok) toast.error(going ? 'Could not cancel your RSVP.' : 'Could not reserve a seat. The event may be full or over.');
      else { setSeat(!going); onRsvp(event.slug, !going); q.refresh(); }
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const hostColor = event.hostAvatarColor ?? '#2563eb';
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="event-page" data-group={org?.slug}>
      <Header backAlways onBack={onBack} title={<PageTitle>{event.title}</PageTitle>} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-background" onClickCapture={keep}>
        {q.refreshFailed && (
          <div role="alert" data-testid="refresh-failed" className="flex flex-wrap items-center justify-center gap-2 border-b bg-muted px-4 py-2 text-sm text-gray-800">
            <span>Could not refresh this event, so what you see may be out of date.</span>
            <OutlineButton onClick={q.refresh}>Retry</OutlineButton>
          </div>
        )}
        {/* Review #2: a short hero on phones, so "Reserve a seat" is in the first screen at 320x640. */}
        <BannerDisplay bannerUrl={event.bannerUrl ?? null} fallbackColor={hostColor} altText={event.title} heightClassName="h-16 sm:h-32 md:h-64" />
        <div className="mx-auto min-w-0 max-w-6xl px-4 py-3 sm:py-6">
          {/* Review #2: the header arrow is history Back; this link always goes to the event's OWN group (found from the group's own event lists). */}
          <button type="button" onClick={() => onGroup(org?.slug ?? null)} data-testid="event-back-link" className="mb-2 inline-flex min-h-10 max-w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:mb-4"><ArrowLeft className="h-4 w-4 shrink-0" /><span className="truncate">Back to {org?.name ?? 'groups'}</span></button>
          {!ended && !cancelled && (
            <div className="mb-3 flex w-full items-center sm:mb-6 justify-start gap-6 overflow-x-auto border-b border-border">
              <span className="inline-flex min-h-11 items-center whitespace-nowrap border-b-2 border-blue-500 px-1 pb-3 text-base font-medium text-foreground">Details</span>
              <button type="button" onClick={() => openInApp(`/events/${encodeURIComponent(event.slug)}/room`)} data-testid="event-room-tab" className="inline-flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent px-1 pb-3 text-base font-medium text-muted-foreground transition-colors hover:text-foreground">Event Room</button>
            </div>
          )}
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="min-w-0 flex-1">
              <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
                <h1 className="mb-3 text-2xl font-bold md:mb-4 md:text-3xl">{event.title}</h1>
                <div className="mb-3 flex items-center gap-3 text-muted-foreground"><CalendarPlus className="h-5 w-5 flex-shrink-0" /><span className="font-medium text-foreground">{formatLocalDateTime(event.datetime, { timeZone: event.timezone })}</span></div>
                <div className="mb-4 flex items-center gap-3 text-muted-foreground">{/online/i.test(event.location) ? <Video className="h-5 w-5 flex-shrink-0" /> : <MapPin className="h-5 w-5 flex-shrink-0" />}<span>{event.location}</span></div>
                <div className="mb-4" data-testid="rsvp-area">
                  {cancelled ? <Button disabled className="w-full" size="lg" data-testid="rsvp-button">Event Cancelled</Button>
                    : ended ? <Button disabled className="w-full" size="lg" data-testid="rsvp-button">Event Ended</Button>
                    : going ? (
                      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-4 sm:p-4" data-testid="rsvp-going">
                        <div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 flex-shrink-0 text-green-600" /><div><p className="font-semibold text-green-800">You&apos;re going!</p><p className="text-sm text-green-700">See you there</p></div></div>
                        <div className="mt-2 text-center"><Button variant="ghost" size="sm" className="min-h-10" disabled={busy} onClick={toggle} data-testid="cancel-rsvp">Cancel RSVP</Button></div>
                      </div>
                    ) : <Button onClick={toggle} disabled={busy} className="w-full bg-blue-500 text-white hover:bg-blue-700" size="lg" data-testid="rsvp-button">Reserve a seat</Button>}
                </div>
                {event.description && <p className="text-base leading-relaxed">{event.description}</p>}
                {/* Host only: the existing production pages for editing the event and running it (new tab; v16 writes nothing here). */}
                {event.hostId === profileId && (
                  <div className="mt-4 flex flex-wrap gap-2" data-testid="host-links">
                    <Button asChild variant="outline" className="min-h-10"><a href={`/events/${encodeURIComponent(event.slug)}/edit`} target="_blank" rel="noreferrer">Edit event</a></Button>
                    <Button asChild variant="outline" className="min-h-10"><a href={`/events/${encodeURIComponent(event.slug)}/host`} target="_blank" rel="noreferrer">Host panel</a></Button>
                  </div>
                )}
                <div className="mt-4">
                  {canChat && chat ? <OutlineButton onClick={() => onChat(chat.id)} data-testid="open-event-chat"><MessagesSquare className="h-4 w-4" />Open event chat</OutlineButton>
                    : <p className="text-sm text-muted-foreground" data-testid="event-chat-closed">{chat ? 'The event chat opens to the people who RSVP.' : 'This event has no chat in the prototype.'}</p>}
                </div>
              </div>
              {!ended && !cancelled && (
                /* Production embeds TopicsPage here. It reads live topics AND writes votes, so it cannot be reused read-only: the area says so. */
                <div id="topic-vote" data-testid="topic-vote" className="mb-6 rounded-xl border border-border bg-muted p-4 sm:p-5">
                  <h2 className="text-base font-semibold text-gray-900">Topic vote</h2>
                  <p className="mt-1 text-sm text-gray-600">Voting on this event&apos;s topics: <span className="font-medium text-gray-800">{COPY.comingSoon}</span></p>
                </div>
              )}
            </div>
            <div className="space-y-6 lg:w-96 lg:flex-shrink-0">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Event Organizer</h2>
                <ProdPersonRow profileId={event.hostId} slug={event.hostSlug} name={event.hostName} avatarColor={hostColor} avatarUrl={event.hostAvatarUrl} isPledger={event.hostHasPledged ?? false} showEarBadge={false} />
              </div>
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm" data-testid="participants">
                <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Participants ({attendees.length})</h2>
                <div className="space-y-2">
                  {attendees.map((a) => <ProdPersonRow key={a.profileId} profileId={a.profileId} slug={a.slug} name={a.name} avatarColor={a.avatarColor ?? '#2563eb'} avatarUrl={a.avatarUrl} isPledger={a.hasPledged} earCount={a.earCount} showEarBadge={false} />)}
                  {attendees.length === 0 && <p className="text-sm text-muted-foreground" data-testid="real-empty">No one has reserved a seat yet.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Letters: production's three tabs (letters-page.tsx: Inbox, Drafts, Published = `sent`), each its own read. */
const LETTERS_EMPTY: Record<LetterBox, string> = { inbox: 'No letters yet.', drafts: 'No drafts yet.', sent: 'You have not published a letter yet.' };
const LETTERS_WHAT: Record<LetterBox, string> = { inbox: 'your inbox', drafts: 'your drafts', sent: 'your published letters' };
const useLettersQuery = (box: LetterBox) => {
  const { profileId, name } = useReal();
  return useRealQuery<LetterRowData[]>(() => loadLetters(box, profileId, name), [box, profileId, name], { emptyValue: [], isEmpty: (rows) => rows.length === 0 });
};

/** A delivery's status in words (production's sent-tab labels). */
const DELIVERY_STATUS: Record<string, string> = { sent: 'Sent', in_progress: 'In progress', completed: 'Completed' };

/**
 * One letter. v16: the card body opens nothing; only its buttons act (Read / Results, Edit + Prepare, Open overview). The buttons
 * show on hover on a desktop and are always there on a touch screen. A published letter keeps its expander (who it went to).
 */
function LetterCard({ l }: { l: LetterRowData }) {
  const [open, setOpen] = useState(false);
  const deliveries = useRealQuery<LetterDelivery[]>(() => loadDeliveries(l.id), [l.id], { emptyValue: [], isEmpty: (d) => d.length === 0, enabled: l.box === 'sent' && open });
  return (
    <li className="group rounded-lg border bg-white" data-testid="letter-card" data-box={l.box}>
      <div className="flex items-center gap-3 px-3 py-2">
        {l.box === 'sent' && (
          <button type="button" aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'} onClick={() => setOpen(!open)} className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500', HOVER)}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
        {l.box === 'inbox' && <span className={cn('block h-2 w-2 shrink-0 rounded-full bg-blue-600', !l.unread && 'opacity-0')} aria-hidden="true" data-testid={l.unread ? 'unread-dot' : undefined} />}
        <WhoAvatar slug={l.whoSlug} name={l.who} />
        <div className="min-w-0 flex-1">
          {l.unread && <span className="sr-only">Unread. </span>}
          <p className={cn('truncate text-[15px] text-gray-900', l.unread ? 'font-bold' : 'font-semibold')} data-testid="letter-title">{l.title}</p>
          <p className="truncate text-xs text-gray-500">{l.summary ? `${l.summary} · Updated ${l.when}` : `${l.who} · ${l.when}`}</p>
          {l.steps && <p className="truncate text-xs text-gray-500" data-testid="letter-steps">{l.steps}</p>}
        </div>
        {l.box === 'drafts' && <LetterStatusBadge status="in_progress" label="Draft" />}
        <div data-testid="letter-actions" className="flex shrink-0 items-center gap-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
          {l.actions.map((a) => (
            <Button key={a.label} asChild size="sm" variant={a.primary ? 'default' : 'outline'} className={cn('min-h-10', a.primary && 'bg-blue-600 text-white hover:bg-blue-700')}>
              <a href={a.href} target="_blank" rel="noreferrer">{a.label}</a>
            </Button>
          ))}
        </div>
      </div>
      {open && (
        <div className="border-t bg-gray-50 px-3 py-2" data-testid="letter-expanded">
          <RealBoundary q={deliveries} what="who this letter went to" empty={<p>Not delivered to anyone yet.</p>}>
            {(rows) => (
              <ul aria-label="Deliveries" className="divide-y">
                {rows.map((x) => (
                  <li key={x.id} className="flex min-h-12 items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-gray-900">{x.receiver_name ?? x.receiver_email ?? 'Link respondent'}</span>
                    <span className="text-gray-500">{DELIVERY_STATUS[x.status] ?? x.status}</span>
                    {(x.status === 'completed' || x.status === 'in_progress') && (
                      <Button asChild size="sm" variant="outline" className="min-h-10"><a href={`/letter/${l.id}/results?delivery=${x.id}`} target="_blank" rel="noreferrer">Results</a></Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </RealBoundary>
        </div>
      )}
    </li>
  );
}

function LettersPage({ tab, onTab }: { tab: LetterBox; onTab: (t: LetterBox) => void }) {
  const queries: Record<LetterBox, Query<LetterRowData[]>> = { inbox: useLettersQuery('inbox'), drafts: useLettersQuery('drafts'), sent: useLettersQuery('sent') };
  const rows = (box: LetterBox) => (
    <RealBoundary q={queries[box]} what={LETTERS_WHAT[box]} empty={<p data-testid={`letters-empty-${box}`}>{LETTERS_EMPTY[box]}</p>}>
      {(list) => <ul aria-label={box} className="space-y-2">{list.map((l) => <LetterCard key={l.id} l={l} />)}</ul>}
    </RealBoundary>
  );
  const unreadN = queries.inbox.data?.filter((l) => l.unread).length;
  return (
    <Page testId="letters-page" title="Clarity Letters">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Tabs value={tab} onValueChange={(v) => onTab(v as LetterBox)}>
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2" data-testid="letters-header">
            <TabsList className="h-auto w-auto max-w-full justify-start overflow-x-auto rounded-none border-b p-0" data-testid="letter-tabs">
              <TabsTrigger value="inbox" aria-label={unreadN === undefined ? 'Inbox' : `Inbox, ${unreadN} unread`} className={LETTER_TAB_CLASS}>Inbox{unreadN === undefined ? '' : ` (${unreadN})`}</TabsTrigger>
              <TabsTrigger value="drafts" className={LETTER_TAB_CLASS}>Drafts</TabsTrigger>
              <TabsTrigger value="sent" className={LETTER_TAB_CLASS}>Published</TabsTrigger>
            </TabsList>
            {/* No production route creates a draft by itself (the draft is made by a write inside the Drafts tab): so it says Coming soon up front. */}
            <OutlineButton size="sm" className="mb-1 shrink-0 gap-1.5" onClick={() => toast('New Draft is coming soon.')} aria-label={`New Draft, ${COPY.comingSoon.toLowerCase()}`} data-testid="new-draft"><Plus className="h-4 w-4" />New Draft<span className="text-xs font-normal text-gray-500">{COPY.comingSoon}</span></OutlineButton>
          </div>
          {(['inbox', 'drafts', 'sent'] as const).map((b) => <TabsContent key={b} value={b} className="mt-4">{rows(b)}</TabsContent>)}
        </Tabs>
      </div>
    </Page>
  );
}

const EMPTY_FEED: FeedData = { stories: [], points: [], storyPoints: new Map(), pointStories: new Map() };

/** Positions taken on a card here are an overlay on the real card and are never written. */
const PositionsNote = () => <p className="px-1 text-xs text-gray-500" data-testid="prototype-note-positions">Not saved: prototype. A position you take on a card here is shown on this screen only.</p>;

/**
 * The production Next events / Groups widgets (HomeSideRail on a desktop, HomeTopBlock on a phone). They read their own data, so under
 * `?real=` they are not mounted at all: the forced state is drawn instead and no service is called, like every other real surface.
 */
function HomeWidget({ kind }: { kind: 'side' | 'top' }) {
  const forced = useRealOverride();
  /* The forced state goes through the same boundary and retry as every other real surface (the hook answers the override itself). */
  const q = useRealQuery<null>(async () => null, [], { emptyValue: null, isEmpty: () => true, enabled: forced !== null });
  if (forced) return <RealBoundary q={q} what="events and groups" empty={<p>No events scheduled yet.</p>}>{() => null}</RealBoundary>;
  return kind === 'side' ? <HomeSideRail /> : <HomeTopBlock />;
}

/** A feed filter in the spirit of production's search box: words match the text or any tag (a leading # is ignored). */
const feedMatches = (needle: string, text: string, tags: string[]) => {
  const n = needle.replace(/^#/, '');
  return !n || text.toLowerCase().includes(n) || tags.some((t) => t.toLowerCase().includes(n));
};

/**
 * Production's own links (a next event, a group, All events / All groups) lead to routes the prototype does not have:
 * the click is answered inside the prototype with the matching screen.
 */
function useRailLinks(go: { event: (slug: string) => void; group: (slug: string) => void; events: () => void; groups: () => void }) {
  return (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    const href = a.getAttribute('href') ?? '';
    const slug = href.split('/').filter(Boolean)[1];
    if (href === EVENTS_LIST_TO) go.events();
    else if (href === EVENTS_NAV_TO) go.groups();
    else if (href.startsWith(`${EVENTS_NAV_TO}/`) && slug) go.group(slug);
    else if (href.startsWith('/events/') && slug) go.event(slug);
    else openInApp(href);
  };
}

/**
 * Home = production's feed page (feed-page.tsx): the search field, Stories (default) and Points tabs with counts, the real
 * cards of the public feed, and the production widgets: Next events and Groups (HomeSideRail on a desktop, HomeTopBlock on a phone).
 */
function HomePage({ tab, onTab, onBrowse, go }: { tab: 'stories' | 'points'; onTab: (t: 'stories' | 'points') => void; onBrowse: () => void; go: Parameters<typeof useRailLinks>[0] }) {
  const { profileId } = useReal();
  const isDesktop = useIsDesktop();
  const [text, setText] = useState('');
  const needle = text.trim().toLowerCase();
  const q = useRealQuery<FeedData>(() => loadFeed(profileId), [profileId], { emptyValue: EMPTY_FEED, isEmpty: (d) => d.stories.length === 0 && d.points.length === 0 });
  const rail = useRailLinks(go);
  const tabBtn = (t: 'stories' | 'points', label: string) => (
    <button role="tab" aria-selected={tab === t} onClick={() => onTab(t)} className={`relative min-h-10 whitespace-nowrap px-2 py-2 text-sm font-medium transition-colors sm:px-4 ${tab === t ? 'text-blue-600' : 'text-muted-foreground hover:text-foreground'}`}>
      {label}{tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
    </button>
  );
  const nothing = (what: 'stories' | 'points') => (
    <div className="flex flex-col items-center gap-3 py-12 text-center" data-testid="home-empty">
      <p className="text-sm text-muted-foreground">{needle ? `No ${what} match “${text.trim()}”.` : `No ${what} yet. Join a group to see what its people share.`}</p>
      {!needle && <OutlineButton onClick={onBrowse}><Search className="h-4 w-4" />Browse groups</OutlineButton>}
    </div>
  );
  return (
    <Page testId="home-page" title="Home">
      <div className="mx-auto flex w-full max-w-5xl justify-center gap-8 px-4 py-6">
        <div className="w-full min-w-0 max-w-2xl">
          {!isDesktop && <div onClickCapture={rail} data-testid="home-top-widgets"><HomeWidget kind="top" /></div>}
          <div className="mb-4 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search stories and points..." aria-label="Search stories and points" className="h-10 pl-9 text-base md:text-sm" data-testid="home-search" />
            </div>
            {/* Production's header CTA: the existing /create page (new tab). */}
            <PrimaryButton asChild className="shrink-0 px-3 sm:px-4">
              <a href="/create" target="_blank" rel="noreferrer" aria-label="Share a Story" data-testid="share-a-story"><Plus className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Share a Story</span></a>
            </PrimaryButton>
          </div>
          <div className="mb-3"><PositionsNote /></div>
          <RealBoundary q={q} what="the feed" skeleton={<div data-testid="real-skeleton" role="status" aria-busy="true" aria-label="Loading the feed"><FeedSkeleton /></div>} empty={nothing(tab)}>
            {(d) => {
              const stories = d.stories.filter((s) => feedMatches(needle, s.content, s.tags ?? []));
              const points = d.points.filter((p) => feedMatches(needle, p.statement, p.tags ?? []));
              return (
                <>
                  <div role="tablist" className="mb-4 flex items-center gap-0 border-b border-border" data-testid="feed-tabs">
                    {tabBtn('stories', `Stories (${stories.length})`)}
                    {tabBtn('points', `Points (${points.length})`)}
                  </div>
                  <div role="tabpanel" className="space-y-4" data-testid={`feed-${tab}`}>
                    {tab === 'stories'
                      ? stories.map((s) => <div key={s.id} className="w-full"><RealStoryCard story={s} linkedPoints={d.storyPoints.get(s.id)} testId="feed-story" /></div>)
                      : points.map((p) => <div key={p.id} className="w-full"><RealPointCard point={p} linkedStories={d.pointStories.get(p.id)} testId="feed-point" /></div>)}
                    {(tab === 'stories' ? stories : points).length === 0 && nothing(tab)}
                  </div>
                </>
              );
            }}
          </RealBoundary>
        </div>
        {isDesktop && <div onClickCapture={rail} data-testid="home-side-widgets" className="w-72 shrink-0"><HomeWidget kind="side" /></div>}
      </div>
    </Page>
  );
}

/** The Events place: every public event, upcoming then past, as production's /events/list lists them (the same EventCard). */
function EventsPage({ onEvent, onBack }: { onEvent: (slug: string) => void; onBack: () => void }) {
  const { user } = useAuth();
  const q = useRealQuery<EventsList>(loadEventsList, [], { emptyValue: { upcoming: [], past: [] }, isEmpty: (d) => d.upcoming.length + d.past.length === 0 });
  const open = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    const slug = (a.getAttribute('href') ?? '').split('/').filter(Boolean)[1];
    if (slug) onEvent(slug); else openInApp(a.getAttribute('href'));
  };
  const grid = (label: string, list: EventsList['upcoming']) => list.length > 0 && (
    <section aria-label={label}>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{label} ({list.length})</h2>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">{list.map((ev) => <li key={ev.id}><EventCard event={ev} isLoggedIn={!!user} userId={user?.id} /></li>)}</ul>
    </section>
  );
  return (
    <Page testId="events-page" title="Events" onBack={onBack} mobileBack>
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6" onClickCapture={open}>
        <RealBoundary q={q} what="events" empty={<p>No events yet.</p>}>
          {(d) => <>{grid('Upcoming', d.upcoming)}{grid('Past', d.past)}</>}
        </RealBoundary>
      </div>
    </Page>
  );
}

/** Tools: production's 3-tab selector (event-links-menu.tsx LinksMenuTabs, not exported: its Radix Tabs copied) over production's buildLinksMenu entries. */
const LINK_TABS = [{ value: 'tools' as const, label: 'Tools' }, { value: 'points' as const, label: 'Points' }, { value: 'letters' as const, label: 'Letters' }];
function ToolsPage({ onBack }: { onBack: () => void }) {
  const entries = buildLinksMenu(null);
  const row = (e: LinksMenuEntry, k: string) => (
    <a key={k} href={e.to} target="_blank" rel="noreferrer" data-testid="event-links-entry" className={cn('flex min-h-11 items-center justify-between gap-3 rounded-lg border px-4 text-sm font-medium', e.featured ? 'border-blue-300 bg-blue-50 text-blue-700' : 'bg-white text-gray-900 hover:bg-gray-50')}>
      <span className="min-w-0 truncate">{e.label}</span>{e.hint && <span className="shrink-0 text-xs font-normal text-gray-500">{e.hint}</span>}
    </a>
  );
  return (
    <Page testId="tools-page" title="Tools" onBack={onBack} mobileBack>
      <div className="mx-auto w-full max-w-xl px-4 py-4">
        <Tabs defaultValue="tools" className="w-full">
          <div className="sticky top-0 z-10 bg-background pb-2">
            <TabsList className="grid h-12 w-full grid-cols-3" data-testid="event-links-tabs">
              {LINK_TABS.map((t) => <TabsTrigger key={t.value} value={t.value} className="h-10" data-testid={`event-links-tab-${t.value}`}>{t.label}</TabsTrigger>)}
            </TabsList>
          </div>
          {LINK_TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-0 flex flex-col gap-2" data-testid={`event-links-panel-${t.value}`}>
              {entries.filter((e) => e.group === t.value).map((e, i) => row(e, `${e.group}-${i}`))}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Page>
  );
}

function SettingsPage({ onBack }: { onBack: () => void }) {
  return (
    <Page testId="settings-page" title="Settings" onBack={onBack}>
      <p className="px-4 py-6 text-sm text-gray-600">Stand-in: production&apos;s settings, unchanged. <a href="/settings" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center text-blue-700 hover:underline">Open settings</a></p>
    </Page>
  );
}

/** Nobody signed in, or someone who is not a Bob or Dana test persona: the page offers the two personas. */
function SignedOut({ busy, error, signedInName, onSignIn }: { busy: ViewerId | null; error: string | null; signedInName?: string; onSignIn: (v: ViewerId) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center" data-testid="signed-out">
      <p className="text-lg font-semibold text-gray-900">{signedInName ? 'You are not signed in as a test persona.' : 'You are signed out.'}</p>
      <p className="max-w-md text-sm text-gray-600">This prototype reads the test project as one of its seeded personas. Sign in as one to continue.</p>
      <div className="flex flex-wrap justify-center gap-2">
        {LENSES.map((l, i) => (i === 0
          ? <PrimaryButton key={l.id} disabled={busy !== null} onClick={() => onSignIn(l.id)} data-testid={`sign-in-${l.id}`}>{busy === l.id ? `Signing in as ${l.label}…` : `Sign in as ${l.label}`}</PrimaryButton>
          : <OutlineButton key={l.id} disabled={busy !== null} onClick={() => onSignIn(l.id)} data-testid={`sign-in-${l.id}`}>{busy === l.id ? `Signing in as ${l.label}…` : `Sign in as ${l.label}`}</OutlineButton>))}
      </div>
      {error && <p role="alert" data-testid="sign-in-error" className="max-w-md text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}

/** A copy of profile-connections-page's structure ("My Partners"): the real AgreementRow per agreement the service returned; a row opens our 1:1 when the partner is a test persona. Resend and Cancel are never offered (they write and send mail). */
function PartnersPage({ onBack, onPartner, onInvite }: { onBack: () => void; onPartner: (p: PersonId) => void; onInvite: () => void }) {
  const { profileId, partners: q } = useReal();
  const invite = <PrimaryButton onClick={onInvite} data-testid="partners-invite">{COPY.invite}</PrimaryButton>;
  const open = (a: ClarityAgreement) => (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('a')) return;
    e.preventDefault(); e.stopPropagation();
    const other = a.creator?.profileId === profileId ? a.partner : a.creator;
    const p = personaFromSlug(other?.slug);
    if (p) onPartner(p); else openInApp(other?.slug ? `/p/${other.slug}` : null);
  };
  /* AgreementRow renders its own <li>, so each row sits in its own <ul> (a list item inside a list item is invalid markup). */
  const list = (rows: ClarityAgreement[]) => (
    <div className="space-y-0.5">
      {rows.map((a) => (
        <div key={a.id} className="flex items-center gap-2">
          <ul data-agreement={a.id} className="min-w-0 flex-1" onClickCapture={open(a)}><AgreementRow agreement={a} currentProfileId={profileId} /></ul>
          {/* Production's agreement page (sealed agreement, Download Image, Share): the row opens the chat, this opens the agreement. */}
          <Button asChild variant="outline" size="sm" className="min-h-10 shrink-0"><a href={`/agreements/${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer" data-testid="agreement-action">Agreement</a></Button>
        </div>
      ))}
    </div>
  );
  return (
    <Page testId="partners-page" title="Partners" onBack={onBack}>
      <div className="mx-auto mt-3 max-w-2xl px-4">
        {q.refreshFailed && (
          <div role="alert" data-testid="refresh-failed" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted px-3 py-2 text-sm text-gray-800">
            <span>Could not refresh your partners, so this list may be out of date.</span>
            <OutlineButton onClick={q.refresh}>Retry</OutlineButton>
          </div>
        )}
        <RealBoundary q={q} what="your partners" empty={<><p className="text-sm text-muted-foreground">No partners yet. Invite someone to get started.</p>{invite}</>}>
          {(d) => {
            const active = d.agreements.filter((a) => a.status === 'active');
            const pending = d.agreements.filter((a) => a.status === 'pending');
            return (
              <>
                <div className="mb-4 flex items-center justify-between"><h1 className="text-xl font-bold text-foreground">My Partners</h1>{invite}</div>
                <section aria-label="Partner Agreements" className="space-y-6">
                  {d.incoming.length > 0 && (
                    <div>
                      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Invited to sign ({d.incoming.length})</h2>
                      <ul className="space-y-0.5">{d.incoming.map((a) => (
                        <li key={a.id} data-testid="incoming-invite"><a href={`/agreements/${a.id}/accept?token=${encodeURIComponent(a.invitationToken)}`} target="_blank" rel="noreferrer" aria-label={`Invitation from ${a.creator?.name ?? 'someone'}`} className={cn('flex min-h-14 items-center gap-3 rounded-lg px-4 py-3', HOVER)}>
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{a.creator?.name ?? 'Someone'}</span><span className="block truncate text-xs text-muted-foreground">Invited you to co-sign</span></span>
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Review</span>
                        </a></li>
                      ))}</ul>
                    </div>
                  )}
                  {active.length > 0 && <div><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Active ({active.length})</h2>{list(active)}</div>}
                  {pending.length > 0 && <div><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{COPY.inviteSent} ({pending.length})</h2>{list(pending)}</div>}
                </section>
              </>
            );
          }}
        </RealBoundary>
      </div>
    </Page>
  );
}

/** Who an invite goes to: a person picked in the app, or an address someone typed. */
type Recipient = { kind: 'person'; id: PersonId } | { kind: 'email'; email: string };

/**
 * Invite partner: production's creation certificate (the same AgreementCertificate and its "Use suggested terms") around ONE
 * field, "Name or email". A person picked here is invited at their persona address; a typed address is checked FIRST.
 * SAFETY: `isSeededPersonaEmail` runs before anything else on Send. An address that is not a seeded persona is refused with an
 * inline message and no request is made at all (no profile lookup, no agreement, no mail). The terms are required, as in production.
 */
function PartnerInvitePage({ st, who, onBack, onSent }: { st: State; who?: PersonId; onBack: () => void; onSent: (p: PersonId) => void }) {
  const { name: myName } = useReal();
  const [recipient, setRecipient] = useState<Recipient | null>(who ? { kind: 'person', id: who } : null);
  const [q, setQ] = useState('');
  const [typedName, setTypedName] = useState('');
  const [terms, setTerms] = useState('');
  const [visibility, setVisibility] = useState<AgreementVisibility>('public'); // production's default
  const [termsError, setTermsError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const s = q.trim().toLowerCase();
  const typedEmail = s.includes('@') ? q.trim() : null;
  const people = (Object.keys(PEOPLE) as PersonId[]).filter((p) => p !== st.viewer && partnerState(st, p) === 'none' && (!s || PEOPLE[p].name.toLowerCase().includes(s) || PEOPLE[p].slug.includes(s)));
  const pickEmail = (email: string) => {
    const persona = PERSONA_IDS.find((id) => personaEmail(id) === email.toLowerCase());
    setRecipient(persona ? { kind: 'person', id: persona } : { kind: 'email', email });
    setProblem(null);
  };
  const email = recipient?.kind === 'person' ? personaEmail(recipient.id) : recipient?.email ?? '';
  const submit = async () => {
    if (!recipient) return;
    /* The safety gate comes first: for anything but a seeded persona nothing below this line runs, so no request is made. */
    if (!isSeededPersonaEmail(email)) { setProblem(COPY.inviteRefused); return; }
    const person = recipient.kind === 'person' ? recipient.id : PERSONA_IDS.find((id) => personaEmail(id) === email.toLowerCase())!;
    const name = PEOPLE[person].name;
    setTermsError(terms.trim() ? undefined : 'Terms cannot be empty');
    if (!terms.trim()) return;
    setBusy(true); setProblem(null);
    const r = await sendPartnerInvite({ email, personId: person, name, termsText: terms, visibility });
    setBusy(false);
    if (!r.ok) { setProblem(r.message); return; }
    onSent(person);
  };
  return (
    <Page testId="partner-invite-page" title={COPY.invite} onBack={onBack}>
      <div className="mx-auto max-w-3xl space-y-3 py-4">
        {!who && (
          <div className="px-4" data-testid="partner-picker">
            {recipient ? (
              <div className="flex min-h-12 items-center gap-3 rounded-lg border bg-white px-3">
                {recipient.kind === 'person' ? <Avatar person={recipient.id} size="sm" /> : <UserIcon className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate text-[15px] text-gray-900">{recipient.kind === 'person' ? PEOPLE[recipient.id].name : recipient.email}</span>
                <OutlineButton className="shrink-0" onClick={() => { setRecipient(null); setProblem(null); }}>Change</OutlineButton>
              </div>
            ) : (
              <>
                <label className="flex min-h-11 items-center gap-2 rounded-full bg-gray-100 px-3 text-gray-500">
                  <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" aria-label="Name or email" className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none md:text-sm" />
                </label>
                <ul aria-label="People" className="mt-2 overflow-hidden rounded-lg border bg-white">
                  {typedEmail && (
                    <li><button type="button" onClick={() => pickEmail(typedEmail)} data-testid="use-email" className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-gray-900', HOVER)}>Invite {typedEmail}</button></li>
                  )}
                  {people.map((p) => <PersonRow key={p} p={p} onPerson={(id) => { setRecipient({ kind: 'person', id }); setProblem(null); }} />)}
                  {people.length === 0 && !typedEmail && <li className="px-4 py-6 text-center text-sm text-gray-500">No one matches.</li>}
                </ul>
              </>
            )}
          </div>
        )}
        {recipient && (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <CertificatePageShell className="py-2">
              <AgreementCertificate variant="creation" agreementVersion={CURRENT_AGREEMENT_VERSION} creatorName={myName} creatorSignedAt={CREATED}
                partnerNameValue={recipient.kind === 'person' ? PEOPLE[recipient.id].name : typedName} partnerNameReadOnly={recipient.kind === 'person'}
                partnerNamePlaceholder="Full name of your partner" onPartnerNameChange={setTypedName}
                termsText={terms} termsPlaceholder={TERMS_PLACEHOLDER} termsError={termsError} onTermsChange={(t) => { setTerms(t); setTermsError(undefined); }}
                footer={
                  <div className="space-y-3">
                    {/* Production's Visibility choice (create-agreement-page VISIBILITY_OPTIONS), default Public, passed to createAgreement as is. */}
                    <fieldset>
                      <legend className="mb-2 block text-sm font-medium">Visibility</legend>
                      <div role="radiogroup" aria-label="Visibility" className="flex gap-2">
                        {([['public', 'Public', Globe, 'Anyone can view this agreement.'], ['private', 'Private', Lock, 'Only you and your partner can view this agreement.']] as const).map(([value, label, Icon, tip]) => (
                          <button key={value} type="button" role="radio" aria-checked={visibility === value} title={tip} onClick={() => setVisibility(value)}
                            className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium', visibility === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-input bg-background text-muted-foreground hover:bg-accent')}>
                            <Icon className="h-4 w-4" aria-hidden="true" />{label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    {problem && <p role="alert" data-testid="invite-problem" className="text-sm font-medium text-red-700">{problem}</p>}
                    <PrimaryButton type="submit" className="w-full" disabled={busy} data-testid="send-invite">{busy ? 'Sending…' : COPY.sendInvite}</PrimaryButton>
                  </div>
                } />
            </CertificatePageShell>
          </form>
        )}
      </div>
    </Page>
  );
}

/* ---------- sheets ---------- */

/**
 * Both sheets are the shared Radix `Dialog` (components/ui/dialog.tsx): focus moves in, is trapped and is handed back to the control
 * that opened it; the page behind is hidden from assistive tech; Esc and an outside press close it. (The shared `Drawer` was not
 * used: its phone branch is a plain portal with no focus handling at all, and its other branch is vaul, which needs a trigger.)
 * On a phone a sheet is anchored to the bottom; from `sm` it is a centred card.
 */
const SHEET_CLASS = 'inset-x-0 bottom-0 left-0 top-auto z-50 flex max-h-[85vh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-t-2xl border-0 bg-white p-0 data-[state=closed]:animate-none data-[state=open]:animate-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl';

/**
 * Where focus goes back to when a sheet closes: the control that was focused when it opened. (Radix only restores to a DialogTrigger,
 * and these sheets are opened from state, not from a trigger.)
 */
let lastOutsideMenu: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  /* The last control focused that is not a menu row: when a sheet is opened FROM a menu item the item unmounts with the menu, so this is the menu's trigger. */
  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && t !== document.body && !t.closest('[role="menu"]') && !t.closest('[role="dialog"]')) lastOutsideMenu = t;
  }, true);
}
function openerNow(): HTMLElement | null {
  const active = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);
  const usable = !!active && active !== document.body && !active.closest('[role="menu"]');
  return usable ? active : lastOutsideMenu;
}

function useGiveFocusBack() {
  const opener = useRef<HTMLElement | null>(openerNow());
  return (e: Event) => {
    e.preventDefault();
    const el = opener.current;
    if (el && el !== document.body && el.isConnected) el.focus();
  };
}

function Sheet({ label, title, onClose, children, wide = false }: { label: string; title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const giveFocusBack = useGiveFocusBack();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent hideCloseButton aria-label={label} aria-labelledby={undefined} aria-describedby={undefined} onCloseAutoFocus={giveFocusBack} className={cn(SHEET_CLASS, wide ? 'sm:max-w-lg' : 'sm:max-w-sm')}>
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <DialogTitle asChild><div className="min-w-0 font-semibold text-gray-900">{title}</div></DialogTitle>
          <button type="button" aria-label="Close" onClick={onClose} className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', HOVER)}><X className="h-5 w-5" /></button>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function ForwardFlow({ st, msgId, onDone, onClose }: { st: State; msgId: string; onDone: (to: string, note: string) => void; onClose: () => void }) {
  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const src = st.msgs.find((x) => x.id === msgId) ?? Object.values(st.comments).flat().find((x) => x.id === msgId);
  if (!src) return null;
  const target = to ? chatById(st, to) : undefined;
  if (target) {
    return (
      <Sheet label="Forward" onClose={onClose} title={<span className="flex items-center gap-2"><button type="button" aria-label="Back to chats" onClick={() => setTo(null)} className={cn('-ml-2 flex h-10 w-10 items-center justify-center rounded-full', HOVER)}><ArrowLeft className="h-5 w-5" /></button>Forward to {rowTitle(st, target)}</span>}>
        <div className="overflow-y-auto p-4" data-testid="forward-preview">
          <div className="rounded-xl border bg-gray-50 p-3">
            <p className="text-xs font-medium text-blue-700">{COPY.forwardedFrom} {PEOPLE[src.fwdFrom ?? src.who].name}</p>
            {src.text && <p className="mt-1 line-clamp-4 text-sm text-gray-900">{src.text}</p>}
            {src.voice && <VoiceNote secs={src.voice} />}
            {src.share && <ShareCard item={src.share} />}
            {repliesOf(st, src.id).length > 0 && <p className="mt-2 text-sm font-semibold text-blue-700" data-testid="forward-thread-note">{threadLabel(repliesOf(st, src.id).length)}, forwarded with it</p>}
          </div>
          <label className="mt-3 block text-sm text-gray-700">Add a note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border px-3 text-base outline-none focus:border-gray-500 md:text-sm" />
          </label>
        </div>
        <div className="border-t p-3"><PrimaryButton className="w-full" onClick={() => onDone(target.id, note)}><Forward className="h-4 w-4" />Send</PrimaryButton></div>
      </Sheet>
    );
  }
  const s = q.trim().toLowerCase();
  const chats = visibleChats(st).filter((c) => !s || rowTitle(st, c).toLowerCase().includes(s));
  return (
    <Sheet label="Forward to" onClose={onClose} title="Forward to">
      <div className="px-3 pt-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="min-h-11 w-full rounded-full bg-gray-100 px-4 text-base outline-none md:text-sm" /></div>
      <ul className="overflow-y-auto py-2">
        {chats.map((c) => <li key={c.id}><button type="button" onClick={() => setTo(c.id)} className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-left', HOVER)}><ChatAvatar st={st} chat={c} size="sm" /><span className="truncate text-[15px] text-gray-900">{rowTitle(st, c)}</span></button></li>)}
      </ul>
    </Sheet>
  );
}


/** The composer's Share (v15 #8, was 📎 Attach): MY points and stories (the ones I hold or wrote), each in its production card with Share beside it. */
function AttachDialog({ onPick, onClose }: { onPick: (s: Shareable) => void; onClose: () => void }) {
  const { profileId } = useReal();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'point' | 'story'>('point');
  const mine = useRealQuery<Shareable[]>(() => loadMyShareables(profileId), [profileId], { emptyValue: [], isEmpty: (l) => l.length === 0 });
  const items = mine.data ? filterShareables(mine.data, q, kind) : [];
  return (
    <Sheet wide label={COPY.shareTitle} onClose={onClose} title={COPY.shareTitle}>
      <div className="space-y-2 px-3 pt-3">
        <PositionsNote />
        <div role="tablist" aria-label="Kind" className="flex gap-1 border-b">
          {(['point', 'story'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={cn('min-h-11 border-b-2 px-4 text-sm font-medium', kind === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900')}>{k === 'point' ? 'Points' : 'Stories'}</button>)}
        </div>
        <label className="flex min-h-11 items-center gap-2 rounded-full bg-gray-100 px-3 text-gray-500">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words or #tags" aria-label="Search points and stories" className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none md:text-sm" />
        </label>
      </div>
      <div className="min-h-0 overflow-y-auto">
        <RealBoundary q={mine} what="your points and stories" empty={<p>You have no points or stories to share yet.</p>}>
          {() => (
            <ul className="space-y-3 p-3" data-testid="attach-results" data-kind={kind}>
              {items.map((s) => (
                <li key={s.id} className="group relative" data-testid="share-option">
                  <ShareCard item={s} full />
                  {/* v16: Share is the picker's one solid button: it shows on hover on a desktop, always on a touch screen. */}
                  <PrimaryButton size="sm" onClick={() => onPick(s)} aria-label={`${COPY.share} ${s.title}`} data-testid="share-button"
                    className="absolute right-3 top-3 z-10 min-h-10 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">{COPY.share}</PrimaryButton>
                </li>
              ))}
              {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-gray-500">{kind === 'point' ? 'No points match.' : 'No stories match.'} Try fewer words or another #tag.</li>}
            </ul>
          )}
        </RealBoundary>
      </div>
    </Sheet>
  );
}

const InviteLink = ({ onClick }: { onClick: () => void }) => (
  <PrimaryButton onClick={onClick} data-testid="invite-link"><Handshake className="h-4 w-4" aria-hidden="true" />{COPY.invite}</PrimaryButton>
);

/* ---------- the prototype ---------- */

/**
 * The prototype only runs against the Supabase TEST project. Anywhere else (prod, a local stack, a missing URL) this notice stands
 * in for the whole prototype, and because nothing below it is mounted no read, RSVP, invite or sign-in can be made.
 */
export function ClarityChatV16() {
  if (!onTestProject()) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center" data-testid="wrong-project" role="alert">
        <p className="text-lg font-semibold text-gray-900">The v16 prototype only runs on the Supabase test project.</p>
        <p className="max-w-md text-sm text-gray-600">This build is not pointed at it, so the prototype is switched off and nothing was read or written. Point .env.local at the test project and restart the dev server.</p>
      </div>
    );
  }
  return <PrototypeV16 />;
}

function PrototypeV16() {
  const { loc, go, back, mode } = useNav();
  const auth = useAuth();
  const isDesktop = useIsDesktop();
  /* The viewer is whoever is signed in. A Bob or Dana persona gets a chat world; anyone else (or nobody) gets the signed-out screen. */
  const authViewer = viewerOf(auth.user);
  const checking = auth.isLoading || auth.sessionChecked === false;
  const fresh = (viewer: ViewerId = authViewer ?? 'bob') => {
    const st0 = initialState({ viewer, empty: mode === 'empty', fail: mode === 'fail', noPartners: mode === 'nopartners', seedPartners: false });
    return mode === 'fail' && viewer === 'bob' ? openChat(st0, 'dm-bob-alice') : st0;
  };
  const [stRaw, setSt] = useState<State>(() => fresh());
  /* The chat state follows the session: when the signed-in persona changes, the lens changes with it (no flicker, no reset of the mock chats). */
  const st: State = authViewer && stRaw.viewer !== authViewer ? { ...stRaw, viewer: authViewer } : stRaw;
  const [tab, setTab] = useState<Tab>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Record<string, string | undefined>>({});
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [attach, setAttach] = useState<string | null>(null);
  const [staged, setStaged] = useState<Record<string, Shareable | undefined>>({});
  const [leaving, setLeaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [sheet, setSheet] = useState(false);
  /* The sidebar's Search asks for the cursor in the chat list's search field, which exists once Chats has rendered. */
  const wantSearch = useRef(false);
  const [signIn, setSignIn] = useState<{ busy: ViewerId | null; error: string | null }>({ busy: null, error: null });
  /* The persona session lives on the app's shared supabase client, so it must not outlive this page: leave the route or the tab and a persona is signed out. */
  const personaNow = useRef(false);
  personaNow.current = personaFromSlug(auth.user?.slug) !== null;
  useEffect(() => {
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; } // StrictMode's mount, unmount, mount must not sign anyone out
    const out = () => { abortPendingSignIn(); if (personaNow.current) void supabase.auth.signOut({ scope: 'local' }); };
    window.addEventListener('pagehide', out);
    return () => { window.removeEventListener('pagehide', out); leaveTimer = setTimeout(() => { leaveTimer = null; out(); }, 0); };
  }, []);

  const view = loc.view ?? 'chats';
  const place: Place | null = (PLACES as readonly string[]).includes(view) ? (view as Place) : null;
  /* On a phone Events and Tools live under Profile (the sheet), so that tab is the one lit on them. */
  const mobileTab: MobileTab | null = sheet || view === 'events' || view === 'tools' ? 'me' : (MOBILE_TABS as readonly string[]).includes(view) ? (view as MobileTab) : ['group', 'event', 'directory', 'join'].includes(view) ? 'groups' : null;

  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.scrollbarGutter;
    root.style.scrollbarGutter = 'auto';
    return () => { root.style.scrollbarGutter = before; };
  }, []);
  /* `?state=fail` opens on the chat holding the failed send. */
  useEffect(() => { if (mode === 'fail' && !loc.chat && view === 'chats') go({ view: 'chats', chat: 'dm-bob-alice' }, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* Opening a chat (by a click, Back or a deep link) reads it. */
  const urlChat = loc.chat;
  useEffect(() => { if (urlChat) setSt((s) => (unreadOf(s, urlChat) ? openChat(s, urlChat) : s)); }, [urlChat, st.viewer]);
  useEffect(() => {
    const field = wantSearch.current ? document.getElementById(SEARCH_ID) : null;
    if (field) { field.focus(); wantSearch.current = false; }
  });
  /* A different persona signed in: fresh screens for the new lens (the mock chats themselves persist, as the old lens switch did). */
  const lens = useRef(authViewer);
  useEffect(() => {
    if (!authViewer) return;
    const before = lens.current;
    lens.current = authViewer;
    if (before === authViewer) return;
    setSt((cur) => ({ ...cur, viewer: authViewer }));
    /* The FIRST time auth resolves (nobody -> a persona) is a load, not a lens change: a reload or a deep link keeps the view it opened on. */
    if (!before) return;
    setTab('all'); setShowArchived(false); setQ(''); closeOverlays(); go({ view: 'chats' }, true);
  }, [authViewer]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (f: (s: State) => State) => setSt((cur) => f(authViewer && cur.viewer !== authViewer ? { ...cur, viewer: authViewer } : cur));
  const key = (k: string) => `${st.viewer}:${k}`;
  const input = (k: string) => inputs[key(k)] ?? '';
  const setInput = (k: string) => (v: string) => setInputs((cur) => ({ ...cur, [key(k)]: v }));
  const closeOverlays = () => { setForwarding(null); setAttach(null); setLeaving(null); setDeleting(null); setRenaming(false); setSheet(false); };

  const reset = (viewer: ViewerId = st.viewer) => {
    /* What the real services said (groups, seats, event facts, partners) is not chat-mock state: Reset keeps it. */
    setSt((cur) => ({ ...fresh(viewer), realGroups: cur.realGroups, realGoing: cur.realGoing, realEvents: cur.realEvents, realPartners: cur.realPartners })); setTab('all'); setShowArchived(false); setQ(''); setInputs({}); setReplyTo({}); setStaged({}); closeOverlays(); go({}, true);
  };
  const doSignIn = async (id: ViewerId) => {
    abortPendingSignIn();
    const mine = new AbortController();
    pendingSignIn = mine;
    setSignIn({ busy: id, error: null });
    const r = await signInAsPersona(id, mine.signal);
    if (pendingSignIn === mine) pendingSignIn = null;
    if (!mine.signal.aborted) setSignIn({ busy: null, error: r.ok ? null : r.error });
  };

  const open = (chatId: string) => go({ view: 'chats', chat: chatId });
  const replyExtra = (chatId: string): Partial<Msg> => {
    const id = replyTo[key(chatId)];
    const q2 = id ? st.msgs.find((x) => x.id === id) ?? Object.values(st.comments).flat().find((x) => x.id === id) : undefined;
    return q2 ? { quote: { who: q2.who, text: summary(q2) } } : {};
  };
  const clearReply = (chatId: string) => setReplyTo((cur) => ({ ...cur, [key(chatId)]: undefined }));
  const showProfile = (person: PersonId) => go({ view: 'profile', person });
  const message = (person: PersonId) => {
    const r = dmWith(st, person);
    setQ('');
    if (!r) { go({ view: 'chats', with: person }); return; }
    setSt(r.next); open(r.chatId);
  };
  const openGroup = (slug: string) => go({ view: 'group', group: slug });
  const openEvent = (eventSlug: string, groupSlug?: string) => go({ view: 'event', event: eventSlug, group: groupSlug });
  /* The chat mock's event header opens the real event seeded under that mock id, when there is one. */
  const openChatEvent = (mockEventId: string) => go({ view: 'event', event: `${CHAT_EVENT_REF}${mockEventId}`, group: EVENTS.find((e) => e.id === mockEventId)?.groupId });
  const invite = (person?: PersonId) => go({ view: 'invite', with: person });
  const placeGo = (p: Place | MobileTab) => {
    if (p === 'me') { setSheet((on) => !on); return; }
    setSheet(false);
    if (p === 'chats') setShowArchived(false);
    go({ view: p });
  };
  const doClarify = (msgId: string) => { set((s) => clarify(s, msgId)); open(mirrorChatId(st.viewer)); };
  const menu: MenuActions = {
    onProfile: () => showProfile(st.viewer), onPartners: () => go({ view: 'partners' }), onSettings: () => go({ view: 'settings' }), onTools: () => go({ view: 'tools' }), onInvite: () => invite(), onEvents: () => go({ view: 'events' }),
    onLogOut: () => { closeOverlays(); void auth.signOut({ scope: 'local' }); },
  };

  const archivedEmpty = archivedChats(st).length === 0;
  useEffect(() => { if (showArchived && archivedEmpty) setShowArchived(false); }, [showArchived, archivedEmpty]);

  const chatParam = view === 'chats' ? loc.chat : undefined;
  const openChatObj = chatParam ? visibleChats(st).find((c) => c.id === chatParam) : undefined;
  const liveChat = openChatObj && eventOf(openChatObj)?.live && canSee(st.viewer, openChatObj) ? openChatObj.id : null;
  const pendingFor = st.invites[st.viewer][0];
  const strip = (
    <Strip viewer={authViewer} personaName={auth.user?.name} signedInName={auth.user?.name} busy={signIn.busy} error={authViewer ? signIn.error : null} onSignIn={doSignIn} onReset={() => reset()}
      onLive={liveChat && liveLinesLeft(st, liveChat) > 0 ? () => set((s) => openChat(nextLiveLine(s, liveChat), liveChat)) : undefined}
      onAccept={pendingFor ? () => { set((s) => acceptInvite(s, pendingFor)); toast(`${PEOPLE[pendingFor].name} accepted (mock).`); } : undefined}
      acceptLabel={pendingFor ? `${PEOPLE[pendingFor].name.split(' ')[0]} accepts invite (mock)` : undefined} />
  );

  const tabs = tabsFor(st);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'all';
  const inArchived = showArchived && archivedChats(st).length > 0;
  const rows = inArchived ? archivedChats(st) : chatsInTab(st, activeTab);
  const results = q.trim() ? search(st, q) : null;
  const archivedCount = archivedChats(st).length;
  const archivedUnread = archivedUnreadCount(st);
  const pickFolder = (t: Tab) => { setTab(t); setShowArchived(false); };
  const toggleArchive = (c: Chat) => {
    if (isArchived(st, c.id)) { set((s) => unarchive(s, c.id)); return; }
    set((s) => archive(s, c.id));
    /* Review #7: every archive (swipe or menu) can be undone from its toast. */
    toast(`Archived ${rowTitle(st, c)}`, { action: { label: 'Undo', onClick: () => set((s) => unarchive(s, c.id)) } });
  };
  const row = (c: Chat, inSection = false) => <ChatRow key={c.id} st={st} chat={c} active={c.id === chatParam} archived={inArchived} inSection={inSection} onOpen={() => { setQ(''); open(c.id); }} onArchive={() => toggleArchive(c)} />;
  const sections = groupSections(st);
  const showSections = !inArchived && activeTab === 'groups';

  const list = (
    <>
      <header className="flex shrink-0 items-center gap-1 px-2 pb-2 pt-2 lg:px-3">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-gray-100 px-3 text-gray-500">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <input id={SEARCH_ID} value={q} onChange={(e) => setQ(e.target.value)} placeholder={COPY.search} aria-label="Search" className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none md:text-sm" />
          {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="flex h-10 w-10 items-center justify-center"><X className="h-4 w-4" /></button>}
        </label>
      </header>
      {!results && !inArchived && <FolderTabs folders={tabs} active={activeTab} onPick={pickFolder} />}
      {inArchived && (
        <div className="flex min-h-12 shrink-0 items-center gap-1 border-b px-2"><button type="button" aria-label="Back to chats" onClick={() => setShowArchived(false)} className={cn('flex h-11 w-11 items-center justify-center rounded-full', HOVER)}><ArrowLeft className="h-5 w-5" /></button><h2 className="font-semibold text-gray-900">{COPY.archived}</h2></div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {results ? (
          <SearchResults st={st} results={results} onChat={(id) => { setQ(''); open(id); }} onPerson={showProfile} onMessage={message} onInvite={() => { setQ(''); invite(); }} />
        ) : st.chats.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" data-testid="empty-list">
            <p className="text-[15px] text-gray-700">{COPY.emptyList}</p>
            <InviteLink onClick={() => invite()} />
            <OutlineButton onClick={() => go({ view: 'directory' })}><Search className="h-4 w-4" />Browse groups</OutlineButton>
          </div>
        ) : showSections ? (
          <div data-testid="group-sections" className="pb-4">
            <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{COPY.channels}</h2>
            {sections.map((g) => (
              <section key={g.groupId} aria-label={g.name}>
                <div className="flex min-h-10 items-center gap-2 px-3 pt-2" data-testid="group-section-header">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700">{g.name}</span>
                </div>
                <ul aria-label={`${g.name} channels`}>{g.chats.map((c) => row(c, true))}</ul>
              </section>
            ))}
          </div>
        ) : (
          <ul aria-label="Chats" data-testid="chat-rows" className="pb-4">
            {!inArchived && activeTab === 'all' && archivedCount > 0 && (
              <li><button type="button" onClick={() => setShowArchived(true)} data-testid="archived-row" className={cn('flex min-h-[60px] w-full items-center gap-3 px-3 text-left', HOVER)}><span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-gray-600"><Archive className="h-5 w-5" aria-hidden="true" /></span><span className="flex-1 text-[15px] font-semibold text-gray-900">{COPY.archived}</span>{archivedUnread > 0 && <span className="text-xs font-semibold text-blue-700" aria-label={`${archivedUnread} archived chats with unread`} data-testid="archived-unread">{archivedUnread}</span>}</button></li>
            )}
            {rows.map((c) => row(c))}
            {rows.length === 0 && activeTab === 'partners' && !inArchived && (
              <li className="flex flex-col items-center gap-3 px-6 py-12 text-center" data-testid="empty-partners"><Handshake className="h-8 w-8 text-gray-400" aria-hidden="true" /><p className="text-sm text-gray-600">{COPY.noPartners}</p><InviteLink onClick={() => invite()} /></li>
            )}
            {rows.length === 0 && activeTab === 'unread' && !inArchived && <li className="px-6 py-12 text-center text-sm text-gray-500">No unread chats.</li>}
          </ul>
        )}
      </div>
    </>
  );

  const chatBack = () => back({ view: 'chats' });
  const chatMain = (() => {
    if (loc.with && !PEOPLE[loc.with as PersonId]) return <ChatUnavailable onBack={chatBack} />;
    if (loc.with) return <NoChatYet st={st} person={loc.with as PersonId} onBack={chatBack} onPerson={showProfile} onMessage={() => message(loc.with as PersonId)} />;
    const chat = openChatObj;
    /* A link to a chat that does not exist, or that this person cannot see (an event channel needs a seat): say so, with a Back, at every width. */
    if (!chat && chatParam) return <ChatUnavailable onBack={chatBack} />;
    if (!chat) return <div className="hidden h-full items-center justify-center bg-gray-50 lg:flex" data-testid="empty-main"><span className="rounded-full bg-white px-3 py-1 text-sm text-gray-500 shadow-sm">{COPY.selectChat}</span></div>;
    if (loc.members) return <Members chat={chat} onBack={() => back({ view: 'chats', chat: chat.id })} onPerson={showProfile} />;
    /* A thread id that is not a post of this chat is ignored: the conversation stays on screen. */
    const threadId = loc.thread && st.msgs.some((x) => x.id === loc.thread && x.chatId === chat.id) ? loc.thread : undefined;
    const openThread = (postId: string) => go({ view: 'chats', chat: chat.id, thread: postId });
    const closeThread = () => back({ view: 'chats', chat: chat.id });
    const chatView = (
      <ChatView
        st={st} chat={chat} input={input(chat.id)} onInput={setInput(chat.id)} replyTo={replyTo[key(chat.id)]} threadId={threadId}
        onBack={chatBack} onPerson={showProfile}
        onMembers={() => go({ view: 'chats', chat: chat.id, members: '1' })}
        onGroupPage={() => chat.groupId && openGroup(chat.groupId)}
        onEvent={openChatEvent} onPartners={() => go({ view: 'partners' })} onOrigin={open}
        onLeave={() => setLeaving(chat.groupId!)}
        onInvite={(p) => invite(p)}
        onInviteLive={() => toast('Inviting to Clarity Live from a chat is coming soon (mock).')}
        onRename={() => setRenaming(true)}
        onReply={(m) => setReplyTo((cur) => ({ ...cur, [key(chat.id)]: m.id }))}
        onCancelReply={() => clearReply(chat.id)}
        onThread={(m) => openThread(m.id)}
        onClarify={doClarify}
        onMarkUnread={(id) => set((s) => markUnread(s, id))}
        onForward={setForwarding} onRetry={(id) => set((s) => retry(s, id))}
        onEdit={(id, t) => set((s) => editMsg(s, id, t))} onDelete={setDeleting}
        onAttach={() => setAttach(chat.id)}
        staged={staged[key(chat.id)]} onUnstage={() => setStaged((cur) => ({ ...cur, [key(chat.id)]: undefined }))}
        onVoice={(secs) => { if (secs >= 1) { set((s) => sendVoice(s, chat.id, secs, replyExtra(chat.id))); clearReply(chat.id); } }}
        onClaim={(name) => set((s) => claimMirror(s, name))}
        onSend={(text) => {
          const share = staged[key(chat.id)];
          set((s) => send(s, chat.id, text, { ...replyExtra(chat.id), ...(share ? { share } : {}) }));
          clearReply(chat.id);
          setStaged((cur) => ({ ...cur, [key(chat.id)]: undefined }));
        }}
      />
    );
    if (!threadId) return chatView;
    return (
      <div className="flex h-full min-h-0">
        <div className="hidden min-w-0 flex-1 lg:flex lg:flex-col">{chatView}</div>
        <Thread st={st} chat={chat} postId={threadId} input={input(`t:${threadId}`)} onInput={setInput(`t:${threadId}`)} onClose={closeThread} onPerson={showProfile}
          onSend={(t) => set((s) => comment(s, threadId, t))} onVoice={(secs) => secs >= 1 && set((s) => comment(s, threadId, '', { voice: Math.round(secs) }))}
          onForward={setForwarding} onRetry={(id) => set((s) => retry(s, id))} onEdit={(id, t) => set((s) => editMsg(s, id, t))} onDelete={setDeleting} onClarify={doClarify}
          onMarkUnread={(id) => set((s) => markUnread(s, id))} onOrigin={open} />
      </div>
    );
  })();

  const groupTab = loc.tab as GroupTab | undefined;
  const detailOpen = (view === 'chats' && (!!chatParam || !!loc.with)) || !['home', 'chats', 'letters', 'tools', 'groups', 'events', 'group', 'event', 'directory'].includes(view);
  const content = (() => {
    if (view === 'profile' && loc.person && PEOPLE[loc.person as PersonId]) {
      const person = loc.person as PersonId;
      return <Profile st={st} person={person} onBack={() => back({ view: 'chats' })} onMessage={() => message(person)} onInvite={() => invite(person)} />;
    }
    if (view === 'home') {
      return <HomePage tab={loc.tab === 'points' ? 'points' : 'stories'} onTab={(t) => go({ view: 'home', tab: t === 'stories' ? undefined : t }, true)} onBrowse={() => go({ view: 'directory' })}
        go={{ event: (slug) => openEvent(slug), group: openGroup, events: () => go({ view: 'events' }), groups: () => go({ view: 'directory' }) }} />;
    }
    if (view === 'events') return <EventsPage onEvent={(slug) => openEvent(slug)} onBack={() => back({ view: 'chats' })} />;
    if (view === 'tools') return <ToolsPage onBack={() => back({ view: 'chats' })} />;
    if (view === 'settings') return <SettingsPage onBack={() => back({ view: 'chats' })} />;
    if (view === 'partners') return <PartnersPage onBack={() => back({ view: 'chats' })} onPartner={message} onInvite={() => invite()} />;
    if (view === 'invite') {
      const who = loc.with && PEOPLE[loc.with as PersonId] ? (loc.with as PersonId) : undefined;
      return <PartnerInvitePage key={who ?? 'new'} st={st} who={who} onBack={() => back({ view: 'chats' })} onSent={(p) => {
        set((s) => invitePartner(s, p));
        partnersQ.refresh();
        toast(`${COPY.inviteSent} to ${PEOPLE[p].name}.`);
        back({ view: 'chats' });
      }} />;
    }
    if (view === 'letters') return <LettersPage tab={(loc.tab as LetterBox | undefined) ?? 'inbox'} onTab={(t) => go({ view: 'letters', tab: t === 'inbox' ? undefined : t }, true)} />;
    if (view === 'groups') return <GroupsPage st={st} onGroup={openGroup} onBrowse={() => go({ view: 'directory' })} />;
    if (view === 'directory') return <DirectoryPage st={st} onBack={() => back({ view: 'groups' })} onGroup={openGroup} />;
    if (view === 'group' && loc.group) {
      const gid = loc.group;
      return <GroupPage st={st} slug={gid} tab={groupTab} onTab={(t) => go({ view: 'group', group: gid, tab: t }, true)} onBack={() => back({ view: 'directory' })}
        onEvent={openEvent} onChannel={open} onPerson={showProfile} onJoin={() => go({ view: 'join', group: gid })} onLeave={() => setLeaving(gid)} />;
    }
    if (view === 'join' && loc.group) {
      const gid = loc.group;
      return <JoinPage st={st} slug={gid} onBack={() => back({ view: 'group', group: gid })} onJoined={(name) => { set((s) => joinGroup(s, gid, false)); toast(`Not saved: prototype. Joined ${name} for this screen only.`); back({ view: 'group', group: gid }); }} />;
    }
    if (view === 'event' && loc.event) {
      /* Back: history, or (a deep link) the event's own group when the URL names it, else the directory. */
      return <EventPage key={loc.event} st={st} slug={loc.event} groupHint={loc.group} onBack={() => back(loc.group ? { view: 'group', group: loc.group } : { view: 'directory' })}
        onGroup={(g) => (g ? openGroup(g) : go({ view: 'directory' }))} onChat={open} onPerson={showProfile} />;
    }
    const chatOpen = !!chatParam || !!loc.with;
    return (
      <>
        <section aria-label="Chat list" data-testid="chat-list" className={cn('min-w-0 flex-col border-r lg:flex lg:w-[360px] lg:shrink-0', chatOpen ? 'hidden' : 'flex w-full')}>{list}</section>
        <main className={cn('min-w-0 flex-1 flex-col lg:flex', chatOpen ? 'flex' : 'hidden')}>{chatMain}</main>
      </>
    );
  })();

  function leave(groupId: string) {
    const name = groupName(groupId);
    set((s) => leaveGroup({ ...s, joined: { ...s.joined, [s.viewer]: s.joined[s.viewer].filter((g) => g !== groupId) } }, groupId, true));
    go({ view: 'chats' }, true);
    toast(`Not saved: prototype. Left ${name} for this screen only.`);
  }

  const profileId = auth.user?.id ?? '';
  const groupsQ = useRealQuery<GroupsDirectory>(loadGroupsDirectory, [profileId], {
    emptyValue: { orgs: [], memberCounts: {}, participation: {}, myOrgIds: [], eventSummaries: {} }, isEmpty: (d) => d.orgs.length === 0, enabled: !!authViewer && !!profileId,
  });
  /* The viewer's real memberships feed the chat world (General channels, the messaging rule, Leave group). */
  const groupsKey = groupsQ.status === 'ready' && groupsQ.data ? JSON.stringify(groupsQ.data.orgs.filter((o) => groupsQ.data!.myOrgIds.includes(o.id)).map((o) => o.slug).sort()) : 'null';
  useEffect(() => {
    const next = JSON.parse(groupsKey) as string[] | null;
    setSt((cur) => (JSON.stringify(cur.realGroups) === groupsKey ? cur : { ...cur, realGroups: next }));
  }, [groupsKey]);
  const partnersQ = useRealQuery<PartnersData>(() => loadPartners({ id: profileId, email: auth.user?.email ?? null }), [profileId, auth.user?.email], {
    emptyValue: { agreements: [], incoming: [] }, isEmpty: (d) => d.agreements.length + d.incoming.length === 0, enabled: !!authViewer && !!profileId,
  });
  /* The partner states (Invite sent / Partner) come from the agreements the service returned. */
  const partnerKey = JSON.stringify(partnersQ.data ? partnerStatesFrom(partnersQ.data, profileId) : {});
  useEffect(() => {
    const next = JSON.parse(partnerKey) as State['realPartners'];
    setSt((cur) => (JSON.stringify(cur.realPartners) === partnerKey ? cur : { ...cur, realPartners: next }));
  }, [partnerKey]);
  /* The viewer's real seats: event channels open from these, so a seat reserved or cancelled before this visit is already reflected. */
  const eventsQ = useRealQuery<Record<string, MyEvent>>(() => loadMyEvents(profileId), [profileId], { emptyValue: {}, isEmpty: () => false, enabled: !!authViewer && !!profileId });
  const eventsKey = JSON.stringify(eventsQ.data ?? {});
  useEffect(() => {
    const mine = JSON.parse(eventsKey) as Record<string, MyEvent>;
    const realGoing = Object.fromEntries(Object.entries(mine).map(([id, e]) => [id, e.going]));
    const realEvents = Object.fromEntries(Object.entries(mine).map(([id, e]) => [id, { name: e.name, when: e.when, day: e.day, today: e.today }]));
    setSt((cur) => (JSON.stringify(cur.realEvents) === JSON.stringify(realEvents) && JSON.stringify(cur.realGoing) === JSON.stringify(realGoing) ? cur : { ...cur, realGoing, realEvents }));
  }, [eventsKey]);
  const isAdmin = useIsAdmin(authViewer ? profileId : undefined);
  const groupName = (slug: string) => groupsQ.data?.orgs.find((o) => o.slug === slug)?.name ?? GROUPS.find((g) => g.id === slug)?.name ?? slug;
  /* A real RSVP keeps the chat mock's seat for the event seeded under the same mock id in step, so its channel opens or closes with it. */
  const onRsvp = (eventSlug: string, going: boolean) => {
    const mockId = chatEventOf(eventSlug);
    if (mockId) set((s) => (isGoing(s, mockId) === going ? s : toggleRsvp(s, mockId)));
  };
  const real: RealContext = { profileId, name: auth.user?.name ?? PEOPLE[st.viewer].name, email: auth.user?.email ?? null, isAdmin, groups: groupsQ, partners: partnersQ, onRsvp };
  const cardCtx: CardCtx = {
    st, viewerId: profileId, onOpen: openInApp,
    onPosition: (id, p, server) => { set((s) => setPosition(s, id, p, server)); toast('Not saved: prototype. Your position is shown here only.'); },
    onDetails: (kind, id) => openInApp(`/${kind}/${encodeURIComponent(id)}`),
    onSlug: (slug) => { const p = personaFromSlug(slug); if (p) showProfile(p); else openInApp(`/p/${encodeURIComponent(slug)}`); },
  };
  const signedOut = !authViewer;
  return (
    <TooltipProvider delayDuration={300}>
      {/* Production's own switch (P1336) for "links leave in a new tab": every in-app path a point card or a nested card opens leaves in a new tab, so the persona session stays. */}
      <LinksInNewTabContext.Provider value>
      <Cards.Provider value={cardCtx}>
      <RealCtx.Provider value={real}>
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-white" data-testid="v16-app" data-layout={isDesktop ? 'desktop' : 'mobile'}>
        {strip}
        {checking ? <div className="flex-1" data-testid="auth-checking"><RealSkeleton what="your session" /></div>
          : signedOut ? <SignedOut busy={signIn.busy} error={signIn.error} signedInName={auth.user?.name} onSignIn={doSignIn} /> : (
          <div className="flex min-h-0 flex-1">
            {isDesktop && <Sidebar st={st} viewer={st.viewer} name={real.name} place={place} tools={view === 'tools'} a={menu} onPlace={placeGo} onHome={() => go({ view: 'home' })}
              onSearch={() => { wantSearch.current = true; go({ view: 'chats' }); }} onInvite={() => invite()} onTools={() => go({ view: 'tools' })} />}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1" data-testid="main-area" data-view={view}>{content}</div>
              {!isDesktop && !detailOpen && <BottomTabs st={st} active={mobileTab} onTab={placeGo} />}
            </div>
          </div>
        )}
      </div>
      {sheet && !isDesktop && (
        <BottomSheet label="Profile menu" onClose={() => setSheet(false)}>
          <div role="menu" aria-label="My account" data-testid="me-menu"><ProfileMenuItems a={menu} onPick={(f) => () => { setSheet(false); f(); }} phone /></div>
        </BottomSheet>
      )}
      {forwarding && (
        <ForwardFlow st={st} msgId={forwarding} onClose={() => setForwarding(null)} onDone={(to, note) => {
          set((s) => forward(s, forwarding, to, note)); setForwarding(null); open(to);
          toast(`Forwarded to ${rowTitle(st, chatById(st, to)!)}`);
        }} />
      )}
      {attach && <AttachDialog onClose={() => setAttach(null)} onPick={(sh) => { setStaged((cur) => ({ ...cur, [key(attach)]: sh })); setAttach(null); }} />}
      {renaming && <RenameMirror initial={st.mirror[st.viewer] ?? defaultMirrorName(st.viewer)} onClose={() => setRenaming(false)} onSave={(n) => { set((s) => renameMirror(s, n)); setRenaming(false); }} />}
      {leaving && (
        <Sheet label="Leave group" onClose={() => setLeaving(null)} title={`Leave ${groupName(leaving)}?`}>
          <p className="px-4 py-4 text-sm text-gray-700">You will lose its {COPY.general} channel. Event channels follow your RSVPs. You can rejoin from the group page.</p>
          <p className="mx-4 mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-gray-800" data-testid="prototype-note">Not saved: prototype. Leaving changes this screen only; nothing is written to the group.</p>
          <div className="flex gap-2 border-t p-3">
            <OutlineButton className="min-h-11 flex-1" onClick={() => setLeaving(null)}>Cancel</OutlineButton>
            <Button variant="destructive" className="min-h-11 flex-1" onClick={() => { const g = leaving; setLeaving(null); leave(g); }}>Leave</Button>
          </div>
        </Sheet>
      )}
      {deleting && (
        <Sheet label="Delete message" onClose={() => setDeleting(null)} title="Delete message?">
          <p className="px-4 py-4 text-sm text-gray-700">It disappears for everyone in this chat. This cannot be undone.</p>
          <div className="flex gap-2 border-t p-3">
            <OutlineButton className="min-h-11 flex-1" onClick={() => setDeleting(null)}>Cancel</OutlineButton>
            <Button variant="destructive" className="min-h-11 flex-1" onClick={() => { const id = deleting; setDeleting(null); set((s) => deleteMsg(s, id)); if (loc.thread === id) back({ view: 'chats', chat: chatParam }); }}>Delete</Button>
          </div>
        </Sheet>
      )}
      <Toaster />
      </RealCtx.Provider>
      </Cards.Provider>
      </LinksInNewTabContext.Provider>
    </TooltipProvider>
  );
}

/** The id of the chat list's search field (the sidebar's Search focuses it). */
const SEARCH_ID = 'v16-search';

/** Mirror ⋯ → Rename. */
function RenameMirror({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <Sheet label="Rename mirror" onClose={onClose} title="Rename your mirror">
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave(name); }}>
        <div className="px-4 py-4">
          <label className="block text-sm text-gray-700">Name
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="mt-1 block min-h-11 w-full rounded-lg border px-3 text-base outline-none focus:border-gray-500 md:text-sm" />
          </label>
        </div>
        <div className="flex gap-2 border-t p-3">
          <OutlineButton type="button" className="min-h-11 flex-1" onClick={onClose}>Cancel</OutlineButton>
          <PrimaryButton type="submit" className="flex-1">Save</PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}

const LENSES: { id: ViewerId; label: string }[] = [{ id: 'bob', label: 'Bob' }, { id: 'dana', label: 'Dana' }];

/** The prototype's control strip. The viewer is the signed-in persona: the switch signs in as the other one; nobody signed in offers both. */
function Strip({ viewer, personaName, signedInName, busy, error, onSignIn, onReset, onLive, onAccept, acceptLabel }: {
  viewer: ViewerId | null; personaName?: string; signedInName?: string; busy: ViewerId | null; error: string | null; onSignIn: (v: ViewerId) => void; onReset: () => void; onLive?: () => void; onAccept?: () => void; acceptLabel?: string;
}) {
  const small = 'shrink-0 px-2.5';
  return (
    /* Review #12: one line at every width (it scrolls sideways on a phone instead of wrapping). */
    <div role="region" aria-label="Prototype controls" className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap border-b bg-gray-100 px-2 py-0.5 [scrollbar-width:none] sm:gap-3 sm:px-3">
      <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-gray-600 sm:inline">Prototype v16 · test project</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 sm:hidden">v16</span>
      {viewer ? (
        <div role="radiogroup" aria-label="View as" className="inline-flex shrink-0 rounded-lg border bg-white p-0.5">
          {LENSES.map((l) => <button key={l.id} type="button" role="radio" aria-checked={viewer === l.id} aria-label={l.label} disabled={busy !== null} onClick={() => viewer !== l.id && onSignIn(l.id)} className={cn('min-h-10 rounded-md px-2 text-sm font-medium sm:px-2.5', viewer === l.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50')}>{l.label}</button>)}
        </div>
      ) : (
        <div className="inline-flex shrink-0 items-center gap-1.5">
          {signedInName && <span className="text-xs text-gray-600">Signed in as {signedInName}, not a Bob or Dana persona.</span>}
          {LENSES.map((l) => <OutlineButton key={l.id} disabled={busy !== null} onClick={() => onSignIn(l.id)} className={small} data-testid={`strip-sign-in-${l.id}`}>{busy === l.id ? `Signing in as ${l.label}…` : `Sign in as ${l.label}`}</OutlineButton>)}
        </div>
      )}
      {viewer && <span data-testid="persona-note" className="text-xs text-gray-600">Signed in as {personaName ?? PEOPLE[viewer].name} (test persona)</span>}
      {error && <span role="alert" data-testid="sign-in-error" className="text-xs font-medium text-red-700">{error}</span>}
      {onLive && <OutlineButton onClick={onLive} className={small}>Next transcript line</OutlineButton>}
      {onAccept && <OutlineButton onClick={onAccept} className={small} data-testid="strip-accept">{acceptLabel}</OutlineButton>}
      <OutlineButton onClick={onReset} className={small}>Reset</OutlineButton>
    </div>
  );
}

/** People results: the 1:1 straight away (existing or new). People I share nothing with show too (v14 #11) and open their "No chat yet" state. */
function SearchResults({ st, results, onChat, onPerson, onMessage, onInvite }: { st: State; results: { chats: Chat[]; people: PersonId[]; others: PersonId[] }; onChat: (id: string) => void; onPerson: (p: PersonId) => void; onMessage: (p: PersonId) => void; onInvite: () => void }) {
  const row = cn('flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 text-left', HOVER);
  const everyone = [...results.people, ...results.others];
  return (
    <div data-testid="search-results">
      {results.chats.length > 0 && <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Chats</h2>}
      <ul aria-label="Chat results">{results.chats.map((c) => <li key={c.id} className="flex"><button type="button" className={row} onClick={() => onChat(c.id)}><ChatAvatar st={st} chat={c} size="sm" /><span className="truncate text-[15px] text-gray-900">{rowTitle(st, c)}</span></button></li>)}</ul>
      {everyone.length > 0 && <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">People</h2>}
      <ul aria-label="People results">{everyone.map((p) => {
        const hasChat = st.chats.some((c) => c.kind === 'dm' && c.members!.includes(st.viewer) && c.members!.includes(p));
        const shared = sharedWith(st.viewer, p, st);
        return (
          <li key={p} className="flex items-center">
            <button type="button" className={row} onClick={() => onMessage(p)}>
              <Avatar person={p} size="sm" />
              <span className="min-w-0"><span className="block truncate text-[15px] text-gray-900">{PEOPLE[p].name}</span><span className="block truncate text-xs text-gray-500">{hasChat ? PEOPLE[p].role : shared ? `No chat yet · you both ${shared}` : 'No chat yet · you share no group or event'}</span></span>
            </button>
            <Tip label="View profile"><button type="button" aria-label={`View ${PEOPLE[p].name}'s profile`} onClick={() => onPerson(p)} className={cn('mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500', HOVER)}><UserIcon className="h-4 w-4" /></button></Tip>
          </li>
        );
      })}</ul>
      {everyone.length === 0 && results.chats.length === 0 && (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" data-testid="search-no-people"><p className="text-sm text-gray-600">No one matches.</p><InviteLink onClick={onInvite} /></div>
      )}
    </div>
  );
}

/** A chat link that leads nowhere for this person. */
function ChatUnavailable({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-unavailable">
      <Header backAlways onBack={onBack} title={<PageTitle>Chat</PageTitle>} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-gray-700">This chat isn&apos;t available. It may not exist, or you may not have access to it any more (an event channel needs a seat).</p>
        <OutlineButton onClick={onBack}>Back to chats</OutlineButton>
      </div>
    </div>
  );
}

/** Someone with no chat and nothing shared: the "No chat yet" state, with no composer until we share a group or event. */
function NoChatYet({ st, person, onBack, onPerson, onMessage }: { st: State; person: PersonId; onBack: () => void; onPerson: (p: PersonId) => void; onMessage: () => void }) {
  if (!PEOPLE[person]) return null;
  const first = PEOPLE[person].name.split(' ')[0]!;
  const can = canMessage(st, person);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-view" data-chat-open={`new:${person}`}>
      <Header onBack={onBack} title={<button type="button" onClick={() => onPerson(person)} className="flex min-h-11 min-w-0 items-center gap-2.5 text-left"><Avatar person={person} size="sm" /><span className="truncate text-base font-semibold text-gray-900">{PEOPLE[person].name}</span></button>}>
        <TranscribeButton />
      </Header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center" data-testid="empty-chat">
        <p className="text-sm text-gray-600">{can ? COPY.newChatOpener(first, sharedWith(st.viewer, person, st)) : `No chat yet with ${first}. You can message ${first} once you share a group or event.`}</p>
        {can ? <PrimaryButton onClick={onMessage}>{COPY.message}</PrimaryButton> : <OutlineButton onClick={() => onPerson(person)}>View profile</OutlineButton>}
      </div>
    </div>
  );
}


/** A 1:1's header: the person, then the partner state beside the name: Partner (opens the Partners page) or Invite sent. */
function DmTitle({ st, chat, onPerson, onPartners }: { st: State; chat: Chat; onPerson: (p: PersonId) => void; onPartners: () => void }) {
  const other = otherOf(st, chat);
  const state = partnerState(st, other);
  /* The person's name keeps priority. Beside the name the state is a chip from `sm` up; on a phone it moves into the line under the name. */
  const stateWord = state === 'partner' ? COPY.partner : state === 'pending' ? COPY.inviteSent : null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button type="button" onClick={() => onPerson(other)} data-testid="dm-name" className="flex min-h-11 min-w-[5rem] items-center gap-2.5 text-left"><Avatar person={other} size="sm" /><span className="min-w-0"><span className="block truncate text-base font-semibold text-gray-900">{chatTitle(st, chat)}</span><span className="block truncate text-xs text-gray-500">{PEOPLE[other].role}{stateWord && <span className="sm:hidden" data-testid="partner-sub"> · {stateWord}</span>}</span></span></button>
      {state === 'partner' && (
        <Tip label="Your partners" side="bottom">
          <button type="button" onClick={onPartners} aria-label={COPY.partner} data-testid="partner-tag" className="hidden min-h-10 shrink-0 items-center gap-1 rounded-full bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100 sm:inline-flex"><Handshake className="h-3 w-3" aria-hidden="true" />{COPY.partner}</button>
        </Tip>
      )}
      {/* v11 PendingLine: production's LetterStatusBadge (in progress) with its label override. */}
      {state === 'pending' && <span data-testid="partner-pending" className="hidden shrink-0 sm:inline-flex"><LetterStatusBadge status="in_progress" label={COPY.inviteSent} /></span>}
    </div>
  );
}

type MenuEntry = { label: string; Icon: LucideIcon; onSelect: () => void; danger?: boolean; /** No production destination yet: says so before it is touched. */ soon?: boolean; /** Offered in the menu on a phone only (a wider header has the button). */ phoneOnly?: boolean };

/**
 * A chat header's word labels fit where the pane is wide: a tablet's single pane (sm up to lg) and a wide desktop (xl up). In between
 * (1024 to 1279px) the pane beside the sidebar and the chat list is about 400px, so the buttons are icons with a tip and an aria-label.
 */
const HEADER_LABEL = 'hidden sm:inline lg:hidden xl:inline';

/** The ⋯ menu of a chat header: what it offers depends on the kind of chat. */
function ChatMenu({ entries }: { entries: MenuEntry[] }) {
  const [on, setOn] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(() => setOn(false), on, [ref]);
  const pick = (f: () => void) => () => { setOn(false); f(); };
  if (entries.length === 0) return null;
  return (
    <div ref={ref} className="relative shrink-0">
      <Tip label="More" side="bottom"><button type="button" aria-label="More" aria-expanded={on} onClick={() => setOn(!on)} className={cn('flex h-11 w-11 items-center justify-center rounded-full text-gray-600', HOVER)}><MoreHorizontal className="h-5 w-5" /></button></Tip>
      {on && (
        <div role="menu" className="absolute right-0 top-12 z-30 w-56 rounded-xl border bg-white p-1 shadow-xl" data-testid="chat-menu">
          {entries.map(({ label, Icon, onSelect, danger, soon, phoneOnly }) => (
            <button key={label} type="button" role="menuitem" className={cn(MENU_ITEM, danger && 'text-red-700', phoneOnly && 'sm:hidden')} onClick={pick(onSelect)}><Icon className={cn('h-4 w-4', !danger && 'text-gray-500')} />{label}{soon && <span className="ml-auto text-xs text-gray-500">{COPY.comingSoon}</span>}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * v16: Transcribe sits at the top right of EVERY chat header and says "Coming soon" in all of them. It does not start a capture:
 * the existing create path (`createRoom` -> `enter_transcribe_room`) JOINS the newest room that is still open instead of minting
 * one (supabase/migrations/20260910120000_p1236_f_enter_shared_room.sql), so a press in a chat would put this person's microphone
 * in one room shared with whoever else is transcribing, and `transcribe_rooms` has no link back to a chat. Per-chat rooms need a
 * schema change (spec Risks: DEFER). A button that looked live while capturing nothing would be a fake, so it says so.
 */
function TranscribeButton() {
  return (
    <Tip label={`${COPY.transcribe}: ${COPY.comingSoon}`} side="bottom">
      <OutlineButton onClick={() => toast(`${COPY.transcribe} from a chat is coming soon.`)} aria-label={`${COPY.transcribe}, ${COPY.comingSoon.toLowerCase()}`} data-testid="transcribe-button" className="h-auto min-h-10 shrink-0 flex-col gap-0 px-1.5 py-1 text-gray-700 sm:flex-row sm:gap-1.5 sm:px-2.5">
        <Mic className="h-4 w-4" aria-hidden="true" />
        <span className={HEADER_LABEL}>{COPY.transcribe}</span>
        {/* Never hidden at any width: on a touch screen there is no tip, so this is the only place the state is said. */}
        <span className="text-[10px] font-normal leading-tight text-gray-500 sm:text-xs" data-testid="transcribe-soon">{COPY.comingSoon}</span>
      </OutlineButton>
    </Tip>
  );
}

/** "N going" for an event channel: the real RSVP list of the event seeded under the same mock id. */
function GoingCount({ mockEventId }: { mockEventId: string }) {
  const q = useRealQuery<EventAttendee[] | null>(() => loadChatEventAttendees(mockEventId), [mockEventId], { emptyValue: [], isEmpty: (a) => !a || a.length === 0 });
  return q.data ? <span data-testid="going-count">{q.data.length} going</span> : null;
}

function ChatView({ st, chat, input, onInput, replyTo, threadId, onBack, onPerson, onMembers, onGroupPage, onEvent, onPartners, onOrigin, onLeave, onInvite, onInviteLive, onRename, onReply, onCancelReply, onThread, onClarify, onMarkUnread, onForward, onRetry, onEdit, onDelete, onSend, onVoice, onAttach, staged, onUnstage, onClaim }: {
  st: State; chat: Chat; input: string; onInput: (v: string) => void; replyTo?: string; threadId?: string;
  onBack: () => void; onPerson: (p: PersonId) => void; onMembers: () => void; onGroupPage: () => void; onLeave: () => void; onInvite: (p: PersonId) => void; onInviteLive: () => void; onRename: () => void;
  onEvent: (eventId: string) => void; onPartners: () => void; onOrigin: (chatId: string) => void;
  onReply: (m: Msg) => void; onCancelReply: () => void; onThread: (m: Msg) => void; onClarify: (id: string) => void; onMarkUnread: (id: string) => void;
  onForward: (id: string) => void; onRetry: (id: string) => void; onEdit: (id: string, text: string) => void; onDelete: (id: string) => void;
  onSend: (t: string) => void; onVoice: (secs: number) => void; onAttach: () => void; staged?: Shareable; onUnstage: () => void; onClaim: (name: string) => void;
}) {
  const channel = chat.kind === 'channel';
  const mirror = chat.kind === 'mirror';
  const unclaimed = mirror && !st.mirror[st.viewer];
  const msgs = msgsOf(st, chat.id);
  const quoted = replyTo ? st.msgs.find((x) => x.id === replyTo) : undefined;
  const end = useRef<HTMLDivElement>(null);
  const ev = eventOf(chat);
  const group = groupOf(chat);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [msgs.length, chat.id]);
  /* v15 #10 (coordinator change): the name field is PREFILLED with "{FirstName}'s mirror"; keep it with one tap or type a nickname. */
  const defaultName = defaultMirrorName(st.viewer);
  const [nameDraft, setNameDraft] = useState(defaultName);
  const other = chat.kind === 'dm' ? otherOf(st, chat) : undefined;
  const title = channel
    ? (
      <div className="flex min-h-11 min-w-0 items-center gap-2.5" data-testid="channel-header">
        <ChannelMark chat={chat} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-gray-900">{rowTitle(st, chat, true)}</span>
          <span className="flex min-w-0 items-center gap-1 truncate text-xs text-gray-500">
            {ev
              ? <><span className="truncate">{eventWhen(st, ev)}</span> · <GoingCount mockEventId={ev.id} /></>
              : <><Lock className="h-3 w-3 shrink-0" aria-hidden="true" data-testid="members-only-lock" /><span data-testid="members-only">{COPY.membersOnly}</span><span className="truncate"> · {group?.name}</span></>}
          </span>
        </span>
      </div>
    )
    : mirror
      ? <div className="flex min-h-11 min-w-0 items-center gap-2.5" data-testid="mirror-header"><MirrorAvatar owner={st.viewer} size="sm" /><span className="min-w-0"><span className="block truncate text-base font-semibold text-gray-900">{mirrorLabel(st)}</span><span className="block truncate text-xs text-gray-500">Your agent</span></span></div>
      : <DmTitle st={st} chat={chat} onPerson={onPerson} onPartners={onPartners} />;
  const otherFirst = other ? PEOPLE[other].name.split(' ')[0]! : '';
  const showInvite = !!other && partnerState(st, other) === 'none';
  const entries: MenuEntry[] = channel
    ? [
      ...(ev ? [{ label: 'Event details', Icon: CalendarDays, onSelect: () => onEvent(ev.id) }] : []),
      { label: 'Members', Icon: UsersIcon, onSelect: onMembers },
      { label: 'Group page', Icon: LandmarkIcon, onSelect: onGroupPage },
      ...(group && !ev && isMember(st, st.viewer, group.id) ? [{ label: 'Leave group', Icon: LogOut, onSelect: onLeave, danger: true }] : []),
    ]
    : mirror
      ? [{ label: 'Rename', Icon: Pencil, onSelect: onRename }]
      : [
        ...(showInvite ? [{ label: COPY.invite, Icon: Handshake, onSelect: () => onInvite(other!), phoneOnly: true }] : []),
        { label: COPY.inviteToLive, Icon: Video, onSelect: onInviteLive, soon: true },
      ];
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-view" data-chat-open={chat.id}>
      <Header onBack={onBack} title={title}>
        {showInvite && <Tip label={COPY.invite} side="bottom"><OutlineButton onClick={() => onInvite(other!)} aria-label={COPY.invite} data-testid="invite-partner" className="hidden shrink-0 px-2.5 sm:inline-flex"><Handshake className="h-4 w-4" aria-hidden="true" /><span className={HEADER_LABEL}>{COPY.invite}</span></OutlineButton></Tip>}
        <TranscribeButton />
        <ChatMenu entries={entries} />
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-white py-2">
        {unclaimed && (
          <ul aria-label="Mirror">
            <li><Message person={st.viewer} agentName={COPY.yourMirror} onPerson={onPerson}>
              <p className="text-sm text-gray-600" data-testid="mirror-explainer">{COPY.mirrorExplainer}</p>
              <MsgText>{COPY.mirrorAsk}</MsgText>
            </Message></li>
          </ul>
        )}
        {msgs.length === 0 && !mirror && (
          <p className="px-6 py-12 text-center text-sm text-gray-500" data-testid="empty-chat">
            {channel ? 'No messages yet.' : COPY.newChatOpener(otherFirst, sharedWith(st.viewer, other!, st))}
          </p>
        )}
        {msgs.length > 0 && <Divider>{dayLabel(st, chat)}</Divider>}
        <MessageList label="Messages" msgs={msgs} render={(m, compact) => (
          <MessageRow key={m.id} st={st} msg={m} own={m.who === st.viewer && !m.agent} compact={compact && !m.agent && !msgs[msgs.indexOf(m) - 1]?.agent} highlight={m.id === threadId} replies={repliesOf(st, m.id)} liveThread={!!m.table && ev?.live}
            onPerson={onPerson} onReply={() => onReply(m)} onForward={() => onForward(m.id)} onThread={m.failed ? undefined : () => onThread(m)} onRetry={() => onRetry(m.id)}
            onEdit={(t) => onEdit(m.id, t)} onDelete={() => onDelete(m.id)} onClarify={m.failed ? undefined : () => onClarify(m.id)} onMarkUnread={() => onMarkUnread(m.id)} onOrigin={onOrigin} />
        )} />
        <div ref={end} />
      </div>
      {unclaimed ? (
        <footer className="shrink-0 px-2 pb-2 pt-1 lg:px-3 lg:pb-3" data-testid="mirror-claim">
          <form className="mx-auto flex w-full max-w-3xl items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (nameDraft.trim()) onClaim(nameDraft); }}>
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} aria-label={COPY.mirrorAsk} placeholder={COPY.mirrorPlaceholder} className="min-h-11 min-w-0 flex-1 rounded-full border border-gray-300 px-4 text-base outline-none focus:border-gray-500 md:text-[15px]" />
            <PrimaryButton type="submit" data-testid="mirror-keep">{nameDraft.trim() === defaultName ? 'Keep' : 'Save'}</PrimaryButton>
          </form>
        </footer>
      ) : (
        <Composer
          key={chat.id} canSendEmpty={!!staged}
          value={input} onValue={onInput} onSend={onSend} onVoice={onVoice} onAttach={onAttach}
          placeholder={channel ? `Message ${rowTitle(st, chat, true)}` : mirror ? `Message ${mirrorLabel(st)}` : `Message ${otherFirst}`}
          quote={<>
            {quoted && <QuoteBar author={PEOPLE[quoted.who].name} text={summary(quoted)} onRemove={onCancelReply} />}
            {staged && (
              <div className="flex items-start gap-2 px-2 pt-1" data-testid="staged-share">
                <div className="min-w-0 flex-1"><ShareCard item={staged} full /></div>
                <button type="button" aria-label="Remove shared item" onClick={onUnstage} className="mt-1 flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>
            )}
          </>}
        />
      )}
    </div>
  );
}

/** A post's thread (Slack's side panel), in a channel or a 1:1 (v14 #6). People only, no agent. */
function Thread({ st, chat, postId, input, onInput, onClose, onPerson, onSend, onVoice, onForward, onRetry, onEdit, onDelete, onClarify, onMarkUnread, onOrigin }: {
  st: State; chat: Chat; postId: string; input: string; onInput: (v: string) => void; onClose: () => void; onPerson: (p: PersonId) => void;
  onSend: (t: string) => void; onVoice: (secs: number) => void; onForward: (id: string) => void; onRetry: (id: string) => void;
  onEdit: (id: string, text: string) => void; onDelete: (id: string) => void; onClarify: (id: string) => void; onMarkUnread: (id: string) => void; onOrigin: (chatId: string) => void;
}) {
  const post = st.msgs.find((x) => x.id === postId);
  const replies = repliesOf(st, postId);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [replies.length, postId]);
  if (!post) return null;
  const focusComposer = () => document.getElementById('v15-thread-input')?.focus();
  /* The post at the top is shown whole (its card button would only open this same thread), so it is drawn without the card. */
  const rowOf = (x: Msg, compact: boolean) => (
    <MessageRow key={x.id} st={st} msg={x.id === postId ? { ...x, threadCard: undefined } : x} own={x.who === st.viewer} compact={compact} onPerson={onPerson} onReply={focusComposer} onForward={() => onForward(x.id)} onRetry={() => onRetry(x.id)}
      onEdit={(t) => onEdit(x.id, t)} onDelete={() => onDelete(x.id)} onClarify={() => onClarify(x.id)} onMarkUnread={() => onMarkUnread(x.id)} onOrigin={onOrigin} />
  );
  return (
    <SidePanel label="Thread" onClose={onClose} title={<div className="min-w-0"><h1 className="truncate text-base font-semibold text-gray-900">{post.table ? post.text : 'Thread'}</h1><p className="truncate text-xs text-gray-500">{rowTitle(st, chat)}</p></div>}>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <ul aria-label="Post">{rowOf(post, false)}</ul>
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground"><span className="shrink-0">{COPY.replies(replies.length)}</span><span className="h-px flex-1 bg-gray-200" /></div>
        <MessageList label="Replies" msgs={replies} render={rowOf} />
        <div ref={end} />
      </div>
      <Composer value={input} onValue={onInput} onSend={onSend} onVoice={onVoice} placeholder={COPY.replyInThread} inputId="v15-thread-input" />
    </SidePanel>
  );
}
