/**
 * P1596: the room archive is 30 s of 16 kHz 16-bit mono WAV per chunk. The upload limits are derived from that size,
 * not guessed: a person on about 256 kbit/s (the rate the audio itself needs) must still get every chunk saved.
 *   chunk  = 16,000 samples/s x 2 B x 30 s + 44 B header = 960,044 B
 *   rate   = 256 kbit/s = 32,000 B/s  ->  one chunk takes 960,044 / 32,000 = 30.0 s to send, as long as it is recorded
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHUNK_BYTES, REALTIME_BYTES_PER_SECOND, archiveDurationMs, endGraceMs, uploadTimeoutMs } from '@/lib/audio-upload-budget';

describe('upload budget', () => {
  it('a chunk is 960,044 bytes and the audio needs 32,000 bytes a second', () => {
    expect(CHUNK_BYTES).toBe(960_044);
    expect(REALTIME_BYTES_PER_SECOND).toBe(32_000);
  });

  it('one PUT may run twice as long as the chunk needs at 256 kbit/s (60 s), so a 256 kbit/s link is never aborted', () => {
    const atRealtimeMs = (CHUNK_BYTES / REALTIME_BYTES_PER_SECOND) * 1000;
    expect(atRealtimeMs).toBeCloseTo(30_001, -1);
    expect(uploadTimeoutMs(CHUNK_BYTES)).toBeGreaterThanOrEqual(2 * atRealtimeMs);
  });

  it('a small blob keeps the old 30 s floor', () => {
    expect(uploadTimeoutMs(1_000)).toBe(30_000);
  });

  it('End waits for the bytes still queued at 256 kbit/s plus a quarter and 5 s, never under 10 s, never over 90 s', () => {
    expect(endGraceMs(0)).toBe(10_000);
    expect(endGraceMs(CHUNK_BYTES)).toBeGreaterThanOrEqual(30_001 + 5_000);   // the tail alone
    expect(endGraceMs(2 * CHUNK_BYTES)).toBeGreaterThanOrEqual(60_002 + 5_000);
    expect(endGraceMs(50 * CHUNK_BYTES)).toBe(90_000);
  });

  it('the archive PUT uses it (source pin: the signed upload no longer carries a fixed 30 s abort)', () => {
    const api = readFileSync('src/app/data/api.ts', 'utf8');
    const fn = api.slice(api.indexOf('async function uploadToGCS('), api.indexOf('export async function uploadAudioChunk'));
    expect(fn).toContain('AbortSignal.timeout(uploadTimeoutMs(blob.size))');
    expect(fn).not.toMatch(/30000/);
  });

  it('the saved archive length is the full chunks before the last one plus the last chunk\'s own length, not a whole number of 30 s', () => {
    expect(archiveDurationMs(0, CHUNK_BYTES)).toBe(30_000);                       // one full chunk
    expect(archiveDurationMs(3, 44 + 32_000 * 12)).toBe(3 * 30_000 + 12_000);     // a 12 s tail after three full chunks
    expect(archiveDurationMs(0, 44)).toBe(0);                                     // header only
  });

  it('the archive record uses it (source pin: no chunk count x 30000 any more)', () => {
    const api = readFileSync('src/app/data/api.ts', 'utf8');
    const fn = api.slice(api.indexOf('export async function uploadRoomAudioChunk('), api.indexOf('Uploads an events snapshot'));
    expect(fn).toContain('archiveDurationMs(chunkNumber, chunkBlob.size)');
    expect(fn).not.toMatch(/\* 30000/);
  });
});
