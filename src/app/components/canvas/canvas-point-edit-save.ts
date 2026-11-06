/**
 * @file canvas-point-edit-save.ts
 * @description P1621 round 2: the write of one hand edit as a value, so the editor only decides what to show. On a pending page it first makes the draft (canvas-hand-draft), maps the point's id
 * onto the draft's own, then edits. Never throws: a failure is an outcome (`failed`), and `created` says whether a draft was made on the way (the editor then carries its text there).
 */
import { editCanvasDraftPoint } from '@/app/data/canvas-draft-service';
import type { PointWithUserPosition } from '@/app/types';
import { mapPointId, resolveTarget, type EnsureDraft, type HandDraftResult } from './canvas-hand-draft';

export type EditOutcome =
  | { kind: 'saved'; pointId: string; created: Extract<HandDraftResult, { ok: true }> | null }
  | { kind: 'problem' | 'failed'; text: string; stale: boolean; pointId: string; created: Extract<HandDraftResult, { ok: true }> | null };

export async function writeEdit(
  edit: { draftId: string; revision: number; userId?: string; ensure?: EnsureDraft }, box: string, point: PointWithUserPosition, next: string,
  texts: { busy: string; stale: string; failed: string },
): Promise<EditOutcome> {
  let created: Extract<HandDraftResult, { ok: true }> | null = null;
  let pointId = point.id;
  try {
    const target = await resolveTarget(edit);   // a pending page makes its draft here, as the first message does
    if (!target.ok) return { kind: 'problem', text: target.text, stale: false, pointId, created };
    created = target.created;
    const mapped = await mapPointId(target, created?.versionName ?? null, box, point.id, point.statement, edit.userId ?? '');
    pointId = mapped.kind === 'id' ? mapped.id : point.id;
    // none or ambiguous: the sentence for a changed draft, never a guess at which point was meant
    const r = mapped.kind === 'id' ? await editCanvasDraftPoint(target.draftId, mapped.id, next, target.revision) : ({ ok: false, refused: 'stale_view' } as const);
    if (r.ok) return { kind: 'saved', pointId: r.pointId || pointId, created };
    const busy = r.refused === 'busy' || r.refused === 'busy_elsewhere';
    return { kind: 'problem', text: busy ? texts.busy : texts.stale, stale: !busy, pointId, created };
  } catch {
    return { kind: 'failed', text: texts.failed, stale: true, pointId, created };
  }
}
