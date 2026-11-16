/**
 * @file p1692-profile-path.test.ts
 * @description P1692: the properties of the one helper that turns data into an address segment
 * (`src/lib/profile-path.ts`: `pathSegment`, and `profilePath` / `comparePath` built on it). A handle is always
 * exactly one address segment: the router, the browser, and the two chained all resolve the result to
 * `/p/<one segment>` (or `/compare/<one segment>`) with no query and no fragment. Ordinary handles produce the
 * address they always had (epistemic gate 7c).
 *
 * The route reads the handle back unchanged, with two stated exceptions that no encoding can avoid:
 *   - a handle that is only `.` or `..` cannot be an address segment at all (the browser reads `%2e%2e` as `..`),
 *     so it gets an address that stays under the route and names no other page;
 *   - the router decodes the sequence `%2F` a second time inside a route parameter, so a handle that contains that
 *     literal text reads back with `/` in its place.
 * Reading back is checked with `matchRoutes`, which decodes the way the router does (`matchPath` does not).
 */
import { describe, it, expect } from 'vitest';
import { matchRoutes, resolvePath } from 'react-router-dom';
import { pathSegment, profilePath, comparePath } from '@/lib/profile-path';

const BASE = 'https://app.test';
const ROUTES = [{ path: '/p/:id' }, { path: '/p/:id/partners' }, { path: '/compare/:slug' }, { path: '/letter/:letterId/confirm' }, { path: '*' }];

const ORDINARY = ['ana-lee', 'd', '-2', 'user-1730000000000', 'zhang-wei', 'ana.lee', 'ana_lee', 'Ana-Lee', 'a~b', '0f8e9a1b-2c3d-4e5f-8a9b-0c1d2e3f4a5b', '..a', 'a..', '...'];
const OTHER_SCRIPTS = ['张伟', 'josé', 'анна'];
const WITH_ADDRESS_CHARACTERS = [
  '../events/elsewhere?x=1&y=',
  'a/b',
  'a\\b',
  'a?b=c',
  'a#top',
  'a/../../events/x',
  '//elsewhere.example',
  '%2e%2e',
  '%2e%2e%2fevents',
  '50%off',
  'a b',
  '\t..',
  '..\n',
  'a;b',
  'a@b',
  'a+b',
];
const ONLY_DOTS = ['.', '..'];
const WITH_LITERAL_ENCODED_SLASH = ['a%2Fb', '%2E%2E%2Fevents'];

/** Every resolver a link passes through: the router (in-app navigation), the browser (address bar, reload), and the browser reading the router's result. */
function resolved(address: string) {
  const routed = resolvePath(address);
  const browser = new URL(address, BASE);
  const chained = new URL(routed.pathname + routed.search + routed.hash, BASE);
  return { paths: [routed.pathname, browser.pathname, chained.pathname], search: browser.search + routed.search + chained.search, hash: browser.hash + routed.hash + chained.hash, origin: chained.origin };
}

/** The route parameter the router reads from an address. */
function readBack(address: string, name: 'id' | 'slug' | 'letterId'): string | undefined {
  return matchRoutes(ROUTES, address)?.at(-1)?.params[name];
}

describe('P1692: profilePath turns a handle into exactly one address segment', () => {
  it.each([...WITH_ADDRESS_CHARACTERS, ...WITH_LITERAL_ENCODED_SLASH, ...ONLY_DOTS, ...ORDINARY, ...OTHER_SCRIPTS])('%j resolves to /p/<one segment>, with no query and no fragment', (handle) => {
    const r = resolved(profilePath(handle));
    for (const pathname of r.paths) {
      expect(pathname.startsWith('/p/')).toBe(true);
      expect(pathname.split('/')).toHaveLength(3);
      expect(pathname.split('/')[2]).not.toBe('');
    }
    expect(r.search).toBe('');
    expect(r.hash).toBe('');
    expect(r.origin).toBe(BASE);
  });

  it.each([...WITH_ADDRESS_CHARACTERS, ...ORDINARY, ...OTHER_SCRIPTS])('the profile route reads %j back unchanged', (handle) => {
    expect(readBack(profilePath(handle), 'id')).toBe(handle);
  });

  it.each([...WITH_ADDRESS_CHARACTERS, ...WITH_LITERAL_ENCODED_SLASH, ...ONLY_DOTS])('a sub-page of %j stays under that profile', (handle) => {
    const own = resolved(profilePath(handle));
    for (const sub of ['partners', 'pledge', 'badge', 'canvas/sales']) {
      const r = resolved(`${profilePath(handle)}/${sub}`);
      r.paths.forEach((pathname, i) => expect(pathname).toBe(`${own.paths[i]}/${sub}`));
    }
  });

  it.each(ONLY_DOTS)('STATED EXCEPTION: a handle that is only dots, %j, has no address of its own; its link stays under /p/', (handle) => {
    for (const pathname of resolved(profilePath(handle)).paths) {
      expect(pathname).not.toBe('/');
      expect(pathname).not.toBe('/p/');
    }
    expect(readBack(profilePath(handle), 'id')).not.toBe(handle);
  });

  it.each(WITH_LITERAL_ENCODED_SLASH)('STATED EXCEPTION: the router decodes a literal %%2F a second time, so %j reads back with a slash', (handle) => {
    expect(readBack(profilePath(handle), 'id')).toBe(handle.replace(/%2F/g, '/'));
  });

  it.each(ORDINARY)('KEPT: the ordinary handle %j has the address it always had', (handle) => {
    expect(profilePath(handle)).toBe(`/p/${handle}`);
    expect(comparePath(handle)).toBe(`/compare/${handle}`);
    expect(pathSegment(handle)).toBe(handle);
  });

  it.each(OTHER_SCRIPTS)('KEPT: the handle %j lands on the same address as before', (handle) => {
    expect(new URL(profilePath(handle), BASE).pathname).toBe(new URL(`/p/${handle}`, BASE).pathname);
  });

  it('KEPT: a missing handle gives the bare route root, as before', () => {
    expect(profilePath('')).toBe('/p/');
  });
});

describe('P1692: comparePath and pathSegment follow the same rule', () => {
  it.each([...WITH_ADDRESS_CHARACTERS, ...ONLY_DOTS])('%j resolves to /compare/<one segment>', (handle) => {
    const r = resolved(comparePath(handle));
    for (const pathname of r.paths) {
      expect(pathname.startsWith('/compare/')).toBe(true);
      expect(pathname.split('/')).toHaveLength(3);
    }
    expect(r.search).toBe('');
    expect(r.hash).toBe('');
  });

  it.each(WITH_ADDRESS_CHARACTERS)('the compare route reads %j back unchanged', (handle) => {
    expect(readBack(comparePath(handle), 'slug')).toBe(handle);
  });

  it.each([...WITH_ADDRESS_CHARACTERS, ...ONLY_DOTS])('a value %j placed in the middle of an address stays one segment', (value) => {
    const address = `/letter/${pathSegment(value)}/confirm`;
    for (const pathname of resolved(address).paths) {
      expect(pathname.startsWith('/letter/')).toBe(true);
      expect(pathname.endsWith('/confirm')).toBe(true);
      expect(pathname.split('/')).toHaveLength(4);
    }
  });

  it.each(WITH_ADDRESS_CHARACTERS)('the letter confirm route reads %j back unchanged', (value) => {
    expect(readBack(`/letter/${pathSegment(value)}/confirm`, 'letterId')).toBe(value);
  });
});
