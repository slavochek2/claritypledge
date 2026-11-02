/**
 * @file p1536-walk6-bar-phone.test.tsx
 * @description P1536 walkthrough 6, items 1 and 2 (classes only: jsdom has no layout, the browser walk proves the pixels).
 *  1. Below 1280px, while the name is being edited, the input lies over the rest of row 1, from after the back button to the row's right edge (3c X13,
 *     premise change: the Publish spot moved to row 2); the picker and tag are not squeezed to make room. From 1280px nothing changes.
 *  2. The back button and row 1 tighten below 640px (not only below 360px), so the name keeps its room on every phone.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

vi.mock('@/app/components/canvas/canvas-version-switcher', () => ({ CanvasVersionSlot: () => <span data-testid="picker">v1</span> }));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => null }));
vi.mock('@/app/components/canvas/canvas-clone-button', () => ({ CloneButton: () => null }));
vi.mock('@/app/components/canvas/canvas-workspace-context', () => ({ useCanvasWorkspace: () => ({ cloneSeq: null }), CANVAS_WORKSPACE_WIDE_QUERY: '(min-width: 1280px)' }));

import { CanvasOwnerBar } from '@/app/components/canvas/canvas-owner-bar';

afterEach(() => cleanup());

const draft = { isOwner: true, version: 'd', versions: [], draft: { version: 'd', baseSeq: 1, runCount: 1, changedBoxes: [] }, publishedNone: false } as unknown as CanvasReady;
const cls = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);
const OVERLAY = ['max-xl:absolute', 'max-xl:inset-y-0', 'max-xl:my-auto', 'max-xl:left-10', 'max-sm:left-8', 'max-xl:right-0', 'max-xl:z-10'];

const bar = () => render(
  <CanvasOwnerBar ready={draft} handle="ana" projectTag="canvas" title="Acme Bakery Plan" canRename onRename={vi.fn()} onPick={vi.fn()} onChanged={vi.fn()} onBack={vi.fn()} active={false} view="canvas" onView={vi.fn()} spotState={{ kind: 'nothing' }} onPublish={vi.fn()} />,
);

describe('1: the rename input lies over row 1 below 1280px', () => {
  it('while editing: the input carries the overlay classes and an opaque background, row 1 is the positioned parent, the picker, tag and spot are still there', () => {
    bar();
    fireEvent.click(screen.getByTestId('canvas-rename'));
    const input = screen.getByTestId('canvas-title-input');
    expect(cls(input)).toEqual(expect.arrayContaining(OVERLAY));
    expect(cls(input)).toContain('bg-background');
    expect(cls(screen.getByTestId('workspace-bar-row1'))).toContain('max-xl:relative');
    expect(screen.getByTestId('workspace-bar-row1').contains(input)).toBe(true);
    for (const id of ['picker', 'publish-spot', 'canvas-state']) expect(screen.getByTestId(id)).toBeInTheDocument();
    expect(cls(screen.getByTestId('publish-spot'))).toContain('shrink-0'); // the spot's box is not squeezed
  });

  it('CONTROL: not editing, no overlay class is on the name or anything in row 1, and no input exists', () => {
    bar();
    expect(screen.queryByTestId('canvas-title-input')).toBeNull();
    const row1 = screen.getByTestId('workspace-bar-row1');
    for (const el of Array.from(row1.querySelectorAll<HTMLElement>('*'))) for (const c of ['max-xl:inset-y-0', 'max-xl:right-0', 'max-xl:z-10']) expect(cls(el)).not.toContain(c);
  });

  it('Enter, Escape and leaving the field behave as before', () => {
    const onRename = vi.fn();
    render(<CanvasOwnerBar ready={draft} handle="ana" projectTag="canvas" title="Acme Bakery Plan" canRename onRename={onRename} onPick={vi.fn()} onChanged={vi.fn()} onBack={vi.fn()} active={false} view="canvas" onView={vi.fn()} spotState={{ kind: 'nothing' }} onPublish={vi.fn()} />);
    fireEvent.click(screen.getByTestId('canvas-rename'));
    fireEvent.change(screen.getByTestId('canvas-title-input'), { target: { value: 'New' } });
    fireEvent.keyDown(screen.getByTestId('canvas-title-input'), { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('canvas-rename'));
    fireEvent.change(screen.getByTestId('canvas-title-input'), { target: { value: 'New' } });
    fireEvent.keyDown(screen.getByTestId('canvas-title-input'), { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('New');
  });
});

describe('2: the tightening starts below 640px', () => {
  it('the back button is 32px wide and row 1 has the 4px gap below 640px, still 44px tall; the old below-360px variants are gone', () => {
    bar();
    const back = screen.getByTestId('workspace-back');
    expect(cls(back)).toEqual(expect.arrayContaining(['max-sm:w-8', 'h-11', 'w-10']));
    expect(cls(back)).not.toContain('max-[359px]:w-8');
    const row1 = screen.getByTestId('workspace-bar-row1');
    expect(cls(row1)).toContain('max-sm:gap-x-1');
    expect(cls(row1)).not.toContain('max-[359px]:gap-x-1');
  });

  it('CONTROL: the name\'s minimum width tier stays below 360px, and 640px and up is unchanged', () => {
    bar();
    expect(cls(screen.getByTestId('canvas-name'))).toEqual(expect.arrayContaining(['max-[359px]:min-w-[2.75rem]', 'sm:min-w-[6rem]']));
    expect(cls(screen.getByTestId('workspace-back'))).toContain('w-10');
    expect(cls(screen.getByTestId('workspace-bar-row1'))).toContain('gap-x-1.5');
  });
});
