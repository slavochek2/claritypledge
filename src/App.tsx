import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams, useParams, useLocation } from "react-router-dom";
import { lazy, Suspense, Component, ReactNode, useState, useEffect } from "react";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";
import * as Sentry from "@sentry/react";
import { HelmetProvider } from "react-helmet-async";
import { ClarityLandingLayout } from "@/app/layouts/clarity-landing-layout";
import { AuthCallbackPage, AuthProvider, useAuth } from "@/auth";
import { ScrollToTop } from "@/app/components/scroll-to-top";
import { PwaInstallProvider } from "@/hooks/use-pwa-install";
import { TermsAcceptanceGate } from "@/app/components/auth/terms-acceptance-gate";
import { resolveLetterShortcode } from "@/app/data/letters-service";
import { letterShortCodes } from "@/app/data/short-links";

// P553: All pages lazy-loaded to reduce initial bundle size
const ClarityPledgeLanding = lazy(() => import("@/app/pages/clarity-pledge-landing").then(m => ({ default: m.ClarityPledgeLanding })));
const SignPledgePage = lazy(() => import("@/app/pages/sign-pledge-page").then(m => ({ default: m.SignPledgePage })));
const PledgeConfirmationPage = lazy(() => import("@/app/pages/pledge-confirmation-page").then(m => ({ default: m.PledgeConfirmationPage })));
const ProfilePageV2 = lazy(() => import("@/app/pages/profile-page-v2").then(m => ({ default: m.ProfilePageV2 })));
const PledgePage = lazy(() => import("@/app/pages/pledge-page").then(m => ({ default: m.PledgePage })));
const BadgePage = lazy(() => import("@/app/pages/badge-page").then(m => ({ default: m.BadgePage })));
const MePage = lazy(() => import("@/app/pages/me-page").then(m => ({ default: m.MePage })));
const ClarityPledgersPage = lazy(() => import("@/app/pages/clarity-pledgers-page").then(m => ({ default: m.ClarityPledgersPage })));
const LoginPage = lazy(() => import("@/app/pages/login-page").then(m => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import("@/app/pages/signup-page").then(m => ({ default: m.SignupPage })));
const ShortLinkRedirect = lazy(() => import("@/app/pages/short-link-redirect").then(m => ({ default: m.ShortLinkRedirect })));

// Lazy loaded pages - split into separate chunks
const AboutPage = lazy(() => import("@/app/pages/about-page").then(m => ({ default: m.AboutPage })));
const IntroPage = lazy(() => import("@/app/pages/intro-page").then(m => ({ default: m.IntroPage })));
const ChiangMaiPage = lazy(() => import("@/app/pages/chiang-mai-page").then(m => ({ default: m.ChiangMaiPage })));
const FullArticlePage = lazy(() => import("@/app/pages/full-article-page").then(m => ({ default: m.FullArticlePage })));
const PrivacyPolicyPage = lazy(() => import("@/app/pages/privacy-policy-page").then(m => ({ default: m.PrivacyPolicyPage })));
const TermsOfServicePage = lazy(() => import("@/app/pages/terms-of-service-page").then(m => ({ default: m.TermsOfServicePage })));
const SettingsPage = lazy(() => import("@/app/pages/settings-page").then(m => ({ default: m.SettingsPage })));
const ClarityDemoPage = lazy(() => import("@/app/pages/clarity-demo-page").then(m => ({ default: m.ClarityDemoPage })));
const FeedPage = lazy(() => import("@/app/pages/feed-page").then(m => ({ default: m.FeedPage })));
const ClarityLivePage = lazy(() => import("@/app/pages/clarity-live-page").then(m => ({ default: m.ClarityLivePage })));
const MySessionsPage = lazy(() => import("@/app/pages/my-sessions-page").then(m => ({ default: m.MySessionsPage })));
const CollaboratePage = lazy(() => import("@/app/pages/collaborate-page").then(m => ({ default: m.CollaboratePage })));
const CreateStoryPage = lazy(() => import("@/app/pages/create-story-page").then(m => ({ default: m.CreateStoryPage })));
const StoryDetailPage = lazy(() => import("@/app/pages/story-detail-page").then(m => ({ default: m.StoryDetailPage })));
const PointDetailPage = lazy(() => import("@/app/pages/point-detail-page").then(m => ({ default: m.PointDetailPage })));
const CreateAgreementPage = lazy(() => import("@/app/pages/create-agreement-page").then(m => ({ default: m.CreateAgreementPage })));
const AgreementPage = lazy(() => import("@/app/pages/agreement-page").then(m => ({ default: m.AgreementPage })));
const AcceptAgreementPage = lazy(() => import("@/app/pages/accept-agreement-page").then(m => ({ default: m.AcceptAgreementPage })));
const AgreementEmailConfirmationPage = lazy(() => import("@/app/pages/agreement-email-confirmation-page").then(m => ({ default: m.AgreementEmailConfirmationPage })));
const DeclinedAgreementPage = lazy(() => import("@/app/pages/declined-agreement-page").then(m => ({ default: m.DeclinedAgreementPage })));
const BlogSubscribedPage = lazy(() => import("@/app/pages/blog-subscribed-page").then(m => ({ default: m.BlogSubscribedPage })));
const ProfileConnectionsPage = lazy(() => import("@/app/pages/profile-connections-page").then(m => ({ default: m.ProfileConnectionsPage })));
const PartnerTemplatePage = lazy(() => import("@/app/pages/partner-template-page").then(m => ({ default: m.PartnerTemplatePage })));
const DocDetailPage = lazy(() => import("@/app/pages/doc-detail-page").then(m => ({ default: m.DocDetailPage })));
const LettersPage = lazy(() => import("@/app/pages/letters-page").then(m => ({ default: m.LettersPage })));
const LetterComposePage = lazy(() => import("@/app/pages/letter-compose-page").then(m => ({ default: m.LetterComposePage })));
const LetterPreviewPage = lazy(() => import("@/app/pages/letter-preview-page").then(m => ({ default: m.LetterPreviewPage })));
const LetterReadingPage = lazy(() => import("@/app/pages/letter-reading-page").then(m => ({ default: m.LetterReadingPage })));
const CalibrationBreakdownPage = lazy(() => import("@/app/pages/calibration-breakdown-page").then(m => ({ default: m.CalibrationBreakdownPage })));
const LetterResultsPage = lazy(() => import("@/app/pages/letter-results-page").then(m => ({ default: m.LetterResultsPage })));
const ExplainBackViewPage = lazy(() => import("@/app/pages/explain-back-view-page").then(m => ({ default: m.ExplainBackViewPage })));
const LetterResponseConfirmPage = lazy(() => import("@/app/pages/letter-response-confirm-page").then(m => ({ default: m.LetterResponseConfirmPage })));
const LetterOverviewPage = lazy(() => import("@/app/pages/letter-overview-page").then(m => ({ default: m.LetterOverviewPage })));

// Dev/prototype pages
const TreePage = lazy(() => import("@/app/pages/TreePage").then(m => ({ default: m.TreePage })));
// P955 fast-state harness: machine-owned gate fixtures under /tree/_gate/* (DEV-only, permanent render substrate — not throwaway).
const GateFixtureExample = lazy(() => import("@/app/tree/_gate/example/GateFixture").then(m => ({ default: m.GateFixture })));
const DesignAuditPage = lazy(() => import("@/app/pages/design-audit-page").then(m => ({ default: m.DesignAuditPage })));
const LandingV2 = lazy(() => import("@/app/pages/landing-v2").then(m => ({ default: m.LandingV2 })));
const LandingV3 = lazy(() => import("@/app/pages/landing-v3").then(m => ({ default: m.LandingV3 })));
const LandingV4 = lazy(() => import("@/app/pages/landing-v4").then(m => ({ default: m.LandingV4 })));
const PositionButtonsPrototype = lazy(() => import("@/app/pages/position-buttons-prototype").then(m => ({ default: m.PositionButtonsPrototype })));
const EventsPrototype = lazy(() => import("@/app/prototypes/events").then(m => ({ default: m.EventsPrototype })));
const LoadingDemoPage = lazy(() => import("@/app/pages/loading-demo-page").then(m => ({ default: m.LoadingDemoPage })));
const UspContrastDemo = lazy(() => import("@/app/pages/usp-contrast-demo").then(m => ({ default: m.UspContrastDemo })));
const NotFoundPage = lazy(() => import("@/app/pages/not-found-page").then(m => ({ default: m.NotFoundPage })));
const NotFoundDrift = lazy(() => import("@/app/pages/not-found-page").then(m => ({ default: m.NotFoundDrift })));
const NotFoundGlitch = lazy(() => import("@/app/pages/not-found-page").then(m => ({ default: m.NotFoundGlitch })));
const NotFoundCompass = lazy(() => import("@/app/pages/not-found-page").then(m => ({ default: m.NotFoundCompass })));
const NewLivePrototype = lazy(() => import("@/app/pages/prototypes/new-live-prototype").then(m => ({ default: m.NewLivePrototype })));
const CoachPartnershipPage = lazy(() => import("@/app/pages/coach-partnership-page").then(m => ({ default: m.CoachPartnershipPage })));
const ProgramPage = lazy(() => import("@/app/pages/program-page").then(m => ({ default: m.ProgramPage })));
const OffersPage = lazy(() => import("@/app/pages/offers-page").then(m => ({ default: m.OffersPage })));

/** P555: Redirect on session check (not profile fetch) — eliminates ~300-500ms loader.
 *  Previously waited for profile via useNavAuthState; now uses useAuth() directly.
 *  Supabase caches sessions in localStorage, so sessionChecked resolves in ~10ms. */
function HomeRedirect() {
  const { session, sessionChecked } = useAuth();
  const location = useLocation();
  const state = location.state as { fromLogo?: boolean } | null;

  // While session is resolving (~10ms from localStorage), show loader
  if (!sessionChecked) {
    return (
      <ClarityLandingLayout>
        <ClarityPageLoader />
      </ClarityLandingLayout>
    );
  }

  // Direct URL load → redirect to feed. Logo click (state.fromLogo) → show landing.
  if (session && !state?.fromLogo) {
    return <Navigate to="/feed" replace />;
  }

  // Anonymous → show the founder/program page (the public homepage). Coach landing
  // moved to /coach; old landing kept at /tree/old-landing.
  return (
    <ClarityLandingLayout>
      <LazyRoute>
        <ProgramPage />
      </LazyRoute>
    </ClarityLandingLayout>
  );
}

/** P486: Redirect /chat → /create, forwarding all query params via useSearchParams */
function ChatRedirect() {
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  return <Navigate to={qs ? `/create?${qs}` : '/create'} replace />;
}

/** P660: Redirect /d/:docId → /letters/drafts/:docId */
function DocDetailRedirect() {
  const { docId } = useParams();
  return <Navigate to={`/letters/drafts/${docId}`} replace />;
}

function FeedTagRedirect() {
  const { tag } = useParams();
  return <Navigate to={`/feed?tag=${encodeURIComponent(tag || '')}&sort=oldest&version=latest`} replace />;
}

// P772: resolve shortcodes like /letter/st5 to the latest sealed delivery UUID
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOUNDER_SLUG = "slava";

export function LetterRoute() {
  const { id = "" } = useParams<{ id: string }>();
  const [resolved, setResolved] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const isUUID = UUID_RE.test(id);

  useEffect(() => {
    if (isUUID) return;
    // P856: local aliases first (e.g. /letter/ck) — the RPC matches full doc titles only
    const aliased = letterShortCodes[id.toLowerCase()];
    if (aliased) {
      setResolved(aliased);
      return;
    }
    resolveLetterShortcode(id, FOUNDER_SLUG).then((uuid) => {
      if (uuid) setResolved(uuid);
      else setNotFound(true);
    });
  }, [id, isUUID]);

  if (!isUUID && resolved) return <Navigate to={`/letter/${resolved}`} replace />;
  if (!isUUID && !notFound) return <ClarityPageLoader />;
  return (
    <ClarityLandingLayout compact>
      <LazyRoute><LetterReadingPage /></LazyRoute>
    </ClarityLandingLayout>
  );
}

// Loading fallback for lazy routes
function PageLoader() {
  return <ClarityPageLoader />;
}

// Error boundary for chunk loading failures (after deployments, users with stale cache)

interface ChunkErrorBoundaryState {
  hasError: boolean;
  isChunkError: boolean;
}

class ChunkErrorBoundary extends Component<{ children: ReactNode }, ChunkErrorBoundaryState> {
  state: ChunkErrorBoundaryState = { hasError: false, isChunkError: false };
  private originalError: Error | null = null;

  static getDerivedStateFromError(error: Error): ChunkErrorBoundaryState {
    // Detect chunk loading errors (happen after deployments with stale cache)
    const isChunkError = error.message.includes('Failed to fetch dynamically imported module') ||
                         error.message.includes('Loading chunk') ||
                         error.message.includes('Loading CSS chunk') ||
                         error.message.includes('Importing a module script failed');
    return { hasError: true, isChunkError };
  }

  componentDidCatch(error: Error) {
    // Store original error for re-throwing to preserve stack trace for Sentry
    this.originalError = error;
  }

  render() {
    if (this.state.hasError && this.state.isChunkError) {
      const isDev = import.meta.env.DEV;
      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {isDev ? 'Module load failed' : 'New version available'}
          </h2>
          <p className="text-gray-600 mb-4">
            {isDev
              ? 'A dynamic import failed — check your dev server terminal for errors.'
              : 'Please refresh to get the latest version.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      );
    }
    // Re-throw original error to parent boundary, preserving stack trace for Sentry
    if (this.state.hasError && this.originalError) {
      throw this.originalError;
    }
    return this.props.children;
  }
}

// Helper component for lazy routes with chunk error handling.
// Keyed by pathname so each navigation mounts fresh error + Suspense boundaries —
// allowing the PageLoader fallback to show even inside React Router's startTransition (P938),
// and resetting any chunk-error state so a route error doesn't bleed into the next route.
function LazyRoute({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ChunkErrorBoundary key={pathname}>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </ChunkErrorBoundary>
  );
}

// ErrorFallback renders OUTSIDE Router context (Sentry.ErrorBoundary wraps Router)
// so it cannot use any router hooks like useLocation, useNavigate, etc.
function ErrorFallback() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Something went wrong
        </h1>
        <p className="text-gray-600 mb-6">
          We're sorry, but something unexpected happened. Please try refreshing the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Refresh Page
        </button>
      </div>
    </div>
  );
}

