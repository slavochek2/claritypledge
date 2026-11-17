/**
 * @file registration-draft.ts
 * @description P1529 D24: a logged-out person's registration answers, kept in this browser while they sign up, so that coming
 * back signed in registers them without asking again. One key per event, nothing stored for any other flow. It holds the
 * recording acceptance the person gave, so it is read only on the way back from sign-up (`action=rsvp`), is dropped once it is
 * used, and expires. It is not bound to a person (nobody is signed in when it is written): another person finishing a sign-in
 * in this browser inside the expiry would be registered with it, which is why the expiry is short.
 * Every storage access is guarded: a browser without storage simply has no draft and the form opens as before.
 */
import type { RegistrationAnswers } from './registration-answer-model';
import { isValidHikeAnswers, normalizeHikeAnswers, type HikeAnswers } from './hike-answer-model';

/** P1675: which flow's answers a stored draft holds. A draft written before the discriminator has none and is a mastermind's. */
export type DraftKind = 'mastermind' | 'hike';

export type DraftIntent = 'register' | 'waitlist';
export interface RegistrationDraft {
  intent: DraftIntent;
  answers: RegistrationAnswers;
}

/** Long enough for a magic link to arrive and be opened; short enough that a shared browser does not carry it for days. */
export const DRAFT_TTL_MS = 3 * 60 * 60 * 1000;
const key = (slug: string) => `cp:registration-draft:${slug}`;

const PARTICIPATION = ['canvas_before', 'canvas_at_doors', 'observer'];
const PHONES = ['usbc', 'lightning', 'other'];

function valid(v: unknown): v is RegistrationDraft & { savedAt: number; slug: string } {
  const d = v as Partial<RegistrationDraft> & { savedAt?: unknown; slug?: unknown; kind?: unknown } | null;
  const a = d?.answers as Partial<RegistrationAnswers> | undefined;
  if (d && d.kind !== undefined && d.kind !== 'mastermind') return false; // a hike's draft is read by readHikeDraft only
  return !!d && (d.intent === 'register' || d.intent === 'waitlist') && typeof d.savedAt === 'number' && typeof d.slug === 'string'
    && !!a && PARTICIPATION.includes(a.participation as string) && PHONES.includes(a.phone as string)
    && typeof a.hope === 'string' && a.recordingAccepted === true
    && (a.observerPrep === null || a.observerPrep === 'home' || a.observerPrep === 'doors');
}

export function saveRegistrationDraft(slug: string, intent: DraftIntent, answers: RegistrationAnswers, now = Date.now()): boolean {
  try {
    localStorage.setItem(key(slug), JSON.stringify({ slug, kind: 'mastermind' satisfies DraftKind, intent, answers, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

/** The draft for this event, or null (none, expired, unreadable, or written for another event). An unusable one is removed. */
export function readRegistrationDraft(slug: string, now = Date.now()): RegistrationDraft | null {
  try {
    const raw = localStorage.getItem(key(slug));
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    // P1675: a hike's draft is not ours to read or remove; the sign-up callback reaches here first, and the event page's
    // return hook reads it with readHikeDraft (review 2026-11-17: removing it here lost the answers across sign-in).
    if ((v as { kind?: unknown } | null)?.kind === 'hike') return null;
    if (!valid(v) || v.slug !== slug || now - v.savedAt > DRAFT_TTL_MS || now < v.savedAt) {
      localStorage.removeItem(key(slug));
      return null;
    }
    return { intent: v.intent, answers: v.answers };
  } catch {
    return null;
  }
}

/** P1675: a hike's answers kept across sign-up, same key, expiry and per-event binding; stored with kind 'hike'. */
export function saveHikeDraft(slug: string, answers: HikeAnswers, now = Date.now()): boolean {
  try {
    localStorage.setItem(key(slug), JSON.stringify({ slug, kind: 'hike' satisfies DraftKind, intent: 'register', answers: normalizeHikeAnswers(answers), savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

/** The hike draft for this event, or null (none, expired, unreadable, another event's, or another kind's). An unusable one is removed. */
export function readHikeDraft(slug: string, now = Date.now()): HikeAnswers | null {
  try {
    const raw = localStorage.getItem(key(slug));
    if (!raw) return null;
    const v = JSON.parse(raw) as { kind?: unknown; slug?: unknown; savedAt?: unknown; answers?: unknown } | null;
    if (v?.kind !== 'hike') return null; // a mastermind's draft is not ours to remove
    if (v.slug !== slug || typeof v.savedAt !== 'number' || now - v.savedAt > DRAFT_TTL_MS || now < v.savedAt || !isValidHikeAnswers(v.answers)) {
      localStorage.removeItem(key(slug));
      return null;
    }
    return v.answers;
  } catch {
    return null;
  }
}

export function clearRegistrationDraft(slug: string): void {
  try {
    localStorage.removeItem(key(slug));
  } catch {
    /* nothing to clear */
  }
}
