/**
 * P1441: what every RSVP call site does when the client cannot act as the signed-in person
 * (`SessionMismatchError`): say so plainly, drop the stale app session, and send them to sign in
 * with the RSVP intent kept — AuthCallbackPage completes the RSVP after that sign-in.
 *
 * Two cases, because supabase-js signOut() revokes whatever session the CLIENT holds:
 * - the client holds nobody: a local sign-out sends nothing to the server and only clears the
 *   stale app copy. It is awaited first, because the login page sends anyone it still sees as
 *   signed in straight back to `redirect`.
 * - the client holds someone else (another tab signed in as a different account): signing out
 *   here would end THAT session server-side. Reload the event page instead, so the app adopts
 *   whoever is really signed in.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { clientHasSession, signInAgainPath, SIGN_IN_AGAIN_MESSAGE } from '@/lib/session-guard';

export function useSignInAgain() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  return useCallback(
    async (eventSlug: string) => {
      if (await clientHasSession()) {
        window.location.assign(`/events/${encodeURIComponent(eventSlug)}`);
        return;
      }
      toast.error(SIGN_IN_AGAIN_MESSAGE);
      await signOut({ scope: 'local' }).catch(() => {});
      navigate(signInAgainPath(eventSlug), { replace: true });
    },
    [navigate, signOut],
  );
}
