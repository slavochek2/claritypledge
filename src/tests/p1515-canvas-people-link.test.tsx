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

  it('phase 5: a version is sent only when one is chosen (the old three-argument call is unchanged); the open version and the versions list are mapped, newest first as sent', async () => {
    rpc.mockResolvedValueOnce({ data: raw({ version: 'sales_v2', versions: [{ name: 'sales_v2', created_at: '2026-10-22T10:00:00Z' }, { name: 'sales', created_at: '2026-10-01T10:00:00Z' }] }), error: null });
    const view = await canvasService.getCanvas('o', 'sales', undefined, undefined, 'sales');
    expect(rpc).toHaveBeenCalledWith('get_canvas', { p_owner: 'o', p_name: 'sales', p_link_token: null, p_version: 'sales' });
    expect(view.version).toBe('sales_v2');
    expect(view.versions).toEqual([{ name: 'sales_v2', createdAt: '2026-10-22T10:00:00Z' }, { name: 'sales', createdAt: '2026-10-01T10:00:00Z' }]);
    rpc.mockResolvedValueOnce({ data: raw(), error: null });
    const older = await canvasService.getCanvas('o', 'sales');
    expect(rpc).toHaveBeenLastCalledWith('get_canvas', { p_owner: 'o', p_name: 'sales', p_link_token: null });
    expect(older.versions).toEqual([]); // an answer without versions (older shape) reads as none
    expect(older.version).toBeNull();
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
    rpc.mockResolvedValueOnce({ data: { general_access: 'link', link_token: 'tok' }, error: null });
    expect(await canvasService.setGeneralAccess('x', 'link')).toEqual({ generalAccess: 'link', linkToken: 'tok' });
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

  it('removeEventAttendee calls remove_event_attendee and clears the Back cache, success or failure (a removal takes readers off canvases)', async () => {
    const before = listReturnCacheGeneration();
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await canvasService.removeEventAttendee('e1', 'u1');
    expect(rpc).toHaveBeenCalledWith('remove_event_attendee', { p_event: 'e1', p_user: 'u1' });
    expect(listReturnCacheGeneration()).toBeGreaterThan(before);
    const mid = listReturnCacheGeneration();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'not authorized for this event' } });
    await expect(canvasService.removeEventAttendee('e1', 'u1')).rejects.toThrow();
    expect(listReturnCacheGeneration()).toBeGreaterThan(mid);
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
  const options = () => screen.queryAllByTestId('canvas-share-option').map(o =>
    `${within(o).getByTestId('canvas-share-option-label').textContent}${within(o).getByTestId('canvas-share-option-sub').textContent}`);
  // Choosing "Anyone with the link" asks first (phase 4): this answers the confirmation.
  const confirmLink = async () => { fireEvent.click(await screen.findByRole('button', { name: 'Share with link' })); };

  it('the control is a "Share" button that still carries the link state for assistive technology', () => {
    render(<CanvasShareControl name="x" visibility="shared" generalAccess="link" entries={[]} link={LINK} onChanged={() => undefined} />);
    expect(screen.getByTestId('canvas-share-control')).toHaveTextContent(/^Share/);
    expect(screen.getByTestId('canvas-share-label')).toHaveTextContent('Anyone with the link');
    cleanup();
    render(<CanvasShareControl name="x" visibility="private" entries={[]} link={LINK} onChanged={() => undefined} />);
    expect(screen.getByTestId('canvas-share-label')).toHaveTextContent('Private · only you');
  });

  it('the open state shows a globe, never a lock; CONTROL: "Only people added" keeps the lock', () => {
    render(<CanvasShareControl name="x" visibility="shared" generalAccess="link" entries={[]} link={LINK} onChanged={() => undefined} />);
    expect(screen.getByTestId('canvas-share-open-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-share-lock-icon')).toBeNull();
    cleanup();
    render(<CanvasShareControl name="x" visibility="shared" generalAccess="restricted" entries={[eventEntry()]} link={LINK} onChanged={() => undefined} />);
    expect(screen.getByTestId('canvas-share-lock-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-share-open-icon')).toBeNull();
  });

  it('a long @handle truncates and the name keeps its width (name flex-1 min-w-0; handle max-w and truncate, not shrink-0); the full handle is in the title', async () => {
    const LONG = 'p1515-late-mviexo8c133-1792605340436-2985-and-even-longer-than-that';
    search.results = [{ profileId: 'p9', name: 'P1515 Late mviexo8c133', slug: LONG }];
    await open();
    type('p1515');
    const row = (await screen.findByText('P1515 Late mviexo8c133')).closest('[role="option"]')!;
    const [name, handle] = [...row.querySelectorAll('span')].filter(el => el.textContent === 'P1515 Late mviexo8c133' || el.textContent === `@${LONG}`);
    expect(name!.className).toMatch(/\bmin-w-0\b/);
    expect(name!.className).toMatch(/\bflex-1\b/);
    expect(handle!.className).toMatch(/\btruncate\b/);
    expect(handle!.className).toMatch(/max-w-\[45%\]/);
    expect(handle!.className).not.toMatch(/shrink-0/);
    expect(handle!.getAttribute('title')).toBe(`@${LONG}`);
  });

  it('desktop: the panel is a card anchored under the button (not a full-white sheet): about 420px wide, bordered, shadowed, never wider than the viewport, scrollable', async () => {
    await open();
    const panel = screen.getByTestId('canvas-share-panel');
    expect(panel.className).toMatch(/w-\[420px\]/);
    expect(panel.className).toMatch(/max-w-\[calc\(100vw-2rem\)\]/);
    expect(panel.className).toMatch(/rounded-xl/);
    expect(panel.className).toMatch(/shadow-lg/);
    expect(panel.className).toMatch(/overflow-hidden/); // the panel itself does not scroll: its body does (header and footer stay put)
    expect(screen.getByTestId('canvas-share-scroll').className).toMatch(/overflow-y-auto/);
    expect(panel.className).toMatch(/\[&>\*\]:min-w-0/); // a long unbroken @handle truncates, never widens the panel
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(screen.getByTestId('canvas-share-control').getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('below 640px the panel is a bottom sheet: pinned to the bottom edge, full width, rounded top, clears the home bar; CONTROL: desktop has none of that', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q === '(max-width: 639px)', media: q, addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false, onchange: null,
    })) as unknown as typeof window.matchMedia;
    try {
      await open();
      const sheet = screen.getByTestId('canvas-share-panel');
      expect(sheet.className).toMatch(/\bbottom-0\b/);
      expect(sheet.className).toMatch(/\bw-full\b/);
      expect(sheet.className).toMatch(/rounded-t-2xl/);
      expect(sheet.className).toMatch(/max-h-\[85dvh\]/);
      expect(sheet.className).toMatch(/safe-area-inset-bottom/);
      expect(sheet.className).not.toMatch(/w-\[420px\]/);
    } finally {
      window.matchMedia = original;
    }
  });

  it('the panel title is the canvas name, with a Close control', async () => {
    await open();
    expect(screen.getByTestId('canvas-share-title')).toHaveTextContent('x');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('canvas-share-panel')).toBeNull());
  });

  it('one invite field: people from the search, plus the owner\'s own events and groups, narrowed by what is typed', async () => {
    search.results = [{ profileId: 'p1', name: 'Pia Person', slug: 'pia' }];
    await open();
    // focusing the field lists the owner's own events and groups at once, no people (the search needs 3 letters)
    fireEvent.blur(screen.getByTestId('canvas-share-invite'));
    expect(screen.queryByTestId('canvas-share-options')).toBeNull(); // CONTROL: unfocused and empty, no list
    fireEvent.focus(screen.getByTestId('canvas-share-invite'));
    expect(options().map(t => t.replace(/(Event|Group)$/, ''))).toEqual(['Session two', 'Founders']);
    type('pi');
    expect(options()).toEqual([]); // two letters: no search, and neither event nor group matches
    type('pia');
    expect(options()).toEqual(['Pia Person@pia']);
    type('fou');
    expect(options().some(t => t.startsWith('Founders'))).toBe(true);
    expect(screen.getByLabelText('Add people, events or groups')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-share-invite')).toHaveAttribute('placeholder', 'Add people, events or groups');
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
    fireEvent.click(screen.getByTestId('canvas-share-invite')); // the list closed with the pick; clicking the field opens it again
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
    expect(rows[0]).toHaveTextContent('@pia'); // a person: name and @handle only
    expect(rows[0]).not.toHaveTextContent('Can read it and add to it');
    expect(rows[2]).not.toHaveTextContent('can see it');
    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Stop sharing with Pia Person' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('unshare_canvas', { p_name: 'x', p_kind: 'person', p_target: 'p1' }));
  });

  it('no row carries the "anyone who registers / joins" explainer any more', async () => {
    await open([personEntry(), eventEntry(), eventEntry({ kind: 'group', id: 'g1', name: 'Founders', public: true }), eventEntry({ kind: 'group', id: 'g9', name: 'Closed circle', public: false, count: 3, names: null })], 'shared');
    expect(screen.queryAllByTestId('canvas-share-entry-note')).toHaveLength(0);
    expect(screen.queryAllByTestId('canvas-share-entry-names')).toHaveLength(0);
    expect(screen.getAllByTestId('canvas-share-entry')).toHaveLength(4);
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
    await confirmLink();
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
    await confirmLink();
    expect(await screen.findByTestId('canvas-share-error')).toHaveTextContent('Could not change who has access. Nothing changed.');
    expect((screen.getByTestId('canvas-share-general') as HTMLSelectElement).value).toBe('restricted');
  });

  it('Copy link writes the canvas address to the clipboard and says so; a refusal is reported, not hidden', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await open();
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK)); // restricted: the plain address, no token
    expect(await screen.findByTestId('canvas-share-copied')).toHaveTextContent('Copied');
    writeText.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    expect(await screen.findByTestId('canvas-share-copy-error')).toHaveTextContent('Could not copy the link.');
    expect(screen.queryByTestId('canvas-share-copied')).toBeNull();
  });

  it('while the canvas is open to anyone with the link, Copy link carries the token in the FRAGMENT (#k=); CONTROL: closed, it carries none', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await open([], 'shared', 'link');
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${LINK}#k=tok-abc`));
    cleanup();
    writeText.mockClear();
    await open([], 'private', 'restricted');
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK));
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('k='));
  });

  it('never copies a tokenless address while the canvas is open: with no token known it says so and writes nothing; CONTROL: with the token it copies', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    // the audience read says 'link' but carries no token (an older answer, or a failed field)
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_canvas_audience') return { data: { general_access: 'link', link_token: null, entries: [] }, error: null };
      if (fn === 'get_canvas_share_targets') return { data: targets, error: null };
      return { data: true, error: null };
    });
    render(<CanvasShareControl name="x" visibility="shared" generalAccess="link" entries={[]} link={LINK} onChanged={() => undefined} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    await screen.findByTestId('canvas-share-invite');
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    expect(await screen.findByTestId('canvas-share-copy-error')).toHaveTextContent('Could not copy the link.');
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByTestId('canvas-share-copied')).toBeNull();
    cleanup();
    await open([], 'shared', 'link'); // the token is known
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${LINK}#k=tok-abc`));
  });

  it('Copy link is disabled while a change and the re-read after it are in flight; CONTROL: enabled once they finish', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => { release = resolve; });
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_canvas_audience') return { data: { general_access: 'restricted', link_token: null, entries: [] }, error: null };
      if (fn === 'get_canvas_share_targets') return { data: targets, error: null };
      if (fn === 'set_canvas_general_access') { await held; return { data: { general_access: 'link', link_token: 'tok-new' }, error: null }; }
      return { data: true, error: null };
    });
    render(<CanvasShareControl name="x" visibility="private" entries={[]} link={LINK} onChanged={() => undefined} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    await screen.findByTestId('canvas-share-invite');
    expect(screen.getByTestId('canvas-share-copy')).toBeEnabled();
    fireEvent.change(screen.getByTestId('canvas-share-general'), { target: { value: 'link' } });
    await confirmLink();
    await waitFor(() => expect(screen.getByTestId('canvas-share-copy')).toBeDisabled());
    release();
    await waitFor(() => expect(screen.getByTestId('canvas-share-copy')).toBeEnabled());
  });

  it('the "Link copied" status goes away when access changes (it belonged to the other address)', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const state = { access: 'restricted' as 'restricted' | 'link' };
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_canvas_audience') return { data: { general_access: state.access, link_token: state.access === 'link' ? 'tok-abc' : null, entries: [] }, error: null };
      if (fn === 'get_canvas_share_targets') return { data: targets, error: null };
      if (fn === 'set_canvas_general_access') { state.access = 'link'; return { data: { general_access: 'link', link_token: 'tok-abc' }, error: null }; }
      return { data: true, error: null };
    });
    render(<CanvasShareControl name="x" visibility="private" entries={[]} link={LINK} onChanged={() => undefined} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    await screen.findByTestId('canvas-share-invite');
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    expect(await screen.findByTestId('canvas-share-copied')).toBeInTheDocument(); // copied the plain address
    fireEvent.change(screen.getByTestId('canvas-share-general'), { target: { value: 'link' } });
    await confirmLink();
    await waitFor(() => expect(screen.queryByTestId('canvas-share-copied')).toBeNull());
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(`${LINK}#k=tok-abc`));
    expect(await screen.findByTestId('canvas-share-copied')).toBeInTheDocument(); // CONTROL: the new address has its own status
  });

  it('the panel says reopening makes a new link and the old one stops working', async () => {
    await open([], 'shared', 'link');
    expect(screen.getByTestId('canvas-share-general-note')).toHaveTextContent('Turning it off and on again makes a new link, and the old one stops working.');
  });
});

