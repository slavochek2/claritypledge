/**
 * @file p1376-reproduce.test.tsx
 * @description P1376 canary — /stake/:tag lists only head points and shows the tag name.
 *
 * Drives the REAL points service against an in-memory Supabase stand-in that honours the
 * filters the service actually chains (eq / contains / is / in / order / range), so the
 * head filter is proven by what the reader sees, wherever it is implemented. The window
 * case pins WHERE it belongs: superseded rows are the oldest, so a client-side filter
 * after `.range(0, 49)` would leave a reader with an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PointWithUserPosition, StoryWithAuthor } from '@/app/types';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

vi.mock('@/lib/supabase', () => {
  class Query implements PromiseLike<{ data: Row[]; error: null }> {
    private filters: Array<(r: Row) => boolean> = [];
    private sort: { col: string; asc: boolean } | null = null;
    private window: [number, number] | null = null;
    constructor(private table: string) {}
    select() { return this; }
    eq(col: string, val: unknown) { this.filters.push(r => r[col] === val); return this; }
    is(col: string, val: null) { this.filters.push(r => (r[col] ?? null) === val); return this; }
    in(col: string, vals: unknown[]) { this.filters.push(r => vals.includes(r[col])); return this; }
    contains(col: string, vals: unknown[]) {
      this.filters.push(r => vals.every(v => ((r[col] as unknown[]) ?? []).includes(v)));
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }) { this.sort = { col, asc: opts?.ascending ?? true }; return this; }
    range(from: number, to: number) { this.window = [from, to]; return this; }
    then<T1, T2>(
      onfulfilled?: ((v: { data: Row[]; error: null }) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
    ) {
      let rows = (db.tables[this.table] ?? []).filter(r => this.filters.every(f => f(r)));
      if (this.sort) {
        const { col, asc } = this.sort;
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1);
      return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
    }
  }
  return { supabase: { from: (t: string) => new Query(t), auth: { getUser: async () => ({ data: { user: null } }) } } };
});

vi.mock('@/app/data/points-service', async () => {
  const { realPointsService } = await import('@/app/data/points-service-real');
  return { pointsService: realPointsService };
});
vi.mock('@/app/data/stories-service', () => ({
  storiesService: {
    getPublicStoriesFeed: vi.fn(async () => []),
    getPointsForStories: vi.fn(async () => new Map()),
    getStoriesForPoints: vi.fn(async () => new Map()),
  },
}));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: null }) }));
vi.mock('@/app/components/feed/feed-point-card', () => ({
  FeedPointCard: ({ point }: { point: PointWithUserPosition }) =>
    <div data-testid="point-card">{point.statement}</div>,
}));
vi.mock('@/app/components/feed/feed-story-card', () => ({
  FeedStoryCard: ({ story }: { story: StoryWithAuthor }) => <div data-testid="story-card">{story.title}</div>,
}));
vi.mock('@/app/components/feed/feed-skeleton', () => ({ FeedSkeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

import { StakePage } from '@/app/pages/stake-page';
import { realPointsService } from '@/app/data/points-service-real';

let seq = 0;
function point(statement: string, o: { systemTags?: string[]; tags?: string[]; supersededBy?: string | null } = {}): Row {
  seq += 1;
  return {
    id: `pt-${seq}`,
    statement,
    first_validator_id: 'u-owner',
    created_at: `2026-01-01T00:${String(Math.floor(seq / 60)).padStart(2, '0')}:${String(seq % 60).padStart(2, '0')}Z`,
    updated_at: '2026-01-01T00:00:00Z',
    tags: o.tags ?? [],
    system_tags: o.systemTags ?? [],
    visibility: 'public',
    superseded_by: o.supersededBy ?? null,
    creator: null,
  };
}
const stake = (pointId: string): Row => ({ point_id: pointId, position: 'agree', user_id: 'u-x' });

function renderStake(tag: string) {
  return render(
    <MemoryRouter initialEntries={[`/stake/${tag}`]}>
      <Routes><Route path="/stake/:tag" element={<StakePage />} /></Routes>
    </MemoryRouter>,
  );
}
const cardTexts = () => screen.getAllByTestId('point-card').map(c => c.textContent);

beforeEach(() => {
  seq = 0;
  db.tables = { points: [], point_positions: [] };
});

describe('P1376 — /stake/:tag shows heads only', () => {
  it('a superseded v1 does not render next to its v2 head (system tag)', async () => {
    const v2 = point('st1 v2 wording', { systemTags: ['misunderstanding', 'st1', 'v2'] });
    const v1 = point('st1 v1 wording', { systemTags: ['misunderstanding', 'st1', 'v1'], supersededBy: v2.id as string });
    const other = point('st2 v1 wording', { systemTags: ['misunderstanding', 'st2', 'v1'] });
    db.tables.points = [v1, v2, other];
    db.tables.point_positions = [stake(v1.id as string), stake(v2.id as string), stake(other.id as string)];

    renderStake('misunderstanding');
    await screen.findAllByTestId('point-card');
    expect(cardTexts()).toEqual(['st1 v2 wording', 'st2 v1 wording']);
  });

  it('holds for a user tag too, not only the standing instruments', async () => {
    const v2 = point('new wording', { tags: ['mytag'] });
    const v1 = point('old wording', { tags: ['mytag'], supersededBy: v2.id as string });
    db.tables.points = [v1, v2];
    db.tables.point_positions = [stake(v1.id as string), stake(v2.id as string)];

    renderStake('mytag');
    await screen.findAllByTestId('point-card');
    expect(cardTexts()).toEqual(['new wording']);
  });

  it('the filter is in the query: 52 superseded rows (oldest) do not push the heads out of the 50-row window', async () => {
    const heads = [point('head A', { tags: ['big'] }), point('head B', { tags: ['big'] })];
    const old: Row[] = [];
    for (let i = 0; i < 52; i++) old.push(point(`old ${i}`, { tags: ['big'], supersededBy: heads[0].id as string }));
    // Oldest-first ordering: create the superseded rows BEFORE the heads by re-stamping dates.
    old.forEach((r, i) => { r.created_at = `2025-01-01T00:00:${String(i).padStart(2, '0')}Z`; });
    db.tables.points = [...old, ...heads];
    db.tables.point_positions = [...old, ...heads].map(r => stake(r.id as string));

    renderStake('big');
    await screen.findAllByTestId('point-card');
    expect(cardTexts()).toEqual(['head A', 'head B']);
  });

  // P1337 (founder, 2026-10-05): current versions are now the service's DEFAULT; only the feed
  // asks for every version (its "Latest" switch filters them on the page).
  it('the service returns current versions by default, and superseded rows only when asked (the feed)', async () => {
    const v2 = point('st1 v2 wording', { systemTags: ['misunderstanding', 'st1', 'v2'] });
    const v1 = point('st1 v1 wording', { systemTags: ['misunderstanding', 'st1', 'v1'], supersededBy: v2.id as string });
    db.tables.points = [v1, v2];
    db.tables.point_positions = [stake(v1.id as string), stake(v2.id as string)];

    const current = await realPointsService.getPublicPointsFeed(50, 0, 'misunderstanding', undefined, true);
    expect(current.map(r => r.statement)).toEqual(['st1 v2 wording']);
    const all = await realPointsService.getPublicPointsFeed(50, 0, 'misunderstanding', undefined, true, undefined, false);
    expect(all.map(r => r.statement).sort()).toEqual(['st1 v1 wording', 'st1 v2 wording']);
  });
});

describe('P1376 — the tag name is visible below Back', () => {
  it.each(['misunderstanding', 'ikigai1'])('renders "%s" verbatim as a visible h1 after the Back button', async (tag) => {
    db.tables.points = [point('a statement', { systemTags: [tag], tags: [tag] })];
    db.tables.point_positions = [stake('pt-1')];

    renderStake(tag);
    await screen.findAllByTestId('point-card');

    const heading = screen.getByRole('heading', { level: 1, name: tag });
    expect(heading.textContent).toBe(tag);
    expect(heading.className).not.toMatch(/sr-only/);
    // The page carries two Back controls (top FocusHeader, bottom); the top one is first in the DOM.
    const back = within(document.body).getAllByRole('button', { name: /back/i })[0];
    // Back comes first in the document, the tag heading right after it.
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
