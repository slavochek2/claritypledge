/**
 * @file ClarityChatV12.tsx
 * @description P1509 v12 prototype at /tree/clarity-chat: chats as the logged-in home. Telegram frame (one
 * column on a phone, list + open chat on desktop), ☰ side menu, folder tabs (All, Unread, one per group),
 * event channels with comment threads, 1:1 chats, Reply/Forward, archive, scoped search and the messaging
 * rule. Mock data only (state.ts): no network, nothing persisted, Reset starts over. Self-contained on
 * purpose: v11 (P1503) stays the vision sketch and is not imported.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, ArrowLeft, FileText, Forward, Link2, Menu, MessageSquare, MoreHorizontal, Reply, Search, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { COPY, EVENTS, GROUPS, MENU_PAGES, PEOPLE, SHAREABLE, type PersonId, type ViewerId } from './mock-data';
import {
  archive, archivedChats, canMessage, channelMembers, chatById, chatTitle, chatsInTab, comment, dmWith, forward, initialState, isArchived,
  lastMsg, mockIncoming, msgsOf, openChat, otherOf, retry, search, send, tabsFor, unarchive, unreadOf, visibleChats,
  type Chat, type Msg, type State, type Tab,
} from './state';

const HOVER = '[@media(hover:hover)]:hover:bg-gray-100';
const BLUE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700';
const STRIP_BUTTON = 'inline-flex min-h-10 shrink-0 items-center rounded-md border bg-white px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50';

/** What the main column shows. On a phone, anything but `none` replaces the list. */
type View =
  | { kind: 'none' }
  | { kind: 'chat'; chatId: string }
  | { kind: 'comments'; chatId: string; postId: string }
  | { kind: 'members'; chatId: string }
  | { kind: 'profile'; person: PersonId; back: View }
  | { kind: 'invite' };

/* ---------- small pieces ---------- */

const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function Avatar({ person, size = 'md' }: { person: PersonId; size?: 'sm' | 'md' | 'lg' }) {
  const p = PEOPLE[person];
  const cls = size === 'lg' ? 'h-20 w-20 text-2xl' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm';
  return <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-800', cls)}>{initials(p.name)}</span>;
}

const ChannelMark = () => <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg font-semibold text-blue-700">#</span>;

function PersonLink({ person, onOpen, className }: { person: PersonId; onOpen: (p: PersonId) => void; className?: string }) {
  return <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(person); }} className={cn('font-semibold underline-offset-2 hover:underline', className)}>{PEOPLE[person].name}</button>;
}

function Header({ onBack, title, children }: { onBack?: () => void; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-2 border-b px-2 lg:px-4">
      {onBack && <button type="button" aria-label="Back" onClick={onBack} className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full lg:hidden', HOVER)}><ArrowLeft className="h-5 w-5" /></button>}
      <div className="min-w-0 flex-1">{title}</div>
      {children}
    </header>
  );
}

function Composer({ value, onChange, onSend, placeholder, before, above, inputId }: { value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string; before?: ReactNode; above?: ReactNode; inputId?: string }) {
  return (
    <div className="shrink-0 border-t bg-white">
      {above}
      <form className="flex items-center gap-1 p-2" onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSend(); }}>
        {before}
        <input id={inputId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="min-h-11 min-w-0 flex-1 rounded-full bg-gray-100 px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:text-sm" />
        <button type="submit" aria-label="Send" disabled={!value.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-blue-600 disabled:text-gray-300"><Send className="h-5 w-5" /></button>
      </form>
    </div>
  );
}

/** The transcript placeholder (P1500 lands here): collapsed to its first lines, "Show all" expands. */
function TranscriptBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="transcript-post">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900"><FileText className="h-4 w-4" aria-hidden="true" />{COPY.transcript}</div>
      <p className={cn('whitespace-pre-line text-sm text-gray-700', !open && 'line-clamp-3')}>{text}</p>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="mt-1 min-h-8 text-sm font-medium text-blue-700">{open ? 'Show less' : 'Show all'}</button>
    </div>
  );
}

/* ---------- one message ---------- */

