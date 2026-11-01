/**
 * @file canvas-page-data.ts
 * @description The canvas page's data shapes and the pure rules around them (P1508, P1515, P1536): what a read becomes
 * on screen, when a read is "not found", which version is open and what it is called, and who is on the canvas.
 *
 * VERSIONS ARE NAMED BY NUMBER (P1536): a person sees "v{seq} · {date}", or "v{next} · Draft" for the owner's open draft
 * (the number it gets when published). The internal name that keys `?v=` (and the `canvas_<name>` tag) is never shown.
 */
import type { Person } from '@/app/components/compare/statement-row';
import type {
  AudienceEntry, CanvasGeneralAccess, CanvasOwnerDraft, CanvasVersion, CanvasView, CanvasVia, CanvasVisibility,
} from '@/app/data/canvas-service';
import { canvasVersionLabel } from '@/app/data/canvas-draft-service';
import { draftLabel } from '@/app/pages/chat/canvas-thread-copy';
import { contestScore, levelCounts } from '@/lib/position-spread';
import { CANVAS_BOXES, type CanvasBoxTag } from '@/lib/canvas-boxes';
import type { PointPositionWithUser, PointWithUserPosition, StoryWithAuthor } from '@/app/types';

export const BOX_TITLES = new Map<CanvasBoxTag, string>(CANVAS_BOXES.map(b => [b.tag, b.title]));

/** What is on screen once the canvas is read. */
export interface CanvasReady {
  status: 'ready';
  ownerId: string;
  ownerName: string;
  owner: Person;
  points: PointWithUserPosition[];
  stories: Map<string, StoryWithAuthor[]>;
  positions: Map<string, PointPositionWithUser[]>;
  /** P1515: 'private' (no entries) or 'shared'; never null on a canvas the viewer can read */
  visibility: CanvasVisibility;
  isOwner: boolean;
  /** 'link': the owner opened the canvas to anyone with the link */
  generalAccess: CanvasGeneralAccess;
  /** the entry that admits a reader (null for the owner) */
  via: CanvasVia | null;
  /** the owner's audience, for the lock label and the shared icon (null: not read or not the owner) */
  audience: AudienceEntry[] | null;
  /** ids of the stories others added through this canvas */
  addedStoryIds: string[];
  /** the version that is open, and every version of the canvas, newest first (P1515 phase 5) */
  version: string | null;
  versions: CanvasVersion[];
  /** P1536: nothing is published; readers see "Nothing published yet", the owner "Publish first" */
  publishedNone: boolean;
  /** P1536: the owner's open draft (never set for anyone else) */
  draft: CanvasOwnerDraft | null;
  /** P1536 W8: the owner's display title (null or absent: never renamed; shown through canvasDisplayTitle) */
  title?: string | null;
  /** P1536 W8: the canvas row's id, the OWNER's only (what a rename takes); absent or null: the canvas has no record, nothing to rename */
  canvasId?: string | null;
}

export type CanvasData = CanvasReady | { status: 'not-found' } | { status: 'error' };

interface OwnerProfile {
  id: string;
  name: string;
  avatarUrl?: string | null;
  avatarColor?: string;
  hasPledged?: boolean;
}

/** The owner's profile and one `get_canvas` answer, as the page shows them. */
export function buildReady(owner: OwnerProfile, view: CanvasView, audience: AudienceEntry[] | null): CanvasReady {
  return {
    status: 'ready',
    ownerId: owner.id,
    ownerName: owner.name,
    owner: {
      name: owner.name,
      photoUrl: owner.avatarUrl ?? undefined,
      avatarColor: owner.avatarColor,
      hasPledged: owner.hasPledged ?? false,
    },
    points: view.points,
    stories: view.stories,
    positions: view.positions,
    visibility: view.visibility ?? 'private',
    isOwner: view.isOwner,
    generalAccess: view.generalAccess,
    via: view.via,
    audience,
    addedStoryIds: view.addedStoryIds,
    version: view.version ?? null,
    versions: view.versions ?? [],
    publishedNone: view.publishedNone === true,
    draft: view.isOwner ? view.draft ?? null : null,
    title: view.title ?? null,
    canvasId: view.isOwner ? view.canvasId ?? null : null,
  };
}

/**
 * No points is not-found for everyone, EXCEPT: the owner of a canvas that has a record (an open link or audience entries),
 * who must still reach the share control to close it, and (P1536) anyone admitted to a canvas with nothing published,
 * who reads "Nothing published yet" instead of a 404.
 */
export function isCanvasNotFound(view: CanvasView): boolean {
  if (view.points.length > 0) return false;
  if (view.isOwner && view.canvasExists) return false;
  return !(view.admitted && view.publishedNone === true);
}

/** The open version is the owner's unpublished draft. */
export function isViewingDraft(ready: CanvasReady): boolean {
  return ready.isOwner && !!ready.draft && ready.draft.version === ready.version;
}

/** Nothing to read: nothing published and no draft open on screen (the grid is replaced by one line). */
export function hasNothingToShow(ready: CanvasReady): boolean {
  return ready.publishedNone && !isViewingDraft(ready);
}