export default function ClarityPledgeApp() {
  return (
    <HelmetProvider>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />} showDialog>
    <Router>
      <ScrollToTop />
      <PwaInstallProvider>
      <AuthProvider>
      <TermsAcceptanceGate>
      <Routes>
        {/* P491: Authenticated users → /feed, anonymous → landing page */}
        <Route
          path="/"
          element={<HomeRedirect />}
        />

        {/* /program → /pricing (the co-founder program offer page). */}
        <Route
          path="/coach"
          element={
            <ClarityLandingLayout>
              <LazyRoute><CoachPartnershipPage /></LazyRoute>
            </ClarityLandingLayout>
          }
        />
        {/* Co-founder program offer page — canonical URL is /program.
            /pricing and /offers redirect here for previously shared links. */}
        <Route
          path="/program"
          element={
            <ClarityLandingLayout>
              <LazyRoute><OffersPage /></LazyRoute>
            </ClarityLandingLayout>
          }
        />
        <Route path="/pricing" element={<Navigate to="/program" replace />} />
        <Route path="/offers" element={<Navigate to="/program" replace />} />

        <Route
          path="/login"
          element={
            <ClarityLandingLayout>
              <LazyRoute><LoginPage /></LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/signup"
          element={
            <ClarityLandingLayout>
              <LazyRoute><SignupPage /></LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/sign-pledge"
          element={
            <ClarityLandingLayout>
              <LazyRoute><SignPledgePage /></LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/sign-pledge/confirm"
          element={
            <ClarityLandingLayout>
              <LazyRoute><PledgeConfirmationPage /></LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P967: /me/calibration must be registered BEFORE /me (sibling, not child)
            so React Router does not mis-match it against /me's flat route. */}
        <Route
          path="/me/calibration"
          element={
            <ClarityLandingLayout>
              <LazyRoute><CalibrationBreakdownPage /></LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/me"
          element={
            <ClarityLandingLayout>
              <LazyRoute><MePage /></LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/sessions"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <MySessionsPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/p/:id/partners"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <ProfileConnectionsPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/p/:id"
          element={
            <ClarityLandingLayout>
              <LazyRoute><ProfilePageV2 /></LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/p/:id/badge"
          element={
            <ClarityLandingLayout>
              <LazyRoute><BadgePage /></LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/p/:id/pledge"
          element={
            <ClarityLandingLayout>
              <LazyRoute><PledgePage /></LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/create"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <CreateStoryPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P422/P466: Clarity Partner Agreement creation routes.
             /new redirects to /new/create so that Playwright's waitForURL
             can distinguish "on the form" from "navigated to result":
             /agreements/new/create has two path segments after /agreements/
             and does NOT match /\/agreements\/[^/]+$/ (unlike /agreements/new).
             All existing links to /agreements/new still work via the redirect. */}
        <Route
          path="/agreements/new"
          element={<Navigate to="/agreements/new/create" replace />}
        />
        {/* ⚠ Coupling: /agreements/new redirects here (see route above).
             If this path is ever renamed, add a redirect from /agreements/new/create
             to the new path — otherwise bookmarked/shared URLs will 404. */}
        <Route
          path="/agreements/new/create"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <CreateAgreementPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P476: Full-screen email confirmation — must come before /agreements/:id to prevent param capture */}
        <Route
          path="/agreements/confirm-email"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <AgreementEmailConfirmationPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/agreements/:id"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <AgreementPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/agreements/:id/accept"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <AcceptAgreementPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P508: Public Partner Agreement Template — no auth required */}
        <Route
          path="/partner-template"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <PartnerTemplatePage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/agreements/:id/declined"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <DeclinedAgreementPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />
        <Route
          path="/blog-subscribed"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <BlogSubscribedPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/story/:id"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <StoryDetailPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P904: async letter explain-back focus page — chromeFree so the FocusHeader
            back button is the first interactive element (no top nav before it). */}
        <Route
          path="/explain-back/:id"
          element={
            <ClarityLandingLayout chromeFree>
              <LazyRoute>
                <ExplainBackViewPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/point/:id"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <PointDetailPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/pledgers"
          element={
            <ClarityLandingLayout>
              <LazyRoute><ClarityPledgersPage /></LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* Short link redirects (claritypledge.com/s/code) */}
        <Route path="/s/:code" element={<LazyRoute><ShortLinkRedirect /></LazyRoute>} />

        {/* Redirect old routes for backwards compatibility */}
        <Route
          path="/clarity-champions"
          element={<Navigate to="/pledgers" replace />}
        />
        <Route
          path="/understanding-champions"
          element={<Navigate to="/pledgers" replace />}
        />

        <Route
          path="/about"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <AboutPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/intro"
          element={
            <ClarityLandingLayout logoOnly>
              <LazyRoute>
                <IntroPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/auth/callback"
          element={
            <ClarityLandingLayout>
              <AuthCallbackPage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/manifesto"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <FullArticlePage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/article"
          element={<Navigate to="/manifesto" replace />}
        />

        <Route
          path="/privacy-policy"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <PrivacyPolicyPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/terms-of-service"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <TermsOfServicePage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/settings"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <SettingsPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P62: Co-create page (public) */}
        <Route
          path="/co-create"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <CollaboratePage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/demo"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <ClarityDemoPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />
        {/* Redirect old route for backwards compatibility */}
        <Route
          path="/clarity-demo"
          element={<Navigate to="/demo" replace />}
        />

        {/* P486: /chat → /create redirect (preserves query params) */}
        <Route path="/chat" element={<ChatRedirect />} />
        <Route path="/clarity-chat" element={<ChatRedirect />} />

        {/* P491: Hashtag Feed — public content discovery by tag */}
        <Route
          path="/feed"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <FeedPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />
        {/* P602: Clean feed URL shortcut — /feed/understanding → /feed?tag=understanding&sort=oldest&version=latest */}
        <Route path="/feed/:tag" element={<FeedTagRedirect />} />

        <Route
          path="/live"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <ClarityLivePage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* Join via link - room code in URL */}
        <Route
          path="/live/:code"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <ClarityLivePage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P660: Letters — single nav item with three tabs */}
        <Route
          path="/letters"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <LettersPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P660: Draft detail (formerly doc detail) */}
        <Route
          path="/letters/drafts/:docId"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <DocDetailPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P660: Legacy redirects */}
        <Route path="/docs" element={<Navigate to="/letters?tab=drafts" replace />} />
        <Route path="/d/:docId" element={<DocDetailRedirect />} />

        {/* P661: Letter composition orchestrator */}
        <Route
          path="/letter/:docId/compose"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <LetterComposePage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P665: Letter preview (chrome-free, non-persisting reading flow) */}
        <Route
          path="/letter/:docId/preview"
          element={
            <ClarityLandingLayout chromeFree>
              <LazyRoute>
                <LetterPreviewPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P700: Letter overview page (author-only cohort view) — must be before /letter/:id */}
        <Route
          path="/letter/:id/overview"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <LetterOverviewPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P699: Letter results page (top menu visible) — must be before /letter/:id */}
        <Route
          path="/letter/:id/results"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <LetterResultsPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* P684: Letter response confirmation (chrome-free) — must be before /letter/:id */}
        <Route
          path="/letter/:letterId/confirm"
          element={
            <ClarityLandingLayout chromeFree>
              <LazyRoute>
                <LetterResponseConfirmPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        {/* Letter reading flow — compact nav (logo + avatar only, no links/CTA) */}
        {/* P772: LetterRoute handles shortcodes like /letter/st5 → resolves to UUID */}
        <Route path="/letter/:id" element={<LetterRoute />} />

        {/* ============================================================
            PROTOTYPES — experimental routes under /tree, DEV-GATED BY DEFAULT.
            Each /tree/* route is wrapped in {import.meta.env.DEV && …}. In prod
            import.meta.env.DEV is false, so the route is never registered
            (unreachable — navigating there falls through to the 404) and its path
            string is stripped from the always-loaded index chunk.
            IMPORTANT: gating controls REACHABILITY, not bundling. The lazy component
            chunk still deploys to dist/assets as dead, never-fetched code — a
            lazy(() => import()) const is not tree-shaken away (see decisions.md:
            "DEV guard only prevents rendering"; only EXPLICIT import removal strips a
            chunk). Accepted here: these are mock-free, secret-free, unreachable in prod.
            Conventions:
              • One prefix: /tree/*. Never invent another (/_proto, /_preview retired).
              • Lazy-import new demos — keeps them out of the main index chunk, though
                the split chunk still ships until the import is explicitly removed.
              • The /tree/404-* variants share the live not-found-page chunk: their
                PATH strings are stripped; the variant code rides the prod 404 chunk.
              • A genuinely prod-reachable route placed here stays ungated on purpose
                and must carry  // PROD-REACHABLE: <reason>  on its route line.
            Self-contained: they do NOT import main app code (api.ts, auth, etc.)
            ============================================================ */}
        {import.meta.env.DEV && <Route path="/tree" element={<LazyRoute><TreePage /></LazyRoute>} />}
        {import.meta.env.DEV && <Route path="/tree/_gate/example" element={<LazyRoute><GateFixtureExample /></LazyRoute>} />}
        {import.meta.env.DEV && <Route path="/tree/design-audit" element={<LazyRoute><DesignAuditPage /></LazyRoute>} />}
        {import.meta.env.DEV && <Route path="/tree/landing-v2" element={<LazyRoute><LandingV2 /></LazyRoute>} />}
        {import.meta.env.DEV && <Route path="/tree/landing-v3" element={<LazyRoute><LandingV3 /></LazyRoute>} />}
        {import.meta.env.DEV && <Route path="/tree/landing-v4" element={<LazyRoute><LandingV4 /></LazyRoute>} />}
        {import.meta.env.DEV && <Route path="/tree/position-buttons" element={<LazyRoute><PositionButtonsPrototype /></LazyRoute>} />}
        {import.meta.env.DEV && <Route path="/tree/loading-demo" element={<LazyRoute><LoadingDemoPage /></LazyRoute>} />}
        {import.meta.env.DEV && <Route path="/tree/usp-contrast" element={<LazyRoute><UspContrastDemo /></LazyRoute>} />}
        {import.meta.env.DEV && <Route path="/tree/new-live" element={<LazyRoute><NewLivePrototype /></LazyRoute>} />}
        {import.meta.env.DEV && <Route path="/tree/old-landing" element={<ClarityLandingLayout><LazyRoute><ClarityPledgeLanding /></LazyRoute></ClarityLandingLayout>} />}
        {import.meta.env.DEV && <Route path="/tree/404-drift" element={<ClarityLandingLayout><LazyRoute><NotFoundDrift /></LazyRoute></ClarityLandingLayout>} />}
        {import.meta.env.DEV && <Route path="/tree/404-glitch" element={<ClarityLandingLayout><LazyRoute><NotFoundGlitch /></LazyRoute></ClarityLandingLayout>} />}
        {import.meta.env.DEV && <Route path="/tree/404-compass" element={<ClarityLandingLayout><LazyRoute><NotFoundCompass /></LazyRoute></ClarityLandingLayout>} />}
        {/* PROD-REACHABLE: /events is a live, nav-linked production feature (events list + RSVP), not a prototype — never dev-gate it. */}
        <Route path="/events/*" element={<ClarityLandingLayout><LazyRoute><EventsPrototype /></LazyRoute></ClarityLandingLayout>} />
        {/* P909: chromeFree — the calendar IS the page; the page's own slim row is the only chrome */}
        <Route path="/cm" element={<ClarityLandingLayout chromeFree><LazyRoute><ChiangMaiPage /></LazyRoute></ClarityLandingLayout>} />

        {/* Catch-all: 404 for unknown routes */}
        <Route path="*" element={<ClarityLandingLayout><LazyRoute><NotFoundPage /></LazyRoute></ClarityLandingLayout>} />
      </Routes>
      </TermsAcceptanceGate>
      </AuthProvider>
      </PwaInstallProvider>
    </Router>
    </Sentry.ErrorBoundary>
    </HelmetProvider>
  );
}
