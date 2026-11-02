/**
 * @file chat-round-threads.ts
 * @description P1592: the viewer's round threads in one event channel ("My rounds"). One read of
 * `get_my_round_threads`, which the database restricts to threads the viewer was seated in and can
 * still read; the client adds no rule of its own.
 */
import { supabase } from '@/lib/supabase';

export interface RoundThread {
  /** The thread's root message id: opening the thread is opening this id. */
  rootMessageId: string;
  roundNo: number;
  /** "Round 2 · Anna & Ben". */
  title: string;
  createdAt: string;
}

export interface RoundThreadRow {
  root_message_id: string;
  round_no: number;
  title: string;
  created_at: string;
}

export function mapRoundThreadRow(row: RoundThreadRow): RoundThread {
  return { rootMessageId: row.root_message_id, roundNo: row.round_no, title: row.title, createdAt: row.created_at };
}

/** Newest round first (the database already orders it; this keeps the contract in one place). */
export async function getMyRoundThreads(conversationId: string): Promise<RoundThread[]> {
  const { data, error } = await supabase.rpc('get_my_round_threads', { p_conversation: conversationId });
  if (error) throw new Error(`chat get_my_round_threads failed: ${error.message}`);
  return ((data ?? []) as unknown as RoundThreadRow[]).map(mapRoundThreadRow);
}

export interface OpenRoundSeat {
  /** The root of the thread at the viewer's table in the event's open round; null when that thread does not exist yet (or is not readable by them). */
  rootMessageId: string | null;
  /** Whether the event's latest round is still open. Absent/true = open. */
  roundOpen?: boolean;
  /** The viewer's newest round thread (any round), for when no round is open. */
  latestRootMessageId?: string | null;
}

/**
 * One read of `get_my_open_round_seat`. `rootMessageId` is set only while the viewer is seated in the open round
 * (not marked left, not sitting it out; presence is host-only, so the client cannot decide that itself).
 * `roundOpen` says whether a round is open at all; `latestRootMessageId` is the viewer's newest round thread.
 * null = the viewer cannot read the event channel.
 */
export async function getMyOpenRoundSeat(conversationId: string): Promise<OpenRoundSeat | null> {
  const { data, error } = await supabase.rpc('get_my_open_round_seat', { p_conversation: conversationId });
  if (error) throw new Error(`chat get_my_open_round_seat failed: ${error.message}`);
  const row = ((data ?? []) as unknown as {
    seated: boolean; root_message_id: string | null; round_open: boolean; latest_root_message_id: string | null;
  }[])[0];
  if (!row) return null;
  return {
    rootMessageId: row.seated ? (row.root_message_id ?? null) : null,
    roundOpen: row.round_open,
    latestRootMessageId: row.latest_root_message_id ?? null,
  };
}
