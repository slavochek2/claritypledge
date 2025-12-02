# UX Spec: Landing Page Hero Improvements

**Date:** 2025-12-02
**Status:** Draft - Awaiting Approval
**Scope:** Hero section of landing page (above the fold)

---

## Problem Statement

User feedback indicates the current landing page hero has clarity and focus issues:

1. **Headline unclear** - "Prevent dangerous misunderstandings" uses a "loaded word" (dangerous)
2. **Subhead disconnected** - Introduces new concept (repeat-back behavior) without connecting to headline
3. **Competing CTAs** - "Take the Pledge" + "Read Manifesto" split user attention
4. **False affordances** - Rework/Mistakes/Mistrust pills look clickable but aren't
5. **Negative framing** - Triple-negative pills create anxiety, not aspiration
6. **Social proof buried** - "Why people pledged" section is below the fold when it should build trust early

---

## Current State

```
[Headline]     "Prevent dangerous misunderstandings"

[Subhead]      "Asking to repeat back what you understood feels rude
                and awkward. Fix it with the Clarity Pledge."

[Pills]        [ Rework ] [ Mistakes ] [ Mistrust ]

[CTAs]         [Take the Pledge]  [Read Manifesto]

[Trust]        "Free • Join the movement • Less than 30 seconds"
```

---

## Proposed Changes

### 1. Headline

**Before:** "Prevent dangerous misunderstandings"

**After:** "Achieve clarity. Prevent misunderstandings."

**Rationale:**
- "Achieve clarity" ties to brand name (Clarity Pledge)
- Positive framing first, then problem it solves
- Removes "dangerous" which felt alarmist to users
- Two short declarative statements = punchy and memorable

---

### 2. Subhead

**Before:** "Asking to repeat back what you understood feels rude and awkward. Fix it with the Clarity Pledge."

**After:** "A public commitment to verify understanding - so nobody has to guess."

**Rationale:**
- Explains WHAT the pledge is (public commitment)
- Explains WHAT you do (verify understanding)
- Explains WHY it matters (no guessing)
- Single sentence, no competing concepts
- Directly supports the headline's promise

---

### 3. Pills (Rework / Mistakes / Mistrust)

**Action:** REMOVE entirely

**Rationale:**
- Look like buttons but aren't (broken affordance)
- Triple-negative framing creates anxiety
- Adds visual clutter at the decision moment
- If consequences are important, show them via testimonials lower on page

---

### 4. CTAs

**Before:** Two buttons - "Take the Pledge" + "Read Manifesto"

**After:** Single button - "Take the Clarity Pledge"

**Rationale:**
- One hero = one action (conversion best practice)
- "Take the Clarity Pledge" is more specific than "Take the Pledge"
- "Read Manifesto" can move to:
  - Navigation menu
  - Secondary section below the fold
  - Text link under CTA if needed ("or read our manifesto first")

---

### 5. Social Proof Placement

**Before:** "Why people took the pledge" section is far below the fold

**After:** Add compact social proof strip as Section 2 (immediately after hero)

**Suggested format:**
```
"5,247 professionals have pledged. Here's why:"
[Compact testimonial cards - 3-4 reasons with names/faces]
```

**Rationale:**
- People trust people
- Before understanding WHAT you offer, visitors want to know WHO found it valuable
- Social proof reduces friction before the explanation sections

---

## Proposed Page Structure

| Section | Content |
|---------|---------|
| 1. Hero | Headline + Subhead + Single CTA + Trust badges |
| 2. Social Proof | Compact "why people pledged" strip |
| 3. What is the Pledge | Example pledge, explanation |
| 4. Why It Matters | Philosophical depth ("illusion of shared reality" content) |
| 5. CTA Repeat | Secondary conversion opportunity |

---

## Visual Mockup (Text)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│         Achieve clarity. Prevent misunderstandings.     │
│                                                         │
│    A public commitment to verify understanding -        │
│              so nobody has to guess.                    │
│                                                         │
│              ┌───────────────────────┐                  │
│              │ Take the Clarity Pledge│                  │
│              └───────────────────────┘                  │
│                                                         │
│         ✓ Free  •  ✓ Join the movement  •  ✓ 30 sec    │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  "5,247 professionals have pledged. Here's why:"       │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Reason 1 │  │ Reason 2 │  │ Reason 3 │              │
│  │ - Name   │  │ - Name   │  │ - Name   │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

---

## Content to Relocate

| Current Location | Content | New Location |
|------------------|---------|--------------|
| Hero | "Read Manifesto" button | Navigation or section below fold |
| Hero | Rework/Mistakes/Mistrust pills | REMOVE (or testimonials if needed) |
| Below fold | "Why people pledged" | Section 2 (compact strip) |
| Pledge example header | "Break the Illusion..." + philosophical text | "Why It Matters" section (Section 4) |

---

## Open Questions

1. **Trust badges:** Keep "Free • Join the movement • Less than 30 seconds" as-is?
2. **Social proof count:** Do we have real numbers to show? If not, use qualitative ("Professionals from Google, Meta, startups...")
3. **Mobile:** How does single CTA + social proof strip adapt on mobile?

---

## Implementation Notes

- Changes are copy/layout only - no new components needed
- Social proof strip may need a new compact component variant
- Test both versions if possible (A/B test headline variants)

---

## Approval

- [ ] Copy approved
- [ ] Layout approved
- [ ] Ready for implementation
