/**
 * @file RoundCard.tsx
 * @description P1337 §3 — what each person sees, round by round, in the event room. The room page
 * follows the moment (founder walkthrough 4) and the step bar above it (walkthrough 7) says which
 * moment it is — so there is no status line here any more.
 *
 *   - Table (finding it): the table, "Find your table · 0:45" counting down, your role, who is
 *     there with their role letter, and "I'm at table N". Nothing to read yet.
 *   - Compare (seated): the comparison takes the card; the table shrinks to one line ("Table 1 ·
 *     with Haru, Erin"). Header "You and {name}", the set's name, a dropdown to compare with anyone
 *     else in the room, and "Back to the table". No topic mark (walkthrough 7).
 *   - Talking: no timer for the pair — the room clock is on the screen and the phone is theirs to
 *     put away. The observer, who keeps time, gets the countdown on their card. An earlier build
 *     drew a black layer over every phone; the founder removed it ("everybody knows how to
 *     control their phone") — do not bring it back as a default.
 *   - No "did your position move?" (founder walkthrough 5): every change of position is already
 *     kept with its time (point_position_history), so changing your answer on the statement is
 *     the signal; the question only cost a tap.
 *   - No earlier rounds for attendees, during or after the event (founder walkthrough 7); the host
 *     keeps theirs on the host panel.
 *
 * The card stays mounted on every step (it owns the round poll) and reports the moment upward;
 * `view` says which face the page wants shown.
 *
 * THE TAP IS NEVER A GATE (spec Invariants): not tapping changes nothing, and it can be tapped late.
 * "I'm here" is deliberately NOT the label: P1380's arrival check-in already says "I'm here" and
 * means "I arrived at the venue". This tap means "I'm at this table".
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { confirmRoundSeat, currentRound } from '@/app/data/event-rounds-service';
import { buildCompareRows } from '@/lib/compare-positions';
import { LIVE_ROLE_LINE, formatClock, liveRole, roundClock, roundTiming } from '@/lib/round-clock';
import type { SeatRole } from '@/lib/round-grouping';
import { setLabel } from '@/lib/set-labels';
import { cn } from '@/lib/utils';
import type { EventRoomMember, EventRoomSelf } from '@/app/types';
import { shortName, useEventRounds, useNow } from './use-event-rounds';
import { useTagPositions } from './use-tag-positions';
import { eventTopic } from '../prep/prep-plan';
import { StatementRow, type Person } from '@/app/components/compare/statement-row';
import { PairBadge, RoleBadge } from './RoleBadge';

// The stored role says who speaks first; the pair swap after the first speaker's minutes (liveRole).
const ROLE_LINE: Record<SeatRole, string> = {
  first: 'You speak first',
  second: 'You listen first',
  observer: 'You observe and keep time',
};

// No swap at half time: the pair start this way and trade the badges whenever they like.
// P1337 walkthrough 6: a round with no swap assigns no starter — the pair decide.
const ROLE_LINE_UNSPLIT: Record<SeatRole, string> = {
  first: 'You two decide who starts',
  second: 'You two decide who starts',
  observer: 'You observe and keep time',
};


/** The observer's "Say swap" shows for this long after the first speaker's time ends. */
const SWAP_CUE_MS = 20_000;

function asPerson(member: EventRoomMember | undefined): Person {
  return {
    name: member ? (member.displayName.split(' ')[0] ?? member.displayName) : '?',
    photoUrl: member?.profileAvatarUrl ?? undefined,
    avatarColor: member?.profileAvatarColor ?? undefined,
    hasPledged: member?.profileHasPledged ?? false,
  };
}

function Face({ member }: { member: EventRoomMember | undefined }) {
  return (
    <GravatarAvatar
      name={member?.displayName ?? '?'}
      photoUrl={member?.profileAvatarUrl ?? undefined}
      avatarColor={member?.profileAvatarColor ?? undefined}
      isPledger={member?.profileHasPledged ?? false}
      size="sm"
    />
  );
}

/** What the room page needs to know to place the step bar. */
export interface RoundMoment {
  /** Seated at a table in the round on now. */
  seated: boolean;
  /** Past finding the table: tapped "I'm at table N", or the talking has begun. */
  atTable: boolean;
  /** The host ended the rounds (no round on now, at least one behind). */
  eveningOver: boolean;
}

