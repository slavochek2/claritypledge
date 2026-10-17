/**
 * @file ClarityChatV13.tsx
 * @description P1509 v13 prototype at /tree/clarity-chat-v13: chats as the logged-in home. Telegram frame: on
 * desktop a dark folder rail (All chats, Unread, Partners, Groups) with me at its foot (ChatGPT), beside the list and
 * the open chat; on a phone one column with the folders as tabs. ☰ opens the drawer (me, the app's pages, today's
 * event, Settings and Tools at the foot). Hover toolbar: Reply (quotes in place), Thread (channels), Forward (pick,
 * confirm, jump). Composer: 📎 left opens a points-and-stories search; 🎤 records a voice note. Groups is one folder:
 * each group has # general and one closed channel per event; a live event fills from Transcribe. Profiles are
 * production's CompactProfileCard; shared items use production's card frames. Mock data only (state.ts).
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Archive, ArrowLeft, CalendarDays, Forward, Handshake, Hash, HomeIcon, LandmarkIcon, LayoutGrid, LogOut, MailIcon, Menu, MessageCircle,
  MessagesSquare, MessageSquareDot, MessageSquareText, Mic, MoreHorizontal, Play, Reply, Search, Settings, UserIcon, UsersIcon, X, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { CompactProfileCard } from '@/app/components/profile/compact-profile-card';
import { PointCardShell } from '@/app/components/shared/presentational/point-card-shell';
import { QuotedStoryShell } from '@/app/components/shared/presentational/quoted-story-shell';
import type { Profile as ProfileData } from '@/app/types';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Avatar, clock, Composer, Divider, Message, MsgText, QuoteBar, SidePanel, Tip, ToolButton, Toolbar, TOOL_ICON } from './kit';
import { AGREEMENT_PATH, COPY, EVENTS, GROUPS, MENU_PAGES, PEOPLE, type PersonId, type Shareable, type ViewerId } from './mock-data';
import {
  archive, archivedChats, canMessage, canSee, channelMembers, chatById, chatTitle, chatsInTab, comment, dmWith, eventOf, findShareable, forward,
  groupOf, groupPeople, groupSections, initialState, isArchived, lastMsg, leaveGroup, liveLinesLeft, msgsOf, nextLiveLine, openChat, otherOf,
  partners, repliesOf, retry, search, send, sendVoice, sharedWith, summary, tabsFor, unarchive, unreadOf, visibleChats,
  type Chat, type Msg, type State, type Tab,
} from './state';

const HOVER = '[@media(hover:hover)]:hover:bg-gray-100';
const BLUE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700';
const OUTLINE = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50';
const STRIP_BUTTON = 'inline-flex min-h-10 shrink-0 items-center rounded-md border bg-white px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50';
const MENU_ITEM = cn('flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-gray-900', HOVER);
const INVITE_PATH = '/agreements/new';

/** What the main column shows. On a phone, anything but `none` replaces the list. A thread sits beside its channel on desktop. */
type View =
  | { kind: 'none' }
  | { kind: 'chat'; chatId: string; thread?: string }
  /** A channel's members, or (from group info) the group's whole circle; Back returns where it was opened from. */
  | { kind: 'members'; chatId: string; groupId?: string; back: View }
  | { kind: 'profile'; person: PersonId; back: View };

const MENU_ICON: Record<(typeof MENU_PAGES)[number]['id'], LucideIcon> = { home: HomeIcon, letters: MailIcon, groups: LandmarkIcon };
const FOLDER_ICON: Record<Tab, LucideIcon> = { all: MessagesSquare, unread: MessageSquareDot, partners: UsersIcon, groups: LandmarkIcon };
const SOON = (what: string) => () => toast(`${what} opens production’s ${what.toLowerCase()}, unchanged.`);

/* ---------- small pieces ---------- */

/** The day over a chat's messages: a past event's date, else Today. */
const dayLabel = (chat: Chat) => {
  const ev = eventOf(chat);
  return ev && !ev.today ? ev.when : 'Today';
};

/** `#` for a group's general, a calendar for an event channel. `onBlue`: white on a selected row. */
const ChannelMark = ({ chat, size = 'list', onBlue = false }: { chat: Chat; size?: 'list' | 'sm'; onBlue?: boolean }) => {
  const Icon = chat.eventId ? CalendarDays : Hash;
  return (
    <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-full', onBlue ? 'bg-white text-blue-600' : 'bg-blue-600 text-white', size === 'list' ? 'h-12 w-12' : 'h-8 w-8')}>
      <Icon className={size === 'list' ? 'h-5 w-5' : 'h-4 w-4'} />
    </span>
  );
};

const ChatAvatar = ({ st, chat, size = 'list' }: { st: State; chat: Chat; size?: 'list' | 'sm' }) => (chat.kind === 'dm' ? <Avatar person={otherOf(st, chat)} size={size} /> : <ChannelMark chat={chat} size={size} />);

/** A channel row outside its group's section says which group it belongs to. */
const rowTitle = (st: State, c: Chat, inSection = false) =>
  c.kind === 'dm' ? chatTitle(st, c) : c.eventId ? chatTitle(st, c) : inSection ? `# ${COPY.general}` : `${groupOf(c)?.name} · # ${COPY.general}`;

function Header({ onBack, title, children, panel = false }: { onBack?: () => void; title: ReactNode; children?: ReactNode; panel?: boolean }) {
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-2 border-b px-2 lg:px-4">
      {onBack && <button type="button" aria-label="Back" onClick={onBack} className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', !panel && 'lg:hidden', HOVER)}><ArrowLeft className="h-5 w-5" /></button>}
      <div className="min-w-0 flex-1">{title}</div>
      {children}
    </header>
  );
}

/** Stacked faces and "N replies" under a channel post (Slack). */
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

