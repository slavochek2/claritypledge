/**
 * @file canvas-draft-opened.ts
 * @description Builds the OpenDraftResult from an open RPC's row plus the draft's re-read (shared by canvas_draft_open and canvas_draft_open_replacing).
 */
import type { OpenDraftResult, Row } from './canvas-draft-calls';

export function openedResultOf(
  r: Row, status: OpenDraftResult['status'], read: { revision: number; canvasId: string; versionName: string | null },
): OpenDraftResult {
  return {
    status,
    revision: read.revision,
    canvasId: read.canvasId,
    versionName: read.versionName,
    draftId: String(r.draft_id),
    conversationId: String(r.conversation_id),
    threadRootId: String(r.thread_root_id),
    canvasName: String(r.canvas_name ?? ''),
    fromSeq: typeof r.from_seq === 'number' ? r.from_seq : null,
  };
}
