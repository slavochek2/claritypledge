/**
 * @file canvas-artifacts.ts
 * @description P1545: the canvas reads behind the Artifacts page and chat attachment cards. Exposed through
 * canvasService (canvas-service.ts), which re-exports the types; tests mock that module, not this one.
 */

import { supabase } from '@/lib/supabase';
import { throwDbError } from './db-error-logger';
import type { CanvasGeneralAccess } from './canvas-service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

/** One of the caller's own canvases for the Artifacts page. `canvasId` is null until something was shared (no row yet = private). */
export interface MyCanvasRow {
  canvasId: string | null;
  name: string;
  generalAccess: CanvasGeneralAccess;
  hasAudience: boolean;
  lastEdit: string | null;
}

/** A canvas somebody shared with the caller through an explicit grant (never link-only). */
export interface CanvasSharedWithMe {
  canvasId: string;
  name: string;
  ownerId: string;
  ownerName: string | null;
  ownerSlug: string | null;
  ownerAvatarUrl: string | null;
  ownerAvatarColor: string | null;
  /** The kind of grant that admits the caller. */
  via: 'person' | 'group' | 'event';
  /** The group or event title for a group / event grant, else null. */
  viaName: string | null;
  sharedAt: string;
  /** No read marker, or read before the grant was made. */
  unread: boolean;
}

/** The chat card for a canvas / letter attachment, as the viewer may see it. `available: false` carries nothing else. */
export type ChatArtifact =
  | { available: false; kind: 'canvas' | 'letter'; id: string }
  | { available: true; kind: 'canvas'; id: string; name: string; ownerId: string; ownerName: string | null; ownerSlug: string | null; isOwner: boolean }
  | { available: true; kind: 'letter'; id: string; title: string | null; senderId: string; senderName: string | null; senderSlug: string | null; isSender: boolean; deliveryId: string | null };

/** The caller's canvases: every canvas they hold points on, merged with the ones already shared. */
export async function listMyCanvases(): Promise<MyCanvasRow[]> {
  const { data, error } = await supabase.rpc('list_my_artifacts_canvases');
  if (error) throwDbError('listMyCanvases', error, 'Could not load your canvases');
  return ((data ?? []) as Json[]).map(r => ({
    canvasId: r.canvas_id ?? null,
    name: r.name,
    generalAccess: r.general_access === 'link' ? 'link' : 'restricted',
    hasAudience: !!r.has_audience,
    lastEdit: r.last_edit ?? null,
  }));
}

/** Canvases shared with the caller by an explicit grant (a person, a group they are in, an event they attend). */
export async function listSharedWithMe(): Promise<CanvasSharedWithMe[]> {
  const { data, error } = await supabase.rpc('list_canvases_shared_with_me');
  if (error) throwDbError('listSharedWithMe', error, 'Could not load the canvases shared with you');
  return ((data ?? []) as Json[]).map(r => ({
    canvasId: r.canvas_id,
    name: r.name,
    ownerId: r.owner_id,
    ownerName: r.owner_name ?? null,
    ownerSlug: r.owner_slug ?? null,
    ownerAvatarUrl: r.owner_avatar_url ?? null,
    ownerAvatarColor: r.owner_avatar_color ?? null,
    via: r.via,
    viaName: r.via_name ?? null,
    sharedAt: r.shared_at,
    unread: !!r.unread,
  }));
}

/** Opening a canvas someone shared with you marks it read (a no-op for the owner and for link holders). */
export async function markCanvasRead(ownerId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('mark_canvas_read', { p_owner: ownerId, p_name: name });
  if (error) throwDbError('canvas.markRead', error, 'Could not mark this canvas as read');
}

/** The card for a canvas / letter attached to a chat message, judged for the signed-in viewer. */
export async function getChatArtifact(kind: 'canvas' | 'letter', id: string): Promise<ChatArtifact> {
  const { data, error } = await supabase.rpc('get_chat_artifact_attachment', { p_kind: kind, p_id: id });
  if (error || !data) throwDbError('getChatArtifact', error, 'Could not load this attachment');
  const r = data as Json;
  if (!r.available) return { available: false, kind, id };
  if (kind === 'canvas') {
    return { available: true, kind, id: r.id, name: r.name, ownerId: r.owner_id, ownerName: r.owner_name ?? null, ownerSlug: r.owner_slug ?? null, isOwner: !!r.is_owner };
  }
  return { available: true, kind, id: r.id, title: r.title ?? null, senderId: r.sender_id, senderName: r.sender_name ?? null, senderSlug: r.sender_slug ?? null, isSender: !!r.is_sender, deliveryId: r.delivery_id ?? null };
}
