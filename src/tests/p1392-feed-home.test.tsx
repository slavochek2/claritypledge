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
    expect(pin).toMatch(/aria-expanded=\{open\}/); // P1408: one toggle in both states (focus survives)
    expect(pin).toMatch(/<FeedStoryCard story=\{story\} linkedPoints=\{points\} autoPlay=\{autoPlay\} \/>/);
    expect(pin).not.toMatch(/PinIcon|<Link/);
  });
  it('P1404/P1406: open shows the author once (photo only when closed); the blue box wraps the card', () => {
    const pin = read('src/app/components/feed/pinned-story.tsx');
    expect(pin).toMatch(/\{!open && \(\s*<GravatarAvatar/);
    expect(pin).toMatch(/className=\{`rounded-lg border border-blue-200 bg-blue-50/);
    const panel = pin.slice(pin.indexOf('{open && (\n        <div id={panelId}'));
    expect(panel).toMatch(/<FeedStoryCard/);
    expect(panel.indexOf('<FeedStoryCard')).toBeLessThan(panel.indexOf('</section>'));
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
  // P1415: Next events come first on desktop, and the rail names ONE group (slug `cm`) — the
  // rendered order and filter are pinned in p1415-home-rail.test.tsx.
  it('events read from the first 2 groups, events cap at 2, one group by slug; events come first on desktop', () => {
    expect(read('src/app/data/offline-reads.ts')).toMatch(/export const HOME_MAX_GROUPS = 2;/);
    expect(read('src/app/data/offline-reads.ts')).toMatch(/export const HOME_GROUP_SLUG = 'cm';/);
    expect(rail).toMatch(/<EventsList events=\{events\} row \/>/);
    expect(rail).toMatch(/<EventCard event=\{e\}/); // the canonical event card, not a home-only look
    expect(rail).toMatch(/<OrgInitials name=\{g\.name\} \/>/); // the groups-page tile
    const r = rail.slice(rail.indexOf('function RailContent'));
    expect(r.indexOf('{nextEventsLabel(events)}<')).toBeLessThan(r.indexOf('>Groups<'));
  });
  it('P1407: read through the offline cache; started events dropped at render, not only at fetch', () => {
    expect(rail).toMatch(/readThrough\(r\.type, r\.id, r\.fetch[,)]/); // P1337: options (onLate) may follow
    const hook = rail.slice(rail.indexOf('function useHomeHighlights'), rail.indexOf('function EventsList'));
    expect(hook).toMatch(/new Date\(e\.datetime\)\.getTime\(\) > now/);
    expect(read('src/app/data/offline-reads.ts')).not.toMatch(/getTime\(\) > now/);
  });
});
