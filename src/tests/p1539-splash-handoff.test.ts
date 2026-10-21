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

  it('does not seed once #root already has content', async () => {
    document.body.innerHTML = '<div id="root"><p>app</p></div><div id="app-shell-loader"></div>';
    const { useLoaderChain } = await loadChain();
    const { result } = renderHook(() => useLoaderChain());
    expect(result.current).toBe(0);
  });
});
