/**
 * /tree/landing-fable — the dev-only prototype of the builders fable page (P1665, P1667). Since
 * P1671 the layout is live on /builders; this route renders the same component with no analytics,
 * no redirects and a noindex SEO tag, so a dev view never counts as a
 * production one. The change-managers twin is LandingFableChange.tsx.
 */
import { SEO } from "@/app/components/seo";
import { BuildersFable } from "@/app/components/landing/fable/builders-fable";

export function LandingFable() {
  return (
    <BuildersFable
      seo={
        <SEO
          title="Build the Right Thing"
          url="/tree/landing-fable"
          description="Your team agreed on the strategy. Each of your AIs ships 10x faster. In opposing directions. Get your team off the treadmill. Prevent rework before work begins."
          noIndex
        />
      }
    />
  );
}

export default LandingFable;
