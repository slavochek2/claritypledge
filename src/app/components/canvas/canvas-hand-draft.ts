/**
 * @file canvas-hand-draft.ts
 * @description P1621 round 2: a hand edit on a PENDING page (a Clone tapped: ws=1 on a published version, no draft yet). The first hand write (new card, Edit Save or Remove) first makes the draft
 * through the same opener the first message uses (the page's `ensure`, use-hand-draft), then writes against the new draft with the revision it came back with.
 * Unsaved text is keyed by the CANVAS, not the draft (a canvas has at most one open draft: a pending Clone and the draft it becomes share their buffers), so a draft made on the way moves nothing:
 * the buffer stays where it is, with the refusal's sentence, and the page simply moves to the draft.
 * The draft starts as its base: private base points keep their ids, a legacy public point is carried as a private COPY with a new id (_canvas_draft_new), so an edit or a removal of a published
 * point's id is mapped to the draft's own id AT WRITE TIME by reading the draft's points (the same id when it is one of them, else the point with the same words in the same box). An Edit buffer
 * whose point is absent from the draft shows as gone with its text kept (P1614's way).
 */
import { supabase } from '@/lib/supabase';
import { currentVersionsOnly } from '@/app/data/point-versions';
import { SAVED_CARD_HOLD_MS } from './canvas-new-card-store';

// [FOUNDER DECISION: pending] said when the first hand save finds the canvas already has an open draft (another tab, another base): nothing was made, the text stays.
export const OPEN_ELSEWHERE_TEXT = 'This canvas already has a draft open somewhere else. Open it, then add your text there.';

// [FOUNDER DECISION: pending] said when Remove cannot tell which of several same-worded points of the new draft was meant: nothing is removed.
export const REMOVE_AMBIGUOUS_TEXT = 'This point changed. Try Remove again.';

/**
 * A draft just made for a pending page whose page has not moved onto it yet: a full-box sentence it just said is not stale in that gap (the page still has no draft id of its own). Held for as
 * long as a saved card is expected to take to come back (SAVED_CARD_HOLD_MS), the same grace the saved-card hold uses.
 */
const arriving = new Map<string, number>();
export const expectDraft = (draftId: string): void => { arriving.set(draftId, Date.now() + SAVED_CARD_HOLD_MS); };
export const draftArriving = (draftId: string | null): boolean => !!draftId && (arriving.get(draftId) ?? 0) > Date.now();

export type HandDraftResult =
  | { ok: true; draftId: string; revision: number; versionName: string | null; /** the page moves to the new draft (the same move the first message makes) */ moveTo: () => void }
  | { ok: false; text: string };
/** Makes (or finds, within one tap's double click) the draft a pending page writes to. */
export type EnsureDraft = () => Promise<HandDraftResult>;

/** Where a write goes: the page's own draft, or the one just made for a pending page (`created`). */
export type WriteTarget = { ok: true; draftId: string; revision: number; created: Extract<HandDraftResult, { ok: true }> | null } | { ok: false; text: string };

export async function resolveTarget(edit: { draftId: string; revision: number; ensure?: EnsureDraft }): Promise<WriteTarget> {
  if (!edit.ensure) return { ok: true, draftId: edit.draftId, revision: edit.revision, created: null };
  const r = await edit.ensure();
  return r.ok ? { ok: true, draftId: r.draftId, revision: r.revision, created: r } : r;
}

export type MappedPoint = { kind: 'id'; id: string } | { kind: 'none' } | { kind: 'ambiguous' };

/**
 * The draft's own id for a point seen on the published version, from the OWNER's points tagged with the draft: the same id when it is one of them; else the one point with the same words
 * in the same box. None: the draft holds no such point. Ambiguous: several do, so which was meant is not known and the caller refuses with the stale sentence rather than guess.
 */
export async function mapPointId(target: Extract<WriteTarget, { ok: true }>, versionName: string | null, box: string, originId: string, statement: string, ownerId: string): Promise<MappedPoint> {
  if (!target.created || !versionName) return { kind: 'id', id: originId };
  return mapDraftPoint(versionName, box, originId, statement, ownerId);
}

/** One point of a draft as the lookup reads it. */
export interface DraftPointRow { id: string; statement: string; system_tags: string[] }

/**
 * One read of the owner's points tagged with the draft (`box` narrows it further when only one box matters). A failed read THROWS: it is not "no such point", and callers keep the
 * text and say the failure sentence (or leave the buffers for the next read).
 */
export async function readDraftPoints(versionName: string, ownerId: string, box?: string): Promise<DraftPointRow[]> {
  if (!ownerId) throw new Error('mapPointId: the owner is required');
  const { data, error } = await currentVersionsOnly(
    supabase.from('points').select('id, statement, system_tags').contains('system_tags', box ? [`canvas_${versionName}`, box] : [`canvas_${versionName}`]).eq('first_validator_id', ownerId),
  );
  if (error) throw new Error('Could not read this draft');
  return (data ?? []) as DraftPointRow[];
}

/** The mapping itself, on rows already read: the same id when it is one of them, else the one point with the same words in the same box. Several: ambiguous, never a guess. */
export function mapLocal(rows: readonly DraftPointRow[], box: string, originId: string, statement: string): MappedPoint {
  if (rows.some(r => r.id === originId)) return { kind: 'id', id: originId };
  const words = statement.trim();
  const same = rows.filter(r => r.statement.trim() === words && r.system_tags.includes(box));
  if (same.length > 1) return { kind: 'ambiguous' };
  return same[0] ? { kind: 'id', id: same[0].id } : { kind: 'none' };
}

export async function mapDraftPoint(versionName: string, box: string, originId: string, statement: string, ownerId: string): Promise<MappedPoint> {
  return mapLocal(await readDraftPoints(versionName, ownerId, box), box, originId, statement);
}
