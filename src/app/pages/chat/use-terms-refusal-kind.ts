/**
 * @file use-terms-refusal-kind.ts
 * @description P1529: a TERMS_NOT_ACCEPTED answer from `canvas-draft` means two different things. Either the person's acceptance is behind the current
 * terms (the terms gate WILL open on reload), or the SERVER expects a different version than the person accepted and the client considers current
 * (a function deployed on an older version): the gate will not open, so "review terms" would loop. The terms gate's own comparison (accepted version against the current one) decides, and the
 * second case is reported to Sentry. A failed read counts as the second case (never offer a button that may loop).
 */
import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/react';
import { getAcceptedTermsVersion } from '@/app/data/terms-accepted';
import { CURRENT_TERMS_VERSION } from '@/lib/constants';

export type TermsRefusalKind = 'checking' | 'behind' | 'server_mismatch' | 'read_failed';

/** The acceptance read's deadline: past it the answer is the generic failure with Try again, never a spinner that does not end. */
export const TERMS_READ_DEADLINE_MS = 8_000;

const withDeadline = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('terms read timed out')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

export function useTermsRefusalKind(active: boolean, userId: string | null | undefined, code: string): TermsRefusalKind {
  const [kind, setKind] = useState<TermsRefusalKind>('checking');
  useEffect(() => {
    if (!active) return;
    if (!userId) { setKind('read_failed'); return; }
    let cancelled = false;
    setKind('checking');
    void (async () => {
      let next: TermsRefusalKind = 'server_mismatch';
      let accepted: string | null = null;
      let readOk = false;
      try {
        // The reader that THROWS on a failed read (needsTermsAcceptance answers "behind" on a database error, which would offer a dead-end button).
        accepted = await withDeadline(getAcceptedTermsVersion(userId), TERMS_READ_DEADLINE_MS);
        readOk = true;
        if (accepted !== CURRENT_TERMS_VERSION) next = 'behind'; // the terms gate's own comparison
      } catch { next = 'read_failed'; /* unknown (error or timeout): the safe branch */ }
      if (cancelled) return; // a discarded check reports nothing
      if (next === 'read_failed') {
        Sentry.addBreadcrumb({ category: 'canvas-draft-terms', level: 'warning', message: 'terms read failed or timed out after a terms refusal', data: { code } });
      } else if (next === 'server_mismatch' && readOk) { // only a successful read showing current
        Sentry.captureMessage('canvas-draft refused terms for a user the client considers current', {
          level: 'warning', tags: { area: 'canvas-draft-terms' }, extra: { code, clientVersion: CURRENT_TERMS_VERSION, acceptedVersion: accepted },
        });
      }
      setKind(next);
    })();
    return () => { cancelled = true; };
  }, [active, userId, code]);
  return kind;
}
