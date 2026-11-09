/**
 * @file link-card-cache.ts
 * @description P1652: the read behind a pasted link's card. One read per (viewer, artifact) while it is fresh, so a re-render or a second
 * message with the same link does not read again. The answer is the reader's own: access is judged by the same reads the attachment cards
 * use, so a reader without access gets null (and the card draws nothing). A failed read is dropped, so the next draw asks again, and also
 * answers null: this card is quiet by design.
 */
import { loadAttachment, type Shareable } from '@/app/data/chat-ui-helpers';
import type { ChatArtifact } from '@/app/data/canvas-service';
import { loadArtifact } from './artifact-attachment-cache';
import type { CardTarget } from './chat-link-targets';

export type LinkCardData =
  | { kind: 'point' | 'story'; item: Shareable }
  | { kind: 'letter'; artifact: Extract<ChatArtifact, { available: true }> };

/** Access can change at any time: an answer is trusted this long (the same as the artifact cache). */
export const LINK_CARD_TTL_MS = 30_000;

interface Entry {
  read: Promise<LinkCardData | null>;
  settledAt: number | null;
}
const cache = new Map<string, Entry>();

export function clearLinkCardCache(): void {
  cache.clear();
}

async function read(target: CardTarget, viewerId: string): Promise<LinkCardData | null> {
  if (target.kind === 'letter') {
    const artifact = await loadArtifact('letter', target.id, viewerId);
    return artifact.available ? { kind: 'letter', artifact } : null;
  }
  const item = await loadAttachment(target.kind, target.id, viewerId);
  const drawable = target.kind === 'point' ? item?.point : item?.story;
  return item && drawable ? { kind: target.kind, item } : null;
}

export function loadLinkCard(target: CardTarget, viewerId: string): Promise<LinkCardData | null> {
  const key = `${viewerId}|${target.kind}|${target.id}`;
  const hit = cache.get(key);
  if (hit && (hit.settledAt === null || Date.now() - hit.settledAt < LINK_CARD_TTL_MS)) return hit.read;
  const entry: Entry = { settledAt: null, read: Promise.resolve(null) };
  entry.read = read(target, viewerId).then(
    (data) => {
      entry.settledAt = Date.now();
      return data;
    },
    () => {
      if (cache.get(key) === entry) cache.delete(key);
      return null;
    },
  );
  cache.set(key, entry);
  return entry.read;
}
