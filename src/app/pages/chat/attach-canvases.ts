/**
 * @file attach-canvases.ts
 * @description P1650: the Canvases tab of the chat's attach dialog (ChatDialogs.tsx AttachDialog): the tab list, the
 * canvases the server says this chat may carry as Shareables, and the words for an empty tab.
 */
import { canvasService } from '@/app/data/canvas-service';
import { canvasDisplayTitle } from '@/lib/canvas-boxes';
import type { Shareable } from '@/app/data/chat-ui-helpers';

export type AttachTab = 'point' | 'story' | 'canvas';
export const ATTACH_TABS: readonly AttachTab[] = ['point', 'story', 'canvas'];
export const ATTACH_TAB_LABEL: Record<AttachTab, string> = { point: 'Points', story: 'Stories', canvas: 'Canvases' };

/** The search box of the attach dialog: points and stories have #tags, canvases do not. */
export const ATTACH_SEARCH = {
  item: { placeholder: 'Search words or #tags', label: 'Search points and stories' },
  canvas: { placeholder: 'Search words', label: 'Search canvases' },
};

/** The conversation the attach dialog asks about: none for a mirror chat (no Canvases tab there). */
export function attachConversationId(summary: { kind: string; conversationId: string }): string | undefined {
  return summary.kind === 'mirror' ? undefined : summary.conversationId;
}

/** The canvases this chat may carry; null when there is no conversation to ask about or the read failed (the tab says so). */
export async function loadAttachableCanvasShareables(conversationId: string | undefined): Promise<Shareable[] | null> {
  if (!conversationId) return [];
  try {
    const rows = await canvasService.listAttachableCanvases(conversationId);
    return rows.map((c): Shareable => ({ kind: 'canvas', id: c.canvasId, title: canvasDisplayTitle(c.title, c.name), tags: [], canvas: { name: c.name, title: c.title } }));
  } catch {
    return null;
  }
}

/**
 * [FOUNDER DECISION: paperclip empty-canvases text] An empty Canvases tab says to share the canvas first; attaching
 * never shares.
 */
export function attachEmptyText(tab: AttachTab, hasAny: boolean, canvasesFailed: boolean): string {
  if (tab === 'canvas' && canvasesFailed) return 'Could not load your canvases. Close this and try again.';
  if (hasAny) return tab === 'canvas' ? 'Nothing matches. Try fewer words.' : 'Nothing matches. Try fewer words or another #tag.';
  if (tab === 'canvas') return 'No canvas of yours is shared with this chat yet. Share the canvas first, then attach it here.';
  return `You have no ${tab === 'point' ? 'points' : 'stories'} to attach yet.`;
}
