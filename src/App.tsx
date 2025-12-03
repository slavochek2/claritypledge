import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { ClarityPledgeLanding } from "@/app/pages/clarity-pledge-landing";
import { ClarityLandingLayout } from "@/app/layouts/clarity-landing-layout";
import { ClarityChampionsPage } from "@/app/pages/clarity-champions-page";
import { ProfilePage } from "@/app/pages/profile-page";
import { AuthCallbackPage, AuthProvider } from "@/auth";
import { ServicesPage } from "@/app/pages/services-page";
import { FullArticlePage } from "@/app/pages/full-article-page";
import { LoginPage } from "@/app/pages/login-page";
import { SignPledgePage } from "@/app/pages/sign-pledge-page";
import { PrivacyPolicyPage } from "@/app/pages/privacy-policy-page";
import { TermsOfServicePage } from "@/app/pages/terms-of-service-page";
import { SettingsPage } from "@/app/pages/settings-page";

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
    <Sentry.ErrorBoundary fallback={<ErrorFallback />} showDialog>
    <Router>
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
          path="/sign-pledge"
          element={
            <ClarityLandingLayout>
              <SignPledgePage />
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
          path="/clarity-champions"
          element={
            <ClarityLandingLayout>
              <ClarityChampionsPage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/our-services"
          element={
            <ClarityLandingLayout>
              <ServicesPage />
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
              <FullArticlePage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/article"
          element={
            <ClarityLandingLayout>
              <FullArticlePage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/privacy-policy"
          element={
            <ClarityLandingLayout>
              <PrivacyPolicyPage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/terms-of-service"
          element={
            <ClarityLandingLayout>
              <TermsOfServicePage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/settings"
          element={
            <ClarityLandingLayout>
              <SettingsPage />
            </ClarityLandingLayout>
          }
        />
      </Routes>
      </AuthProvider>
    </Router>
    </Sentry.ErrorBoundary>
  );
}
