/**
 * P1539: the first React loader continues the index.html splash (starts fully visible) while #root is still
 * empty, and starts a fresh run (elapsed 0, normal 300ms anti-flash) when there was no splash.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

async function loadChain() {
  vi.resetModules();
  return import('@/components/ui/loader-chain');
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('P1539 splash hand-off', () => {
  it('seeds the first loader as already running while the splash is up and #root is empty', async () => {
    document.body.innerHTML = '<div id="root"></div><div id="app-shell-loader"></div>';
    const { useLoaderChain } = await loadChain();
    const { result } = renderHook(() => useLoaderChain());
    expect(result.current).toBeGreaterThanOrEqual(1200);
  });

  it('does not seed when the page has no splash', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const { useLoaderChain } = await loadChain();
    const { result } = renderHook(() => useLoaderChain());
    expect(result.current).toBe(0);
  });

  it('still seeds when a layout already committed to #root before the loader renders (Argon review)', async () => {
    document.body.innerHTML = '<div id="root"><div>layout</div></div><div id="app-shell-loader"></div>';
    const { useLoaderChain } = await loadChain();
    const { result } = renderHook(() => useLoaderChain());
    expect(result.current).toBeGreaterThanOrEqual(1200);
  });

  it('seeds only the first loader: a later, separate run starts fresh', async () => {
    document.body.innerHTML = '<div id="root"></div><div id="app-shell-loader"></div>';
    const { useLoaderChain } = await loadChain();
    const first = renderHook(() => useLoaderChain());
    first.unmount();
    await new Promise((r) => setTimeout(r, 200));
    const { result } = renderHook(() => useLoaderChain());
    expect(result.current).toBe(0);
  });

  it('does not seed after the boot window', async () => {
    document.body.innerHTML = '<div id="root"></div><div id="app-shell-loader"></div>';
    const { useLoaderChain } = await loadChain();
    const now = performance.now();
    const spy = vi.spyOn(performance, 'now').mockReturnValue(now + 5000);
    const { result } = renderHook(() => useLoaderChain());
    spy.mockRestore();
    expect(result.current).toBe(0);
  });
});