/** A point or story, drawn in production's own frames (the feed's point card, the quoted-story box). */
export function ShareCard({ item, onPerson, full = false }: { item: Shareable; onPerson?: (p: PersonId) => void; full?: boolean }) {
  const width = full ? 'w-full' : 'max-w-md';
  const tags = item.tags.length > 0 && <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-blue-700">{item.tags.map((t) => <span key={t}>#{t}</span>)}</p>;
  const byline = <><Avatar person={item.author} size="xs" /><span className="text-sm font-medium text-gray-900">{PEOPLE[item.author].name}</span><span className="text-xs text-gray-500">· Story</span></>;
  if (item.kind === 'point') {
    return (
      <PointCardShell data-testid="share-point" className={cn('mt-1', width)} statement={<p className="text-[15px] font-medium leading-snug text-gray-900">{item.title}</p>}>
        <p className="mt-1 text-xs text-gray-500">Point · {PEOPLE[item.author].name}</p>
        {tags}
      </PointCardShell>
    );
  }
  return (
    <div className={cn('mt-1', width)} data-testid="share-story">
      <QuotedStoryShell
        isAgent={false} openViaDetails
        header={onPerson
          ? <button type="button" onClick={() => onPerson(item.author)} className="mb-1 flex items-center gap-2 text-left">{byline}</button>
          : <span className="mb-1 flex items-center gap-2">{byline}</span>}
      >
        <p className="text-[15px] font-semibold text-gray-900">{item.title}</p>
        {item.excerpt && <p className="mt-1 line-clamp-3 text-sm text-gray-700">{item.excerpt}</p>}
        {tags}
      </QuotedStoryShell>
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

/** Hover (or a tap on a phone) shows Reply, Thread (channel posts only) and Forward. */
function MessageRow({ msg, compact, highlight, replies, onPerson, onReply, onForward, onThread, onRetry, liveThread }: {
  msg: Msg; compact: boolean; highlight?: boolean; replies?: Msg[]; liveThread?: boolean;
  onPerson: (p: PersonId) => void; onReply: () => void; onForward: () => void; onThread?: () => void; onRetry: () => void;
}) {
  const [selected, setSelected] = useState(false);
  const act = (f: () => void) => () => { setSelected(false); f(); };
  /* A message that never sent offers Retry only (Telegram): nothing can reply to it or forward it yet. */
  const toolbar = msg.failed ? undefined : (
    <Toolbar shown={selected}>
      <ToolButton label="Reply" onClick={act(onReply)}><Reply className={TOOL_ICON} /></ToolButton>
      {onThread && <ToolButton label="Thread" onClick={act(onThread)}><MessageSquareText className={TOOL_ICON} /></ToolButton>}
      <ToolButton label="Forward" onClick={act(onForward)}><Forward className={TOOL_ICON} /></ToolButton>
    </Toolbar>
  );
  return (
    <li data-msg={msg.id}>
      <Message person={msg.who} time={msg.time} compact={compact} highlight={highlight} selected={selected} onSelect={msg.failed ? undefined : () => setSelected((s) => !s)} onPerson={onPerson} toolbar={toolbar}>
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
        {msg.table
          ? <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg border bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-900" data-testid="table-post"><UsersIcon className="h-4 w-4" aria-hidden="true" />{msg.text}</p>
          : msg.text && <MsgText>{msg.text}</MsgText>}
        {msg.voice && <VoiceNote secs={msg.voice} />}
        {msg.share && <ShareCard item={msg.share} onPerson={onPerson} />}
        {msg.transcribed && !msg.table && <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500" data-testid="transcribed-mark"><Mic className="h-3 w-3" aria-hidden="true" />{COPY.transcribed}</p>}
        {msg.failed && (
          <div className="mt-1 flex items-center gap-2 text-xs text-red-700" data-testid="send-failed">
            {COPY.notSent}
            <button type="button" onClick={onRetry} className="min-h-10 rounded-md px-3 font-semibold text-blue-700 hover:bg-blue-50">{COPY.retry}</button>
          </div>
        )}
        {onThread && replies && replies.length > 0 && <RepliesLink replies={replies} onOpen={onThread} live={liveThread} />}
      </Message>
    </li>
  );
}

/** A list of messages; a row from the same sender as the row above drops its avatar and name. */
function MessageList({ label, msgs, render }: { label: string; msgs: Msg[]; render: (m: Msg, compact: boolean) => ReactNode }) {
  return <ul aria-label={label} className="flex flex-col gap-0.5">{msgs.map((m, i) => render(m, i > 0 && msgs[i - 1]!.who === m.who && !m.fwdFrom && !m.table))}</ul>;
}

/* ---------- chat list ---------- */

function ChatRow({ st, chat, active, onOpen, onArchive, archived, inSection = false }: { st: State; chat: Chat; active: boolean; onOpen: () => void; onArchive: () => void; archived: boolean; inSection?: boolean }) {
  const [menu, setMenu] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const last = lastMsg(st, chat.id);
  const unread = unreadOf(st, chat.id);
  const who = last && (last.who === st.viewer ? 'You: ' : chat.kind === 'channel' ? `${PEOPLE[last.who].name.split(' ')[0]}: ` : '');
  const body = last ? summary(last) : 'No messages yet';
  const live = !!eventOf(chat)?.live;
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
        className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', inSection ? 'min-h-[60px]' : 'min-h-[68px]', active ? 'bg-blue-600 text-white' : HOVER)}
      >
        {chat.kind === 'dm' ? <Avatar person={otherOf(st, chat)} size="list" /> : <ChannelMark chat={chat} onBlue={active} />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn('truncate text-[15px] font-semibold', active ? 'text-white' : 'text-gray-900')}>{rowTitle(st, chat, inSection)}</span>
            {live && <span className={cn('shrink-0 rounded-full px-1.5 text-[11px] font-semibold', active ? 'bg-white text-blue-700' : 'bg-red-50 text-red-700')}>LIVE</span>}
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

/** Escape closes a hand-rolled dialog or menu while `on`. */
function useEscape(onClose: () => void, on = true) {
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, on]);
}

/** My account menu (ChatGPT's bottom-left): profile, settings, tools. */
function MeMenu({ onProfile, onClose, className }: { onProfile: () => void; onClose: () => void; className?: string }) {
  useEscape(onClose);
  return (
    <div role="menu" aria-label="My account" className={cn('z-50 w-56 rounded-xl border bg-white p-1 shadow-xl', className)} data-testid="me-menu">
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => { onClose(); onProfile(); }}><UserIcon className="h-4 w-4 text-gray-500" />My profile</button>
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => { onClose(); SOON('Settings')(); }}><Settings className="h-4 w-4 text-gray-500" />Settings</button>
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => { onClose(); SOON('Tools')(); }}><LayoutGrid className="h-4 w-4 text-gray-500" />Tools</button>
    </div>
  );
}

