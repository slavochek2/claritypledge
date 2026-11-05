/** P1529 D24: answers kept in this browser between the form and sign-up. Per event, validated, expiring, never throwing. */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearRegistrationDraft, DRAFT_TTL_MS, readRegistrationDraft, saveRegistrationDraft } from '@/app/data/registration-draft';
import { choicesOf, comesAtDoors, participationOf } from '@/app/data/registration-answer-model';
import type { RegistrationAnswers } from '@/app/data/registration-answer-model';


/** Spying on Storage.prototype does not reach the test setup's localStorage; swap the object itself. */
function breakStorage() {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const boom = () => { throw new Error('denied'); };
  Object.defineProperty(window, 'localStorage', { value: { getItem: boom, setItem: boom, removeItem: boom, clear: boom, length: 0, key: boom }, configurable: true });
  return () => { if (original) Object.defineProperty(window, 'localStorage', original); };
}

const A: RegistrationAnswers = { participation: 'canvas_at_doors', observerPrep: null, phone: 'usbc', hope: 'h', recordingAccepted: true };

beforeEach(() => localStorage.clear());

describe('registration draft', () => {
  it('round-trips for its own event and for no other', () => {
    expect(saveRegistrationDraft('mm-1', 'register', A)).toBe(true);
    expect(readRegistrationDraft('mm-1')).toEqual({ intent: 'register', answers: A });
    expect(readRegistrationDraft('mm-2')).toBeNull();
  });

  it('a draft copied under another event\'s key is not read for it', () => {
    saveRegistrationDraft('mm-1', 'register', A);
    localStorage.setItem('cp:registration-draft:mm-2', localStorage.getItem('cp:registration-draft:mm-1') as string);
    expect(readRegistrationDraft('mm-2')).toBeNull();
    expect(localStorage.getItem('cp:registration-draft:mm-2')).toBeNull(); // an unusable one is removed
  });

  it('expires', () => {
    saveRegistrationDraft('mm-1', 'waitlist', A, 1_000);
    expect(readRegistrationDraft('mm-1', 1_000 + DRAFT_TTL_MS)).not.toBeNull();
    expect(readRegistrationDraft('mm-1', 1_001 + DRAFT_TTL_MS)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('a draft from the future (clock set back) is not trusted', () => {
    saveRegistrationDraft('mm-1', 'register', A, 5_000);
    expect(readRegistrationDraft('mm-1', 1_000)).toBeNull();
  });

  it('refuses anything without the recording acceptance, a known answer, or valid JSON', () => {
    const put = (v: unknown) => localStorage.setItem('cp:registration-draft:mm-1', typeof v === 'string' ? v : JSON.stringify(v));
    const ok = { slug: 'mm-1', intent: 'register', answers: A, savedAt: Date.now() };
    put({ ...ok, answers: { ...A, recordingAccepted: false } });
    expect(readRegistrationDraft('mm-1')).toBeNull();
    put({ ...ok, answers: { ...A, phone: 'bluetooth' } });
    expect(readRegistrationDraft('mm-1')).toBeNull();
    put({ ...ok, answers: { ...A, participation: 'nonsense' } });
    expect(readRegistrationDraft('mm-1')).toBeNull();
    put({ ...ok, intent: 'seat' });
    expect(readRegistrationDraft('mm-1')).toBeNull();
    put('not json');
    expect(readRegistrationDraft('mm-1')).toBeNull();
    put(ok);
    expect(readRegistrationDraft('mm-1')).not.toBeNull();
  });

  it('clearing removes it, and a browser without storage neither saves nor throws', () => {
    saveRegistrationDraft('mm-1', 'register', A);
    clearRegistrationDraft('mm-1');
    expect(readRegistrationDraft('mm-1')).toBeNull();
    const restore = breakStorage();
    expect(saveRegistrationDraft('mm-1', 'register', A)).toBe(false);
    expect(readRegistrationDraft('mm-1')).toBeNull();
    expect(() => clearRegistrationDraft('mm-1')).not.toThrow();
    restore();
  });
});

describe('the two-step answer model', () => {
  it('maps the four combinations, and an observer alone stores where they prepare', () => {
    expect(participationOf('improve', 'home')).toEqual({ participation: 'canvas_before', observerPrep: null });
    expect(participationOf('improve', 'event')).toEqual({ participation: 'canvas_at_doors', observerPrep: null });
    expect(participationOf('help', 'home')).toEqual({ participation: 'observer', observerPrep: 'home' });
    expect(participationOf('help', 'event')).toEqual({ participation: 'observer', observerPrep: 'doors' });
  });

  it('round-trips through choicesOf; an observer with no second answer has no choices', () => {
    for (const join of ['improve', 'help'] as const) for (const prep of ['home', 'event'] as const) {
      expect(choicesOf(participationOf(join, prep))).toEqual({ join, prep });
    }
    expect(choicesOf({ participation: 'observer', observerPrep: null })).toBeNull();
  });

  it('counts the doors time for improvers at the event and observers who prepare at the event', () => {
    expect(comesAtDoors({ participation: 'canvas_at_doors', observerPrep: null })).toBe(true);
    expect(comesAtDoors({ participation: 'observer', observerPrep: 'doors' })).toBe(true);
    expect(comesAtDoors({ participation: 'observer', observerPrep: 'home' })).toBe(false);
    expect(comesAtDoors({ participation: 'observer', observerPrep: null })).toBe(false);
    expect(comesAtDoors({ participation: 'canvas_before', observerPrep: null })).toBe(false);
  });
});
