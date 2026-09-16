import { ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { SimpleNavigation } from "@/app/components/layout/simple-navigation";
import { EventLinksMenu } from "@/app/components/layout/event-links-menu";
import { BottomNav } from "@/app/components/layout/bottom-nav";
import { LegalFooter } from "@/app/components/layout/legal-footer";
import { ClarityFooter } from "@/app/components/layout/clarity-footer";
import { OfflineBanner } from "@/app/components/offline-banner";
import { ActiveSessionBanner } from "@/app/components/session/active-session-banner";
import { RoomCaptureBarSlot } from "@/app/components/session/room-capture-bar";
import { Toaster } from "@/components/ui/sonner";
import { useNavAuthState } from "@/hooks/use-nav-auth-state";
import { useActiveSession } from "@/hooks/use-active-session";
import { LiveSessionProvider } from "@/app/contexts/live-session-context";
import { useRoomCapture } from "@/app/contexts/room-capture-context";
import { isImmersiveLetterRoute as matchImmersiveLetterRoute } from "@/app/layouts/immersive-letter-route";

/**
 * P1323: is this page somewhere a person is USING the thing, or READING ABOUT it?
 *
 * `product` gets the Links menu — the product's standing index of point collections,
 * letters and tools. `public` does not.
 *
 * Signed-out is NOT the test. An anonymous attendee who followed a link to
 * `/stake/cmp7` during an event is on a product surface and needs the index more than a
 * signed-in founder does.
 *
 * WHY A REQUIRED PROP AND NOT A LIST. Founder, 2026-09-16: "What I want is minimizing
 * future decisions or future mistakes when we create and modify pages... it needs to be
 * sustainable." An allow-list and a deny-list fail the same way — a route is added, the
 * list is not updated, and nothing says so. `SimpleNavigation` has exactly one render
 * site (below), so this layout is a real chokepoint: making the prop required puts the
 * question in the same diff that creates the route, where whoever is writing it has the
 * most context.
 *
 * HONEST LIMIT, measured 2026-09-16 — do not restate the stronger claim. "A new page
 * cannot compile without answering" is true of `tsc` and of an IDE, and FALSE of this
 * repo's pipeline: `scripts/typecheck-gate.sh` (pre-commit AND CI) gates only the
 * undeclared-identifier family TS2304/2552/2582, a missing required prop is TS2741, and
 * `vite build` uses esbuild and does not typecheck at all. `scripts/surface-prop-gate.sh`
 * exists to close that hole; if it is ever removed, this prop becomes advisory again.
 */
export type ClarityLayoutSurface = 'product' | 'public';

interface ClarityLandingLayoutProps {
  children: ReactNode;
  /** Required — see ClarityLayoutSurface. */
  surface: ClarityLayoutSurface;
  /** P665: When true, render children inside LiveSessionProvider with Toaster but without nav/footer/padding */
  chromeFree?: boolean;
  /** When true, nav shows only logo + avatar — hides nav links, CTA, and hamburger. Used on /letter/:id. */
  compact?: boolean;
  /** When true, nav shows only the logo — hides everything else including BottomNav. Used on /intro. */
  logoOnly?: boolean;
}

export function ClarityLandingLayout({ children, surface, chromeFree, compact, logoOnly }: ClarityLandingLayoutProps) {
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
      <ClarityLandingLayoutInner surface={surface} compact={compact} logoOnly={logoOnly}>{children}</ClarityLandingLayoutInner>
    </LiveSessionProvider>
  );
}

/**
 * Inner layout component — must be inside LiveSessionProvider
 * so useActiveSession can access the session context.
 */
