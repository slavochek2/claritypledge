/**
 * @file artifacts-page.tsx
 * @description P1545 WP3: the Artifacts page (route /artifacts). Letters and canvases in one list.
 *
 * Tabs Yours / Shared with you (`?tab=yours|shared`, default yours, replace history), chips All ·
 * Letters · Canvases (`?type=`), title search across the current tab. One row per item; a tap opens
 * the item's existing page. The data and every rule live in artifacts-view-model.ts and
 * use-artifacts-data.ts; this file is layout and wiring.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Video } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { ClarityPageLoader, ClarityLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageFrame } from '@/app/components/layout/page-header';
import { docsService } from '@/app/data/docs-service';
import { markDeliveryRead } from '@/app/data/letters-service';
import { canvasService } from '@/app/data/canvas-service';
import { useOpenLiveInvite, type OpenLiveInvite } from '@/app/hooks/useOpenLiveInvite';
import { ARTIFACTS_READ_EVENT } from '@/app/hooks/useUnreadSharedCount';
import type { ContentVisibility } from '@/app/types';
import { ArtifactsHeader } from './artifacts-header';
import { ArtifactListRow } from './artifact-row';
import { useArtifactsData, type TabData } from './use-artifacts-data';
import {
  ARTIFACT_TYPE_FILTERS,
  parseTab,
  parseType,
  unreadSharedCount,
  visibleRows,
  type ArtifactRow,
  type ArtifactTab,
  type ArtifactTypeFilter,
} from './artifacts-view-model';

const TYPE_LABEL: Record<ArtifactTypeFilter, string> = { all: 'All', letters: 'Letters', canvases: 'Canvases' };

const TAB_TRIGGER =
  'min-h-11 rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none';

export function ArtifactsPage() {
  const navigate = useNavigate();
  const { user, isLoading, sessionChecked } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const type = parseType(searchParams.get('type'));

  useEffect(() => {
    if (!sessionChecked || isLoading) return;
    if (!user) navigate('/login?redirect=/artifacts', { replace: true });
  }, [user, isLoading, sessionChecked, navigate]);

  if (!sessionChecked || isLoading) return <ClarityPageLoader />;
  if (!user) return null;

  return (
    <ArtifactsView
      userId={user.id}
      userSlug={user.slug ?? null}
      tab={tab}
      type={type}
      setParams={setSearchParams}
    />
  );
}

interface ViewProps {
  userId: string;
  userSlug: string | null;
  tab: ArtifactTab;
  type: ArtifactTypeFilter;
  setParams: ReturnType<typeof useSearchParams>[1];
}

function ArtifactsView({ userId, userSlug, tab, type, setParams }: ViewProps) {
  const navigate = useNavigate();
  const { invite } = useOpenLiveInvite();
  const data = useArtifactsData(userId, userSlug);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  // Keys opened on this page: the unread dot clears at once, before the server answers.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());

  // URL writes REPLACE (as /feed, /stake and the old Letters page): Back leaves the page.
  const update = useCallback(
    (next: { tab?: ArtifactTab; type?: ArtifactTypeFilter }) => {
      setParams(
        prev => {
          const params = new URLSearchParams(prev);
          if (next.tab !== undefined) params.set('tab', next.tab);
          if (next.type !== undefined) {
            if (next.type === 'all') params.delete('type');
            else params.set('type', next.type);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Radix fires onValueChange twice per click (focus + click); writing the same tab is a no-op below.
  const handleTab = (value: string) => {
    const next = parseTab(value);
    if (next !== tab) update({ tab: next });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  // "Clear search" on a no-match state: drops the query and the type chip together.
  const clearFilters = () => {
    setQuery('');
    update({ type: 'all' });
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

  // Opening an unread item marks it read (letters: the delivery; canvases: the artifact read state),
  // then tells the nav badge to re-read. The navigation itself is the row link's.
  const handleOpen = (row: ArtifactRow) => {
    if (!row.unread || opened.has(row.key)) return;
    setOpened(prev => new Set(prev).add(row.key));
    let done: Promise<void> | null = null;
    if (row.state === 'received-letter' && row.ref.deliveryId) done = markDeliveryRead(row.ref.deliveryId);
    else if (row.state === 'received-canvas' && row.ref.ownerId && row.ref.canvasName) {
      done = canvasService.markCanvasRead(row.ref.ownerId, row.ref.canvasName);
    }
    done?.then(
      () => window.dispatchEvent(new Event(ARTIFACTS_READ_EVENT)),
      () => toast.error('Failed to mark as read'),
    );
  };

  const withOpened = useCallback(
    (rows: ArtifactRow[]) => rows.map(r => (opened.has(r.key) ? { ...r, unread: false } : r)),
    [opened],
  );
  const yours = useMemo(() => ({ ...data.yours, rows: withOpened(data.yours.rows) }), [data.yours, withOpened]);
  const shared = useMemo(() => ({ ...data.shared, rows: withOpened(data.shared.rows) }), [data.shared, withOpened]);
  const unread = unreadSharedCount(shared.rows) + (invite && !invite.closedAt ? 1 : 0);

  const sharedAria = unread > 0 ? `Shared with you, ${unread} unread` : 'Shared with you';

  return (
    <main aria-label="Artifacts" className="min-h-screen">
      {/* The bottom padding clears the phone tab bar (4rem) plus the home-indicator inset, with air to spare. */}
      <PageFrame size="reading" className="pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8">
        {/* Capped so the "…" at each row's right edge stays near the content on wide screens. */}
        <div className="max-w-3xl">
        <ArtifactsHeader
          searchOpen={searchOpen}
          query={query}
          onOpenSearch={() => setSearchOpen(true)}
          onCloseSearch={closeSearch}
          onQuery={setQuery}
          creating={creating}
          onCreateLetter={visibility => void handleCreateLetter(visibility)}
        />

        <Tabs value={tab} onValueChange={handleTab}>
          <div className="sticky top-0 z-10 bg-background">
            <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger value="yours" className={TAB_TRIGGER}>Yours</TabsTrigger>
              <TabsTrigger value="shared" aria-label={sharedAria} className={`${TAB_TRIGGER} gap-2`}>
                Shared with you
                {/* Unread is a mark, not a count of items: a dot, as the nav badges mark it. */}
                {unread > 0 && (
                  <span data-testid="shared-unread-dot" aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TypeChips value={type} onChange={next => update({ type: next })} />

          <TabsContent value="yours" className="mt-0">
            <ArtifactList
              tab="yours"
              data={yours}
              type={type}
              query={query}
              userSlug={userSlug}
              onOpen={handleOpen}
              onRefresh={data.refresh}
              onClearFilters={clearFilters}
            />
          </TabsContent>
          <TabsContent value="shared" className="mt-0">
            <ArtifactList
              tab="shared"
              data={shared}
              type={type}
              query={query}
              userSlug={userSlug}
              onOpen={handleOpen}
              onRefresh={data.refresh}
              onClearFilters={clearFilters}
              invite={type === 'all' && !query.trim() && invite && !invite.closedAt ? invite : null}
            />
          </TabsContent>
        </Tabs>
        </div>
      </PageFrame>
    </main>
  );
}

