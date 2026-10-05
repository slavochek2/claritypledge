/**
 * @file RoundCard.tsx
 * @description P1337 §3 — what each person sees, round by round, in the event room. The room page
 * changes with the moment (founder walkthrough 4) rather than adding routes:
 *
 *   - One status line on top: "Round 2 · Find table 3 · You speak first".
 *   - Finding the table (the first minute): the table, who is there with their role letter, and
 *     "I'm at table N". Nothing to read yet — the statements come once you sit.
 *   - At the table: "What do we talk about?" — the pair's statements, furthest apart first. A tap
 *     marks the one the table chose; anyone at the table can tap, last tap wins (a note, not a
 *     permission). With no answers yet: "Add your positions on #tag".
 *   - Talking: no timer for the pair — the room clock is on the screen and the phone is theirs to
 *     put away. The observer, who keeps time, gets the countdown on their card. An earlier build
 *     drew a black layer over every phone; the founder removed it ("everybody knows how to
 *     control their phone") — do not bring it back as a default.
 *   - No "did your position move?" (founder walkthrough 5): every change of position is already
 *     kept with its time (point_position_history), so changing your answer on the statement is
 *     the signal; the question only cost a tap.
 *   - Earlier rounds list who you sat with; a face opens the comparison, Back returns here.
 *
 * THE TAP IS NEVER A GATE (spec Invariants): not tapping changes nothing, and it can be tapped late.
 * "I'm here" is deliberately NOT the label: P1380's arrival check-in already says "I'm here" and
 * means "I arrived at the venue". This tap means "I'm at this table".
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  confirmRoundSeat,
  currentRound,
  setRoundTopic,
  topicKey,
  type EventRound,
  type RoundSeat,
} from '@/app/data/event-rounds-service';
import { buildCompareRows } from '@/lib/compare-positions';
import { LIVE_ROLE_LINE, formatClock, liveRole, roundClock, roundTiming } from '@/lib/round-clock';
import type { SeatRole } from '@/lib/round-grouping';
import { cn } from '@/lib/utils';
import type { EventRoomMember, EventRoomSelf } from '@/app/types';
import { shortName, useEventRounds, useNow } from './use-event-rounds';
import { useTagPositions } from './use-tag-positions';
import { eventTopic } from '../prep/prep-plan';
import { StatementRow, TopicMark, type Person } from '@/app/components/compare/statement-row';
import { RoleBadge } from './RoleBadge';

// The stored role says who speaks first; the pair swap after the first speaker's minutes (liveRole).
const ROLE_LINE: Record<SeatRole, string> = {
  first: 'You speak first',
  second: 'You listen first',
  observer: 'You observe and keep time',
};

// No swap at half time: the pair start this way and trade the badges whenever they like.
const ROLE_LINE_UNSPLIT: Record<SeatRole, string> = {
  first: 'You start speaking',
  second: 'You start listening',
  observer: 'You observe and keep time',
};

const LIVE_LINE = LIVE_ROLE_LINE;

/** How many statements the table card lists; the rest are one tap away on the compare page. */
const TOPICS_SHOWN = 5;
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

function Panel({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4" data-testid={testId}>
      {children}
    </section>
  );
}

interface PastRound {
  round: EventRound;
  table: number;
  mates: RoundSeat[];
}

