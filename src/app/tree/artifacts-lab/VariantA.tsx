/**
 * P1545 Phase 1, Variant A: "Tabbed list". Classic page: header (title / search / +), two segmented tabs,
 * one dense line per item. Mock data only.
 */
import { Fragment, useState, type ComponentType, type ReactNode } from 'react';
import {
  CalendarDays,
  FileText,
  Globe,
  Home,
  LayoutPanelTop,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Shapes,
  User,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

type TabName = (typeof TABS)[number];
type Icon = ComponentType<{ className?: string }>;

const TAB_ICONS: Record<TabName, Icon> = {
  Home,
  Chats: MessageCircle,
  Events: CalendarDays,
  Artifacts: LayoutPanelTop,
  You: User,
};

/** Desktop sidebar omits nothing, but the spec lists these five entries in this order. */
const SIDEBAR: readonly TabName[] = ['Home', 'Chats', 'Events', 'Artifacts', 'You'];

function badgeFor(tab: TabName) {
  return tab === 'Chats' ? CHATS_UNREAD : 0;
}

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span
      data-badge
      className="min-w-[16px] h-4 px-1 text-[10px] font-bold leading-4 text-white bg-blue-600 rounded-full text-center"
    >
      {n}
    </span>
  );
}

function Sidebar({ active }: { active: TabName }) {
  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col gap-1 border-r border-border p-3 sticky top-9 h-[calc(100vh-2.25rem)]">
      <div className="px-3 py-2 text-sm font-semibold text-foreground">Clarity Pledge</div>
      {SIDEBAR.map(tab => {
        const Ic = TAB_ICONS[tab];
        const on = tab === active;
        return (
          <button
            key={tab}
            type="button"
            aria-current={on ? 'page' : undefined}
            className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              on ? 'bg-blue-50 font-semibold text-blue-700' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Ic className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-left">{tab}</span>
            <Badge n={badgeFor(tab)} />
          </button>
        );
      })}
    </aside>
  );
}

