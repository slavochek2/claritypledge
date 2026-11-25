/**
 * P1722 phase C (rendered): the visibility control on a Clarify draft card (states, click, keyboard, read-only badge), the warning dialog (verbatim copy, shown or not,
 * "Keep private"), tags typed in an edit and sent with the save, and Publish to chat on a Mirror-sourced card. The real card, view and button; only the service is answered.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClarifyDraft } from '@/app/data/clarify-service';

const svc = vi.hoisted(() => ({
  setClarifyVisibility: vi.fn(),
  editClarifyDraft: vi.fn(),
  deleteClarifyDraft: vi.fn(),
  publishClarify: vi.fn(),
}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }) }));
vi.mock('@/app/data/clarify-service', async () => ({ ...(await vi.importActual<object>('@/app/data/clarify-service')), ...svc }));
vi.mock('@/app/pages/chat/use-owner-position', () => ({
  useOwnerPosition: (_u: string, _p: string, server: string | null) => ({ position: server, choose: vi.fn(), reset: vi.fn() }),
}));

import { ClarifyDraftCard } from '@/app/pages/chat/ClarifyDraftCard';
import { ClarifyDraftsView } from '@/app/pages/chat/ClarifyDrafts';
import { warningSourceName } from '@/app/pages/chat/clarify-copy';

const WARNING_TITLE = 'Make this point public?';
const warningBody = (source: string) =>
  `It came from ${source}. Anyone will be able to read it and take a position, and it can't be made private again. Check it doesn't share anything said in confidence.`;

const draft = (over: Partial<ClarifyDraft> = {}): ClarifyDraft => ({
  id: 'd1', state: 'done', point: { id: 'pt1', statement: 'Remote work slows juniors', ownerPosition: null, tags: [] }, suggestions: [], errorCode: null, cited: [],
  createdAt: '2026-11-25T10:00:00Z', refineTargetId: null, sourceKind: 'dm', published: [], visibility: 'private', everPublished: false, isLatest: true, publicWarning: true, ...over,
});
const control = () => screen.queryByTestId('clarify-visibility-d1');

beforeEach(() => {
  vi.clearAllMocks();
  svc.setClarifyVisibility.mockResolvedValue({ status: 'ok', visibility: 'public', publicWarning: true });
});
afterEach(cleanup);

describe('visibility control states', () => {
  it('the latest card of a never-published draft: a button reading "Private" with the blue-bordered style', () => {
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    const b = screen.getByRole('button', { name: 'Private' });
    expect(b).toHaveAttribute('data-testid', 'clarify-visibility-d1');
    // the design system's outline variant (blue border and fill), with no hand-typed colour classes on top of it (P1568)
    expect(b.className).toContain('border-blue-600');
    expect(b.className).toContain('bg-blue-50');
    // the classes the control used to type by hand are gone (the variant brings its own text-blue-700, not these)
    expect(b.className).not.toContain('text-blue-600');
    expect(b.className).not.toContain('hover:text-blue-700');
    expect(b.className).not.toMatch(/(^|\s)hover:bg-blue-50/);
    expect(b.className).toContain('min-h-11'); // 44px
  });

  it('while the change is being written: disabled with busy set, then back (visible feedback, no double press)', async () => {
    let finish: (v: unknown) => void = () => undefined;
    svc.setClarifyVisibility.mockReturnValue(new Promise((r) => { finish = r; }));
    render(<ClarifyDraftCard draft={draft({ publicWarning: false })} userId="me" onChanged={() => undefined} />);
    const b = screen.getByRole('button', { name: 'Private' });
    fireEvent.click(b);
    await waitFor(() => expect(b).toBeDisabled());
    expect(b).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(b);
    expect(svc.setClarifyVisibility).toHaveBeenCalledTimes(1);
    finish({ status: 'ok', visibility: 'public', publicWarning: false });
    await waitFor(() => expect(b).not.toBeDisabled());
    expect(b).not.toHaveAttribute('aria-busy');
  });

  it('a draft already Public reads "Public"', () => {
    render(<ClarifyDraftCard draft={draft({ visibility: 'public' })} userId="me" onChanged={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Public' })).toBeInTheDocument();
  });

  it.each([
    ['an earlier version', { earlier: true, over: {} }],
    ['a card that is not the latest', { earlier: false, over: { isLatest: false } }],
    ['a draft that was ever published', { earlier: false, over: { everPublished: true } }],
    ['a draft whose card is live in a chat', { earlier: false, over: { published: [{ conversationId: 'c', messageId: 'm' }] } }],
  ])('%s: no button, a read-only badge', (_n, { earlier, over }) => {
    render(<ClarifyDraftCard draft={draft(over)} userId="me" onChanged={() => undefined} earlier={earlier} />);
    expect(control()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Private' })).toBeNull();
    expect(screen.getByTestId('clarify-draft-lock')).toBeInTheDocument();
  });
});

describe('going Public', () => {
  it('shows the warning first, with the approved words and the chat name; Make public applies it and re-reads', async () => {
    const changed = vi.fn();
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={changed} sourceName="Dana" />);
    fireEvent.click(screen.getByRole('button', { name: 'Private' }));
    expect(svc.setClarifyVisibility).not.toHaveBeenCalled();
    expect(await screen.findByText(WARNING_TITLE)).toBeInTheDocument();
    expect(screen.getByText(warningBody('Dana'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep private' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Make public' }));
    await waitFor(() => expect(svc.setClarifyVisibility).toHaveBeenCalledWith('d1', 'public'));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(screen.queryByText(WARNING_TITLE)).toBeNull();
  });

  it('"Keep private" closes the dialog and writes nothing', async () => {
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Private' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep private' }));
    await waitFor(() => expect(screen.queryByText(WARNING_TITLE)).toBeNull());
    expect(svc.setClarifyVisibility).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Private' })).toBeInTheDocument();
  });

  it('the server says no warning is needed: it switches at once, with no dialog', async () => {
    render(<ClarifyDraftCard draft={draft({ publicWarning: false })} userId="me" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Private' }));
    await waitFor(() => expect(svc.setClarifyVisibility).toHaveBeenCalledWith('d1', 'public'));
    expect(screen.queryByText(WARNING_TITLE)).toBeNull();
  });

  it('back to Private never asks', async () => {
    render(<ClarifyDraftCard draft={draft({ visibility: 'public' })} userId="me" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));
    await waitFor(() => expect(svc.setClarifyVisibility).toHaveBeenCalledWith('d1', 'private'));
    expect(screen.queryByText(WARNING_TITLE)).toBeNull();
  });

  it('by keyboard: Enter and Space on the focused control work like a click', async () => {
    const user = userEvent.setup();
    render(<ClarifyDraftCard draft={draft({ publicWarning: false, visibility: 'public' })} userId="me" onChanged={() => undefined} />);
    screen.getByRole('button', { name: 'Public' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(svc.setClarifyVisibility).toHaveBeenLastCalledWith('d1', 'private'));
    await user.keyboard(' ');
    await waitFor(() => expect(svc.setClarifyVisibility).toHaveBeenCalledTimes(2));
    cleanup();
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    screen.getByRole('button', { name: 'Private' }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText(WARNING_TITLE)).toBeInTheDocument();
  });

  it('the card turns read-only while the warning is open: the dialog closes cleanly and the page is not left inert', async () => {
    const { rerender } = render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Private' }));
    expect(await screen.findByText(WARNING_TITLE)).toBeInTheDocument();
    rerender(<ClarifyDraftCard draft={draft({ everPublished: true })} userId="me" onChanged={() => undefined} />);
    await waitFor(() => expect(screen.queryByText(WARNING_TITLE)).toBeNull());
    expect(control()).toBeNull();
    expect(screen.getByTestId('clarify-draft-lock')).toBeInTheDocument();
    expect(document.body.style.pointerEvents).not.toBe('none');
    expect(svc.setClarifyVisibility).not.toHaveBeenCalled();
    // and it does not come back if the card were ever editable again
    rerender(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    expect(screen.queryByText(WARNING_TITLE)).toBeNull();
  });

  it('a refusal says so and still re-reads', async () => {
    svc.setClarifyVisibility.mockResolvedValue({ status: 'refused', code: 'published' });
    const changed = vi.fn();
    render(<ClarifyDraftCard draft={draft({ publicWarning: false })} userId="me" onChanged={changed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Private' }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });
});

describe('the warning names the source', () => {
  it('a chat source is named by its own title; a Mirror source says "a recording"', () => {
    expect(warningSourceName('dm', 'Dana')).toBe('Dana');
    expect(warningSourceName('group', 'Acme · General')).toBe('Acme · General');
    expect(warningSourceName('mirror', 'Mira')).toBe('a recording');
    expect(warningSourceName('dm', null)).toBe('this chat');
  });

  it('through the view: a Mirror draft warns "a recording", a DM draft names the chat title from the thread root', async () => {
    const actions = { onPick: vi.fn(), onRetry: vi.fn(), onAnother: vi.fn(), onChanged: vi.fn() };
    const view = (d: ClarifyDraft, title: string | null) => (
      <ClarifyDraftsView drafts={[d]} all={[d]} loaded failed={false} name="Mira" userId="me" mentionedId={null} onMention={() => undefined}
        actions={actions} onReload={() => undefined} first last sourceTitle={title} />
    );
    const { unmount } = render(view(draft({ sourceKind: 'mirror' }), null));
    fireEvent.click(screen.getByRole('button', { name: 'Private' }));
    expect(await screen.findByText(warningBody('a recording'))).toBeInTheDocument();
    unmount();
    render(view(draft({ sourceKind: 'dm' }), 'Dana'));
    fireEvent.click(screen.getByRole('button', { name: 'Private' }));
    expect(await screen.findByText(warningBody('Dana'))).toBeInTheDocument();
  });
});

describe('tags', () => {
  it('a point with tags shows them on the card; none shows no line', () => {
    const { rerender } = render(<ClarifyDraftCard draft={draft({ point: { id: 'pt1', statement: 'S', ownerPosition: null, tags: ['sales'] } })} userId="me" onChanged={() => undefined} />);
    expect(screen.getByTestId('clarify-draft-tags')).toHaveTextContent('#sales');
    // the shared TagPills, not a hand-made line: its pill look, and a long tag is cut with an ellipsis and keeps its full text as the title
    expect(screen.getByText('#sales').className).toContain('rounded-full');
    rerender(<ClarifyDraftCard draft={draft({ point: { id: 'pt1', statement: 'S', ownerPosition: null, tags: ['a-very-long-tag-name-that-overflows'] } })} userId="me" onChanged={() => undefined} />);
    expect(screen.getByText('#a-very-long-tag-name...')).toHaveAttribute('title', 'a-very-long-tag-name-that-overflows');
    rerender(<ClarifyDraftCard draft={draft({ point: { id: 'pt1', statement: 'S', ownerPosition: null, tags: ['sales'] } })} userId="me" onChanged={() => undefined} />);
    rerender(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    expect(screen.queryByTestId('clarify-draft-tags')).toBeNull();
  });

  it('W2: the statement shows without its #tags (pills carry them); the editor still has the raw text', () => {
    render(<ClarifyDraftCard draft={draft({ point: { id: 'pt1', statement: 'Pricing is the blocker #sales #pricing', ownerPosition: null, tags: ['sales', 'pricing'] } })} userId="me" onChanged={() => undefined} />);
    expect(screen.getByTestId('clarify-draft-statement').textContent).toBe('Pricing is the blocker');
    expect(screen.getAllByText('#sales')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Point text')).toHaveValue('Pricing is the blocker #sales #pricing');
  });

  it('W1: Escape on the visibility warning writes nothing and closes it', async () => {
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Private' }));
    const dlg = await screen.findByTestId('clarify-public-warning');
    fireEvent.keyDown(dlg, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText(WARNING_TITLE)).toBeNull());
    expect(svc.setClarifyVisibility).not.toHaveBeenCalled();
  });

  it('U3: more than 20 distinct #tags: a specific message and no save; 20 saves; repeats count once', async () => {
    svc.editClarifyDraft.mockResolvedValue({ status: 'ok' });
    const many = (n: number) => `Point ${Array.from({ length: n }, (_, i) => `#t${i}`).join(' ')}`;
    render(<ClarifyDraftCard draft={draft({ point: { id: 'pt1', statement: 'Point', ownerPosition: null, tags: [] } })} userId="me" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: many(21) } });
    fireEvent.click(screen.getByTestId('clarify-draft-editor-save'));
    expect(await screen.findByTestId('clarify-draft-editor-problem')).toHaveTextContent('Up to 20 tags');
    expect(svc.editClarifyDraft).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: `${many(20)} #t0 #t0` } });
    expect(screen.queryByTestId('clarify-draft-editor-problem')).toBeNull();
    fireEvent.click(screen.getByTestId('clarify-draft-editor-save'));
    await waitFor(() => expect(svc.editClarifyDraft).toHaveBeenCalledTimes(1));
  });

  it('Y3: text that is only #tags is not saved, with a plain message; real words save', async () => {
    svc.editClarifyDraft.mockResolvedValue({ status: 'ok' });
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: '#sales #pricing' } });
    fireEvent.click(screen.getByTestId('clarify-draft-editor-save'));
    expect(await screen.findByTestId('clarify-draft-editor-problem')).toHaveTextContent('besides the #tags');
    expect(svc.editClarifyDraft).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'Pricing #sales' } });
    expect(screen.queryByTestId('clarify-draft-editor-problem')).toBeNull();
    fireEvent.click(screen.getByTestId('clarify-draft-editor-save'));
    await waitFor(() => expect(svc.editClarifyDraft).toHaveBeenCalledTimes(1));
  });

  it('U2: the warning from the visibility button returns focus to that button when it closes', async () => {
    render(<ClarifyDraftCard draft={draft()} userId="me" onChanged={() => undefined} />);
    const b = screen.getByRole('button', { name: 'Private' });
    fireEvent.click(b);
    fireEvent.click(await screen.findByTestId('clarify-public-keep'));
    await waitFor(() => expect(screen.queryByText(WARNING_TITLE)).toBeNull());
    await waitFor(() => expect(b).toHaveFocus());
  });

  it('saving "Pricing is the real blocker #sales" sends the tag typed in the text; removing it sends none', async () => {
    svc.editClarifyDraft.mockResolvedValue({ status: 'ok' });
    render(<ClarifyDraftCard draft={draft({ point: { id: 'pt1', statement: 'Pricing is the real blocker #sales', ownerPosition: null, tags: ['sales'] } })} userId="me" onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'Pricing is the real blocker #sales #pricing' } });
    fireEvent.click(screen.getByTestId('clarify-draft-editor-save'));
    await waitFor(() => expect(svc.editClarifyDraft).toHaveBeenCalledWith('d1', 'Pricing is the real blocker #sales #pricing', ['sales', 'pricing']));
    await waitFor(() => expect(screen.queryByTestId('clarify-draft-editor')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Point text'), { target: { value: 'Pricing is the real blocker' } });
    fireEvent.click(screen.getByTestId('clarify-draft-editor-save'));
    await waitFor(() => expect(svc.editClarifyDraft).toHaveBeenLastCalledWith('d1', 'Pricing is the real blocker', []));
  });
});

describe('Publish to chat in the Mirror', () => {
  const actions = () => ({ onPick: vi.fn(), onRetry: vi.fn(), onAnother: vi.fn(), onChanged: vi.fn(), onPublished: vi.fn() });
  const mirrorDraft = (position: 'agree' | null) => draft({ sourceKind: 'mirror', point: { id: 'pt1', statement: 'S', ownerPosition: position, tags: [] } });

  it('a Mirror-sourced card with a position shows Publish to chat; a press posts and hands the Mirror answer on (no thread)', async () => {
    const a = actions();
    const d = mirrorDraft('agree');
    svc.publishClarify.mockResolvedValue({ status: 'published', messageId: 'card-1', conversationId: 'mirror-conv', threadRootId: null });
    render(<ClarifyDraftsView drafts={[d]} all={[d]} loaded failed={false} name="Mira" userId="me" mentionedId={null} onMention={() => undefined}
      actions={a} onReload={() => undefined} first last />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish to chat' }));
    await waitFor(() => expect(svc.publishClarify).toHaveBeenCalledWith('d1', expect.objectContaining({ visibility: 'private', warningAck: false })));
    await waitFor(() => expect(a.onPublished).toHaveBeenCalledWith({ status: 'published', messageId: 'card-1', conversationId: 'mirror-conv', threadRootId: null }));
  });

  it('a Mirror-sourced card with no position shows the button disabled (aria-disabled), as in a chat', () => {
    const d = mirrorDraft(null);
    render(<ClarifyDraftsView drafts={[d]} all={[d]} loaded failed={false} name="Mira" userId="me" mentionedId={null} onMention={() => undefined}
      actions={actions()} onReload={() => undefined} first last />);
    expect(screen.getByRole('button', { name: 'Publish to chat' })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('the service contract', () => {
  it('setClarifyVisibility calls clarify_set_visibility and maps ok and refused', async () => {
    const real = await vi.importActual<typeof import('@/app/data/clarify-service')>('@/app/data/clarify-service');
    rpc.mockResolvedValueOnce({ data: { status: 'ok', visibility: 'public', public_warning: false }, error: null });
    expect(await real.setClarifyVisibility('d1', 'public')).toEqual({ status: 'ok', visibility: 'public', publicWarning: false });
    expect(rpc).toHaveBeenLastCalledWith('clarify_set_visibility', { p_draft: 'd1', p_visibility: 'public' });
    rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'published' }, error: null });
    expect(await real.setClarifyVisibility('d1', 'private')).toEqual({ status: 'refused', code: 'published' });
  });

  it('editClarifyDraft sends p_tags only when given', async () => {
    const real = await vi.importActual<typeof import('@/app/data/clarify-service')>('@/app/data/clarify-service');
    rpc.mockResolvedValue({ data: { status: 'ok' }, error: null });
    await real.editClarifyDraft('d1', 'x #a', ['a']);
    expect(rpc).toHaveBeenLastCalledWith('clarify_draft_edit', { p_draft: 'd1', p_statement: 'x #a', p_tags: ['a'] });
    await real.editClarifyDraft('d1', 'x');
    expect(rpc).toHaveBeenLastCalledWith('clarify_draft_edit', { p_draft: 'd1', p_statement: 'x' });
  });

  it('the thread read maps the P1722 keys, and an unknown answer is the safe one (private, warn, latest)', async () => {
    const real = await vi.importActual<typeof import('@/app/data/clarify-service')>('@/app/data/clarify-service');
    rpc.mockResolvedValueOnce({
      data: { drafts: [
        { id: 'a', state: 'done', visibility: 'public', ever_published: true, is_latest: false, public_warning: false, point: { id: 'p', statement: 'S', tags: ['sales', 3], owner_position: null } },
        { id: 'b', state: 'done', point: { id: 'q', statement: 'T' } },
      ] },
      error: null,
    });
    const [a, b] = await real.getClarifyThread('r1');
    expect(a).toMatchObject({ visibility: 'public', everPublished: true, isLatest: false, publicWarning: false });
    expect(a?.point?.tags).toEqual(['sales']);
    expect(b).toMatchObject({ visibility: 'private', everPublished: false, isLatest: true, publicWarning: true });
    expect(b?.point?.tags).toEqual([]);
  });
});
