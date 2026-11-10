/**
 * P1631: what makes a mirror thread a Clarify thread: its root is a Clarify copy. Then the thread shows the drafts under that copy,
 * names itself "Your Mirror" / "Only you see this", and takes a composer: a message there refines the latest draft or adds another.
 */
import { useLayoutEffect, type ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-service';
import { ClarifyComposer } from './ClarifyComposer';
import { ClarifyDrafts } from './ClarifyDrafts';
import { useClarifyThread } from './use-clarify-thread';
import { registerClarifyThread } from './clarify-run';
import { chatTitle } from './chat-view-model';
import { CLARIFY_SUBTITLE, CLARIFY_TITLE } from './clarify-copy';

export const isClarifyRoot = (summary: Pick<ChatSummary, 'kind'>, root: ChatMessage | undefined): boolean =>
  summary.kind === 'mirror' && root?.kind === 'clarify' && !root.threadRootId && !root.isDeleted;

export function useClarifyParts(summary: ChatSummary, root: ChatMessage | undefined, userId: string): {
  isClarify: boolean;
  headerTitle: ReactNode;
  trailing: { afterId: string; node: ReactNode } | null;
  /** The thread's composer (the product's own), or null when this is not a Clarify thread. */
  footer: ReactNode;
} {
  const isClarify = isClarifyRoot(summary, root);
  const rootId = isClarify ? root?.id : undefined;
  // Registered in a layout effect: it runs in the commit, before paint and before any realtime callback can run, and render stays pure.
  useLayoutEffect(() => { if (rootId) registerClarifyThread(rootId); }, [rootId]);
  // one read of the drafts, shared by the list and the composer (which waits while a draft is being made)
  const thread = useClarifyThread(rootId ?? null);
  if (!isClarify || !root) return { isClarify: false, headerTitle: null, trailing: null, footer: null };
  const working = thread.drafts.some((d) => d.state === 'queued' || d.state === 'running');
  return {
    isClarify,
    headerTitle: (
      <>
        <h2 className="truncate text-base font-semibold text-foreground">{CLARIFY_TITLE}</h2>
        <p className="truncate text-xs text-muted-foreground">{CLARIFY_SUBTITLE}</p>
      </>
    ),
    trailing: { afterId: root.id, node: <ClarifyDrafts rootId={root.id} name={chatTitle(summary)} userId={userId} thread={thread} /> },
    footer: <ClarifyComposer rootId={root.id} userId={userId} working={working} />,
  };
}
