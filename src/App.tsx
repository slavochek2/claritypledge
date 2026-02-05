import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, Component, ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { HelmetProvider } from "react-helmet-async";
import { ClarityLandingLayout } from "@/app/layouts/clarity-landing-layout";
import { AuthCallbackPage, AuthProvider } from "@/auth";
import { ScrollToTop } from "@/app/components/scroll-to-top";

// Critical path pages - loaded synchronously for fast initial render
import { ClarityPledgeLanding } from "@/app/pages/clarity-pledge-landing";
import { SignPledgePage } from "@/app/pages/sign-pledge-page";
import { PledgeConfirmationPage } from "@/app/pages/pledge-confirmation-page";
import { ProfilePage } from "@/app/pages/profile-page";
import { PledgePage } from "@/app/pages/pledge-page";
import { MePage } from "@/app/pages/me-page";
import { ClarityPledgersPage } from "@/app/pages/clarity-pledgers-page";
import { LoginPage } from "@/app/pages/login-page";
import { SignupPage } from "@/app/pages/signup-page";
import { ShortLinkRedirect } from "@/app/pages/short-link-redirect";

// Lazy loaded pages - split into separate chunks
const AboutPage = lazy(() => import("@/app/pages/about-page").then(m => ({ default: m.AboutPage })));
const FullArticlePage = lazy(() => import("@/app/pages/full-article-page").then(m => ({ default: m.FullArticlePage })));
const PrivacyPolicyPage = lazy(() => import("@/app/pages/privacy-policy-page").then(m => ({ default: m.PrivacyPolicyPage })));
const TermsOfServicePage = lazy(() => import("@/app/pages/terms-of-service-page").then(m => ({ default: m.TermsOfServicePage })));
const SettingsPage = lazy(() => import("@/app/pages/settings-page").then(m => ({ default: m.SettingsPage })));
const ClarityDemoPage = lazy(() => import("@/app/pages/clarity-demo-page").then(m => ({ default: m.ClarityDemoPage })));
const ClarityChatPage = lazy(() => import("@/app/pages/clarity-chat-page").then(m => ({ default: m.ClarityChatPage })));
const IdeaFeedPage = lazy(() => import("@/app/pages/idea-feed-page").then(m => ({ default: m.IdeaFeedPage })));
const IdeaDetailPage = lazy(() => import("@/app/pages/idea-detail-page").then(m => ({ default: m.IdeaDetailPage })));
const ClarityLivePage = lazy(() => import("@/app/pages/clarity-live-page").then(m => ({ default: m.ClarityLivePage })));
const HomePage = lazy(() => import("@/app/pages/home-page").then(m => ({ default: m.HomePage })));
const CollaboratePage = lazy(() => import("@/app/pages/collaborate-page").then(m => ({ default: m.CollaboratePage })));

// Isolated prototypes - completely self-contained, no dependencies on main app
const TreePage = lazy(() => import("@/app/pages/TreePage").then(m => ({ default: m.TreePage })));
const PremiumPrototype = lazy(() => import("@/app/prototypes/premium").then(m => ({ default: m.PremiumPrototype })));
const ConvergedPrototype = lazy(() => import("@/app/prototypes/converged").then(m => ({ default: m.ConvergedPrototype })));
const LinkedInLikePrototype = lazy(() => import("@/app/prototypes/linkedin-like").then(m => ({ default: m.LinkedInLikePrototype })));
const EventsPrototype = lazy(() => import("@/app/prototypes/events").then(m => ({ default: m.EventsPrototype })));
const EventsMockPrototype = lazy(() => import("@/app/prototypes/events-mock").then(m => ({ default: m.EventsMockPrototype })));

// Loading fallback for lazy routes
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
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
                         error.message.includes('Loading CSS chunk');
    return { hasError: true, isChunkError };
  }

  componentDidCatch(error: Error) {
    // Store original error for re-throwing to preserve stack trace for Sentry
    this.originalError = error;
  }

  render() {
    if (this.state.hasError && this.state.isChunkError) {
      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            New version available
          </h2>
          <p className="text-gray-600 mb-4">
            Please refresh to get the latest version.
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

// Helper component for lazy routes with chunk error handling
function LazyRoute({ children }: { children: ReactNode }) {
  return (
    <ChunkErrorBoundary>
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
      <AuthProvider>
      <Routes>
        <Route
          path="/"
          element={
            <ClarityLandingLayout>
              <ClarityPledgeLanding />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/login"
          element={
            <ClarityLandingLayout>
              <LoginPage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/signup"
          element={
            <ClarityLandingLayout>
              <SignupPage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/sign-pledge"
          element={
            <ClarityLandingLayout>
              <SignPledgePage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/sign-pledge/confirm"
          element={
            <ClarityLandingLayout>
              <PledgeConfirmationPage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/me"
          element={
            <ClarityLandingLayout>
              <MePage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/p/:id"
          element={
            <ClarityLandingLayout>
              <ProfilePage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/p/:id/pledge"
          element={
            <ClarityLandingLayout>
              <PledgePage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/pledgers"
          element={
            <ClarityLandingLayout>
              <ClarityPledgersPage />
            </ClarityLandingLayout>
          }
        />

        {/* Short link redirects (claritypledge.com/s/code) */}
        <Route path="/s/:code" element={<ShortLinkRedirect />} />

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

        {/* P62: Dashboard for logged-in users */}
        <Route
          path="/home"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <HomePage />
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

        <Route
          path="/chat"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <ClarityChatPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />
        {/* Redirect old route for backwards compatibility */}
        <Route
          path="/clarity-chat"
          element={<Navigate to="/chat" replace />}
        />

        <Route
          path="/feed"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <IdeaFeedPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/idea/:id"
          element={
            <ClarityLandingLayout>
              <LazyRoute>
                <IdeaDetailPage />
              </LazyRoute>
            </ClarityLandingLayout>
          }
        />

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

        {/* ============================================================
            PROTOTYPES - Isolated experimental features under /tree
            These are completely self-contained with their own mock data.
            They do NOT import from main app code (api.ts, auth, etc.)
            ============================================================ */}
        <Route path="/tree" element={<LazyRoute><TreePage /></LazyRoute>} />
        <Route path="/prototype/premium/*" element={<LazyRoute><PremiumPrototype /></LazyRoute>} />
        <Route path="/prototype/converged/*" element={<LazyRoute><ConvergedPrototype /></LazyRoute>} />
        <Route path="/prototype/linkedin-like/*" element={<LazyRoute><LinkedInLikePrototype /></LazyRoute>} />
        <Route path="/prototype/events-mock/*" element={<LazyRoute><EventsMockPrototype /></LazyRoute>} />
        <Route path="/events/*" element={<ClarityLandingLayout><LazyRoute><EventsPrototype /></LazyRoute></ClarityLandingLayout>} />
      </Routes>
      </AuthProvider>
    </Router>
    </Sentry.ErrorBoundary>
    </HelmetProvider>
  );
}
