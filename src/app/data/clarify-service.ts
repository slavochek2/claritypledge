/**
 * P1631: the client calls of Clarify. Every rule (who may clarify what, the spend, the validation of the model's output, what
 * the owner may see) lives in the database functions and the `clarify-draft` edge function; nothing here decides access.
 * Busy, capped and failed are values the screen shows, never throws. A call that cannot be made at all throws.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { mapDraft, str, type Row } from './clarify-draft-map';

export type ClarifyDraftState = 'queued' | 'running' | 'done' | 'refused' | 'failed' | 'capped';
export type OwnerPosition = import('@/app/types').PositionType | null;

export interface ClarifyCitedLine { id: string; text: string; at: string | null }
/** `tags`: the point's tags (P1722, only ever what the owner typed as #tags); absent is none. */
export interface ClarifyDraftPoint { id: string; statement: string; ownerPosition: OwnerPosition; tags?: string[] }
export type ClarifyVisibility = 'private' | 'public';
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
  /** P1722: the owner's choice for this card. Absent is private. Public is applied at Publish (a new public point), never to the draft point itself. */
  visibility?: ClarifyVisibility;
  /** P1722: the draft was ever posted into a chat, so its visibility can no longer change. Absent is never. */
  everPublished?: boolean;
  /** P1722: no newer card was made from this one. Absent is true. */
  isLatest?: boolean;
  /** P1722: the server's verdict that going public needs the warning. Absent is true: an unknown answer warns. */
  publicWarning?: boolean;
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

/** Clarify on a whole chat: `draftId` is null when no draft was asked for (New point); `empty` means the chat has nothing to clarify yet. */
export type StartClarifyChatResult =
  | { status: 'started'; draftId: string | null; threadRootId: string; mirrorConversationId: string }
  | { status: 'busy' }
  | { status: 'empty' };

/** The answer of a start call on a whole chat or a live recording (both return the same shape). */
function chatStartResult(r: Row, fn: string): StartClarifyChatResult {
  const threadRootId = str(r.thread_root_id);
  const mirrorConversationId = str(r.mirror_conversation_id);
  if (r.status === 'started' && threadRootId && mirrorConversationId) {
    return { status: 'started', draftId: str(r.draft_id), threadRootId, mirrorConversationId };
  }
  if (r.status === 'busy') return { status: 'busy' };
  if (r.status === 'empty') return { status: 'empty' };
  throw new Error(`${fn}: unexpected answer`);
}

export async function startClarifyChat(conversationId: string, { draft = true }: { draft?: boolean } = {}): Promise<StartClarifyChatResult> {
  const r = await call('clarify_start_chat', { p_conversation: conversationId, p_draft: draft });
  return chatStartResult(r, 'clarify_start_chat');
}

/** Clarify on the live recording of a room the caller holds a seat in: `empty` means nothing in their read set was recorded yet; `reused` is a second press in the same room. */
export async function startRecordingClarify(roomId: string): Promise<StartClarifyChatResult> {
  const r = await call('clarify_start_recording', { p_room: roomId });
  return chatStartResult(r, 'clarify_start_recording');
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
export async function editClarifyDraft(draftId: string, statement: string, tags?: string[]): Promise<ClarifyChangeResult> {
  return changeResult(await call('clarify_draft_edit', { p_draft: draftId, p_statement: statement, ...(tags ? { p_tags: tags } : {}) }));
}

export type SetVisibilityResult = { status: 'ok'; visibility: ClarifyVisibility; publicWarning: boolean } | { status: 'refused'; code: string };

/** Owner only, on the latest card of a never-published draft. Refused (published, earlier version) comes back as a value. */
export async function setClarifyVisibility(draftId: string, visibility: ClarifyVisibility): Promise<SetVisibilityResult> {
  const r = await call('clarify_set_visibility', { p_draft: draftId, p_visibility: visibility });
  if (r.status === 'refused') return { status: 'refused', code: str(r.code) ?? 'refused' };
  if (r.status === 'ok') return { status: 'ok', visibility: r.visibility === 'public' ? 'public' : 'private', publicWarning: r.public_warning !== false };
  throw new Error('clarify_set_visibility: unexpected answer');
}

/** Owner only; refused while the draft is queued or running (a value, not a throw). */
export async function deleteClarifyDraft(draftId: string): Promise<ClarifyChangeResult> {
  return changeResult(await call('clarify_draft_delete', { p_draft: draftId }));
}

export type PublishResult =
  | { status: 'published' | 'already'; messageId: string; conversationId: string; threadRootId: string | null }
  | { status: 'refused'; code: string };

/** Owner only. Posts the card's point into the chat it came from; a refusal is an answer (a value), a call that cannot be made throws. */
export async function publishClarify(draftId: string, opts: { visibility?: ClarifyVisibility; warningAck?: boolean; expectedStatement?: string } = {}): Promise<PublishResult> {
  const r = await call('clarify_publish', {
    p_draft: draftId, p_client_id: crypto.randomUUID(), p_visibility: opts.visibility ?? 'private', p_warning_ack: opts.warningAck ?? false, p_expected_statement: opts.expectedStatement ?? null,
  });
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

/**
 * Whether Clarify drafting is on for this project: true or false when the server said so, null when the request failed or the answer is unknown (the caller may
 * ask again; unknown is never "on"). The same probe the canvas uses, against the clarify-draft function.
 */
export async function getClarifyAvailability(): Promise<boolean | null> {
  try {
    const { data, error } = await supabase.functions.invoke('clarify-draft', { body: { availability: true } });
    // The probe writes nothing, but the cache-drift guard (P1364) counts any call of this function as a writer; one clear per session is cheap.
    clearListReturnCache();
    if (error) return null;
    const enabled = (data as Row | null)?.enabled;
    return typeof enabled === 'boolean' ? enabled : null;
  } catch {
    return null;
  }
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
