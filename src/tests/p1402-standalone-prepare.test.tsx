/**
 * P1402 — standalone /prepare.
 *  - Signed-out progress: kept in this browser, written to the account once, never lowering it.
 *  - /prepare is immersive (no app chrome, room capture paused) and hides the BottomNav, as the
 *    event's preparation does.
 *  - A story video can be our own mp4 in the media bucket — and only there (mirrors the CHECK
 *    constraint): StoryMedia plays it in our player; YouTube stories are unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const markPrepPart = vi.fn();
vi.mock('@/app/data/event-prep-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-prep-service')>()),
  markPrepPart: (...args: unknown[]) => markPrepPart(...args),
}));
vi.mock('@/app/components/shared/story-image', () => ({
  StoryImage: (props: { src: string }) => <img data-testid="story-image" src={props.src} alt="" />,
}));

import type { PrepPartRow } from '@/app/data/event-prep-service';
import { PART_VERSIONS } from '@/app/prototypes/events/prep/prep-plan';
import {
  localPartRows,
  markLocalPart,
  readLocalParts,
  syncLocalPrepParts,
} from '@/app/prototypes/events/prep/prep-local-parts';
import { isImmersiveLetterRoute } from '@/app/layouts/immersive-letter-route';
import { isBottomNavHiddenRoute } from '@/app/components/layout/bottom-nav-routes';
import { isPublicMediaVideo, publicMediaPosterFor, publicMediaUrl } from '@/lib/public-media';
import { StoryMedia } from '@/app/components/shared/story-media';

const CLIP = publicMediaUrl('event-prep/cognitive-understanding-v1.mp4');

beforeEach(() => {
  localStorage.clear();
  markPrepPart.mockReset();
  markPrepPart.mockResolvedValue(undefined);
});

describe('P1402 signed-out progress', () => {
  it('records a part in this browser at its current version', () => {
    markLocalPart('cognitive_video', '2026-10-04T10:00:00.000Z');
    expect(readLocalParts()).toEqual({
      cognitive_video: { contentVersion: PART_VERSIONS.cognitive_video, completedAt: '2026-10-04T10:00:00.000Z' },
    });
    expect(localPartRows(readLocalParts())[0]).toMatchObject({ part: 'cognitive_video', skippedAt: null });
  });

  it('ignores corrupt or unknown storage instead of throwing', () => {
    localStorage.setItem('cp-prep-parts', '{not json');
    expect(readLocalParts()).toEqual({});
    localStorage.setItem('cp-prep-parts', JSON.stringify({ bogus: { contentVersion: 1, completedAt: 'x' }, cmp7: 'nope' }));
    expect(readLocalParts()).toEqual({});
  });

  it('writes a local part to the account with its own date, then forgets it', async () => {
    markLocalPart('cognitive_video', '2026-10-04T10:00:00.000Z');
    const written = await syncLocalPrepParts('user-id-1234', []);
    expect(written).toEqual(['cognitive_video']);
    expect(markPrepPart).toHaveBeenCalledWith(
      'user-id-1234', 'cognitive_video', PART_VERSIONS.cognitive_video, 'completed', '2026-10-04T10:00:00.000Z',
    );
    expect(readLocalParts()).toEqual({});
  });

  it('never touches a part the account already completed', async () => {
    markLocalPart('principle_intro');
    const account: PrepPartRow[] = [
      { part: 'principle_intro', contentVersion: PART_VERSIONS.principle_intro, completedAt: '2026-09-01T00:00:00.000Z', skippedAt: null },
    ];
    expect(await syncLocalPrepParts('user-id-1234', account)).toEqual([]);
    expect(markPrepPart).not.toHaveBeenCalled();
    expect(readLocalParts()).toEqual({});
  });

  it('a failed write keeps the part local for the next try', async () => {
    markPrepPart.mockRejectedValueOnce(new Error('offline'));
    markLocalPart('cognitive_video');
    expect(await syncLocalPrepParts('user-id-1234', [])).toEqual([]);
    expect(Object.keys(readLocalParts())).toEqual(['cognitive_video']);
  });
});

describe('P1402 review fixes', () => {
  it('rejects a forged version above the current one and a non-date', () => {
    localStorage.setItem('cp-prep-parts', JSON.stringify({
      cognitive_video: { contentVersion: 999, completedAt: '2026-10-04T10:00:00.000Z' },
      principle_intro: { contentVersion: 1, completedAt: 'x' },
    }));
    expect(readLocalParts()).toEqual({});
  });

  it('never dates a part before an event preparation that already started', async () => {
    markLocalPart('cognitive_video', '2026-10-01T00:00:00.000Z');
    await syncLocalPrepParts('user-id-1234', [], '2026-10-03T12:00:00+00:00');
    const at = markPrepPart.mock.calls[0]![4] as string;
    expect(Date.parse(at)).toBeGreaterThan(Date.parse('2026-10-03T12:00:00+00:00'));
  });

  it('keeps the original date when it is after the start (or nothing started)', async () => {
    markLocalPart('cognitive_video', '2026-10-04T00:00:00.000Z');
    await syncLocalPrepParts('user-id-1234', [], '2026-10-03T12:00:00+00:00');
    expect(markPrepPart.mock.calls[0]![4]).toBe('2026-10-04T00:00:00.000Z');
  });
});

describe('P1402 /prepare is a focus route', () => {
  it('is immersive like the event preparation', () => {
    expect(isImmersiveLetterRoute('/prepare', '', true)).toBe(true);
    expect(isImmersiveLetterRoute('/prepare', '', false)).toBe(true);
    expect(isImmersiveLetterRoute('/events/x/prepare', '', true)).toBe(true);
  });
  it('does not sweep in neighbouring paths', () => {
    expect(isImmersiveLetterRoute('/prepared', '', true)).toBe(false);
    expect(isImmersiveLetterRoute('/x/prepare', '', true)).toBe(false);
    expect(isBottomNavHiddenRoute('/prepare', '')).toBe(true);
    expect(isBottomNavHiddenRoute('/prepared', '')).toBe(false);
  });
});

describe('P1402 our own mp4 as a story video', () => {
  it('accepts only an mp4 in the media bucket', () => {
    expect(isPublicMediaVideo(CLIP)).toBe(true);
    expect(isPublicMediaVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(isPublicMediaVideo('https://evil.example.com/claritypledge-story-images/x.mp4')).toBe(false);
    expect(isPublicMediaVideo('https://storage.googleapis.com/other-bucket/x.mp4')).toBe(false);
    expect(isPublicMediaVideo(publicMediaUrl('../other-bucket/x.mp4'))).toBe(false);
    expect(isPublicMediaVideo(publicMediaUrl('a/%2e%2e/x.mp4'))).toBe(false);
    expect(isPublicMediaVideo(publicMediaUrl('event-prep/poster.jpg'))).toBe(false);
    expect(isPublicMediaVideo(null)).toBe(false);
  });

  it('StoryMedia plays it in our own player, with the story image as poster', () => {
    render(
      <MemoryRouter>
        <StoryMedia videoUrl={CLIP} mode="thumbnail" storyHref="/story/abc" imageProps={{ src: 'https://cdn.example.com/s.png', authorName: 'X' } as never} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('story-media-mp4')).toBeTruthy();
    expect(screen.queryByTestId('video-thumbnail-image')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play the video' })).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('src')).toBe('https://cdn.example.com/s.png');
  });

  it('without a story image, the poster stored next to the clip is used', () => {
    expect(publicMediaPosterFor(CLIP)).toBe(publicMediaUrl('event-prep/cognitive-understanding-v1-poster.jpg'));
  });

  it('a YouTube story is unchanged', () => {
    render(
      <MemoryRouter>
        <StoryMedia videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ" mode="thumbnail" storyHref="/story/abc" />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('story-media-mp4')).toBeNull();
    expect(screen.getByTestId('video-thumbnail-image')).toBeTruthy();
  });
});
