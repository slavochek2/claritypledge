VERDICT: FAIL

# Blind visual review — round 4

Independent review of 21 viewport captures. I did not build this surface and was given no
implementation context. Findings below are what I can see in the pixels.

## Defects

### 1. `MACHINE` badge overflows the card at 320px — every machine-authored view

Files: `player-loads-320.png`, `player-blocked-320.png`, `no-quotes-320.png`, `feed-card-320.png`
Element: the outlined `MACHINE` pill on the header row, beside the title "Reading of Rick Astley".

At 320px the header row does not wrap or shrink. The title holds its width and the badge is pushed
past the card's right border: the card's right edge (the thin grey rule, and the blue left-accent
card's matching right edge) crosses *through* the pill, and the pill's right side then runs to the
viewport edge where it is cut. I cropped and magnified the header of `player-loads-320.png` to
confirm this is a real overflow, not an artefact of scaling — the card border is visibly drawn on top
of/behind the badge, and the badge's rounded right cap is clipped.

This is the single element that carries AC-2's authorship claim, and it is the element that breaks.
On `feed-card-320.png` it happens twice in one viewport (both story cards). At 375px and desktop the
same badge sits comfortably inside the card, so this is a narrow-width breach only — but 320 is a
supported width and the checklist calls for graceful degradation there.

Checklist items breached: Overflow, Clipping, Responsive squeeze.

### 2. Timestamp seek chips are below the 40px touch target

Files: `quotes-375.png`, `quotes-320.png`, `player-loads-375.png`, `player-blocked-375.png`,
`player-loads-320.png`, `quotes-desktop.png` (desktop is borderline and not the concern)
Element: the pill-shaped `▸ 0:42` / `▸ 3:05` / `▸ 8:32` controls left of each quote.

Measured from a 4× magnified crop of `quotes-375.png`, the chip's box (its grey fill and border, not
the glyph) is roughly 34–36px tall. The checklist threshold is 40px. These read unambiguously as
controls — a play triangle plus a timestamp — so a reader will tap them, and on the two mobile widths
they are the smallest interactive elements on the page. Their vertical neighbours are close enough
that the miss lands in adjacent text rather than in nothing.

Checklist item breached: Touch targets.

## What holds up

