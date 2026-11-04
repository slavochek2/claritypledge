/**
 * @file p1608-audio.ts
 * @description P1608: pure audio helpers for the preflight (no browser, no network). The preflight records a few
 * seconds from a throwaway Chromium launched with each person's file flags and must decide "this is that person's
 * file, not silence, not the real microphone, not another person's file". Loudness envelopes compared by Pearson
 * correlation are used because the browser's default audio processing (gain control, noise suppression) changes
 * level but not the shape of speech over time.
 */

export const ENVELOPE_FRAME_S = 0.1;

/** dB RMS per 100 ms frame. */
export function envelopeDb(samples: ArrayLike<number>, sampleRate: number): number[] {
  const n = Math.floor(sampleRate * ENVELOPE_FRAME_S);
  const out: number[] = [];
  for (let i = 0; i + n <= samples.length; i += n) {
    let t = 0;
    for (let j = i; j < i + n; j++) t += samples[j] * samples[j];
    out.push(10 * Math.log10(t / n + 1e-12));
  }
  return out;
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

/** Best Pearson r between two envelopes over lags of up to +-maxLagFrames (capture start latency). */
export function bestCorrelation(captured: number[], reference: number[], maxLagFrames = 20): number {
  let best = -1;
  for (let lag = -maxLagFrames; lag <= maxLagFrames; lag++) {
    const a = lag >= 0 ? captured.slice(lag) : captured;
    const b = lag >= 0 ? reference : reference.slice(-lag);
    best = Math.max(best, pearson(a, b));
  }
  return best;
}

export interface PreflightScore { person: string; own: number; bestOther: number; ok: boolean; reason: string | null }

export const PREFLIGHT_MIN_OWN = 0.6;
export const PREFLIGHT_MIN_MARGIN = 0.2;

/** `captured` is each person's recorded envelope; `references` each person's expected file envelope. */
export function scorePreflight(captured: Record<string, number[]>, references: Record<string, number[]>): PreflightScore[] {
  const names = Object.keys(references);
  return names.map((person) => {
    const own = bestCorrelation(captured[person] ?? [], references[person]);
    const bestOther = Math.max(-1, ...names.filter((n) => n !== person).map((n) => bestCorrelation(captured[person] ?? [], references[n])));
    const reason = own < PREFLIGHT_MIN_OWN
      ? `${person}'s browser did not play ${person}'s file (correlation ${own.toFixed(2)}, need ${PREFLIGHT_MIN_OWN}): silence, the real microphone or the wrong file`
      : own - bestOther < PREFLIGHT_MIN_MARGIN
        ? `${person}'s browser sounds as much like another person's file (${own.toFixed(2)} vs ${bestOther.toFixed(2)})`
        : null;
    return { person, own, bestOther, ok: reason === null, reason };
  });
}

/** Minimal reader for 16-bit mono PCM WAV (what ffmpeg writes here): { samples in [-1,1], sampleRate }. */
export function readWav16(buf: Buffer): { samples: Float32Array; sampleRate: number } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let pos = 12, sampleRate = 0, data: Buffer | null = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4), size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') sampleRate = buf.readUInt32LE(pos + 12);
    if (id === 'data') { data = buf.subarray(pos + 8, Math.min(buf.length, pos + 8 + size)); break; }
    pos += 8 + size + (size % 2);
  }
  if (!data || !sampleRate) throw new Error('WAV has no data or format chunk');
  const samples = new Float32Array(Math.floor(data.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32768;
  return { samples, sampleRate };
}
