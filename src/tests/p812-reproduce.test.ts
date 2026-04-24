/**
 * @file p812-reproduce.test.ts
 * @description Canary for P812 — the GCP Cloud Function signing ml-training
 * URLs does NOT include `x-goog-content-length-range` in its canonical request.
 * The P802 client-side fix added that header to every PUT, which GCS rejects
 * as `MalformedSecurityHeader`. The fix is to remove the header from the
 * client PUT.
 *
 * This canary is source-read, not a runtime assertion:
 *   - runtime assertions would require standing up a mock GCS endpoint or
 *     hitting real prod, both of which are heavier than reading the one line
 *     of source that is load-bearing.
 *   - the probes `scripts/probe-gcs-upload.mjs` and
 *     `scripts/probe-gcs-upload-no-header.mjs` provide the runtime proof
 *     (exit 2 with MalformedSecurityHeader / exit 0 with status 200
 *     respectively) against real prod.
 *
 * FAILS before the fix (header is present in `uploadToGCS`).
 * PASSES after the fix (header is removed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC_PATH = resolve(__dirname, '../app/data/api.ts');
const src = readFileSync(SRC_PATH, 'utf-8');

// ── Runtime canary mocks (P802 test pattern, polarity inverted) ───────────────
const mocks = vi.hoisted(() => ({
  getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
  },
}));

describe('P812: uploadToGCS must not send x-goog-content-length-range', () => {
  it('extracts the uploadToGCS function body', () => {
    // Sanity: find the function we care about. If the name changes, this
    // canary must be updated deliberately rather than passing vacuously.
    expect(src).toMatch(/async\s+function\s+uploadToGCS\s*\(/);
  });

  // Permanent regression guard — the header was removed in the P812 fix. If
  // it ever comes back, this test fails loudly. See the spec + probe scripts
  // for why: the ml-training signer does not include this header in its
  // signed canonical request; sending it triggers MalformedSecurityHeader.
  it('uploadToGCS does not reference `x-goog-content-length-range`', () => {
    // Narrow to the uploadToGCS function body so a comment elsewhere in the
    // file cannot mask a real regression.
    const fnStart = src.indexOf('async function uploadToGCS');
    expect(fnStart).toBeGreaterThan(0);

    // Walk forward to the matching closing brace. Simple brace-counter —
    // fine for TS without templated braces in strings/regexes up to that
    // point (verified by eye; canary will fail loudly if the file changes
    // shape).
    let depth = 0;
    let i = src.indexOf('{', fnStart);
    const bodyStart = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = src.slice(bodyStart, i + 1);

    // Match only the object-KEY pattern (`'x-goog-content-length-range':` or
    // `"x-goog-content-length-range":`) — comments explaining WHY the header
    // is absent may legitimately reference the name and must not trip the
    // canary.
    expect(body).not.toMatch(/['"]x-goog-content-length-range['"]\s*:/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime canary (supersedes the deleted p802-gcs-upload-header.test.ts).
//   P802 asserted the header IS present. Today's probes (scripts/probe-gcs-*)
//   disprove P802: the ml-training Cloud Function signer does NOT sign that
//   header, so sending it causes GCS to reject with MalformedSecurityHeader.
//   These tests assert the opposite — the PUT does NOT carry the header.
// ═══════════════════════════════════════════════════════════════════════════════

// Import AFTER mocks are registered
import { uploadAudioChunk, uploadSingleChunk, uploadSessionRecording } from '@/app/data/api';

const SIGNED_URL = 'https://storage.googleapis.com/claritypledge-ml-training/sessions/TEST00/user_chunk_000.webm?X-Goog-Signature=test';

function makeEdgeFunctionMock() {
  return vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ uploadUrl: SIGNED_URL, filePath: 'sessions/TEST00/user_chunk_000.webm' }),
    })
    .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });
}

describe('P812: uploadToGCS PUT must NOT carry x-goog-content-length-range', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeEdgeFunctionMock());
  });

  it('uploadAudioChunk → PUT omits x-goog-content-length-range', async () => {
    const testBlob = new Blob(['audio-data'], { type: 'audio/webm' });
    await uploadAudioChunk('TEST00', 'testuser', testBlob, 0, false);

    const fetchMock = vi.mocked(global.fetch);
    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];

    expect(putInit.method).toBe('PUT');
    const headers = putInit.headers as Record<string, string>;
    expect(headers['x-goog-content-length-range']).toBeUndefined();
    // Content-Type is the one header the signer DOES include in canonical — keep it.
    expect(headers['Content-Type']).toBeDefined();
  });

  it('uploadSingleChunk → PUT omits x-goog-content-length-range', async () => {
    const testBlob = new Blob(['audio-data'], { type: 'audio/webm' });
    await uploadSingleChunk('TEST00', 'testuser', testBlob, 0);

    const fetchMock = vi.mocked(global.fetch);
    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];

    expect(putInit.method).toBe('PUT');
    const headers = putInit.headers as Record<string, string>;
    expect(headers['x-goog-content-length-range']).toBeUndefined();
    expect(headers['Content-Type']).toBeDefined();
  });

  it('uploadSessionRecording → both PUTs omit x-goog-content-length-range', async () => {
    // uploadSessionRecording does: signed-URL(audio) → PUT(audio) → signed-URL(events) → PUT(events)
    // → DB insert. Four fetches, two of them PUTs. Build a 4-response mock.
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ uploadUrl: SIGNED_URL, filePath: 'sessions/TEST00/testuser.webm' }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ uploadUrl: SIGNED_URL, filePath: 'sessions/TEST00/events.json' }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' }),
    );

    const audioBlob = new Blob(['audio-data'], { type: 'audio/webm' });
    await uploadSessionRecording('TEST00', 'testuser', audioBlob, [], {
      sessionStartedAt: Date.now() - 60_000,
      sessionEndedAt: Date.now(),
      durationMs: 60_000,
      participants: [{ name: 'testuser', role: 'creator' }],
    });

    const fetchMock = vi.mocked(global.fetch);
    // Call order: [0] signed-url audio, [1] PUT audio, [2] signed-url events, [3] PUT events
    const [, audioPut] = fetchMock.mock.calls[1] as [string, RequestInit];
    const [, eventsPut] = fetchMock.mock.calls[3] as [string, RequestInit];

    expect(audioPut.method).toBe('PUT');
    expect((audioPut.headers as Record<string, string>)['x-goog-content-length-range']).toBeUndefined();
    expect((audioPut.headers as Record<string, string>)['Content-Type']).toBeDefined();

    expect(eventsPut.method).toBe('PUT');
    expect((eventsPut.headers as Record<string, string>)['x-goog-content-length-range']).toBeUndefined();
    expect((eventsPut.headers as Record<string, string>)['Content-Type']).toBeDefined();
  });
});
