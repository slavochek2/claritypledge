/**
 * P1648: the exempt-route list in e2e/helpers/prod-health.ts is hand-kept, so it must diverge loudly.
 * A route is exempt only while its page really stops the recorder on mount.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { RECORDER_STOPPED_ON_MOUNT_ROUTES } from '../../e2e/helpers/prod-health';

const PAGE_FOR_ROUTE: Record<string, string> = { '/live': 'src/app/pages/clarity-live-page.tsx' };

describe('P1648: recorder-stopped routes', () => {
  it('every exempt route maps to a page, and that page calls stopSessionRecording', () => {
    expect(RECORDER_STOPPED_ON_MOUNT_ROUTES.length).toBeGreaterThan(0);
    for (const route of RECORDER_STOPPED_ON_MOUNT_ROUTES) {
      const file = PAGE_FOR_ROUTE[route];
      expect(file, `no page mapped for exempt route ${route}`).toBeTruthy();
      expect(readFileSync(file, 'utf8')).toMatch(/analytics\.stopSessionRecording\(\)/);
    }
  });
});
