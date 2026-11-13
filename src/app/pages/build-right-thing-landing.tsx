/**
 * Build-the-Right-Thing Landing — P1004, served at /builders (P1392). Since P1671 it renders the
 * fable layout (components/landing/fable/builders-fable.tsx), the same component the dev-only
 * /tree/landing-fable prototype renders; this file owns what only the live page does:
 *
 *   - `landing_page_viewed` (variant "build-right-thing", referrer from the query), once on load;
 *   - `alignment_audit_cta_clicked` on each discovery-call CTA. `location` keeps the value the old
 *     layout sent, the CTA size "hero", for both CTAs, so the funnel's history stays comparable;
 *   - the invite redirects: ?referrer= goes to /sign-pledge, otherwise ?login= goes to /login;
 *   - SEO: indexed, url "/".
 *
 * Hero copy (eyebrow, H1, sub-line) is LOCKED by the P1004 UI Contract and lives verbatim in
 * builders-fable.tsx.
 */
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { BuildersFable } from "@/app/components/landing/fable/builders-fable";
import { BUILDERS_CAST } from "@/app/components/landing/fable/fable-content";
import type { FableTracking } from "@/app/components/landing/fable/fable-tracking";

const TRACKING: FableTracking = {
  cta: () => analytics.track("alignment_audit_cta_clicked", { location: "hero" }),
};

export function BuildRightThingLanding() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    analytics.track("landing_page_viewed", {
      referrer: searchParams.get("referrer") || undefined,
      variant: "build-right-thing",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keeps existing pledge-invite links working (carried over from program-page).
  useEffect(() => {
    if (searchParams.get("referrer")) {
      navigate("/sign-pledge");
    } else if (searchParams.get("login")) {
      navigate("/login");
    }
  }, [searchParams, navigate]);

  return (
    <BuildersFable
      cast={BUILDERS_CAST}
      tracking={TRACKING}
      seo={
        <SEO
          title="Build the Right Thing"
          url="/"
          description="Your team agreed on the strategy. Each of your AIs ships 10x faster. In opposing directions. Get your team off the treadmill. Prevent rework before work begins."
        />
      }
    />
  );
}

export default BuildRightThingLanding;