function TypeChips({ value, onChange }: { value: ArtifactTypeFilter; onChange: (v: ArtifactTypeFilter) => void }) {
  return (
    <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2 py-3">
      {ARTIFACT_TYPE_FILTERS.map(t => {
        const on = t === value;
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t)}
            className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              on
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {TYPE_LABEL[t]}
          </button>
        );
      })}
    </div>
  );
}

interface ListProps {
  tab: ArtifactTab;
  data: TabData;
  type: ArtifactTypeFilter;
  query: string;
  userSlug: string | null;
  onOpen: (row: ArtifactRow) => void;
  onRefresh: () => Promise<void>;
  onClearFilters: () => void;
  invite?: OpenLiveInvite | null;
}

function ArtifactList({ tab, data, type, query, userSlug, onOpen, onRefresh, onClearFilters, invite = null }: ListProps) {
  const refresh = () => { void onRefresh(); };

  if (data.status === 'loading') {
    return (
      <div className="flex justify-center py-12" role="status" aria-label="Loading">
        <ClarityLoader size="lg" />
      </div>
    );
  }

  if (data.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {tab === 'yours' ? 'Something went wrong loading your artifacts.' : 'Something went wrong loading what was shared with you.'}
        </p>
        <Button variant="outline" onClick={refresh} className="min-h-10">Retry</Button>
      </div>
    );
  }

  const rows = visibleRows(data.rows, type, query);

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
      {invite && <LiveInviteRow invite={invite} />}
      {rows.length === 0 && !invite ? (
        <EmptyLine tab={tab} total={data.rows.length} type={type} query={query} onClear={onClearFilters} />
      ) : (
        <ul className="flex flex-col divide-y divide-border/60" aria-label={tab === 'yours' ? 'Your artifacts' : 'Shared with you'}>
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
  tab, total, type, query, onClear,
}: { tab: ArtifactTab; total: number; type: ArtifactTypeFilter; query: string; onClear: () => void }) {
  const box = 'flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground';
  const q = query.trim();
  if (q && total > 0) {
    // Name the scope: the search covers this tab and this type only.
    const noun = type === 'all' ? 'artifacts' : type;
    const scope = tab === 'shared' ? ' shared with you' : '';
    return (
      <div className={box}>
        <p>{`No ${noun}${scope} match “${q}”.`}</p>
        <button type="button" onClick={onClear} className="inline-flex min-h-10 items-center rounded-sm px-2 font-medium text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Clear search
        </button>
      </div>
    );
  }
  if (total > 0 && type !== 'all') return <p className={box}>No {type} here yet.</p>;
  if (tab === 'shared') return <p className={box}>Nothing has been shared with you yet.</p>;
  return (
    <p className={box}>
      Nothing here yet. Use <span className="sm:hidden">New</span>
      <span className="hidden sm:inline">New artifact</span> to start a letter.
    </p>
  );
}

/** P703: the open live invite, above the shared items; it disappears when the session closes. */
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
      <Button size="sm" className="min-h-10 shrink-0 bg-blue-500 text-white hover:bg-blue-700" onClick={() => navigate(`/live/${invite.code}`)}>
        Join
      </Button>
    </div>
  );
}