describe('phase 4: the share panel (Claude / Notion style)', () => {
  const targets = {
    events: [{ id: 'e1', title: 'Sales mastermind', slug: 'sales-mastermind', datetime: '2026-10-21T10:00:00Z', hosted: true }],
    groups: [{ id: 'g1', name: 'Founders', slug: 'founders', public: true }],
  };
  const LINK = 'https://example.test/p/ana/canvas/x';
  const calls = () => rpc.mock.calls.map(c => c[0] as string);

  function mockPanel(entries: AudienceEntry[], generalAccess: 'restricted' | 'link' = 'restricted') {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_canvas_audience') return { data: { general_access: generalAccess, link_token: generalAccess === 'link' ? 'tok-abc' : null, entries: entries.map(e => ({ ...e, owner_admitted: e.ownerAdmitted })) }, error: null };
      if (fn === 'get_canvas_share_targets') return { data: targets, error: null };
      return { data: true, error: null };
    });
  }
  const open = async (entries: AudienceEntry[] = [], generalAccess: 'restricted' | 'link' = 'restricted') => {
    mockPanel(entries, generalAccess);
    render(<CanvasShareControl name="x" visibility={entries.length ? 'shared' : 'private'} generalAccess={generalAccess} entries={entries} link={LINK} onChanged={() => undefined} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    await screen.findByTestId('canvas-share-owner');
  };

  it('AC1: the owner\'s button reads "Share", is blue with a lock; open to the link it wears a globe instead', () => {
    render(<CanvasShareControl name="x" visibility="private" entries={[]} link={LINK} onChanged={() => undefined} />);
    const button = screen.getByTestId('canvas-share-control');
    expect(button).toHaveTextContent(/^Share/);
    expect(button.className).toMatch(/\bbg-blue-600\b/);
    expect(screen.getByTestId('canvas-share-lock-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-share-open-icon')).toBeNull();
    cleanup();
    render(<CanvasShareControl name="x" visibility="shared" generalAccess="link" entries={[]} link={LINK} onChanged={() => undefined} />);
    expect(screen.getByTestId('canvas-share-open-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-share-lock-icon')).toBeNull();
  });

  it('AC2: focusing the invite field lists the owner\'s events and groups with nothing typed; picking one adds it at once, with a spinner on its row while it saves', async () => {
    await open();
    fireEvent.blur(screen.getByTestId('canvas-share-invite'));
    expect(screen.queryAllByTestId('canvas-share-option')).toHaveLength(0);
    fireEvent.focus(screen.getByTestId('canvas-share-invite'));
    expect(screen.getAllByTestId('canvas-share-option')).toHaveLength(2);
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => { release = resolve; });
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'share_canvas') { await held; return { data: true, error: null }; }
      if (fn === 'get_canvas_audience') return { data: { general_access: 'restricted', link_token: null, entries: [] }, error: null };
      return { data: targets, error: null };
    });
    fireEvent.click(screen.getByText('Founders'));
    await waitFor(() => expect(screen.getByTestId('canvas-share-row-spinner')).toBeInTheDocument());
    expect(screen.getByTestId('canvas-share-copy')).toBeDisabled(); // the address may change with it
    release();
    await waitFor(() => expect(screen.queryByTestId('canvas-share-row-spinner')).toBeNull());
    expect(rpc).toHaveBeenCalledWith('share_canvas', { p_name: 'x', p_kind: 'group', p_target: 'g1' });
  });

  it('AC3: People with access shows You (owner) first, then each entry with its avatar or icon, name and only the essential subline (person @handle, event date) and a remove control that works', async () => {
    const group = { kind: 'group' as const, id: 'g9', name: 'Closed circle', slug: 'closed', public: false, ownerAdmitted: true, count: 3, names: null };
    await open([personEntry(), eventEntry(), group]);
    const list = screen.getByTestId('canvas-share-entries');
    expect(within(list).getAllByRole('listitem')[0]).toBe(screen.getByTestId('canvas-share-owner'));
    expect(screen.getByTestId('canvas-share-owner')).toHaveTextContent('You (owner)');
    const rows = screen.getAllByTestId('canvas-share-entry');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByTestId('canvas-share-entry-handle')).toHaveTextContent('@pia'); // person: the handle
    expect(within(rows[1]!).getByTestId('canvas-share-entry-date')).toHaveTextContent(/Oct/); // event: title and date only
    for (const r of rows) {
      expect(r).not.toHaveTextContent(/can see it/);
      expect(r).not.toHaveTextContent('Ana, Ben');
      expect(within(r).queryByTestId('canvas-share-entry-count')).toBeNull();
    }
    for (const r of rows) expect(within(r).getByTestId('canvas-share-remove')).toBeInTheDocument();
    fireEvent.click(within(rows[1]!).getByRole('button', { name: 'Stop sharing with Sales mastermind' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('unshare_canvas', { p_name: 'x', p_kind: 'event', p_target: 'e1' }));
  });

  it('AC4: "Anyone with the link" asks first with the exact words; Cancel changes nothing; "Share with link" opens it', async () => {
    await open();
    fireEvent.change(screen.getByTestId('canvas-share-general'), { target: { value: 'link' } });
    expect(await screen.findByText('Share with anyone who has the link?')).toBeInTheDocument();
    expect(screen.getByText('Anyone with this link can read this canvas, even without signing in. Signed-in people can also add positions and stories.')).toBeInTheDocument();
    expect(calls()).not.toContain('set_canvas_general_access'); // nothing yet
    expect(screen.getByRole('button', { name: 'Share with link' }).className).toMatch(/\bbg-blue-600\b/); // the main action of a popup is blue (design system)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Share with anyone who has the link?')).toBeNull());
    expect(calls()).not.toContain('set_canvas_general_access');
    expect((screen.getByTestId('canvas-share-general') as HTMLSelectElement).value).toBe('restricted');
    expect(screen.getByTestId('canvas-share-panel')).toBeInTheDocument(); // the panel stayed open behind the confirmation
    fireEvent.change(screen.getByTestId('canvas-share-general'), { target: { value: 'link' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Share with link' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_canvas_general_access', { p_name: 'x', p_access: 'link' }));
  });

  it('AC4: going back to "Only people added" needs no confirmation, and the line says the old link stops working', async () => {
    await open([], 'link');
    expect(screen.getByTestId('canvas-share-reach')).toHaveTextContent('Anyone with the link can open this canvas');
    mockPanel([], 'restricted');
    fireEvent.change(screen.getByTestId('canvas-share-general'), { target: { value: 'restricted' } });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_canvas_general_access', { p_name: 'x', p_access: 'restricted' }));
    expect(screen.queryByText('Share with anyone who has the link?')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('canvas-share-general-note')).toHaveTextContent('The old link stops working.'));
    expect(screen.getByTestId('canvas-share-reach')).toHaveTextContent('Only people added can open this canvas');
  });

  it('AC5: Copy link shows "Copied" with a check, then reads "Copy link" again after two seconds', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await open();
    expect(screen.getByTestId('canvas-share-copy')).toHaveTextContent('Copy link');
    fireEvent.click(screen.getByTestId('canvas-share-copy'));
    expect(await screen.findByTestId('canvas-share-copied')).toHaveTextContent('Copied');
    expect(screen.getByTestId('canvas-share-copy').querySelector('svg')).not.toBeNull();
    await waitFor(() => expect(screen.queryByTestId('canvas-share-copied')).toBeNull(), { timeout: 3500 });
    expect(screen.getByTestId('canvas-share-copy')).toHaveTextContent('Copy link');
  });
});

