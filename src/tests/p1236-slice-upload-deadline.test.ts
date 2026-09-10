/**
 * P1236 — a slice upload that never settles must not jam live transcription forever.
 *
 * Measured on a physical phone 2026-09-10: a room transcribed two utterances and then
 * stored nothing for 2.5 minutes. The microphone, the WAV assembly and Gemini were each
 * proven healthy in isolation — the slice the app actually put on the wire transcribed
 * correctly when replayed against the API by hand. What had happened is in test 1 below.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSerialSender } from '@/lib/audio/slice-recorder';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(() => vi.useRealTimers());

describe('P1236 — a hung slice upload must not jam the sender', () => {
  it('DOCUMENTS THE BUG: a send that never settles drops every later slice forever', async () => {
    const started: number[] = [];
    const dropped: number[] = [];
    // A send that never settles — exactly what fetch/getSession do on a stalled radio.
    const send = createSerialSender(
      (_wav, seq) => { started.push(seq); return new Promise<void>(() => {}); },
      { maxPending: 3, onDrop: (seq) => dropped.push(seq) },
    );

    for (let i = 0; i < 10; i++) { send(new Uint8Array([i]), i); await flush(); }

    // Serial chaining means only the FIRST ever starts...
    expect(started).toEqual([0]);
    // ...the queue fills to maxPending, and everything after is dropped permanently.
    expect(dropped).toEqual([3, 4, 5, 6, 7, 8, 9]);
    // This is the whole defect: no error, no retry, no recovery path, for the rest of the
    // session. The fix is upstream — postSlicePayload now rejects on a deadline, which
    // turns this case into the one below.
  });

  it('a send that REJECTS (as a deadline makes it) lets the queue drain and recover', async () => {
    const started: number[] = [];
    const dropped: number[] = [];
    const errors: number[] = [];
    const ok: number[] = [];
    let failNext = 3;

    const send = createSerialSender(
      (_wav, seq) => {
        started.push(seq);
        if (failNext-- > 0) return Promise.reject(new Error('timed out after 15000ms'));
        return Promise.resolve();
      },
      {
        maxPending: 3,
        onDrop: (seq) => dropped.push(seq),
        onError: (_e, seq) => errors.push(seq),
        onSuccess: (seq) => ok.push(seq),
      },
    );

    for (let i = 0; i < 6; i++) { send(new Uint8Array([i]), i); await flush(); }
    await flush(); await flush();

    expect(errors).toEqual([0, 1, 2]);       // the deadlined ones surface as errors
    expect(ok).toEqual([3, 4, 5]);           // and the session RECOVERS
    expect(dropped).toEqual([]);             // nothing is silently discarded
  });

  it('onSuccess distinguishes "no attempts" from "attempts that all failed"', async () => {
    const ok: number[] = [];
    const errs: number[] = [];
    const send = createSerialSender(
      (_w, seq) => (seq % 2 === 0 ? Promise.resolve() : Promise.reject(new Error('x'))),
      { onSuccess: (s) => ok.push(s), onError: (_e, s) => errs.push(s) },
    );
    for (let i = 0; i < 4; i++) { send(new Uint8Array(), i); await flush(); }
    await flush();
    expect(ok).toEqual([0, 2]);
    expect(errs).toEqual([1, 3]);
  });
});
