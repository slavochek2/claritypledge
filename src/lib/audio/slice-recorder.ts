/**
 * @file slice-recorder.ts
 * @description P1236 Decision 1: turns one `MediaStream` into a series of 5-second
 * 16 kHz mono 16-bit WAV slices, emitted every 4 seconds.
 *
 * Each slice carries **1 second of lead-in overlap**: slice N re-sends the last second of
 * audio that slice N-1 already contained. That is not redundancy for its own sake —
 * Finding 8 measured a clean 4-second cut destroying the word straddling the boundary
 * ("doesn't" came back as "that"). The overlap recovers it, at the cost of duplicating
 * ~23 words across the corpus, which the server de-duplicates
 * (`supabase/functions/transcribe-slice/dedup.ts`).
 *
 * WHAT IS TESTABLE HERE, AND WHAT IS NOT. `RingBuffer`, `resampleTo` and `encodeWav` are
 * pure and are unit-tested in `slice-recorder.test.ts`. `createSliceRecorder` touches
 * `AudioContext`, `audioWorklet.addModule` and a real microphone stream — none of which
 * jsdom provides — so it is NOT unit-tested and must not be reported as verified. Its
 * shape is the one measured on the physical Galaxy S22 in Stage A
 * (`scripts/p1236-stagea-probe/`), where the tap held exactly 48000 frames/second with a
 * `MediaRecorder` attached to the same stream.
 */

/** The format `audio.py` already decodes to before Whisper, and what `validate.ts` on the
 *  ingest side accepts — exact match, not a minimum. */
export const TARGET_SAMPLE_RATE = 16_000;

/** Decision 1: a slice every 4 s, each carrying 1 s of lead-in, so a steady-state slice is
 *  5 s. Kept in sync with `dedup.ts`'s OVERLAP_SECONDS, which converts the same second
 *  into the token window it is allowed to strip. */
export const SLICE_INTERVAL_MS = 4_000;
export const LEAD_IN_MS = 1_000;

/** Headroom over one slice, so a late timer tick does not read past the write pointer and
 *  silently lose the oldest part of the slice it is assembling. */
const BUFFER_SECONDS = (SLICE_INTERVAL_MS + LEAD_IN_MS) / 1000 + 1;

/**
 * A fixed-capacity circular sample buffer.
 *
 * Fixed capacity is the point: a growing array would make memory a function of session
 * length, and this runs for up to three hours on a phone. Nothing older than
 * BUFFER_SECONDS is recoverable, which is exactly the retention this design wants — the
 * slice that was sent is the only copy that leaves.
 */
export class RingBuffer {
  private readonly data: Float32Array;
  /** Total samples ever written. Beyond `capacity` the oldest are already overwritten. */
  private written = 0;

  constructor(readonly capacity: number) {
    this.data = new Float32Array(capacity);
  }

  get length(): number {
    return Math.min(this.written, this.capacity);
  }

  push(chunk: Float32Array): void {
    if (chunk.length >= this.capacity) {
      // A chunk larger than the whole buffer can only mean the tail of it survives, and
      // it is written at offset 0 — so the write pointer must be REALIGNED to 0 rather
      // than advanced by the chunk length. Advancing it leaves `written % capacity`
      // pointing into the middle of data that was laid down from the start, and readLast
      // then unwraps from the wrong place: the right samples, the right count, and the two
      // halves of the slice swapped. Silent, and unintelligible to a transcriber.
      this.data.set(chunk.subarray(chunk.length - this.capacity));
      this.written = Math.max(this.capacity, Math.ceil((this.written + chunk.length) / this.capacity) * this.capacity);
      return;
    }
    const start = this.written % this.capacity;
    const firstRun = Math.min(chunk.length, this.capacity - start);
    this.data.set(chunk.subarray(0, firstRun), start);
    if (firstRun < chunk.length) this.data.set(chunk.subarray(firstRun), 0);
    this.written += chunk.length;
  }

