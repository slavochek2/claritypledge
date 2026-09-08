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
import { RingBuffer, createSerialSender, encodeWav, resampleTo, TARGET_SAMPLE_RATE } from './slice-recorder';
import { parseWavHeader, validateSliceRequest, MAX_SLICE_DURATION_MS } from '../../../supabase/functions/transcribe-slice/validate';
import { OVERLAP_SECONDS, MAX_WORDS_PER_OVERLAP_SECOND } from '../../../supabase/functions/transcribe-slice/dedup';
import { LEAD_IN_MS, SLICE_INTERVAL_MS } from './slice-recorder';

function ramp(n: number, from = 0): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = from + i;
  return out;
}

describe('the capture cadence and the server\'s de-dup window are one number, in two files', () => {
  it('LEAD_IN_MS matches dedup.ts OVERLAP_SECONDS', () => {
    // The capture side decides how much audio is re-sent; the server side decides how many
    // words it is allowed to strip, and derives that from the same second. They live in
    // different files, in different runtimes, on opposite sides of a network boundary, and
    // nothing else couples them — so widening the lead-in without widening the window would
    // silently start leaving duplicates in the transcript, and narrowing it would start
    // deleting real speech. Neither shows up as a failure anywhere else.
    expect(LEAD_IN_MS / 1000).toBe(OVERLAP_SECONDS);
  });

  it('the strip window stays derived from speech rate, not fitted to the corpus', () => {
    // 3 words/second is conversational English (~2.5-3 w/s), measured against the P1236
    // fixture at 0/2/3/4/6/8 words per overlap second. Bias is deliberately UNDER-strip: a
    // surviving duplicate is visible and harmless, a deleted word is invisible and — since
    // no per-slice audio is retained — unrecoverable.
    expect(MAX_WORDS_PER_OVERLAP_SECOND).toBe(3);
    expect(SLICE_INTERVAL_MS).toBe(4000);
  });
});

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

describe('createSerialSender — one slice in flight at a time', () => {
  /** A send whose resolution the test controls, so overlap is observable. */
  function deferredSender() {
    const started: number[] = [];
    const resolvers: Array<() => void> = [];
    const rejecters: Array<(e: unknown) => void> = [];
    const send = (_wav: Uint8Array, sequence: number) => {
      started.push(sequence);
      return new Promise<void>((resolve, reject) => {
        resolvers.push(resolve);
        rejecters.push(reject);
      });
    };
    return { send, started, resolvers, rejecters };
  }

  const WAV = new Uint8Array(4);
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('does not start slice N+1 until slice N resolves', async () => {
    // The defect this exists to prevent: the server assigns spoken_at at INSERT and reads
    // "previous text" before a ~2s Gemini call. Two overlapping requests from one member
    // land in completion order, not speech order, and both dedupe against the same stale
    // previous. Serialising on the client removes both without new server state.
    const { send, started, resolvers } = deferredSender();
    const enqueue = createSerialSender(send);

    enqueue(WAV, 0);
    enqueue(WAV, 1);
    enqueue(WAV, 2);
    await tick();
    expect(started).toEqual([0]);

    resolvers[0]();
    await tick();
    expect(started).toEqual([0, 1]);

    resolvers[1]();
    await tick();
    expect(started).toEqual([0, 1, 2]);
  });

  it('a failed slice does not stall the ones behind it', async () => {
    // A dropped radio must degrade live text, not end it. If a rejection broke the chain,
    // one bad slice would silence the speaker for the rest of the session.
    const { send, started, rejecters, resolvers } = deferredSender();
    const errors: number[] = [];
    const enqueue = createSerialSender(send, { onError: (_e, seq) => errors.push(seq) });

    enqueue(WAV, 0);
    enqueue(WAV, 1);
    await tick();
    rejecters[0](new Error('offline'));
    await tick();

    expect(errors).toEqual([0]);
    expect(started).toEqual([0, 1]);
    resolvers[1]();
    await tick();
  });

  it('drops rather than growing without bound, and drops the NEWEST', async () => {
    // Evicting the oldest would reorder the queue — re-creating the exact defect this
    // function removes. The archival upload path still carries every second of audio, so a
    // dropped slice costs live text and nothing from the record.
    const { send, started, resolvers } = deferredSender();
    const dropped: number[] = [];
    const enqueue = createSerialSender(send, { maxPending: 2, onDrop: (seq) => dropped.push(seq) });

    enqueue(WAV, 0);
    enqueue(WAV, 1);
    enqueue(WAV, 2);
    enqueue(WAV, 3);
    await tick();

    expect(dropped).toEqual([2, 3]);
    expect(started).toEqual([0]);

    // Draining frees capacity again — the bound is on IN-FLIGHT work, not a lifetime quota.
    resolvers[0]();
    await tick();
    resolvers[1]?.();
    await tick();
    enqueue(WAV, 4);
    await tick();
    expect(started).toContain(4);
  });

  it('preserves send order under the bound', async () => {
    const { send, started, resolvers } = deferredSender();
    const enqueue = createSerialSender(send, { maxPending: 10 });
    for (let i = 0; i < 5; i++) enqueue(WAV, i);
    for (let i = 0; i < 5; i++) { await tick(); resolvers[i]?.(); }
    await tick();
    expect(started).toEqual([0, 1, 2, 3, 4]);
  });
});
