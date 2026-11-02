/**
 * @file p1536-x14-artifacts-default.test.ts
 * @description P1536 3c X14 (S3c.11): Canvases is the first tab and bare `/artifacts`'s default (list Mine); Letters is reached by `?tab=letters`.
 * Every letter flow that used to land on the bare address names `?tab=letters`, so finishing a letter still lands on Letters. The list of
 * such flows is DERIVED here by scanning the source, never counted by hand: a bare `/artifacts` literal outside the nav entries fails the test.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARTIFACT_TABS, resolveArtifactsLocation } from '@/app/pages/artifacts/artifacts-view-model';
import { ARTIFACTS_LETTERS, legacyLettersTarget } from '@/app/pages/artifacts/legacy-redirect-targets';

const at = (search: string) => resolveArtifactsLocation(new URLSearchParams(search));

describe('X14: the Artifacts address', () => {
  it('Canvases is the first tab', () => {
    expect([...ARTIFACT_TABS]).toEqual(['canvases', 'letters']);
  });

  it('bare /artifacts opens Canvases > Mine', () => {
    expect(at('')).toMatchObject({ tab: 'canvases', list: 'mine', legacy: false });
  });

  it('?tab=letters opens Letters, and a list inside it still opens that list', () => {
    expect(at('tab=letters')).toMatchObject({ tab: 'letters', list: 'drafts', legacy: false });
    expect(at('tab=letters&list=sent')).toMatchObject({ tab: 'letters', list: 'sent' });
  });

  it('?tab=canvases is unchanged, and junk falls back to the new default', () => {
    expect(at('tab=canvases')).toMatchObject({ tab: 'canvases', list: 'mine' });
    expect(at('tab=nonsense')).toMatchObject({ tab: 'canvases', list: 'mine' });
  });

  it('control: the old tab=yours / tab=shared links keep their letter meaning (they never meant "the default")', () => {
    expect(at('tab=yours')).toMatchObject({ tab: 'letters', list: 'drafts', legacy: true });
    expect(at('tab=shared')).toMatchObject({ tab: 'letters', list: 'received', legacy: true });
  });

  it('the /letters redirect names Letters for an address it does not recognise, and keeps the lists it does', () => {
    expect(ARTIFACTS_LETTERS).toBe('/artifacts?tab=letters');
    expect(legacyLettersTarget('')).toBe(ARTIFACTS_LETTERS);
    expect(legacyLettersTarget('?tab=nonsense')).toBe(ARTIFACTS_LETTERS);
    expect(legacyLettersTarget('?tab=sent')).toBe('/artifacts?tab=letters&list=sent');
  });
});

// --- derived: no letter flow links to the bare address -----------------------------------------------------------------------------

const SRC = join(__dirname, '..');
const BARE = /(['"`])\/artifacts\1|\bto="\/artifacts"/;
/** Comment lines are prose about the address, not links to it. */
const isCode = (line: string) => !/^\s*(\*|\/\/|\/\*)/.test(line);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/**
 * The only places the bare address is allowed: the route itself, the nav entries (sidebar and phone bar model, the top nav) and the redirect
 * allowlist's prefix list. Anything else that says `'/artifacts'` is a flow that should say where it means to land.
 */
const NAV_ENTRIES = new Set([
  'App.tsx',
  'app/components/layout/app-shell/shell-nav.ts',
  'app/components/layout/simple-navigation.tsx',
  'auth/redirect-allowlist.ts',
]);

describe('X14: no letter flow links to bare /artifacts', () => {
  const found = sourceFiles(SRC)
    .map(path => ({ file: relative(SRC, path), lines: readFileSync(path, 'utf8').split('\n').filter(isCode) }))
    .filter(f => f.lines.some(line => BARE.test(line)));

  it('every bare-address literal in the source belongs to a nav entry', () => {
    const strays = found.filter(f => !NAV_ENTRIES.has(f.file)).map(f => f.file);
    expect(strays).toEqual([]);
  });

  it('control: the scan sees the nav entries it allows, so a blind scan cannot pass for a clean one', () => {
    expect(found.map(f => f.file)).toEqual(expect.arrayContaining([...NAV_ENTRIES]));
  });
});
