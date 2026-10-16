/**
 * P1506 — the /hospitals link-preview card. Single source for the page's <SEO> (client)
 * and api/og.ts (what LINE / WhatsApp / LinkedIn crawlers actually read — they do not run JS).
 * Plain TS with no imports so the serverless function can bundle it.
 */
export const HOSPITALS_OG = {
  title: "Clarity Pledge for Hospitals",
  description:
    "Reveal gaps in understanding between hospital staff before they become mistakes. Make it normal to ask how well we understand each other.",
  image: "https://claritypledge.com/banners/hospitals-og.png",
} as const;
