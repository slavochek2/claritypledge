/**
 * @file p1536-workspace-fixture.test.tsx
 * @description P1536 S3 review (visual findings) pinned on the /tree/_gate/canvas-workspace fixture, which renders the real frame,
 * header, grid and composer:
 *  - V3 (W8: moved) the canvas name is in the owner's bar, which starts the frame; the canvas pane starts with the grid, no title, byline or "Clarity Canvas" label
 *  - V4/V5 the chat-composing phase opens on Chat with text typed in, and Send is visible
 *  - V6/V7 "Changed" shows on draft views that changed (canvas, busy, chat-composing) and never on published or no-changes
 *  - V1/V2 the fixture's stand-in for the shell bar is exactly the 3.5rem the frame subtracts; the bar is one height
 *  - V9 a divider between the columns from 1280px
 */
import { cleanup, render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { GateFixture } from '@/app/tree/_gate/canvas-workspace/GateFixture';

const at = (phase: string) => {
  localStorage.clear();
  return render(<MemoryRouter initialEntries={[`/tree/_gate/canvas-workspace?phase=${phase}`]}><GateFixture /></MemoryRouter>).container;
};
afterEach(() => cleanup());

describe('the workspace fixture shows what the app shows', () => {
  it.each(['canvas', 'chat-composing', 'busy', 'published', 'nothing-to-publish'])('%s: the canvas name is in the owner\'s bar (W8, supersedes V3); the canvas pane carries no title, byline or "Clarity Canvas" label', (phase) => {
    const view = within(at(phase));
    expect(within(view.getByTestId('workspace-bar')).getByTestId('canvas-title')).toHaveTextContent('Example canvas');
    const pane = view.getByTestId('workspace-canvas-pane');
    expect(within(pane).queryByTestId('canvas-title')).toBeNull();
    expect(within(pane).queryByTestId('canvas-byline')).toBeNull();
    expect(pane).not.toHaveTextContent('Clarity Canvas');
  });

  it.each([['canvas', 1], ['chat-composing', 1], ['busy', 1], ['published', 0], ['nothing-to-publish', 0]])('%s: %i "Changed" mark(s); a draft with no changes, and a published version, have none (V6, V7)', (phase, marks) => {
    expect(within(at(phase)).queryAllByTestId('canvas-box-changed')).toHaveLength(marks);
  });

  it('nothing-to-publish says "Nothing to publish yet" and published (a version picked from the draft) has Share in the spot, neither with a mark (3c X7/X4, premise change: "No changes yet" and "Published · v3" are gone)', () => {
    expect(within(at('nothing-to-publish')).getByTestId('publish-spot-status')).toHaveTextContent('Nothing to publish yet');
    cleanup();
    const published = within(at('published'));
    expect(published.getByTestId('publish-spot')).toHaveAttribute('data-state', 'share');
    expect(published.queryByTestId('publish-spot-status')).toBeNull();
  });

  it('chat-composing opens on Chat with text typed in, so Send is visible (V4, V5); the other phases open on Canvas with the mic', () => {
    const chat = within(at('chat-composing'));
    expect(chat.getByTestId('workspace-chat-pane')).toHaveAttribute('data-active', 'true');
    expect((chat.getByRole('textbox') as HTMLTextAreaElement).value).toMatch(/Make the problem sharper/);
    expect(chat.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    cleanup();
    const canvas = within(at('canvas'));
    expect(canvas.getByTestId('workspace-canvas-pane')).toHaveAttribute('data-active', 'true');
    expect(canvas.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('V1/V2: the stand-in shell strip is 3.5rem (h-14), the frame is the rest of the screen, and the bar is never squeezed, with nothing above its content (W8)', () => {
    const c = at('canvas');
    expect(within(c).getByTestId('gate-shell-stand-in').className).toContain('h-14');
    const frame = within(c).getByTestId('canvas-workspace');
    expect(frame.className).toContain('h-[calc(100dvh-3.5rem)]');
    const bar = within(c).getByTestId('workspace-bar');
    expect(frame.firstElementChild).toBe(bar);
    expect(bar.className).toContain('shrink-0'); // W8: as tall as its rows (one line from 1280px, two below), never squeezed
    expect(bar.className).not.toMatch(/\b(?:pt|mt)-/); // nothing above its content
  });

  it('V9: a divider between the canvas and the chat from 1280px', () => {
    expect(within(at('canvas')).getByTestId('workspace-chat-pane').className).toContain('xl:border-l');
  });
});
