/**
 * @file ClarityChatV12.tsx
 * @description P1509 v12 prototype at /tree/clarity-chat: chats as the logged-in home. Telegram frame: on
 * desktop a dark folder rail (All chats, Unread, Partners, one per group) beside the list and the open chat;
 * on a phone one column with the folders as tabs. ☰ opens a Telegram drawer over everything (my profile on
 * top, then the app's pages with the bottom nav's icons). Messages, the hover toolbar (Reply, Forward), the
 * thread beside a channel post and the composer are v11's (kit.tsx). Profiles are production's
 * CompactProfileCard. Invite as partner sits in a 1:1's header. Mock data only (state.ts): nothing persisted.
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Archive, ArrowLeft, CalendarDays, FileText, Forward, Handshake, HomeIcon, LandmarkIcon, LayoutGrid, Link2, MailIcon, Menu, MessageCircle,
  MessagesSquare, MessageSquareDot, Reply, Search, UserIcon, UsersIcon, X, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { CompactProfileCard } from '@/app/components/profile/compact-profile-card';
import type { Profile as ProfileData } from '@/app/types';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Avatar, Composer, Divider, Message, MsgText, QuoteBar, SidePanel, ToolButton, Toolbar, TOOL_ICON } from './kit';
import { arePartners, COPY, EVENTS, GROUPS, MENU_PAGES, PEOPLE, SHAREABLE, type PersonId, type ViewerId } from './mock-data';
import {
  archive, archivedChats, canMessage, canSee, channelMembers, chatById, chatTitle, chatsInTab, comment, dmWith, forward, initialState, isArchived,
  lastMsg, mockIncoming, msgsOf, openChat, otherOf, retry, search, send, tabsFor, unarchive, unreadOf, visibleChats,
  type Chat, type Msg, type State, type Tab,
} from './state';

const HOVER = '[@media(hover:hover)]:hover:bg-gray-100';
const BLUE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700';
const OUTLINE = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50';
const STRIP_BUTTON = 'inline-flex min-h-10 shrink-0 items-center rounded-md border bg-white px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50';
const INVITE_PATH = '/agreements/new';

/** What the main column shows. On a phone, anything but `none` replaces the list. A thread sits beside its channel on desktop. */
type View =
  | { kind: 'none' }
  | { kind: 'chat'; chatId: string; thread?: string }
  | { kind: 'members'; chatId: string }
  | { kind: 'profile'; person: PersonId; back: View };

const MENU_ICON: Record<(typeof MENU_PAGES)[number]['id'], LucideIcon> = { home: HomeIcon, letters: MailIcon, partners: UsersIcon, groups: LandmarkIcon, tools: LayoutGrid };
/** Every folder is a line icon, as in the bottom nav: a group folder carries the Groups icon. */
const FOLDER_ICON: Record<string, LucideIcon> = { all: MessagesSquare, unread: MessageSquareDot, partners: UsersIcon };

/* ---------- small pieces ---------- */

/** The day over a chat's messages: a past event's date, else Today (the mock's 1:1s are all today's). */
const dayLabel = (chat: Chat) => {
  const ev = EVENTS.find((e) => e.id === chat.eventId);
  return ev && !ev.today ? ev.when : 'Today';
};

/** `onBlue`: on a selected (blue) row the mark turns white, so it never vanishes into the highlight. */
const ChannelMark = ({ size = 'list', onBlue = false }: { size?: 'list' | 'sm'; onBlue?: boolean }) => (
  <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', onBlue ? 'bg-white text-blue-600' : 'bg-blue-600 text-white', size === 'list' ? 'h-12 w-12 text-lg' : 'h-8 w-8 text-sm')}>#</span>
);

const ChatAvatar = ({ st, chat, size = 'list' }: { st: State; chat: Chat; size?: 'list' | 'sm' }) => (chat.kind === 'dm' ? <Avatar person={otherOf(st, chat)} size={size} /> : <ChannelMark size={size} />);

/** `panel`: a page opened from a chat (profile, members). It keeps Back on desktop too, where the list beside it cannot return there. */
function Header({ onBack, title, children, panel = false }: { onBack?: () => void; title: ReactNode; children?: ReactNode; panel?: boolean }) {
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-2 border-b px-2 lg:px-4">
      {onBack && <button type="button" aria-label="Back" onClick={onBack} className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', !panel && 'lg:hidden', HOVER)}><ArrowLeft className="h-5 w-5" /></button>}
      <div className="min-w-0 flex-1">{title}</div>
      {children}
    </header>
  );
}

/** The transcript placeholder (P1500 lands here): collapsed to its first lines, "Show all" expands. */
function TranscriptBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 rounded-lg border bg-gray-50 px-3 py-2" data-testid="transcript-post">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900"><FileText className="h-4 w-4" aria-hidden="true" />{COPY.transcript}</div>
      <p className={cn('whitespace-pre-line text-sm text-gray-700', !open && 'line-clamp-3')}>{text}</p>
      <button type="button" onClick={() => setOpen(!open)} className="min-h-10 text-sm font-medium text-blue-700">{open ? 'Show less' : 'Show all'}</button>
    </div>
  );
}

