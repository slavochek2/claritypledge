/**
 * P1529 UAT round 2: preparation's canvas step (A..G) as one centred column (no skip, no change of a shared canvas), and the preparation banner in the canvas workspace.
 */
import { renderHook, act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';

const h = vi.hoisted(() => ({
  mine: null as unknown,
  versions: [] as { canvasName: string; canvasTitle: string | null; publishedAt: string }[],
  drafts: [] as { canvasName: string; versionName: string }[],
  wide: true,
  start: vi.fn(),
  setCanvas: vi.fn(),
  shareCanvas: vi.fn(),
  toastError: vi.fn(),
  refresh: vi.fn(async () => null),
  rows: [] as { secondary?: unknown }[],
  getMine: vi.fn(),
}));

vi.mock('@/app/data/event-mastermind-service', () => ({ getMyEventCanvas: (...a: unknown[]) => h.getMine(...a), setEventCanvas: (...a: unknown[]) => h.setCanvas(...a) }));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { shareCanvas: (...a: unknown[]) => h.shareCanvas(...a) } }));
vi.mock('@/app/data/canvas-open-drafts', () => ({ listMyOpenCanvasDrafts: async () => h.drafts }));
vi.mock('@/app/pages/chat/chat-state', () => ({ useChat: () => ({ userId: 'u1', authors: { u1: { slug: 'ana' } }, refresh: () => h.refresh() }) }));
vi.mock('@/app/data/canvas-draft-service', () => ({
  listMyCanvasVersions: async () => h.versions.map((v, i) => ({ id: `v${i}`, canvasId: `c${i}`, name: 'v', seq: 1, hasOpenDraft: false, ...v })),
}));
vi.mock('@/app/pages/chat/chat-hooks', () => ({ useMediaQuery: () => h.wide }));
vi.mock('@/app/pages/chat/use-start-canvas', () => ({ useStartCanvas: () => ({ start: h.start, dialog: null }) }));
vi.mock('@/app/prototypes/events/prep/prep-ui', async (orig) => {
  const actual = await orig<typeof import('@/app/prototypes/events/prep/prep-ui')>();
  return { ...actual, ActionRow: (p: { secondary?: unknown }) => { h.rows.push(p); return <actual.ActionRow {...(p as object as React.ComponentProps<typeof actual.ActionRow>)} />; } };
});
vi.mock('sonner', () => ({ toast: { error: (m: string) => h.toastError(m) } }));

import { EventCanvasStep } from '@/app/prototypes/events/prep/EventCanvasStep';
import { useEventCanvasStep } from '@/app/prototypes/events/prep/use-event-canvas-step';
import { PreparationBanner } from '@/app/pages/canvas/PreparationBanner';
import { CanvasWorkspaceLayout } from '@/app/components/canvas/canvas-workspace-layout';
import { usePreparationReturn, usePreparationStep } from '@/app/pages/canvas/use-preparation-return';
import { afterPublishPath, prepStepOf } from '@/lib/canvas-hrefs';

const pub = (name: string, title: string | null, at: string) => ({ canvasName: name, canvasTitle: title, publishedAt: at });
const cont = vi.fn();
const Where = () => { const l = useLocation(); return <div data-testid="where" data-state={JSON.stringify(l.state)}>{l.pathname}{l.search}</div>; };
const renderStep = () => render(<MemoryRouter initialEntries={['/events/x/prepare?step=4']}><EventCanvasStep eventId="ev-1" onContinue={cont} /><Where /></MemoryRouter>);
const primaryButtons = () => within(screen.getByTestId('event-canvas-primary')).getAllByRole('button');

beforeEach(() => {
  vi.clearAllMocks();
  h.mine = null; h.versions = []; h.drafts = []; h.wide = true; h.rows = [];
  h.getMine.mockImplementation(async () => h.mine);
  h.refresh.mockResolvedValue(null);
  h.setCanvas.mockResolvedValue({ status: 'ok', name: 'x' });
  h.shareCanvas.mockResolvedValue(undefined);
});

