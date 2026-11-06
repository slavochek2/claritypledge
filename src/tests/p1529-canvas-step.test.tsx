/**
 * P1529 UAT round 2: preparation's canvas step (A..F), its one primary in the bottom bar, and the preparation banner in the canvas workspace.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';

const h = vi.hoisted(() => ({
  mine: null as unknown,
  versions: [] as { canvasName: string; canvasTitle: string | null; publishedAt: string }[],
  all: [] as { name: string }[],
  wide: true,
  start: vi.fn(),
  setCanvas: vi.fn(),
}));

vi.mock('@/app/data/event-mastermind-service', () => ({ getMyEventCanvas: async () => h.mine, setEventCanvas: (...a: unknown[]) => h.setCanvas(...a) }));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { listMyCanvases: async () => h.all } }));
vi.mock('@/app/data/canvas-draft-service', () => ({
  listMyCanvasVersions: async () => h.versions.map((v, i) => ({ id: `v${i}`, canvasId: `c${i}`, name: 'v', seq: 1, hasOpenDraft: false, ...v })),
}));
vi.mock('@/app/pages/chat/chat-hooks', () => ({ useMediaQuery: () => h.wide }));
vi.mock('@/app/pages/chat/use-start-canvas', () => ({ useStartCanvas: () => ({ start: h.start, dialog: null }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { EventCanvasStep } from '@/app/prototypes/events/prep/EventCanvasStep';
import { PreparationBanner } from '@/app/pages/canvas/PreparationBanner';
import { CanvasWorkspaceLayout } from '@/app/components/canvas/canvas-workspace-layout';
import { usePreparationReturn } from '@/app/pages/canvas/use-preparation-return';
import { afterPublishPath } from '@/lib/canvas-hrefs';

const pub = (name: string, title: string | null, at: string) => ({ canvasName: name, canvasTitle: title, publishedAt: at });
const cont = vi.fn();
const skip = vi.fn();
const renderStep = () => render(<MemoryRouter><EventCanvasStep eventId="ev-1" barRef={createRef()} onContinue={cont} onSkip={skip} /></MemoryRouter>);
const bar = () => screen.getByTestId('step-actions');
const primaryButtons = () => within(screen.getByTestId('event-canvas-primary')).getAllByRole('button');

beforeEach(() => {
  vi.clearAllMocks();
  h.mine = null; h.versions = []; h.all = []; h.wide = true;
  h.setCanvas.mockResolvedValue({ status: 'ok', name: 'x' });
});

describe('canvas step states', () => {
  it('A: no canvas, no draft', async () => {
    renderStep();
    expect((await screen.findByRole('heading')).textContent).toBe('Create your Clarity Canvas now');
    expect(screen.getByTestId('event-canvas-body').textContent).toBe('About 15 minutes with your mirror.');
    expect(primaryButtons()).toHaveLength(1);
    expect(primaryButtons()[0]!.textContent).toBe('Create your canvas');
    expect(within(bar()).getByTestId('event-canvas-primary')).toBeTruthy(); // the primary is in the bottom bar
    fireEvent.click(primaryButtons()[0]!);
    expect(h.start).toHaveBeenCalled();
    fireEvent.click(within(screen.getByTestId('event-canvas-secondary')).getByRole('button', { name: 'Skip for now' }));
    expect(skip).toHaveBeenCalled();
    expect(screen.queryByText(/Share/)).toBeNull();
    expect(screen.queryByText('Continue without a canvas')).toBeNull();
    expect(screen.queryByText(/join as an observer/)).toBeNull();
  });
  it('A on a narrow viewport adds the desktop hint', async () => {
    h.wide = false;
    renderStep();
    expect((await screen.findByTestId('event-canvas-body')).textContent).toBe("About 15 minutes with your mirror. It's easier on a desktop.");
  });
  it('B: an open draft, nothing published', async () => {
    h.all = [{ name: 'canvas_1' }];
    renderStep();
    expect((await screen.findByRole('heading')).textContent).toBe('Finish your Clarity Canvas');
    expect(screen.getByTestId('event-canvas-body').textContent).toBe("Your draft isn't published yet. Publish it to finish this step.");
    expect(primaryButtons().map(b => b.textContent)).toEqual(['Continue your draft']);
    expect(screen.queryByTestId('event-canvas-secondary')).toBeNull();
    expect(screen.queryByText(/Share/)).toBeNull();
  });
  it('C: one published, not shared; sharing is its own tap', async () => {
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    h.all = [{ name: 'canvas_1' }];
    renderStep();
    expect((await screen.findByRole('heading')).textContent).toBe('Share your Clarity Canvas');
    expect(screen.getByTestId('event-canvas-body').textContent).toBe('“Launch plan” is ready. Share it with this event\'s attendees.');
    expect(primaryButtons().map(b => b.textContent)).toEqual(['Share with this event']);
    expect(within(screen.getByTestId('event-canvas-secondary')).getByRole('button').textContent).toBe('Make a different one');
    expect(h.setCanvas).not.toHaveBeenCalled();
    fireEvent.click(primaryButtons()[0]!);
    await waitFor(() => expect(h.setCanvas).toHaveBeenCalledWith('ev-1', 'canvas_1'));
  });
  it('D: several published, newest preselected and named by the button; only published ones are offered', async () => {
    h.versions = [pub('canvas_3', 'Newest', '2026-11-03'), pub('canvas_2', 'Older', '2026-11-02')];
    h.all = [{ name: 'canvas_3' }, { name: 'canvas_2' }, { name: 'canvas_9' }]; // canvas_9 is a draft only
    renderStep();
    expect((await screen.findByRole('heading')).textContent).toBe('Share a Clarity Canvas');
    expect(screen.getByTestId('event-canvas-body').textContent).toBe('Pick the one to share with this event.');
    const options = screen.getAllByTestId('event-canvas-option') as HTMLInputElement[];
    expect(options).toHaveLength(2);
    expect(options.map(o => o.checked)).toEqual([true, false]);
    expect(primaryButtons().map(b => b.textContent)).toEqual(['Share “Newest” with this event']);
    fireEvent.click(options[1]!);
    expect(primaryButtons()[0]!.textContent).toBe('Share “Older” with this event');
    expect(within(screen.getByTestId('event-canvas-secondary')).getByRole('button').textContent).toBe('Make a new one');
    fireEvent.click(primaryButtons()[0]!);
    await waitFor(() => expect(h.setCanvas).toHaveBeenCalledWith('ev-1', 'canvas_2'));
  });
  it('E: shared before round 1 has Continue and Change; Change reopens the choice', async () => {
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01'), pub('canvas_2', 'Other', '2026-10-01')];
    h.mine = { name: 'canvas_1', shared: true, fixed: false };
    renderStep();
    expect((await screen.findByRole('heading')).textContent).toBe('Your Clarity Canvas is shared');
    expect(screen.getByTestId('event-canvas-body').textContent).toBe('“Launch plan” is shared with this event.');
    expect(primaryButtons().map(b => b.textContent)).toEqual(['Continue']);
    fireEvent.click(primaryButtons()[0]!);
    expect(cont).toHaveBeenCalled();
    fireEvent.click(within(screen.getByTestId('event-canvas-secondary')).getByRole('button', { name: 'Change' }));
    expect((await screen.findByRole('heading')).textContent).toBe('Share a Clarity Canvas');
  });
  it('F: shared after round 1 started has Continue and no Change', async () => {
    h.versions = [pub('canvas_1', 'Launch plan', '2026-11-01')];
    h.mine = { name: 'canvas_1', shared: true, fixed: true };
    renderStep();
    expect((await screen.findByTestId('event-canvas-body')).textContent).toBe("You're ready. The host can add you to a coming round.");
    expect(primaryButtons().map(b => b.textContent)).toEqual(['Continue']);
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
    expect(screen.getByTestId('preparation-banner').textContent).toContain("You're preparing for the event. Publish your canvas to finish this step.");
    fireEvent.click(screen.getByTestId('preparation-banner-back'));
    expect(screen.getByTestId('where').textContent).toBe('/events/x/prepare');
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
