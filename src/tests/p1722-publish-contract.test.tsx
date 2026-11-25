/**
 * P1722 C8: Publish sends the visibility on the card and the warning ack; new refusal codes speak plainly; the latest card comes from is_latest.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: Object.assign(toast, { error: toast }) }));
vi.mock('@/app/pages/chat/clarify-position-store', () => ({ useHasPosition: () => true }));

import { publishClarify } from '@/app/data/clarify-service';
import { ClarifyPublishButton } from '@/app/pages/chat/ClarifyPublishButton';
import { markWarningAcked, resetWarningAcks } from '@/app/pages/chat/clarify-warning-ack';
import { PUBLISH_ANSWERED_TOAST, PUBLISH_VISIBILITY_CHANGED_TOAST } from '@/app/pages/chat/clarify-copy';

beforeEach(() => { rpc.mockReset(); toast.mockReset(); resetWarningAcks(); });
afterEach(cleanup);

describe('publishClarify args', () => {
  it('defaults to private and no ack', async () => {
    rpc.mockResolvedValue({ data: { status: 'published', message_id: 'm', conversation_id: 'c', thread_root_id: null }, error: null });
    await publishClarify('d1');
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_draft: 'd1', p_visibility: 'private', p_warning_ack: false });
  });
  it('sends public and the ack when given', async () => {
    rpc.mockResolvedValue({ data: { status: 'published', message_id: 'm', conversation_id: 'c', thread_root_id: null }, error: null });
    await publishClarify('d1', { visibility: 'public', warningAck: true });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_visibility: 'public', p_warning_ack: true });
  });
});

describe('ClarifyPublishButton', () => {
  const press = () => fireEvent.click(screen.getByTestId('clarify-publish-d1'));
  const refuse = (code: string) => rpc.mockResolvedValue({ data: { status: 'refused', code }, error: null });
  const mount = (visibility: 'private' | 'public', onReload = vi.fn()) => {
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility={visibility} publicWarning={false} onReload={onReload} />);
    return onReload;
  };

  it('private card: private, ack false', async () => {
    refuse('x'); mount('private'); press();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_visibility: 'private', p_warning_ack: false });
  });
  it('K1 reload path: public card, warning on, no ack this session: the dialog first, no publish; confirming publishes with ack', async () => {
    rpc.mockResolvedValue({ data: { status: 'published', message_id: 'm', conversation_id: 'c', thread_root_id: null }, error: null });
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility="public" publicWarning />);
    press();
    expect(await screen.findByTestId('clarify-public-warning')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('clarify-public-confirm'));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_visibility: 'public', p_warning_ack: true });
  });
  it('K1: Keep private closes the dialog and publishes nothing', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok', visibility: 'private' }, error: null });
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility="public" publicWarning />);
    press();
    fireEvent.click(await screen.findByTestId('clarify-public-keep'));
    await waitFor(() => expect(screen.queryByTestId('clarify-public-warning')).toBeNull());
    expect(rpc.mock.calls.some((c) => c[0] === 'clarify_publish')).toBe(false); // only the visibility change is sent (U1)
  });
  it('Y1: reposting an ever-published public point publishes at once, no dialog', async () => {
    rpc.mockResolvedValue({ data: { status: 'already', message_id: 'm', conversation_id: 'c', thread_root_id: null }, error: null });
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility="public" publicWarning everPublished />);
    press();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('clarify-public-warning')).toBeNull();
    expect(rpc.mock.calls[0]?.[0]).toBe('clarify_publish');
  });
  it('U1: Keep private in the Publish warning sets the draft Private and re-reads; nothing is published', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok', visibility: 'private', public_warning: true }, error: null });
    const onReload = vi.fn();
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility="public" publicWarning onReload={onReload} />);
    press();
    fireEvent.click(await screen.findByTestId('clarify-public-keep'));
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[0]).toBe('clarify_set_visibility');
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_draft: 'd1', p_visibility: 'private' });
  });
  it('W1: Escape on the Publish warning writes nothing at all', async () => {
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility="public" publicWarning />);
    press();
    fireEvent.keyDown(await screen.findByTestId('clarify-public-warning'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('clarify-public-warning')).toBeNull());
    expect(rpc).not.toHaveBeenCalled();
  });
  it('W1: a refused Keep private says so (plain toast), still closes and re-reads', async () => {
    rpc.mockResolvedValue({ data: { status: 'refused', code: 'answered' }, error: null });
    const onReload = vi.fn();
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility="public" publicWarning onReload={onReload} />);
    press();
    fireEvent.click(await screen.findByTestId('clarify-public-keep'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(PUBLISH_ANSWERED_TOAST));
    await waitFor(() => expect(screen.queryByTestId('clarify-public-warning')).toBeNull());
    expect(onReload).toHaveBeenCalledTimes(1);
  });
  it('W1: any other refusal or a thrown call shows the failed toast', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility="public" publicWarning />);
    press();
    fireEvent.click(await screen.findByTestId('clarify-public-keep'));
    await waitFor(() => expect(toast).toHaveBeenCalled());
  });
  it('U2: the Publish warning returns focus to the Publish button when it closes', async () => {
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility="public" publicWarning />);
    rpc.mockResolvedValue({ data: { status: 'ok', visibility: 'private' }, error: null });
    press();
    fireEvent.click(await screen.findByTestId('clarify-public-keep'));
    await waitFor(() => expect(screen.queryByTestId('clarify-public-warning')).toBeNull());
    await waitFor(() => expect(screen.getByTestId('clarify-publish-d1')).toHaveFocus());
  });
  it('K1: a needs_warning refusal opens the dialog, not a toast', async () => {
    markWarningAcked('d1', ''); refuse('needs_warning'); mount('public'); press();
    expect(await screen.findByTestId('clarify-public-warning')).toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
  });
  it('K1: publicWarning=false needs no dialog', async () => {
    refuse('x');
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility="public" publicWarning={false} />);
    press();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByTestId('clarify-public-warning')).toBeNull();
  });
  it('public card whose warning was confirmed this session: ack true', async () => {
    markWarningAcked('d1', ''); refuse('x'); mount('public'); press();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_visibility: 'public', p_warning_ack: true });
  });
  it.each([
    ['answered', PUBLISH_ANSWERED_TOAST, true],
    ['visibility_changed', PUBLISH_VISIBILITY_CHANGED_TOAST, true],
  ])('%s: plain message, thread re-read', async (code, text, reload) => {
    refuse(code); const onReload = mount('public'); press();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(text));
    expect(onReload).toHaveBeenCalledTimes(reload ? 1 : 0);
  });
  it('an unrelated refusal does not re-read', async () => {
    refuse('not_available'); const onReload = mount('private'); press();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(onReload).not.toHaveBeenCalled();
  });
});
