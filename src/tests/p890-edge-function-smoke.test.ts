/**
 * P890 — edge functions reach prod unverified.
 *
 * These tests pin the smoke's two load-bearing properties:
 *  1. COMPLETENESS — every function directory has an expectation row, and every
 *     row has a directory. Without this the smoke silently stops covering a
 *     newly added function and stays green (epistemic gate 7b: green bounds what
 *     was modelled, and the model here is the table).
 *  2. FAILURE PATH — an undeployed (404) or boot-broken (500/503) function makes
 *     the run fail. A smoke that has never been seen to fail is unproven.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { resolve } from 'path';
import {
  EDGE_FUNCTION_EXPECTATIONS,
  discoverFunctionDirs,
  selectFunctions,
  smokeFunction,
  runEdgeSmoke,
} from '../../scripts/edge-function-smoke.mjs';

const FUNCTIONS_DIR = resolve(__dirname, '../../supabase/functions');

/** A fetch stub keyed by `${method} ${name}` returning [status, body, corsOrigin]. */
function stubFetch(map: Record<string, [number, string, string | null]>) {
  return async (url: string, init?: { method?: string }) => {
    const name = url.split('/').pop() as string;
    const key = `${init?.method ?? 'GET'} ${name}`;
    const entry = map[key];
    if (!entry) throw new Error(`unstubbed request: ${key}`);
    const [status, body, cors] = entry;
    const headers = new Headers();
    if (cors) headers.set('access-control-allow-origin', cors);
    return {
      status,
      headers,
      text: async () => body,
    };
  };
}

const PROD_ORIGIN = 'https://claritypledge.com';

/** Responses that mirror what prod actually returned on 2026-09-09. */
function healthyStubFor(name: string) {
  const exp = EDGE_FUNCTION_EXPECTATIONS[name];
  return {
    [`OPTIONS ${name}`]: [
      exp.options.status,
      'ok',
      exp.options.expectCors ? PROD_ORIGIN : null,
    ] as [number, string, string | null],
    [`POST ${name}`]: [exp.deny.status, exp.deny.bodyIncludes ?? '{}', null] as [
      number,
      string,
      string | null,
    ],
  };
}

describe('P890 edge-function smoke — expectation table completeness', () => {
  it('covers every deployable function directory, and nothing else', () => {
    const dirs = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => d.name)
      .sort();

    expect(dirs.length).toBeGreaterThan(0);
    expect(Object.keys(EDGE_FUNCTION_EXPECTATIONS).sort()).toEqual(dirs);
  });

  it('discoverFunctionDirs reads the filesystem, not the table', () => {
    expect(discoverFunctionDirs(FUNCTIONS_DIR)).not.toContain('_shared');
  });

  it('every deny path expects a 4xx — a smoke must never trigger real work', () => {
    for (const [name, exp] of Object.entries(EDGE_FUNCTION_EXPECTATIONS)) {
      expect(exp.deny.status, name).toBeGreaterThanOrEqual(400);
      expect(exp.deny.status, name).toBeLessThan(500);
    }
  });
});

describe('P890 edge-function smoke — per-function checks', () => {
  it('passes when prod answers as recorded', async () => {
    const name = 'send-letter-emails';
    const res = await smokeFunction(name, {
      baseUrl: 'https://x.supabase.co/functions/v1',
      fetchImpl: stubFetch(healthyStubFor(name)),
    });
    expect(res.failures).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it('fails when the function is not deployed (404)', async () => {
    const name = 'send-letter-emails';
    const res = await smokeFunction(name, {
      baseUrl: 'https://x.supabase.co/functions/v1',
      fetchImpl: stubFetch({
        'OPTIONS send-letter-emails': [404, '{"code":"NOT_FOUND"}', null],
        'POST send-letter-emails': [404, '{"code":"NOT_FOUND"}', null],
      }),
    });
    expect(res.ok).toBe(false);
    expect(res.failures.join(' ')).toContain('404');
  });

  it('fails when the function boots but throws (500)', async () => {
    const name = 'gcs-signed-url';
    const stub = healthyStubFor(name);
    stub[`OPTIONS ${name}`] = [500, 'BOOT_ERROR', null];
    const res = await smokeFunction(name, {
      baseUrl: 'https://x.supabase.co/functions/v1',
      fetchImpl: stubFetch(stub),
    });
    expect(res.ok).toBe(false);
  });

  it('fails when the caller gate stops denying (deny path returns 200)', async () => {
    const name = 'send-event-emails';
    const stub = healthyStubFor(name);
    stub[`POST ${name}`] = [200, '{"sent":true}', null];
    const res = await smokeFunction(name, {
      baseUrl: 'https://x.supabase.co/functions/v1',
      fetchImpl: stubFetch(stub),
    });
    expect(res.ok).toBe(false);
    expect(res.failures.join(' ')).toMatch(/deny/i);
  });

  it('fails when the CORS origin header is missing on a function that declares OPTIONS', async () => {
    const name = 'generate-banner';
    const stub = healthyStubFor(name);
    stub[`OPTIONS ${name}`] = [200, 'ok', null];
    const res = await smokeFunction(name, {
      baseUrl: 'https://x.supabase.co/functions/v1',
      fetchImpl: stubFetch(stub),
    });
    expect(res.ok).toBe(false);
    expect(res.failures.join(' ')).toMatch(/cors/i);
  });
});

describe('P890 edge-function smoke — selection', () => {
  it('smokes every function when --only is absent', () => {
    const all = Object.keys(EDGE_FUNCTION_EXPECTATIONS);
    expect(selectFunctions(all, null)).toEqual(all);
  });

  it('smokes exactly the named subset (deployed functions only)', () => {
    const all = Object.keys(EDGE_FUNCTION_EXPECTATIONS);
    expect(selectFunctions(all, ['gcs-signed-url', 'generate-banner'])).toEqual([
      'gcs-signed-url',
      'generate-banner',
    ]);
  });

  it('throws on an unknown name rather than silently smoking nothing', () => {
    const all = Object.keys(EDGE_FUNCTION_EXPECTATIONS);
    expect(() => selectFunctions(all, ['not-a-function'])).toThrow(/not-a-function/);
  });
});

describe('P890 edge-function smoke — run aggregation', () => {
  it('returns a non-zero exit code and names the failing function', async () => {
    const names = ['gcs-signed-url', 'send-letter-emails'];
    const stub = { ...healthyStubFor(names[0]), ...healthyStubFor(names[1]) };
    stub['OPTIONS gcs-signed-url'] = [503, 'boot error', null];
    const result = await runEdgeSmoke({
      names,
      baseUrl: 'https://x.supabase.co/functions/v1',
      fetchImpl: stubFetch(stub),
      log: () => {},
    });
    expect(result.exitCode).toBe(1);
    expect(result.failed).toEqual(['gcs-signed-url']);
  });

  it('returns exit code 0 when every function answers as recorded', async () => {
    const names = Object.keys(EDGE_FUNCTION_EXPECTATIONS);
    const stub = Object.assign({}, ...names.map(healthyStubFor));
    const result = await runEdgeSmoke({
      names,
      baseUrl: 'https://x.supabase.co/functions/v1',
      fetchImpl: stubFetch(stub),
      log: () => {},
    });
    expect(result.exitCode).toBe(0);
    expect(result.failed).toEqual([]);
  });
});
