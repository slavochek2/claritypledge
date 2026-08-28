VERDICT: PASS

SCREENSHOT: 0dc296a370a00247e3bd03bf28295705a22f7fb2dd95bd8812c48d337df36905  features/verification/p1060/renders/round-5/A-org-signedout-desktop.png
SCREENSHOT: a5c4dcc472016bb3e096e325825e940b447199016c8ee4e0f0985d7f9ad6847f  features/verification/p1060/renders/round-5/B-org-signedin-member.png
SCREENSHOT: ad34f3ae1c8c75ad6f21b131d5508945e74513098ab9e5c219dff9e3fe1df039  features/verification/p1060/renders/round-5/C-org-320.png
SCREENSHOT: 7aed7de40ffe58ac2f7d90c1fd3c6a10c08d5e65a51436ccdc09ce9ad2f2f760  features/verification/p1060/renders/round-5/C2-org-375.png
SCREENSHOT: 3f4f54c9cfbfb75433e974478fe960d4c98685bc5fb40cdb5523f7a1321b1cb4  features/verification/p1060/renders/round-5/D-org-upcoming-empty-fallthrough.png
SCREENSHOT: 177c52de9b9d4136f60379600d185870b5ff8343c4f2860f2cd41d0c93d5226f  features/verification/p1060/renders/round-5/E-org-online-empty.png
SCREENSHOT: b84eea1da5d59d2904a320c977ec188da348b9e8ead1c34c3e420eb1a3a3234d  features/verification/p1060/renders/round-5/F-org-header-participants.png

## The defect from the prior round is gone

The previous round's failure was on D (the fall-through screen: Upcoming empty, Past non-empty),
where the "Past" pill carried the active-pill treatment (white fill, shadow, bold text) while
"Upcoming" carried the inactive/muted treatment — contradicted by the same control's correct
behaviour on the other two screenshots of it (E: both empty, Upcoming active; F: Upcoming
non-empty, Upcoming active).

In this round, all three screenshots of the Upcoming/Past control now agree:

- **D** (Upcoming (0) / Past (1)): "Upcoming (0)" carries the active treatment — white fill,
  border/shadow, bold dark text. "Past (1)" is flat, muted gray text on the gray track. Active pill
  now matches the tab that is actually being rendered below it (the "Nothing coming up yet" empty
  message, then the "Previously in ..." fall-through divider and the past event).
- **E** (Upcoming (0) / Past (0)): "Upcoming (0)" active, "Past (0)" inactive. Byte-identical to the
  prior round's E screenshot (same sha256: `177c52de9b9d4136f60379600d185870b5ff8343c4f2860f2cd41d0c93d5226f`)
  — this state needed no change and got none.
- **F** (Upcoming (1) / Past (1)): "Upcoming (1)" active, "Past (1)" inactive.

This is exactly the behaviour the reference specifies for the fall-through case ("The Upcoming
pill stays selected and stays honest... the page does not silently switch you to the Past tab"),
and it's now internally consistent across all three states rather than inverted in exactly the one
state that matters.

## Full checklist re-run, same hostility

- **Overflow / clipping at 320px and 375px (C, C2):** nothing crosses the viewport edge; every card,
  avatar tile, badge, divider and footer stays inside its column; borders and corner radii render
  fully. Identical layout behaviour to the previous round.
- **Truncated text:** none. The longest fixture name ("Clarity Practice Community · Past Only
  1787934171007-7965") wraps across 3–4 lines at both narrow widths rather than being cut.
- **Spacing / alignment between sibling cards (A, B, C, C2):** consistent padding, divider, and
  footer placement across all six directory cards; the height variance between cards with a
  blurb/avatar row and cards without one matches the reference's own screen-A mock and isn't scored
  as an orphan-weight defect.
- **Avatar-stack "+N" legibility:** still untestable — no screenshot in this round shows more faces
  than fit without a "+N" chip (max is 3-of-3, shown fully in B and F). Reporting as untested, not
  passed.
- **Empty states never print a bare "0" for participants:** D's "Nothing coming up yet" and E's
  "The first event is being planned" both render descriptive copy. Member counts do render literal
  "0" (the "Past Only" card shows "0 members"), matching the reference's own card in screen A — not
  scored as a violation, since the "never a zero" rule is specifically about the joined-events
  avatar row, which is correctly omitted wherever that count is zero.
- **Colour rule:** blue-500/600 used only for actions (Open, Join as member, links, the active-tab
  underline); green appears exactly once, on the "You're a member" badge in B; no amber, orange, or
  yellow anywhere. Purple/violet tones appear only inside person-avatar initials tiles (e.g. the
  "RM"/"MK"-style faces and the header user avatar), matching the reference's own use of a muted
  purple for a person avatar (`#8a6fb8`) — read as per-person identicon tinting, not a banned
  semantic colour.
- **Tabs vs. pills:** Events/Members/About render as underlined tabs (bottom border, no fill) in D,
  E, and F; Upcoming/Past render as filled pills inside a gray track in the same three screenshots.
  Two visibly different idioms throughout, correctly executed, and — per the fix above — now also
  correctly stateful.
- **Duplicated controls:** never more than one Join/Open action per screen or per card.
- **Hierarchy / "different product" check:** the header sequence (crumb → title → member count →
  optional avatar row → optional description → button → tabs → filter → content) is applied
  identically across D, E, and F; nothing reads as a different product from one screen to the next.
- **Contrast:** text-on-background contrast is unchanged from the prior round and remains readable
  throughout, including the muted secondary text and the inactive pill labels.

## Secondary, non-blocking note carried over from the prior round

The reference draws the blue "Join as member" action either absent from the header, or placed
*inside* the empty-events block (Screen E's mock has it under "Join and you'll be here when it's
announced," inside the dashed box, nowhere else). This build still places it as a persistent,
page-level element under the member count, above the tabs, on all three org-header screenshots
(D, E, F) — visible regardless of tab or filter state, never duplicated inside the empty box. No
clipping, no duplication, single correctly-styled blue CTA each time — reads as a legitimate
information-architecture choice rather than a defect, and it did not change between rounds. Not
counted toward the verdict; flagged only because the reference is authoritative for placement.

## Out of scope — observed, not counted

Same as the prior round: the past/upcoming event cards in D and F use a real grayscale photographic
banner where the reference's mock uses an abstract gradient placeholder labelled "banner." This is
the pre-existing shared event-card component per the task's scope note, so it isn't counted toward
the verdict.
