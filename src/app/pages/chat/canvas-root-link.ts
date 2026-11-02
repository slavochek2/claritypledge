/**
 * @file canvas-root-link.ts
 * @description P1536 3c X11: where a canvas thread root's "N replies" goes, from what its draft is NOW: an open draft is edited in the workspace (a real address: the anchor can be opened in a
 * new tab); a published or discarded one is read in the chat's own thread panel (its own thread address). Null: nothing to open (no draft this viewer can read, or an open one whose
 * address is not readable).
 */
import type { CanvasDraft } from '@/app/data/canvas-draft-service';
import type { ChatMessage } from '@/app/data/chat-service';
import { workspaceHref } from '@/lib/canvas-hrefs';
import { chatPath } from './chat-view-model';

export interface RootLinkTarget {
  href: string;
  /** The workspace on an open draft (the tap navigates there on the Thread tab) as opposed to the chat's own thread panel. */
  workspace: boolean;
}

export function rootLinkTarget(draft: CanvasDraft | null, slug: string | null | undefined, root: Pick<ChatMessage, 'id' | 'conversationId'>): RootLinkTarget | null {
  if (!draft) return null;
  if (draft.state !== 'open') return { href: chatPath(root.conversationId, { rootId: root.id }), workspace: false };
  if (!slug || !draft.canvasName || !draft.versionName) return null;
  return { href: workspaceHref(slug, draft.canvasName, draft.versionName), workspace: true };
}
