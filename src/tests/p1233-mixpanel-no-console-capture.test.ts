/**
 * P1233 — Mixpanel's record_console defaults to true, and replay masking covers the DOM only, so
 * every console.* argument (user IDs, Supabase error detail) would ship with 100% of replays.
 * The init must set it false explicitly while keeping session recording on (P1216 depends on it).
 *
 * Captures the real options object by running the verbatim init script against a stub mixpanel,
 * so a comment or a second init call cannot satisfy the check by text alone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');

function initOptions(source: string, pathname = '/'): Record<string, unknown>[] {
  const script = source.match(/<script type="text\/javascript">\s*if \(window\.location\.hostname[\s\S]*?<\/script>/);
  if (!script) throw new Error('Mixpanel init script missing from index.html');
  const body = script[0].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
  const calls: Record<string, unknown>[] = [];
  const mixpanel = { __SV: 1, init: (_token: string, opts: Record<string, unknown>) => calls.push(opts) };
  const window = { location: { hostname: 'claritypledge.com', pathname }, mixpanel };
  new Function('window', 'document', 'mixpanel', body)(window, {}, mixpanel);
  return calls;
}

describe('P1233: Mixpanel replay does not capture console output', () => {
  it('sets record_console: false on the single init call', () => {
    const calls = initOptions(html);
    expect(calls).toHaveLength(1);
    expect(calls[0].record_console).toBe(false);
  });

  it('keeps session recording on (P1216 relies on Mixpanel replay)', () => {
    expect(initOptions(html)[0].record_sessions_percent).toBe(100);
  });

  it('fails when the option is removed (control on the real file)', () => {
    const mutated = html.replace(/\n\s*record_console: false,/, '');
    expect(mutated).not.toBe(html);
    expect(initOptions(mutated)[0].record_console).toBeUndefined();
  });
});
