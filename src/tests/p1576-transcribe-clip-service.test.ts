/**
 * P1576 Part A: the client call to transcribe-clip. The status travels out as a typed error so the
 * UI can tell "rate limited" from "Gemini is down", and nothing but the WAV bytes goes in the body.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: () => getSession() } } }));

import { transcribeClip, TranscribeClipError, TRANSCRIBE_CLIP_TIMEOUT_MS } from '@/app/data/transcribe-clip-service';

const WAV = Uint8Array.from([82, 73, 70, 70]);
const realFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-1' } } });
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe('transcribeClip', () => {
  it('POSTs the raw WAV bytes with the user JWT and returns the text', async () => {
    fetchMock.mockResolvedValue(reply(200, { text: 'hello' }));
    await expect(transcribeClip(WAV)).resolves.toBe('hello');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(String(url)).toMatch(/\/functions\/v1\/transcribe-clip$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer jwt-1');
    expect(init.headers['Content-Type']).toBe('audio/wav');
    expect(init.body).toBe(WAV);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('is signed-in only: no session means no request', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(transcribeClip(WAV)).rejects.toMatchObject({ name: 'TranscribeClipError', status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('carries the status and Retry-After out as a typed error', async () => {
    fetchMock.mockResolvedValue(reply(429, { error: 'slow down' }, { 'Retry-After': '42' }));
    const err = await transcribeClip(WAV).catch((e) => e);
    expect(err).toBeInstanceOf(TranscribeClipError);
    expect(err).toMatchObject({ status: 429, retryAfterSeconds: 42, message: 'slow down' });
  });

  it('turns a 502 / 5xx into a retryable error', async () => {
    fetchMock.mockResolvedValue(reply(502, { error: 'Transcription failed' }));
    const err = await transcribeClip(WAV).catch((e) => e);
    expect(err).toMatchObject({ status: 502, retryable: true });
  });

  it('413 and 400 are not retryable: the same clip would fail again', async () => {
    fetchMock.mockResolvedValue(reply(413, { error: 'too long' }));
    expect(await transcribeClip(WAV).catch((e) => e)).toMatchObject({ status: 413, retryable: false });
  });

  it('a network failure is a retryable status-0 error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await transcribeClip(WAV).catch((e) => e)).toMatchObject({ status: 0, retryable: true });
  });

  it('has a deadline, so a silent network cannot spin forever', () => {
    expect(TRANSCRIBE_CLIP_TIMEOUT_MS).toBeGreaterThan(10_000);
    expect(TRANSCRIBE_CLIP_TIMEOUT_MS).toBeLessThanOrEqual(90_000);
  });

  it('a success without a text field is an error, not silence', async () => {
    fetchMock.mockResolvedValue(reply(200, {}));
    expect(await transcribeClip(WAV).catch((e) => e)).toBeInstanceOf(TranscribeClipError);
  });
});
