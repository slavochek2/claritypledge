/**
 * @file point-changes.tsx
 * @description P1061: the "Changes" view of the point page: where everyone counted stood first and latest, a
 * filter by change, and the people, each opening into their own graph and verifications. The page mounts a new
 * view for every filter choice, so a filter by change never outlives its people.
 */
import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { PointMovementRows } from '@/app/data/movement-service';
import { arrowsOf, changeOf, chosenPeople, directionOf, hasDates, isEveryone, readingsOf, type Arrows, type Direction, type MovementScope, type Reading } from '@/lib/position-movement';
import { BeforeAfterChart } from './movement-charts';
import { describeScope } from './movement-scope';
import { PointChangesPeople } from './point-changes-people';

type TabDef = { id: Direction; name: string; count: number; face: ReactNode };

/** The "Filter by position" tabs, by change instead. A word over its number; a second click shows everyone again. */
function ChangeTabs({ tabs, active, onChange }: { tabs: TabDef[]; active: Direction | 'all'; onChange: (next: Direction | 'all') => void }) {
  return (
    <div>
      <p className="px-4 pb-1 pt-3 text-xs text-gray-500">Filter by change:</p>
      <div className="flex border-b border-border" role="group" aria-label="Filter by change">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            aria-label={`${tab.name} (${tab.count})`}
            aria-pressed={active === tab.id}
            onClick={() => onChange(active === tab.id ? 'all' : tab.id)}
            className={`relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${active === tab.id ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <span className="inline-flex items-center gap-1">{tab.face}</span>
            <span className="text-base font-semibold tabular-nums">{tab.count}</span>
            {active === tab.id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PointChangesView({ data, scope }: { data: PointMovementRows; scope: MovementScope }) {
  const [filter, setFilter] = useState<Direction | 'all'>('all');
  const chosen = chosenPeople(scope, data.events, data.groups);
  const readings = readingsOf(data.history, data.current, data.agentIds, { from: scope.from, to: scope.to })
    .filter(r => chosen === null || chosen.has(r.userId));
  const changes = readings.map(changeOf);
  const arrows = arrowsOf(changes);
  const listed = filter === 'all' ? readings : readings.filter(r => directionOf(changeOf(r)) === filter);
  return (
    <div data-testid="changes-block">
      <div className="space-y-3 p-4">
        {/* The button says only "Filter", so a filter that is on is spelled out here. */}
        {!isEveryone(scope) && <p className="break-words text-sm text-muted-foreground" data-testid="scope-summary">{describeScope(scope, data)}</p>}
        <BeforeAfterChart readings={changes} dated={hasDates(scope)} label="Where everyone counted stood, first and latest" />
      </div>
      {/* Nobody to list: the chart's one sentence says so; no tabs of zeros, no second "nobody". */}
      {readings.length > 0 && <ChangesList filter={filter} onFilter={setFilter} arrows={arrows} listed={listed} data={data} />}
    </div>
  );
}

function ChangesList({ filter, onFilter, arrows, listed, data }: {
  filter: Direction | 'all';
  onFilter: (next: Direction | 'all') => void;
  arrows: Arrows;
  listed: Reading[];
  data: PointMovementRows;
}) {
  return (
    <>
      <ChangeTabs
        active={filter}
        onChange={onFilter}
        tabs={[
          { id: 'left', name: 'Moved toward disagree', count: arrows.left, face: <><ArrowLeft size={14} aria-hidden />Disagree</> },
          { id: 'same', name: 'Same position', count: arrows.same, face: 'Same' },
          { id: 'right', name: 'Moved toward agree', count: arrows.right, face: <>Agree<ArrowRight size={14} aria-hidden /></> },
        ]}
      />
      <div className="space-y-3 p-4">
        {/* A new list for every filter by change, so an open log or "show all" never carries over to other people. */}
        <PointChangesPeople key={filter} readings={listed} data={data} />
      </div>
    </>
  );
}
