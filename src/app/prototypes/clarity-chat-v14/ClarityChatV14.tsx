/**
 * @file ClarityChatV14.tsx
 * @description P1509 v14 prototype at /tree/clarity-chat-v14. One collapsible sidebar (ChatGPT / WhatsApp desktop)
 * replaces v13's dark rail and drawer: Home, Chats (total unread), Groups, Letters, a foldable list of my groups,
 * and me at the foot (My profile, Settings, Tools). On a phone the same places are a bottom tab bar. Every place,
 * chat, thread, profile, group and letter is URL state (`?view=…&chat=…`), so the browser's Back works and every
 * on-screen back arrow goes back in history (falling back to a sensible parent on a deep link). Messages: Reply,
 * Forward, Thread (1:1s too), right-click for the same plus Edit/Delete on my own. The 📎 picker has separate Points
 * and Stories tabs; stories render in production's StoryCardWithLinks, points in PointCardShell. The live event's
 * transcription banner is production's presentational SessionBar + SessionStopButton; while I transcribe, a thin
 * bar follows me through the app and taps back to the event channel. Mock data only (state.ts).
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import {
  Archive, ArrowLeft, CalendarDays, ChevronDown, ChevronRight, Forward, Handshake, Hash, HomeIcon, Info, LandmarkIcon, LayoutGrid, Lock, LogOut,
  MailIcon, MessageCircle, MessagesSquare, MessageSquareText, Mic, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pause, Pencil, Play, Reply, Search,
  Settings, Trash2, UserIcon, UsersIcon, X, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { CompactProfileCard } from '@/app/components/profile/compact-profile-card';
import { SessionBar } from '@/app/components/session/session-bar';
import { SessionStopButton } from '@/app/components/session/capture-controls';
import { PointCardShell } from '@/app/components/shared/presentational/point-card-shell';
import type { Point as ProtoPoint, Story as ProtoStory } from '@/app/components/shared/prototype-types';
import { StoryCardWithLinks } from '@/app/components/social/story-card-with-links';
import { STANDARD_TOOL_ENTRIES } from '@/app/data/event-links';
import type { Profile as ProfileData } from '@/app/types';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Avatar, clock, Composer, Divider, Message, MsgText, QuoteBar, SidePanel, Tip, ToolButton, Toolbar, TOOL_ICON, useDismiss } from './kit';
import {
  AGREEMENT_PATH, COPY, EVENTS, GROUPS, LETTERS, PEOPLE, PLACE_LABEL, PLACES, SHAREABLE, SIDEBAR_KEY,
  type PersonId, type Place, type Shareable, type ViewerId,
} from './mock-data';
import {
  archive, archivedChats, archivedUnreadCount, canMessage, canSee, channelMembers, chatById, chatTitle, chatsInTab, comment, deleteMsg, dmWith, editMsg,
  eventOf, findShareable, forward, groupOf, groupPeople, groupSections, initialState, isArchived, lastMsg, leaveGroup, liveLinesLeft, membersOnly, msgsOf,
  nextLiveLine, openChat, otherOf, partners, repliesOf, retry, search, send, sendVoice, sharedWith, summary, tabsFor, totalUnread, unarchive, unreadOf,
  visibleChats, type Chat, type Msg, type State, type Tab,
} from './state';

const HOVER = '[@media(hover:hover)]:hover:bg-gray-100';
const BLUE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700';
const OUTLINE = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50';
const STRIP_BUTTON = 'inline-flex min-h-10 shrink-0 items-center rounded-md border bg-white px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50';
const MENU_ITEM = cn('flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-gray-900', HOVER);
const INVITE_PATH = '/agreements/new';
/** Production's capture-controls CONTROL_CLASS (not exported): PauseResumeButton reads the live capture context, so its look is copied. */
const CAPTURE_CONTROL = 'flex items-center gap-1.5 whitespace-nowrap text-sm font-medium rounded-md h-10 px-3 border border-blue-300 bg-white text-blue-900 hover:bg-blue-100 transition-colors';

const PLACE_ICON: Record<Place, LucideIcon> = { home: HomeIcon, chats: MessagesSquare, groups: LandmarkIcon, letters: MailIcon };

/* ---------- URL state + history-based back (v14 #2, #3) ---------- */

/** Everything a screen is, as search params. `state` (the prototype variant) is carried through every move. */
type Loc = { view?: string; chat?: string; thread?: string; members?: string; group?: string; letter?: string; person?: string; g?: string; with?: string };
const LOC_KEYS: (keyof Loc)[] = ['view', 'chat', 'thread', 'members', 'group', 'letter', 'person', 'g', 'with'];

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

const ChatAvatar = ({ st, chat, size = 'list' }: { st: State; chat: Chat; size?: 'list' | 'sm' }) => (chat.kind === 'dm' ? <Avatar person={otherOf(st, chat)} size={size} /> : <ChannelMark chat={chat} size={size} />);

const rowTitle = (st: State, c: Chat, inSection = false) =>
  c.kind === 'dm' ? chatTitle(st, c) : c.eventId ? chatTitle(st, c) : inSection ? `# ${COPY.general}` : `${groupOf(c)?.name} · # ${COPY.general}`;

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

/* ---------- shared points and stories, in production's frames (v14 #8) ---------- */

