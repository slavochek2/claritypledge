/**
 * P1392 — "/" is the feed on Stories; the feed's tag cloud, sort pill and desktop rail.
 * Source-level contracts for the routing; the rendered tab default lives in p491-hashtag-feed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const app = read('src/App.tsx');
const feed = read('src/app/pages/feed-page.tsx');

describe('P1392 — feed-first homepage', () => {
  it('"/" redirects to /feed for everyone, forwarding query and hash', () => {
    const fn = app.slice(app.indexOf('function HomeRedirect'), app.indexOf('/** P486'));
    expect(fn).toMatch(/<Navigate to=\{`\/feed\$\{location\.search\}\$\{location\.hash\}`\} replace \/>/);
    expect(fn).not.toMatch(/BuildRightThingLanding/);
  });

  it('the builders landing is served at /builders', () => {
    expect(app).toMatch(/path="\/builders"[\s\S]{0,200}<BuildRightThingLanding \/>/);
  });

  it('caps the tag cloud and hides internal tags', () => {
    expect(feed).toMatch(/const TAG_CLOUD_LIMIT = 5;/);
    expect(feed).toMatch(/!isInternalTag\(tag\)/);
  });

  it('sort is a "Sort by" select, not a status-worded toggle', () => {
    expect(feed).toMatch(/aria-label="Sort by"/);
    expect(feed).not.toMatch(/'Currently newest first, click for oldest'/);
  });

  it('renders the desktop side rail', () => {
    expect(feed).toMatch(/<HomeSideRail \/>/);
  });
});
