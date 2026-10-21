/**
 * @file canvas-service.ts
 * @description P1515: the Clarity Canvas through its checked server functions. Real-only, like
 * organizations-service (the canvas is defined by the database; there is no mock era to keep).
 * Tests mock at the module boundary: `vi.mock('@/app/data/canvas-service')`.
 *
 * ONE READ, FOR EVERYONE: `getCanvas` wraps rpc `get_canvas`. The database decides, on each call,
 * what the caller may see: the owner and people an audience entry admits right now get the canvas's
 * points, stories and positions; everyone else gets nothing (the page shows not-found). The page
 * never reads canvas content through the ordinary point, story or position loaders.
 *
 * CHECKED WRITES: set or withdraw a position, add a story, take one's own added story off, share,
 * unshare. Each calls its rpc and clears the list-return cache after it (success or failure): the
 * page's own 'canvas' Back entry holds positions, stories and the Private/Shared state these change
 * (src/tests/p1364-cache-invalidation-drift-guard derives the writing rpc names from the migrations).
 */

import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { throwDbError } from './db-error-logger';
import { mapPointFromDb, mapPositionFromDb, mapPositionWithUserFromDb } from './points-service-real';
import { mapStoryFromDb } from './stories-service-real';
import type {
  PointPositionWithUser,
  PointWithUserPosition,
  PositionType,
  StoryWithAuthor,
} from '@/app/types';

const LEVELS: PositionType[] = [
  'strongly_disagree', 'disagree', 'somewhat_disagree', 'unsure', 'somewhat_agree', 'agree', 'strongly_agree',
];

export type CanvasVisibility = 'private' | 'shared';

/** Who may open the canvas besides the owner and the entries: nobody ('restricted') or anyone with the link. */
export type CanvasGeneralAccess = 'restricted' | 'link';

/** The entry that admits the reader: an event, a group, or the owner themself (a person entry; the
 *  name is then the OWNER's: "Shared with you by <owner>"). */
export interface CanvasVia {
  kind: 'event' | 'group' | 'person';
  id: string;
  name: string;
  slug: string | null;
}

/** What `get_canvas` returned, mapped to the app's types. Empty `points` = not found. */
export interface CanvasView {
  points: PointWithUserPosition[];
  /** stories by point: the owner's stories plus stories others added through the canvas */
  stories: Map<string, StoryWithAuthor[]>;
  /** ids of the stories others added through this canvas (removable by their author) */
  addedStoryIds: string[];
  positions: Map<string, PointPositionWithUser[]>;
  /** null for anyone who is not the owner or admitted (no hint that anything exists) */
  visibility: CanvasVisibility | null;
  isOwner: boolean;
  admitted: boolean;
  via: CanvasVia | null;
  /** 'link': open to anyone with the link (a reader with no `via` was admitted by it) */
  generalAccess: CanvasGeneralAccess;
}

/** One entry of the owner's audience panel. */
export interface AudienceEntry {
  kind: 'person' | 'event' | 'group';
  id: string;
  name: string;
  slug: string | null;
  public: boolean;
  /** the owner is still admitted to this entry (false: it admits no one right now) */
  ownerAdmitted: boolean;
  /** people it admits besides the owner */
  count: number;
  /** named for events and public groups; null for a private group (count only) */
  names: { id: string; name: string; slug: string | null }[] | null;
}

export interface ShareTargets {
  events: { id: string; title: string; slug: string; datetime: string; hosted: boolean }[];
  groups: { id: string; name: string; slug: string; public: boolean }[];
}

