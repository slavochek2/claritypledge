/** P1596: the room archive is cut from the PCM tap into self-contained WAV chunks; no MediaRecorder, no requestData. */
import { describe, it, expect } from 'vitest';
import { ArchiveChunker } from './slice-recorder';
import { parseWavHeader } from '../../../supabase/functions/transcribe-slice/validate';

const RATE = 48_000;
const block = (n: number, v = 0.1) => new Float32Array(n).fill(v);

function collect(chunkMs = 30_000) {
  const out: Uint8Array[] = [];
  return { out, chunker: new ArchiveChunker(RATE, chunkMs, (w) => out.push(w)) };
}

describe('ArchiveChunker', () => {
  it('emits a complete 16 kHz mono WAV every 30 s of samples, driven only by pushed audio (no timer, no requestData)', () => {
    const { out, chunker } = collect();
    for (let i = 0; i < 65 * 46; i++) chunker.push(block(1024));
    const total = (65 * 46 * 1024) / RATE;
    expect(out.length).toBe(Math.floor(total / 30));
    for (const wav of out) {
      const h = parseWavHeader(wav);
      expect(h).toMatchObject({ sampleRate: 16_000, channels: 1, bitsPerSample: 16 });
      expect(Math.abs(wav.length - (44 + 30 * 16_000 * 2))).toBeLessThanOrEqual(2); // about 960 KB
    }
  });

  it('every chunk carries its own header, so each can be decoded alone', () => {
    const { out, chunker } = collect(1_000);
    chunker.push(block(RATE * 3));
    expect(out).toHaveLength(3);
    for (const wav of out) expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
  });

  it('splits a block that straddles a chunk boundary without losing or repeating a sample', () => {
    const { out, chunker } = collect(1_000);
    const ramp = new Float32Array(RATE * 2).map((_, i) => (i % 1000) / 2000);
    chunker.push(ramp.subarray(0, 30_000));
    chunker.push(ramp.subarray(30_000));
    expect(out).toHaveLength(2);
    const total = out.reduce((n, w) => n + (w.length - 44) / 2, 0);
    expect(total).toBe(32_000);
  });

  it('flush emits the unfinished tail once, drops a tail below the minimum, and empties the buffer', () => {
    const a = collect(30_000);
    a.chunker.push(block(RATE * 5));
    a.chunker.flush(250);
    expect(a.out).toHaveLength(1);
    expect((a.out[0].length - 44) / 2).toBe(5 * 16_000);
    a.chunker.flush(250);
    expect(a.out).toHaveLength(1);

    const b = collect(30_000);
    b.chunker.push(block(RATE / 10));
    b.chunker.flush(250);
    expect(b.out).toHaveLength(0);
  });
});
