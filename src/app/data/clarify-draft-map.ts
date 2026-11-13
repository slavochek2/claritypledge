/**
 * @file clarify-draft-map.ts
 * @description Maps a raw Clarify RPC row to a ClarifyDraft (pure; no network).
 */
import type { ClarifyCitedLine, ClarifyDraft, ClarifyDraftState, OwnerPosition } from './clarify-service';

export type Row = Record<string, unknown>;
export const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

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

export function mapDraft(raw: unknown): ClarifyDraft | null {
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
