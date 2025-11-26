# Polymet.ai Prompt: Clarity Pledge (Viral Engine Update)

## Project Status Update
We have an existing Landing Page with the Manifesto, a "See Who Pledged" list, and a "Take Pledge" button.
**Goal:** Build the "Sign" flow and the "Profile" system to create a **Viral Reciprocity Loop**.

## Required Changes

### 1. Enhance Landing Page (Home)
*   **Retain:** The existing Manifesto copy and "Who Pledged" list.
*   **BUILD: The "Sign Pledge" Interaction:**
    *   **Trigger:** When the "Take Pledge" button is clicked...
    *   **Action:** Open a clean **Modal** (Dialog) or scroll to a dedicated **Sign Section**.
    *   **Form Fields:** Name, Email, Role (Optional).
    *   **Primary Button:** "Sign & Create Profile".
    *   **Success Behavior:** Redirect user to their new **Personal Profile Page** (`/p/[id]`).

*   **BUILD: The "Login" Interaction:**
    *   **Location:** Add a small, secondary link below the Sign Form (or in the Nav/Footer): "Already Pledged? Login".
    *   **Action:** Switches the form to a "Login" state (Email only).
    *   **Behavior:** "Send me a Magic Link" (Visual feedback only for UI).

### 2. Create New View: The Personal Profile Page (`/p/[id]`)
*   **Context:** This is the new dynamic page generated for each signer.
*   **Visual Metaphor:** A digital treaty or certificate. Consistent with the Landing Page typography but more "official."
*   **Global Element:** Small "Is this you? Login" link in footer/header for Owners viewing on a new device.

#### STATE A: OWNER VIEW (When User ID matches Session Cookie)
*   **Header:** "Your Clarity Pledge is Live."
*   **Dashboard Section (Top):**
    *   **Stats Cards:** "Witnesses" (Count) | "Impact" (Reciprocations).
    *   **Share Tools (Prominent):**
        *   **Primary Action:** "Copy Invite Link".
        *   **Social Buttons:** LinkedIn, Slack.
*   **The Certificate:** Display the static pledge text (reuse components from Landing if available).
*   **Witness List:** Grid of names.

#### STATE B: VISITOR VIEW (When User ID != Session Cookie)
*   **Header:** "[Name] has taken the Clarity Pledge."
*   **The Promise (Hero Text):** Large, serif typography.
    > "I grant you the right to verify my understanding. I promise not to judge you for asking."

*   **Interaction A: The Witness Action (Primary):**
    *   **Constraint:** ZERO FRICTION. No email input.
    *   **UI:** A distinct card "Do you accept this right?"
    *   **Input:** "Your Name" text field.
    *   **Button:** "I Witness This Pledge" (or "Acknowledge").
    *   **Helper:** Tooltip: "You are simply acknowledging [Name]'s commitment. No account required."
    *   **Micro-interaction:** When clicked, show "Stamping" animation, add name to list.

*   **Interaction B: The Reciprocation (Viral Hook):**
    *   **Trigger:** Visible after witnessing.
    *   **Card:** "Clarity works best when it's mutual."
    *   **Button:** "Start My Own Pledge."
    *   **Action:** Redirects to the **Home Page Sign Form**, passing the current Profile ID as a `?referrer=` param.

---

## Design System Constraints
*   **Consistency:** Use the same fonts and color palette as the existing Landing Page.
*   **Typography:**
    *   Headlines: **Editorial Serif** (Playfair Display).
    *   Body: **Clean Sans-Serif** (Inter).
*   **Palette:**
    *   Background: Off-white / Paper texture (#FDFBF7).
    *   Ink: Dark Charcoal (#1A1A1A).
    *   Accent/Action: **International Blue** (#0044CC) or **Seal Red**.
*   **Components:** Reuse existing Button and Input components if they exist.

### Key Micro-Interactions
*   **The "Witness" Moment:** Show a visual "Seal" appearing. Increment counter instantly.

---

## Success Criteria for UI
1.  **Seamless Integration:** The transition from "Sign Form" (Home) to "Profile Page" must feel like one continuous flow.
2.  **Frictionless Witnessing:** < 5 seconds.
3.  **Clear Owner vs. Visitor State:** Owners see "Share," Visitors see "Witness."
