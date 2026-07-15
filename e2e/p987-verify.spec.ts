import { test, expect } from '@playwright/test';

// Route map (current, as of P987 front-door realignment):
//   /         → ProgramPage (key-hire landing) — the public homepage.
//   /coach    → coach landing (CoachPartnershipPage).
//   /founder  → co-founder landing (OldLanding2Page component). Linked from nav as
//               "For co-founders". This replaced the old dev-only /tree/old-landing-2
//               route, which no longer exists (falls through to the catch-all 404).
//   /program  → €950 co-founder offer (OffersPage). Deliberately parked: no nav link,
//               still reachable by direct URL, carries noindex.
//
// Nav trap: SimpleNavigation renders "For hiring" (→/), "For coaches" (→/coach), and
// "For co-founders" (→/founder) on every page. Content assertions below are scoped to
// `main` (the layout's content region — see clarity-landing-layout.tsx) so a bare
// page.getByText() can never be silently satisfied by a nav link instead of real page
// content.

test.describe('P987: CP Front-Door Realignment', () => {
  test('UAT-1/2/5/6/8: hero, CTA, stat, closing, pledge link present', async ({ page }) => {
    await page.goto('/');
    const main = page.locator('main');

    // Hero (split across <br> + timed-reveal span — match the h1 container)
    const heroH1 = main.locator('h1', { hasText: /Keep the hire you can't/i });
    await expect(heroH1).toBeVisible();
    await expect(heroH1).toContainText('afford to lose.', { timeout: 5000 });

    // Single primary CTA
    const cta = main.getByRole('link', { name: /book your free alignment audit/i }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', /\/intro/);

    // AUDIT_MICROCOPY sits under both the hero CTA and the closing CTA — appears twice.
    // The "A live 1:1 session" clause is the disclosure of what the CTA actually books,
    // and it is asserted deliberately: a shortening pass once dropped it from copy and
    // left it alive only in the SEO description, where no reader sees it. This assertion
    // is the tripwire for that regression — do not relax it to a substring match.
    const microcopy = main.getByText(
      'A live 1:1 session. We find the blind spot in how you align with your team. Starts with a 15-min call.',
      { exact: true }
    );
    await expect(microcopy).toHaveCount(2);

    // "Take the Pledge" secondary CTA EXISTS (inverted from the old stale toHaveCount(0)).
    const pledgeLink = main.getByRole('link', { name: /take the pledge/i });
    await expect(pledgeLink).toBeVisible();
    await expect(pledgeLink).toHaveAttribute('href', '/sign-pledge');

    // Pledger avatar stack (PledgerAvatarStack) is present. It renders one of two DOM
    // shapes depending on whether the async profile fetch has resolved: a loaded
    // `<Link to="/pledgers">`, or (while loading / on zero count) an aria-hidden
    // height-reserving placeholder — both count as "present"; assert exactly one exists.
    const avatarStackLoaded = main.locator('a[href="/pledgers"]');
    const avatarStackPlaceholder = main.locator('div.pt-2[aria-hidden="true"]');
    await expect(avatarStackLoaded.or(avatarStackPlaceholder)).toHaveCount(1);

    // Stat section (id="stakes") — scroll into view before reading its text; numbers
    // count up 0→N on scroll-in so we assert the surrounding TEXT, never the digits.
    const stakes = main.locator('#stakes');
    await stakes.scrollIntoViewIfNeeded();
    await expect(
      main.getByText(
        /of new hires fail within 18 months — 9 out of 10 of them because of attitude, not a lack of technical skills\./i
      )
    ).toBeVisible();
    await expect(main.getByText('Small gaps compound.', { exact: true })).toBeVisible();
    await expect(
      main.getByText(/of their salary is what replacing a leader costs you\./i)
    ).toBeVisible();

    // Closing copy — "Your new hire nods." and "And maybe holds back." share one h2
    // (joined by a <br>/<span>), so the h2's full text content is neither string alone.
    await expect(main.getByText(/Your new hire nods\./i)).toBeVisible();
    await expect(main.getByText(/And maybe holds back\./i)).toBeVisible();
    await expect(main.getByText('Stop before they give up on you.', { exact: true })).toBeVisible();

    // No co-founder / price wording anywhere on "/"
    await expect(page.getByText(/i've lost co-founders/i)).toHaveCount(0);
    await expect(page.getByText(/€950/i)).toHaveCount(0);
  });

  test('UAT-3: /founder renders the co-founder landing; the old /tree/old-landing-2 route is gone', async ({ page }) => {
    await page.goto('/founder');
    const founderH1 = page.locator('main').locator('h1', { hasText: /I've lost co-founders\./i });
    await expect(founderH1).toBeVisible();
    await expect(founderH1).toContainText('I help you keep yours.', { timeout: 5000 });

    // The pre-reframe route no longer exists — it must NOT render the co-founder page.
    // Honest check: no h1 at all, and the old headline text is absent from `main`.
    await page.goto('/tree/old-landing-2');
    await expect(page.locator('main').locator('h1')).toHaveCount(0);
    await expect(page.locator('main').getByText(/i've lost co-founders/i)).toHaveCount(0);
  });

  test('UAT-4: /about -> Work with Slava reachable', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('link', { name: /work with slava/i }).first()).toBeVisible();
  });

  test('UAT-9: ?referrer and ?login redirects still fire', async ({ page }) => {
    await page.goto('/?login=1');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    await page.goto('/?referrer=test_verify_x');
    await expect(page).toHaveURL(/\/sign-pledge/, { timeout: 10000 });
  });

  test('UAT-10: /program out of nav, still reachable, noindex, price kept', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /co-founder program/i })).toHaveCount(0);

    await page.goto('/program');
    await expect(page.getByText(/€950/i).first()).toBeVisible();
    const robotsMeta = page.locator('meta[name="robots"]');
    await expect(robotsMeta).toHaveAttribute('content', /noindex/i);
  });
});
