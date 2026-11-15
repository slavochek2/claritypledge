/**
 * @file listening-game.ts
 * @description P1685 — the Listening Game screen's words, video address and the standalone switch.
 * The screen is the last one of the principle step in every preparation (see ListeningGameScreen.tsx).
 */
import { publicMediaPosterFor, publicMediaUrl } from '@/lib/public-media';

/** [FOUNDER DECISION: draft copy, pending review] One place to change the words. */
export const LISTENING_GAME_COPY = {
  heading: 'The Listening Game: how to use this in a real conversation',
  rules: [
    'Talk normally, band down.',
    "When it matters: 'Now I want to be the speaker.' Slide your band up.",
    "Both bands up: you're playing.",
    'Done? Bands down, just talk.',
  ],
  playLabel: 'Play the Listening Game video',
  posterAlt: 'The Listening Game role cards with the pause band',
} as const;

/** The switch for standalone and join /prepare. Event preparations read `recipe.prepare.listeningGame`. */
export const STANDALONE_LISTENING_GAME = true;

/** Dev only: the file is not uploaded yet, so the dev server resolves a gitignored folder outside public/
 *  (vite.config.ts, p1685-local-media). The literal sits inside the DEV branch so a build drops it. */
export const listeningGameVideoUrl = () =>
  import.meta.env.DEV ? '/local-media/event-prep/listening-game-v4.mp4' : publicMediaUrl('event-prep/listening-game-v4.mp4');
export const listeningGamePosterUrl = () => publicMediaPosterFor(listeningGameVideoUrl());
