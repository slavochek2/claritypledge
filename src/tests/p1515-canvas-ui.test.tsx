/**
 * @file p1515-canvas-ui.test.tsx
 * @description P1515 phase 2 — the Clarity Canvas as one visibility idea, at component level:
 *   - the words (Private · only you / shared with …, Shared with you through …, Visible to you and …)
 *   - the canvas service maps get_canvas and clears the Back cache after every checked write
 *   - the point card inside a canvas writes through the checked functions, never the ordinary
 *     position service, shows the shared icon instead of any lock, and a reader gets no link-out
 *   - the positions block: shared icon, a way to take one's own added story off, no story link-out
 *   - the owner's share panel keeps its list when a change fails
 *   - the event page's list stays silent for anyone the event does not admit
 *
 * Each "nothing here" assertion has a control that shows the same thing for the case that must have it.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PointWithUserPosition, PointPositionWithUser, StoryWithAuthor } from '@/app/types';

const rpc = vi.hoisted(() => vi.fn());
const saveInOrder = vi.hoisted(() => vi.fn((_key: string, fn: () => Promise<unknown>) => fn()));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(), noteNoSessionSuppression: vi.fn(),
  throwDbError: (_what: string, error: { message?: string } | null, message: string) => { throw new Error(error?.message ?? message); },
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'viewer-1' } }, user: { id: 'viewer-1' } }) }));
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: vi.fn(async () => undefined) }),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { setPosition: vi.fn(async () => undefined), removePosition: vi.fn(async () => undefined) } }));
vi.mock('@/app/hooks/use-online-write-guard', () => ({
  UNRESOLVED_WRITE_MESSAGE: 'x', canSendWrite: async () => true, isNetworkWriteFailure: () => false,
  saveInOrder,
}));

import { canvasService } from '@/app/data/canvas-service';
import { pointsService } from '@/app/data/points-service';
import { listReturnCacheGeneration } from '@/lib/list-return-cache';
import { FeedPointCard, type FeedPointCardCanvas } from '@/app/components/feed/feed-point-card';
import { PointPositionsBlock } from '@/app/components/social/point-positions-block';
import { CanvasShareControl } from '@/app/components/canvas/canvas-share-control';
import { EventSharedCanvases } from '@/app/components/canvas/event-shared-canvases';
import {
  composerVisibilityCopy, joinNames, ownerLockLabel, sharedIconLabel,
} from '@/lib/canvas-audience-copy';
import type { AudienceEntry } from '@/app/data/canvas-service';

beforeEach(() => { rpc.mockReset(); });
afterEach(() => { cleanup(); localStorage.clear(); });

const entry = (over: Partial<AudienceEntry> = {}): AudienceEntry => ({
  kind: 'event', id: 'e1', name: 'Sales mastermind', slug: 'sales-mastermind', public: true,
  ownerAdmitted: true, count: 2, names: [{ id: 'a', name: 'Ana', slug: 'ana' }, { id: 'b', name: 'Ben', slug: 'ben' }], ...over,
});

describe('the words of the one visibility idea', () => {
  it('joins names the way a sentence does', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('the owner control reads Private · only you, or Private · shared with <entries>', () => {
    expect(ownerLockLabel(null, 'private')).toBe('Private · only you');
    expect(ownerLockLabel([entry(), entry({ kind: 'group', id: 'g', name: 'Founders' })], 'shared')).toBe('Private · shared with Sales mastermind and Founders');
    expect(ownerLockLabel(null, 'shared')).toBe('Private · shared'); // the audience read failed: still honest
  });

  it('an entry the owner has left is named nowhere: it shows no one the canvas (review: Gemini 2)', () => {
    const left = entry({ kind: 'group', id: 'g', name: 'Old circle', ownerAdmitted: false });
    expect(ownerLockLabel([entry(), left], 'shared')).toBe('Private · shared with Sales mastermind');
    expect(sharedIconLabel({ isOwner: true, entries: [entry(), left], via: null })).toBe('Shared with Sales mastermind');
    expect(composerVisibilityCopy({ isOwner: true, ownerName: 'Slava', entries: [left], visibility: 'shared' })).toBe('Visible only to you');
  });

  it('the icon says "Shared with …" to the owner and "Shared with you through …" to a reader', () => {
    expect(sharedIconLabel({ isOwner: true, entries: [entry()], via: null })).toBe('Shared with Sales mastermind');
    expect(sharedIconLabel({ isOwner: false, entries: null, via: { kind: 'event', id: 'e1', name: 'Sales mastermind', slug: 's' } })).toBe('Shared with you through Sales mastermind');
  });

  it('the composer tells every contributor who will read what they write', () => {
    expect(composerVisibilityCopy({ isOwner: true, ownerName: 'Slava', entries: [entry()], visibility: 'shared' })).toBe('Visible to you and Sales mastermind');
    expect(composerVisibilityCopy({ isOwner: true, ownerName: 'Slava', entries: [], visibility: 'private' })).toBe('Visible only to you');
    expect(composerVisibilityCopy({ isOwner: false, ownerName: 'Slava', entries: null, visibility: 'shared' })).toBe('Visible to you and everyone Slava shared this canvas with');
  });

  it('a shared canvas whose audience could not be read never tells its owner "only you" (review)', () => {
    expect(composerVisibilityCopy({ isOwner: true, ownerName: 'Slava', entries: null, visibility: 'shared' }))
      .toBe('Visible to you and the people you shared this canvas with');
    // CONTROL: a private canvas with no audience read still says only you.
    expect(composerVisibilityCopy({ isOwner: true, ownerName: 'Slava', entries: null, visibility: 'private' })).toBe('Visible only to you');
  });
});

describe('canvasService', () => {
  const payload = {
    points: [{
      id: 'p1', statement: 'A bet', first_validator_id: 'owner', created_at: 't', updated_at: 't', tags: [], system_tags: ['canvas_x', 'canvas:problem'],
      visibility: 'private', creator: { id: 'owner', name: 'Owner', slug: 'owner', avatar_color: '#000', avatar_url: null },
    }],
    stories: [
      { point_id: 'p1', story_id: 's1', added: false, story: { id: 's1', author_id: 'owner', content: 'mine', visibility: 'private', current_version: 1, understood_count: 0, created_at: 't', updated_at: 't', tags: [], system_tags: [], author: { id: 'owner', name: 'Owner', slug: 'owner' } } },
      { point_id: 'p1', story_id: 's2', added: true, story: { id: 's2', author_id: 'viewer-1', content: 'added', visibility: 'private', current_version: 1, understood_count: 0, created_at: 't', updated_at: 't', tags: [], system_tags: [], author: { id: 'viewer-1', name: 'V', slug: 'v' } } },
    ],
    positions: [{ id: 'pos1', point_id: 'p1', user_id: 'viewer-1', position: 'agree', reasoning: null, created_at: 't', updated_at: 't', user: { id: 'viewer-1', name: 'V', slug: 'v' } }],
    visibility: 'shared',
    access: { is_owner: false, admitted: true, via: { kind: 'event', id: 'e1', name: 'Mastermind', slug: 'm' } },
  };

  it('maps get_canvas to the app\'s types, with counts and the viewer\'s own position', async () => {
    rpc.mockResolvedValue({ data: payload, error: null });
    const view = await canvasService.getCanvas('owner', 'x', 'viewer-1');
    expect(rpc).toHaveBeenCalledWith('get_canvas', { p_owner: 'owner', p_name: 'x' });
    expect(view.points).toHaveLength(1);
    expect(view.points[0]).toMatchObject({ id: 'p1', visibility: 'private', totalPositions: 1, userPosition: { position: 'agree' } });
    expect(view.points[0]!.positionCounts.agree).toBe(1);
    expect(view.stories.get('p1')!.map(s => s.id)).toEqual(['s1', 's2']);
    expect(view.addedStoryIds).toEqual(['s2']);
    expect(view.positions.get('p1')![0]!.userName).toBe('V');
    expect(view).toMatchObject({ visibility: 'shared', isOwner: false, admitted: true, via: { kind: 'event', name: 'Mastermind' } });
  });

  it('a stranger\'s empty answer maps to no points and no visibility (the page shows not-found)', async () => {
    rpc.mockResolvedValue({ data: { points: [], stories: [], positions: [], visibility: null, access: { is_owner: false, admitted: false, via: null } }, error: null });
    const view = await canvasService.getCanvas('owner', 'x');
    expect(view.points).toEqual([]);
    expect(view.visibility).toBeNull();
    expect(view.admitted).toBe(false);
  });

  it('a failed read throws, never returns a partial canvas', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(canvasService.getCanvas('owner', 'x')).rejects.toThrow();
  });

  it('every checked write clears the Back cache after it, success or failure', async () => {
    const writes: Array<[string, () => Promise<unknown>]> = [
      ['canvas_set_position', () => canvasService.setPosition('o', 'x', 'p', 'agree')],
      ['canvas_remove_position', () => canvasService.removePosition('o', 'x', 'p')],
      ['canvas_add_story', () => canvasService.addStory('o', 'x', 'p', 'text')],
      ['canvas_remove_added_story', () => canvasService.removeAddedStory('s')],
      ['share_canvas', () => canvasService.shareCanvas('x', 'event', 'e')],
      ['unshare_canvas', () => canvasService.unshareCanvas('x', 'group', 'g')],
    ];
    for (const [fn, run] of writes) {
      rpc.mockResolvedValue({ data: 'id', error: null });
      let before = listReturnCacheGeneration();
      await run();
      expect(rpc.mock.calls.at(-1)![0], fn).toBe(fn);
      expect(listReturnCacheGeneration(), `${fn} success clears`).toBeGreaterThan(before);
      rpc.mockResolvedValue({ data: null, error: { message: 'refused' } });
      before = listReturnCacheGeneration();
      await expect(run(), `${fn} failure`).rejects.toThrow();
      expect(listReturnCacheGeneration(), `${fn} failure clears`).toBeGreaterThan(before);
    }
  });

  it('a read does NOT clear the cache', async () => {
    rpc.mockResolvedValue({ data: payload, error: null });
    const before = listReturnCacheGeneration();
    await canvasService.getCanvas('owner', 'x', 'viewer-1');
    expect(listReturnCacheGeneration()).toBe(before);
  });
});

describe('FeedPointCard inside a canvas', () => {
  const point = {
    id: 'p1', statement: 'A bet', tags: [], systemTags: ['canvas:problem'], visibility: 'private',
    positionCounts: { strongly_agree: 0, agree: 0, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 },
    totalPositions: 0, userPosition: undefined,
  } as unknown as PointWithUserPosition;
  const ownerStory = {
    id: 's1', authorId: 'owner-1', authorName: 'Owner', authorSlug: 'owner', content: 'The owner story.',
    visibility: 'private', createdAt: '2026-10-01T00:00:00Z', understoodCount: 0,
  } as unknown as StoryWithAuthor;
  const bindings = (over: Partial<FeedPointCardCanvas> = {}): FeedPointCardCanvas => ({
    setPosition: vi.fn(async () => undefined), removePosition: vi.fn(async () => undefined), reader: true, sharedLabel: 'Shared with you through Mastermind', ...over,
  });
  /** the labels of icons that speak of the point's own private flag */
  const lockIcons = () => screen.queryAllByRole('img').map(el => el.getAttribute('aria-label') ?? '').filter(l => /people you share with|visible to everyone|private|only you|visible only/i.test(l));
  const card = (canvas?: FeedPointCardCanvas, extra: Record<string, unknown> = {}) => render(
    <MemoryRouter><FeedPointCard point={point} surface="canvas" linkedStories={[ownerStory]} canvas={canvas} {...extra} /></MemoryRouter>,
  );

  it('a position is saved through the checked function, never the ordinary position service', async () => {
    const canvas = bindings();
    const saved = vi.fn();
    card(canvas, { onPositionSaved: saved });
    fireEvent.click(screen.getAllByRole('button', { name: /^disagree/i })[0]!);
    await waitFor(() => expect(canvas.setPosition).toHaveBeenCalledWith('disagree'));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(pointsService.setPosition).not.toHaveBeenCalled();
  });

  it('CONTROL: without the canvas bindings the same click goes to the ordinary service', async () => {
    card(undefined);
    fireEvent.click(screen.getAllByRole('button', { name: /^disagree/i })[0]!);
    await waitFor(() => expect(pointsService.setPosition).toHaveBeenCalled());
  });

  it('a failed checked save takes the vote back and says so', async () => {
    const canvas = bindings({ setPosition: vi.fn(async () => { throw new Error('refused'); }) });
    card(canvas);
    const button = screen.getAllByRole('button', { name: /^disagree/i })[0]!;
    fireEvent.click(button);
    await waitFor(() => expect(canvas.setPosition).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^disagree/i })[0]!.getAttribute('aria-pressed')).not.toBe('true'));
  });

  it('a failed or timed-out save may still have landed: the card reverts, then the page is told to re-read (review)', async () => {
    const canvas = bindings({ setPosition: vi.fn(async () => { throw new Error('timed out'); }) });
    const saved = vi.fn();
    card(canvas, { onPositionSaved: saved });
    fireEvent.click(screen.getAllByRole('button', { name: /^disagree/i })[0]!);
    await waitFor(() => expect(canvas.setPosition).toHaveBeenCalled());
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole('button', { name: /^disagree/i })[0]!.getAttribute('aria-pressed')).not.toBe('true');
  });

  it('a failed withdrawal also asks the page to re-read', async () => {
    const voted = { ...point, userPosition: { id: 'pp', pointId: 'p1', userId: 'viewer-1', position: 'agree' } } as unknown as PointWithUserPosition;
    const canvas = bindings({ removePosition: vi.fn(async () => { throw new Error('timed out'); }) });
    const saved = vi.fn();
    render(<MemoryRouter><FeedPointCard point={voted} surface="canvas" linkedStories={[ownerStory]} canvas={canvas} onPositionSaved={saved} /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole('button', { name: /^agree/i })[0]!); // the chosen position opens its menu
    fireEvent.click(await screen.findByRole('option', { name: /Clear position/i }));
    await waitFor(() => expect(canvas.removePosition).toHaveBeenCalled());
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  });

  it('a withdrawal waits in the same queue as a save still in flight (review: Codex 4)', async () => {
    // A queueing saveInOrder, like the real one: calls for one key run one after another, in click order.
    const queues = new Map<string, Promise<unknown>>();
    saveInOrder.mockImplementation((key: string, fn: () => Promise<unknown>) => {
      const run = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(fn);
      queues.set(key, run);
      return run;
    });
    try {
      let release: () => void = () => undefined;
      const held = new Promise<void>(resolve => { release = resolve; });
      const canvas = bindings({ setPosition: vi.fn(() => held) });
      card(canvas);
      fireEvent.click(screen.getAllByRole('button', { name: /^disagree/i })[0]!);
      await waitFor(() => expect(canvas.setPosition).toHaveBeenCalledWith('disagree'));
      // The save is still in flight. Withdraw now.
      fireEvent.click(screen.getAllByRole('button', { name: /^disagree/i })[0]!); // opens its menu
      fireEvent.click(await screen.findByRole('option', { name: /Clear position/i }));
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(canvas.removePosition, 'the withdrawal must NOT overtake the save in flight').not.toHaveBeenCalled();
      // The save lands: only now does the withdrawal go out.
      release();
      await waitFor(() => expect(canvas.removePosition).toHaveBeenCalledTimes(1));
      expect(vi.mocked(canvas.setPosition).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(canvas.removePosition).mock.invocationCallOrder[0]!);
    } finally {
      saveInOrder.mockImplementation((_key: string, fn: () => Promise<unknown>) => fn());
    }
  });

  it('a reader who already added a story here is not offered a second; CONTROL: one who has not is', () => {
    const voted = { ...point, userPosition: { id: 'pp', pointId: 'p1', userId: 'viewer-1', position: 'agree' } } as unknown as PointWithUserPosition;
    const offered = (canvas: FeedPointCardCanvas) => {
      const view = render(<MemoryRouter><FeedPointCard point={voted} surface="canvas" linkedStories={[ownerStory]} canvas={canvas} onAddStory={() => undefined} /></MemoryRouter>);
      const found = screen.queryByRole('button', { name: 'Add a story for this point' }) !== null;
      view.unmount();
      return found;
    };
    expect(offered(bindings())).toBe(true);
    expect(offered(bindings({ ownStoryAdded: true }))).toBe(false);
  });

  it('a reader gets no Details link-out, no card menu, and no story page behind the owner\'s story', () => {
    const MENU = { name: 'More actions for this point' };
    const reader = card(bindings());
    expect(screen.queryByText('Details')).toBeNull();
    expect(screen.queryByRole('button', MENU)).toBeNull();
    expect(screen.queryByRole('button', { name: /more|menu|share/i })).toBeNull();
    // CONTROL: the same card for the owner does carry the menu, so the query above can find it.
    reader.unmount();
    card(bindings({ reader: false }));
    expect(screen.getByRole('button', MENU)).toBeInTheDocument();
    cleanup();
    card(bindings());
    fireEvent.click(screen.getByTestId('feed-point-story-expander'));
    expect(screen.getByText('The owner story.')).toBeInTheDocument();
    expect(screen.queryByTestId('nested-details-story')).toBeNull();
  });

  it('CONTROL: the owner (not a reader) keeps Details, and the same story keeps its own Details', () => {
    card(bindings({ reader: false }));
    expect(screen.getByRole('button', { name: /details for this point/i })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('feed-point-story-expander'));
    expect(screen.getByTestId('nested-details-story')).toBeInTheDocument();
  });

  it('shows the shared icon with the audience, and no lock for the point\'s own private flag', () => {
    card(bindings());
    expect(screen.getByLabelText('Shared with you through Mastermind')).toBeInTheDocument();
    expect(lockIcons()).toEqual([]);
  });

  it('a canvas private to its owner shows no icon at all (the header control says Private)', () => {
    card(bindings({ sharedLabel: null, reader: false }));
    expect(screen.queryByTestId('canvas-shared-icon')).toBeNull();
    expect(lockIcons()).toEqual([]);
  });

  it('CONTROL: outside a canvas a private point still shows its own lock', () => {
    card(undefined);
    expect(lockIcons().length).toBeGreaterThan(0);
  });
});

