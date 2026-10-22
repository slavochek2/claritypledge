/**
 * P1545 Phase 1 round 2: pieces shared by variants B2 and C2 (/tree/artifacts). Dev-only, mock data.
 * Navigation (left sidebar on desktop, bottom tabs on phone), the labelled "New artifact" menu, type and
 * visibility icons, the per-state action model, the recipients list, and the Events page with the Chiang Mai banner.
 */
import { useState, type ComponentType, type ReactNode } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Globe,
  Home,
  LayoutDashboard,
  Lock,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Shapes,
  User,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DETAILS_BUTTON_CLASS } from '@/app/components/shared/card-action-classes';
import { CHATS_UNREAD, CM_BANNER, MOCK_EVENTS, TABS, type MockArtifact, type MockRecipient } from './mock';
import { PRIMARY, type ActionSet, type Action } from './model';

type TabName = (typeof TABS)[number];
type Icon = ComponentType<{ className?: string }>;

const TAB_ICONS: Record<TabName, Icon> = { Home, Chats: MessageCircle, Events: CalendarDays, Artifacts: Shapes, You: User };

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function badgeFor(tab: TabName) {
  return tab === 'Chats' ? CHATS_UNREAD : 0;
}

/* -------------------------------------------------------------- navigation */

function SidebarNav({ active }: { active: TabName }) {
  return (
    <aside className="sticky top-9 hidden h-[calc(100vh-2.25rem)] w-56 shrink-0 flex-col gap-1 border-r border-border p-3 lg:flex">
      <nav aria-label="Main" className="flex flex-col gap-1">
        <div className="px-3 py-2 text-sm font-semibold text-foreground">Clarity Pledge</div>
        {TABS.map(tab => {
          const Ic = TAB_ICONS[tab];
          const on = tab === active;
          const n = badgeFor(tab);
          return (
            <button
              key={tab}
              type="button"
              aria-current={on ? 'page' : undefined}
              className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${FOCUS} ${
                on ? 'bg-blue-50 font-semibold text-blue-700' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Ic className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-left">{tab}</span>
              {n > 0 && (
                <span className="h-4 min-w-[16px] rounded-full bg-blue-600 px-1 text-center text-[10px] font-bold leading-4 text-white">{n}</span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function BottomTabs({ active }: { active: TabName }) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-sheet backdrop-blur-md lg:hidden"
    >
      <div className="flex h-16 items-center justify-around">
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
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                on ? 'text-blue-600' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="relative flex">
                <Ic className={`h-5 w-5 ${on ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
                {n > 0 && (
                  <span className="absolute -right-2 -top-1.5 h-4 min-w-[16px] rounded-full bg-blue-600 px-1 text-center text-[10px] font-bold leading-4 text-white">{n}</span>
                )}
              </span>
              <span className={`text-xs leading-none ${on ? 'font-semibold' : 'font-normal'}`}>{tab}</span>
              <div className={`mt-0.5 h-1 w-1 rounded-full ${on ? 'bg-blue-600' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Left sidebar on desktop, bottom tabs on phone. `fill` lets a variant own the full height (two panes). */
export function Shell({ active, children, fill = false }: { active: TabName; children: ReactNode; fill?: boolean }) {
  return (
    <div className="flex min-h-[calc(100vh-2.25rem)] overflow-x-hidden bg-background text-foreground">
      <SidebarNav active={active} />
      <div className={`flex min-w-0 flex-1 ${fill ? 'lg:h-[calc(100vh-2.25rem)] lg:overflow-hidden' : ''}`}>{children}</div>
      <BottomTabs active={active} />
    </div>
  );
}

/* ------------------------------------------------------------------ icons */

/** The canvas sections' own blue disc (canvas-page.tsx: bg-blue-100 text-blue-600). */
export function TypeDisc({ kind, size = 'md' }: { kind: MockArtifact['kind']; size?: 'md' | 'lg' }) {
  const Ic = kind === 'canvas' ? LayoutDashboard : Mail;
  const box = size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600`} aria-hidden="true">
      <Ic className={size === 'lg' ? 'h-5 w-5' : 'h-[18px] w-[18px]'} />
    </span>
  );
}

export function TypeLabel({ kind }: { kind: MockArtifact['kind'] }) {
  return <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">{kind === 'canvas' ? 'Canvas' : 'Letter'}</span>;
}

export function VisibilityIcon({ v, className = 'h-4 w-4' }: { v: MockArtifact['visibility']; className?: string }) {
  const Ic = v === 'public' ? Globe : Lock;
  return <Ic className={`${className} shrink-0 text-muted-foreground`} role="img" aria-label={v === 'public' ? 'Public' : 'Private'} />;
}

export function DraftChip() {
  return <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">Draft</span>;
}

export function UnreadDot() {
  return (
    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" role="img" aria-label="Unread" />
  );
}

/* ---------------------------------------------------------------- actions */

export function PrimaryButton({ label, className = '' }: { label: string; className?: string }) {
  return (
    <button type="button" className={`${DETAILS_BUTTON_CLASS} ${className}`}>
      {label}
      <ArrowRight aria-hidden className="h-4 w-4" />
    </button>
  );
}

export function MoreMenu({ a, set }: { a: MockArtifact; set: ActionSet }) {
  if (set.menu.length === 0 && !set.danger) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${a.title}`}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${FOCUS}`}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[80] min-w-[12rem]">
        {set.menu.map(m => (
          <ActionItem key={m.label} action={m} />
        ))}
        {set.danger && (
          <>
            {set.menu.length > 0 && <DropdownMenuSeparator />}
            <ActionItem action={set.danger} danger />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActionItem({ action, danger = false }: { action: Action; danger?: boolean }) {
  const off = !!action.disabledReason;
  return (
    <DropdownMenuItem
      disabled={off}
      className={`min-h-10 flex-col items-start justify-center gap-0.5 ${danger && !off ? 'text-red-600 focus:text-red-600' : ''}`}
    >
      <span>{action.label}</span>
      {action.disabledReason && <span className="max-w-[16rem] text-xs text-muted-foreground">{action.disabledReason}</span>}
    </DropdownMenuItem>
  );
}

/* -------------------------------------------------------------- recipients */

export function RecipientRows({ recipients, responses }: { recipients: MockRecipient[]; responses?: number }) {
  if (recipients.length === 0 && !responses) return <p className="text-sm text-muted-foreground">No recipients yet.</p>;
  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {recipients.map(r => (
        <li key={r.name} className="flex min-h-12 items-center gap-2 py-1">
          <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-foreground">{r.name}</span>
            <span className="block text-sm text-muted-foreground">
              {r.status}
              {r.steps ? ` · ${r.steps.done} of ${r.steps.total} steps` : ''}
            </span>
          </span>
          {r.hasResults && <PrimaryButton label="Results" className="h-10" />}
        </li>
      ))}
      {!!responses && (
        <li className="flex min-h-12 items-center py-1 text-sm text-muted-foreground">
          {responses} {responses === 1 ? 'response' : 'responses'} through the public link
        </li>
      )}
    </ul>
  );
}

/* ----------------------------------------------------------- page header */

/** "New artifact": a labelled button. Letter first (today's Private/Public draft choice stays), then Canvas. */
export function CreateMenu({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <Button className={`h-10 shrink-0 gap-1.5 px-3 ${PRIMARY}`}>
          <Plus className="h-4 w-4" />
          New artifact
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[80] w-72">
        <DropdownMenuLabel className="flex items-center gap-2 text-blue-700">
          <Mail className="h-4 w-4" /> New letter
        </DropdownMenuLabel>
        <DropdownMenuItem className="min-h-12 flex-col items-start justify-center gap-0.5">
          <span className="flex items-center gap-2 font-medium"><Lock className="h-4 w-4" /> Private Draft</span>
          <span className="pl-6 text-xs text-muted-foreground">Only people you share with can see this</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-12 flex-col items-start justify-center gap-0.5">
          <span className="flex items-center gap-2 font-medium"><Globe className="h-4 w-4" /> Public Draft</span>
          <span className="pl-6 text-xs text-muted-foreground">Visible on your profile</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-12 gap-2 font-medium">
          <LayoutDashboard className="h-4 w-4 text-blue-600" /> Canvas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PageHeader({
  searchOpen,
  query,
  onOpenSearch,
  onQuery,
  onCloseSearch,
  menuOpen,
}: {
  searchOpen: boolean;
  query: string;
  onOpenSearch: () => void;
  onQuery: (q: string) => void;
  onCloseSearch: () => void;
  menuOpen: boolean;
}) {
  return (
    <div className="flex h-12 items-center gap-2">
      {searchOpen ? (
        <>
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={e => onQuery(e.target.value)}
              placeholder="Search artifacts"
              aria-label="Search artifacts"
              className={`h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-base ${FOCUS}`}
            />
          </div>
          <button
            type="button"
            onClick={onCloseSearch}
            aria-label="Close search"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground ${FOCUS}`}
          >
            <X className="h-5 w-5" />
          </button>
        </>
      ) : (
        <>
          <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">Artifacts</h1>
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground ${FOCUS}`}
          >
            <Search className="h-5 w-5" />
          </button>
          <CreateMenu defaultOpen={menuOpen} />
        </>
      )}
    </div>
  );
}

export function Tabs({ tab, onTab, unread }: { tab: 'yours' | 'shared'; onTab: (t: 'yours' | 'shared') => void; unread: number }) {
  const items = [
    { id: 'yours', label: 'Yours' },
    { id: 'shared', label: 'Shared with you' },
  ] as const;
  return (
    <div role="tablist" aria-label="Artifacts" className="flex border-b border-border">
      {items.map(t => {
        const on = tab === t.id;
        const n = t.id === 'shared' ? unread : 0;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={n > 0 ? `${t.label}, ${n} unread` : t.label}
            onClick={() => onTab(t.id)}
            className={`-mb-px flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              on ? 'border-blue-600 font-semibold text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span aria-hidden="true">{t.label}</span>
            {n > 0 && (
              <span aria-hidden="true" className="min-w-[18px] rounded-full bg-blue-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyLine({ query, tab }: { query: string; tab: 'yours' | 'shared' }) {
  const text = query
    ? `No matches for "${query}".`
    : tab === 'yours'
      ? 'Nothing here yet. Use New artifact to start a letter or a canvas.'
      : 'Nothing has been shared with you yet.';
  return <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">{text}</p>;
}

/** Small disclosure used by B2 cards. */
export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`flex min-h-11 w-full items-center justify-between px-4 text-sm font-medium text-foreground ${FOCUS}`}
      >
        {label}
        <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- events */

/**
 * [FOUNDER DECISION: banner copy and button text are placeholders.] Bold yellow, dark text, on purpose:
 * founder round 2, "a big attention banner". Many taps are the evidence for a custom list later (decision 6).
 */
export function ChiangMaiBanner() {
  return (
    <section aria-label={CM_BANNER.title} className="rounded-2xl border-2 border-yellow-500 bg-yellow-300 p-5 text-neutral-900 shadow-sm sm:p-7">
      <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{CM_BANNER.title}</h2>
      <p className="mt-2 text-lg font-medium sm:text-xl">{CM_BANNER.body}</p>
      <a
        href={CM_BANNER.href}
        onClick={e => e.preventDefault()}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-6 text-base font-semibold text-yellow-300 transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-yellow-300 sm:w-auto"
      >
        {CM_BANNER.cta}
        <ArrowRight aria-hidden className="h-5 w-5" />
      </a>
    </section>
  );
}

export function EventsPage({ empty }: { empty: boolean }) {
  return (
    <Shell active="Events">
      <main className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-5 px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-8">
        <div className="flex min-h-12 items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">Events</h1>
          <button
            type="button"
            className={`inline-flex min-h-10 shrink-0 items-center rounded-md px-2 text-sm font-medium text-blue-600 hover:underline ${FOCUS}`}
          >
            {empty ? 'Sign up to host' : 'Host'}
          </button>
        </div>

        {empty ? (
          <>
            <ChiangMaiBanner />
            <p className="text-sm text-muted-foreground">No events from us right now.</p>
          </>
        ) : (
          <>
            {MOCK_EVENTS.map(e => (
              <article key={e.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm min-[480px]:flex-row min-[480px]:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground">{e.when}</p>
                  <h2 className="mt-1 text-base font-semibold leading-snug">{e.title}</h2>
                </div>
                <Button className={`h-11 min-[480px]:px-6 ${PRIMARY}`}>Join</Button>
              </article>
            ))}
            <ChiangMaiBanner />
          </>
        )}
      </main>
    </Shell>
  );
}