/** Telegram desktop's folder rail: ☰ on top, the four folders, and me at the foot. */
function FolderRail({ viewer, folders, active, onPick, onMenu, onProfile }: { viewer: ViewerId; folders: Folder[]; active: Tab | ''; onPick: (t: Tab) => void; onMenu: () => void; onProfile: () => void }) {
  const [me, setMe] = useState(false);
  return (
    <nav aria-label="Folders" className="relative hidden w-[76px] shrink-0 flex-col items-stretch bg-slate-800 py-1 lg:flex" data-testid="folder-rail">
      <button type="button" aria-label="Open menu" onClick={onMenu} className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-700 hover:text-white"><Menu className="h-6 w-6" /></button>
      <div role="tablist" aria-orientation="vertical" aria-label="Folders" className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none]">
        {folders.map((f) => {
          const Icon = FOLDER_ICON[f.id];
          const on = f.id === active;
          return (
            <button key={f.id} type="button" role="tab" aria-selected={on} onClick={() => onPick(f.id)} className={cn('relative flex min-h-[64px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium leading-tight', on ? 'bg-slate-900 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white')}>
              <span className="relative">
                <Icon className="h-6 w-6" aria-hidden="true" />
                <Badge n={f.unread} className="absolute -right-3 -top-2 ring-2 ring-slate-800" />
              </span>
              <span className="w-full truncate text-center">{f.label}</span>
            </button>
          );
        })}
      </div>
      <button type="button" aria-label="My account" aria-expanded={me} onClick={() => setMe(!me)} className="mx-auto mt-1 flex h-14 w-14 items-center justify-center rounded-lg hover:bg-slate-700" data-testid="rail-me"><Avatar person={viewer} size="sm" /></button>
      {me && <MeMenu className="absolute bottom-2 left-[80px]" onProfile={onProfile} onClose={() => setMe(false)} />}
    </nav>
  );
}

