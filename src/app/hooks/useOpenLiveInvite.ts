'use client';

import { useReducer, useEffect } from 'react';
import * as Sentry from '@sentry/react';
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
  | { type: 'DELETE'; payload: { sessionId: string } }
  | { type: 'RESET' };

// ─── Reducer (pure — exported for unit tests) ─────────────────────────────────

export function inviteReducer(state: InviteState, action: InviteAction): InviteState {
  switch (action.type) {
    case 'LOADED':
      // If a realtime INSERT already populated invite, don't let a null-resolving
      // initial fetch (raced before the invite existed in DB) wipe it.
      // Revocation always goes through UPDATE/DELETE, not LOADED.
      if (action.payload === null && state.invite !== null) {
        return { ...state, loading: false };
      }
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

    case 'RESET':
      // Unconditional clear — used when the auth identity goes away (sign-out).
      // LOADED(null) can't be used here because its guard preserves a populated
      // invite across a stale fetch race.
      return { invite: null, loading: false };

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
      dispatch({ type: 'RESET' });
      return;
    }

    const userId = user.id;
    let cancelled = false;

    getOpenLiveInviteForUser(userId)
      .then((record) => {
        if (cancelled) return;
        dispatch({ type: 'LOADED', payload: record ? mapRecord(record) : null });
      })
      .catch((err) => {
        Sentry.captureException(err, { tags: { source: 'useOpenLiveInvite.initialFetch' } });
        if (!cancelled) dispatch({ type: 'LOADED', payload: null });
      });

    const unsubscribe = subscribeToLiveInvites(
      userId,
      (raw) => {
        if (cancelled) return;
        const sessionId = raw['session_id'] as string | undefined;
        if (!sessionId) return;
        if (raw['closed_at']) return;
        // P765: mirror getOpenLiveInviteForUser's shape — avatar fields live on profiles,
        // not on clarity_sessions. Prior flat columns (creator_photo_url, etc.) do not exist,
        // and `delivery_id` is not a column either — deliveryId is resolved via a secondary
        // lookup on letter_deliveries keyed by source_letter_id + receiver_profile_id.
        supabase
          .from('clarity_sessions')
          // P1057: `code` dropped — it is no longer readable by authenticated callers.
          // Resolved below via get_room_code_for_invite, gated on auth.uid() being the
          // invite target or the session creator.
          .select(
            'creator_name, source_letter_id, profiles!clarity_sessions_creator_profile_id_fkey(avatar_url, avatar_color, has_pledged), stories!clarity_sessions_source_story_id_fkey(content)',
          )
          .eq('id', sessionId)
          .maybeSingle()
          .then(async ({ data: session, error }) => {
            if (cancelled) return;
            if (error || !session) {
              Sentry.captureMessage(
                'useOpenLiveInvite: secondary session fetch returned null',
                {
                  level: 'warning',
                  tags: { source: 'useOpenLiveInvite.enrichment' },
                  extra: { sessionId, error: error?.message },
                },
              );
              return;
            }
            // P1057: the code no longer arrives on the session row — it is resolved by an
            // accessor gated on auth.uid(). The pre-existing "missing code" warning below is
            // KEPT but re-aimed: it must not become the normal path. Reaching it now means
            // the subscriber is not the invite's open target and not the creator, which for
            // this hook (it only ever subscribes to the user's own invites) is a real
            // anomaly worth a Sentry warning rather than a routine empty.
            const { data: resolvedCode } = await supabase.rpc('get_room_code_for_invite', {
              p_session_id: sessionId,
            });
            if (cancelled) return;
            if (!resolvedCode) {
              Sentry.captureMessage(
                'useOpenLiveInvite: session found but code not resolvable for this user',
                {
                  level: 'warning',
                  tags: { source: 'useOpenLiveInvite.enrichment' },
                  extra: { sessionId },
                },
              );
              return;
            }

            const profile = Array.isArray(session.profiles)
              ? session.profiles[0]
              : (session.profiles as { avatar_url?: string | null; avatar_color?: string | null; has_pledged?: boolean | null } | null);
            const story = Array.isArray(session.stories)
              ? session.stories[0]
              : (session.stories as { content?: string } | null);
            const rawContent = story?.content ?? '';

            let deliveryId: string | null = null;
            const sourceLetterId = (session as { source_letter_id?: string | null }).source_letter_id ?? null;
            if (sourceLetterId) {
              const { data: deliveries } = await supabase
                .from('letter_deliveries')
                .select('id')
                .eq('letter_id', sourceLetterId)
                .eq('receiver_profile_id', userId)
                .order('created_at', { ascending: false })
                .limit(1);
              if (cancelled) return;
              deliveryId = deliveries?.[0]?.id ?? null;
            }

            dispatch({
              type: 'INSERT',
              payload: {
                sessionId,
                code: resolvedCode as string,
                authorName: (session.creator_name as string | null) ?? '',
                storyTitle: rawContent ? rawContent.split('\n')[0].substring(0, 60) : '',
                closedAt: null,
                inviterPhotoUrl: (profile?.avatar_url as string | null | undefined) ?? null,
                inviterAvatarColor: (profile?.avatar_color as string | null | undefined) ?? null,
                inviterIsPledger: (profile?.has_pledged as boolean | null | undefined) ?? false,
                deliveryId,
              },
            });
          })
          .catch((err) => {
            Sentry.captureException(err, { tags: { source: 'useOpenLiveInvite.enrichment' } });
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
    inviterPhotoUrl: record.inviterPhotoUrl,
    inviterAvatarColor: record.inviterAvatarColor,
    inviterIsPledger: record.inviterIsPledger,
    deliveryId: record.deliveryId,
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
