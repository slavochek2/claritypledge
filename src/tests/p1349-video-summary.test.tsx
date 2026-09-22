/**
 * @file p1349-video-summary.test.tsx
 * @description P1349: "Read video summary" under every player whose video has a confirmed
 * summary, and the /video/:id page it opens.
 *
 * Supabase is mocked at the client: `rows` stands in for what RLS returns (confirmed rows only),
 * so "no confirmed summary" is modelled exactly as the database presents it — an absent row.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StoryMedia } from '@/app/components/shared/story-media';
import { resetSummarisedVideoIdsCache, summaryParagraphs, readMinutes } from '@/app/data/video-summaries-service';
import { VideoSummaryPage } from '@/app/pages/video-summary-page';

const seekTo = vi.fn();
vi.mock('@/app/components/shared/story-video-player', async () => {
  const React = await import('react');
  return {
    StoryVideoPlayer: React.forwardRef<{ seekTo: (s: number) => void }, { videoUrl: string }>(function P(props, ref) {
      React.useImperativeHandle(ref, () => ({ seekTo }));
      return <div data-testid="player" data-url={props.videoUrl} />;
    }),
  };
});

let rows: Array<Record<string, unknown>> = [];
let queryCount = 0;

vi.mock('@/lib/supabase', () => {
  const builder = () => {
    const filters: Record<string, unknown> = {};
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return b;
      },
      maybeSingle: async () => ({
        data: rows.find((r) => r.video_id === filters.video_id) ?? null,
        error: null,
      }),
      then: (resolve: (v: unknown) => void) => {
        queryCount += 1;
        resolve({ data: rows.map((r) => ({ video_id: r.video_id })), error: null });
      },
    };
    return b;
  };
  return { supabase: { from: () => builder() } };
});

const ID = 'dQw4w9WgXcQ';
const ROW = {
  video_id: ID,
  title: 'A talk',
  channel: 'Some Channel',
  duration_seconds: 600,
  summary: 'First *para* here.\n\nSecond para.',
  key_points: ['One.', 'Two.', 'Three.'],
  moments: [
    { t: 125, note: 'Later moment' },
    { t: 5, note: 'Early moment' },
  ],
};

beforeEach(() => {
  rows = [];
  queryCount = 0;
  seekTo.mockClear();
  resetSummarisedVideoIdsCache();
});

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('P1349 — the link under the player', () => {
  it('shows "Read video summary" under a player whose video has a confirmed summary', async () => {
    rows = [ROW];
    wrap(<StoryMedia videoUrl={`https://www.youtube.com/watch?v=${ID}`} mode="player" />);
    const link = await screen.findByRole('link', { name: /read video summary/i });
    expect(link.getAttribute('href')).toBe(`/video/${ID}`);
  });

  it('keeps the caller spacing around player + link when the link renders', async () => {
    rows = [ROW];
    wrap(<StoryMedia videoUrl={`https://youtu.be/${ID}`} mode="player" className="mt-2 mb-2" />);
    await screen.findByRole('link', { name: /read video summary/i });
    expect(screen.getByTestId('story-media-with-summary-link').className).toBe('mt-2 mb-2');
  });

  it('shows no link when the video has no confirmed summary (no dead links)', async () => {
    rows = [];
    wrap(<StoryMedia videoUrl={`https://www.youtube.com/watch?v=${ID}`} mode="thumbnail" storyHref="/story/x" />);
    await waitFor(() => expect(queryCount).toBe(1));
    expect(screen.queryByRole('link', { name: /read video summary/i })).toBeNull();
  });

  it('two stories citing the same video in different URL shapes link to the same page', async () => {
    rows = [ROW];
    wrap(
      <>
        <StoryMedia videoUrl={`https://www.youtube.com/watch?v=${ID}&t=30`} mode="thumbnail" storyHref="/story/a" />
        <StoryMedia videoUrl={`https://youtu.be/${ID}`} mode="thumbnail" storyHref="/story/b" />
      </>
    );
    const links = await screen.findAllByRole('link', { name: /read video summary/i });
    expect(links).toHaveLength(2);
    expect(new Set(links.map((l) => l.getAttribute('href')))).toEqual(new Set([`/video/${ID}`]));
  });

  it('many players on one page share a single query', async () => {
    rows = [ROW];
    wrap(
      <>
        {[1, 2, 3, 4].map((i) => (
          <StoryMedia key={i} videoUrl={`https://youtu.be/${ID}`} mode="thumbnail" storyHref={`/story/${i}`} />
        ))}
      </>
    );
    await screen.findAllByRole('link', { name: /read video summary/i });
    expect(queryCount).toBe(1);
  });

  it('inside an embed (iframe) the link opens a new tab', async () => {
    rows = [ROW];
    const top = Object.getOwnPropertyDescriptor(window, 'top');
    Object.defineProperty(window, 'top', { configurable: true, value: {} });
    try {
      wrap(<StoryMedia videoUrl={`https://youtu.be/${ID}`} mode="player" />);
      const link = await screen.findByRole('link', { name: /read video summary/i });
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    } finally {
      if (top) Object.defineProperty(window, 'top', top);
    }
  });

  it('a story with no video renders no link and runs no query', async () => {
    wrap(<StoryMedia videoUrl={null} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(queryCount).toBe(0);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

function renderPage(id = ID) {
  return render(
    <MemoryRouter initialEntries={[`/video/${id}`]}>
      <Routes>
        <Route path="/video/:videoId" element={<VideoSummaryPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('P1349 — the summary page', () => {
  it('renders in the decided order: title, channel+length, player, AI label, key points, summary, timestamps, go back', async () => {
    rows = [ROW];
    renderPage();
    const page = await screen.findByTestId('video-summary-page');
    const text = page.textContent ?? '';
    const order = ['A talk', 'Some Channel · 10-min video', 'AI summary of the full video', 'Key points', 'Summary', 'Timestamps', 'Go back'];
    const positions = order.map((s) => text.indexOf(s));
    positions.forEach((p, i) => expect(p, `missing: ${order[i]}`).toBeGreaterThanOrEqual(0));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // Player sits between the channel line and the AI label.
    const player = screen.getByTestId('player');
    const label = screen.getByText(/AI summary of the full video/);
    expect(player.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('listitem').slice(0, 3).map((li) => li.textContent)).toEqual(['1One.', '2Two.', '3Three.']);
  });

  it('says it is AI-written, not endorsed by the creator, and credits the channel', async () => {
    rows = [ROW];
    renderPage();
    const label = await screen.findByText(/AI summary of the full video/);
    expect(label.textContent).toMatch(/not endorsed by\s+the creator/);
    expect(label.textContent).toContain('Video by Some Channel');
  });

  it('timestamps are ordered, and clicking one seeks the player', async () => {
    rows = [ROW];
    renderPage();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView; // jsdom has none
    const pills = await screen.findAllByRole('button', { name: /play from/i });
    expect(pills.map((p) => p.textContent)).toEqual(['0:05', '2:05']);
    fireEvent.click(pills[1]);
    expect(seekTo).toHaveBeenCalledWith(125);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('a video with no confirmed summary is not found', async () => {
    rows = [];
    renderPage('unknownVid1');
    await waitFor(() => expect(screen.queryByTestId('video-summary-page')).toBeNull());
    await waitFor(() => expect(document.body.textContent).toMatch(/not found|404|lost/i));
  });
});

describe('P1349 — prose helpers', () => {
  it('splits paragraphs and drops generator emphasis markers', () => {
    expect(summaryParagraphs(ROW.summary)).toEqual(['First para here.', 'Second para.']);
  });
  it('read time is at least one minute', () => {
    expect(readMinutes('a few words')).toBe(1);
    expect(readMinutes(Array(1000).fill('w').join(' '))).toBe(5);
  });
});
