/**
 * P1631: what makes a mirror thread a Clarify thread: its root is a Clarify copy. Then the thread shows the drafts under that copy,
 * names itself "Your Mirror" / "Only you see this", and takes no composer in this step (refining by chatting is a later step).
 */
import type { ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-service';
import { ClarifyDrafts } from './ClarifyDrafts';
import { registerClarifyThread } from './clarify-run';
import { chatTitle } from './chat-view-model';
import { CLARIFY_SUBTITLE, CLARIFY_TITLE } from './clarify-copy';

export const isClarifyRoot = (summary: Pick<ChatSummary, 'kind'>, root: ChatMessage | undefined): boolean =>
  summary.kind === 'mirror' && root?.kind === 'clarify' && !root.threadRootId && !root.isDeleted;

export function useClarifyParts(summary: ChatSummary, root: ChatMessage | undefined, userId: string): {
  isClarify: boolean;
  headerTitle: ReactNode;
  trailing: { afterId: string; node: ReactNode } | null;
} {
  const isClarify = isClarifyRoot(summary, root);
  const rootId = isClarify ? root?.id : undefined;
  if (rootId) registerClarifyThread(rootId);
  if (!isClarify || !root) return { isClarify: false, headerTitle: null, trailing: null };
  return {
    isClarify,
    headerTitle: (
      <>
        <h2 className="truncate text-base font-semibold text-foreground">{CLARIFY_TITLE}</h2>
        <p className="truncate text-xs text-muted-foreground">{CLARIFY_SUBTITLE}</p>
      </>
    ),
    trailing: { afterId: root.id, node: <ClarifyDrafts rootId={root.id} name={chatTitle(summary)} userId={userId} /> },
  };
}
