import { GithubIcon, YoutubeIcon, LinkedinIcon, type LucideIcon } from "lucide-react";

// Single source of truth for the brand's external presences.
// Consumed by: the footer Social row (clarity-footer.tsx) and the SEO
// Organization schema `sameAs` array (seo.tsx, entity-linking for search engines).
// Add a new platform (X, Instagram, …) by appending one entry here — never
// hardcode a social URL in a component again.
export interface SocialLink {
  key: string;
  label: string; // footer display label
  url: string;
  icon: LucideIcon;
  inFooter: boolean; // render in the footer Social row
  inSameAs: boolean; // include in Organization schema `sameAs`
}

export const SOCIAL_LINKS: SocialLink[] = [
  {
    key: "youtube",
    label: "YouTube",
    url: "https://www.youtube.com/@ClarityPledge",
    icon: YoutubeIcon,
    inFooter: true,
    inSameAs: true,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    url: "https://www.linkedin.com/company/claritypledge",
    icon: LinkedinIcon,
    inFooter: true,
    inSameAs: true,
  },
  {
    key: "github",
    label: "Open Source (AGPL-3.0)",
    url: "https://github.com/slavochek2/claritypledge",
    icon: GithubIcon,
    inFooter: true,
    inSameAs: false,
  },
];

export const FOOTER_SOCIAL_LINKS = SOCIAL_LINKS.filter((l) => l.inFooter);

// URLs that tell search engines "these profiles are the same entity".
export const SAME_AS_URLS = SOCIAL_LINKS.filter((l) => l.inSameAs).map((l) => l.url);
