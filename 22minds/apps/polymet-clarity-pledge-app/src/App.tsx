import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ClarityLandingLayout } from "@/polymet/layouts/clarity-landing-layout";
import { ClarityPledgeLanding } from "@/polymet/pages/clarity-pledge-landing";
import { PledgeCardPage } from "@/polymet/pages/pledge-card-page";
import { ProfilePage } from "@/polymet/pages/profile-page";
import { SignatoriesPage } from "@/polymet/pages/signatories-page";
import { VerifyEmailPage } from "@/polymet/pages/verify-email-page";
import { VerifyEndorsementPage } from "@/polymet/pages/verify-endorsement-page";

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
          path="/pledge"
          element={
            <ClarityLandingLayout>
              <PledgeCardPage />
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
          path="/signatories"
          element={
            <ClarityLandingLayout>
              <SignatoriesPage />
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
      </Routes>
    </Router>
  );
}
