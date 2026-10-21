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

/** The entry that admits the reader: an event or a group. */
export interface CanvasVia {
  kind: 'event' | 'group';
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
}

/** One entry of the owner's audience panel. */
export interface AudienceEntry {
  kind: 'event' | 'group';
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
async function getCanvas(ownerId: string, name: string, viewerId?: string): Promise<CanvasView> {
  const { data, error } = await supabase.rpc('get_canvas', { p_owner: ownerId, p_name: name });
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
    via: access.via
      ? { kind: access.via.kind, id: access.via.id, name: access.via.name, slug: access.via.slug ?? null }
      : null,
  };
}

async function setPosition(ownerId: string, name: string, pointId: string, position: PositionType): Promise<void> {
  try {
    const { error } = await supabase.rpc('canvas_set_position', {
      p_owner: ownerId, p_name: name, p_point: pointId, p_position: position, p_reasoning: null,
    });
    if (error) throwDbError('canvas.setPosition', error, `Could not save your position: ${error.message}`);
  } finally {
    clearListReturnCache();
  }
}

async function removePosition(ownerId: string, name: string, pointId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('canvas_remove_position', { p_owner: ownerId, p_name: name, p_point: pointId });
    if (error) throwDbError('canvas.removePosition', error, `Could not withdraw your position: ${error.message}`);
  } finally {
    clearListReturnCache();
  }
}

/** Adds a new private story of the caller's to someone else's canvas point; returns its id. */
async function addStory(ownerId: string, name: string, pointId: string, content: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('canvas_add_story', {
      p_owner: ownerId, p_name: name, p_point: pointId, p_content: content,
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

async function getAudience(name: string): Promise<AudienceEntry[]> {
  const { data, error } = await supabase.rpc('get_canvas_audience', { p_name: name });
  if (error || !data) throwDbError('getAudience', error, 'Could not load who this canvas is shared with');
  return (((data as Json).entries ?? []) as Json[]).map(e => ({
    kind: e.kind,
    id: e.id,
    name: e.name,
    slug: e.slug ?? null,
    public: !!e.public,
    ownerAdmitted: !!e.owner_admitted,
    count: Number(e.count ?? 0),
    names: Array.isArray(e.names) ? e.names.map((n: Json) => ({ id: n.id, name: n.name, slug: n.slug ?? null })) : null,
  }));
}

async function getShareTargets(): Promise<ShareTargets> {
  const { data, error } = await supabase.rpc('get_canvas_share_targets');
  if (error || !data) throwDbError('getShareTargets', error, 'Could not load your events and groups');
  const raw = data as Json;
  return { events: raw.events ?? [], groups: raw.groups ?? [] };
}

async function shareCanvas(name: string, kind: 'event' | 'group', targetId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('share_canvas', { p_name: name, p_kind: kind, p_target: targetId });
    if (error) throwDbError('canvas.share', error, `Could not share this canvas: ${error.message}`);
  } finally {
    clearListReturnCache();
  }
}

async function unshareCanvas(name: string, kind: 'event' | 'group', targetId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('unshare_canvas', { p_name: name, p_kind: kind, p_target: targetId });
    if (error) throwDbError('canvas.unshare', error, `Could not stop sharing: ${error.message}`);
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
  getShareTargets,
  shareCanvas,
  unshareCanvas,
  listSharedWithEvent,
};
export type CanvasService = typeof canvasService;
