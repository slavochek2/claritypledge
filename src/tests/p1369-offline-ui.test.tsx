/**
 * P1369 — the offline UI: the strip, the needs-connection body, the session bar's offline state,
 * and the age copy. Colours and copy per the spec's UI Contract (prototype variant C).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OfflineStatusProvider, useOfflinePageReport } from '@/app/contexts/offline-status-context';
import { OfflineStrip } from '@/app/components/offline/offline-strip';
import { NeedsConnection } from '@/app/components/offline/needs-connection';
import { SessionBar } from '@/app/components/session/session-bar';
import { formatSeenAge } from '@/lib/format-seen-age';
import { recordNetworkFailure, recordNetworkSuccess, _resetNetworkOutcomeForTesting } from '@/lib/network-outcome';

function CachedPage({ storedAt }: { storedAt: number }) {
  useOfflinePageReport({ kind: 'cached', storedAt });
  return <p>story body</p>;
}

function ui(children: React.ReactNode) {
  return render(
    <MemoryRouter>
      <OfflineStatusProvider>
        <OfflineStrip />
        {children}
      </OfflineStatusProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  _resetNetworkOutcomeForTesting();
});

describe('offline strip', () => {
  it('online, nothing reported: no strip', () => {
    ui(<p>live page</p>);
    expect(screen.queryByTestId('offline-strip')).toBeNull();
  });

  it('a page rendered from cache: "Offline · saved copy from {age}", dark, 28px', () => {
    ui(<CachedPage storedAt={Date.now() - 2 * 3600_000} />);
    const strip = screen.getByTestId('offline-strip');
    expect(strip.textContent).toBe('Offline · saved copy from 2h ago');
    expect(strip.className).toContain('bg-slate-800');
    expect(strip.className).toContain('text-white');
    expect(strip.innerHTML).toContain('h-7');
    expect(strip.innerHTML).toContain('text-xs');
  });

  it('two cached reports: the OLDEST age is shown', () => {
    ui(
      <>
        <CachedPage storedAt={Date.now() - 5 * 60_000} />
        <CachedPage storedAt={Date.now() - 3 * 86400_000} />
      </>,
    );
    expect(screen.getByTestId('offline-strip').textContent).toBe('Offline · saved copy from 3 days ago');
  });

  it('shows even when navigator says online (captive portal): the page report decides', () => {
    expect(navigator.onLine).toBe(true);
    ui(<CachedPage storedAt={Date.now()} />);
    expect(screen.getByTestId('offline-strip').textContent).toMatch(/saved copy/);
  });

  it('needs-connection body: strip says just "Offline"', () => {
    ui(<NeedsConnection />);
    expect(screen.getByTestId('offline-strip').textContent).toBe('Offline');
    expect(screen.getByText("You're offline")).toBeTruthy();
    expect(screen.getByText("This page hasn't been saved yet.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to home' }).getAttribute('href')).toBe('/');
  });

  it('a failed Supabase request with no page report: "Offline"; cleared by the next success', () => {
    ui(<p>any page</p>);
    act(() => recordNetworkFailure());
    expect(screen.getByTestId('offline-strip').textContent).toBe('Offline');
    act(() => recordNetworkSuccess());
    expect(screen.queryByTestId('offline-strip')).toBeNull();
  });
});

describe('session bar offline state', () => {
  it('grey, title + one line, and NO buttons', () => {
    render(<SessionBar tone="offline" ariaLabel="Active session" text="Session paused while offline" detail="Rejoin comes back when you reconnect." />);
    const bar = screen.getByRole('status', { name: 'Active session' });
    expect(bar.className).toContain('bg-slate-100');
    expect(bar.className).toContain('border-slate-200');
    expect(screen.getByText('Session paused while offline').className).toContain('text-slate-800');
    expect(screen.getByText('Rejoin comes back when you reconnect.').className).toContain('text-xs');
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});

describe('age copy', () => {
  const now = 1_000_000_000_000;
  it.each([
    [10_000, 'just now'],
    [5 * 60_000, '5 min ago'],
    [2 * 3600_000, '2h ago'],
    [26 * 3600_000, 'yesterday'],
    [3 * 86400_000, '3 days ago'],
    [8 * 86400_000, '1 week ago'],
    [15 * 86400_000, '2 weeks ago'],
  ])('%i ms → %s', (ago, text) => {
    expect(formatSeenAge(now - ago, now)).toBe(text);
  });
});

describe('the yellow OfflineBanner is gone', () => {
  it('file removed and no yellow in the offline UI', () => {
    expect(existsSync(resolve(process.cwd(), 'src/app/components/offline-banner.tsx'))).toBe(false);
    for (const f of [
      'src/app/components/offline/offline-strip.tsx',
      'src/app/components/offline/needs-connection.tsx',
      'src/app/components/session/session-bar.tsx',
    ]) {
      expect(readFileSync(resolve(process.cwd(), f), 'utf-8')).not.toMatch(/(bg|text|border|ring|fill)-(yellow|amber)-/);
    }
  });
});
