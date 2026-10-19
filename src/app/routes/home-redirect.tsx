/**
 * @file home-redirect.tsx
 * @description P1512: where "/" and "/home" send people.
 *
 * "/" (and the installed app's start_url) lands a SIGNED-IN person on Home and everyone else on the
 * feed (P1392). The decision waits for the auth session to restore: before it does, a signed-in
 * person looks signed out, and redirecting then would drop them on the feed on every cold start.
 *
 * "/home" is the signed-in home. A signed-out visitor who reaches it (a stale bookmark, a shared
 * link) is sent to the feed. Both ask useHomeReadiness, the same answer the chat provider uses.
 */
import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";
import { HOME_PATH } from "@/app/components/layout/app-shell/shell-nav";
import { useHomeReadiness } from "./home-readiness";

/** The profile could not be read (or took too long): say so, and let the person try again. */
function HomeProfileError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <p className="text-base text-foreground">We could not load your account. Check your connection and try again.</p>
      <Button className="min-h-10 rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={onRetry}>
        Try again
      </Button>
      <Link to="/feed" className="text-sm text-blue-700 underline underline-offset-2">
        Go to the feed
      </Link>
    </div>
  );
}

/** P1392: "/" is the feed for everyone signed out; P1512: Home once signed in. */
export function HomeRedirect() {
  const location = useLocation();
  const { state, retry } = useHomeReadiness();
  // Pledge-invite (?referrer=) and ?login= links still go through the landing, which owns
  // those redirects and the landing_page_viewed referrer event (review finding, P1392).
  const params = new URLSearchParams(location.search);
  if (params.has("referrer") || params.has("login")) {
    return <Navigate to={`/builders${location.search}${location.hash}`} replace />;
  }
  if (state === "pending") return <ClarityPageLoader />;
  if (state === "profile-error") return <HomeProfileError onRetry={retry} />;
  if (state === "signed-in") {
    return <Navigate to={`${HOME_PATH}${location.search}${location.hash}`} replace />;
  }
  return <Navigate to={`/feed${location.search}${location.hash}`} replace />;
}

/** Guards the signed-in home: children for a signed-in person, the feed for everyone else. */
export function HomeRoute({ children }: { children: ReactNode }) {
  const { state, retry } = useHomeReadiness();
  if (state === "pending") return <ClarityPageLoader />;
  if (state === "profile-error") return <HomeProfileError onRetry={retry} />;
  if (state === "signed-out") return <Navigate to="/feed" replace />;
  return <>{children}</>;
}