/** Stacked faces and "N replies" under a channel post (Slack). */
function RepliesLink({ replies, onOpen }: { replies: Msg[]; onOpen: () => void }) {
  const faces = [...new Set(replies.map((r) => r.who))].slice(0, 3);
  return (
    <button type="button" onClick={onOpen} className="-ml-1 mt-0.5 flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-blue-700 hover:bg-white" data-testid="replies-link">
      <span className="flex -space-x-1.5">{faces.map((p) => <Avatar key={p} person={p} size="xs" />)}</span>
      {COPY.replies(replies.length)}
    </button>
  );
}

/* ---------- one message ---------- */

/** v11's row: hover (or a tap on a phone) shows Reply and Forward. Reply quotes in a 1:1 and opens the thread in a channel. */
function MessageRow({ msg, compact, highlight, replies, onPerson, onReply, onForward, onThread, onRetry }: {
  msg: Msg; compact: boolean; highlight?: boolean; replies?: Msg[];
  onPerson: (p: PersonId) => void; onReply: () => void; onForward: () => void; onThread?: () => void; onRetry: () => void;
}) {
  const [selected, setSelected] = useState(false);
  const act = (f: () => void) => () => { setSelected(false); f(); };
  const toolbar = (
    <Toolbar shown={selected}>
      <ToolButton label="Reply" onClick={act(onReply)}><Reply className={TOOL_ICON} /></ToolButton>
      <ToolButton label="Forward" onClick={act(onForward)}><Forward className={TOOL_ICON} /></ToolButton>
    </Toolbar>
  );
  return (
    <li data-msg={msg.id}>
      <Message person={msg.who} time={msg.time} compact={compact} highlight={highlight} selected={selected} onSelect={() => setSelected((s) => !s)} onPerson={onPerson} toolbar={toolbar}>
        {msg.fwdFrom && (
          <p className="text-xs font-medium text-blue-700" data-testid="forwarded-label">
            {COPY.forwardedFrom} <button type="button" onClick={() => onPerson(msg.fwdFrom!)} className="font-semibold hover:underline">{PEOPLE[msg.fwdFrom].name}</button>
          </p>
        )}
        {msg.quote && (
          <div className="my-1 border-l-2 border-blue-600 pl-2" data-testid="reply-quote">
            <p className="text-xs font-semibold text-blue-700">{PEOPLE[msg.quote.who].name}</p>
            <p className="truncate text-sm text-gray-600">{msg.quote.text}</p>
          </div>
        )}
        {msg.transcript ? <TranscriptBody text={msg.text} /> : msg.text && <MsgText>{msg.text}</MsgText>}
        {msg.share && (
          /* A plain link card. The mock ids resolve to nothing in production, so the prototype opens it in a new tab. */
          <a href={`/${msg.share.kind}/${msg.share.id}`} target="_blank" rel="noreferrer" className="mt-1 flex min-h-11 max-w-md items-center gap-2 rounded-lg border bg-white px-3 py-2 hover:bg-gray-50" data-testid="share-card">
            <Link2 className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
            <span className="min-w-0"><span className="block text-xs text-gray-500">{msg.share.kind === 'point' ? 'Point' : 'Story'}</span><span className="block text-sm font-medium text-gray-900">{msg.share.title}</span></span>
          </a>
        )}
        {msg.failed && (
          <div className="mt-1 flex items-center gap-2 text-xs text-red-700" data-testid="send-failed">
            {COPY.notSent}
            <button type="button" onClick={onRetry} className="min-h-10 rounded-md px-3 font-semibold text-blue-700 hover:bg-blue-50">{COPY.retry}</button>
          </div>
        )}
        {onThread && replies && replies.length > 0 && <RepliesLink replies={replies} onOpen={onThread} />}
      </Message>
    </li>
  );
}

/** A list of messages; a row from the same sender as the row above drops its avatar and name. */
function MessageList({ label, msgs, render }: { label: string; msgs: Msg[]; render: (m: Msg, compact: boolean) => ReactNode }) {
  return <ul aria-label={label} className="flex flex-col gap-0.5">{msgs.map((m, i) => render(m, i > 0 && msgs[i - 1]!.who === m.who && !m.fwdFrom))}</ul>;
}

/* ---------- chat list ---------- */

