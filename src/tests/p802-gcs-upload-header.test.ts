/**
 * P802 Canary — GCS upload PUT must include x-goog-content-length-range header.
 *
 * The Cloud Function signs GCS URLs with x-goog-content-length-range in the
 * signing parameters. If the PUT omits this header GCS returns 403
 * SignatureDoesNotMatch. uploadToGCS() was missing this header since 2026-03-22.
 *
 * Reverting the header addition in uploadToGCS() must make this test fail.
 * Moving the header to a call-site (instead of uploadToGCS) must also fail,
 * because uploadSingleChunk goes through the same uploadToGCS path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
  },
}));

// Import AFTER mocks are registered
import { uploadAudioChunk, uploadSingleChunk } from '@/app/data/api';

const SIGNED_URL = 'https://storage.googleapis.com/claritypledge-ml-training/sessions/TEST00/user_chunk_000.webm?X-Goog-Signature=test';

function makeEdgeFunctionMock() {
  return vi.fn()
    // First call: edge function POST → returns signed URL
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ uploadUrl: SIGNED_URL, filePath: 'sessions/TEST00/user_chunk_000.webm' }),
    })
    // Second call: GCS PUT → success
    .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });
}

describe('P802: uploadToGCS PUT includes x-goog-content-length-range header', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeEdgeFunctionMock());
  });

  it('uploadAudioChunk → PUT includes x-goog-content-length-range: 1,5242880', async () => {
    const testBlob = new Blob(['audio-data'], { type: 'audio/webm' });
    await uploadAudioChunk('TEST00', 'testuser', testBlob, 0, false);

    const fetchMock = vi.mocked(global.fetch);
    // calls[0] = edge function POST, calls[1] = GCS PUT
    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];

    expect(putInit.method).toBe('PUT');
    const headers = putInit.headers as Record<string, string>;
    expect(headers['x-goog-content-length-range']).toBe('1,5242880');
  });

  it('uploadSingleChunk → PUT includes x-goog-content-length-range: 1,5242880', async () => {
    const testBlob = new Blob(['audio-data'], { type: 'audio/webm' });
    await uploadSingleChunk('TEST00', 'testuser', testBlob, 0);

    const fetchMock = vi.mocked(global.fetch);
    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];

    expect(putInit.method).toBe('PUT');
    const headers = putInit.headers as Record<string, string>;
    expect(headers['x-goog-content-length-range']).toBe('1,5242880');
  });
});
