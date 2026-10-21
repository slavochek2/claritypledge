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

/** The owner's header control: "Private · only you" or "Private · shared with <entries>". */
export function ownerLockLabel(entries: AudienceEntry[] | null, visibility: 'private' | 'shared'): string {
  if (visibility === 'private') return 'Private · only you';
  const names = activeNames(entries);
  return names.length > 0 ? `Private · shared with ${joinNames(names)}` : 'Private · shared';
}

/** What the shared icon says to the OWNER ("Shared with …") or to a reader ("Shared with you through …"). */
export function sharedIconLabel(opts: { isOwner: boolean; entries: AudienceEntry[] | null; via: CanvasVia | null }): string {
  if (opts.isOwner) {
    const names = activeNames(opts.entries);
    return names.length > 0 ? `Shared with ${joinNames(names)}` : 'Shared';
  }
  return opts.via ? `Shared with you through ${opts.via.name}` : 'Shared with you';
}

/** The composer's line, so every contributor knows who will read what they write. `entries` is null
 *  when the audience could not be read: a canvas the server calls shared must not then promise "only
 *  you" (that would be a false privacy claim), so the owner's line stays honest without the names. */
export function composerVisibilityCopy(opts: {
  isOwner: boolean; ownerName: string; entries: AudienceEntry[] | null; visibility: 'private' | 'shared';
}): string {
  if (opts.isOwner) {
    if (opts.entries === null && opts.visibility === 'shared') return 'Visible to you and the people you shared this canvas with';
    const names = activeNames(opts.entries);
    return names.length > 0 ? `Visible to you and ${joinNames(names)}` : 'Visible only to you';
  }
  return `Visible to you and everyone ${opts.ownerName} shared this canvas with`;
}
