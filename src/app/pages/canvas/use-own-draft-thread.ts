/**
 * @file use-own-draft-thread.ts
 * @description P1536: may this `?thread=<rootId>` be shown beside this canvas? Only when the viewer is looking at their OWN
 * canvas (their handle) and the thread is the open draft's thread of exactly this canvas, in their mirror chat. The draft row is
 * read through the owner-only policy, so another person's thread id reads as nothing. A thread that cannot be matched, a read
 * that fails, or a canvas of someone else shows no pane. The answer is taken once per (thread, canvas): Publish closes the
 * draft but the thread stays beside the page.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth';
import { getCanvasDraftByThread } from '@/app/data/canvas-draft-service';
import { normalizeProjectTag } from '@/lib/canvas-boxes';

export function useOwnDraftThread(args: {
  rootId: string | null;
  /** the address's handle and canvas name */
  handle: string | undefined;
  projectTag: string | undefined;
  /** the viewer's mirror conversation, when they have one */
  mirrorConversationId: string | null;
}): boolean {
  const { user } = useAuth();
  const { rootId, handle, projectTag, mirrorConversationId } = args;
  const tag = normalizeProjectTag(projectTag);
  const mine = !!user?.slug && !!handle && handle.toLowerCase() === user.slug.toLowerCase();
  const key = rootId && tag && mine && mirrorConversationId ? `${rootId}|${tag}|${mirrorConversationId}` : null;
  const [answer, setAnswer] = useState<{ key: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!key || !rootId) return;
    let live = true;
    getCanvasDraftByThread(rootId).then(
      draft => {
        const ok = !!draft && draft.state === 'open' && draft.conversationId === mirrorConversationId
          && normalizeProjectTag(draft.canvasName ?? undefined) === tag;
        if (live) setAnswer({ key, ok });
      },
      () => { if (live) setAnswer({ key, ok: false }); },
    );
    return () => { live = false; };
    // key carries every input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return key !== null && answer?.key === key && answer.ok;
}
