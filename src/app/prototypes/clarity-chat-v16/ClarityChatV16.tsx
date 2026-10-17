/**
 * @file ClarityChatV16.tsx
 * @description P1509 v15 prototype at /tree/clarity-chat-v15. Rule: WIRE, DON'T INVENT. Real production components
 * render wherever they take mock props (FeedPointCard, FeedStoryCard, OrgHeader, OrgCard, PersonRow, BannerDisplay,
 * CertificateFrame, AgreementCertificate, AgreementRow, LetterStatusBadge, CaptureInfoButton, the shadcn Tabs);
 * where a component reads live data or auth, its structure is copied and the placeholder is labelled in code.
 * Sidebar: me (top), Home (the feed), Chats, Letters, Tools, then "Your groups" and Browse groups. A group page is
 * OrgPage's (Events / Members / About via ?tab=, plus Chats); an event page is EventDetail's; Back is history with a
 * fallback that is ALWAYS the event's own group. One mirror agent per viewer, pinned in Chats, claimed by naming it,
 * receives Clarify. Mock data only (state.ts): no Supabase reads or writes from this file.
 */
import { createContext, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import {
  Archive, ArrowLeft, ArrowRight, CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, ChevronRight, Forward, Handshake, Hash, HomeIcon, Info, LandmarkIcon,
  LayoutGrid, LogOut, MailIcon, MapPin, MessageCircle, MessagesSquare, MessageSquareText, Mic, PanelLeftClose, PanelLeftOpen, Pause, Pencil, Play, Plus, Reply,
  MoreHorizontal, Search, Settings, Shield, Square, Trash2, UserIcon, UsersIcon, Video, X, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { CompactProfileCard } from '@/app/components/profile/compact-profile-card';
import { SessionBar } from '@/app/components/session/session-bar';
import { CaptureInfoButton, SessionStopButton } from '@/app/components/session/capture-controls';
import { SHORT } from '@/app/components/session/capture-status';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { OrgHeader } from '@/app/components/organizations/org-header';
import { OrgCard } from '@/app/pages/org-directory-page';
import { PersonRow as ProdPersonRow } from '@/app/components/shared/PersonRow';
import { BannerDisplay } from '@/app/components/shared/banner';
import { CertificateFrame, CertificateOathBody } from '@/app/components/agreements/certificate-frame';
import { AgreementCertificate } from '@/app/components/agreements/agreement-certificate';
import { AgreementRow } from '@/app/components/agreements/agreement-row';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { LetterStatusBadge } from '@/app/components/letters/letter-status-badge';
import { AUDIENCE_LINKS, EVENTS_LIST_TO, PUBLIC_NAV_GROUPS } from '@/app/components/layout/nav-links';
import { buildLinksMenu, type LinksMenuEntry } from '@/app/data/event-links';
import { COA_VERSIONS, CURRENT_COA_VERSION } from '@/app/content/coa-versions';
import { CURRENT_AGREEMENT_VERSION } from '@/app/content/agreement-versions';
import type { ClarityAgreement } from '@/app/data/agreements-service.interface';
import type { Organization } from '@/app/data/organizations-service.interface';
import type { PointSummary, PointWithUserPosition, PositionType, Profile as ProfileData, StoryWithAuthor } from '@/app/types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Avatar, clock, Composer, Divider, Message, MirrorAvatar, MsgText, QuoteBar, SidePanel, Tip, ToolButton, Toolbar, TOOL_ICON, useDismiss } from './kit';
import {
  ADMINS, COPY, EVENTS, GROUPS, MOBILE_TABS, PEOPLE, PLACE_LABEL, PLACES, SHAREABLE, SIDEBAR_KEY,
  type EventInfo, type Group, type LetterBox, type MobileTab, type PersonId, type Place, type Shareable, type ViewerId,
} from './mock-data';
import {
  acceptInvite, archive, archivedChats, archivedUnreadCount, attendeesOf, canMessage, canSee, channelMembers, chatById, chatTitle, chatsInTab, claimMirror, clarify, clarifyOrigin, contactsOf, defaultMirrorName, lettersIn,
  comment, deleteMsg, dmWith, editMsg, eventOf, eventsOfGroup, findShareable, forward, groupOf, groupOfEvent, groupPeople, groupSections, initialState, invitePartner,
  isArchived, isGoing, isMember, joinGroup, lastMsg, leaveGroup, liveLinesLeft, mirrorChatId, mirrorName, msgsOf, myGroups, nextLiveLine, openChat, otherOf,
  partnerState, positionOf, repliesOf, retry, search, send, sendVoice, setPosition, sharedWith, summary, tabsFor, toggleRsvp, totalUnread, unarchive, unreadOf,
  visibleChats, type Chat, type Msg, type State, type Tab,
} from './state';

const HOVER = '[@media(hover:hover)]:hover:bg-gray-100';
const BLUE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700';
const OUTLINE = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50';
const STRIP_BUTTON = 'inline-flex min-h-10 shrink-0 items-center rounded-md border bg-white px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50';
const MENU_ITEM = cn('flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-gray-900', HOVER);
const MENU_HEAD = 'px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500';
/** Production's capture-controls CONTROL_CLASS (not exported): PauseResumeButton reads the live capture context, so its look is copied. */
const CAPTURE_CONTROL = 'flex items-center gap-1.5 whitespace-nowrap text-sm font-medium rounded-md h-10 px-3 border border-blue-300 bg-white text-blue-900 hover:bg-blue-100 transition-colors';
/** Production's room-capture-bar ICON_BUTTON (not exported). */
const CAPTURE_ICON_BUTTON = 'inline-flex items-center justify-center h-10 w-10 rounded-md border border-blue-300 bg-white text-blue-900 hover:bg-blue-100 disabled:opacity-50';
/** Production's org-page ORG_TAB_CLASS (not exported). */
const ORG_TAB_CLASS = 'min-h-11 rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 text-base data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none';
/** Production's letters-page trigger class. */
const LETTER_TAB_CLASS = 'rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none px-4 py-3';

const PLACE_ICON: Record<Place | MobileTab, LucideIcon> = { home: HomeIcon, chats: MessagesSquare, letters: MailIcon, tools: LayoutGrid, groups: LandmarkIcon, me: UserIcon };

/* ---------- URL state + history-based back ---------- */

type Loc = { view?: string; chat?: string; thread?: string; members?: string; group?: string; letter?: string; person?: string; with?: string; tab?: string; event?: string };
const LOC_KEYS: (keyof Loc)[] = ['view', 'chat', 'thread', 'members', 'group', 'letter', 'person', 'with', 'tab', 'event'];

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
    const mode = params.get('state');
    if (mode) p.set('state', mode);
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

const dayLabel = (chat: Chat) => {
  const ev = eventOf(chat);
  return ev && !ev.today ? ev.when : 'Today';
};

const ChannelMark = ({ chat, size = 'list', onBlue = false }: { chat: Chat; size?: 'list' | 'sm'; onBlue?: boolean }) => {
  const Icon = chat.eventId ? CalendarDays : Hash;
  return (
    <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-full', onBlue ? 'bg-white text-blue-600' : 'bg-blue-600 text-white', size === 'list' ? 'h-12 w-12' : 'h-8 w-8')}>
      <Icon className={size === 'list' ? 'h-5 w-5' : 'h-4 w-4'} />
    </span>
  );
};

const ChatAvatar = ({ st, chat, size = 'list' }: { st: State; chat: Chat; size?: 'list' | 'sm' }) =>
  (chat.kind === 'mirror' ? <MirrorAvatar owner={st.viewer} size={size} /> : chat.kind === 'dm' ? <Avatar person={otherOf(st, chat)} size={size} /> : <ChannelMark chat={chat} size={size} />);

const rowTitle = (st: State, c: Chat, inSection = false) =>
  c.kind !== 'channel' ? chatTitle(st, c) : c.eventId ? chatTitle(st, c) : inSection ? `# ${COPY.general}` : `${groupOf(c)?.name} · # ${COPY.general}`;

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
function Page({ testId, title, onBack, children, actions }: { testId: string; title: ReactNode; onBack?: () => void; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid={testId}>
      <Header backAlways={!!onBack} onBack={onBack} title={<PageTitle>{title}</PageTitle>}>{actions}</Header>
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


/** Production links (a profile's pledge, a point) lead to real routes the mock items do not have: the prototype keeps the click. */
const stayInPrototype = (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('a')) return;
  e.preventDefault();
  e.stopPropagation();
  toast('This opens the real page in the app.');
};

/* ---------- production cards with mock props (v15 #4, #8) ---------- */

const CREATED = '2026-10-01T00:00:00.000Z';
const mockId = (p: PersonId) => `mock-${p}`;
const ZERO: Record<PositionType, number> = { strongly_agree: 0, agree: 0, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 };
/** Production's DB counts include the viewer's own position, so the mock adds it in. */
const countsWith = (x: Shareable, mine: PositionType | null): Record<PositionType, number> => {
  const c = { ...ZERO, ...x.counts };
  if (mine) c[mine] += 1;
  return c;
};
const total = (c: Record<PositionType, number>) => Object.values(c).reduce((a, b) => a + b, 0);

function asPoint(x: Shareable, viewer: ViewerId, mine: PositionType | null): PointWithUserPosition {
  const a = PEOPLE[x.author];
  const counts = countsWith(x, mine);
  return {
    id: x.id, statement: x.title, firstValidatorId: mockId(x.author), createdAt: CREATED, updatedAt: CREATED, tags: x.tags, systemTags: [], visibility: 'public',
    creatorName: a.name, creatorSlug: a.slug, creatorAvatarColor: a.avatarColor, positionCounts: counts, totalPositions: total(counts),
    userPosition: mine ? { id: `pos-${viewer}-${x.id}`, pointId: x.id, userId: mockId(viewer), position: mine, createdAt: CREATED, updatedAt: CREATED } : undefined,
  };
}
function asStory(x: Shareable): StoryWithAuthor {
  const a = PEOPLE[x.author];
  return {
    id: x.id, authorId: mockId(x.author), content: x.excerpt ?? x.title, visibility: 'public', currentVersion: 1, understoodCount: 0,
    createdAt: CREATED, updatedAt: CREATED, tags: x.tags, systemTags: [], authorName: a.name, authorSlug: a.slug, authorAvatarColor: a.avatarColor, authorRole: a.role,
    authorHasPledged: a.pledger, authorEarsCount: 0,
  };
}
function asSummary(x: Shareable, mine: PositionType | null): PointSummary {
  return { id: x.id, statement: x.title, tags: x.tags, systemTags: [], visibility: 'public', positionCounts: countsWith(x, mine), userPosition: mine };
}

/** What the cards need from the prototype: my positions and where Details goes. */
type CardCtx = { st: State; onPosition: (pointId: string, p: PositionType | null) => void; onDetails: (x: Shareable) => void };
const Cards = createContext<CardCtx | null>(null);
const GROUP_DEFAULT: Record<string, PositionType> = { agree: 'agree', unsure: 'unsure', disagree: 'disagree' };

/**
 * WRAPPER around a production card, so it never writes. The real cards save positions with `sendPositionWrite`
 * (Supabase) and open `/point/:id` / `/story/:id`. This wrapper catches, in the capture phase, a click on a
 * position segment (`[data-testid="<group>-group"]`), on `Details →`, or on any link, and answers it from mock state:
 * the position comes back to the card through its own `userPosition` prop, exactly as a refetch would deliver it.
 * An anonymous viewer's FeedPointCard keeps its own localStorage path (no network), so the wrapper lets it through.
 */
function MockCard({ pointId, letAnonThrough = false, onDetails, children, testId }: { pointId?: string; letAnonThrough?: boolean; onDetails: () => void; children: ReactNode; testId: string }) {
  const ctx = useContext(Cards)!;
  const { session } = useAuth();
  const capture = (e: MouseEvent) => {
    const el = e.target as HTMLElement;
    const seg = el.closest<HTMLElement>('[data-testid$="-group"]');
    if (seg && pointId) {
      if (letAnonThrough && !session) return;
      e.preventDefault(); e.stopPropagation();
      const pick = GROUP_DEFAULT[(seg.dataset.testid ?? '').replace(/-group$/, '')];
      if (pick) ctx.onPosition(seg.closest('[data-testid="quoted-point-card"]') ? (seg.closest('[data-point]') as HTMLElement | null)?.dataset.point ?? pointId : pointId, pick);
      return;
    }
    const btn = el.closest('button');
    if (btn && /Details/.test(btn.textContent ?? '')) { e.preventDefault(); e.stopPropagation(); onDetails(); return; }
    if (el.closest('a')) { e.preventDefault(); e.stopPropagation(); toast('This opens the real page in the app.'); }
  };
  return <div data-testid={testId} onClickCapture={capture}>{children}</div>;
}

/** A point (production FeedPointCard) or a story (production FeedStoryCard, its one point with positions and Details →). */
export function ShareCard({ item, full = false }: { item: Shareable; full?: boolean }) {
  const ctx = useContext(Cards)!;
  const width = full ? 'w-full' : 'max-w-md';
  const v = ctx.st.viewer;
  if (item.kind === 'point') {
    return (
      <div className={cn('mt-1', width)}>
        <MockCard testId="share-point" pointId={item.id} letAnonThrough onDetails={() => ctx.onDetails(item)}>
          <FeedPointCard point={asPoint(item, v, positionOf(ctx.st, item.id))} linkedStories={[]} />
        </MockCard>
      </div>
    );
  }
  const linked = (item.points ?? []).map((id) => SHAREABLE.find((x) => x.id === id)).filter((x): x is Shareable => !!x);
  return (
    <div className={cn('mt-1', width)}>
      <MockCard testId="share-story" pointId={linked[0]?.id} onDetails={() => ctx.onDetails(item)}>
        <FeedStoryCard story={asStory(item)} currentUserId={mockId(v)} linkedPoints={linked.map((p) => asSummary(p, positionOf(ctx.st, p.id)))} />
      </MockCard>
    </div>
  );
}

function VoiceNote({ secs }: { secs: number }) {
  return (
    <div className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-full bg-gray-100 pl-1 pr-4" data-testid="voice-note">
      <button type="button" aria-label="Play voice message" onClick={() => toast('Playback is mocked in the prototype.')} className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white"><Play className="h-4 w-4" /></button>
      <span className="flex items-end gap-0.5" aria-hidden="true">{[3, 6, 4, 8, 5, 9, 4, 6, 3, 7, 5, 4].map((h, i) => <span key={i} className="w-0.5 rounded bg-gray-400" style={{ height: h * 2 }} />)}</span>
      <span className="text-xs tabular-nums text-gray-600">{clock(secs)}</span>
    </div>
  );
}


/* ---------- one message ---------- */

/** Right-click on a message (v14 #6): Reply, Forward, Thread, and for my own Edit and Delete. */
function ContextMenu({ at, own, onClose, onReply, onForward, onThread, onEdit, onDelete }: {
  at: { x: number; y: number }; own: boolean; onClose: () => void; onReply: () => void; onForward: () => void; onThread?: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(onClose, true, [ref]);
  const pick = (f: () => void) => () => { onClose(); f(); };
  const x = Math.max(8, Math.min(at.x, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 216));
  const y = Math.max(8, Math.min(at.y, (typeof window !== 'undefined' ? window.innerHeight : 768) - 240));
  return (
    <div ref={ref} role="menu" aria-label="Message menu" data-testid="message-menu" style={{ left: x, top: y }} className="fixed z-50 w-52 rounded-xl border bg-white p-1 shadow-xl">
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onReply)}><Reply className="h-4 w-4 text-gray-500" />Reply</button>
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onForward)}><Forward className="h-4 w-4 text-gray-500" />Forward</button>
      {onThread && <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onThread)}><MessageSquareText className="h-4 w-4 text-gray-500" />Thread</button>}
      {own && <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onEdit)}><Pencil className="h-4 w-4 text-gray-500" />Edit</button>}
      {own && <button type="button" role="menuitem" className={cn(MENU_ITEM, 'text-red-700')} onClick={pick(onDelete)}><Trash2 className="h-4 w-4" />Delete</button>}
    </div>
  );
}