const firstWord = (name: string | undefined) => (name ? name.split(' ')[0] ?? name : '?');

export function RoundCard({
  eventId,
  statementTag,
  eventTitle,
  self,
  roster,
  ended = false,
  view,
  onMoment,
}: {
  eventId: string;
  statementTag: string | null | undefined;
  /** Names the event's statement set ("AI and your ikigai", not #tag). */
  eventTitle?: string;
  self: EventRoomSelf | null;
  roster: EventRoomMember[];
  /** After the event: no live round, nothing to show. */
  ended?: boolean;
  /** Which face to show: the table, the comparison, or nothing (another step is on screen — the
   * "you join the next round" line still shows for someone not seated). */
  view: 'table' | 'compare' | 'hidden';
  onMoment?: (moment: RoundMoment) => void;
}) {
  const { state, refresh } = useEventRounds(eventId, !!self, !ended);
  const round = ended ? null : currentRound(state);
  const seats = round ? state.seatsByRound.get(round.id) ?? [] : [];
  const mine = self ? seats.find(s => s.id === self.id) : undefined;
  const table = mine ? seats.filter(s => s.table === mine.table) : [];
  const first = table.find(s => s.role === 'first');
  const second = table.find(s => s.role === 'second');
  const hasObserver = seats.some(s => s.role === 'observer');

  const now = useNow(!!round);
  const timing = round ? roundTiming(round) : null;
  const clock = round && timing ? roundClock(round.startedAt, now, hasObserver, timing) : null;
  const split = timing?.split ?? true;
  const phase = clock?.phase ?? 'seating';

  const seated = !!round && !!mine;
  const atTable = seated && (!!mine?.confirmedAt || phase !== 'seating');
  const eveningOver = !ended && !round && state.rounds.length > 0;
  useEffect(() => {
    onMoment?.({ seated, atTable, eveningOver });
  }, [onMoment, seated, atTable, eveningOver]);

  const member = (id: string | undefined) => roster.find(m => m.id === id);
  const firstMember = member(first?.id);
  const secondMember = member(second?.id);
  const selfMember = member(self?.id);
  const isPairSpeaker = !!mine && mine.role !== 'observer';
  const partner = mine?.role === 'first' ? secondMember : mine?.role === 'second' ? firstMember : undefined;

  // "Compare with" (walkthrough 7): anyone else in the room with a profile. '' = your table's
  // default — your partner, or for the observer the pair. Cleared when the seat changes.
  const [withId, setWithId] = useState('');
  const seatKey = round && mine ? `${round.id}:${mine.table}` : '';
  useEffect(() => {
    setWithId('');
  }, [seatKey]);
  const chosen = withId ? member(withId) : undefined;

  const leftMember = chosen ? selfMember : isPairSpeaker ? selfMember : firstMember;
  const rightMember = chosen ? chosen : isPairSpeaker ? partner : secondMember;
  const meInFirstPerson = !!chosen || isPairSpeaker;

  const profiles = [firstMember?.profileId, secondMember?.profileId, self?.profileId, chosen?.profileId].filter(
    (p): p is string => !!p,
  );
  // "Match on #tag": a round grouped on another tag talks about that tag's statements.
  const roundTag = round?.matchTag ?? statementTag;
  const positions = useTagPositions(roundTag, profiles);
  const rows = useMemo(() => {
    const a = leftMember?.profileId ? positions.byProfile.get(leftMember.profileId) : undefined;
    const b = rightMember?.profileId ? positions.byProfile.get(rightMember.profileId) : undefined;
    return a && b ? buildCompareRows(positions.statements, a, b) : [];
  }, [positions, leftMember, rightMember]);

  const [confirming, setConfirming] = useState(false);

  if (!self) return null;

  if (!round || !mine) {
    // Walkthrough 8: opted in with nothing to do read as stuck — say what comes next.
    if (!round) {
      if (ended || eveningOver || view !== 'hidden') return null;
      return (
        <p className="text-base text-muted-foreground" data-testid="round-card-waiting">
          Waiting for round {state.rounds.length + 1} — the host starts it
        </p>
      );
    }
    return (
      <p className="text-base font-medium" data-testid="round-card-waiting">
        {/* A showcase seats only the people the host chose; everyone else watches. */}
        Round {round.roundNo} · {round.showcase ? 'You watch' : 'You join the next round'}
      </p>
    );
  }
  if (view === 'hidden') return null;

  const talking = phase !== 'seating' && phase !== 'over';
  const isSpeaker = mine.role !== 'observer';
  const roleLine =
    phase === 'over'
      ? 'Time’s up'
      : talking
        ? !split && isSpeaker
          ? 'You talk'
          : LIVE_ROLE_LINE[liveRole(mine.role, phase)]
        : (split ? ROLE_LINE : ROLE_LINE_UNSPLIT)[mine.role];
  const mates = table.filter(s => s.id !== mine.id).map(s => firstWord(member(s.id)?.displayName));
  const setName = roundTag
    ? setLabel(roundTag, statementTag && eventTitle ? { [statementTag]: eventTopic(eventTitle) } : null)
    : null;
  const iHaveNone =
    !!self.profileId && positions.statements.length > 0 && !positions.byProfile.get(self.profileId)?.size;
  const othersInRoom = roster.filter(
    m => m.profileId && m.id !== self.id && m.id !== (isPairSpeaker ? partner?.id : undefined),
  );

  const onConfirm = async () => {
    setConfirming(true);
    try {
      await confirmRoundSeat(round.id);
      await refresh();
    } catch {
      /* not a gate — nothing to tell them */
    } finally {
      setConfirming(false);
    }
  };

  // The observer keeps time, so their card carries the clock while the pair talk. Nobody else gets
  // a timer: the room clock is on the screen, and the phone is theirs to put away.
  const observerClock = talking && clock && mine.role === 'observer' && (
    <div className="mt-3 rounded-lg bg-muted px-4 py-3 text-center" data-testid="round-observer-clock">
      <p className="text-sm text-muted-foreground">
        {clock.phase === 'first' && !split
          ? 'They talk'
          : clock.phase === 'first'
            ? `${shortName(firstMember?.displayName ?? '')} speaks`
            : clock.phase === 'second'
              ? `${shortName(secondMember?.displayName ?? '')} speaks`
              : 'Your turn'}
      </p>
      {clock.phase === 'second' && clock.phaseElapsedMs < SWAP_CUE_MS ? (
        <p className="mt-1 text-5xl font-semibold" data-testid="round-observer-swap">
          Say &ldquo;swap&rdquo;
        </p>
      ) : (
        <p className="mt-1 text-6xl font-semibold tabular-nums">{formatClock(clock.phaseRemainingMs)}</p>
      )}
    </div>
  );

  if (view === 'compare') {
    const defaultLabel = isPairSpeaker
      ? `You and ${firstWord(partner?.displayName)}`
      : `${firstWord(firstMember?.displayName)} and ${firstWord(secondMember?.displayName)}`;
    const chosenLabel = chosen ? `You and ${firstWord(chosen.displayName)}` : defaultLabel;
    return (
      <section data-testid="round-card" data-role={mine.role} data-view="compare">
        <p className="text-sm text-muted-foreground" data-testid="round-card-table-line">
          Table {mine.table}
          {mates.length > 0 && <> · with {mates.join(', ')}</>} · {roleLine}
        </p>
        {observerClock}
        {/* Walkthrough 8: one header — the dropdown names who you compare with (your table first,
            so a wrong pick is one tap back); the step bar's "Table" is the way back. */}
        {othersInRoom.length > 0 ? (
          <select
            aria-label="Compare with"
            className="mt-3 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-lg font-semibold"
            value={withId}
            onChange={e => setWithId(e.target.value)}
            data-testid="round-compare-with"
          >
            <option value="">{defaultLabel}{isPairSpeaker ? '' : ' (your table)'}</option>
            {othersInRoom.map(m => (
              <option key={m.id} value={m.id}>
                You and {shortName(m.displayName)}
              </option>
            ))}
          </select>
        ) : (
          <h2 className="mt-3 text-lg font-semibold break-words" data-testid="round-compare-title">{chosenLabel}</h2>
        )}
        {setName && <p className="mt-1 text-sm text-muted-foreground break-words" data-testid="round-compare-set">{setName}</p>}
        <div className="mt-3 rounded-xl bg-muted/70 p-3" data-testid="round-card-topics">
          {rows.length > 0 ? (
            <ul className="space-y-4" data-testid="round-card-rows">
              {rows.map(row => (
                <StatementRow
                  key={row.pointId}
                  row={row}
                  me={asPerson(leftMember)}
                  them={asPerson(rightMember)}
                  meInFirstPerson={meInFirstPerson}
                  compact
                />
              ))}
            </ul>
          ) : iHaveNone && meInFirstPerson && roundTag ? (
            <Link
              to={`/stake/${encodeURIComponent(roundTag)}`}
              className="inline-flex min-h-10 items-center text-sm font-medium text-blue-600"
              data-testid="round-card-add-positions"
            >
              Add your positions on {setName}
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="round-card-no-rows">
              {setName ? `Nothing on ${setName} answered by both yet.` : 'No statements for this round.'}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      className="rounded-xl border border-blue-200 bg-card p-4 shadow-sm"
      data-testid="round-card"
      data-role={mine.role}
      data-view="table"
    >
      <h2 className="text-3xl font-semibold" data-testid="round-card-table">
        Table {mine.table}
      </h2>
      {/* Walkthrough 7: the finding minute counts down inside the card. */}
      {phase === 'seating' && clock && (
        <p className="mt-1 text-base font-medium tabular-nums" data-testid="round-card-find">
          {mine.confirmedAt ? `At table ${mine.table}` : 'Find your table'} · {formatClock(clock.phaseRemainingMs)}
        </p>
      )}
      <p className="mt-1 text-sm text-muted-foreground" data-testid="round-card-role">{roleLine}</p>
      {observerClock}
      {/* Faces, not only names: this is what you look for walking across the room. The same
          S / L / O letters as the printed card on the table. */}
      <ul className="mt-3 space-y-2" data-testid="round-card-mates">
        {table.map(s => {
          const isMe = s.id === mine.id;
          return (
            <li key={s.id} className="flex items-center gap-2.5">
              {split || s.role === 'observer' ? (
                <RoleBadge role={liveRole(s.role, phase)} className="h-7 w-7 text-base" />
              ) : (
                <PairBadge className="h-7 w-7 text-base" />
              )}
              <Face member={member(s.id)} />
              <span className={cn('flex-1 min-w-0 break-words text-sm', isMe ? 'text-muted-foreground' : 'font-medium')}>
                {isMe ? 'You' : shortName(member(s.id)?.displayName ?? '—')}
              </span>
              {/* Founder walkthrough 4-5: opted-out people sit and talk like everyone else, and
                  are not bound to give a number — their table-mates see it here, so nobody asks.
                  The room's opt-in list is public already; this exposes nothing new. */}
              {!isMe && member(s.id)?.optedIn === false && (
                <span className="shrink-0 text-xs text-muted-foreground" data-testid="round-card-opted-out">opted out</span>
              )}
            </li>
          );
        })}
      </ul>
      {/* Walkthrough 8: a reminder of what the letters mean, matching the printed card. */}
      <p className="mt-2 text-xs text-muted-foreground" data-testid="round-card-legend">
        {split ? 'S speaks · L listens, then explains back · O keeps time' : 'S L: you two take turns, the listener explains back · O keeps time'}
      </p>
      {self.optedIn && isSpeaker && (
        <p className="mt-3 text-sm" data-testid="round-card-rule">
          Hear the number before you disagree.
        </p>
      )}

      {mine.confirmedAt ? (
        phase !== 'seating' && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="round-card-confirmed">
            <Check className="h-4 w-4 text-green-600" /> At table {mine.table}
          </p>
        )
      ) : phase !== 'over' && (
        <Button
          type="button"
          className="mt-4 h-auto w-full min-h-12 whitespace-normal py-3 text-base bg-blue-500 hover:bg-blue-700 text-white"
          onClick={() => void onConfirm()}
          disabled={confirming}
          data-testid="round-card-confirm"
        >
          We&rsquo;re seated — show our positions
        </Button>
      )}
    </section>
  );
}
