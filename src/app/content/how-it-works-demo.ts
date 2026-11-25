/**
 * P1704 — content and the demo video constant for the "How it works" section on the six
 * use-case pages (/builders, /change-managers, /hiring, /founder, /hospitals, /coach).
 * Wording approved by the founder 2026-11-25, taken from the demo film.
 */

import { publicMediaUrl } from "@/lib/public-media";

/** The page that shows the section; becomes the `location` of demo_video_seen / demo_video_play. */
export type UseCaseLocation = "builders" | "change-managers" | "hiring" | "founder" | "hospitals" | "coach";

export interface DemoVideo {
  src: string;
  poster: string;
  posterAlt: string;
  playLabel: string;
  captions?: string;
  durationSeconds?: number;
}

export const HOW_IT_WORKS = {
  heading: "How ClarityPledge works",
  // The five steps are the demo film's own (v4.8 step bar), worded from its narration, so the page and the film say the same thing.
  steps: [
    { title: "Increase the will", text: "Learn why gaps happen. We coach where it's hard." },
    { title: "Agree on expectations", text: "Everyone opts in to answer one question honestly." },
    { title: "Surface high-stakes decisions", text: "One press turns a decision into a point." },
    { title: "Decrease the friction", text: "Two numbers reveal a gap in three seconds." },
    { title: "Improve the skill", text: "Each explain-back shows how well you listened." },
  ],
  errorLine: "The video could not load. Please try again later.",
} as const;

/**
 * The product demo (v4.8 full cut, 6:26; a shorter cut will replace it later), set in a product
 * team's kickoff. The video is 16:9 and its poster has no text in its centre, where the play button
 * sits (P1682). Captions are burned in.
 */
export const DEMO_VIDEO: DemoVideo | null = {
  src: publicMediaUrl("demo/product-demo-v4.8-v1.mp4"),
  poster: publicMediaUrl("demo/product-demo-v4.8-poster-v1.jpg"),
  posterAlt: "A video call with five team members, the opening of the ClarityPledge product demo",
  playLabel: "Play the product demo",
  durationSeconds: 386,
};

/**
 * Which film each page shows. Each page is meant to get its own film (same five steps, its own
 * people and meeting); until it exists, a page shows the shared demo, or no film (null) where the
 * shared demo's setting would put its visitors off. /hospitals: clinical staff, not a software team.
 */
export const DEMO_BY_PAGE: Record<UseCaseLocation, DemoVideo | null> = {
  builders: DEMO_VIDEO,
  "change-managers": DEMO_VIDEO,
  hiring: DEMO_VIDEO,
  founder: DEMO_VIDEO,
  coach: DEMO_VIDEO,
  hospitals: null,
};
