/**
 * @file p1576-mirror-reply-state.test.ts
 * @description P1576: requestMirrorReply maps the mirror-reply function's new voice-note answers: 202 {state:'transcribing'}
 * while the transcript is pending, and 409 TRANSCRIPT_FAILED when transcription failed. Existing states are unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { requestMirrorReply } from '@/app/data/mirror-service';

const http = (status: number, body: unknown) => ({ data: null, error: { context: new Response(JSON.stringify(body), { status }) } });

describe('requestMirrorReply', () => {
  beforeEach(() => invoke.mockReset());
  it('202 transcribing -> transcribing', async () => {
    invoke.mockResolvedValue({ data: { state: 'transcribing' }, error: null });
    expect(await requestMirrorReply('m1')).toBe('transcribing');
  });
  it('409 TRANSCRIPT_FAILED -> transcript_failed', async () => {
    invoke.mockResolvedValue(http(409, { state: 'transcript_failed', code: 'TRANSCRIPT_FAILED' }));
    expect(await requestMirrorReply('m1')).toBe('transcript_failed');
    invoke.mockResolvedValue(http(409, { code: 'TRANSCRIPT_FAILED' }));
    expect(await requestMirrorReply('m1')).toBe('transcript_failed');
  });
  it('CONTROL: the existing states still map (done, running, terms 409, 429 capped, unknown failed)', async () => {
    invoke.mockResolvedValue({ data: { state: 'done' }, error: null });
    expect(await requestMirrorReply('m1')).toBe('done');
    invoke.mockResolvedValue({ data: { state: 'running' }, error: null });
    expect(await requestMirrorReply('m1')).toBe('running');
    invoke.mockResolvedValue(http(409, { code: 'TERMS_NOT_ACCEPTED' }));
    expect(await requestMirrorReply('m1')).toBe('terms');
    invoke.mockResolvedValue(http(429, {}));
    expect(await requestMirrorReply('m1')).toBe('capped');
    invoke.mockResolvedValue(http(500, {}));
    expect(await requestMirrorReply('m1')).toBe('failed');
  });
});
