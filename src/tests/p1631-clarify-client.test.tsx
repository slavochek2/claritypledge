/**
 * P1631 step 1, client half: the Clarify service mapping, the draft card (Draft pill, private icon, Edit, Delete with the confirm dialog,
 * cited lines), the thread's states (thinking, refusal suggestions, failure with Retry, "Another point", busy) and the generic mirror
 * reply staying silent in a Clarify thread. The database functions and the edge function are mocked: they are built apart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ClarifyDraft } from '@/app/data/clarify-service';

const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke } } }));

const svc = vi.hoisted(() => ({
  anotherPoint: vi.fn(),
  retryClarify: vi.fn(),
  editClarifyDraft: vi.fn(),
  deleteClarifyDraft: vi.fn(),
  getClarifyThread: vi.fn(),
  invokeClarifyDraft: vi.fn(),
}));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastFn }));
const pos = vi.hoisted(() => ({
  sendPositionWrite: vi.fn(async (..._a: unknown[]) => undefined),
  settlePositionWrite: vi.fn(async (..._a: unknown[]) => ({ kind: 'confirmed' as string })),
  recordConfirmedPosition: vi.fn(),
  isLatestPositionWrite: vi.fn((..._a: unknown[]) => true),
}));
vi.mock('@/app/data/position-write-outcome', () => ({
  beginPositionWrite: vi.fn(() => 1),
  endPositionWrite: vi.fn(),
  ...pos,
}));

import * as realService from '@/app/data/clarify-service';
import { ClarifyDraftCard } from '@/app/pages/chat/ClarifyDraftCard';
import { ClarifyDrafts } from '@/app/pages/chat/ClarifyDrafts';
import { isClarifyThread, registerClarifyThread, resetClarifyRuns, runClarifyDraft } from '@/app/pages/chat/clarify-run';
import { isClarifyRoot } from '@/app/pages/chat/use-clarify-parts';
import {
  ANOTHER_POINT_LABEL, CAPPED_TEXT, CITED_LABEL, CLARIFY_SUBTITLE, CLARIFY_TITLE, DELETE_TITLE, DRAFT_PILL, FAILED_TEXT, NO_SPLIT_TEXT, RETRY_LABEL,
} from '@/app/pages/chat/clarify-copy';

vi.mock('@/app/data/clarify-service', async () => {
  const actual = await vi.importActual<typeof import('@/app/data/clarify-service')>('@/app/data/clarify-service');
  return { ...actual, ...svc };
});

const draft = (over: Partial<ClarifyDraft> = {}): ClarifyDraft => ({
  id: 'd1',
  state: 'done',
  point: { id: 'pt1', statement: 'Deadlines should be set by the team', ownerPosition: null },
  suggestions: [],
  errorCode: null,
  cited: [{ id: 'm1', text: 'we never agreed on a date', at: '2026-11-10T10:00:00Z' }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetClarifyRuns();
  svc.getClarifyThread.mockResolvedValue([]);
});
afterEach(cleanup);

describe('clarify-service (the contract names and shapes)', () => {
  // The service module is mocked above for the screens; its real mapping is read through importActual.
  it('startClarify calls clarify_start and maps started and busy to values', async () => {
    const { startClarify } = await vi.importActual<typeof import('@/app/data/clarify-service')>('@/app/data/clarify-service');
    rpc.mockResolvedValueOnce({ data: { status: 'started', draft_id: 'd1', thread_root_id: 'r1', mirror_conversation_id: 'c1' }, error: null });
    expect(await startClarify('src')).toEqual({ status: 'started', draftId: 'd1', threadRootId: 'r1', mirrorConversationId: 'c1' });
    expect(rpc).toHaveBeenCalledWith('clarify_start', { p_source: 'src' });
    rpc.mockResolvedValueOnce({ data: { status: 'busy', draft_id: 'd1', thread_root_id: 'r1', mirror_conversation_id: 'c1' }, error: null });
    expect((await startClarify('src')).status).toBe('busy');
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'nope' } });
    await expect(startClarify('src')).rejects.toThrow(/clarify_start failed/);
  });

  it('the other calls use the contract names and arguments', async () => {
    const s = await vi.importActual<typeof import('@/app/data/clarify-service')>('@/app/data/clarify-service');
    rpc.mockResolvedValue({ data: { status: 'started', draft_id: 'd2' }, error: null });
    expect(await s.anotherPoint('r1', 'about pricing')).toEqual({ status: 'started', draftId: 'd2' });
    expect(rpc).toHaveBeenLastCalledWith('clarify_another', { p_thread_root: 'r1', p_instruction: 'about pricing' });
    await s.anotherPoint('r1');
    expect(rpc).toHaveBeenLastCalledWith('clarify_another', { p_thread_root: 'r1' });
    await s.retryClarify('d1');
    expect(rpc).toHaveBeenLastCalledWith('clarify_retry', { p_draft: 'd1' });
    await s.editClarifyDraft('d1', 'new text');
    expect(rpc).toHaveBeenLastCalledWith('clarify_draft_edit', { p_draft: 'd1', p_statement: 'new text' });
    await s.deleteClarifyDraft('d1');
    expect(rpc).toHaveBeenLastCalledWith('clarify_draft_delete', { p_draft: 'd1' });
  });

  it('getClarifyThread maps drafts, point, suggestions and cited lines (flat or by side), and drops malformed ones', async () => {
    const s = await vi.importActual<typeof import('@/app/data/clarify-service')>('@/app/data/clarify-service');
    rpc.mockResolvedValueOnce({
      data: [
        { id: 'a', state: 'done', point: { id: 'p', statement: 'S', owner_position: 'agree' }, cited: [{ id: 'm1', text: 'one', at: null }, { id: 'm1', text: 'dup', at: null }] },
        { id: 'b', state: 'refused', suggestions: ['x', '', 3, 'y'], cited: { a: [{ id: 'm2', text: 'two', at: null }], b: [{ id: 'm3', text: 'three', at: null }] } },
        { id: 'c', state: 'failed', error_code: 'bad_output' },
        { id: 'broken', state: 'weird' },
      ],
      error: null,
    });
    const out = await s.getClarifyThread('r1');
    expect(rpc).toHaveBeenCalledWith('get_clarify_thread', { p_thread_root: 'r1' });
    expect(out.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(out[0].point).toEqual({ id: 'p', statement: 'S', ownerPosition: 'agree' });
    expect(out[0].cited.map((l) => l.id)).toEqual(['m1']);
    expect(out[1].suggestions).toEqual(['x', 'y']);
    expect(out[1].cited.map((l) => l.id)).toEqual(['m2', 'm3']);
    expect(out[2].errorCode).toBe('bad_output');
  });

  it('invokeClarifyDraft calls the edge function with the draft id; capped and failed are values, never throws', async () => {
    const s = await vi.importActual<typeof import('@/app/data/clarify-service')>('@/app/data/clarify-service');
    invoke.mockResolvedValueOnce({ data: { state: 'done' }, error: null });
    expect(await s.invokeClarifyDraft('d1')).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('clarify-draft', { body: { draft_id: 'd1' } });
    invoke.mockResolvedValueOnce({ data: { state: 'capped' }, error: null });
    expect(await s.invokeClarifyDraft('d1')).toEqual({ ok: false, reason: 'capped' });
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    expect(await s.invokeClarifyDraft('d1')).toEqual({ ok: false, reason: 'failed' });
    invoke.mockRejectedValueOnce(new Error('network'));
    expect(await s.invokeClarifyDraft('d1')).toEqual({ ok: false, reason: 'failed' });
    expect(realService).toBeTruthy();
  });
});

describe('ClarifyDraftCard', () => {
  it('shows the statement with a "Draft" pill and the private icon (informational, not a control), and no Publish', () => {
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    expect(screen.getByTestId('clarify-draft-statement')).toHaveTextContent('Deadlines should be set by the team');
    expect(screen.getByTestId('clarify-draft-pill')).toHaveTextContent(DRAFT_PILL);
    const lock = screen.getByTestId('clarify-draft-lock');
    expect(lock.tagName).not.toBe('BUTTON');
    expect(lock.closest('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
    // The owner's position buttons are the product's own.
    expect(screen.getByRole('button', { name: 'Agree' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disagree' })).toBeInTheDocument();
  });

  it('Edit opens the text in place; an unchanged Save writes nothing; a changed Save is one call and re-reads', async () => {
    const changed = vi.fn();
    svc.editClarifyDraft.mockResolvedValue({ status: 'ok' });
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={changed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit this point' }));
    fireEvent.click(screen.getByTestId('clarify-draft-editor-save'));
    expect(svc.editClarifyDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this point' }));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'Deadlines are the manager\'s call' } });
    fireEvent.click(screen.getByTestId('clarify-draft-editor-save'));
    await waitFor(() => expect(svc.editClarifyDraft).toHaveBeenCalledWith('d1', 'Deadlines are the manager\'s call'));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(screen.queryByTestId('clarify-draft-editor')).not.toBeInTheDocument();
  });

  it('empty text is stopped with a sentence; a refused save keeps the text and says so; Cancel closes', async () => {
    svc.editClarifyDraft.mockResolvedValue({ status: 'refused', code: 'fixed' }); // the real shape of a refusal: a value, not a rejection
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit this point' }));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('clarify-draft-editor-save'));
    expect(screen.getByTestId('clarify-draft-editor-problem')).toHaveTextContent('A point needs some words.');
    expect(svc.editClarifyDraft).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'something else' } });
    fireEvent.click(screen.getByTestId('clarify-draft-editor-save'));
    await screen.findByText('Could not save this point. Try again.');
    expect(screen.getByLabelText('Point text')).toHaveValue('something else');
    fireEvent.click(screen.getByTestId('clarify-draft-editor-cancel'));
    expect(screen.queryByTestId('clarify-draft-editor')).not.toBeInTheDocument();
  });

  it('Delete asks first (the product confirm dialog) and deletes only on confirm', async () => {
    const changed = vi.fn();
    svc.deleteClarifyDraft.mockResolvedValue({ status: 'ok' });
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={changed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete this draft' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(DELETE_TITLE);
    expect(svc.deleteClarifyDraft).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(svc.deleteClarifyDraft).toHaveBeenCalledWith('d1'));
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });

  it('the cited lines are collapsed under "Cited lines (may be wrong)" and read from the server text', () => {
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    expect(screen.queryByText('we never agreed on a date')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: CITED_LABEL }));
    expect(screen.getByText('we never agreed on a date')).toBeInTheDocument();
  });

  it('no cited lines: no list at all', () => {
    render(<ClarifyDraftCard draft={draft({ cited: [] })} userId="me" onChanged={() => undefined} />);
    expect(screen.queryByText(CITED_LABEL)).not.toBeInTheDocument();
  });
});

describe('ClarifyDrafts (the thread under the source copy)', () => {
  it('a queued or running draft reads as thinking, with no card and no Another point', async () => {
    svc.getClarifyThread.mockResolvedValue([draft({ state: 'running', point: null, cited: [] })]);
    render(<ClarifyDrafts rootId="r1" name="Mirror" userId="me" />);
    expect(await screen.findByTestId('clarify-thinking')).toHaveTextContent('Mirror is thinking');
    expect(screen.queryByTestId('clarify-another')).not.toBeInTheDocument();
    expect(svc.getClarifyThread).toHaveBeenCalledWith('r1');
  });

  it('a done draft is a card with "Another point" under the last draft; tapping it asks for one more and runs it', async () => {
    svc.getClarifyThread.mockResolvedValue([draft()]);
    svc.anotherPoint.mockResolvedValue({ status: 'started', draftId: 'd2' });
    svc.invokeClarifyDraft.mockResolvedValue({ ok: true });
    render(<ClarifyDrafts rootId="r1" name="Mirror" userId="me" />);
    const button = await screen.findByTestId('clarify-another');
    expect(button).toHaveTextContent(ANOTHER_POINT_LABEL);
    fireEvent.click(button);
    await waitFor(() => expect(svc.anotherPoint).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(svc.invokeClarifyDraft).toHaveBeenCalledWith('d2'));
  });

  it('a busy answer changes nothing: no run, no message', async () => {
    svc.getClarifyThread.mockResolvedValue([draft()]);
    svc.anotherPoint.mockResolvedValue({ status: 'busy', draftId: 'd1' });
    render(<ClarifyDrafts rootId="r1" name="Mirror" userId="me" />);
    fireEvent.click(await screen.findByTestId('clarify-another'));
    await waitFor(() => expect(svc.anotherPoint).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(svc.invokeClarifyDraft).not.toHaveBeenCalled();
    expect(toastFn).not.toHaveBeenCalled();
    expect(toastFn.error).not.toHaveBeenCalled();
  });

  it('a refusal shows 2-3 suggestion chips; a tap is sent as the instruction', async () => {
    svc.getClarifyThread.mockResolvedValue([draft({ state: 'refused', point: null, cited: [], suggestions: ['pricing', 'who decides', 'timing', 'a fourth'] })]);
    svc.anotherPoint.mockResolvedValue({ status: 'started', draftId: 'd2' });
    svc.invokeClarifyDraft.mockResolvedValue({ ok: true });
    render(<ClarifyDrafts rootId="r1" name="Mirror" userId="me" />);
    expect(await screen.findByText(NO_SPLIT_TEXT)).toBeInTheDocument();
    const chips = screen.getAllByTestId('clarify-suggestion');
    expect(chips.map((c) => c.textContent)).toEqual(['pricing', 'who decides', 'timing']);
    fireEvent.click(chips[1]);
    await waitFor(() => expect(svc.anotherPoint).toHaveBeenCalledWith('r1', 'who decides'));
    await waitFor(() => expect(svc.invokeClarifyDraft).toHaveBeenCalledWith('d2'));
  });

  it('a failed draft says so with Retry; Retry asks the server, then runs it again', async () => {
    svc.getClarifyThread.mockResolvedValue([draft({ state: 'failed', point: null, cited: [], errorCode: 'bad_output' })]);
    svc.retryClarify.mockResolvedValue({ status: 'started' });
    svc.invokeClarifyDraft.mockResolvedValue({ ok: true });
    render(<ClarifyDrafts rootId="r1" name="Mirror" userId="me" />);
    expect(await screen.findByTestId('clarify-failed-d1')).toHaveTextContent(FAILED_TEXT);
    expect(screen.queryByTestId('clarify-another')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: RETRY_LABEL }));
    await waitFor(() => expect(svc.retryClarify).toHaveBeenCalledWith('d1'));
    await waitFor(() => expect(svc.invokeClarifyDraft).toHaveBeenCalledWith('d1'));
  });

  it('a capped draft says so with Retry', async () => {
    svc.getClarifyThread.mockResolvedValue([draft({ state: 'capped', point: null, cited: [] })]);
    render(<ClarifyDrafts rootId="r1" name="Mirror" userId="me" />);
    expect(await screen.findByTestId('clarify-failed-d1')).toHaveTextContent(CAPPED_TEXT);
    expect(screen.getByRole('button', { name: RETRY_LABEL })).toBeInTheDocument();
  });

  it('has at most one filled primary: the only button of its own is the bordered Another point', async () => {
    svc.getClarifyThread.mockResolvedValue([draft()]);
    render(<ClarifyDrafts rootId="r1" name="Mirror" userId="me" />);
    const another = await screen.findByTestId('clarify-another');
    expect(another.className).toMatch(/border/);
    expect(another.className).not.toMatch(/bg-primary|bg-blue-600/);
  });

  it('a run that ended in this tab makes the thread read its drafts again', async () => {
    svc.getClarifyThread.mockResolvedValueOnce([draft({ state: 'running', point: null, cited: [] })]).mockResolvedValue([draft()]);
    svc.invokeClarifyDraft.mockResolvedValue({ ok: true });
    render(<ClarifyDrafts rootId="r1" name="Mirror" userId="me" />);
    await screen.findByTestId('clarify-thinking');
    await act(async () => { await runClarifyDraft('d1'); });
    expect(await screen.findByTestId('clarify-draft-statement')).toBeInTheDocument();
  });
});

describe('Clarify threads and the generic mirror reply', () => {
  it('a Clarify copy in the mirror is a draft thread root; nothing else is', () => {
    const base = { kind: 'clarify', threadRootId: null, isDeleted: false } as never;
    expect(isClarifyRoot({ kind: 'mirror' }, base)).toBe(true);
    expect(isClarifyRoot({ kind: 'dm' }, base)).toBe(false);
    expect(isClarifyRoot({ kind: 'mirror' }, { kind: 'message', threadRootId: null, isDeleted: false } as never)).toBe(false);
    expect(isClarifyRoot({ kind: 'mirror' }, { kind: 'clarify', threadRootId: 'x', isDeleted: false } as never)).toBe(false);
    expect(isClarifyRoot({ kind: 'mirror' }, undefined)).toBe(false);
  });

  it('a registered thread is remembered (the mirror provider asks it before it requests a reply), and a run starts once per draft', async () => {
    expect(isClarifyThread('r9')).toBe(false);
    registerClarifyThread('r9');
    expect(isClarifyThread('r9')).toBe(true);
    expect(isClarifyThread(null)).toBe(false);
    svc.invokeClarifyDraft.mockResolvedValue({ ok: true });
    await runClarifyDraft('dx');
    expect(await runClarifyDraft('dx')).toBeNull();
    expect(svc.invokeClarifyDraft).toHaveBeenCalledTimes(1);
  });

  it('a press in flight holds the generic reply for its copy, and the copy is a draft thread root once the server names it', async () => {
    const { clarifyStartsSettled, trackClarifyStart } = await import('@/app/pages/chat/clarify-run');
    expect(clarifyStartsSettled()).toBeNull();
    let finish!: () => void;
    const press = trackClarifyStart(async (threadKnown) => {
      await new Promise<void>((r) => { finish = r; });
      threadKnown('r-held');
      return 'ok';
    });
    const held = clarifyStartsSettled();
    expect(held).not.toBeNull();
    let released = false;
    void held!.then(() => { released = true; });
    await act(async () => { await Promise.resolve(); });
    expect(released).toBe(false);
    finish();
    expect(await press).toBe('ok');
    await act(async () => { await held; });
    expect(released).toBe(true);
    expect(isClarifyThread('r-held')).toBe(true);
    expect(clarifyStartsSettled()).toBeNull();
  });

  it('the thread names itself "Your Mirror" and "Only you see this"', () => {
    expect(CLARIFY_TITLE).toBe('Your Mirror');
    expect(CLARIFY_SUBTITLE).toBe('Only you see this');
  });
});


describe('P1631 review fixes: client', () => {
  it('(Gemini 1) the service maps a refusal to a value: edit, delete and retry never resolve a refusal as success', async () => {
    const realService = await vi.importActual<typeof import('@/app/data/clarify-service')>('@/app/data/clarify-service');
    rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'fixed' }, error: null });
    expect(await realService.editClarifyDraft('d1', 'x')).toEqual({ status: 'refused', code: 'fixed' });
    rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'busy' }, error: null });
    expect(await realService.deleteClarifyDraft('d1')).toEqual({ status: 'refused', code: 'busy' });
    rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'not_retryable' }, error: null });
    expect(await realService.retryClarify('d1')).toEqual({ status: 'refused', code: 'not_retryable' });
    rpc.mockResolvedValueOnce({ data: { status: 'ok', changed: true }, error: null });
    expect(await realService.editClarifyDraft('d1', 'x')).toEqual({ status: 'ok' });
  });

  it('(Gemini 5/19) the service drops duplicate suggestions', async () => {
    const realService = await vi.importActual<typeof import('@/app/data/clarify-service')>('@/app/data/clarify-service');
    rpc.mockResolvedValueOnce({ data: { drafts: [{ id: 'd1', state: 'refused', suggestions: ['a', ' a ', 'b', 'a'] }] }, error: null });
    expect((await realService.getClarifyThread('r1'))[0]!.suggestions).toEqual(['a', 'b']);
  });

  it('(Gemini 1) a refused Save keeps the editor open with the text and toasts', async () => {
    svc.editClarifyDraft.mockResolvedValue({ status: 'refused', code: 'fixed' });
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit this point' }));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'my words' } });
    fireEvent.click(screen.getByTestId('clarify-draft-editor-save'));
    await waitFor(() => expect(toastFn.error).toHaveBeenCalledWith('Could not save this point. Try again.'));
    expect(screen.getByLabelText('Point text')).toHaveValue('my words');
  });

  it('(Gemini 4) a Delete that fails or is refused toasts and closes the dialog; the draft is not reloaded away', async () => {
    for (const outcome of [() => Promise.reject(new Error('offline')), () => Promise.resolve({ status: 'refused', code: 'busy' })]) {
      const changed = vi.fn();
      svc.deleteClarifyDraft.mockImplementationOnce(outcome);
      render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={changed} />);
      fireEvent.click(screen.getByRole('button', { name: 'Delete this draft' }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(toastFn.error).toHaveBeenCalledWith('Could not delete this draft. Try again.'));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(changed).not.toHaveBeenCalled();
      toastFn.error.mockClear();
      cleanup();
    }
  });

  it('(Gemini 3, Codex 5) the thread shows a loading skeleton, then a load-failure line with a retry that reads again', async () => {
    let release: (v: ClarifyDraft[]) => void = () => undefined;
    svc.getClarifyThread.mockImplementationOnce(() => new Promise<ClarifyDraft[]>((go) => { release = go; }));
    render(<ClarifyDrafts rootId="r1" name="Mirror" userId="me" />);
    expect(screen.getByTestId('clarify-drafts-loading')).toBeInTheDocument();
    await act(async () => { release([]); });
    cleanup();
    svc.getClarifyThread.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([draft()]);
    render(<ClarifyDrafts rootId="r1" name="Mirror" userId="me" />);
    expect(await screen.findByTestId('clarify-load-failed')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('clarify-reload'));
    expect(await screen.findByText(DRAFT_PILL)).toBeInTheDocument();
    expect(screen.queryByTestId('clarify-load-failed')).not.toBeInTheDocument();
  });

  it('(Codex 5) Another point and Retry that fail toast; a refused Retry is not a start', async () => {
    svc.getClarifyThread.mockResolvedValue([draft()]);
    svc.anotherPoint.mockRejectedValueOnce(new Error('offline'));
    render(<ClarifyDrafts rootId="r1" name="Mirror" userId="me" />);
    fireEvent.click(await screen.findByTestId('clarify-another'));
    await waitFor(() => expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('Clarify')));
    cleanup();
    toastFn.error.mockClear();
    svc.getClarifyThread.mockResolvedValue([draft({ state: 'failed', point: null, cited: [] })]);
    svc.retryClarify.mockResolvedValueOnce({ status: 'refused', code: 'not_retryable' });
    render(<ClarifyDrafts rootId="r1" name="Mirror" userId="me" />);
    fireEvent.click(await screen.findByTestId('clarify-retry'));
    await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
    expect(svc.invokeClarifyDraft).not.toHaveBeenCalled();
  });

  it('(Gemini 5) the owner position follows a changed server value while no write is pending', async () => {
    const { rerender } = render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Disagree', pressed: true })).toBeNull();
    rerender(<ClarifyDraftCard draft={draft({ point: { id: 'pt1', statement: 'Deadlines should be set by the team', ownerPosition: 'disagree' } })} userId="me" onChanged={() => undefined} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disagree', pressed: true })).toBeInTheDocument());
  });

  it('(Codex 6) a position write whose answer was lost is settled, not rolled back at once: confirmed keeps it, rejected rolls back and toasts', async () => {
    const lost = () => Object.assign(new Error('lost'), { name: 'NetworkBlipError' });
    pos.sendPositionWrite.mockRejectedValueOnce(lost());
    pos.settlePositionWrite.mockResolvedValueOnce({ kind: 'confirmed' });
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Disagree' }));
    await waitFor(() => expect(pos.settlePositionWrite).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pos.recordConfirmedPosition).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Disagree', pressed: true })).toBeInTheDocument();
    expect(toastFn.error).not.toHaveBeenCalled();
    cleanup();
    pos.sendPositionWrite.mockRejectedValueOnce(lost());
    pos.settlePositionWrite.mockResolvedValueOnce({ kind: 'rejected' });
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    await waitFor(() => expect(toastFn.error).toHaveBeenCalledWith('Your position was not saved. Try again.'));
    expect(screen.queryByRole('button', { name: 'Agree', pressed: true })).toBeNull();
  });

  it('(Codex 7) an answer for a previous thread root never shows under the new one', async () => {
    let first: (v: ClarifyDraft[]) => void = () => undefined;
    svc.getClarifyThread.mockImplementationOnce(() => new Promise<ClarifyDraft[]>((go) => { first = go; }));
    svc.getClarifyThread.mockResolvedValueOnce([draft({ id: 'new', point: { id: 'p2', statement: 'the new thread point', ownerPosition: null } })]);
    const { rerender } = render(<ClarifyDrafts rootId="old" name="Mirror" userId="me" />);
    rerender(<ClarifyDrafts rootId="new" name="Mirror" userId="me" />);
    expect(await screen.findByText('the new thread point')).toBeInTheDocument();
    await act(async () => { first([draft({ id: 'old', point: { id: 'p1', statement: 'the old thread point', ownerPosition: null } })]); });
    expect(screen.queryByText('the old thread point')).not.toBeInTheDocument();
    expect(screen.getByText('the new thread point')).toBeInTheDocument();
  });

  it('(GLM 9) the Clarify thread is registered from an effect, not during render (no side effect in a render that is discarded)', async () => {
    const { useClarifyParts } = await import('@/app/pages/chat/use-clarify-parts');
    const { renderHook } = await import('@testing-library/react');
    const summary = { kind: 'mirror', title: null, other: null } as never;
    const root = { id: 'root-effect', kind: 'clarify', threadRootId: null, isDeleted: false } as never;
    expect(isClarifyThread('root-effect')).toBe(false);
    renderHook(() => useClarifyParts(summary, root, 'me'));
    expect(isClarifyThread('root-effect')).toBe(true);
  });
});
