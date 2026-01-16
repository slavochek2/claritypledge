import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
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

// Isolated prototypes - completely self-contained, no dependencies on main app
const TreePage = lazy(() => import("@/app/pages/TreePage").then(m => ({ default: m.TreePage })));
const PremiumPrototype = lazy(() => import("@/app/prototypes/premium").then(m => ({ default: m.PremiumPrototype })));
const ConvergedPrototype = lazy(() => import("@/app/prototypes/converged").then(m => ({ default: m.ConvergedPrototype })));
const LinkedInLikePrototype = lazy(() => import("@/app/prototypes/linkedin-like").then(m => ({ default: m.LinkedInLikePrototype })));

// Loading fallback for lazy routes
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
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
              <Suspense fallback={<PageLoader />}>
                <AboutPage />
              </Suspense>
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
              <Suspense fallback={<PageLoader />}>
                <FullArticlePage />
              </Suspense>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/article"
          element={
            <ClarityLandingLayout>
              <Suspense fallback={<PageLoader />}>
                <FullArticlePage />
              </Suspense>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/privacy-policy"
          element={
            <ClarityLandingLayout>
              <Suspense fallback={<PageLoader />}>
                <PrivacyPolicyPage />
              </Suspense>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/terms-of-service"
          element={
            <ClarityLandingLayout>
              <Suspense fallback={<PageLoader />}>
                <TermsOfServicePage />
              </Suspense>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/settings"
          element={
            <ClarityLandingLayout>
              <Suspense fallback={<PageLoader />}>
                <SettingsPage />
              </Suspense>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/demo"
          element={
            <ClarityLandingLayout>
              <Suspense fallback={<PageLoader />}>
                <ClarityDemoPage />
              </Suspense>
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
              <Suspense fallback={<PageLoader />}>
                <ClarityChatPage />
              </Suspense>
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
              <Suspense fallback={<PageLoader />}>
                <IdeaFeedPage />
              </Suspense>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/idea/:id"
          element={
            <ClarityLandingLayout>
              <Suspense fallback={<PageLoader />}>
                <IdeaDetailPage />
              </Suspense>
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/live"
          element={
            <ClarityLandingLayout>
              <Suspense fallback={<PageLoader />}>
                <ClarityLivePage />
              </Suspense>
            </ClarityLandingLayout>
          }
        />

        {/* Join via link - room code in URL */}
        <Route
          path="/live/:code"
          element={
            <ClarityLandingLayout>
              <Suspense fallback={<PageLoader />}>
                <ClarityLivePage />
              </Suspense>
            </ClarityLandingLayout>
          }
        />

        {/* ============================================================
            PROTOTYPES - Isolated experimental features under /tree
            These are completely self-contained with their own mock data.
            They do NOT import from main app code (api.ts, auth, etc.)
            ============================================================ */}
        <Route path="/tree" element={<Suspense fallback={<PageLoader />}><TreePage /></Suspense>} />
        <Route path="/prototype/premium/*" element={<Suspense fallback={<PageLoader />}><PremiumPrototype /></Suspense>} />
        <Route path="/prototype/converged/*" element={<Suspense fallback={<PageLoader />}><ConvergedPrototype /></Suspense>} />
        <Route path="/prototype/linkedin-like/*" element={<Suspense fallback={<PageLoader />}><LinkedInLikePrototype /></Suspense>} />
      </Routes>
      </AuthProvider>
    </Router>
    </Sentry.ErrorBoundary>
    </HelmetProvider>
  );
}
