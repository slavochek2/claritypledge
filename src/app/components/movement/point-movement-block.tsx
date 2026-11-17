/**
 * @file point-movement-block.tsx
 * @description P1061 on the point page: the positions block with its "Positions | Changes" switch (the filter on
 * the switch's line while Changes is open), and the point card's spread drawn first → today. Both read the one
 * point movement request (usePointMovement). Changes and the first → today spread appear only where the viewer
 * can read every holder's history today; elsewhere the block and the spread are exactly today's.
 *
 * `?view=changes` opens Changes; `?filter=` keeps applying to Positions only; the Changes filter is not in the
 * address.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PointPositionsBlock } from '@/app/components/social/point-positions-block';
import { PointSpreadRow } from '@/app/components/shared/position-spread';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { totalPositions, type LevelCounts } from '@/lib/position-spread';
import { arrowsOn, EVERYONE, spreadShift, storyMovements, type MovementScope } from '@/lib/position-movement';
import type { PointMovementRows } from '@/app/data/movement-service';
import { SpreadShift } from './movement-bits';
import { MovementFilter } from './movement-filter';
import { offersFilter } from './movement-scope';
import { PointChangesView } from './point-changes';
import { PointStoryArrowsContext } from './point-story-arrows-context';
import { readsAllHistory, usePointMovement } from './use-point-movement';

type View = 'positions' | 'changes';

interface MovementPoint {
  id: string;
  visibility?: string | null;
  firstValidatorId?: string | null;
}

/**
 * The switch's line, and the filter on it while Changes is open. As tall as the filter button also while it is
 * away, so the switch does not move when the view changes.
 */
export function MovementViewLine({ view, filter }: { view: View; filter?: ReactNode }) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-2 px-4 pt-3" data-testid="view-line">
      <TabsList>
        <TabsTrigger value="positions" className="min-h-10">Positions</TabsTrigger>
        <TabsTrigger value="changes" className="min-h-10">Changes</TabsTrigger>
      </TabsList>
      {view === 'changes' && filter}
    </div>
  );
}

/** Where Changes says it could not load, with a way to ask again. Positions keeps working. */
function ChangesUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-3 p-4 text-center" role="alert" data-testid="changes-error">
      <p className="text-sm text-muted-foreground">Could not load the changes</p>
      <Button variant="outline" className="min-h-11 rounded-full" onClick={onRetry}>Try again</Button>
    </div>
  );
}

/** The arrows of each story linked to this point, for the "1 story" pills of the Positions view. */
function useStoryArrows(data: PointMovementRows | undefined, pointId: string) {
  return useMemo(() => {
    if (!data) return null;
    const movements = storyMovements({
      stories: data.stories,
      storyPoints: data.stories.map(s => ({ storyId: s.id, pointId })),
      verifications: data.verifications,
      history: data.history,
      current: data.current,
      agentIds: data.agentIds,
    });
    const authorOf = new Map(data.stories.map(s => [s.id, data.people.get(s.authorId)?.name ?? 'Someone']));
    return (storyId: string) => {
      const arrows = arrowsOn(movements.get(storyId), pointId);
      return arrows ? { arrows, authorName: authorOf.get(storyId) ?? 'Someone' } : null;
    };
  }, [data, pointId]);
}

function useViewParam(enabled: boolean): [View, (next: View) => void] {
  const [params, setParams] = useSearchParams();
  const view: View = enabled && params.get('view') === 'changes' ? 'changes' : 'positions';
  const setView = useCallback((next: View) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      if (next === 'changes') p.set('view', 'changes');
      else p.delete('view');
      return p;
    }, { replace: true });
  }, [setParams]);
  return [view, setView];
}

type BlockProps = ComponentProps<typeof PointPositionsBlock>;

export function PointPositionsWithChanges({ point, signedIn, ...block }: BlockProps & { point: MovementPoint; signedIn: boolean }) {
  const canChange = readsAllHistory(point, block.viewerId);
  // Only where every holder's history is readable: elsewhere the arrows would count part of the people.
  const movement = usePointMovement(point.id, block.viewerId, JSON.stringify(block.counts), canChange);
  const arrowsFor = useStoryArrows(movement.data, point.id);
  const [view, setView] = useViewParam(canChange);
  // Whose positions Changes counts: kept while Positions is looked at, and belonging to this point only (the version
  // banner and history open another point on the same page, which must start unfiltered).
  const [held, setHeld] = useState<{ pointId: string; scope: MovementScope }>({ pointId: point.id, scope: EVERYONE });
  const scope = held.pointId === point.id ? held.scope : EVERYONE;
  const setScope = (next: MovementScope) => setHeld({ pointId: point.id, scope: next });
  // Each view draws the switch inside its own frame, so a switch made from the keyboard would lose the focus with
  // the view it left: hand it to the tab now active.
  const root = useRef<HTMLDivElement>(null);
  const fromKeyboard = useRef(false);
  useEffect(() => {
    if (!fromKeyboard.current) return;
    fromKeyboard.current = false;
    root.current?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')?.focus();
  }, [view]);
  const onViewChange = (next: string) => {
    fromKeyboard.current = document.activeElement?.getAttribute('role') === 'tab';
    setView(next === 'changes' ? 'changes' : 'positions');
  };
  const positions = (header?: ReactNode) => (
    <PointStoryArrowsContext.Provider value={arrowsFor}>
      <PointPositionsBlock {...block} header={header} />
    </PointStoryArrowsContext.Provider>
  );
  if (!canChange) return positions();
  const filter = movement.data && offersFilter(movement.data, scope) ? <MovementFilter data={movement.data} scope={scope} onChange={setScope} signedIn={signedIn} /> : undefined;
  const line = <MovementViewLine view={view} filter={filter} />;
  return (
    <Tabs ref={root} value={view} onValueChange={onViewChange}>
      <TabsContent value="positions" className="mt-0">{positions(line)}</TabsContent>
      <TabsContent value="changes" className="mt-0">
        <div className="overflow-hidden rounded-lg border border-border bg-card" data-testid="point-changes-frame">
          {line}
          {movement.failed
            ? <ChangesUnavailable onRetry={movement.retry} />
            : movement.data
              // A new view for every filter, so a filter by change never outlives its people.
              ? <PointChangesView key={JSON.stringify(scope)} data={movement.data} scope={scope} />
              : <div className="p-4"><Skeleton className="h-40 w-full" data-testid="changes-loading" /></div>}
        </div>
      </TabsContent>
    </Tabs>
  );
}

/**
 * The point card's spread: first positions (outlined) → today's, once at least one holder's first position
 * differs from their current one and the viewer can read every holder's history. Otherwise today's row, as is.
 */
export function PointCardSpread({ point, viewer, counts }: { point: MovementPoint; viewer?: { id: string } | null; counts: LevelCounts }) {
  const viewerId = viewer?.id;
  const movement = usePointMovement(point.id, viewerId, JSON.stringify(counts), readsAllHistory(point, viewerId));
  const shift = useMemo(() => (movement.data ? spreadShift(movement.data.history, movement.data.current) : null), [movement.data]);
  // Both halves must count the same people: while the rows lag the counts on screen (a position just taken or
  // removed, its read still in flight), today's row is drawn alone.
  const sameHolders = shift !== null && totalPositions(shift.first) === totalPositions(counts);
  if (!readsAllHistory(point, viewerId) || !shift?.changed || !sameHolders) return <PointSpreadRow counts={counts} withInfo className="mb-2" />;
  return <SpreadShift first={shift.first} now={counts} className="mb-2" />;
}
