/**
 * @file p1141-video-seek.test.tsx
 * @description DW-2 a timecode seeks in place and brings the player into view
 * with no reload; DW-3 a blocked player still renders the whole story and every
 * timecode opens the source at the right second; AC-1 one click to check a quote.
 *
 * The blocked case is the load-bearing half. A cross-origin embed stopped by an
 * ad blocker or a corporate policy fires no load event AT ALL (P1023) — so the
 * story must never gate its content on the player, and the fallback must be
 * driven by silence rather than by an error.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { StoryVideoQuotes } from '@/app/components/shared/story-video-quotes';
import { StoryVideoPlayer, type StoryVideoPlayerHandle } from '@/app/components/shared/story-video-player';
import { __resetYouTubeApiLoader } from '@/lib/video';
import { createRef } from 'react';

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const QUOTES = [
  { text: 'the first thing said', seconds: 42 },
  { text: 'the second thing said', seconds: 185 },
];

beforeEach(() => {
  __resetYouTubeApiLoader();
  delete (window as unknown as { YT?: unknown }).YT;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('p1141 DW-2 / AC-1 — a timecode seeks in place, in one click', () => {
  it('clicking a timecode calls seek with that quote\'s second — no navigation', () => {
    const onSeek = vi.fn();
    render(
      <StoryVideoQuotes videoUrl={VIDEO} quotes={QUOTES} subjectName="Jane Doe" onSeek={onSeek} />
    );
    const marks = screen.getAllByTestId('story-video-quote-timecode');
    expect(marks).toHaveLength(2);

    // A button, not an anchor: a link would reload or leave the page.
    expect(marks[0].tagName).toBe('BUTTON');
    fireEvent.click(marks[0]);
    expect(onSeek).toHaveBeenCalledWith(42);

    fireEvent.click(marks[1]);
    expect(onSeek).toHaveBeenCalledWith(185);
  });

  it('the player exposes an imperative seekTo that does not re-point the iframe src', async () => {
    const seekTo = vi.fn();
    const playVideo = vi.fn();
    let readyCb: (() => void) | undefined;

    (window as unknown as { YT: unknown }).YT = {
      Player: class {
        seekTo = seekTo;
        playVideo = playVideo;
        destroy = vi.fn();
        constructor(_el: Element, opts: { events: { onReady: () => void } }) {
          readyCb = opts.events.onReady;
        }
      },
    };

    const ref = createRef<StoryVideoPlayerHandle>();
    render(<StoryVideoPlayer ref={ref} videoUrl={VIDEO} />);
    await waitFor(() => expect(readyCb).toBeTypeOf('function'));
    act(() => readyCb?.());

    act(() => ref.current?.seekTo(90));
    // allowSeekAhead=true, and playback resumes — the spec's "seeks in place".
    expect(seekTo).toHaveBeenCalledWith(90, true);
    expect(playVideo).toHaveBeenCalled();
  });

  it('the timecode label is the UI Contract format', () => {
    render(<StoryVideoQuotes videoUrl={VIDEO} quotes={QUOTES} subjectName="Jane Doe" onSeek={vi.fn()} />);
    const marks = screen.getAllByTestId('story-video-quote-timecode');
    expect(marks[0].textContent).toContain('0:42');
    expect(marks[1].textContent).toContain('3:05');
  });

  it('the section names the person it quotes, and counts the marks', () => {
    render(
      <StoryVideoQuotes
        videoUrl={VIDEO}
        quotes={QUOTES}
        durationSeconds={600}
        subjectName="Jane Doe"
        onSeek={vi.fn()}
      />
    );
    expect(screen.getByText('Supporting quotes from Jane Doe')).toBeTruthy();
    expect(screen.getByTestId('story-video-quotes-meta').textContent).toBe('2 marks · 10:00');
  });

  it('renders nothing when there are no quotes — the argument stands alone', () => {
    const { container } = render(
      <StoryVideoQuotes videoUrl={VIDEO} quotes={[]} subjectName="Jane Doe" onSeek={vi.fn()} />
    );
    expect(container.textContent).toBe('');
  });

  it('every timecode is a real touch target, not a hairline', () => {
    render(<StoryVideoQuotes videoUrl={VIDEO} quotes={QUOTES} subjectName="Jane Doe" onSeek={vi.fn()} />);
    for (const mark of screen.getAllByTestId('story-video-quote-timecode')) {
      expect(mark.className).toContain('h-10');
    }
  });
});

describe('p1141 DW-3 — with the player blocked, the story is still whole', () => {
  it('every timecode becomes a new-tab link to the source at the right second', () => {
    render(
      <StoryVideoQuotes
        videoUrl={VIDEO}
        quotes={QUOTES}
        subjectName="Jane Doe"
        onSeek={vi.fn()}
        playerBlocked
      />
    );
    const marks = screen.getAllByTestId('story-video-quote-timecode');
    expect(marks[0].tagName).toBe('A');
    expect(marks[0].getAttribute('href')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s');
    expect(marks[1].getAttribute('href')).toContain('t=185s');
    expect(marks[0].getAttribute('target')).toBe('_blank');
    expect(marks[0].getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('the quote text itself is still fully readable with no player', () => {
    render(
      <StoryVideoQuotes videoUrl={VIDEO} quotes={QUOTES} subjectName="Jane Doe" playerBlocked />
    );
    expect(screen.getByText('the first thing said')).toBeTruthy();
    expect(screen.getByText('the second thing said')).toBeTruthy();
  });

  it('with no seek handler at all, timecodes still open the source rather than dying', () => {
    render(<StoryVideoQuotes videoUrl={VIDEO} quotes={QUOTES} subjectName="Jane Doe" />);
    expect(screen.getAllByTestId('story-video-quote-timecode')[0].tagName).toBe('A');
  });

  it('a never-fires-onReady embed swaps to the thumbnail fallback on the backstop timer', async () => {
    vi.useFakeTimers();
    // The API never resolves — a fully network-blocked load, which produces no
    // error event either. Silence is the only available signal.
    (window as unknown as { YT: unknown }).YT = {
      // onReady is never called — the P1023 shape.
      Player: class {
        destroy = vi.fn();
      },
    };

    render(<StoryVideoPlayer videoUrl={VIDEO} />);
    await act(async () => {
      vi.advanceTimersByTime(31_000); // past the clamp ceiling
    });
    expect(screen.getByTestId('story-video-blocked')).toBeTruthy();
    expect(screen.getByTestId('video-thumbnail-image')).toBeTruthy();
  });

  it('the blocked fallback links out to the source, since there is no player to seek', async () => {
    vi.useFakeTimers();
    (window as unknown as { YT: unknown }).YT = { Player: class { destroy = vi.fn(); } };
    render(<StoryVideoPlayer videoUrl={VIDEO} />);
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(screen.getByTestId('video-thumbnail-link').getAttribute('href')).toBe(VIDEO);
  });

  it('the blocked state is DISTINGUISHABLE from a working player, not just a fallback', async () => {
    // Blind review round 2, defect 7: the fallback was structurally identical
    // to a loaded embed — same thumbnail, same play button, same duration chip.
    // A reader pressed play expecting inline playback and was sent off-site
    // with no warning. A fallback the eye cannot tell apart is a silent
    // redirect, not a fallback.
    vi.useFakeTimers();
    (window as unknown as { YT: unknown }).YT = { Player: class { destroy = vi.fn(); } };
    render(<StoryVideoPlayer videoUrl={VIDEO} />);
    await act(async () => { vi.advanceTimersByTime(31_000); });

    const notice = screen.getByTestId('story-video-blocked-notice');
    expect(notice.textContent).toMatch(/could not load/i);
    // And it must say where the control goes, not just that something failed.
    const out = notice.querySelector('a');
    expect(out?.getAttribute('href')).toBe(VIDEO);
    expect(out?.getAttribute('target')).toBe('_blank');
  });

  it('a working player carries NO blocked notice', async () => {
    vi.useFakeTimers();
    let readyCb: (() => void) | undefined;
    (window as unknown as { YT: unknown }).YT = {
      Player: class {
        destroy = vi.fn();
        constructor(_el: Element, opts: { events: { onReady: () => void } }) { readyCb = opts.events.onReady; }
      },
    };
    render(<StoryVideoPlayer videoUrl={VIDEO} />);
    await act(async () => { await Promise.resolve(); });
    act(() => readyCb?.());
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(screen.queryByTestId('story-video-blocked-notice')).toBeNull();
  });

  it('a player that DOES become ready never flips to blocked', async () => {
    vi.useFakeTimers();
    let readyCb: (() => void) | undefined;
    (window as unknown as { YT: unknown }).YT = {
      Player: class {
        destroy = vi.fn();
        constructor(_el: Element, opts: { events: { onReady: () => void } }) { readyCb = opts.events.onReady; }
      },
    };
    render(<StoryVideoPlayer videoUrl={VIDEO} />);
    await act(async () => { await Promise.resolve(); });
    act(() => readyCb?.());
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(screen.queryByTestId('story-video-blocked')).toBeNull();
    expect(screen.getByTestId('story-video-player')).toBeTruthy();
  });

  it('the blocked threshold is never below the ~7.6s a working embed was measured at', async () => {
    vi.useFakeTimers();
    (window as unknown as { YT: unknown }).YT = { Player: class { destroy = vi.fn(); } };
    render(<StoryVideoPlayer videoUrl={VIDEO} />);
    await act(async () => { vi.advanceTimersByTime(7_600); });
    // A false "blocked" on a working player is worse than waiting: the fallback
    // it triggers sends the reader off-site.
    expect(screen.queryByTestId('story-video-blocked')).toBeNull();
  });
});
