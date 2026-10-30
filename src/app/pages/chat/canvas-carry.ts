/**
 * P1536: the change requests carried into a new version's thread, as the one message a run can apply. Pure, so it is tested directly.
 */
import { CARRY_MAX_CHARS, splitText } from './use-canvas-thread';

/**
 * The carried requests as one message: any request longer than the limit is split first (so no caller can make this drop everything),
 * then the newest pieces that fit go, oldest first. `leftOut`: older pieces did not fit.
 */
export function joinCarried(texts: string[]): { body: string; leftOut: boolean } {
  const pieces = texts.flatMap((t) => (t.length > CARRY_MAX_CHARS ? splitText(t, CARRY_MAX_CHARS) : [t])).filter((t) => t !== '');
  const kept: string[] = [];
  let length = 0;
  for (const t of [...pieces].reverse()) {
    const next = length + t.length + (kept.length ? 2 : 0);
    if (next > CARRY_MAX_CHARS) break;
    kept.unshift(t);
    length = next;
  }
  return { body: kept.join('\n\n'), leftOut: kept.length < pieces.length };
}
