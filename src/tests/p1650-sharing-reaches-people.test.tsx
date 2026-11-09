/**
 * @file p1650-sharing-reaches-people.test.tsx
 * @description P1650 client half, with the database mocked at `supabase.rpc`:
 *   - the services read the new shapes: share people, share_canvas {skipped}, an event entry's date,
 *     list_attachable_canvases, seal {skipped}, add-recipient {delivery_id, skipped}
 *   - the Share field: people before events on focus, no search below 3 characters or with '@', "Added. Not sent to chat.",
 *     an already-shared event shows its own date, two-line rows, the empty-list text
 *   - the paperclip: "Attach", a Canvases tab (only with a conversation), its empty text, picking stages a canvas
 *   - the letter send confirmation names recipients not sent to chat
 * Each negative assertion has a control showing the same thing for the case that must have it.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const rpc = vi.hoisted(() => vi.fn());
const loadMine = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } } }));
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(), noteNoSessionSuppression: vi.fn(),
  throwDbError: (_what: string, error: { message?: string } | null, message: string) => { throw new Error(error?.message ?? message); },
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: null, user: null }) }));
vi.mock('@/app/data/chat-ui-helpers', async (importActual) => ({
  ...(await importActual<typeof import('@/app/data/chat-ui-helpers')>()),
  loadMyShareables: loadMine,
}));

import { canvasService, type AudienceEntry } from '@/app/data/canvas-service';
import { CanvasShareControl } from '@/app/components/canvas/canvas-share-control';
import { AttachDialog } from '@/app/pages/chat/ChatDialogs';
import { LetterSealConfirmation } from '@/app/components/letters/letter-seal-confirmation';
import { notSentToChatText, readAddedRecipient } from '@/app/data/letter-chat-skipped';
import { sealLetter, addRecipientToSealed } from '@/app/data/letters-service';

const PERSON_ROW = (id: string, name: string, slug: string) => ({ profile_id: id, name, slug, avatar_url: null, avatar_color: '#123456', has_pledged: false, is_verified: true });
const PEOPLE = [PERSON_ROW('p1', 'Ana Maria Lopez', 'ana-lopez'), PERSON_ROW('p2', 'Jean-Luc Picard', 'jl')];
const TARGETS = {
  events: [{ id: 'e2', title: 'A very long event title that has to wrap onto a second line and not run into the row below it at 320px', slug: 'long', datetime: '2026-11-08T10:00:00Z', hosted: true }],
  groups: [{ id: 'g1', name: 'Founders', slug: 'founders', public: true }],
};

interface Setup { people?: unknown; targets?: unknown; entries?: unknown[]; share?: unknown; search?: unknown[] }
function mockRpc(o: Setup = {}) {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'get_canvas_audience') return { data: { general_access: 'restricted', link_token: null, entries: o.entries ?? [] }, error: null };
    if (fn === 'get_canvas_share_targets') return { data: o.targets ?? TARGETS, error: null };
    if (fn === 'get_canvas_share_people') return { data: o.people ?? PEOPLE, error: null };
    if (fn === 'share_canvas') return { data: o.share ?? { shared: true, skipped: [] }, error: null };
    if (fn === 'search_profiles') return { data: o.search ?? [], error: null };
    return { data: true, error: null };
  });
}
const called = (fn: string) => rpc.mock.calls.filter(c => c[0] === fn);

beforeEach(() => { rpc.mockReset(); loadMine.mockReset(); loadMine.mockResolvedValue([]); });
afterEach(() => { cleanup(); });

describe('services read the P1650 shapes', () => {
  it('getSharePeople maps the rows; CONTROL: an answer that is not a list reads as no people', async () => {
    mockRpc();
    const people = await canvasService.getSharePeople();
    expect(people.map(p => [p.profileId, p.name, p.slug])).toEqual([['p1', 'Ana Maria Lopez', 'ana-lopez'], ['p2', 'Jean-Luc Picard', 'jl']]);
    mockRpc({ people: true });
    expect(await canvasService.getSharePeople()).toEqual([]);
  });

  it('shareCanvas returns the skipped list; CONTROL: a re-share (empty skipped) and an older bare answer both read as none', async () => {
    mockRpc({ share: { shared: true, skipped: [{ kind: 'person', id: 'p1', name: 'Ana' }] } });
    expect((await canvasService.shareCanvas('x', 'person', 'p1')).skipped).toHaveLength(1);
    mockRpc({ share: { shared: true, skipped: [] } });
    expect((await canvasService.shareCanvas('x', 'person', 'p1')).skipped).toEqual([]);
    mockRpc({ share: true });
    expect((await canvasService.shareCanvas('x', 'person', 'p1')).skipped).toEqual([]);
  });

  it('getAudience carries an event entry\'s date and null for a person', async () => {
    mockRpc({ entries: [{ kind: 'event', id: 'e1', name: 'Old hike', datetime: '2026-01-02T10:00:00Z' }, { kind: 'person', id: 'p1', name: 'Pia' }] });
    const entries = await canvasService.getAudience('x');
    expect(entries[0]!.datetime).toBe('2026-01-02T10:00:00Z');
    expect(entries[1]!.datetime).toBeNull();
  });

  it('listAttachableCanvases maps rows and asks for this conversation', async () => {
    rpc.mockResolvedValueOnce({ data: [{ canvas_id: 'c1', name: 'sales', title: null }, { canvas_id: 'c2', name: 'plan', title: 'My plan' }], error: null });
    const rows = await canvasService.listAttachableCanvases('conv-1');
    expect(rpc).toHaveBeenCalledWith('list_attachable_canvases', { p_conversation: 'conv-1' });
    expect(rows).toEqual([{ canvasId: 'c1', name: 'sales', title: null }, { canvasId: 'c2', name: 'plan', title: 'My plan' }]);
  });

  it('sealLetter hands back skipped; addRecipientToSealed reads delivery_id and skipped', async () => {
    rpc.mockResolvedValueOnce({ data: { sealed: true, skipped: [{ delivery_id: 'd1', name: 'Ana' }] }, error: null });
    const sealed = await sealLetter('l1', [], [{ receiver_profile_id: 'p1' }]);
    expect(sealed).toMatchObject({ success: true, skipped: [{ name: 'Ana' }] });
    rpc.mockResolvedValueOnce({ data: { delivery_id: 'd9', skipped: [{ delivery_id: 'd9', name: 'Ben' }] }, error: null });
    expect(await addRecipientToSealed('l1', 'ben@example.com', 'Ben')).toEqual({ deliveryId: 'd9', skipped: [{ delivery_id: 'd9', name: 'Ben' }] });
    // CONTROL: a success with nothing skipped
    expect(readAddedRecipient({ delivery_id: 'd2', skipped: [] })).toEqual({ deliveryId: 'd2', skipped: [] });
  });

  it('notSentToChatText names the recipients; nothing skipped says nothing', () => {
    expect(notSentToChatText([{ name: 'Ana' }, { name: 'Ben' }])).toBe('Not sent to chat: Ana, Ben.');
    expect(notSentToChatText([])).toBe('');
    expect(notSentToChatText(undefined)).toBe('');
  });
});

describe('the Share field', () => {
  const LINK = 'https://example.test/p/ana/canvas/x';
  const open = async (o: Setup = {}) => {
    mockRpc(o);
    render(<CanvasShareControl name="x" visibility="private" entries={[]} link={LINK} onChanged={() => undefined} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    await screen.findByTestId('canvas-share-invite');
    await waitFor(() => expect(called('get_canvas_share_people')).toHaveLength(1));
    await screen.findByTestId('canvas-share-owner'); // the panel has loaded
  };
  const focus = () => fireEvent.focus(screen.getByTestId('canvas-share-invite'));
  const type = (text: string) => fireEvent.change(screen.getByTestId('canvas-share-invite'), { target: { value: text } });
  const labels = () => screen.queryAllByTestId('canvas-share-option').map(o => within(o).getByTestId('canvas-share-option-label').textContent);
  const sections = () => screen.queryAllByTestId('canvas-share-section').map(s => s.textContent);
  const idle = () => act(async () => { await new Promise(r => setTimeout(r, 450)); });

  it('on focus the people come first, then events, then groups, before anything is typed', async () => {
    await open();
    focus();
    await screen.findByTestId('canvas-share-list');
    expect(sections()).toEqual(['People', 'Events', 'Groups']);
    expect(labels()).toEqual(['Ana Maria Lopez', 'Jean-Luc Picard', TARGETS.events[0]!.title, 'Founders']);
    expect(called('search_profiles')).toHaveLength(0); // nothing was typed: the server's search stays quiet
  });

  it('CONTROL: with no people the list starts with the events, and has no People heading', async () => {
    await open({ people: [] });
    focus();
    await screen.findByTestId('canvas-share-list');
    expect(sections()).toEqual(['Events', 'Groups']);
  });

  it('a row\'s text wraps to at most two lines, and the row grows with it (never a fixed height)', async () => {
    await open();
    focus();
    const label = (await screen.findAllByTestId('canvas-share-option-label'))[2]!;
    expect(label.className).toMatch(/\bline-clamp-2\b/);
    expect(label.className).toMatch(/\bmin-w-0\b/);
    const row = label.closest('[role="option"]')!;
    expect(row.className).toMatch(/\bmin-h-11\b/);
    expect(row.className).not.toMatch(/(^|\s)h-\d/);
  });

  it('one or two characters narrow the listed people on the client and never call search_profiles; CONTROL: three do', async () => {
    await open();
    focus();
    type('jl'); // a handle
    await idle();
    expect(labels()).toEqual(['Jean-Luc Picard']);
    expect(called('search_profiles')).toHaveLength(0);
    type('lop');
    await waitFor(() => expect(called('search_profiles')).toHaveLength(1));
    expect(rpc).toHaveBeenCalledWith('search_profiles', { p_query: 'lop' });
  });

  it('a query with @ is an email: no search and no person rows; CONTROL: the same letters without @ search', async () => {
    await open();
    focus();
    type('ana@example.com');
    await idle();
    expect(called('search_profiles')).toHaveLength(0);
    expect(screen.queryAllByTestId('canvas-share-option')).toHaveLength(0);
    type('ana example');
    await waitFor(() => expect(called('search_profiles')).toHaveLength(1));
  });

  it('a person already on the canvas is not offered again; CONTROL: the other person still is', async () => {
    await open({ entries: [{ kind: 'person', id: 'p1', name: 'Ana Maria Lopez', slug: 'ana-lopez', owner_admitted: true, count: 1 }] });
    await screen.findByTestId('canvas-share-entry');
    focus();
    await screen.findByTestId('canvas-share-list');
    expect(labels()).not.toContain('Ana Maria Lopez');
    expect(labels()).toContain('Jean-Luc Picard');
  });

  it('a share nobody could be told about says "Added. Not sent to chat."; CONTROL: a delivered share says nothing', async () => {
    await open({ share: { shared: true, skipped: [{ kind: 'person', id: 'p2', name: 'Jean-Luc Picard' }] } });
    focus();
    fireEvent.click(await screen.findByText('Jean-Luc Picard'));
    expect(await screen.findByTestId('canvas-share-not-sent')).toHaveTextContent(/^Added\. Not sent to chat\.$/);
    cleanup();
    rpc.mockReset();
    await open({ share: { shared: true, skipped: [] } });
    focus();
    fireEvent.click(await screen.findByText('Jean-Luc Picard'));
    await waitFor(() => expect(called('share_canvas')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId('canvas-share-row-spinner')).toBeNull());
    expect(screen.queryByTestId('canvas-share-not-sent')).toBeNull();
  });

  it('the people list failing to load never fails the panel; typing still finds people', async () => {
    mockRpc();
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'get_canvas_share_people') return { data: null, error: { message: 'boom' } };
      if (fn === 'get_canvas_audience') return { data: { general_access: 'restricted', link_token: null, entries: [] }, error: null };
      if (fn === 'get_canvas_share_targets') return { data: TARGETS, error: null };
      return { data: [PERSON_ROW('p3', 'Zed Lopez', 'zed')], error: null };
    });
    render(<CanvasShareControl name="x" visibility="private" entries={[]} link={LINK} onChanged={() => undefined} />);
    fireEvent.click(screen.getByTestId('canvas-share-control'));
    await screen.findByTestId('canvas-share-empty');
    focus();
    type('zed');
    expect(await screen.findByText('Zed Lopez')).toBeInTheDocument();
  });

  it('an event already on the canvas shows its OWN date, even though it is no longer offered', async () => {
    await open({ entries: [{ kind: 'event', id: 'old', name: 'Spring hike', owner_admitted: true, count: 3, datetime: '2026-03-14T10:00:00Z' }] });
    expect(await screen.findByTestId('canvas-share-entry-date')).toHaveTextContent(/Mar/);
    focus();
    await screen.findByTestId('canvas-share-list');
    expect(labels()).not.toContain('Spring hike');
  });

  it('an owner with no events or groups reads the empty-list text that covers events that are all past', async () => {
    await open({ people: [], targets: { events: [], groups: [] } });
    focus();
    expect(await screen.findByTestId('canvas-share-nothing-to-add')).toHaveTextContent(/You have no events or groups to share with yet\. Events stay on this list until a week after they start/);
  });
});

describe('the paperclip', () => {
  const wrap = (conversationId?: string, onPick = vi.fn()) => render(
    <MemoryRouter><AttachDialog viewerId="u1" conversationId={conversationId} onPick={onPick} onClose={vi.fn()} /></MemoryRouter>,
  );

  it('is titled "Attach" and, in a chat, has a Canvases tab listing what the server offers; picking stages it', async () => {
    rpc.mockResolvedValue({ data: [{ canvas_id: 'c1', name: 'sales', title: 'Sales map' }], error: null });
    const onPick = vi.fn();
    wrap('conv-1', onPick);
    expect(await screen.findByRole('heading', { name: 'Attach' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Canvases' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Attach Sales map' }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'canvas', id: 'c1', title: 'Sales map' }));
    expect(rpc).toHaveBeenCalledWith('list_attachable_canvases', { p_conversation: 'conv-1' });
  });

  it('with none listed the tab says to share the canvas first; CONTROL: Points keeps its own empty words', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    wrap('conv-1');
    fireEvent.click(await screen.findByRole('tab', { name: 'Canvases' }));
    expect(await screen.findByText(/Share the canvas first/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Points' }));
    expect(await screen.findByText('You have no points to attach yet.')).toBeInTheDocument();
  });

  it('a canvas list that fails to load leaves points and stories usable and says so on its own tab', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    loadMine.mockResolvedValue([{ kind: 'point', id: 'pt', title: 'A point', tags: [], point: undefined }]);
    wrap('conv-1');
    fireEvent.click(await screen.findByRole('tab', { name: 'Canvases' }));
    expect(await screen.findByText(/Could not load your canvases/)).toBeInTheDocument();
    expect(screen.queryByText(/Share the canvas first/)).toBeNull();
  });

  it('without a conversation (a mirror chat) there is no Canvases tab and no canvas read; CONTROL: with one there is', async () => {
    wrap(undefined);
    await screen.findByRole('tab', { name: 'Points' });
    expect(screen.queryByRole('tab', { name: 'Canvases' })).toBeNull();
    expect(called('list_attachable_canvases')).toHaveLength(0);
    cleanup();
    rpc.mockResolvedValue({ data: [], error: null });
    wrap('conv-2');
    expect(await screen.findByRole('tab', { name: 'Canvases' })).toBeInTheDocument();
  });
});

describe('the letter send confirmation', () => {
  const show = (notInChat?: { name: string }[]) => render(
    <MemoryRouter><LetterSealConfirmation docId="d1" receiverName="Ana" mode="one-to-one" storyCount={2} letterId="l1" notInChat={notInChat} /></MemoryRouter>,
  );
  it('names a recipient who was not sent to chat; CONTROL: none skipped shows no such line', () => {
    show([{ name: 'Ben' }]);
    expect(screen.getByTestId('letter-not-sent-to-chat')).toHaveTextContent('Not sent to chat: Ben.');
    cleanup();
    show([]);
    expect(screen.queryByTestId('letter-not-sent-to-chat')).toBeNull();
  });
});

// keep the type import used: an audience entry's date is optional on purpose (older answers carry none)
export type _Entry = AudienceEntry;
