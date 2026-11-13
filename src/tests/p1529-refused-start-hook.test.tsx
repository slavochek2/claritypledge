/** P1529: a refusal ends only with a different queued run or a loaded run confirmed not queued; a transient null run (the read resets) keeps it. */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRefusedStart } from '@/app/pages/chat/use-refused-start';
import { clearStartRefusal, recordStartRefusal, startRefusalOf } from '@/app/data/canvas-start-refusals';

const run = (id: string, state: string) => ({ id, state }) as never;
type P = { run: ReturnType<typeof run> | null };
const mount = (p: P) => renderHook((q: P) => useRefusedStart(q.run, 60_000, true, async () => undefined), { initialProps: p });
afterEach(() => { clearStartRefusal('rq'); clearStartRefusal('rq2'); vi.clearAllMocks(); });

describe('useRefusedStart', () => {
  it('a transient null run (retry or reload resets the read) keeps the refusal, and it shows again with the run', () => {
    recordStartRefusal('rq', 'FAILED');
    const view = mount({ run: run('rq', 'queued') });
    expect(view.result.current).toBe('FAILED');
    view.rerender({ run: null });
    expect(startRefusalOf('rq')).toBe('FAILED'); // not cleared: the restart must still see it
    view.rerender({ run: run('rq', 'queued') });
    expect(view.result.current).toBe('FAILED');
  });
  it('a loaded run that is no longer queued ends the refusal', () => {
    recordStartRefusal('rq', 'FAILED');
    const view = mount({ run: run('rq', 'queued') });
    view.rerender({ run: run('rq', 'failed') });
    expect(startRefusalOf('rq')).toBeNull();
  });
  it('a different queued run ends the old run\'s refusal', () => {
    recordStartRefusal('rq', 'FAILED');
    const view = mount({ run: run('rq', 'queued') });
    view.rerender({ run: run('rq2', 'queued') });
    expect(startRefusalOf('rq')).toBeNull();
  });
});
