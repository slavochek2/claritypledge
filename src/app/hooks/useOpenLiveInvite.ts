'use client';

import { useReducer, useEffect } from 'react';
import { useAuth } from '@/auth';
import {
  getOpenLiveInviteForUser,
  subscribeToLiveInvites,
  type LiveInviteRecord,
} from '@/app/data/api';
import { supabase } from '@/lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OpenLiveInvite {
  sessionId: string;
  code: string;
  authorName: string;
  storyTitle: string;
  closedAt: string | null;
  // P745: inviter avatar + delivery context
  inviterPhotoUrl: string | null;
  inviterAvatarColor: string | null;
  inviterIsPledger: boolean;
  deliveryId: string | null;
}

interface InviteState {
  invite: OpenLiveInvite | null;
  loading: boolean;
}

type InviteAction =
  | { type: 'LOADED'; payload: OpenLiveInvite | null }
  | { type: 'INSERT'; payload: OpenLiveInvite }
  | { type: 'UPDATE'; payload: OpenLiveInvite }
  | { type: 'DELETE'; payload: { sessionId: string } };

// ─── Reducer (pure — exported for unit tests) ─────────────────────────────────

export function inviteReducer(state: InviteState, action: InviteAction): InviteState {
  switch (action.type) {
    case 'LOADED':
      return { invite: action.payload, loading: false };

    case 'INSERT':
      // Only store if still open
      if (action.payload.closedAt !== null) return state;
      return { ...state, invite: action.payload };

    case 'UPDATE':
      // Remove when closed_at is set
      if (action.payload.closedAt !== null) {
        return { ...state, invite: null };
      }
      return { ...state, invite: action.payload };

    case 'DELETE':
      if (state.invite?.sessionId === action.payload.sessionId) {
        return { ...state, invite: null };
      }
      return state;

    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * P703: Returns the current user's open live invite (if any).
 * Subscribes to realtime inserts/updates for instant delivery.
 * invite === null means no pending invite.
 */
export function useOpenLiveInvite(): { invite: OpenLiveInvite | null; loading: boolean } {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(inviteReducer, { invite: null, loading: true });

  useEffect(() => {
    if (!user) {
      dispatch({ type: 'LOADED', payload: null });
      return;
    }

    const userId = user.id;
    let cancelled = false;

    // Initial fetch
    getOpenLiveInviteForUser(userId).then((record) => {
      if (cancelled) return;
      dispatch({ type: 'LOADED', payload: record ? mapRecord(record) : null });
    });

    // Realtime subscription
    const unsubscribe = subscribeToLiveInvites(
      userId,
      (raw) => {
        if (cancelled) return;
        const sessionId = raw['session_id'] as string | undefined;
        if (!sessionId) return;
        // Realtime payload only has clarity_live_invites columns — no code, author_name,
        // or story_title (all from joined tables). Fetch from clarity_sessions directly.
        if (raw['closed_at']) return;
        supabase
          .from('clarity_sessions')
          .select('code, creator_name, creator_photo_url, creator_avatar_color, creator_is_pledger, delivery_id, stories!clarity_sessions_source_story_id_fkey(content)')
          .eq('id', sessionId)
          .maybeSingle()
          .then(({ data: session }) => {
            if (cancelled || !session) return;
            if (!session.code) return; // NOT NULL in schema; guard against constraint violation
            const rawContent = (session.stories as { content: string } | null)?.content ?? '';
            dispatch({
              type: 'INSERT',
              payload: {
                sessionId,
                code: session.code,
                authorName: session.creator_name ?? '',
                storyTitle: rawContent ? rawContent.split('\n')[0].substring(0, 60) : '',
                closedAt: null,
                inviterPhotoUrl: (session.creator_photo_url as string | null) ?? null,
                inviterAvatarColor: (session.creator_avatar_color as string | null) ?? null,
                inviterIsPledger: (session.creator_is_pledger as boolean | null) ?? false,
                deliveryId: (session.delivery_id as string | null) ?? null,
              },
            });
          });
      },
      (raw) => {
        if (cancelled) return;
        const invite = mapRaw(raw);
        // UPDATE payloads always carry closed_at (the only mutation on this table is closure).
        // When closed_at is set, the reducer clears the invite — code:'' from mapRaw is safe.
        // A non-close UPDATE would overwrite the invite with code:'', but that never occurs.
        if (invite) dispatch({ type: 'UPDATE', payload: invite });
        else {
          // closed_at set but no session_id in payload — remove by session_id
          const sessionId = raw['session_id'] as string | undefined;
          if (sessionId) dispatch({ type: 'DELETE', payload: { sessionId } });
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user]);

  return state;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapRecord(record: LiveInviteRecord): OpenLiveInvite {
  return {
    sessionId: record.sessionId,
    code: record.code,
    authorName: record.authorName,
    storyTitle: record.storyTitle,
    closedAt: record.closedAt,
    inviterPhotoUrl: null,
    inviterAvatarColor: null,
    inviterIsPledger: false,
    deliveryId: null,
  };
}

function mapRaw(raw: Record<string, unknown>): OpenLiveInvite | null {
  const sessionId = raw['session_id'] as string | undefined;
  if (!sessionId) return null;
  return {
    sessionId,
    code: (raw['code'] as string | undefined) ?? '',
    authorName: (raw['author_name'] as string | undefined) ?? '',
    storyTitle: (raw['story_title'] as string | undefined) ?? '',
    closedAt: (raw['closed_at'] as string | null | undefined) ?? null,
    inviterPhotoUrl: null,
    inviterAvatarColor: null,
    inviterIsPledger: false,
    deliveryId: null,
  };
}
