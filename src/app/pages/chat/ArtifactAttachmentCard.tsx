/**
 * @file ArtifactAttachmentCard.tsx
 * @description P1545 WP4: a canvas or letter shared into a chat, drawn as a small card (type disc,
 * title, one line saying who shared it) that opens the artifact. Only the id is stored in the message;
 * the card is judged for the VIEWER by get_chat_artifact_attachment, so a revoked or deleted artifact
 * reads "No longer available" and the message stays. The chat only points to the artifact: Artifacts
 * is its one home.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, LayoutGrid } from 'lucide-react';
import type { ChatArtifact } from '@/app/data/canvas-service';
import { canvasPath } from '@/lib/canvas-boxes';
import { cn } from '@/lib/utils';
import { FOCUS_RING, HOVER } from './chat-kit';
import { loadArtifact } from './artifact-attachment-cache';

type ArtifactKind = 'canvas' | 'letter';
type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; artifact: ChatArtifact };

const CARD = 'mt-1 flex w-full max-w-md items-center gap-3 rounded-xl border bg-background px-3 py-2 text-left';
const DISC = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700';

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

export function ArtifactAttachmentCard({ kind, id, viewerId, compact = false }: { kind: ArtifactKind; id: string; viewerId: string; compact?: boolean }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadArtifact(kind, id, viewerId).then(
      (artifact) => live && setState({ status: 'ready', artifact }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [kind, id, viewerId]);

  if (state.status === 'loading') {
    return (
      <div role="status" aria-label="Loading attachment" className={cn(CARD, 'min-h-16 animate-pulse text-sm text-muted-foreground')}>
        Loading {kind}…
      </div>
    );
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
  const Icon = kind === 'canvas' ? LayoutGrid : FileText;
  const title = (artifact.kind === 'canvas' ? artifact.name : artifact.title) || (kind === 'canvas' ? 'Untitled canvas' : 'Untitled letter');
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
