/**
 * P1631: the client calls of Clarify. Every rule (who may clarify what, the spend, the validation of the model's output, what
 * the owner may see) lives in the database functions and the `clarify-draft` edge function; nothing here decides access.
 * Busy, capped and failed are values the screen shows, never throws. A call that cannot be made at all throws.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';

export type ClarifyDraftState = 'queued' | 'running' | 'done' | 'refused' | 'failed' | 'capped';
export type OwnerPosition = import('@/app/types').PositionType | null;

export interface ClarifyCitedLine { id: string; text: string; at: string | null }
export interface ClarifyDraftPoint { id: string; statement: string; ownerPosition: OwnerPosition }
export interface ClarifyDraft {
  id: string;
  state: ClarifyDraftState;
  point: ClarifyDraftPoint | null;
  /** Two or three things to test instead, when the agent found no real disagreement (state `refused`). */
  suggestions: string[];
  errorCode: string | null;
  /** Lines the agent cited, resolved by the server from the chat itself, never model text, no names. */
  cited: ClarifyCitedLine[];
  /** When the draft was queued (ISO): places it among the owner's own messages in the thread. */
  createdAt: string;
  /** The card this card replaced (a refine), or null. A card that a newer done card names here is an earlier version. */
  refineTargetId: string | null;
  /** Kind of the chat the pressed message was in ('mirror' has no chat to publish into), or null when unknown. */
  sourceKind: string | null;
  /** The live cards of this point in chats (none: not published, or its cards were deleted). */
  published: { conversationId: string; messageId: string }[];
}

export type StartClarifyResult =
  | { status: 'started'; draftId: string; threadRootId: string; mirrorConversationId: string }
  | { status: 'busy'; draftId: string | null; threadRootId: string | null; mirrorConversationId: string | null };

export type AnotherPointResult = { status: 'started'; draftId: string } | { status: 'busy'; draftId: string | null } | { status: 'refused'; code: string };
/** A message typed in the Clarify thread: posted and a run queued in one call. */
export type ClarifyMessageResult = { status: 'started'; draftId: string } | { status: 'busy' };
export type RetryResult = { status: 'started' } | { status: 'busy' } | { status: 'refused'; code: string };
/** The server refusing a change is an answer, not a failure of the call: callers keep what the user typed and say so. */
export type ClarifyChangeResult = { status: 'ok' } | { status: 'refused'; code: string };
/** `pending`: the function answered that the draft is still being made (another call has it, or its context was locked): ask again. */
export type InvokeResult = { ok: true; pending?: true } | { ok: false; reason: 'capped' | 'failed' };

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

async function call(name: string, args: Record<string, unknown>): Promise<Row> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    throw new Error(`${name} failed: ${error.message}`);
  }
  return (data ?? {}) as Row;
}

export async function startClarify(sourceId: string): Promise<StartClarifyResult> {
  const r = await call('clarify_start', { p_source: sourceId });
  const draftId = str(r.draft_id);
  const threadRootId = str(r.thread_root_id);
  const mirrorConversationId = str(r.mirror_conversation_id);
  if (r.status === 'started' && draftId && threadRootId && mirrorConversationId) {
    return { status: 'started', draftId, threadRootId, mirrorConversationId };
  }
  if (r.status === 'busy') return { status: 'busy', draftId, threadRootId, mirrorConversationId };
  throw new Error('clarify_start: unexpected answer');
}

export async function anotherPoint(threadRoot: string, instruction?: string | null): Promise<AnotherPointResult> {
  const r = await call('clarify_another', { p_thread_root: threadRoot, ...(instruction ? { p_instruction: instruction } : {}) });
  const draftId = str(r.draft_id);
  if (r.status === 'started' && draftId) return { status: 'started', draftId };
  if (r.status === 'busy') return { status: 'busy', draftId };
  if (r.status === 'refused') return { status: 'refused', code: str(r.code) ?? 'refused' };
  throw new Error('clarify_another: unexpected answer');
}

/** `targetDraftId`: the card a Mention in chat names; the message refines that card instead of the latest. */
export async function clarifyMessage(threadRoot: string, text: string, targetDraftId?: string | null): Promise<ClarifyMessageResult> {
  const r = await call('clarify_message', { p_thread_root: threadRoot, p_text: text, ...(targetDraftId ? { p_target: targetDraftId } : {}) });
  const draftId = str(r.draft_id);
  if (r.status === 'started' && draftId) return { status: 'started', draftId };
  if (r.status === 'busy') return { status: 'busy' };
  throw new Error('clarify_message: unexpected answer');
}

/** A queued draft whose run never started (the invoke failed): the server fails it, so it shows Retry. A draft already started or finished is left alone. */
export async function markClarifyFailed(draftId: string): Promise<void> {
  await call('clarify_mark_failed', { p_draft: draftId });
}

export async function retryClarify(draftId: string): Promise<RetryResult> {
  const r = await call('clarify_retry', { p_draft: draftId });
  if (r.status === 'busy') return { status: 'busy' };
  if (r.status === 'refused') return { status: 'refused', code: str(r.code) ?? 'refused' };
  return { status: 'started' };
}

const changeResult = (r: Row): ClarifyChangeResult => (r.status === 'refused' ? { status: 'refused', code: str(r.code) ?? 'refused' } : { status: 'ok' });

