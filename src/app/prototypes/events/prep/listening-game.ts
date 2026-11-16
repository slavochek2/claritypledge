/**
 * @file listening-game.ts
 * @description P1685 — the Listening Game screen's words, video address and the standalone switch.
 * The game is its own numbered step (`game`, tracked part `listening_game`) right after the story, before the principle (ListeningGameScreen.tsx).
 */
import { publicMediaPosterFor, publicMediaUrl } from '@/lib/public-media';

/** Founder-approved wording (D2; the rules come from the video script). One place to change the words. */
export const LISTENING_GAME_COPY = {
  heading: 'The Listening Game',
  intro: 'What you mean and what the other person hears are often two different things. With one number, this game shows the gap in 3 seconds. And because everyone learns the same game, checking for understanding becomes normal.',
  rulesHeading: 'How it works',
  rules: [
    'Each of you holds a role card with a sliding band. Say "Now I want to be the speaker." Both slide your bands up: game on.',
    'The speaker says one thing. You both rate how well the listener understood, from 0 to 10. The lower number counts.',
    'The listener explains back what they heard, and never argues. To disagree, swap roles first.',
    'When the number is good enough, swap roles, or slide the bands down and talk normally.',
  ],
  playLabel: 'Play the Listening Game video',
  posterAlt: 'The Listening Game role cards with the pause band',
} as const;

/** The switch for standalone and join /prepare (false removes the step). Event preparations read `recipe.prepare.listeningGame`. */
export const STANDALONE_LISTENING_GAME = true;

/** The join learning steps, one list: the join intro (org-join-part1) and PreparePage's JOIN_LEARNING_STEPS read it. */
export function joinStepsFor(game: boolean): ('story' | 'game' | 'principle' | 'cmp7')[] {
  return game ? ['story', 'game', 'principle', 'cmp7'] : ['story', 'principle', 'cmp7'];
}
export const JOIN_STEPS = joinStepsFor(STANDALONE_LISTENING_GAME);

/** Dev only: the file is not uploaded yet, so the dev server resolves a gitignored folder outside public/
 *  (vite.config.ts, p1685-local-media). The literal sits inside the DEV branch so a build drops it. */
export const listeningGameVideoUrl = () =>
  import.meta.env.DEV ? '/local-media/event-prep/listening-game-v4.mp4' : publicMediaUrl('event-prep/listening-game-v4.mp4');
export const listeningGamePosterUrl = () => publicMediaPosterFor(listeningGameVideoUrl());
