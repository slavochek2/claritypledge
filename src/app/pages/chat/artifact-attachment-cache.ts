/** P1545: per-viewer cache for chat artifact attachment reads (kept apart from the card for fast refresh). */
import { canvasService, type ChatArtifact } from '@/app/data/canvas-service';

type ArtifactKind = 'canvas' | 'letter';

/**
 * One read per (viewer, artifact) for the whole session of the page: a thread of shares, a re-render
 * or a second card for the same artifact shares the one in-flight / settled answer. A failed read is
 * dropped so the next mount asks again.
 */
const cache = new Map<string, Promise<ChatArtifact>>();

/** Forget every cached answer (sign-out, tests). */
export function clearArtifactAttachmentCache(): void {
  cache.clear();
}

export function loadArtifact(kind: ArtifactKind, id: string, viewerId: string): Promise<ChatArtifact> {
  const key = `${viewerId}|${kind}|${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const read = canvasService.getChatArtifact(kind, id);
  cache.set(key, read);
  read.catch(() => {
    if (cache.get(key) === read) cache.delete(key);
  });
  return read;
}
