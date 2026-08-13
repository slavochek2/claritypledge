/**
 * @file p1075-reproduce.spec.ts
 * Canary for P1075: feed-page.tsx never passes the active tag to
 * getPublicStoriesFeed/getPublicPointsFeed -- filtering happens client-side on a
 * single fixed 50-row page instead of server-side before the DB applies LIMIT/OFFSET.
 *
 * This test proves the defect without depending on a real large dataset: it mocks
 * the REST response so the server-side-filtered request (tag present in the outgoing
 * query) returns the matching story, while the naive unfiltered request (today's
 * actual behavior) returns nothing -- exactly what happens for real once a tag's
 * matches fall outside the fetched window in a table with >50 public rows.
 */

import { test, expect } from '@playwright/test';

const TEST_TAG = 'e2ep1075';

const MOCK_STORY = {
  id: '00000000-0000-4000-8000-000000000001',
  author_id: '00000000-0000-4000-8000-000000000002',
  content: 'P1075 canary story content',
  visibility: 'public',
  current_version: 1,
  understood_count: 0,
  created_at: '2026-08-13T00:00:00.000Z',
  updated_at: '2026-08-13T00:00:00.000Z',
  tags: [TEST_TAG],
  system_tags: [],
  banner_url: null,
  image_url: null,
  author: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'P1075 Canary Author',
    slug: 'p1075-canary-author',
    role: null,
    avatar_color: '#3B82F6',
    avatar_url: null,
    ears_count: 0,
    has_pledged: false,
  },
};

test.describe('P1075: feed tag filter must be server-side', () => {
  test.beforeEach(async ({ page }) => {
    // Points fetch happens in the same Promise.all regardless of active tab --
    // stub it out so the test never depends on real DB content.
    await page.route('**/rest/v1/points*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
  });

  test('a tag whose matches are outside the naive 50-row window still renders', async ({ page }) => {
    await page.route('**/rest/v1/stories*', (route) => {
      const url = route.request().url();
      const serverSideFiltered = url.includes('cs.') && url.includes(TEST_TAG);
      const body = serverSideFiltered ? [MOCK_STORY] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto(`/feed?tab=stories&tag=${TEST_TAG}&sort=oldest`);
    await page.waitForSelector('[role="tabpanel"]');

    // Fails today: feed-page.tsx passes `undefined` as the tag to
    // getPublicStoriesFeed, so the outgoing request never carries `cs.` + the tag --
    // the mock above then returns [], and the empty state renders instead of the story.
    await expect(page.getByText('P1075 canary story content')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/No content matching/)).not.toBeVisible();
  });
});
