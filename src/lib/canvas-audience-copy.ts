/**
 * @file canvas-audience-copy.ts
 * @description P1515: the words of a Clarity Canvas's one visibility idea — a canvas is Private and
 * its owner chooses who else sees it. All of it is [FOUNDER DECISION] copy (spec UI Contract):
 * approve or change at UAT. The icon that carries these words is components/canvas/canvas-audience.
 */
import type { AudienceEntry, CanvasVia } from '@/app/data/canvas-service';

/** "A", "A and B", "A, B and C" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Entries that admit anyone right now: one the owner has left shows no one the canvas. */
function activeNames(entries: AudienceEntry[] | null): string[] {
  return (entries ?? []).filter(e => e.ownerAdmitted).map(e => e.name);
}

/** The owner's header control: "Private · only you", "Private · shared with <entries>", or, while the
 *  canvas is open to anyone with the link, "Anyone with the link". */
export function ownerLockLabel(
  entries: AudienceEntry[] | null,
  visibility: 'private' | 'shared',
  generalAccess: 'restricted' | 'link' = 'restricted',
): string {
  if (generalAccess === 'link') return 'Anyone with the link';
  if (visibility === 'private') return 'Private · only you';
  const names = activeNames(entries);
  return names.length > 0 ? `Private · shared with ${joinNames(names)}` : 'Private · shared';
}

/** What the shared icon says to the OWNER ("Shared with …") or to a reader ("Shared with you through …",
 *  "Shared with you by <owner>" for a person entry, "Shared with anyone with the link" when only the link admits). */
export function sharedIconLabel(opts: {
  isOwner: boolean; entries: AudienceEntry[] | null; via: CanvasVia | null; generalAccess?: 'restricted' | 'link';
}): string {
  const link = opts.generalAccess === 'link';
  if (opts.isOwner) {
    const names = activeNames(opts.entries);
    if (link) return `Shared with ${joinNames([...names, 'anyone with the link'])}`;
    return names.length > 0 ? `Shared with ${joinNames(names)}` : 'Shared';
  }
  return opts.via ? readerLine(opts.via) : link ? 'Shared with anyone with the link' : 'Shared with you';
}

/** The reader's line: who the canvas came through. A person entry names the owner. */
export function readerLine(via: CanvasVia): string {
  return via.kind === 'person' ? `Shared with you by ${via.name}` : `Shared with you through ${via.name}`;
}

/** The composer's line, so every contributor knows who will read what they write. Private or shared
 *  is the server's `visibility`, read with the canvas; the audience only supplies names. It may be
 *  missing (null) or older than the canvas read, so a shared canvas never promises "only you" (a false
 *  privacy claim): without names its line stays honest and general. */
export function composerVisibilityCopy(opts: {
  isOwner: boolean; ownerName: string; entries: AudienceEntry[] | null; visibility: 'private' | 'shared';
  generalAccess?: 'restricted' | 'link';
}): string {
  if (opts.generalAccess === 'link') return 'Visible to you and anyone with the link';
  if (opts.isOwner) {
    if (opts.visibility === 'private') return 'Visible only to you';
    const names = activeNames(opts.entries);
    return names.length > 0 ? `Visible to you and ${joinNames(names)}` : 'Visible to you and the people you shared this canvas with';
  }
  return `Visible to you and everyone ${opts.ownerName} shared this canvas with`;
}
