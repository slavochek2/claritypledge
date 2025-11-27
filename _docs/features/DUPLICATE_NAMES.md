# Duplicate Names & Returning User Detection

**Status**: ✅ Production Ready
**Feature Flag**: `VITE_ALLOW_DUPLICATE_NAMES` (default: OFF)

## Overview

Two related features that improve the pledge sign-up experience:

1. **Duplicate Names** - Allow multiple users with the same name
2. **Returning User Detection** - Detect and welcome back existing users

## Quick Start

### Enable Duplicate Names
```bash
# Add to .env.local
VITE_ALLOW_DUPLICATE_NAMES=true
```

### Returning User Detection
Always active. No configuration needed.

## How It Works

### Architecture: Three Safety Layers

```
┌─────────────────────────────────────────────────┐
│ Layer 1: Client (Best Effort)                  │
│ - Finds available slug before sending email    │
│ - File: src/polymet/data/api.ts:191-222        │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ Layer 2: Database (Enforcement)                 │
│ - Trigger ensures uniqueness                    │
│ - Handles race conditions                       │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ Layer 3: Callback (Truth)                       │
│ - Always fetches real slug from database        │
│ - File: src/polymet/pages/auth-callback-page.tsx│
└─────────────────────────────────────────────────┘
```

### Slug Generation Examples

**Feature OFF (default):**
```
User 1: "John Doe" → /p/john-doe ✅
User 2: "John Doe" → ❌ Error: "Name already taken"
```

**Feature ON:**
```
User 1: "John Doe" → /p/john-doe ✅
User 2: "John Doe" → /p/john-doe-1 ✅
User 3: "John Doe" → /p/john-doe-2 ✅
```

### Returning User Detection

**Scenario 1: New User**
```typescript
Input: name="Jane", email="jane@new.com"
Output: "Thank you for signing! Check your email..."
```

**Scenario 2: Existing User**
```typescript
Input: name="Jane", email="john@existing.com" (already registered as "John")
Output: "Welcome back, John! We've sent you a login link..."
```

## Implementation Files

**Core Logic:**
- `src/polymet/data/api.ts:144-185` - Email detection
- `src/polymet/data/api.ts:191-222` - Slug collision handling
- `src/polymet/data/api.ts:226-308` - Profile creation
- `src/hooks/use-pledge-form.ts:24-49` - Form validation
- `src/polymet/pages/sign-pledge-page.tsx:8-27` - UX messaging
- `src/polymet/pages/auth-callback-page.tsx:31-67` - Redirect logic

**Configuration:**
- `src/lib/feature-flags.ts` - Feature flag system
- `.env.example` - Documentation

## Security Considerations

### Email Enumeration

**Current Behavior:**
Users can determine if an email is registered by trying to sign up.

**Risk Level:** LOW
- ✅ Industry standard (GitHub, LinkedIn do this)
- ✅ No sensitive data exposed
- ✅ Still requires magic link for access
- ✅ Appropriate for community/pledge app

**For High-Security Apps:**
Consider generic messaging: "Check your email. If registered, you'll receive a login link."

**When to Change:**
- 🚩 Users complain about privacy
- 🚩 Automated enumeration attempts detected
- 🚩 App handles sensitive data (health, finance)

### Mitigation Strategies
1. Rate limiting (Supabase provides this)
2. Monitor for enumeration patterns
3. Generic messaging (if needed later)

## Testing

### Manual Testing

**Test 1: Duplicate Names (Feature OFF)**
1. Register "Test User"
2. Try again with same name
3. ✅ Should see: "This name is already taken"

**Test 2: Duplicate Names (Feature ON)**
1. Enable `VITE_ALLOW_DUPLICATE_NAMES=true`
2. Register "Test User" 3 times with different emails
3. ✅ Should get: `/p/test-user`, `/p/test-user-1`, `/p/test-user-2`

**Test 3: Returning User**
1. Register as "John" with `john@example.com`
2. Try to sign up again with same email
3. ✅ Should see: "Welcome back, John!"

### Automated Tests
```bash
npm test  # 9/9 passing
npm run build  # Verifies TypeScript types
```

## Rollback

**Instant Rollback:**
```bash
VITE_ALLOW_DUPLICATE_NAMES=false
```
or remove the variable entirely.

**Code Rollback:**
All changes are backward compatible. No rollback needed for UX improvements.

## Console Logs

### Normal Operation
```
🔍 Checking if email has existing profile: user@example.com
✅ Email is new - no existing profile
🔤 Generated base slug: john-doe
✅ Slug "john-doe" is available
✅ Magic link sent successfully
```

### Collision Detected
```
🔍 Checking availability for slug: john-doe
🔍 Checking availability for slug: john-doe-1
✅ Slug "john-doe-1" is available
⚠️ Slug collision detected! URL had "john-doe" but database has "john-doe-1"
```

### Returning User
```
🔍 Checking if email has existing profile: john@example.com
✅ Found existing profile for email: John Doe
🔄 Returning user detected: John Doe
```

## Performance

**Additional Queries:**
- 1 email lookup per sign-up attempt (indexed, fast)
- 1-3 slug checks per registration (typically 1)
- Negligible performance impact

## Known Limitations

1. **Popular Names**: If >100 people have same name, uses timestamp fallback
2. **Race Conditions**: Extremely rare but database trigger handles it
3. **Email Enumeration**: Possible but acceptable trade-off for UX
4. **Timing Window**: If user submits form twice before clicking first email:
   - Second submission overwrites metadata
   - Profile created with LATEST data when email clicked
   - **Impact**: Very rare edge case, self-correcting
   - **Why acceptable**: Can't detect pending auth users from client-side

## Future Enhancements

**Optional Improvements:**
1. Batch slug checking (reduce DB queries)
2. Smart name suggestions on collision
3. Analytics dashboard for slug patterns
4. Generic messaging mode (privacy-focused)

## FAQ

**Q: Can users change their slug later?**
A: Yes, via profile settings. Slug updates when name changes.

**Q: What if someone registers 1000 "John Doe" accounts?**
A: Rate limiting prevents abuse. After 100 attempts, timestamps are used.

**Q: Is email enumeration a security risk?**
A: Low risk for this use case. Standard in industry. Monitor if concerned.

**Q: Do I need to enable the feature flag?**
A: No. Start with it OFF. Enable if you want to allow duplicate names.

**Q: Will this break existing profiles?**
A: No. Fully backward compatible. Existing profiles unaffected.

## Support

**Issues?**
1. Check browser console for error logs
2. Verify feature flag is set correctly
3. Test with incognito mode (clears localStorage)
4. Check Supabase dashboard for profile data

**Debugging:**
- Set `VITE_ALLOW_DUPLICATE_NAMES=true` to test duplicate names
- Check browser console for emoji-prefixed logs
- Verify database trigger is active in Supabase
