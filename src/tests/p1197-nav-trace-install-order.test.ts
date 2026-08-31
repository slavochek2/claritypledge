import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * P1197: the trace exists to record a navigation that fires within the first seconds
 * of boot. Installed after the app mounts, it misses the very event it was built for —
 * measured on prod, a hand-injected patch landed at t=5673ms, long after the redirect.
 *
 * That ordering is load-bearing and invisible: reordering main.tsx breaks the instrument
 * without breaking a single behavioural test. This asserts it structurally.
 */
describe('P1197: nav trace installs before the app mounts', () => {
  const source = readFileSync(resolve(__dirname, '../main.tsx'), 'utf-8');

  it('calls installNavTrace() before createRoot()', () => {
    const install = source.indexOf('installNavTrace()');
    const createRoot = source.indexOf('createRoot(document');
    expect(install, 'installNavTrace() call not found in main.tsx').toBeGreaterThan(-1);
    expect(createRoot, 'createRoot(document…) not found in main.tsx').toBeGreaterThan(-1);
    expect(install).toBeLessThan(createRoot);
  });
});