function ChatRow({ st, chat, active, onOpen, onArchive, archived }: { st: State; chat: Chat; active: boolean; onOpen: () => void; onArchive: () => void; archived: boolean }) {
  const [menu, setMenu] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const last = lastMsg(st, chat.id);
  const unread = unreadOf(st, chat.id);
  const who = last && (last.who === st.viewer ? 'You: ' : chat.kind === 'channel' ? `${PEOPLE[last.who].name.split(' ')[0]}: ` : '');
  const body = last ? (last.transcript ? COPY.transcript : last.share ? last.share.title : last.text) : 'No messages yet';
  useEscape(() => setMenu(false), menu);
  return (
    <li data-chat={chat.id} className="relative">
      <button
        type="button"
        onClick={onOpen}
        onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
        onTouchStart={(e) => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; }}
        onTouchEnd={(e) => {
          /* A left swipe archives; a mostly vertical drag is a scroll and never does. */
          const t = e.changedTouches[0];
          const start = touch.current;
          touch.current = null;
          if (start && t && start.x - t.clientX > 60 && Math.abs(t.clientY - start.y) < (start.x - t.clientX) / 2) onArchive();
        }}
        aria-current={active ? 'true' : undefined}
        className={cn('flex min-h-[68px] w-full items-center gap-3 px-3 py-2 text-left', active ? 'bg-blue-600 text-white' : HOVER)}
      >
        {chat.kind === 'dm' ? <Avatar person={otherOf(st, chat)} size="list" /> : <ChannelMark onBlue={active} />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn('truncate text-[15px] font-semibold', active ? 'text-white' : 'text-gray-900')}>{chatTitle(st, chat)}</span>
            <span className={cn('ml-auto shrink-0 text-xs', active ? 'text-blue-100' : 'text-gray-500')}>{last?.time}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-sm', active ? 'text-blue-50' : 'text-gray-600')}><span className={active ? 'text-white' : 'text-blue-700'}>{who}</span>{body}</span>
            {unread > 0 && <span className={cn('flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold', active ? 'bg-white text-blue-700' : 'bg-blue-600 text-white')} aria-label={`${unread} unread`}>{unread}</span>}
          </span>
        </span>
      </button>
      {menu && (
        <div role="menu" className="absolute right-3 top-2 z-10 flex gap-1 rounded-lg border bg-white p-1 shadow-md">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); onArchive(); }} className={cn('flex min-h-10 items-center gap-2 rounded-md px-3 text-sm', HOVER)}><Archive className="h-4 w-4" />{archived ? 'Unarchive' : 'Archive'}</button>
          <button type="button" aria-label="Close" onClick={() => setMenu(false)} className={cn('flex h-10 w-10 items-center justify-center rounded-md', HOVER)}><X className="h-4 w-4" /></button>
        </div>
      )}
    </li>
  );
}

function Skeleton() {
  return (
    <ul aria-label="Loading chats" data-testid="list-skeleton" className="animate-pulse">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-3"><span className="h-12 w-12 rounded-full bg-gray-200" /><span className="flex-1 space-y-2"><span className="block h-3 w-1/2 rounded bg-gray-200" /><span className="block h-3 w-3/4 rounded bg-gray-100" /></span></li>
      ))}
    </ul>
  );
}

/* ---------- folders: a dark rail on desktop, tabs on a phone ---------- */

