/**
 * P955 gate fixture (P1061): position movement as a viewer sees it, built from the REAL components: the story
 * card's "N moved" chip beside the verified badge, the story page's panel, and the point page's Changes view with
 * its filter. PERMANENT RENDER SUBSTRATE, never pruned. Obviously fake data only.
 * ?phase=story-card | story-panel | point-changes | filter-open | empty | withheld
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StoryCountChip } from '@/app/components/movement/movement-bits';
import { MovementFilter } from '@/app/components/movement/movement-filter';
import { PointChangesView } from '@/app/components/movement/point-changes';
import { StoryMovementPanel } from '@/app/components/movement/story-movement-panel';
import type { MovementPerson, PointMovementRows } from '@/app/data/movement-service';
import { MovementViewLine } from '@/app/components/movement/point-movement-block';
import { offersFilter } from '@/app/components/movement/movement-scope';
import { Tabs } from '@/components/ui/tabs';
import { UnderstoodBadge } from '@/components/ui/understood-badge';
import { EVERYONE, type HistoryRow, type MovementScope, type StoryMovement } from '@/lib/position-movement';
import type { PositionType } from '@/app/types';

const PHASES = ['story-card', 'story-panel', 'point-changes', 'filter-open', 'empty', 'withheld'] as const;
type Phase = (typeof PHASES)[number];

const id = (n: number) => `user-id-${String(n).padStart(4, '0')}`;
const POINT = 'point-id-0001';
const AGENT = id(99);

const PEOPLE = new Map<string, MovementPerson>();
for (let n = 1; n <= 10; n++) {
  PEOPLE.set(id(n), { id: id(n), name: `Test Person ${n}`, slug: null, avatarUrl: null, avatarColor: null, hasPledged: false });
}

const day = (n: number) => `2026-09-${String(10 + n).padStart(2, '0')}T12:00:00.000Z`;
let rowNo = 0;
const row = (n: number, position: PositionType, d: number): HistoryRow => ({ id: `row-id-${String(++rowNo).padStart(4, '0')}`, pointId: POINT, userId: id(n), position, changedAt: day(d) });

/** Person 1 holds six positions over six days; persons 2 to 9 two each, in both directions; the agent two. */
const SIX: PositionType[] = ['strongly_disagree', 'disagree', 'unsure', 'somewhat_agree', 'agree', 'strongly_agree'];
const HISTORY: HistoryRow[] = [
  ...SIX.map((p, i) => row(1, p, i)),
  row(2, 'agree', 0), row(2, 'disagree', 4),
  row(3, 'disagree', 1), row(3, 'agree', 5),
  row(4, 'somewhat_agree', 2), row(4, 'somewhat_agree', 3), row(4, 'unsure', 6),
  row(5, 'unsure', 0), row(5, 'agree', 2),
  row(6, 'strongly_agree', 1), row(6, 'agree', 3),
  row(7, 'disagree', 2), row(7, 'strongly_disagree', 4),
  row(8, 'unsure', 3), row(8, 'unsure', 5),
  row(9, 'agree', 0), row(9, 'strongly_disagree', 6),
  row(99, 'agree', 0), row(99, 'disagree', 1),
];
const CURRENT = [
  { pointId: POINT, userId: id(1), position: 'strongly_agree' as PositionType },
  { pointId: POINT, userId: id(2), position: 'disagree' as PositionType },
  { pointId: POINT, userId: id(3), position: 'agree' as PositionType },
  { pointId: POINT, userId: id(4), position: 'unsure' as PositionType },
  { pointId: POINT, userId: id(5), position: 'agree' as PositionType },
  { pointId: POINT, userId: id(6), position: 'agree' as PositionType },
  { pointId: POINT, userId: id(7), position: 'strongly_disagree' as PositionType },
  { pointId: POINT, userId: id(8), position: 'unsure' as PositionType },
  { pointId: POINT, userId: id(9), position: 'strongly_disagree' as PositionType },
  { pointId: POINT, userId: id(10), position: 'agree' as PositionType },
  { pointId: POINT, userId: AGENT, position: 'disagree' as PositionType },
];

