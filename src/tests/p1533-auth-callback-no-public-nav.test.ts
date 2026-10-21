/**
 * @file p1533-auth-callback-no-public-nav.test.ts
 * @description P1533: signing in passes through /auth/callback before the session exists, so the
 * stored-session shortcut (P1512) cannot pick the signed-in shell there. The page must wear the
 * logo-only header, never the public top menu (Feed / Letters / Groups) that flashed during login.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(`${process.cwd()}/src/App.tsx`, 'utf8');

function routeElement(path: string): string {
  const at = app.indexOf(`path="${path}"`);
  expect(at, `route ${path} exists`).toBeGreaterThan(-1);
  return app.slice(at, app.indexOf('/>\n', app.indexOf('</ClarityLandingLayout>', at)));
}

describe('P1533 /auth/callback chrome', () => {
  it('renders the logo-only header, not the public menu', () => {
    expect(routeElement('/auth/callback')).toMatch(/<ClarityLandingLayout surface="public" logoOnly>/);
  });

  it('control: a public page still gets the full public layout', () => {
    expect(routeElement('/intro')).toMatch(/logoOnly/);
    expect(app).toMatch(/<ClarityLandingLayout surface="public">/);
  });
});
