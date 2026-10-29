/**
 * Field builders for one mirror context item (split out of mirror-agent.ts, which is over the size limit).
 */
import type { ContextItem } from './mirror-agent.ts';

/** P1576: how a voice note is named to the model. Its text is the server transcript, never audio. */
export const VOICE_LABEL = {
  transcript: 'voice message, transcribed',
  untranscribed: 'voice message that could not be transcribed',
} as const;

/** A Clarify copy as the model sees it, plus the copied thread's true reply count (kept off the item). */
export function clarifyCopy(c: NonNullable<ContextItem['clarify']>): { copy: Record<string, unknown>; total: number; shown: number } {
  const copy: Record<string, unknown> = {
    from: c.from ?? 'someone',
    in: c.in ?? null,
    text: c.body ?? null,
    ...(c.thread?.length ? { thread: c.thread.map((t) => ({ from: t.name ?? 'someone', text: t.body ?? null })) } : {}),
  };
  const shown = c.thread?.length ?? 0;
  return { copy, total: Math.max(c.thread_total ?? shown, shown), shown };
}