export interface SharedCanvasRef {
  ownerId: string;
  ownerName: string;
  ownerSlug: string | null;
  name: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the rpc returns jsonb: rows are mapped field by field below */
type Json = Record<string, any>;

function countsOf(positions: PointPositionWithUser[]): Record<PositionType, number> {
  const counts = Object.fromEntries(LEVELS.map(l => [l, 0])) as Record<PositionType, number>;
  for (const p of positions) counts[p.position] += 1;
  return counts;
}

/**
 * The canvas `name` of `ownerId`, as `viewerId` may read it. Throws on any failure: the page shows
 * one error, never a partial grid.
 */
async function getCanvas(ownerId: string, name: string, viewerId?: string, linkToken?: string): Promise<CanvasView> {
  // The link token (`?k=` in the address) is what admits someone who is not the owner and not in an entry;
  // a wrong or old one gets the same empty answer as any stranger.
  const { data, error } = await supabase.rpc('get_canvas', { p_owner: ownerId, p_name: name, p_link_token: linkToken ?? null });
  if (error || !data) throwDbError('getCanvas', error, 'Could not load this canvas');
  const raw = data as Json;

  const positions = new Map<string, PointPositionWithUser[]>();
  for (const row of (raw.positions ?? []) as Json[]) {
    const mapped = mapPositionWithUserFromDb(row as any);
    positions.set(mapped.pointId, [...(positions.get(mapped.pointId) ?? []), mapped]);
  }

  const points: PointWithUserPosition[] = ((raw.points ?? []) as Json[]).map(row => {
    const point = mapPointFromDb(row as any);
    const list = positions.get(point.id) ?? [];
    const own = viewerId ? list.find(p => p.userId === viewerId) : undefined;
    return {
      ...point,
      positionCounts: countsOf(list),
      totalPositions: list.length,
      userPosition: own ? mapPositionFromDb({
        id: own.id, point_id: own.pointId, user_id: own.userId, position: own.position,
        reasoning: own.reasoning ?? null, created_at: own.createdAt, updated_at: own.updatedAt,
      }) : undefined,
    };
  });

  const stories = new Map<string, StoryWithAuthor[]>();
  const addedStoryIds: string[] = [];
  for (const row of (raw.stories ?? []) as Json[]) {
    const story = mapStoryFromDb(row.story as any);
    stories.set(row.point_id, [...(stories.get(row.point_id) ?? []), story]);
    if (row.added) addedStoryIds.push(story.id);
  }

  const access = (raw.access ?? {}) as Json;
  return {
    points,
    stories,
    addedStoryIds,
    positions,
    visibility: raw.visibility === 'shared' || raw.visibility === 'private' ? raw.visibility : null,
    isOwner: !!access.is_owner,
    admitted: !!access.admitted,
    generalAccess: access.general_access === 'link' ? 'link' : 'restricted',
    via: access.via
      ? { kind: access.via.kind, id: access.via.id, name: access.via.name, slug: access.via.slug ?? null }
      : null,
  };
}

async function setPosition(ownerId: string, name: string, pointId: string, position: PositionType, linkToken?: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('canvas_set_position', {
      p_owner: ownerId, p_name: name, p_point: pointId, p_position: position, p_reasoning: null, p_link_token: linkToken ?? null,
    });
    if (error) throwDbError('canvas.setPosition', error, `Could not save your position: ${error.message}`);
  } finally {
    clearListReturnCache();
  }
}

async function removePosition(ownerId: string, name: string, pointId: string, linkToken?: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('canvas_remove_position', { p_owner: ownerId, p_name: name, p_point: pointId, p_link_token: linkToken ?? null });
    if (error) throwDbError('canvas.removePosition', error, `Could not withdraw your position: ${error.message}`);
  } finally {
    clearListReturnCache();
  }
}

/** Adds a new private story of the caller's to someone else's canvas point; returns its id. */
async function addStory(ownerId: string, name: string, pointId: string, content: string, linkToken?: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('canvas_add_story', {
      p_owner: ownerId, p_name: name, p_point: pointId, p_content: content, p_link_token: linkToken ?? null,
    });
    if (error || !data) throwDbError('canvas.addStory', error, `Could not add your story: ${error?.message ?? 'no id'}`);
    return data as string;
  } finally {
    clearListReturnCache();
  }
}

