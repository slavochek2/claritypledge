/**
 * P1441: what every seat call site does when the client cannot act as the signed-in person
 * (`SessionMismatchError`). It never calls signOut(): supabase-js signs out whatever session the
 * CLIENT holds at that moment, server-side, and another tab can sign a different account in
 * between any check and that call. A full-page navigation instead makes the app re-read the
 * client, so the stale copy is dropped with nothing sent to the server:
 * - the client holds nobody: go to login (an RSVP keeps `action=rsvp`, so AuthCallbackPage
 *   completes it after sign-in; a cancel keeps no action, see signInAgainPath) and show the
 *   reason there once;
 * - the client holds someone (another tab signed in as a different account, or this same person
 *   whose session came back): reload the event page as that person. The reload carries no
 *   `action`, so nothing is retried automatically and no reload loop can form.
 */
import { useCallback } from 'react';
import {
  clientHasSession,
  setSignInAgainNotice,
  signInAgainPath,
  type SeatAction,
} from '@/lib/session-guard';

export function useSignInAgain() {
  return useCallback(async (eventSlug: string, action: SeatAction = 'rsvp') => {
    if (await clientHasSession()) {
      window.location.assign(`/events/${encodeURIComponent(eventSlug)}`);
      return;
    }
    setSignInAgainNotice(action);
    window.location.assign(signInAgainPath(eventSlug, action));
  }, []);
}
