/**
 * @file p1517-hike-gallery-videos.test.tsx
 * @description P1517 — the series gallery shows short videos as click-to-play tiles. Poster only
 * until the tap, bucket-only URLs, photos and the route-map tile unchanged, DB constraint shape.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import { HikeOrganizerLine, PastHikePhotos, SeriesReviews } from '@/app/prototypes/events/hike/HikeSections';
import { HIKE_LABELS } from '@/app/prototypes/events/hike/hike-utils';
import { publicMediaUrl, isPublicMediaVideo, isPublicMediaImage } from '@/lib/public-media';
import type { SeriesPhoto } from '@/app/types';

const R = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const MIGRATION = R('supabase/migrations/20261020120000_p1517_series_photos_video.sql');

const photo = (id: string): SeriesPhoto => ({ id, storageUrl: publicMediaUrl(`hikes/social-hike/${id}.jpg`), alt: `Photo ${id}` });
const video = (id: string, over: Partial<SeriesPhoto> = {}): SeriesPhoto => ({
  id,
  storageUrl: publicMediaUrl(`hikes/social-hike/${id}-v1.mp4`),
  posterUrl: publicMediaUrl(`hikes/social-hike/${id}-v1-poster.jpg`),
  alt: `Clip ${id}`,
  mediaType: 'video',
  ...over,
});

describe('P1517: video tiles in the past-hike strip', () => {
  it('shows poster + play button and mounts no <video> before the tap', () => {
    const { container } = render(<PastHikePhotos photos={[photo('a'), video('c')]} />);
    expect(screen.getAllByTestId('hike-video-tile')).toHaveLength(1);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('source')).toBeNull();
    const btn = screen.getByRole('button', { name: 'Play video: Clip c' });
    expect(btn.querySelector('img')!.getAttribute('src')).toContain('c-v1-poster.jpg');
    // Nothing references the mp4 in the DOM yet (no preload).
    expect(container.innerHTML).not.toContain('.mp4');
  });

  it('tap opens a full-screen player (sound on, controls, inline), never a video inside the tile', () => {
    const { container } = render(<PastHikePhotos photos={[video('c')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play video: Clip c' }));
    const v = document.body.querySelector('video')!;
    expect(v.getAttribute('src')).toContain('c-v1.mp4');
    expect(v.hasAttribute('controls')).toBe(true);
    expect(v.hasAttribute('playsinline')).toBe(true);
    expect(v.muted).toBe(false);
    expect(v.getAttribute('aria-label')).toBe('Clip c');
    // the video lives in the overlay, not in the strip
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(document.activeElement).toBe(v); // focus lands on the player, not the X
    // Radix's modal layer forces inline pointer-events:auto; the full-viewport content must stay
    // click-through or it swallows backdrop taps (verified in a real browser, jsdom cannot hit-test).
    expect(screen.getByRole('dialog').style.pointerEvents).toBe('none');
    expect(v.parentElement!.className).toMatch(/pointer-events-auto/);
    expect(screen.getByRole('button', { name: 'Close' }).className).toMatch(/pointer-events-auto/);
  });

  it('closes on X, Escape and backdrop tap, unmounting the video', async () => {
    render(<PastHikePhotos photos={[video('c')]} />);
    const open = () => fireEvent.click(screen.getByRole('button', { name: 'Play video: Clip c' }));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.body.querySelector('video')).toBeNull();
    open();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(document.body.querySelector('video')).toBeNull();
    open();
    await new Promise(r => setTimeout(r, 20)); // Radix registers its outside-press listener on a 0ms timer
    fireEvent.pointerDown(document.body.querySelector('video')!); // a tap on the video must NOT close
    fireEvent.click(document.body.querySelector('video')!);
    await new Promise(r => setTimeout(r, 20));
    expect(document.body.querySelector('video')).not.toBeNull();
    fireEvent.pointerDown(screen.getByTestId('video-lightbox-overlay')); // the backdrop does
    await waitFor(() => expect(document.body.querySelector('video')).toBeNull());
  });

  it('video tiles do not open the lightbox; photo tiles still do', () => {
    const opened: string[] = [];
    render(<PastHikePhotos photos={[photo('a'), video('c')]} onOpenImage={(src) => opened.push(src)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play video: Clip c' }));
    expect(opened).toEqual([]); // the image lightbox stays out of it
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'View photo: Photo a' }));
    expect(opened).toHaveLength(1);
  });

  it('drops a video whose mp4 or poster is outside the bucket, or whose poster is missing', () => {
    const bad = [
      video('x1', { storageUrl: 'https://evil.example/a.mp4' }),
      video('x2', { posterUrl: 'https://evil.example/p.jpg' }),
      video('x3', { posterUrl: undefined }),
      video('x5', { posterUrl: 'https://storage.googleapis.com/other-bucket/hikes/p.jpg' }),
      video('x6', { posterUrl: publicMediaUrl('hikes/social-hike/../p.jpg') }),
      video('x7', { posterUrl: publicMediaUrl('hikes/social-hike/p.gif') }),
      video('x4', { storageUrl: publicMediaUrl('hikes/social-hike/a.jpg') }),
    ];
    const { container } = render(<PastHikePhotos photos={bad} />);
    expect(container.innerHTML).toBe('');
  });

  it('never starts with a video: the first photo is moved ahead of leading videos', () => {
    render(<PastHikePhotos photos={[video('v1'), video('v2'), photo('a'), photo('b')]} />);
    const items = Array.from(screen.getByTestId('hike-photos').querySelectorAll('li'));
    expect(items[0].querySelector('button')!.getAttribute('aria-label')).toBe('View photo: Photo a');
    expect(items[1].getAttribute('data-testid')).toBe('hike-video-tile');
    expect(items).toHaveLength(4);
  });

  it('leaves the order alone when a photo already leads, and when there are only videos', () => {
    const { unmount } = render(<PastHikePhotos photos={[photo('a'), video('v1'), photo('b')]} />);
    const lis = Array.from(screen.getByTestId('hike-photos').querySelectorAll('li'));
    expect(lis.map(l => l.getAttribute('data-testid'))).toEqual([null, 'hike-video-tile', null]);
    unmount();
    render(<PastHikePhotos photos={[video('v1'), video('v2')]} />);
    expect(screen.getAllByTestId('hike-video-tile')).toHaveLength(2);
  });

  it('keeps photo rows and the route-map tile as before', () => {
    render(<PastHikePhotos photos={[photo('a'), video('c'), photo('b')]} mapUrl={publicMediaUrl('hikes/social-hike/map.jpg')} />);
    const section = screen.getByTestId('hike-photos');
    expect(section.querySelectorAll('li')).toHaveLength(4);
    expect(section.querySelector('a[href="#hike-route"]')).not.toBeNull();
  });
});

describe('P1517: URL helper + migration shape', () => {
  it('a hike mp4 built with publicMediaUrl passes isPublicMediaVideo', () => {
    expect(isPublicMediaVideo(publicMediaUrl('hikes/social-hike/clip-v1.mp4'))).toBe(true);
  });

  it('isPublicMediaImage accepts only bucket images', () => {
    expect(isPublicMediaImage(publicMediaUrl('hikes/social-hike/p.webp'))).toBe(true);
    expect(isPublicMediaImage(publicMediaUrl('hikes/social-hike/p.mp4'))).toBe(false);
    expect(isPublicMediaImage('https://storage.googleapis.com/other/p.jpg')).toBe(false);
  });

  it('migration is additive with a photo default and requires poster + bucket URLs for videos', () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'photo'/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS poster_url text/);
    expect(MIGRATION).toMatch(/poster_url IS NOT NULL/);
    expect(MIGRATION).toContain('claritypledge-story-images');
    expect(MIGRATION).toContain('(jpe?g|png|webp)$');
    expect(MIGRATION).not.toMatch(/DROP (TABLE|COLUMN)|RENAME/i);
  });
});

describe('P1517 amendment: reviews are a swipe strip', () => {
  it('many reviews render in one scroll-snap row with avatar slot and profile link per card', () => {
    const reviews = ['a', 'b', 'c'].map(id => ({
      id, quote: `Quote ${id}`, authorName: `Person ${id}`, authorProfilePath: `/p/${id}`,
    }));
    render(<MemoryRouter><SeriesReviews reviews={reviews} /></MemoryRouter>);
    const ul = screen.getByTestId('hike-reviews').querySelector('ul')!;
    expect(ul.className).toMatch(/\bflex\b/);
    expect(ul.className).toMatch(/overflow-x-auto/);
    expect(ul.className).toMatch(/snap-x/);
    expect(screen.getAllByTestId('hike-review')).toHaveLength(3);
    for (const li of screen.getAllByTestId('hike-review')) {
      expect(li.className).toMatch(/snap-start/);
      expect(li.className).toMatch(/w-\[85%\]/); // peeks the next card on mobile
      expect(li.className).toMatch(/sm:w-80/);
    }
    expect(screen.getByRole('link', { name: 'Person a' }).getAttribute('href')).toBe('/p/a');
  });
});

describe('P1517 amendment 4: organizer name links to the group page', () => {
  const renderLine = (props: Parameters<typeof HikeOrganizerLine>[0]) =>
    render(<MemoryRouter><HikeOrganizerLine {...props} /></MemoryRouter>);

  it('links the name to /groups/<slug> and keeps Learn more on its own path', () => {
    renderLine({ organizer: { name: 'Clarity Munich', slug: 'clarity-munich' }, difficulty: 'Moderate', learnMorePath: '/cm' });
    expect(screen.getByRole('link', { name: 'Clarity Munich' }).getAttribute('href')).toBe('/groups/clarity-munich');
    expect(screen.getByRole('link', { name: 'Learn more' }).getAttribute('href')).toBe('/cm');
    expect(screen.getByTestId('hike-organizer').textContent).toContain('Moderate');
  });

  it('renders plain text for an org without a slug, with no Learn more when none is mapped', () => {
    renderLine({ organizer: { name: 'No Slug Org', slug: null } });
    expect(screen.getByTestId('hike-organizer').querySelector('a')).toBeNull();
    expect(screen.getByTestId('hike-organizer').textContent).toContain('No Slug Org');
  });

  it('the reviews heading is "What hikers say"', () => {
    expect(HIKE_LABELS.reviews).toBe('What hikers say');
  });
});
