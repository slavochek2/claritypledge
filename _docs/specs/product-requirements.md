# Clarity Pledge - Functional Specifications

## Core Concept
A public commitment protocol to verify mutual understanding in conversations. Users sign a pledge, get a public profile, and invite others to "witness" (acknowledge) their commitment.

## User Journey & Flows

### 1. Sign & Onboarding
- **Entry**: Landing Page "Take the Pledge" button.
- **Action**: User provides Name, Email, Role (optional).
- **Outcome**:
    - User record created (Unverified).
    - Magic Link/Verification email sent.
    - Redirect to **Dashboard** (or show "Check Email" state).

### 2. Dashboard (Private Management)
**Route**: `/dashboard`
- **Access**: Private (requires session/auth).
- **Purpose**: Manage status and distribute the pledge.
- **Key Components**:
    - **Verification Status**:
        - *Unverified*: Prominent "Check your email" callout. Share tools disabled.
        - *Verified*: "Pledge Active" indicator.
    - **Stats**: Count of Witnesses, Count of Reciprocations (impact).
    - **Share Tools**:
        - Copy unique URL (`/p/[slug]`).
        - Social share buttons (LinkedIn/Twitter).
    - **Invite Endorsers**: Tool to send email invites.
    - **"View My Pledge"**: Link to Public Profile (Preview mode).

### 3. Public Profile (The "Certificate")
**Route**: `/p/[slug]` (or `/p/[id]`)
- **Access**: Public.
- **Purpose**: Display the commitment and collect witnesses.
- **Components**:
    - **The Pledge**: Static text of the commitment.
    - **Signer Info**: Name, Role, Date Signed.
    - **Witness List**: Grid of people who have acknowledged.
    - **Visitor Actions (Visitor View)**:
        - **Witness**: "I accept this right" (Name input -> Add to list).
        - **Reciprocate**: "Start my own pledge" (Redirect to Sign flow with referrer).

### 4. Profile Preview (Owner View)
**Route**: `/p/[slug]` (when viewed by Owner)
- **Access**: Private (Owner only).
- **Purpose**: See what others see.
- **Components**:
    - Identical to Public Profile.
    - **Difference**: Instead of "Witness" form, show "You are viewing your own pledge" indicator.
    - *Note*: Should link back to Dashboard for editing/sharing tools.

## Data & Logic Rules
- **Verification**: Profile is not "Live" (indexed/searchable) until email verified.
- **Slugs**: derived from Name, unique.
- **Witnessing**: No auth required for witnesses. Name is required.
- **Session**: Cookie/LocalStorage based auth for Owners.

## Known Inconsistencies (To Resolve)
1.  **Duplicate Management Tools**:
    -   *Current*: The Owner View of the Profile (`/p/[id]`) contains Share Tools and Invite logic (`ProfileOwnerView`).
    -   *Spec*: These should live primarily on the **Dashboard**. The Profile Owner View should be a clean "Preview" to minimize clutter and distinguish "working" vs "viewing" modes.
2.  **Redirect Flow**:
    -   *Current*: `AuthCallbackPage` redirects to `/p/[slug]` (Profile) instead of `/dashboard`.
    -   *Current*: `SignPledgePage` redirects to `/` (Home) instead of a dedicated "Check Email" page or state.
3.  **Route Clarity**:
    -   The application currently mixes "Profile Owner View" logic inside the public profile route components, making it "heavier" than a simple preview.
