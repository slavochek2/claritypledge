/**
 * One context item as the model sees it (split out of mirror-agent.ts, which is over the size limit).
 * Imports nothing at runtime from mirror-agent.ts: the dependency runs one way only.
 */
import { VOICE_LABEL, clarifyCopy, fmtTime } from './mirror-context-fields.ts';

/** One context item as _mirror_begin_job returns it. */
export interface ContextItem {
  who: 'owner' | 'mirror' | 'other';
  name?: string | null;
  body?: string | null;
  at?: string | null;
  attachment?: string | null;
  /** P1576: a voice note; body is its transcript when 'transcript', absent when 'untranscribed'. */
  voice?: 'transcript' | 'untranscribed' | null;
  /** A main-chat thread root's reply count (P1547): shown as "N replies" when the thread is not quoted. */
  replies?: number | null;
  /** `sent_at` (P1619): when the forwarded message was first written. */
  quoted?: { name?: string | null; body?: string | null; sent_at?: string | null } | null;
  /** P1619: this copy is folded: one structured line, its text not sent. */
  folded?: {
    kind?: 'clarify' | 'forward' | string | null;
    from?: string | null;
    in?: string | null;
    original_at?: string | null;
    speakers?: string[] | null;
    lines?: number | null;
    /** Set only when the stored copy is itself clipped: how many lines it kept. */
    lines_kept?: number | null;
  } | null;
  clarify?: {
    /** P1604: a Clarified session thread (a whole transcript): its copy gets the larger cap. */
    session_thread?: boolean | null;
    from?: string | null;
    in?: string | null;
    body?: string | null;
    /** P1619: when the copied message was first written (never the copy time). */
    sent_at?: string | null;
    /** `at` (P1619): when that reply was first written. */
    thread?: Array<{ name?: string | null; body?: string | null; at?: string | null }> | null;
    /** P1547: how many replies the copied thread had (SQL may offer only its newest). */
    thread_total?: number | null;
  } | null;
}

/** Copied threads' true reply counts, kept off the quoted item itself (never sent as a field). */
export const TOTALS = new WeakMap<object, number>();
/** Copies of a session thread: their item cap is the session one. */
export const SESSION_COPIES = new WeakSet<object>();

function sender(item: ContextItem): string {
  if (item.who === 'owner') return 'owner';
  return item.who === 'mirror' ? 'you (the mirror)' : item.name ?? 'someone';
}

function withAtIfKnown(value: string | null | undefined, key: string): Record<string, string> {
  const t = fmtTime(value);
  return t ? { [key]: t } : {};
}

function basics(item: ContextItem): Record<string, unknown> {
  const out: Record<string, unknown> = { from: sender(item), ...withAtIfKnown(item.at, 'at') };
  if (item.body) out.text = item.body;
  if (item.voice) out.voice = VOICE_LABEL[item.voice];
  if (item.attachment) out.attached = item.attachment;
  if (typeof item.replies === 'number' && item.replies > 0) out.thread = `${item.replies} ${item.replies === 1 ? 'reply' : 'replies'}`;
  return out;
}

/** P1619: a folded copy is one structured line. Its text is never sent, even if a body arrived with the row. */
function foldedLine(f: NonNullable<ContextItem['folded']>): Record<string, unknown> {
  return {
    kind: f.kind ?? 'copy',
    // a system root has no author: SQL sends none, and none is invented here
    ...(f.from ? { from: f.from } : {}),
    ...(f.in ? { in: f.in } : {}),
    ...withAtIfKnown(f.original_at, 'original_at'),
    ...(f.speakers?.length ? { speakers: f.speakers.slice(0, 8) } : {}),
    ...(typeof f.lines === 'number' ? { lines: f.lines } : {}),
    ...(typeof f.lines_kept === 'number' ? { lines_kept: f.lines_kept } : {}),
    status: 'not shown',
  };
}

function addClarify(out: Record<string, unknown>, c: NonNullable<ContextItem['clarify']>): void {
  const { copy, total, shown } = clarifyCopy(c);
  out.copied_for_clarify = copy;
  if (total > shown) TOTALS.set(copy, total);
  if (c.session_thread === true) SESSION_COPIES.add(copy);
}

export function clean(item: ContextItem): Record<string, unknown> {
  const out = basics(item);
  if (item.folded) {
    out.copy_set_aside = foldedLine(item.folded);
    return out;
  }
  if (item.quoted?.body) {
    out.forwarded = { from: item.quoted.name ?? 'someone', ...withAtIfKnown(item.quoted.sent_at, 'original_at'), text: item.quoted.body };
  }
  if (item.clarify) addClarify(out, item.clarify);
  return out;
}
