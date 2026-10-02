/**
 * @file EventLinkPage.tsx
 * @module auth
 *
 * P1380: the "Continue" page every event-email button opens. Route: /auth/event-link?ticket=…
 *
 * WHY A PAGE AND A PRESS, NOT A ONE-CLICK LINK. Work mail systems (link scanners, previews)
 * open every link in an email by themselves. A link that signs you in on open would be spent,
 * or worse used, by the scanner. This page does nothing on load; only the human press sends
 * the ticket to `event-email-link`, which spends it (single use) and answers with where to go:
 * `/auth/verify?token_hash=…` (signs in, then the event page the button was for) or
 * `/login?redirect=…` (used, expired, or a host/admin account — normal sign-in, same page).
 *
 * The ticket is never shown, logged or stored by this page; it stays in the address bar only so
 * a network failure can be retried with the same press.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { safeAppPath } from './event-link-path';

export function EventLinkPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ticket = new URLSearchParams(window.location.search).get('ticket') ?? '';

  const go = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { data, error } = await supabase.functions.invoke('event-email-link', { body: { t: ticket } });
      const to = safeAppPath((data as { to?: unknown } | null)?.to);
      if (error || !to) {
        // 400 = not a ticket at all: nothing to retry, go to the events list.
        if (!error || (error as { context?: { status?: number } }).context?.status === 400) {
          navigate('/events', { replace: true });
          return;
        }
        throw error;
      }
      navigate(to, { replace: true });
    } catch (err) {
      console.warn('[event-link] continue failed:', err);
      setFailed(true);
      setBusy(false);
    }
  };

  if (!ticket) {
    return (
      <section className="mx-auto flex max-w-sm flex-col items-center gap-4 px-4 py-16 text-center" data-testid="event-link-missing">
        <h1 className="text-2xl font-bold text-foreground">This link is incomplete</h1>
        <p className="text-muted-foreground">Open the button in your email again, or sign in.</p>
        <LetterPrimaryCta label="Sign in" onClick={() => navigate('/login')} />
      </section>
    );
  }

  return (
    <section
      className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-sm flex-col items-center justify-center space-y-6 px-4 py-10 text-center"
      data-testid="event-link-page"
    >
      {/* [DRAFT] copy */}
      <h1 className="text-2xl font-bold leading-snug text-foreground">Continue to your event</h1>
      <p className="text-base text-muted-foreground">This button is yours: it signs you in as you.</p>
      <LetterPrimaryCta label="Continue" onClick={go} disabled={busy} />
      {failed && (
        <p className="text-sm text-red-600" role="alert" data-testid="event-link-error">
          We couldn&apos;t reach the server. Check your connection and press Continue again.
        </p>
      )}
    </section>
  );
}
