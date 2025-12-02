/**
 * @file useAuth.ts
 * @module auth
 *
 * CRITICAL - DO NOT MODIFY WITHOUT E2E TEST APPROVAL
 *
 * Re-exports useAuth from AuthContext for backward compatibility.
 * All auth state is now managed by AuthProvider (single source of truth).
 *
 * This hook is the "Reader" of the authentication system.
 * It is responsible ONLY for reading shared auth state.
 *
 * DO NOT add logic here to create users, update profiles, or handle redirects.
 * Any write operations must happen in AuthCallbackPage.tsx.
 */
export { useAuth } from './AuthContext';
