/**
 * P1631: what makes a mirror thread a Clarify thread: its root is a Clarify copy. Then the thread reads as one conversation in time order: the owner's typed messages, and the
 * Mirror's drafts drawn right after the message each follows (as `after` nodes of the message list). It names itself "Your Mirror" / "Only you see this", and takes a composer:
 * a message there refines the latest draft, or the card a "Mention in chat" pill names.
 */
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-service';
import { ClarifyComposer } from './ClarifyComposer';
import { ClarifyDraftsView } from './ClarifyDrafts';
import { useClarifyThread } from './use-clarify-thread';
import { useClarifyActions } from './use-clarify-actions';
import { registerClarifyThread } from './clarify-run';
import { draftsByMessage } from './clarify-timeline';
import { mirrorRole } from './chat-view-model';
import { CLARIFY_SUBTITLE, CLARIFY_TITLE } from './clarify-copy';

export const isClarifyRoot = (summary: Pick<ChatSummary, 'kind'>, root: ChatMessage | undefined): boolean =>
  summary.kind === 'mirror' && root?.kind === 'clarify' && !root.threadRootId && !root.isDeleted;

export function useClarifyParts(summary: ChatSummary, root: ChatMessage | undefined, userId: string, messages: ChatMessage[]): {
  isClarify: boolean;
  headerTitle: ReactNode;
  /** The drafts drawn under the messages they follow, by message id; null when this is not a Clarify thread. */
  after: Record<string, ReactNode> | null;
  /** The thread's composer (the product's own), or null when this is not a Clarify thread. */
  footer: ReactNode;
} {
  const isClarify = isClarifyRoot(summary, root);
  const rootId = isClarify ? root?.id : undefined;
  // Registered in a layout effect: it runs in the commit, before paint and before any realtime callback can run, and render stays pure.
  useLayoutEffect(() => { if (rootId) registerClarifyThread(rootId); }, [rootId]);
  // one read of the drafts, shared by the list and the composer (which waits while a draft is being made)
  const thread = useClarifyThread(rootId ?? null);
  const actions = useClarifyActions(rootId ?? '');
  // the card a Mention in chat names: held here because the card (in the list) and the pill (in the composer) both show it
  const [mentionId, setMentionId] = useState<string | null>(null);
  const clearMention = useCallback(() => setMentionId(null), []);
  const { drafts, loaded } = thread;
  // a mentioned card that was deleted takes its pill with it
  useEffect(() => {
    if (mentionId && loaded && !drafts.some((d) => d.id === mentionId)) setMentionId(null);
  }, [mentionId, loaded, drafts]);
  if (!isClarify || !root) return { isClarify: false, headerTitle: null, after: null, footer: null };
  const working = drafts.some((d) => d.state === 'queued' || d.state === 'running');
  const name = summary.title ?? mirrorRole();
  // the owner's own messages in this thread (and the root), the places a draft can follow
  const places = [root, ...messages.filter((m) => m.threadRootId === root.id && !m.isDeleted)];
  const placed = draftsByMessage(places, drafts);
  const lastDraft = drafts[drafts.length - 1];
  const lastPlace = (lastDraft && [...placed.entries()].find(([, ds]) => ds.includes(lastDraft))?.[0]) ?? [...places].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).at(-1)?.id ?? root.id;
  const after: Record<string, ReactNode> = {};
  for (const id of new Set([root.id, lastPlace, ...placed.keys()])) {
    after[id] = (
      <ClarifyDraftsView
        drafts={placed.get(id) ?? []} all={drafts} loaded={loaded} failed={thread.failed} name={name} userId={userId}
        mentionedId={mentionId} onMention={setMentionId} actions={actions} onReload={() => void thread.reload()}
        first={id === root.id} last={id === lastPlace}
      />
    );
  }
  const mentioned = drafts.find((d) => d.id === mentionId);
  return {
    isClarify,
    headerTitle: (
      <>
        <h2 className="truncate text-base font-semibold text-foreground">{CLARIFY_TITLE}</h2>
        <p className="truncate text-xs text-muted-foreground">{CLARIFY_SUBTITLE}</p>
      </>
    ),
    after,
    footer: (
      <ClarifyComposer
        rootId={root.id} userId={userId} working={working} onClearMention={clearMention}
        mention={mentioned?.point ? { id: mentioned.id, words: mentioned.point.statement } : null}
      />
    ),
  };
}