function MessageRow({ msg, mine, inChannel, comments, onPerson, onReply, onForward, onComments, onRetry }: {
  msg: Msg; mine: boolean; inChannel: boolean; comments?: number;
  onPerson: (p: PersonId) => void; onReply: () => void; onForward: () => void; onComments?: () => void; onRetry: () => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <li className={cn('group flex gap-2 px-3 py-1', mine && !inChannel && 'flex-row-reverse')} data-msg={msg.id}>
      {(!mine || inChannel) && <button type="button" aria-label={`Open ${PEOPLE[msg.who].name}`} onClick={() => onPerson(msg.who)} className="mt-1 shrink-0 self-start"><Avatar person={msg.who} size="sm" /></button>}
      <div className={cn('flex min-w-0 max-w-[85%] flex-col sm:max-w-[75%]', mine && !inChannel && 'items-end')}>
        <DropdownMenu open={menu} onOpenChange={setMenu} modal={false}>
          <DropdownMenuTrigger asChild>
            <div role="button" tabIndex={0} aria-label="Message" className={cn('cursor-pointer rounded-2xl px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500', mine ? 'bg-blue-50' : 'bg-gray-100')}>
              {inChannel && <PersonLink person={msg.who} onOpen={onPerson} className="block text-sm text-blue-800" />}
              {msg.fwdFrom && <div className="text-xs text-gray-600" data-testid="forwarded-label">{COPY.forwardedFrom} <PersonLink person={msg.fwdFrom} onOpen={onPerson} className="text-blue-700" /></div>}
              {msg.quote && <div className="my-1 border-l-2 border-blue-500 pl-2 text-xs text-gray-600" data-testid="reply-quote"><span className="font-semibold text-blue-800">{PEOPLE[msg.quote.who].name}</span><span className="block truncate">{msg.quote.text}</span></div>}
              {msg.transcript ? <TranscriptBody text={msg.text} /> : msg.text && <p className="whitespace-pre-line break-words text-[15px] text-gray-900">{msg.text}</p>}
              {msg.share && (
                <div className="mt-1 flex items-center gap-2 rounded-lg border bg-white px-3 py-2" data-testid="share-card">
                  <Link2 className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                  <span className="min-w-0"><span className="block text-xs text-gray-500">{msg.share.kind === 'point' ? 'Point' : 'Story'}</span><span className="block text-sm font-medium text-gray-900">{msg.share.title}</span></span>
                </div>
              )}
              <span className="mt-0.5 block text-right text-[11px] text-gray-500">{msg.time}</span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={mine && !inChannel ? 'end' : 'start'} onCloseAutoFocus={(e) => e.preventDefault()}>
            <DropdownMenuItem className="min-h-10" onSelect={onReply}><Reply className="mr-2 h-4 w-4" />Reply</DropdownMenuItem>
            <DropdownMenuItem className="min-h-10" onSelect={onForward}><Forward className="mr-2 h-4 w-4" />Forward</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {msg.failed && (
          <div className="mt-1 flex items-center gap-2 text-xs text-red-700" data-testid="send-failed">
            {COPY.notSent}
            <button type="button" onClick={onRetry} className="min-h-8 rounded-md px-2 font-semibold text-blue-700 hover:bg-blue-50">{COPY.retry}</button>
          </div>
        )}
        {inChannel && onComments && (
          <button type="button" onClick={onComments} className="mt-0.5 flex min-h-8 items-center gap-1 self-start rounded-md px-1 text-xs font-medium text-blue-700 hover:bg-blue-50">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />{comments ? `${comments} comment${comments === 1 ? '' : 's'}` : 'Comment'}
          </button>
        )}
      </div>
      {/* The same menu on hover: a pointer that can hover gets the "⋯" beside the message. */}
      <button type="button" aria-label="Message actions" onClick={() => setMenu(true)} className="mt-auto hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 opacity-0 hover:bg-gray-100 focus:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:flex">
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </li>
  );
}

/* ---------- chat list ---------- */

