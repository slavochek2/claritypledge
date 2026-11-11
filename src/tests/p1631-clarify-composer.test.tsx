/**
 * P1631 step 1b: the composer of the Clarify thread (message + run in one call, refine by chatting), the Open affordance on the Clarify
 * copy with no replies, and a draft whose run never started failing within one poll. The database and the edge function are mocked:
 * the server half is pinned by src/tests/integration/p1631-clarify-drafts.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke } } }));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-1', name: 'Ada', email: 'ada@example.com' }, sessionChecked: true }) }));
vi.mock('@/app/data/chat-live-transcription', () => ({ getChatLiveTranscription: async () => null, hasTranscribedInChat: async () => false }));
vi.mock('@/app/data/room-transcription-state', () => ({ getChatTranscriptionProcessing: async () => [], getMyRoomStates: async () => new Map() }));

const svc = vi.hoisted(() => ({ clarifyMessage: vi.fn(), markClarifyFailed: vi.fn(), invokeClarifyDraft: vi.fn(), getClarifyThread: vi.fn() }));
vi.mock('@/app/data/clarify-service', async () => ({ ...(await vi.importActual<object>('@/app/data/clarify-service')), ...svc }));

import { ClarifyComposer } from '@/app/pages/chat/ClarifyComposer';
import { RepliesLink } from '@/app/pages/chat/RepliesLink';
import { ClarifyCountsContext, useClarifyDraftCounts } from '@/app/pages/chat/use-clarify-draft-counts';
import { resetClarifyRuns, runClarifyDraft, touchClarifyThread } from '@/app/pages/chat/clarify-run';
import { CLARIFY_BUSY_TOAST, CLARIFY_COMPOSER_HINT } from '@/app/pages/chat/clarify-copy';
import type { ChatMessage } from '@/app/data/chat-service';

beforeEach(() => {
  vi.clearAllMocks();
  resetClarifyRuns();
  localStorage.clear();
  svc.markClarifyFailed.mockResolvedValue(undefined);
  svc.getClarifyThread.mockResolvedValue([]);
});
afterEach(cleanup);

describe('clarify-service: the new calls', () => {
  it('clarifyMessage calls clarify_message and maps started, busy and refused to values; markClarifyFailed calls clarify_mark_failed', async () => {
    const s = await vi.importActual<typeof import('@/app/data/clarify-service')>('@/app/data/clarify-service');
    rpc.mockResolvedValueOnce({ data: { status: 'started', draft_id: 'd9', message_id: 'm9' }, error: null });
    expect(await s.clarifyMessage('r1', 'sharper')).toEqual({ status: 'started', draftId: 'd9' });
    expect(rpc).toHaveBeenLastCalledWith('clarify_message', { p_thread_root: 'r1', p_text: 'sharper' });
    rpc.mockResolvedValueOnce({ data: { status: 'busy' }, error: null });
    expect(await s.clarifyMessage('r1', 'x')).toEqual({ status: 'busy' });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'nope' } });
    await expect(s.clarifyMessage('r1', 'x')).rejects.toThrow(/clarify_message failed/);
    rpc.mockResolvedValueOnce({ data: { status: 'failed' }, error: null });
    await s.markClarifyFailed('d1');
    expect(rpc).toHaveBeenLastCalledWith('clarify_mark_failed', { p_draft: 'd1' });
  });
});

describe('C: an invoke that fails to start marks the draft failed, so it shows Retry within one poll', () => {
  it('a failed invoke calls markClarifyFailed before the thread is told the run ended', async () => {
    const order: string[] = [];
    svc.invokeClarifyDraft.mockResolvedValue({ ok: false, reason: 'failed' });
    svc.markClarifyFailed.mockImplementation(async () => { order.push('mark'); });
    const { onClarifyRunEnded } = await import('@/app/pages/chat/clarify-run');
    onClarifyRunEnded(() => order.push('ended'));
    await runClarifyDraft('d1');
    expect(svc.markClarifyFailed).toHaveBeenCalledWith('d1');
    expect(order).toEqual(['mark', 'ended']);
  });
  it('CONTROL: a clean answer, a cap and a still-pending answer mark nothing', async () => {
    for (const [i, r] of [{ ok: true }, { ok: false, reason: 'capped' }, { ok: true, pending: true }].entries()) {
      svc.invokeClarifyDraft.mockResolvedValue(r);
      await runClarifyDraft(`ok${i}`);
    }
    expect(svc.markClarifyFailed).not.toHaveBeenCalled();
  });
  it('marking failing is swallowed: the thread is still told', async () => {
    svc.invokeClarifyDraft.mockResolvedValue({ ok: false, reason: 'failed' });
    svc.markClarifyFailed.mockRejectedValue(new Error('offline'));
    await expect(runClarifyDraft('d2')).resolves.toBeTruthy();
  });
});

describe('A: the composer of the Clarify thread', () => {
  const type = (text: string) => {
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: text } });
    return field;
  };
  const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  it('is the product composer, with its own hint', () => {
    render(<ClarifyComposer rootId="r1" userId="u1" working={false} />);
    expect(screen.getByRole('textbox', { name: CLARIFY_COMPOSER_HINT })).toBeInTheDocument();
  });

  it('sending posts the message and starts the run of the new draft', async () => {
    svc.clarifyMessage.mockResolvedValue({ status: 'started', draftId: 'd7' });
    svc.invokeClarifyDraft.mockResolvedValue({ ok: true });
    render(<ClarifyComposer rootId="r1" userId="u1" working={false} />);
    type('make it about the quarter');
    send();
    await waitFor(() => expect(svc.clarifyMessage).toHaveBeenCalledWith('r1', 'make it about the quarter'));
    await waitFor(() => expect(svc.invokeClarifyDraft).toHaveBeenCalledWith('d7'));
  });

  it('busy sends nothing further and the text stays; a failure toasts and the text stays', async () => {
    svc.clarifyMessage.mockResolvedValueOnce({ status: 'busy' });
    render(<ClarifyComposer rootId="r1" userId="u1" working={false} />);
    const field = type('one more');
    send();
    await waitFor(() => expect(svc.clarifyMessage).toHaveBeenCalledTimes(1));
    expect(svc.invokeClarifyDraft).not.toHaveBeenCalled();
    // busy says so (never a silent no-op): a toast, naming the wait
    await waitFor(() => expect(toastFn).toHaveBeenCalledWith(CLARIFY_BUSY_TOAST));
    await waitFor(() => expect(field).toHaveValue('one more'));
    svc.clarifyMessage.mockRejectedValueOnce(new Error('offline'));
    send();
    await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
    await waitFor(() => expect(field).toHaveValue('one more'));
  });

  it('a message over 500 characters is not sent, and says so', async () => {
    render(<ClarifyComposer rootId="r1" userId="u1" working={false} />);
    const field = type('x'.repeat(501));
    send();
    await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
    expect(svc.clarifyMessage).not.toHaveBeenCalled();
    expect(field).toHaveValue('x'.repeat(501));
  });

  it('while a draft is being made the send slot waits (the field stays live) and a submit sends nothing', () => {
    render(<ClarifyComposer rootId="r1" userId="u1" working />);
    type('quick');
    expect(screen.queryByRole('button', { name: 'Send' }), 'a status in the send slot, never a button').toBeNull();
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    expect(svc.clarifyMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('quick');
    expect(screen.getByTestId('composer-send-status')).toBeInTheDocument();
  });
});

const root = (over: Partial<ChatMessage> = {}): ChatMessage => ({ id: 'root1', kind: 'clarify', threadRootId: null, isDeleted: false, ...over } as ChatMessage);

describe('B: the Clarify copy opens its thread, with or without replies', () => {
  const view = (server: ChatMessage, count: number | null, onThread = vi.fn(), counts: Record<string, number> = {}) =>
    render(<MemoryRouter><ClarifyCountsContext.Provider value={counts}><RepliesLink inThread={false} server={server} stat={count === null ? undefined : { count, authorIds: [], lastAt: null } as never} authors={{}} onThread={onThread} viewerId="u1" /></ClarifyCountsContext.Provider></MemoryRouter>);

  it('a Clarify copy with no chat replies shows its drafts as "N replies" (never "Open") and a click opens the thread', async () => {
    const onThread = vi.fn();
    view(root(), null, onThread, { root1: 2 });
    const link = await screen.findByTestId('replies-link');
    expect(link).toHaveTextContent('2 replies');
    expect(screen.queryByText('Open')).toBeNull();
    fireEvent.click(link);
    expect(onThread).toHaveBeenCalledWith(expect.objectContaining({ id: 'root1' }));
  });
  it('with replies the usual replies link stays and there is one way in, not two', () => {
    view(root(), 2);
    expect(screen.getByTestId('replies-link')).toHaveTextContent('2 replies');
    expect(screen.queryByTestId('clarify-open-link')).toBeNull();
  });
  it('CONTROL: a plain message with no replies shows neither; a deleted Clarify copy and a reply show none; inside the thread nothing shows', () => {
    view(root({ kind: 'message' }), null);
    expect(screen.queryByTestId('clarify-open-link')).toBeNull();
    cleanup();
    view(root({ isDeleted: true }), null);
    expect(screen.queryByTestId('clarify-open-link')).toBeNull();
    cleanup();
    view(root({ threadRootId: 'other' }), null);
    expect(screen.queryByTestId('clarify-open-link')).toBeNull();
    cleanup();
    render(<MemoryRouter><RepliesLink inThread server={root()} stat={undefined} authors={{}} onThread={vi.fn()} viewerId="u1" /></MemoryRouter>);
    expect(screen.queryByTestId('clarify-open-link')).toBeNull();
  });
});

describe('C: one batched count read per open Mirror conversation', () => {
  function Probe() {
    const counts = useClarifyDraftCounts('mirror-1', true);
    return (
      <ClarifyCountsContext.Provider value={counts}>
        {['r1', 'r2', 'r3'].map((id) => (
          <RepliesLink key={id} inThread={false} server={root({ id })} stat={undefined} authors={{}} onThread={vi.fn()} viewerId="u1" />
        ))}
      </ClarifyCountsContext.Provider>
    );
  }
  it('3 Clarify roots make exactly 1 counts call and 0 get_clarify_thread calls on mount; one run ending is one more call, not one per row', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'clarify_draft_counts' ? { data: { r1: 2, r2: 1 }, error: null } : { data: null, error: null }));
    render(<MemoryRouter><Probe /></MemoryRouter>);
    // two roots with drafts show their counts; the third (no drafts known) still has a way in: "Reply in thread"
    await waitFor(() => expect(screen.getAllByTestId('replies-link').map((b) => b.textContent)).toEqual([expect.stringMatching(/2 replies/), expect.stringMatching(/1 reply/), 'Reply in thread']));
    const names = () => rpc.mock.calls.map((c) => c[0]);
    expect(names().filter((n) => n === 'clarify_draft_counts')).toHaveLength(1);
    expect(names().filter((n) => n === 'get_clarify_thread')).toHaveLength(0);
    expect(rpc).toHaveBeenCalledWith('clarify_draft_counts', { p_conversation: 'mirror-1' });
    invoke.mockResolvedValue({ data: { state: 'done' }, error: null });
    await act(async () => { await runClarifyDraft('dx'); });
    await waitFor(() => expect(names().filter((n) => n === 'clarify_draft_counts')).toHaveLength(2));
    expect(names().filter((n) => n === 'get_clarify_thread')).toHaveLength(0);
  });

  it('shows nothing while the first read is out, then the counts; a touched thread reads again; an older answer never overwrites a newer one', async () => {
    const answers: Array<(v: unknown) => void> = [];
    rpc.mockImplementation((name: string) => (name === 'clarify_draft_counts' ? new Promise((res) => answers.push(res)) : Promise.resolve({ data: null, error: null })));
    render(<MemoryRouter><Probe /></MemoryRouter>);
    await waitFor(() => expect(answers).toHaveLength(1));
    expect(screen.queryAllByTestId('replies-link')).toHaveLength(0); // no flash of "Reply in thread" before the count is known
    act(() => touchClarifyThread('r1')); // e.g. a draft deleted: a second read starts
    await waitFor(() => expect(answers).toHaveLength(2));
    await act(async () => { answers[1]!({ data: { r1: 3 }, error: null }); });
    await act(async () => { answers[0]!({ data: { r1: 1 }, error: null }); }); // the older, slower answer arrives last
    expect(screen.getAllByTestId('replies-link')[0]!.textContent).toMatch(/3 replies/);
  });

  it('a failed count read still leaves every Clarify root a way into its thread', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'clarify_draft_counts' ? { data: null, error: { message: 'down' } } : { data: null, error: null }));
    render(<MemoryRouter><Probe /></MemoryRouter>);
    // the hook's own failure path settles: all three roots get the way in, none stays hidden
    expect(await screen.findAllByText('Reply in thread')).toHaveLength(3);
  });
});

void act;
