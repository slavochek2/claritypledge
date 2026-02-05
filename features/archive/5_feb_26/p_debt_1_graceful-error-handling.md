# P_DEBT_1: Graceful Error Handling & Service Status

## Problem

When Supabase (or other services) are down, users see generic error messages like "Failed to sign pledge. Please try again." This doesn't tell them:
- Whether it's their fault or a service issue
- Whether to retry now or wait
- What's actually happening

Discovered during Dec 5, 2025 Supabase outage.

## Goal

Improve user experience during service degradation with clear messaging and optional status monitoring.

## Tasks

### Phase 1: Better Error Messages (Quick Win)
- [ ] Update API error handling to distinguish between:
  - Network errors (service down)
  - Auth errors (user issue)
  - Validation errors (input issue)
- [ ] Show user-friendly messages:
  - "Our service is temporarily unavailable. Please try again in a few minutes."
  - "Unable to connect. Check your internet connection."
- [ ] Add retry button with exponential backoff

### Phase 2: Status Banner (Optional)
- [ ] Create `useServiceHealth` hook that pings Supabase health endpoint
- [ ] Show dismissible banner when service is degraded
- [ ] Cache status to avoid repeated checks

### Phase 3: External Monitoring (For Dev Team)
- [ ] Set up UptimeRobot or similar (free tier)
- [ ] Monitor production Supabase endpoint
- [ ] Alert via email/Slack when down

## Acceptance Criteria

- [ ] Users see helpful error messages during outages
- [ ] No technical jargon in error messages
- [ ] Retry functionality works smoothly
- [ ] (Optional) Status banner appears during degraded performance

## Files to Update

- `src/app/data/api.ts` - Error handling logic
- `src/app/pages/sign-pledge-page.tsx` - Error display
- `src/hooks/use-pledge-form.ts` - Form error handling
- New: `src/hooks/use-service-health.ts` (if Phase 2)

## Priority

Medium - Technical debt / UX improvement

## Notes

- Supabase status API: https://status.supabase.com (can be scraped or use their API)
- Consider caching health check results for 30 seconds to avoid hammering
- Free tier monitoring: UptimeRobot, Freshping, StatusCake
