/**
 * @file CanvasRootCard.tsx
 * @description P1536 3c X10 (review round 2): the card of a canvas thread's ROOT in the mirror chat, derived from the chat's ONE batched read of its drafts (canvas-root-store) and
 * the versions read once with it (cardFromDraft), never from a read of its own. It follows its draft being published or discarded elsewhere because the store does (the tab returning,
 * a reply, the same-tab event), and only a card whose state CHANGED gets its detail read again, in that same flush.
 *  - no draft the viewer can read: the card of the attached version, as before (read once, here); not the viewer's either: "Not available to you";
 *  - a first read that was refused, or has not answered in 20 s of a visible tab: the chat's own "Couldn't load this canvas" with Retry (a hidden tab asks nothing and is not a failure).
 */
import { useContext, useEffect, useMemo, useState } from 'react';
import { cardFromDraft, getCanvasVersionCard, type CanvasVersionCardData } from '@/app/data/canvas-draft-service';
import { Button } from '@/components/ui/button';
import { AttachmentSkeleton } from './AttachmentSkeleton';
import { CanvasVersionCard } from './CanvasVersionCard';
import { ATTACHMENT_NOTE } from './artifact-card-style';
import { invalidateRootDetail } from './canvas-root-store';
import { ChatContext } from './chat-state';
import { useCanvasRenamed } from './use-canvas-renamed';
import { useCanvasRootSlot } from './use-canvas-root-slot';

/** The same 20 s the chat's other attachment cards wait (ATTACHMENT_TIMEOUT_MS), counted only while the tab is visible. */
const CARD_WAIT_MS = 20_000;

type Attached = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; card: CanvasVersionCardData | null };

/** The card of the attached version, for a root with no draft this viewer can read (read once; Retry reads again). */
function useAttachedCard(args: { versionId: string; viewerId: string; enabled: boolean }): { read: Attached; retry: () => void } {
  const { versionId, viewerId, enabled } = args;
  const [read, setRead] = useState<Attached>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setRead({ status: 'loading' });
    getCanvasVersionCard(versionId, viewerId).then(
      (card) => { if (live) setRead({ status: 'ready', card }); },
      () => { if (live) setRead({ status: 'error' }); },
    );
    return () => { live = false; };
  }, [versionId, viewerId, enabled, attempt]);
  return { read, retry: () => setAttempt((n) => n + 1) };
}

/** True once the first read has been pending for CARD_WAIT_MS of a visible tab (a hidden tab does not count down: it asks nothing). */
function useWaitedTooLong(pending: boolean): [boolean, () => void] {
  const [slow, setSlow] = useState(false);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    if (!visible) return;
    const t = setTimeout(() => setSlow(true), CARD_WAIT_MS);
    return () => clearTimeout(t);
  }, [pending, visible]);
  return [slow, () => setSlow(false)];
}

export function CanvasRootCard({ rootId, versionId, viewerId, count }: { rootId: string; versionId: string; viewerId: string; count: number | undefined }) {
  const chat = useContext(ChatContext);
  const slug = chat?.authors[viewerId]?.slug ?? null;
  const { snap, retry } = useCanvasRootSlot({ rootId, viewerId, slug, count });
  // A confirmed rename of this canvas: the title is in the detail, read again with the next flush.
  useCanvasRenamed(snap.draft?.canvasId ?? null, () => invalidateRootDetail(rootId));
  const noDraft = snap.status === 'ready' && snap.draft === null;
  const attached = useAttachedCard({ versionId, viewerId, enabled: noDraft });
  const [slow, resetSlow] = useWaitedTooLong(snap.status === 'pending' || attached.read.status === 'loading');
  const derived = useMemo(
    () => (snap.draft && snap.detail ? cardFromDraft(snap.draft, { versions: snap.detail.versions, slug: snap.detail.slug ?? slug, titles: snap.detail.titles }) : null),
    [snap.draft, snap.detail, slug],
  );

  const failed = snap.status === 'failed' || attached.read.status === 'error' || slow;
  if (failed) {
    return (
      <div className={`${ATTACHMENT_NOTE} py-1`} data-testid="attachment-error">
        <span className="min-w-0 flex-1">Couldn&apos;t load this canvas</span>
        <Button
          variant="ghost"
          className="min-h-10 text-blue-700 hover:bg-blue-50 hover:text-blue-700"
          onClick={() => {
            resetSlow();
            if (noDraft) attached.retry();
            else retry();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (derived) return <CanvasVersionCard data={derived} />;
  if (noDraft && attached.read.status === 'ready') {
    return attached.read.card ? <CanvasVersionCard data={attached.read.card} /> : <p className={`${ATTACHMENT_NOTE} min-h-10 italic`}>Not available to you</p>;
  }
  return <AttachmentSkeleton kind="canvas" card />;
}
