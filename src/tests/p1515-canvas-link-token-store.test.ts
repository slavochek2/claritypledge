/**
 * @file p1515-canvas-link-token-store.test.ts
 * @description P1515: the tab-scoped store for a canvas link token and its auth-lifecycle reset.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearLinkTokens, clearLinkTokensExceptThisLoad, readLinkToken, storeLinkToken, useClearLinkTokensOnAuthChange } from '@/lib/canvas-link-token';

beforeEach(() => { sessionStorage.clear(); clearLinkTokens(); });

describe('the store', () => {
  it('keys by owner handle and canvas name, case-insensitively; another canvas has none', () => {
    storeLinkToken('Ana', 'Sales', 'tok');
    expect(readLinkToken('ana', 'sales')).toBe('tok');
    expect(readLinkToken('ana', 'other')).toBeUndefined();
    expect(readLinkToken('bob', 'sales')).toBeUndefined();
    clearLinkTokens();
    expect(readLinkToken('ana', 'sales')).toBeUndefined();
  });
});

describe('readLinkToken prefers this load\'s own copy over storage', () => {
  it('storage holds an OLD token, the new write fails (full) but reads still work: the new token (memory) is returned', () => {
    sessionStorage.setItem('canvas-link:ana/sales', 'old-token');
    const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage')!;
    const fullStorage = {
      getItem: (k: string) => (k === 'canvas-link:ana/sales' ? 'old-token' : null),
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
      removeItem: () => {}, key: () => null, length: 0, clear: () => {},
    };
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => fullStorage });
    try {
      storeLinkToken('ana', 'sales', 'new-token');
      expect(readLinkToken('ana', 'sales')).toBe('new-token');
      expect(readLinkToken('ana', 'other')).toBeUndefined(); // CONTROL: a canvas with nothing in either place
    } finally {
      Object.defineProperty(window, 'sessionStorage', real);
    }
    expect(readLinkToken('ana', 'sales')).toBe('new-token'); // memory still wins once storage works again
  });

  it('CONTROL: with no copy in this load, a token left in storage by an earlier load is still read', () => {
    sessionStorage.setItem('canvas-link:ana/sales', 'old-token');
    expect(readLinkToken('ana', 'sales')).toBe('old-token');
  });
});

describe('clearLinkTokensExceptThisLoad', () => {
  it('keeps what this load stored (storage and memory) and removes everything an earlier load left', () => {
    sessionStorage.setItem('canvas-link:bob/plan', 'older');
    sessionStorage.setItem('canvas-link:cy/deck', 'older-too');
    storeLinkToken('ana', 'sales', 'now');
    clearLinkTokensExceptThisLoad();
    expect(readLinkToken('ana', 'sales')).toBe('now');
    expect(readLinkToken('bob', 'plan')).toBeUndefined();
    expect(readLinkToken('cy', 'deck')).toBeUndefined();
    expect(sessionStorage.getItem('canvas-link:ana/sales')).toBe('now');
    expect(Object.keys(sessionStorage).filter(k => k.startsWith('canvas-link:'))).toEqual(['canvas-link:ana/sales']);
  });

  it('the in-memory copy is filtered the same way (an entry not written by this load is dropped even when storage cannot be touched)', () => {
    const w = window as unknown as { __canvasLinkTokenFallback?: Record<string, string>; __canvasLinkTokenLoadKeys?: string[] };
    w.__canvasLinkTokenFallback = { 'canvas-link:bob/plan': 'older', 'canvas-link:ana/sales': 'now' };
    w.__canvasLinkTokenLoadKeys = ['canvas-link:ana/sales'];
    clearLinkTokensExceptThisLoad();
    expect(w.__canvasLinkTokenFallback).toEqual({ 'canvas-link:ana/sales': 'now' });
  });

  it('CONTROLS: with nothing from this load it clears everything; the full clear forgets what counts as this load\'s', () => {
    sessionStorage.setItem('canvas-link:bob/plan', 'older');
    clearLinkTokensExceptThisLoad();
    expect(readLinkToken('bob', 'plan')).toBeUndefined();
    storeLinkToken('ana', 'sales', 'now');
    clearLinkTokens();
    sessionStorage.setItem('canvas-link:ana/sales', 'left-later');
    clearLinkTokensExceptThisLoad();
    expect(readLinkToken('ana', 'sales')).toBeUndefined();
  });
});

describe('useClearLinkTokensOnAuthChange', () => {
  const run = (from: string | undefined, to: string | undefined) => {
    storeLinkToken('ana', 'sales', 'tok');
    const hook = renderHook(({ viewer }) => useClearLinkTokensOnAuthChange(viewer), { initialProps: { viewer: from } });
    hook.rerender({ viewer: to });
    return readLinkToken('ana', 'sales');
  };

  it('sign-out and a change of person clear the token', () => {
    expect(run('u1', undefined)).toBeUndefined();
    expect(run('u1', 'u2')).toBeUndefined();
  });

  it('CONTROLS: an anonymous visitor who signs in keeps it, and so does no change at all', () => {
    expect(run(undefined, 'u1')).toBe('tok');
    expect(run('u1', 'u1')).toBe('tok');
    expect(run(undefined, undefined)).toBe('tok');
  });
});

describe('the reset is mounted app-wide, next to the list-return-cache reset (not in the canvas page)', () => {
  it('App.tsx calls it from the auth-lifecycle component with the signed-in person\'s id', () => {
    const src = readFileSync(join(__dirname, '../App.tsx'), 'utf8');
    const component = src.slice(src.indexOf('function ListReturnCacheAuthReset()'));
    const body = component.slice(0, component.indexOf('\n}\n') + 3);
    expect(body).toContain('useClearListReturnCacheOnAuthChange(session?.user?.id);');
    expect(body).toContain('useClearLinkTokensOnAuthChange(session?.user?.id);');
    expect(src).toMatch(/import \{ useClearLinkTokensOnAuthChange \} from "@\/lib\/canvas-link-token";/);
  });
});
