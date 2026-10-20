/**
 * P1512 (review): the compact point and story cards are previews that sit inside a button (a quote block, the picker's
 * overlay), so nothing in them may be a link or a button, and tags are plain text.
 */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: null, session: null }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import type { PointWithUserPosition, StoryWithAuthor } from '@/app/types';

const point = { id: 'p1', statement: 'Clarity beats cleverness #clarity', tags: ['clarity'], systemTags: ['st1'], visibility: 'public' } as unknown as PointWithUserPosition;
const story = { id: 's1', content: 'We left the map in the car #trail', tags: ['trail'], systemTags: [], visibility: 'public', authorName: 'Bob', authorSlug: 'bob', authorId: 'u1', createdAt: new Date().toISOString() } as unknown as StoryWithAuthor;

describe('compact cards', () => {
  it.each([
    ['point', <FeedPointCard key="p" point={point} compact />, 'Clarity beats cleverness'],
    ['story', <FeedStoryCard key="s" story={story} compact />, 'We left the map in the car'],
  ])('a %s card has no links or buttons, shows its tag as text and strips the hashtag from the words', (_k, ui, words) => {
    const { container } = render(<MemoryRouter>{ui}</MemoryRouter>);
    expect(container.querySelectorAll('a, button, [role="button"], [role="link"]')).toHaveLength(0);
    expect(container).toHaveTextContent(words as string);
    // The words carry no hashtag; the tag shows once, as a pill.
    const words_el = [...container.querySelectorAll('p')].find((el) => el.textContent?.includes(words as string));
    expect(words_el?.textContent).not.toMatch(/#(clarity|trail)/);
    expect(container.querySelectorAll('span')).not.toHaveLength(0);
  });
  it('a point card shows its system tags too (the picker searches them)', () => {
    const { container } = render(<MemoryRouter><FeedPointCard point={point} compact /></MemoryRouter>);
    expect(container).toHaveTextContent('st1');
  });
});
