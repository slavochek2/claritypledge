/**
 * @file p1692-profile-links.test.tsx
 * @description P1692: a handle is data, and in an address it is always exactly one segment. Every address the app
 * builds from a handle (`/p/<handle>`, its sub-pages, `/compare/<handle>`) goes through one shared helper,
 * `src/lib/profile-path.ts`, so a handle that contains path or query characters still names its own profile and
 * nothing else.
 *
 * Two parts:
 *   1. COVERAGE, derived from the source rather than typed (epistemic gate 7e): no file outside the helper builds
 *      such an address by hand. A new link site that forgets the helper fails here.
 *   2. BEHAVIOUR, on a real component: the link of a person row lands on that person's profile route whatever the
 *      handle contains, and an ordinary handle links to the same address as before (gate 7c).
 * The helper's own properties are in p1692-profile-path.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PersonRow } from '@/app/components/shared/PersonRow';

const SRC = join(__dirname, '..');
const HELPER = 'lib/profile-path.ts';
const BASE = 'https://app.test';

/** An address built from a handle by hand: a template or a concatenation that starts at the route root. */
const HAND_BUILT = [/\/(?:p|compare)\/\$\{/, /['"`]\/(?:p|compare)\/['"`]\s*\+/];

function sourceFiles(dir: string = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'tests' || name === '__tests__' || name === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** The line numbers of a source text that build such an address by hand. Comments count too: the form is not written anywhere. */
function handBuiltLines(source: string): number[] {
  const found: number[] = [];
  source.split('\n').forEach((line, i) => {
    if (HAND_BUILT.some((re) => re.test(line))) found.push(i + 1);
  });
  return found;
}

function handBuiltSites(): string[] {
  const sites: string[] = [];
  for (const file of sourceFiles()) {
    const name = relative(SRC, file);
    if (name === HELPER) continue;
    for (const line of handBuiltLines(readFileSync(file, 'utf8'))) sites.push(`${name}:${line}`);
  }
  return sites;
}

describe('P1692: every address built from a handle goes through the shared helper', () => {
  it('the scan recognises a hand-built address and leaves the helper form alone (a scan that finds nothing must not pass)', () => {
    const flagged = (line: string) => HAND_BUILT.some((re) => re.test(line));
    expect(flagged('<Link to={`/p/${slug}`}>')).toBe(true);
    expect(flagged('navigate(`/p/${user.slug}/partners`)')).toBe(true);
    expect(flagged("const href = '/p/' + slug;")).toBe(true);
    expect(flagged('const url = `${origin}/p/${profile.slug}`;')).toBe(true);
    expect(flagged('to={`/compare/${profile.slug}`}')).toBe(true);
    expect(flagged('<Link to={profilePath(slug)}>')).toBe(false);
    expect(flagged('navigate(`${profilePath(user.slug)}/partners`)')).toBe(false);
    expect(flagged("pathname.startsWith('/p/')")).toBe(false);
    expect(flagged('<Route path="/p/:id" />')).toBe(false);
  });

  it('the scan reads the files that are known to link to profiles', () => {
    const names = sourceFiles().map((f) => relative(SRC, f));
    expect(names).toEqual(expect.arrayContaining(['app/components/shared/PersonRow.tsx', 'app/pages/chat/MessageRow.tsx', 'lib/canvas-boxes.ts', 'app/pages/profile-page-v2.tsx']));
  });

  it('no file outside the helper builds a profile or compare address by hand', () => {
    const sites = handBuiltSites();
    expect(sites, `${sites.length} hand-built address(es):\n${sites.join('\n')}`).toEqual([]);
  });

  // The synthetic lines above prove the pattern; these prove the scan on the real tree, which no longer holds a
  // hand-built address to find: one real edit is undone in a copy of the real file and the scan must object.
  it.each([
    ['app/components/shared/PersonRow.tsx', '<Link to={profilePath(slug)}>', '<Link to={`/p/${slug}`}>'],
    ['lib/canvas-boxes.ts', '`${profilePath(handle)}/canvas/', '`/p/${handle}/canvas/'],
    ['app/pages/profile-page-v2.tsx', 'to={comparePath(profile.slug)}', 'to={`/compare/${profile.slug}`}'],
    ['app/pages/chat/MessageRow.tsx', '<Link to={profilePath(author.slug)}', '<Link to={`/p/${author.slug}`}'],
  ])('CONTROL on the real file: undoing one edit in %s makes the scan object', (name, swept, undone) => {
    const source = readFileSync(join(SRC, name), 'utf8');
    expect(source.includes(swept), 'the swept expression must be in the real file').toBe(true);
    expect(handBuiltLines(source)).toEqual([]);
    expect(handBuiltLines(source.replace(swept, undone))).toHaveLength(1);
  });
});

function ProfileRoute() {
  const { id } = useParams();
  return <div data-testid="profile">{id}</div>;
}
function Elsewhere() {
  const location = useLocation();
  return <div data-testid="elsewhere">{location.pathname + location.search}</div>;
}

/** Renders a person row, follows its name link, and reports where the app ends up. */
function followNameLink(handle: string): { href: string; profile: string | null; elsewhere: string | null } {
  const view = render(
    <MemoryRouter initialEntries={['/list']}>
      <Routes>
        <Route path="/list" element={<PersonRow profileId="user-id-1234" slug={handle} name="Test Person" avatarColor="#2563eb" showEarBadge={false} />} />
        <Route path="/p/:id" element={<ProfileRoute />} />
        <Route path="*" element={<Elsewhere />} />
      </Routes>
    </MemoryRouter>,
  );
  const link = view.getByText('Test Person').closest('a');
  if (!link) throw new Error('the person row rendered no link');
  const href = link.getAttribute('href') ?? '';
  fireEvent.click(link);
  const result = { href, profile: view.queryByTestId('profile')?.textContent ?? null, elsewhere: view.queryByTestId('elsewhere')?.textContent ?? null };
  view.unmount();
  return result;
}

const ORDINARY = ['ana-lee', 'd', '-2', 'user-1730000000000', 'zhang-wei', 'ana.lee', 'ana_lee', 'Ana-Lee', '0f8e9a1b-2c3d-4e5f-8a9b-0c1d2e3f4a5b'];
const OTHER_SCRIPTS = ['张伟', 'josé', 'анна'];
const WITH_ADDRESS_CHARACTERS = ['../events/elsewhere?x=1&y=', 'a/b', 'a?b=c', 'a#top', 'a/../../events/x', '50%off'];

describe('P1692: a person row links to that person\'s profile, whatever the handle contains', () => {
  it.each(WITH_ADDRESS_CHARACTERS)('a handle with address characters, %j, still opens the profile route with that handle', (handle) => {
    const { href, profile, elsewhere } = followNameLink(handle);
    expect(elsewhere).toBeNull();
    expect(profile).toBe(handle);
    const resolved = new URL(href, BASE);
    expect(resolved.pathname.startsWith('/p/')).toBe(true);
    expect(resolved.pathname.split('/')).toHaveLength(3);
    expect(resolved.search).toBe('');
    expect(resolved.hash).toBe('');
  });

  it.each(ORDINARY)('KEPT: the ordinary handle %j links to the same address as before', (handle) => {
    const { href, profile } = followNameLink(handle);
    expect(href).toBe(`/p/${handle}`);
    expect(profile).toBe(handle);
  });

  it.each(OTHER_SCRIPTS)('KEPT: the handle %j opens the same profile at the same address as before', (handle) => {
    const { href, profile } = followNameLink(handle);
    expect(profile).toBe(handle);
    expect(new URL(href, BASE).pathname).toBe(new URL(`/p/${handle}`, BASE).pathname);
  });
});
