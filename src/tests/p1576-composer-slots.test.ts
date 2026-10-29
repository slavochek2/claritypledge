/**
 * P1576: which buttons the composer row shows. One primary action at a time (P955): while a
 * recorder bar (dictation or voice note) is up, nothing else in the row is on offer, and Send and
 * the voice-note button never show together.
 */
import { describe, it, expect } from 'vitest';
import { composerSlots } from '@/app/pages/chat/composer-slots';

interface In { sendable: boolean; hasAttach: boolean; privateTo: boolean; dictating: boolean; canDictate: boolean; voiceOn: boolean; voiceBar: boolean }
const base: In = { sendable: false, hasAttach: true, privateTo: false, dictating: false, canDictate: true, voiceOn: true, voiceBar: false };
const slots = (o: In) =>
  composerSlots(o.sendable, o.hasAttach, o.privateTo, { recording: o.dictating, supported: o.canDictate }, { enabled: o.voiceOn, showBar: o.voiceBar });

describe('composerSlots: the empty human composer', () => {
  it('offers attach, the dictation mic and the round voice-note button, and no Send', () => {
    expect(slots(base)).toEqual({ attach: true, field: true, bar: false, voiceBar: false, mic: true, voice: true, send: false });
  });
});

describe('composerSlots: the voice-note button never shows when there is something to send', () => {
  it.each([
    ['text, a staged attachment or a sendable quote (all of them are "sendable")', { sendable: true }],
    ['a private @mirror ask is open', { privateTo: true }],
    ['a mirror chat (the pane passes no voice sender)', { voiceOn: false }],
    ['the dictation bar is up', { dictating: true }],
    ['the voice recorder bar is up', { voiceBar: true }],
  ])('%s', (_name, over) => {
    expect(slots({ ...base, ...over }).voice).toBe(false);
  });

  it('CONTROL: with none of those, it shows', () => {
    expect(slots(base).voice).toBe(true);
  });

  it('Send replaces it once there is something to send', () => {
    expect(slots({ ...base, sendable: true })).toMatchObject({ send: true, voice: false, mic: true, attach: true });
  });

  it('a private ask keeps Send and dictation but has no attach and no voice button', () => {
    expect(slots({ ...base, privateTo: true, sendable: true })).toMatchObject({ attach: false, send: true, voice: false, mic: true });
  });
});

describe('composerSlots: exactly one primary action, over every combination', () => {
  const flags = [false, true];
  const all: In[] = [];
  for (const sendable of flags) for (const hasAttach of flags) for (const privateTo of flags) for (const dictating of flags)
    for (const canDictate of flags) for (const voiceOn of flags) for (const voiceBar of flags)
      all.push({ sendable, hasAttach, privateTo, dictating, canDictate, voiceOn, voiceBar });

  it('Send and the voice button are never both on', () => {
    for (const o of all) {
      const s = slots(o);
      expect(s.send && s.voice, JSON.stringify(o)).toBe(false);
    }
  });

  it('while either recorder bar is up, no other control is on', () => {
    for (const o of all.filter((x) => x.dictating || x.voiceBar)) {
      const s = slots(o);
      expect(s.attach || s.mic || s.voice || s.send || s.field, JSON.stringify(o)).toBe(false);
    }
  });

  it('the two recorder bars are never both on when only one is active, and the field hides for either', () => {
    expect(slots({ ...base, dictating: true })).toMatchObject({ bar: true, voiceBar: false, field: false });
    expect(slots({ ...base, voiceBar: true })).toMatchObject({ bar: false, voiceBar: true, field: false });
  });
});

describe('composerSlots: dictation and attach rules are unchanged', () => {
  it('no attach handler, no attach', () => {
    expect(slots({ ...base, hasAttach: false }).attach).toBe(false);
  });

  it('a browser that cannot record has no dictation mic', () => {
    expect(slots({ ...base, canDictate: false }).mic).toBe(false);
  });
});
