/**
 * /tree/landing-fable-change — the dev-only prototype of the change-managers fable page (P1667).
 * Since P1671 the layout is live on /change-managers; this route renders the same component with
 * no analytics, a noindex SEO tag and the prototype exchange cast. The builders twin is LandingFable.tsx.
 */
import { SEO } from "@/app/components/seo";
import { ChangeFable } from "@/app/components/landing/fable/change-fable";
import { FABLE_CAST } from "@/app/components/landing/fable/fable-content";
import { CHANGE_MANAGERS_OG } from "@/app/content/change-managers-og";

export function LandingFableChange() {
  return (
    <ChangeFable
      cast={FABLE_CAST}
      seo={<SEO title={CHANGE_MANAGERS_OG.title} description={CHANGE_MANAGERS_OG.description} url="/tree/landing-fable-change" noIndex />}
    />
  );
}
