/**
 * P1234 — the infra/application classifier that keeps a dead dev server from being
 * triaged as N product bugs. Both directions matter and only one is obvious:
 * a classifier that flags everything as infra would hide every real defect, so the
 * application-failure cases below are the load-bearing half (epistemic.md gate 7c).
 */
import { describe, it, expect } from 'vitest';
import { isDevServerCascadeFailure } from '../../e2e/reporters/infra-cascade';

describe('isDevServerCascadeFailure — transport death (must be flagged infra)', () => {
  it('flags the exact error the P1234 cascade produced (verbatim from a live run)', () => {
    expect(
      isDevServerCascadeFailure(
        'Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5100/\n' +
          'Call log:\n  - navigating to "http://localhost:5100/", waiting until "load"',
        'http://localhost:5100',
      ),
    ).toBe(true);
  });

  it.each([
    'net::ERR_CONNECTION_RESET',
    'net::ERR_EMPTY_RESPONSE',
    'net::ERR_CONNECTION_CLOSED',
    'ECONNREFUSED',
    'ECONNRESET',
  ])('flags %s behind a Playwright call', (marker) => {
    expect(isDevServerCascadeFailure(`Error: page.goto: ${marker} at http://localhost:5100/`, 'http://localhost:5100')).toBe(true);
  });

  it('flags a request-level transport failure too', () => {
    expect(
      isDevServerCascadeFailure('request.get: connect ECONNREFUSED 127.0.0.1:5100', 'http://localhost:5100'),
    ).toBe(true);
  });

  it('flags when no baseURL is known (cannot disprove the origin)', () => {
    expect(isDevServerCascadeFailure('page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5100/')).toBe(true);
  });
});

/**
 * The half that protects real bugs. 52 e2e specs collect consoleErrors and several
 * embed the raw array into the failure message, so a genuine product regression can
 * carry a transport marker in its text. If any of these are flagged [infra], the
 * reporter prints "do NOT triage as a product bug" over a real defect.
 */
describe('isDevServerCascadeFailure — a REAL defect carrying a transport marker in its text', () => {
  it('does not flag an unfiltered consoleErrors assertion (public-pages-smoke.spec.ts:32 shape)', () => {
    expect(
      isDevServerCascadeFailure(
        'Error: expect(received).toHaveLength(expected)\n' +
          'Console errors on /: Failed to load resource: net::ERR_CONNECTION_REFUSED\n' +
          'Expected length: 0\nReceived length: 1',
        'http://localhost:5100',
      ),
    ).toBe(false);
  });

  it('does not flag a console message whose URL merely looks like a Playwright call', () => {
    expect(
      isDevServerCascadeFailure(
        'Error: expect(received).toEqual(expected)\n' +
          '  "Failed to load resource http://localhost:5100/src/page.tsx:12 net::ERR_CONNECTION_RESET"',
        'http://localhost:5100',
      ),
    ).toBe(false);
  });

  it('does not attribute another host outage to our dev server (prod-verify spec shape)', () => {
    expect(
      isDevServerCascadeFailure(
        'Error: page.goto: net::ERR_CONNECTION_REFUSED at https://claritypledge.com/agreements/new',
        'http://localhost:5100',
      ),
    ).toBe(false);
  });

  it('still flags our own origin on a different path', () => {
    expect(
      isDevServerCascadeFailure(
        'Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5100/live',
        'http://localhost:5100',
      ),
    ).toBe(true);
  });
});

describe('isDevServerCascadeFailure — application failures (must NOT be flagged infra)', () => {
  it.each([
    ['assertion failure', 'expect(received).toHaveText(expected)\nExpected: "1"\nReceived: "0"'],
    [
      'locator timeout',
      'locator.click: Timeout 5000ms exceeded.\nwaiting for getByRole(\'button\', { name: /Agree/i })',
    ],
    [
      'the P1043 DB-presence timeout — a real defect this spec explicitly excludes',
      '[waitForDBPresence] Timed out waiting for clarity_sessions.joiner_name',
    ],
    ['HTTP error status, which means a server DID answer', 'Request failed with status code 500'],
    ['a DNS failure, which is not our dev server dying', 'net::ERR_NAME_NOT_RESOLVED'],
    ['an app-side network error with no transport marker', 'TypeError: Failed to fetch'],
  ])('does not flag %s', (_label, text) => {
    expect(isDevServerCascadeFailure(text, 'http://localhost:5100')).toBe(false);
  });

  it.each([undefined, null, ''])('does not flag empty input (%s)', (text) => {
    expect(isDevServerCascadeFailure(text, 'http://localhost:5100')).toBe(false);
  });
});