function FolderTabs({ folders, active, onPick }: { folders: Folder[]; active: Tab; onPick: (t: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Folders" className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 pr-8 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] [scrollbar-width:none] lg:hidden" data-testid="folder-tabs">
      {folders.map((t) => (
        /* The picked tab scrolls into view, so at 320px a far-right folder never hides behind the fade. */
        <button key={t.id} ref={(el) => { if (el && t.id === active) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }} type="button" role="tab" aria-selected={t.id === active} onClick={() => onPick(t.id)} className={cn('inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium', t.id === active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900')}>
          {t.label}<Badge n={t.unread} />
        </button>
      ))}
    </div>
  );
}

/* ---------- side menu (Telegram's drawer) ---------- */

function SideMenu({ viewer, todayEvent, onClose, onEvent, onProfile }: { viewer: ViewerId; todayEvent?: { id: string; name: string }; onClose: () => void; onEvent: (eventId: string) => void; onProfile: () => void }) {
  useEscape(onClose);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  const me = PEOPLE[viewer];
  const item = cn('flex min-h-12 w-full items-center gap-4 px-5 text-left text-[15px] font-medium text-gray-900', HOVER);
  const icon = 'h-[22px] w-[22px] shrink-0 text-gray-500';
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-label="Menu">
      <nav ref={panel} tabIndex={-1} className="flex h-full w-[300px] max-w-[85vw] flex-col bg-white shadow-2xl outline-none motion-safe:animate-in motion-safe:slide-in-from-left">
        <button type="button" onClick={onProfile} className={cn('border-b px-5 pb-4 pt-6 text-left', HOVER)} data-testid="menu-profile">
          <Avatar person={viewer} size="list" />
          <p className="mt-3 truncate font-semibold text-gray-900">{me.name}</p>
          <p className="truncate text-sm text-gray-500">My profile</p>
        </button>
        <ul aria-label="Menu items" className="flex-1 overflow-y-auto py-2">
          {MENU_PAGES.map((p) => {
            const Icon = MENU_ICON[p.id];
            return <li key={p.id}><a href={p.path} target="_blank" rel="noreferrer" className={item} data-path={p.path}><Icon className={icon} aria-hidden="true" />{p.label}</a></li>;
          })}
          {todayEvent && (
            <>
              <li role="separator" className="my-2 h-px bg-gray-200" />
              <li>
                <button type="button" className={cn(item, 'py-2')} onClick={() => onEvent(todayEvent.id)}>
                  <CalendarDays className={cn(icon, 'text-blue-600')} aria-hidden="true" />
                  <span className="min-w-0"><span className="block text-xs font-normal text-gray-500">Today&apos;s event · live</span><span className="block truncate">{todayEvent.name}</span></span>
                </button>
              </li>
            </>
          )}
        </ul>
        <ul aria-label="Account" className="border-t py-2">
          <li><button type="button" className={item} onClick={SOON('Settings')}><Settings className={icon} aria-hidden="true" />Settings</button></li>
          <li><button type="button" className={item} onClick={SOON('Tools')}><LayoutGrid className={icon} aria-hidden="true" />Tools</button></li>
        </ul>
      </nav>
      <button type="button" aria-label="Close menu" onClick={onClose} className="flex-1 bg-black/40" />
    </div>
  );
}

/* ---------- panels and sheets ---------- */

/** Production's profile card, fed the mock person. Its links point at real routes the mock people do not have, so the prototype keeps them in place. */
const asProfile = (id: PersonId): ProfileData => {
  const p = PEOPLE[id];
  return { id: `mock-${id}`, slug: p.slug, name: p.name, email: p.email, role: p.role, bio: p.bio, avatarColor: p.avatarColor, hasPledged: p.pledger, signedAt: '', isVerified: true, witnesses: [], reciprocations: 0 };
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
      <Header panel onBack={onBack} title={<h1 className="truncate text-base font-semibold text-gray-900">{self ? 'My profile' : 'Profile'}</h1>} />
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

function Members({ chat, groupId, onBack, onPerson }: { chat: Chat; groupId?: string; onBack: () => void; onPerson: (p: PersonId) => void }) {
  const list = groupId ? groupPeople(groupId) : channelMembers(chat);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="members">
      <Header panel onBack={onBack} title={<h1 className="truncate text-base font-semibold text-gray-900">{list.length} members</h1>} />
      <ul className="overflow-y-auto py-2">
        {list.map((p) => <li key={p}><button type="button" onClick={() => onPerson(p)} className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-left', HOVER)}><Avatar person={p} size="sm" /><span className="min-w-0"><span className="block text-[15px] text-gray-900">{PEOPLE[p].name}</span><span className="block text-xs text-gray-500">{PEOPLE[p].role}</span></span></button></li>)}
      </ul>
    </div>
  );
}

/** A modal sheet: bottom on a phone, centred on desktop. */
function Sheet({ label, title, onClose, children, wide = false }: { label: string; title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-label={label} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cn('flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white sm:rounded-2xl', wide ? 'sm:max-w-lg' : 'sm:max-w-sm')}>
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b px-4"><div className="min-w-0 font-semibold text-gray-900">{title}</div><button type="button" autoFocus aria-label="Close" onClick={onClose} className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', HOVER)}><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

/** Forward, step 1: pick where. Step 2: see what goes, add a note, Send (then the app jumps there). */
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

/** 📎: search points and stories by words and #tags, see them as their real cards, tap one to post it. */
function AttachDialog({ st, onPick, onClose }: { st: State; onPick: (s: Shareable) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'point' | 'story'>('all');
  const items = findShareable(st, q, kind);
  return (
    <Sheet wide label="Attach a point or story" onClose={onClose} title="Attach a point or story">
      <div className="space-y-2 px-3 pt-3">
        <label className="flex min-h-11 items-center gap-2 rounded-full bg-gray-100 px-3 text-gray-500">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words or #tags" aria-label="Search points and stories" className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none md:text-sm" />
        </label>
        <div role="radiogroup" aria-label="Kind" className="flex gap-1">
          {(['all', 'point', 'story'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn('min-h-10 rounded-full px-3 text-sm font-medium', kind === k ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100')}>{k === 'all' ? 'All' : k === 'point' ? 'Points' : 'Stories'}</button>)}
        </div>
      </div>
      <ul className="space-y-1 overflow-y-auto p-3" data-testid="attach-results">
        {items.map((s) => <li key={s.id}><button type="button" onClick={() => onPick(s)} aria-label={`Attach ${s.title}`} className={cn('w-full rounded-xl p-1 text-left', HOVER)}><ShareCard item={s} full /></button></li>)}
        {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-gray-500">Nothing matches. Try fewer words or another #tag.</li>}
      </ul>
    </Sheet>
  );
}

/** Telegram's group info: the group, its circle, Members / Group page / Leave, and its channels. */
function GroupInfo({ st, groupId, onClose, onMembers, onLeave, onChannel }: { st: State; groupId: string; onClose: () => void; onMembers: () => void; onLeave: () => void; onChannel: (id: string) => void }) {
  const g = GROUPS.find((x) => x.id === groupId)!;
  const member = g.members.includes(st.viewer);
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
          <button type="button" className={tile} onClick={onMembers}><UsersIcon className="h-5 w-5" />Members</button>
          <a className={tile} href="/groups" target="_blank" rel="noreferrer"><LandmarkIcon className="h-5 w-5" />Group page</a>
          {member && <button type="button" className={tile} onClick={onLeave}><LogOut className="h-5 w-5" />Leave</button>}
        </div>
        <h3 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Channels</h3>
        <ul className="mx-4 overflow-hidden rounded-xl border bg-white">
          {chans.map((c) => <li key={c.id}><button type="button" onClick={() => onChannel(c.id)} className={cn('flex min-h-12 w-full items-center gap-3 px-3 text-left', HOVER)}><ChannelMark chat={c} size="sm" /><span className="min-w-0 flex-1 truncate text-sm text-gray-900">{rowTitle(st, c, true)}</span><span className="text-xs text-gray-500">{c.eventId ? 'members + attendees' : 'members'}</span></button></li>)}
        </ul>
      </div>
    </Sheet>
  );
}

const InviteLink = ({ className }: { className?: string }) => (
  <a href={INVITE_PATH} target="_blank" rel="noreferrer" className={className ?? BLUE} data-testid="invite-link"><Handshake className="h-4 w-4" aria-hidden="true" />{COPY.invite}</a>
);

/* ---------- the prototype ---------- */

export function ClarityChatV13() {
  const [params] = useSearchParams();
  const mode = params.get('state');
  /* `?state=fail` opens on the chat holding the failed send, already read. */
  const fresh = (viewer: ViewerId = 'bob') => {
    const st0 = initialState({ viewer, empty: mode === 'empty', fail: mode === 'fail', noPartners: mode === 'nopartners' });
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
  const [attach, setAttach] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** A point or story picked in 📎 waits above the composer until Send, so a note can go with it. */
  const [staged, setStaged] = useState<Record<string, Shareable | undefined>>({});
  const [leaving, setLeaving] = useState<string | null>(null);

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
  const closeOverlays = () => { setDrawer(false); setForwarding(null); setAttach(null); setInfo(null); setLeaving(null); };

  const reset = (viewer: ViewerId = st.viewer) => {
    setSt(fresh(viewer)); setView({ kind: 'none' }); setTab('all'); setShowArchived(false); setQ(''); setInputs({}); setReplyTo({}); setStaged({}); closeOverlays();
  };
  const switchViewer = (v: ViewerId) => {
    setSt((cur) => ({ ...cur, viewer: v })); setView({ kind: 'none' }); setTab('all'); setShowArchived(false); setQ(''); closeOverlays();
  };

  const open = (chatId: string) => { set((s) => openChat(s, chatId)); setView({ kind: 'chat', chatId }); };
  /** The quote a reply carries, for text and voice alike. */
  const replyExtra = (chatId: string): Partial<Msg> => {
    const q2 = replyTo[key(chatId)] ? st.msgs.find((x) => x.id === replyTo[key(chatId)]) : undefined;
    return q2 ? { quote: { who: q2.who, text: summary(q2) } } : {};
  };
  const clearReply = (chatId: string) => setReplyTo((cur) => ({ ...cur, [key(chatId)]: undefined }));
  const showProfile = (person: PersonId) => setView((cur) => ({ kind: 'profile', person, back: cur }));
  const message = (person: PersonId) => {
    const r = dmWith(st, person);
    if (!r) return;
    setSt(r.next); setQ(''); open(r.chatId);
  };

  /* The Archived view closes itself once nothing is left in it, and stays closed (hook kept above the loading return). */
  const archivedEmpty = archivedChats(st).length === 0;
  useEffect(() => { if (showArchived && archivedEmpty) setShowArchived(false); }, [showArchived, archivedEmpty]);

  const openChatId = view.kind === 'chat' || view.kind === 'members' ? view.chatId : null;
  const liveChat = openChatId && eventOf(chatById(st, openChatId) ?? { id: '', kind: 'dm' })?.live && canSee(st.viewer, chatById(st, openChatId)!) ? openChatId : null;
  const strip = (
    <Strip viewer={st.viewer} onViewer={switchViewer} onReset={() => reset()}
      onLive={liveChat && liveLinesLeft(st, liveChat) > 0 ? () => set((s) => openChat(nextLiveLine(s, liveChat), liveChat)) : undefined} />
  );

  if (mode === 'loading') {
    return (
      <Frame strip={strip} rail={<FolderRail viewer={st.viewer} folders={[]} active="all" onPick={() => undefined} onMenu={() => undefined} onProfile={() => undefined} />} chatOpen={false} list={<><ListTop onMenu={() => undefined} q="" onQ={() => undefined} /><Skeleton /></>} main={<div className="hidden h-full animate-pulse flex-col gap-3 p-6 lg:flex" data-testid="chat-skeleton"><div className="h-6 w-1/3 rounded bg-gray-200" /><div className="h-16 w-2/3 rounded-2xl bg-gray-100" /><div className="h-16 w-1/2 rounded-2xl bg-gray-100" /></div>} />
    );
  }

  const tabs = tabsFor(st);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'all';
  const inArchived = showArchived && archivedChats(st).length > 0;
  const rows = inArchived ? archivedChats(st) : chatsInTab(st, activeTab);
  const results = q.trim() ? search(st, q) : null;
  const archivedCount = archivedChats(st).length;
  const pickFolder = (t: Tab) => { setTab(t); setShowArchived(false); };
  const toggleArchive = (c: Chat) => set((s) => (isArchived(s, c.id) ? unarchive(s, c.id) : archive(s, c.id)));
  const row = (c: Chat, inSection = false) => <ChatRow key={c.id} st={st} chat={c} active={c.id === openChatId} archived={inArchived} inSection={inSection} onOpen={() => open(c.id)} onArchive={() => toggleArchive(c)} />;

  const list = (
    <>
      <ListTop onMenu={() => setDrawer(true)} q={q} onQ={setQ} />
      {!results && !inArchived && <FolderTabs folders={tabs} active={activeTab} onPick={pickFolder} />}
      {inArchived && (
        <div className="flex min-h-12 shrink-0 items-center gap-1 border-b px-2"><button type="button" aria-label="Back to chats" onClick={() => setShowArchived(false)} className={cn('flex h-11 w-11 items-center justify-center rounded-full', HOVER)}><ArrowLeft className="h-5 w-5" /></button><h2 className="font-semibold text-gray-900">{COPY.archived}</h2></div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {results ? (
          <SearchResults st={st} results={results} onChat={(id) => { setQ(''); open(id); }} onPerson={showProfile} onMessage={message} />
        ) : st.chats.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" data-testid="empty-list"><p className="text-[15px] text-gray-700">{COPY.emptyList}</p><InviteLink /></div>
        ) : !inArchived && activeTab === 'groups' ? (
          <div data-testid="group-sections" className="pb-4">
            {groupSections(st).map((g) => (
              <section key={g.groupId} aria-label={g.name}>
                <button type="button" onClick={() => setInfo(g.groupId)} className={cn('flex min-h-11 w-full items-center gap-2 px-3 pt-2 text-left', HOVER)} data-testid="group-section-header">
                  <LandmarkIcon className="h-4 w-4 text-gray-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{g.name}</span>
                  <span className="text-xs text-gray-500">{groupPeople(g.groupId).length} members</span>
                  <MoreHorizontal className="h-4 w-4 text-gray-500" aria-hidden="true" />
                </button>
                <ul aria-label={`${g.name} channels`}>{g.chats.map((c) => row(c, true))}</ul>
              </section>
            ))}
          </div>
        ) : (
          <ul aria-label="Chats" data-testid="chat-rows" className="pb-4">
            {!inArchived && activeTab === 'all' && archivedCount > 0 && (
              <li><button type="button" onClick={() => setShowArchived(true)} className={cn('flex min-h-[60px] w-full items-center gap-3 px-3 text-left', HOVER)}><span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-gray-600"><Archive className="h-5 w-5" aria-hidden="true" /></span><span className="flex-1 text-[15px] font-semibold text-gray-900">{COPY.archived}</span><span className="text-xs text-gray-500">{archivedCount}</span></button></li>
            )}
            {rows.map((c) => row(c))}
            {rows.length === 0 && activeTab === 'partners' && !inArchived && (
              <li className="flex flex-col items-center gap-3 px-6 py-12 text-center" data-testid="empty-partners"><Handshake className="h-8 w-8 text-gray-400" aria-hidden="true" /><p className="text-sm text-gray-600">{COPY.noPartners}</p><InviteLink /></li>
            )}
            {rows.length === 0 && activeTab === 'unread' && !inArchived && <li className="px-6 py-12 text-center text-sm text-gray-500">No unread chats.</li>}
          </ul>
        )}
      </div>
    </>
  );

  const main = (() => {
    if (view.kind === 'profile') return <Profile st={st} person={view.person} onBack={() => setView(view.back)} onMessage={() => message(view.person)} />;
    /* Only a chat the current viewer may see ever renders, whatever the view still points at. */
    const chat = openChatId ? visibleChats(st).find((c) => c.id === openChatId) : undefined;
    if (!chat) return <div className="hidden h-full items-center justify-center bg-gray-50 lg:flex" data-testid="empty-main"><span className="rounded-full bg-white px-3 py-1 text-sm text-gray-500 shadow-sm">{COPY.selectChat}</span></div>;
    if (view.kind === 'members') return <Members chat={chat} groupId={view.groupId} onBack={() => setView(view.back)} onPerson={showProfile} />;
    const threadId = view.kind === 'chat' ? view.thread : undefined;
    const openThread = (postId: string) => setView({ kind: 'chat', chatId: chat.id, thread: postId });
    const closeThread = () => setView({ kind: 'chat', chatId: chat.id });
    const chatView = (
      <ChatView
        st={st} chat={chat} input={input(chat.id)} onInput={setInput(chat.id)} replyTo={replyTo[key(chat.id)]} threadId={threadId}
        onBack={() => setView({ kind: 'none' })} onPerson={showProfile} onGroupInfo={() => chat.groupId && setInfo(chat.groupId)}
        onMembers={() => setView({ kind: 'members', chatId: chat.id, back: { kind: 'chat', chatId: chat.id } })}
        onLeave={() => setLeaving(chat.groupId!)}
        onReply={(m) => setReplyTo((cur) => ({ ...cur, [key(chat.id)]: m.id }))}
        onCancelReply={() => setReplyTo((cur) => ({ ...cur, [key(chat.id)]: undefined }))}
        onThread={(m) => openThread(m.id)}
        onForward={setForwarding} onRetry={(id) => set((s) => retry(s, id))}
        onAttach={() => setAttach(chat.id)}
        staged={staged[key(chat.id)]} onUnstage={() => setStaged((cur) => ({ ...cur, [key(chat.id)]: undefined }))}
        onVoice={(secs) => { if (secs >= 1) { set((s) => sendVoice(s, chat.id, secs, replyExtra(chat.id))); clearReply(chat.id); } }}
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
        {/* On a phone the thread takes the whole screen; on desktop it sits beside the channel. */}
        <div className="hidden min-w-0 flex-1 lg:flex lg:flex-col">{chatView}</div>
        <Thread st={st} chat={chat} postId={threadId} input={input(`t:${threadId}`)} onInput={setInput(`t:${threadId}`)} onClose={closeThread} onPerson={showProfile}
          onSend={(t) => set((s) => comment(s, threadId, t))} onVoice={(secs) => secs >= 1 && set((s) => comment(s, threadId, '', { voice: Math.round(secs) }))}
          onForward={setForwarding} onRetry={(id) => set((s) => retry(s, id))} />
      </div>
    );
  })();

  function leave(groupId: string) {
    const name = GROUPS.find((g) => g.id === groupId)?.name;
    set((s) => leaveGroup(s, groupId)); setView({ kind: 'none' });
    toast(`You left ${name}.`);
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Frame
        strip={strip}
        rail={<FolderRail viewer={st.viewer} folders={tabs} active={inArchived ? '' : activeTab} onPick={pickFolder} onMenu={() => setDrawer(true)} onProfile={() => showProfile(st.viewer)} />}
        chatOpen={view.kind !== 'none'} list={list} main={main}
      />
      {drawer && (
        <SideMenu
          viewer={st.viewer} onClose={() => setDrawer(false)}
          todayEvent={EVENTS.find((e) => e.today && visibleChats(st).some((c) => c.eventId === e.id))}
          onEvent={(eventId) => { setDrawer(false); const c = st.chats.find((x) => x.eventId === eventId); if (c) open(c.id); }}
          onProfile={() => { setDrawer(false); showProfile(st.viewer); }}
        />
      )}
      {forwarding && (
        <ForwardFlow st={st} msgId={forwarding} onClose={() => setForwarding(null)} onDone={(to, note) => {
          set((s) => forward(s, forwarding, to, note)); setForwarding(null); open(to);
          toast(`Forwarded to ${rowTitle(st, chatById(st, to)!)}`);
        }} />
      )}
      {attach && <AttachDialog st={st} onClose={() => setAttach(null)} onPick={(sh) => { setStaged((cur) => ({ ...cur, [key(attach)]: sh })); setAttach(null); }} />}
      {info && (
        <GroupInfo st={st} groupId={info} onClose={() => setInfo(null)} onLeave={() => { setInfo(null); setLeaving(info); }}
          onChannel={(id) => { setInfo(null); open(id); }}
          onMembers={() => { const c = visibleChats(st).find((x) => x.groupId === info); const g = info; setInfo(null); if (c) setView((cur) => ({ kind: 'members', chatId: c.id, groupId: g, back: cur })); }} />
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
      <Toaster />
    </TooltipProvider>
  );
}

function Frame({ strip, rail, list, main, chatOpen }: { strip: ReactNode; rail: ReactNode; list: ReactNode; main: ReactNode; chatOpen: boolean }) {
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-white" data-testid="v13-app">
      {strip}
      <div className="flex min-h-0 flex-1">
        {rail}
        <section aria-label="Chat list" data-testid="chat-list" className={cn('min-w-0 flex-col border-r lg:flex lg:w-[360px] lg:shrink-0', chatOpen ? 'hidden' : 'flex w-full')}>{list}</section>
        <main className={cn('min-w-0 flex-1 flex-col lg:flex', chatOpen ? 'flex' : 'hidden')}>{main}</main>
      </div>
    </div>
  );
}

function Strip({ viewer, onViewer, onReset, onLive }: { viewer: ViewerId; onViewer: (v: ViewerId) => void; onReset: () => void; onLive?: () => void }) {
  const lenses: { id: ViewerId; label: string }[] = [{ id: 'bob', label: 'Bob (member)' }, { id: 'dana', label: 'Dana (attendee)' }];
  return (
    <div role="region" aria-label="Prototype controls" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-gray-100 px-3 py-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">Prototype v13</span>
      <div role="radiogroup" aria-label="View as" className="inline-flex rounded-lg border bg-white p-0.5">
        {lenses.map((l) => <button key={l.id} type="button" role="radio" aria-checked={viewer === l.id} onClick={() => onViewer(l.id)} className={cn('min-h-10 rounded-md px-2 text-sm font-medium sm:px-2.5', viewer === l.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50')}>{l.label}</button>)}
      </div>
      {onLive && <button type="button" onClick={onLive} className={STRIP_BUTTON}>Next transcript line</button>}
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

/** People results open the chat straight away (Telegram): the existing one, or a new empty one. The avatar opens the profile. */
function SearchResults({ st, results, onChat, onPerson, onMessage }: { st: State; results: { chats: Chat[]; people: PersonId[] }; onChat: (id: string) => void; onPerson: (p: PersonId) => void; onMessage: (p: PersonId) => void }) {
  const row = cn('flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 text-left', HOVER);
  return (
    <div data-testid="search-results">
      {results.chats.length > 0 && <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Chats</h2>}
      <ul aria-label="Chat results">{results.chats.map((c) => <li key={c.id} className="flex"><button type="button" className={row} onClick={() => onChat(c.id)}><ChatAvatar st={st} chat={c} size="sm" /><span className="truncate text-[15px] text-gray-900">{rowTitle(st, c)}</span></button></li>)}</ul>
      {results.people.length > 0 && <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">People</h2>}
      <ul aria-label="People results">{results.people.map((p) => {
        const hasChat = st.chats.some((c) => c.kind === 'dm' && c.members!.includes(st.viewer) && c.members!.includes(p));
        return (
          <li key={p} className="flex items-center">
            <button type="button" className={row} onClick={() => onMessage(p)}>
              <Avatar person={p} size="sm" />
              <span className="min-w-0"><span className="block truncate text-[15px] text-gray-900">{PEOPLE[p].name}</span><span className="block truncate text-xs text-gray-500">{hasChat ? PEOPLE[p].role : `No chat yet · you both ${sharedWith(st.viewer, p)}`}</span></span>
            </button>
            <Tip label="View profile"><button type="button" aria-label={`View ${PEOPLE[p].name}'s profile`} onClick={() => onPerson(p)} className={cn('mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500', HOVER)}><UserIcon className="h-4 w-4" /></button></Tip>
          </li>
        );
      })}</ul>
      {results.people.length === 0 && (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" data-testid="search-no-people"><p className="text-sm text-gray-600">{COPY.emptySearch}</p><InviteLink /></div>
      )}
    </div>
  );
}

/** A 1:1's header: the person (opens their profile, role underneath), and on the right Agreement or Invite as partner. */
function DmTitle({ st, chat, onPerson }: { st: State; chat: Chat; onPerson: (p: PersonId) => void }) {
  const other = otherOf(st, chat);
  return <button type="button" onClick={() => onPerson(other)} className="flex min-h-11 min-w-0 items-center gap-2.5 text-left"><Avatar person={other} size="sm" /><span className="min-w-0"><span className="block truncate text-base font-semibold text-gray-900">{chatTitle(st, chat)}</span><span className="block truncate text-xs text-gray-500">{PEOPLE[other].role}</span></span></button>;
}

function PartnerControl({ st, chat }: { st: State; chat: Chat }) {
  if (partners(st, st.viewer, otherOf(st, chat))) return <a href={AGREEMENT_PATH} target="_blank" rel="noreferrer" className={cn(OUTLINE, 'shrink-0')} data-testid="agreement-link"><Handshake className="h-4 w-4" aria-hidden="true" />{COPY.agreement}</a>;
  return <a href={INVITE_PATH} target="_blank" rel="noreferrer" className={cn(OUTLINE, 'shrink-0')} data-testid="invite-as-partner"><Handshake className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{COPY.inviteAsPartner}</span><span className="sm:hidden">Invite</span></a>;
}

/** A channel's ⋯ menu: Members, Group page, Leave (members only). */
function ChannelMenu({ canLeave, onMembers, onLeave }: { canLeave: boolean; onMembers: () => void; onLeave: () => void }) {
  const [on, setOn] = useState(false);
  useEscape(() => setOn(false), on);
  return (
    <div className="relative shrink-0">
      <Tip label="More" side="bottom"><button type="button" aria-label="More" aria-expanded={on} onClick={() => setOn(!on)} className={cn('flex h-11 w-11 items-center justify-center rounded-full text-gray-600', HOVER)}><MoreHorizontal className="h-5 w-5" /></button></Tip>
      {on && (
        <div role="menu" className="absolute right-0 top-12 z-30 w-52 rounded-xl border bg-white p-1 shadow-xl" data-testid="channel-menu">
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => { setOn(false); onMembers(); }}><UsersIcon className="h-4 w-4 text-gray-500" />Members</button>
          <a role="menuitem" className={MENU_ITEM} href="/groups" target="_blank" rel="noreferrer" onClick={() => setOn(false)}><LandmarkIcon className="h-4 w-4 text-gray-500" />Group page</a>
          {canLeave && <button type="button" role="menuitem" className={cn(MENU_ITEM, 'text-red-700')} onClick={() => { setOn(false); onLeave(); }}><LogOut className="h-4 w-4" />Leave group</button>}
        </div>
      )}
    </div>
  );
}

function ChatView({ st, chat, input, onInput, replyTo, threadId, onBack, onPerson, onGroupInfo, onMembers, onLeave, onReply, onCancelReply, onThread, onForward, onRetry, onSend, onVoice, onAttach, staged, onUnstage }: {
  st: State; chat: Chat; input: string; onInput: (v: string) => void; replyTo?: string; threadId?: string;
  onBack: () => void; onPerson: (p: PersonId) => void; onGroupInfo: () => void; onMembers: () => void; onLeave: () => void; onReply: (m: Msg) => void; onCancelReply: () => void; onThread: (m: Msg) => void;
  onForward: (id: string) => void; onRetry: (id: string) => void; onSend: (t: string) => void; onVoice: (secs: number) => void; onAttach: () => void; staged?: Shareable; onUnstage: () => void;
}) {
  const channel = chat.kind === 'channel';
  const msgs = msgsOf(st, chat.id);
  const quoted = replyTo ? st.msgs.find((x) => x.id === replyTo) : undefined;
  const end = useRef<HTMLDivElement>(null);
  const ev = eventOf(chat);
  const group = groupOf(chat);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [msgs.length, chat.id]);
  const title = channel
    ? <button type="button" onClick={onGroupInfo} className="flex min-h-11 min-w-0 items-center gap-2.5 text-left" data-testid="channel-header"><ChannelMark chat={chat} size="sm" /><span className="min-w-0"><span className="block truncate text-base font-semibold text-gray-900">{rowTitle(st, chat, true)}</span><span className="block truncate text-xs text-gray-500">{group?.name} · {channelMembers(chat).length} members</span></span></button>
    : <DmTitle st={st} chat={chat} onPerson={onPerson} />;
  const otherFirst = channel ? '' : PEOPLE[otherOf(st, chat)].name.split(' ')[0]!;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-view" data-chat-open={chat.id}>
      <Header onBack={onBack} title={title}>
        {channel
          ? <ChannelMenu canLeave={!!group?.members.includes(st.viewer)} onMembers={onMembers} onLeave={onLeave} />
          : <PartnerControl st={st} chat={chat} />}
      </Header>
      {ev?.live && (
        <div className="flex min-h-11 shrink-0 items-center gap-2 border-b bg-red-50 px-4 text-sm text-red-800" data-testid="live-banner">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
          <span className="font-semibold">{COPY.transcribing}</span>
          <span className="min-w-0 truncate text-red-700">What you say posts here as you. At a table it goes into that table&apos;s thread.</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto bg-white py-2">
        {msgs.length === 0 && (
          <p className="px-6 py-12 text-center text-sm text-gray-500" data-testid="empty-chat">
            {channel ? 'No messages yet.' : COPY.newChat(otherFirst, sharedWith(st.viewer, otherOf(st, chat)))}
          </p>
        )}
        {msgs.length > 0 && <Divider>{dayLabel(chat)}</Divider>}
        <MessageList label="Messages" msgs={msgs} render={(m, compact) => (
          <MessageRow key={m.id} msg={m} compact={compact} highlight={m.id === threadId} replies={channel ? repliesOf(st, m.id) : undefined} liveThread={!!m.table && ev?.live}
            onPerson={onPerson} onReply={() => onReply(m)} onForward={() => onForward(m.id)} onThread={channel ? () => onThread(m) : undefined} onRetry={() => onRetry(m.id)} />
        )} />
        <div ref={end} />
      </div>
      {/* Keyed by chat: a recording or draft state never follows me into another chat. */}
      <Composer
        key={chat.id} canSendEmpty={!!staged}
        value={input} onValue={onInput} onSend={onSend} onVoice={onVoice} onAttach={onAttach}
        placeholder={channel ? `Message ${rowTitle(st, chat, true)}` : `Message ${otherFirst}`}
        quote={<>
          {quoted && <QuoteBar author={PEOPLE[quoted.who].name} text={summary(quoted)} onRemove={onCancelReply} />}
          {staged && (
            <div className="flex items-start gap-2 px-2 pt-1" data-testid="staged-share">
              <div className="min-w-0 flex-1"><ShareCard item={staged} full /></div>
              <button type="button" aria-label="Remove attachment" onClick={onUnstage} className="mt-1 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
          )}
        </>}
      />
    </div>
  );
}

/** A channel post's thread (Slack's side panel): the post, its replies, and a reply field. People only, no agent. */
function Thread({ st, chat, postId, input, onInput, onClose, onPerson, onSend, onVoice, onForward, onRetry }: {
  st: State; chat: Chat; postId: string; input: string; onInput: (v: string) => void; onClose: () => void; onPerson: (p: PersonId) => void;
  onSend: (t: string) => void; onVoice: (secs: number) => void; onForward: (id: string) => void; onRetry: (id: string) => void;
}) {
  const post = st.msgs.find((x) => x.id === postId);
  const replies = repliesOf(st, postId);
  const end = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  /* Like the chat: a new reply (mine or arriving) scrolls into view. */
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [replies.length, postId]);
  if (!post) return null;
  /* Reply inside a thread answers in the same thread: it focuses the reply field. */
  const focusComposer = () => document.getElementById('v13-thread-input')?.focus();
  return (
    <SidePanel label="Thread" onClose={onClose} title={<div className="min-w-0"><h1 className="truncate text-base font-semibold text-gray-900">{post.table ? post.text : 'Thread'}</h1><p className="truncate text-xs text-gray-500">{rowTitle(st, chat)}</p></div>}>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <ul aria-label="Post"><MessageRow msg={post} compact={false} onPerson={onPerson} onReply={focusComposer} onForward={() => onForward(post.id)} onRetry={() => onRetry(post.id)} /></ul>
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground"><span className="shrink-0">{COPY.replies(replies.length)}</span><span className="h-px flex-1 bg-gray-200" /></div>
        <MessageList label="Replies" msgs={replies} render={(c, compact) => <MessageRow key={c.id} msg={c} compact={compact} onPerson={onPerson} onReply={focusComposer} onForward={() => onForward(c.id)} onRetry={() => onRetry(c.id)} />} />
        <div ref={end} />
      </div>
      <Composer value={input} onValue={onInput} onSend={onSend} onVoice={onVoice} placeholder={COPY.replyInThread} inputId="v13-thread-input" />
    </SidePanel>
  );
}
