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
  /** When true, nav shows only the logo — hides everything else including BottomNav. Used on /intro. */
  logoOnly?: boolean;
}

export function ClarityLandingLayout({ children, chromeFree, compact, logoOnly }: ClarityLandingLayoutProps) {
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
      <ClarityLandingLayoutInner compact={compact} logoOnly={logoOnly}>{children}</ClarityLandingLayoutInner>
    </LiveSessionProvider>
  );
}

/**
 * Inner layout component — must be inside LiveSessionProvider
 * so useActiveSession can access the session context.
 */
function ClarityLandingLayoutInner({ children, compact, logoOnly }: { children: ReactNode; compact?: boolean; logoOnly?: boolean }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { showUserMenu } = useNavAuthState();

  // P511: Restore active session from localStorage on mount + track state
  const { hasActiveSession } = useActiveSession();

  const isLandingPage = location.pathname === "/";
  // P987: routes whose hero carries its OWN nav offset (pt-24 lg:pt-28) and sizes itself
  // to lg:min-h-screen. <main>'s nav padding must not stack on top: 100vh measured from
  // 80px down overflows the fold by exactly the nav height, pushing the hero's
  // bottom-anchored scroll cue out of view (/founder's "Why it matters" sat 8px below it).
  // Keep this separate from isLandingPage — that flag ALSO selects the footer (below), and
  // /founder's footer is a live question, not a spacing one. Add a route here only if its
  // hero has both properties; /coach has neither (content-height hero), so it is correctly
  // absent and keeps the padding.
  const heroOwnsTopOffset = isLandingPage || location.pathname === "/founder";
  const isAlternativeLandingPage = location.pathname === "/alternative";
  const isLivePage = location.pathname === "/live" || location.pathname.startsWith("/live/");
  // P852/P888: only the IMMERSIVE letter routes suppress chrome — reading
  // (/letter/:id, UUID or shortcode per P772) and compose (/letter/:docId/compose).
  // Results + overview keep the top nav by design (P699/P700); preview + confirm
  // are chromeFree via prop (P665/P684) and never reach this component.
  // A bare startsWith("/letter/") here swept results/overview in — that was P888.
  // P932: a completed letter stamps ?done=1 — the reading experience is over, so a
  // logged-in receiver leaves immersive mode and the app menus (top nav + bottom nav)
  // return, letting them be directed onward. Gated on showUserMenu so anonymous
  // one-to-many completers stay fully immersive (they have no app menu, and surfacing
  // the public Sign-in nav on their closure would be a regression). Reading/compose
  // (no ?done) stay immersive for everyone.
  const letterDone = searchParams.get('done') === '1' && showUserMenu;
  const isImmersiveLetterRoute =
    /^\/letter\/[^/]+(\/compose)?$/.test(location.pathname) && !letterDone;
  // Pages that have their own navigation (skip layout nav)
  const hasOwnNavigation = isAlternativeLandingPage;
  // Landing page needs nav but no top padding (hero goes to top)
  // Exception: when active session banner is showing, landing page needs padding
  // so the banner isn't hidden behind the fixed nav
  // P852: immersive letter routes are full-immersive — no brand nav, no top padding,
  // no ActiveSessionBanner (it would collide with the fixed letter progress bar
  // moved to top-0). Exit affordance lives inside the letter's own progress bar row.
  const hasVisibleBanner = hasActiveSession && !isLivePage && !isImmersiveLetterRoute;
  const needsTopPadding = !hasOwnNavigation && !isLivePage && !isImmersiveLetterRoute && (!heroOwnsTopOffset || hasVisibleBanner);
  // P113: Add bottom padding for mobile when logged in (for bottom nav)
  const needsBottomPadding = showUserMenu && !isLivePage && !logoOnly;
  // P1016: /terms owns a fixed bottom action bar. The bar overlays EVERYTHING, and the
  // footer is a sibling of <main> — so padding on <main> can't clear it, and the last
  // footer lines sat permanently under the bar even when scrolled to the true bottom.
  // The padding has to go on the flex column that contains both.
  const hasFixedActionBar = /^\/terms\/?$/.test(location.pathname);

  return (
    <div className={`${isLivePage ? 'h-screen overflow-hidden' : 'min-h-screen'} ${hasFixedActionBar ? 'pb-24' : ''} bg-background text-foreground flex flex-col`}>
      <OfflineBanner />
      {!hasOwnNavigation && !isImmersiveLetterRoute && (
        <SimpleNavigation compact={compact && !letterDone} logoOnly={logoOnly} />
      )}
      {/* P956: top offset grows by env(safe-area-inset-top) to clear the nav, which now
          extends over the iOS status-bar inset (viewport-fit=cover). Resolves to 4rem/5rem
          on Android/desktop where the inset is 0. */}
      <main className={`flex-1 min-h-0 ${isLivePage ? "overflow-hidden" : ""} ${needsTopPadding ? "pt-[calc(4rem+env(safe-area-inset-top))] lg:pt-[calc(5rem+env(safe-area-inset-top))]" : ""} ${needsBottomPadding ? "pb-20 lg:pb-0" : ""}`}>
        {hasActiveSession && !isLivePage && !isImmersiveLetterRoute && <ActiveSessionBanner />}
        {children}
      </main>
      {!isLivePage && !isImmersiveLetterRoute && !logoOnly && (
        isLandingPage
          ? <ClarityFooter />
          : !showUserMenu && <LegalFooter />
      )}
      {/* P113: Mobile bottom nav for logged-in users */}
      {!logoOnly && <BottomNav />}
      <Toaster />
    </div>
  );
}
