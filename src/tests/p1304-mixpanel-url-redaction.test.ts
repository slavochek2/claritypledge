/**
 * P1304 Canary — Mixpanel receives the page URL on every event ($current_url,
 * $referrer, pageview url props) and on every session-recording batch. On
 * /live/:code and /transcribe/:code that URL carries the room code.
 *
 * Runs the verbatim P1304 block from index.html (the snippet is not importable),
 * then checks: the before_send_events hook redacts the code, recording is off on
 * a code route, and the pattern is identical to sentry-filters' copy.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOM_CODE_IN_URL } from '@/lib/sentry-filters';

// P1304_INDEX_HTML lets the control run point this canary at a pre-fix index.html.
const html = readFileSync(process.env.P1304_INDEX_HTML ?? join(__dirname, '../../index.html'), 'utf8');
const CODE = 'QX7K2M';

function loadBlock(pathname: string) {
  const match = html.match(/\/\* P1304-BEGIN[\s\S]*?\/\* P1304-END \*\//);
  if (!match) throw new Error('P1304 block missing from index.html');
  const run = new Function(
    'window',
    `${match[0]}; return { redact: p1304Redact, isCodeRoute: p1304IsCodeRoute, pattern: p1304RoomCode };`,
  );
  return run({ location: { pathname } }) as {
    redact: (v: unknown) => unknown;
    isCodeRoute: boolean;
    pattern: RegExp;
  };
}

describe('P1304: Mixpanel carries no room code', () => {
  it('before_send_events redacts the code from every URL-bearing property', () => {
    const { redact } = loadBlock('/');
    const item = {
      event: '$mp_web_page_view',
      properties: {
        $current_url: `https://claritypledge.com/live/${CODE}?returnTo=%2Fevents`,
        $referrer: `https://claritypledge.com/transcribe/${CODE}`,
        current_url_path: `/live/${CODE}`,
        redirect: `/login?redirect=%2Ftranscribe%2F${CODE}`,
      },
    };
    expect(JSON.stringify(redact(item))).not.toContain(CODE);
  });

  it('turns session recording off when the page loads on a code route', () => {
    expect(loadBlock(`/live/${CODE}`).isCodeRoute).toBe(true);
    expect(loadBlock(`/transcribe/${CODE}`).isCodeRoute).toBe(true);
    expect(loadBlock('/transcribe').isCodeRoute).toBe(false);
    expect(loadBlock('/events/abc').isCodeRoute).toBe(false);
    // P1325 composed the init: recording is off on code routes OR sign-in routes, and the hook
    // redacts room codes AND sign-in tokens. p1304IsCodeRoute must still feed the recording switch.
    expect(html).toMatch(/var p1325NoRecord = p1304IsCodeRoute \|\|/);
    expect(html).toMatch(/record_sessions_percent:\s*p1325NoRecord\s*\?\s*0\s*:\s*100/);
    expect(html).toMatch(/hooks:\s*\{\s*before_send_events:\s*p1325Redact\s*\}/);
    expect(html).toMatch(/return p1304Redact\(value\)\.replace\(p1325SignInParam/);
  });

  it('uses the same pattern as the Sentry redaction', () => {
    const { pattern } = loadBlock('/');
    expect(pattern.source).toBe(ROOM_CODE_IN_URL.source);
    expect(pattern.flags).toBe(ROOM_CODE_IN_URL.flags);
  });
});
