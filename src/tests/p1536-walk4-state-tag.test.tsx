/**
 * @file p1536-walk4-state-tag.test.tsx
 * @description P1536 walkthrough 4, item 6: below 360px, with a version picker present, the word "Draft" keeps its width and the name gives way instead;
 * rename stays reachable through the name itself because the pencil is hidden there. jsdom has no layout: these pin the classes that make it true,
 * the browser walk proves the pixels.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

vi.mock('@/app/components/canvas/canvas-version-switcher', () => ({ CanvasVersionSlot: () => <span data-testid="picker">v1</span> }));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => null }));
vi.mock('@/app/components/canvas/canvas-clone-button', () => ({ CloneButton: () => null }));
vi.mock('@/app/components/canvas/canvas-workspace-context', () => ({ useCanvasWorkspace: () => ({ cloneSeq: null }) }));

import { CanvasOwnerBar } from '@/app/components/canvas/canvas-owner-bar';
import { CanvasStateTag } from '@/app/components/canvas/canvas-state-tag';
import { CanvasNameEdit } from '@/app/components/canvas/canvas-name-edit';

afterEach(() => cleanup());

const viewingDraft = { isOwner: true, version: 'd', draft: { version: 'd', baseSeq: 1 }, publishedNone: false } as unknown as CanvasReady;
const published = { isOwner: true, version: 'v1', draft: null, publishedNone: false } as unknown as CanvasReady;
const cls = (el: HTMLElement) => el.className.split(/\s+/);

const bar = (ready: CanvasReady, onRename = vi.fn()) => render(
  <CanvasOwnerBar ready={ready} handle="ana" projectTag="canvas" title="My canvas" canRename onRename={onRename} onPick={vi.fn()} onChanged={vi.fn()} onBack={vi.fn()} active={false} view="canvas" onView={vi.fn()} spot={<span data-testid="spot" />} />,
);

describe('6: the Draft tag keeps its width', () => {
  it('the tag never shrinks, and neither does its wrapper while viewing a draft', () => {
    bar(viewingDraft);
    const tag = screen.getByTestId('canvas-state');
    expect(cls(tag)).toContain('shrink-0');
    expect(cls(tag)).not.toContain('truncate');
    expect(cls(tag.parentElement as HTMLElement)).toContain('shrink-0');
    expect(cls(tag.parentElement as HTMLElement)).not.toContain('min-w-0');
  });
  it('the " · from vN" tail still hides below 640px', () => {
    render(<CanvasStateTag ready={viewingDraft} cloneSeq={null} />);
    expect(screen.getByText(/from v1/).className).toContain('max-sm:hidden');
  });
  it('CONTROL: the pending "New draft" tag still truncates, and its wrapper still shrinks', () => {
    render(<CanvasStateTag ready={published} cloneSeq={2} />);
    expect(cls(screen.getByTestId('canvas-clone-state'))).toContain('truncate');
    cleanup();
    bar(published);
    const pubTag = screen.getByTestId('canvas-state');
    expect(cls(pubTag.parentElement as HTMLElement)).toContain('min-w-0');
  });
});

describe('6: row 1 fits at 320 (classes only below 360px)', () => {
  it('back button, row gap and name carry the narrow-only variants', () => {
    bar(viewingDraft);
    expect(cls(screen.getByTestId('workspace-back'))).toContain('max-[359px]:w-8');
    expect(cls(screen.getByTestId('workspace-bar-row1'))).toContain('max-[359px]:gap-x-1');
    expect(cls(screen.getByTestId('canvas-name'))).toContain('max-[359px]:min-w-[2.75rem]');
  });
});

describe('6: rename through the name below 360px', () => {
  it('the pencil is hidden below 360px and keeps its label; a transparent button over the name is shown only there', () => {
    const { container } = render(<CanvasNameEdit title="My canvas" canEdit onSave={vi.fn()} />);
    const pencil = screen.getByTestId('canvas-rename');
    expect(pencil).toHaveAccessibleName('Rename canvas');
    expect(cls(pencil)).toContain('max-[359px]:hidden');
    const over = screen.getByTestId('canvas-rename-name');
    expect(over).toHaveAccessibleName('Edit name');
    expect(cls(over)).toEqual(expect.arrayContaining(['min-[360px]:hidden', 'absolute', 'inset-0']));
    expect(over.parentElement?.className).toContain('relative');
    expect(container.contains(over)).toBe(true);
  });
  it('clicking the overlay starts a rename, like the pencil', () => {
    render(<CanvasNameEdit title="My canvas" canEdit onSave={vi.fn()} />);
    fireEvent.click(screen.getByTestId('canvas-rename-name'));
    expect(screen.getByTestId('canvas-title-input')).toBeInTheDocument();
  });
  it('CONTROL: a name that cannot be renamed has neither the pencil nor the overlay', () => {
    render(<CanvasNameEdit title="My canvas" canEdit={false} onSave={vi.fn()} />);
    expect(screen.queryByTestId('canvas-rename')).toBeNull();
    expect(screen.queryByTestId('canvas-rename-name')).toBeNull();
  });
});
