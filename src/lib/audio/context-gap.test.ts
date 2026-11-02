/**
 * P1596: a Safari window that goes to the background can suspend or interrupt the AudioContext, and the tap
 * then delivers no samples. The watcher resumes the context and reports how long it was not running.
 * Whether Safari actually behaves this way cannot be proven without a real Safari; this pins the logic.
 */
import { describe, it, expect, vi } from 'vitest';
import { watchContext, CONTEXT_GAP_MIN_MS } from './context-gap';

function setup(initial = 'running') {
  const ctx = Object.assign(new EventTarget(), { state: initial, resume: vi.fn().mockResolvedValue(undefined) });
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const win = new EventTarget();
  let now = 1_000;
  const onGap = vi.fn();
  const stop = watchContext(ctx as never, onGap, { now: () => now, doc: doc as never, win: win as never });
  const set = (s: string) => { ctx.state = s; ctx.dispatchEvent(new Event('statechange')); };
  return { ctx, doc, win, onGap, stop, set, advance: (ms: number) => { now += ms; } };
}

describe('watchContext', () => {
  it.each(['suspended', 'interrupted'])('calls resume() when the context goes %s', (s) => {
    const t = setup();
    t.set(s);
    expect(t.ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('reports a gap longer than the minimum once the context runs again', () => {
    const t = setup();
    t.set('interrupted'); t.advance(26_000); t.set('running');
    expect(t.onGap).toHaveBeenCalledExactlyOnceWith(26_000);
  });

  it('does not report a gap of 2 s or less', () => {
    const t = setup();
    t.set('suspended'); t.advance(CONTEXT_GAP_MIN_MS); t.set('running');
    expect(t.onGap).not.toHaveBeenCalled();
  });

  it('tries resume() again when the window becomes visible or focused', () => {
    const t = setup();
    t.set('suspended');
    t.ctx.resume.mockClear();
    t.doc.dispatchEvent(new Event('visibilitychange'));
    t.win.dispatchEvent(new Event('focus'));
    expect(t.ctx.resume).toHaveBeenCalledTimes(2);
  });

  it('does not call resume() while hidden or while running', () => {
    const t = setup();
    t.doc.dispatchEvent(new Event('visibilitychange'));
    expect(t.ctx.resume).not.toHaveBeenCalled();
    t.set('suspended'); t.ctx.resume.mockClear();
    t.doc.visibilityState = 'hidden';
    t.doc.dispatchEvent(new Event('visibilitychange'));
    expect(t.ctx.resume).not.toHaveBeenCalled();
  });

  it('a rejected resume() is swallowed', async () => {
    const t = setup();
    t.ctx.resume.mockRejectedValue(new Error('not allowed'));
    t.set('suspended');
    await Promise.resolve();
    expect(t.onGap).not.toHaveBeenCalled();
  });

  it('reports a gap still open when capture stops, and nothing after dispose', () => {
    const t = setup();
    t.set('suspended'); t.advance(5_000); t.stop();
    expect(t.onGap).toHaveBeenCalledExactlyOnceWith(5_000);
    t.set('running');
    expect(t.onGap).toHaveBeenCalledTimes(1);
  });
});
