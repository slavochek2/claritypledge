/**
 * @file p983-reproduce.test.ts
 * @description Canary for P983 — Safari < 16.4 crash in linkifyText.
 *
 * `URL_PATTERN` in linkify.ts used a negative lookbehind `(?<!\w)`, which Safari/iOS
 * only supports from 16.4 onward. On older Safari, `new RegExp(...)` throws
 * `SyntaxError: Invalid regular expression: invalid group specifier name` at
 * construction time — before any matching happens. Node/jsdom supports lookbehind,
 * so a construct-and-catch test can't reproduce the failure; this test asserts on
 * the regex source string directly, which is durable across environments.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const linkifySource = readFileSync(
  join(__dirname, '../app/utils/linkify.ts'),
  'utf-8'
);

describe('P983: linkify.ts must not use regex lookbehind (Safari < 16.4 compat)', () => {
  it('URL_PATTERN source contains no lookbehind group specifier', () => {
    // (?<! or (?<= are lookbehind syntax unsupported before Safari 16.4.
    // Named capture groups (?<name>...) are a DIFFERENT construct and are fine —
    // only flag lookbehind specifically.
    const lookbehindPattern = /\(\?<[!=]/;
    expect(linkifySource).not.toMatch(lookbehindPattern);
  });
});
