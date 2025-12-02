# Authentication Flow

**Email Provider:** Brevo (configured in Supabase Auth settings)

1. **User signs pledge** → `createProfile()` in `api.ts`
2. **Supabase sends magic link** via `signInWithOtp()` (emails sent through Brevo SMTP)
3. **User clicks link** → redirects to `/auth/callback`
4. **Callback page** exchanges hash for session
5. **Database trigger fires** → creates profile with metadata
6. **Redirect to verification** → `/verify/:id`
7. **Verification success** → redirects to `/p/:id`
8. **Profile displayed** with user data
