# Polymet.ai Prompt: Clarity Pledge (UX Refactor & Viral Loop)

## Context
You have the current codebase for the **Clarity Pledge** landing page.
We need to **refactor the "Sign Up" flow** to make it feel less like a SaaS registration and more like a solemn "Digital Treaty," while implementing a "Lean MVP" verification strategy.

---

## 1. Refactor: The "Sign Up" Experience
**Current State:** Clicking "Take Pledge" opens a generic form.
**New Requirement:** Replace this with a **"Digital Contract" Modal**.

### The "Contract" Modal Specs
*   **Visual:** The modal should look like a physical piece of paper or a certificate.
*   **Content:**
    *   **Header:** "I, [ Input Name ], hereby promise..."
    *   **Body:** Display the Short Pledge Text (from the landing page).
    *   **Footer:**
        *   "Signed with [ Input Email ]"
        *   "LinkedIn Profile (Optional)" (Text input, for manual verification later).
    *   **Action Button:** "Sign & Seal" (Triggers a "Stamping" animation instead of a generic spinner).
*   **UX Goal:** The user should feel like they are *signing a document*, not *submitting a form*.

---

## 2. New Logic: Identity & Verification (Lean MVP)
**Constraint:** We are **NOT** allowing photo uploads yet (too much friction/complexity).

### A. Avatar Strategy
*   **Implementation:** Use **Generated Initials** on colored backgrounds for all user avatars.
    *   Example: "Vyacheslav Ladischenski" -> "VL" on Navy Blue background.
    *   Style: High contrast, elegant typography.

### B. Verification State (Magic Link)
*   **Post-Sign Behavior:**
    *   Redirect user immediately to their new **Profile Page** (`/p/[id]`).
    *   **Initial State:** Show an **"Unverified" Badge** (Grey) next to their name.
    *   **Notification:** Show a toast/banner: "Please check your email to verify your signature."
*   **Verified State:**
    *   User clicks email link -> Status updates to **"Verified"** (Blue/Gold Badge).
    *   **Only Verified users** appear on the public "Wall of Clarity."

---

## 3. New Page: The Personal Profile (`/p/[id]`)
**Context:** This is the page created for every signer.

### View A: The Owner (Me)
*   **Header:** "Your Pledge is Waiting." (if unverified) / "Your Pledge is Live." (if verified).
*   **Primary Action:** **"Share" Card**.
    *   "Copy Link"
    *   "Share to LinkedIn"
*   **Security:** Allow them to "Edit" or "Delete" (simple actions).

### View B: The Visitor (Someone else)
*   **Header:** "[Name] has taken the Clarity Pledge."
*   **Primary Action:** **"Witness this Pledge"**.
    *   A simple button that increments a "Witness Counter" (Social Proof).
    *   *Micro-interaction:* "I witness this." (Click) -> "Witnessed!" (Count +1).
*   **Viral Hook:** "Inspired? Take the Pledge yourself." (Links back to Home).

---

## 4. Design System Updates
*   **Aesthetics:** Maintain the "Editorial/Newspaper" vibe.
*   **Typography:** Use the existing Serif for headers, Sans-Serif for UI text.
*   **Colors:**
    *   **Unverified:** Grey / Muted.
    *   **Verified:** International Blue (#0044CC) or Seal Red.

## Summary of Changes
1.  **Delete** the old "Sign Up" form.
2.  **Build** the "Digital Contract" Modal.
3.  **Implement** "Initials Avatar" component.
4.  **Build** the Profile Page with Owner/Visitor states.
