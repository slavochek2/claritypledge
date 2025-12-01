/**
 * Authentication Module
 *
 * CRITICAL - DO NOT MODIFY WITHOUT E2E TEST APPROVAL
 *
 * Public API for the authentication system.
 * Import from this module only: import { useAuth } from '@/auth';
 * Never import internal files directly.
 *
 * This module implements a Reader-Writer pattern:
 * - Reader (useAuth): Observes auth state, fetches profiles (read-only)
 * - Writer (AuthCallbackPage): Creates profiles after magic link verification
 */

export { useAuth } from './useAuth';
export { AuthCallbackPage } from './AuthCallbackPage';

// Re-export types for convenience
export type { Profile } from '@/app/types';
