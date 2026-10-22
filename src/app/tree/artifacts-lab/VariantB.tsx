/**
 * P1545 Phase 1, Variant B: "Card grid". Dev-only, mock data, no services.
 * Visual cards in a responsive grid; the letter's primary action sits on the card, the rest behind "...".
 */
import { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  FileText,
  Globe,
  Home,
  Lock,
  MessageCircle,
  MoreHorizontal,
  PenLine,
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
              <span className="relative flex">
                <Icon className={`h-4 w-4 ${on ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
                {t === 'Chats' && <Badge n={CHATS_UNREAD} />}
              </span>
              {t}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="You"
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <YouDisc />
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

function CreateMenu() {
  return (
    <DropdownMenu>
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
  // A letter shared with you is only opened; sending/recipients/delete belong to its author.
  const primary = shared ? 'Open' : actions?.primary;
  const more = shared ? [] : actions?.more ?? [];
  const Visibility = a.visibility === 'public' ? Globe : Lock;

  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={`Open ${a.title}`}
      >
        <span
          className={`flex h-10 items-center gap-2 px-4 text-xs font-medium ${
            isLetter ? 'bg-slate-100 text-slate-700' : 'bg-blue-50 text-blue-700'
          }`}
        >
          {isLetter ? <FileText className="h-4 w-4" /> : <Shapes className="h-4 w-4" />}
          {isLetter ? 'Letter' : 'Canvas'}
          {a.draft && (
            <span className="ml-auto rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
              Draft
            </span>
          )}
          {a.unread && (
            <span className="ml-auto flex items-center gap-1.5 text-blue-700">
              <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />
              <span className="sr-only">Unread</span>
            </span>
          )}
        </span>
        <span className="line-clamp-2 min-h-[3.25rem] px-4 pt-3 text-base font-semibold leading-snug text-foreground">
          {a.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-3 pt-2 text-xs text-muted-foreground">
          <Visibility className="h-3.5 w-3.5 shrink-0" aria-label={a.visibility === 'public' ? 'Public' : 'Not public'} />
          {a.sharedBy && <span>Shared by {a.sharedBy}</span>}
          {a.replies && (
            <span>
              {a.replies.done} of {a.replies.total} replied
            </span>
          )}
          <span className="ml-auto">{a.updated}</span>
        </span>
      </button>

      {primary && (
        <div className="flex items-center justify-between border-t border-border px-2">
          <button
            type="button"
            className="flex h-11 items-center rounded-md px-2 text-sm font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {primary}
          </button>
          {more.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`More actions for ${a.title}`}
                  className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                {more.map(m =>
                  m === 'Delete' ? (
                    <div key={m}>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="min-h-10 text-red-600 focus:text-red-600">{m}</DropdownMenuItem>
                    </div>
                  ) : (
                    <DropdownMenuItem key={m} className="min-h-10">
                      {m}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </li>
  );
}

/** Decision 5: shares posted in chats, as bubbles with an embedded artifact chip. */
function SharedInChats({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <section aria-labelledby="shared-in-chats" className="rounded-xl border border-border bg-card">
      <h2 id="shared-in-chats" className="m-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-h-11 w-full items-center justify-between px-4 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:pointer-events-none"
        >
          Shared in your chats
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform lg:hidden ${open ? 'rotate-180' : ''}`} />
        </button>
      </h2>
      <ul className={`${open ? 'flex' : 'hidden'} flex-col gap-4 px-4 pb-4 lg:flex`}>
        {SHARE_MESSAGES.map(m => (
          <li key={m.title} className="min-w-0">
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
          </li>
        ))}
      </ul>
    </section>
  );
}

function ArtifactsPage({ state }: { state: LabState }) {
  const [tab, setTab] = useState<Tab>(state === 'empty-shared' ? 'shared' : 'yours');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [chatsOpen, setChatsOpen] = useState(false);

  const source = useMemo(() => {
    if (state === 'empty-yours' && tab === 'yours') return [];
    if (state === 'empty-shared' && tab === 'shared') return [];
    return tab === 'yours' ? YOURS : SHARED;
  }, [state, tab]);
  const q = query.trim().toLowerCase();
  const items = q
    ? source.filter(a => a.title.toLowerCase().includes(q) || (a.sharedBy ?? '').toLowerCase().includes(q))
    : source;

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 lg:px-6 lg:pb-12 lg:pt-8">
      <div className="flex h-11 items-center gap-2">
        {searchOpen ? (
          <>
            <div className="relative min-w-0 flex-1">
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
            <CreateMenu />
          </>
        )}
      </div>

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
            onClick={() => setTab(id)}
            className={`-mb-px min-h-11 border-b-2 px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              tab === id
                ? 'border-blue-600 font-semibold text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
        <div className="min-w-0">
          {items.length > 0 ? (
            <ul className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2 xl:grid-cols-3">
              {items.map(a => (
                <ArtifactCard key={a.id} a={a} />
              ))}
            </ul>
          ) : q ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No matches for "{query.trim()}".
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {tab === 'yours' ? 'Nothing here yet. Start with a letter or a canvas.' : 'Nothing has been shared with you yet.'}
              </p>
              {tab === 'yours' && (
                <div className="flex items-center gap-2">
                  <button type="button" className="flex min-h-11 items-center gap-1.5 px-3 text-sm font-medium text-blue-600 hover:text-blue-700">
                    <PenLine className="h-4 w-4" /> New letter
                  </button>
                  <button type="button" className="flex min-h-11 items-center gap-1.5 px-3 text-sm font-medium text-blue-600 hover:text-blue-700">
                    <Shapes className="h-4 w-4" /> New canvas
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {state === 'full' && (
          <aside className="mt-6 lg:mt-0">
            <SharedInChats open={chatsOpen} onToggle={() => setChatsOpen(o => !o)} />
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
        {empty ? (
          <button type="button" className="min-h-11 px-2 text-sm text-blue-600 underline underline-offset-2 hover:text-blue-700">
            Sign up to host
          </button>
        ) : (
          <Button variant="outline" size="sm" className="h-10">
            Host
          </Button>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-4">
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
            <h2 className="text-lg font-semibold text-foreground">{CM_CARD.title}</h2>
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
