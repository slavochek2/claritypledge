/**
 * @file home-redirect.tsx
 * @description P1512: where "/" and "/home" send people.
 *
 * "/" (and the installed app's start_url) lands a SIGNED-IN person on Home and everyone else on the
 * feed (P1392). The decision waits for the auth session to restore: before it does, a signed-in
 * person looks signed out, and redirecting then would drop them on the feed on every cold start.
 *
 * "/home" is the signed-in home. A signed-out visitor who reaches it (a stale bookmark, a shared
 * link) is sent to the feed.
 */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";
import { useNavAuthState } from "@/hooks/use-nav-auth-state";
import { HOME_PATH } from "@/app/components/layout/app-shell/shell-nav";

/**
 * `pending` while the session (and, for a session, its profile) is still resolving; then whether
 * the person is a verified, signed-in user. Same definition the navigation uses to pick its chrome.
 */
function useSignedInResolution(): { pending: boolean; signedIn: boolean } {
  const { sessionChecked, hasSession, isLoading, showUserMenu } = useNavAuthState();
  return { pending: !sessionChecked || (hasSession && isLoading), signedIn: showUserMenu };
}

/** P1392: "/" is the feed for everyone signed out; P1512: Home once signed in. */
export function HomeRedirect() {
  const location = useLocation();
  const { pending, signedIn } = useSignedInResolution();
  // Pledge-invite (?referrer=) and ?login= links still go through the landing, which owns
  // those redirects and the landing_page_viewed referrer event (review finding, P1392).
  const params = new URLSearchParams(location.search);
  if (params.has("referrer") || params.has("login")) {
    return <Navigate to={`/builders${location.search}${location.hash}`} replace />;
  }
  if (pending) return <ClarityPageLoader />;
  if (signedIn) {
    return <Navigate to={`${HOME_PATH}${location.search}${location.hash}`} replace />;
  }
  return <Navigate to={`/feed${location.search}${location.hash}`} replace />;
}

/** Guards the signed-in home: children for a signed-in person, the feed for everyone else. */
export function HomeRoute({ children }: { children: ReactNode }) {
  const { pending, signedIn } = useSignedInResolution();
  if (pending) return <ClarityPageLoader />;
  if (!signedIn) return <Navigate to="/feed" replace />;
  return <>{children}</>;
}