function ChatRow({ st, chat, active, onOpen, onArchive, archived }: { st: State; chat: Chat; active: boolean; onOpen: () => void; onArchive: () => void; archived: boolean }) {
  const [menu, setMenu] = useState(false);
  const touch = useRef<number | null>(null);
  const last = lastMsg(st, chat.id);
  const unread = unreadOf(st, chat.id);
  const who = last && (last.who === st.viewer ? 'You: ' : chat.kind === 'channel' ? `${PEOPLE[last.who].name.split(' ')[0]}: ` : '');
  const body = last ? (last.transcript ? COPY.transcript : last.share ? last.share.title : last.text) : 'No messages yet';
  return (
    <li data-chat={chat.id} className="relative">
      <button
        type="button"
        onClick={onOpen}
        onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
        onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => { const x = e.changedTouches[0]?.clientX; if (touch.current !== null && x !== undefined && touch.current - x > 60) onArchive(); touch.current = null; }}
        aria-current={active ? 'true' : undefined}
        className={cn('flex min-h-[64px] w-full items-center gap-3 px-3 py-2 text-left', active ? 'bg-blue-50' : HOVER)}
      >
        {chat.kind === 'dm' ? <Avatar person={otherOf(st, chat)} /> : <ChannelMark />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-gray-900">{chatTitle(st, chat)}</span>
            <span className="ml-auto shrink-0 text-xs text-gray-500">{last?.time}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-gray-600">{who}{body}</span>
            {unread > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white" aria-label={`${unread} unread`}>{unread}</span>}
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
        <li key={i} className="flex items-center gap-3 px-3 py-3"><span className="h-11 w-11 rounded-full bg-gray-200" /><span className="flex-1 space-y-2"><span className="block h-3 w-1/2 rounded bg-gray-200" /><span className="block h-3 w-3/4 rounded bg-gray-100" /></span></li>
      ))}
    </ul>
  );
}

/* ---------- side menu ---------- */

function SideMenu({ viewer, onClose, onEvent, onInvite, onProfile }: { viewer: ViewerId; onClose: () => void; onEvent: (eventId: string) => void; onInvite: () => void; onProfile: () => void }) {
  const today = EVENTS.find((e) => e.today);
  const item = cn('flex min-h-12 w-full items-center px-4 text-left text-[15px] text-gray-900', HOVER);
  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-label="Menu">
      <nav className="flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl">
        <div className="flex min-h-14 items-center justify-between border-b px-4"><span className="font-semibold text-gray-900">Clarity</span><button type="button" aria-label="Close menu" onClick={onClose} className={cn('flex h-11 w-11 items-center justify-center rounded-full', HOVER)}><X className="h-5 w-5" /></button></div>
        <ul aria-label="Menu items" className="flex-1 overflow-y-auto py-2">
          {MENU_PAGES.map((p) => (
            <li key={p.label}>
              {p.path
                ? <a href={p.path} target="_blank" rel="noreferrer" className={item} data-path={p.path}>{p.label}</a>
                : <button type="button" className={item} onClick={() => toast('Tools opens production’s links menu, unchanged.')}>{p.label}</button>}
            </li>
          ))}
          {today && <li><button type="button" className={cn(item, 'flex-col items-start justify-center')} onClick={() => onEvent(today.id)}><span className="text-xs text-gray-500">Today&apos;s event</span><span>{today.name}</span></button></li>}
          <li><button type="button" className={cn(item, 'font-medium text-blue-700')} onClick={onInvite}>{COPY.invite}</button></li>
        </ul>
        <button type="button" onClick={onProfile} className={cn('flex min-h-16 items-center gap-3 border-t px-4 text-left', HOVER)} data-testid="menu-profile">
          <Avatar person={viewer} size="sm" /><span className="min-w-0"><span className="block truncate font-medium text-gray-900">{PEOPLE[viewer].name}</span><span className="text-xs text-gray-500">My profile</span></span>
        </button>
      </nav>
      <button type="button" aria-label="Close menu backdrop" onClick={onClose} className="flex-1 bg-black/30" />
    </div>
  );
}

/* ---------- panels in the main column ---------- */

