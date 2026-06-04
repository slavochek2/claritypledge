import { ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { SimpleNavigation } from "@/app/components/layout/simple-navigation";
import { BottomNav } from "@/app/components/layout/bottom-nav";
import { LegalFooter } from "@/app/components/layout/legal-footer";
import { ClarityFooter } from "@/app/components/layout/clarity-footer";
import { OfflineBanner } from "@/app/components/offline-banner";
import { ActiveSessionBanner } from "@/app/components/session/active-session-banner";
import { Toaster } from "@/components/ui/sonner";
import { useNavAuthState } from "@/hooks/use-nav-auth-state";
import { useActiveSession } from "@/hooks/use-active-session";
import { LiveSessionProvider } from "@/app/contexts/live-session-context";

interface ClarityLandingLayoutProps {
  children: ReactNode;
  /** P665: When true, render children inside LiveSessionProvider with Toaster but without nav/footer/padding */
  chromeFree?: boolean;
  /** When true, nav shows only logo + avatar — hides nav links, CTA, and hamburger. Used on /letter/:id. */
  compact?: boolean;
}

export function ClarityLandingLayout({ children, chromeFree, compact }: ClarityLandingLayoutProps) {
  const [searchParams] = useSearchParams();

  // Embed mode: strip all page chrome (nav, footer, bottom nav)
  const isEmbed = searchParams.get('embed') === 'true';

  if (isEmbed) {
    return <>{children}</>;
  }

  // P665: Chrome-free mode for letter routes — keeps LiveSessionProvider + Toaster
  if (chromeFree) {
    return (
      <LiveSessionProvider>
        <OfflineBanner />
        <main className="min-h-screen bg-background text-foreground">
          {children}
        </main>
        <Toaster />
      </LiveSessionProvider>
    );
  }

  return (
    <LiveSessionProvider>
      <ClarityLandingLayoutInner compact={compact}>{children}</ClarityLandingLayoutInner>
    </LiveSessionProvider>
  );
}

/**
 * Inner layout component — must be inside LiveSessionProvider
 * so useActiveSession can access the session context.
 */
function ClarityLandingLayoutInner({ children, compact }: { children: ReactNode; compact?: boolean }) {
  const location = useLocation();
  const { showUserMenu } = useNavAuthState();

  // P511: Restore active session from localStorage on mount + track state
  const { hasActiveSession } = useActiveSession();

  const isLandingPage = location.pathname === "/";
  const isAlternativeLandingPage = location.pathname === "/alternative";
  const isLivePage = location.pathname === "/live" || location.pathname.startsWith("/live/");
  // P852/P888: only the IMMERSIVE letter routes suppress chrome — reading
  // (/letter/:id, UUID or shortcode per P772) and compose (/letter/:docId/compose).
  // Results + overview keep the top nav by design (P699/P700); preview + confirm
  // are chromeFree via prop (P665/P684) and never reach this component.
  // A bare startsWith("/letter/") here swept results/overview in — that was P888.
  const isImmersiveLetterRoute = /^\/letter\/[^/]+(\/compose)?$/.test(location.pathname);
  // Pages that have their own navigation (skip layout nav)
  const hasOwnNavigation = isAlternativeLandingPage;
  // Landing page needs nav but no top padding (hero goes to top)
  // Exception: when active session banner is showing, landing page needs padding
  // so the banner isn't hidden behind the fixed nav
  // P852: immersive letter routes are full-immersive — no brand nav, no top padding,
  // no ActiveSessionBanner (it would collide with the fixed letter progress bar
  // moved to top-0). Exit affordance lives inside the letter's own progress bar row.
  const hasVisibleBanner = hasActiveSession && !isLivePage && !isImmersiveLetterRoute;
  const needsTopPadding = !hasOwnNavigation && !isLivePage && !isImmersiveLetterRoute && (!isLandingPage || hasVisibleBanner);
  // P113: Add bottom padding for mobile when logged in (for bottom nav)
  const needsBottomPadding = showUserMenu && !isLivePage;

  return (
    <div className={`${isLivePage ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-background text-foreground flex flex-col`}>
      <OfflineBanner />
      {!hasOwnNavigation && !isImmersiveLetterRoute && (
        <SimpleNavigation compact={compact} />
      )}
      <main className={`flex-1 min-h-0 ${isLivePage ? "overflow-hidden" : ""} ${needsTopPadding ? "pt-16 lg:pt-20" : ""} ${needsBottomPadding ? "pb-20 lg:pb-0" : ""}`}>
        {hasActiveSession && !isLivePage && !isImmersiveLetterRoute && <ActiveSessionBanner />}
        {children}
      </main>
      {!isLivePage && !isImmersiveLetterRoute && (
        isLandingPage
          ? <ClarityFooter />
          : !showUserMenu && <LegalFooter />
      )}
      {/* P113: Mobile bottom nav for logged-in users */}
      <BottomNav />
      <Toaster />
    </div>
  );
}
