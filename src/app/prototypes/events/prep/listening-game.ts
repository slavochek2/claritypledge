/**
 * @file listening-game.ts
 * @description P1685 — the Listening Game screen's words, video address and the standalone switch.
 * The game is its own numbered step (`game`, tracked part `listening_game`) right after the story, before the principle (ListeningGameScreen.tsx).
 */
import { publicMediaPosterFor, publicMediaUrl } from '@/lib/public-media';

/** Founder-approved wording (D2). One place to change the words. */
export const LISTENING_GAME_COPY = {
  heading: 'The Listening Game',
  subtitle: 'What you mean (intended meaning) and what the other person understands (interpreted meaning) often differ, and the gap stays hidden. The Listening Game gives you roles that reveal it in 3 seconds.',
  rolesHeading: 'The roles',
  roles: [
    { name: 'Speaker', text: 'shares anything they like, then asks: "How well do you think you understand me, from 0 to 10?"' },
    { name: 'Listener', text: 'explains back what they heard, without arguing. Their own view waits until they switch roles.' },
    { name: 'Observer', text: 'rings the bell when the listener steps out of their role, or when one person takes most of the speaking time.' },
  ],
  closing: 'When everyone knows the roles, asking "did I get you?" stops being awkward. It\'s just the game.',
  playLabel: 'Play the Listening Game video',
  posterAlt: 'The Listening Game: a speaker, a listener and an observer with a bell at one table',
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
