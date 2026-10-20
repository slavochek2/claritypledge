/**
 * @file p1517-hike-gallery-videos.test.tsx
 * @description P1517 — the series gallery shows short videos as click-to-play tiles. Poster only
 * until the tap, bucket-only URLs, photos and the route-map tile unchanged, DB constraint shape.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PastHikePhotos } from '@/app/prototypes/events/hike/HikeSections';
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

  it('plays inline with native controls on tap; sound not forced off; letterboxed', () => {
    const { container } = render(<PastHikePhotos photos={[video('c')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play video: Clip c' }));
    const v = container.querySelector('video')!;
    expect(v.getAttribute('src')).toContain('c-v1.mp4');
    expect(v.hasAttribute('controls')).toBe(true);
    expect(v.hasAttribute('playsinline')).toBe(true);
    expect(v.muted).toBe(false);
    expect(v.className).toMatch(/object-contain/);
    expect(v.getAttribute('aria-label')).toBe('Clip c');
    expect(document.activeElement).toBe(v);
  });

  it('reserves the same 4:3 box as photo tiles', () => {
    const { container } = render(<PastHikePhotos photos={[photo('a'), video('c')]} />);
    const tile = screen.getByTestId('hike-video-tile');
    expect(tile.className).toBe(container.querySelector('li:not([data-testid])')!.className);
    expect(tile.querySelector('.aspect-\\[4\\/3\\]')).not.toBeNull();
    // the poster covers the box at rest
    expect(tile.querySelector('img')!.className).toMatch(/object-cover/);
  });

  it('video tiles do not open the lightbox; photo tiles still do', () => {
    const opened: string[] = [];
    render(<PastHikePhotos photos={[photo('a'), video('c')]} onOpenImage={(src) => opened.push(src)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play video: Clip c' }));
    expect(opened).toEqual([]);
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
