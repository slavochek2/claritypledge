# Clarity Pledge Viral Engine

## User Request
Build the "Sign" flow and "Profile" system to create a viral reciprocity loop. This includes:
1. Enhanced sign/login interactions on landing page
2. Personal profile pages with owner/visitor states
3. Frictionless witnessing system
4. Viral reciprocation hooks

## Related Files
- @/polymet/components/pledge-modal (to update) - Add sign form with name, email, role fields
- @/polymet/components/sign-pledge-form (to create) - New form component for signing
- @/polymet/components/login-form (to create) - Magic link login form
- @/polymet/pages/clarity-pledge-landing (to update) - Integrate new sign/login flows
- @/polymet/pages/profile-page (to create) - Dynamic profile page with owner/visitor states
- @/polymet/components/profile-owner-view (to create) - Dashboard for profile owners
- @/polymet/components/profile-visitor-view (to create) - Visitor view with witness action
- @/polymet/components/witness-card (to create) - Frictionless witness interaction
- @/polymet/components/reciprocation-card (to create) - Viral hook after witnessing
- @/polymet/components/profile-certificate (to create) - Certificate display component
- @/polymet/components/witness-list (to create) - Grid of witness names
- @/polymet/components/share-tools (to create) - Copy link and social share buttons
- @/polymet/data/mock-profiles (to create) - Mock profile data
- @/polymet/prototypes/clarity-pledge-app (to update) - Add profile route

## TODO List
- [x] Create mock profile data
- [x] Create sign pledge form component
- [x] Create login form component
- [x] Update pledge modal to use new sign form
- [x] Create profile certificate component
- [x] Create witness list component
- [x] Create share tools component
- [x] Create profile owner view component
- [x] Create witness card component
- [x] Create reciprocation card component
- [x] Create profile visitor view component
- [x] Create profile page with dynamic states
- [x] Update landing page to integrate new flows
- [x] Update prototype to add profile route

## Important Notes
- Use existing design system: Playfair Display for headlines, Inter for body
- Color palette: #FDFBF7 background, #1A1A1A text, #0044CC accent
- Frictionless witnessing: < 5 seconds, no email required
- Profile URL pattern: /p/[id]
- Owner vs Visitor states determined by session (mock with URL param for demo)
- Seamless flow from sign to profile page
- Reuse existing components where possible

  
## Plan Information
*This plan is created when the project is at iteration 1, and date 2025-11-25T11:49:25.908Z*
