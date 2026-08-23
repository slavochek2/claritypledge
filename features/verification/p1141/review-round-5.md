VERDICT: FAIL

## Defect

**1. `feed-card-320.png` — the `MACHINE` badge overflows the story card's right border, and breaks the border where it crosses it.**

On both machine-authored feed cards in this frame, the card's right border sits at x=288–289. The `MACHINE` badge pill's rounded outline runs out to x=304 — roughly 16px of the pill hangs outside the card, past its edge, sitting on the page background. Measured from the pixels, not estimated: at the badge's vertical extent (y≈340–365 for the first card, y≈634–658 for the second) the rightmost non-white pixel is x=304, while every row above and below those bands has its rightmost non-white pixel at x=288–289 (the border). At the rows the badge crosses, the border pixels at 288/289 are replaced by the badge outline — the card's right edge is visibly interrupted rather than the badge being contained by it.

A reader sees a labelled pill sticking out of the card with the card outline broken behind it. This is the badge that carries AC-2's whole claim — the one element telling them a machine wrote the words — rendered as if it fell off the card.

The same badge is contained at 375 (badge stays left of the border at x=343–344) and on desktop, and it is contained on the story page at 320 (`player-loads-320.png`, `player-blocked-320.png`, `no-quotes-320.png`), where the title truncates with an ellipsis instead and the badge stays inside. So the header row degrades gracefully at 320 on the story page but not in the feed card — the feed card lets the title keep its full width and pushes the badge out of the container.

## What else I checked, and what I let stand

Timestamp pills in the quotes section: I measured these rather than eyeballing them, because the glyph inside is small. In `quotes-375.png` the `0:42` pill's grey fill (#f9f9f9) runs from y=352 to y=391 — 40px, exactly at the touch-target floor. `quotes-320.png` and `quotes-desktop.png` measure the same 40px band. Not a defect.

AC-2 is satisfied by what I can see. On `quotes-desktop/375/320.png` and `player-loads-*.png` the machine prose is upright roman body text with no ornament; the quoted material below sits under a "Supporting quotes from Rick Astley" heading, is set in italic, each quote carries a vertical rule on its left and a timestamp pill, and a footer line states plainly that a machine account wrote the reading and that only the quotes are the subject's words. The two registers are distinguishable at a glance at all three widths, including 320 where the quote block reflows to three and four lines without losing its rule or its indent.

AC-3 is satisfied. `player-blocked-*.png` shows the fallback as a real video thumbnail with a play glyph, a "Watch on YouTube" pill, a `10:00` duration badge, and a caption explaining that the player is blocked and that the thumbnail opens the video at its source — a reader arriving cold reads this as a video and has a route to play it. `feed-card-*.png` carries the same thumbnail-plus-duration treatment in the list.

Things I looked at and deliberately did not call defects: the story title truncating to "Reading of Ric…" at 320 on the story pages — that is an ellipsis doing its job, and the badge beside it stays contained. The proximity of the "Watch on YouTube" pill to the `10:00` badge in `player-blocked-320.png` — they are tight but I could not separate pill fill from the dark thumbnail underneath them with confidence, and I will not report a measurement I do not trust. The `0 verified` pill and the human/image-path frames (`human-story-*.png`, `image-path-*.png`) are clean at every width — text wraps, pills stay inside, borders close. Contrast on the grey secondary lines (the "3 marks · 10:00" meta and the machine-account footer) is lighter than body text but reads clearly at all three widths.

SCREENSHOT: 62d5a7d53eff6ee2d79c8c3d7cb8855c0bed5e780f0a016a04d4d9d708352820  features/verification/p1141/renders/feed-card-320.png
SCREENSHOT: 6cc4b35109251186513b627595daad6f17cfb2ecdf2126d150b602e2d9dbe2cc  features/verification/p1141/renders/feed-card-375.png
SCREENSHOT: b0fdff6c3f3d9c136ab3946e8143babd077b6c5a6c0c3ca491fb514e688a8aec  features/verification/p1141/renders/feed-card-desktop.png
SCREENSHOT: c0af777af7c897457e2389e9fca3ebb0826c2d4ceaa8bfb3dc3dfa55ec039955  features/verification/p1141/renders/human-story-320.png
SCREENSHOT: 77d4e8bec1e39e47ff71dce8e824cb036bce08722dca936b26ad4b94f25cf7cf  features/verification/p1141/renders/human-story-375.png
SCREENSHOT: 9f0a0215ed392a910082ed3cfd0edb889ed6367a9b7cb2086d75325fb0d2d9a8  features/verification/p1141/renders/human-story-desktop.png
SCREENSHOT: daec7de98806089debba0b9a8c6285b6d335aedb794d91b13bd535546a831391  features/verification/p1141/renders/image-path-320.png
SCREENSHOT: 352a1e621aeb569ac43a47a4e028616ca8ac5dd820271628b6e5754a63d6d185  features/verification/p1141/renders/image-path-375.png
SCREENSHOT: 57162ed8b33de5567554693d7c898bcbbb8c5d756eab1909f96284c01c0568a1  features/verification/p1141/renders/image-path-desktop.png
SCREENSHOT: 3b09034a7764a323ea35de7d6b9f3fe0e77369456f461a36e0c26e9069923da0  features/verification/p1141/renders/no-quotes-320.png
SCREENSHOT: c6669ab2ecac805034a25da52d377d2f8f0c1f431298d081fb855f87c936b4aa  features/verification/p1141/renders/no-quotes-375.png
SCREENSHOT: 4731688cd58f2ee2709c75263dc3a9f2e0900c7c262cbba97fc0dbb69a7ef7f0  features/verification/p1141/renders/no-quotes-desktop.png
SCREENSHOT: 8a18de1451e3a06d858e9703af5e01e24edd663b8f9a2649785723a168b33ba1  features/verification/p1141/renders/player-blocked-320.png
SCREENSHOT: b443d8ea4c6895e415ebe0c3cbc5c53eaa0cc2c3c55c586cb15545f3ef23096f  features/verification/p1141/renders/player-blocked-375.png
SCREENSHOT: 8b41145f8a00f6471b0a445bdd486c386d1a01e5afca3dbd90e00858bf61c5dc  features/verification/p1141/renders/player-blocked-desktop.png
SCREENSHOT: c5041b0903ea3a9616ead3eddc338b6ccf6dccc6037536931c24cef362b27735  features/verification/p1141/renders/player-loads-320.png
SCREENSHOT: 1984c278809d016b268355383607596ccb28cdd5a0100aad6c9ee92cf98cc7de  features/verification/p1141/renders/player-loads-375.png
SCREENSHOT: 276163e20383614a22cf37ade9444baf52a6cfb397fd7138216e390f0d3cbb8c  features/verification/p1141/renders/player-loads-desktop.png
SCREENSHOT: df6ea759f1bdbb6f5744642cdb979c646182de478da2304f7fd2eb854cd769fa  features/verification/p1141/renders/quotes-320.png
SCREENSHOT: 319b15f07a1e3588c78ac3d936a5651fd7e3ab4f230d52fe7ba4cbd1298d9c3b  features/verification/p1141/renders/quotes-375.png
SCREENSHOT: 0c0b7fa29846b2a2c63423693077c1b9ffb9dc64dea31ff08ba9e9ed4a1b315c  features/verification/p1141/renders/quotes-desktop.png
