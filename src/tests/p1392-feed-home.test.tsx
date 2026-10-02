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

describe('P1392 — story 1 pinned for signed-out visitors', () => {
  it('pins only for signed-out visitors on the plain Stories view, and de-duplicates', () => {
    expect(feed).toMatch(/const showPinned = !session && activeTab === 'stories' && activeTags\.length === 0 && !searchQuery\.trim\(\);/);
    expect(feed).toMatch(/\{showPinned && <PinnedStory onResolved=\{setPinnedId\} \/>\}/);
    expect(feed).toMatch(/s\.id !== pinnedId && !\(s\.tags \?\? \[\]\)\.includes\(PINNED_STORY_SLUG\)/);
  });
  it('P1397: expands the full story in place (no navigation), with no point-pin icon', () => {
    const pin = read('src/app/components/feed/pinned-story.tsx');
    expect(pin).toMatch(/PINNED_STORY_SLUG = "st1"/);
    expect(pin).toMatch(/aria-expanded=\{open\}/);
    expect(pin).toMatch(/<FeedStoryCard story=\{story\} linkedPoints=\{points\} \/>/);
    expect(pin).not.toMatch(/PinIcon|<Link/);
  });
});

describe('P1392 review fixes', () => {
  it('invite (?referrer=) and ?login= links on "/" go to the landing, which owns those redirects', () => {
    const fn = app.slice(app.indexOf('function HomeRedirect'), app.indexOf('/** P486'));
    expect(fn).toMatch(/params\.has\("referrer"\) \|\| params\.has\("login"\)/);
    expect(fn).toMatch(/<Navigate to=\{`\/builders\$\{location\.search\}/);
  });
  it('the internal-tag filter needs 3+ digits, so real tags like #p2p survive', () => {
    expect(feed).toMatch(/\/\^p\\d\{3,\}\/i/);
  });
});
