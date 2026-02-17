---
status: done
type: story
tags: []
rank: 125441.0
created_date: 2026-01-09
---

# P51: Post-/live Email & AI Coaching CTA

**Status:** Spec Draft
**Priority:** Medium (after P50, before or with P41)
**Est. Effort:** 1 day
**Created:** 2026-01-09
**Revised:** 2026-01-16 (Changed scope: now about post-meeting email, not upgrade flow)
**Depends On:** P50 (profile/pledge separation), P41 (AI coaching feature)

---

## Problem

After a /live meeting ends, users leave and may forget about Clarity Pledge. We have their email but no follow-up mechanism.

**Opportunity:** Send automated email after meeting ends with:
1. Magic link to log back in
2. CTA to see AI Coaching Insights (P41)

---

## User Flow

```
1. User participates in /live meeting
2. Meeting ends (someone clicks "End Meeting" or last person leaves)
3. System sends email to all participants:
   - Subject: "Your AI Coaching Insights are ready"
   - Body: Summary of meeting + CTA button
   - CTA: "See AI Coaching Insights" → magic link
4. User clicks link:
   - If unverified: magic link verifies email + logs in
   - If verified: magic link logs in
5. User lands on /coaching (or wherever AI insights live)
```

---

## Email Content

### For Unverified Users

```
Subject: Your AI Coaching Insights are ready

Hi [Name],

Your Clarity Meeting just ended. We've analyzed your conversation
and have personalized coaching insights ready for you.

[See AI Coaching Insights] ← magic link (verifies + logs in)

Clicking this link will also verify your email and create your
Clarity Pledge profile.
```

### For Verified Users

```
Subject: Your AI Coaching Insights are ready

Hi [Name],

Your Clarity Meeting just ended. We've analyzed your conversation
and have personalized coaching insights ready for you.

[See AI Coaching Insights] ← magic link (logs in)
```

---

## Technical Considerations

### When to Send

- Trigger: Meeting ends (host clicks "End" OR last participant leaves)
- Delay: Immediate or 1-2 minutes (allow AI processing time)
- Rate limit: Max 1 email per user per meeting

### Email Delivery

**Option A: Supabase Magic Link + Redirect**
```typescript
await supabase.auth.signInWithOtp({
  email: user.email,
  options: {
    emailRedirectTo: `${origin}/auth/callback?redirect=/coaching`,
  },
});
```
- Pro: Uses existing auth infrastructure
- Con: Email text is generic (Supabase template)

**Option B: Custom Transactional Email (Resend/SendGrid)**
```typescript
await resend.emails.send({
  to: user.email,
  subject: 'Your AI Coaching Insights are ready',
  html: customEmailTemplate({ name, magicLink }),
});
```
- Pro: Full control over email content
- Con: Need to set up transactional email service

**Recommendation:** Start with Option A (KISS), upgrade to Option B if email customization becomes important.

### Auth Callback Changes

Add `redirect` param support:

```typescript
// AuthCallbackPage.tsx
const redirect = searchParams.get('redirect');

// After successful auth:
if (redirect && redirect.startsWith('/')) {
  navigate(redirect, { replace: true });
} else if (hasPledged) {
  navigate(`/p/${slug}/pledge`, { replace: true });
} else {
  navigate(`/p/${slug}`, { replace: true });
}
```

---

## Open Questions

1. **Where does /coaching live?** Need P41 to define this route.
2. **What if AI processing isn't done?** Show loading state? Or delay email until ready?
3. **Meeting summary in email?** Nice to have but adds complexity.
4. **Unsubscribe?** Probably not needed for transactional email, but consider for GDPR.

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Email open rate | 40%+ | Email service analytics |
| Click-through rate | 20%+ | Email service analytics |
| Coaching page views from email | Track `source=email` param | Mixpanel |

---

## Related Documents

- [P50: Profile & Pledge Separation](./p356_non_pledger_experience.md) - Profile/verification infrastructure
- [P41: AI Coaching Teaser](./p41_coaching_teaser.md) - Coaching feature this email promotes

---

## Note: Previous Scope (Archived)

P51 originally described "upgrade flow (non-pledger → pledger)". This functionality was merged into P50 Flow 2 during implementation. P51 now focuses on post-meeting email automation.