function BottomTabs({ active }: { active: TabName }) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border shadow-sheet pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center justify-around h-16">
        {TABS.map(tab => {
          const Ic = TAB_ICONS[tab];
          const on = tab === active;
          const n = badgeFor(tab);
          return (
            <button
              key={tab}
              type="button"
              aria-current={on ? 'page' : undefined}
              aria-label={n > 0 ? `${tab}, ${n} unread` : undefined}
              className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                on ? 'text-blue-600' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="relative flex">
                <Ic className={`w-5 h-5 ${on ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
                {n > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 text-[10px] font-bold leading-4 text-white bg-blue-600 rounded-full text-center">
                    {n}
                  </span>
                )}
              </span>
              <span className={`text-xs leading-none ${on ? 'font-semibold' : 'font-normal'}`}>{tab}</span>
              <div className={`w-1 h-1 rounded-full mt-0.5 ${on ? 'bg-blue-600' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function PlusMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button size="icon" aria-label="Create" className="h-10 w-10 shrink-0 bg-blue-600 text-white hover:bg-blue-700">
          <Plus className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuItem className="h-10 gap-2">
          <FileText className="h-4 w-4" /> Letter
        </DropdownMenuItem>
        <DropdownMenuItem className="h-10 gap-2">
          <Shapes className="h-4 w-4" /> Canvas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One column for every block so left and right edges line up on desktop. */
const COLUMN = 'mx-auto w-full max-w-2xl px-4 pb-24 pt-4 lg:pb-10';

function RowMenu({ item }: { item: MockArtifact }) {
  const actions = item.draft ? LETTER_ACTIONS.draft : LETTER_ACTIONS.sent;
  const entries: readonly string[] =
    item.kind === 'letter' ? [actions.primary, ...actions.more] : ['Share', 'Delete'];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${item.title}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {entries.map((a, idx) => (
          <Fragment key={a}>
            {a === 'Delete' && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className={`h-10 ${a === 'Delete' ? 'text-destructive focus:text-destructive' : idx === 0 ? 'font-medium' : ''}`}
            >
              {a}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Row({ item }: { item: MockArtifact }) {
  const KindIcon = item.kind === 'letter' ? FileText : Shapes;
  const VisIcon = item.visibility === 'public' ? Globe : Lock;
  const own = !item.sharedBy;
  const inChat = !own && SHARE_MESSAGES.some(m => m.title === item.title);
  const metaTokens: ReactNode[] = [];
  if (own) {
    metaTokens.push(
      <VisIcon
        className="h-3 w-3 shrink-0"
        aria-label={item.visibility === 'public' ? 'Public' : 'Not public'}
      />,
    );
  }
  if (item.draft) {
    metaTokens.push(
      <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 text-[11px] font-medium text-foreground">
        Draft
      </span>,
    );
  }
  if (!item.draft && item.replies) {
    metaTokens.push(
      <span className="shrink-0">
        {item.replies.done} of {item.replies.total} replied
      </span>,
    );
  }
  if (item.sharedBy) metaTokens.push(<span>from {item.sharedBy}</span>);
  if (inChat) metaTokens.push(<span>in your chat</span>);
  metaTokens.push(<span className="shrink-0">{item.updated}</span>);

  return (
    <li className="flex min-h-[56px] items-center gap-1 border-b border-border pl-1 last:border-b-0">
      <button
        type="button"
        className="flex min-h-[56px] min-w-0 flex-1 items-center gap-2 rounded-md py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex h-2 w-2 shrink-0 justify-center" aria-hidden={!item.unread}>
          {item.unread && <span role="img" aria-label="Unread" className="h-2 w-2 rounded-full bg-blue-600" />}
        </span>
        <KindIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={item.kind} />
        <span className="min-w-0 flex-1">
          <span className={`line-clamp-2 text-sm ${item.unread ? 'font-semibold' : 'font-medium'} text-foreground`}>
            {item.title}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {metaTokens.map((tok, idx) => (
              <Fragment key={idx}>
                {idx > 0 && <span aria-hidden="true">{'\u00b7'}</span>}
                {tok}
              </Fragment>
            ))}
          </span>
        </span>
      </button>
      {own && <RowMenu item={item} />}
    </li>
  );
}

function initFor(state: LabState) {
  return {
    tab: (state === 'shared' || state === 'empty-shared' ? 'shared' : 'yours') as 'yours' | 'shared',
    searching: state === 'search-open',
    query: state === 'search-open' ? 'hike' : '',
    plusOpen: state === 'menu-open',
  };
}

function ArtifactsPage({ state }: { state: LabState }) {
  const init = initFor(state);
  const [tab, setTab] = useState(init.tab);
  const [searching, setSearching] = useState(init.searching);
  const [query, setQuery] = useState(init.query);
  const [plusOpen, setPlusOpen] = useState(init.plusOpen);
  const [lastState, setLastState] = useState(state);
  if (lastState !== state) {
    setLastState(state);
    setTab(init.tab);
    setQuery(init.query);
    setSearching(init.searching);
    setPlusOpen(init.plusOpen);
  }

  const yours = state === 'empty-yours' ? [] : YOURS;
  const shared = state === 'empty-shared' ? [] : SHARED;
  const unreadShared = shared.filter(s => s.unread).length;
  const q = query.trim().toLowerCase();
  const source = q ? [...yours, ...shared] : tab === 'yours' ? yours : shared;
  const items = q ? source.filter(i => i.title.toLowerCase().includes(q)) : source;

  const closeSearch = () => {
    setSearching(false);
    setQuery('');
  };

  return (
    <div className={COLUMN}>
      {/* Header */}
      <div className="flex h-10 items-center gap-2">
        {searching ? (
          <>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by title"
                aria-label="Search artifacts"
                className="h-10 pl-9"
              />
            </div>
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Close search"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" />
            </button>
          </>
        ) : (
          <>
            <h1 className="min-w-0 flex-1 truncate text-2xl font-bold text-foreground">Artifacts</h1>
            <button
              type="button"
              onClick={() => setSearching(true)}
              aria-label="Search"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Search className="h-5 w-5" />
            </button>
            <PlusMenu open={plusOpen} onOpenChange={setPlusOpen} />
          </>
        )}
      </div>

      {/* Segmented tabs (hidden while a search is filtering across both) */}
      {!q && (
        <div role="tablist" aria-label="Artifacts" className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'yours'}
            onClick={() => setTab('yours')}
            className={`flex h-10 min-w-0 items-center justify-center rounded-md px-1.5 text-[13px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === 'yours' ? 'bg-background font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Yours
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'shared'}
            aria-label={unreadShared > 0 ? `Shared with you, ${unreadShared} unread` : 'Shared with you'}
            onClick={() => setTab('shared')}
            className={`flex h-10 min-w-0 items-center justify-center gap-1 rounded-md px-1.5 text-[13px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === 'shared' ? 'bg-background font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Shared with you</span>
            <Badge n={unreadShared} />
          </button>
        </div>
      )}

      {/* List */}
      <div className="mt-2">
        {items.length > 0 ? (
          <ul>
            {items.map(i => (
              <Row key={i.id} item={i} />
            ))}
          </ul>
        ) : q ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing titled “{query}”.</p>
        ) : tab === 'yours' ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing here yet. Tap <Plus className="inline h-3.5 w-3.5 align-[-2px]" /> to write a letter or start a canvas.
          </p>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing shared with you yet.</p>
        )}
      </div>
    </div>
  );
}

function CmCard({ prominent }: { prominent: boolean }) {
  return (
    <section
      aria-label="Happening in Chiang Mai"
      className={`rounded-xl border p-4 ${prominent ? 'border-blue-200 bg-blue-50' : 'border-border bg-background'}`}
    >
      <h2 className="text-base font-semibold text-foreground">Happening in Chiang Mai</h2>
      <p className="mt-1 text-sm text-muted-foreground">{CM_CARD.body}</p>
      {prominent ? (
        <Button className="mt-3 h-11 w-full bg-blue-600 text-white hover:bg-blue-700">See the Chiang Mai calendar</Button>
      ) : (
        <button
          type="button"
          className="mt-2 inline-flex h-10 items-center text-sm font-medium text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open calendar
        </button>
      )}
    </section>
  );
}

function EventsPage({ empty }: { empty: boolean }) {
  return (
    <div className={COLUMN}>
      <div className="flex h-10 items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold text-foreground">Events</h1>
        <button
          type="button"
          className="inline-flex min-h-10 shrink-0 items-center text-sm font-medium text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {empty ? 'Sign up to host' : 'Host'}
        </button>
      </div>

      {empty ? (
        <>
          <p className="mt-4 text-sm text-muted-foreground">No events from us right now</p>
          <div className="mt-4">
            <CmCard prominent />
          </div>
        </>
      ) : (
        <>
          <ul className="mt-4">
            {MOCK_EVENTS.map(e => (
              <li key={e.id} className="flex min-h-[56px] items-center gap-3 border-b border-border py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.when}</p>
                </div>
                <Button size="sm" className="h-10 shrink-0 bg-blue-600 px-4 text-white hover:bg-blue-700">
                  Join
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <CmCard prominent={false} />
          </div>
        </>
      )}
    </div>
  );
}

export function VariantA({ state }: { state: LabState }) {
  const isEvents = state === 'events-empty' || state === 'events-some';
  const active: TabName = isEvents ? 'Events' : 'Artifacts';

  return (
    <div className="relative flex min-h-[calc(100vh-2.25rem)] w-full overflow-x-hidden bg-background">
      <Sidebar active={active} />
      <main className="min-w-0 flex-1">
        {isEvents ? <EventsPage empty={state === 'events-empty'} /> : <ArtifactsPage state={state} />}
      </main>
      <BottomTabs active={active} />
    </div>
  );
}
