/**
 * P1545 Phase 1, Variant B: "Card grid". Dev-only, mock data, no services.
 * Visual cards in a responsive grid; the letter's primary action sits on the card, the rest behind "...".
 */
import { useMemo, useState } from 'react';
import {
  CalendarDays,
  FileText,
  Globe,
  Home,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Shapes,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { LabState } from './ArtifactsLab';
import {
  CHATS_UNREAD,
  CM_CARD,
  LETTER_ACTIONS,
  MOCK_EVENTS,
  SHARED,
  SHARE_MESSAGES,
  TABS,
  YOURS,
  type MockArtifact,
} from './mock';

type Tab = 'yours' | 'shared';
type NavId = (typeof TABS)[number];

const NAV_ICONS: Record<Exclude<NavId, 'You'>, typeof Home> = {
  Home,
  Chats: MessageCircle,
  Events: CalendarDays,
  Artifacts: Shapes,
};

function Badge({ n }: { n: number }) {
  return (
    <span
      data-badge
      className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 text-[10px] font-bold leading-4 text-white bg-blue-600 rounded-full text-center"
    >
      {n}
    </span>
  );
}

function YouDisc() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
      S
    </span>
  );
}

/** Desktop (lg+) top horizontal nav. */
function TopNav({ active }: { active: NavId }) {
  return (
    <header className="hidden lg:block border-b border-border bg-background">
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-6">
        <span className="mr-6 text-sm font-semibold text-foreground">Clarity Pledge</span>
        {TABS.filter(t => t !== 'You').map(t => {
          const Icon = NAV_ICONS[t as Exclude<NavId, 'You'>];
          const on = t === active;
          return (
            <button
              key={t}
              type="button"
              aria-current={on ? 'page' : undefined}
              className={`relative flex h-10 items-center gap-2 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                on ? 'font-semibold text-blue-600' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className={`relative flex ${t === 'Chats' ? 'mr-3' : ''}`}>
                <Icon className={`h-4 w-4 ${on ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
                {t === 'Chats' && <Badge n={CHATS_UNREAD} />}
              </span>
              {t}
            </button>
          );
        })}
        <button
          type="button"
          className="ml-auto flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <YouDisc />
          You
        </button>
      </nav>
    </header>
  );
}

/** Phone (<lg) fixed bottom tab bar, styled after bottom-nav.tsx. */
function BottomTabs({ active }: { active: NavId }) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border shadow-sheet pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center justify-around h-16">
        {TABS.map(t => {
          const on = t === active;
          return (
            <button
              key={t}
              type="button"
              aria-current={on ? 'page' : undefined}
              aria-label={t === 'Chats' ? `Chats, ${CHATS_UNREAD} unread` : undefined}
              className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                on ? 'text-blue-600' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="relative flex">
                {t === 'You' ? (
                  <YouDisc />
                ) : (
                  (() => {
                    const Icon = NAV_ICONS[t];
                    return <Icon className={`w-5 h-5 ${on ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />;
                  })()
                )}
                {t === 'Chats' && <Badge n={CHATS_UNREAD} />}
              </span>
              <span className={`text-xs leading-none ${on ? 'font-semibold' : 'font-normal'}`}>{t}</span>
              <div className={`w-1 h-1 rounded-full mt-0.5 ${on ? 'bg-blue-600' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function CreateMenu({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="New artifact"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuItem className="min-h-10 gap-2">
          <FileText className="h-4 w-4" /> Letter
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-10 gap-2">
          <Shapes className="h-4 w-4" /> Canvas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ArtifactCard({ a }: { a: MockArtifact }) {
  const isLetter = a.kind === 'letter';
  const shared = !!a.sharedBy;
  const actions = isLetter ? (a.draft ? LETTER_ACTIONS.draft : LETTER_ACTIONS.sent) : null;
  // Menu: safe items first, one destructive item last (red, below a separator). Shared items are only opened.
  let safe: string[];
  let danger: string;
  if (shared) {
    safe = ['Open'];
    danger = 'Remove from my list';
  } else if (actions) {
    safe = [actions.primary, ...actions.more.filter(m => m !== 'Delete')];
    danger = 'Delete';
  } else {
    safe = ['Share'];
    danger = 'Delete';
  }
  const Visibility = a.visibility === 'public' ? Globe : Lock;
  const KindIcon = isLetter ? FileText : Shapes;
  const inChat = shared && SHARE_MESSAGES.some(m => m.title === a.title);
  const letterState = shared
    ? a.unread
      ? 'Unread'
      : 'Opened'
    : a.draft
      ? 'Draft'
      : a.replies
        ? `${a.replies.done} of ${a.replies.total} replied`
        : 'Sent';

  return (
    <li className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 pt-4 pb-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={`Open ${a.title}`}
      >
        <span className="flex min-w-0 items-start gap-2">
          <KindIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="line-clamp-2 min-w-0 flex-1 text-base font-semibold leading-snug text-foreground">{a.title}</span>
          {a.unread && (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600">
              <span className="sr-only">Unread</span>
            </span>
          )}
        </span>
        <span className="pl-6 text-xs text-muted-foreground">
          {[a.sharedBy ? `Shared by ${a.sharedBy}` : '', inChat ? 'in your chat' : '', a.updated]
            .filter(Boolean)
            .join(' \u00b7 ')}
        </span>
      </button>

      <div className="mt-auto flex min-h-10 items-center justify-between border-t border-border pl-4 pr-1">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {isLetter ? (
            letterState
          ) : (
            <>
              <Visibility
                className="h-3.5 w-3.5 shrink-0"
                role="img"
                aria-label={a.visibility === 'public' ? 'Public' : 'Private'}
              />
            </>
          )}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More actions for ${a.title}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[10rem]">
            {safe.map(m => (
              <DropdownMenuItem key={m} className="min-h-10">
                {m}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-10 text-red-600 focus:text-red-600">{danger}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/** Decision 5: only shares posted TO the user, as a chat bubble with an embedded artifact chip. */
const SHARE_WITH_YOU = SHARE_MESSAGES.find(m => SHARED.some(s => s.title === m.title));

function ChatShare() {
  if (!SHARE_WITH_YOU) return null;
  const m = SHARE_WITH_YOU;
  return (
    <div className="min-w-0">
      <p className="mb-1 truncate text-xs text-muted-foreground">{m.chat}</p>
      <div className="max-w-full rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-slate-900">
        <p>{m.text}</p>
        <button
          type="button"
          className="mt-2 flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-left text-sm text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Shapes className="h-4 w-4 shrink-0" />
          <span className="truncate">{m.title}</span>
        </button>
      </div>
    </div>
  );
}

function ArtifactsPage({ state }: { state: LabState }) {
  const [tab, setTab] = useState<Tab>(state === 'empty-shared' || state === 'shared' ? 'shared' : 'yours');
  const [searchOpen, setSearchOpen] = useState(state === 'search-open');
  const [query, setQuery] = useState(state === 'search-open' ? 'hike' : '');

  const q = query.trim().toLowerCase();
  const items = useMemo(() => {
    if (q) {
      return [...YOURS, ...SHARED].filter(a => a.title.toLowerCase().includes(q) || (a.sharedBy ?? '').toLowerCase().includes(q));
    }
    if (tab === 'yours') return state === 'empty-yours' ? [] : YOURS;
    return state === 'empty-shared' ? [] : SHARED;
  }, [q, state, tab]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  const unreadShared = (state === 'empty-shared' ? [] : SHARED).filter(a => a.unread).length;
  const showSidePanel = state === 'shared' && tab === 'shared' && !q && !!SHARE_WITH_YOU;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 lg:px-6 lg:pb-12 lg:pt-8">
      <div className="flex h-11 items-center gap-2">
        {searchOpen ? (
          <>
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search artifacts"
                aria-label="Search artifacts"
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Close search"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" />
            </button>
          </>
        ) : (
          <>
            <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">Artifacts</h1>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Search className="h-5 w-5" />
            </button>
            <CreateMenu defaultOpen={state === 'menu-open'} />
          </>
        )}
      </div>

      {!q && (
        <div role="tablist" aria-label="Artifacts" className="mt-3 flex border-b border-border">
          {(
            [
              ['yours', 'Yours'],
              ['shared', 'Shared with you'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-label={id === 'shared' && unreadShared > 0 ? `${label}, ${unreadShared} unread` : label}
              onClick={() => setTab(id)}
              className={`-mb-px flex min-h-11 items-center gap-1 whitespace-nowrap border-b-2 px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                tab === id
                  ? 'border-blue-600 font-semibold text-blue-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span aria-hidden="true">{label}</span>
              {id === 'shared' && unreadShared > 0 && (
                <span aria-hidden="true" className="min-w-[18px] rounded-full bg-blue-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                  {unreadShared}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className={`mt-5 ${showSidePanel ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6' : ''}`}>
        <div className="min-w-0">
          <ul className={`grid grid-cols-1 gap-4 min-[640px]:grid-cols-2 ${showSidePanel ? '' : 'xl:grid-cols-3'}`}>
            {items.map(a => (
              <ArtifactCard key={a.id} a={a} />
            ))}
            {items.length === 0 && (
              <li className="col-span-full rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
                {q
                  ? `No matches for "${query.trim()}".`
                  : tab === 'yours'
                    ? 'Nothing here yet. Use + to start a letter or a canvas.'
                    : 'Nothing has been shared with you yet.'}
              </li>
            )}
          </ul>
        </div>

        {showSidePanel && (
          <aside className="mt-6 hidden lg:mt-0 lg:block">
            <section aria-labelledby="shared-in-chats" className="rounded-xl border border-border bg-card p-4">
              <h2 id="shared-in-chats" className="mb-3 text-sm font-semibold">
                Shared in your chats
              </h2>
              <ChatShare />
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}

function EventsPage({ empty }: { empty: boolean }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 lg:px-6 lg:pb-12 lg:pt-8">
      <div className="flex min-h-11 items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">Events</h1>
        <button
          type="button"
          className="inline-flex min-h-10 shrink-0 items-center text-sm font-medium text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {empty ? 'Sign up to host' : 'Host'}
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {empty && <p className="text-sm text-muted-foreground">No events from us right now</p>}
        {!empty &&
          MOCK_EVENTS.map(e => (
            <article key={e.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm min-[480px]:flex-row min-[480px]:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{e.when}</p>
                <h2 className="mt-1 text-base font-semibold leading-snug">{e.title}</h2>
              </div>
              <Button className="h-11 bg-blue-600 text-white hover:bg-blue-700 min-[480px]:px-6">Join</Button>
            </article>
          ))}

        {empty ? (
          <article className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-5">
            <h2 className="text-lg font-semibold text-foreground">Happening in Chiang Mai</h2>
            <p className="text-sm text-muted-foreground">{CM_CARD.body}</p>
            <Button className="h-11 w-full bg-blue-600 text-white hover:bg-blue-700">See what is on</Button>
          </article>
        ) : (
          <article className="flex flex-col gap-1 rounded-xl border border-border bg-background p-4">
            <h2 className="text-sm font-semibold text-foreground">{CM_CARD.title}</h2>
            <p className="text-sm text-muted-foreground">{CM_CARD.body}</p>
            <button type="button" className="mt-1 flex min-h-11 items-center self-start text-sm font-medium text-blue-600 hover:text-blue-700">
              Open calendar
            </button>
          </article>
        )}
      </div>
    </div>
  );
}

export function VariantB({ state }: { state: LabState }) {
  const isEvents = state === 'events-empty' || state === 'events-some';
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <TopNav active={isEvents ? 'Events' : 'Artifacts'} />
      {isEvents ? <EventsPage empty={state === 'events-empty'} /> : <ArtifactsPage key={state} state={state} />}
      <BottomTabs active={isEvents ? 'Events' : 'Artifacts'} />
    </div>
  );
}
