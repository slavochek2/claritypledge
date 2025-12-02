import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ClarityLandingLayout } from "@/app/layouts/clarity-landing-layout";
import { ClarityPledgeLanding } from "@/app/pages/clarity-pledge-landing";
import { ClarityChampionsPage } from "@/app/pages/clarity-champions-page";
import { ProfilePage } from "@/app/pages/profile-page";
import { AuthCallbackPage, AuthProvider } from "@/auth";
import { ServicesPage } from "@/app/pages/services-page";
import { FullArticlePage } from "@/app/pages/full-article-page";
import { LoginPage } from "@/app/pages/login-page";
import { SignPledgePage } from "@/app/pages/sign-pledge-page";

export default function ClarityPledgeApp() {
  return (
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
      </Routes>
      </AuthProvider>
    </Router>
  );
}
