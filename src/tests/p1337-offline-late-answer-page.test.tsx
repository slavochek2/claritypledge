/**
 * P1337 item 2, end to end on a page: a list page on a slow network shows its saved copy with
 * "Saved copy · updating…", then its own late answer replaces the copy and the strip disappears —
 * with no second request. (The founder saw "Offline · saved copy from 40 min ago" stay up while
 * the internet worked.)
 */
import { it, expect, beforeEach } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OfflineStatusProvider } from '@/app/contexts/offline-status-context';
import { OfflineStrip } from '@/app/components/offline/offline-strip';
import { useOfflineReadState } from '@/app/hooks/use-offline-read-state';
import { readThrough, clearOfflineReadCache, MemoryEntryStore, _setOfflineEntryStoreForTesting } from '@/lib/offline-read-cache';
import { _resetNetworkOutcomeForTesting } from '@/lib/network-outcome';

let fetches = 0;

function SlowListPage() {
  const { apply, live } = useOfflineReadState();
  const [rows, setRows] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const read = await readThrough(
        'story',
        'list',
        () => {
          fetches += 1;
          return new Promise<string[]>((res) => setTimeout(() => res(['fresh row']), 600));
        },
        {
          deadlineMs: 30,
          onLate: (late) => {
            if (cancelled) return;
            live();
            setRows(late ?? []);
          },
        },
      );
      if (cancelled) return;
      setRows(apply(read) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, live]);
  return <ul>{rows.map((r) => <li key={r}>{r}</li>)}</ul>;
}

beforeEach(async () => {
  await clearOfflineReadCache();
  _setOfflineEntryStoreForTesting(new MemoryEntryStore());
  _resetNetworkOutcomeForTesting();
  localStorage.clear();
  fetches = 0;
});

it('the saved copy shows as "updating", then the late answer replaces it and the strip goes', async () => {
  await readThrough('story', 'list', async () => ['saved row']);
  await new Promise((res) => setTimeout(res, 20));

  render(
    <MemoryRouter>
      <OfflineStatusProvider>
        <OfflineStrip />
        <SlowListPage />
      </OfflineStatusProvider>
    </MemoryRouter>,
  );

  await screen.findByText('saved row');
  await waitFor(() => expect(screen.getByTestId('offline-strip').textContent).toBe('Saved copy · updating…'));

  await screen.findByText('fresh row', {}, { timeout: 3000 });
  await waitFor(() => expect(screen.queryByTestId('offline-strip')).toBeNull());
  expect(screen.queryByText('saved row')).toBeNull();
  expect(fetches).toBe(1);
});
