/**
 * P1201 — every link preview on the site returned HTTP 500 for three days.
 *
 * `api/*.ts` is deployed by Vercel as a *transpiled*, not bundled, ESM module:
 * the import specifiers are emitted verbatim into `/var/task/api/og.js`, and the
 * repo's `package.json` carries `"type": "module"`. Node's ESM resolver — unlike
 * Vite, vitest, tsx and the TypeScript compiler, all of which resolve
 * extensionless specifiers — requires an explicit file extension for a relative
 * import. P1141 added `import { getThumbnailUrl } from '../src/lib/video'`, the
 * first relative value-import in `api/`, and the deployed function died at module
 * load with ERR_MODULE_NOT_FOUND on every single request.
 *
 * Nothing caught it: the whole existing test suite imports `api/og` through
 * vitest, which resolves the extensionless specifier happily. The production
 * failure lives entirely in the gap between the two resolvers, so the gate has to
 * assert the *specifier text*, not the importability.
 *
 * `import type` is exempt — type-only imports are erased before they reach Node.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const API_DIR = join(import.meta.dirname, '../../api');

/** A relative import/export specifier that is NOT type-only. Captures the specifier. */
const RELATIVE_SPECIFIER =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s+)?['"](\.[^'"]*)['"]/g;

function apiSourceFiles(): string[] {
  return readdirSync(API_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
}

describe('P1201: api/ relative imports resolve under Node ESM', () => {
  it('finds the api/ source files it claims to check', () => {
    // Guards against the gate silently passing because the glob went empty.
    expect(apiSourceFiles().length).toBeGreaterThan(0);
  });

  it.each(apiSourceFiles())(
    '%s: every relative value-import carries an explicit .js extension',
    (file) => {
      const src = readFileSync(join(API_DIR, file), 'utf8');
      const offenders = [...src.matchAll(RELATIVE_SPECIFIER)]
        .map((m) => m[1] as string)
        .filter((spec) => !spec.endsWith('.js'));

      expect(
        offenders,
        `api/${file} has relative import(s) without a .js extension: ${offenders.join(', ')}. ` +
          `Vercel transpiles api/*.ts to ESM without rewriting specifiers, so Node throws ` +
          `ERR_MODULE_NOT_FOUND at module load and the function 500s on every request. ` +
          `Write '../src/lib/video.js' — TypeScript maps the .js specifier to the .ts source.`,
      ).toEqual([]);
    },
  );

  it('the pattern actually detects an extensionless import (control)', () => {
    // Per epistemic gate 7: a matcher that never matches would let this whole
    // file pass green forever. Known-bad and known-good run through the same regex.
    const bad = `import { getThumbnailUrl } from '../src/lib/video';`;
    const good = `import { getThumbnailUrl } from '../src/lib/video.js';`;
    const specs = (s: string) => [...s.matchAll(RELATIVE_SPECIFIER)].map((m) => m[1]);

    expect(specs(bad)).toEqual(['../src/lib/video']);
    expect(specs(good)).toEqual(['../src/lib/video.js']);
    expect(specs(`import type { VercelRequest } from '../src/types';`)).toEqual([]);
  });
});