/** Hover (or a tap on a phone) shows Reply, Forward, Thread, Clarify (v15 #10). Right-click opens the full menu. */
function MessageRow({ st, msg, own, compact, highlight, replies, onPerson, onReply, onForward, onThread, onRetry, onEdit, onDelete, onClarify, liveThread }: {
  st: State; msg: Msg; own: boolean; compact: boolean; highlight?: boolean; replies?: Msg[]; liveThread?: boolean;
  onPerson: (p: PersonId) => void; onReply: () => void; onForward: () => void; onThread?: () => void; onRetry: () => void;
  onEdit: (text: string) => void; onDelete: () => void; onClarify?: () => void;
}) {
  const [selected, setSelected] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const li = useRef<HTMLLIElement>(null);
  useDismiss(() => setSelected(false), selected, [li]);
  const act = (f: () => void) => () => { setSelected(false); f(); };
  const editable = own && !msg.failed && !msg.voice && !msg.transcribed && !msg.agent;
  const mirror = mirrorName(st);
  const toolbar = msg.failed || draft !== null ? undefined : (
    <Toolbar shown={selected}>
      <ToolButton label="Reply" onClick={act(onReply)}><Reply className={TOOL_ICON} /></ToolButton>
      <ToolButton label="Forward" onClick={act(onForward)}><Forward className={TOOL_ICON} /></ToolButton>
      {onThread && <ToolButton label="Thread" onClick={act(onThread)}><MessageSquareText className={TOOL_ICON} /></ToolButton>}
      {/* v11's Clarify: the agent's face and the word. The tip names my mirror. */}
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
  return (
    <li ref={li} data-msg={msg.id}>
      <Message person={msg.who} agentName={msg.agent ? mirror : undefined} time={msg.time} compact={compact} highlight={highlight} selected={selected} onSelect={msg.failed ? undefined : () => setSelected((s) => !s)} onPerson={onPerson} toolbar={toolbar}
        onContextMenu={msg.failed ? undefined : (e) => { e.preventDefault(); setSelected(false); setMenu({ x: e.clientX, y: e.clientY }); }}>
        {msg.fwdFrom && (
          <p className="text-xs font-medium text-blue-700" data-testid="forwarded-label">
            {COPY.forwardedFrom} <button type="button" onClick={() => onPerson(msg.fwdFrom!)} className="font-semibold hover:underline">{PEOPLE[msg.fwdFrom].name}</button>
          </p>
        )}
        {msg.chatId.startsWith('mirror-') && msg.quote && !msg.agent && <p className="text-xs font-medium text-blue-700" data-testid="clarify-label">Sent to {mirror} to clarify</p>}
        {msg.quote && (
          <div className="my-1 border-l-2 border-blue-600 pl-2" data-testid="reply-quote">
            <p className="text-xs font-semibold text-blue-700">{PEOPLE[msg.quote.who].name}</p>
            <p className="truncate text-sm text-gray-600">{msg.quote.text}</p>
          </div>
        )}
        {draft !== null ? (
          <div className="mt-1" data-testid="edit-message">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit message" rows={2} autoFocus
              onKeyDown={(e) => { if (e.key === 'Escape') setDraft(null); if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); } }}
              className="block w-full resize-none rounded-lg border px-3 py-2 text-base outline-none focus:border-gray-500 md:text-[15px]" />
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setDraft(null)} className={OUTLINE}>Cancel</button>
              <button type="button" onClick={save} className={cn(BLUE, 'min-h-10')}>Save</button>
            </div>
          </div>
        ) : msg.table
          ? <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg border bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-900" data-testid="table-post"><UsersIcon className="h-4 w-4" aria-hidden="true" />{msg.text}</p>
          : msg.text && <MsgText>{msg.text}{msg.edited && <span className="ml-1.5 text-xs text-gray-500" data-testid="edited-mark">(edited)</span>}</MsgText>}
        {msg.voice && <VoiceNote secs={msg.voice} />}
        {msg.share && <ShareCard item={msg.share} />}
        {msg.transcribed && !msg.table && <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500" data-testid="transcribed-mark"><Mic className="h-3 w-3" aria-hidden="true" />{COPY.transcribed}</p>}
        {msg.failed && (
          <div className="mt-1 flex items-center gap-2 text-xs text-red-700" data-testid="send-failed">
            {COPY.notSent}
            <button type="button" onClick={onRetry} className="min-h-10 rounded-md px-3 font-semibold text-blue-700 hover:bg-blue-50">{COPY.retry}</button>
          </div>
        )}
        {onThread && replies && replies.length > 0 && <RepliesLink replies={replies} onOpen={onThread} live={liveThread} />}
      </Message>
      {menu && (
        <ContextMenu at={menu} own={editable || (own && !msg.failed && !msg.agent)} onClose={() => setMenu(null)} onReply={onReply} onForward={onForward} onThread={onThread}
          onEdit={() => (editable ? setDraft(msg.text) : toast('Only text can be edited.'))} onDelete={onDelete} />
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
            {mirror && st.mirror[st.viewer] && <span className={cn('shrink-0 rounded-full px-1.5 text-[11px] font-semibold', active ? 'bg-white text-blue-700' : 'bg-blue-50 text-blue-700')} data-testid="mirror-tag">{COPY.yourMirror}</span>}
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
const Badge = ({ n, className }: { n: number; className?: string }) => (n > 0 ? <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white', className)} aria-label={`${n} unread`}>{n}</span> : null);

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


/** v11's "+ New" (frame/shell.tsx NewMenu): New chat and New partner. */
function NewMenu({ onNewChat, onNewPartner }: { onNewChat: () => void; onNewPartner: () => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={COPY.newMenu} data-testid="new-menu" className={cn('flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 text-sm font-medium text-blue-700', HOVER)}>{COPY.newMenu}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuItem onSelect={onNewChat}>{COPY.newChat}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onNewPartner}>{COPY.newPartner}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------- the profile menu, the sidebar, the phone tab bar (v15 #1) ---------- */

/** Learn: production's PUBLIC_NAV_GROUPS "Learn" group, the in-app items (Manifesto, About). */
const LEARN = (PUBLIC_NAV_GROUPS.find((g) => g.label === 'Learn')?.items ?? []).filter((i) => i.to === '/manifesto' || i.to === '/about');
const PRODUCT = PUBLIC_NAV_GROUPS.find((g) => g.label === 'Product')?.items ?? [];
const EVENTS_ITEM = PRODUCT.find((i) => i.to === EVENTS_LIST_TO);
const PLEDGERS_ITEM = PRODUCT.find((i) => i.to === '/pledgers');
const ADMIN_LINKS = [{ to: '/admin/users', label: 'Users' }, { to: '/admin/topics', label: 'Topics' }] as const;

type MenuActions = { onProfile: () => void; onPartners: () => void; onSettings: () => void; onLogOut: () => void; onTools: () => void };

/** The account menu: production's labels (navigation-menu-items.tsx, simple-navigation.tsx, nav-links.ts). */
function ProfileMenuItems({ viewer, a, onPick, tools = false }: { viewer: ViewerId; a: MenuActions; onPick: (f: () => void) => () => void; /** The phone has no Tools tab (review #13). */ tools?: boolean }) {
  const out = (to: string, label: string, Icon?: LucideIcon) => (
    <a key={to} href={to} target="_blank" rel="noreferrer" role="menuitem" className={MENU_ITEM}>{Icon ? <Icon className="h-4 w-4 text-gray-500" /> : <span className="w-4" />}{label}</a>
  );
  return (
    <>
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={onPick(a.onProfile)}><UserIcon className="h-4 w-4 text-gray-500" />My Profile</button>
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={onPick(a.onPartners)}><Handshake className="h-4 w-4 text-gray-500" />Partners</button>
      {tools && <button type="button" role="menuitem" className={MENU_ITEM} onClick={onPick(a.onTools)} data-testid="menu-tools"><LayoutGrid className="h-4 w-4 text-gray-500" />{PLACE_LABEL.tools}</button>}
      {out('/sessions', 'Session History', CalendarDays)}
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={onPick(a.onSettings)}><Settings className="h-4 w-4 text-gray-500" />Settings</button>
      <div role="group" aria-label="Use cases"><p className={MENU_HEAD}>Use cases</p>{AUDIENCE_LINKS.map((l) => out(l.to, l.label, l.Icon))}</div>
      <div role="group" aria-label="Learn"><p className={MENU_HEAD}>Learn</p>{LEARN.map((l) => out(l.to, l.label, l.Icon))}</div>
      <div role="group" aria-label="More">
        <p className={MENU_HEAD}>More</p>
        {EVENTS_ITEM && out(EVENTS_ITEM.to, EVENTS_ITEM.label, EVENTS_ITEM.Icon)}
        {PLEDGERS_ITEM && out(PLEDGERS_ITEM.to, PLEDGERS_ITEM.label, PLEDGERS_ITEM.Icon)}
      </div>
      {ADMINS.includes(viewer) && (
        <div role="group" aria-label="Admin" data-testid="admin-group"><p className={MENU_HEAD}>Admin</p>{ADMIN_LINKS.map((l) => out(l.to, l.label, Shield))}</div>
      )}
      <div className="mt-1 border-t pt-1"><button type="button" role="menuitem" className={MENU_ITEM} onClick={onPick(a.onLogOut)} data-testid="log-out"><LogOut className="h-4 w-4 text-gray-500" />Log Out</button></div>
    </>
  );
}

function MeButton({ viewer, showName, testId, menuClass, a }: { viewer: ViewerId; showName: boolean; testId: string; menuClass: string; a: MenuActions }) {
  const [on, setOn] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(() => setOn(false), on, [ref, btn]);
  return (
    <div className="relative">
      <button ref={btn} type="button" aria-label="My account" aria-expanded={on} onClick={() => setOn(!on)} data-testid={testId}
        className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1.5 text-left', HOVER)}>
        <Avatar person={viewer} size="sm" />
        {showName && <span className="min-w-0 truncate text-sm font-medium text-gray-900">{PEOPLE[viewer].name}</span>}
      </button>
      {on && (
        <div ref={ref} role="menu" aria-label="My account" className={cn('z-50 max-h-[70vh] w-64 overflow-y-auto rounded-xl border bg-white p-1 shadow-xl', menuClass)} data-testid="me-menu">
          <ProfileMenuItems viewer={viewer} a={a} onPick={(f) => () => { setOn(false); f(); }} />
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


function Sidebar({ st, place, activeGroup, onPlace, onGroup, onBrowse, me }: {
  st: State; place: Place | null; activeGroup?: string; onPlace: (p: Place) => void; onGroup: (groupId: string) => void; onBrowse: () => void; me: (showName: boolean) => ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const toggle = () => setCollapsed((c) => { writeCollapsed(!c); return !c; });
  const unread = totalUnread(st);
  const groups = myGroups(st);
  const item = (on: boolean) => cn('relative flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm font-medium', on ? 'bg-blue-50 text-blue-700' : cn('text-gray-800', HOVER));
  return (
    <nav aria-label="Sidebar" data-testid="sidebar" data-collapsed={collapsed || undefined}
      className={cn('hidden shrink-0 flex-col border-r bg-gray-50 p-2 md:flex', collapsed ? 'w-[64px]' : 'w-[248px]')}>
      <div className={cn('mb-1 flex items-center gap-1', collapsed ? 'flex-col' : 'justify-between')}>
        <div className="min-w-0 flex-1" data-testid="sidebar-top">{me(!collapsed)}</div>
        <Tip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
          <button type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggle} data-testid="sidebar-toggle" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-600', HOVER)}>
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        </Tip>
      </div>
      <ul aria-label="Places" className="space-y-0.5">
        {PLACES.map((p) => {
          const Icon = PLACE_ICON[p];
          const n = p === 'chats' ? unread : 0;
          const body = (
            <button type="button" onClick={() => onPlace(p)} aria-current={place === p ? 'page' : undefined} aria-label={collapsed ? PLACE_LABEL[p] : undefined} className={cn(item(place === p), collapsed && 'justify-center px-0')}>
              <span className="relative"><Icon className="h-5 w-5 shrink-0" aria-hidden="true" />{collapsed && <Badge n={n} className="absolute -right-3 -top-2 ring-2 ring-gray-50" />}</span>
              {!collapsed && <span className="min-w-0 flex-1 truncate">{PLACE_LABEL[p]}</span>}
              {!collapsed && <Badge n={n} />}
            </button>
          );
          return <li key={p}>{collapsed ? <Tip label={PLACE_LABEL[p]} side="right">{body}</Tip> : body}</li>;
        })}
      </ul>
      {!collapsed && (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <button type="button" aria-expanded={groupsOpen} onClick={() => setGroupsOpen(!groupsOpen)} data-testid="sidebar-groups-toggle" className={cn('flex min-h-9 w-full items-center gap-1 rounded-md px-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500', HOVER)}>
            Your groups{groupsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {groupsOpen && (
            <>
              <ul aria-label="Your groups" className="space-y-0.5">
                {groups.map((g) => {
                  const n = (groupSections(st).find((x) => x.groupId === g.id)?.chats ?? []).reduce((s, c) => s + unreadOf(st, c.id), 0);
                  return (
                    <li key={g.id}>
                      <button type="button" onClick={() => onGroup(g.id)} aria-current={activeGroup === g.id ? 'true' : undefined} className={cn(item(activeGroup === g.id), 'min-h-10 font-normal')}>
                        <LandmarkIcon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{g.name}</span>
                        <Badge n={n} />
                      </button>
                    </li>
                  );
                })}
                {groups.length === 0 && <li className="px-2.5 py-1 text-xs text-gray-500">You are not in a group yet.</li>}
              </ul>
              <button type="button" onClick={onBrowse} data-testid="browse-groups" className={cn('mt-1 flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-blue-700', HOVER)}>
                <Search className="h-4 w-4" aria-hidden="true" />Browse groups
              </button>
            </>
          )}
        </div>
      )}
      {collapsed && <div className="flex-1" />}
    </nav>
  );
}

function BottomTabs({ st, active, onTab }: { st: State; active: MobileTab | null; onTab: (p: MobileTab) => void }) {
  const unread = totalUnread(st);
  return (
    <nav aria-label="Places" data-testid="bottom-tabs" className="flex shrink-0 border-t bg-white md:hidden">
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

/* ---------- live transcription ---------- */

type Capture = { chatId: string; paused: boolean } | null;

/** Pinned at the top of a live event channel: Transcribe when idle; Pause/Resume + Stop while I transcribe. */
function CaptureBanner({ capture, chatId, onStart, onPause, onStop }: { capture: Capture; chatId: string; onStart: () => void; onPause: () => void; onStop: () => void }) {
  const mine = capture?.chatId === chatId ? capture : null;
  return (
    <div data-testid="live-banner" className="shrink-0">
      {mine ? (
        <SessionBar
          ariaLabel="Room transcription" testId="capture-bar"
          text={mine.paused ? 'Transcribing paused' : 'Transcribing · what you say posts here as you'}
          showDot={!mine.paused}
          extra={<>
            <button type="button" onClick={onPause} aria-pressed={mine.paused} className={CAPTURE_CONTROL} data-testid={mine.paused ? 'capture-resume' : 'capture-pause'}>
              {mine.paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}{mine.paused ? 'Resume' : 'Pause'}
            </button>
            <SessionStopButton onClick={onStop} label="Stop" ariaLabel="Stop transcribing" testId="capture-stop" />
          </>}
        />
      ) : (
        <SessionBar tone="idle" ariaLabel="Room transcription" testId="capture-idle" text="Event in progress. Transcribe to post what you say."
          primary={{ label: 'Transcribe', onClick: onStart, testId: 'capture-start' }} />
      )}
    </div>
  );
}


/**
 * v15 #9: FAITHFUL COPY of production's CompactCaptureBar (room-capture-bar.tsx:48-90). The real one is not exported
 * and reads useRoomCapture() (the live recorder), so its markup, classes, labels and test ids are reproduced here:
 * the status word (capture-status SHORT), the level meter (capture-level-meter's markup, animated by a mock), the
 * real ⓘ (CaptureInfoButton, reused), then Pause/Resume, Stop and Open the room as icons.
 */
function CompactCaptureBarCopy({ paused, onPause, onStop, onOpen }: { paused: boolean; onPause: () => void; onStop: () => void; onOpen: () => void }) {
  const short = paused ? SHORT.paused : SHORT.running;
  const [tick, setTick] = useState(0);
  useEffect(() => { if (paused) return; const t = window.setInterval(() => setTick((n) => n + 1), 300); return () => window.clearInterval(t); }, [paused]);
  const lit = paused ? 0 : [2, 4, 3, 5, 1, 4][tick % 6]!;
  return (
    <div role="status" aria-label={`Room transcription: ${short}`} data-testid="room-capture-bar" data-form="short"
      className="relative z-40 shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-1">
      <div className="mx-auto flex max-w-4xl items-center gap-2">
        <span className="text-sm font-medium text-blue-900">{short}</span>
        <span aria-hidden="true" data-testid="capture-level-meter" data-level={lit} className="inline-flex h-3.5 items-end gap-[2px]">
          {Array.from({ length: 5 }, (_, i) => <i key={i} data-lit={i < lit ? 'true' : 'false'} style={{ height: `${40 + i * 15}%` }} className="block w-[3px] rounded-sm bg-blue-200 transition-colors duration-75 data-[lit=true]:bg-blue-600" />)}
        </span>
        <CaptureInfoButton />
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={CAPTURE_ICON_BUTTON} onClick={onPause} aria-label={paused ? 'Resume' : 'Pause'} aria-pressed={paused}>
            {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button type="button" className={`${CAPTURE_ICON_BUTTON} hover:text-destructive active:bg-destructive/10 active:text-destructive`} onClick={onStop} aria-label="Stop transcribing" data-testid="room-capture-bar-end">
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </button>
          <button type="button" className={CAPTURE_ICON_BUTTON} onClick={onOpen} aria-label="Open the room" data-testid="room-capture-bar-open">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- pages ---------- */

const asProfile = (id: PersonId): ProfileData => {
  const p = PEOPLE[id];
  return { id: `mock-${id}`, slug: p.slug, name: p.name, email: p.email, role: p.role, bio: p.bio, avatarColor: p.avatarColor, hasPledged: p.pledger, signedAt: '', isVerified: true, witnesses: [], reciprocations: 0 };
};

function Profile({ st, person, onBack, onMessage }: { st: State; person: PersonId; onBack: () => void; onMessage: () => void }) {
  const self = person === st.viewer;
  const shared = [...GROUPS.filter((g) => g.members.includes(st.viewer) && g.members.includes(person)).map((g) => g.name), ...EVENTS.filter((e) => e.attendees.includes(st.viewer) && e.attendees.includes(person)).map((e) => e.name)];
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="profile">
      <Header backAlways onBack={onBack} title={<PageTitle>{self ? 'My profile' : 'Profile'}</PageTitle>} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50">
        <div className="mx-auto flex max-w-xl flex-col gap-3 px-3 py-4" onClickCapture={stayInPrototype}>
          <CompactProfileCard profile={asProfile(person)} isOwner={self} />
          {!self && canMessage(st.viewer, person) && <button type="button" onClick={onMessage} className={cn(BLUE, 'w-full')}><MessageCircle className="h-4 w-4" />{COPY.message}</button>}
          {!self && <p className="px-1 text-sm text-gray-500">{shared.length > 0 ? `You share: ${shared.join(', ')}` : 'You share no group or event.'}</p>}
        </div>
      </div>
    </div>
  );
}

const PersonRow = ({ p, onPerson }: { p: PersonId; onPerson: (p: PersonId) => void }) => (
  <li><button type="button" onClick={() => onPerson(p)} className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-left', HOVER)}><Avatar person={p} size="sm" /><span className="min-w-0"><span className="block text-[15px] text-gray-900">{PEOPLE[p].name}</span><span className="block text-xs text-gray-500">{PEOPLE[p].role}</span></span></button></li>
);

function Members({ chat, onBack, onPerson }: { chat: Chat; onBack: () => void; onPerson: (p: PersonId) => void }) {
  const list = channelMembers(chat);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="members">
      <Header backAlways onBack={onBack} title={<PageTitle>{list.length} members</PageTitle>} />
      <ul className="overflow-y-auto py-2">{list.map((p) => <PersonRow key={p} p={p} onPerson={onPerson} />)}</ul>
    </div>
  );
}


/** Production `Organization` from the mock group. */
const asOrg = (g: Group): Organization => ({ id: `org-${g.id}`, slug: g.slug, name: g.name, blurb: g.blurb, description: g.description, visibility: 'public', hasEvents: g.hasEvents });

/** Phone "Groups" tab: my groups, and Browse groups. */
function GroupsPage({ st, onGroup, onBrowse }: { st: State; onGroup: (id: string) => void; onBrowse: () => void }) {
  const groups = myGroups(st);
  return (
    <Page testId="groups-page" title="Your groups">
      <ul aria-label="Your groups" className="py-2">
        {groups.map((g) => (
          <li key={g.id}><button type="button" onClick={() => onGroup(g.id)} className={cn('flex min-h-16 w-full items-center gap-3 px-4 text-left', HOVER)}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white"><LandmarkIcon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-gray-900">{g.name}</span><span className="block text-xs text-gray-500">{groupPeople(g.id).length} members</span></span>
            <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
          </button></li>
        ))}
        {groups.length === 0 && <li className="px-6 py-8 text-center text-sm text-gray-500">You are not in any group yet.</li>}
      </ul>
      <div className="px-4"><button type="button" onClick={onBrowse} className={OUTLINE}><Search className="h-4 w-4" />Browse groups</button></div>
    </Page>
  );
}

/** A copy of OrgDirectoryPage's structure, its cards the production OrgCard (the card's link is kept in the prototype). */
function DirectoryPage({ st, onBack, onGroup }: { st: State; onBack: () => void; onGroup: (id: string) => void }) {
  const open = (g: Group) => (e: MouseEvent) => { if ((e.target as HTMLElement).closest('a')) { e.preventDefault(); onGroup(g.id); } };
  return (
    <Page testId="directory-page" title="Clarity Groups" onBack={onBack}>
      <div className="px-4 py-6">
        <div className="mx-auto max-w-5xl space-y-8">
          <header className="min-w-0">
            <h1 className="text-2xl font-bold sm:text-3xl">Clarity Groups</h1>
            <p className="mt-2 max-w-prose text-base text-muted-foreground">Communities practising calibrated communication together. Go into one to see its events and members.</p>
          </header>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {GROUPS.map((g) => (
              <li key={g.id} onClickCapture={open(g)} data-group={g.id}>
                <OrgCard org={asOrg(g)} memberCount={groupPeople(g.id).length} eventSummary={{ pastCount: eventsOfGroup(g.id).filter((e) => e.past).length } as never} isMine={isMember(st, st.viewer, g.id)} />
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">Looking for a single event? <a href={EVENTS_LIST_TO} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700">Browse all events</a>.</p>
        </div>
      </div>
    </Page>
  );
}

type GroupTab = 'events' | 'members' | 'about' | 'chats';

/**
 * A copy of production OrgPage (org-page.tsx): the real OrgHeader, then Events / Members / About tabs in `?tab=`
 * (the default, Events, carries no param), plus v15's Chats tab (the group's channels). Members renders the real
 * PersonRow per person (production renders PledgerGrid, which needs its own data shape). Events is a mock list in
 * place of the embedded production EventsList (which reads the events service).
 */
function GroupPage({ st, groupId, tab, onTab, onBack, onEvent, onChannel, onPerson, onJoin, onLeave }: {
  st: State; groupId: string; tab: GroupTab; onTab: (t: GroupTab) => void; onBack: () => void; onEvent: (id: string) => void; onChannel: (id: string) => void;
  onPerson: (p: PersonId) => void; onJoin: () => void; onLeave: () => void;
}) {
  const g = GROUPS.find((x) => x.id === groupId);
  if (!g) return <Page testId="group-page" title="Group" onBack={onBack}><p className="px-4 py-8 text-sm text-gray-600">This group does not exist.</p></Page>;
  const member = isMember(st, st.viewer, g.id);
  const people = groupPeople(g.id);
  const chans = groupSections(st).find((x) => x.groupId === g.id)?.chats ?? [];
  const events = eventsOfGroup(g.id);
  return (
    <Page testId="group-page" title={g.name} onBack={onBack}>
      <div className="min-w-0 px-4 py-6" data-group={g.id} onClickCapture={(e) => { const a = (e.target as HTMLElement).closest('a'); if (a && !a.target) { e.preventDefault(); toast('This opens the real page in the app.'); } }}>
        <div className="mx-auto min-w-0 max-w-4xl space-y-6">
          <OrgHeader org={asOrg(g)} memberCount={people.length} isMember={member} myRole={member ? (g.organizers.includes(st.viewer) ? 'organizer' : 'member') : null} organizerCount={g.organizers.length}
            onJoin={onJoin} onLeave={onLeave} onShowMembers={() => onTab('members')} currentUserId={mockId(st.viewer)} />
          <Tabs value={tab} onValueChange={(v) => onTab(v as GroupTab)}>
            <TabsList className="h-auto w-full min-w-0 justify-start gap-4 overflow-x-auto overflow-y-hidden rounded-none border-b border-border bg-transparent p-0 [scrollbar-width:none] sm:gap-6" data-testid="group-tabs">
              {g.hasEvents && <TabsTrigger value="events" className={ORG_TAB_CLASS}>Events</TabsTrigger>}
              <TabsTrigger value="members" className={ORG_TAB_CLASS}>Members</TabsTrigger>
              <TabsTrigger value="about" className={ORG_TAB_CLASS}>About</TabsTrigger>
              <TabsTrigger value="chats" className={ORG_TAB_CLASS}>Chats</TabsTrigger>
            </TabsList>
            <TabsContent value="events" className="pt-4">
              <ul aria-label={`${g.name} events`} className="space-y-3" data-testid="group-events">
                {events.map((e) => (
                  <li key={e.id}><button type="button" onClick={() => onEvent(e.id)} className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:border-blue-500/50 hover:shadow">
                    <CalendarDays className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-gray-900">{e.name}</span><span className="block text-sm text-muted-foreground">{e.when} · {e.location}{e.past ? ' · past' : ''}</span></span>
                    <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  </button></li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="members" className="pt-4">
              <div className="space-y-2" data-testid="group-members" onClickCapture={(e) => { const a = (e.target as HTMLElement).closest('a'); const slug = a?.getAttribute('href')?.split('/p/')[1]; const p = slug && (Object.keys(PEOPLE) as PersonId[]).find((id) => PEOPLE[id].slug === slug); if (a) { e.preventDefault(); e.stopPropagation(); if (p) onPerson(p); } }}>
                {people.map((p) => <ProdPersonRow key={p} profileId={mockId(p)} slug={PEOPLE[p].slug} name={PEOPLE[p].name} avatarColor={PEOPLE[p].avatarColor} isPledger={PEOPLE[p].pledger} showEarBadge={false} />)}
              </div>
            </TabsContent>
            <TabsContent value="about" className="pt-4">
              <div className="mx-auto max-w-2xl space-y-6" data-testid="group-about">
                <div className="space-y-4 rounded-lg border border-border bg-card p-6 md:p-8">
                  <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-relaxed">This group runs on the <button type="button" onClick={onJoin} className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700">Clarity Group Terms</button>. Every member accepts them on joining.</p>
                  <p className="break-words text-base leading-relaxed">{g.description}</p>
                </div>
                {!member && <Button onClick={onJoin} className="min-h-11 w-full bg-blue-500 text-white hover:bg-blue-700">Join this group</Button>}
              </div>
            </TabsContent>
            <TabsContent value="chats" className="pt-4">
              {chans.length > 0 ? (
                <ul aria-label={`${g.name} channels`} className="overflow-hidden rounded-xl border bg-white" data-testid="group-chats">
                  {chans.map((c) => <li key={c.id}><button type="button" onClick={() => onChannel(c.id)} className={cn('flex min-h-12 w-full items-center gap-3 px-3 text-left', HOVER)}><ChannelMark chat={c} size="sm" /><span className="min-w-0 flex-1 truncate text-sm text-gray-900">{rowTitle(st, c, true)}</span><span className="text-xs text-gray-500">{c.eventId ? 'members + attendees' : 'members'}</span></button></li>)}
                </ul>
              ) : <p className="py-8 text-center text-sm text-muted-foreground" data-testid="group-chats">Join the group to see its chats.</p>}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Page>
  );
}

/** A copy of org-join-page's structure: the real CertificateFrame and CertificateOathBody with the current Clarity Group Terms. */
function JoinPage({ st, groupId, onBack, onJoined }: { st: State; groupId: string; onBack: () => void; onJoined: () => void }) {
  const g = GROUPS.find((x) => x.id === groupId);
  if (!g) return null;
  const coa = COA_VERSIONS[CURRENT_COA_VERSION];
  const member = isMember(st, st.viewer, g.id);
  return (
    <Page testId="join-page" title={member ? `${g.name} — terms` : `Join ${g.name}`} onBack={onBack}>
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
                  <Button onClick={onJoined} size="lg" className="min-h-11 w-full bg-blue-600 py-4 text-base font-semibold text-white hover:bg-blue-700 md:py-6 md:text-lg" data-testid="accept-join">Accept terms &amp; join</Button>
                  <p className="text-center text-[10px] text-[#1A1A1A]/60 md:text-xs">Accept the terms to join {g.name}.</p>
                </>
              )}
            </div>
          </CertificateFrame>
        </div>
      </div>
    </Page>
  );
}

/**
 * v15 #3: an event page modelled on production EventDetail: the real BannerDisplay, a Back that returns to THIS
 * event's group, the Details / room tab row (production label: "Join now" near the start, else "Event Room"), the
 * title card (date, location), Reserve a seat then the "You're going!" card, the topic-vote area (placeholder: the
 * production TopicsPage reads live topics), the organizer and the Participants card of real PersonRows, and
 * "Open event chat" to the event's channel.
 */
function EventPage({ st, event, onBack, onGroup, onChat, onPerson }: { st: State; event: EventInfo; onBack: () => void; onGroup: () => void; onChat: () => void; onPerson: (p: PersonId) => void }) {
  const g = GROUPS.find((x) => x.id === event.groupId)!;
  const going = isGoing(st, event.id);
  const people = attendeesOf(st, event.id);
  const host = PEOPLE[event.host];
  const chat = st.chats.find((c) => c.eventId === event.id);
  const canChat = !!chat && visibleChats(st).some((c) => c.id === chat.id);
  const keep = (e: MouseEvent) => { const a = (e.target as HTMLElement).closest('a'); if (!a) return; e.preventDefault(); e.stopPropagation(); const slug = a.getAttribute('href')?.split('/p/')[1]; const p = slug && (Object.keys(PEOPLE) as PersonId[]).find((id) => PEOPLE[id].slug === slug); if (p) onPerson(p); else toast('This opens the real page in the app.'); };
  const ctx = useContext(EventCtx);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="event-page" data-group={g.id}>
      <Header backAlways onBack={onBack} title={<PageTitle>{event.name}</PageTitle>} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-background" onClickCapture={keep}>
        {/* Review #2: a short hero on phones, so "Reserve a seat" is in the first screen at 320x640. */}
        <BannerDisplay bannerUrl={null} fallbackColor={host.avatarColor} altText={event.name} heightClassName="h-16 sm:h-32 md:h-64" />
        <div className="mx-auto min-w-0 max-w-6xl px-4 py-3 sm:py-6">
          {/* Review #2: the header arrow is history Back; this link always goes to the event's OWN group. */}
          <button type="button" onClick={onGroup} data-testid="event-back-link" className="mb-2 inline-flex min-h-10 max-w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:mb-4"><ArrowLeft className="h-4 w-4 shrink-0" /><span className="truncate">Back to {g.name}</span></button>
          {!event.past && (
            <div className="mb-3 flex w-full items-center sm:mb-6 justify-start gap-6 overflow-x-auto border-b border-border">
              <span className="inline-flex min-h-11 items-center whitespace-nowrap border-b-2 border-blue-500 px-1 pb-3 text-base font-medium text-foreground">Details</span>
              <button type="button" onClick={() => toast('The event room opens here in the app.')} data-testid="event-room-tab" className="inline-flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent px-1 pb-3 text-base font-medium text-muted-foreground transition-colors hover:text-foreground">{event.today ? 'Join now' : 'Event Room'}</button>
            </div>
          )}
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="min-w-0 flex-1">
              <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
                <h1 className="mb-3 text-2xl font-bold md:mb-4 md:text-3xl">{event.name}</h1>
                <div className="mb-3 flex items-center gap-3 text-muted-foreground"><CalendarPlus className="h-5 w-5 flex-shrink-0" /><span className="font-medium text-foreground">{event.when}</span></div>
                <div className="mb-4 flex items-center gap-3 text-muted-foreground">{event.location === 'Online' ? <Video className="h-5 w-5 flex-shrink-0" /> : <MapPin className="h-5 w-5 flex-shrink-0" />}<span>{event.location}</span></div>
                <div className="mb-4" data-testid="rsvp-area">
                  {event.past ? <Button disabled className="w-full" size="lg" data-testid="rsvp-button">Event Ended</Button>
                    : going ? (
                      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-4 sm:p-4" data-testid="rsvp-going">
                        <div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 flex-shrink-0 text-green-600" /><div><p className="font-semibold text-green-800">You&apos;re going!</p><p className="text-sm text-green-700">See you there</p></div></div>
                        <div className="mt-2 text-center"><Button variant="ghost" size="sm" className="min-h-10" onClick={() => ctx?.toggle(event.id)} data-testid="cancel-rsvp">Cancel RSVP</Button></div>
                      </div>
                    ) : <Button onClick={() => ctx?.toggle(event.id)} className="w-full bg-blue-500 text-white hover:bg-blue-700" size="lg" data-testid="rsvp-button">Reserve a seat</Button>}
                </div>
                <p className="text-base leading-relaxed">{event.description}</p>
                <div className="mt-4">
                  {canChat ? <button type="button" onClick={onChat} className={OUTLINE} data-testid="open-event-chat"><MessagesSquare className="h-4 w-4" />Open event chat</button>
                    : <p className="text-sm text-muted-foreground" data-testid="event-chat-closed">The event chat opens to the group&apos;s members and the event&apos;s attendees.</p>}
                </div>
              </div>
              {!event.past && (
                /* PLACEHOLDER: production embeds TopicsPage here (live topics and votes); this keeps its frame. */
                <div id="topic-vote" data-testid="topic-vote" data-placeholder="TopicsPage" className="mb-6 rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
                  <h2 className="text-base font-semibold text-gray-900">Vote on tonight&apos;s topics</h2>
                  <p className="mt-1 text-sm text-gray-600">Placeholder: the production topic vote (TopicsPage) renders here with live topics.</p>
                </div>
              )}
            </div>
            <div className="space-y-6 lg:w-96 lg:flex-shrink-0">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Event Organizer</h2>
                <ProdPersonRow profileId={mockId(event.host)} slug={host.slug} name={host.name} avatarColor={host.avatarColor} isPledger={host.pledger} showEarBadge={false} />
              </div>
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm" data-testid="participants">
                <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Participants ({people.length})</h2>
                <div className="space-y-2">{people.map((p) => <ProdPersonRow key={p} profileId={mockId(p)} slug={PEOPLE[p].slug} name={PEOPLE[p].name} avatarColor={PEOPLE[p].avatarColor} isPledger={PEOPLE[p].pledger} showEarBadge={false} />)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
const EventCtx = createContext<{ toggle: (id: string) => void } | null>(null);

/** Letters: production's three tabs (letters-page.tsx: Inbox, Drafts, Published = `sent`), mock rows. */
const LETTERS_EMPTY: Record<LetterBox, string> = { inbox: 'No letters yet.', drafts: 'No drafts yet.', sent: 'You have not published a letter yet.' };
/** Review #8: Drafts and Published are the viewer's own (lettersIn); every tab has an empty state. */
function LettersPage({ st, tab, onTab, onLetter }: { st: State; tab: LetterBox; onTab: (t: LetterBox) => void; onLetter: (id: string) => void }) {
  const rows = (box: LetterBox) => lettersIn(st, box).length === 0 ? <p className="rounded-lg border bg-white px-4 py-10 text-center text-sm text-gray-500" data-testid={`letters-empty-${box}`}>{LETTERS_EMPTY[box]}</p> : (
    <ul aria-label={box} className="divide-y rounded-lg border bg-white">
      {lettersIn(st, box).map((l) => (
        <li key={l.id}><button type="button" onClick={() => onLetter(l.id)} className={cn('flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left', HOVER)} data-testid="letter-row">
          <Avatar person={l.author} size="sm" />
          <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-gray-900">{l.title}</span><span className="block text-xs text-gray-500">{PEOPLE[l.author].name} · {l.date}</span></span>
          {box === 'drafts' && <LetterStatusBadge status="in_progress" label="Draft" />}
        </button></li>
      ))}
    </ul>
  );
  const inboxN = lettersIn(st, 'inbox').length;
  return (
    <Page testId="letters-page" title="Clarity Letters">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Tabs value={tab} onValueChange={(v) => onTab(v as LetterBox)}>
          <div className="flex items-end justify-between">
            <TabsList className="h-auto w-auto justify-start rounded-none border-b p-0" data-testid="letter-tabs">
              <TabsTrigger value="inbox" aria-label={`Inbox, ${inboxN} unread`} className={LETTER_TAB_CLASS}>Inbox ({inboxN})</TabsTrigger>
              <TabsTrigger value="drafts" className={LETTER_TAB_CLASS}>Drafts</TabsTrigger>
              <TabsTrigger value="sent" className={LETTER_TAB_CLASS}>Published</TabsTrigger>
            </TabsList>
            <Button size="sm" className="mb-1 bg-blue-500 text-white hover:bg-blue-700" onClick={() => toast('New Draft opens the letter editor in the app.')}><Plus className="h-4 w-4" />New Draft</Button>
          </div>
          {(['inbox', 'drafts', 'sent'] as const).map((b) => <TabsContent key={b} value={b} className="mt-4">{rows(b)}</TabsContent>)}
        </Tabs>
      </div>
    </Page>
  );
}

function LetterView({ st, letterId, onBack }: { st: State; letterId: string; onBack: () => void }) {
  const l = (['inbox', 'drafts', 'sent'] as const).flatMap((b) => lettersIn(st, b)).find((x) => x.id === letterId);
  if (!l) return null;
  return (
    <Page testId="letter-view" title="Letter" onBack={onBack}>
      <article className="mx-auto w-full max-w-2xl px-4 py-6">
        <h2 className="text-xl font-semibold text-gray-900">{l.title}</h2>
        <p className="mt-1 flex items-center gap-2 text-sm text-gray-500"><Avatar person={l.author} size="xs" />{PEOPLE[l.author].name} · {l.date}</p>
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-gray-800">{l.body}</p>
      </article>
    </Page>
  );
}

/** Home = production's feed structure (feed-page.tsx): Stories (default) and Points tabs with counts, the real cards. */
function HomePage({ st, tab, onTab, onBrowse }: { st: State; tab: 'stories' | 'points'; onTab: (t: 'stories' | 'points') => void; onBrowse: () => void }) {
  const visible = st.empty ? [] : SHAREABLE.filter((x) => x.author === st.viewer || canMessage(st.viewer, x.author) || true);
  const stories = visible.filter((x) => x.kind === 'story');
  const points = visible.filter((x) => x.kind === 'point');
  const tabBtn = (t: 'stories' | 'points', label: string) => (
    <button role="tab" aria-selected={tab === t} onClick={() => onTab(t)} className={`relative min-h-10 whitespace-nowrap px-2 py-2 text-sm font-medium transition-colors sm:px-4 ${tab === t ? 'text-blue-600' : 'text-muted-foreground hover:text-foreground'}`}>
      {label}{tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
    </button>
  );
  return (
    <Page testId="home-page" title="Home">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <div role="tablist" className="mb-4 flex items-center gap-0 border-b border-border" data-testid="feed-tabs">
          {tabBtn('stories', `Stories (${stories.length})`)}
          {tabBtn('points', `Points (${points.length})`)}
        </div>
        <div role="tabpanel" className="space-y-4" data-testid={`feed-${tab}`}>
          {(tab === 'stories' ? stories : points).map((x) => <ShareCard key={x.id} item={x} full />)}
          {(tab === 'stories' ? stories : points).length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center" data-testid="home-empty">
              <p className="text-sm text-muted-foreground">{tab === 'stories' ? 'No stories yet.' : 'No points yet.'} Join a group to see what its people share.</p>
              <button type="button" onClick={onBrowse} className={OUTLINE}><Search className="h-4 w-4" />Browse groups</button>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

/** Tools: production's 3-tab selector (event-links-menu.tsx LinksMenuTabs, not exported: its Radix Tabs copied) over production's buildLinksMenu entries. */
const LINK_TABS = [{ value: 'tools' as const, label: 'Tools' }, { value: 'points' as const, label: 'Points' }, { value: 'letters' as const, label: 'Letters' }];
function ToolsPage() {
  const entries = buildLinksMenu(null);
  const row = (e: LinksMenuEntry, k: string) => (
    <a key={k} href={e.to} target="_blank" rel="noreferrer" data-testid="event-links-entry" className={cn('flex min-h-11 items-center justify-between gap-3 rounded-lg border px-4 text-sm font-medium', e.featured ? 'border-blue-300 bg-blue-50 text-blue-700' : 'bg-white text-gray-900 hover:bg-gray-50')}>
      <span className="min-w-0 truncate">{e.label}</span>{e.hint && <span className="shrink-0 text-xs font-normal text-gray-500">{e.hint}</span>}
    </a>
  );
  return (
    <Page testId="tools-page" title="Tools">
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

/** Phone Profile tab: the same account menu as a page. */
function MePage({ viewer, a }: { viewer: ViewerId; a: MenuActions }) {
  return (
    <Page testId="me-page" title={PEOPLE[viewer].name}>
      <div role="menu" aria-label="My account" className="px-2 py-2" data-testid="me-menu"><ProfileMenuItems viewer={viewer} a={a} onPick={(f) => f} tools /></div>
    </Page>
  );
}

/** The signed-out stub (Log Out is a mock). */
function SignedOut({ onLogIn }: { onLogIn: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center" data-testid="signed-out">
      <p className="text-lg font-semibold text-gray-900">You are logged out.</p>
      <p className="text-sm text-gray-600">Stand-in for production&apos;s signed-out screen.</p>
      <button type="button" onClick={onLogIn} className={BLUE}>Log In</button>
    </div>
  );
}

const asAgreement = (st: State, other: PersonId, status: 'active' | 'pending'): ClarityAgreement => {
  const party = (p: PersonId) => ({ profileId: mockId(p), name: PEOPLE[p].name, slug: PEOPLE[p].slug, avatarColor: PEOPLE[p].avatarColor, avatarUrl: null, hasPledged: PEOPLE[p].pledger });
  return {
    id: `ag-${st.viewer}-${other}`, displayId: 'A-0000', creatorProfileId: mockId(st.viewer), partnerProfileId: mockId(other), partnerEmail: PEOPLE[other].email, partnerDisplayName: PEOPLE[other].name,
    termsText: '', status, visibility: 'private', invitationToken: 'mock', invitationExpiresAt: CREATED, createdAt: CREATED, partnerSignedAt: status === 'active' ? CREATED : null,
    terminatedAt: null, terminatedBy: null, agreementVersion: CURRENT_AGREEMENT_VERSION, creator: party(st.viewer), partner: party(other),
  };
};

/** A copy of profile-connections-page's structure ("My Partners"): the real AgreementRow per agreement; a row opens our 1:1. */
function PartnersPage({ st, onBack, onPartner, onNew }: { st: State; onBack: () => void; onPartner: (p: PersonId) => void; onNew: () => void }) {
  const all = (Object.keys(PEOPLE) as PersonId[]).filter((p) => p !== st.viewer);
  const active = all.filter((p) => partnerState(st, p) === 'partner');
  const pending = all.filter((p) => partnerState(st, p) === 'pending');
  const has = active.length + pending.length > 0;
  const list = (ps: PersonId[], status: 'active' | 'pending') => (
    <ul className="space-y-0.5">{ps.map((p) => <div key={p} data-partner={p} onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a')) { e.preventDefault(); e.stopPropagation(); onPartner(p); } }}><AgreementRow agreement={asAgreement(st, p, status)} currentProfileId={mockId(st.viewer)} /></div>)}</ul>
  );
  return (
    <Page testId="partners-page" title="Partners" onBack={onBack}>
      <div className="mx-auto mt-3 max-w-2xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">My Partners</h1>
          {has && <Button className="min-h-11 bg-blue-600 text-white hover:bg-blue-700/90" onClick={onNew}>Invite a new partner</Button>}
        </div>
        <section aria-label="Partner Agreements">
          {!has ? (
            <div className="py-8 text-center"><p className="mb-4 text-sm text-muted-foreground">No partners yet. Invite someone to get started.</p><Button className="min-h-11 bg-blue-600 text-white" onClick={onNew}>Invite a new partner</Button></div>
          ) : (
            <div className="space-y-6">
              {active.length > 0 && <div><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Active ({active.length})</h2>{list(active, 'active')}</div>}
              {pending.length > 0 && <div><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pending invitation ({pending.length})</h2>{list(pending, 'pending')}</div>}
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}

/**
 * v11's New partner / Invite as partner page (ClarityChatV11.tsx:451, 474-482): the production AgreementCertificate in
 * creation mode inside CertificatePageShell, then Seal & Send. With `who`, the partner is fixed. Without it (review #5)
 * the partner is PICKED from a people list that filters as you type; Seal & Send stays hidden until someone is picked,
 * so no "sent" ever shows without an invite being created.
 */
function PartnerInvitePage({ st, who, onBack, onSent }: { st: State; who?: PersonId; onBack: () => void; onSent: (p: PersonId) => void }) {
  const [picked, setPicked] = useState<PersonId | undefined>(who);
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const people = (Object.keys(PEOPLE) as PersonId[]).filter((p) => p !== st.viewer && partnerState(st, p) === 'none'
    && (!s || PEOPLE[p].name.toLowerCase().includes(s) || PEOPLE[p].slug.includes(s) || PEOPLE[p].email === s));
  return (
    <Page testId="partner-invite-page" title={COPY.newPartner} onBack={onBack}>
      <div className="mx-auto max-w-3xl space-y-3 py-4">
        {!who && (
          <div className="px-4" data-testid="partner-picker">
            {picked ? (
              <div className="flex min-h-12 items-center gap-3 rounded-lg border bg-white px-3">
                <Avatar person={picked} size="sm" /><span className="min-w-0 flex-1 truncate text-[15px] text-gray-900">{PEOPLE[picked].name}</span>
                <button type="button" onClick={() => setPicked(undefined)} className={cn(OUTLINE, 'shrink-0')}>Change</button>
              </div>
            ) : (
              <>
                <label className="flex min-h-11 items-center gap-2 rounded-full bg-gray-100 px-3 text-gray-500">
                  <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people by name" aria-label="Search people" className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none md:text-sm" />
                </label>
                <ul aria-label="People" className="mt-2 overflow-hidden rounded-lg border bg-white">
                  {people.map((p) => <PersonRow key={p} p={p} onPerson={setPicked} />)}
                  {people.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-500">No one matches.</li>}
                </ul>
              </>
            )}
          </div>
        )}
        {picked && (
          <>
            <CertificatePageShell className="py-2">
              <AgreementCertificate variant="creation" agreementVersion={CURRENT_AGREEMENT_VERSION} creatorName={PEOPLE[st.viewer].name} creatorSignedAt={CREATED}
                partnerNameValue={PEOPLE[picked].name} partnerNameReadOnly onPartnerNameChange={() => {}} termsText="" onTermsChange={() => {}} />
            </CertificatePageShell>
            <div className="px-4"><Button type="button" className={cn(BLUE, 'w-full')} onClick={() => onSent(picked)} data-testid="seal-and-send">{COPY.sealAndSend}</Button></div>
          </>
        )}
      </div>
    </Page>
  );
}

/** v11's New chat: pick someone I can message. */
function NewChatPage({ st, onBack, onPick, onBrowse }: { st: State; onBack: () => void; onPick: (p: PersonId) => void; onBrowse: () => void }) {
  const people = contactsOf(st);
  return (
    <Page testId="new-chat-page" title={COPY.newChat} onBack={onBack}>
      {people.length > 0 ? <ul className="py-2">{people.map((p) => <PersonRow key={p} p={p} onPerson={onPick} />)}</ul> : (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" data-testid="no-contacts">
          <p className="text-sm text-gray-600">Join a group or RSVP to an event to message people there.</p>
          <button type="button" onClick={onBrowse} className={OUTLINE}><Search className="h-4 w-4" />Browse groups</button>
        </div>
      )}
    </Page>
  );
}

/* ---------- sheets ---------- */

function Sheet({ label, title, onClose, children, wide = false }: { label: string; title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useDismiss(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-label={label} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cn('flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white sm:rounded-2xl', wide ? 'sm:max-w-lg' : 'sm:max-w-sm')}>
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b px-4"><div className="min-w-0 font-semibold text-gray-900">{title}</div><button type="button" autoFocus aria-label="Close" onClick={onClose} className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', HOVER)}><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
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
          </div>
          <label className="mt-3 block text-sm text-gray-700">Add a note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border px-3 text-base outline-none focus:border-gray-500 md:text-sm" />
          </label>
        </div>
        <div className="border-t p-3"><button type="button" onClick={() => onDone(target.id, note)} className={cn(BLUE, 'w-full')}><Forward className="h-4 w-4" />Send</button></div>
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


/** The composer's Share (v15 #8, was 📎 Attach): Points and Stories tabs, each item in its production card with Share beside it. */
function AttachDialog({ st, onPick, onClose }: { st: State; onPick: (s: Shareable) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'point' | 'story'>('point');
  const items = findShareable(st, q, kind);
  return (
    <Sheet wide label={COPY.shareTitle} onClose={onClose} title={COPY.shareTitle}>
      <div className="space-y-2 px-3 pt-3">
        <div role="tablist" aria-label="Kind" className="flex gap-1 border-b">
          {(['point', 'story'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={cn('min-h-11 border-b-2 px-4 text-sm font-medium', kind === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900')}>{k === 'point' ? 'Points' : 'Stories'}</button>)}
        </div>
        <label className="flex min-h-11 items-center gap-2 rounded-full bg-gray-100 px-3 text-gray-500">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words or #tags" aria-label="Search points and stories" className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none md:text-sm" />
        </label>
      </div>
      <ul className="space-y-3 overflow-y-auto p-3" data-testid="attach-results" data-kind={kind}>
        {items.map((s) => (
          <li key={s.id} className="flex flex-col gap-1">
            <ShareCard item={s} full />
            <button type="button" onClick={() => onPick(s)} aria-label={`${COPY.share} ${s.title}`} className={cn(OUTLINE, 'self-end')}>{COPY.share}</button>
          </li>
        ))}
        {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-gray-500">{kind === 'point' ? 'No points match.' : 'No stories match.'} Try fewer words or another #tag.</li>}
      </ul>
    </Sheet>
  );
}

function GroupInfo({ st, groupId, onClose, onPage, onLeave, onChannel }: { st: State; groupId: string; onClose: () => void; onPage: () => void; onLeave: () => void; onChannel: (id: string) => void }) {
  const g = GROUPS.find((x) => x.id === groupId)!;
  const member = isMember(st, st.viewer, groupId);
  const chans = groupSections(st).find((x) => x.groupId === groupId)?.chats ?? [];
  const tile = 'flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl border bg-white text-sm text-gray-900 hover:bg-gray-50';
  return (
    <Sheet label="Group info" onClose={onClose} title="Group info">
      <div className="overflow-y-auto bg-gray-50 pb-3" data-testid="group-info">
        <div className="flex flex-col items-center px-4 pb-4 pt-5 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white"><LandmarkIcon className="h-7 w-7" aria-hidden="true" /></span>
          <h2 className="mt-2 text-lg font-semibold text-gray-900">{g.name}</h2>
          <p className="text-sm text-gray-500">{groupPeople(groupId).length} members</p>
        </div>
        <div className="flex gap-2 px-4">
          <button type="button" className={tile} onClick={onPage}><LandmarkIcon className="h-5 w-5" />Group page</button>
          {member && <button type="button" className={tile} onClick={onLeave}><LogOut className="h-5 w-5" />Leave</button>}
        </div>
        <h3 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">{COPY.channels}</h3>
        <ul className="mx-4 overflow-hidden rounded-xl border bg-white">
          {chans.map((c) => <li key={c.id}><button type="button" onClick={() => onChannel(c.id)} className={cn('flex min-h-12 w-full items-center gap-3 px-3 text-left', HOVER)}><ChannelMark chat={c} size="sm" /><span className="min-w-0 flex-1 truncate text-sm text-gray-900">{rowTitle(st, c, true)}</span><span className="text-xs text-gray-500">{c.eventId ? 'members + attendees' : 'members'}</span></button></li>)}
        </ul>
      </div>
    </Sheet>
  );
}

const InviteLink = ({ className, onClick }: { className?: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className={className ?? BLUE} data-testid="invite-link"><Handshake className="h-4 w-4" aria-hidden="true" />{COPY.invite}</button>
);

/* ---------- the prototype ---------- */

export function ClarityChatV16() {
  const { loc, go, back, mode } = useNav();
  const fresh = (viewer: ViewerId = 'bob') => {
    const st0 = initialState({ viewer, empty: mode === 'empty', fail: mode === 'fail', noPartners: mode === 'nopartners' });
    return mode === 'fail' && viewer === 'bob' ? openChat(st0, 'dm-bob-alice') : st0;
  };
  const [st, setSt] = useState<State>(() => fresh());
  const [tab, setTab] = useState<Tab>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Record<string, string | undefined>>({});
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [attach, setAttach] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [staged, setStaged] = useState<Record<string, Shareable | undefined>>({});
  const [leaving, setLeaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [capture, setCapture] = useState<Capture>(null);

  const view = loc.view ?? 'chats';
  const place: Place | null = (PLACES as readonly string[]).includes(view) ? (view as Place) : null;
  const mobileTab: MobileTab | null = (MOBILE_TABS as readonly string[]).includes(view) ? (view as MobileTab) : ['group', 'event', 'directory', 'join'].includes(view) ? 'groups' : null;

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

  const set = (f: (s: State) => State) => setSt((cur) => f(cur));
  const key = (k: string) => `${st.viewer}:${k}`;
  const input = (k: string) => inputs[key(k)] ?? '';
  const setInput = (k: string) => (v: string) => setInputs((cur) => ({ ...cur, [key(k)]: v }));
  const closeOverlays = () => { setForwarding(null); setAttach(null); setInfo(null); setLeaving(null); setDeleting(null); };

  const reset = (viewer: ViewerId = st.viewer) => {
    setSt(fresh(viewer)); setTab('all'); setShowArchived(false); setQ(''); setInputs({}); setReplyTo({}); setStaged({}); setCapture(null); closeOverlays(); go({}, true);
  };
  const switchViewer = (v: ViewerId) => {
    setSt((cur) => ({ ...cur, viewer: v })); setTab('all'); setShowArchived(false); setQ(''); setCapture(null); closeOverlays(); go({ view: 'chats' }, true);
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
  const openGroup = (groupId: string) => go({ view: 'group', group: groupId });
  const openEvent = (eventId: string) => go({ view: 'event', event: eventId });
  const placeGo = (p: Place | MobileTab) => { if (p === 'chats') { setShowArchived(false); } go({ view: p }); };
  const doClarify = (msgId: string) => { set((s) => clarify(s, msgId)); open(mirrorChatId(st.viewer)); };
  const menu: MenuActions = {
    onProfile: () => showProfile(st.viewer), onPartners: () => go({ view: 'partners' }), onSettings: () => go({ view: 'settings' }), onTools: () => go({ view: 'tools' }),
    onLogOut: () => { closeOverlays(); setCapture(null); go({ view: 'signedout' }, true); },
  };

  const archivedEmpty = archivedChats(st).length === 0;
  useEffect(() => { if (showArchived && archivedEmpty) setShowArchived(false); }, [showArchived, archivedEmpty]);

  const chatParam = view === 'chats' ? loc.chat : undefined;
  const openChatObj = chatParam ? visibleChats(st).find((c) => c.id === chatParam) : undefined;
  const liveChat = openChatObj && eventOf(openChatObj)?.live && canSee(st.viewer, openChatObj) ? openChatObj.id : null;
  const pendingFor = st.invites[st.viewer][0];
  const strip = (
    <Strip viewer={st.viewer} onViewer={switchViewer} onReset={() => reset()}
      onLive={liveChat && liveLinesLeft(st, liveChat) > 0 ? () => set((s) => openChat(nextLiveLine(s, liveChat), liveChat)) : undefined}
      onAccept={pendingFor ? () => { set((s) => acceptInvite(s, pendingFor)); toast(`${PEOPLE[pendingFor].name} accepted (mock).`); } : undefined}
      acceptLabel={pendingFor ? `${PEOPLE[pendingFor].name.split(' ')[0]} accepts invite` : undefined} />
  );
  const meButton = (testId: string, menuClass: string) => (showName: boolean) => <MeButton viewer={st.viewer} showName={showName} testId={testId} menuClass={menuClass} a={menu} />;

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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={COPY.search} aria-label="Search" className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none md:text-sm" />
          {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="flex h-8 w-8 items-center justify-center"><X className="h-4 w-4" /></button>}
        </label>
        <NewMenu onNewChat={() => go({ view: 'newchat' })} onNewPartner={() => go({ view: 'newpartner' })} />
      </header>
      {!results && !inArchived && <FolderTabs folders={tabs} active={activeTab} onPick={pickFolder} />}
      {inArchived && (
        <div className="flex min-h-12 shrink-0 items-center gap-1 border-b px-2"><button type="button" aria-label="Back to chats" onClick={() => setShowArchived(false)} className={cn('flex h-11 w-11 items-center justify-center rounded-full', HOVER)}><ArrowLeft className="h-5 w-5" /></button><h2 className="font-semibold text-gray-900">{COPY.archived}</h2></div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {results ? (
          <SearchResults st={st} results={results} onChat={(id) => { setQ(''); open(id); }} onPerson={showProfile} onMessage={message} onInvite={() => { setQ(''); go({ view: 'newpartner' }); }} />
        ) : st.chats.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" data-testid="empty-list"><p className="text-[15px] text-gray-700">{COPY.emptyList}</p><InviteLink onClick={() => go({ view: 'newpartner' })} /></div>
        ) : showSections ? (
          <div data-testid="group-sections" className="pb-4">
            <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{COPY.channels}</h2>
            {sections.map((g) => (
              <section key={g.groupId} aria-label={g.name}>
                <div className="flex min-h-10 items-center gap-2 px-3 pt-2" data-testid="group-section-header">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700">{g.name}</span>
                  <button type="button" onClick={() => setInfo(g.groupId)} aria-label={`${COPY.groupInfo}: ${g.name}`} title={COPY.groupInfo} className={cn('inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-gray-600', HOVER)} data-testid="group-info-button">
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />{COPY.groupInfo}
                  </button>
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
              <li className="flex flex-col items-center gap-3 px-6 py-12 text-center" data-testid="empty-partners"><Handshake className="h-8 w-8 text-gray-400" aria-hidden="true" /><p className="text-sm text-gray-600">{COPY.noPartners}</p><InviteLink onClick={() => go({ view: 'newpartner' })} /></li>
            )}
            {rows.length === 0 && activeTab === 'unread' && !inArchived && <li className="px-6 py-12 text-center text-sm text-gray-500">No unread chats.</li>}
          </ul>
        )}
      </div>
    </>
  );

  const chatBack = () => back({ view: 'chats' });
  const chatMain = (() => {
    if (loc.with) return <NoChatYet st={st} person={loc.with as PersonId} onBack={chatBack} onPerson={showProfile} onMessage={() => message(loc.with as PersonId)} />;
    const chat = openChatObj;
    if (!chat) return <div className="hidden h-full items-center justify-center bg-gray-50 lg:flex" data-testid="empty-main"><span className="rounded-full bg-white px-3 py-1 text-sm text-gray-500 shadow-sm">{COPY.selectChat}</span></div>;
    if (loc.members) return <Members chat={chat} onBack={() => back({ view: 'chats', chat: chat.id })} onPerson={showProfile} />;
    const threadId = loc.thread;
    const openThread = (postId: string) => go({ view: 'chats', chat: chat.id, thread: postId });
    const closeThread = () => back({ view: 'chats', chat: chat.id });
    const live = !!eventOf(chat)?.live;
    const chatView = (
      <ChatView
        st={st} chat={chat} input={input(chat.id)} onInput={setInput(chat.id)} replyTo={replyTo[key(chat.id)]} threadId={threadId}
        banner={live ? <CaptureBanner capture={capture} chatId={chat.id} onStart={() => setCapture({ chatId: chat.id, paused: false })} onPause={() => setCapture((c) => (c ? { ...c, paused: !c.paused } : c))} onStop={() => setCapture(null)} /> : undefined}
        onBack={chatBack} onPerson={showProfile} onGroupInfo={() => chat.groupId && setInfo(chat.groupId)}
        onMembers={() => go({ view: 'chats', chat: chat.id, members: '1' })}
        onGroupPage={() => chat.groupId && openGroup(chat.groupId)}
        onEvent={openEvent} onPartners={() => go({ view: 'partners' })} onOrigin={open}
        onLeave={() => setLeaving(chat.groupId!)}
        onInvite={(p) => go({ view: 'invite', with: p })}
        onReply={(m) => setReplyTo((cur) => ({ ...cur, [key(chat.id)]: m.id }))}
        onCancelReply={() => clearReply(chat.id)}
        onThread={(m) => openThread(m.id)}
        onClarify={doClarify}
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
          onForward={setForwarding} onRetry={(id) => set((s) => retry(s, id))} onEdit={(id, t) => set((s) => editMsg(s, id, t))} onDelete={setDeleting} onClarify={doClarify} />
      </div>
    );
  })();

  const groupTab = (loc.tab as GroupTab | undefined) ?? 'events';
  const detailOpen = (view === 'chats' && (!!chatParam || !!loc.with)) || !!loc.letter || !['home', 'chats', 'letters', 'tools', 'groups', 'me', 'group', 'event', 'directory'].includes(view);
  const content = (() => {
    if (view === 'profile' && loc.person && PEOPLE[loc.person as PersonId]) {
      const person = loc.person as PersonId;
      return <Profile st={st} person={person} onBack={() => back({ view: 'chats' })} onMessage={() => message(person)} />;
    }
    if (view === 'home') return <HomePage st={st} tab={loc.tab === 'points' ? 'points' : 'stories'} onTab={(t) => go({ view: 'home', tab: t === 'stories' ? undefined : t }, true)} onBrowse={() => go({ view: 'directory' })} />;
    if (view === 'tools') return <ToolsPage />;
    if (view === 'settings') return <SettingsPage onBack={() => back({ view: 'chats' })} />;
    if (view === 'me') return <MePage viewer={st.viewer} a={menu} />;
    if (view === 'partners') return <PartnersPage st={st} onBack={() => back({ view: 'chats' })} onPartner={message} onNew={() => go({ view: 'newpartner' })} />;
    if (view === 'newchat') return <NewChatPage st={st} onBack={() => back({ view: 'chats' })} onPick={message} onBrowse={() => go({ view: 'directory' })} />;
    if (view === 'newpartner' || (view === 'invite' && loc.with)) {
      const who = view === 'invite' ? (loc.with as PersonId) : undefined;
      return <PartnerInvitePage key={who ?? 'new'} st={st} who={who} onBack={() => back({ view: 'chats' })} onSent={(p) => {
        set((s) => invitePartner(s, p));
        toast(`Partner invite sent to ${PEOPLE[p].name} (mock).`);
        back({ view: 'chats' });
      }} />;
    }
    if (view === 'letters') {
      return loc.letter
        ? <LetterView st={st} letterId={loc.letter} onBack={() => back({ view: 'letters' })} />
        : <LettersPage st={st} tab={(loc.tab as LetterBox | undefined) ?? 'inbox'} onTab={(t) => go({ view: 'letters', tab: t === 'inbox' ? undefined : t }, true)} onLetter={(id) => go({ view: 'letters', letter: id, tab: loc.tab })} />;
    }
    if (view === 'groups') return <GroupsPage st={st} onGroup={openGroup} onBrowse={() => go({ view: 'directory' })} />;
    if (view === 'directory') return <DirectoryPage st={st} onBack={() => back({ view: 'groups' })} onGroup={openGroup} />;
    if (view === 'group' && loc.group) {
      const gid = loc.group;
      return <GroupPage st={st} groupId={gid} tab={groupTab} onTab={(t) => go({ view: 'group', group: gid, tab: t === 'events' ? undefined : t }, true)} onBack={() => back({ view: 'directory' })}
        onEvent={openEvent} onChannel={open} onPerson={showProfile} onJoin={() => go({ view: 'join', group: gid })} onLeave={() => setLeaving(gid)} />;
    }
    if (view === 'join' && loc.group) {
      const gid = loc.group;
      return <JoinPage st={st} groupId={gid} onBack={() => back({ view: 'group', group: gid })} onJoined={() => { set((s) => joinGroup(s, gid)); toast(`Welcome to ${GROUPS.find((g) => g.id === gid)?.name}.`); back({ view: 'group', group: gid }); }} />;
    }
    if (view === 'event' && loc.event) {
      const ev = EVENTS.find((e) => e.id === loc.event);
      /* Back: history, or (a deep link) THIS event's own group. Never a fixed group. */
      if (ev) return <EventPage st={st} event={ev} onBack={() => back({ view: 'group', group: groupOfEvent(ev.id) })} onGroup={() => openGroup(groupOfEvent(ev.id)!)} onChat={() => open(`ch-${ev.id}`)} onPerson={showProfile} />;
    }
    const chatOpen = !!chatParam || !!loc.with;
    return (
      <>
        <section aria-label="Chat list" data-testid="chat-list" className={cn('min-w-0 flex-col border-r lg:flex lg:w-[360px] lg:shrink-0', chatOpen ? 'hidden' : 'flex w-full')}>{list}</section>
        <main className={cn('min-w-0 flex-1 flex-col lg:flex', chatOpen ? 'flex' : 'hidden')}>{chatMain}</main>
      </>
    );
  })();

  const captureChat = capture ? chatById(st, capture.chatId) : undefined;
  const away = capture && captureChat && !(view === 'chats' && chatParam === capture.chatId)
    ? <CompactCaptureBarCopy paused={capture.paused} onPause={() => setCapture((c) => (c ? { ...c, paused: !c.paused } : c))} onStop={() => setCapture(null)} onOpen={() => open(capture.chatId)} />
    : null;

  function leave(groupId: string) {
    const name = GROUPS.find((g) => g.id === groupId)?.name;
    set((s) => leaveGroup({ ...s, joined: { ...s.joined, [s.viewer]: s.joined[s.viewer].filter((g) => g !== groupId) } }, groupId));
    if (capture && chatById(st, capture.chatId)?.groupId === groupId && !EVENTS.find((e) => `ch-${e.id}` === capture.chatId)?.attendees.includes(st.viewer)) setCapture(null);
    go({ view: 'chats' }, true);
    toast(`You left ${name}.`);
  }

  const cardCtx: CardCtx = { st, onPosition: (id, p) => set((s) => setPosition(s, id, p)), onDetails: (x) => toast(`Details opens /${x.kind}/${x.id} in the app.`) };
  const signedOut = view === 'signedout';
  return (
    <TooltipProvider delayDuration={300}>
      <Cards.Provider value={cardCtx}>
      <EventCtx.Provider value={{ toggle: (id) => set((s) => toggleRsvp(s, id)) }}>
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-white" data-testid="v15-app">
        {strip}
        {signedOut ? <SignedOut onLogIn={() => go({ view: 'home' }, true)} /> : (
          <div className="flex min-h-0 flex-1">
            <Sidebar st={st} place={place} activeGroup={view === 'group' ? loc.group : undefined} onPlace={placeGo} onGroup={openGroup} onBrowse={() => go({ view: 'directory' })} me={meButton('sidebar-me', 'absolute left-0 top-12')} />
            <div className="flex min-w-0 flex-1 flex-col">
              {away}
              <div className="flex min-h-0 flex-1" data-testid="main-area" data-view={view}>{content}</div>
              {!detailOpen && <BottomTabs st={st} active={mobileTab} onTab={placeGo} />}
            </div>
          </div>
        )}
      </div>
      {forwarding && (
        <ForwardFlow st={st} msgId={forwarding} onClose={() => setForwarding(null)} onDone={(to, note) => {
          set((s) => forward(s, forwarding, to, note)); setForwarding(null); open(to);
          toast(`Forwarded to ${rowTitle(st, chatById(st, to)!)}`);
        }} />
      )}
      {attach && <AttachDialog st={st} onClose={() => setAttach(null)} onPick={(sh) => { setStaged((cur) => ({ ...cur, [key(attach)]: sh })); setAttach(null); }} />}
      {info && (
        <GroupInfo st={st} groupId={info} onClose={() => setInfo(null)} onLeave={() => { setInfo(null); setLeaving(info); }}
          onChannel={(id) => { setInfo(null); open(id); }} onPage={() => { const g = info; setInfo(null); openGroup(g); }} />
      )}
      {leaving && (
        <Sheet label="Leave group" onClose={() => setLeaving(null)} title={`Leave ${GROUPS.find((g) => g.id === leaving)?.name}?`}>
          <p className="px-4 py-4 text-sm text-gray-700">You will lose its # general and event channels. You can rejoin from the group page.</p>
          <div className="flex gap-2 border-t p-3">
            <button type="button" onClick={() => setLeaving(null)} className={cn(OUTLINE, 'min-h-11 flex-1')}>Cancel</button>
            <button type="button" onClick={() => { const g = leaving; setLeaving(null); leave(g); }} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700">Leave</button>
          </div>
        </Sheet>
      )}
      {deleting && (
        <Sheet label="Delete message" onClose={() => setDeleting(null)} title="Delete message?">
          <p className="px-4 py-4 text-sm text-gray-700">It disappears for everyone in this chat. This cannot be undone.</p>
          <div className="flex gap-2 border-t p-3">
            <button type="button" onClick={() => setDeleting(null)} className={cn(OUTLINE, 'min-h-11 flex-1')}>Cancel</button>
            <button type="button" onClick={() => { const id = deleting; setDeleting(null); set((s) => deleteMsg(s, id)); if (loc.thread === id) back({ view: 'chats', chat: chatParam }); }} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700">Delete</button>
          </div>
        </Sheet>
      )}
      <Toaster />
      </EventCtx.Provider>
      </Cards.Provider>
    </TooltipProvider>
  );
}

function Strip({ viewer, onViewer, onReset, onLive, onAccept, acceptLabel }: { viewer: ViewerId; onViewer: (v: ViewerId) => void; onReset: () => void; onLive?: () => void; onAccept?: () => void; acceptLabel?: string }) {
  const lenses: { id: ViewerId; label: string }[] = [{ id: 'bob', label: 'Bob (member, admin)' }, { id: 'dana', label: 'Dana (attendee)' }];
  return (
    /* Review #12: one line at every width (it scrolls sideways on a phone instead of wrapping). */
    <div role="region" aria-label="Prototype controls" className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap border-b bg-gray-100 px-2 py-0.5 [scrollbar-width:none] sm:gap-3 sm:px-3">
      <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-gray-600 sm:inline">Prototype v15</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 sm:hidden">v15</span>
      <div role="radiogroup" aria-label="View as" className="inline-flex shrink-0 rounded-lg border bg-white p-0.5">
        {lenses.map((l) => <button key={l.id} type="button" role="radio" aria-checked={viewer === l.id} aria-label={l.label} onClick={() => onViewer(l.id)} className={cn('min-h-10 rounded-md px-2 text-sm font-medium sm:px-2.5', viewer === l.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50')}><span className="hidden sm:inline">{l.label}</span><span className="sm:hidden">{l.label.split(' ')[0]}</span></button>)}
      </div>
      {onLive && <button type="button" onClick={onLive} className={STRIP_BUTTON}>Next transcript line</button>}
      {onAccept && <button type="button" onClick={onAccept} className={STRIP_BUTTON} data-testid="strip-accept">{acceptLabel}</button>}
      <button type="button" onClick={onReset} className={STRIP_BUTTON}>Reset</button>
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
        const shared = sharedWith(st.viewer, p);
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

/** Someone with no chat and nothing shared: the "No chat yet" state, with no composer until we share a group or event. */
function NoChatYet({ st, person, onBack, onPerson, onMessage }: { st: State; person: PersonId; onBack: () => void; onPerson: (p: PersonId) => void; onMessage: () => void }) {
  if (!PEOPLE[person]) return null;
  const first = PEOPLE[person].name.split(' ')[0]!;
  const can = canMessage(st.viewer, person);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-view" data-chat-open={`new:${person}`}>
      <Header onBack={onBack} title={<button type="button" onClick={() => onPerson(person)} className="flex min-h-11 min-w-0 items-center gap-2.5 text-left"><Avatar person={person} size="sm" /><span className="truncate text-base font-semibold text-gray-900">{PEOPLE[person].name}</span></button>} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center" data-testid="empty-chat">
        <p className="text-sm text-gray-600">{can ? COPY.newChatOpener(first, sharedWith(st.viewer, person)) : `No chat yet with ${first}. You can message ${first} once you share a group or event.`}</p>
        {can ? <button type="button" onClick={onMessage} className={BLUE}>{COPY.message}</button> : <button type="button" onClick={() => onPerson(person)} className={OUTLINE}>View profile</button>}
      </div>
    </div>
  );
}


/** A 1:1's header (v15 #7): the person, then Partner (opens the agreement), or "Partner invite pending". */
function DmTitle({ st, chat, onPerson, onPartners }: { st: State; chat: Chat; onPerson: (p: PersonId) => void; onPartners: () => void }) {
  const other = otherOf(st, chat);
  const state = partnerState(st, other);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button type="button" onClick={() => onPerson(other)} className="flex min-h-11 min-w-0 items-center gap-2.5 text-left"><Avatar person={other} size="sm" /><span className="min-w-0"><span className="block truncate text-base font-semibold text-gray-900">{chatTitle(st, chat)}</span><span className="block truncate text-xs text-gray-500">{PEOPLE[other].role}</span></span></button>
      {state === 'partner' && (
        <Tip label="Your partners" side="bottom">
          <button type="button" onClick={onPartners} data-testid="partner-tag" className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"><Handshake className="h-3 w-3" aria-hidden="true" />{COPY.partner}</button>
        </Tip>
      )}
      {/* v11 PendingLine: production's LetterStatusBadge (in progress) with its label override. */}
      {state === 'pending' && <span data-testid="partner-pending" className="inline-flex shrink-0"><LetterStatusBadge status="in_progress" label={COPY.partnerPending} /></span>}
    </div>
  );
}

function ChannelMenu({ canLeave, onMembers, onGroupPage, onLeave, onEvent }: { canLeave: boolean; onMembers: () => void; onGroupPage: () => void; onLeave: () => void; onEvent?: () => void }) {
  const [on, setOn] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(() => setOn(false), on, [ref]);
  const pick = (f: () => void) => () => { setOn(false); f(); };
  return (
    <div ref={ref} className="relative shrink-0">
      <Tip label="More" side="bottom"><button type="button" aria-label="More" aria-expanded={on} onClick={() => setOn(!on)} className={cn('flex h-11 w-11 items-center justify-center rounded-full text-gray-600', HOVER)}><MoreHorizontal className="h-5 w-5" /></button></Tip>
      {on && (
        <div role="menu" className="absolute right-0 top-12 z-30 w-52 rounded-xl border bg-white p-1 shadow-xl" data-testid="channel-menu">
          {onEvent && <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onEvent)}><CalendarDays className="h-4 w-4 text-gray-500" />Event details</button>}
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onMembers)}><UsersIcon className="h-4 w-4 text-gray-500" />Members</button>
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onGroupPage)}><LandmarkIcon className="h-4 w-4 text-gray-500" />Group page</button>
          {canLeave && <button type="button" role="menuitem" className={cn(MENU_ITEM, 'text-red-700')} onClick={pick(onLeave)}><LogOut className="h-4 w-4" />Leave group</button>}
        </div>
      )}
    </div>
  );
}


function ChatView({ st, chat, input, onInput, replyTo, threadId, banner, onBack, onPerson, onGroupInfo, onMembers, onGroupPage, onEvent, onPartners, onOrigin, onLeave, onInvite, onReply, onCancelReply, onThread, onClarify, onForward, onRetry, onEdit, onDelete, onSend, onVoice, onAttach, staged, onUnstage, onClaim }: {
  st: State; chat: Chat; input: string; onInput: (v: string) => void; replyTo?: string; threadId?: string; banner?: ReactNode;
  onBack: () => void; onPerson: (p: PersonId) => void; onGroupInfo: () => void; onMembers: () => void; onGroupPage: () => void; onLeave: () => void; onInvite: (p: PersonId) => void;
  onEvent: (eventId: string) => void; onPartners: () => void; onOrigin: (chatId: string) => void;
  onReply: (m: Msg) => void; onCancelReply: () => void; onThread: (m: Msg) => void; onClarify: (id: string) => void;
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
  const origin = mirror ? clarifyOrigin(st) : undefined;
  const [nameDraft, setNameDraft] = useState(defaultName);
  const title = channel
    ? <button type="button" onClick={onGroupInfo} className="flex min-h-11 min-w-0 items-center gap-2.5 text-left" data-testid="channel-header"><ChannelMark chat={chat} size="sm" /><span className="min-w-0"><span className="block truncate text-base font-semibold text-gray-900">{rowTitle(st, chat, true)}</span><span className="block truncate text-xs text-gray-500">{group?.name} · {channelMembers(chat).length} members</span></span></button>
    : mirror
      ? <div className="flex min-h-11 min-w-0 items-center gap-2.5" data-testid="mirror-header"><MirrorAvatar owner={st.viewer} size="sm" /><span className="min-w-0"><span className="block truncate text-base font-semibold text-gray-900">{mirrorName(st)}</span><span className="block truncate text-xs text-gray-500">{COPY.yourMirror} · agent</span></span></div>
      : <DmTitle st={st} chat={chat} onPerson={onPerson} onPartners={onPartners} />;
  const otherFirst = channel || mirror ? '' : PEOPLE[otherOf(st, chat)].name.split(' ')[0]!;
  const showInvite = chat.kind === 'dm' && partnerState(st, otherOf(st, chat)) === 'none';
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-view" data-chat-open={chat.id}>
      <Header onBack={onBack} title={title}>
        {ev && (
          <Tip label="Event details" side="bottom">
            <button type="button" aria-label="Event details" onClick={() => onEvent(ev.id)} data-testid="event-details" className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600', HOVER)}><Info className="h-5 w-5" /></button>
          </Tip>
        )}
        {channel && <ChannelMenu canLeave={!!group && isMember(st, st.viewer, group.id)} onMembers={onMembers} onGroupPage={onGroupPage} onLeave={onLeave} onEvent={ev ? () => onEvent(ev.id) : undefined} />}
        {showInvite && <button type="button" onClick={() => onInvite(otherOf(st, chat))} className={cn(OUTLINE, 'shrink-0')} data-testid="invite-as-partner"><Handshake className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{COPY.inviteAsPartner}</span><span className="sm:hidden">Invite</span></button>}
      </Header>
      {banner}
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
            {channel ? 'No messages yet.' : COPY.newChatOpener(otherFirst, sharedWith(st.viewer, otherOf(st, chat)))}
          </p>
        )}
        {msgs.length > 0 && <Divider>{dayLabel(chat)}</Divider>}
        <MessageList label="Messages" msgs={msgs} render={(m, compact) => (
          <MessageRow key={m.id} st={st} msg={m} own={m.who === st.viewer && !m.agent} compact={compact && !m.agent && !msgs[msgs.indexOf(m) - 1]?.agent} highlight={m.id === threadId} replies={repliesOf(st, m.id)} liveThread={!!m.table && ev?.live}
            onPerson={onPerson} onReply={() => onReply(m)} onForward={() => onForward(m.id)} onThread={m.failed ? undefined : () => onThread(m)} onRetry={() => onRetry(m.id)}
            onEdit={(t) => onEdit(m.id, t)} onDelete={() => onDelete(m.id)} onClarify={m.failed || mirror ? undefined : () => onClarify(m.id)} />
        )} />
        <div ref={end} />
      </div>
      {origin && (
        <div className="shrink-0 px-3 pt-1">
          <button type="button" onClick={() => onOrigin(origin.id)} data-testid="mirror-back-link" className="mx-auto flex min-h-10 w-full max-w-3xl items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-blue-700 hover:bg-blue-50">
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">Back to {rowTitle(st, origin)}</span>
          </button>
        </div>
      )}
      {unclaimed ? (
        <footer className="shrink-0 px-2 pb-2 pt-1 lg:px-3 lg:pb-3" data-testid="mirror-claim">
          <form className="mx-auto flex w-full max-w-3xl items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (nameDraft.trim()) onClaim(nameDraft); }}>
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} aria-label={COPY.mirrorAsk} placeholder={COPY.mirrorPlaceholder} className="min-h-11 min-w-0 flex-1 rounded-full border border-gray-300 px-4 text-base outline-none focus:border-gray-500 md:text-[15px]" />
            <button type="submit" className={BLUE} disabled={!nameDraft.trim()} data-testid="mirror-keep">{nameDraft.trim() === defaultName ? 'Keep' : 'Save'}</button>
          </form>
        </footer>
      ) : (
        <Composer
          key={chat.id} canSendEmpty={!!staged}
          value={input} onValue={onInput} onSend={onSend} onVoice={onVoice} onAttach={onAttach}
          placeholder={channel ? `Message ${rowTitle(st, chat, true)}` : mirror ? `Message ${mirrorName(st)}` : `Message ${otherFirst}`}
          quote={<>
            {quoted && <QuoteBar author={PEOPLE[quoted.who].name} text={summary(quoted)} onRemove={onCancelReply} />}
            {staged && (
              <div className="flex items-start gap-2 px-2 pt-1" data-testid="staged-share">
                <div className="min-w-0 flex-1"><ShareCard item={staged} full /></div>
                <button type="button" aria-label="Remove shared item" onClick={onUnstage} className="mt-1 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>
            )}
          </>}
        />
      )}
    </div>
  );
}

/** A post's thread (Slack's side panel), in a channel or a 1:1 (v14 #6). People only, no agent. */
function Thread({ st, chat, postId, input, onInput, onClose, onPerson, onSend, onVoice, onForward, onRetry, onEdit, onDelete, onClarify }: {
  st: State; chat: Chat; postId: string; input: string; onInput: (v: string) => void; onClose: () => void; onPerson: (p: PersonId) => void;
  onSend: (t: string) => void; onVoice: (secs: number) => void; onForward: (id: string) => void; onRetry: (id: string) => void;
  onEdit: (id: string, text: string) => void; onDelete: (id: string) => void; onClarify: (id: string) => void;
}) {
  const post = st.msgs.find((x) => x.id === postId);
  const replies = repliesOf(st, postId);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [replies.length, postId]);
  if (!post) return null;
  const focusComposer = () => document.getElementById('v15-thread-input')?.focus();
  const rowOf = (x: Msg, compact: boolean) => (
    <MessageRow key={x.id} st={st} msg={x} own={x.who === st.viewer} compact={compact} onPerson={onPerson} onReply={focusComposer} onForward={() => onForward(x.id)} onRetry={() => onRetry(x.id)}
      onEdit={(t) => onEdit(x.id, t)} onDelete={() => onDelete(x.id)} onClarify={() => onClarify(x.id)} />
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