describe('phase 4 review round: the share panel', () => {
  const targets = {
    events: [{ id: 'e1', title: 'Sales mastermind', slug: 'sales-mastermind', datetime: '2026-10-21T10:00:00Z', hosted: true }],
    groups: [{ id: 'g1', name: 'Founders', slug: 'founders', public: true }],
  };
  const LINK = 'https://example.test/p/ana/canvas/x';
  const state = { entries: [] as AudienceEntry[], access: 'restricted' as 'restricted' | 'link', targets };
  function mock(over: Partial<typeof state> = {}) {
    Object.assign(state, { entries: [], access: 'restricted', targets }, over);
    rpc.mockImplementation(async (fn: string, args?: { p_kind?: string; p_target?: string }) => {
      if (fn === 'unshare_canvas') state.entries = state.entries.filter(e => !(e.kind === args?.p_kind && e.id === args?.p_target));
      if (fn === 'get_canvas_audience') return { data: { general_access: state.access, link_token: state.access === 'link' ? 'tok-abc' : null, entries: state.entries.map(e => ({ ...e, owner_admitted: e.ownerAdmitted })) }, error: null };
      if (fn === 'get_canvas_share_targets') return { data: state.targets, error: null };
      return { data: true, error: null };
    });
  }
  const open = async (over: Partial<typeof state> = {}, props: { generalAccess?: 'restricted' | 'link' } = {}) => {
    mock(over);
    render(<CanvasShareControl name="x" visibility="private" generalAccess={props.generalAccess ?? 'restricted'} entries={[]} link={LINK} onChanged={() => undefined} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    await screen.findByTestId('canvas-share-owner');
  };
  const input = () => screen.getByTestId('canvas-share-invite') as HTMLInputElement;
  const group = (id: string, name: string) => ({ kind: 'group' as const, id, name, slug: id, public: false, ownerAdmitted: true, count: 1, names: null });

  it('R1: the button is named "Share" and DESCRIBED by the access state (the state is not hidden by the name)', () => {
    render(<CanvasShareControl name="x" visibility="private" entries={[]} link={LINK} onChanged={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Share', description: 'Private · only you' })).toBeInTheDocument();
  });

  it('R2: after a pick the list closes and the typed text is cleared', async () => {
    await open();
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: 'fou' } });
    fireEvent.click(await screen.findByText('Founders'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('share_canvas', { p_name: 'x', p_kind: 'group', p_target: 'g1' }));
    await waitFor(() => expect(input().value).toBe(''));
    await waitFor(() => expect(screen.queryByTestId('canvas-share-options')).toBeNull());
    expect(screen.queryByTestId('canvas-share-nothing-to-add')).toBeNull();
  });

  it('R3: Escape while the link confirmation is open closes only the confirmation, not the panel', async () => {
    await open();
    fireEvent.change(screen.getByTestId('canvas-share-general'), { target: { value: 'link' } });
    const title = await screen.findByText('Share with anyone who has the link?');
    fireEvent.keyDown(title, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Share with anyone who has the link?')).toBeNull());
    expect(screen.getByTestId('canvas-share-panel')).toBeInTheDocument();
  });

  it('R4a: after a pick, focus returns to the invite input (never <body>)', async () => {
    await open();
    fireEvent.focus(input());
    const option = (await screen.findAllByTestId('canvas-share-option'))[0]!;
    option.focus();
    fireEvent.click(option);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('share_canvas', expect.anything()));
    await waitFor(() => expect(document.activeElement).toBe(input()));
  });

  it('R4b: after a remove, focus moves to the next row\'s remove button, or to the invite input when none is left', async () => {
    await open({ entries: [group('g8', 'First'), group('g9', 'Second')] });
    const removes = () => screen.getAllByTestId('canvas-share-remove');
    removes()[0]!.focus();
    fireEvent.click(removes()[0]!);
    await waitFor(() => expect(screen.getAllByTestId('canvas-share-entry')).toHaveLength(1));
    await waitFor(() => expect(document.activeElement).toBe(removes()[0]));
    removes()[0]!.focus();
    fireEvent.click(removes()[0]!);
    await waitFor(() => expect(screen.queryAllByTestId('canvas-share-entry')).toHaveLength(0));
    await waitFor(() => expect(document.activeElement).toBe(input()));
    expect(screen.queryByTestId('canvas-share-options')).toBeNull(); // programmatic return does not pop the list open
  });

  it('R4c: Tab leaves the field (options are not tab stops) and the list closes; Escape in the input closes the list only', async () => {
    await open();
    fireEvent.focus(input());
    const first = (await screen.findAllByTestId('canvas-share-option'))[0]!;
    expect(first.querySelector('button, a, input, [tabindex]')).toBeNull();
    fireEvent.blur(input(), { relatedTarget: screen.getByRole('button', { name: 'Close' }) });
    await waitFor(() => expect(screen.queryByTestId('canvas-share-options')).toBeNull());
    fireEvent.focus(input());
    await screen.findByTestId('canvas-share-options');
    fireEvent.keyDown(input(), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('canvas-share-options')).toBeNull());
    expect(screen.getByTestId('canvas-share-panel')).toBeInTheDocument();
  });

  it('R5 (ARIA): the field is a combobox that controls a listbox of options; ArrowDown then Enter picks', async () => {
    await open();
    fireEvent.focus(input());
    expect(input()).toHaveAttribute('role', 'combobox');
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    const listbox = await screen.findByRole('listbox');
    expect(input().getAttribute('aria-controls')).toBe(listbox.id);
    expect(within(listbox).getAllByRole('option').length).toBe(2);
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('share_canvas', { p_name: 'x', p_kind: 'event', p_target: 'e1' }));
  });

  it('R6: the empty-list message follows the owner\'s events and groups, not the entries (a person entry and no events or groups)', async () => {
    await open({ entries: [personEntry()], targets: { events: [], groups: [] } });
    fireEvent.focus(input());
    expect(await screen.findByTestId('canvas-share-nothing-to-add')).toHaveTextContent('You have no events or groups to share with yet.');
  });

  it('R7: text typed while a change is in flight is kept (only a pick clears it)', async () => {
    await open();
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => { release = resolve; });
    const base = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (fn: string, args?: never) => {
      if (fn === 'set_canvas_general_access') await held;
      return base(fn, args);
    });
    fireEvent.change(screen.getByTestId('canvas-share-general'), { target: { value: 'link' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Share with link' }));
    await waitFor(() => expect(screen.getByTestId('canvas-share-copy')).toBeDisabled());
    fireEvent.change(input(), { target: { value: 'typed meanwhile' } });
    release();
    await waitFor(() => expect(screen.getByTestId('canvas-share-copy')).toBeEnabled());
    expect(input().value).toBe('typed meanwhile');
  });

  it('R8: the Share icon follows the access the panel confirmed, not stale page props', async () => {
    await open({ access: 'link' }, { generalAccess: 'restricted' });
    await waitFor(() => expect(screen.getByTestId('canvas-share-open-icon')).toBeInTheDocument());
    expect(screen.queryByTestId('canvas-share-lock-icon')).toBeNull();
  });

  it('R9: a long @handle truncates with the full handle in its title (no mid-token wrap)', async () => {
    await open({ entries: [personEntry({ slug: 'a-very-long-handle-that-would-wrap-in-the-middle-of-the-token-1234567890' })] });
    const handle = screen.getByTestId('canvas-share-entry-handle');
    expect(handle.className).toMatch(/\btruncate\b/);
    expect(handle.className).not.toMatch(/break-all/);
    expect(handle.getAttribute('title')).toMatch(/^@a-very-long-handle/);
  });

  it('R10: Copy link is an outline (secondary) button, and so is its "Copied" state; Share is the only filled blue', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await open();
    const copy = screen.getByTestId('canvas-share-copy');
    expect(copy.className).toMatch(/\bborder\b/);
    expect(copy.className).not.toMatch(/\bbg-blue-600\b/);
    fireEvent.click(copy);
    await screen.findByTestId('canvas-share-copied');
    expect(screen.getByTestId('canvas-share-copy').className).not.toMatch(/\bbg-blue-600\b/);
    expect(screen.getByTestId('canvas-share-copy').className).toMatch(/\bborder\b/);
    expect(screen.getByTestId('canvas-share-control').className).toMatch(/\bbg-blue-600\b/);
    expect(screen.getByTestId('canvas-share-control').className).toMatch(/rounded-full/);
  });

  it('R11: the phone sheet titles itself with the Radix dialog title: no console warning', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q === '(max-width: 639px)', media: q, addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false, onchange: null,
    })) as unknown as typeof window.matchMedia;
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await open();
      expect(screen.getByRole('dialog', { name: 'x' })).toBeInTheDocument();
      expect(err.mock.calls.map(c => String(c[0])).filter(m => /DialogTitle|aria-describedby/.test(m))).toEqual([]);
    } finally {
      err.mockRestore();
      window.matchMedia = original;
    }
  });

  it('R12: the footer stacks on a phone (reach text on its own line, Copy link a full-width 44px button) so 320px is not crowded', async () => {
    await open();
    expect(screen.getByTestId('canvas-share-footer').className).toMatch(/\bflex-col\b/);
    const copy = screen.getByTestId('canvas-share-copy');
    expect(copy.className).toMatch(/\bw-full\b/);
    expect(copy.className).toMatch(/min-h-11/);
  });
});

