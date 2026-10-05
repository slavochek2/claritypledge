/**
 * @file event-rounds-service.ts
 * @description P1337: typed wrappers for the round tables and their SECURITY DEFINER RPCs
 * (supabase/migrations/20261002183700_p1337_event_rounds.sql).
 *
 * Reads are plain selects — RLS lets the host and every member of the event's room see the
 * seating, because the projector shows it anyway. `position_moved` is deliberately not
 * selectable (column grant), and presence is host-only.
 *
 * Polled, not realtime: a round changes a handful of times an evening, and the room's own
 * roster already showed how silently realtime + RLS can drop deliveries (P1114, 2026-08-21).
 * A 4-second poll is what every phone and the projector use.
 *
 * Standalone module like event-room-service.ts: no mock variant, every table here is new.
 */
import { supabase } from '@/lib/supabase';
import type { Seat, SeatRole } from '@/lib/round-grouping';

export const ROUNDS_POLL_MS = 4000;
/** The trio format plans three rounds (decisions.md 2026-09-28) — the grouping looks this far
 * ahead so nobody repeats a partner. It is NOT a cap: the host runs as many rounds as the room
 * wants (founder, 2026-10-04), up to the table's limit. */
export const ROUNDS_PER_EVENING = 3;
/** event_rounds.round_no CHECK (1..9). */
export const MAX_ROUNDS = 9;

export interface EventRound {
  id: string;
  roundNo: number;
  groupSize: 2 | 3 | 4;
  startedAt: string;
  endedAt: string | null;
  /** Seconds per part of this round (migration 20261004183000); null on rounds started before it. */
  seatingS: number | null;
  firstS: number | null;
  secondS: number | null;
  observerS: number | null;
  /** false = no swap at half time (migration 20261005090000). */
  splitSpeakers: boolean;
}

export interface RoundSeat extends Seat {
  roundId: string;
  confirmedAt: string | null;
}

export interface EventRoundsState {
  /** Oldest first. */
  rounds: EventRound[];
  seatsByRound: Map<string, RoundSeat[]>;
  /** `${roundId}:${table}` → point id the table marked. */
  topics: Map<string, string>;
}

export const EMPTY_ROUNDS_STATE: EventRoundsState = { rounds: [], seatsByRound: new Map(), topics: new Map() };

export const topicKey = (roundId: string, table: number) => `${roundId}:${table}`;

/** The round on now: the latest one, unless the host ended the evening. */
export function currentRound(state: EventRoundsState): EventRound | null {
  const last = state.rounds[state.rounds.length - 1];
  return last && !last.endedAt ? last : null;
}

interface DbRound {
  id: string;
  round_no: number;
  group_size: number;
  started_at: string;
  ended_at: string | null;
  seating_s: number | null;
  first_s: number | null;
  second_s: number | null;
  observer_s: number | null;
  split_speakers: boolean | null;
}

interface DbSeat {
  round_id: string;
  room_member_id: string;
  table_no: number;
  role: SeatRole;
  confirmed_at: string | null;
}

/** Throws on failure — callers keep the last good state rather than painting an empty room. */
export async function getEventRoundsState(eventId: string): Promise<EventRoundsState> {
  const { data: rounds, error } = await supabase
    .from('event_rounds')
    .select('id, round_no, group_size, started_at, ended_at, seating_s, first_s, second_s, observer_s, split_speakers')
    .eq('event_id', eventId)
    .order('round_no', { ascending: true });
  if (error) throw error;
  const mapped: EventRound[] = (rounds as DbRound[]).map(r => ({
    id: r.id,
    roundNo: r.round_no,
    groupSize: r.group_size as 2 | 3 | 4,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    seatingS: r.seating_s,
    firstS: r.first_s,
    secondS: r.second_s,
    observerS: r.observer_s,
    splitSpeakers: r.split_speakers !== false,
  }));
  if (mapped.length === 0) return EMPTY_ROUNDS_STATE;

  const ids = mapped.map(r => r.id);
  const [seatsRes, topicsRes] = await Promise.all([
    supabase
      .from('event_round_seats')
      .select('round_id, room_member_id, table_no, role, confirmed_at')
      .in('round_id', ids),
    supabase.from('event_round_tables').select('round_id, table_no, topic_point_id').in('round_id', ids),
  ]);
  if (seatsRes.error) throw seatsRes.error;
  if (topicsRes.error) throw topicsRes.error;

  const seatsByRound = new Map<string, RoundSeat[]>(ids.map(id => [id, []]));
  for (const s of seatsRes.data as DbSeat[]) {
    seatsByRound.get(s.round_id)?.push({
      roundId: s.round_id,
      id: s.room_member_id,
      table: s.table_no,
      role: s.role,
      confirmedAt: s.confirmed_at,
    });
  }
  for (const seats of seatsByRound.values()) seats.sort((a, b) => a.table - b.table || roleOrder(a.role) - roleOrder(b.role));

  const topics = new Map<string, string>();
  for (const t of topicsRes.data as { round_id: string; table_no: number; topic_point_id: string | null }[]) {
    if (t.topic_point_id) topics.set(topicKey(t.round_id, t.table_no), t.topic_point_id);
  }
  return { rounds: mapped, seatsByRound, topics };
}