describe('canvas step states', () => {
  it('A: no canvas, no draft', async () => {
    renderStep();
    expect((await screen.findByRole('heading')).textContent).toBe('Create your Clarity Canvas now');
    expect(screen.getByTestId('event-canvas-body').textContent).toBe('About 12 minutes with your mirror.');
    expect(primaryButtons()).toHaveLength(1);
    expect(primaryButtons()[0]!.textContent).toBe('Create your canvas');
    // One centred column: the actions sit directly under the content, there is no pinned bar.
    expect(screen.queryByTestId('step-actions')).toBeNull();
    const column = screen.getByTestId('prep-canvas-step');
    expect(column.className).toContain('max-w-sm');
    expect(column.className).toContain('justify-center');
    expect(within(column).getByTestId('event-canvas-primary')).toBeTruthy();
    fireEvent.click(primaryButtons()[0]!);
    expect(h.start).toHaveBeenCalled();
    expect(screen.queryByText('Skip for now')).toBeNull(); // Skip for now is gone
    expect(screen.queryByTestId('event-canvas-quiet')).toBeNull();
    expect(screen.queryByText(/Share/)).toBeNull();
    expect(screen.queryByText('Continue without a canvas')).toBeNull();
    expect(screen.queryByText(/join as an observer/)).toBeNull();
  });
  it('A on a narrow viewport adds the desktop hint', async () => {
    h.wide = false;
    renderStep();
    expect((await screen.findByTestId('event-canvas-body')).textContent).toBe("About 12 minutes with your mirror. It's easier on a desktop.");
  });
  it('B: an open draft, nothing published; Continue reopens THAT draft, never start()', async () => {
    h.drafts = [{ canvasName: 'canvas_1', versionName: 'canvas_d111' }];
    renderStep();
    expect((await screen.findByRole('heading')).textContent).toBe('Finish your Clarity Canvas');
    expect(screen.getByTestId('event-canvas-body').textContent).toBe("Your draft isn't published yet. Open it and publish it, then share it here.");
    expect(primaryButtons().map(b => b.textContent)).toEqual(['Continue your draft']);
    expect(screen.queryByText(/Share/)).toBeNull();
    fireEvent.click(primaryButtons()[0]!);
    expect(h.start).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain('/p/ana/canvas/'));
    const where = screen.getByTestId('where');
    expect(where.textContent).toBe('/p/ana/canvas/canvas_1?v=canvas_d111&ws=1');
    expect(JSON.parse(where.getAttribute('data-state')!)).toEqual({ from: '/events/x/prepare?step=4', afterPublish: '/events/x/prepare?step=4' });
  });
  it('B has no Skip for now either', async () => {
    h.drafts = [{ canvasName: 'canvas_1', versionName: 'canvas_d111' }];
    renderStep();
    await screen.findByRole('button', { name: 'Continue your draft' });
    expect(screen.queryByText('Skip for now')).toBeNull();
    expect(screen.queryByTestId('event-canvas-quiet')).toBeNull();
  });
  it('an old tag-only canvas with no open draft is state A, not B', async () => {
    renderStep(); // drafts empty: no open canvas_drafts row
    expect((await screen.findByRole('heading')).textContent).toBe('Create your Clarity Canvas now');
  });
  it('C: one published, not shared; sharing is its own tap', async () => {
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    renderStep();
    expect((await screen.findByRole('heading')).textContent).toBe('Share your Clarity Canvas');
    expect(screen.getByTestId('event-canvas-body').textContent).toBe('“Launch plan” is ready. Share it with this event\'s attendees.');
    expect(primaryButtons().map(b => b.textContent)).toEqual(['Share with this event']);
    expect(within(screen.getByTestId('event-canvas-secondary')).getByRole('button').textContent).toBe('Make a different one');
    expect(screen.getByTestId('event-canvas-secondary').querySelector('button')!.className).toContain('underline'); // the same secondary treatment as Skip and proceed
    expect(h.setCanvas).not.toHaveBeenCalled();
    fireEvent.click(primaryButtons()[0]!);
    await waitFor(() => expect(h.setCanvas).toHaveBeenCalledWith('ev-1', 'canvas_1'));
  });
  it('D: several published, newest preselected and named by the button; only published ones are offered', async () => {
    h.versions = [pub('canvas_3', 'Newest', '2026-11-03'), pub('canvas_2', 'Older', '2026-11-02')];
    h.drafts = [{ canvasName: 'canvas_9', versionName: 'canvas_d9' }]; // canvas_9 is a draft only
    renderStep();
    expect((await screen.findByRole('heading')).textContent).toBe('Share a Clarity Canvas');
    expect(screen.getByTestId('event-canvas-body').textContent).toBe('Pick the one to share with this event.');
    const options = screen.getAllByTestId('event-canvas-option') as HTMLInputElement[];
    expect(options).toHaveLength(2);
    expect(options.map(o => o.checked)).toEqual([true, false]);
    expect(primaryButtons().map(b => b.textContent)).toEqual(['Share with this event']);
    fireEvent.click(options[1]!);
    expect(primaryButtons()[0]!.textContent).toBe('Share with this event');
    expect(within(screen.getByTestId('event-canvas-secondary')).getByRole('button').textContent).toBe('Continue your draft'); // canvas_9 is an open draft
    fireEvent.click(primaryButtons()[0]!);
    await waitFor(() => expect(h.setCanvas).toHaveBeenCalledWith('ev-1', 'canvas_2'));
  });
  it('E: shared before round 1 is the named canvas and one primary, Done; there is no Change and no Make a different one', async () => {
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01'), pub('canvas_2', 'Other', '2026-10-01')];
    h.mine = { name: 'canvas_1', shared: true, fixed: false };
    renderStep();
    expect((await screen.findByRole('heading')).textContent).toBe('Your Clarity Canvas is shared');
    expect(screen.getByTestId('event-canvas-body').textContent).toBe('“Launch plan” is shared with this event.');
    expect(primaryButtons().map(b => b.textContent)).toEqual(['Done']);
    expect(screen.queryByTestId('event-canvas-secondary')).toBeNull();
    expect(screen.queryByText('Change')).toBeNull();
    expect(screen.queryByText('Make a different one')).toBeNull();
    fireEvent.click(primaryButtons()[0]!);
    expect(cont).toHaveBeenCalled(); // Done finishes the preparation, as Continue did
  });
  it('the alternatives (Make a new one, Make a different one, Continue your draft) are drawn like Skip and proceed: variant secondary, a text link', async () => {
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    const { unmount } = renderStep();
    const alt = within(await screen.findByTestId('event-canvas-secondary')).getByRole('button');
    expect(alt.className).toContain('underline');
    expect(alt.className).not.toContain('border-border');
    unmount();
    h.versions = []; h.drafts = []; // A has no alternative at all
    renderStep();
    await screen.findByTestId('event-canvas-primary');
    expect(screen.queryByTestId('event-canvas-secondary')).toBeNull();
  });
  it('E with only the shared canvas published: still just Done', async () => {
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    h.mine = { name: 'canvas_1', shared: true, fixed: false };
    renderStep();
    await screen.findByTestId('event-canvas-primary');
    expect(screen.queryByTestId('event-canvas-secondary')).toBeNull();
    expect(h.start).not.toHaveBeenCalled();
  });
  it('G: round 1 started and the chosen canvas is no longer shared: Share again through share_canvas, not set_event_canvas', async () => {
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    h.mine = { name: 'canvas_1', shared: false, fixed: true };
    renderStep();
    expect((await screen.findByRole('heading')).textContent).toBe("Your Clarity Canvas isn't shared any more");
    expect(screen.getByTestId('event-canvas-body').textContent).toBe('Share “Launch plan” again so your partners can read it.');
    expect(primaryButtons().map(b => b.textContent)).toEqual(['Share again']);
    expect(within(screen.getByTestId('event-canvas-secondary')).getByRole('button').textContent).toBe('Continue');
    fireEvent.click(within(screen.getByTestId('event-canvas-secondary')).getByRole('button'));
    expect(cont).toHaveBeenCalled();
    fireEvent.click(primaryButtons()[0]!);
    await waitFor(() => expect(h.shareCanvas).toHaveBeenCalledWith('canvas_1', 'event', 'ev-1'));
    expect(h.setCanvas).not.toHaveBeenCalled();
  });
  it('F: shared after round 1 started has Done and no Change', async () => {
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    h.mine = { name: 'canvas_1', shared: true, fixed: true };
    renderStep();
    expect((await screen.findByTestId('event-canvas-body')).textContent).toBe("You're ready. The host can add you to a coming round.");
    expect(primaryButtons().map(b => b.textContent)).toEqual(['Done']);
    expect(screen.queryByTestId('event-canvas-secondary')).toBeNull();
    expect(screen.queryByText('Change')).toBeNull();
  });
  it('a read failure shows Retry and no primary', async () => {
    h.mine = null;
    h.versions = null as never; // listMyCanvasVersions's map throws
    renderStep();
    expect(await screen.findByTestId('event-canvas-error')).toBeTruthy();
    expect(screen.queryByTestId('event-canvas-primary')).toBeNull();
    expect(screen.getByTestId('event-canvas-retry')).toBeTruthy();
  });
});

