/**
 * @file p1232-live-join-helper.spec.ts
 * @description P1232: the join step must FAIL FAST, never hang.
 *
 * The defect this file guards is not "joining is broken" — it is that a dead selector made
 * the join step block until the whole test timed out, producing a bare timeout with no
 * assertion error. `page.fill()` auto-waits, so a fill against the input P396 removed did not
 * error; it consumed the entire test budget and reported nothing about why.
 *
 * That property is testable WITHOUT a working two-party session, which matters because the
 * creator flow is currently broken repo-wide (see the spec's Blocked section) and every
 * end-to-end join test dies before reaching a join step at all.
 *
 * What is asserted here: on a page with no join UI, the helper returns promptly and reports
 * what it OBSERVED (`no-join-ui`) rather than blocking. What is NOT asserted here: that a real
 * guest actually joins a real room — that needs the creator flow and is deferred, explicitly,
 * to the spec that fixes it.
 */
import { test, expect } from '@playwright/test';
import { completeLiveJoinIfPrompted } from './helpers/live-join';

test.describe('P1232: the live-join helper fails fast instead of hanging', () => {
  test('returns no-join-ui promptly when no join controls are present', async ({ page }) => {
    await page.goto('/');

    const started = Date.now();
    const outcome = await completeLiveJoinIfPrompted(page, { timeout: 3000 });
    const elapsed = Date.now() - started;

    expect(outcome).toBe('no-join-ui');
    // The regression was a block until the TEST timeout (30s default). Anything near the
    // helper's own timeout proves it bounded itself; the old code could not.
    expect(elapsed).toBeLessThan(10000);
    console.log(`[P1232] helper returned "${outcome}" in ${elapsed}ms`);
  });

  test('does not hang on a room code that does not resolve', async ({ page }) => {
    await page.goto('/live/ZZZZZZ');

    const started = Date.now();
    const outcome = await completeLiveJoinIfPrompted(page, { timeout: 3000 });
    const elapsed = Date.now() - started;

    // Either shape is legitimate here — the point is that it RESOLVES rather than blocking.
    expect(['guest-form', 'retry-button', 'no-join-ui']).toContain(outcome);
    expect(elapsed).toBeLessThan(10000);
    console.log(`[P1232] unresolvable room -> "${outcome}" in ${elapsed}ms`);
  });
});
