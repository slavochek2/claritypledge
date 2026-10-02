/**
 * @file EventLinkPage.tsx
 * @module auth
 *
 * P1380: the page every event-email button opens. Route: /auth/event-link?ticket=…
 *
 * WHY A PAGE AND A PRESS, NOT A ONE-CLICK LINK. Work mail systems (link scanners, previews)
 * open every link in an email by themselves. A link that signs you in on open would be spent,
 * or worse used, by the scanner. So the page first asks `event-email-link` WHO the button is for
 * (`peek` — spends nothing) and shows it the way Google's account chooser does: photo, name,
 * "Continue as Anna". Only the human press redeems the ticket (single use) and answers with
 * `/auth/verify?token_hash=…` (signs in, then the event page the button was for).
 *
 * When the button cannot sign this account in — already used, expired, or an account that
 * never signs in from email (admins, the event's host) — the page says so and offers a plain
 * Sign in to the same page, instead of silently landing on the login form (founder, 2026-10-02:
 * "it brings me to the welcome back page").
 *
 * The ticket is never shown, logged or stored by this page; it stays in the address bar only so
 * a network failure can be retried.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { loginReasonText, safeAppPath } from './event-link-path';

type Peek =
  | { mode: 'continue'; name: string | null; avatarUrl: string | null; avatarColor: string | null; hasPledged: boolean; eventTitle: string }
  | { mode: 'login'; to: string; reason: string };

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || null;

function Shell({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <section
      className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-sm flex-col items-center justify-center gap-6 px-4 py-10 text-center"
      data-testid={testId}
    >
      {children}
    </section>
  );
}

export function EventLinkPage() {
  const navigate = useNavigate();
  const ticket = new URLSearchParams(window.location.search).get('ticket') ?? '';
  const [peek, setPeek] = useState<Peek | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const ask = async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const { data, error } = await supabase.functions.invoke('event-email-link', { body: { t: ticket, ...body } });
    if (error && (error as { context?: { status?: number } }).context?.status === 400) {
      return { mode: 'login', to: '/events', reason: 'unknown' };
    }
    if (error) throw error;
    return (data ?? {}) as Record<string, unknown>;
  };

  useEffect(() => {
    if (!ticket || started.current) return;
    started.current = true;
    ask({ peek: true })
      .then((d) => {
        if (d.mode === 'continue') setPeek(d as unknown as Peek);
        else setPeek({ mode: 'login', to: safeAppPath(d.to) ?? '/login', reason: String(d.reason ?? 'unknown') });
      })
      .catch((err) => {
        console.warn('[event-link] peek failed:', err);
        setFailed(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  const go = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const d = await ask({});
      const to = safeAppPath(d.to);
      if (!to) throw new Error('no destination');
      navigate(to, { replace: true });
    } catch (err) {
      console.warn('[event-link] continue failed:', err);
      setFailed(true);
      setBusy(false);
    }
  };

  if (!ticket) {
    return (
      <Shell testId="event-link-missing">
        <h1 className="text-2xl font-bold text-foreground">This link is incomplete</h1>
        <p className="text-muted-foreground">Open the button in your email again, or sign in.</p>
        <LetterPrimaryCta label="Sign in" onClick={() => navigate('/login')} />
      </Shell>
    );
  }

  if (failed && !peek) {
    return (
      <Shell testId="event-link-offline">
        <h1 className="text-2xl font-bold text-foreground">We couldn&apos;t reach the server</h1>
        <p className="text-muted-foreground">Check your connection and reload this page.</p>
        <LetterPrimaryCta label="Try again" onClick={() => window.location.reload()} />
      </Shell>
    );
  }

  if (!peek) return <ClarityPageLoader />;

  if (peek.mode === 'login') {
    return (
      <Shell testId="event-link-login">
        <h1 className="text-2xl font-bold text-foreground">Sign in to continue</h1>
        <p className="text-muted-foreground" data-testid="event-link-reason">{loginReasonText(peek.reason)}</p>
        <LetterPrimaryCta label="Sign in" onClick={() => navigate(peek.to, { replace: true })} />
      </Shell>
    );
  }

  const first = firstName(peek.name);
  return (
    <Shell testId="event-link-page">
      <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <GravatarAvatar
            name={peek.name ?? 'You'}
            photoUrl={peek.avatarUrl ?? undefined}
            avatarColor={peek.avatarColor ?? undefined}
            isPledger={peek.hasPledged}
            size="xl"
          />
          <p className="text-lg font-semibold text-foreground" data-testid="event-link-name">{peek.name ?? 'Your account'}</p>
          <p className="text-sm text-muted-foreground" data-testid="event-link-event">{peek.eventTitle}</p>
        </div>
        <div className="mt-6 flex flex-col items-center gap-1">
          <LetterPrimaryCta label={first ? `Continue as ${first}` : 'Continue'} onClick={go} disabled={busy} />
          <LetterPrimaryCta label="Not you? Sign in" variant="secondary" onClick={() => navigate('/login', { replace: true })} />
        </div>
      </div>
      {failed && (
        <p className="text-sm text-red-600" role="alert" data-testid="event-link-error">
          We couldn&apos;t reach the server. Check your connection and press Continue again.
        </p>
      )}
    </Shell>
  );
}
