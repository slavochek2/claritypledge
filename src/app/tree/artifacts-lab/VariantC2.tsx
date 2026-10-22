/**
 * P1545 Phase 1 round 2, Variant C2: "Chat-style list + preview pane". Left sidebar (desktop) / bottom tabs (phone).
 * Rows carry no actions. Selecting one shows it in the pane (desktop) or a sheet (phone); the actions appear there, once.
 */
import { useState, useSyncExternalStore } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { LabState } from './ArtifactsLab';
import { SHARED, SHARE_MESSAGES, YOURS, type MockArtifact } from './mock';
import {
  DraftChip,
  EmptyLine,
  EventsPage,
  MetaLine,
  MoreMenu,
  PageHeader,
  PrimaryButton,
  RecipientRows,
  Shell,
  Tabs,
  TypeDisc,
  TypeLabel,
  UnreadDot,
  VisibilityIcon,
} from './shared';
import { actionsFor, deliveryCount, isInChat, metaParts, recipientsLabel } from './model';

type Tab = 'yours' | 'shared';
const CHAT_TITLES = SHARE_MESSAGES.map(m => m.title);

const DESKTOP_QUERY = '(min-width: 1024px)';
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/* ---------------------------------------------------------------- preview */

function Preview({ a }: { a: MockArtifact }) {
  const set = actionsFor(a);
  const msg = a.sharedBy ? SHARE_MESSAGES.find(m => m.title === a.title) : undefined;
  const hasRecipients = !a.draft && !a.sharedBy && a.kind === 'letter';
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-3">
        <TypeDisc kind={a.kind} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <TypeLabel kind={a.kind} />
          <span className="flex items-center gap-2">
            {!a.sharedBy && <VisibilityIcon v={a.visibility} />}
            {a.draft && <DraftChip />}
          </span>
        </div>
      </div>
      <h2 className="break-words text-xl font-semibold leading-tight text-foreground">{a.title}</h2>
      <MetaLine a={a} inChat={isInChat(a, CHAT_TITLES)} />
      {a.newFrom && (
        <p className="text-sm font-medium text-blue-600">
          {'•'} {a.newFrom.count} new from {a.newFrom.name}
        </p>
      )}
      <div className="flex items-center gap-1" role="group" aria-label="Actions">
        <PrimaryButton label={set.primary} />
        <MoreMenu a={a} set={set} />
      </div>
      {hasRecipients && deliveryCount(a) === 0 && <p className="text-sm text-muted-foreground">No recipients yet.</p>}
      {hasRecipients && deliveryCount(a) > 0 && (
        <section aria-label="Recipients" className="border-t border-border pt-3">
          <h3 className="mb-1 text-sm font-semibold text-foreground">{recipientsLabel(a)}</h3>
          <RecipientRows recipients={a.recipients ?? []} responses={a.responses} />
        </section>
      )}
      {msg && (
        <section className="rounded-lg border border-border bg-muted/40 p-3">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">In your chat</h3>
          <div className="rounded-2xl rounded-bl-sm border border-border bg-background px-3 py-2">
            <p className="text-sm text-foreground">{msg.text}</p>
            <p className="mt-1 break-words text-sm text-blue-700">{a.title}</p>
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- list */

function Row({ a, selected, onSelect }: { a: MockArtifact; selected: boolean; onSelect: () => void }) {
  const meta = a.sharedBy ? `from ${a.sharedBy}` : metaParts(a).slice(0, 2).join(' \u00b7 ');
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`flex min-h-[72px] w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
          selected ? 'lg:bg-blue-50' : 'hover:bg-accent'
        }`}
      >
        <TypeDisc kind={a.kind} size="lg" />
        <span className="min-w-0 flex-1">
          <span className={`line-clamp-1 block break-words text-base text-foreground ${a.unread ? 'font-semibold' : 'font-medium'}`}>{a.title}</span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
            <span className="font-semibold text-blue-700">{a.kind === 'canvas' ? 'Canvas' : 'Letter'}</span>
            {a.draft && <DraftChip />}
            <span className="min-w-0 break-words">{'\u00b7'} {meta}</span>
          </span>
        </span>
        {/* Two fixed slots, so an unread dot never moves the visibility icon. Shared items show no visibility. */}
        <span className="flex shrink-0 items-center gap-2">
          <span className="flex h-4 w-2.5 items-center justify-center">{a.unread && <UnreadDot />}</span>
          <span className="flex h-4 w-4 items-center justify-center">{!a.sharedBy && <VisibilityIcon v={a.visibility} className="h-4 w-4" />}</span>
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------- artifacts */

function ArtifactsPage({ state }: { state: LabState }) {
  const [tab, setTab] = useState<Tab>(state === 'empty-shared' || state === 'shared' ? 'shared' : 'yours');
  const [searchOpen, setSearchOpen] = useState(state === 'search-open');
  const [query, setQuery] = useState(state === 'search-open' ? 'hike' : '');
  const [selectedId, setSelectedId] = useState<string | null>(state === 'selected' ? (YOURS[0]?.id ?? null) : null);
  const [sheetOpen, setSheetOpen] = useState(state === 'selected');
  const [read, setRead] = useState<string[]>([]);
  const isDesktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);

  const yours = state === 'empty-yours' ? [] : YOURS;
  const shared = state === 'empty-shared' ? [] : SHARED;
  const q = query.trim().toLowerCase();
  const base = q ? [...yours, ...shared] : tab === 'yours' ? yours : shared;
  const items = (q ? base.filter(a => a.title.toLowerCase().includes(q) || (a.sharedBy ?? '').toLowerCase().includes(q)) : base).map(a => ({
    ...a,
    unread: a.unread && !read.includes(a.id),
  }));
  const unreadShared = shared.filter(a => a.unread && !read.includes(a.id)).length;
  const selected = items.find(a => a.id === selectedId) ?? null;

  const select = (a: MockArtifact) => {
    setSelectedId(a.id);
    setSheetOpen(true);
    if (a.unread) setRead(r => (r.includes(a.id) ? r : [...r, a.id]));
  };
  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  return (
    <Shell active="Artifacts" fill>
      <section className="flex min-w-0 flex-1 flex-col lg:w-[400px] lg:flex-none lg:border-r lg:border-border" aria-label="Artifact list">
        <div className="px-4 pt-5 lg:pt-6">
          <PageHeader
            searchOpen={searchOpen}
            query={query}
            onOpenSearch={() => setSearchOpen(true)}
            onQuery={setQuery}
            onCloseSearch={closeSearch}
            menuOpen={state === 'menu-open'}
          />
          {!q && (
            <div className="mt-3">
              <Tabs
                tab={tab}
                onTab={t => {
                  setTab(t);
                  setSelectedId(null);
                }}
                unread={unreadShared}
              />
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-28 lg:pb-0">
          {items.length === 0 ? (
            <div className="p-4">
              <EmptyLine query={query.trim()} tab={tab} />
            </div>
          ) : (
            <ul>
              {items.map(a => (
                <Row key={a.id} a={a} selected={isDesktop && selected?.id === a.id} onSelect={() => select(a)} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="hidden min-w-0 flex-1 overflow-y-auto lg:block" aria-label="Preview">
        {selected ? (
          <div className="mx-auto max-w-xl p-8">
            <Preview a={selected} />
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">Select an artifact to see it here.</p>
        )}
      </section>

      {!isDesktop && selected && (
        <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogContent className="bottom-0 left-0 top-auto max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-2xl p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-12 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom">
            <DialogTitle className="sr-only">{selected.title}</DialogTitle>
            <DialogDescription className="sr-only">Details and actions</DialogDescription>
            <Preview a={selected} />
          </DialogContent>
        </Dialog>
      )}
    </Shell>
  );
}

export function VariantC2({ state }: { state: LabState }) {
  if (state === 'events-empty') return <EventsPage empty />;
  if (state === 'events-some') return <EventsPage empty={false} />;
  return <ArtifactsPage key={state} state={state} />;
}
