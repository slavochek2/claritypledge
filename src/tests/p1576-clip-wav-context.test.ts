/**
 * P1576: blobToWav16k must work on a WebKit that only has `webkitAudioContext`, the same constructor the
 * support check accepts; otherwise a recording is made and then cannot be turned into a WAV.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blobToWav16k } from '@/lib/audio/clip-wav';
import { parseWavHeader } from '../../supabase/functions/_shared/gemini-transcribe';

/** jsdom's Blob has no arrayBuffer(); the decoder only needs that one method. */
const fakeBlob = () => ({ arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Blob;

const g = globalThis as Record<string, unknown>;
const real = { ac: g.AudioContext, wk: g.webkitAudioContext };

function fakeContext(closed: { n: number }) {
  return class {
    decodeAudioData = vi.fn(async () => ({ numberOfChannels: 1, sampleRate: 16_000, getChannelData: () => new Float32Array(16_000) }));
    close = vi.fn(async () => { closed.n++; });
  };
}

afterEach(() => {
  g.AudioContext = real.ac;
  g.webkitAudioContext = real.wk;
});

describe('blobToWav16k and the AudioContext constructor', () => {
  it('uses webkitAudioContext when AudioContext does not exist', async () => {
    const closed = { n: 0 };
    g.AudioContext = undefined;
    g.webkitAudioContext = fakeContext(closed);
    const wav = await blobToWav16k(fakeBlob());
    expect(parseWavHeader(wav)?.durationMs).toBe(1000);
    expect(closed.n, 'the context is closed again').toBe(1);
  });

  it('prefers AudioContext when both exist', async () => {
    const standard = { n: 0 };
    const prefixed = { n: 0 };
    g.AudioContext = fakeContext(standard);
    g.webkitAudioContext = fakeContext(prefixed);
    await blobToWav16k(fakeBlob());
    expect([standard.n, prefixed.n]).toEqual([1, 0]);
  });

  it('a constructor that refuses a sample rate is retried without one, and the context is not leaked', async () => {
    const closed = { n: 0 };
    const Fake = fakeContext(closed);
    g.AudioContext = class extends Fake {
      constructor(opts?: unknown) {
        super();
        if (opts) throw new Error('sampleRate not supported');
      }
    };
    await blobToWav16k(fakeBlob());
    expect(closed.n).toBe(1);
  });

  it('with neither constructor it rejects with a plain error (so the caller keeps the recording)', async () => {
    g.AudioContext = undefined;
    g.webkitAudioContext = undefined;
    await expect(blobToWav16k(fakeBlob())).rejects.toThrow(/audio/i);
  });
});