function Profile({ st, person, onBack, onMessage }: { st: State; person: PersonId; onBack: () => void; onMessage: () => void }) {
  const p = PEOPLE[person];
  const self = person === st.viewer;
  const shared = [...GROUPS.filter((g) => g.members.includes(st.viewer) && g.members.includes(person)).map((g) => g.name), ...EVENTS.filter((e) => e.attendees.includes(st.viewer) && e.attendees.includes(person)).map((e) => e.name)];
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="profile">
      <Header onBack={onBack} title={<h1 className="truncate text-base font-semibold text-gray-900">Profile</h1>} />
      <div className="flex flex-col items-center gap-3 overflow-y-auto px-4 py-8 text-center">
        <Avatar person={person} size="lg" />
        <h2 className="text-xl font-semibold text-gray-900">{p.name}</h2>
        <p className="text-sm text-gray-500">@{p.nickname}</p>
        <p className="max-w-sm text-[15px] text-gray-700">{p.bio}</p>
        {!self && canMessage(st.viewer, person) && <button type="button" onClick={onMessage} className={BLUE}><MessageSquare className="h-4 w-4" />{COPY.message}</button>}
        {!self && shared.length > 0 && <p className="text-xs text-gray-500">You share: {shared.join(', ')}</p>}
        {!self && shared.length === 0 && <p className="text-xs text-gray-500">You share no group or event.</p>}
      </div>
    </div>
  );
}

