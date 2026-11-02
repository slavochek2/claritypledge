/**
 * @file p1536-review4-units.test.tsx
 * @description P1536 step 4 review round: (5) the mirror agent's line does not blink out between a pending Clone's first Send and the draft's first read, and the base root card does not
 * show meanwhile; (6) the filled main action IS the design system's default Button, and the mirror's name reads the same everywhere (an empty title is no name); the one secondary colour
 * set is one constant for the pill and the chat list's round +.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import type { ChatSummary } from '@/app/data/chat-service';
import { canvasListParts } from '@/app/pages/chat/canvas-list-parts';
import { MirrorAgentLine, MirrorPanelTitle } from '@/app/pages/canvas/mirror-panel-title';
import { CANVAS_MAIN_ACTION, CANVAS_SECONDARY_PILL, SECONDARY_PILL_COLOURS } from '@/app/components/canvas/canvas-pill-styles';
import { readFileSync } from 'node:fs';

afterEach(() => cleanup());

const mirror = (title: string | null) => ({ title, ownerFirstName: 'Ana' }) as unknown as ChatSummary;
const tokens = (cls: string) => cls.split(/\s+/).filter(Boolean);

describe('5: the agent line before the draft thread has read', () => {
  it('a pending Clone whose first Send just made the draft: the thread is not read yet (no live draft), the workspace says the base is v1: the line shows, the root card is hidden', () => {
    const parts = canvasListParts({ canvasRoot: false, rootId: 'root-1', workspace: { baseSeq: 1 }, mirror: mirror('Zed'), canvas: null, canvasOn: null });
    render(<>{parts.lead}</>);
    expect(screen.getByTestId('agent-line')).toHaveTextContent('This is a new draft from v1.');
    expect(parts.hideId).toBe('root-1');
  });
  it('the same once the thread HAS read (live): unchanged', () => {
    const canvas = { draft: { baseVersionId: 'ver-1', state: 'open' } } as never;
    const parts = canvasListParts({ canvasRoot: true, rootId: 'root-1', workspace: { baseSeq: 1 }, mirror: mirror('Zed'), canvas, canvasOn: true });
    render(<>{parts.lead}</>);
    expect(screen.getByTestId('agent-line')).toBeInTheDocument();
    expect(parts.hideId).toBe('root-1');
  });
  it('CONTROLS: a new canvas (no base) shows the opener only once read, never an agent line; outside the workspace the base root card stays; drafting known off shows nothing', () => {
    expect(canvasListParts({ canvasRoot: false, rootId: 'r', workspace: { baseSeq: null }, mirror: mirror('Zed'), canvas: null, canvasOn: null }).lead).toBeUndefined();
    const newCanvas = { draft: { baseVersionId: null, state: 'open' } } as never;
    render(<>{canvasListParts({ canvasRoot: true, rootId: 'r', workspace: { baseSeq: null }, mirror: mirror('Zed'), canvas: newCanvas, canvasOn: true }).lead}</>);
    expect(screen.queryByTestId('agent-line')).toBeNull();
    const closed = { draft: { baseVersionId: 'ver-1', state: 'published' } } as never;
    expect(canvasListParts({ canvasRoot: true, rootId: 'r', workspace: undefined, mirror: mirror('Zed'), canvas: closed, canvasOn: true }).hideId).toBeNull();
    expect(canvasListParts({ canvasRoot: true, rootId: 'r', workspace: { baseSeq: 1 }, mirror: mirror('Zed'), canvas: null, canvasOn: false })).toMatchObject({ lead: undefined, hideId: null });
  });
});

describe('6: the main action is the design system\'s Button; the mirror\'s name reads the same everywhere', () => {
  it('CANVAS_MAIN_ACTION carries every class the default <Button> renders (one definition of the filled blue), plus the bar\'s 44px height', () => {
    const { getByRole } = render(<Button>x</Button>);
    const button = tokens(getByRole('button').className);
    for (const t of button.filter(t => !/^h-9$|^px-4$|^py-2$|^rounded-md$/.test(t))) expect(tokens(CANVAS_MAIN_ACTION), t).toContain(t);
    expect(tokens(CANVAS_MAIN_ACTION)).toContain('h-11');
    expect(tokens(CANVAS_MAIN_ACTION)).not.toContain('h-9');
  });
  it('an EMPTY title is no name: the header and the line both read "Your mirror agent" (the header already did; the line kept an empty string)', () => {
    render(<><MirrorPanelTitle mirror={mirror('')} /><MirrorAgentLine mirror={mirror('')} seq={1} /></>);
    expect(screen.getByTestId('agent-line')).toHaveTextContent('Your mirror agent');
    expect(screen.getByTestId('agent-line').querySelector('p')?.textContent).toBe('Your mirror agent');
  });
  it('the pill and the chat list\'s round + share ONE set of secondary colours', () => {
    for (const t of tokens(SECONDARY_PILL_COLOURS)) expect(tokens(CANVAS_SECONDARY_PILL)).toContain(t);
    // the hover tint only where a real pointer exists (chat-kit's HOVER rule), never an unguarded hover:; and no dark variants (the pill has none)
    expect(tokens(SECONDARY_PILL_COLOURS)).toContain('[@media(hover:hover)]:hover:bg-blue-100');
    expect(tokens(SECONDARY_PILL_COLOURS).filter(t => /^hover:/.test(t))).toEqual([]);
    expect(SECONDARY_PILL_COLOURS).not.toMatch(/dark:/);
    const list = readFileSync(`${process.cwd()}/src/app/pages/chat/ChatList.tsx`, 'utf8');
    const kit = readFileSync(`${process.cwd()}/src/app/pages/chat/chat-kit.tsx`, 'utf8');
    expect(list).toContain('SECONDARY_PILL_COLOURS');
    expect(kit).not.toContain('SECONDARY_ROUND_COLOURS'); // the copy is gone
    expect(list + kit).not.toMatch(/border-blue-600 bg-blue-50 text-blue-700/); // and no hand-typed second copy
  });
});
