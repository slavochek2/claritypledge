/**
 * @file movement-service.ts
 * @description P1061: the two reads behind position movement. Each is one request returning one jsonb value
 * (`get_story_movement_rows`, `get_point_movement_rows`, SECURITY INVOKER), so no read stops at the 1000-row page
 * limit. A failed read THROWS (reported through throwDbError); it is never returned as "no movement", so a caller
 * cannot cache a failure as zero. The counting itself lives in `src/lib/position-movement.ts`.
 */
import { supabase } from '@/lib/supabase';
import type { PositionType } from '@/app/types';
import {
  storyMovements,
  type CurrentRow,
  type HistoryRow,
  type MovementStoryRow,
  type StoryMovement,
  type StoryMovementRows,
  type VerificationRow,
} from '@/lib/position-movement';
import { throwDbError } from './db-error-logger';

const USE_REAL_API = import.meta.env.VITE_USE_REAL_API === 'true';

type Raw = Record<string, unknown>;
const list = (value: unknown): Raw[] => (Array.isArray(value) ? (value as Raw[]) : []);
const str = (value: unknown): string => (typeof value === 'string' ? value : String(value ?? ''));

const mapStory = (r: Raw): MovementStoryRow => ({ id: str(r.id), authorId: str(r.author_id) });
const mapVerification = (r: Raw): VerificationRow => ({
  id: str(r.id),
  storyId: str(r.story_id),
  listenerId: str(r.listener_id),
  accuracyAchieved: typeof r.accuracy_achieved === 'boolean' ? r.accuracy_achieved : null,
  createdAt: str(r.created_at),
});
const mapHistory = (r: Raw): HistoryRow => ({
  id: str(r.id),
  pointId: str(r.point_id),
  userId: str(r.user_id),
  position: (r.position ?? null) as PositionType | null,
  changedAt: str(r.changed_at),
});
const mapCurrent = (r: Raw): CurrentRow => ({ pointId: str(r.point_id), userId: str(r.user_id), position: r.position as PositionType });

export function mapStoryMovementRows(raw: Raw): StoryMovementRows {
  return {
    stories: list(raw.stories).map(mapStory),
    storyPoints: list(raw.story_points).map(r => ({ storyId: str(r.story_id), pointId: str(r.point_id) })),
    verifications: list(raw.verifications).map(mapVerification),
    history: list(raw.history).map(mapHistory),
    current: list(raw.current).map(mapCurrent),
    agentIds: (Array.isArray(raw.agent_ids) ? raw.agent_ids : []).map(str),
  };
}

/** A person the point page can name: what the Changes list and its filter show. */
export interface MovementPerson {
  id: string;
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  hasPledged: boolean;
}

export interface MovementEvent { id: string; title: string; datetime: string; memberIds: string[] }
export interface MovementGroup { id: string; name: string; memberIds: string[] }

/** What `get_point_movement_rows` returns, in the app's shape. */
export interface PointMovementRows {
  pointId: string;
  stories: MovementStoryRow[];
  verifications: VerificationRow[];
  history: HistoryRow[];
  current: CurrentRow[];
  agentIds: string[];
  people: Map<string, MovementPerson>;
  events: MovementEvent[];
  groups: MovementGroup[];
}

export function mapPointMovementRows(raw: Raw): PointMovementRows {
  const people = new Map<string, MovementPerson>();
  for (const r of list(raw.profiles)) {
    people.set(str(r.id), {
      id: str(r.id),
      name: str(r.name),
      slug: typeof r.slug === 'string' ? r.slug : null,
      avatarUrl: typeof r.avatar_url === 'string' ? r.avatar_url : null,
      avatarColor: typeof r.avatar_color === 'string' ? r.avatar_color : null,
      hasPledged: r.has_pledged === true,
    });
  }
  const ids = (value: unknown) => (Array.isArray(value) ? value.map(str) : []);
  return {
    pointId: str(raw.point_id),
    stories: list(raw.stories).map(mapStory),
    verifications: list(raw.verifications).map(mapVerification),
    history: list(raw.history).map(mapHistory),
    current: list(raw.current).map(mapCurrent),
    agentIds: ids(raw.agent_ids),
    people,
    events: list(raw.events).map(r => ({ id: str(r.id), title: str(r.title), datetime: str(r.datetime), memberIds: ids(r.member_ids) })),
    groups: list(raw.groups).map(r => ({ id: str(r.id), name: str(r.name), memberIds: ids(r.member_ids) })),
  };
}

const EMPTY_STORY_ROWS: StoryMovementRows = { stories: [], storyPoints: [], verifications: [], history: [], current: [], agentIds: [] };

/** The movement of a page of stories, in one request. Throws on failure. */
export async function getStoryMovements(storyIds: readonly string[]): Promise<Map<string, StoryMovement>> {
  const ids = [...new Set(storyIds)];
  if (ids.length === 0 || !USE_REAL_API) return storyMovements({ ...EMPTY_STORY_ROWS });
  const { data, error } = await supabase.rpc('get_story_movement_rows', { p_story_ids: ids });
  if (error || !data) throwDbError('getStoryMovements', error, 'Could not load how positions moved');
  return storyMovements(mapStoryMovementRows(data as Raw));
}

/** Everything the point page's Changes view, card spread and story pills read, in one request. Throws on failure. */
export async function getPointMovement(pointId: string): Promise<PointMovementRows> {
  if (!USE_REAL_API) return mapPointMovementRows({ point_id: pointId });
  const { data, error } = await supabase.rpc('get_point_movement_rows', { p_point_id: pointId });
  if (error || !data) throwDbError('getPointMovement', error, 'Could not load how positions changed');
  return mapPointMovementRows(data as Raw);
}
