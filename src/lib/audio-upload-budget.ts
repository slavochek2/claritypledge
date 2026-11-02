/**
 * @file audio-upload-budget.ts
 * @description P1596: the limits on saving the room archive, derived from the chunk size rather than guessed.
 *
 *   one chunk  = 30 s of 16 kHz, 16-bit, mono WAV = 16,000 x 2 B x 30 s + 44 B header = 960,044 B
 *   the audio  = 32,000 B/s = 256 kbit/s, so a link at 256 kbit/s sends a chunk in 960,044 / 32,000 = 30.0 s,
 *                exactly as fast as it is recorded (the queue absorbs jitter; below that rate the backlog grows)
 *   one PUT    may run for twice that time (60 s), so 256 kbit/s is never aborted; the old fixed 30 s abort cut
 *                a 256 kbit/s upload off at the last byte, every time
 *   End        waits for the queued bytes at 256 kbit/s, a quarter longer, plus 5 s for the signed-URL round trip
 *   queue      10 chunks = 300 s of audio = 9.6 MB of memory; a chunk shed from a full queue is announced to the person
 */

export const CHUNK_SECONDS = 30;
export const REALTIME_BYTES_PER_SECOND = 32_000;
export const CHUNK_BYTES = REALTIME_BYTES_PER_SECOND * CHUNK_SECONDS + 44;

const PUT_FLOOR_MS = 30_000;
const PUT_SLACK = 2;
const END_FLOOR_MS = 10_000;
const END_CAP_MS = 90_000;
const END_SLACK = 1.25;
const END_ROUND_TRIP_MS = 5_000;

const secondsAtRealtime = (bytes: number) => bytes / REALTIME_BYTES_PER_SECOND;

/** Longest one archive PUT may run before it is aborted and retried. */
export function uploadTimeoutMs(bytes: number): number {
  return Math.max(PUT_FLOOR_MS, Math.ceil(secondsAtRealtime(bytes) * 1000 * PUT_SLACK));
}

/** How long End waits for the queued archive bytes before telling the server the capture ended. */
export function endGraceMs(queuedBytes: number): number {
  if (queuedBytes <= 0) return END_FLOOR_MS;
  const need = Math.ceil(secondsAtRealtime(queuedBytes) * 1000 * END_SLACK) + END_ROUND_TRIP_MS;
  return Math.min(END_CAP_MS, Math.max(END_FLOOR_MS, need));
}

/** The length of one person's saved archive: the chunks before the last are full, the last is as long as its own bytes. */
export function archiveDurationMs(lastChunkNumber: number, lastChunkBytes: number): number {
  const lastMs = Math.max(0, Math.round(((lastChunkBytes - 44) / REALTIME_BYTES_PER_SECOND) * 1000));
  return lastChunkNumber * CHUNK_SECONDS * 1000 + lastMs;
}