export function RoundCard({
  eventId,
  eventSlug,
  statementTag,
  eventTitle,
  self,
  roster,
  ended = false,
}: {
  eventId: string;
  eventSlug: string;
  statementTag: string | null | undefined;
  /** Names the event's statement set on the compare page. */
  eventTitle?: string;
  self: EventRoomSelf | null;
  roster: EventRoomMember[];
  /** After the event: no live round, read once, and only the rounds you sat in. */
  ended?: boolean;
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

  const member = (id: string | undefined) => roster.find(m => m.id === id);
  const firstMember = member(first?.id);
  const secondMember = member(second?.id);
  const pairProfiles = [firstMember?.profileId, secondMember?.profileId, self?.profileId].filter(
    (p): p is string => !!p,
  );
  const positions = useTagPositions(statementTag, pairProfiles);

  // The compare page's rows (founder walkthrough 6): a speaker sees themself against their
  // partner; the observer sees the pair, Speaker 1 on the left.
  const selfMember = member(self?.id);
  const isPairSpeaker = !!mine && mine.role !== 'observer';
  const leftMember = isPairSpeaker ? selfMember : firstMember;
  const rightMember = isPairSpeaker ? (mine?.role === 'first' ? secondMember : firstMember) : secondMember;
  const rows = useMemo(() => {
    const a = leftMember?.profileId ? positions.byProfile.get(leftMember.profileId) : undefined;
    const b = rightMember?.profileId ? positions.byProfile.get(rightMember.profileId) : undefined;
    return a && b ? buildCompareRows(positions.statements, a, b) : [];
  }, [positions, leftMember, rightMember]);

  // The table's marked statement, shown at once on a tap while the write lands.
  const markKey = round && mine ? topicKey(round.id, mine.table) : null;
  const [pendingMark, setPendingMark] = useState<{ key: string; pointId: string | null } | null>(null);
  useEffect(() => {
    setPendingMark(null);
  }, [markKey]);
  const serverMark = markKey ? state.topics.get(markKey) ?? null : null;
  const mark = pendingMark && pendingMark.key === markKey ? pendingMark.pointId : serverMark;

  const [confirming, setConfirming] = useState(false);

  // Each tap on a statement gets a number; only the latest tap's write may clear the shown mark.
  const markSeq = useRef(0);

  if (!self) return null;

  // Rounds you sat in that are behind you, newest first, with who sat with you.
  const pastRounds: PastRound[] = state.rounds
    .filter(r => !round || r.id !== round.id)
    .flatMap(r => {
      const rs = state.seatsByRound.get(r.id) ?? [];
      const me = rs.find(s => s.id === self.id);
      return me ? [{ round: r, table: me.table, mates: rs.filter(s => s.table === me.table && s.id !== self.id) }] : [];
    })
    .reverse();

  // Compare opens in this tab; its Back returns here (founder walkthrough 4).
  const backState = {
    backTo: `/events/${eventSlug}/meet`,
    // The event's own set reads as the event's topic on the compare page (founder walkthrough 6).
    setLabels: statementTag && eventTitle ? { [statementTag]: eventTopic(eventTitle) } : undefined,
  };
  const compareHref = (slug: string, extra = '') => {
    const params = new URLSearchParams(extra);
    if (statementTag) params.set('tag', statementTag);
    const q = params.toString();
    return `/compare/${slug}${q ? `?${q}` : ''}`;
  };

  const past = pastRounds.length > 0 && (
    <Panel testId="round-past">
      <ul className="space-y-3">
        {pastRounds.map(({ round: r, table: t, mates }) => (
          <li key={r.id}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Round {r.roundNo} · Table {t}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {mates.map(s => {
                const m = member(s.id);
                const face = (
                  <>
                    <Face member={m} />
                    <span className="text-sm font-medium">{shortName(m?.displayName ?? '—')}</span>
                  </>
                );
                return m?.profileSlug ? (
                  <Link
                    key={s.id}
                    to={compareHref(m.profileSlug)}
                    state={backState}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-2 hover:border-blue-300"
                    data-testid="round-past-mate"
                  >
                    {face}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </Link>
                ) : (
                  <span key={s.id} className="inline-flex min-h-11 items-center gap-2 py-1 pl-1 pr-2">
                    {face}
                  </span>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );

  if (!round || !mine) {
    if (!round && !past) return null;
    return (
      <>
        {round && (
          <p className="text-base font-medium" data-testid="round-card-waiting">
            Round {round.roundNo} · You join the next round
          </p>
        )}
        {past}
      </>
    );
  }

  const talking = phase !== 'seating' && phase !== 'over';
  const atTable = !!mine.confirmedAt || phase !== 'seating';

  const status =
    phase === 'over'
      ? `Round ${round.roundNo} · Time’s up`
      : talking
        ? `Round ${round.roundNo} · Table ${mine.table} · ${!split && mine.role !== 'observer' ? 'You talk' : LIVE_LINE[liveRole(mine.role, phase)]}`
        : `Round ${round.roundNo} · ${mine.confirmedAt ? 'Table' : 'Find table'} ${mine.table} · ${(split ? ROLE_LINE : ROLE_LINE_UNSPLIT)[mine.role]}`;

  const isSpeaker = mine.role !== 'observer';
  const partner = mine.role === 'first' ? secondMember : mine.role === 'second' ? firstMember : undefined;
  const iHaveNone =
    isSpeaker && !!self.profileId && positions.statements.length > 0 && !positions.byProfile.get(self.profileId)?.size;

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

  const onMark = async (pointId: string) => {
    if (!markKey) return;
    const next = mark === pointId ? null : pointId;
    const seq = ++markSeq.current;
    setPendingMark({ key: markKey, pointId: next });
    try {
      await setRoundTopic(round.id, mine.table, next);
      await refresh();
    } catch {
      /* a note, not a permission — the previous mark simply stays */
    }
    if (seq === markSeq.current) setPendingMark(null);
  };

  return (
    <>
      <p className="text-base font-medium" data-testid="round-status">{status}</p>
      <section
        className="rounded-xl border border-blue-200 bg-card p-4 shadow-sm"
        data-testid="round-card"
        data-role={mine.role}
      >
        <h2 className="text-3xl font-semibold" data-testid="round-card-table">
          Table {mine.table}
        </h2>
        {/* The observer keeps time, so their card carries the clock while the pair talk. Nobody
            else gets a timer: the room clock is on the screen, and the phone is theirs to put
            away (founder walkthrough 4 — no black layer drawn over it). */}
        {talking && clock && mine.role === 'observer' && (
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
        )}
        {/* Faces, not only names: this is what you look for walking across the room. The same
            S / L / O letters as the printed card on the table. */}
        <ul className="mt-3 space-y-2" data-testid="round-card-mates">
          {table.map(s => {
            const isMe = s.id === mine.id;
            return (
              <li key={s.id} className="flex items-center gap-2.5">
                <RoleBadge role={liveRole(s.role, phase)} className="h-7 w-7 text-base" />
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
        {self.optedIn && isSpeaker && (
          <p className="mt-3 text-sm" data-testid="round-card-rule">
            Hear the number before you disagree.
          </p>
        )}

        {mine.confirmedAt ? (
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="round-card-confirmed">
            <Check className="h-4 w-4 text-green-600" /> At table {mine.table}
          </p>
        ) : phase !== 'over' && (
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

        {atTable && (rows.length > 0 || (iHaveNone && statementTag)) && (
          <div className="mt-5 border-t border-border pt-4" data-testid="round-card-topics">
            <p className="text-sm font-semibold">What do we talk about?</p>
            {rows.length > 0 ? (
              <>
                <ul className="mt-2 space-y-3" data-testid="round-card-rows">
                  {rows.slice(0, TOPICS_SHOWN).map(row => (
                    <StatementRow
                      key={row.pointId}
                      row={row}
                      me={asPerson(leftMember)}
                      them={asPerson(rightMember)}
                      meInFirstPerson={isPairSpeaker}
                      trailing={<TopicMark marked={row.pointId === mark} onToggle={() => void onMark(row.pointId)} />}
                    />
                  ))}
                </ul>
                {partner?.profileSlug && (
                  <Link
                    to={compareHref(partner.profileSlug, `round=${round.id}&table=${mine.table}`)}
                    state={backState}
                    className="mt-2 inline-flex min-h-10 items-center text-sm font-medium text-blue-600"
                    data-testid="round-card-compare"
                  >
                    Compare positions
                  </Link>
                )}
              </>
            ) : (
              <Link
                to={`/stake/${encodeURIComponent(statementTag ?? '')}`}
                className="mt-2 inline-flex min-h-10 items-center text-sm font-medium text-blue-600"
                data-testid="round-card-add-positions"
              >
                Add your positions on #{statementTag}
              </Link>
            )}
          </div>
        )}

      </section>
      {past}

    </>
  );
}
