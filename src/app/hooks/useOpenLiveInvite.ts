'use client';

import { useReducer, useEffect } from 'react';
import { useAuth } from '@/auth';
import {
  getOpenLiveInviteForUser,
  subscribeToLiveInvites,
  type LiveInviteRecord,
} from '@/app/data/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OpenLiveInvite {
  sessionId: string;
  code: string;
  authorName: string;
  storyTitle: string;
  closedAt: string | null;
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
        const invite = mapRaw(raw);
        if (invite) dispatch({ type: 'INSERT', payload: invite });
      },
      (raw) => {
        if (cancelled) return;
        const invite = mapRaw(raw);
        if (invite) dispatch({ type: 'UPDATE', payload: invite });
        else {
          // closed_at set but no code in payload — remove by session_id
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
    // authorName and storyTitle are not in the raw invite record; they require
    // joins to profiles + stories. The invite row will carry them via the
    // joined query in getOpenLiveInviteForUser once the join is added.
    // For now, use placeholders — the inbox display component will enrich.
    authorName: '',
    storyTitle: '',
    closedAt: record.closedAt,
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
  };
}