async function removeAddedStory(storyId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('canvas_remove_added_story', { p_story: storyId });
    if (error) throwDbError('canvas.removeAddedStory', error, `Could not remove your story: ${error.message}`);
  } finally {
    clearListReturnCache();
  }
}

/** The owner's access list (people, events, groups) and the canvas's general access. */
async function getAccess(name: string): Promise<{ entries: AudienceEntry[]; generalAccess: CanvasGeneralAccess; linkToken: string | null }> {
  const { data, error } = await supabase.rpc('get_canvas_audience', { p_name: name });
  if (error || !data) throwDbError('getAudience', error, 'Could not load who this canvas is shared with');
  const entries = (((data as Json).entries ?? []) as Json[]).map(e => ({
    kind: e.kind,
    id: e.id,
    name: e.name,
    slug: e.slug ?? null,
    public: !!e.public,
    ownerAdmitted: !!e.owner_admitted,
    count: Number(e.count ?? 0),
    names: Array.isArray(e.names) ? e.names.map((n: Json) => ({ id: n.id, name: n.name, slug: n.slug ?? null })) : null,
  })) as AudienceEntry[];
  const raw = data as Json;
  // The token is the owner's alone (the function returns it to nobody else) and is never logged.
  return { entries, generalAccess: raw.general_access === 'link' ? 'link' : 'restricted', linkToken: typeof raw.link_token === 'string' ? raw.link_token : null };
}

async function getAudience(name: string): Promise<AudienceEntry[]> {
  return (await getAccess(name)).entries;
}

async function getShareTargets(): Promise<ShareTargets> {
  const { data, error } = await supabase.rpc('get_canvas_share_targets');
  if (error || !data) throwDbError('getShareTargets', error, 'Could not load your events and groups');
  const raw = data as Json;
  return { events: raw.events ?? [], groups: raw.groups ?? [] };
}

async function shareCanvas(name: string, kind: 'person' | 'event' | 'group', targetId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('share_canvas', { p_name: name, p_kind: kind, p_target: targetId });
    if (error) throwDbError('canvas.share', error, `Could not share this canvas: ${error.message}`);
  } finally {
    clearListReturnCache();
  }
}

async function unshareCanvas(name: string, kind: 'person' | 'event' | 'group', targetId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('unshare_canvas', { p_name: name, p_kind: kind, p_target: targetId });
    if (error) throwDbError('canvas.unshare', error, `Could not stop sharing: ${error.message}`);
  } finally {
    clearListReturnCache();
  }
}

/** Owner only: open the canvas to anyone with the link, or back to the people added. */
async function setGeneralAccess(name: string, access: CanvasGeneralAccess): Promise<void> {
  try {
    const { error } = await supabase.rpc('set_canvas_general_access', { p_name: name, p_access: access });
    if (error) throwDbError('canvas.setGeneralAccess', error, `Could not change who has access: ${error.message}`);
  } finally {
    clearListReturnCache();
  }
}

/** The canvases shared with an event, for people that event admits (everyone else gets []). */
async function listSharedWithEvent(eventId: string): Promise<SharedCanvasRef[]> {
  const { data, error } = await supabase.rpc('list_canvases_shared_with_event', { p_event: eventId });
  if (error) throwDbError('listSharedWithEvent', error, 'Could not load the canvases shared with this event');
  return ((data ?? []) as Json[]).map(r => ({
    ownerId: r.owner_id, ownerName: r.owner_name, ownerSlug: r.owner_slug ?? null, name: r.name,
  }));
}

export const canvasService = {
  getCanvas,
  setPosition,
  removePosition,
  addStory,
  removeAddedStory,
  getAudience,
  getAccess,
  setGeneralAccess,
  getShareTargets,
  shareCanvas,
  unshareCanvas,
  listSharedWithEvent,
};
export type CanvasService = typeof canvasService;
