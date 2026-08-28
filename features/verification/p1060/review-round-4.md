VERDICT: FAIL

SCREENSHOT: d682ece36051cb2c4f1948746b876be770b9f077ac93a238656f713622295b43  features/verification/p1060/renders/round-4/A-org-signedout-desktop.png
SCREENSHOT: 4f738febbd32d3c3444d5c9b348cb4e48398f6b795c0c531dbde3a08085d3d29  features/verification/p1060/renders/round-4/B-org-signedin-member.png
SCREENSHOT: 932ba6eda9562c1aeb8407cdb2e476c6db3db53086b49a7a9b901fc7a887b5fa  features/verification/p1060/renders/round-4/C-org-320.png
SCREENSHOT: 77c5b1a06f1575863f5c601380fd04ee818021a97a8ec170bc7b1401ff9477c8  features/verification/p1060/renders/round-4/C2-org-375.png
SCREENSHOT: 54e0939c0173c1c79117085a447c34b6b32b878f04000d8c6e8e7ffe7ecfc5e9  features/verification/p1060/renders/round-4/D-org-upcoming-empty-fallthrough.png
SCREENSHOT: 177c52de9b9d4136f60379600d185870b5ff8343c4f2860f2cd41d0c93d5226f  features/verification/p1060/renders/round-4/E-org-online-empty.png
SCREENSHOT: 990e852c158ed3ced2301aac26652f454b2a396fbc4b933fafd0dac6871d737e  features/verification/p1060/renders/round-4/F-org-header-participants.png

## Reference read

Read the full 1184-line artifact HTML (not just the head fetched by the summarizer tool) to get
the actual card anatomy, tab/pill CSS classes, and per-screen annotations — the artifact tool
succeeded and returned the complete document; no fallback to the design-values bullets alone was
needed.

## The defect that fails this round

**D (fall-through screen): the "Upcoming"/"Past" pill control shows the wrong pill as selected,
and this is independently provable from the other two screenshots of the same control.**

In D, "Past (1)" renders with the active-pill treatment (white fill, drop shadow, bold dark text)
while "Upcoming (0)" renders with the inactive treatment (flat, muted gray text) — sitting inside
the same rounded gray pill-track. Directly below, the page still shows the *Upcoming*-empty
message ("Nothing coming up yet / Nothing is scheduled right now...") followed by a "Previously
in ..." divider and the past event list. So the page is simultaneously telling the viewer, in two
different ways, that two different tabs are the current one: the pill highlight says Past, the
content above the fold says Upcoming.

This is not a one-off ambiguous rendering — the same pill control is directly comparable across
two other screenshots taken in this same round:
- **F** (Upcoming has 1 event): "Upcoming (1)" carries the active-pill treatment, "Past (1)" is
  inactive. Correct.
- **E** (both Upcoming and Past are empty): "Upcoming (0)" carries the active-pill treatment,
  "Past (0)" is inactive. Correct.

Only D — Upcoming empty, Past non-empty — inverts the selection to Past. That is exactly the one
state the reference calls out by name and asks to be handled a specific way: "The Upcoming pill
stays selected and stays honest. The page does not silently switch you to the Past tab... Quietly
flipping the filter would leave you unable to explain what you are looking at." D is precisely the
scenario that sentence is about, and it is the one screenshot where the pill does not match it.
This is a hostile, cross-screenshot-verifiable finding, not an inference about intent: three
screenshots of one component, one of them visibly inconsistent with the other two under the same
component's own styling rules.

## Secondary finding — not fail-worthy on its own, noted because the reference is authoritative for placement

The reference draws the blue "Join as member" action either absent from the header entirely, or
placed *inside* the empty-events block (Screen E's mock: the button sits under "Join and you'll be
here when it's announced," inside the dashed box, and nowhere else on the page). In the three
built org-header screenshots (D, E, F) the button instead sits as a persistent, page-level element
directly under the member count, above the Events/Members/About tabs — visible regardless of
which tab or filter state is active, and never repeated inside the empty box itself. There's no
duplication (the empty box in E does not also carry a Join button) and no clipping — it's a single,
correctly-colored, correctly-sized blue CTA in every case — so this reads as a legitimate
information-architecture choice rather than a broken control. Flagging it only because the
reference is named authoritative for placement and this is a consistent, repeated deviation from
it across every org-header screenshot in the set.

## Checks that passed, and what was looked at

- **Overflow / clipping at 320px and 375px (C, C2):** every card, avatar tile, badge, and the
  footer wrapped correctly inside its column; nothing crosses the viewport edge; card corners and
  the 1px borders render fully. Long org names ("Clarity Practice Community · Past Only
  1787933742019-3058") wrap to 3–4 lines rather than truncating, matching the reference's explicit
  320px behavior note.
- **Text truncation:** none found anywhere in the set, including the longest fixture names.
- **Spacing/alignment between sibling cards (A, B, C, C2):** consistent internal padding, consistent
  divider-then-footer pattern, consistent left edges. Card-height variance between cards that do vs.
  don't carry a blurb/avatar row mirrors the reference's own screen A mock (Chiang Mai vs. Online
  differ in height there too), so this isn't scored as an orphan-weight defect.
- **Avatar-stack "+N" legibility:** could not be exercised — no screenshot in this set contains more
  faces than fit without a "+N" chip (max is 3-of-3 shown, in B/F). Reporting as untested rather than
  passed.
- **Empty states never print a bare "0":** D's "Nothing coming up yet" box and E's "The first event
  is being planned" box both render descriptive copy, never a bare digit. Member counts do render as
  literal "0" (e.g., the "Past Only" card, "0 members") — that is what the reference itself does for
  membership counts (Screen A's own "Past Only" card shows "0 members"), so it's not scored as a
  violation; the "never a zero" rule in the reference is specifically about the participant/avatar
  row, and that row is correctly omitted wherever the joined-events count is zero.
- **Colour rule:** blue-500/600 used only for actions (Open, Join as member, links, active nav
  accents); green appears exactly once, on the "You're a member" badge in B, and nowhere else; no
  amber, orange, yellow appears anywhere in the set. Purple/violet tones appear only inside
  person-avatar initials tiles (e.g. "RM", "MK"-style faces) — the reference's own mock uses the
  same kind of muted purple for a person avatar (`#8a6fb8`), so this reads as per-person identicon
  tinting, not a banned semantic action/status colour, and isn't counted as a violation.
- **Tabs vs. pills — the idiom the reference calls "easy to break":** Events/Members/About render as
  underlined tabs (bottom border, no fill) in D, E, and F; Upcoming/Past render as filled pills
  inside a gray track in the same three screenshots. The two levels are visibly different idioms
  throughout — this is executed correctly everywhere it's checkable, which makes the pill
  *selection*-state bug above more notable rather than less: the pill component itself looks right,
  it's just wrong about which pill is on in one specific state.
- **Duplicated controls:** never more than one Join/Open action offered per screen or per card.
- **Hierarchy / "different product" check:** header layout (crumb → title → member count → optional
  avatar row → optional description → button → tabs → filter → content) is applied consistently
  across D, E, and F; nothing reads as a different product from one screen to the next.

## Out of scope — observed, not counted

The past/upcoming event cards in D and F use a real photographic banner (a grayscale headshot) in
the position the reference's mock fills with an abstract gradient placeholder labelled "banner."
Per the task's scope note this is the pre-existing shared event-card component, so it is not
counted toward the verdict — noting only because it's a visible difference from the reference's own
event-card treatment.