function ClarityLandingLayoutInner({ children, surface, compact, logoOnly }: { children: ReactNode; surface: ClarityLayoutSurface; compact?: boolean; logoOnly?: boolean }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { showUserMenu } = useNavAuthState();

  // P511: Restore active session from localStorage on mount + track state
  const { hasActiveSession } = useActiveSession();
  // P1307 D9: the room transcription bar takes the same in-flow slot as the /live bar.
  const { barVisible: roomBarVisible } = useRoomCapture();

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
  // P1149: /transcribe's room view uses the same technique as /live — its own sticky
  // top bar (rendered only in the room sub-state) overlaps this component's fixed
  // SimpleNavigation once main's top padding is removed, swapping in an End Session
  // control the same way /live's LiveSessionBanner replaces the "Start a Clarity
  // Session" CTA. Folded into isLivePage rather than a parallel flag so it picks up
  // every gate below (padding, footer, ActiveSessionBanner, h-screen) for free —
  // same pattern isReadyPage/isMeetingTermsPage already use for multi-route matches.
  // This component only sees location.pathname, not the page's own sub-state — adding a
  // route here applies every gate to ALL of that route's sub-states. Audit each one.
  const isLivePage = location.pathname === "/live" || location.pathname.startsWith("/live/") ||
    location.pathname === "/transcribe" || location.pathname.startsWith("/transcribe/");
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
  // The rule lives in immersive-letter-route.ts because room capture pauses on exactly these
  // screens (P1307 D13) — two readers, one definition.
  const isImmersiveLetterRoute = matchImmersiveLetterRoute(location.pathname, location.search, showUserMenu);
  // Pages that have their own navigation (skip layout nav)
  const hasOwnNavigation = isAlternativeLandingPage;
  // Landing page needs nav but no top padding (hero goes to top)
  // Exception: when active session banner is showing, landing page needs padding
  // so the banner isn't hidden behind the fixed nav
  // P852: immersive letter routes are full-immersive — no brand nav, no top padding,
  // no ActiveSessionBanner (it would collide with the fixed letter progress bar
  // moved to top-0). Exit affordance lives inside the letter's own progress bar row.
  const hasVisibleBanner = (hasActiveSession || roomBarVisible) && !isLivePage && !isImmersiveLetterRoute;
  const needsTopPadding = !hasOwnNavigation && !isLivePage && !isImmersiveLetterRoute && (!heroOwnsTopOffset || hasVisibleBanner);
  // P113: Add bottom padding for mobile when logged in (for bottom nav)
  const needsBottomPadding = showUserMenu && !isLivePage && !logoOnly;
  // P1024: matches `/meet`. This guard was written for `/terms` in P1016 and the route
  // was renamed under it — a rename that silently switched the footer back ON for the one
  // page whose whole design depends on it being off. `/terms-of-service` is a different,
  // genuinely legal page and must keep its footer, so the anchors stay.
  //
  // P1114 rev2: also matches the room's own `/events/:slug/meet` — the `compact` prop
  // alone only silences the top nav (SimpleNavigation above), never the footer, so the
  // room's three routes need the same path-based guard the standalone pages use. A
  // signed-out visitor on the gate screen surfaced this: LegalFooter still rendered
  // below the fold (found via a Playwright DOM match, not visually — the gate's centred
  // layout pushed it out of the viewport, which is why a screenshot alone didn't catch it).
  const isMeetingTermsPage = /^\/(meet|events\/[^/]+\/meet)\/?$/.test(location.pathname);
  // P1077: /ready is the same single-focus surface as /meet — one question, one action —
  // the footer's site links would compete with that. P1114 rev2: also matches the room's
  // own `/events/:slug/ready`, and the gate itself (`/events/:slug/room`) — same reasoning.
  const isReadyPage = /^\/(ready|events\/[^/]+\/(ready|room))\/?$/.test(location.pathname);
  return (
    /**
     * P1323: the Links provider wraps the WHOLE layout — nav and page children alike.
     *
     * It used to wrap only the <nav> inside SimpleNavigation, which left the page's own
     * children outside it. A page that draws its own sticky header over the nav
     * (/transcribe/:code, /live/:code — the guard below deliberately does NOT hide the nav
     * there, it is merely covered) therefore had no way to render the one trigger in its
     * own chrome without portalling. From here, such a page calls useLinksTriggerOverride
     * and renders <EventLinksButton owner="page" />; the nav's instances stand down, so
     * there is still exactly one trigger node in the DOM.
     *
     * `enabled` is the whole mount rule. `surface` is required on this component, so a new
     * route cannot be added without answering the product/public question.
     */
    <EventLinksMenu enabled={surface === 'product'}>
    <div className={`${isLivePage ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-background text-foreground flex flex-col`}>
      <OfflineBanner />
      {!hasOwnNavigation && !isImmersiveLetterRoute && (
        <SimpleNavigation compact={compact && !letterDone} logoOnly={logoOnly} />
      )}
      {/* P956: top offset grows by env(safe-area-inset-top) to clear the nav, which now
          extends over the iOS status-bar inset (viewport-fit=cover). Resolves to 4rem/5rem
          on Android/desktop where the inset is 0. */}
      <main className={`flex-1 min-h-0 ${isLivePage ? "overflow-hidden" : ""} ${needsTopPadding ? "pt-[calc(4rem+env(safe-area-inset-top))] lg:pt-[calc(5rem+env(safe-area-inset-top))]" : ""} ${needsBottomPadding ? "pb-20 lg:pb-0" : ""}`}>
        {hasActiveSession && !isLivePage && !isImmersiveLetterRoute && <ActiveSessionBanner />}
        {/* P1307: mounted wherever this layout has room for a bar. On /live and /transcribe
            (own sticky header) and immersive letter screens it is not mounted here — /transcribe
            mounts its own slot, and capture pauses on the other two. */}
        {!isLivePage && !isImmersiveLetterRoute && <RoomCaptureBarSlot />}
        {children}
      </main>
      {/* P1016: /terms is a focus surface shown to a stranger before a meeting, with a
          fixed bottom action bar. The footer's site links compete with the single
          action and sat underneath that bar; dropping it removes both problems. */}
      {!isLivePage && !isImmersiveLetterRoute && !logoOnly && !isMeetingTermsPage && !isReadyPage && (
        isLandingPage
          ? <ClarityFooter />
          : !showUserMenu && <LegalFooter />
      )}
      {/* P113: Mobile bottom nav for logged-in users */}
      {!logoOnly && <BottomNav />}
      <Toaster />
    </div>
    </EventLinksMenu>
  );
}
