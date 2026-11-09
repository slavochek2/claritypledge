/**
 * @file p1621-panel-focus.test.tsx
 * @description P1621: closing the point panel never drops focus to the page. A point opened from the address whose card is not drawn in the collapsed box has no card and no
 * Open button to return to, so focus goes to its box's title.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PointPanel } from '@/app/components/canvas/canvas-point-panel';

describe('P1621 PointPanel closing', () => {
  it('with no card for the point on the page, focus goes to the box title', () => {
    // The box's title lives on the page behind the panel, which outlives it.
    const title = document.createElement('button');
    title.setAttribute('data-testid', 'canvas-box-title-canvas:problem');
    document.body.appendChild(title);
    const { unmount } = render(
      <MemoryRouter>
        <PointPanel onClose={() => undefined} label="Point" viewKey="hidden-point" step={{ box: 'Problem', boxTag: 'canvas:problem' }}>
          <p>body</p>
        </PointPanel>
      </MemoryRouter>,
    );
    unmount();
    expect(document.activeElement).toBe(title);
    title.remove();
  });

  it('a box list (See all) returns focus to what opened it, not the title', () => {
    const title = document.createElement('button');
    title.setAttribute('data-testid', 'canvas-box-title-canvas:problem');
    const opener = document.createElement('button');
    document.body.append(title, opener);
    opener.focus();
    const { unmount } = render(
      <MemoryRouter>
        <PointPanel onClose={() => undefined} label="Problem" viewKey="box:canvas:problem" step={{ box: 'Problem', boxTag: 'canvas:problem' }}>
          <p>list</p>
        </PointPanel>
      </MemoryRouter>,
    );
    unmount();
    expect(document.activeElement).toBe(opener);
    title.remove();
    opener.remove();
  });

  it('a box list opened from the address (no opener) returns focus to its box title', () => {
    const title = document.createElement('button');
    title.setAttribute('data-testid', 'canvas-box-title-canvas:problem');
    document.body.appendChild(title);
    (document.activeElement as HTMLElement | null)?.blur?.();
    const { unmount } = render(
      <MemoryRouter>
        <PointPanel onClose={() => undefined} label="Problem" viewKey="box:canvas:problem" step={{ box: 'Problem', boxTag: 'canvas:problem' }}>
          <p>list</p>
        </PointPanel>
      </MemoryRouter>,
    );
    unmount();
    expect(document.activeElement).toBe(title);
    title.remove();
  });
});