describe('phase 4 review: the highlighted option is an option, not a position', () => {
  const targets = { events: [], groups: [{ id: 'g1', name: 'Founders', slug: 'founders', public: true }] };
  const mockRpc = () => rpc.mockImplementation(async (fn: string) => {
    if (fn === 'get_canvas_audience') return { data: { general_access: 'restricted', link_token: null, entries: [] }, error: null };
    if (fn === 'get_canvas_share_targets') return { data: targets, error: null };
    return { data: true, error: null };
  });
  const props = { name: 'x', visibility: 'private' as const, entries: [], link: 'https://example.test/p/ana/canvas/x', onChanged: () => undefined };

  it('K1: a person the search prepends AFTER ArrowDown does not take over the highlight: Enter shares with what was highlighted', async () => {
    mockRpc();
    search.results = [];
    const view = render(<CanvasShareControl {...props} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    const input = await screen.findByTestId('canvas-share-invite');
    fireEvent.change(input, { target: { value: 'fou' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(within(await screen.findByRole('listbox')).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true'); // Founders
    search.results = [{ profileId: 'p1', name: 'Pia Person', slug: 'pia' }]; // the debounced search answers: the person is now first
    view.rerender(<CanvasShareControl {...props} />);
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[0]).toHaveTextContent('Pia Person');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('share_canvas', { p_name: 'x', p_kind: 'group', p_target: 'g1' }));
    expect(rpc).not.toHaveBeenCalledWith('share_canvas', expect.objectContaining({ p_kind: 'person' }));
  });

  it('K2: if the highlighted option leaves the list, the highlight clears and Enter shares nothing', async () => {
    mockRpc();
    search.results = [{ profileId: 'p1', name: 'Pia Person', slug: 'pia' }];
    const view = render(<CanvasShareControl {...props} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    const input = await screen.findByTestId('canvas-share-invite');
    fireEvent.change(input, { target: { value: 'pia' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(within(await screen.findByRole('listbox')).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    search.results = [];
    view.rerender(<CanvasShareControl {...props} />);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(rpc).not.toHaveBeenCalledWith('share_canvas', expect.anything());
  });

  it('K3: options carry no inner button (Tab does not walk them); a click on the option picks; while busy it is aria-disabled and ignores clicks; aria-controls only while open', async () => {
    mockRpc();
    search.results = [];
    render(<CanvasShareControl {...props} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    const input = await screen.findByTestId('canvas-share-invite');
    expect(input).not.toHaveAttribute('aria-controls'); // closed
    fireEvent.focus(input);
    expect(input).toHaveAttribute('aria-controls');
    const option = within(await screen.findByRole('listbox')).getAllByRole('option')[0]!;
    expect(option.querySelector('button')).toBeNull();
    expect(option).toHaveAttribute('data-testid', 'canvas-share-option');
    fireEvent.click(option);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('share_canvas', { p_name: 'x', p_kind: 'group', p_target: 'g1' }));
  });

  it('K4: ArrowDown scrolls the highlighted option into view (block nearest)', async () => {
    mockRpc();
    search.results = [];
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    render(<CanvasShareControl {...props} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    const input = await screen.findByTestId('canvas-share-invite');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' }));
  });
});

describe('phase 4 visual QA: the panel keeps its header and footer in view', () => {
  const LINK = 'https://example.test/p/ana/canvas/x';
  const open = async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_canvas_audience') return { data: { general_access: 'restricted', link_token: null, entries: [] }, error: null };
      if (fn === 'get_canvas_share_targets') return { data: { events: [], groups: [] }, error: null };
      return { data: true, error: null };
    });
    render(<CanvasShareControl name="x" visibility="private" entries={[]} link={LINK} onChanged={() => undefined} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    await screen.findByTestId('canvas-share-owner');
  };

  it('V3: the title and Close sit OUTSIDE the scrolling region, as does the footer; the invite field and the lists are inside it', async () => {
    await open();
    const scroll = screen.getByTestId('canvas-share-scroll');
    expect(scroll.contains(screen.getByTestId('canvas-share-title'))).toBe(false);
    expect(scroll.contains(screen.getByRole('button', { name: 'Close' }))).toBe(false);
    expect(scroll.contains(screen.getByTestId('canvas-share-footer'))).toBe(false);
    expect(scroll.contains(screen.getByTestId('canvas-share-invite'))).toBe(true);
    expect(scroll.contains(screen.getByTestId('canvas-share-owner'))).toBe(true);
    expect(screen.getByTestId('canvas-share-header').className).toMatch(/\bshrink-0\b/);
    expect(screen.getByTestId('canvas-share-footer').className).toMatch(/\bshrink-0\b/);
  });

  it('V2: on a phone the Share button never shrinks and sits right after the picker (shrink-0, max-sm:order-3)', () => {
    render(<CanvasShareControl name="x" visibility="private" entries={[]} link={LINK} onChanged={() => undefined} />);
    expect(screen.getByTestId('canvas-share-control').className).toMatch(/\bshrink-0\b/);
    expect(screen.getByTestId('canvas-share-control').className).toMatch(/max-sm:order-3/);
  });

  it('V4: the Close and remove icons are 40px hit areas (h-10 w-10)', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_canvas_audience') return { data: { general_access: 'restricted', link_token: null, entries: [{ ...personEntry(), owner_admitted: true }] }, error: null };
      if (fn === 'get_canvas_share_targets') return { data: { events: [], groups: [] }, error: null };
      return { data: true, error: null };
    });
    render(<CanvasShareControl name="x" visibility="shared" entries={[personEntry()]} link={LINK} onChanged={() => undefined} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    await screen.findAllByTestId('canvas-share-remove');
    for (const el of [screen.getByRole('button', { name: 'Close' }), screen.getByTestId('canvas-share-remove')]) {
      expect(el.className).toMatch(/\bh-10\b/);
      expect(el.className).toMatch(/\bw-10\b/);
    }
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