const CREATED = '2026-10-01T00:00:00.000Z';
const mockId = (p: PersonId) => `mock-${p}`;
const asProtoPoint = (id: string, storyId: string): ProtoPoint | null => {
  const p = SHAREABLE.find((x) => x.id === id && x.kind === 'point');
  return p ? { id: p.id, text: p.title, createdAt: CREATED, positions: {}, linkedStoryIds: [storyId], visibility: 'public' } : null;
};
const asProtoStory = (x: Shareable): ProtoStory => ({
  id: x.id, text: x.excerpt ? `${x.title}\n\n${x.excerpt}` : x.title, authorId: mockId(x.author), createdAt: CREATED, visibility: 'public', linkedPointIds: x.points ?? [], understoodCount: 0,
});
/** Production links (a point, the author) lead to real routes the mock items do not have: the prototype keeps the click. */
const stayInPrototype = (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('a')) return;
  e.preventDefault();
  e.stopPropagation();
  toast('This opens the real page in the app.');
};

export function ShareCard({ item, full = false }: { item: Shareable; full?: boolean }) {
  const width = full ? 'w-full' : 'max-w-md';
  if (item.kind === 'point') {
    return (
      <PointCardShell data-testid="share-point" className={cn('mt-1', width)} statement={<p className="text-[15px] font-medium leading-snug text-gray-900">{item.title}</p>}>
        <p className="mt-1 text-xs text-gray-500">Point · {PEOPLE[item.author].name}</p>
        {item.tags.length > 0 && <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-blue-700">{item.tags.map((t) => <span key={t}>#{t}</span>)}</p>}
      </PointCardShell>
    );
  }
  const a = PEOPLE[item.author];
  const linked = (item.points ?? []).map((id) => asProtoPoint(id, item.id)).filter((p): p is ProtoPoint => !!p);
  return (
    <div className={cn('mt-1', width)} data-testid="share-story" onClickCapture={stayInPrototype}>
      <StoryCardWithLinks
        story={asProtoStory(item)}
        author={{ id: mockId(item.author), name: a.name, role: a.role, hasPledged: a.pledger, avatarColor: a.avatarColor }}
        linkedPoints={linked} tags={item.tags} compact hideActions disableNavigation
        onPointClick={() => toast('This opens the point in the app.')}
      />
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

/** Hover (or a tap on a phone) shows Reply, Forward, Thread, in that order (v14 #6). Right-click opens the full menu. */
function MessageRow({ msg, own, compact, highlight, replies, onPerson, onReply, onForward, onThread, onRetry, onEdit, onDelete, liveThread }: {
  msg: Msg; own: boolean; compact: boolean; highlight?: boolean; replies?: Msg[]; liveThread?: boolean;
  onPerson: (p: PersonId) => void; onReply: () => void; onForward: () => void; onThread?: () => void; onRetry: () => void;
  onEdit: (text: string) => void; onDelete: () => void;
}) {
  const [selected, setSelected] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const li = useRef<HTMLLIElement>(null);
  useDismiss(() => setSelected(false), selected, [li]);
  const act = (f: () => void) => () => { setSelected(false); f(); };
  const editable = own && !msg.failed && !msg.voice && !msg.transcribed;
  const toolbar = msg.failed || draft !== null ? undefined : (
    <Toolbar shown={selected}>
      <ToolButton label="Reply" onClick={act(onReply)}><Reply className={TOOL_ICON} /></ToolButton>
      <ToolButton label="Forward" onClick={act(onForward)}><Forward className={TOOL_ICON} /></ToolButton>
      {onThread && <ToolButton label="Thread" onClick={act(onThread)}><MessageSquareText className={TOOL_ICON} /></ToolButton>}
    </Toolbar>
  );
  const save = () => { if (draft !== null) onEdit(draft); setDraft(null); };
  return (
    <li ref={li} data-msg={msg.id}>
      <Message person={msg.who} time={msg.time} compact={compact} highlight={highlight} selected={selected} onSelect={msg.failed ? undefined : () => setSelected((s) => !s)} onPerson={onPerson} toolbar={toolbar}
        onContextMenu={msg.failed ? undefined : (e) => { e.preventDefault(); setSelected(false); setMenu({ x: e.clientX, y: e.clientY }); }}>
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
        <ContextMenu at={menu} own={editable || (own && !msg.failed)} onClose={() => setMenu(null)} onReply={onReply} onForward={onForward} onThread={onThread}
          onEdit={() => (editable ? setDraft(msg.text) : toast('Only text can be edited.'))} onDelete={onDelete} />
      )}
    </li>
  );
}

function MessageList({ label, msgs, render }: { label: string; msgs: Msg[]; render: (m: Msg, compact: boolean) => ReactNode }) {
  return <ul aria-label={label} className="flex flex-col gap-0.5">{msgs.map((m, i) => render(m, i > 0 && msgs[i - 1]!.who === m.who && !m.fwdFrom && !m.table))}</ul>;
}

/* ---------- chat list ---------- */

function ChatRow({ st, chat, active, onOpen, onArchive, archived, inSection = false }: { st: State; chat: Chat; active: boolean; onOpen: () => void; onArchive: () => void; archived: boolean; inSection?: boolean }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const last = lastMsg(st, chat.id);
  const unread = unreadOf(st, chat.id);
  const who = last && (last.who === st.viewer ? 'You: ' : chat.kind === 'channel' ? `${PEOPLE[last.who].name.split(' ')[0]}: ` : '');
  const body = last ? summary(last) : 'No messages yet';
  const live = !!eventOf(chat)?.live;
  useDismiss(() => setMenu(false), menu, [ref]);
  return (
    <li ref={ref} data-chat={chat.id} className="relative">
      <button
        type="button"
        onClick={onOpen}
        onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
        onTouchStart={(e) => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; }}
        onTouchEnd={(e) => {
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
            {membersOnly(chat) && <Lock className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-blue-100' : 'text-gray-500')} aria-label="Members only" data-testid="members-only" />}
            {live && <span className={cn('shrink-0 rounded-full px-1.5 text-[11px] font-semibold', active ? 'bg-white text-blue-700' : 'bg-red-50 text-red-700')}>LIVE</span>}
            <span className={cn('ml-auto shrink-0 text-xs', active ? 'text-blue-100' : 'text-gray-500')}>{last?.time}</span>
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
    <div role="tablist" aria-label="Folders" className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 pr-8 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] [scrollbar-width:none]" data-testid="folder-tabs">
      {folders.map((t) => (
        <button key={t.id} ref={(el) => { if (el && t.id === active) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }} type="button" role="tab" aria-selected={t.id === active} onClick={() => onPick(t.id)} className={cn('inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium', t.id === active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900')}>
          {t.label}<Badge n={t.unread} />
        </button>
      ))}
    </div>
  );
}

/* ---------- the sidebar, the account popover, the phone tab bar (v14 #1) ---------- */

function MeMenu({ onProfile, onSettings, onTools, onClose, anchor, className }: { onProfile: () => void; onSettings: () => void; onTools: () => void; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(onClose, true, [ref, anchor]);
  const pick = (f: () => void) => () => { onClose(); f(); };
  return (
    <div ref={ref} role="menu" aria-label="My account" className={cn('z-50 w-56 rounded-xl border bg-white p-1 shadow-xl', className)} data-testid="me-menu">
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onProfile)}><UserIcon className="h-4 w-4 text-gray-500" />My profile</button>
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onSettings)}><Settings className="h-4 w-4 text-gray-500" />Settings</button>
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onTools)}><LayoutGrid className="h-4 w-4 text-gray-500" />Tools</button>
    </div>
  );
}

