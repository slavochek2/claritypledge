/**
 * P1558 — the /change-managers link-preview card. Single source for the page's <SEO> (client)
 * and api/og.ts (what LINE / WhatsApp / LinkedIn crawlers actually read — they do not run JS).
 * Plain TS with no imports so the serverless function can bundle it.
 */
export const CHANGE_MANAGERS_OG = {
  title: "Everyone agreed. Then nothing changed.",
  description:
    "Clarity Pledge helps a team find out whether yes in the meeting meant the same thing to everyone, before the change quietly stalls.",
  image: "https://claritypledge.com/clarity-pledge-icon.png",
} as const;
