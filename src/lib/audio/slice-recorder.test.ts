/**
 * P1236: the pure half of slice-recorder — ring buffer, resampler, WAV encoder.
 *
 * `createSliceRecorder` is NOT covered here and must not be reported as verified: it needs
 * AudioContext, audioWorklet.addModule and a microphone, none of which jsdom has. What IS
 * covered is everything the server later depends on being true of the bytes, and the
 * strongest assertion in the file is the round-trip one at the end — this encoder's output
 * parsed by the ingest function's own parser, so a divergence between the two fails here
 * rather than in production.
 */
import { describe, it, expect } from 'vitest';
import { RingBuffer, encodeWav, resampleTo, TARGET_SAMPLE_RATE } from './slice-recorder';
import { parseWavHeader, validateSliceRequest, MAX_SLICE_DURATION_MS } from '../../../supabase/functions/transcribe-slice/validate';

function ramp(n: number, from = 0): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = from + i;
  return out;
}

describe('RingBuffer', () => {
  it('returns everything written while still under capacity', () => {
    const rb = new RingBuffer(10);
    rb.push(ramp(4));
    expect(Array.from(rb.readLast(10))).toEqual([0, 1, 2, 3]);
    expect(rb.length).toBe(4);
  });

  it('keeps the most recent samples once it has wrapped', () => {
    const rb = new RingBuffer(5);
    rb.push(ramp(8)); // 0..7 — a chunk larger than capacity
    expect(Array.from(rb.readLast(5))).toEqual([3, 4, 5, 6, 7]);
  });

  it('reads across the wrap point in the right ORDER', () => {
    // The failure this catches is a slice that plays back with its two halves swapped:
    // still the right samples, still the right count, and unintelligible to a transcriber.
    const rb = new RingBuffer(5);
    rb.push(ramp(3)); // 0 1 2
    rb.push(ramp(4, 3)); // 3 4 5 6 — wraps
    expect(Array.from(rb.readLast(5))).toEqual([2, 3, 4, 5, 6]);
  });

  it('never returns more than it holds', () => {
    const rb = new RingBuffer(100);
    rb.push(ramp(7));
    expect(rb.readLast(50).length).toBe(7);
  });

  it('holds a steady state across many pushes — memory is not a function of session length', () => {
    const rb = new RingBuffer(16);
    for (let i = 0; i < 500; i++) rb.push(ramp(5, i * 5));
    expect(rb.length).toBe(16);
    const last = rb.readLast(16);
    expect(last[15]).toBe(2499);
    expect(last[0]).toBe(2484);
  });
});

describe('resampleTo', () => {
  it('is a no-op when the rates already match', () => {
    const input = ramp(10);
    expect(resampleTo(input, 16_000, 16_000)).toBe(input);
  });

  it('averages rather than decimating — 48k to 16k takes the mean of each group of 3', () => {
    const input = Float32Array.from([0, 3, 6, 9, 12, 15]);
    expect(Array.from(resampleTo(input, 48_000, 16_000))).toEqual([3, 12]);
  });

  it('a decimator would alias; the box average attenuates instead', () => {
    // Nyquist for 16 kHz output is 8 kHz. A 12 kHz tone sampled at 48 kHz alternates
    // in a pattern a plain "take every 3rd sample" turns into a DC-ish artefact at full
    // amplitude, while the box average largely cancels it.
    const n = 48_000;
    const input = new Float32Array(n);
    for (let i = 0; i < n; i++) input[i] = Math.sin(2 * Math.PI * 12_000 * (i / 48_000));
    const boxed = resampleTo(input, 48_000, 16_000);
    let boxPeak = 0;
    for (const s of boxed) boxPeak = Math.max(boxPeak, Math.abs(s));

    let decPeak = 0;
    for (let i = 0; i < n; i += 3) decPeak = Math.max(decPeak, Math.abs(input[i]));

    expect(boxPeak).toBeLessThan(decPeak);
  });

  it('produces the expected output length for a real slice', () => {
    const fiveSecondsAt48k = new Float32Array(5 * 48_000);
    expect(resampleTo(fiveSecondsAt48k, 48_000, 16_000).length).toBe(5 * 16_000);
  });

  it('leaves audio alone rather than inventing detail when the source rate is lower', () => {
    const input = ramp(10);
    expect(resampleTo(input, 8_000, 16_000)).toBe(input);
  });
});

describe('encodeWav', () => {
  it('writes a header the ingest function can read, with an honest data size', () => {
    const wav = encodeWav(new Float32Array(16_000), TARGET_SAMPLE_RATE);
    const info = parseWavHeader(wav);
    expect(info).not.toBeNull();
    expect(info!.sampleRate).toBe(16_000);
    expect(info!.channels).toBe(1);
    expect(info!.bitsPerSample).toBe(16);
    expect(info!.dataBytes).toBe(32_000);
    expect(info!.durationMs).toBe(1000);
  });

  it('clamps out-of-range floats instead of wrapping them into a click', () => {
    const wav = encodeWav(Float32Array.from([2, -2, 0]), TARGET_SAMPLE_RATE);
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44, true)).toBe(32_767);
    expect(view.getInt16(46, true)).toBe(-32_768);
    expect(view.getInt16(48, true)).toBe(0);
  });

  it('round-trips through the INGEST FUNCTION\'S OWN validator', () => {
    // The load-bearing test in this file. The encoder and the validator are on opposite
    // sides of a network boundary and in different runtimes; asserting the encoder against
    // its own idea of a WAV would prove nothing about whether the server accepts it.
    const fiveSeconds = new Float32Array(5 * TARGET_SAMPLE_RATE);
    const wav = encodeWav(fiveSeconds, TARGET_SAMPLE_RATE);
    let binary = '';
    for (const byte of wav) binary += String.fromCharCode(byte);
    const parsed = validateSliceRequest({
      roomId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      sequence: 0,
      audio: btoa(binary),
    });
    expect('error' in parsed).toBe(false);
    expect((parsed as { kind: string }).kind).toBe('slice');
  });

  it('a full 4s + 1s slice sits inside the server\'s duration bound', () => {
    // If the cadence or the lead-in is ever widened, this is where it stops being
    // acceptable to the ingest function — before it is where a user finds out.
    const slice = new Float32Array(5 * TARGET_SAMPLE_RATE);
    const info = parseWavHeader(encodeWav(slice, TARGET_SAMPLE_RATE))!;
    expect(info.durationMs).toBeLessThanOrEqual(MAX_SLICE_DURATION_MS);
  });
});
