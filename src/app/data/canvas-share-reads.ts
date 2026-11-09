/**
 * @file canvas-share-reads.ts
 * @description P1650: the two owner reads behind sharing, exposed through canvasService (canvas-service.ts).
 *   - `getSharePeople`: the people the Share field offers before anything is typed (rpc get_canvas_share_people,
 *     scope-limited and ordered by the server; same row shape as search_profiles).
 *   - `listAttachableCanvases`: the canvases the paperclip may carry into one chat (rpc list_attachable_canvases,
 *     exactly the server rule _chat_can_attach).
 * Tests mock canvas-service, not this module.
 */

import { supabase } from '@/lib/supabase';
import { throwDbError } from './db-error-logger';
import type { ProfileSearchResult } from './agreements-service.interface';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

/** A canvas this chat may carry; `title` is null until the owner renamed it (show the default title then). */
export interface AttachableCanvas {
  canvasId: string;
  name: string;
  title: string | null;
}

/** A recipient of a new share whose chat message was not written (block, daily limit, a failure in chat). */
export interface ShareSkipped {
  kind: 'person' | 'event' | 'group';
  id: string;
  name: string;
}

/** The people offered on focus, up to 8, as the server ordered them. Anything but a list reads as no people. */
export async function getSharePeople(): Promise<ProfileSearchResult[]> {
  const { data, error } = await supabase.rpc('get_canvas_share_people');
  if (error) throwDbError('getSharePeople', error, 'Could not load the people you can share with');
  if (!Array.isArray(data)) return [];
  return (data as Json[]).map(row => ({
    profileId: row.profile_id,
    name: row.name ?? 'Unknown',
    slug: row.slug ?? null,
    avatarUrl: row.avatar_url ?? null,
    avatarColor: row.avatar_color ?? '#3B82F6',
    hasPledged: row.has_pledged ?? false,
    isVerified: row.is_verified ?? false,
  }));
}

/** The caller's own published canvases this conversation may carry (the server decides which). */
export async function listAttachableCanvases(conversationId: string): Promise<AttachableCanvas[]> {
  const { data, error } = await supabase.rpc('list_attachable_canvases', { p_conversation: conversationId });
  if (error) throwDbError('listAttachableCanvases', error, 'Could not load your canvases');
  if (!Array.isArray(data)) return [];
  return (data as Json[]).map(row => ({ canvasId: row.canvas_id, name: row.name, title: row.title ?? null }));
}
