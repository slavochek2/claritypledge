/**
 * @file RoundCard.tsx
 * @description P1337 §3 — what each person sees, round by round, in the event room.
 *
 * Between rounds (the 60 seconds to find tables) is the only phone moment: your table, who is
 * there, your role, and the reason to look — the statement you and your partner are furthest
 * apart on, with a way into the comparison. One tap, "I'm at table N", records where you
 * actually sat. THE TAP IS NEVER A GATE (spec Invariants): not tapping changes nothing, and it
 * can be tapped late.
 *
 * During the round the phone is dark — a black layer over the whole room page, nothing to
 * scroll. Except for the observer, who holds the clock: their layer is the countdown, with
 * "Say “swap”" as the first speaker's six minutes run out. No sound, no vibration (iOS Safari
 * has no Vibration API, and a phone speaker cannot cut through fifteen people talking).
 *
 * After the round: an optional "Did your position move?", while it is still in their head.
 *
 * "I'm here" is deliberately NOT the label: P1380's arrival check-in already says "I'm here"
 * and means "I arrived at the venue". This tap means "I'm at this table".
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { StatementPointCard } from '@/app/components/letters/letter-point-card';
import {
  confirmRoundSeat,
  currentRound,
  setRoundPositionMoved,
  topicKey,
} from '@/app/data/event-rounds-service';
import { buildCompareRows, furthestApart } from '@/lib/compare-positions';
import { formatClock, liveRole, roundClock } from '@/lib/round-clock';
import type { EventRoomMember, EventRoomSelf } from '@/app/types';
import { shortName, useEventRounds, useNow } from './use-event-rounds';
import { useTagPositions } from './use-tag-positions';
import { RoleBadge } from './RoleBadge';

// The stored role says who speaks first; the pair swap after six minutes (liveRole).
const ROLE_LINE = {
  first: 'You speak first',
  second: 'You listen first',
  observer: 'You observe and keep time',
} as const;

function readAnswered(roundId: string): boolean {
  try {
    return localStorage.getItem(`p1337-moved:${roundId}`) === '1';
  } catch {
    return false;
  }
}

function writeAnswered(roundId: string) {
  try {
    localStorage.setItem(`p1337-moved:${roundId}`, '1');
  } catch {
    /* the question may be asked again after a reload — harmless */
  }
}