/** The owner's questions for the empty boxes, keyed by box tag: only on the draft, only for the owner. */
export function draftQuestions(ready: CanvasReady): Record<string, string> | undefined {
  return isViewingDraft(ready) ? ready.draft?.questions : undefined;
}

/** D6: the boxes that show "Changed": only on the owner's own draft view (computed by the read, never stored); no base, no markers. */
export function changedBoxes(ready: CanvasReady | null): readonly string[] | undefined {
  return ready && isViewingDraft(ready) ? ready.draft?.changedBoxes : undefined;
}

/** The number the open draft gets when published: one above the newest published version (the server's rule). */
export function nextSeqOf(versions: Pick<CanvasVersion, 'seq' | 'draft'>[]): number {
  return versions.reduce((top, v) => (v.draft || v.seq == null ? top : Math.max(top, v.seq)), 0) + 1;
}

/** What a person calls a version: "v3 · Draft" (`nextSeq` is its number), or "v{seq} · {date}" (the date is when it was published). Null when unknown. */
export function versionLabelOf(v: Pick<CanvasVersion, 'seq' | 'publishedAt' | 'createdAt' | 'draft'>, nextSeq: number | null = null): string | null {
  if (v.draft) return draftLabel(nextSeq);
  if (v.seq == null) return null;
  const when = v.publishedAt ?? v.createdAt;
  return when ? canvasVersionLabel(v.seq, when) : `v${v.seq}`;
}

/** The label of the version that is open now (null: an answer from before versions). */
export function openVersionLabel(ready: Pick<CanvasReady, 'version' | 'versions'>): string | null {
  const open = ready.versions.find(v => v.name === ready.version);
  return open ? versionLabelOf(open, nextSeqOf(ready.versions)) : null;
}

/** The page's and the tab's title: the canvas, and which version of it. */
export function canvasSeoTitle(ready: Pick<CanvasReady, 'ownerName' | 'version' | 'versions'>, projectTag: string | null): string {
  const label = openVersionLabel(ready);
  return `${ready.ownerName} · #${projectTag ?? ''}${label ? ` · ${label}` : ''} — Clarity Pledge`;
}

/** Founder, sixth round: disagreement found fast, so in every box the most contested card comes first. */
export function sortBoxesByContest(
  boxes: Map<CanvasBoxTag, PointWithUserPosition[]>,
  positions: Map<string, PointPositionWithUser[]>,
): Map<CanvasBoxTag, PointWithUserPosition[]> {
  const score = (p: PointWithUserPosition) => contestScore(levelCounts(positions.get(p.id) ?? []));
  return new Map([...boxes].map(([tag, points]) => [tag, [...points].sort((a, b) => score(b) - score(a))]));
}

/** Everyone who took a position on any point of this canvas. */
export interface CanvasPerson extends Person {
  id: string;
  slug?: string;
  /** how many of the canvas's points they took a position on */
  count: number;
}

export function peopleOf(
  ready: { ownerId: string; owner: Person; positions: Map<string, PointPositionWithUser[]> },
  ownerSlug?: string,
): Map<string, CanvasPerson> {
  // The owner is always someone to compare with, positions or not.
  const people = new Map<string, CanvasPerson>([[ready.ownerId, { ...ready.owner, id: ready.ownerId, slug: ownerSlug, count: 0 }]]);
  for (const list of ready.positions.values()) {
    for (const p of list) {
      const known = people.get(p.userId);
      if (known) { known.count += 1; known.slug ??= p.userSlug || undefined; continue; }
      people.set(p.userId, {
        id: p.userId,
        slug: p.userSlug || undefined,
        name: p.userName,
        photoUrl: p.userAvatarUrl ?? undefined,
        avatarColor: p.userAvatarColor,
        hasPledged: p.userHasPledged ?? false,
        count: 1,
      });
    }
  }
  return people;
}

/**
 * Compare on the page: the viewer's own column ("You"; signed out: the owner), everyone else they could compare with
 * (the owner first, then whoever took the most positions), and the person `?with=` names. A draft has no positions to
 * compare, so it offers no one.
 */
export function compareSetup(
  ready: CanvasReady | null,
  viewerId: string | undefined,
  handle: string | undefined,
  requestedWith: string | null,
): { baseId: string; others: CanvasPerson[]; withPerson: CanvasPerson | null; basePerson: Person | null } {
  const baseId = viewerId ?? ready?.ownerId ?? '';
  if (!ready) return { baseId, others: [], withPerson: null, basePerson: null };
  const people = peopleOf(ready, handle);
  const others = isViewingDraft(ready)
    ? []
    : [...people.values()]
      .filter(p => p.id !== baseId)
      .sort((a, b) => Number(b.id === ready.ownerId) - Number(a.id === ready.ownerId) || b.count - a.count);
  const baseKnown: Person | null = people.get(baseId) ?? (baseId === ready.ownerId ? ready.owner : null);
  return {
    baseId,
    others,
    withPerson: others.find(p => p.id === requestedWith) ?? null,
    // The viewer's own column reads "You", as on the compare page.
    basePerson: viewerId ? { ...(baseKnown ?? { hasPledged: false }), name: 'You' } : baseKnown,
  };
}
