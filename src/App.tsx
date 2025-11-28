import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ClarityLandingLayout } from "@/polymet/layouts/clarity-landing-layout";
import { ClarityPledgeLanding } from "@/polymet/pages/clarity-pledge-landing";
import { ClarityChampionsPage } from "@/polymet/pages/clarity-champions-page";
import { PledgeCardPage } from "@/polymet/pages/pledge-card-page";
import { ProfilePage } from "@/polymet/pages/profile-page";
import { DashboardPage } from "@/polymet/pages/dashboard-page";
import { SettingsPage } from "@/polymet/pages/settings-page";
import { VerifyEmailPage } from "@/polymet/pages/verify-email-page";
import { VerifyEndorsementPage } from "@/polymet/pages/verify-endorsement-page";
import { AuthCallbackPage } from "@/polymet/pages/auth-callback-page";
import { WorkWithSlavaPage } from "@/polymet/pages/work-with-slava-page";
import { DebugPage } from "@/polymet/pages/debug-page";
import { TestDbPage } from "@/polymet/pages/test-db-page";
import { ProfileDiagnosticPage } from "@/polymet/pages/profile-diagnostic-page";
import { FullArticlePage } from "@/polymet/pages/full-article-page";
import { LoginPage } from "@/polymet/pages/login-page";
import { SignPledgePage } from "@/polymet/pages/sign-pledge-page";

export default function ClarityPledgeApp() {
  return (
    <Router>
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
          path="/pledge"
          element={
            <ClarityLandingLayout>
              <PledgeCardPage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ClarityLandingLayout>
              <DashboardPage />
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
          path="/verify/:id"
          element={
            <ClarityLandingLayout>
              <VerifyEmailPage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/verify-endorsement/:profileId/:witnessId"
          element={
            <ClarityLandingLayout>
              <VerifyEndorsementPage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/our-services"
          element={
            <ClarityLandingLayout>
              <WorkWithSlavaPage />
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
          path="/debug"
          element={
            <ClarityLandingLayout>
              <DebugPage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/test-db"
          element={
            <ClarityLandingLayout>
              <TestDbPage />
            </ClarityLandingLayout>
          }
        />

        <Route
          path="/diagnostic"
          element={
            <ClarityLandingLayout>
              <ProfileDiagnosticPage />
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
      </Routes>
    </Router>
  );
}