  /** The most recent `count` samples in order, or everything held if fewer exist. */
  readLast(count: number): Float32Array {
    const available = Math.min(count, this.length);
    const out = new Float32Array(available);
    const end = this.written % this.capacity;
    const start = ((end - available) % this.capacity + this.capacity) % this.capacity;
    if (start + available <= this.capacity) {
      out.set(this.data.subarray(start, start + available));
    } else {
      const firstRun = this.capacity - start;
      out.set(this.data.subarray(start, this.capacity), 0);
      out.set(this.data.subarray(0, available - firstRun), firstRun);
    }
    return out;
  }
}

/**
 * Downsamples by averaging every source sample that falls inside an output sample's window.
 *
 * Box averaging, not decimation. Dropping every third sample of 48 kHz audio folds
 * everything above 8 kHz back down into the speech band as alias noise — audible as a
 * metallic rasp, and fed to a transcriber as if it were speech. The box average is a crude
 * low-pass; it is not a windowed-sinc, and it does not need to be, because the browser
 * resamples for us whenever `AudioContext({ sampleRate })` is honoured and this path only
 * runs when it is not.
 *
 * Upsampling is not attempted: a capture rate below 16 kHz cannot be made into 16 kHz audio,
 * only into 16 kHz-shaped audio, and the honest response is to send what we have.
 */
export function resampleTo(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || fromRate <= 0 || toRate <= 0) return samples;
  if (fromRate < toRate) return samples;
  const ratio = fromRate / toRate;
  const outLength = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/**
 * Canonical 44-byte-header PCM WAV, mono 16-bit.
 *
 * `validate.ts` on the ingest side derives the slice's DURATION from this header and
 * refuses anything over 8 seconds, because P1237 RQ5 measured Gemini accepting over-long
 * audio, billing it in full and silently returning only the opening five minutes. So the
 * header is not decoration: it is the declaration the server checks. Keep the data-chunk
 * size honest.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const put = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };

  put(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate: 1 channel * 16 bit
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  put(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling: a float outside [-1, 1] (possible after gain or resampling
    // overshoot) would wrap around the int16 range and become a loud click.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return bytes;
}

/**
 * Serializes slice uploads, so slice N+1 is never in flight while slice N still is.
 *
 * **Why this is not over-engineering.** The server assigns `spoken_at` at INSERT time and
 * de-duplicates against "this member's most recent row", read BEFORE a ~2 s Gemini call and
 * written after it — a read-modify-write window with no lock across it. Two overlapping
 * requests from the same member therefore (a) land in processing-completion order rather
 * than speech order, so the transcript renders out of order, and (b) both dedupe against
 * the same stale "previous", so the overlap survives.
 *
 * And overlap is not hypothetical. This spec's own measurement is p95 2.20-2.75 s, worst
 * 3.70 s per slice against a 4 s cadence — and it says in the same table that the figure
 * **excludes upload, queueing and render**. Add ~213 KB of base64 over a phone radio and
 * the worst case crosses the cadence.
 *
 * Serializing on the client is the fix that needs no new server state and no lock: if only
 * one request is ever in flight per member, "previous" is always genuinely previous and
 * completion order is capture order. Audio is not delayed by it — the WAV is encoded on the
 * cadence tick, from the ring buffer, and only its SEND waits.
 *
 * `maxPending` bounds the queue so a dead radio drops slices instead of growing without
 * limit on a phone. Dropping is a real loss of live text, and it is the right trade: the
 * archival upload path still carries every second of the audio, so the record is intact
 * and only the live view degrades.
 */
export function createSerialSender(
  send: (wav: Uint8Array, sequence: number) => Promise<void>,
  options: {
    maxPending?: number;
    onError?: (err: unknown, sequence: number) => void;
    onDrop?: (sequence: number) => void;
    /** A slice reached the server and was accepted. Used to clear a stall indicator —
     *  without it, "no successes" and "no attempts" are indistinguishable to the caller,
     *  which is precisely how a jammed queue stayed invisible for a day (P1236). */
    onSuccess?: (sequence: number) => void;
  } = {},
): (wav: Uint8Array, sequence: number) => void {
  const maxPending = options.maxPending ?? 3;
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;

  return (wav, sequence) => {
    if (pending >= maxPending) {
      // Drop the NEWEST rather than evicting the oldest: the queue is already ordered, and
      // reordering it here would re-create the exact defect this function exists to remove.
      options.onDrop?.(sequence);
      return;
    }
    pending++;
    tail = tail
      .then(() => send(wav, sequence))
      .then(() => { options.onSuccess?.(sequence); })
      .catch((err) => { options.onError?.(err, sequence); })
      .finally(() => { pending--; });
  };
}

