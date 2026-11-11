/**
 * P1666: a unit run must see exactly the VITE_* values vite.config.ts `test.env` supplies, never a
 * developer env file or shell export. The canary catches a leak; the switch tests prove each
 * module-load mock/real switch follows its flag, so a leaked flag would be a real behaviour change.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('P1666 canary: unit env is hermetic', () => {
  it('import.meta.env VITE_* keys equal vite.config.ts test.env keys', () => {
    // Importing vite.config under jsdom breaks esbuild (TextEncoder invariant), so read it as text.
    const src = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');
    const testBlock = src.slice(src.indexOf('test: {'));
    const envBody = /\benv:\s*\{([^}]*)\}/.exec(testBlock)?.[1] ?? '';
    const expected = [...envBody.matchAll(/^\s*(VITE_[A-Z0-9_]+)\s*:/gm)].map((m) => m[1]).sort();
    // A broken derivation must not pass green.
    expect(expected).toContain('VITE_SUPABASE_URL');

    const actual = Object.keys(import.meta.env)
      .filter((k) => k.startsWith('VITE_'))
      .sort();
    const extra = actual.filter((k) => !expected.includes(k));
    const missing = expected.filter((k) => !actual.includes(k));
    expect(
      { extra, missing },
      `Extra VITE_ keys in the unit run: ${extra.join(', ') || '(none)'}; missing: ${missing.join(', ') || '(none)'}. ` +
        'a developer env file or shell export reached the unit run — see P1666',
    ).toEqual({ extra: [], missing: [] });
    expect(actual).toEqual(expected);
  });
});

/** Stub the flag, reload modules, import the switch module and the two implementations. */
async function load<T>(flag: string, value: string, imports: () => Promise<T>): Promise<T> {
  vi.stubEnv(flag, value);
  vi.resetModules();
  return imports();
}

describe('agreements-service switch (VITE_USE_REAL_AGREEMENTS_API)', () => {
  const run = (v: string) =>
    load('VITE_USE_REAL_AGREEMENTS_API', v, async () => ({
      sw: await import('@/app/data/agreements-service'),
      real: await import('@/app/data/agreements-service-real'),
      mock: await import('@/app/data/agreements-service-mock'),
    }));
  it('true selects the real implementation', async () => {
    const { sw, real } = await run('true');
    expect(sw.agreementsService).toBe(real.realAgreementsService);
  });
  it('false selects the mock implementation', async () => {
    const { sw, mock } = await run('false');
    expect(sw.agreementsService).toBe(mock.mockAgreementsService);
  });
});

describe('events-service switch (VITE_USE_REAL_EVENTS_API)', () => {
  const run = (v: string) =>
    load('VITE_USE_REAL_EVENTS_API', v, async () => ({
      sw: await import('@/app/data/events-service'),
      real: await import('@/app/data/events-service-real'),
      mock: await import('@/app/data/events-service-mock'),
    }));
  it('true selects the real implementation', async () => {
    const { sw, real } = await run('true');
    expect(sw.eventsService).toBe(real.realEventsService);
  });
  it('false selects the mock implementation', async () => {
    const { sw, mock } = await run('false');
    expect(sw.eventsService).toBe(mock.mockEventsService);
  });
});

describe('calibration-service switch (VITE_USE_REAL_API)', () => {
  const run = (v: string) =>
    load('VITE_USE_REAL_API', v, async () => ({
      sw: await import('@/app/data/calibration-service'),
      real: await import('@/app/data/calibration-service-real'),
      mock: await import('@/app/data/calibration-service-mock'),
    }));
  it('true selects the real implementation', async () => {
    const { sw, real } = await run('true');
    expect(sw.calibrationService).toBe(real.realCalibrationService);
  });
  it('false selects the mock implementation', async () => {
    const { sw, mock } = await run('false');
    expect(sw.calibrationService).toBe(mock.mockCalibrationService);
  });
});

// stories and points wrap the chosen service in a Proxy / spread; a READ method passes through
// unwrapped, so its identity proves which implementation was picked.
describe('stories-service switch (VITE_USE_REAL_API)', () => {
  const run = (v: string) =>
    load('VITE_USE_REAL_API', v, async () => ({
      sw: await import('@/app/data/stories-service'),
      real: await import('@/app/data/stories-service-real'),
      mock: await import('@/app/data/stories-service-mock'),
    }));
  it('true selects the real implementation', async () => {
    const { sw, real } = await run('true');
    expect(sw.storiesService.getStory).toBe(real.realStoriesService.getStory);
  });
  it('false selects the mock implementation', async () => {
    const { sw, mock } = await run('false');
    expect(sw.storiesService.getStory).toBe(mock.mockStoriesService.getStory);
  });
});

describe('points-service switch (VITE_USE_REAL_API)', () => {
  const run = (v: string) =>
    load('VITE_USE_REAL_API', v, async () => ({
      sw: await import('@/app/data/points-service'),
      real: await import('@/app/data/points-service-real'),
      mock: await import('@/app/data/points-service-mock'),
    }));
  it('true selects the real implementation', async () => {
    const { sw, real } = await run('true');
    expect(sw.pointsService.getPoint).toBe(real.realPointsService.getPoint);
  });
  it('false selects the mock implementation', async () => {
    const { sw, mock } = await run('false');
    expect(sw.pointsService.getPoint).toBe(mock.mockPointsService.getPoint);
  });
});
