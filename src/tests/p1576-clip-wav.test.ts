/**
 * P1576 Part A: the pure half of the dictation clip encoder. Decoding a MediaRecorder blob needs
 * AudioContext.decodeAudioData, which jsdom does not have, so `blobToWav16k` is NOT covered here
 * and must not be reported as verified. What IS covered is the part the server depends on: the
 * mono mix-down and the WAV that comes out, parsed by the server's own header reader.
 */
import { describe, it, expect } from 'vitest';
import { mixToMono, samplesToWav16k, DICTATION_MAX_MS, DICTATION_AUTO_STOP_MS } from '@/lib/audio/clip-wav';
import { parseWavHeader } from '../../supabase/functions/_shared/gemini-transcribe';
import { MAX_CLIP_DURATION_MS } from '../../supabase/functions/transcribe-clip/handler';

describe('mixToMono', () => {
  it('averages the channels sample by sample', () => {
    const out = mixToMono([Float32Array.from([1, 0, -1]), Float32Array.from([0, 1, -1])]);
    expect(Array.from(out)).toEqual([0.5, 0.5, -1]);
  });

  it('passes a single channel through unchanged', () => {
    const ch = Float32Array.from([0.25, -0.25]);
    expect(Array.from(mixToMono([ch]))).toEqual([0.25, -0.25]);
  });

  it('survives channels of different length by using the shortest', () => {
    expect(mixToMono([new Float32Array(10), new Float32Array(7)]).length).toBe(7);
  });

  it('returns an empty buffer for no channels', () => {
    expect(mixToMono([]).length).toBe(0);
  });
});

describe('samplesToWav16k', () => {
  it('a 48 kHz capture comes out as 16 kHz mono 16-bit that the server parser accepts', () => {
    const wav = samplesToWav16k(new Float32Array(48_000 * 2), 48_000); // 2 s
    expect(parseWavHeader(wav)).toEqual({ sampleRate: 16_000, channels: 1, bitsPerSample: 16, dataBytes: 64_000, durationMs: 2000 });
  });

  it('a clip already at 16 kHz is not resampled', () => {
    expect(parseWavHeader(samplesToWav16k(new Float32Array(16_000), 16_000))?.durationMs).toBe(1000);
  });
});

describe('the client limits agree with the server', () => {
  it('the client cap is the server cap', () => {
    expect(DICTATION_MAX_MS).toBe(MAX_CLIP_DURATION_MS);
  });

  it('auto-stop fires strictly before the server would refuse the clip, with room for encoder drift', () => {
    expect(DICTATION_AUTO_STOP_MS).toBeLessThan(DICTATION_MAX_MS);
    expect(DICTATION_MAX_MS - DICTATION_AUTO_STOP_MS).toBeGreaterThanOrEqual(2000);
  });
});
