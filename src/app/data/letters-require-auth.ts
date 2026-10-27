import * as Sentry from '@sentry/react';
import { supabase } from '@/lib/supabase';

/**
 * Get the authenticated user ID or throw.
 * Uses getSession() (reads from client storage, no network) instead of getUser()
 * (hits /auth/v1/user on every call). P692: getUser() caused 27+ pending auth
 * requests on SentTab load, blocking all data queries indefinitely.
 */
export async function requireAuth(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.user) {
    Sentry.captureMessage('letters-service: not authenticated', {
      level: 'error',
      extra: { authError: error?.message },
    });
    throw new Error('Not authenticated');
  }
  return session.user.id;
}
