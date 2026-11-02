/**
 * @file p1536-x9-voice-ui.test.tsx
 * @description P1536 3c X9 / S3c.6, the browser half: the round voice button in every canvas thread, and what a voice note does there.
 *  - The button renders on an open draft that has a base, on a new canvas (a draft with no base), and on a pending Clone; Copy prompt is the
 *    secondary pill. The button is absent where the thread cannot take a note: drafting off, the draft not read, and a closed draft.
 *  - A voice note in an open draft goes to canvas-voice-service with the draft's id and the revision the screen last saw; a pending Clone's first
 *    note names the version it clones. The browser never starts the run (the database does, when the transcript lands).
 *  - A refusal (stale view, busy) keeps the clip for Retry and the retry commits the SAME stored clip with the revision read since.
 * The REAL route element, canvas page, thread panel and composer; the database, the chat transport, the recorder and the voice service are faked.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { PointWithUserPosition } from '@/app/types';

const ME = 'owner-1';
const CONV = 'conv-mirror-1';
const ROOT = 'root-1';
const DRAFT_NAME = 'canvas_dabc123';
const RECEIPT = { conversationId: CONV, objectKey: `${CONV}/${ME}/up-1.wav` };

const st = vi.hoisted(() => ({
  draft: null as Record<string, unknown> | null,
  run: null as Record<string, unknown> | null,
  messages: [] as unknown[],
  versions: [] as unknown[],
}));
const getCanvas = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const sendVoice = vi.hoisted(() => vi.fn());
const rec = vi.hoisted(() => ({ startRecording: vi.fn(), stopRecording: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke }, from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: toastError }) }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: ME } }, user: { id: ME, slug: 'ana' }, sessionChecked: true }) }));
vi.mock('@/app/data/api', () => ({
  getProfileBySlugResult: vi.fn(async () => ({ success: true, data: { id: ME, name: 'Ana', avatarUrl: null, avatarColor: '#3b82f6', hasPledged: false } })),
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { getCanvas, getAudience: vi.fn(async () => []), markCanvasRead: vi.fn(async () => undefined) } }));
vi.mock('@/app/data/calibration-service', () => ({ calibrationService: { getEarsCount: vi.fn(async () => 0) } }));
vi.mock('@/app/contexts/agent-accounts-context', () => ({ useAgentAccountIds: () => ({ isAgentAccountId: () => false, isLoading: false }) }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/pages/not-found-page', () => ({ NotFoundPage: () => <div data-testid="canvas-not-found" /> }));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: () => <div data-testid="point-card" /> }));
vi.mock('@/app/components/social/point-positions-block', () => ({ PointPositionsBlock: () => null }));
vi.mock('@/app/components/letters/letter-position-story-dialog', () => ({ LetterPositionStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-add-story-dialog', () => ({ CanvasAddStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => null }));
vi.mock('@/app/data/canvas-draft-service', async () => ({
  ...(await vi.importActual<object>('@/app/data/canvas-draft-service')),
  getCanvasDraftByThread: async () => st.draft,
  getLatestCanvasRun: async () => st.run,
  listCanvasMaterial: async () => [],
  countDoneCanvasDraftRuns: async () => 1,
  getLastDoneCanvasDraftRunAt: async () => '2026-10-28T09:00:00.000Z',
  getCanvasDraftViewPath: async () => `/p/ana/canvas/canvas?v=${DRAFT_NAME}`,
  listMyCanvasVersions: async () => st.versions,
}));
vi.mock('@/app/data/canvas-voice-service', () => ({ sendCanvasVoiceNote: (...a: unknown[]) => sendVoice(...a) }));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/use-conversation', () => ({
  isLocal: () => false,
  useConversationMessages: () => ({
    server: st.messages, messages: st.messages, status: 'ready', send: vi.fn(), stats: new Map(), hasMore: false, loadingEarlier: false,
    loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
  }),
}));
vi.mock('@/app/pages/chat/MessageRow', () => ({ MessageRow: ({ msg }: { msg: ChatMessage }) => <li data-msg={msg.id}>{msg.body ?? 'card'}</li> }));
vi.mock('@/hooks/use-audio-recorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false, startRecording: rec.startRecording, stopRecording: rec.stopRecording, error: null, stream: null, chunkNumber: 0, requestImmediateFlush: vi.fn(),
  }),
}));
vi.mock('@/lib/audio/clip-wav', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/audio/clip-wav')>()),
  blobToWav16k: vi.fn(async () => Uint8Array.from([1, 2, 3])),
}));

import { VoiceNoteError } from '@/app/data/chat-voice-service';
import { CanvasWithThread } from '@/app/pages/canvas/canvas-with-thread';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';
import { resetUnresolvedFirstSends } from '@/app/pages/canvas/workspace-next-draft';
import { clearLinkTokens } from '@/lib/canvas-link-token';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { isFilledBlue, lacksSecondaryPill } from './p1536-pill-assert';

const summary: ChatSummary = {
  conversationId: CONV, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Ana',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const resync = vi.fn();
const chatValue = () => ({
  userId: ME, status: 'ready', error: null, chats: [summary], unreadCount: 0, refresh: vi.fn(async () => null), setArchived: vi.fn(), setManualUnread: vi.fn(),
  markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
  authors: { [ME]: { id: ME, name: 'Ana', slug: 'ana', avatarUrl: null, avatarColor: null, hasPledged: false } },
  missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync,
}) as unknown as ChatContextValue;

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm', conversationId: CONV, authorId: ME, body: 'hello', createdAt: '2026-10-28T08:00:00.000Z', editedAt: null, deletedAt: null, isDeleted: false,
  replyToId: null, threadRootId: ROOT, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message', attachmentKind: null,
  attachmentId: null, clientId: null, contextConversationId: null, ...over,
});
const draftRow = (over: Record<string, unknown> = {}) => ({
  id: 'draft-1', versionId: 'ver-draft', canvasId: 'cv-1', baseVersionId: null, conversationId: CONV, threadRootId: ROOT, state: 'open', runCount: 1, revision: 4,
  tensionCount: 0, closedAt: null, canvasName: 'canvas', versionName: DRAFT_NAME, ...over,
});
const doneRun = { id: 'run-1', kind: 'draft', speed: 'fast', state: 'done', errorCode: null, createdAt: '2026-10-28T09:00:00.000Z', startedAt: '2026-10-28T09:00:00.000Z' };
const point = (box: string) => ({
  id: `p-${box}`, statement: `Bet for ${box}`, tags: [], systemTags: [box], visibility: 'private', userPosition: null,
  totalPositions: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
}) as unknown as PointWithUserPosition;
const v1 = { name: 'canvas_d111111', createdAt: '2026-10-01T10:00:00Z', seq: 1, publishedAt: '2026-10-01T10:00:00Z', draft: false };
const draftVersion = { name: DRAFT_NAME, createdAt: '2026-10-20T10:00:00Z', seq: null, publishedAt: null, draft: true };
const draftBlock = (over: Record<string, unknown> = {}) => ({ id: 'draft-1', version: DRAFT_NAME, questions: {}, threadRootId: ROOT, conversationId: CONV, baseSeq: 1, runCount: 1, revision: 4, changedBoxes: ['canvas:problem'], ...over });
const base = { stories: new Map(), addedStoryIds: [], positions: new Map(), visibility: 'private' as const, isOwner: true, admitted: true, generalAccess: 'restricted' as const, via: null, canvasExists: true };
const draftView = (over: Record<string, unknown> = {}) => ({ ...base, points: [point('canvas:problem')], version: DRAFT_NAME, versions: [draftVersion, v1], publishedNone: false, draft: draftBlock(), ...over });
const publishedView = (over: Record<string, unknown> = {}) => ({ ...base, points: [point('canvas:problem')], version: v1.name, versions: [v1], publishedNone: false, draft: null, ...over });
const VERSIONS = [{ id: 'ver-1', canvasId: 'cv-1', canvasName: 'canvas', name: v1.name, seq: 1, publishedAt: v1.publishedAt, hasOpenDraft: false }];
const SENT = { ok: true, runId: 'run-9', revision: 5, draftId: 'draft-9', canvasId: 'cv-1', canvasName: 'canvas', versionName: DRAFT_NAME, threadRootId: ROOT, conversationId: CONV, messageId: 'msg-9', replayed: false, start: null };

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}{l.search}</output>;
}
function mount(at = `/p/ana/canvas/canvas?v=${DRAFT_NAME}&ws=1`) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <ChatContext.Provider value={chatValue()}>
        <Where />
        <Routes>
          <Route path="/p/:handle/canvas/:projectTag" element={<CanvasWithThread />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}
async function ready() {
  await screen.findByTestId('canvas-grid');
  await screen.findByTestId('thread-panel');
  await waitFor(() => expect(screen.queryByTestId('canvas-loading')).toBeNull());
  chooseChat(); // jsdom is narrow: the Thread pane is hidden (aria-hidden) until its tab is chosen
  await screen.findByTestId('composer');
}
function chooseChat() {
  fireEvent.mouseDown(screen.getByTestId('workspace-view-chat'), { button: 0, ctrlKey: false });
}
const voiceButton = (scope = screen.getByTestId('composer')) => within(scope).queryByRole('button', { name: 'Record a voice message' });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
async function recordAndSend() {
  const box = screen.getByTestId('composer');
  await act(async () => { fireEvent.click(await within(box).findByRole('button', { name: 'Record a voice message' })); });
  await flush();
  await act(async () => { fireEvent.click(within(box).getByRole('button', { name: 'Send voice message' })); });
  await flush();
}

const nav = globalThis.navigator;
const real = { mr: (globalThis as { MediaRecorder?: unknown }).MediaRecorder, ac: (globalThis as { AudioContext?: unknown }).AudioContext };
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetUnresolvedFirstSends();
  clearLinkTokens();
  clearListReturnCache();
  resetCanvasAvailability();
  resetCanvasThreads();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  Object.defineProperty(nav, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true });
  (globalThis as Record<string, unknown>).MediaRecorder = vi.fn();
  (globalThis as Record<string, unknown>).AudioContext = vi.fn();
  rec.startRecording.mockReset().mockResolvedValue(true);
  rec.stopRecording.mockReset().mockResolvedValue(new Blob(['x'], { type: 'audio/webm' }));
  st.versions = [];
  st.draft = draftRow({ baseVersionId: 'ver-1' });
  st.run = doneRun;
  st.messages = [msg({ id: ROOT, body: null, threadRootId: null, attachmentKind: 'canvas_version', attachmentId: 'ver-draft' })];
  rpc.mockImplementation(async () => ({ data: null, error: null }));
  invoke.mockResolvedValue({ data: { enabled: true }, error: null });
  getCanvas.mockResolvedValue(draftView());
  sendVoice.mockResolvedValue({ ok: true, sent: SENT });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(nav, 'mediaDevices', { value: undefined, configurable: true });
  (globalThis as Record<string, unknown>).MediaRecorder = real.mr;
  (globalThis as Record<string, unknown>).AudioContext = real.ac;
});

describe('S3c.6 X9: the round voice button, per state', () => {
  it('an open draft with a base (View or Open draft): the button is there', async () => {
    mount();
    await ready();
    expect(await within(screen.getByTestId('composer')).findByRole('button', { name: 'Record a voice message' })).toBeInTheDocument();
  });

  it('a new canvas (a draft with no base, nothing published): the button is there, and Copy prompt is the secondary pill, not a filled one', async () => {
    st.draft = draftRow();
    getCanvas.mockResolvedValue(draftView({ points: [], versions: [draftVersion], publishedNone: true, draft: draftBlock({ baseSeq: null, changedBoxes: [] }) }));
    mount();
    await ready();
    expect(await within(screen.getByTestId('composer')).findByRole('button', { name: 'Record a voice message' })).toBeInTheDocument();
    const copy = screen.getByTestId('canvas-copy-prompt');
    expect(lacksSecondaryPill(copy)).toEqual([]);
    expect(isFilledBlue(copy)).toBe(false);
  });

  it('a pending Clone (ws=1 on a published version, no draft): the button is there beside Upload', async () => {
    getCanvas.mockResolvedValue(publishedView());
    st.draft = null;
    st.versions = VERSIONS;
    mount('/p/ana/canvas/canvas?ws=1');
    await screen.findByTestId('canvas-grid');
    chooseChat();
    const box = await screen.findByTestId('composer');
    expect(voiceButton(box)).toBeInTheDocument();
    expect(within(box).getByTestId('canvas-upload')).toBeInTheDocument();
  });

  it('CONTROL: drafting switched off has no composer to carry a button', async () => {
    invoke.mockResolvedValue({ data: { enabled: false }, error: null });
    mount();
    await screen.findByTestId('canvas-grid');
    expect(screen.queryByRole('button', { name: 'Record a voice message' })).toBeNull();
  });

  it('CONTROL: a closed draft has no composer for a note (its thread is read only)', async () => {
    st.draft = draftRow({ state: 'published' });
    mount();
    await screen.findByTestId('canvas-grid');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Record a voice message' })).toBeNull());
  });
});

describe('S3c.6 X9: a voice note in an open draft', () => {
  it('goes to the canvas voice service with the draft and the revision the screen saw, and the browser does not start the run', async () => {
    mount();
    await ready();
    await recordAndSend();
    await waitFor(() => expect(sendVoice).toHaveBeenCalledTimes(1));
    const [conv, wav, target, resume] = sendVoice.mock.calls[0]!;
    expect(conv).toBe(CONV);
    expect(wav).toBeInstanceOf(Blob);
    expect(target).toMatchObject({ canvasId: 'cv-1', expectedDraftId: 'draft-1', expectedRevision: 4 });
    expect(resume).toBeUndefined();
    // the run begins on the server when the transcript lands: no start request goes out from here
    expect(invoke.mock.calls.filter(([name, opts]) => name === 'canvas-draft' && (opts as { body?: { run_id?: string } })?.body?.run_id)).toHaveLength(0);
    expect(resync).toHaveBeenCalled(); // the note appears even if its realtime insert is missed
  });

  it('a refusal (stale view) says so, keeps the clip for Retry, and the retry commits the SAME stored clip', async () => {
    sendVoice.mockResolvedValueOnce({ ok: false, refused: 'stale_view', revision: 5, receipt: RECEIPT });
    mount();
    await ready();
    await recordAndSend();
    const box = screen.getByTestId('composer');
    expect(await within(box).findByRole('button', { name: /retry/i })).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(box).getByRole('button', { name: /retry/i })); });
    await flush();
    await waitFor(() => expect(sendVoice).toHaveBeenCalledTimes(2));
    expect(sendVoice.mock.calls[1]![3]).toEqual(RECEIPT); // the stored clip is committed again, not uploaded again
  });

  it('an upload or commit that fails carries on as any voice note does: Retry with the receipt', async () => {
    sendVoice.mockRejectedValueOnce(new VoiceNoteError('failed', 500, 'down', RECEIPT));
    mount();
    await ready();
    await recordAndSend();
    const box = screen.getByTestId('composer');
    await act(async () => { fireEvent.click(await within(box).findByRole('button', { name: /retry/i })); });
    await flush();
    await waitFor(() => expect(sendVoice).toHaveBeenCalledTimes(2));
    expect(sendVoice.mock.calls[1]![3]).toEqual(RECEIPT);
  });
});

describe('S3c.6 X9: a first voice note on a pending Clone', () => {
  beforeEach(() => {
    getCanvas.mockResolvedValue(publishedView());
    st.draft = null;
    st.versions = VERSIONS;
  });

  it('names the version it clones, opens no draft before the note is sent, and moves the page to the draft it made', async () => {
    mount('/p/ana/canvas/canvas?ws=1');
    await screen.findByTestId('canvas-grid');
    chooseChat();
    await screen.findByTestId('composer');
    expect(sendVoice).not.toHaveBeenCalled();
    await recordAndSend();
    await waitFor(() => expect(sendVoice).toHaveBeenCalledTimes(1));
    expect(sendVoice.mock.calls[0]![2]).toMatchObject({ canvasId: 'cv-1', fromVersionId: 'ver-1', expectedDraftId: null, expectedRevision: null });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`v=${DRAFT_NAME}`));
    expect(rpc).not.toHaveBeenCalledWith('canvas_workspace_send', expect.anything()); // the voice note is the first Send; nothing else wrote
  });

  it('a stale refusal keeps the clip for Retry and the page where it is', async () => {
    sendVoice.mockResolvedValueOnce({ ok: false, refused: 'stale_view', revision: 2, receipt: RECEIPT });
    mount('/p/ana/canvas/canvas?ws=1');
    await screen.findByTestId('canvas-grid');
    chooseChat();
    await screen.findByTestId('composer');
    await recordAndSend();
    expect(await within(screen.getByTestId('composer')).findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByTestId('where')).not.toHaveTextContent(`v=${DRAFT_NAME}`);
  });
});
