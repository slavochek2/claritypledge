/**
 * P1304 Canary — the /live room code is a bearer capability and must never
 * reach a third-party telemetry payload (Mixpanel event properties, Sentry
 * context / breadcrumb / extra).
 *
 * Static scan of src/: every telemetry call's argument text is extracted by
 * balanced-paren matching and checked for a code-named property key. Fails
 * while any call site still sends the code; stays as the guard afterwards so
 * the count cannot creep back (it grew from 8 to 38 after P1057 named it).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');

const TELEMETRY_CALLS = [
  'analytics.track(',
  'trackLiveEvent(',
  'Sentry.setContext(',
  'Sentry.addBreadcrumb(',
  'Sentry.captureException(',
  'Sentry.captureMessage(',
];

// A property key (`key:`) or shorthand (`{ key,` / `, key }`) named after the code.
const CODE_KEY = /[{,]\s*(session_?[cC]ode|room_?[cC]ode)\s*[:,}]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'tests' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function callArguments(source: string, openParenIndex: number): string {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) return source.slice(openParenIndex, i + 1);
  }
  return source.slice(openParenIndex);
}

export function findCodeInTelemetry(): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const call of TELEMETRY_CALLS) {
      let from = 0;
      for (let at = source.indexOf(call, from); at !== -1; at = source.indexOf(call, from)) {
        const args = callArguments(source, at + call.length - 1);
        if (CODE_KEY.test(args)) {
          const line = source.slice(0, at).split('\n').length;
          hits.push(`${relative(SRC, file)}:${line} ${call}`);
        }
        from = at + call.length;
      }
    }
  }
  return hits;
}

describe('P1304: room code never reaches telemetry payloads', () => {
  it('the scanner catches a known-bad payload (control)', () => {
    expect(CODE_KEY.test("('evt', { session_code: session.code })")).toBe(true);
    expect(CODE_KEY.test('(err, { extra: { sessionCode, chunkNumber } })')).toBe(true);
    expect(CODE_KEY.test("('evt', { session_id: session.id, codeLength: 6 })")).toBe(false);
  });

  it('no analytics.track / Sentry call in src/ carries a code-named property', () => {
    expect(findCodeInTelemetry()).toEqual([]);
  });
});
