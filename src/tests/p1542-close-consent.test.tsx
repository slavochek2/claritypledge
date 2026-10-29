// @vitest-environment jsdom
/**
 * P1542 review round 7: the quote refusal must live where it cannot be lost (another viewer in the tab, cleared
 * storage, another device). Through the real close: untick with no "liked" words, save the improvement, lose every
 * draft, reopen — consent is still off, and new words are submitted as NOT quotable. The founder's default stays:
 * someone who only saved a score reopens with the box ticked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
const series = vi.hoisted(() => ({ slug: 'social-hike' as string | null, finished: false }));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventBySlug: vi.fn(async () => ({
      id: 'ev-1', slug: 'night', title: 'Night', description: 'd', datetime: '2000-01-01T11:00:00Z', timezone: 'UTC',
      durationMinutes: 60, location: 'Somewhere', hostId: 'host-1', hostName: 'H', hasGroupChat: false, preparationEnabled: true,
      statementTag: null, researchPlaces: 6, attendees: [], seriesSlug: series.slug,
    })),
    getEventGroupChatUrl: vi.fn().mockResolvedValue(null),
    getUpcomingEvents: vi.fn().mockResolvedValue([]),
    getEventAttendees: vi.fn().mockResolvedValue([]),
    isUserRsvpd: vi.fn().mockResolvedValue(true),
  },
}));
vi.mock('@/app/data/event-close-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/event-close-service')>()),
  getEventClose: vi.fn(async () => ({ isAttendee: true, score: series.finished ? 9 : null, liked: null, improve: null, quoteOk: null, asks: [], finished: series.finished })),
  finishEventClose: vi.fn().mockResolvedValue(true),
  getCommunitySlug: vi.fn().mockResolvedValue(null),
  getSeriesPeople: vi.fn().mockResolvedValue(0),
  saveEventFeedback: vi.fn().mockResolvedValue(true),
  setEventQuoteOk: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/app/data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/api')>()),
  getProfile: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/app/pages/stake-page', () => ({ StakePage: () => null }));
vi.mock('@/app/data/points-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/data/points-service')>();
  return { ...actual, pointsService: { ...actual.pointsService, getPublicPointsFeed: vi.fn().mockResolvedValue([]) } };
});
vi.mock('@/app/prototypes/events/prep/use-prep-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/prep/use-prep-state')>()),
  loadTagPoints: vi.fn().mockResolvedValue([]),
}));


import { CloseInRoom } from '@/app/prototypes/events/close/CloseInRoom';

const event = {
  id: 'ev-1', slug: 'walk', title: 'Social Hike: Walk', description: 'd', datetime: '2000-01-01T11:00:00Z', timezone: 'UTC',
  durationMinutes: 60, location: 'Somewhere', hostId: 'host-1', hostName: 'H', hasGroupChat: false, preparationEnabled: true,
  statementTag: null, researchPlaces: 6, attendees: [], seriesSlug: 'social-hike',
} as never;

function open() {
  const slot = document.createElement('div'); // the room's head, where the step header (and its Back) is drawn
  document.body.appendChild(slot);
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/events/walk/meet', search: '?view=feedback', state: { fromEvent: true, roomDepth: 1 } }]}>
      <Routes><Route path="/events/:slug/meet" element={<CloseInRoom event={event} viewerId="u1" room={{ headSlot: slot, leave: vi.fn() }} />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  // A one-shot answer a failed test left unconsumed must not leak into the next test.
  const { getEventClose } = await import('@/app/data/event-close-service');
  vi.mocked(getEventClose).mockReset();
  vi.mocked(getEventClose).mockImplementation(async () => ({ isAttendee: true, score: null, liked: null, improve: null, quoteOk: null, asks: [], finished: false }) as never);
  sessionStorage.clear();
  auth.value = { user: { id: 'u1', name: 'Ana' }, session: { user: { id: 'u1' } }, isLoading: false, sessionChecked: true };
  series.finished = false;
});

describe('round 7: the quote refusal survives losing every draft', () => {
  it('untick + improvement saved, all drafts lost, reopen: consent is off, and new words carry the refusal', async () => {
    const { getEventClose, saveEventFeedback } = await import('@/app/data/event-close-service');
    // What the server holds after that save: the improvement, no "liked" words, the refusal (quote_ok false).
    vi.mocked(getEventClose).mockResolvedValueOnce({ isAttendee: true, score: 8, liked: null, improve: 'More water.', quoteOk: false, asks: [], finished: false } as never);
    open();
    const box = await screen.findByRole('checkbox');
    expect(box).not.toBeChecked();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lovely people.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(vi.mocked(saveEventFeedback)).toHaveBeenCalled());
    // Round 12 (F1): the box shows unticked, so the words carry the refusal too (an answer save can always lower it).
    const sent = vi.mocked(saveEventFeedback).mock.calls.at(-1)![1] as { liked: string; quoteOk?: unknown };
    expect(sent.liked).toBe('Lovely people.');
    expect(sent.quoteOk).toBe(false);
  });

  it('founder default kept: someone who saved only a score reopens at "liked" with the box ticked', async () => {
    const { getEventClose } = await import('@/app/data/event-close-service');
    // Saved with the box ticked (the default) and no words yet.
    vi.mocked(getEventClose).mockResolvedValueOnce({ isAttendee: true, score: 8, liked: null, improve: 'More water.', quoteOk: true, asks: [], finished: false } as never);
    open();
    expect(await screen.findByRole('checkbox')).toBeChecked();
  });

  it('K2: a saved row with every answer skipped but the refusal kept (quote_ok false) reopens unticked', async () => {
    const { getEventClose } = await import('@/app/data/event-close-service');
    // The row exists (quote_ok is never NULL for a real row; get_event_close LEFT JOINs) with nothing else in it.
    vi.mocked(getEventClose).mockResolvedValueOnce({ isAttendee: true, score: null, liked: null, improve: null, quoteOk: false, asks: [], finished: false } as never);
    sessionStorage.setItem('p1389-step:u1:ev-1', 'appreciate'); // this person was on "What did you like"
    open();
    expect(await screen.findByRole('checkbox')).not.toBeChecked();
  });

  it('a first-time person with no saved row reaches "What did you like" ticked (the founder default)', async () => {
    const { getEventClose } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce({ isAttendee: true, score: null, liked: null, improve: null, quoteOk: null, asks: [], finished: false } as never);
    sessionStorage.setItem('p1389-step:u1:ev-1', 'appreciate');
    open();
    expect(await screen.findByRole('checkbox')).toBeChecked();
  });
});

describe('round 9: consent is written only by the box, on the server', () => {
  const row = (r: Record<string, unknown>) => ({ isAttendee: true, score: 8, liked: null, improve: 'More water.', quoteOk: true, asks: [], finished: false, ...r }) as never;
  const lastSave = async () => {
    const { saveEventFeedback } = await import('@/app/data/event-close-service');
    return vi.mocked(saveEventFeedback).mock.calls.at(-1)![1];
  };

  it('Codex A: a stale tab still showing the tick submits its words WITHOUT a quote permission (the server keeps the refusal made elsewhere)', async () => {
    const { getEventClose } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({}));
    open();
    expect(await screen.findByRole('checkbox')).toBeChecked();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lovely people.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(async () => expect((await lastSave()) as { liked?: string }).toMatchObject({ liked: 'Lovely people.' }));
    expect(((await lastSave()) as { quoteOk?: unknown }).quoteOk ?? null).toBeNull(); // no permission sent: the server keeps its own
  });

  it('Codex B / survives storage and devices: unticking saves the refusal to the server at once, before any words', async () => {
    const { getEventClose, setEventQuoteOk } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({}));
    const view = open();
    fireEvent.click(await screen.findByRole('checkbox'));
    await waitFor(() => expect(vi.mocked(setEventQuoteOk)).toHaveBeenCalledWith('ev-1', false, expect.any(String)));
    // Another attendee uses the tab, storage is wiped, or the person comes back on another device: the close reads the
    // server, which now holds the refusal.
    view.unmount();
    sessionStorage.clear();
    vi.mocked(getEventClose).mockResolvedValueOnce(row({ quoteOk: false }));
    open();
    expect(await screen.findByRole('checkbox')).not.toBeChecked();
  });

  it('Gemini: a score save from a stale tab carries no quote permission', async () => {
    const { getEventClose } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({ score: null, improve: null }));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Rate 7' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit' })[0]!);
    await waitFor(async () => expect((await lastSave()) as { score?: number }).toMatchObject({ score: 7 }));
    expect(((await lastSave()) as { quoteOk?: unknown }).quoteOk ?? null).toBeNull(); // no permission sent: the server keeps its own
  });

  it('the box shows what the server holds when "What did you like" opens (one read on entering the step)', async () => {
    const { getEventClose } = await import('@/app/data/event-close-service');
    // Opened on the improvement; by the time the person reaches "What did you like", another device refused.
    vi.mocked(getEventClose).mockResolvedValueOnce(row({ improve: null })).mockResolvedValueOnce(row({ quoteOk: false }));
    sessionStorage.setItem('p1389-step:u1:ev-1', 'improve');
    open();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'More shade.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('checkbox')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
    expect(vi.mocked(getEventClose)).toHaveBeenCalledTimes(2);
  });

  it('a first-timer (no saved row) is ticked by default', async () => {
    const { getEventClose } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({ score: null, improve: null, quoteOk: null }));
    sessionStorage.setItem('p1389-step:u1:ev-1', 'appreciate');
    open();
    expect(await screen.findByRole('checkbox')).toBeChecked();
  });

  it('an untick before any answer leaves a box-only row: the close still opens at the first question, nothing finished', async () => {
    const { getEventClose, finishEventClose } = await import('@/app/data/event-close-service');
    // set_event_quote_ok created the row: quote_ok false, every answer NULL, not finished.
    vi.mocked(getEventClose).mockResolvedValueOnce(row({ score: null, liked: null, improve: null, quoteOk: false }));
    open();
    expect(await screen.findByTestId('step-score')).toBeInTheDocument();
    expect(screen.queryByTestId('step-end')).toBeNull();
    expect(vi.mocked(finishEventClose)).not.toHaveBeenCalled();
  });
});

describe('round 11: each click is written at once with its click time; the server orders them', () => {
  const row = (r: Record<string, unknown>) => ({ isAttendee: true, score: 8, liked: null, improve: 'More water.', quoteOk: true, asks: [], finished: false, ...r }) as never;
  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
  }

  it('Codex 1: a failed box write does not block a later Submit; the box shows the server\'s value again', async () => {
    const { getEventClose, setEventQuoteOk, saveEventFeedback } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({})).mockResolvedValueOnce(row({})); // open, then the re-read
    vi.mocked(setEventQuoteOk).mockResolvedValueOnce(false);
    open();
    fireEvent.click(await screen.findByRole('checkbox')); // untick — its write fails
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked()); // back to the server's value
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lovely people.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(vi.mocked(saveEventFeedback)).toHaveBeenCalled());
  });

  it('Codex 2: every write carries the time of ITS click, so a late write from an older close cannot pass as newer', async () => {
    const { getEventClose, setEventQuoteOk } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({})).mockResolvedValueOnce(row({}));
    const late = deferred<boolean>();
    vi.mocked(setEventQuoteOk).mockImplementationOnce(() => late.promise).mockResolvedValue(true);
    // An older close (the one a remount replaced) ticks at t1; its write is still out.
    const first = open();
    fireEvent.click(await screen.findByRole('checkbox')); // untick at t1
    first.unmount();
    await new Promise((r) => setTimeout(r, 5));
    open(); // the newer close
    fireEvent.click(await screen.findByRole('checkbox')); // untick again at t2
    late.resolve(true);
    const times = vi.mocked(setEventQuoteOk).mock.calls.map((c) => Date.parse(c[2] as string));
    expect(times).toHaveLength(2);
    expect(times[0]!).toBeLessThan(times[1]!); // the server keeps the newer click, whatever lands last
  });

  it('Codex 3: a click made while Submit is out is written at once, not lost behind it', async () => {
    const { getEventClose, setEventQuoteOk, saveEventFeedback } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({}));
    const save = deferred<boolean>();
    vi.mocked(saveEventFeedback).mockImplementationOnce(() => save.promise);
    open();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Lovely people.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(vi.mocked(saveEventFeedback)).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('checkbox')); // untick while the words are out
    await waitFor(() => expect(vi.mocked(setEventQuoteOk)).toHaveBeenCalledWith('ev-1', false, expect.any(String)));
    save.resolve(true);
  });
});

describe('round 12: a refusal rides along with every save; the re-reads stay in their lane', () => {
  const row = (r: Record<string, unknown>) => ({ isAttendee: true, score: 8, liked: null, improve: 'More water.', quoteOk: true, asks: [], finished: false, ...r }) as never;
  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
  }

  it('F1: with the box unticked, the words save itself carries the refusal (quoteOk false), even if the box write failed', async () => {
    const { getEventClose, setEventQuoteOk, saveEventFeedback } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({}));
    const write = deferred<boolean>();
    vi.mocked(setEventQuoteOk).mockImplementationOnce(() => write.promise); // the untick's own write is still out
    open();
    fireEvent.click(await screen.findByRole('checkbox')); // untick
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lovely people.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(vi.mocked(saveEventFeedback)).toHaveBeenCalled());
    expect(vi.mocked(saveEventFeedback).mock.calls.at(-1)![1]).toMatchObject({ liked: 'Lovely people.', quoteOk: false });
    write.resolve(false);
  });

  it('F1: with the box ticked, answer saves still send no permission', async () => {
    const { getEventClose, saveEventFeedback } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({}));
    open();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Lovely people.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(vi.mocked(saveEventFeedback)).toHaveBeenCalled());
    expect((vi.mocked(saveEventFeedback).mock.calls.at(-1)![1] as { quoteOk?: unknown }).quoteOk ?? null).toBeNull();
  });

  it('F2: after the close is gone, a failed write neither warns nor re-reads', async () => {
    const { getEventClose, setEventQuoteOk } = await import('@/app/data/event-close-service');
    const { toast } = await import('sonner');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({}));
    const write = deferred<boolean>();
    vi.mocked(setEventQuoteOk).mockImplementationOnce(() => write.promise);
    const view = open();
    fireEvent.click(await screen.findByRole('checkbox'));
    view.unmount();
    write.resolve(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
    expect(vi.mocked(getEventClose)).toHaveBeenCalledTimes(1); // only the opening read
  });

  it('F2: the recovery re-read waits for a visible tab', async () => {
    const { getEventClose, setEventQuoteOk } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({})).mockResolvedValueOnce(row({}));
    vi.mocked(setEventQuoteOk).mockResolvedValueOnce(false);
    open();
    const box = await screen.findByRole('checkbox');
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent.click(box);
    await new Promise((r) => setTimeout(r, 20));
    expect(vi.mocked(getEventClose)).toHaveBeenCalledTimes(1);
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(vi.mocked(getEventClose)).toHaveBeenCalledTimes(2));
    vis.mockRestore();
  });

  it('F3: a re-read on entering "What did you like" does not override a click still being written; its success shows', async () => {
    const { getEventClose, setEventQuoteOk } = await import('@/app/data/event-close-service');
    // The server still says ticked; the person's untick is being written.
    vi.mocked(getEventClose).mockResolvedValueOnce(row({})).mockResolvedValue(row({}));
    const write = deferred<boolean>();
    vi.mocked(setEventQuoteOk).mockImplementationOnce(() => write.promise);
    open();
    fireEvent.click(await screen.findByRole('checkbox')); // untick, write out
    fireEvent.click(screen.getByTestId('header-back')); // back to the improvement
    fireEvent.click(await screen.findByRole('button', { name: 'Submit' })); // forward again: the entry re-read
    await waitFor(() => expect(vi.mocked(getEventClose).mock.calls.length).toBeGreaterThanOrEqual(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(await screen.findByRole('checkbox')).not.toBeChecked();
    write.resolve(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    vi.mocked(getEventClose).mockReset();
  });
});

describe('final: an untick shown on screen is re-sent with its own click time before the words go', () => {
  const row = (r: Record<string, unknown>) => ({ isAttendee: true, score: 8, liked: null, improve: 'More water.', quoteOk: false, asks: [], finished: false, ...r }) as never;
  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
  }

  it('Z1: tick (late) at t1, untick (failed) at t2, Submit — the untick is re-sent with t2 BEFORE the words, so a late t1 loses', async () => {
    const { getEventClose, setEventQuoteOk, saveEventFeedback } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({})).mockResolvedValue(row({}));
    const tick = deferred<boolean>();
    vi.mocked(setEventQuoteOk)
      .mockImplementationOnce(() => tick.promise) // t1: the tick, still out
      .mockResolvedValueOnce(false) // t2: the untick, failed
      .mockResolvedValue(true); // the re-send
    open();
    const box = await screen.findByRole('checkbox');
    fireEvent.click(box); // tick at t1
    await new Promise((r) => setTimeout(r, 5));
    fireEvent.click(box); // untick at t2
    await new Promise((r) => setTimeout(r, 5));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lovely people.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(vi.mocked(saveEventFeedback)).toHaveBeenCalled());
    const calls = vi.mocked(setEventQuoteOk).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[2]).toEqual(['ev-1', false, calls[1]![2]]); // the untick again, with ITS original time
    expect(vi.mocked(setEventQuoteOk).mock.invocationCallOrder[2]!).toBeLessThan(vi.mocked(saveEventFeedback).mock.invocationCallOrder.at(-1)!);
    expect(vi.mocked(saveEventFeedback).mock.calls.at(-1)![1]).toMatchObject({ quoteOk: false });
    tick.resolve(true);
  });

  it('Z1: if the re-send fails too, the words still go, carrying the refusal', async () => {
    const { getEventClose, setEventQuoteOk, saveEventFeedback } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce(row({ quoteOk: true })).mockResolvedValue(row({ quoteOk: true }));
    vi.mocked(setEventQuoteOk).mockResolvedValue(false);
    open();
    fireEvent.click(await screen.findByRole('checkbox')); // untick, fails
    await waitFor(() => expect(vi.mocked(setEventQuoteOk)).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lovely people.' } });
    // The failed write's recovery read shows the server's tick again; untick once more, and that fails as well.
    await new Promise((r) => setTimeout(r, 10));
    if (screen.getByRole('checkbox') instanceof HTMLInputElement && (screen.getByRole('checkbox') as HTMLInputElement).checked) fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(vi.mocked(saveEventFeedback)).toHaveBeenCalled());
    expect(vi.mocked(saveEventFeedback).mock.calls.at(-1)![1]).toMatchObject({ quoteOk: false });
    vi.mocked(setEventQuoteOk).mockReset();
    vi.mocked(setEventQuoteOk).mockResolvedValue(true);
  });
});

