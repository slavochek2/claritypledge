# Signup Experience Improvement Plan

## User Request
Improve the signup experience to feel like signing a "Digital Contract" with:
- Modal that looks like a physical paper document/certificate
- Editorial manifesto aesthetic (Playfair Display + Inter)
- Paper texture background (#FDFBF7), Dark Charcoal text (#1A1A1A), International Blue accent (#0044CC)
- "Sign & Seal" button with wax seal animation
- Verification status system (Unverified → Verified)
- Enhanced profile page with avatar initials

## Related Files
- @/polymet/components/sign-pledge-form (to redesign with contract aesthetic)
- @/polymet/components/pledge-modal (to update modal styling)
- @/polymet/components/profile-certificate (to enhance with verification status)
- @/polymet/components/profile-owner-view (to add verification badge)
- @/polymet/components/profile-visitor-view (to add verification badge)
- @/polymet/pages/clarity-pledge-landing (to update post-sign flow)

## TODO List
- [x] Update pledge-card to show unsigned template state
- [x] Redesign profile-certificate with full pledge text from pledge-card
- [x] Add avatar and verification badge to profile-certificate
- [x] Update profile-owner-view to use new certificate
- [x] Update profile-visitor-view to use new certificate
- [x] Test consistency across landing and profile pages

## Important Notes
- Typography: Playfair Display for headlines, Inter for body
- Colors: #FDFBF7 (paper), #1A1A1A (ink), #0044CC (blue accent)
- Design: Editorial manifesto meets digital treaty
- Animation: Wax seal/stamp effect on "Sign & Seal"
- Status: Unverified (grey badge) → Verified (after email confirmation)

  
## Plan Information
*This plan is created when the project is at iteration 9, and date 2025-11-25T12:44:01.055Z*
