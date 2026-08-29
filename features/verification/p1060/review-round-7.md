VERDICT: PASS

SCREENSHOT: 8c784b22d824903ca16c404f074ea190dda676eacb5be9b890f982935302be8f  features/verification/p1060/renders/round-7/A-org-signedout-desktop.png
SCREENSHOT: b34de76301575e1544468e58a6b8766f5dd1737dc5e147f134f6c3f0a5d7fa78  features/verification/p1060/renders/round-7/B-org-signedin-member.png
SCREENSHOT: 25a02cbe5df1712e73f72923d0b2481772252e1997d394d2c55893a9fa022398  features/verification/p1060/renders/round-7/C-org-320.png
SCREENSHOT: 8e46eba15093b80b8098ca306371be210f89966630bf55a888d436479424f2b1  features/verification/p1060/renders/round-7/C2-org-375.png
SCREENSHOT: 7293c78c3c325fabf374e8de4933eb79e45857c5b592c6cbf7ce5d3d0f843ef4  features/verification/p1060/renders/round-7/D-org-upcoming-empty-fallthrough.png
SCREENSHOT: 177c52de9b9d4136f60379600d185870b5ff8343c4f2860f2cd41d0c93d5226f  features/verification/p1060/renders/round-7/E-org-online-empty.png
SCREENSHOT: 75b7f80b11e36636a729f90900c7d2529184c1f65bf671865dcda82dfdd57e34  features/verification/p1060/renders/round-7/F-org-header-participants.png

## The "+N" overflow chip — now testable, and it passes, pixel-sampled not eyeballed

This round's fixture finally puts 7 participants on the "Sample" org (up from 3 in prior rounds),
so the avatar stack now overflows and draws a "+2" chip after 5 faces. I did not just eyeball it —
I wrote a small stdlib-only PNG decoder (no ImageMagick/PIL available in this environment) to crop
the exact avatar-stack region out of the original, unscaled screenshot bytes and re-render it at
8–10x nearest-neighbor zoom, then separately sampled raw pixel colour values along scanlines
through the stack to confirm where the last avatar's fill actually ends versus where the chip's
glyph pixels begin.

- **A (card, desktop):** cropped region shows "AI · GH · RN · K. · BL" then a clean gap, then a
  light-gray circular chip with "+2" fully formed — both the "+" and the "2" are complete glyphs,
  not truncated, not overlapped by the red "BL" avatar.
- **C (320px):** same crop, same avatar pixel size (verified — see below), same result: "+2" fully
  legible, same clean gap before it.
- **F (header participant row):** pixel-sampled the outer blue-ring vertical extent of the first
  avatar at x=678,y=596–635 in A versus x=136,y=176–215 in F: both measure ~39px diameter. The
  header row is not a scaled-down variant of the card row, it's the same size — and at that size
  the "+2" chip is, again, fully legible with a clear gap from the last avatar, confirmed the same
  way as A.
- A horizontal scanline through the row (y=617 in A) confirms the red "BL" fill and its ring border
  end by ~x=777, plain background runs to ~x=790, and the chip's darker glyph-stroke pixels don't
  appear until ~x=793 onward — i.e. there is real separation between the last avatar and the "+"
  character, not a one-pixel overlap that would only show up under zoom.

Reporting this as **passed**, not untested — this is the first round where the fixture data
actually exercises the chip, and it holds up under pixel inspection at three different contexts
(card/desktop, card/320px, header).

## The Upcoming/Past pill control — still correct, checked the same way as before

- **D** (Upcoming (0) / Past (1)): "Upcoming (0)" carries the active-pill treatment (white fill,
  border, bold dark text); "Past (1)" is flat/muted. Matches the content below it (the "Nothing
  coming up yet" empty message, then the "Previously in ..." fall-through divider and past event).
- **E** (Upcoming (0) / Past (0)): "Upcoming (0)" active, "Past (0)" inactive. Byte-identical to
  the last round's E screenshot (same sha256, `177c52de9b9d4136f60379600d185870b5ff8343c4f2860f2cd41d0c93d5226f`)
  — this state hasn't been touched since the fix and remains correct.
- **F** (Upcoming (1) / Past (1)): "Upcoming (1)" active, "Past (1)" inactive.

All three agree with each other and with the content rendered beneath each: no state where the
highlighted pill contradicts what's on screen. The fix from the earlier round has held.

## Rest of the eleven-check pass, same hostility as before

- **Overflow / clipping at 320px and 375px (C, C2):** nothing crosses the viewport edge. The new,
  wider avatar-stack-plus-count line ("[5 avatars][+2] 7 have joined events") wraps cleanly onto a
  second/third line next to or under the stack at both widths rather than overflowing or clipping.
- **Truncated text:** none; long fixture names still wrap fully.
- **Spacing/alignment between sibling cards (A, B, C, C2):** unchanged from prior rounds and still
  consistent.
- **Empty states never print a bare "0" for participants:** D and E both show descriptive copy, not
  a digit. Member counts (e.g. "0 members" on the Past-Only card) still render as literal numbers,
  matching the reference's own card in screen A — not scored as a violation for the reasons given
  in the last two rounds.
- **Colour rule:** blue-500/600 for actions only; green appears once, on "You're a member" in B; no
  amber/orange/yellow anywhere as a UI/status colour. The new fifth avatar ("BL") is a red/pink
  fill (sampled ~rgb(244,66,97), a rose-red, not orange) — read as per-person identicon tinting,
  same category as the purple/indigo/teal avatars already present and the terracotta-toned avatar
  the reference itself uses for one of its own mock people (`#c07a5c`). Not counted as a violation.
- **Tabs vs. pills:** Events/Members/About still render as underlined tabs; Upcoming/Past still
  render as filled pills in a gray track, in D, E, and F. Correctly differentiated everywhere.
- **Duplicated controls:** still only one Join/Open action per screen or card.
- **Hierarchy / "different product" check:** header sequence unchanged and consistent across D, E,
  F; nothing reads as a different product between screens.
- **Contrast:** unchanged, readable throughout, including the new avatar initials against their
  fill colours ("K." on teal, "BL" on red — both light-on-dark and legible).

## Secondary, non-blocking note carried over from prior rounds

Still true and still not counted toward the verdict: the blue "Join as member" button remains a
persistent, page-level element under the member count on D, E, and F, rather than only appearing
inside the empty-events block the way the reference draws it for the fully-empty case. No
duplication, no clipping, unchanged since the note was first raised.

## Out of scope — observed, not counted

Same as prior rounds: the past/upcoming event card in D and F uses a real grayscale photographic
banner where the reference's mock uses an abstract gradient placeholder. Pre-existing shared
event-card component per the task's scope note — not counted toward the verdict.
