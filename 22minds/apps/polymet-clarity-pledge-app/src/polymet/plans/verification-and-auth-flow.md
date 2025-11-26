# Verification and Auth Flow Implementation

## User Request
Implement comprehensive authentication and verification system:
1. Add sign out functionality for logged-in users
2. Implement email verification flow with unverified/verified states
3. Show verification badge on profiles
4. Create public "Who Signed the Pledge" page showing only verified users
5. Rename "Who Took the Pledge" to "Who Signed the Pledge"

## Related Files
- @/polymet/data/mock-profiles (update) - Add verification helper functions
- @/polymet/components/clarity-navigation (update) - Add sign out button for logged-in users
- @/polymet/components/profile-owner-view (update) - Add verification banner/toast
- @/polymet/components/profile-certificate (update) - Add verification badge
- @/polymet/components/signature-wall (update) - Rename to "Who Signed the Pledge"
- @/polymet/pages/signatories-page (create) - New dedicated page for verified signatories
- @/polymet/prototypes/clarity-pledge-app (update) - Add route for signatories page

## TODO List
- [x] Update mock-profiles data to add verification helper function
- [x] Update clarity-navigation to show sign out for logged-in users
- [x] Update profile-owner-view to show verification banner for unverified users
- [x] Update profile-certificate to show verification badge (already had support)
- [x] Update signature-wall component title to "Who Signed the Pledge"
- [x] Create signatories-page showing only verified users
- [x] Update prototype to add /signatories route
- [x] Update sign-pledge-form to set current user on signup
- [x] Update login-form to set current user on login
- [x] Create verify-email-page for simulating email verification
- [x] Add verification simulation button to profile-owner-view
- [x] Test the complete verification flow

## Important Notes
- Verification State: Users start as "unverified" after signing
- Verification Badge: Grey for unverified, Blue/Gold for verified
- Public Display: Only verified users appear on public signatories page
- Sign Out: Should clear session and redirect to landing page
- Magic Link: Simulated - clicking email link updates isVerified to true

  
## Plan Information
*This plan is created when the project is at iteration 19, and date 2025-11-25T13:25:33.571Z*
