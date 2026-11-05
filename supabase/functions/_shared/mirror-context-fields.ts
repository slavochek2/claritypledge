/**
 * Field builders for one mirror context item (split out of mirror-agent.ts, which is over the size limit).
 */
import type { ContextItem } from './mirror-context-items.ts';

/** P1576: how a voice note is named to the model. Its text is the server transcript, never audio. */
export const VOICE_LABEL = {
  transcript: 'voice message, transcribed',
  untranscribed: 'voice message that could not be transcribed',
} as const;

const SESSION_ROOT = /^session\|([^|]+)\|(\d+)(\|i)?$/;
const TITLE_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });

/**
 * P1604: a transcript session's thread root is stored as `session|<start ISO UTC>|<part>[|i]` and the app turns it into a title in the
 * reader's zone. The model must never read the marker: it gets the same title in UTC (the server cannot know a reader's zone).
 * Any other text is returned as it is.
 */
export function readableSessionBody<T extends string | null | undefined>(body: T): T | string {
  const m = typeof body === 'string' ? SESSION_ROOT.exec(body) : null;
  if (!m || Number.isNaN(Date.parse(m[1]))) return body;
  const parts = TITLE_DATE.formatToParts(new Date(m[1])).reduce<Record<string, string>>((o, p) => ({ ...o, [p.type]: p.value }), {});
  const stamp = `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} UTC`;
  return `Transcript ${stamp}${Number(m[2]) > 1 ? `, Part ${m[2]}` : ''}${m[3] ? ', some audio missing' : ''}`;
}

/** A stored time as UTC to the minute (`2026-11-04T10:03Z`), or undefined when it is missing or unreadable: never guessed, never replaced. */
export function fmtTime(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return undefined;
  return `${new Date(value).toISOString().slice(0, 16)}Z`;
}

/** The root of a session thread is a system post: it has no speaker ("Deleted user" would be false). */
const speaker = (name: string | null | undefined, body: string | null | undefined): string =>
  readableSessionBody(body) !== body ? 'the thread title' : name ?? 'someone';

/** A Clarify copy as the model sees it, plus the copied thread's true reply count (kept off the item). */
export function clarifyCopy(c: NonNullable<ContextItem['clarify']>): { copy: Record<string, unknown>; total: number; shown: number } {
  const copy: Record<string, unknown> = {
    from: speaker(c.from, c.body),
    in: c.in ?? null,
    ...(fmtTime(c.sent_at) ? { original_at: fmtTime(c.sent_at) } : {}),
    text: readableSessionBody(c.body) ?? null,
    ...(c.thread?.length
      ? { thread: c.thread.map((t) => ({ from: speaker(t.name, t.body), ...(fmtTime(t.at) ? { at: fmtTime(t.at) } : {}), text: readableSessionBody(t.body) ?? null })) }
      : {}),
  };
  const shown = c.thread?.length ?? 0;
  return { copy, total: Math.max(c.thread_total ?? shown, shown), shown };
}
