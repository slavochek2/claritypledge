/**
 * @file test-chat.ts
 *
 * Helpers for the P1512 chat canaries (e2e/integration/p1512-chat-*.spec.ts).
 *
 * The canaries act as REAL signed-in users through the anon key, exactly like the app. A
 * service-role client is used only to read ground truth and to seed what a client cannot.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase-admin';
import { TEST_PASSWORD, type TestUser } from './test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

export const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface SignedIn {
  client: SupabaseClient;
  userId: string;
}

/** A client signed in as `user` (password grant); retries the per-IP auth rate limit. */
export async function signIn(user: TestUser): Promise<SignedIn> {
  const delays = [3000, 8000, 20000, 45000];
  for (let attempt = 0; ; attempt++) {
    const client = anonClient();
    const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
    if (!error && data.session) {
      client.realtime.setAuth(data.session.access_token);
      return { client, userId: data.user.id };
    }
    const limited = error && (error.status === 429 || /rate limit/i.test(error.message));
    if (!limited || attempt >= delays.length) throw new Error(`sign-in failed for ${user.email}: ${error?.message}`);
    await new Promise((r) => setTimeout(r, delays[attempt]));
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A message row as the canaries read it. */
export interface Row {
  id: string;
  conversation_id: string;
  author_id: string | null;
  body: string | null;
  created_at: string;
  deleted_at: string | null;
  kind: string;
  forward_snapshot: Record<string, unknown> | null;
  forward_author_id: string | null;
  forwarded_from_message_id: string | null;
  thread_root_id: string | null;
  reply_to_id: string | null;
  client_id: string | null;
}

/** RPC that must succeed; returns data. */
export async function ok<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what} should have succeeded but failed: ${error.message}`);
  return data as T;
}

/** RPC / query that must be refused; returns the error. */
export async function refused(
  p: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
  what: string,
): Promise<{ message: string; code?: string }> {
  const { data, error } = await p;
  if (!error) throw new Error(`${what} should have been refused but succeeded: ${JSON.stringify(data)}`);
  return error;
}

/** Ground truth for one chat table row set, unfiltered by RLS. */
export async function adminMessages(conversationId: string): Promise<Row[]> {
  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at');
  if (error) throw new Error(`adminMessages: ${error.message}`);
  return (data ?? []) as Row[];
}

export async function adminConversation(kind: string, key: Record<string, string>): Promise<string> {
  let q = supabaseAdmin.from('chat_conversations').select('id').eq('kind', kind);
  for (const [col, val] of Object.entries(key)) q = q.eq(col, val);
  const { data, error } = await q.maybeSingle();
  if (error || !data) throw new Error(`adminConversation ${kind} ${JSON.stringify(key)}: ${error?.message ?? 'not found'}`);
  return data.id as string;
}

/** The signed-in user's mirror conversation id. get_my_chats creates it on first call, so ask for it first. */
export async function mirrorOf(who: SignedIn): Promise<string> {
  await who.client.rpc('get_my_chats');
  return adminConversation('mirror', { owner_id: who.userId });
}

/** Chat ids a user can currently see in their list. */
export async function myChatIds(c: SupabaseClient): Promise<string[]> {
  const rows = await ok<Array<{ conversation_id: string }>>(c.rpc('get_my_chats'), 'get_my_chats');
  return rows.map((r) => r.conversation_id);
}

// ---------------------------------------------------------------------------
// Realtime collector
// ---------------------------------------------------------------------------
export interface Collected {
  /** Every chat_messages payload (INSERT / UPDATE / DELETE) delivered to this client. */
  messages: Array<{ type: string; new: Record<string, unknown>; old: Record<string, unknown> }>;
  /** Every chat_member_state payload delivered to this client. */
  states: Array<{ type: string; new: Record<string, unknown>; old: Record<string, unknown> }>;
  channel: RealtimeChannel;
}

export async function collect(client: SupabaseClient, label: string): Promise<Collected> {
  const out: Collected = { messages: [], states: [], channel: undefined as unknown as RealtimeChannel };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: channel never reached SUBSCRIBED`)), 20_000);
    out.channel = client
      .channel(`p1512-canary:${label}:${RUN}:${Math.random().toString(36).slice(2, 6)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (p) => {
        out.messages.push({
          type: p.eventType,
          new: (p.new ?? {}) as Record<string, unknown>,
          old: (p.old ?? {}) as Record<string, unknown>,
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_member_state' }, (p) => {
        out.states.push({
          type: p.eventType,
          new: (p.new ?? {}) as Record<string, unknown>,
          old: (p.old ?? {}) as Record<string, unknown>,
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(`${label}: channel ${status}`)); }
      });
  });
  return out;
}

/**
 * Re-fires `fire()` every 500 ms until `done()` or the deadline. A single write sent right after
 * SUBSCRIBED can land before the replication slot forwards this table, and that miss is
 * indistinguishable from a real filter, so the write is repeated (p1114/p1057 pattern).
 */
export async function fireUntil(fire: () => Promise<unknown>, done: () => boolean, timeoutMs = 25_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!done() && Date.now() < deadline) {
    await fire();
    for (let i = 0; i < 4 && !done() && Date.now() < deadline; i++) await sleep(250);
  }
  return done();
}

export async function closeAll(...cs: Array<Collected | undefined>): Promise<void> {
  for (const c of cs) {
    if (c) { try { await c.channel.unsubscribe(); } catch { /* best effort */ } }
  }
}

/** Removes chat rows that would otherwise outlive the fixture users (dm conversations lose both sides on user delete). */
export async function purgeChatFor(userIds: string[], conversationIds: string[] = []): Promise<void> {
  if (conversationIds.length) await supabaseAdmin.from('chat_conversations').delete().in('id', conversationIds);
  if (userIds.length) {
    await supabaseAdmin.from('chat_conversations').delete().eq('kind', 'dm').in('dm_user_a', userIds);
    await supabaseAdmin.from('chat_conversations').delete().eq('kind', 'dm').in('dm_user_b', userIds);
  }
}
