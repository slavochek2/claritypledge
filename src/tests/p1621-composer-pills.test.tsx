/**
 * @file p1621-composer-pills.test.tsx
 * @description P1621: Mention in chat as pills in the composer. Enter with pills and no words sends nothing (as the Send button), words send as the same "[Title]" body,
 * a repeat tag adds no second pill, the bus tells which boxes are mentioned, Undo wears the secondary pill style, and Upload has a tooltip on keyboard focus.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Composer } from '@/app/pages/chat/Composer';
import { ComposerTagContext, createComposerTagBus } from '@/app/pages/chat/composer-tag-bus';
import { useMentionedBoxes } from '@/app/pages/chat/use-mentioned-boxes';
import { CanvasUndoButton } from '@/app/pages/chat/CanvasUndo';
import { CanvasUploadButton } from '@/app/pages/chat/CanvasUploadButton';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { clearDraftsExcept, insertIntoDraft, peekDraft, stashDraft } from '@/app/pages/chat/chat-hooks';
import { joinTagged, pillsReserve, splitTagged } from '@/app/pages/chat/composer-tags';
import { createElement, type ReactNode } from 'react';

const REVENUE = 'canvas:revenue';
const METRICS = 'canvas:metrics';
const PROBLEM = 'canvas:problem';
const bus = createComposerTagBus();

vi.mock('@/app/pages/chat/chat-hooks', async (orig) => ({ ...(await orig<typeof import('@/app/pages/chat/chat-hooks')>()), hasFinePointer: () => true }));

const mount = (onSend = vi.fn()) => {
  render(<ComposerTagContext.Provider value={bus}><Composer draftKey="u:p1621" placeholder="Say" onSend={onSend} /></ComposerTagContext.Provider>);
  return onSend;
};
const field = () => screen.getByRole('textbox', { hidden: true }) as HTMLTextAreaElement;
const pills = () => screen.queryAllByTestId('composer-tag-pill').map(p => p.textContent);
const tap = (tag: string, opts?: { focus?: boolean }) => act(() => { bus.hold(tag, opts); bus.flush(true); });

beforeEach(() => { clearDraftsExcept(null); bus.clear(); });
afterEach(cleanup);

describe('P1621 composer pills', () => {
  it('Enter with pills and no words sends nothing; with words it sends the "[Title]" body', () => {
    const onSend = mount();
    tap(REVENUE);
    tap(METRICS);
    expect(pills()).toEqual(['Offers & Pricing', 'My next milestone']);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.change(field(), { target: { value: 'hello' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
    const body = onSend.mock.calls[0]![0] as string;
    expect(body.split('⁣').join('')).toBe('[Offers & Pricing] [My next milestone] hello');
  });

  it('a repeat tag adds no second pill; the remove button is named and takes it away with focus kept in the field', () => {
    mount();
    tap(REVENUE);
    tap(REVENUE);
    expect(pills()).toEqual(['Offers & Pricing']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Offers & Pricing' }));
    expect(pills()).toEqual([]);
    expect(document.activeElement).toBe(field());
  });

  it('a tag held with focus:false lands without taking focus', () => {
    mount();
    tap(REVENUE, { focus: false });
    expect(pills()).toEqual(['Offers & Pricing']);
    expect(document.activeElement).not.toBe(field());
  });

  it('useMentionedBoxes follows held tags and the composer, and is empty with no bus', () => {
    const wrapper = ({ children }: { children: ReactNode }) => createElement(ComposerTagContext.Provider, { value: bus }, children);
    const { result } = renderHook(() => useMentionedBoxes(), { wrapper });
    expect([...result.current]).toEqual([]);
    act(() => bus.hold(METRICS));
    expect([...result.current]).toEqual([METRICS]);
    act(() => bus.clear()); // a dropped wait
    expect([...result.current]).toEqual([]);
    expect([...renderHook(() => useMentionedBoxes()).result.current]).toEqual([]);
  });

  it('a mounted composer keeps its tags mentioned, and leaving it clears them', () => {
    mount();
    tap(REVENUE);
    expect(bus.mentioned().has(REVENUE)).toBe(true);
    cleanup();
    expect(bus.mentioned().has(REVENUE)).toBe(false);
  });
});

describe('P1621 review fixes', () => {
  it('dictation landing after the owner left the slot merges into the words, not into the tokens', () => {
    stashDraft('u:left', joinTagged([PROBLEM], 'hello'));
    expect(insertIntoDraft('u:left', 'world', 3)).toBe(true);
    expect(splitTagged(peekDraft('u:left'))).toEqual({ tags: [PROBLEM], words: 'hel world lo' });
  });

  it('dictation into a slot with pills refuses words that would pass the cap as stored', () => {
    stashDraft('u:full', joinTagged([PROBLEM], 'x'.repeat(3950)));
    expect(insertIntoDraft('u:full', 'y'.repeat(100), 0)).toBe(false);
  });

  it('the words field leaves room for the pills: its maxLength is the cap minus what the pills take', () => {
    mount();
    expect(field().maxLength).toBe(4000);
    tap(REVENUE);
    expect(field().maxLength).toBe(4000 - pillsReserve([REVENUE]));
    tap(METRICS);
    expect(field().maxLength).toBe(4000 - pillsReserve([REVENUE, METRICS]));
    expect(pillsReserve([REVENUE, METRICS]) + field().maxLength).toBe(4000); // words at the limit plus the pills fill the cap exactly, never past it
  });

  it('a mention never shows as un-mentioned between the tap and the composer report', () => {
    mount();
    const seen: boolean[] = [];
    const off = bus.subscribe(() => seen.push(bus.mentioned().has(REVENUE)));
    tap(REVENUE);
    off();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(false);
  });

  it('a restored failed send leaves no trailing newline in the words', async () => {
    const onSend = vi.fn(async () => false);
    mount(onSend);
    tap(REVENUE);
    fireEvent.change(field(), { target: { value: 'hello' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    await act(async () => { await Promise.resolve(); });
    expect(pills()).toEqual(['Offers & Pricing']);
    expect(field().value).toBe('hello');
  });
});

describe('P1621 Undo and Upload', () => {
  it('Undo wears the secondary blue-outline pill', () => {
    render(<CanvasUndoButton busy={false} onUndo={() => undefined} />);
    expect(screen.getByTestId('canvas-undo').className).toContain(CANVAS_SECONDARY_PILL.split(' ')[0]);
    expect(screen.getByTestId('canvas-undo').className).toContain('border-blue-600');
  });

  it('Upload keeps its accessible name and shows a tooltip on keyboard focus', async () => {
    render(<CanvasUploadButton busy={false} onPick={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Upload' });
    act(() => button.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Upload');
  });
});
