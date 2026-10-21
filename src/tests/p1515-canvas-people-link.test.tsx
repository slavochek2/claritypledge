/**
 * @file p1515-canvas-people-link.test.tsx
 * @description P1515 phase 3 at component level: share a canvas with one person, and open it to anyone
 * with the link.
 *   - the words (owner control, reader line, shared icon, composer) for a person entry and the link
 *   - the owner's panel: one invite field fed by the existing profile search plus the owner's own
 *     events and groups, one "Who has access" list, a "General access" choice, "Copy link"
 *   - the canvas service maps general access and a person's reader line, and clears the Back cache
 *   - a signed-out visitor's card has no position buttons and no story prompt
 *
 * Each "not offered / no control" assertion has a control showing the same thing for the case that
 * must have it.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PointWithUserPosition } from '@/app/types';

const rpc = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ results: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(), noteNoSessionSuppression: vi.fn(),
  throwDbError: (_what: string, error: { message?: string } | null, message: string) => { throw new Error(error?.message ?? message); },
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: null, user: null }) }));
vi.mock('@/app/hooks/use-profile-search', () => ({
  // The real hook searches only for 3+ characters: the mock keeps that rule, so typing two letters finds no one.
  useProfileSearch: (q: string) => ({ results: q.trim().length >= 3 ? search.results : [], isSearching: false, hasSearched: q.trim().length >= 3 }),
}));

import { canvasService, type AudienceEntry } from '@/app/data/canvas-service';
import { listReturnCacheGeneration } from '@/lib/list-return-cache';
import { CanvasShareControl } from '@/app/components/canvas/canvas-share-control';
import { FeedPointCard, type FeedPointCardCanvas } from '@/app/components/feed/feed-point-card';
import { ownerLockLabel, readerLine, sharedIconLabel, composerVisibilityCopy } from '@/lib/canvas-audience-copy';

beforeEach(() => { rpc.mockReset(); search.results = []; });
afterEach(() => { cleanup(); });

const eventEntry = (over: Partial<AudienceEntry> = {}): AudienceEntry => ({
  kind: 'event', id: 'e1', name: 'Sales mastermind', slug: 'sales-mastermind', public: true,
  ownerAdmitted: true, count: 2, names: [{ id: 'a', name: 'Ana', slug: 'ana' }, { id: 'b', name: 'Ben', slug: 'ben' }], ...over,
});
const personEntry = (over: Partial<AudienceEntry> = {}): AudienceEntry => ({
  kind: 'person', id: 'p1', name: 'Pia Person', slug: 'pia', public: true, ownerAdmitted: true, count: 1,
  names: [{ id: 'p1', name: 'Pia Person', slug: 'pia' }], ...over,
});

describe('the words of a person entry and of the link', () => {
  it('the owner control reads "Anyone with the link" while the link is open; CONTROL: restricted keeps its old words', () => {
    expect(ownerLockLabel([], 'shared', 'link')).toBe('Anyone with the link');
    expect(ownerLockLabel(null, 'shared', 'link')).toBe('Anyone with the link');
    expect(ownerLockLabel([], 'private')).toBe('Private · only you');
    expect(ownerLockLabel([personEntry()], 'shared', 'restricted')).toBe('Private · shared with Pia Person');
  });

  it('a person entry\'s reader line names the OWNER: "Shared with you by <owner>"; an event or group keeps "through"', () => {
    expect(readerLine({ kind: 'person', id: 'p1', name: 'Ana Owner', slug: 'ana' })).toBe('Shared with you by Ana Owner');
    expect(readerLine({ kind: 'event', id: 'e1', name: 'Sales mastermind', slug: 's' })).toBe('Shared with you through Sales mastermind');
    expect(sharedIconLabel({ isOwner: false, entries: null, via: { kind: 'person', id: 'p1', name: 'Ana Owner', slug: 'ana' } })).toBe('Shared with you by Ana Owner');
  });

  it('the shared icon and the composer say "anyone with the link" when only the link admits', () => {
    expect(sharedIconLabel({ isOwner: false, entries: null, via: null, generalAccess: 'link' })).toBe('Shared with anyone with the link');
    expect(sharedIconLabel({ isOwner: true, entries: [personEntry()], via: null, generalAccess: 'link' })).toBe('Shared with Pia Person and anyone with the link');
    expect(composerVisibilityCopy({ isOwner: false, ownerName: 'Ana', entries: null, visibility: 'shared', generalAccess: 'link' })).toBe('Visible to you and anyone with the link');
    expect(composerVisibilityCopy({ isOwner: true, ownerName: 'Ana', entries: [], visibility: 'shared', generalAccess: 'link' })).toBe('Visible to you and anyone with the link');
    // CONTROL: restricted keeps the old lines
    expect(composerVisibilityCopy({ isOwner: false, ownerName: 'Ana', entries: null, visibility: 'shared' })).toBe('Visible to you and everyone Ana shared this canvas with');
    expect(sharedIconLabel({ isOwner: false, entries: null, via: null })).toBe('Shared with you');
  });
});

describe('canvasService', () => {
  const raw = (over: Record<string, unknown> = {}) => ({
    points: [], stories: [], positions: [], visibility: 'shared',
    access: { is_owner: false, admitted: true, general_access: 'link', via: null, ...over },
  });

  it('maps general access and a person\'s via; CONTROL: an older answer without the key reads restricted', async () => {
    rpc.mockResolvedValueOnce({ data: raw(), error: null });
    const open = await canvasService.getCanvas('o', 'x', undefined);
    expect(open.generalAccess).toBe('link');
    expect(open.via).toBeNull();
    rpc.mockResolvedValueOnce({ data: raw({ general_access: undefined, via: { kind: 'person', id: 'p', name: 'Ana', slug: 'ana' } }), error: null });
    const person = await canvasService.getCanvas('o', 'x', 'viewer');
    expect(person.generalAccess).toBe('restricted');
    expect(person.via).toEqual({ kind: 'person', id: 'p', name: 'Ana', slug: 'ana' });
  });

  it('a signed-out read is the same call: no viewer id is needed', async () => {
    rpc.mockResolvedValueOnce({ data: raw(), error: null });
    await canvasService.getCanvas('o', 'x');
    expect(rpc).toHaveBeenCalledWith('get_canvas', { p_owner: 'o', p_name: 'x', p_link_token: null });
  });

  it('a link token is sent with the read and with every write; CONTROL: none is sent as null', async () => {
    rpc.mockResolvedValue({ data: raw(), error: null });
    await canvasService.getCanvas('o', 'x', 'v', 'tok');
    expect(rpc).toHaveBeenCalledWith('get_canvas', { p_owner: 'o', p_name: 'x', p_link_token: 'tok' });
    rpc.mockResolvedValue({ data: null, error: null });
    await canvasService.setPosition('o', 'x', 'p', 'agree', 'tok');
    expect(rpc).toHaveBeenCalledWith('canvas_set_position', { p_owner: 'o', p_name: 'x', p_point: 'p', p_position: 'agree', p_reasoning: null, p_link_token: 'tok' });
    await canvasService.removePosition('o', 'x', 'p', 'tok');
    expect(rpc).toHaveBeenCalledWith('canvas_remove_position', { p_owner: 'o', p_name: 'x', p_point: 'p', p_link_token: 'tok' });
    rpc.mockResolvedValue({ data: 'story-id', error: null });
    await canvasService.addStory('o', 'x', 'p', 'text', 'tok');
    expect(rpc).toHaveBeenCalledWith('canvas_add_story', { p_owner: 'o', p_name: 'x', p_point: 'p', p_content: 'text', p_link_token: 'tok' });
    rpc.mockResolvedValue({ data: null, error: null });
    await canvasService.setPosition('o', 'x', 'p', 'agree');
    expect(rpc).toHaveBeenLastCalledWith('canvas_set_position', expect.objectContaining({ p_link_token: null }));
  });

  it('getAccess returns the owner\'s link token (null when closed)', async () => {
    rpc.mockResolvedValue({ data: { general_access: 'link', link_token: 'abc', entries: [] }, error: null });
    expect((await canvasService.getAccess('x')).linkToken).toBe('abc');
    rpc.mockResolvedValue({ data: { general_access: 'restricted', link_token: null, entries: [] }, error: null });
    expect((await canvasService.getAccess('x')).linkToken).toBeNull();
  });

  it('getAccess returns the list and the general access; getAudience is its entries only', async () => {
    const data = { general_access: 'link', entries: [{ kind: 'person', id: 'p1', name: 'Pia', slug: 'pia', public: true, owner_admitted: true, count: 1, names: [{ id: 'p1', name: 'Pia', slug: 'pia' }] }] };
    rpc.mockResolvedValue({ data, error: null });
    const access = await canvasService.getAccess('x');
    expect(access.generalAccess).toBe('link');
    expect(access.entries[0]).toMatchObject({ kind: 'person', id: 'p1', name: 'Pia', count: 1 });
    expect((await canvasService.getAudience('x'))).toHaveLength(1);
    rpc.mockResolvedValue({ data: { entries: [] }, error: null });
    expect((await canvasService.getAccess('x')).generalAccess).toBe('restricted');
  });

  it('setGeneralAccess and a person share call their functions and clear the Back cache, success or failure', async () => {
    const before = listReturnCacheGeneration();
    rpc.mockResolvedValueOnce({ data: 'link', error: null });
    await canvasService.setGeneralAccess('x', 'link');
    expect(rpc).toHaveBeenCalledWith('set_canvas_general_access', { p_name: 'x', p_access: 'link' });
    expect(listReturnCacheGeneration()).toBeGreaterThan(before);
    const mid = listReturnCacheGeneration();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'refused' } });
    await expect(canvasService.setGeneralAccess('x', 'restricted')).rejects.toThrow();
    expect(listReturnCacheGeneration()).toBeGreaterThan(mid);
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await canvasService.shareCanvas('x', 'person', 'p1');
    expect(rpc).toHaveBeenCalledWith('share_canvas', { p_name: 'x', p_kind: 'person', p_target: 'p1' });
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await canvasService.unshareCanvas('x', 'person', 'p1');
    expect(rpc).toHaveBeenCalledWith('unshare_canvas', { p_name: 'x', p_kind: 'person', p_target: 'p1' });
  });
});

describe('the owner\'s panel', () => {
  const targets = {
    events: [{ id: 'e2', title: 'Session two', slug: 'session-two', datetime: '2026-10-21T10:00:00Z', hosted: false }],
    groups: [{ id: 'g1', name: 'Founders', slug: 'founders', public: true }],
  };
  const LINK = 'https://example.test/p/ana/canvas/x';

  function mockPanel(entries: AudienceEntry[], generalAccess: 'restricted' | 'link' = 'restricted') {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_canvas_audience') return { data: { general_access: generalAccess, link_token: generalAccess === 'link' ? 'tok-abc' : null, entries: entries.map(e => ({ ...e, owner_admitted: e.ownerAdmitted })) }, error: null };
      if (fn === 'get_canvas_share_targets') return { data: targets, error: null };
      if (fn === 'set_canvas_general_access') return { data: 'link', error: null };
      return { data: true, error: null };
    });
  }
  const open = async (entries: AudienceEntry[] = [], visibility: 'private' | 'shared' = 'private', generalAccess: 'restricted' | 'link' = 'restricted', onChanged = () => undefined) => {
    mockPanel(entries, generalAccess);
    render(<CanvasShareControl name="x" visibility={visibility} generalAccess={generalAccess} entries={entries} link={LINK} onChanged={onChanged} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    await screen.findByTestId('canvas-share-invite');
  };
  const type = (text: string) => fireEvent.change(screen.getByTestId('canvas-share-invite'), { target: { value: text } });
  const options = () => screen.queryAllByTestId('canvas-share-option').map(o => o.textContent ?? '');

  it('the control carries the link state', () => {
    render(<CanvasShareControl name="x" visibility="shared" generalAccess="link" entries={[]} link={LINK} onChanged={() => undefined} />);
    expect(screen.getByTestId('canvas-share-label')).toHaveTextContent('Anyone with the link');
    cleanup();
    render(<CanvasShareControl name="x" visibility="private" entries={[]} link={LINK} onChanged={() => undefined} />);
    expect(screen.getByTestId('canvas-share-label')).toHaveTextContent('Private · only you');
  });

  it('one invite field: people from the search, plus the owner\'s own events and groups, narrowed by what is typed', async () => {
    search.results = [{ profileId: 'p1', name: 'Pia Person', slug: 'pia' }];
    await open();
    // nothing typed: the owner's own events and groups, no people (the search needs 3 letters)
    expect(options().map(t => t.replace(/(Event|Group)$/, ''))).toEqual(['Session two', 'Founders']);
    type('pi');
    expect(options()).toEqual([]); // two letters: no search, and neither event nor group matches
    type('pia');
    expect(options()).toEqual(['Pia Person@pia']);
    type('fou');
    expect(options().some(t => t.startsWith('Founders'))).toBe(true);
    expect(screen.getByLabelText('Add a person, event or group')).toBeInTheDocument();
  });

  it('picking a person shares by kind "person"; picking an event or group keeps its kind', async () => {
    search.results = [{ profileId: 'p1', name: 'Pia Person', slug: 'pia' }];
    const changed = vi.fn();
    await open([], 'private', 'restricted', changed);
    type('pia');
    fireEvent.click(screen.getByText('Pia Person'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('share_canvas', { p_name: 'x', p_kind: 'person', p_target: 'p1' }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    type('');
    fireEvent.click(await screen.findByText('Founders'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('share_canvas', { p_name: 'x', p_kind: 'group', p_target: 'g1' }));
  });

  it('a person already added is not offered again; CONTROL: one not added is', async () => {
    search.results = [{ profileId: 'p1', name: 'Pia Person', slug: 'pia' }, { profileId: 'p2', name: 'Pip Other', slug: 'pip' }];
    await open([personEntry()], 'shared');
    type('pip');
    // the mock search returns both people for any query of three letters; only the one not yet added is offered
    expect(options().some(t => t.startsWith('Pip Other'))).toBe(true);
    expect(options().some(t => t.startsWith('Pia Person'))).toBe(false);
  });

  it('one "Who has access" list: You (owner), then people, events and groups, each person removable with ×', async () => {
    await open([personEntry(), eventEntry(), eventEntry({ kind: 'group', id: 'g9', name: 'Closed circle', public: false, count: 3, names: null })], 'shared');
    const owner = screen.getByTestId('canvas-share-owner');
    expect(owner).toHaveTextContent('You (owner)');
    const rows = screen.getAllByTestId('canvas-share-entry');
    expect(rows.map(r => within(r).getByText(/Pia Person|Sales mastermind|Closed circle/).textContent)).toEqual(['Pia Person', 'Sales mastermind', 'Closed circle']);
    expect(rows[0]).toHaveTextContent('Can read it and add to it');
    expect(within(rows[0]!).queryByTestId('canvas-share-entry-names')).toBeNull();
    expect(rows[2]).toHaveTextContent('(names are private)');
    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Stop sharing with Pia Person' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('unshare_canvas', { p_name: 'x', p_kind: 'person', p_target: 'p1' }));
  });

  it('an open event or public group says anyone who registers or joins gets in; a person and a private group say nothing of the kind', async () => {
    await open([personEntry(), eventEntry(), eventEntry({ kind: 'group', id: 'g1', name: 'Founders', public: true }), eventEntry({ kind: 'group', id: 'g9', name: 'Closed circle', public: false, count: 3, names: null })], 'shared');
    const notes = screen.getAllByTestId('canvas-share-entry-note').map(n => n.textContent);
    expect(notes).toEqual(['Anyone who registers in time can see it.', 'Anyone who joins can see it.']);
  });

  it('empty and restricted: "Only you can see it."; CONTROL: with the link open it is not said', async () => {
    await open([]);
    expect(screen.getByTestId('canvas-share-empty')).toHaveTextContent('Only you can see it.');
    cleanup();
    await open([], 'shared', 'link');
    expect(screen.queryByTestId('canvas-share-empty')).toBeNull();
  });

  it('General access shows the server\'s value and changes it through set_canvas_general_access', async () => {
    const changed = vi.fn();
    await open([], 'private', 'restricted', changed);
    const select = screen.getByTestId('canvas-share-general') as HTMLSelectElement;
    expect(select.value).toBe('restricted');
    expect([...select.options].map(o => o.textContent)).toEqual(['Only people added', 'Anyone with the link']);
    fireEvent.change(select, { target: { value: 'link' } });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_canvas_general_access', { p_name: 'x', p_access: 'link' }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });

  it('a failed change of general access says nothing changed and keeps the choice the server confirmed', async () => {
    await open([], 'private', 'restricted');
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'set_canvas_general_access') return { data: null, error: { message: 'refused' } };
      if (fn === 'get_canvas_audience') return { data: { general_access: 'restricted', entries: [] }, error: null };
      return { data: targets, error: null };
    });
    fireEvent.change(screen.getByTestId('canvas-share-general'), { target: { value: 'link' } });
    expect(await screen.findByTestId('canvas-share-error')).toHaveTextContent('Could not change who has access. Nothing changed.');
    expect((screen.getByTestId('canvas-share-general') as HTMLSelectElement).value).toBe('restricted');
  });

  it('Copy link writes the canvas address to the clipboard and says so; a refusal is reported, not hidden', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await open();
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK)); // restricted: the plain address, no token
    expect(await screen.findByTestId('canvas-share-copied')).toHaveTextContent('Link copied');
    writeText.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    expect(await screen.findByTestId('canvas-share-copy-error')).toHaveTextContent('Could not copy the link.');
    expect(screen.queryByTestId('canvas-share-copied')).toBeNull();
  });

  it('while the canvas is open to anyone with the link, Copy link carries the token (?k=); CONTROL: closed, it carries none', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await open([], 'shared', 'link');
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${LINK}?k=tok-abc`));
    cleanup();
    writeText.mockClear();
    await open([], 'private', 'restricted');
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK));
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('?k='));
  });

  it('the panel says reopening makes a new link and the old one stops working', async () => {
    await open([], 'shared', 'link');
    expect(screen.getByTestId('canvas-share-general-note')).toHaveTextContent('Turning it off and on again makes a new link, and the old one stops working.');
  });
});

describe('a signed-out visitor\'s card', () => {
  const point = {
    id: 'p1', statement: 'A bet', tags: [], systemTags: ['canvas:problem'], visibility: 'private',
    positionCounts: { strongly_agree: 0, agree: 0, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 },
    totalPositions: 0, userPosition: undefined,
  } as unknown as PointWithUserPosition;
  const bindings = (over: Partial<FeedPointCardCanvas> = {}): FeedPointCardCanvas => ({
    setPosition: vi.fn(async () => undefined), removePosition: vi.fn(async () => undefined), reader: true, sharedLabel: 'Shared with anyone with the link', ...over,
  });
  const card = (canvas: FeedPointCardCanvas) => render(
    <MemoryRouter><FeedPointCard point={point} surface="canvas" linkedStories={[]} canvas={canvas} onAddStory={() => undefined} /></MemoryRouter>,
  );

  it('read only: no position buttons and no story prompt; CONTROL: the same card for a signed-in reader has the buttons', () => {
    card(bindings({ readOnly: true }));
    expect(screen.queryAllByRole('button', { name: /^disagree/i })).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Add a story for this point' })).toBeNull();
    cleanup();
    card(bindings());
    expect(screen.getAllByRole('button', { name: /^disagree/i }).length).toBeGreaterThan(0);
  });
});