- **AC-2 is well served at 375 and desktop.** The separation is legible at a glance and does not
  depend on reading anything: machine prose is upright roman at body weight and full column width;
  quoted words are italic, indented, and each carries a left rule and its own timestamp chip. The
  `Supporting quotes from Rick Astley` heading and the `3 marks · 10:00` counter frame the block, and
  the grey footnote ("Nothing here is Rick Astley's own words except the quotes, which come from the
  linked video") states the boundary in words for anyone who wants it. Two distinct visual channels
  (style + indent-with-rule) rather than one, which is why it survives at 320 where the badge does
  not.
- **AC-3 is satisfied in every state I was given.** `feed-card-*` cards show a real video thumbnail
  with a centred play glyph and a `10:00` duration badge — unmistakably a video, at all three widths.
  From the card the reader reaches the story page, where the player is embedded and playable
  (`player-loads-*`). In the blocked state (`player-blocked-*`) the surface degrades honestly: the
  thumbnail stays, the duration badge stays, a `Watch on YouTube` affordance appears bottom-left, and
  a plain-language line explains the block and says the thumbnail opens the video at its source. That
  is the right behaviour and it is the strongest thing in this set.
- **`no-quotes-*`** correctly drops the whole quotes block and shortens the footnote to omit the
  clause about quotes — no empty section, no dangling heading, no zero-state placeholder.
- **`image-path-*` and `human-story-*`** carry no `MACHINE` badge, no duration badge and no quote
  affordances, and stay clean at 320 — the contrast with the machine views is exactly what AC-2 needs
  as a control.
- **State match**: each frame depicts the state its filename claims.

## Deliberately let stand

- Bottom card rows, "Change image"/"Remove image", the fixed header and bottom nav, and everything
  inside the YouTube frame — declared out of scope.
- Quote text is clipped mid-line at the bottom of `player-loads-375.png` / `player-loads-320.png` /
  `player-blocked-*`. These are viewport captures at a scroll position; the content continues below
  the fold and is fully visible in the `quotes-*` frames. Not a defect.
- At 320 the blocked player's `Watch on YouTube` chip and the `10:00` badge come within a few pixels
  of each other (`player-blocked-320.png`). They do not overlap and both remain fully legible. Tight,
  but no reader would call it broken — not reported as a defect.
- On `no-quotes-320.png` the footer row drops one trailing icon relative to 375. That row is out of
  scope.
- `+ Add point` is the only filled primary in any view; no full-width primary, no disabled decorative
  control anywhere. Contrast, alignment, spacing rhythm and sibling weight all read correctly.

SCREENSHOT: 62d5a7d53eff6ee2d79c8c3d7cb8855c0bed5e780f0a016a04d4d9d708352820  features/verification/p1141/renders/feed-card-320.png
SCREENSHOT: 6cc4b35109251186513b627595daad6f17cfb2ecdf2126d150b602e2d9dbe2cc  features/verification/p1141/renders/feed-card-375.png
SCREENSHOT: b0fdff6c3f3d9c136ab3946e8143babd077b6c5a6c0c3ca491fb514e688a8aec  features/verification/p1141/renders/feed-card-desktop.png
SCREENSHOT: c0af777af7c897457e2389e9fca3ebb0826c2d4ceaa8bfb3dc3dfa55ec039955  features/verification/p1141/renders/human-story-320.png
SCREENSHOT: 77d4e8bec1e39e47ff71dce8e824cb036bce08722dca936b26ad4b94f25cf7cf  features/verification/p1141/renders/human-story-375.png
SCREENSHOT: 9f0a0215ed392a910082ed3cfd0edb889ed6367a9b7cb2086d75325fb0d2d9a8  features/verification/p1141/renders/human-story-desktop.png
SCREENSHOT: daec7de98806089debba0b9a8c6285b6d335aedb794d91b13bd535546a831391  features/verification/p1141/renders/image-path-320.png
SCREENSHOT: 352a1e621aeb569ac43a47a4e028616ca8ac5dd820271628b6e5754a63d6d185  features/verification/p1141/renders/image-path-375.png
SCREENSHOT: 57162ed8b33de5567554693d7c898bcbbb8c5d756eab1909f96284c01c0568a1  features/verification/p1141/renders/image-path-desktop.png
SCREENSHOT: b8a51ee80c80e597b7a9d0704c5a38602d676060d0d590779a74805e9efe005e  features/verification/p1141/renders/no-quotes-320.png
SCREENSHOT: c6669ab2ecac805034a25da52d377d2f8f0c1f431298d081fb855f87c936b4aa  features/verification/p1141/renders/no-quotes-375.png
SCREENSHOT: 4731688cd58f2ee2709c75263dc3a9f2e0900c7c262cbba97fc0dbb69a7ef7f0  features/verification/p1141/renders/no-quotes-desktop.png
SCREENSHOT: 87c5310a696302edce19b34fe44a82486bd2961141191ebd7693e719142a3bab  features/verification/p1141/renders/player-blocked-320.png
SCREENSHOT: b443d8ea4c6895e415ebe0c3cbc5c53eaa0cc2c3c55c586cb15545f3ef23096f  features/verification/p1141/renders/player-blocked-375.png
SCREENSHOT: 8b41145f8a00f6471b0a445bdd486c386d1a01e5afca3dbd90e00858bf61c5dc  features/verification/p1141/renders/player-blocked-desktop.png
SCREENSHOT: 848157603315d298acc965c29cbf8d2932a27fdaa4f93dfb93eb9fee97ea6e76  features/verification/p1141/renders/player-loads-320.png
SCREENSHOT: 1984c278809d016b268355383607596ccb28cdd5a0100aad6c9ee92cf98cc7de  features/verification/p1141/renders/player-loads-375.png
SCREENSHOT: 276163e20383614a22cf37ade9444baf52a6cfb397fd7138216e390f0d3cbb8c  features/verification/p1141/renders/player-loads-desktop.png
SCREENSHOT: df6ea759f1bdbb6f5744642cdb979c646182de478da2304f7fd2eb854cd769fa  features/verification/p1141/renders/quotes-320.png
SCREENSHOT: 319b15f07a1e3588c78ac3d936a5651fd7e3ab4f230d52fe7ba4cbd1298d9c3b  features/verification/p1141/renders/quotes-375.png
SCREENSHOT: 0c0b7fa29846b2a2c63423693077c1b9ffb9dc64dea31ff08ba9e9ed4a1b315c  features/verification/p1141/renders/quotes-desktop.png
