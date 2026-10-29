/**
 * @file clip-wav.ts
 * @description P1576 Part A: turns one dictation recording into the 16 kHz mono 16-bit WAV that
 * transcribe-clip accepts. The recording itself comes from `useAudioRecorder` (MediaRecorder:
 * webm/opus on Chrome and Firefox, mp4/aac on iOS Safari); decoding it here and re-encoding with
 * `encodeWav` is what makes both browsers send the same bytes, and gives the server a header it
 * can bound the duration with.
 *
 * WHAT IS TESTABLE HERE, AND WHAT IS NOT. `mixToMono` and `samplesToWav16k` are pure and are
 * unit-tested. `blobToWav16k` needs `AudioContext.decodeAudioData`, which jsdom does not provide,
 * so it is NOT unit-tested and must not be reported as verified; it needs a real browser.
 */
import { encodeWav, resampleTo, TARGET_SAMPLE_RATE } from './slice-recorder';

/** The hard cap, the same number transcribe-clip enforces by decoded duration. */
export const DICTATION_MAX_MS = 180_000;

/**
 * The recorder stops itself here and sends what it has. Strictly under the cap: MediaRecorder's
 * clock and the decoded sample count drift by a fraction of a second, and a clip that is refused
 * for being 100 ms over would be the worst failure this feature has (a three-minute monologue lost).
 */
export const DICTATION_AUTO_STOP_MS = 175_000;

/** Average of the channels, sample by sample, over the shortest channel. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  const [first] = channels;
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  const length = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] ?? 0;
    out[i] = sum / channels.length;
  }
  return out;
}

/**
 * Mono samples at `sampleRate` to a 16 kHz mono 16-bit WAV. With `maxMs`, anything past it is cut:
 * MediaRecorder's clock and the decoded length drift by a fraction of a second, and the server
 * refuses a clip by its decoded length, so a recording stopped at the limit must not arrive over it.
 */
export function samplesToWav16k(samples: Float32Array, sampleRate: number, maxMs?: number): Uint8Array {
  const at16k = resampleTo(samples, sampleRate, TARGET_SAMPLE_RATE);
  const cap = maxMs === undefined ? at16k.length : Math.floor((maxMs / 1000) * TARGET_SAMPLE_RATE);
  return encodeWav(at16k.length > cap ? at16k.subarray(0, cap) : at16k, TARGET_SAMPLE_RATE);
}

/**
 * Decodes a MediaRecorder blob and re-encodes it as WAV. Throws if the browser cannot decode it
 * (the caller keeps the clip and offers Retry / Discard).
 */
export async function blobToWav16k(blob: Blob, maxMs?: number): Promise<Uint8Array> {
  // The same constructor the support check accepts: older WebKit only has the prefixed one.
  const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Context = g.AudioContext ?? g.webkitAudioContext;
  if (!Context) throw new Error('This browser has no audio decoder');
  let context: AudioContext;
  try {
    context = new Context({ sampleRate: TARGET_SAMPLE_RATE });
  } catch {
    context = new Context();
  }
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const channels: Float32Array[] = [];
    for (let i = 0; i < decoded.numberOfChannels; i++) channels.push(decoded.getChannelData(i));
    return samplesToWav16k(mixToMono(channels), decoded.sampleRate, maxMs);
  } finally {
    void context.close().catch(() => {});
  }
}