export function roleOrder(role: SeatRole): number {
  return role === 'first' ? 0 : role === 'second' ? 1 : 2;
}

const toJsonSeats = (seats: Seat[]) => seats.map(s => ({ m: s.id, t: s.table, r: s.role }));

/** Minutes the host chose for the next round, in seconds per part. */
export interface RoundMinutes {
  seatingS: number;
  speakerS: number;
  observerS: number;
}

export const DEFAULT_ROUND_MINUTES: RoundMinutes = { seatingS: 60, speakerS: 360, observerS: 180 };

export async function hostStartRound(
  eventId: string,
  roundNo: number,
  groupSize: number,
  seats: Seat[],
  minutes: RoundMinutes = DEFAULT_ROUND_MINUTES,
  splitSpeakers = true,
  signal?: AbortSignal,
): Promise<string> {
  const call = supabase.rpc('host_start_round', {
    p_event_id: eventId,
    p_round_no: roundNo,
    p_group_size: groupSize,
    p_seats: toJsonSeats(seats),
    p_seating_s: minutes.seatingS,
    p_speaker_s: minutes.speakerS,
    p_observer_s: minutes.observerS,
    p_split_speakers: splitSpeakers,
  });
  const { data, error } = await (signal ? call.abortSignal(signal) : call);
  if (error) throw error;
  return data as string;
}

/** Whether round `roundNo` exists — asked when a start's answer was lost on the way back, to tell
 * "the round started" from "nothing was saved". */
export async function roundExists(eventId: string, roundNo: number, signal?: AbortSignal): Promise<boolean> {
  const query = supabase.from('event_rounds').select('id').eq('event_id', eventId).eq('round_no', roundNo).limit(1);
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** "+1 min" on the running round: one more minute on the part running now. */
export async function hostExtendRound(
  roundId: string,
  phase: 'seating' | 'first' | 'second' | 'observer',
  signal?: AbortSignal,
): Promise<void> {
  const call = supabase.rpc('host_extend_round', { p_round_id: roundId, p_phase: phase });
  const { error } = await (signal ? call.abortSignal(signal) : call);
  if (error) throw error;
}

export async function hostSetRoundSeats(roundId: string, seats: Seat[], signal?: AbortSignal): Promise<void> {
  const call = supabase.rpc('host_set_round_seats', { p_round_id: roundId, p_seats: toJsonSeats(seats) });
  const { error } = await (signal ? call.abortSignal(signal) : call);
  if (error) throw error;
}

export async function hostEndRounds(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('host_end_rounds', { p_event_id: eventId });
  if (error) throw error;
}

export interface RoundPresence {
  memberId: string;
  leftAt: string | null;
  sitsOutRound: number | null;
}

export async function getRoundPresence(eventId: string): Promise<Map<string, RoundPresence>> {
  const { data, error } = await supabase
    .from('event_round_presence')
    .select('room_member_id, left_at, sits_out_round')
    .eq('event_id', eventId);
  if (error) throw error;
  return new Map(
    (data as { room_member_id: string; left_at: string | null; sits_out_round: number | null }[]).map(p => [
      p.room_member_id,
      { memberId: p.room_member_id, leftAt: p.left_at, sitsOutRound: p.sits_out_round },
    ]),
  );
}

export async function hostSetRoundPresence(
  eventId: string,
  memberId: string,
  left: boolean,
  sitsOutRound: number | null,
): Promise<void> {
  const { error } = await supabase.rpc('host_set_round_presence', {
    p_event_id: eventId,
    p_room_member_id: memberId,
    p_left: left,
    p_sits_out_round: sitsOutRound,
  });
  if (error) throw error;
}

export async function confirmRoundSeat(roundId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_round_seat', { p_round_id: roundId });
  if (error) throw error;
}

export async function setRoundTopic(roundId: string, table: number, pointId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_round_topic', { p_round_id: roundId, p_table_no: table, p_point_id: pointId });
  if (error) throw error;
}

/** The statement one table marked, or null. Throws on failure. */
export async function getRoundTopic(roundId: string, table: number): Promise<string | null> {
  const { data, error } = await supabase
    .from('event_round_tables')
    .select('topic_point_id')
    .eq('round_id', roundId)
    .eq('table_no', table)
    .maybeSingle();
  if (error) throw error;
  return (data as { topic_point_id: string | null } | null)?.topic_point_id ?? null;
}

export async function setRoundPositionMoved(roundId: string, moved: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_round_position_moved', { p_round_id: roundId, p_moved: moved });
  if (error) throw error;
}

/**
 * P1337 — profile ids of this event's attendees whose transcription is live right now (consent
 * given, not ended, device seen in the last 10 minutes). Host only: the function returns no rows
 * to anyone else. Profile ids only — never a transcript.
 */
export async function getTranscribingNow(eventId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('get_event_transcribing_now', { p_event_id: eventId });
  if (error) throw error;
  return new Set(((data ?? []) as { profile_id: string }[]).map(r => r.profile_id));
}
