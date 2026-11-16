/**
 * @file listening-game.ts
 * @description P1685 — the Listening Game screen's words, video address and the standalone switch.
 * The game is its own numbered step (`game`, tracked part `listening_game`) right after the principle (ListeningGameScreen.tsx).
 */
import { publicMediaPosterFor, publicMediaUrl } from '@/lib/public-media';

/** Founder-approved wording (D2, spec 2026-11-16; step 3 still to be confirmed against the game). One place to change the words. */
export const LISTENING_GAME_COPY = {
  heading: 'How the Listening Game works',
  intro: 'Each of you holds a card with a sliding band.',
  rules: [
    'Most of the time your band is down. Just talk as you normally would.',
    'When something matters to you and you want to be fully understood, say "Now I want to be the speaker" and slide your band up.',
    'The other person slides theirs up too. Now you\'re playing: they listen and say back what they understood, until you say "yes, that\'s it."',
    'Then you both slide your bands down and talk normally again.',
  ],
  playLabel: 'Play the Listening Game video',
  posterAlt: 'The Listening Game role cards with the pause band',
} as const;

/** The switch for standalone and join /prepare (false removes the step). Event preparations read `recipe.prepare.listeningGame`. */
export const STANDALONE_LISTENING_GAME = true;

/** The join learning steps, one list: the join intro (org-join-part1) and PreparePage's JOIN_LEARNING_STEPS read it. */
export function joinStepsFor(game: boolean): ('story' | 'principle' | 'game' | 'cmp7')[] {
  return game ? ['story', 'principle', 'game', 'cmp7'] : ['story', 'principle', 'cmp7'];
}
export const JOIN_STEPS = joinStepsFor(STANDALONE_LISTENING_GAME);

/** Dev only: the file is not uploaded yet, so the dev server resolves a gitignored folder outside public/
 *  (vite.config.ts, p1685-local-media). The literal sits inside the DEV branch so a build drops it. */
export const listeningGameVideoUrl = () =>
  import.meta.env.DEV ? '/local-media/event-prep/listening-game-v4.mp4' : publicMediaUrl('event-prep/listening-game-v4.mp4');
export const listeningGamePosterUrl = () => publicMediaPosterFor(listeningGameVideoUrl());
