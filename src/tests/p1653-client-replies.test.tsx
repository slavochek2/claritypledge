/**
 * P1653 client half: the approved words, the retry control following the approved table, and the F3 buttons.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageTokenOf } from '../../supabase/functions/_shared/canvas-reply-table';
import { readPick } from '../../supabase/functions/_shared/canvas-choice';
import type { ChatMessage } from '@/app/data/chat-service';
import { CanvasLinkConfirm } from '@/app/pages/chat/CanvasLinkConfirm';
import { canvasRetryTrailing } from '@/app/pages/chat/canvas-retry-trailing';
import { retryShownFor } from '@/app/pages/chat/canvas-retry-policy';
import { withLinkConfirm } from '@/app/pages/chat/canvas-link-confirm-after';
import { WORDS } from '../../supabase/functions/_shared/canvas-reply-table';
import { OFFER_STALE_TEXT, offerRefusedText } from '@/app/pages/chat/canvas-offer-copy';
import * as copy from '@/app/pages/chat/canvas-thread-copy';
import {
  LINK_CONFIRM_QUESTION, LINK_NO_LABEL, LINK_NO_TOKEN, LINK_YES_LABEL, LINK_YES_TOKEN, linkConfirmTargets,
} from '@/app/pages/chat/canvas-link-confirm';
import { sendRefusedText } from '@/app/pages/chat/use-canvas-actions';
import { uploadRefusalText } from '@/app/pages/chat/use-canvas-uploads';
import type { CanvasThread } from '@/app/pages/chat/use-canvas-thread';

afterEach(cleanup);

const ME = 'owner-1';
const ROOT = 'root';
const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'x', conversationId: 'c', authorId: ME, body: 'hello', createdAt: '2026-11-10T08:00:00.000Z', editedAt: null, deletedAt: null, isDeleted: false,
  replyToId: null, threadRootId: ROOT, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message',
  attachmentKind: null, attachmentId: null, ...over,
} as ChatMessage);

describe('P1653 approved words, verbatim', () => {
  it('file and reading-service texts', () => {
    expect(copy.DRAFT_ERROR_TEXT.UNSUPPORTED).toBe('I cannot read that kind of file. Nothing changed on the canvas. Try a PDF, a Word document, a deck, an image or a text file.');
    expect(copy.DRAFT_ERROR_TEXT.UNREADABLE).toBe('I found no text in that file. Nothing changed on the canvas. Try another copy, or paste the text here.');
    expect(copy.DRAFT_ERROR_TEXT.TOO_LARGE).toBe('That file is over 8 MB. Nothing changed on the canvas. Send a smaller file.');
    expect(copy.DRAFT_ERROR_TEXT.LIMIT).toBe('This draft already holds 10 files. Nothing changed on the canvas. Start a new draft to add more.');
    expect(uploadRefusalText('TIMEOUT')).toBe('Reading that file took too long. Nothing changed on the canvas. Send it again.');
    expect(uploadRefusalText('READING_LIMITED')).toBe('The reading service is limited right now. Nothing changed on the canvas. Send the file again in a few minutes.');
    expect(uploadRefusalText('READING_FAILED')).toBe('I could not read the file because the reading service had a problem. Nothing changed on the canvas. Send the file again.');
  });

  it('a provider limit on file reading never reads as the daily limit, and a service failure never blames the file', () => {
    expect(uploadRefusalText('READING_LIMITED')).not.toMatch(/today|tomorrow|daily/i);
    expect(uploadRefusalText('READING_FAILED')).not.toBe(copy.DRAFT_ERROR_TEXT.UNREADABLE);
    expect(uploadRefusalText('CAPPED')).toBe("Canvas drafting has reached today's limit. Try again tomorrow."); // the real daily limit keeps its words
  });

  it('not_retryable and NOT_READY: one sentence per run kind', () => {
    expect(copy.notRetryableText('file')).toBe('Send the file again.');
    expect(copy.notRetryableText('voice')).toBe('Record it again or type it.');
    expect(copy.notRetryableText('text')).toBe('That cannot be tried again. Send your message again.');
    expect(copy.notRetryableText(null)).toBe('That cannot be tried again. Send your message again.');
    expect(copy.notReadyText('voice')).toBe('Still preparing that. It will run when it is ready.');
    expect(copy.notReadyText('file')).toBe('Send the file again.');
  });

  it('client sentences ARE the server WORDS (one source)', () => {
    expect(copy.DRAFT_ERROR_TEXT.UNSUPPORTED).toBe(WORDS.unsupported);
    expect(copy.DRAFT_ERROR_TEXT.UNREADABLE).toBe(WORDS.unreadable);
    expect(copy.DRAFT_ERROR_TEXT.TOO_LARGE).toBe(WORDS.fileTooLarge);
    expect(copy.DRAFT_ERROR_TEXT.LIMIT).toBe(WORDS.fileLimit);
    expect(copy.UPLOAD_ERROR_TEXT.TIMEOUT).toBe(WORDS.fileTimeout);
    expect(copy.UPLOAD_ERROR_TEXT.READING_LIMITED).toBe(WORDS.fileCapped);
    expect(copy.UPLOAD_ERROR_TEXT.READING_FAILED).toBe(WORDS.fileModelError);
    expect(copy.notRetryableText('file')).toBe(WORDS.notRetryableFile);
    expect(copy.notRetryableText('voice')).toBe(WORDS.notRetryableVoice);
    expect(copy.notRetryableText(null)).toBe(WORDS.notRetryableOther);
    expect(copy.notReadyText('voice')).toBe(WORDS.notReadyVoice);
    expect(copy.notReadyText('file')).toBe(WORDS.notReadyFile);
  });

  it('start refusals: BUSY says busyStart, NOT_READY says the voice or file text, lowercase busy keeps its words', () => {
    expect(copy.startRefusedText('BUSY')).toBe('I could not start that a moment ago. Try again.');
    expect(copy.startRefusedText('NOT_READY', 'voice')).toBe('Still preparing that. It will run when it is ready.');
    expect(copy.startRefusedText('NOT_READY', 'file')).toBe('Send the file again.');
    expect(copy.startRefusedText('NOT_READY', null)).toBe('Send the file again.');
    expect(copy.startRefusedText('NOPE')).toBeUndefined();
    expect(sendRefusedText('busy')).toBe('A draft is already being written. It will show here when it is done.');
  });

  it('stale_view on a send says what the offers say', () => {
    expect(sendRefusedText('stale_view')).toBe('This draft changed since you last looked. Check it, then try again.');
    expect(offerRefusedText('stale_view')).toBe(OFFER_STALE_TEXT);
    expect(sendRefusedText('stale_view')).toBe(OFFER_STALE_TEXT);
  });

  it('no em or en dash in any new client text', () => {
    const texts = [
      ...Object.values(copy.DRAFT_ERROR_TEXT), ...Object.values(copy.UPLOAD_ERROR_TEXT), copy.STALE_VIEW_TEXT, copy.NOT_RETRYABLE_FILE_TEXT,
      copy.NOT_RETRYABLE_VOICE_TEXT, copy.NOT_RETRYABLE_OTHER_TEXT, copy.NOT_READY_VOICE_TEXT, copy.NOT_READY_FILE_TEXT, LINK_YES_LABEL, LINK_NO_LABEL,
    ];
    for (const t of texts) expect(t).not.toMatch(/[–—]/);
  });
});

describe('P1653 retry follows the approved table', () => {
  it.each(['nothing_supported', 'no_readable_material', 'blocked', 'too_large', 'choice_read', 'choice_stale', 'transcript_failed', 'not_offered', 'message_gone', 'draft_closed', 'cap'])('%s: hidden', (code) => {
    expect(retryShownFor(code)).toBe(false);
  });
  it.each(['unparsable', 'empty', 'timeout', 'capped', 'http_500', 'http_503', 'http_400', 'network', 'write', 'internal', 'choice_write', 'abandoned', null])('%s: shown (the http_* family stays whole)', (code) => {
    expect(retryShownFor(code)).toBe(true);
  });

  const live = (errorCode: string | null): CanvasThread => ({
    draft: { id: 'd', state: 'open', revision: 1 },
    run: { id: 'r', kind: 'message', state: 'failed', errorCode, createdAt: '', startedAt: null, inputKind: 'text', readyAt: null },
    reload: async () => {},
  } as unknown as CanvasThread);
  const args = { messages: [msg({ id: 'm1' })], userId: ME, rootId: ROOT };
  it('the control is absent for a hidden code and present for a shown one, and absent at the daily limit state', () => {
    expect(canvasRetryTrailing(live('nothing_supported'), args)).toBeNull();
    expect(canvasRetryTrailing(live('http_503'), args)).not.toBeNull();
    const capped = live('cap');
    (capped.run as { state: string }).state = 'capped';
    expect(canvasRetryTrailing(capped, args)).toBeNull();
  });
});

describe('P1653 F3 buttons', () => {
  it('labels and tokens never read as a pick', () => {
    for (const t of [LINK_YES_LABEL, LINK_NO_LABEL, LINK_YES_TOKEN, LINK_NO_TOKEN]) expect(readPick(t)).toBeNull();
  });

  it('the tokens a tap sends are exactly what the server filter (pageTokenOf) drops from material', () => {
    expect(pageTokenOf(LINK_YES_TOKEN)).toBe('yes');
    expect(pageTokenOf(LINK_NO_TOKEN)).toBe('no');
    expect(LINK_YES_TOKEN).toBe('Yes, this is my business');
    expect(LINK_NO_TOKEN).toBe('Not mine');
  });

  it('a tap sends only the fixed token, nothing the agent wrote', async () => {
    const send = vi.fn(async () => true);
    render(<CanvasLinkConfirm live send={send} />);
    fireEvent.click(screen.getByTestId('canvas-link-yes'));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith(LINK_YES_TOKEN, 'yes'); // the structured marker rides with the token
    cleanup();
    render(<CanvasLinkConfirm live send={send} />);
    fireEvent.click(screen.getByTestId('canvas-link-no'));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send).toHaveBeenLastCalledWith(LINK_NO_TOKEN, 'no');
    // evidence: the tokens carry no digits, no link and no name, so a tap cannot add a fact
    for (const t of [LINK_YES_TOKEN, LINK_NO_TOKEN]) expect(t).toMatch(/^[A-Za-z, ]+$/);
  });

  it('while a tap is out the spot is a status, never a disabled button; one primary action is not introduced (two secondary pills)', async () => {
    let done: (v: boolean) => void = () => {};
    const send = vi.fn(() => new Promise<boolean>((r) => { done = r; }));
    render(<CanvasLinkConfirm live send={send} />);
    fireEvent.click(screen.getByTestId('canvas-link-yes'));
    expect(await screen.findByTestId('canvas-link-confirm-status')).toBeInTheDocument();
    expect(document.querySelectorAll('button[disabled]')).toHaveLength(0);
    done(true);
    await waitFor(() => expect(screen.getByTestId('canvas-link-confirm')).toBeInTheDocument());
  });

  it('two fast taps send once', async () => {
    let done: (v: boolean) => void = () => {};
    const send = vi.fn(() => new Promise<boolean>((r) => { done = r; }));
    render(<CanvasLinkConfirm live send={send} />);
    const yes = screen.getByTestId('canvas-link-yes');
    fireEvent.click(yes);
    fireEvent.click(yes); // same tick, before React swaps the buttons for the status
    done(true);
    await waitFor(() => expect(screen.getByTestId('canvas-link-confirm')).toBeInTheDocument());
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('withLinkConfirm: the buttons come before Undo or the offer rows under the same reply, and nothing is drawn while a run is live', () => {
    const body = `x\n${LINK_CONFIRM_QUESTION}`;
    const messages = [msg({ id: 'a1', authorId: 'mirror-agent', kind: 'agent', body })];
    const open = (running: boolean) => ({ draft: { id: 'd', state: 'open' }, running }) as unknown as CanvasThread;
    const args = (running: boolean) => ({ live: open(running), messages, userId: ME, rootId: ROOT, send: async () => true });
    const after = withLinkConfirm({ a1: <p data-testid="undo-under">Undo</p> }, args(false));
    const { container } = render(<>{after.a1}</>);
    const order = Array.from(container.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid'));
    expect(order.indexOf('canvas-link-confirm')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('canvas-link-confirm')).toBeLessThan(order.indexOf('undo-under'));
    cleanup();
    const running = render(<>{withLinkConfirm({}, args(true)).a1}</>);
    expect(running.container).toBeEmptyDOMElement();
    cleanup();
    const closed = withLinkConfirm({}, { ...args(false), live: { draft: { id: 'd', state: 'published' }, running: false } as unknown as CanvasThread });
    expect(closed.a1).toBeUndefined();
  });

  it('a stale reply (the canvas moved on) draws no buttons, so nothing can be tapped and nothing is sent', () => {
    const send = vi.fn(async () => true);
    const { container } = render(<CanvasLinkConfirm live={false} send={send} />);
    expect(container).toBeEmptyDOMElement();
    expect(send).not.toHaveBeenCalled();
  });

  it('a tap the server refuses as stale changes nothing here: the send says so once', async () => {
    const say = vi.fn();
    const send = vi.fn(async () => { say(sendRefusedText('stale_view')); return false; });
    render(<CanvasLinkConfirm live send={send} />);
    fireEvent.click(screen.getByTestId('canvas-link-no'));
    await waitFor(() => expect(say).toHaveBeenCalledWith('This draft changed since you last looked. Check it, then try again.'));
    expect(screen.getByTestId('canvas-link-confirm')).toBeInTheDocument();
  });

  it('a human or forwarded message ending in the question never carries buttons; only a mirror AGENT reply does', () => {
    const body = `I could only read a redirect page from airbnb.com.\n\n${LINK_CONFIRM_QUESTION}`;
    expect(linkConfirmTargets([msg({ id: 'f1', authorId: 'someone-else', kind: 'forward', body })], ME, ROOT)).toEqual([]);
    expect(linkConfirmTargets([msg({ id: 'f2', authorId: 'someone-else', kind: 'message', body })], ME, ROOT)).toEqual([]);
    expect(linkConfirmTargets([msg({ id: 'a1', authorId: 'mirror-agent', kind: 'agent', body })], ME, ROOT)).toEqual([{ afterId: 'a1', live: true }]);
  });

  it('equal timestamps: the later message in the thread order is the newest, in either order', () => {
    const t = '2026-11-10T08:00:00.000Z';
    const reply = msg({ id: 'a1', authorId: 'mirror-agent', kind: 'agent', createdAt: t, body: `x\n${LINK_CONFIRM_QUESTION}` });
    const mine = msg({ id: 'm1', createdAt: t });
    expect(linkConfirmTargets([mine, reply], ME, ROOT)).toEqual([{ afterId: 'a1', live: true }]);
    expect(linkConfirmTargets([reply, mine], ME, ROOT)).toEqual([{ afterId: 'a1', live: false }]);
  });

  it('only a mirror reply ending with the fixed question carries buttons, and only the newest message is live', () => {
    const reply = msg({ id: 'a1', authorId: 'mirror-agent', kind: 'agent', body: `I could only read a redirect page from airbnb.com.\n\n${LINK_CONFIRM_QUESTION}`, createdAt: '2026-11-10T08:01:00.000Z' });
    const mine = msg({ id: 'm1', body: `airbnb.com ${LINK_CONFIRM_QUESTION}`, createdAt: '2026-11-10T08:00:00.000Z' });
    expect(linkConfirmTargets([mine, reply], ME, ROOT)).toEqual([{ afterId: 'a1', live: true }]);
    const later = msg({ id: 'm2', body: 'a car business', createdAt: '2026-11-10T08:02:00.000Z' });
    expect(linkConfirmTargets([mine, reply, later], ME, ROOT)).toEqual([{ afterId: 'a1', live: false }]);
    expect(linkConfirmTargets([mine, { ...reply, isDeleted: true }], ME, ROOT)).toEqual([]);
  });
});
