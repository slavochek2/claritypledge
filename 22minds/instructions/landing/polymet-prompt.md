# Polymet.ai Prompt: Clarity Pledge Landing Page

## Project Brief
Create a single-page landing site for **The Clarity Pledge**—a public commitment protocol that makes it culturally normal to verify mutual understanding in conversations.

---

## Content Source
Use the attached file `landing-copy-final.md` as the complete content specification. All headlines, body copy, and CTAs are defined in that document.

---

## Design Direction

### 1. Visual Style
**Aesthetic:** Editorial Manifesto meets Modern SaaS
- **Typography:** High-contrast, newspaper-style editorial fonts (think *The New York Times* or *Medium*)
  - Headlines: Bold, serif, large (48-72px desktop, 36-48px mobile)
  - Subheadlines: Medium weight, 24-32px
  - Body: Sans-serif, highly readable (18-22px with 1.6-1.8 line height)
  - **Critical: Ensure body text is never smaller than 18px on desktop, 16px on mobile**
- **Color Palette:**
  - Primary: Deep navy or charcoal (trust, seriousness)
  - Accent: Bright amber or electric blue (urgency, clarity)
  - Background: Clean white with subtle texture (like paper grain)
- **Tone:** Professional, bold, slightly rebellious—this is a *movement*, not a product.

### 2. Layout & Structure

#### Navigation (Sticky Header)
- **Fixed position** at the top
- **Logo (left):** "Clarity Pledge" wordmark
- **Center links:** The Manifesto | How It Works | The Wall
- **Right:** Primary CTA button ("Take the Pledge") in accent color
- Should shrink/collapse elegantly on scroll

#### Hero Section (Section 1)
- **Full viewport height**
- **Headline hierarchy:**
  1. Main headline: Largest, center-aligned
  2. Subheadline: Medium weight, slightly smaller
  3. Dynamic text: Animated rotation of "[Comfort] [Fear] [Ego]"
- **Two CTAs:**
  - Primary: Large button ("Take the Pledge")
  - Secondary: Text link ("Read the Manifesto")
- **Visual suggestion:** Abstract geometric background (clean lines, not busy)

#### Section 2: The Clarity Tax (Icon Grid)
**Critical Design Direction:**
- **Replace the paragraph of consequences with a clean icon grid**
- **Layout:** 5 icons in a horizontal row (or 2 rows of 2-3 on mobile)
- **Each icon shows:**
  - Simple, elegant line icon (not cartoon-style)
  - Single word below: Rework | Mistakes | Conflicts | Mistrust | Failure
- **Style:** Minimalist icons in accent color, words in dark gray
- **Purpose:** Make the consequences immediately scannable, not a wall of text

#### The Pledge Card (Section 3) — **HERO ELEMENT**
This is the most important visual component. It should feel like a **physical artifact**.

**Design Treatment:**
- **Card Title at Top:** "THE CLARITY PLEDGE" in all caps, centered, medium size (makes it instantly clear what this is)
- **Card-style container** with:
  - Subtle shadow or border (like a certificate)
  - Slight elevation (feels tangible)
  - Background color distinct from page (e.g., cream or light gray)
  - Corner decorative elements (see mockup reference for bracket-style corners)
- **Typography:**
  - "YOUR RIGHT" and "MY PROMISE" as bold section headers in accent color
  - Body text in serif font (formal, contractual)
  - Bottom right: "Est. 2025" in small italic text
- **Interaction:** Consider a subtle hover effect (lift/glow) to suggest it's "signable"
- **Visual metaphor:** This should look like something you'd frame or share as a screenshot

#### The Wall (Section 7)
- **Grid layout:** 3-4 columns on desktop, 1-2 on mobile
- **Each signature card includes:**
  - Name (bold)
  - Role/Title (lighter)
  - "Why I Joined" quote (italic)
- **Visual treatment:** Simple cards with avatars (use placeholder initials if no photos)
- **Load more pattern:** Show 6-9 initially, then "View All Signatories" button

#### Section 4: How It Works
**Critical Design Direction:**
- **Layout:** Three equal-width columns on desktop, stacked on mobile
- **Icons:** Simple, elegant, minimal line icons (NOT colorful cartoon-style icons)
  - Icon 1: Shield (psychological safety)
  - Icon 2: Two-way arrows or handshake (mutual understanding)
  - Icon 3: Circular arrows (reciprocity loop)
- **Style:** Icons should be sophisticated and professional, not playful
- **Each column:** Icon at top, heading below, body text below that

#### FAQ Section (Section 8)
- **Accordion pattern** (expandable Q&A)
- Start with all collapsed except the first one
- Clean, minimal styling

### 3. Interactions & Motion

**Scroll Behavior:**
- Smooth scroll when clicking navigation links
- Fade-in animations for sections as they enter viewport (subtle, not distracting)

**CTA Buttons:**
- **Primary CTA** ("Take the Pledge"): Should open a modal or slide-in form
  - Form fields: Name, Email, Role (optional), "Why are you joining?" (textarea)
  - Submit button: "Sign the Pledge"
- **Secondary CTA** ("Read the Manifesto"): Smooth scroll to Section 6

**Dynamic Text (Hero):**
- Rotate words "[Comfort] [Fear] [Ego]" every 2-3 seconds with a fade transition

### 4. Responsive Design
- **Mobile-first approach**
- **Breakpoints:**
  - Mobile: < 768px (single column, larger touch targets)
  - Tablet: 768-1024px (2 columns where appropriate)
  - Desktop: > 1024px (full layout)
- **Navigation on mobile:** Hamburger menu

### 5. Technical Considerations
- **Performance:** Optimize for fast load (< 3 seconds)
- **Accessibility:** WCAG AA compliant
  - Proper heading hierarchy (H1 → H2 → H3)
  - Color contrast ratios
  - Keyboard navigation support
- **SEO:** Include meta tags for social sharing (Open Graph, Twitter Cards)

---

## Special Instructions

1. **The Pledge Card is the centerpiece.** Everything else supports it.
2. **Avoid "startup clichés":** No gradient meshes, no 3D illustrations, no overly playful animations. This is serious work.
3. **White space is your friend:** Don't crowd the page. Let the copy breathe.
4. **The Wall matters:** Social proof is critical—make the signature grid prominent and easy to scan.

---

## Success Criteria
A visitor should:
1. Understand what the Pledge is within 5 seconds
2. Feel the emotional weight of the commitment (this is not trivial)
3. See who else has signed (social proof)
4. Have a clear path to sign it themselves

---

## Files to Upload with This Prompt
- `landing-copy-final.md` (all content and structure)
- This prompt file (design specifications)

