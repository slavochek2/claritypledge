/**
 * @file no-regex-lookbehind.test.ts
 * @description Safari/iOS < 16.4 throws `SyntaxError: invalid group specifier name` when it
 * PARSES a lookbehind `(?<=` / `(?<!` — so one in any bundled module kills the page that loads
 * it (Sentry JAVASCRIPT-REACT-3N, 2026-10-06: the event prepare page on iOS 16.2). P983's
 * canary covered linkify.ts only, and two new lookbehinds shipped elsewhere; this scans all of
 * src/. Node supports lookbehind, so the check reads source text, as P983's does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { eventTopic } from '../app/prototypes/events/prep/prep-plan';
import { sentences } from '../app/tree/landing-lab/first/copy';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'tests' ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('no regex lookbehind in app source (Safari < 16.4)', () => {
  it('scans a non-trivial file set', () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(100);
  });

  it('no source file contains (?<= or (?<!', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => /\(\?<[=!]/.test(readFileSync(f, 'utf-8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});

// The rewrites must split exactly as the lookbehind did (Node runs the old form as the oracle).
const oldTopic = (t: string) => {
  const w = t.replace(/^[^:]{0,40}#\s*\d+\s*:\s*/, '').trim();
  const s = w.split(new RegExp('(?<=[.?!])\\s+'))[0] ?? w;
  return s.replace(/[.]$/, '').trim() || t;
};
const oldSentences = (p: string) => p.split(new RegExp('(?<=[.?!])\\s+'));
const CASES = [
  'Clarity Night #2: AI and Your Ikigai. Sinek, Tan, Naval, Watts and Brooks Disagree',
  'One. Two?  Three!\nFour', 'No end mark', 'A.B c', 'Ends. ', 'a.. b', '', '?! x', 'Night #3: Why?',
];

describe('lookbehind-free rewrites match the old split', () => {
  it.each(CASES)('eventTopic(%j)', (c) => expect(eventTopic(c)).toBe(oldTopic(c)));
  it.each(CASES)('sentences(%j)', (c) => expect(sentences(c)).toEqual(oldSentences(c)));
});
