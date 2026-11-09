/**
 * P1529 founder UAT (prepare): the gut-feel nudge, required videos, the plan's minutes in the mastermind, and where the preparation opens
 * after Publish returns from the canvas workspace.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GutFeelNudge, NUDGE_AFTER_MS, NUDGE_SECONDS } from '@/app/prototypes/events/prep/GutFeelNudge';
import { VideoActions, useClipState } from '@/app/prototypes/events/prep/prep-video-actions';
import { planTotalMinutes, resumeScreenOf } from '@/app/prototypes/events/prep/prep-resume';
import { Mp4VideoFacade } from '@/app/components/shared/mp4-video-facade';

describe('GutFeelNudge', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  it('shows after 6 seconds with no position, as a card (not a dialog) with the founder meaning and one button', () => {
    render(<GutFeelNudge answered={0} loaded />);
    tick(NUDGE_AFTER_MS - 1);
    expect(screen.queryByTestId('gut-nudge')).toBeNull();
    tick(1);
    const card = screen.getByTestId('gut-nudge');
    expect(card.getAttribute('role')).toBeNull();
    expect(card.textContent).toContain("Don't overthink it. Go with your gut: agree, disagree or unsure. There's no right or wrong, and you can change it later. Can you do these in 2 minutes?");
    expect(screen.getByRole('button', { name: 'Yes, 2 minutes' })).toBeTruthy();
  });
  it('never appears when a first position is set before 6 seconds', () => {
    const { rerender } = render(<GutFeelNudge answered={0} loaded />);
    tick(3000);
    rerender(<GutFeelNudge answered={1} loaded />);
    tick(20000);
    expect(screen.queryByTestId('gut-nudge')).toBeNull();
  });
  it('does not start counting until the statements are loaded', () => {
    const { rerender } = render(<GutFeelNudge answered={0} loaded={false} />);
    tick(30000);
    expect(screen.queryByTestId('gut-nudge')).toBeNull();
    rerender(<GutFeelNudge answered={0} loaded />);
    tick(NUDGE_AFTER_MS);
    expect(screen.getByTestId('gut-nudge')).toBeTruthy();
  });
  it('a position set while the card shows leaves the card until it is dismissed (close control)', () => {
    const { rerender } = render(<GutFeelNudge answered={0} loaded />);
    tick(NUDGE_AFTER_MS);
    rerender(<GutFeelNudge answered={2} loaded />);
    expect(screen.getByTestId('gut-nudge')).toBeTruthy();
    fireEvent.click(screen.getByTestId('gut-nudge-close'));
    expect(screen.queryByTestId('gut-nudge')).toBeNull();
    tick(60000);
    expect(screen.queryByTestId('gut-nudge')).toBeNull();
  });
  it('Yes replaces the card with an m:ss countdown; at zero it says time is up and blocks nothing', () => {
    render(<GutFeelNudge answered={0} loaded />);
    tick(NUDGE_AFTER_MS);
    fireEvent.click(screen.getByTestId('gut-nudge-yes'));
    expect(screen.queryByTestId('gut-nudge')).toBeNull();
    expect(screen.getByTestId('gut-countdown').textContent).toBe('2:00');
    expect(screen.getByTestId('gut-countdown').className).toContain('sticky');
    tick(1000);
    expect(screen.getByTestId('gut-countdown').textContent).toBe('1:59');
    tick(61000);
    expect(screen.getByTestId('gut-countdown').textContent).toBe('0:58');
    tick((NUDGE_SECONDS - 62) * 1000);
    expect(screen.getByTestId('gut-countdown').textContent).toBe("Time's up. Finish when you're ready.");
    expect(screen.getByTestId('gut-countdown').closest('[aria-modal], dialog')).toBeNull();
  });
  it('the interval stops at zero: no timer is left running', () => {
    render(<GutFeelNudge answered={0} loaded />);
    tick(NUDGE_AFTER_MS);
    fireEvent.click(screen.getByTestId('gut-nudge-yes'));
    tick(NUDGE_SECONDS * 1000);
    expect(screen.getByTestId('gut-countdown').textContent).toContain("Time's up");
    expect(vi.getTimerCount()).toBe(0);
  });
  it('the close control has hover and focus-visible styling', () => {
    render(<GutFeelNudge answered={0} loaded />);
    tick(NUDGE_AFTER_MS);
    const cls = screen.getByTestId('gut-nudge-close').className;
    expect(cls).toContain('hover:bg-blue-100');
    expect(cls).toContain('focus-visible:ring-2');
  });
  it('respects reduced motion: the entrance animation is motion-safe only', () => {
    render(<GutFeelNudge answered={0} loaded />);
    tick(NUDGE_AFTER_MS);
    const cls = screen.getByTestId('gut-nudge').className;
    expect(cls).toContain('motion-safe:animate-in');
    expect(cls).not.toMatch(/(^|\s)animate-in/);
  });
});

describe('required videos', () => {
  const bar = (p: { played: boolean; failed?: boolean; onPlay?: () => void; onContinue?: (w: boolean) => void }) =>
    render(<VideoActions played={p.played} failed={!!p.failed} onPlay={p.onPlay ?? vi.fn()} onContinue={p.onContinue ?? vi.fn()} />);
  it('before Play there is only Play the video: no Continue and no skip', () => {
    bar({ played: false });
    expect(screen.getByRole('button', { name: 'Play the video' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByText(/without video/i)).toBeNull();
  });
  it('once Play has been pressed, Continue appears (the clip need not finish) and reports watched', () => {
    const onContinue = vi.fn();
    bar({ played: true, onContinue });
    expect(screen.queryByRole('button', { name: 'Play the video' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith(true);
  });
  it('a clip that cannot load offers Continue (reported as not watched), Try again, and a line saying why', () => {
    const onContinue = vi.fn(); const onRetry = vi.fn();
    render(<VideoActions played={false} failed onPlay={vi.fn()} onContinue={onContinue} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try the video again' }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.getByTestId('video-load-error')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith(false);
  });
  it('retry clears the failure and the play, and changes the clip key so the player mounts afresh', () => {
    const { result } = renderHook(() => useClipState<'story'>());
    act(() => { result.current.markPlayed('story')(); result.current.markFailed('story')(); });
    expect(result.current.failed.story).toBe(true);
    act(() => result.current.retry('story'));
    expect([result.current.played.story, result.current.failed.story, result.current.attempt.story]).toEqual([false, false, 1]);
  });
  it('end to end: Play on the poster starts the clip, and a load error reaches onError', () => {
    const onPlay = vi.fn(); const onError = vi.fn();
    const { container } = render(<Mp4VideoFacade src="/x.mp4" poster="/x.jpg" posterAlt="p" playLabel="Play it" onPlay={onPlay} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play it' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    fireEvent.error(container.querySelector('video')!);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('the mastermind plan minutes', () => {
  it('before starting: one total for the role; once started: none; other flows: the rows', () => {
    expect(planTotalMinutes({ mastermind: true, untouched: true, roleMinutes: 25, computed: 17 })).toBe(25);
    expect(planTotalMinutes({ mastermind: true, untouched: true, roleMinutes: null, computed: 17 })).toBeNull();
    expect(planTotalMinutes({ mastermind: true, untouched: false, roleMinutes: 25, computed: 17 })).toBeNull();
    expect(planTotalMinutes({ mastermind: false, untouched: true, roleMinutes: 25, computed: 17 })).toBe(17);
    expect(planTotalMinutes({ mastermind: false, untouched: false, roleMinutes: 25, computed: null })).toBeNull();
  });
});

describe('where the preparation opens after Publish returns', () => {
  const plan = ['story', 'cmp7', 'stake', 'canvas'] as never[];
  const base = { completedAt: null, startedAt: '2026-11-09T10:00:00Z', currentStep: null, plan, keepFinished: false };
  it('an owner who finished the three learning steps lands on the canvas step (current_step never holds canvas)', () => {
    expect(resumeScreenOf({ ...base, stepsDone: ['story', 'cmp7', 'stake'] })).toBe('canvas');
  });
  it('an owner who has not finished a learning step lands there, not on the canvas', () => {
    expect(resumeScreenOf({ ...base, stepsDone: ['story'] })).toBe('cmp7');
  });
  it('a finished preparation shows the end; one never started shows the list', () => {
    expect(resumeScreenOf({ ...base, completedAt: '2026-11-09T11:00:00Z', stepsDone: ['story', 'cmp7', 'stake', 'canvas'] })).toBe('end');
    expect(resumeScreenOf({ ...base, startedAt: null, stepsDone: [] })).toBe('plan');
  });
});

describe('Publish with the REAL search-params setter, as the workspace calls it', () => {
  const published = vi.hoisted(() => ({ run: null as null | (() => void) }));
  it('the two replace-navigations in one tick (clear ws/set v, then return) end on the preparation', async () => {
    const Where = { path: '' };
    function Probe() {
      const [, setParams] = useSearchParams();
      const navigate = useNavigate();
      const loc = useLocation();
      Where.path = `${loc.pathname}${loc.search}`;
      published.run = () => {
        setParams((prev) => { const n = new URLSearchParams(prev); n.set('v', 'canvas_d2'); n.delete('ws'); return n; }, { replace: true, state: loc.state });
        navigate('/events/x/prepare', { replace: true });
      };
      return null;
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[{ pathname: '/p/ana/canvas/canvas_1', search: '?v=canvas_d1&ws=1', state: { afterPublish: '/events/x/prepare' } }]}>
        <Routes><Route path="*" element={<>{children}<Probe /></>} /></Routes>
      </MemoryRouter>
    );
    renderHook(() => null, { wrapper });
    await act(async () => { published.run!(); });
    expect(Where.path).toBe('/events/x/prepare');
  });
});

describe('wiring (source pins: the pages render the shared pieces, and no skip for videos remains)', () => {
  const read = (f: string) => readFileSync(resolve(__dirname, '../app/prototypes/events/prep', f), 'utf8');
  it('every position step uses the one GutFeelNudge; neither page offers "Continue without video"', () => {
    expect(read('EventPrepPage.tsx').match(/<GutFeelNudge /g)).toHaveLength(2); // cmp7 and the event's own statements
    expect(read('PreparePage.tsx').match(/<GutFeelNudge /g)).toHaveLength(1); // /prepare and the group join share this page
    for (const f of ['EventPrepPage.tsx', 'PreparePage.tsx', 'prep-video-actions.tsx']) expect(read(f)).not.toMatch(/without video"/);
  });
  it('the group join keeps its skip hidden: the join gate (hasLearned) needs the cmp7 part, which only a finished step records', () => {
    expect(read('PreparePage.tsx')).toMatch(/hideSkip=\{!!join\}/);
  });
});
