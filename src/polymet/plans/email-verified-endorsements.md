# Email-Verified Endorsements Plan

## User Request
Implement email verification for endorsements to prevent spam/abuse (fake names like "Bill Gates" or offensive text), while maintaining viral loop by auto-registering endorsers and allowing users to invite others via email.

## Related Files
- @/polymet/data/mock-profiles (update) - Add pending endorsements tracking
- @/polymet/components/witness-card (update) - Add email field, show pending state
- @/polymet/pages/verify-endorsement-page (create) - New page for endorsement verification
- @/polymet/components/profile-owner-view (update) - Add invite feature
- @/polymet/components/invite-endorsers (create) - Email invite component
- @/polymet/prototypes/clarity-pledge-app (update) - Add endorsement verification route

## TODO List
- [x] Update mock-profiles data structure for pending endorsements
- [x] Update witness-card to collect email + show pending state
- [x] Create verify-endorsement-page for magic link verification
- [x] Create invite-endorsers component for registered users
- [x] Update profile-owner-view to include invite feature
- [x] Update profile-visitor-view to show pending endorsements
- [x] Add verification route to prototype
- [x] Update witness list to show verified vs pending

## Important Notes
- **Security**: Email verification prevents spam and fake names
- **Virality**: Every endorser gets auto-registered with their own profile
- **UX Flow**: Enter name+email → Magic link → Verified + Auto-profile created
- **Invite System**: Registered users can email-invite specific people
- **Pending State**: Show "Pending verification" for unverified endorsements
- **Growth Engine**: Converts endorsers into potential pledge signers
  
## Plan Information
*This plan is created when the project is at iteration 29, and date 2025-11-25T14:11:26.585Z*
