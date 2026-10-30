/**
 * P1595: the slow-load notice under the mark follows the mark — on the content column inside the shell, across the
 * viewport outside it. Rendered past the page-wait deadline (PAGE_WAIT_DEADLINE_MS, 15s) with fake timers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ClarityBootLoader, ClarityContentLoader } from './clarity-loader';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const notice = () => screen.getByText('This is taking longer than usual.').closest('[role="status"]') as HTMLElement;

describe('the slow-load notice', () => {
  it('inside the shell (content loader): offset by the sidebar width, like the mark', async () => {
    render(<ClarityContentLoader />);
    expect(screen.queryByText('This is taking longer than usual.')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
    expect(notice().className).toContain('left-[var(--shell-sidebar-w,0px)]');
    expect(notice().className).not.toMatch(/(^|\s)left-0(\s|$)/);
  });

  it('outside the shell (boot splash): across the whole viewport', async () => {
    render(<ClarityBootLoader />);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
    expect(notice().className).toMatch(/(^|\s)left-0(\s|$)/);
    expect(notice().className).not.toContain('--shell-sidebar-w');
  });
});
