/**
 * @file p958-webinar-date-line.spec.ts
 * Regression coverage for P958 — WebinarDateLine is now DB-driven.
 *
 * Two AC-critical states:
 *   no-event:   date line absent; CTA relabels to "Try a Clarity Letter" → /letter/ck
 *   with-event: date line shows "Live · <weekday>, <date> · <time> <city> time";
 *               CTA stays "Join the next Clarity Experiment" → /events/experiment
 *
 * The no-event state is the bug case (always present before the fix) and is tested
 * against real API (test DB has no webinar events). The with-event state uses
 * page.route() to inject a future Clarity Experiment event without needing the
 * founder's HOST_ID profile in the test DB.
 */

import { test, expect } from '@playwright/test';
import { WEBINAR_SERIES } from '../src/app/data/webinar-series';

// A future event date — far enough ahead that it won't become past before tests complete
const FUTURE_ISO = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // +30 days

/** Supabase PostgREST returns an array of rows. Build a minimal EventWithHost shape. */
function mockWebinarEvent() {
  return [
    {
      id: '00000000-0000-0000-0000-000000000958',
      slug: 'clarity-experiment-1-test',
      title: `${WEBINAR_SERIES.TITLE_PREFIX}1 — E2E test`,
      description: 'E2E test event',
      datetime: FUTURE_ISO,
      duration_minutes: 90,
      timezone: 'Asia/Bangkok',
      location: 'Online',
      status: 'upcoming',
      host_id: WEBINAR_SERIES.HOST_ID,
      profiles: {
        id: WEBINAR_SERIES.HOST_ID,
        name: 'Test Host',
        slug: 'test-host',
        avatar_color: '#000000',
        avatar_url: null,
        has_pledged: true,
      },
    },
  ];
}

test.describe('p958: WebinarDateLine is DB-driven', () => {
  test('smoke + no-event: date line absent, CTA shows "Try a Clarity Letter"', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // No console errors
    expect(consoleErrors, `Console errors on /: ${consoleErrors.join(', ')}`).toHaveLength(0);

    // No hardcoded date line — the bug manifestation
    await expect(page.getByText(/Live ·/)).toHaveCount(0);

    // Both hero and bottom CTA relabel to the no-event fallback (2 occurrences)
    const ctaLinks = page.getByRole('link', { name: 'Try a Clarity Letter' });
    await expect(ctaLinks).toHaveCount(2);
    await expect(ctaLinks.first()).toHaveAttribute('href', '/letter/ck');
    await expect(ctaLinks.nth(1)).toHaveAttribute('href', '/letter/ck');

    // Program-page CTAs do NOT say "Join the next Clarity Experiment".
    // The nav bar keeps that label as a separate component (not in scope), so the
    // correct count is 1 (nav only) — NOT 3 (nav + hero + bottom).
    await expect(
      page.getByRole('link', { name: 'Join the next Clarity Experiment' }),
    ).toHaveCount(1); // nav only
  });

  test('with-event: date line visible, CTA shows "Join the next Clarity Experiment"', async ({ page }) => {
    // Intercept the Supabase events REST call and inject a future webinar event
    // Intercept only the events TABLE query (not event-prefixed tables like events_rsvps).
    // Playwright route predicate receives a URL object — use .pathname, not .url().
    await page.route(
      url => /\/rest\/v1\/events(\?|$)/.test(url.pathname + (url.search ? '?' : '')),
      async route => {
        const headers = { 'Content-Type': 'application/json' };
        await route.fulfill({ status: 200, headers, body: JSON.stringify(mockWebinarEvent()) });
      },
    );

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);

    // Date line renders at both hero and bottom CTA ("Live · <weekday>, <month> <day> · <time> <city> time")
    await expect(page.getByText(/Live ·/)).toHaveCount(2);

    // With event: 3 "Join the next Clarity Experiment" links — nav + hero + bottom.
    // This proves the program-page CTAs changed (in no-event state only nav shows this label).
    const eventCtas = page.getByRole('link', { name: 'Join the next Clarity Experiment' });
    await expect(eventCtas).toHaveCount(3);
  });

  test('grace-window event is excluded from the date line', async ({ page }) => {
    // An event that started 1h ago is within the 5h grace window (getUpcomingEvents returns it),
    // but getNextUpcomingWebinar filters with `datetime > now`, so it must not appear in date line.
    const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // -1h
    const gracePastEvent = [{ ...mockWebinarEvent()[0], datetime: pastIso }];

    await page.route(
      url => /\/rest\/v1\/events(\?|$)/.test(url.pathname + (url.search ? '?' : '')),
      async route => {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gracePastEvent),
        });
      },
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Grace-window event must NOT appear as the next session
    await expect(page.getByText(/Live ·/)).toHaveCount(0);
    // Fallback CTA shown instead
    await expect(page.getByRole('link', { name: 'Try a Clarity Letter' }).first()).toBeVisible();
  });
});
