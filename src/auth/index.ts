/**
 * Authentication Module
 *
 * CRITICAL - DO NOT MODIFY WITHOUT E2E TEST APPROVAL
 *
 * Public API for the authentication system.
 * Import from this module only: import { useAuth, AuthProvider } from '@/auth';
 * Never import internal files directly.
 *
 * This module implements a Reader-Writer pattern:
 * - Reader (useAuth): Reads shared auth state from AuthContext
 * - Writer (AuthCallbackPage): Creates profiles after magic link verification
 * - Provider (AuthProvider): Single source of truth for auth state
 *
 * AuthVerifyPage (P1257) is NOT a fourth role: it redeems a `?token_hash=` link into a
 * session and then hands off to the Writer. It never writes a profile itself.
 */

export { useAuth, AuthProvider } from './AuthContext';
export { AuthCallbackPage } from './AuthCallbackPage';
export { AuthVerifyPage } from './AuthVerifyPage';

// Re-export types for convenience
export type { Profile } from '@/app/types';
