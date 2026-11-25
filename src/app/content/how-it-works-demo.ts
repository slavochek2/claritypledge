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
    { title: "Increase the will", text: "The app gives everyone the knowledge to want this. Where there's friction, our team helps with coaching and training." },
    { title: "Agree on expectations", text: "Before the meeting, each person opts in or out of one promise: to answer honestly how well they understand, from 0 to 10." },
    { title: "Surface high-stakes decisions", text: "The call is transcribed live. Press Clarify, and your Mirror agent drafts the decision as a point everyone takes a position on." },
    { title: "Decrease the friction", text: "Speaker and listener each give a number, revealed together. A gap shows in three seconds; an explain-back bridges it." },
    { title: "Improve the skill", text: "Every explain-back feeds your listening calibration: how well you thought you understood, against what the speaker says." },
  ],
  // Shown only if DEMO_VIDEO is ever unset again.
  placeholder: "Demo coming soon",
  errorLine: "The video could not load. Please try again later.",
} as const;

/**
 * The product demo (v4.8 full cut, 6:26; a shorter cut will replace it later). The video is 16:9 and
 * its poster has no text in its centre, where the play button sits (P1682). Captions are burned in.
 */
export const DEMO_VIDEO: DemoVideo | null = {
  src: publicMediaUrl("demo/product-demo-v4.8-v1.mp4"),
  poster: publicMediaUrl("demo/product-demo-v4.8-poster-v1.jpg"),
  posterAlt: "A video call with five team members, the opening of the ClarityPledge product demo",
  playLabel: "Play the product demo",
  durationSeconds: 386,
};