export function RoundCard({
  eventId,
  statementTag,
  self,
  roster,
  onSeatedChange,
}: {
  eventId: string;
  statementTag: string | null | undefined;
  self: EventRoomSelf | null;
  roster: EventRoomMember[];
  /** True while this person holds a seat in a round that is not over — the room page hides
   * its opt-in bar then, so it never covers "I'm at table N". */
  onSeatedChange?: (seated: boolean) => void;
}) {
  const { state, refresh } = useEventRounds(eventId, !!self);
  const round = currentRound(state);
  const seats = round ? state.seatsByRound.get(round.id) ?? [] : [];
  const mine = self ? seats.find(s => s.id === self.id) : undefined;
  const table = mine ? seats.filter(s => s.table === mine.table) : [];
  const first = table.find(s => s.role === 'first');
  const second = table.find(s => s.role === 'second');
  const hasObserver = seats.some(s => s.role === 'observer');

  const now = useNow(!!round);
  const clock = round ? roundClock(round.startedAt, now, hasObserver) : null;

  const member = (id: string | undefined) => roster.find(m => m.id === id);
  const firstMember = member(first?.id);
  const secondMember = member(second?.id);
  const pairProfiles = [firstMember?.profileId, secondMember?.profileId].filter((p): p is string => !!p);
  const positions = useTagPositions(statementTag, pairProfiles);

  const shown = useMemo(() => {
    if (!round || !mine) return null;
    const topicId = state.topics.get(topicKey(round.id, mine.table));
    const topic = topicId ? positions.statements.find(s => s.id === topicId) : undefined;
    if (topic) return { statement: topic.statement, chosen: true };
    const a = firstMember?.profileId ? positions.byProfile.get(firstMember.profileId) : undefined;
    const b = secondMember?.profileId ? positions.byProfile.get(secondMember.profileId) : undefined;
    if (!a || !b) return null;
    const row = furthestApart(buildCompareRows(positions.statements, a, b));
    return row ? { statement: row.statement, chosen: false } : null;
  }, [round, mine, state.topics, positions, firstMember, secondMember]);

  const seatedNow = !!mine && !!clock && clock.phase !== 'over';
  useEffect(() => {
    onSeatedChange?.(seatedNow);
  }, [seatedNow, onSeatedChange]);

  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [answered, setAnswered] = useState(false);
  useEffect(() => {
    setAnswered(round ? readAnswered(round.id) : false);
  }, [round]);

  if (!round || !self) return null;

  if (!mine) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm" data-testid="round-card-waiting">
        You join at the next round.
      </div>
    );
  }

  const partner = mine.role === 'first' ? secondMember : mine.role === 'second' ? firstMember : undefined;
  const others = table.filter(s => s.id !== mine.id);
  const talking = clock && clock.phase !== 'seating' && clock.phase !== 'over';
  const darkKey = `${round.id}`;
  const showDark = talking && hiddenFor !== darkKey;

  const compareHref =
    partner?.profileSlug && statementTag
      ? `/compare/${partner.profileSlug}?tag=${encodeURIComponent(statementTag)}&round=${round.id}&table=${mine.table}`
      : null;

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

  const onMoved = (moved: boolean) => {
    setAnswered(true);
    writeAnswered(round.id);
    void setRoundPositionMoved(round.id, moved).catch(() => { /* optional answer */ });
  };

  return (
    <>
      <section
        className="rounded-xl border border-blue-200 bg-card p-4 shadow-sm"
        data-testid="round-card"
        data-role={mine.role}
      >
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Round {round.roundNo}</p>
        <h2 className="mt-0.5 text-3xl font-semibold" data-testid="round-card-table">
          Table {mine.table}
        </h2>
        <p className="mt-1.5 flex items-center gap-2 text-base font-medium">
          {/* The same S / L / O as the printed card on the table. */}
          <RoleBadge role={liveRole(mine.role, 'seating')} className="h-7 w-7 text-base" />
          {ROLE_LINE[mine.role]}
        </p>
        {others.length > 0 && clock && (
          // Faces, not only names: this is what you look for walking across the room.
          <ul className="mt-3 space-y-2" data-testid="round-card-mates">
            {others.map(s => {
              const m = member(s.id);
              return (
                <li key={s.id} className="flex items-center gap-2.5">
                  <RoleBadge role={liveRole(s.role, clock.phase)} className="h-7 w-7 text-base" />
                  <GravatarAvatar
                    name={m?.displayName ?? '?'}
                    photoUrl={m?.profileAvatarUrl ?? undefined}
                    avatarColor={m?.profileAvatarColor ?? undefined}
                    isPledger={m?.profileHasPledged ?? false}
                    size="sm"
                  />
                  <span className="flex-1 min-w-0 break-words text-sm font-medium">{shortName(m?.displayName ?? '—')}</span>
                </li>
              );
            })}
          </ul>
        )}
        {self.optedIn && mine.role !== 'observer' && (
          <p className="mt-2 text-sm" data-testid="round-card-rule">
            Hear the number before you disagree.
          </p>
        )}

        {shown && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              {shown.chosen ? 'Your table chose' : 'Furthest apart'}
            </p>
            <StatementPointCard statement={shown.statement} />
            {compareHref && (
              <Link to={compareHref} className="mt-2 inline-flex min-h-10 items-center text-sm font-medium text-blue-600" data-testid="round-card-compare">
                Compare all statements
              </Link>
            )}
          </div>
        )}

        {talking && !showDark && mine.role === 'observer' && (
          <Button type="button" variant="outline" className="mt-4 w-full min-h-11" onClick={() => setHiddenFor(null)}>
            Show the clock
          </Button>
        )}

        {clock?.phase === 'over' && mine.role !== 'observer' ? (
          answered ? (
            <p className="mt-4 text-sm text-muted-foreground">Thanks.</p>
          ) : (
            <div className="mt-4" data-testid="round-card-moved">
              <p className="text-sm font-medium">Did your position move?</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="min-h-11" onClick={() => onMoved(true)}>
                  Yes
                </Button>
                <Button type="button" variant="outline" className="min-h-11" onClick={() => onMoved(false)}>
                  No
                </Button>
              </div>
            </div>
          )
        ) : mine.confirmedAt ? (
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="round-card-confirmed">
            <Check className="h-4 w-4 text-green-600" /> At table {mine.table}
          </p>
        ) : (
          <Button
            type="button"
            className="mt-4 w-full min-h-12 text-base bg-blue-500 hover:bg-blue-600 text-white"
            onClick={() => void onConfirm()}
            disabled={confirming}
            data-testid="round-card-confirm"
          >
            I&rsquo;m at table {mine.table}
          </Button>
        )}
      </section>

      {/* Portalled to <body>: inside the room layout a transformed ancestor turned `fixed` into
          "fixed to that ancestor" and left the site header showing above the dark layer. */}
      {showDark && clock && createPortal(
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black px-6 text-center"
          data-testid="round-dark"
          data-role={mine.role}
        >
          {mine.role === 'observer' ? (
            <>
              <p className="text-lg text-white/60">
                {clock.phase === 'first'
                  ? `${shortName(firstMember?.displayName ?? '')} speaks`
                  : clock.phase === 'second'
                    ? `${shortName(secondMember?.displayName ?? '')} speaks`
                    : 'Your three minutes'}
              </p>
              {clock.phase === 'second' && clock.phaseRemainingMs > 6 * 60_000 - 20_000 ? (
                <p className="mt-2 text-6xl font-semibold text-white" data-testid="round-dark-swap">
                  Say &ldquo;swap&rdquo;
                </p>
              ) : (
                <p className="mt-2 text-8xl font-semibold tabular-nums text-white" data-testid="round-dark-clock">
                  {formatClock(clock.phaseRemainingMs)}
                </p>
              )}
            </>
          ) : (
            <p className="text-base text-white/40">Table {mine.table}</p>
          )}
          <button
            type="button"
            onClick={() => setHiddenFor(darkKey)}
            className="absolute bottom-8 min-h-11 px-4 text-sm text-white/40 underline"
          >
            Show table
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