describe('PointPositionsBlock inside a canvas', () => {
  const positions = [{
    id: 'pos-a', pointId: 'p1', userId: 'viewer-1', position: 'agree', userName: 'Ana', userSlug: 'ana', userAvatarColor: '#000', earCount: 0, userHasPledged: false,
  }, {
    id: 'pos-b', pointId: 'p1', userId: 'other-1', position: 'disagree', userName: 'Ben', userSlug: 'ben', userAvatarColor: '#000', earCount: 0, userHasPledged: false,
  }] as unknown as PointPositionWithUser[];
  const story = (id: string, authorId: string, authorName: string, content: string) => ({
    id, authorId, authorName, authorSlug: authorName.toLowerCase(), content, visibility: 'private', createdAt: '2026-10-01T00:00:00Z', understoodCount: 0, tags: [],
  }) as unknown as StoryWithAuthor;
  const counts = { strongly_agree: 0, agree: 1, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 1, strongly_disagree: 0 };

  it('the author can take their own added story off; nobody else gets the control', () => {
    for (const [expanded, mine] of [['viewer-1', true], ['other-1', false]] as const) {
      cleanup();
      const onRemove = vi.fn();
      render(
        <MemoryRouter>
          <PointPositionsBlock
            positions={positions} counts={counts}
            stories={[story('s-a', 'viewer-1', 'Ana', 'Ana added this.'), story('s-b', 'other-1', 'Ben', 'Ben added this.')]}
            viewerId="viewer-1" filter="all" onFilterChange={() => undefined}
            expandedId={expanded} onExpandedChange={() => undefined}
            canvas={{ sharedLabel: 'Shared with you through Mastermind', addedStoryIds: new Set(['s-a', 's-b']), onRemoveAddedStory: onRemove }}
          />
        </MemoryRouter>,
      );
      const meta = screen.getByTestId('canvas-story-meta');
      expect(within(meta).getByLabelText('Shared with you through Mastermind')).toBeInTheDocument();
      expect(meta).toHaveTextContent(mine ? 'Added by you' : 'Added by Ben');
      const remove = screen.queryByTestId('canvas-remove-added-story');
      if (mine) {
        expect(remove).not.toBeNull();
        fireEvent.click(remove!);
        expect(onRemove).toHaveBeenCalledWith('s-a');
      } else {
        expect(remove).toBeNull();
      }
    }
  });

  it('a story on the canvas is read in place: no share, no visibility lock, no link-out', () => {
    render(
      <MemoryRouter>
        <PointPositionsBlock
          positions={positions} counts={counts}
          stories={[story('s-b', 'other-1', 'Ben', 'Ben added this.')]}
          viewerId="viewer-1" filter="all" onFilterChange={() => undefined}
          expandedId="other-1" onExpandedChange={() => undefined}
          canvas={{ sharedLabel: 'Shared with you through Mastermind', addedStoryIds: new Set(['s-b']), onRemoveAddedStory: vi.fn() }}
        />
      </MemoryRouter>,
    );
    const region = screen.getByRole('region', { name: "Ben's story" });
    expect(region).toHaveTextContent('Ben added this.');
    expect(within(region).queryByRole('button', { name: /share|open story|unlink/i })).toBeNull();
    expect(within(region).queryByRole('button', { name: /private|public/i })).toBeNull();
  });

  it('CONTROL: without the canvas prop the same story keeps its ordinary controls', () => {
    render(
      <MemoryRouter>
        <PointPositionsBlock
          positions={positions} counts={counts}
          stories={[story('s-b', 'other-1', 'Ben', 'Ben added this.')]}
          viewerId="viewer-1" filter="all" onFilterChange={() => undefined}
          expandedId="other-1" onExpandedChange={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('canvas-story-meta')).toBeNull();
    const region = screen.getByRole('region', { name: "Ben's story" });
    expect(within(region).getAllByRole('button').length).toBeGreaterThan(0);
  });
});

describe('CanvasShareControl', () => {
  const targets = {
    events: [{ id: 'e2', title: 'Session two', slug: 'session-two', datetime: '2026-10-21T10:00:00Z', hosted: false }],
    groups: [{ id: 'g1', name: 'Founders', slug: 'founders', public: true }],
  };

  function mockPanel(entries: AudienceEntry[]) {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_canvas_audience') return { data: { entries: entries.map(e => ({ ...e, owner_admitted: e.ownerAdmitted })) }, error: null };
      if (fn === 'get_canvas_share_targets') return { data: targets, error: null };
      return { data: true, error: null };
    });
  }

  it('is a Private control: "Private · only you" until the owner shares', () => {
    render(<CanvasShareControl name="x" visibility="private" entries={[]} onChanged={() => undefined} />);
    expect(screen.getByTestId('canvas-share-label')).toHaveTextContent('Private · only you');
    expect(screen.queryByText(/^Shared$/)).toBeNull();
  });

  it('lists entries with counts, names for an event, count only for a private group', async () => {
    mockPanel([
      entry(),
      entry({ kind: 'group', id: 'gp', name: 'Closed circle', public: false, count: 3, names: null }),
    ]);
    render(<CanvasShareControl name="x" visibility="shared" entries={[entry()]} onChanged={() => undefined} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    const rows = await screen.findAllByTestId('canvas-share-entry');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('2 people can see it');
    expect(within(rows[0]!).getByTestId('canvas-share-entry-names')).toHaveTextContent('Ana, Ben');
    expect(rows[1]).toHaveTextContent('3 people can see it (names are private)');
    expect(within(rows[1]!).queryByTestId('canvas-share-entry-names')).toBeNull();
  });

  it('adds from the owner\'s own events and groups (those not already added)', async () => {
    mockPanel([entry()]);
    const changed = vi.fn();
    render(<CanvasShareControl name="x" visibility="shared" entries={[entry()]} onChanged={changed} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    const pick = await screen.findByTestId('canvas-share-pick');
    expect(screen.queryByTestId('canvas-share-add')).toBeNull(); // nothing chosen: no dead button
    fireEvent.change(pick, { target: { value: 'group:g1' } });
    fireEvent.click(screen.getByTestId('canvas-share-add'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('share_canvas', { p_name: 'x', p_kind: 'group', p_target: 'g1' }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });

  it('a failed change shows an error and leaves the list as it was', async () => {
    mockPanel([entry()]);
    render(<CanvasShareControl name="x" visibility="shared" entries={[entry()]} onChanged={() => undefined} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    await screen.findAllByTestId('canvas-share-entry');
    rpc.mockImplementation(async (fn: string) => (fn === 'unshare_canvas'
      ? { data: null, error: { message: 'refused' } }
      : fn === 'get_canvas_audience' ? { data: { entries: [{ ...entry(), owner_admitted: true }] }, error: null }
      : { data: targets, error: null }));
    fireEvent.click(screen.getByTestId('canvas-share-remove'));
    expect(await screen.findByTestId('canvas-share-error')).toHaveTextContent('Nothing changed');
    expect(screen.getAllByTestId('canvas-share-entry')).toHaveLength(1);
  });

  it('a share the server confirmed is never reported as "Nothing changed", even when the re-read fails (review: Codex 3)', async () => {
    mockPanel([entry()]);
    const changed = vi.fn();
    render(<CanvasShareControl name="x" visibility="shared" entries={[entry()]} onChanged={changed} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    await screen.findAllByTestId('canvas-share-entry');
    rpc.mockImplementation(async (fn: string) => (fn === 'unshare_canvas'
      ? { data: true, error: null }
      : { data: null, error: { message: 'down' } }));
    fireEvent.click(screen.getByTestId('canvas-share-remove'));
    expect(await screen.findByText('Could not load who this canvas is shared with.')).toBeInTheDocument();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('canvas-share-error')).toBeNull();
  });
});

describe('EventSharedCanvases', () => {
  const list = [{ owner_id: 'o1', owner_name: 'Slava', owner_slug: 'slava', name: 'sales' }];

  it('lists the canvases shared with the event, each a link to the canvas', async () => {
    rpc.mockResolvedValue({ data: list, error: null });
    render(<MemoryRouter><EventSharedCanvases eventId="e1" enabled /></MemoryRouter>);
    const link = await screen.findByTestId('event-shared-canvas-link');
    expect(link).toHaveAttribute('href', '/p/slava/canvas/sales');
    expect(link).toHaveTextContent('Slava · sales');
    expect(rpc).toHaveBeenCalledWith('list_canvases_shared_with_event', { p_event: 'e1' });
  });

  it('another event never shows the previous event\'s list while its own loads (review: Codex 2)', async () => {
    rpc.mockResolvedValueOnce({ data: list, error: null });
    const view = render(<MemoryRouter><EventSharedCanvases eventId="e1" enabled /></MemoryRouter>);
    await screen.findByTestId('event-shared-canvas-link');
    rpc.mockReturnValueOnce(new Promise(() => undefined)); // e2's list never arrives
    view.rerender(<MemoryRouter><EventSharedCanvases eventId="e2" enabled /></MemoryRouter>);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('list_canvases_shared_with_event', { p_event: 'e2' }));
    expect(screen.queryByTestId('event-shared-canvases')).toBeNull();
  });

  it('asks nobody the event does not admit (not enabled: no call, nothing shown)', async () => {
    rpc.mockResolvedValue({ data: list, error: null });
    render(<MemoryRouter><EventSharedCanvases eventId="e1" enabled={false} /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 20));
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByTestId('event-shared-canvases')).toBeNull();
  });

  it('renders nothing for an empty list and for a failed read', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const first = render(<MemoryRouter><EventSharedCanvases eventId="e1" enabled /></MemoryRouter>);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByTestId('event-shared-canvases')).toBeNull();
    first.unmount();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    render(<MemoryRouter><EventSharedCanvases eventId="e1" enabled /></MemoryRouter>);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByTestId('event-shared-canvases')).toBeNull();
  });
});
