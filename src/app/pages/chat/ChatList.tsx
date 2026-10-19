/**
 * @file ChatList.tsx
 * @description P1512: the Home chat list — search with a "+" to invite a Clarity Partner, the
 * All / Unread / Partners / Channels tabs, the rows, and the collapsed Archived section.
 *
 * Search looks in three places at once: your own chats by title (here, no request), people you
 * share a group, event or partnership with (searchPeople), and message text (searchMessages).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, ChevronRight, MoreHorizontal, Plus, Search, X, CircleDot, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth';
import { isChatUnread, searchMessages, searchPeople, startDm, type ChatPerson, type ChatSearchHit, type ChatSummary } from '@/app/data/chat-service';
import { ChannelMark, CountBadge, FOCUS_RING, HOVER, InlineError, ListSkeleton, MirrorMark, PersonMark, type PersonLike } from './chat-kit';
import { useChat } from './chat-state';
import {
  CHAT_TABS,
  chatErrorText,
  chatPath,
  chatTitle,
  HOME,
  listTime,
  previewLine,
  searchChats,
  splitChats,
  unreadChatCount,
  type ChatTab,
} from './chat-view-model';

export const INVITE_PARTNER_PATH = '/agreements/new/create';
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_MIN_CHARS = 2;

function ChatMark({ chat, owner, active }: { chat: ChatSummary; owner: PersonLike; active: boolean }) {
  if (chat.kind === 'mirror') return <MirrorMark owner={owner} size="list" />;
  if (chat.kind === 'dm') return <PersonMark person={chat.other ?? { name: 'Deleted user' }} size="list" />;
  return <ChannelMark kind={chat.kind} size="list" onBlue={active} />;
}

// ---------------------------------------------------------------------------
// One row
// ---------------------------------------------------------------------------
function ChatRow({ chat, active, viewerId, owner, onOpen }: { chat: ChatSummary; active: boolean; viewerId: string; owner: PersonLike; onOpen: (c: ChatSummary) => void }) {
  const { setArchived, setManualUnread, markRead } = useChat();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const title = chatTitle(chat);
  const unread = isChatUnread(chat);
  const preview = previewLine(chat, viewerId);
  const when = listTime(chat.lastMessage?.createdAt);

  const leaveIfOpen = () => {
    if (active) navigate(HOME);
  };

  return (
    <li data-chat={chat.conversationId} className="group relative">
      <button
        type="button"
        onClick={() => onOpen(chat)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(true);
        }}
        aria-current={active ? 'true' : undefined}
        className={cn('flex min-h-[68px] w-full items-center gap-3 px-3 py-2 text-left', active ? 'bg-blue-600 text-white' : HOVER, FOCUS_RING, 'focus-visible:ring-inset')}
      >
        <ChatMark chat={chat} owner={owner} active={active} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn('min-w-0 flex-1 truncate text-[15px]', unread ? 'font-bold' : 'font-semibold', active ? 'text-white' : 'text-foreground')} data-testid="row-title">
              {title}
            </span>
            <span className={cn('shrink-0 text-xs', active ? 'text-blue-100' : 'text-muted-foreground')}>{when}</span>
            {/* The row menu button sits over this slot, so the time never moves when it appears. */}
            <span className="w-8 shrink-0" aria-hidden="true" />
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-sm', active ? 'text-blue-50' : unread ? 'text-foreground' : 'text-muted-foreground', chat.lastMessage?.isDeleted && 'italic')}>
              {preview.prefix && <span className={active ? 'text-white' : 'text-blue-700'}>{preview.prefix}</span>}
              {preview.text || (chat.lastMessage ? '' : 'No messages yet')}
            </span>
            {chat.unreadCount > 0 ? (
              <CountBadge n={chat.unreadCount} className={active ? 'bg-white text-blue-700' : undefined} />
            ) : chat.manualUnread ? (
              <span role="img" aria-label="Marked unread" className={cn('h-2.5 w-2.5 shrink-0 rounded-full', active ? 'bg-white' : 'bg-blue-600')} />
            ) : null}
          </span>
        </span>
      </button>
      <DropdownMenu open={menu} onOpenChange={setMenu} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${title}`}
            className={cn(
              'absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full opacity-0 transition-opacity',
              'focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:opacity-100',
              active ? 'text-white hover:bg-blue-700' : 'text-muted-foreground hover:bg-accent',
              FOCUS_RING,
            )}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            className="min-h-10"
            onSelect={() => {
              if (!chat.archived) leaveIfOpen();
              void setArchived(chat.conversationId, !chat.archived);
            }}
          >
            {chat.archived ? <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" /> : <Archive className="mr-2 h-4 w-4" aria-hidden="true" />}
            {chat.archived ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
          {unread ? (
            <DropdownMenuItem className="min-h-10" onSelect={() => void markRead(chat.conversationId, chat.lastMessage?.id)}>
              <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
              Mark as read
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="min-h-10"
              onSelect={() => {
                leaveIfOpen();
                void setManualUnread(chat.conversationId, true);
              }}
            >
              <CircleDot className="mr-2 h-4 w-4" aria-hidden="true" />
              Mark as unread
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Search results
// ---------------------------------------------------------------------------
const SECTION = 'px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

interface RemoteResults {
  status: 'idle' | 'loading' | 'ready';
  people: ChatPerson[];
  messages: ChatSearchHit[];
  /** Either request failed: say so rather than show a half-empty list as if it were complete. */
  failed: boolean;
}

/**
 * `revision` bumps when a message was edited or deleted (or the chat re-synced): the same search is
 * read again, quietly, so a hit never keeps showing words that are gone.
 */
function useRemoteSearch(query: string, revision: number): RemoteResults {
  const [state, setState] = useState<RemoteResults>({ status: 'idle', people: [], messages: [], failed: false });
  const searched = useRef('');
  useEffect(() => {
    if (query.length < SEARCH_MIN_CHARS) {
      searched.current = '';
      setState({ status: 'idle', people: [], messages: [], failed: false });
      return;
    }
    let live = true;
    const same = searched.current === query;
    searched.current = query;
    if (!same) setState((s) => ({ ...s, status: 'loading' }));
    const timer = setTimeout(() => {
      Promise.allSettled([searchPeople(query), searchMessages(query)]).then(([people, messages]) => {
        if (!live) return;
        setState({
          status: 'ready',
          people: people.status === 'fulfilled' ? people.value : [],
          messages: messages.status === 'fulfilled' ? messages.value : [],
          failed: people.status === 'rejected' || messages.status === 'rejected',
        });
      });
    }, same ? 0 : SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, revision]);
  return state;
}

function SearchResults({ query, chats, onOpen }: { query: string; chats: ChatSummary[]; onOpen: (c: ChatSummary, messageId?: string) => void }) {
  const navigate = useNavigate();
  const { refresh, revision } = useChat();
  const remote = useRemoteSearch(query, revision);
  const [starting, setStarting] = useState<string | null>(null);
  const matches = useMemo(() => searchChats(chats, query), [chats, query]);
  const byId = useMemo(() => new Map(chats.map((c) => [c.conversationId, c])), [chats]);

  const message = async (person: ChatPerson) => {
    setStarting(person.id);
    try {
      const id = await startDm(person.id);
      await refresh();
      navigate(chatPath(id));
    } catch (e) {
      toast.error(chatErrorText(e, 'Could not start this chat.'));
    } finally {
      setStarting(null);
    }
  };

  const nothing = remote.status === 'ready' && !remote.failed && matches.length === 0 && remote.people.length === 0 && remote.messages.length === 0;

  return (
    <div data-testid="search-results">
      {matches.length > 0 && (
        <>
          <h2 className={SECTION}>Chats</h2>
          <ul aria-label="Chat results">
            {matches.map((c) => (
              <li key={c.conversationId}>
                <button type="button" onClick={() => onOpen(c)} className={cn('flex min-h-14 w-full items-center gap-3 px-3 text-left', HOVER, FOCUS_RING)}>
                  <span className="shrink-0 [&>*]:!h-8 [&>*]:!w-8">
                    <MiniMark chat={c} />
                  </span>
                  <span className="min-w-0 truncate text-[15px] text-foreground">{chatTitle(c)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {remote.people.length > 0 && (
        <>
          <h2 className={SECTION}>People</h2>
          <ul aria-label="People results">
            {remote.people.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-3">
                <PersonMark person={p} size="sm" />
                <div className="min-w-0 flex-1 py-2">
                  <p className="truncate text-[15px] text-foreground">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.shared}</p>
                </div>
                <Button variant="outline" className="min-h-10 shrink-0" disabled={starting === p.id} onClick={() => void message(p)} aria-label={`Message ${p.name}`}>
                  Message
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {remote.messages.length > 0 && (
        <>
          <h2 className={SECTION}>Messages</h2>
          <ul aria-label="Message results">
            {remote.messages.map((hit) => {
              const chat = byId.get(hit.conversationId);
              if (!chat) return null;
              return (
                <li key={hit.messageId}>
                  <button type="button" onClick={() => onOpen(chat, hit.messageId)} className={cn('block min-h-14 w-full px-3 py-2 text-left', HOVER, FOCUS_RING)}>
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                        {hit.authorName ?? 'Deleted user'} · {chatTitle(chat)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{listTime(hit.createdAt)}</span>
                    </span>
                    <span className="line-clamp-2 break-words text-sm text-muted-foreground">{hit.body}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {remote.status === 'loading' && (
        <p role="status" className="px-3 py-3 text-sm text-muted-foreground">
          Searching…
        </p>
      )}
      {remote.failed && (
        <p role="alert" className="px-3 py-3 text-sm text-muted-foreground">
          Search could not finish. Check your connection and try again.
        </p>
      )}
      {nothing && (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" data-testid="search-empty">
          <p className="text-sm text-muted-foreground">No one and nothing matches “{query}”.</p>
          <Button asChild variant="outline" className="min-h-10">
            <Link to={INVITE_PARTNER_PATH}>Invite a Clarity Partner</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function MiniMark({ chat }: { chat: ChatSummary }) {
  const { user } = useAuth();
  const owner: PersonLike = { name: user?.name ?? 'You', avatarUrl: user?.avatarUrl, avatarColor: user?.avatarColor };
  if (chat.kind === 'mirror') return <MirrorMark owner={owner} size="sm" />;
  if (chat.kind === 'dm') return <PersonMark person={chat.other ?? { name: 'Deleted user' }} size="sm" />;
  return <ChannelMark kind={chat.kind} size="sm" />;
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------
export function ChatList({ activeId }: { activeId: string | null }) {
  const chat = useChat();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<ChatTab>('all');
  const [query, setQuery] = useState('');
  const [archivedOpen, setArchivedOpen] = useState(false);
  const owner: PersonLike = useMemo(
    () => ({ name: user?.name ?? 'You', avatarUrl: user?.avatarUrl, avatarColor: user?.avatarColor }),
    [user?.name, user?.avatarUrl, user?.avatarColor],
  );

  const { chats } = chat;
  const split = useMemo(() => splitChats(chats, tab), [chats, tab]);
  const unreadTotal = useMemo(() => unreadChatCount(chats), [chats]);
  const hasDm = chats.some((c) => c.kind === 'dm');
  const q = query.trim();

  const open = (c: ChatSummary, messageId?: string) => {
    setQuery('');
    navigate(chatPath(c.conversationId, { messageId }));
  };

  return (
    <section aria-label="Chats" className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="chat-list">
      <h1 className="sr-only">Home</h1>
      <div className="shrink-0 bg-background">
        <div className="flex items-center gap-2 px-3 pb-2 pt-3">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search chats and people"
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-accent">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </label>
          <Link
            to={INVITE_PARTNER_PATH}
            aria-label="Invite a Clarity Partner"
            title="Invite a Clarity Partner"
            className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-foreground', HOVER, FOCUS_RING)}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
        {!q && (
          <div role="tablist" aria-label="Folders" className="flex min-w-0 gap-0.5 overflow-x-auto border-b px-2 [scrollbar-width:none]">
            {CHAT_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-sm font-medium',
                  FOCUS_RING,
                  tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                {t.id === 'unread' && <CountBadge n={unreadTotal} className="h-[18px] min-w-[18px] px-1 text-[10px]" label={`${unreadTotal} unread chats`} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {q ? (
          <SearchResults query={q} chats={chats} onOpen={open} />
        ) : chat.status === 'loading' ? (
          <ListSkeleton />
        ) : chat.status === 'error' ? (
          <InlineError what="your chats" onRetry={() => void chat.refresh()} />
        ) : (
          <>
            <ul aria-label="Chats">
              {split.active.map((c) => (
                <ChatRow key={c.conversationId} chat={c} active={c.conversationId === activeId} viewerId={chat.userId} owner={owner} onOpen={(x) => open(x)} />
              ))}
            </ul>
            {split.active.length === 0 && (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground" data-testid="tab-empty">
                {tab === 'unread' ? 'You are all caught up.' : tab === 'partners' ? 'No chats with Clarity Partners yet.' : tab === 'channels' ? 'No channels yet.' : 'No chats yet.'}
              </p>
            )}
            {tab === 'all' && !hasDm && (
              <p className="px-6 py-4 text-center text-sm text-muted-foreground" data-testid="no-dm-hint">
                Message someone from your groups or events
              </p>
            )}
            {split.archived.length > 0 && (
              <div className="mt-2 border-t">
                <button
                  type="button"
                  aria-expanded={archivedOpen}
                  onClick={() => setArchivedOpen((o) => !o)}
                  className={cn('flex min-h-11 w-full items-center gap-1.5 px-3 text-sm font-medium text-muted-foreground', HOVER, FOCUS_RING)}
                >
                  <ChevronRight className={cn('h-4 w-4 transition-transform', archivedOpen && 'rotate-90')} aria-hidden="true" />
                  Archived ({split.archived.length})
                </button>
                {archivedOpen && (
                  <ul aria-label="Archived chats">
                    {split.archived.map((c) => (
                      <ChatRow key={c.conversationId} chat={c} active={c.conversationId === activeId} viewerId={chat.userId} owner={owner} onOpen={(x) => open(x)} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
