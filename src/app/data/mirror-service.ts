/**
 * P1520: the mirror's client calls — its replies, private @mirror asks, and its portrait.
 *
 * The database and the two edge functions own every rule (supabase/migrations/*_p1520_mirror_v2.sql,
 * supabase/functions/mirror-reply, mirror-portrait). Nothing here decides who may see what: every read
 * is RLS-filtered to the signed-in owner, and every model call is gated and paid for on the server.
 */

import { supabase } from '@/lib/supabase';
import { MESSAGE_COLUMNS, mapMessageRow, type ChatMessage, type ChatMessageRow } from './chat-service';

export type MirrorGender = 'female' | 'male' | 'neutral';

export interface MirrorCredit {
  artist: string;
  movement: string | null;
}

export interface MirrorProfile {
  conversationId: string;
  portraitUrl: string | null;
  credit: MirrorCredit | null;
  /** NULL = a random gender for each new face (the default; never guessed from a name). */
  gender: MirrorGender | null;
}

/**
 * What one reply request ended in. `disabled`: the mirror agent cannot answer on this project at all.
 * `terms`: the server refused because the caller has not accepted the current terms (P1544).
 */
export type MirrorReplyState = 'done' | 'running' | 'capped' | 'failed' | 'cancelled' | 'disabled' | 'terms';

export type MirrorJobState = 'queued' | 'running' | 'done' | 'failed' | 'capped' | 'cancelled';

function asGender(v: unknown): MirrorGender | null {
  return v === 'female' || v === 'male' || v === 'neutral' ? v : null;
}

export async function getMirrorProfile(): Promise<MirrorProfile | null> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, portrait_url, portrait_credit, portrait_gender')
    .eq('kind', 'mirror')
    .maybeSingle();
  if (error) throw new Error(`mirror profile failed: ${error.message}`);
  if (!data) return null;
  const row = data as { id: string; portrait_url: string | null; portrait_credit: Record<string, unknown> | null; portrait_gender: string | null };
  const c = row.portrait_credit;
  return {
    conversationId: row.id,
    portraitUrl: row.portrait_url,
    credit: c && typeof c.artist === 'string' ? { artist: c.artist, movement: typeof c.movement === 'string' ? c.movement : null } : null,
    gender: asGender(row.portrait_gender),
  };
}

export async function setMirrorGender(gender: MirrorGender | null): Promise<void> {
  const { error } = await supabase.rpc('set_mirror_gender', { p_gender: gender });
  if (error) throw new Error(`set gender failed: ${error.message}`);
}

/** A private question to the caller's own mirror, from a channel. Nothing is written to the channel. */
export async function askMirror(channelId: string, body: string, clientId: string): Promise<ChatMessage> {
  const { data, error } = await supabase.rpc('mirror_ask', { p_channel: channelId, p_body: body, p_client_id: clientId });
  if (error) throw new Error(`mirror ask failed: ${error.message}`);
  return mapMessageRow(data as ChatMessageRow);
}

/**
 * The caller's newest 200 asks and answers that belong to this channel, oldest first. Older ones stay in the
 * mirror itself, where its own paging reaches them; the channel shows the recent exchange.
 */
export async function listMirrorAsks(channelId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('context_conversation_id', channelId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(200);
  if (error) throw new Error(`mirror asks failed: ${error.message}`);
  return ((data ?? []) as unknown as ChatMessageRow[]).map(mapMessageRow).reverse();
}

export interface MirrorJob {
  state: MirrorJobState;
  createdAt: string;
}

/** The jobs triggered by these messages, by message id (only the caller's own exist to RLS). */
export async function listMirrorJobs(messageIds: string[]): Promise<Map<string, MirrorJob>> {
  const out = new Map<string, MirrorJob>();
  if (messageIds.length === 0) return out;
  const { data, error } = await supabase
    .from('mirror_jobs')
    .select('trigger_message_id, state, created_at')
    .in('trigger_message_id', messageIds.slice(0, 100));
  if (error) throw new Error(`mirror jobs failed: ${error.message}`);
  for (const r of (data ?? []) as Array<{ trigger_message_id: string; state: MirrorJobState; created_at: string }>) {
    out.set(r.trigger_message_id, { state: r.state, createdAt: r.created_at });
  }
  return out;
}

/** The status code and JSON body of a function call, whether it succeeded or not. */
async function callFunction(name: string, body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { status: 200, data: (data ?? {}) as Record<string, unknown> };
  const response = (error as { context?: Response }).context;
  if (response && typeof response.status === 'number') {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = (await response.clone().json()) as Record<string, unknown>;
    } catch {
      /* not JSON */
    }
    return { status: response.status, data: parsed };
  }
  return { status: 0, data: {} };
}

/**
 * Whether the mirror can answer on this project: true or false when the server said so, null when the
 * request failed (network, cold start, auth not ready) and the answer is unknown, so the caller may ask again.
 */
export async function getMirrorAvailability(): Promise<boolean | null> {
  const { status, data } = await callFunction('mirror-reply', { availability: true });
  if (status !== 200) return null;
  return data.enabled === true;
}

function replyState(status: number, data: Record<string, unknown>): MirrorReplyState {
  if (data.code === 'DISABLED') return 'disabled';
  if (status === 409 && data.code === 'TERMS_NOT_ACCEPTED') return 'terms';
  const s = data.state;
  if (s === 'done' || s === 'running' || s === 'capped' || s === 'failed' || s === 'cancelled') return s;
  if (status === 429) return 'capped';
  return 'failed';
}

/** Ask the mirror to answer one of the caller's own messages in their mirror. Idempotent per message. */
export async function requestMirrorReply(messageId: string): Promise<MirrorReplyState> {
  const { status, data } = await callFunction('mirror-reply', { message_id: messageId });
  return replyState(status, data);
}

/** Paint a new face. `running`: one is already being painted. */
export async function newMirrorFace(): Promise<MirrorReplyState> {
  const { status, data } = await callFunction('mirror-portrait', {});
  return replyState(status, data);
}