type Folder = { id: Tab; label: string; unread: number };
const Badge = ({ n, className }: { n: number; className?: string }) => (n > 0 ? <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-semibold text-white', className)} aria-label={`${n} unread`}>{n}</span> : null);

/** Telegram desktop's folder rail: ☰ on top, then one icon-and-label button per folder, dark. */
function FolderRail({ folders, active, onPick, onMenu }: { folders: Folder[]; active: Tab; onPick: (t: Tab) => void; onMenu: () => void }) {
  return (
    <nav aria-label="Folders" className="hidden w-[76px] shrink-0 flex-col items-stretch overflow-y-auto bg-slate-800 py-1 [scrollbar-width:none] lg:flex" data-testid="folder-rail">
      <button type="button" aria-label="Open menu" onClick={onMenu} className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-700 hover:text-white"><Menu className="h-6 w-6" /></button>
      <div role="tablist" aria-orientation="vertical" aria-label="Folders" className="flex flex-col">
        {folders.map((f) => {
          const Icon = FOLDER_ICON[f.id] ?? LandmarkIcon;
          const on = f.id === active;
          return (
            <button key={f.id} type="button" role="tab" aria-selected={on} onClick={() => onPick(f.id)} className={cn('relative flex min-h-[64px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium leading-tight', on ? 'bg-slate-900 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white')}>
              <span className="relative">
                <Icon className="h-6 w-6" aria-hidden="true" />
                <Badge n={f.unread} className="absolute -right-3 -top-2 ring-2 ring-slate-800" />
              </span>
              <span className="w-full truncate text-center" title={f.label}>{f.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function FolderTabs({ folders, active, onPick }: { folders: Folder[]; active: Tab; onPick: (t: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Folders" className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 pr-8 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] [scrollbar-width:none] lg:hidden" data-testid="folder-tabs">
      {folders.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === active} onClick={() => onPick(t.id)} className={cn('inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium', t.id === active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900')}>
          {t.label}<Badge n={t.unread} />
        </button>
      ))}
    </div>
  );
}

/* ---------- side menu (Telegram's drawer) ---------- */

/** Escape closes a hand-rolled dialog or menu while `on`. */
function useEscape(onClose: () => void, on = true) {
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, on]);
}

function SideMenu({ viewer, todayEvent, onClose, onEvent, onProfile }: { viewer: ViewerId; todayEvent?: { id: string; name: string }; onClose: () => void; onEvent: (eventId: string) => void; onProfile: () => void }) {
  useEscape(onClose);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  const me = PEOPLE[viewer];
  const item = cn('flex min-h-12 w-full items-center gap-4 px-5 text-left text-[15px] font-medium text-gray-900', HOVER);
  const icon = 'h-[22px] w-[22px] shrink-0 text-gray-500';
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-label="Menu">
      {/* Telegram's drawer has no ✕: the scrim and Escape close it. Focus lands on the drawer itself, not on a control. */}
      <nav ref={panel} tabIndex={-1} className="flex h-full w-[300px] outline-none max-w-[85vw] flex-col bg-white shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-left">
        <div className="border-b px-5 pb-4 pt-6">
          <Avatar person={viewer} size="list" />
          <p className="mt-3 truncate font-semibold text-gray-900">{me.name}</p>
          <p className="truncate text-sm text-gray-500">@{me.nickname}</p>
        </div>
        <ul aria-label="Menu items" className="flex-1 overflow-y-auto py-2">
          <li><button type="button" onClick={onProfile} className={item} data-testid="menu-profile"><UserIcon className={icon} aria-hidden="true" />My Profile</button></li>
          <li role="separator" className="my-2 h-px bg-gray-200" />
          {MENU_PAGES.map((p) => {
            const Icon = MENU_ICON[p.id];
            return (
              <li key={p.id}>
                {p.path
                  ? <a href={p.path} target="_blank" rel="noreferrer" className={item} data-path={p.path}><Icon className={icon} aria-hidden="true" />{p.label}</a>
                  : <button type="button" className={item} onClick={() => toast('Tools opens production’s links menu, unchanged.')}><Icon className={icon} aria-hidden="true" />{p.label}</button>}
              </li>
            );
          })}
          {todayEvent && (
            <>
              <li role="separator" className="my-2 h-px bg-gray-200" />
              <li>
                <button type="button" className={cn(item, 'py-2')} onClick={() => onEvent(todayEvent.id)}>
                  <CalendarDays className={cn(icon, 'text-blue-600')} aria-hidden="true" />
                  <span className="min-w-0"><span className="block text-xs font-normal text-gray-500">Today&apos;s event</span><span className="block truncate">{todayEvent.name}</span></span>
                </button>
              </li>
            </>
          )}
        </ul>
      </nav>
      <button type="button" aria-label="Close menu" onClick={onClose} className="flex-1 bg-black/40" />
    </div>
  );
}

/* ---------- panels in the main column ---------- */

/** Production's profile card, fed the mock person. Its links point at real routes the mock people do not have, so the prototype keeps them in place. */
const asProfile = (id: PersonId): ProfileData => {
  const p = PEOPLE[id];
  return { id: `mock-${id}`, slug: p.nickname, name: p.name, email: p.email, role: p.role, bio: p.bio, avatarColor: p.avatarColor, hasPledged: p.pledger, signedAt: '', isVerified: true, witnesses: [], reciprocations: 0 };
};
const stayInPrototype = (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('a')) return;
  e.preventDefault();
  e.stopPropagation();
  toast('This opens the person’s real profile page in the app.');
};

function Profile({ st, person, onBack, onMessage }: { st: State; person: PersonId; onBack: () => void; onMessage: () => void }) {
  const self = person === st.viewer;
  const shared = [...GROUPS.filter((g) => g.members.includes(st.viewer) && g.members.includes(person)).map((g) => g.name), ...EVENTS.filter((e) => e.attendees.includes(st.viewer) && e.attendees.includes(person)).map((e) => e.name)];
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="profile">
      <Header panel onBack={onBack} title={<h1 className="truncate text-base font-semibold text-gray-900">{self ? 'My Profile' : 'Profile'}</h1>} />
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

function Members({ chat, onBack, onPerson }: { chat: Chat; onBack: () => void; onPerson: (p: PersonId) => void }) {
  const list = channelMembers(chat);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="members">
      <Header panel onBack={onBack} title={<h1 className="truncate text-base font-semibold text-gray-900">{list.length} members</h1>} />
      <ul className="overflow-y-auto py-2">
        {list.map((p) => <li key={p}><button type="button" onClick={() => onPerson(p)} className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-left', HOVER)}><Avatar person={p} size="sm" /><span className="text-[15px] text-gray-900">{PEOPLE[p].name}</span></button></li>)}
      </ul>
    </div>
  );
}

function ForwardPicker({ st, onPick, onClose }: { st: State; onPick: (chatId: string) => void; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-label="Forward to">
      <div className="flex max-h-[80vh] w-full flex-col rounded-t-2xl bg-white sm:max-w-sm sm:rounded-2xl">
        <div className="flex min-h-14 items-center justify-between border-b px-4"><h2 className="font-semibold text-gray-900">Forward to</h2><button type="button" autoFocus aria-label="Close" onClick={onClose} className={cn('flex h-11 w-11 items-center justify-center rounded-full', HOVER)}><X className="h-5 w-5" /></button></div>
        <ul className="overflow-y-auto py-2">
          {visibleChats(st).map((c) => (
            <li key={c.id}><button type="button" onClick={() => onPick(c.id)} className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-left', HOVER)}><ChatAvatar st={st} chat={c} size="sm" /><span className="truncate text-[15px] text-gray-900">{chatTitle(st, c)}</span></button></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const InviteLink = ({ className }: { className?: string }) => (
  <a href={INVITE_PATH} target="_blank" rel="noreferrer" className={className ?? BLUE} data-testid="invite-link"><Handshake className="h-4 w-4" aria-hidden="true" />{COPY.invite}</a>
);

/* ---------- the prototype ---------- */

export function ClarityChatV12() {
  const [params] = useSearchParams();
  const mode = params.get('state');
  /* `?state=fail` opens on the chat holding the failed send, already read. */
  const fresh = (viewer: ViewerId = 'bob') => {
    const st0 = initialState({ viewer, empty: mode === 'empty', fail: mode === 'fail' });
    return mode === 'fail' && viewer === 'bob' ? openChat(st0, 'dm-bob-alice') : st0;
  };
  const [st, setSt] = useState<State>(() => fresh());
  const [view, setView] = useState<View>(() => (mode === 'fail' ? { kind: 'chat', chatId: 'dm-bob-alice' } : { kind: 'none' }));
  const [tab, setTab] = useState<Tab>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Record<string, string | undefined>>({});
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  /* A full-screen app has no page scroll: release the site's scrollbar gutter while it is open. */
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.scrollbarGutter;
    root.style.scrollbarGutter = 'auto';
    return () => { root.style.scrollbarGutter = before; };
  }, []);

  const set = (f: (s: State) => State) => setSt((cur) => f(cur));
  const key = (k: string) => `${st.viewer}:${k}`;
  const input = (k: string) => inputs[key(k)] ?? '';
  const setInput = (k: string) => (v: string) => setInputs((cur) => ({ ...cur, [key(k)]: v }));

  const reset = (viewer: ViewerId = st.viewer) => {
    setSt(fresh(viewer)); setView({ kind: 'none' }); setTab('all'); setShowArchived(false); setQ(''); setDrawer(false); setInputs({}); setReplyTo({}); setForwarding(null); setPicker(false);
  };
  const switchViewer = (v: ViewerId) => {
    setSt((cur) => ({ ...cur, viewer: v })); setView({ kind: 'none' }); setTab('all'); setShowArchived(false); setQ(''); setDrawer(false); setForwarding(null); setPicker(false);
  };

  const open = (chatId: string) => { set((s) => openChat(s, chatId)); setView({ kind: 'chat', chatId }); setPicker(false); };
  const showProfile = (person: PersonId) => setView((cur) => ({ kind: 'profile', person, back: cur }));
  const message = (person: PersonId) => {
    const r = dmWith(st, person);
    if (!r) return;
    setSt(r.next); setQ(''); open(r.chatId);
  };

  /* The Archived view closes itself once nothing is left in it, and stays closed (hook kept above the loading return). */
  const archivedEmpty = archivedChats(st).length === 0;
  useEffect(() => { if (showArchived && archivedEmpty) setShowArchived(false); }, [showArchived, archivedEmpty]);

  const strip = (onMock?: () => void) => <Strip viewer={st.viewer} onViewer={switchViewer} onReset={() => reset()} onMock={onMock} />;

  if (mode === 'loading') {
    return (
      <Frame strip={strip()} rail={<FolderRail folders={[]} active="all" onPick={() => undefined} onMenu={() => undefined} />} chatOpen={false} list={<><ListTop onMenu={() => undefined} q="" onQ={() => undefined} /><Skeleton /></>} main={<div className="hidden h-full animate-pulse flex-col gap-3 p-6 lg:flex" data-testid="chat-skeleton"><div className="h-6 w-1/3 rounded bg-gray-200" /><div className="h-16 w-2/3 rounded-2xl bg-gray-100" /><div className="h-16 w-1/2 rounded-2xl bg-gray-100" /></div>} />
    );
  }

  const tabs = tabsFor(st);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'all';
  const inArchived = showArchived && archivedChats(st).length > 0;
  const rows = inArchived ? archivedChats(st) : chatsInTab(st, activeTab);
  const results = q.trim() ? search(st, q) : null;
  const archivedCount = archivedChats(st).length;
  const openChatId = view.kind === 'chat' || view.kind === 'members' ? view.chatId : null;
  const pickFolder = (t: Tab) => { setTab(t); setShowArchived(false); };

  const toggleArchive = (c: Chat) => set((s) => (isArchived(s, c.id) ? unarchive(s, c.id) : archive(s, c.id)));

  const list = (
    <>
      <ListTop onMenu={() => setDrawer(true)} q={q} onQ={setQ} />
      {!results && !inArchived && <FolderTabs folders={tabs} active={activeTab} onPick={pickFolder} />}
      {inArchived && (
        <div className="flex min-h-12 shrink-0 items-center gap-1 border-b px-2"><button type="button" aria-label="Back to chats" onClick={() => setShowArchived(false)} className={cn('flex h-11 w-11 items-center justify-center rounded-full', HOVER)}><ArrowLeft className="h-5 w-5" /></button><h2 className="font-semibold text-gray-900">{COPY.archived}</h2></div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {results ? (
          <SearchResults st={st} results={results} onChat={(id) => { setQ(''); open(id); }} onPerson={showProfile} />
        ) : st.chats.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" data-testid="empty-list"><p className="text-[15px] text-gray-700">{COPY.emptyList}</p><InviteLink /></div>
        ) : (
          <ul aria-label="Chats" data-testid="chat-rows" className="pb-4">
            {!inArchived && activeTab === 'all' && archivedCount > 0 && (
              <li><button type="button" onClick={() => setShowArchived(true)} className={cn('flex min-h-[60px] w-full items-center gap-3 px-3 text-left', HOVER)}><span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-gray-600"><Archive className="h-5 w-5" aria-hidden="true" /></span><span className="flex-1 text-[15px] font-semibold text-gray-900">{COPY.archived}</span><span className="text-xs text-gray-500">{archivedCount}</span></button></li>
            )}
            {rows.map((c) => <ChatRow key={c.id} st={st} chat={c} active={c.id === openChatId} archived={inArchived} onOpen={() => open(c.id)} onArchive={() => toggleArchive(c)} />)}
            {rows.length === 0 && !inArchived && GROUPS.some((g) => g.id === activeTab) && <li className="px-6 py-12 text-center text-sm text-gray-500" data-testid="empty-group">{COPY.emptyGroup}</li>}
            {rows.length === 0 && activeTab === 'unread' && !inArchived && <li className="px-6 py-12 text-center text-sm text-gray-500">No unread chats.</li>}
          </ul>
        )}
      </div>
    </>
  );

  const main = (() => {
    if (view.kind === 'profile') return <Profile st={st} person={view.person} onBack={() => setView(view.back)} onMessage={() => message(view.person)} />;
    /* Only a chat the current viewer may see ever renders, whatever the view still points at. */
    const found = openChatId ? chatById(st, openChatId) : undefined;
    const chat = found && canSee(st.viewer, found) ? found : undefined;
    if (!chat) return <div className="hidden h-full items-center justify-center bg-gray-50 lg:flex" data-testid="empty-main"><span className="rounded-full bg-white px-3 py-1 text-sm text-gray-500 shadow-sm">{COPY.selectChat}</span></div>;
    if (view.kind === 'members') return <Members chat={chat} onBack={() => setView({ kind: 'chat', chatId: chat.id })} onPerson={showProfile} />;
    const threadId = view.kind === 'chat' ? view.thread : undefined;
    const openThread = (postId: string) => setView({ kind: 'chat', chatId: chat.id, thread: postId });
    const closeThread = () => setView({ kind: 'chat', chatId: chat.id });
    const chatView = (
      <ChatView
        st={st} chat={chat} input={input(chat.id)} onInput={setInput(chat.id)} replyTo={replyTo[key(chat.id)]} picker={picker} onPicker={setPicker} threadId={threadId}
        onBack={() => setView({ kind: 'none' })} onPerson={showProfile} onMembers={() => setView({ kind: 'members', chatId: chat.id })}
        onReply={(m) => (chat.kind === 'channel' ? openThread(m.id) : setReplyTo((cur) => ({ ...cur, [key(chat.id)]: m.id })))}
        onCancelReply={() => setReplyTo((cur) => ({ ...cur, [key(chat.id)]: undefined }))}
        onThread={(m) => openThread(m.id)}
        onForward={setForwarding} onRetry={(id) => set((s) => retry(s, id))}
        onSend={(text) => {
          const q2 = replyTo[key(chat.id)] ? st.msgs.find((x) => x.id === replyTo[key(chat.id)]) : undefined;
          set((s) => send(s, chat.id, text, q2 ? { quote: { who: q2.who, text: q2.transcript ? COPY.transcript : q2.text || q2.share?.title || '' } } : {}));
          setReplyTo((cur) => ({ ...cur, [key(chat.id)]: undefined }));
        }}
        onShare={(sh) => { set((s) => send(s, chat.id, '', { share: sh })); setPicker(false); }}
      />
    );
    if (!threadId) return chatView;
    return (
      <div className="flex h-full min-h-0">
        {/* On a phone the thread takes the whole screen; on desktop it sits beside the channel. */}
        <div className="hidden min-w-0 flex-1 lg:flex lg:flex-col">{chatView}</div>
        <Thread st={st} chat={chat} postId={threadId} input={input(`t:${threadId}`)} onInput={setInput(`t:${threadId}`)} onClose={closeThread} onPerson={showProfile}
          onSend={(t) => set((s) => comment(s, threadId, t))} onForward={setForwarding} onRetry={(id) => set((s) => retry(s, id))} />
      </div>
    );
  })();

  return (
    <TooltipProvider delayDuration={300}>
      <Frame
        strip={strip(() => {
          const r = mockIncoming(st);
          if (!r) { toast('No chat to deliver a mock message to.'); return; }
          /* Arriving in the chat on screen, it is read at once (Telegram). */
          setSt(r.chatId === openChatId ? openChat(r.next, r.chatId) : r.next);
          toast(`New message in ${chatTitle(r.next, chatById(r.next, r.chatId)!)}`);
        })}
        rail={<FolderRail folders={tabs} active={inArchived ? '' : activeTab} onPick={pickFolder} onMenu={() => setDrawer(true)} />}
        chatOpen={view.kind !== 'none'} list={list} main={main}
      />
      {drawer && (
        <SideMenu
          viewer={st.viewer} onClose={() => setDrawer(false)}
          todayEvent={EVENTS.find((e) => e.today && st.chats.some((c) => c.eventId === e.id && canSee(st.viewer, c)))}
          onEvent={(eventId) => { setDrawer(false); const c = st.chats.find((x) => x.eventId === eventId); if (c) open(c.id); }}
          onProfile={() => { setDrawer(false); showProfile(st.viewer); }}
        />
      )}
      {forwarding && <ForwardPicker st={st} onClose={() => setForwarding(null)} onPick={(to) => { set((s) => forward(s, forwarding, to)); setForwarding(null); toast(`Forwarded to ${chatTitle(st, chatById(st, to)!)}`); }} />}
      <Toaster />
    </TooltipProvider>
  );
}

function Frame({ strip, rail, list, main, chatOpen }: { strip: ReactNode; rail: ReactNode; list: ReactNode; main: ReactNode; chatOpen: boolean }) {
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-white" data-testid="v12-app">
      {strip}
      <div className="flex min-h-0 flex-1">
        {rail}
        <section aria-label="Chat list" data-testid="chat-list" className={cn('min-w-0 flex-col border-r lg:flex lg:w-[360px] lg:shrink-0', chatOpen ? 'hidden' : 'flex w-full')}>{list}</section>
        <main className={cn('min-w-0 flex-1 flex-col lg:flex', chatOpen ? 'flex' : 'hidden')}>{main}</main>
      </div>
    </div>
  );
}

function Strip({ viewer, onViewer, onReset, onMock }: { viewer: ViewerId; onViewer: (v: ViewerId) => void; onReset: () => void; onMock?: () => void }) {
  const lenses: { id: ViewerId; label: string }[] = [{ id: 'bob', label: 'Bob (member)' }, { id: 'dana', label: 'Dana (attendee)' }];
  return (
    <div role="region" aria-label="Prototype controls" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-gray-100 px-3 py-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">Prototype v12</span>
      <div role="radiogroup" aria-label="View as" className="inline-flex rounded-lg border bg-white p-0.5">
        {lenses.map((l) => <button key={l.id} type="button" role="radio" aria-checked={viewer === l.id} onClick={() => onViewer(l.id)} className={cn('min-h-10 rounded-md px-2 text-sm font-medium sm:px-2.5', viewer === l.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50')}>{l.label}</button>)}
      </div>
      {onMock && <button type="button" onClick={onMock} className={STRIP_BUTTON}>Mock new message</button>}
      <button type="button" onClick={onReset} className={STRIP_BUTTON}>Reset</button>
    </div>
  );
}

/** ☰ and search. On desktop ☰ lives at the top of the folder rail instead. */
function ListTop({ onMenu, q, onQ }: { onMenu: () => void; q: string; onQ: (v: string) => void }) {
  return (
    <header className="flex shrink-0 items-center gap-1 px-2 pb-2 pt-2 lg:px-3">
      <button type="button" aria-label="Open menu" onClick={onMenu} className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 lg:hidden', HOVER)}><Menu className="h-5 w-5" /></button>
      <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-gray-100 px-3 text-gray-500">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input value={q} onChange={(e) => onQ(e.target.value)} placeholder={COPY.search} aria-label="Search" className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none md:text-sm" />
        {q && <button type="button" aria-label="Clear search" onClick={() => onQ('')} className="flex h-8 w-8 items-center justify-center"><X className="h-4 w-4" /></button>}
      </label>
    </header>
  );
}

function SearchResults({ st, results, onChat, onPerson }: { st: State; results: { chats: Chat[]; people: PersonId[] }; onChat: (id: string) => void; onPerson: (p: PersonId) => void }) {
  const row = cn('flex min-h-14 w-full items-center gap-3 px-3 text-left', HOVER);
  return (
    <div data-testid="search-results">
      {results.chats.length > 0 && <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Chats</h2>}
      <ul aria-label="Chat results">{results.chats.map((c) => <li key={c.id}><button type="button" className={row} onClick={() => onChat(c.id)}><ChatAvatar st={st} chat={c} size="sm" /><span className="truncate text-[15px] text-gray-900">{chatTitle(st, c)}</span></button></li>)}</ul>
      {results.people.length > 0 && <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">People</h2>}
      <ul aria-label="People results">{results.people.map((p) => <li key={p}><button type="button" className={row} onClick={() => onPerson(p)}><Avatar person={p} size="sm" /><span className="min-w-0"><span className="block truncate text-[15px] text-gray-900">{PEOPLE[p].name}</span><span className="text-xs text-gray-500">@{PEOPLE[p].nickname}</span></span></button></li>)}</ul>
      {results.people.length === 0 && (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" data-testid="search-no-people"><p className="text-sm text-gray-600">{COPY.emptySearch}</p><InviteLink /></div>
      )}
    </div>
  );
}

/** A 1:1's header: the person (opens their profile), and on the right Invite as partner, or "Partner" once they are one. */
function DmTitle({ st, chat, onPerson }: { st: State; chat: Chat; onPerson: (p: PersonId) => void }) {
  const other = otherOf(st, chat);
  return <button type="button" onClick={() => onPerson(other)} className="flex min-h-11 min-w-0 items-center gap-2.5 text-left"><Avatar person={other} size="sm" /><span className="min-w-0"><span className="block truncate text-base font-semibold text-gray-900">{chatTitle(st, chat)}</span><span className="block truncate text-xs text-gray-500">@{PEOPLE[other].nickname}</span></span></button>;
}

function PartnerControl({ st, chat }: { st: State; chat: Chat }) {
  if (arePartners(st.viewer, otherOf(st, chat))) return <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 px-2 text-sm font-medium text-gray-600" data-testid="partner-chip"><Handshake className="h-4 w-4" aria-hidden="true" />{COPY.partner}</span>;
  return <a href={INVITE_PATH} target="_blank" rel="noreferrer" className={cn(OUTLINE, 'shrink-0')} data-testid="invite-as-partner"><Handshake className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{COPY.inviteAsPartner}</span><span className="sm:hidden">Invite</span></a>;
}

function ChatView({ st, chat, input, onInput, replyTo, picker, onPicker, threadId, onBack, onPerson, onMembers, onReply, onCancelReply, onThread, onForward, onRetry, onSend, onShare }: {
  st: State; chat: Chat; input: string; onInput: (v: string) => void; replyTo?: string; picker: boolean; onPicker: (v: boolean) => void; threadId?: string;
  onBack: () => void; onPerson: (p: PersonId) => void; onMembers: () => void; onReply: (m: Msg) => void; onCancelReply: () => void; onThread: (m: Msg) => void;
  onForward: (id: string) => void; onRetry: (id: string) => void; onSend: (t: string) => void; onShare: (s: (typeof SHAREABLE)['bob'][number]) => void;
}) {
  const channel = chat.kind === 'channel';
  const msgs = msgsOf(st, chat.id);
  const quoted = replyTo ? st.msgs.find((x) => x.id === replyTo) : undefined;
  const end = useRef<HTMLDivElement>(null);
  useEscape(() => onPicker(false), picker);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [msgs.length, chat.id]);
  const title = channel
    ? <button type="button" onClick={onMembers} className="flex min-h-11 min-w-0 items-center gap-2.5 text-left" data-testid="channel-header"><ChannelMark size="sm" /><span className="min-w-0"><span className="block truncate text-base font-semibold text-gray-900">{chatTitle(st, chat)}</span><span className="block text-xs text-gray-500">{channelMembers(chat).length} members</span></span></button>
    : <DmTitle st={st} chat={chat} onPerson={onPerson} />;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-view" data-chat-open={chat.id}>
      <Header onBack={onBack} title={title}>{!channel && <PartnerControl st={st} chat={chat} />}</Header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-white py-2">
        {msgs.length === 0 && <p className="px-6 py-12 text-center text-sm text-gray-500">No messages yet. Say hello.</p>}
        {msgs.length > 0 && <Divider>{dayLabel(chat)}</Divider>}
        <MessageList label="Messages" msgs={msgs} render={(m, compact) => (
          <MessageRow key={m.id} msg={m} compact={compact} highlight={m.id === threadId} replies={channel ? st.comments[m.id] ?? [] : undefined}
            onPerson={onPerson} onReply={() => onReply(m)} onForward={() => onForward(m.id)} onThread={channel ? () => onThread(m) : undefined} onRetry={() => onRetry(m.id)} />
        )} />
        <div ref={end} />
      </div>
      <Composer
        value={input} onValue={onInput} onSend={onSend} placeholder={channel ? `Message ${chatTitle(st, chat)}` : `Message ${PEOPLE[otherOf(st, chat)].name.split(' ')[0]}`}
        onAttach={channel ? () => onPicker(!picker) : undefined} pickerOpen={picker && channel}
        picker={(
          <div className="absolute bottom-full left-2 right-2 z-20 mb-1 rounded-xl border bg-white py-1 shadow-lg lg:left-3 lg:right-auto lg:w-96" role="dialog" aria-label="Post a point or story">
            <div className="flex min-h-11 items-center justify-between px-3"><span className="text-sm font-semibold text-gray-900">Post one of yours</span><button type="button" aria-label="Close picker" onClick={() => onPicker(false)} className={cn('flex h-10 w-10 items-center justify-center rounded-full', HOVER)}><X className="h-4 w-4" /></button></div>
            <ul>{SHAREABLE[st.viewer].map((s) => <li key={s.id}><button type="button" onClick={() => onShare(s)} className={cn('flex min-h-12 w-full items-center gap-3 px-3 text-left', HOVER)}><span className="w-12 shrink-0 text-xs text-gray-500">{s.kind === 'point' ? 'Point' : 'Story'}</span><span className="text-sm text-gray-900">{s.title}</span></button></li>)}</ul>
          </div>
        )}
        quote={quoted && <QuoteBar author={PEOPLE[quoted.who].name} text={quoted.transcript ? COPY.transcript : quoted.text || quoted.share?.title || ''} onRemove={onCancelReply} />}
      />
    </div>
  );
}

/** A channel post's thread (Slack's side panel): the post, its replies, and a reply field. People only, no agent. */
function Thread({ st, chat, postId, input, onInput, onClose, onPerson, onSend, onForward, onRetry }: {
  st: State; chat: Chat; postId: string; input: string; onInput: (v: string) => void; onClose: () => void; onPerson: (p: PersonId) => void; onSend: (t: string) => void; onForward: (id: string) => void; onRetry: (id: string) => void;
}) {
  const post = st.msgs.find((x) => x.id === postId);
  const replies = st.comments[postId] ?? [];
  useEscape(onClose);
  if (!post) return null;
  /* Reply inside a thread answers in the same thread: it focuses the reply field. */
  const focusComposer = () => document.getElementById('v12-thread-input')?.focus();
  return (
    <SidePanel label="Thread" onClose={onClose} title={<div className="min-w-0"><h1 className="truncate text-base font-semibold text-gray-900">Thread</h1><p className="truncate text-xs text-gray-500">{chatTitle(st, chat)}</p></div>}>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <ul aria-label="Post"><MessageRow msg={post} compact={false} onPerson={onPerson} onReply={focusComposer} onForward={() => onForward(post.id)} onRetry={() => onRetry(post.id)} /></ul>
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground"><span className="shrink-0">{COPY.replies(replies.length)}</span><span className="h-px flex-1 bg-gray-200" /></div>
        <MessageList label="Replies" msgs={replies} render={(c, compact) => <MessageRow key={c.id} msg={c} compact={compact} onPerson={onPerson} onReply={focusComposer} onForward={() => onForward(c.id)} onRetry={() => onRetry(c.id)} />} />
      </div>
      <Composer value={input} onValue={onInput} onSend={onSend} placeholder={COPY.replyInThread} inputId="v12-thread-input" />
    </SidePanel>
  );
}
