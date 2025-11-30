import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ClarityLandingLayout } from "@/polymet/layouts/clarity-landing-layout";
import { ClarityPledgeLanding } from "@/polymet/pages/clarity-pledge-landing";
import { ClarityChampionsPage } from "@/polymet/pages/clarity-champions-page";
import { ProfilePage } from "@/polymet/pages/profile-page";
import { AuthCallbackPage } from "@/polymet/pages/auth-callback-page";
import { ServicesPage } from "@/polymet/pages/services-page";
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
    </Router>
  );
}