const DATA: PointMovementRows = {
  pointId: POINT,
  // The author (person 10) never verifies themselves: the read leaves such rows out.
  stories: [{ id: 'story-id-0001', authorId: id(10) }, { id: 'story-id-0002', authorId: id(6) }],
  verifications: [
    { id: 'verification-id-0001', storyId: 'story-id-0001', listenerId: id(2), accuracyAchieved: true, createdAt: day(2) },
    { id: 'verification-id-0002', storyId: 'story-id-0001', listenerId: id(1), accuracyAchieved: true, createdAt: day(1) },
    { id: 'verification-id-0003', storyId: 'story-id-0002', listenerId: id(1), accuracyAchieved: true, createdAt: day(3) },
  ],
  history: HISTORY,
  current: CURRENT,
  agentIds: [AGENT],
  people: PEOPLE,
  events: [{ id: 'event-id-0001', title: 'Test Event A', datetime: day(0), memberIds: [id(2), id(3), id(4), id(5)] }],
  groups: [{ id: 'group-id-0001', name: 'Test Group A', memberIds: [id(6), id(7), id(8)] }],
};

const EMPTY_DATA: PointMovementRows = { ...DATA, history: [], current: [], verifications: [] };

const counts = (switched: number, other: number, same: number) => ({ switched, other, same });
const MOVEMENT: StoryMovement = {
  storyId: 'story-id-0001',
  verifiedCount: 5,
  moved: 3,
  points: [
    { pointId: 'point-id-0001', arrows: { left: 1, same: 1, right: 2 }, verified: counts(1, 2, 1), notVerified: counts(2, 3, 1) },
    { pointId: 'point-id-0002', arrows: { left: 0, same: 4, right: 0 }, verified: counts(0, 0, 4), notVerified: counts(0, 0, 2) },
  ],
};
const WITHHELD: StoryMovement = {
  ...MOVEMENT,
  points: MOVEMENT.points.map(p => (p.pointId === 'point-id-0001' ? { ...p, notVerified: counts(1, 2, 1) } : p)),
};
const POINTS = [
  { id: 'point-id-0001', statement: 'Test statement one, which is long enough to wrap onto a second line on a narrow screen.' },
  { id: 'point-id-0002', statement: 'Test statement two.' },
];

function ChangesFrame({ data, defaultOpen }: { data: PointMovementRows; defaultOpen: boolean }) {
  const [scope, setScope] = useState<MovementScope>(EVERYONE);
  return (
    // The page's own switch line (MovementViewLine), as PointPositionsWithChanges renders it.
    <Tabs value="changes">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <MovementViewLine view="changes" filter={offersFilter(data, scope) ? <MovementFilter data={data} scope={scope} onChange={setScope} signedIn defaultOpen={defaultOpen} /> : undefined} />
        {/* A new view for every filter choice, as the page does. */}
        <PointChangesView key={JSON.stringify(scope)} data={data} scope={scope} />
      </div>
    </Tabs>
  );
}

function Surface({ phase }: { phase: Phase }) {
  if (phase === 'story-card') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4">
        <UnderstoodBadge count={5} size="xs" />
        <StoryCountChip movement={MOVEMENT} authorName="Test Person 1" pointCount={2} />
      </div>
    );
  }
  if (phase === 'story-panel' || phase === 'withheld') {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <StoryMovementPanel movement={phase === 'withheld' ? WITHHELD : MOVEMENT} authorName="Test Person 1" points={POINTS} defaultOpen />
      </div>
    );
  }
  return <ChangesFrame data={phase === 'empty' ? EMPTY_DATA : DATA} defaultOpen={phase === 'filter-open'} />;
}

export function GateFixture() {
  const [params] = useSearchParams();
  const requested = params.get('phase') as Phase | null;
  const phase: Phase = requested && PHASES.includes(requested) ? requested : 'point-changes';
  return (
    <div className="mx-auto max-w-lg space-y-3 p-3">
      <nav className="flex flex-wrap gap-2 text-sm">
        {PHASES.map(p => <a key={p} className="inline-flex min-h-11 items-center px-2 text-blue-600 underline" href={`/tree/_gate/position-movement?phase=${p}`}>{p}</a>)}
      </nav>
      <Surface phase={phase} />
    </div>
  );
}

export default GateFixture;
