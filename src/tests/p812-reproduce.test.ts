/**
 * @file p812-reproduce.test.ts
 * @description Canary for P812 — the GCP Cloud Function signing ml-training
 * URLs does NOT include `x-goog-content-length-range` in its canonical request.
 * The P802 client-side fix added that header to every PUT, which GCS rejects
 * as `MalformedSecurityHeader`. The fix is to remove the header from the
 * client PUT.
 *
 * This canary is source-read, not a runtime assertion:
 *   - runtime assertions would require standing up a mock GCS endpoint or
 *     hitting real prod, both of which are heavier than reading the one line
 *     of source that is load-bearing.
 *   - the probes `scripts/probe-gcs-upload.mjs` and
 *     `scripts/probe-gcs-upload-no-header.mjs` provide the runtime proof
 *     (exit 2 with MalformedSecurityHeader / exit 0 with status 200
 *     respectively) against real prod.
 *
 * FAILS before the fix (header is present in `uploadToGCS`).
 * PASSES after the fix (header is removed).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC_PATH = resolve(__dirname, '../app/data/api.ts');
const src = readFileSync(SRC_PATH, 'utf-8');

describe('P812: uploadToGCS must not send x-goog-content-length-range', () => {
  it('extracts the uploadToGCS function body', () => {
    // Sanity: find the function we care about. If the name changes, this
    // canary must be updated deliberately rather than passing vacuously.
    expect(src).toMatch(/async\s+function\s+uploadToGCS\s*\(/);
  });

  // TDD canary: this assertion SHOULD fail today because the bug exists.
  // `it.fails` makes vitest accept the failure as the expected outcome, which
  // keeps `npm test` green while still flagging the bug. When the fix lands
  // (header removed from uploadToGCS), the assertion will PASS, `it.fails`
  // will then report "test passed but was expected to fail" — that is the
  // signal to flip this to a plain `it` and keep it as a permanent regression
  // guard. /fix is responsible for the flip.
  it.fails('uploadToGCS does not reference `x-goog-content-length-range` (flip to `it` post-fix)', () => {
    // Narrow to the uploadToGCS function body so a comment elsewhere in the
    // file cannot mask a real regression.
    const fnStart = src.indexOf('async function uploadToGCS');
    expect(fnStart).toBeGreaterThan(0);

    // Walk forward to the matching closing brace. Simple brace-counter —
    // fine for TS without templated braces in strings/regexes up to that
    // point (verified by eye; canary will fail loudly if the file changes
    // shape).
    let depth = 0;
    let i = src.indexOf('{', fnStart);
    const bodyStart = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = src.slice(bodyStart, i + 1);

    expect(body).not.toMatch(/x-goog-content-length-range/i);
  });
});
