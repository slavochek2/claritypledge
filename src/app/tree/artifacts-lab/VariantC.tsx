/**
 * P1545 Phase 1, Variant C: split view / inbox-style.
 * Desktop: icon rail | narrow list | preview pane with an action bar.
 * Phone: list only; a row opens a bottom sheet with the same preview and actions.
 * Mock data only. Search-open can be forced with ?search=1.
 */
import { Fragment, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  FileText,
  Globe,
  Home,
  Layers,
  LayoutDashboard,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
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

type Tab = 'yours' | 'shared';
type TabName = (typeof TABS)[number];

const TAB_ICONS: Record<TabName, typeof Home> = {
  Home,
  Chats: MessageCircle,
  Events: CalendarDays,
  Artifacts: Layers,
  You: User,
};

const PRIMARY = 'bg-blue-600 text-white hover:bg-blue-700 shadow-none';

/* ------------------------------------------------------------------ shell */

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 text-[10px] font-bold leading-4 text-white bg-blue-600 rounded-full text-center">
      {count}
    </span>
  );
}

function Rail({ active }: { active: TabName }) {
  return (
    <nav aria-label="Main" className="hidden lg:flex w-20 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-3">
      {TABS.map(name => {
        const Icon = TAB_ICONS[name];
        const on = name === active;
        return (
          <button
            key={name}
            type="button"
            aria-current={on ? 'page' : undefined}
            className={`flex h-14 w-16 flex-col items-center justify-center gap-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              on ? 'bg-blue-50 text-blue-600' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <span className="relative flex">
              <Icon className={`h-5 w-5 ${on ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
              {name === 'Chats' && <Badge count={CHATS_UNREAD} />}
            </span>
            <span className={`text-[10px] leading-none ${on ? 'font-semibold' : 'font-normal'}`}>{name}</span>
          </button>
        );
      })}
    </nav>
  );
}

function TabBar({ active }: { active: TabName }) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md shadow-sheet pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex h-16 items-center justify-around">
        {TABS.map(name => {
          const Icon = TAB_ICONS[name];
          const on = name === active;
          return (
            <button
              key={name}
              type="button"
              aria-current={on ? 'page' : undefined}
              className={`flex flex-1 min-w-0 flex-col items-center justify-center gap-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                on ? 'text-blue-600' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="relative flex">
                <Icon className={`h-5 w-5 ${on ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
                {name === 'Chats' && <Badge count={CHATS_UNREAD} />}
              </span>
              <span className={`text-xs leading-none ${on ? 'font-semibold' : 'font-normal'}`}>{name}</span>
              <div className={`mt-0.5 h-1 w-1 rounded-full ${on ? 'bg-blue-600' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Shell({ active, children }: { active: TabName; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-34px)] w-full overflow-x-hidden bg-background pb-24 lg:h-[calc(100dvh-34px)] lg:pb-0">
      <Rail active={active} />
      <div className="flex min-w-0 flex-1">{children}</div>
      <TabBar active={active} />
    </div>
  );
}

/* ------------------------------------------------------------- small bits */

function VisibilityIcon({ v, className = 'h-4 w-4' }: { v: MockArtifact['visibility']; className?: string }) {
  return v === 'public' ? (
    <Globe className={`${className} text-muted-foreground`} aria-label="Public" role="img" />
  ) : (
    <Lock className={`${className} text-muted-foreground`} aria-label="Not public" role="img" />
  );
}

const DESKTOP_QUERY = '(min-width: 1024px)';
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function KindIcon({ kind, className = 'h-4 w-4' }: { kind: MockArtifact['kind']; className?: string }) {
  const Icon = kind === 'letter' ? FileText : LayoutDashboard;
  return <Icon className={className} aria-hidden="true" />;
}

function PlusMenu({ children, defaultOpen = false, side = 'bottom' }: { children: React.ReactNode; defaultOpen?: boolean; side?: 'top' | 'bottom' }) {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} className="z-[80] w-44">
        <DropdownMenuItem className="min-h-10 gap-2">
          <FileText className="h-4 w-4" /> Letter
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-10 gap-2">
          <LayoutDashboard className="h-4 w-4" /> Canvas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------------------------------------- preview */

function actionsFor(a: MockArtifact): { primary: string; secondary: string[]; menu: string[] } {
  if (a.sharedBy) return { primary: 'Open', secondary: [], menu: [] };
  if (a.kind === 'canvas') return { primary: 'Open', secondary: [], menu: ['Share'] };
  const set = a.draft ? LETTER_ACTIONS.draft : LETTER_ACTIONS.sent;
  return { primary: set.primary, secondary: set.more.filter(l => l !== 'Delete'), menu: [] };
}

function ActionBar({ a }: { a: MockArtifact }) {
  const { primary, secondary, menu } = actionsFor(a);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Actions">
      <Button className={`h-10 px-5 ${PRIMARY}`}>{primary}</Button>
      {secondary.map(label => (
        <Button key={label} variant="ghost" className="h-10 px-3 text-muted-foreground hover:text-foreground">
          {label}
        </Button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground" aria-label="More actions">
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[80] w-40">
          {menu.map(label => (
            <DropdownMenuItem key={label} className="min-h-10">
              {label}
            </DropdownMenuItem>
          ))}
          {menu.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem className="min-h-10 text-destructive focus:text-destructive">{a.sharedBy ? 'Remove from my list' : 'Delete'}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ChatEcho({ a }: { a: MockArtifact }) {
  if (!a.sharedBy) return null;
  const msg = SHARE_MESSAGES.find(m => m.title === a.title);
  if (!msg) return null;
  const text = msg.text;
  return (
    <section className="rounded-lg border border-border bg-muted/40 p-3">
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">In your chat</h3>
      <div className="max-w-full rounded-2xl rounded-bl-sm border border-border bg-background px-3 py-2">
        <p className="text-sm text-foreground">{text}</p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-blue-700">
          <KindIcon kind={a.kind} className="h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{a.title}</span>
        </p>
      </div>
    </section>
  );
}

function Preview({ a }: { a: MockArtifact }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <KindIcon kind={a.kind} />
        <span>{a.kind}</span>
      </div>
      <h2 className="break-words text-xl font-semibold leading-tight text-foreground">{a.title}</h2>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
        {[
          <VisibilityIcon key="vis" v={a.visibility} />,
          a.draft && (
            <span key="draft" className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
              Draft
            </span>
          ),
          a.sharedBy && <span key="by">Shared by {a.sharedBy}</span>,
          a.replies && (
            <span key="rep">
              {a.replies.done} of {a.replies.total} replied
            </span>
          ),
          <span key="upd">{a.updated}</span>,
        ]
          .filter(Boolean)
          .map((tok, idx) => (
            <Fragment key={idx}>
              {idx > 0 && <span aria-hidden="true">{'·'}</span>}
              {tok}
            </Fragment>
          ))}
      </div>
      <ActionBar a={a} />
      <ChatEcho a={a} />
    </div>
  );
}

/* ------------------------------------------------------------------- list */

function Row({ a, selected, unread, onSelect }: { a: MockArtifact; selected: boolean; unread: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`flex min-h-[64px] w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
          selected ? 'lg:bg-blue-50' : 'hover:bg-accent'
        }`}
      >
        <span className="flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden={!unread}>
          {unread && <span className="h-2 w-2 rounded-full bg-blue-600" aria-label="Unread" role="img" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block line-clamp-2 break-words text-sm ${unread ? 'font-semibold' : 'font-medium'} text-foreground`}>{a.title}</span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            <KindIcon kind={a.kind} className="h-3 w-3 shrink-0" />
            {a.sharedBy ? (
              <span>from {a.sharedBy}{SHARE_MESSAGES.some(m => m.title === a.title) ? ' · in your chat' : ''}</span>
            ) : a.draft ? (
              <span className="rounded-md border border-border bg-muted px-1.5 py-px font-medium text-foreground">Draft</span>
            ) : a.replies ? (
              <span>
                {a.replies.done} of {a.replies.total} replied
              </span>
            ) : (
              <span>{a.updated}</span>
            )}
          </span>
        </span>
        <VisibilityIcon v={a.visibility} className="h-4 w-4 shrink-0" />
      </button>
    </li>
  );
}

function Segmented({ tab, onTab, unread }: { tab: Tab; onTab: (t: Tab) => void; unread: number }) {
  const items: { id: Tab; label: string }[] = [
    { id: 'yours', label: 'Yours' },
    { id: 'shared', label: 'Shared with you' },
  ];
  return (
    <div role="tablist" aria-label="Artifacts" className="mx-4 mb-2 flex gap-1 rounded-full bg-muted p-1">
      {items.map(t => {
        const on = tab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onTab(t.id)}
            className={`flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              on ? 'bg-background font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{t.label}</span>
            {t.id === 'shared' && unread > 0 && (
              <span className="h-4 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] font-bold leading-4 text-white">{unread}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- artifacts */

function ArtifactsPage({ state }: { state: LabState }) {
  const [params] = useSearchParams();
  const defaultTab: Tab = state === 'empty-shared' || state === 'shared' || state === 'search-open' ? 'shared' : 'yours';
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [searchOpen, setSearchOpen] = useState(state === 'search-open' || params.get('search') === '1');
  const [query, setQuery] = useState(state === 'search-open' ? 'hike' : '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [read, setRead] = useState<string[]>([]);
  const isDesktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);

  const yours = state === 'empty-yours' ? [] : YOURS;
  const shared = state === 'empty-shared' ? [] : SHARED;
  const q = query.trim().toLowerCase();
  const all = q ? [...yours, ...shared] : tab === 'yours' ? yours : shared;
  const items = q ? all.filter(a => a.title.toLowerCase().includes(q) || a.sharedBy?.toLowerCase().includes(q)) : all;
  const sharedUnread = shared.filter(a => a.unread && !read.includes(a.id)).length;
  const selected = items.find(a => a.id === selectedId) ?? items[0] ?? null;
  const empty = items.length === 0;
  const canCreate = tab === 'yours' && !searchOpen;
  const menuOpen = state === 'menu-open';

  const select = (a: MockArtifact) => {
    setSelectedId(a.id);
    setSheetOpen(true);
    if (a.unread) setRead(r => (r.includes(a.id) ? r : [...r, a.id]));
  };
  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  const emptyLine = q
    ? `Nothing matches "${query.trim()}".`
    : tab === 'yours'
      ? 'Nothing here yet. Use + to start a letter or a canvas.'
      : 'Nothing shared with you yet.';

  return (
    <Shell active="Artifacts">
      {/* list pane */}
      <section
        className="flex min-w-0 flex-1 flex-col lg:w-[360px] lg:flex-none lg:border-r lg:border-border"
        aria-label="Artifact list"
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
          <h1 className="text-xl font-semibold text-foreground">Artifacts</h1>
          <div className="flex items-center gap-1">
            {!searchOpen && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label="Search artifacts"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-5 w-5" />
              </Button>
            )}
            {canCreate && (
              <div className="hidden lg:block">
                <PlusMenu defaultOpen={menuOpen && isDesktop}>
                  <Button variant="outline" size="icon" className="h-10 w-10" aria-label="New artifact">
                    <Plus className="h-5 w-5" />
                  </Button>
                </PlusMenu>
              </div>
            )}
          </div>
        </header>

        {searchOpen && (
          <div className="relative mx-4 mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search artifacts"
              aria-label="Search artifacts"
              className="h-10 pl-9 pr-10"
            />
            <button
              type="button"
              aria-label="Clear search"
              onClick={closeSearch}
              className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {!q && (
          <Segmented
            tab={tab}
            onTab={t => {
              setTab(t);
              setSelectedId(null);
            }}
            unread={sharedUnread}
          />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pb-28 lg:pb-0">
          {empty ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">{emptyLine}</p>
          ) : (
            <ul className="border-t border-border">
              {items.map(a => (
                <Row
                  key={a.id}
                  a={a}
                  selected={selected?.id === a.id}
                  unread={!!a.unread && !read.includes(a.id)}
                  onSelect={() => select(a)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* desktop preview pane (blank when the list is empty) */}
      <section className="hidden min-w-0 flex-1 overflow-y-auto lg:block" aria-label="Preview">
        {!empty && selected && (
          <div className="mx-auto max-w-xl p-8">
            <Preview a={selected} />
          </div>
        )}
      </section>

      {/* phone: FAB, Yours only */}
      {canCreate && (
        <div className="lg:hidden">
          <div className="fixed bottom-20 right-4 z-40 mb-[env(safe-area-inset-bottom)]">
            <PlusMenu defaultOpen={menuOpen && !isDesktop} side="top">
              <Button aria-label="New artifact" className={`h-14 w-14 rounded-full p-0 shadow-lg ${PRIMARY}`}>
                <Plus className="!h-6 !w-6" />
              </Button>
            </PlusMenu>
          </div>
        </div>
      )}

      {/* phone: bottom sheet */}
      {sheetOpen && selected && (
        <div className="lg:hidden fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={selected.title}>
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-background px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-sheet">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
            <Preview a={selected} />
          </div>
        </div>
      )}
    </Shell>
  );
}

/* ----------------------------------------------------------------- events */

const CM_HEADING = 'Happening in Chiang Mai';

function HostLink() {
  return (
    <a
      href="#host"
      onClick={e => e.preventDefault()}
      className="inline-flex min-h-10 items-center self-start text-sm font-medium text-blue-600 hover:underline"
    >
      Sign up to host
    </a>
  );
}

function EventsPage({ empty }: { empty: boolean }) {
  const goCm = (e: React.MouseEvent) => e.preventDefault();
  return (
    <Shell active="Events">
      <main className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-4 p-4 pb-24 lg:p-8">
        <header className="flex min-h-10 items-center">
          <h1 className="text-xl font-semibold text-foreground">Events</h1>
        </header>

        {empty ? (
          <>
            <p className="text-sm text-muted-foreground">No events from us right now</p>
            <section className="rounded-lg border border-border bg-background p-5">
              <h2 className="text-base font-semibold text-foreground">{CM_HEADING}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{CM_CARD.body}</p>
              <Button asChild className={`mt-4 h-10 w-full px-5 sm:w-auto ${PRIMARY}`}>
                <a href={CM_CARD.href} onClick={goCm}>
                  Open the calendar
                </a>
              </Button>
            </section>
            <HostLink />
          </>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {MOCK_EVENTS.map(ev => (
                <li key={ev.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-4">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-foreground">{ev.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{ev.when}</p>
                  </div>
                  <Button className={`h-10 shrink-0 px-5 ${PRIMARY}`}>Join</Button>
                </li>
              ))}
            </ul>
            <section className="rounded-lg border border-border px-4 py-3">
              <h2 className="text-sm font-medium text-foreground">{CM_HEADING}</h2>
              <p className="text-xs text-muted-foreground">{CM_CARD.body}</p>
              <a
                href={CM_CARD.href}
                onClick={goCm}
                className="inline-flex min-h-10 items-center text-sm text-blue-700 underline-offset-4 hover:underline"
              >
                Open the calendar
              </a>
            </section>
            <HostLink />
          </>
        )}
      </main>
    </Shell>
  );
}

/* ----------------------------------------------------------------- export */

export function VariantC({ state }: { state: LabState }) {
  if (state === 'events-empty') return <EventsPage empty />;
  if (state === 'events-some') return <EventsPage empty={false} />;
  return <ArtifactsPage key={state} state={state} />;
}
