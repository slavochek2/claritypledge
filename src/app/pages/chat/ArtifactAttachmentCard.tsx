/**
 * @file ArtifactAttachmentCard.tsx
 * @description P1545 WP4: a canvas or letter shared into a chat, drawn as a small card (type disc,
 * title, one line saying who shared it) that opens the artifact. Only the id is stored in the message;
 * the card is judged for the VIEWER by get_chat_artifact_attachment, so a revoked or deleted artifact
 * reads "No longer available" and the message stays. The chat only points to the artifact: Artifacts
 * is its one home.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, Mail } from 'lucide-react';
import type { ChatArtifact } from '@/app/data/canvas-service';
import { canvasDisplayTitle, canvasPath } from '@/lib/canvas-boxes';
import { cn } from '@/lib/utils';
import { FOCUS_RING, HOVER } from './chat-kit';
import { loadArtifact } from './artifact-attachment-cache';
import { AttachmentSkeleton } from './AttachmentSkeleton';
import { useCanvasRenamed } from './use-canvas-renamed';
import { ARTIFACT_CARD as CARD, ARTIFACT_DISC as DISC } from './artifact-card-style';

/**
 * P1586: how long the skeleton may show before the card says it could not load. The same 20s as the
 * point/story card (ATTACHMENT_TIMEOUT_MS in AttachmentCard, which imports this file, so it cannot be
 * imported back). No Retry here: the read is shared while in flight, so a Retry would re-join the
 * stalled request; reopening the conversation clears the cache and reads again.
 */
const ARTIFACT_TIMEOUT_MS = 20_000;

type ArtifactKind = 'canvas' | 'letter';
type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; artifact: ChatArtifact };

function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

/**
 * [FOUNDER DECISION: the wording of the line under the title ("<first name> shared a canvas" /
 * "shared a letter"); "You shared ..." when the viewer is the owner or sender.]
 */
function shareLine(artifact: Extract<ChatArtifact, { available: true }>): string {
  const mine = artifact.kind === 'canvas' ? artifact.isOwner : artifact.isSender;
  const name = artifact.kind === 'canvas' ? artifact.ownerName : artifact.senderName;
  const who = mine ? 'You' : (firstName(name) ?? 'Someone');
  return `${who} shared a ${artifact.kind}`;
}

/**
 * Where the card goes: a canvas to its page, a letter to its sender view or its recipient view. The
 * recipient route /letter/:id takes the viewer's DELIVERY id, never the letter id; with no delivery the
 * card is drawn, not linked.
 */
function targetOf(artifact: Extract<ChatArtifact, { available: true }>): string | null {
  if (artifact.kind === 'canvas') return artifact.ownerSlug ? canvasPath(artifact.ownerSlug, artifact.name) : null;
  if (artifact.isSender) return `/letter/${artifact.id}/overview`;
  return artifact.deliveryId ? `/letter/${artifact.deliveryId}` : null;
}

/**
 * The ordering of one card's reads (the first read and any quiet re-read after a rename). `epoch` moves on when the card changes canvas or leaves: a read
 * made before that writes nothing. Within an epoch every read takes the next number and may write only if no NEWER read has already written, so an older
 * answer never replaces a newer one, while a newer read that failed leaves the older one free to be shown.
 */
interface Reads {
  epoch: number;
  issued: number;
  applied: number;
}

/** A read's right to write: asked for once at the start, called when its answer arrives (true once, only if nothing newer has written and the card is unchanged). */
function takeTurn(reads: Reads): () => boolean {
  const epoch = reads.epoch;
  const mine = ++reads.issued;
  return () => {
    if (reads.epoch !== epoch || mine < reads.applied) return false;
    reads.applied = mine;
    return true;
  };
}

export function ArtifactAttachmentCard({ kind, id, viewerId, compact = false }: { kind: ArtifactKind; id: string; viewerId: string; compact?: boolean }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const reads = useRef<Reads>({ epoch: 0, issued: 0, applied: 0 });
  useEffect(() => {
    const mine = reads.current;
    const mayWrite = takeTurn(mine);
    setState({ status: 'loading' });
    // P1586: a wait that never ends becomes a readable line; a late answer below still replaces it.
    const deadline = setTimeout(() => setState((s) => (s.status === 'loading' ? { status: 'error' } : s)), ARTIFACT_TIMEOUT_MS);
    loadArtifact(kind, id, viewerId).then(
      (artifact) => mayWrite() && setState({ status: 'ready', artifact }),
      () => mayWrite() && setState({ status: 'error' }),
    );
    return () => {
      mine.epoch += 1; // another canvas, or gone: nothing read for this one writes any more
      mine.applied = 0;
      clearTimeout(deadline);
    };
  }, [kind, id, viewerId]);

  // A confirmed rename of this canvas: read again (the cache was dropped, so this asks anew), and keep the card on screen until the new answer comes (a failed re-read changes nothing).
  useCanvasRenamed(kind === 'canvas' ? id : null, () => {
    const mayWrite = takeTurn(reads.current);
    void loadArtifact(kind, id, viewerId).then((artifact) => mayWrite() && setState({ status: 'ready', artifact }), () => undefined);
  });

  if (state.status === 'loading') {
    return <AttachmentSkeleton kind={kind} />;
  }
  if (state.status === 'error') {
    return (
      <p className={cn(CARD, 'min-h-10 bg-muted/40 text-sm text-muted-foreground')} data-testid="attachment-error">
        Couldn&apos;t load this {kind}
      </p>
    );
  }
  const { artifact } = state;
  if (!artifact.available) {
    return (
      <p className={cn(CARD, 'min-h-10 bg-muted/40 text-sm italic text-muted-foreground')} data-testid={`attachment-${kind}-unavailable`}>
        No longer available
      </p>
    );
  }
  const Icon = kind === 'canvas' ? LayoutGrid : Mail; // the letter's envelope is the Artifacts list's too
  const title = (artifact.kind === 'canvas' ? canvasDisplayTitle(artifact.title, artifact.name) : artifact.title) || (kind === 'canvas' ? 'Untitled canvas' : 'Untitled letter');
  const body = (
    <>
      <span className={DISC} aria-hidden="true" data-testid={`attachment-${kind}-disc`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{shareLine(artifact)}</span>
      </span>
    </>
  );
  const target = targetOf(artifact);
  // Inside a quote the card sits in a button, and buttons do not nest: draw it, do not link it.
  if (compact || !target) return <div className={cn(CARD, 'min-h-14')} data-testid={`attachment-${kind}`}>{body}</div>;
  return (
    <Link to={target} className={cn(CARD, 'min-h-14', HOVER, FOCUS_RING)} data-testid={`attachment-${kind}`}>
      {body}
    </Link>
  );
}
