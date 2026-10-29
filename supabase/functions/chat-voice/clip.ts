/**
 * P1576 Part B: the one judgement of a stored voice clip, shared by commit (the object just uploaded)
 * and the transcript job (the bytes about to be sent to Gemini). The object can change between the
 * two, so the job asks again instead of trusting the commit's answer.
 *
 * parseWavHeader vouches for the FORMAT. Its dataBytes is clamped to the bytes it was handed (a 1 KB
 * head), so it cannot give the duration of a stored clip; the duration comes from the canonical
 * layout our recorder writes (44-byte header, `data` chunk at 36) compared with the stored size.
 * Anything else is refused, which is stricter than WAV allows and exactly what encodeWav produces.
 */
import { parseWavHeader } from '../_shared/gemini-transcribe.ts';

/** Voice note limit (spec: 2 minutes). Enforced from the stored bytes. */
export const VOICE_MAX_MS = 120_000;
/** 16 kHz mono 16-bit PCM. */
export const SAMPLE_RATE = 16_000;
export const BYTES_PER_SECOND = 32_000;
export const WAV_HEADER_BYTES = 44;
/** Bytes of an object the format check needs to see. */
export const HEAD_BYTES = 1024;

export type ClipCheck = { ok: true; durationMs: number } | { ok: false; reason: 'bad_audio' | 'too_long' };

export function checkStoredClip(stored: { head: Uint8Array; size: number }): ClipCheck {
  const bad: ClipCheck = { ok: false, reason: 'bad_audio' };
  const wav = parseWavHeader(stored.head);
  if (!wav || wav.sampleRate !== SAMPLE_RATE || wav.channels !== 1 || wav.bitsPerSample !== 16) return bad;
  const view = new DataView(stored.head.buffer, stored.head.byteOffset, stored.head.byteLength);
  // The literal canonical layout: a 16-byte fmt chunk (no extension area that could hide a second header)
  // directly followed by the data chunk at offset 36.
  if (view.getUint32(16, true) !== 16 || String.fromCharCode(...stored.head.subarray(36, 40)) !== 'data') return bad;
  const declaredBytes = view.getUint32(40, true);
  // The header must account for exactly the bytes stored. A header claiming 1 s over a 100 s body is
  // a lie the Gemini bill would believe; the PUT's size range bounds the worst case, this removes it.
  if (declaredBytes < 1 || declaredBytes !== stored.size - WAV_HEADER_BYTES) return bad;
  const durationMs = Math.round((declaredBytes / BYTES_PER_SECOND) * 1000);
  if (durationMs > VOICE_MAX_MS) return { ok: false, reason: 'too_long' };
  return { ok: true, durationMs };
}

/** Number of peak bars stored with a voice note (chat_messages.audio_waveform). */
export const WAVEFORM_BARS = 50;

/** The 16-bit little-endian samples of a canonical stored WAV (data starts at byte 44); a trailing odd byte is ignored. */
export function pcmOf(wav: Uint8Array): Int16Array {
  const n = Math.max(0, Math.floor((wav.length - WAV_HEADER_BYTES) / 2));
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(WAV_HEADER_BYTES + i * 2, true);
  return out;
}

/**
 * `n` peak bars (integers 0..100) of 16-bit PCM: the samples are split into `n` equal buckets, each bar is
 * the bucket's peak absolute amplitude, scaled against the loudest bucket of the clip. Silence is all zeros
 * (no division by zero). A clip shorter than `n` samples reuses a sample for neighbouring bars.
 */
export function waveformBars(pcm: Int16Array, n = WAVEFORM_BARS): number[] {
  const bars = new Array<number>(n).fill(0);
  const len = pcm.length;
  if (len === 0) return bars;
  const peaks = new Array<number>(n).fill(0);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const start = Math.min(Math.floor((i * len) / n), len - 1);
    const end = Math.min(Math.max(Math.floor(((i + 1) * len) / n), start + 1), len);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const a = Math.abs(pcm[j]);
      if (a > peak) peak = a;
    }
    peaks[i] = peak;
    if (peak > max) max = peak;
  }
  if (max === 0) return bars;
  for (let i = 0; i < n; i++) bars[i] = Math.round((peaks[i] / max) * 100);
  return bars;
}