describe('busy and failure feedback', () => {
  it('while an action is in flight its label says so and no other action is tappable', async () => {
    let release: () => void = () => {};
    h.start.mockImplementation(() => new Promise<void>(r => { release = r; }));
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    renderStep();
    const make = await screen.findByRole('button', { name: 'Make a different one' });
    fireEvent.click(make);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Opening…' })).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Share with this event' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Share with this event' }));
    expect(h.setCanvas).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share with this event' })).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Share with this event' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('sharing shows its busy label', async () => {
    let release: (v: unknown) => void = () => {};
    h.setCanvas.mockImplementation(() => new Promise(r => { release = r; }));
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    renderStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Share with this event' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sharing…' })).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Make a different one' }) as HTMLButtonElement).disabled).toBe(true);
    release({ status: 'ok', name: 'canvas_1' });
  });
  it('a non-network failure does not blame the canvas', async () => {
    h.setCanvas.mockRejectedValueOnce(new Error('boom'));
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    renderStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Share with this event' }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Couldn't share your Clarity Canvas. Try again."));
  });
});

describe('afterPublishPath and PreparationBanner', () => {
  it('accepts only a same-origin app path', () => {
    expect(afterPublishPath({ afterPublish: '/events/x/prepare?step=4' })).toBe('/events/x/prepare?step=4');
    expect(afterPublishPath({ afterPublish: '//evil.example' })).toBeNull();
    expect(afterPublishPath({ afterPublish: '/\\evil.example' })).toBeNull();
    expect(afterPublishPath({ afterPublish: 'https://evil.example' })).toBeNull();
    expect(afterPublishPath(null)).toBeNull();
    expect(afterPublishPath({})).toBeNull();
  });
  it('shows its line and navigates back to preparation', () => {
    const Where = () => <div data-testid="where">{useLocation().pathname}</div>;
    render(
      <MemoryRouter initialEntries={['/canvas']}>
        <Routes>
          <Route path="/canvas" element={<PreparationBanner to="/events/x/prepare" />} />
          <Route path="/events/x/prepare" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    const banner = screen.getByTestId('preparation-banner');
    expect(banner.textContent).toBe('Your Clarity Canvas · Publish, then share'); // no step in the state: no number
    expect(banner.className).toContain('bg-blue-50'); // the Transcribe bar's blue
    const back = screen.getByRole('button', { name: 'Back to preparation' });
    expect(back.className).toContain('h-11');
    expect(back.className).toContain('w-11');
    expect(banner.querySelector('a, u')).toBeNull(); // no underlined link at the right
    fireEvent.click(back);
    expect(screen.getByTestId('where').textContent).toBe('/events/x/prepare');
  });
});

describe('the banner names the real step when the navigation state carries it', () => {
  it('Step N of M from prepStep; invalid or missing values show no number', () => {
    expect(prepStepOf({ prepStep: { step: 3, total: 3 } })).toEqual({ step: 3, total: 3 });
    for (const bad of [null, {}, { prepStep: { step: 0, total: 3 } }, { prepStep: { step: 4, total: 3 } }, { prepStep: { step: 1.5, total: 3 } }, { prepStep: { step: '4', total: '4' } }]) expect(prepStepOf(bad)).toBeNull();
    render(<MemoryRouter><PreparationBanner to="/x" step={{ step: 3, total: 3 }} /></MemoryRouter>);
    expect(screen.getByTestId('preparation-banner').textContent).toBe('Step 3 of 3 · Publish, then share');
  });
  it('the step is remembered for the canvas it was seen on, like the return path', () => {
    const { result, rerender } = renderHook(({ state }: { state: unknown }) => usePreparationStep(state, 'k'), { initialProps: { state: { prepStep: { step: 2, total: 3 } } as unknown }, wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    expect(result.current).toEqual({ step: 2, total: 3 });
    rerender({ state: { canvasPanel: true } });
    expect(result.current).toEqual({ step: 2, total: 3 });
  });
});

describe('the banner shows only for a valid afterPublish', () => {
  const Probe = () => {
    const to = usePreparationReturn(useLocation().state);
    return to ? <PreparationBanner to={to} /> : <div data-testid="no-banner" />;
  };
  const mount = (state: unknown) => render(<MemoryRouter initialEntries={[{ pathname: '/canvas', state }]}><Probe /></MemoryRouter>);
  it('valid path: banner', () => { mount({ afterPublish: '/events/x/prepare' }); expect(screen.getByTestId('preparation-banner')).toBeTruthy(); });
  it('//evil: none', () => { mount({ afterPublish: '//evil' }); expect(screen.queryByTestId('preparation-banner')).toBeNull(); });
  it('missing state: none', () => { mount(null); expect(screen.queryByTestId('preparation-banner')).toBeNull(); });
  it('the workspace layout draws the banner as the first row of the box', () => {
    render(<MemoryRouter><CanvasWorkspaceLayout active bar={<div data-testid="bar" />} banner={<div data-testid="b" />} canvas={null} chat={null} view="canvas" /></MemoryRouter>);
    const box = screen.getByTestId('canvas-workspace');
    expect(box.firstElementChild?.getAttribute('data-testid')).toBe('b');
    expect(box.children[1]!.getAttribute('data-testid')).toBe('bar');
  });
});

const draft = { canvasName: 'canvas_9', versionName: 'canvas_d9' };

describe('P1529 review round fixes', () => {
  it('3: with an open draft, C and D offer Continue your draft, never a new canvas', async () => {
    h.drafts = [draft];
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    renderStep();
    fireEvent.click(within(await screen.findByTestId('event-canvas-secondary')).getByRole('button', { name: 'Continue your draft' }));
    expect(h.start).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/ana/canvas/canvas_9?v=canvas_d9&ws=1'));
  });
  it('4: Continue your draft refreshes the chat first and shows its busy label meanwhile', async () => {
    let release: (v: null) => void = () => {};
    h.refresh.mockImplementation(() => new Promise<null>(r => { release = r; }));
    h.drafts = [draft];
    renderStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue your draft' }));
    expect(h.refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Opening…' })).toBeTruthy());
    expect(screen.getByTestId('where').textContent).toBe('/events/x/prepare?step=4');
    release(null);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain('/p/ana/canvas/canvas_9'));
  });
  it('5: the canvas picker is locked while an action is pending', async () => {
    h.start.mockImplementation(() => new Promise<void>(() => {}));
    h.versions = [pub('canvas_3', 'Newest', '2026-11-03'), pub('canvas_2', 'Older', '2026-11-02')];
    renderStep();
    const radios = await screen.findAllByTestId('event-canvas-option') as HTMLInputElement[];
    expect(radios.every(r => !r.disabled)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Make a new one' }));
    await waitFor(() => expect((screen.getAllByTestId('event-canvas-option') as HTMLInputElement[]).every(r => r.disabled)).toBe(true));
  });
  it('6: Retry shows the loading state while it re-reads, and a second failure shows the error again', async () => {
    let release: (v: unknown) => void = () => {};
    h.getMine.mockRejectedValueOnce(new Error('x')).mockImplementationOnce(() => new Promise((_, rej) => { release = rej; }));
    renderStep();
    fireEvent.click(await screen.findByTestId('event-canvas-retry'));
    expect(screen.getByTestId('event-canvas-loading')).toBeTruthy();
    expect(screen.queryByTestId('event-canvas-error')).toBeNull();
    release(new Error('again'));
    expect(await screen.findByTestId('event-canvas-error')).toBeTruthy();
  });
  it('6b: retry does nothing while an action is in flight', async () => {
    h.start.mockImplementation(() => new Promise<void>(() => {}));
    const { result } = renderHook(() => useEventCanvasStep('ev-1', {}), { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await waitFor(() => expect(result.current.view).not.toBeNull());
    act(() => { result.current.view!.primary!.run(); });
    await waitFor(() => expect(result.current.busy).toBe(true));
    const reads = h.getMine.mock.calls.length;
    await act(async () => { await result.current.retry(); });
    expect(h.getMine.mock.calls.length).toBe(reads);
    expect(result.current.loaded).toBe(true);
  });
  it('7: a failed Share again says so and re-reads', async () => {
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    h.mine = { name: 'canvas_1', shared: false, fixed: true };
    h.shareCanvas.mockRejectedValueOnce(new Error('refused'));
    renderStep();
    await screen.findByRole('button', { name: 'Share again' });
    const reads = h.getMine.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Share again' }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Couldn't share your Clarity Canvas. Try again."));
    await waitFor(() => expect(h.getMine.mock.calls.length).toBe(reads + 1));
  });
  it('9: the actions pass no secondary when the state has none', async () => {
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    h.mine = { name: 'canvas_1', shared: true, fixed: true }; // F: Done only
    renderStep();
    await screen.findByTestId('event-canvas-primary');
    expect(h.rows.at(-1)!.secondary).toBeUndefined();
  });
});
