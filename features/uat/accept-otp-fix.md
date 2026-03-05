# UAT: Accept OTP Redirect Fix

> Bug fix: email confirmation link returns error=access_denied instead of signing the agreement.
> Root cause: emailRedirectTo bypassed /auth/callback; Supabase rejected non-allowlisted URL.

## Test Execution Log

| Scenario | Result | Notes |
|----------|--------|-------|
| UAT-1: emailRedirectTo now routes through /auth/callback | ✅ | URL = /auth/callback?redirect=%2Fagreements%2F...%3Ftoken%3D... |
| UAT-2: /agreements in ALLOWED_REDIRECT_PREFIXES | ✅ | Code confirmed, redirect validated |
| UAT-3: Accept page renders correctly unauthenticated | ✅ | Loads with name pre-filled, two CTAs visible, no console errors |
| UAT-4: Auth callback redirects to /agreements path correctly | ✅ | Callback handles unauthenticated visit correctly; redirect logic verified by code |
| UAT-5: TypeScript compiles with no new errors | ✅ | npx tsc --noEmit clean |
