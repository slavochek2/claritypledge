/**
 * @file canvas-list-parts.tsx
 * @description P1536: what a canvas thread's message list draws above and instead of its messages, split out of use-canvas-parts.
 *  - W3/W7: the opener and Copy prompt are the onboarding of a canvas with NO base version.
 *  - 3c X8: inside the workspace a draft with a base opens with a line from the mirror agent instead of the owner-authored base root card (drawn on screen from the base's
 *    number: not stored, not a message).
 *  - A new canvas has no card at the top (its root only carries the draft's own version); an update's root is the base version: read outside the workspace it stays the card,
 *    inside it the agent's line takes its place.
 */
import type { ReactNode } from 'react';
import { MirrorAgentLine } from '@/app/pages/canvas/mirror-panel-title';
import type { ChatSummary } from '@/app/data/chat-service';
import { CanvasThreadOpener } from './CanvasOpener';
import type { CanvasWorkspaceProps } from './canvas-send-slot';
import type { CanvasThread } from './use-canvas-thread';

export function canvasListParts(args: {
  canvasRoot: boolean;
  rootId: string;
  workspace?: CanvasWorkspaceProps;
  mirror: ChatSummary;
  /** the draft's thread (null: not read, or drafting is off) and whether drafting is on (null: unknown) */
  canvas: CanvasThread | null | undefined;
  canvasOn: boolean | null;
}): { lead: ReactNode; leadAfterId: string | null; hideId: string | null } {
  const { canvasRoot, rootId, workspace, mirror, canvas, canvasOn } = args;
  const live = canvasOn === true ? canvas : null;
  const hasBase = !!canvas?.draft.baseVersionId;
  let lead: ReactNode;
  if (live && !live.draft.baseVersionId) lead = <CanvasThreadOpener title={mirror.title} />;
  else if (live && workspace) lead = <MirrorAgentLine mirror={mirror} seq={workspace.baseSeq ?? null} />;
  return { lead, leadAfterId: null, hideId: canvasRoot && canvasOn !== false && (!hasBase || !!workspace) ? rootId : null };
}
