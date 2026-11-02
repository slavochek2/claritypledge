/**
 * @file p1536-s4-composer-tags-hook.test.tsx
 * @description P1536 S4.2 / J5 review fixes for the composer's tag hook, on the REAL hook in a small harness (a textarea and a draft state, as the composer has):
 *  - several tags queued at once all land, each on the latest value (no overwrite before React renders)
 *  - a voice note's completion removes only the tags it was sent with, and only from the composer it was sent from
 *  - the caret listener attaches when the textarea mounts after the hook does
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceSender } from '@/hooks/use-voice-note';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { ComposerTagContext, createComposerTagBus } from '@/app/pages/chat/composer-tag-bus';
import { clearDraftsExcept, editStoredDraft, peekDraft, stashDraft, useDraft } from '@/app/pages/chat/chat-hooks';
import { useComposerTags } from '@/app/pages/chat/use-composer-tags';
import { tagCounts, tagToken } from '@/app/pages/chat/composer-tags';

const REVENUE = 'canvas:revenue';
const PROBLEM = 'canvas:problem';
const SOLUTION = 'canvas:solution';
const bus = createComposerTagBus();
let setFromOutside: (v: string) => void = () => undefined;
let setKeyFromOutside: (k: string) => void = () => undefined;

function Harness({ voice, late = false, initial = '' }: { voice?: VoiceSender; late?: boolean; initial?: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initial);
  const [key, setKey] = useState('u:slot-a');
  const [shown, setShown] = useState(!late);
  setFromOutside = setValue;
  setKeyFromOutside = setKey;
  const tags = useComposerTags(field, key, value, setValue, voice);
  return (
    <div>
      {shown ? <textarea ref={field} aria-label="field" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { tags.onKeyDown(e); }} /> : <button type="button" onClick={() => setShown(true)}>mount</button>}
      <button type="button" onClick={() => void tags.voice?.(new Blob(['x']))}>voice</button>
      <output data-testid="key">{key}</output>
    </div>
  );
}
const mount = (props: Parameters<typeof Harness>[0] = {}) => render(<ComposerTagContext.Provider value={bus}><Harness {...props} /></ComposerTagContext.Provider>);
const field = () => screen.getByLabelText('field') as HTMLTextAreaElement;

beforeEach(() => { clearDraftsExcept(null); bus.clear(); });
afterEach(cleanup);

describe('several tags queued at once', () => {
  it('all of them land, in order, in one tap', () => {
    mount();
    act(() => { bus.hold(PROBLEM); bus.hold(SOLUTION); bus.hold(REVENUE); bus.flush(true); });
    expect(tagCounts(field().value)).toEqual({ [PROBLEM]: 1, [SOLUTION]: 1, [REVENUE]: 1 });
    expect(field().value.indexOf(tagToken(PROBLEM))).toBeLessThan(field().value.indexOf(tagToken(SOLUTION)));
    expect(field().value.indexOf(tagToken(SOLUTION))).toBeLessThan(field().value.indexOf(tagToken(REVENUE)));
  });
  it('and when the composer takes them late (not inside a tap)', async () => {
    mount();
    act(() => { bus.hold(PROBLEM); bus.hold(SOLUTION); bus.flush(false); });
    expect(tagCounts(field().value)).toEqual({ [PROBLEM]: 1, [SOLUTION]: 1 });
  });
});

describe('a voice note\'s completion removes only what it carried, where it was sent from', () => {
  it('a tag added after the note was submitted survives its completion', async () => {
    let done: () => void = () => undefined;
    const sender = vi.fn((_w: Blob, _o?: unknown) => new Promise<void>(r => { done = r; }));
    mount({ voice: sender, initial: `${tagToken(REVENUE)} ` });
    fireEvent.click(screen.getByText('voice'));
    expect(sender.mock.calls[0]![1]).toEqual({ boxRefs: [REVENUE] });
    act(() => { bus.hold(PROBLEM); bus.flush(true); }); // added while the note is on its way
    await act(async () => { done(); });
    expect(tagCounts(field().value)).toEqual({ [PROBLEM]: 1 });
  });
  it('a second token of the same box added after submission survives (only the submitted count goes)', async () => {
    let done: () => void = () => undefined;
    const sender = vi.fn((_w: Blob, _o?: unknown) => new Promise<void>(r => { done = r; }));
    mount({ voice: sender, initial: `${tagToken(REVENUE)} ` });
    fireEvent.click(screen.getByText('voice'));
    act(() => { bus.hold(REVENUE); bus.flush(true); });
    await act(async () => { done(); });
    expect(tagCounts(field().value)).toEqual({ [REVENUE]: 1 });
  });
  it('when the composer has moved to another slot meanwhile, the new slot is untouched and the slot it was sent from loses the tags', async () => {
    let done: () => void = () => undefined;
    const sender = vi.fn((_w: Blob, _o?: unknown) => new Promise<void>(r => { done = r; }));
    mount({ voice: sender, initial: `${tagToken(REVENUE)} ` });
    stashDraft('u:slot-a', `${tagToken(REVENUE)} `); // what the store holds for the slot the note was sent from
    fireEvent.click(screen.getByText('voice'));
    act(() => { setKeyFromOutside('u:slot-b'); setFromOutside(`${tagToken(PROBLEM)} other chat`); });
    await act(async () => { done(); });
    expect(field().value).toBe(`${tagToken(PROBLEM)} other chat`);
    expect(tagCounts(peekDraft('u:slot-a'))).toEqual({});
  });
});

/** The composer as it is: its text lives in the draft store (`useDraft`), so a write from an old instance shows in the next one. */
function StoreHarness({ voice, draftKey }: { voice: VoiceSender; draftKey: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useDraft(draftKey);
  const tags = useComposerTags(field, draftKey, value, setValue, voice);
  return <div><textarea ref={field} aria-label="field" value={value} onChange={e => setValue(e.target.value)} /><button type="button" onClick={() => void tags.voice?.(new Blob(['x']))}>voice</button></div>;
}

describe('a voice note that completes after the composer was left and come back to', () => {
  it('edits the CURRENT stored draft: the text typed since survives, the submitted tag goes', async () => {
    let done: () => void = () => undefined;
    const sender = vi.fn((_w: Blob, _o?: unknown) => new Promise<void>(r => { done = r; }));
    editStoredDraft('u:slot-a', () => `${tagToken(REVENUE)} `);
    const first = render(<ComposerTagContext.Provider value={bus}><StoreHarness voice={sender} draftKey="u:slot-a" /></ComposerTagContext.Provider>);
    fireEvent.click(screen.getByText('voice'));
    first.unmount(); // left the chat
    editStoredDraft('u:slot-a', v => `${v}typed since`); // came back (a new composer) and typed
    await act(async () => { done(); });
    expect(peekDraft('u:slot-a')).toBe('typed since');
    render(<ComposerTagContext.Provider value={bus}><StoreHarness voice={sender} draftKey="u:slot-a" /></ComposerTagContext.Provider>);
    expect(field().value).toBe('typed since');
  });
});

describe('the caret listener', () => {
  it('attaches when the textarea mounts after the hook: a caret put inside a token goes to its edge', () => {
    const v = `${tagToken(REVENUE)} words`;
    mount({ late: true, initial: v });
    fireEvent.click(screen.getByText('mount'));
    const el = field();
    el.setSelectionRange(v.length, v.length);
    fireEvent.select(el); // the previous caret: at the end
    el.setSelectionRange(4, 4); // moved left, into the token
    fireEvent.select(el);
    expect(el.selectionStart).toBe(0);
  });
});
