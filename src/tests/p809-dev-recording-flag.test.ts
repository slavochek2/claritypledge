/**
 * @file p809-dev-recording-flag.test.ts
 * @description Canary for P809 — asserts the three gate branches of the
 * dev-recording URL flag:
 *   1. prod (import.meta.env.PROD === true): flag has NO effect
 *   2. non-prod without ?dev-recording=1: helper returns false (record skipped)
 *   3. non-prod with ?dev-recording=1: helper returns true, filename prefix is `_dev_`
 *
 * These branches are what makes the feature safe on prod and actionable on dev.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  isDevRecordingActive,
  devRecordingFilenamePrefix,
  DEV_RECORDING_FILENAME_PREFIX,
} from '@/lib/dev-recording';

// JSDOM's default URL is `about:blank` which has no origin → history.replaceState
// errors on cross-origin updates. Stub `window.location.search` directly instead.
function setUrl(search: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      ...window.location,
      search: search ? `?${search}` : '',
    },
  });
}

describe('P809: dev-recording URL flag', () => {
  beforeEach(() => {
    setUrl('');
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setUrl('');
  });

  describe('non-prod environment (import.meta.env.PROD === false)', () => {
    it('returns false when no flag is present', () => {
      setUrl('');
      expect(isDevRecordingActive()).toBe(false);
      expect(devRecordingFilenamePrefix()).toBe('');
    });

    it('returns false when an unrelated query param is present', () => {
      setUrl('foo=bar');
      expect(isDevRecordingActive()).toBe(false);
    });

    it('returns false when dev-recording is set to something other than "1"', () => {
      setUrl('dev-recording=0');
      expect(isDevRecordingActive()).toBe(false);

      setUrl('dev-recording=true');
      expect(isDevRecordingActive()).toBe(false);
    });

    it('returns true when ?dev-recording=1 is present', () => {
      setUrl('dev-recording=1');
      expect(isDevRecordingActive()).toBe(true);
      expect(devRecordingFilenamePrefix()).toBe(DEV_RECORDING_FILENAME_PREFIX);
      expect(devRecordingFilenamePrefix()).toBe('_dev_');
    });

    it('returns true when ?dev-recording=1 is present alongside other params', () => {
      setUrl('foo=bar&dev-recording=1&baz=qux');
      expect(isDevRecordingActive()).toBe(true);
    });
  });

  describe('prod environment (structural verification)', () => {
    // `import.meta.env.PROD` is replaced by Vite at build time with a literal
    // true/false — it is NOT reachable via vi.stubEnv. Vitest does not re-build
    // the module between tests, so we cannot flip PROD to true at runtime.
    //
    // Instead we verify structurally: the source of `dev-recording.ts` MUST
    // contain an early-return guard against PROD. This is the load-bearing
    // invariant that keeps the feature out of prod. If this assertion ever
    // fails, the feature has leaked into the prod code path.

    const SOURCE = readFileSync(
      resolve(__dirname, '../lib/dev-recording.ts'),
      'utf-8',
    );

    it('isDevRecordingActive() has an early `if (import.meta.env.PROD) return false` guard', () => {
      expect(SOURCE).toMatch(/if\s*\(\s*import\.meta\.env\.PROD\s*\)\s*return\s+false/);
    });

    it('the PROD guard appears BEFORE any URL parsing in isDevRecordingActive', () => {
      // A regression where URL parsing happens before the PROD check would
      // defeat the guard (e.g. querystring logs / analytics leaking on prod).
      const prodIdx = SOURCE.indexOf('import.meta.env.PROD');
      const urlIdx = SOURCE.indexOf('URLSearchParams');
      expect(prodIdx).toBeGreaterThan(0);
      expect(urlIdx).toBeGreaterThan(prodIdx);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Wiring: prefix must reach the signed-URL request
// ═══════════════════════════════════════════════════════════════════════════════

describe('P809: filename prefix flows through to the upload path', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setUrl('');
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    setUrl('');
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  it('chunk filename carries the `_dev_` prefix when flag is on (non-prod)', async () => {
    setUrl('dev-recording=1');

    const fetchCalls: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      // Only parse the body when the caller sent a JSON string (the signed-URL
      // request). PUT bodies are Blobs; leave them as-is to avoid a SyntaxError.
      const rawBody = init?.body;
      const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : null;
      fetchCalls.push({ url: urlStr, body });

      // Signed URL endpoint returns a fake upload URL, then the PUT succeeds.
      if (urlStr.includes('gcs-signed-url')) {
        return new Response(
          JSON.stringify({ uploadUrl: 'https://fake-upload.example/put', filePath: 'sessions/TEST00/_dev_alice_chunk_000.webm' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ) as unknown as Response;
      }
      return new Response(null, { status: 200 }) as unknown as Response;
    }) as typeof fetch;

    vi.resetModules();
    const { uploadSingleChunk } = await import('@/app/data/api');
    const chunkBlob = new Blob(['x'.repeat(100)], { type: 'audio/webm' });

    await uploadSingleChunk('TEST00', 'Alice', chunkBlob, 0);

    const signedUrlCall = fetchCalls.find(c => c.url.includes('gcs-signed-url'));
    expect(signedUrlCall).toBeDefined();
    expect((signedUrlCall!.body as { fileName: string }).fileName).toBe('_dev_alice_chunk_000.webm');
  });

  it('chunk filename has NO prefix when flag is absent (non-prod)', async () => {
    setUrl('');

    const fetchCalls: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      // Only parse the body when the caller sent a JSON string (the signed-URL
      // request). PUT bodies are Blobs; leave them as-is to avoid a SyntaxError.
      const rawBody = init?.body;
      const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : null;
      fetchCalls.push({ url: urlStr, body });

      if (urlStr.includes('gcs-signed-url')) {
        return new Response(
          JSON.stringify({ uploadUrl: 'https://fake-upload.example/put', filePath: 'sessions/TEST00/alice_chunk_000.webm' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ) as unknown as Response;
      }
      return new Response(null, { status: 200 }) as unknown as Response;
    }) as typeof fetch;

    vi.resetModules();
    const { uploadSingleChunk } = await import('@/app/data/api');
    const chunkBlob = new Blob(['x'.repeat(100)], { type: 'audio/webm' });

    await uploadSingleChunk('TEST00', 'Alice', chunkBlob, 0);

    const signedUrlCall = fetchCalls.find(c => c.url.includes('gcs-signed-url'));
    expect(signedUrlCall).toBeDefined();
    expect((signedUrlCall!.body as { fileName: string }).fileName).toBe('alice_chunk_000.webm');
  });
});
