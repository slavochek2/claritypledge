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
}

export type StartClarifyResult =
  | { status: 'started'; draftId: string; threadRootId: string; mirrorConversationId: string }
  | { status: 'busy'; draftId: string | null; threadRootId: string | null; mirrorConversationId: string | null };

export type AnotherPointResult = { status: 'started'; draftId: string } | { status: 'busy'; draftId: string | null };
export type RetryResult = { status: 'started' } | { status: 'busy' };
export type InvokeResult = { ok: true } | { ok: false; reason: 'capped' | 'failed' };

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
  throw new Error('clarify_another: unexpected answer');
}

export async function retryClarify(draftId: string): Promise<RetryResult> {
  const r = await call('clarify_retry', { p_draft: draftId });
  if (r.status === 'busy') return { status: 'busy' };
  return { status: 'started' };
}

/** Owner only. A refusal (someone else has a position) throws with the server's words; the card shows them. */
export async function editClarifyDraft(draftId: string, statement: string): Promise<void> {
  await call('clarify_draft_edit', { p_draft: draftId, p_statement: statement });
}

/** Owner only; refused while the draft is queued or running. */
export async function deleteClarifyDraft(draftId: string): Promise<void> {
  await call('clarify_draft_delete', { p_draft: draftId });
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
    suggestions: Array.isArray(d.suggestions) ? d.suggestions.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [],
    errorCode: str(d.error_code),
    cited: citedOf(d.cited),
  };
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
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
