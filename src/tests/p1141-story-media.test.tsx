/**
 * @file p1141-story-media.test.tsx
 * @description DW-1 the player renders where the picture used to be; DW-5 the
 * card and off-site surfaces get the thumbnail with a play affordance that
 * links INTO the story.
 *
 * DW-4 is asserted alongside them deliberately: the point of StoryMedia is that
 * "no video" and "unparseable video" both fall through to the untouched image
 * path, so a regression in the video branch cannot change a story that has none.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StoryMedia } from '@/app/components/shared/story-media';
import { VideoThumbnailCard } from '@/app/components/shared/video-thumbnail-card';

vi.mock('@/app/components/shared/story-image', () => ({
  StoryImage: (props: { src: string }) => <img data-testid="story-image" src={props.src} alt="" />,
}));

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const IMAGE = 'https://cdn.example.com/story.png';

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

describe('p1141 DW-5 — the thumbnail treatment on every card surface', () => {
  it('renders the video thumbnail instead of the image when a video is present', () => {
    wrap(
      <StoryMedia
        videoUrl={VIDEO}
        mode="thumbnail"
        storyHref="/story/abc"
        imageProps={{ src: IMAGE, authorName: 'X' } as never}
      />
    );
    expect(screen.getByTestId('video-thumbnail-image')).toBeTruthy();
    expect(screen.queryByTestId('story-image')).toBeNull();
  });

  it('the thumbnail is derived from the video id, so it cannot drift from the video', () => {
    wrap(<StoryMedia videoUrl={VIDEO} mode="thumbnail" storyHref="/story/abc" />);
    expect(screen.getByTestId('video-thumbnail-image').getAttribute('src')).toContain('dQw4w9WgXcQ');
  });

  it('carries a play affordance — the reader must see that it IS a video', () => {
    wrap(<StoryMedia videoUrl={VIDEO} mode="thumbnail" storyHref="/story/abc" />);
    expect(screen.getByTestId('video-play-affordance')).toBeTruthy();
  });

  it('the whole card links INTO the story, never straight out to the source', () => {
    wrap(<StoryMedia videoUrl={VIDEO} mode="thumbnail" storyHref="/story/abc" />);
    const link = screen.getByTestId('video-thumbnail-link');
    expect(link.getAttribute('href')).toBe('/story/abc');
    // An off-site jump would lose the reader before they ever reached the story.
    expect(link.getAttribute('href')).not.toContain('youtube.com');
  });

  it('shows the duration when one is known, and no badge when it is not', () => {
    const withDuration = wrap(<VideoThumbnailCard videoUrl={VIDEO} durationSeconds={185} />);
    expect(withDuration.getByTestId('video-duration-badge').textContent).toBe('3:05');
    withDuration.unmount();

    const without = wrap(<VideoThumbnailCard videoUrl={VIDEO} durationSeconds={null} />);
    expect(without.queryByTestId('video-duration-badge')).toBeNull();
  });

  it('the blocked/source mode opens the source in a new tab, safely', () => {
    wrap(<VideoThumbnailCard videoUrl={VIDEO} sourceHref={VIDEO} />);
    const link = screen.getByTestId('video-thumbnail-link');
    expect(link.getAttribute('href')).toBe(VIDEO);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('p1141 DW-1 — the player takes the picture\'s place on the detail surface', () => {
  it('mode="player" mounts the live player, not a thumbnail', () => {
    wrap(<StoryMedia videoUrl={VIDEO} mode="player" />);
    expect(screen.getByTestId('story-video-player')).toBeTruthy();
    expect(screen.queryByTestId('video-thumbnail-image')).toBeNull();
  });

  it('the player occupies the media slot the image used to hold', () => {
    wrap(
      <StoryMedia
        videoUrl={VIDEO}
        mode="player"
        imageProps={{ src: IMAGE, authorName: 'X' } as never}
      />
    );
    expect(screen.getByTestId('story-video-player')).toBeTruthy();
    expect(screen.queryByTestId('story-image')).toBeNull();
  });
});

describe('p1141 DW-4 — a story with no usable video renders exactly as today', () => {
  it.each([
    [undefined, 'absent'],
    [null, 'null'],
    ['', 'empty'],
    ['https://evil.com/watch?v=dQw4w9WgXcQ', 'off-allowlist host'],
    ['not a url', 'malformed'],
    ['https://www.youtube.com/watch?v=bad', 'malformed id'],
  ])('falls through to the untouched image path when the video is %s (%s)', (videoUrl) => {
    wrap(
      <StoryMedia
        videoUrl={videoUrl as string | null | undefined}
        mode="thumbnail"
        imageProps={{ src: IMAGE, authorName: 'X' } as never}
      />
    );
    expect(screen.getByTestId('story-image').getAttribute('src')).toBe(IMAGE);
    expect(screen.queryByTestId('video-thumbnail-image')).toBeNull();
    expect(screen.queryByTestId('story-video-player')).toBeNull();
  });

  it('renders nothing at all when there is neither a video nor an image', () => {
    const { container } = wrap(<StoryMedia videoUrl={null} mode="thumbnail" />);
    expect(container.textContent).toBe('');
  });
});
