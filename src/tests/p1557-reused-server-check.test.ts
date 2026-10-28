/**
 * P1557: playwright.config.ts refuses to reuse a dev server booted against a different database
 * (scripts/lib/reused-server-check.mjs). The served body is what Vite returns for a module with
 * import.meta.env inlined.
 */
import { describe, it, expect } from 'vitest';
import { servedSupabaseUrl, reusedServerMismatch } from '../../scripts/lib/reused-server-check.mjs';

const HOSTED = 'https://ayibkeoyukulbsjpxgaw.supabase.co';
const SELF = 'https://test-db.example.org';
const served = (url: string) => () => `import.meta.env = {"BASE_URL": "/", "VITE_SUPABASE_URL": "${url}", "MODE": "development"};`;

describe('P1557 reused dev server check', () => {
  it('reads the database a running server was booted with', () => {
    expect(servedSupabaseUrl(5100, served(HOSTED))).toBe(HOSTED);
  });
  it('refuses when the running server talks to another database', () => {
    expect(reusedServerMismatch(5100, SELF, served(HOSTED))).toMatch(/talks to https:\/\/ayibkeoyukulbsjpxgaw.*targets https:\/\/test-db/);
  });
  it('allows a running server on the same database', () => {
    expect(reusedServerMismatch(5100, HOSTED, served(HOSTED))).toBeNull();
  });
  it('allows when no server answers (the run starts its own, with the right env)', () => {
    expect(reusedServerMismatch(5100, SELF, () => null)).toBeNull();
    expect(reusedServerMismatch(5100, SELF, () => '<html>not vite</html>')).toBeNull();
  });
  it('a server whose database cannot be read is reported, not compared', () => {
    expect(servedSupabaseUrl(5100, () => '<html>not vite</html>')).toBe('unreadable');
  });
});
