/**
 * @file point-changes-people.tsx
 * @description P1061: the people behind the Changes chart, largest change first, six at a time, each opening
 * into their own graph and verifications.
 */
import { useState, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { PositionBadge } from '@/app/components/shared/PositionBadge';
import { POSITION_LABELS } from '@/app/types';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { Button } from '@/components/ui/button';
import type { MovementPerson, PointMovementRows } from '@/app/data/movement-service';
import { hasDates, inRange, NO_DATES, positionOfLevel, verificationsOf, type DayRange, type Reading } from '@/lib/position-movement';
import { PersonLog } from './movement-charts';
import { byChangeThenName } from './movement-scope';

const ROWS_SHOWN = 6;

const said = (level: number) => POSITION_LABELS[positionOfLevel(level)];

const ROW = 'flex min-h-11 w-full items-start gap-3 rounded-lg border border-border bg-muted p-3 text-left sm:items-center';

/** What a row shows: the avatar, the name, first → latest, and the chevron when the row opens. */
function RowFace({ reading, person, name, chevron }: { reading: Reading; person: MovementPerson | undefined; name: string; chevron: ReactNode }) {
  return (
    <>
      <GravatarAvatar
        name={name}
        size="sm"
        photoUrl={person?.avatarUrl ?? undefined}
        avatarColor={person?.avatarColor ?? undefined}
        isPledger={person?.hasPledged ?? false}
        showRing={false}
        className="!h-5 !w-5 !text-[10px]"
      />
      {/* Phone: the name and the arrow share the first line, the change takes the whole width under them. */}
      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]">
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
        <span className="sm:order-3">{chevron}</span>
        <span className="col-span-2 inline-flex min-w-0 items-center gap-1.5 sm:order-2 sm:col-span-1" data-testid="row-change">
          <PositionBadge position={positionOfLevel(reading.first)} />
          <ArrowRight size={12} className="shrink-0 text-muted-foreground" aria-hidden />
          <PositionBadge position={positionOfLevel(reading.latest)} />
        </span>
      </span>
    </>
  );
}

/** One person: the first position, the latest one, and their whole graph and log behind the row. */
function PersonRow({ reading, data, range, open, onToggle }: { reading: Reading; data: PointMovementRows; range: DayRange; open: boolean; onToggle: () => void }) {
  const person = data.people.get(reading.userId);
  const name = person?.name ?? 'Someone';
  const { first, latest } = reading;
  // With dates set the graph draws only the positions inside them, so only the verifications inside them belong on it:
  // one from outside would be drawn beside the first or last dot, as if it had happened then.
  const verifications = verificationsOf(reading.userId, data.stories, data.verifications, data.agentIds)
    .filter(v => !hasDates(range) || inRange(v.at, range)).map(v => ({
    storyId: v.storyId,
    authorName: data.people.get(v.authorId)?.name ?? 'Someone',
    at: v.at,
  }));
  const label = `${name}’s positions over time: ${said(first)}${latest !== first ? `, then ${said(latest)}` : ', unchanged'}`;
  // A holder with no position in the history and no verification has nothing behind the row: it does not open.
  // Screen readers hear the same sentence as the button's label, not the badges one by one.
  if (reading.entries.length === 0 && verifications.length === 0) {
    return (
      <div className={ROW} data-testid="row-static">
        {/* A real box, not display: contents: WebKit has dropped aria-hidden on boxless elements. */}
        <span className="flex min-w-0 flex-1 items-start gap-3 sm:items-center" aria-hidden><RowFace reading={reading} person={person} name={name} chevron={null} /></span>
        <span className="sr-only">{label}</span>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={label}
        onClick={onToggle}
        className={`${ROW} transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
      >
        <RowFace
          reading={reading}
          person={person}
          name={name}
          chevron={open ? <ChevronDown size={14} className="shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" aria-hidden />}
        />
      </button>
      {open && (
        <div className="ml-2 mt-2 border-l-2 border-gray-200 pb-1 pl-4">
          <PersonLog entries={reading.entries} verifications={verifications} name={name} />
        </div>
      )}
    </div>
  );
}

/** The people behind the chart, largest change first. Six at a time. */
export function PointChangesPeople({ readings, data, range = NO_DATES }: { readings: Reading[]; data: PointMovementRows; range?: DayRange }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const nameOf = (r: Reading) => data.people.get(r.userId)?.name ?? 'Someone';
  const sorted = [...readings].sort(byChangeThenName(nameOf));
  const shown = all ? sorted : sorted.slice(0, ROWS_SHOWN);
  if (sorted.length === 0) return <p className="py-3 text-center text-sm text-muted-foreground">(nobody here)</p>;
  return (
    <div className="space-y-3">
      {shown.map(r => (
        <PersonRow key={r.userId} reading={r} data={data} range={range} open={openId === r.userId} onToggle={() => setOpenId(openId === r.userId ? null : r.userId)} />
      ))}
      {sorted.length > ROWS_SHOWN && (
        <Button variant="outline" className="min-h-11 w-full" onClick={() => setAll(!all)}>
          {all ? `Show ${ROWS_SHOWN}` : `Show all ${sorted.length}`}
        </Button>
      )}
    </div>
  );
}