export interface SliceRecorderOptions {
  /** Called with one encoded WAV per cadence tick. Sequence starts at 0 and only grows. */
  onSlice: (wav: Uint8Array, sequence: number) => void;
  /** Non-fatal problems (a failed worklet load, a dropped context). */
  onError?: (err: unknown) => void;
  /** Overridable for tests and for a future cadence change. */
  intervalMs?: number;
  leadInMs?: number;
}

export interface SliceRecorder {
  stop: () => void;
}

/**
 * Attaches a PCM tap to `stream` and starts emitting slices.
 *
 * Does NOT own the stream: the caller keeps it, because Decision 7 tees the same
 * `MediaStream` into a `MediaRecorder` for the archival path. Stopping this recorder must
 * therefore never stop the tracks — that would silently kill the recording too, which is
 * the exact coupling this feature exists to remove.
 */
export async function createSliceRecorder(
  stream: MediaStream,
  options: SliceRecorderOptions,
): Promise<SliceRecorder> {
  const intervalMs = options.intervalMs ?? SLICE_INTERVAL_MS;
  const leadInMs = options.leadInMs ?? LEAD_IN_MS;

  // Ask for 16 kHz directly so the browser's own resampler does the work. When the request
  // is not honoured the context reports its real rate and `resampleTo` covers the gap —
  // both paths produce a 16 kHz WAV, and the one taken is visible in ctx.sampleRate.
  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  } catch {
    context = new AudioContext();
  }
  // Autoplay policy can hand back a suspended context even after a user gesture.
  if (context.state === 'suspended') await context.resume();

  try {
    await context.audioWorklet.addModule('/audio/pcm-tap-worklet.js');
  } catch (err) {
    // The worklet is fetched, not bundled, so this fails on a bad deploy or an offline
    // first load. Close the context before rethrowing: the caller's catch only sets a UI
    // message, and an abandoned AudioContext holds an audio hardware handle open for the
    // life of the page.
    await context.close().catch(() => {});
    throw err;
  }

  const captureRate = context.sampleRate;
  const ring = new RingBuffer(Math.ceil(BUFFER_SECONDS * captureRate));

  const source = context.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(context, 'pcm-tap');
  tap.port.onmessage = (event: MessageEvent<Float32Array>) => ring.push(event.data);
  source.connect(tap);
  // Deliberately NOT connected to context.destination: routing the microphone to the
  // speakers is feedback, not monitoring. An AudioWorkletNode pulls input without a
  // downstream connection, so the tap runs regardless.

  let sequence = 0;
  const timer = setInterval(() => {
    try {
      const wantSeconds = (intervalMs + leadInMs) / 1000;
      const raw = ring.readLast(Math.ceil(wantSeconds * captureRate));
      // Slice 0 has no lead-in to take — nothing preceded it — so it is one interval long,
      // and every slice after it is interval + lead-in. The server does not care: it
      // de-duplicates against text, not against a declared overlap.
      if (raw.length === 0) return;
      const at16k = resampleTo(raw, captureRate, TARGET_SAMPLE_RATE);
      options.onSlice(encodeWav(at16k, TARGET_SAMPLE_RATE), sequence++);
    } catch (err) {
      options.onError?.(err);
    }
  }, intervalMs);

  return {
    stop: () => {
      clearInterval(timer);
      tap.port.onmessage = null;
      try {
        source.disconnect();
        tap.disconnect();
      } catch { /* already torn down */ }
      // The stream's tracks are the caller's; see the note above.
      void context.close();
    },
  };
}
