/**
 * @file artifacts-page.tsx
 * @description P1545 WP3: the Artifacts page (route /artifacts), split by kind.
 *
 * Tabs Letters | Canvases (`?tab=letters|canvases`, default letters, replace history); inside Letters a filter
 * Drafts · Sent · Received (`&list=`, default drafts), inside Canvases Mine · Shared with me (default mine). One list
 * at a time, title search across the current list. One row per item; the row body is not a link, its buttons act (a "…", a
 * secondary and a primary; see artifact-row-actions.tsx) and a sent row opens in place to show who it went to. Old `tab=yours|shared&type=` links are rewritten in place. The data and every rule live in
 * artifacts-view-model.ts and use-artifacts-data.ts; this file is layout and wiring.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Video } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { ArtifactListSkeleton } from './artifact-list-skeleton';
import { SectionWait } from '@/components/ui/section-wait';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageFrame } from '@/app/components/layout/page-header';
import { docsService } from '@/app/data/docs-service';
import { clearSenderNewForDelivery, markDeliveryRead } from '@/app/data/letters-service';
import { canvasService } from '@/app/data/canvas-service';
import { useOpenLiveInvite, type OpenLiveInvite } from '@/app/hooks/useOpenLiveInvite';
import { ARTIFACTS_READ_EVENT } from '@/app/hooks/useUnreadSharedCount';
import type { ContentVisibility } from '@/app/types';
import { ArtifactsHeader } from './artifacts-header';
import { ArtifactListRow } from './artifact-row';
import { useArtifactsData, type ListData } from './use-artifacts-data';
import {
  ARTIFACT_TABS,
  DEFAULT_LIST,
  TAB_LISTS,
  filterByQuery,
  listHasDot,
  resolveArtifactsLocation,
  tabHasDot,
  type ArtifactList,
  type ArtifactRow,
  type ArtifactTab,
  type ArtifactsModel,
} from './artifacts-view-model';

const TAB_LABEL: Record<ArtifactTab, string> = { letters: 'Letters', canvases: 'Canvases' };
const LIST_LABEL: Record<ArtifactList, string> = {
  drafts: 'Drafts',
  sent: 'Sent',
  received: 'Received',
  mine: 'Mine',
  shared: 'Shared with me',
};
// What a "no match" line calls the items of each list.
const LIST_NOUN: Record<ArtifactList, string> = {
  drafts: 'drafts',
  sent: 'sent letters',
  received: 'received letters',
  mine: 'canvases',
  shared: 'canvases shared with me',
};

const TAB_TRIGGER =
  'min-h-11 rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none';

export function ArtifactsPage() {
  const navigate = useNavigate();
  const { user, isLoading, sessionChecked } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const here = useLocation();
  const location = resolveArtifactsLocation(searchParams);

  // An old `tab=yours|shared&type=` link is rewritten to the new scheme, replacing history. It already renders the
  // right list (the location above reads it), so there is no flash.
  useEffect(() => {
    if (location.legacy) setSearchParams(location.canonical, { replace: true });
  }, [location.legacy, location.canonical, setSearchParams]);

  useEffect(() => {
    if (!sessionChecked || isLoading) return;
    // The whole address comes back after sign-in, so a link to Sent or Shared with me lands on that list.
    if (!user) navigate(`/login?redirect=${encodeURIComponent(here.pathname + here.search)}`, { replace: true });
  }, [user, isLoading, sessionChecked, navigate, here.pathname, here.search]);

  if (!sessionChecked || isLoading) return <ClarityPageLoader />;
  if (!user) return null;

  return (
    <ArtifactsView
      userId={user.id}
      userSlug={user.slug ?? null}
      tab={location.tab}
      list={location.list}
      setParams={setSearchParams}
    />
  );
}

interface ViewProps {
  userId: string;
  userSlug: string | null;
  tab: ArtifactTab;
  list: ArtifactList;
  setParams: ReturnType<typeof useSearchParams>[1];
}

function ArtifactsView({ userId, tab, list, userSlug, setParams }: ViewProps) {
  const navigate = useNavigate();
  const { invite } = useOpenLiveInvite();
  const data = useArtifactsData(userId, userSlug);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  // Keys opened on this page: the unread dot clears at once, before the server answers.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());

  // URL writes REPLACE (as /feed, /stake and the old Letters page): Back leaves the page. The default list of a tab
  // is the bare URL, so `/artifacts` stays the Letters / Drafts address.
  const update = useCallback(
    (next: { tab: ArtifactTab; list?: ArtifactList }) => {
      setParams(
        prev => {
          const params = new URLSearchParams(prev);
          params.set('tab', next.tab);
          if (next.list && next.list !== DEFAULT_LIST[next.tab]) params.set('list', next.list);
          else params.delete('list');
          return params;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Radix fires onValueChange twice per click (focus + click); writing the same tab is a no-op below.
  const handleTab = (value: string) => {
    const next: ArtifactTab = value === 'canvases' ? 'canvases' : 'letters';
    if (next !== tab) update({ tab: next });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  const handleCreateLetter = async (visibility: ContentVisibility) => {
    setCreating(true);
    try {
      const doc = await docsService.createDoc(visibility);
      navigate(`/letters/drafts/${doc.id}`);
    } catch {
      toast.error("Couldn't create draft.");
      setCreating(false);
    }
  };

  // Opening an item with something new marks it read (received letters: the delivery; canvases: the artifact read state;
  // sent letters: the sender's seen mark and the explain-backs on each new delivery),
  // then tells the nav badge to re-read. The navigation itself is the row link's.
  const handleOpen = (row: ArtifactRow) => {
    if (!(row.unread || row.hasNew) || opened.has(row.key)) return;
    setOpened(prev => new Set(prev).add(row.key));
    let done: Promise<void> | null = null;
    if (row.state === 'sent') {
      // Details: clear the sender's "new" on every delivery that has some (the overview is handed who they were).
      done = Promise.all((row.ref.newDeliveryIds ?? []).map(id => clearSenderNewForDelivery(id))).then(() => undefined);
    } else if (row.state === 'received-letter' && row.ref.deliveryId) done = markDeliveryRead(row.ref.deliveryId);
    else if (row.state === 'received-canvas' && row.ref.ownerId && row.ref.canvasName) {
      done = canvasService.markCanvasRead(row.ref.ownerId, row.ref.canvasName);
    }
    if (!done) return;
    done.then(
      () => window.dispatchEvent(new Event(ARTIFACTS_READ_EVENT)),
      () => {
        // Roll back: the unread state returns and the next open retries.
        setOpened(prev => {
          const next = new Set(prev);
          next.delete(row.key);
          return next;
        });
        toast.error('Failed to mark as read');
      },
    );
  };

  // Drop a key from the override once the server reports that row read: a later re-share must show unread again.
  const serverRows = useMemo(
    () => [...data.lists.sent.rows, ...data.lists.received.rows, ...data.lists.shared.rows],
    [data.lists.sent.rows, data.lists.received.rows, data.lists.shared.rows],
  );
  useEffect(() => {
    if (opened.size === 0) return;
    const serverRead = new Set(serverRows.filter(r => !r.unread && !r.hasNew).map(r => r.key));
    const confirmed = [...opened].filter(k => serverRead.has(k));
    if (confirmed.length === 0) return;
    setOpened(prev => {
      const next = new Set(prev);
      for (const k of confirmed) next.delete(k);
      return next;
    });
  }, [serverRows, opened]);

  const withOpened = useCallback(
    (rows: ArtifactRow[]) => rows.map(r => (opened.has(r.key) ? { ...r, unread: false, hasNew: false } : r)),
    [opened],
  );
  const lists = useMemo<Record<ArtifactList, ListData>>(
    () => ({
      drafts: data.lists.drafts,
      sent: { ...data.lists.sent, rows: withOpened(data.lists.sent.rows) },
      received: { ...data.lists.received, rows: withOpened(data.lists.received.rows) },
      mine: data.lists.mine,
      shared: { ...data.lists.shared, rows: withOpened(data.lists.shared.rows) },
    }),
    [data.lists, withOpened],
  );
  // The dots read the same rows the lists show, so an item opened here clears its dot, its chip's and its tab's at once.
  // The live invite carries its own dot above the tabs and is not counted in either list.
  const model = useMemo<ArtifactsModel>(
    () => ({
      drafts: lists.drafts.rows,
      sent: lists.sent.rows,
      received: lists.received.rows,
      mine: lists.mine.rows,
      shared: lists.shared.rows,
    }),
    [lists],
  );

  return (
    <main aria-label="Artifacts" className="min-h-screen">
      {/* The bottom padding clears the phone tab bar (4rem) plus the home-indicator inset, with air to spare. */}
      <PageFrame size="reading" className="pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8">
        {/* Capped so the unread dot at each row's right edge stays near the content on wide screens. */}
        <div className="max-w-3xl">
        <ArtifactsHeader
          searchOpen={searchOpen}
          query={query}
          onOpenSearch={() => setSearchOpen(true)}
          onCloseSearch={closeSearch}
          onQuery={setQuery}
          showNewLetter={tab === 'letters'}
          creating={creating}
          onCreateLetter={visibility => void handleCreateLetter(visibility)}
        />

        {/* The live invite sits above both tabs: it is a session to join, not an item of either list. */}
        {invite && !invite.closedAt && <LiveInviteRow invite={invite} />}

        <Tabs value={tab} onValueChange={handleTab}>
          {/* Not sticky: header, tabs and filter scroll together, as on Feed and Chats. */}
          <div>
            <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
              {ARTIFACT_TABS.map(t => {
                const dot = tabHasDot(t, model);
                return (
                  <TabsTrigger key={t} value={t} aria-label={dot ? `${TAB_LABEL[t]}, new` : TAB_LABEL[t]} className={`${TAB_TRIGGER} gap-2`}>
                    {TAB_LABEL[t]}
                    {dot && <Dot testId={`tab-dot-${t}`} />}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {ARTIFACT_TABS.map(t => (
            <TabsContent key={t} value={t} className="mt-0">
              <ListFilter
                tab={t}
                value={list}
                model={model}
                onChange={next => update({ tab: t, list: next })}
              />
              <ListBody
                list={list}
                data={lists[list]}
                query={query}
                userSlug={userSlug}
                onOpen={handleOpen}
                onRefresh={data.refresh}
                onClearSearch={() => setQuery('')}
              />
            </TabsContent>
          ))}
        </Tabs>
        </div>
      </PageFrame>
    </main>
  );
}

/** Unread is a mark, not a count of items: a dot, as the nav badges mark it. */
function Dot({ testId }: { testId: string }) {
  return <span data-testid={testId} aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />;
}

function dotLabel(list: ArtifactList): string {
  return list === 'sent' ? `${LIST_LABEL[list]}, new activity` : `${LIST_LABEL[list]}, unread`;
}

/** The lists of the current tab, one at a time. */
function ListFilter({
  tab, value, model, onChange,
}: { tab: ArtifactTab; value: ArtifactList; model: ArtifactsModel; onChange: (v: ArtifactList) => void }) {
  return (
    <div role="group" aria-label={`${TAB_LABEL[tab]} lists`} className="flex flex-wrap gap-2 py-3">
      {TAB_LISTS[tab].map(l => {
        const on = l === value;
        const dot = listHasDot(l, model[l]);
        return (
          <button
            key={l}
            type="button"
            aria-pressed={on}
            aria-label={dot ? dotLabel(l) : undefined}
            onClick={() => onChange(l)}
            className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              on
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {LIST_LABEL[l]}
            {dot && <Dot testId={`list-dot-${l}`} />}
          </button>
        );
      })}
    </div>
  );
}

interface ListProps {
  list: ArtifactList;
  data: ListData;
  query: string;
  userSlug: string | null;
  onOpen: (row: ArtifactRow) => void;
  onRefresh: () => Promise<void>;
  onClearSearch: () => void;
}

function ListBody({ list, data, query, userSlug, onOpen, onRefresh, onClearSearch }: ListProps) {
  const refresh = () => { void onRefresh(); };

  if (data.status === 'loading' || data.status === 'error') {
    return (
      <div>
        {data.status === 'loading' ? (
          <SectionWait onRetry={refresh}><ArtifactListSkeleton /></SectionWait>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {list === 'received' || list === 'shared'
                ? 'Something went wrong loading what was shared with you.'
                : 'Something went wrong loading your artifacts.'}
            </p>
            <Button variant="outline" onClick={refresh} className="min-h-10">Retry</Button>
          </div>
        )}
      </div>
    );
  }

  const rows = filterByQuery(data.rows, query);

  return (
    <div>
      {data.partial && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 pb-2 text-sm text-muted-foreground">
          Some items could not be loaded.
          <button type="button" onClick={refresh} className="inline-flex min-h-10 items-center font-medium text-blue-600 hover:underline">
            Retry
          </button>
        </p>
      )}
      {data.pending && (
        // [FOUNDER DECISION: "Loading more…" copy is a placeholder.]
        <p role="status" className="pb-2 text-sm text-muted-foreground">Loading more…</p>
      )}
      {rows.length === 0 ? (
        data.pending ? null : <EmptyLine list={list} total={data.rows.length} query={query} onClear={onClearSearch} />
      ) : (
        <ul className="flex flex-col divide-y divide-border" aria-label={LIST_LABEL[list]}>
          {rows.map(row => (
            <ArtifactListRow key={row.key} row={row} userSlug={userSlug} onOpen={onOpen} onChanged={refresh} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** [FOUNDER DECISION: all empty-state copy is a placeholder.] */
function EmptyLine({
  list, total, query, onClear,
}: { list: ArtifactList; total: number; query: string; onClear: () => void }) {
  const box = 'flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground';
  const q = query.trim();
  if (q && total > 0) {
    // Name the scope: the search covers this list only.
    return (
      <div className={box}>
        <p>{`No ${LIST_NOUN[list]} match “${q}”.`}</p>
        <button type="button" onClick={onClear} className="inline-flex min-h-10 items-center rounded-sm px-2 font-medium text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Clear search
        </button>
      </div>
    );
  }
  switch (list) {
    case 'received':
    case 'shared':
      return <p className={box}>Nothing has been shared with you yet.</p>;
    case 'sent':
      return <p className={box}>No letters sent yet.</p>;
    case 'mine':
      return <p className={box}>No canvases here yet.</p>;
    case 'drafts':
      return (
        <p className={box}>
          Nothing here yet. Use <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">New letter</span> to start a letter.
        </p>
      );
  }
}

/** P703: the open live invite, above both tabs; it disappears when the session closes. */
function LiveInviteRow({ invite }: { invite: OpenLiveInvite }) {
  const navigate = useNavigate();
  return (
    <div data-testid="live-invite-row" className="mb-2 flex items-center gap-3 rounded-lg border bg-blue-500/5 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white" aria-hidden="true">
        <Video className="h-[18px] w-[18px]" />
      </span>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" role="img" aria-label="Unread" />
      <p className="min-w-0 flex-1 text-sm font-semibold text-foreground line-clamp-2">
        <span className="font-medium">{invite.authorName || 'Someone'}</span>
        {' invited you to verify '}
        <span className="italic">{invite.storyTitle || 'a story'}</span>
      </p>
      <Button size="sm" className="min-h-10 shrink-0" onClick={() => navigate(`/live/${invite.code}`)}>
        Join
      </Button>
    </div>
  );
}