function Members({ chat, onBack, onPerson }: { chat: Chat; onBack: () => void; onPerson: (p: PersonId) => void }) {
  const list = channelMembers(chat);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="members">
      <Header onBack={onBack} title={<h1 className="truncate text-base font-semibold text-gray-900">{list.length} members</h1>} />
      <ul className="overflow-y-auto py-2">
        {list.map((p) => <li key={p}><button type="button" onClick={() => onPerson(p)} className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-left', HOVER)}><Avatar person={p} size="sm" /><span className="text-[15px] text-gray-900">{PEOPLE[p].name}</span></button></li>)}
      </ul>
    </div>
  );
}

function Invite({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="invite">
      <Header onBack={onBack} title={<h1 className="truncate text-base font-semibold text-gray-900">{COPY.invite}</h1>} />
      <div className="mx-auto flex max-w-md flex-col gap-3 px-4 py-8 text-[15px] text-gray-700">
        <p>To message someone you share no group or event with, invite them as a partner. This opens the existing new-partner flow, unchanged.</p>
        <a href="/me" target="_blank" rel="noreferrer" className={BLUE}>Open the new-partner flow</a>
      </div>
    </div>
  );
}

function ForwardPicker({ st, onPick, onClose }: { st: State; onPick: (chatId: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" role="dialog" aria-label="Forward to">
      <div className="flex max-h-[80vh] w-full flex-col rounded-t-2xl bg-white sm:max-w-sm sm:rounded-2xl">
        <div className="flex min-h-14 items-center justify-between border-b px-4"><h2 className="font-semibold text-gray-900">Forward to</h2><button type="button" aria-label="Close" onClick={onClose} className={cn('flex h-11 w-11 items-center justify-center rounded-full', HOVER)}><X className="h-5 w-5" /></button></div>
        <ul className="overflow-y-auto py-2">
          {visibleChats(st).map((c) => (
            <li key={c.id}><button type="button" onClick={() => onPick(c.id)} className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-left', HOVER)}>{c.kind === 'dm' ? <Avatar person={otherOf(st, c)} size="sm" /> : <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 font-semibold text-blue-700">#</span>}<span className="truncate text-[15px] text-gray-900">{chatTitle(st, c)}</span></button></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------- the prototype ---------- */

export function ClarityChatV12() {
  const [params] = useSearchParams();
  const mode = params.get('state');
  const fresh = (viewer: ViewerId = 'bob') => initialState({ viewer, empty: mode === 'empty', fail: mode === 'fail' });
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

  if (mode === 'loading') {
    return (
      <Frame strip={<Strip viewer={st.viewer} onViewer={switchViewer} onReset={() => reset()} />} chatOpen={false} list={<><ListTop onMenu={() => undefined} q="" onQ={() => undefined} /><Skeleton /></>} main={<div className="hidden h-full animate-pulse flex-col gap-3 p-6 lg:flex" data-testid="chat-skeleton"><div className="h-6 w-1/3 rounded bg-gray-200" /><div className="h-16 w-2/3 rounded-2xl bg-gray-100" /><div className="h-16 w-1/2 self-end rounded-2xl bg-gray-100" /></div>} />
    );
  }

  const tabs = tabsFor(st);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'all';
  const rows = showArchived ? archivedChats(st) : chatsInTab(st, activeTab);
  const results = q.trim() ? search(st, q) : null;
  const archivedCount = archivedChats(st).length;
  const openChatId = view.kind === 'chat' || view.kind === 'comments' || view.kind === 'members' ? view.chatId : null;

  const toggleArchive = (c: Chat) => set((s) => (isArchived(s, c.id) ? unarchive(s, c.id) : archive(s, c.id)));

  const list = (
    <>
      <ListTop onMenu={() => setDrawer(true)} q={q} onQ={setQ} />
      {!results && !showArchived && (
        <div role="tablist" aria-label="Folders" className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 pr-8 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none]">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === activeTab} onClick={() => setTab(t.id)} className={cn('inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium', t.id === activeTab ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900')}>
              {t.label}{t.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white" aria-label={`${t.unread} unread`}>{t.unread}</span>}
            </button>
          ))}
        </div>
      )}
      {showArchived && (
        <div className="flex min-h-12 shrink-0 items-center gap-1 border-b px-2"><button type="button" aria-label="Back to chats" onClick={() => setShowArchived(false)} className={cn('flex h-11 w-11 items-center justify-center rounded-full', HOVER)}><ArrowLeft className="h-5 w-5" /></button><h2 className="font-semibold text-gray-900">{COPY.archived}</h2></div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {results ? (
          <SearchResults st={st} results={results} onChat={(id) => { setQ(''); open(id); }} onPerson={showProfile} onInvite={() => { setQ(''); setView({ kind: 'invite' }); }} />
        ) : st.chats.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" data-testid="empty-list"><p className="text-[15px] text-gray-700">{COPY.emptyList}</p><button type="button" className={BLUE} onClick={() => setView({ kind: 'invite' })}>{COPY.invite}</button></div>
        ) : (
          <ul aria-label="Chats" data-testid="chat-rows" className="pb-4">
            {!showArchived && activeTab === 'all' && archivedCount > 0 && (
              <li><button type="button" onClick={() => setShowArchived(true)} className={cn('flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm font-medium text-gray-700', HOVER)}><span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100"><Archive className="h-4 w-4" aria-hidden="true" /></span><span className="flex-1">{COPY.archived}</span><span className="text-xs text-gray-500">{archivedCount}</span></button></li>
            )}
            {rows.map((c) => <ChatRow key={c.id} st={st} chat={c} active={c.id === openChatId} archived={showArchived} onOpen={() => open(c.id)} onArchive={() => toggleArchive(c)} />)}
            {rows.length === 0 && !showArchived && activeTab !== 'all' && activeTab !== 'unread' && <li className="px-6 py-12 text-center text-sm text-gray-500" data-testid="empty-group">{COPY.emptyGroup}</li>}
            {rows.length === 0 && activeTab === 'unread' && !showArchived && <li className="px-6 py-12 text-center text-sm text-gray-500">No unread chats.</li>}
          </ul>
        )}
      </div>
    </>
  );

  const main = (() => {
    if (view.kind === 'profile') return <Profile st={st} person={view.person} onBack={() => setView(view.back)} onMessage={() => message(view.person)} />;
    if (view.kind === 'invite') return <Invite onBack={() => setView({ kind: 'none' })} />;
    const chat = openChatId ? chatById(st, openChatId) : undefined;
    if (!chat) return <div className="hidden h-full items-center justify-center bg-gray-50 lg:flex" data-testid="empty-main"><span className="rounded-full bg-white px-3 py-1 text-sm text-gray-500 shadow-sm">{COPY.selectChat}</span></div>;
    if (view.kind === 'members') return <Members chat={chat} onBack={() => setView({ kind: 'chat', chatId: chat.id })} onPerson={showProfile} />;
    if (view.kind === 'comments') return <Comments st={st} chat={chat} postId={view.postId} input={input(`c:${view.postId}`)} onInput={setInput(`c:${view.postId}`)} onBack={() => setView({ kind: 'chat', chatId: chat.id })} onPerson={showProfile} onSend={(t) => { set((s) => comment(s, view.postId, t)); setInput(`c:${view.postId}`)(''); }} onForward={setForwarding} onRetry={(id) => set((s) => retry(s, id))} />;
    return (
      <ChatView
        st={st} chat={chat} input={input(chat.id)} onInput={setInput(chat.id)} replyTo={replyTo[key(chat.id)]} picker={picker} onPicker={setPicker}
        onBack={() => setView({ kind: 'none' })} onPerson={showProfile} onMembers={() => setView({ kind: 'members', chatId: chat.id })}
        onReply={(m) => (chat.kind === 'channel' ? setView({ kind: 'comments', chatId: chat.id, postId: m.id }) : setReplyTo((cur) => ({ ...cur, [key(chat.id)]: m.id })))}
        onCancelReply={() => setReplyTo((cur) => ({ ...cur, [key(chat.id)]: undefined }))}
        onComments={(m) => setView({ kind: 'comments', chatId: chat.id, postId: m.id })}
        onForward={setForwarding} onRetry={(id) => set((s) => retry(s, id))}
        onSend={(text) => {
          const q2 = replyTo[key(chat.id)] ? st.msgs.find((x) => x.id === replyTo[key(chat.id)]) : undefined;
          set((s) => send(s, chat.id, text, q2 ? { quote: { who: q2.who, text: q2.transcript ? COPY.transcript : q2.text || q2.share?.title || '' } } : {}));
          setInput(chat.id)(''); setReplyTo((cur) => ({ ...cur, [key(chat.id)]: undefined }));
        }}
        onShare={(sh) => { set((s) => send(s, chat.id, '', { share: sh })); setPicker(false); }}
      />
    );
  })();

  return (
    <>
      <Frame strip={<Strip viewer={st.viewer} onViewer={switchViewer} onReset={() => reset()} onMock={() => { const r = mockIncoming(st); if (r) { setSt(r.next); toast(`New message in ${chatTitle(r.next, chatById(r.next, r.chatId)!)}`); } }} />} chatOpen={view.kind !== 'none'} list={list} main={main} />
      {drawer && (
        <SideMenu
          viewer={st.viewer} onClose={() => setDrawer(false)}
          onEvent={(eventId) => { setDrawer(false); const c = st.chats.find((x) => x.eventId === eventId); if (c) open(c.id); }}
          onInvite={() => { setDrawer(false); setView({ kind: 'invite' }); }}
          onProfile={() => { setDrawer(false); showProfile(st.viewer); }}
        />
      )}
      {forwarding && <ForwardPicker st={st} onClose={() => setForwarding(null)} onPick={(to) => { set((s) => forward(s, forwarding, to)); setForwarding(null); toast(`Forwarded to ${chatTitle(st, chatById(st, to)!)}`); }} />}
      <Toaster />
    </>
  );
}

function Frame({ strip, list, main, chatOpen }: { strip: ReactNode; list: ReactNode; main: ReactNode; chatOpen: boolean }) {
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-white" data-testid="v12-app">
      {strip}
      <div className="flex min-h-0 flex-1">
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

function ListTop({ onMenu, q, onQ }: { onMenu: () => void; q: string; onQ: (v: string) => void }) {
  return (
    <header className="flex shrink-0 items-center gap-1 px-2 pb-2 pt-2">
      <button type="button" aria-label="Open menu" onClick={onMenu} className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700', HOVER)}><Menu className="h-5 w-5" /></button>
      <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-gray-100 px-3 text-gray-500">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input value={q} onChange={(e) => onQ(e.target.value)} placeholder={COPY.search} aria-label="Search" className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none md:text-sm" />
        {q && <button type="button" aria-label="Clear search" onClick={() => onQ('')} className="flex h-8 w-8 items-center justify-center"><X className="h-4 w-4" /></button>}
      </label>
    </header>
  );
}

function SearchResults({ st, results, onChat, onPerson, onInvite }: { st: State; results: { chats: Chat[]; people: PersonId[] }; onChat: (id: string) => void; onPerson: (p: PersonId) => void; onInvite: () => void }) {
  const row = cn('flex min-h-14 w-full items-center gap-3 px-3 text-left', HOVER);
  return (
    <div data-testid="search-results">
      {results.chats.length > 0 && <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Chats</h2>}
      <ul aria-label="Chat results">{results.chats.map((c) => <li key={c.id}><button type="button" className={row} onClick={() => onChat(c.id)}>{c.kind === 'dm' ? <Avatar person={otherOf(st, c)} size="sm" /> : <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 font-semibold text-blue-700">#</span>}<span className="truncate text-[15px] text-gray-900">{chatTitle(st, c)}</span></button></li>)}</ul>
      {results.people.length > 0 && <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">People</h2>}
      <ul aria-label="People results">{results.people.map((p) => <li key={p}><button type="button" className={row} onClick={() => onPerson(p)}><Avatar person={p} size="sm" /><span className="min-w-0"><span className="block truncate text-[15px] text-gray-900">{PEOPLE[p].name}</span><span className="text-xs text-gray-500">@{PEOPLE[p].nickname}</span></span></button></li>)}</ul>
      {results.people.length === 0 && (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" data-testid="search-no-people"><p className="text-sm text-gray-600">{COPY.emptySearch}</p><button type="button" className={BLUE} onClick={onInvite}>{COPY.invite}</button></div>
      )}
    </div>
  );
}

function ChatView({ st, chat, input, onInput, replyTo, picker, onPicker, onBack, onPerson, onMembers, onReply, onCancelReply, onComments, onForward, onRetry, onSend, onShare }: {
  st: State; chat: Chat; input: string; onInput: (v: string) => void; replyTo?: string; picker: boolean; onPicker: (v: boolean) => void;
  onBack: () => void; onPerson: (p: PersonId) => void; onMembers: () => void; onReply: (m: Msg) => void; onCancelReply: () => void; onComments: (m: Msg) => void;
  onForward: (id: string) => void; onRetry: (id: string) => void; onSend: (t: string) => void; onShare: (s: (typeof SHAREABLE)['bob'][number]) => void;
}) {
  const channel = chat.kind === 'channel';
  const msgs = msgsOf(st, chat.id);
  const quoted = replyTo ? st.msgs.find((x) => x.id === replyTo) : undefined;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [msgs.length, chat.id]);
  const title = channel
    ? <button type="button" onClick={onMembers} className="flex min-h-11 min-w-0 flex-col items-start text-left" data-testid="channel-header"><span className="truncate text-base font-semibold text-gray-900">#&nbsp;{chatTitle(st, chat)}</span><span className="text-xs text-gray-500">{channelMembers(chat).length} members</span></button>
    : <button type="button" onClick={() => onPerson(otherOf(st, chat))} className="flex min-h-11 min-w-0 items-center gap-2 text-left"><Avatar person={otherOf(st, chat)} size="sm" /><span className="truncate text-base font-semibold text-gray-900">{chatTitle(st, chat)}</span></button>;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-view" data-chat-open={chat.id}>
      <Header onBack={onBack} title={title} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-white py-2">
        {msgs.length === 0 && <p className="px-6 py-12 text-center text-sm text-gray-500">No messages yet. Say hello.</p>}
        <ul aria-label="Messages">
          {msgs.map((m) => (
            <MessageRow key={m.id} msg={m} mine={m.who === st.viewer} inChannel={channel} comments={(st.comments[m.id] ?? []).length}
              onPerson={onPerson} onReply={() => onReply(m)} onForward={() => onForward(m.id)} onComments={channel ? () => onComments(m) : undefined} onRetry={() => onRetry(m.id)} />
          ))}
        </ul>
        <div ref={end} />
      </div>
      {picker && channel && (
        <div className="shrink-0 border-t bg-gray-50" role="dialog" aria-label="Post a point or story">
          <div className="flex min-h-11 items-center justify-between px-3"><span className="text-sm font-semibold text-gray-900">Post one of yours</span><button type="button" aria-label="Close picker" onClick={() => onPicker(false)} className={cn('flex h-10 w-10 items-center justify-center rounded-full', HOVER)}><X className="h-4 w-4" /></button></div>
          <ul className="pb-2">{SHAREABLE[st.viewer].map((s) => <li key={s.id}><button type="button" onClick={() => onShare(s)} className={cn('flex min-h-12 w-full items-center gap-3 px-3 text-left', HOVER)}><span className="w-12 shrink-0 text-xs text-gray-500">{s.kind === 'point' ? 'Point' : 'Story'}</span><span className="text-sm text-gray-900">{s.title}</span></button></li>)}</ul>
        </div>
      )}
      <Composer
        value={input} onChange={onInput} onSend={() => onSend(input.trim())} placeholder={channel ? 'Post to the channel' : 'Message'}
        before={channel ? <button type="button" aria-label="Post a point or story" aria-expanded={picker} onClick={() => onPicker(!picker)} className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600', HOVER)}><Link2 className="h-5 w-5" /></button> : undefined}
        above={quoted && (
          <div className="flex items-center gap-2 border-b px-3 py-2" data-testid="reply-bar">
            <Reply className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
            <div className="min-w-0 flex-1 border-l-2 border-blue-500 pl-2 text-xs"><span className="font-semibold text-blue-800">{PEOPLE[quoted.who].name}</span><span className="block truncate text-gray-600">{quoted.transcript ? COPY.transcript : quoted.text || quoted.share?.title}</span></div>
            <button type="button" aria-label="Cancel reply" onClick={onCancelReply} className={cn('flex h-10 w-10 items-center justify-center rounded-full', HOVER)}><X className="h-4 w-4" /></button>
          </div>
        )}
      />
    </div>
  );
}

function Comments({ st, chat, postId, input, onInput, onBack, onPerson, onSend, onForward, onRetry }: {
  st: State; chat: Chat; postId: string; input: string; onInput: (v: string) => void; onBack: () => void; onPerson: (p: PersonId) => void; onSend: (t: string) => void; onForward: (id: string) => void; onRetry: (id: string) => void;
}) {
  const post = st.msgs.find((x) => x.id === postId);
  const list = useMemo(() => st.comments[postId] ?? [], [st.comments, postId]);
  if (!post) return null;
  /* Reply inside a comment thread answers in the same thread: it focuses the comment field. */
  const focusComposer = () => document.getElementById('v12-comment-input')?.focus();
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="comments">
      <Header onBack={onBack} title={<div className="min-w-0"><h1 className="truncate text-base font-semibold text-gray-900">Comments</h1><p className="truncate text-xs text-gray-500"># {chatTitle(st, chat)}</p></div>}>
        <button type="button" onClick={onBack} className="hidden min-h-10 rounded-md px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 lg:inline-flex lg:items-center">Back to channel</button>
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <ul aria-label="Post"><MessageRow msg={post} mine={post.who === st.viewer} inChannel onPerson={onPerson} onReply={focusComposer} onForward={() => onForward(post.id)} onRetry={() => onRetry(post.id)} /></ul>
        <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{list.length} comment{list.length === 1 ? '' : 's'}</p>
        <ul aria-label="Comments list">{list.map((c) => <MessageRow key={c.id} msg={c} mine={c.who === st.viewer} inChannel onPerson={onPerson} onReply={focusComposer} onForward={() => onForward(c.id)} onRetry={() => onRetry(c.id)} />)}</ul>
      </div>
      <Composer value={input} onChange={onInput} onSend={() => onSend(input.trim())} placeholder="Comment" inputId="v12-comment-input" />
    </div>
  );
}
