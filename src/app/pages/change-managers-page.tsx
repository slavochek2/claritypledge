/**
 * /change-managers — P1558. Use-case page for people leading a change (AI rollout, digital
 * transformation, reorganisation). Noindex, listed first in the Use cases menu; /change-leads
 * redirects here.
 *
 * Since P1671 it renders the fable layout (components/landing/fable/change-fable.tsx), the same
 * component the dev-only /tree/landing-fable-change prototype renders. This file owns what only
 * the live page does: `landing_page_viewed` (variant "change-managers") on load,
 * `change_managers_cta_clicked` with the CTA's location ("hero" | "closing"),
 * `change_managers_pledge_clicked` on the hero pledge link, the exchange's own view event
 * (TEAM_CAST), and the noindex SEO with its OG card.
 */
import { useEffect } from "react";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { CHANGE_MANAGERS_OG } from "@/app/content/change-managers-og";
import { TEAM_CAST } from "@/app/content/exchange-casts";
import { ChangeFable } from "@/app/components/landing/fable/change-fable";
import type { FableTracking } from "@/app/components/landing/fable/fable-tracking";

const TRACKING: FableTracking = {
  cta: (location) => analytics.track("change_managers_cta_clicked", { location }),
  pledge: () => analytics.track("change_managers_pledge_clicked"),
};

export function ChangeManagersPage() {
  useEffect(() => {
    analytics.track("landing_page_viewed", { variant: "change-managers" });
  }, []);

  return (
    <ChangeFable
      cast={TEAM_CAST}
      tracking={TRACKING}
      seo={<SEO title={CHANGE_MANAGERS_OG.title} description={CHANGE_MANAGERS_OG.description} url="/change-managers" image={CHANGE_MANAGERS_OG.image} noIndex />}
    />
  );
}

export default ChangeManagersPage;
