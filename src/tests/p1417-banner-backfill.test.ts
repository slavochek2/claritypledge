/**
 * @file p1417-banner-backfill.test.ts
 * @description P1417 review round — scripts/event-banner-small.ts decides per banner from the
 * storage INFO endpoint (the public URL's HEAD is CDN-cached and was measured on TEST to keep a
 * stale Last-Modified after an upsert):
 *   - a missing copy is made WITHOUT x-upsert; a conflict then means "someone made it", not an error
 *   - a copy at least as new as its original is left alone, no write, no key
 *   - a copy OLDER than its original (original replaced at the same path) is stale and is replaced
 *     with x-upsert
 *   - --force replaces with x-upsert
 *   - every write sends cache-control: no-cache, matching how originals are served
 *   - one failing banner is counted, never ends the run
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { processUrl } from '../../scripts/event-banner-small';

const BASE = 'https://gfjctyxqlwexxwsmkakq.supabase.co';
const PATH = 'event-banners/x-v1.png';
const URL_ORIG = `${BASE}/storage/v1/object/public/${PATH}`;
const INFO_ORIG = `${BASE}/storage/v1/object/info/public/${PATH}`;
const INFO_SMALL = `${INFO_ORIG}.w800.webp`;
const UPLOAD = `${BASE}/storage/v1/object/${PATH}.w800.webp`;
const PUBLIC_SMALL = `${URL_ORIG}.w800.webp`;

type Call = { url: string; method: string; headers: Record<string, string> };

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 1200, height: 600, channels: 3, background: '#88aacc' } }).png().toBuffer();
}

function mockStorage(o: { small?: string | null; orig?: string; origLater?: string; uploadStatus?: number; throwOn?: string }) {
  const calls: Call[] = [];
  const body = png();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({ url, method, headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])) });
    if (o.throwOn && url.startsWith(o.throwOn)) throw new Error('network down');
    if (url === INFO_SMALL) {
      return o.small ? Response.json({ last_modified: o.small }) : Response.json({ statusCode: '404', message: 'Object not found' }, { status: 400 });
    }
    if (url === INFO_ORIG) {
      // origLater: the original is replaced while this run encodes (a concurrent refresh).
      const n = calls.filter((c) => c.url === INFO_ORIG).length;
      return Response.json({ last_modified: n > 1 && o.origLater ? o.origLater : (o.orig ?? '2026-09-01T00:00:00Z') });
    }
    if (url === URL_ORIG && method === 'GET') return new Response(await body, { status: 200 });
    if (url === UPLOAD && method === 'POST') {
      const st = o.uploadStatus ?? 200;
      return st === 200 ? Response.json({ Key: 'k' }) : Response.json({ statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }, { status: st });
    }
    if (url.startsWith(PUBLIC_SMALL) && method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-type': 'image/webp' } });
    return new Response('unexpected', { status: 599 });
  }));
  return calls;
}

const opts = (over: Partial<{ dryRun: boolean; force: boolean }> = {}) => ({
  dryRun: false,
  force: false,
  getWriteKey: vi.fn(() => 'test-key'),
  ...over,
});

const posts = (calls: Call[]) => calls.filter((c) => c.method === 'POST');

afterEach(() => vi.unstubAllGlobals());

describe('P1417: backfill decides from storage metadata', () => {
  it('missing copy: made without x-upsert, cache-control no-cache', async () => {
    const calls = mockStorage({ small: null });
    const o = opts();
    expect(await processUrl(URL_ORIG, BASE, o)).toBe('made');
    const [post] = posts(calls);
    expect(post!.url).toBe(UPLOAD);
    expect(post!.headers['x-upsert']).toBeUndefined();
    expect(post!.headers['cache-control']).toBe('no-cache');
  });

  it('a copy newer than its original is left alone — no write, no key read', async () => {
    const calls = mockStorage({ small: '2026-10-05T08:00:00Z', orig: '2026-09-22T12:00:00Z' });
    const o = opts();
    expect(await processUrl(URL_ORIG, BASE, o)).toBe('exists');
    expect(posts(calls)).toHaveLength(0);
    expect(o.getWriteKey).not.toHaveBeenCalled();
  });

  it('a copy OLDER than its original is stale: replaced with x-upsert', async () => {
    const calls = mockStorage({ small: '2026-09-01T00:00:00Z', orig: '2026-10-05T09:00:00Z' });
    expect(await processUrl(URL_ORIG, BASE, opts())).toBe('made');
    expect(posts(calls)[0]!.headers['x-upsert']).toBe('true');
  });

  it('stale copy on a dry run: reported, nothing written', async () => {
    const calls = mockStorage({ small: '2026-09-01T00:00:00Z', orig: '2026-10-05T09:00:00Z' });
    expect(await processUrl(URL_ORIG, BASE, opts({ dryRun: true }))).toBe('would-make');
    expect(posts(calls)).toHaveLength(0);
  });

  it('--force replaces a fresh copy with x-upsert', async () => {
    const calls = mockStorage({ small: '2026-10-05T08:00:00Z', orig: '2026-09-22T12:00:00Z' });
    expect(await processUrl(URL_ORIG, BASE, opts({ force: true }))).toBe('made');
    expect(posts(calls)[0]!.headers['x-upsert']).toBe('true');
  });

  it('a conflict without --force means it already exists (made concurrently) — a skip, not a failure', async () => {
    mockStorage({ small: null, uploadStatus: 409 });
    expect(await processUrl(URL_ORIG, BASE, opts())).toBe('exists');
  });

  it('the original changes while this run encodes: nothing is uploaded (the copy would be of the old picture)', async () => {
    const calls = mockStorage({ small: null, orig: '2026-10-05T08:00:00Z', origLater: '2026-10-05T08:00:05Z' });
    expect(await processUrl(URL_ORIG, BASE, opts())).toBe('skipped');
    expect(posts(calls)).toHaveLength(0);
  });

  it('a network error on one banner is counted as failed, not thrown', async () => {
    mockStorage({ small: null, throwOn: URL_ORIG });
    expect(await processUrl(URL_ORIG, BASE, opts())).toBe('failed');
  });
});