/** Me: the avatar (and name when there is room) that opens My profile / Settings / Tools. */
function MeButton({ viewer, showName, testId, menuClass, onProfile, onSettings, onTools }: { viewer: ViewerId; showName: boolean; testId: string; menuClass: string; onProfile: () => void; onSettings: () => void; onTools: () => void }) {
  const [on, setOn] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative">
      <button ref={btn} type="button" aria-label="My account" aria-expanded={on} onClick={() => setOn(!on)} data-testid={testId}
        className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1.5 text-left', HOVER)}>
        <Avatar person={viewer} size="sm" />
        {showName && <span className="min-w-0 truncate text-sm font-medium text-gray-900">{PEOPLE[viewer].name}</span>}
      </button>
      {on && <MeMenu anchor={btn} className={menuClass} onClose={() => setOn(false)} onProfile={onProfile} onSettings={onSettings} onTools={onTools} />}
    </div>
  );
}

function readCollapsed(): boolean {
  try { return window.localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(v: boolean) {
  try { window.localStorage.setItem(SIDEBAR_KEY, v ? '1' : '0'); } catch { /* storage blocked: the toggle still works for this visit */ }
}

function Sidebar({ st, place, activeGroup, onPlace, onGroup, me }: {
  st: State; place: Place | null; activeGroup?: string; onPlace: (p: Place) => void; onGroup: (groupId: string) => void; me: (showName: boolean) => ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const toggle = () => setCollapsed((c) => { writeCollapsed(!c); return !c; });
  const unread = totalUnread(st);
  const groups = groupSections(st);
  const item = (on: boolean) => cn('relative flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm font-medium', on ? 'bg-blue-50 text-blue-700' : cn('text-gray-800', HOVER));
  return (
    <nav aria-label="Sidebar" data-testid="sidebar" data-collapsed={collapsed || undefined}
      className={cn('hidden shrink-0 flex-col border-r bg-gray-50 p-2 md:flex', collapsed ? 'w-[64px]' : 'w-[232px]')}>
      <div className={cn('mb-1 flex items-center', collapsed ? 'justify-center' : 'justify-between pl-2')}>
        {!collapsed && <span className="text-sm font-semibold text-gray-900">Clarity</span>}
        <Tip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
          <button type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggle} data-testid="sidebar-toggle" className={cn('flex h-10 w-10 items-center justify-center rounded-lg text-gray-600', HOVER)}>
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
      {!collapsed && groups.length > 0 && (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <button type="button" aria-expanded={groupsOpen} onClick={() => setGroupsOpen(!groupsOpen)} data-testid="sidebar-groups-toggle" className={cn('flex min-h-9 w-full items-center gap-1 rounded-md px-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500', HOVER)}>
            Groups{groupsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {groupsOpen && (
            <ul aria-label="My groups" className="space-y-0.5">
              {groups.map((g) => {
                const n = g.chats.reduce((s, c) => s + unreadOf(st, c.id), 0);
                return (
                  <li key={g.groupId}>
                    <button type="button" onClick={() => onGroup(g.groupId)} aria-current={activeGroup === g.groupId ? 'true' : undefined} className={cn(item(activeGroup === g.groupId), 'min-h-10 font-normal')}>
                      <LandmarkIcon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{g.name}</span>
                      <Badge n={n} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {(collapsed || groups.length === 0) && <div className="flex-1" />}
      <div className="border-t pt-2">{me(!collapsed)}</div>
    </nav>
  );
}

function BottomTabs({ st, place, onPlace }: { st: State; place: Place | null; onPlace: (p: Place) => void }) {
  const unread = totalUnread(st);
  return (
    <nav aria-label="Places" data-testid="bottom-tabs" className="flex shrink-0 border-t bg-white md:hidden">
      {PLACES.map((p) => {
        const Icon = PLACE_ICON[p];
        return (
          <button key={p} type="button" onClick={() => onPlace(p)} aria-current={place === p ? 'page' : undefined} className={cn('relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', place === p ? 'text-blue-700' : 'text-gray-600')}>
            <span className="relative"><Icon className="h-6 w-6" aria-hidden="true" />{p === 'chats' && <Badge n={unread} className="absolute -right-3 -top-1.5 ring-2 ring-white" />}</span>
            {PLACE_LABEL[p]}
          </button>
        );
      })}
    </nav>
  );
}

/* ---------- live transcription: production's SessionBar (v14 #9) ---------- */

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

/** WhatsApp's in-call bar: while I transcribe and am anywhere else, a thin bar at the top of the main area taps back. */
function AwayBar({ name, paused, onOpen }: { name: string; paused: boolean; onOpen: () => void }) {
  return (
    <div data-testid="away-bar" className="shrink-0 [&>div]:py-1">
      {/* The whole line is the tap target (the text is a button), and Open says it in words. */}
      <SessionBar tone="live" ariaLabel="Transcribing elsewhere" showDot={!paused}
        text={<button type="button" onClick={onOpen} className="text-left hover:underline" data-testid="away-bar-text">{paused ? 'Paused' : 'Transcribing'} · {name}</button>}
        primary={{ label: 'Open', onClick: onOpen, testId: 'away-bar-open' }} />
    </div>
  );
}

/* ---------- pages: profile, members, group, letters, home, tools, settings ---------- */

const asProfile = (id: PersonId): ProfileData => {
  const p = PEOPLE[id];
  return { id: `mock-${id}`, slug: p.slug, name: p.name, email: p.email, role: p.role, bio: p.bio, avatarColor: p.avatarColor, hasPledged: p.pledger, signedAt: '', isVerified: true, witnesses: [], reciprocations: 0 };
};

function Profile({ st, person, onBack, onMessage }: { st: State; person: PersonId; onBack: () => void; onMessage: () => void }) {
  const self = person === st.viewer;
  const shared = [...GROUPS.filter((g) => g.members.includes(st.viewer) && g.members.includes(person)).map((g) => g.name), ...EVENTS.filter((e) => e.attendees.includes(st.viewer) && e.attendees.includes(person)).map((e) => e.name)];
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="profile">
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
    <div className="flex h-full min-h-0 flex-col" data-testid="members">
      <Header backAlways onBack={onBack} title={<PageTitle>{list.length} members</PageTitle>} />
      <ul className="overflow-y-auto py-2">{list.map((p) => <PersonRow key={p} p={p} onPerson={onPerson} />)}</ul>
    </div>
  );
}

function GroupsPage({ st, onGroup }: { st: State; onGroup: (id: string) => void }) {
  const groups = groupSections(st);
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="groups-page">
      <Header title={<PageTitle>Groups</PageTitle>} />
      <ul aria-label="Groups" className="min-h-0 flex-1 overflow-y-auto py-2">
        {groups.map((g) => (
          <li key={g.groupId}><button type="button" onClick={() => onGroup(g.groupId)} className={cn('flex min-h-16 w-full items-center gap-3 px-4 text-left', HOVER)}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white"><LandmarkIcon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-gray-900">{g.name}</span><span className="block text-xs text-gray-500">{groupPeople(g.groupId).length} members · {g.chats.length} channels</span></span>
            <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
          </button></li>
        ))}
        {groups.length === 0 && <li className="px-6 py-12 text-center text-sm text-gray-500">You are not in any group yet.</li>}
      </ul>
    </div>
  );
}

function GroupPage({ st, groupId, onBack, onChannel, onPerson, onLeave }: { st: State; groupId: string; onBack: () => void; onChannel: (id: string) => void; onPerson: (p: PersonId) => void; onLeave: () => void }) {
  const g = GROUPS.find((x) => x.id === groupId);
  const chans = groupSections(st).find((x) => x.groupId === groupId)?.chats ?? [];
  if (!g) return null;
  const people = groupPeople(groupId);
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="group-page">
      <Header backAlways onBack={onBack} title={<PageTitle>{g.name}</PageTitle>}>
        {g.members.includes(st.viewer) && <button type="button" onClick={onLeave} className={cn(OUTLINE, 'text-red-700')}><LogOut className="h-4 w-4" />Leave</button>}
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 pb-4">
        <h2 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">{COPY.channels}</h2>
        <ul aria-label={`${g.name} channels`} className="mx-4 overflow-hidden rounded-xl border bg-white">
          {chans.map((c) => <li key={c.id}><button type="button" onClick={() => onChannel(c.id)} className={cn('flex min-h-12 w-full items-center gap-3 px-3 text-left', HOVER)}><ChannelMark chat={c} size="sm" /><span className="min-w-0 flex-1 truncate text-sm text-gray-900">{rowTitle(st, c, true)}</span>{membersOnly(c) && <Lock className="h-3.5 w-3.5 text-gray-500" aria-label="Members only" />}</button></li>)}
        </ul>
        <h2 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-500" data-testid="members">{people.length} members</h2>
        <ul aria-label="Members" className="mx-4 overflow-hidden rounded-xl border bg-white">{people.map((p) => <PersonRow key={p} p={p} onPerson={onPerson} />)}</ul>
      </div>
    </div>
  );
}

function LettersPage({ onLetter }: { onLetter: (id: string) => void }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="letters-page">
      <Header title={<PageTitle>Letters</PageTitle>} />
      <ul aria-label="Letters" className="min-h-0 flex-1 overflow-y-auto py-2">
        {LETTERS.map((l) => (
          <li key={l.id}><button type="button" onClick={() => onLetter(l.id)} className={cn('flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left', HOVER)}>
            <Avatar person={l.author} size="sm" />
            <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-gray-900">{l.title}</span><span className="block text-xs text-gray-500">{PEOPLE[l.author].name} · {l.date}</span></span>
          </button></li>
        ))}
      </ul>
    </div>
  );
}

function LetterView({ st, letterId, onBack, onChat }: { st: State; letterId: string; onBack: () => void; onChat: (p: PersonId) => void }) {
  const l = LETTERS.find((x) => x.id === letterId);
  if (!l) return null;
  const first = PEOPLE[l.author].name.split(' ')[0]!;
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="letter-view">
      <Header backAlways onBack={onBack} title={<PageTitle>Letter</PageTitle>} />
      <article className="mx-auto w-full max-w-2xl overflow-y-auto px-4 py-6">
        <h2 className="text-xl font-semibold text-gray-900">{l.title}</h2>
        <p className="mt-1 flex items-center gap-2 text-sm text-gray-500"><Avatar person={l.author} size="xs" />{PEOPLE[l.author].name} · {l.date}</p>
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-gray-800">{l.body}</p>
        {canMessage(st.viewer, l.author) && <button type="button" onClick={() => onChat(l.author)} className={cn(OUTLINE, 'mt-6')} data-testid="letter-chat"><MessageCircle className="h-4 w-4" />Open chat with {first}</button>}
      </article>
    </div>
  );
}

function HomePage({ st, onChats, onEvent }: { st: State; onChats: () => void; onEvent: (chatId: string) => void }) {
  const today = EVENTS.find((e) => e.today && visibleChats(st).some((c) => c.eventId === e.id));
  const n = totalUnread(st);
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="home-page">
      <Header title={<PageTitle>Home</PageTitle>} />
      <div className="mx-auto w-full max-w-2xl space-y-3 overflow-y-auto px-4 py-6">
        <p className="text-lg font-semibold text-gray-900">Hi {PEOPLE[st.viewer].name.split(' ')[0]}</p>
        {today && (
          <button type="button" onClick={() => onEvent(`ch-${today.id}`)} className="flex w-full items-center gap-3 rounded-xl border bg-white p-4 text-left hover:bg-gray-50">
            <CalendarDays className="h-6 w-6 text-blue-600" aria-hidden="true" />
            <span className="min-w-0"><span className="block text-xs text-gray-500">Today&apos;s event · live</span><span className="block truncate font-semibold text-gray-900">{today.name}</span></span>
          </button>
        )}
        <button type="button" onClick={onChats} className="flex w-full items-center gap-3 rounded-xl border bg-white p-4 text-left hover:bg-gray-50">
          <MessagesSquare className="h-6 w-6 text-gray-500" aria-hidden="true" />
          <span className="flex-1 font-medium text-gray-900">{n > 0 ? `${n} unread messages` : 'No unread messages'}</span>
        </button>
        <p className="text-sm text-gray-500">Stand-in for production&apos;s home feed.</p>
      </div>
    </div>
  );
}

/** Tools: production's Tools menu entries (event-links.ts, the list the room's Tools button opens), each a link out. */
function ToolsPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="tools-page">
      <Header backAlways onBack={onBack} title={<PageTitle><span className="inline-flex items-center gap-2"><LayoutGrid className="h-4 w-4" aria-hidden="true" />Tools</span></PageTitle>} />
      <ul aria-label="Tools" className="mx-auto w-full max-w-xl space-y-2 overflow-y-auto px-4 py-4">
        {STANDARD_TOOL_ENTRIES.map((t) => (
          <li key={t.to}><a href={t.to} target="_blank" rel="noreferrer" className={cn('flex min-h-11 items-center gap-3 rounded-lg border px-4 text-sm font-medium', t.featured ? 'border-blue-300 bg-blue-50 text-blue-700' : 'bg-white text-gray-900 hover:bg-gray-50')}><LayoutGrid className="h-4 w-4 shrink-0" aria-hidden="true" />{t.label}</a></li>
        ))}
      </ul>
    </div>
  );
}

function SettingsPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="settings-page">
      <Header backAlways onBack={onBack} title={<PageTitle>Settings</PageTitle>} />
      <p className="px-4 py-6 text-sm text-gray-600">Stand-in: production&apos;s settings, unchanged. <a href="/settings" target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">Open settings</a></p>
    </div>
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

/** 📎 (v14 #8): two tabs, Points and Stories, never one mixed list. Each item shows in its production card with Attach beside it. */
function AttachDialog({ st, onPick, onClose }: { st: State; onPick: (s: Shareable) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'point' | 'story'>('point');
  const items = findShareable(st, q, kind);
  return (
    <Sheet wide label="Attach a point or story" onClose={onClose} title="Attach a point or story">
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
            <button type="button" onClick={() => onPick(s)} aria-label={`Attach ${s.title}`} className={cn(OUTLINE, 'self-end')}>Attach</button>
          </li>
        ))}
        {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-gray-500">{kind === 'point' ? 'No points match.' : 'No stories match.'} Try fewer words or another #tag.</li>}
      </ul>
    </Sheet>
  );
}

function GroupInfo({ st, groupId, onClose, onPage, onLeave, onChannel }: { st: State; groupId: string; onClose: () => void; onPage: () => void; onLeave: () => void; onChannel: (id: string) => void }) {
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

const InviteLink = ({ className }: { className?: string }) => (
  <a href={INVITE_PATH} target="_blank" rel="noreferrer" className={className ?? BLUE} data-testid="invite-link"><Handshake className="h-4 w-4" aria-hidden="true" />{COPY.invite}</a>
);

/* ---------- the prototype ---------- */

export function ClarityChatV14() {
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
  const placeGo = (p: Place) => { if (p === 'chats') { setShowArchived(false); } go({ view: p }); };

  const archivedEmpty = archivedChats(st).length === 0;
  useEffect(() => { if (showArchived && archivedEmpty) setShowArchived(false); }, [showArchived, archivedEmpty]);

  const chatParam = view === 'chats' ? loc.chat : undefined;
  const openChatObj = chatParam ? visibleChats(st).find((c) => c.id === chatParam) : undefined;
  const liveChat = openChatObj && eventOf(openChatObj)?.live && canSee(st.viewer, openChatObj) ? openChatObj.id : null;
  const strip = (
    <Strip viewer={st.viewer} onViewer={switchViewer} onReset={() => reset()}
      onLive={liveChat && liveLinesLeft(st, liveChat) > 0 ? () => set((s) => openChat(nextLiveLine(s, liveChat), liveChat)) : undefined} />
  );
  const meButton = (testId: string, menuClass: string) => (showName: boolean) => (
    <MeButton viewer={st.viewer} showName={showName} testId={testId} menuClass={menuClass}
      onProfile={() => showProfile(st.viewer)} onSettings={() => go({ view: 'settings' })} onTools={() => go({ view: 'tools' })} />
  );

  const tabs = tabsFor(st);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'all';
  const inArchived = showArchived && archivedChats(st).length > 0;
  const groupFilter = view === 'chats' ? loc.g : undefined;
  const rows = inArchived ? archivedChats(st) : chatsInTab(st, activeTab);
  const results = q.trim() ? search(st, q) : null;
  const archivedCount = archivedChats(st).length;
  const archivedUnread = archivedUnreadCount(st);
  const pickFolder = (t: Tab) => { setTab(t); setShowArchived(false); if (groupFilter) go({ view: 'chats' }, true); };
  const toggleArchive = (c: Chat) => set((s) => (isArchived(s, c.id) ? unarchive(s, c.id) : archive(s, c.id)));
  const row = (c: Chat, inSection = false) => <ChatRow key={c.id} st={st} chat={c} active={c.id === chatParam} archived={inArchived} inSection={inSection} onOpen={() => { setQ(''); open(c.id); }} onArchive={() => toggleArchive(c)} />;
  const sections = groupSections(st).filter((g) => !groupFilter || g.groupId === groupFilter);
  const showSections = !inArchived && (activeTab === 'groups' || !!groupFilter);

  const list = (
    <>
      <header className="flex shrink-0 items-center gap-1 px-2 pb-2 pt-2 lg:px-3">
        <div className="shrink-0 md:hidden">{meButton('list-me', 'absolute left-0 top-12')(false)}</div>
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-gray-100 px-3 text-gray-500">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={COPY.search} aria-label="Search" className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none md:text-sm" />
          {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="flex h-8 w-8 items-center justify-center"><X className="h-4 w-4" /></button>}
        </label>
      </header>
      {!results && !inArchived && <FolderTabs folders={tabs} active={groupFilter ? 'groups' : activeTab} onPick={pickFolder} />}
      {inArchived && (
        <div className="flex min-h-12 shrink-0 items-center gap-1 border-b px-2"><button type="button" aria-label="Back to chats" onClick={() => setShowArchived(false)} className={cn('flex h-11 w-11 items-center justify-center rounded-full', HOVER)}><ArrowLeft className="h-5 w-5" /></button><h2 className="font-semibold text-gray-900">{COPY.archived}</h2></div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {results ? (
          <SearchResults st={st} results={results} onChat={(id) => { setQ(''); open(id); }} onPerson={showProfile} onMessage={message} />
        ) : st.chats.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" data-testid="empty-list"><p className="text-[15px] text-gray-700">{COPY.emptyList}</p><InviteLink /></div>
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
              <li className="flex flex-col items-center gap-3 px-6 py-12 text-center" data-testid="empty-partners"><Handshake className="h-8 w-8 text-gray-400" aria-hidden="true" /><p className="text-sm text-gray-600">{COPY.noPartners}</p><InviteLink /></li>
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
        onGroupPage={() => chat.groupId && go({ view: 'groups', group: chat.groupId })}
        onLeave={() => setLeaving(chat.groupId!)}
        onReply={(m) => setReplyTo((cur) => ({ ...cur, [key(chat.id)]: m.id }))}
        onCancelReply={() => clearReply(chat.id)}
        onThread={(m) => openThread(m.id)}
        onForward={setForwarding} onRetry={(id) => set((s) => retry(s, id))}
        onEdit={(id, t) => set((s) => editMsg(s, id, t))} onDelete={setDeleting}
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
        <div className="hidden min-w-0 flex-1 lg:flex lg:flex-col">{chatView}</div>
        <Thread st={st} chat={chat} postId={threadId} input={input(`t:${threadId}`)} onInput={setInput(`t:${threadId}`)} onClose={closeThread} onPerson={showProfile}
          onSend={(t) => set((s) => comment(s, threadId, t))} onVoice={(secs) => secs >= 1 && set((s) => comment(s, threadId, '', { voice: Math.round(secs) }))}
          onForward={setForwarding} onRetry={(id) => set((s) => retry(s, id))} onEdit={(id, t) => set((s) => editMsg(s, id, t))} onDelete={setDeleting} />
      </div>
    );
  })();

  const detailOpen = (view === 'chats' && (!!chatParam || !!loc.with)) || !!loc.letter || !!loc.group || view === 'profile';
  const content = (() => {
    if (view === 'profile' && loc.person && PEOPLE[loc.person as PersonId]) {
      const person = loc.person as PersonId;
      return <Profile st={st} person={person} onBack={() => back({ view: 'chats' })} onMessage={() => message(person)} />;
    }
    if (view === 'home') return <HomePage st={st} onChats={() => go({ view: 'chats' })} onEvent={open} />;
    if (view === 'tools') return <ToolsPage onBack={() => back({ view: 'chats' })} />;
    if (view === 'settings') return <SettingsPage onBack={() => back({ view: 'chats' })} />;
    if (view === 'letters') {
      return loc.letter
        ? <LetterView st={st} letterId={loc.letter} onBack={() => back({ view: 'letters' })} onChat={message} />
        : <LettersPage onLetter={(id) => go({ view: 'letters', letter: id })} />;
    }
    if (view === 'groups') {
      return loc.group
        ? <GroupPage st={st} groupId={loc.group} onBack={() => back({ view: 'groups' })} onChannel={open} onPerson={showProfile} onLeave={() => setLeaving(loc.group!)} />
        : <GroupsPage st={st} onGroup={(id) => go({ view: 'groups', group: id })} />;
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
    ? <AwayBar name={eventOf(captureChat)?.name ?? chatTitle(st, captureChat)} paused={capture.paused} onOpen={() => open(capture.chatId)} />
    : null;

  function leave(groupId: string) {
    const name = GROUPS.find((g) => g.id === groupId)?.name;
    set((s) => leaveGroup(s, groupId));
    if (capture && chatById(st, capture.chatId)?.groupId === groupId && !EVENTS.find((e) => `ch-${e.id}` === capture.chatId)?.attendees.includes(st.viewer)) setCapture(null);
    go({ view: 'chats' }, true);
    toast(`You left ${name}.`);
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-white" data-testid="v14-app">
        {strip}
        <div className="flex min-h-0 flex-1">
          <Sidebar st={st} place={place} activeGroup={groupFilter} onPlace={placeGo} onGroup={(g) => go({ view: 'chats', g })} me={meButton('sidebar-me', 'absolute bottom-12 left-0')} />
          <div className="flex min-w-0 flex-1 flex-col">
            {away}
            <div className="flex min-h-0 flex-1" data-testid="main-area" data-view={view}>{content}</div>
            {!detailOpen && <BottomTabs st={st} place={place} onPlace={placeGo} />}
          </div>
        </div>
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
          onChannel={(id) => { setInfo(null); open(id); }} onPage={() => { const g = info; setInfo(null); go({ view: 'groups', group: g }); }} />
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
    </TooltipProvider>
  );
}

function Strip({ viewer, onViewer, onReset, onLive }: { viewer: ViewerId; onViewer: (v: ViewerId) => void; onReset: () => void; onLive?: () => void }) {
  const lenses: { id: ViewerId; label: string }[] = [{ id: 'bob', label: 'Bob (member)' }, { id: 'dana', label: 'Dana (attendee)' }];
  return (
    <div role="region" aria-label="Prototype controls" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-gray-100 px-3 py-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">Prototype v14</span>
      <div role="radiogroup" aria-label="View as" className="inline-flex rounded-lg border bg-white p-0.5">
        {lenses.map((l) => <button key={l.id} type="button" role="radio" aria-checked={viewer === l.id} onClick={() => onViewer(l.id)} className={cn('min-h-10 rounded-md px-2 text-sm font-medium sm:px-2.5', viewer === l.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50')}>{l.label}</button>)}
      </div>
      {onLive && <button type="button" onClick={onLive} className={STRIP_BUTTON}>Next transcript line</button>}
      <button type="button" onClick={onReset} className={STRIP_BUTTON}>Reset</button>
    </div>
  );
}

/** People results: the 1:1 straight away (existing or new). People I share nothing with show too (v14 #11) and open their "No chat yet" state. */
function SearchResults({ st, results, onChat, onPerson, onMessage }: { st: State; results: { chats: Chat[]; people: PersonId[]; others: PersonId[] }; onChat: (id: string) => void; onPerson: (p: PersonId) => void; onMessage: (p: PersonId) => void }) {
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
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" data-testid="search-no-people"><p className="text-sm text-gray-600">No one matches.</p><InviteLink /></div>
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
        <p className="text-sm text-gray-600">{can ? COPY.newChat(first, sharedWith(st.viewer, person)) : `No chat yet with ${first}. You can message ${first} once you share a group or event.`}</p>
        {can ? <button type="button" onClick={onMessage} className={BLUE}>{COPY.message}</button> : <button type="button" onClick={() => onPerson(person)} className={OUTLINE}>View profile</button>}
      </div>
    </div>
  );
}

/** A 1:1's header: the person (opens their profile), a small "Partner" tag that opens the agreement (v14 #7). */
function DmTitle({ st, chat, onPerson }: { st: State; chat: Chat; onPerson: (p: PersonId) => void }) {
  const other = otherOf(st, chat);
  const partner = partners(st, st.viewer, other);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button type="button" onClick={() => onPerson(other)} className="flex min-h-11 min-w-0 items-center gap-2.5 text-left"><Avatar person={other} size="sm" /><span className="min-w-0"><span className="block truncate text-base font-semibold text-gray-900">{chatTitle(st, chat)}</span><span className="block truncate text-xs text-gray-500">{PEOPLE[other].role}</span></span></button>
      {partner && (
        <Tip label="Open your agreement" side="bottom">
          <a href={AGREEMENT_PATH} target="_blank" rel="noreferrer" data-testid="partner-tag" className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"><Handshake className="h-3 w-3" aria-hidden="true" />{COPY.partner}</a>
        </Tip>
      )}
    </div>
  );
}

function ChannelMenu({ canLeave, onMembers, onGroupPage, onLeave }: { canLeave: boolean; onMembers: () => void; onGroupPage: () => void; onLeave: () => void }) {
  const [on, setOn] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(() => setOn(false), on, [ref]);
  const pick = (f: () => void) => () => { setOn(false); f(); };
  return (
    <div ref={ref} className="relative shrink-0">
      <Tip label="More" side="bottom"><button type="button" aria-label="More" aria-expanded={on} onClick={() => setOn(!on)} className={cn('flex h-11 w-11 items-center justify-center rounded-full text-gray-600', HOVER)}><MoreHorizontal className="h-5 w-5" /></button></Tip>
      {on && (
        <div role="menu" className="absolute right-0 top-12 z-30 w-52 rounded-xl border bg-white p-1 shadow-xl" data-testid="channel-menu">
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onMembers)}><UsersIcon className="h-4 w-4 text-gray-500" />Members</button>
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={pick(onGroupPage)}><LandmarkIcon className="h-4 w-4 text-gray-500" />Group page</button>
          {canLeave && <button type="button" role="menuitem" className={cn(MENU_ITEM, 'text-red-700')} onClick={pick(onLeave)}><LogOut className="h-4 w-4" />Leave group</button>}
        </div>
      )}
    </div>
  );
}

function ChatView({ st, chat, input, onInput, replyTo, threadId, banner, onBack, onPerson, onGroupInfo, onMembers, onGroupPage, onLeave, onReply, onCancelReply, onThread, onForward, onRetry, onEdit, onDelete, onSend, onVoice, onAttach, staged, onUnstage }: {
  st: State; chat: Chat; input: string; onInput: (v: string) => void; replyTo?: string; threadId?: string; banner?: ReactNode;
  onBack: () => void; onPerson: (p: PersonId) => void; onGroupInfo: () => void; onMembers: () => void; onGroupPage: () => void; onLeave: () => void; onReply: (m: Msg) => void; onCancelReply: () => void; onThread: (m: Msg) => void;
  onForward: (id: string) => void; onRetry: (id: string) => void; onEdit: (id: string, text: string) => void; onDelete: (id: string) => void;
  onSend: (t: string) => void; onVoice: (secs: number) => void; onAttach: () => void; staged?: Shareable; onUnstage: () => void;
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
  const showInvite = !channel && !partners(st, st.viewer, otherOf(st, chat));
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-view" data-chat-open={chat.id}>
      <Header onBack={onBack} title={title}>
        {channel && <ChannelMenu canLeave={!!group?.members.includes(st.viewer)} onMembers={onMembers} onGroupPage={onGroupPage} onLeave={onLeave} />}
        {showInvite && <a href={INVITE_PATH} target="_blank" rel="noreferrer" className={cn(OUTLINE, 'shrink-0')} data-testid="invite-as-partner"><Handshake className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{COPY.inviteAsPartner}</span><span className="sm:hidden">Invite</span></a>}
      </Header>
      {banner}
      <div className="min-h-0 flex-1 overflow-y-auto bg-white py-2">
        {msgs.length === 0 && (
          <p className="px-6 py-12 text-center text-sm text-gray-500" data-testid="empty-chat">
            {channel ? 'No messages yet.' : COPY.newChat(otherFirst, sharedWith(st.viewer, otherOf(st, chat)))}
          </p>
        )}
        {msgs.length > 0 && <Divider>{dayLabel(chat)}</Divider>}
        <MessageList label="Messages" msgs={msgs} render={(m, compact) => (
          <MessageRow key={m.id} msg={m} own={m.who === st.viewer} compact={compact} highlight={m.id === threadId} replies={repliesOf(st, m.id)} liveThread={!!m.table && ev?.live}
            onPerson={onPerson} onReply={() => onReply(m)} onForward={() => onForward(m.id)} onThread={m.failed ? undefined : () => onThread(m)} onRetry={() => onRetry(m.id)}
            onEdit={(t) => onEdit(m.id, t)} onDelete={() => onDelete(m.id)} />
        )} />
        <div ref={end} />
      </div>
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

/** A post's thread (Slack's side panel), in a channel or a 1:1 (v14 #6). People only, no agent. */
function Thread({ st, chat, postId, input, onInput, onClose, onPerson, onSend, onVoice, onForward, onRetry, onEdit, onDelete }: {
  st: State; chat: Chat; postId: string; input: string; onInput: (v: string) => void; onClose: () => void; onPerson: (p: PersonId) => void;
  onSend: (t: string) => void; onVoice: (secs: number) => void; onForward: (id: string) => void; onRetry: (id: string) => void;
  onEdit: (id: string, text: string) => void; onDelete: (id: string) => void;
}) {
  const post = st.msgs.find((x) => x.id === postId);
  const replies = repliesOf(st, postId);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [replies.length, postId]);
  if (!post) return null;
  const focusComposer = () => document.getElementById('v14-thread-input')?.focus();
  const rowOf = (x: Msg, compact: boolean) => (
    <MessageRow key={x.id} msg={x} own={x.who === st.viewer} compact={compact} onPerson={onPerson} onReply={focusComposer} onForward={() => onForward(x.id)} onRetry={() => onRetry(x.id)}
      onEdit={(t) => onEdit(x.id, t)} onDelete={() => onDelete(x.id)} />
  );
  return (
    <SidePanel label="Thread" onClose={onClose} title={<div className="min-w-0"><h1 className="truncate text-base font-semibold text-gray-900">{post.table ? post.text : 'Thread'}</h1><p className="truncate text-xs text-gray-500">{rowTitle(st, chat)}</p></div>}>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <ul aria-label="Post">{rowOf(post, false)}</ul>
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground"><span className="shrink-0">{COPY.replies(replies.length)}</span><span className="h-px flex-1 bg-gray-200" /></div>
        <MessageList label="Replies" msgs={replies} render={rowOf} />
        <div ref={end} />
      </div>
      <Composer value={input} onValue={onInput} onSend={onSend} onVoice={onVoice} placeholder={COPY.replyInThread} inputId="v14-thread-input" />
    </SidePanel>
  );
}