/** Owner only. Refused (someone else has a position, or there is no point) comes back as a value; a call that cannot be made throws. */
export async function editClarifyDraft(draftId: string, statement: string): Promise<ClarifyChangeResult> {
  return changeResult(await call('clarify_draft_edit', { p_draft: draftId, p_statement: statement }));
}

/** Owner only; refused while the draft is queued or running (a value, not a throw). */
export async function deleteClarifyDraft(draftId: string): Promise<ClarifyChangeResult> {
  return changeResult(await call('clarify_draft_delete', { p_draft: draftId }));
}

export type PublishResult =
  | { status: 'published' | 'already'; messageId: string; conversationId: string; threadRootId: string | null }
  | { status: 'refused'; code: string };

/** Owner only. Posts the card's point into the chat it came from; a refusal is an answer (a value), a call that cannot be made throws. */
export async function publishClarify(draftId: string): Promise<PublishResult> {
  const r = await call('clarify_publish', { p_draft: draftId, p_client_id: crypto.randomUUID() });
  if (r.status === 'refused') return { status: 'refused', code: str(r.code) ?? 'refused' };
  const messageId = str(r.message_id);
  const conversationId = str(r.conversation_id);
  if ((r.status === 'published' || r.status === 'already') && messageId && conversationId) {
    return { status: r.status, messageId, conversationId, threadRootId: str(r.thread_root_id) };
  }
  throw new Error('clarify_publish: unexpected answer');
}

/** True when the caller can read this private point and a live chat card of it exists (the point has no link and takes no story). A failed call throws. */
export async function isPointChatShared(pointId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('point_chat_shared', { p_point: pointId });
  if (error) throw new Error(`point_chat_shared failed: ${error.message}`);
  return data === true;
}

const STATES: ClarifyDraftState[] = ['queued', 'running', 'done', 'refused', 'failed', 'capped'];

function citedOf(v: unknown): ClarifyCitedLine[] {
  const flat = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as Row).flatMap((x) => (Array.isArray(x) ? x : [])) : [];
  const seen = new Set<string>();
  const out: ClarifyCitedLine[] = [];
  for (const raw of flat) {
    const l = (raw ?? {}) as Row;
    const id = str(l.id);
    if (!id || seen.has(id) || typeof l.text !== 'string') continue;
    seen.add(id);
    out.push({ id, text: l.text, at: str(l.at) });
  }
  return out;
}

function mapDraft(raw: unknown): ClarifyDraft | null {
  const d = (raw ?? {}) as Row;
  const id = str(d.id) ?? str(d.draft_id);
  const state = STATES.find((s) => s === d.state);
  if (!id || !state) return null;
  const p = d.point as Row | null | undefined;
  const pid = p ? str(p.id) : null;
  return {
    id,
    state,
    point: p && pid && typeof p.statement === 'string' ? { id: pid, statement: p.statement, ownerPosition: (str(p.owner_position) as OwnerPosition) } : null,
    // distinct, so a chip's key (its text) is unique
    suggestions: Array.isArray(d.suggestions) ? [...new Set(d.suggestions.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()))] : [],
    errorCode: str(d.error_code),
    cited: citedOf(d.cited),
    createdAt: str(d.created_at) ?? '',
    refineTargetId: str(d.refine_target_id),
    sourceKind: str(d.source_kind),
    published: publishedOf(d.published),
  };
}

function publishedOf(v: unknown): ClarifyDraft['published'] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw) => {
    const x = (raw ?? {}) as Row;
    const conversationId = str(x.conversation_id);
    const messageId = str(x.message_id);
    return conversationId && messageId ? [{ conversationId, messageId }] : [];
  });
}

/** The drafts of one Clarify thread, oldest first. Owner only: anyone else gets none. */
export async function getClarifyThread(threadRoot: string): Promise<ClarifyDraft[]> {
  const { data, error } = await supabase.rpc('get_clarify_thread', { p_thread_root: threadRoot });
  if (error) {
    throw new Error(`get_clarify_thread failed: ${error.message}`);
  }
  const list = Array.isArray(data) ? data : Array.isArray((data as Row | null)?.drafts) ? ((data as Row).drafts as unknown[]) : [];
  return list.map(mapDraft).filter((d): d is ClarifyDraft => d !== null);
}

/** One read for a whole Mirror conversation: Clarify root id -> how many of the caller's drafts it holds. Only the caller's own; anyone else gets {}. */
export async function getClarifyDraftCounts(conversationId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('clarify_draft_counts', { p_conversation: conversationId });
  if (error) {
    throw new Error(`clarify_draft_counts failed: ${error.message}`);
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries((data ?? {}) as Row)) if (typeof v === 'number' && v > 0) out[k] = v;
  return out;
}

/** Starts the model run for a queued draft. Anything but a clean answer is a value: capped, or failed (the draft itself holds the error). */
export async function invokeClarifyDraft(draftId: string): Promise<InvokeResult> {
  try {
    const { data, error } = await supabase.functions.invoke('clarify-draft', { body: { draft_id: draftId } });
    // The run may have written a private point row, a table the list-return cache holds (P1364).
    clearListReturnCache();
    if (error) return { ok: false, reason: 'failed' };
    const state = (data as Row | null)?.state;
    if (state === 'capped') return { ok: false, reason: 'capped' };
    if (state === 'failed') return { ok: false, reason: 'failed' };
    if (state === 'running' || state === 'queued') return { ok: true, pending: true };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
