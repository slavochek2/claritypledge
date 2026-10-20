/**
 * @file p1512-shell-topbar.test.tsx
 * @description P1512: the signed-in shell's top bar. FocusHeader (Back) and a page's actions render INTO
 * the bar's slots through a portal when the page is inside the shell, and exactly as before everywhere
 * else (signed out, rooms, tests). One position for every Back, with no per-page edit.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { FocusHeader } from '@/app/components/layout/focus-header';
import {
  ShellBarActions,
  ShellTopBar,
  ShellTopBarProvider,
} from '@/app/components/layout/app-shell/shell-top-bar';

function Here() {
  const loc = useLocation();
  return <p data-testid="path">{loc.pathname}</p>;
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main data-testid="page-body">
      {children}
      <Here />
    </main>
  );
}

function renderInShell(entries: string[], page: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <ShellTopBarProvider enabled>
        <ShellTopBar />
        <Routes>
          <Route path="/detail" element={<Page>{page}</Page>} />
          <Route path="*" element={<Here />} />
        </Routes>
      </ShellTopBarProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('P1512 shell top bar: Back', () => {
  it('inside the shell, FocusHeader lands in the bar, not in the page body', () => {
    renderInShell(['/feed', '/detail'], <FocusHeader fallback="/feed" />);
    const bar = document.querySelector('[data-shell-top-bar]') as HTMLElement;
    const back = screen.getByRole('button', { name: 'Go back' });
    expect(bar).toContainElement(back);
    expect(within(screen.getByTestId('page-body')).queryByRole('button', { name: 'Go back' })).toBeNull();
    // LEFT slot, so every page's Back sits at the same x.
    expect(bar.firstElementChild).toContainElement(back);
    expect(back.textContent).toBe('Back');
  });

  it('when Back will POP it says just "Back" (aria "Go back"), even if the page knows its parent', () => {
    // An earlier entry exists: Back returns to where the reader came from, so "Groups" would be untrue.
    renderInShell(['/home/c/abc', '/detail'], <FocusHeader fallback="/groups" parentName="Groups" />);
    const back = screen.getByRole('button', { name: 'Go back' });
    expect(back.textContent).toBe('Back');
    fireEvent.click(back);
    // chat -> group -> Back goes back to the chat, not the fixed /groups.
    expect(screen.getByTestId('path').textContent).toBe('/home/c/abc');
  });

  it('on a cold arrival (it will take the fallback) it names the parent: "← Groups"', () => {
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 });
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    renderInShell(['/detail'], <FocusHeader fallback="/groups" parentName="Groups" />);
    const back = screen.getByRole('button', { name: 'Back to Groups' });
    expect(back.textContent).toBe('Groups');
    fireEvent.click(back);
    expect(screen.getByTestId('path').textContent).toBe('/groups');
  });

  it('a page with no parentName says "Back" in both cases', () => {
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 });
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    renderInShell(['/detail'], <FocusHeader fallback="/groups" />);
    expect(screen.getByRole('button', { name: 'Go back' }).textContent).toBe('Back');
  });

  it('keeps useGoBack: a cold arrival goes to the fallback', () => {
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 });
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    renderInShell(['/detail'], <FocusHeader fallback="/groups" />);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByTestId('path').textContent).toBe('/groups');
  });

  it('outside the shell it renders in place, exactly as before', () => {
    render(
      <MemoryRouter initialEntries={['/detail']}>
        <Page>
          <FocusHeader fallback="/feed" />
        </Page>
      </MemoryRouter>,
    );
    expect(within(screen.getByTestId('page-body')).getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    expect(document.querySelector('[data-shell-top-bar]')).toBeNull();
  });

  it('a provider that is not enabled (signed out) also renders in place', () => {
    render(
      <MemoryRouter initialEntries={['/detail']}>
        <ShellTopBarProvider enabled={false}>
          <Page>
            <FocusHeader fallback="/feed" />
          </Page>
        </ShellTopBarProvider>
      </MemoryRouter>,
    );
    expect(within(screen.getByTestId('page-body')).getByRole('button', { name: 'Go back' })).toBeInTheDocument();
  });

  it('the compact (room) Back is never moved into the bar', () => {
    renderInShell(['/detail'], <FocusHeader compact fallback="/feed" />);
    expect(within(screen.getByTestId('page-body')).getByTestId('room-back')).toBeInTheDocument();
  });

  it('a page with no Back leaves the left slot empty', () => {
    renderInShell(['/detail'], <h1>Feed</h1>);
    const bar = document.querySelector('[data-shell-top-bar]') as HTMLElement;
    expect(bar.firstElementChild?.childElementCount).toBe(0);
  });
});

describe('P1512 shell top bar: page actions slot', () => {
  it('is empty unless a page supplies actions, and a supplied action lands on the right', () => {
    const { unmount } = renderInShell(['/detail'], <h1>Feed</h1>);
    const bar = document.querySelector('[data-shell-top-bar]') as HTMLElement;
    expect(bar.lastElementChild?.childElementCount).toBe(0);
    unmount();

    renderInShell(
      ['/detail'],
      <ShellBarActions>
        <button type="button">Share</button>
      </ShellBarActions>,
    );
    const bar2 = document.querySelector('[data-shell-top-bar]') as HTMLElement;
    expect(bar2.lastElementChild).toContainElement(screen.getByRole('button', { name: 'Share' }));
  });

  it('outside the shell the actions render in place', () => {
    render(
      <MemoryRouter>
        <Page>
          <ShellBarActions>
            <button type="button">Share</button>
          </ShellBarActions>
        </Page>
      </MemoryRouter>,
    );
    expect(within(screen.getByTestId('page-body')).getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });
});
