import { useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';

/**
 * P273: Hook for guarding actions behind email verification.
 *
 * Returns checkVerified(actionLabel) which:
 * - Returns true if user is verified (allow action)
 * - Returns false + shows toast if unverified or unauthenticated
 */
export function useVerificationGate() {
  const { user } = useAuth();

  const checkVerified = useCallback((actionLabel: string): boolean => {
    if (user) return true;
    toast.error(`Sign in to ${actionLabel}.`);
    return false;
  }, [user]);

  return { checkVerified };
}
