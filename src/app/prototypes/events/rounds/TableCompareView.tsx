/**
 * /events/:slug/host?view=compare — one table's comparison, for the projector (founder,
 * 2026-10-06, /presi4 slide 17: "only the compare page and only with the people currently at the
 * table"). The showcase seats three people at one table; the room watches where the speaker and
 * listener stand on the evening's statements. No nav, no step bar, no profile — the table only.
 *
 * Host-only (it lives behind EventHostPage's host check), so it works whether or not the host is
 * one of the three. Shows the round on now, or the last one once the host has ended it, so the
 * slide still reads after the showcase round is over. `&table=N` picks a table (default 1).
 */
import { useMemo } from 'react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { buildCompareRows } from '@/lib/compare-positions';
import { setLabel } from '@/lib/set-labels';
import type { EventRound, RoundSeat } from '@/app/data/event-rounds-service';
import type { EventRoomMember } from '@/app/types';
import { StatementRow, type Person } from '@/app/components/compare/statement-row';
import { shortName } from './use-event-rounds';
import { useTagPositions } from './use-tag-positions';
import { RoleBadge } from './RoleBadge';
import { eventTopic } from '../prep/prep-plan';

const ROLE_WORD = { first: 'speaker', second: 'listener', observer: 'observer' } as const;
const ROLE_LIVE = { first: 'speaker', second: 'listener', observer: 'observer' } as const;

function asPerson(member: EventRoomMember | undefined): Person {
  return {
    name: member ? shortName(member.displayName) : '?',
    photoUrl: member?.profileAvatarUrl ?? undefined,
    avatarColor: member?.profileAvatarColor ?? undefined,
    hasPledged: member?.profileHasPledged ?? false,
  };
}

export function TableCompareView({
  round,
  seats,
  byId,
  tableNo,
  statementTag,
  eventTitle,
}: {
  round: EventRound | null;
  seats: RoundSeat[];
  byId: Map<string, EventRoomMember>;
  tableNo: number;
  statementTag: string | null | undefined;
  eventTitle: string;
}) {
  const table = seats.filter(s => s.table === tableNo);
  const first = byId.get(table.find(s => s.role === 'first')?.id ?? '');
  const second = byId.get(table.find(s => s.role === 'second')?.id ?? '');
  const tag = round?.matchTag ?? statementTag ?? null;
  const profiles = useMemo(
    () => [first?.profileId, second?.profileId].filter((p): p is string => !!p),
    [first?.profileId, second?.profileId],
  );
  const positions = useTagPositions(tag, profiles);
  const rows = useMemo(() => {
    const a = first?.profileId ? positions.byProfile.get(first.profileId) : undefined;
    const b = second?.profileId ? positions.byProfile.get(second.profileId) : undefined;
    return a && b ? buildCompareRows(positions.statements, a, b) : [];
  }, [positions, first?.profileId, second?.profileId]);
  const setName = tag ? setLabel(tag, statementTag ? { [statementTag]: eventTopic(eventTitle) } : null) : null;

  if (!round || table.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center" data-testid="table-compare-waiting">
        <p className="text-2xl text-muted-foreground">Table {tableNo} appears here once the round starts.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8 sm:px-10" data-testid="table-compare">
      <div className="mx-auto max-w-3xl">
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3" data-testid="table-compare-people">
          {table.map(s => {
            const m = byId.get(s.id);
            return (
              <li key={s.id} className="flex items-center gap-2.5">
                <RoleBadge role={ROLE_LIVE[s.role]} className="h-8 w-8 text-base" />
                <GravatarAvatar
                  name={m?.displayName ?? '?'}
                  photoUrl={m?.profileAvatarUrl ?? undefined}
                  avatarColor={m?.profileAvatarColor ?? undefined}
                  isPledger={m?.profileHasPledged ?? false}
                  size="sm"
                />
                <span className="text-xl font-semibold">
                  {shortName(m?.displayName ?? '—')}
                  <span className="ml-1.5 text-base font-normal text-muted-foreground">{ROLE_WORD[s.role]}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {setName && <p className="mt-3 text-center text-base text-muted-foreground">{setName}</p>}
        <div className="mt-6 rounded-xl bg-muted/70 p-4 sm:p-6" data-testid="table-compare-rows">
          {rows.length > 0 ? (
            <ul className="space-y-5">
              {rows.map(row => (
                <StatementRow key={row.pointId} row={row} me={asPerson(first)} them={asPerson(second)} meInFirstPerson={false} />
              ))}
            </ul>
          ) : (
            <p className="text-center text-lg text-muted-foreground">
              {first && second ? 'Nothing answered by both yet.' : 'The speaker and listener appear here.'}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
