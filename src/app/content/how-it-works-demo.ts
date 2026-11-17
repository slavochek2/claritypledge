/**
 * P1704 — content and the demo video constant for the "How it works" section on the six
 * use-case pages (/builders, /change-managers, /hiring, /founder, /hospitals, /coach).
 * Every [FOUNDER DECISION] string below is founder wording, filled in before /ship.
 */

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
  heading: "[FOUNDER DECISION: heading — must name the product]",
  // The founder may add a 4th step; the section renders 3 or 4.
  steps: [
    { title: "[FOUNDER DECISION: step 1 title]", text: "[FOUNDER DECISION: step 1, one line; describe only what is built]" },
    { title: "[FOUNDER DECISION: step 2 title]", text: "[FOUNDER DECISION: step 2, one line; describe only what is built]" },
    { title: "[FOUNDER DECISION: step 3 title]", text: "[FOUNDER DECISION: step 3, one line; describe only what is built]" },
  ],
  // [FOUNDER DECISION: placeholder text — draft]
  placeholder: "Demo coming soon",
  // [FOUNDER DECISION: error line — draft]
  errorLine: "The video could not load. Please try again later.",
} as const;

/**
 * The product demo. Set it with `publicMediaUrl("demo/...")` when the demo is uploaded
 * (playLabel: "Play the product demo"). The video must be 16:9 (the player crops to fill a
 * 16:9 frame) and its poster must have no text in its centre, where the play button sits (P1682).
 * While null, the section shows a placeholder frame and fires no events.
 */
export const DEMO_VIDEO: DemoVideo | null = null;
