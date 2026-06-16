/**
 * Offers Page — P937 (public, /offers).
 *
 * A thin, shareable pricing surface: a single URL ("claritypledge.com/offers") to
 * drop in the webinar chat / a DM / an email, and the home for the program buy-link.
 * Body is the shared <OffersSection variant="full" /> — the SAME component rendered
 * compact on the landing, so prices/copy live in one place. Wrapped in
 * ClarityLandingLayout at the route (App.tsx), like the program/coach pages.
 */
import { SEO } from "@/app/components/seo";
import { OffersSection } from "@/app/components/landing/offers-section";

export function OffersPage() {
  return (
    <div className="bg-background text-foreground">
      <SEO
        title="Pricing — Clarity Pledge"
        url="/offers"
        description="The app is free forever. The coached Co-Founder Program is €1,000 per pair. Transparent, per-pair pricing with a full money-back guarantee."
      />
      <div className="pt-24 pb-20 lg:pt-28 lg:pb-28">
        <OffersSection variant="full" />
      </div>
    </div>
  );
}

export default OffersPage;
