/**
 * @file transcript-watch.ts
 * @description P1604: the rooms this person has stopped recording in whose transcript they have not yet been told about. Kept in the
 * browser (a per-viewer convenience: the server derives the state itself) so the toast survives a reload. Every access is guarded:
 * storage can be absent or full, and the toast then simply does not come.
 */
const KEY = 'cp_transcript_watch';
/** A watched room is forgotten after this long whatever happened to it. */
const MAX_AGE_MS = 4 * 3600_000;
export const WATCH_POLL_MS = 15_000;

/** [FOUNDER DECISION: copy, proposed] The toast and its action. */
export const TRANSCRIPT_READY_TOAST = 'Transcript ready';
export const TRANSCRIPT_READY_OPEN = 'Open';

interface Watched { roomId: string; userId: string; at: number }

function readAll(): Watched[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Watched[];
    const now = Date.now();
    return Array.isArray(parsed) ? parsed.filter((w) => typeof w?.roomId === 'string' && typeof w?.userId === 'string' && now - w.at < MAX_AGE_MS) : [];
  } catch {
    return [];
  }
}

function write(list: Watched[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* the toast then does not come */ }
}

/** The rooms THIS person is waiting on. Another account on the same browser neither sees nor loses them. */
export function readWatched(userId: string): Watched[] {
  return readAll().filter((w) => w.userId === userId);
}

/** No signed-in person, nothing to watch. */
export function watchTranscript(roomId: string, userId: string | undefined): void {
  if (!userId) return;
  write([...readAll().filter((w) => !(w.roomId === roomId && w.userId === userId)), { roomId, userId, at: Date.now() }]);
}

export function forgetTranscript(roomId: string, userId: string): void {
  write(readAll().filter((w) => !(w.roomId === roomId && w.userId === userId)));
}
