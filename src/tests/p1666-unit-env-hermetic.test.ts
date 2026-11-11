/**
 * P1666: a unit run must see exactly the VITE_* values in src/tests/unit-test-env.ts, never a
 * developer env file or shell export. The canary catches a leak; the switch tests prove each
 * module-load mock/real switch follows its flag and picks the mock when the flag is absent, which
 * is the unit (and CI) default. Scope: VITE_* only. Unprefixed process.env values (TEST_*, etc.)
 * are not covered here. p1666-env-dir-regression.test.ts proves the env-file half in CI too.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UNIT_TEST_ENV } from './unit-test-env';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('P1666 canary: unit env is hermetic', () => {
  it('import.meta.env carries exactly the VITE_* keys in unit-test-env.ts', () => {
    const expected = Object.keys(UNIT_TEST_ENV).sort();
    // A broken derivation must not pass green.
    expect(expected).toContain('VITE_SUPABASE_URL');

    const actual = Object.keys(import.meta.env)
      .filter((k) => k.startsWith('VITE_'))
      .sort();
    const extra = actual.filter((k) => !expected.includes(k));
    const missing = expected.filter((k) => !actual.includes(k));
    expect(
      extra,
      `Extra VITE_ keys reached the unit run: ${extra.join(', ')}. An env file or shell export leaked in; ` +
        'vite.config.ts should drop both under vitest (P1666). Stub a value in the test with vi.stubEnv instead.',
    ).toEqual([]);
    expect(
      missing,
      `VITE_ keys from unit-test-env.ts are missing from the unit run: ${missing.join(', ')}. ` +
        'vite.config.ts test.env stopped passing UNIT_TEST_ENV (P1666).',
    ).toEqual([]);
    // Values too, not just names: a shell export of an allowed key must not override it.
    expect(import.meta.env).toMatchObject(UNIT_TEST_ENV);
  });
});

/**
 * One row per module-load switch. `pick` reads what identifies the chosen implementation: the
 * service object itself, or for stories and points (which wrap the chosen service in a Proxy or
 * spread) a read method that passes through unwrapped.
 */
type Mod = Record<string, unknown>;
const SWITCHES: Array<{
  name: string;
  flag: string;
  load: () => Promise<[Mod, Mod, Mod]>;
  pick: (sw: Mod, real: Mod, mock: Mod) => [unknown, unknown, unknown];
}> = [
  {
    name: 'agreements-service',
    flag: 'VITE_USE_REAL_AGREEMENTS_API',
    load: async () => [
      await import('@/app/data/agreements-service'),
      await import('@/app/data/agreements-service-real'),
      await import('@/app/data/agreements-service-mock'),
    ],
    pick: (sw, real, mock) => [sw.agreementsService, real.realAgreementsService, mock.mockAgreementsService],
  },
  {
    name: 'events-service',
    flag: 'VITE_USE_REAL_EVENTS_API',
    load: async () => [
      await import('@/app/data/events-service'),
      await import('@/app/data/events-service-real'),
      await import('@/app/data/events-service-mock'),
    ],
    pick: (sw, real, mock) => [sw.eventsService, real.realEventsService, mock.mockEventsService],
  },
  {
    name: 'calibration-service',
    flag: 'VITE_USE_REAL_API',
    load: async () => [
      await import('@/app/data/calibration-service'),
      await import('@/app/data/calibration-service-real'),
      await import('@/app/data/calibration-service-mock'),
    ],
    pick: (sw, real, mock) => [sw.calibrationService, real.realCalibrationService, mock.mockCalibrationService],
  },
  {
    name: 'stories-service',
    flag: 'VITE_USE_REAL_API',
    load: async () => [
      await import('@/app/data/stories-service'),
      await import('@/app/data/stories-service-real'),
      await import('@/app/data/stories-service-mock'),
    ],
    pick: (sw, real, mock) => [
      (sw.storiesService as Mod).getStory,
      (real.realStoriesService as Mod).getStory,
      (mock.mockStoriesService as Mod).getStory,
    ],
  },
  {
    name: 'points-service',
    flag: 'VITE_USE_REAL_API',
    load: async () => [
      await import('@/app/data/points-service'),
      await import('@/app/data/points-service-real'),
      await import('@/app/data/points-service-mock'),
    ],
    pick: (sw, real, mock) => [
      (sw.pointsService as Mod).getPoint,
      (real.realPointsService as Mod).getPoint,
      (mock.mockPointsService as Mod).getPoint,
    ],
  },
];

describe.each(SWITCHES)('$name switch ($flag)', ({ flag, load, pick }) => {
  const chosen = async (value: string | undefined) => {
    if (value !== undefined) vi.stubEnv(flag, value);
    vi.resetModules();
    return pick(...(await load()));
  };

  it('true selects the real implementation', async () => {
    const [sw, real] = await chosen('true');
    expect(sw).toBe(real);
  });
  it('false selects the mock implementation', async () => {
    const [sw, , mock] = await chosen('false');
    expect(sw).toBe(mock);
  });
  it('absent (the unit and CI default) selects the mock implementation', async () => {
    expect(import.meta.env[flag]).toBeUndefined();
    const [sw, , mock] = await chosen(undefined);
    expect(sw).toBe(mock);
  });
});
