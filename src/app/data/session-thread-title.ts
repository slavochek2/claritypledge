/**
 * @file session-thread-title.ts
 * @description P1604 rule 6: a transcription session's thread is titled by its start, in the READER's time zone.
 * The server cannot know a reader's zone, so it stores the thread root's body as `session|<start ISO UTC>|<part_no>`
 * (system_kind 'outside_rounds') and the client turns that into a title when it maps a message.
 */

import { INCOMPLETE_TITLE_SUFFIX } from '@/app/components/session/capture-copy';
import { viewerShortDate, viewerTime } from '@/lib/viewer-time';

/** [FOUNDER DECISION: copy, proposed] The thread title: "Transcript 3 Nov, 14:05", and ", Part 2" when the session rolled. */
const TITLE_PREFIX = 'Transcript';

export interface SessionRoot {
  startIso: string;
  partNo: number;
  /** Decision 4: someone's audio did not all arrive; the body ends in `|i`. */
  incomplete: boolean;
}

export function parseSessionRoot(body: string | null | undefined): SessionRoot | null {
  if (!body) return null;
  const m = /^session\|([^|]+)\|(\d+)(\|i)?$/.exec(body);
  if (!m) return null;
  const partNo = Number(m[2]);
  return Number.isNaN(Date.parse(m[1])) || partNo < 1 ? null : { startIso: m[1], partNo, incomplete: m[3] === '|i' };
}

export interface TitleOptions {
  locale?: string;
  /** Defaults to the reader's own zone. */
  timeZone?: string;
}

/** P1624: what follows the word in the title: the start, then the part and the incomplete mark when they apply. */
export function sessionRootMeta(root: SessionRoot, opts: TitleOptions = {}): string {
  // the viewer's own locale and zone, the same formatter as the chat header's event time
  const date = viewerShortDate(root.startIso, opts);
  const time = viewerTime(root.startIso, opts);
  return `${date}, ${time}${root.partNo > 1 ? `, Part ${root.partNo}` : ''}${root.incomplete ? ` (${INCOMPLETE_TITLE_SUFFIX})` : ''}`;
}

export function sessionThreadTitle(body: string | null | undefined, opts: TitleOptions = {}): string | null {
  const root = parseSessionRoot(body);
  return root ? `${TITLE_PREFIX} ${sessionRootMeta(root, opts)}` : null;
}

/** The body to SHOW: the title for a session root, every other body unchanged. */
export function displaySystemBody(body: string | null, systemKind: string | null | undefined): string | null {
  if (systemKind !== 'outside_rounds') return body;
  return sessionThreadTitle(body) ?? body;
}
