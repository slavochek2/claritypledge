/** P1545: per-viewer cache for chat artifact attachment reads (kept apart from the card for fast refresh). */
import { canvasService, type ChatArtifact } from '@/app/data/canvas-service';

type ArtifactKind = 'canvas' | 'letter';

/**
 * How long a settled answer is trusted. Access can be revoked (or granted) at any time, so an answer is
 * never kept for the life of the page: it is read again once older than this, and every time a chat
 * conversation is (re)opened (use-conversation.ts) and on sign-out (AuthProvider).
 */
export const ARTIFACT_ATTACHMENT_TTL_MS = 30_000;

interface Entry {
  read: Promise<ChatArtifact>;
  /** When the read settled; null while in flight (an in-flight read is always shared). */
  settledAt: number | null;
}

/**
 * One read per (viewer, artifact) while it is fresh: a thread of shares, a re-render or a second card for
 * the same artifact shares the one in-flight / settled answer. A failed read is dropped so the next mount
 * asks again.
 */
const cache = new Map<string, Entry>();

/** Forget every cached answer (sign-out, a chat opened, tests). */
export function clearArtifactAttachmentCache(): void {
  cache.clear();
}

export function loadArtifact(kind: ArtifactKind, id: string, viewerId: string): Promise<ChatArtifact> {
  const key = `${viewerId}|${kind}|${id}`;
  const hit = cache.get(key);
  if (hit && (hit.settledAt === null || Date.now() - hit.settledAt < ARTIFACT_ATTACHMENT_TTL_MS)) return hit.read;
  const entry: Entry = { read: canvasService.getChatArtifact(kind, id), settledAt: null };
  cache.set(key, entry);
  entry.read.then(
    () => {
      entry.settledAt = Date.now();
    },
    () => {
      if (cache.get(key) === entry) cache.delete(key);
    },
  );
  return entry.read;
}
