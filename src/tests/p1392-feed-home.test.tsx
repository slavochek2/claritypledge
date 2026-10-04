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

  it('caps the tag cloud and offers only allowed topic tags (P1401)', () => {
    expect(feed).toMatch(/const TAG_CLOUD_LIMIT = 5;/);
    expect(feed).toMatch(/\.filter\(\(\[tag\]\) => allowed\.has\(tag\)\)/);
    const t = read('src/app/data/event-topic-tags.ts');
    expect(t).toMatch(/FIXED_TOPIC_TAGS = \['understanding', 'misunderstanding', 'aisafety1'\]/);
    expect(t).toMatch(/\.select\('statement_tag'\)/);
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
  it('P1401: collapsed bar shows the author and the video thumbnail; play opens AND plays', () => {
    const pin = read('src/app/components/feed/pinned-story.tsx');
    expect(pin).toMatch(/<GravatarAvatar/);
    expect(pin).toMatch(/getThumbnailUrl\(story\.videoUrl\)/);
    expect(pin).toMatch(/setAutoPlay\(true\);\s*setOpen\(true\);/);
    expect(read('src/app/components/feed/feed-story-card.tsx')).toMatch(/if \(autoPlay && parseVideoUrl\(story\.videoUrl\) && !groupPlayer\) player\.onSeek\(0\)/);
  });
  it('P1397: expands the full story in place (no navigation), with no point-pin icon', () => {
    const pin = read('src/app/components/feed/pinned-story.tsx');
    expect(pin).toMatch(/PINNED_STORY_SLUG = "st1"/);
    expect(pin).toMatch(/aria-expanded\n/);
    expect(pin).toMatch(/aria-expanded=\{false\}/);
    expect(pin).toMatch(/<FeedStoryCard story=\{story\} linkedPoints=\{points\} autoPlay=\{autoPlay\} \/>/);
    expect(pin).not.toMatch(/PinIcon|<Link/);
  });
  it('P1404: the open state shows the author once — no photo in the label row, card not boxed in the panel', () => {
    const pin = read('src/app/components/feed/pinned-story.tsx');
    const openBranch = pin.slice(pin.indexOf('if (open) {'), pin.indexOf('return (\n    <section data-testid="pinned-story" className="rounded-lg'));
    expect(openBranch).toMatch(/<FeedStoryCard/);
    expect(openBranch).not.toMatch(/GravatarAvatar/);
    expect(openBranch).toMatch(/bg-blue-50/); // P1405: the box stays when open
  });
});

describe('P1392 review fixes', () => {
  it('invite (?referrer=) and ?login= links on "/" go to the landing, which owns those redirects', () => {
    const fn = app.slice(app.indexOf('function HomeRedirect'), app.indexOf('/** P486'));
    expect(fn).toMatch(/params\.has\("referrer"\) \|\| params\.has\("login"\)/);
    expect(fn).toMatch(/<Navigate to=\{`\/builders\$\{location\.search\}/);
  });
});

describe('P1401 — next events and groups at every width', () => {
  const rail = read('src/app/components/feed/home-side-rail.tsx');
  it('phones get a top block; desktop keeps the rail; exactly one is mounted per width', () => {
    expect(feed).toMatch(/<HomeTopBlock \/>/);
    expect(feed).toMatch(/<HomeSideRail \/>/);
    expect(rail).toMatch(/return isDesktop \? null : <TopContent \/>/);
    expect(rail).toMatch(/return isDesktop \? <RailContent \/> : null/);
  });
  it('groups are listed by name (capped), events cap at 2 (1 on phones), groups come first on desktop', () => {
    expect(read('src/app/data/offline-reads.ts')).toMatch(/export const HOME_MAX_GROUPS = 2;/);
    expect(rail).toMatch(/const MAX_GROUPS = HOME_MAX_GROUPS;/);
    expect(rail).toMatch(/<EventsList events=\{events\} row \/>/);
    expect(rail).toMatch(/<EventCard event=\{e\}/); // the canonical event card, not a home-only look
    expect(rail).toMatch(/<OrgInitials name=\{g\.name\} \/>/); // the groups-page tile
    const r = rail.slice(rail.indexOf('function RailContent'));
    expect(r.indexOf('>Groups<')).toBeLessThan(r.indexOf('{nextEventsLabel(events)}<'));
  });
  it('P1407: read through the offline cache; started events dropped at render, not only at fetch', () => {
    expect(rail).toMatch(/readThrough\(r\.type, r\.id, r\.fetch\)/);
    const hook = rail.slice(rail.indexOf('function useHomeHighlights'), rail.indexOf('function EventsList'));
    expect(hook).toMatch(/new Date\(e\.datetime\)\.getTime\(\) > now/);
    expect(read('src/app/data/offline-reads.ts')).not.toMatch(/getTime\(\) > now/);
  });
});
