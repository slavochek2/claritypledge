VERDICT: FAIL

Twenty-four images judged. The quote surface itself is largely sound — italic quote text behind a light vertical rule, set against upright roman prose, with a per-quote timestamp and a closing disclosure paragraph, reads clearly as "these words came from elsewhere." AC-2 is broadly satisfied on the pages that actually carry quotes. But there are six defects a reader would notice, and AC-3 is not supported by the evidence supplied.

**1. `no-quotes-desktop.png`, `no-quotes-375.png`, `no-quotes-320.png` — disclosure footnote refers to quotes that do not exist.**
Element: the grey footnote paragraph below the divider. It reads "Nothing here is Rick Astley's own words except the quotes, which come from the linked video." This story has no quotes and no quotes section — the sentence points at nothing. On the one surface whose whole job is telling the reader which words are machine-written, the disclosure makes a false claim about the page it is on. A reader who takes it at face value will hunt for a quoted passage and find only machine prose. This is the most serious finding and it is squarely an AC-2 failure for the no-quotes state.

**2. `player-blocked-desktop.png`, `player-blocked-375.png`, `player-blocked-320.png` — dead control: a play button on a surface that states it cannot play.**
Element: the large centred play triangle on the fallback thumbnail. Directly beneath it the caption says "The player could not load here — it may be blocked by an extension or a network policy." The biggest, highest-contrast, most obviously clickable thing in the frame is the affordance the caption has just declared non-functional, while the control that actually works is the small grey text link below. Hierarchy is inverted: the eye lands on the broken thing first. Checklist breach — "No dead controls" and "Hierarchy".

**3. `player-blocked-desktop.png`, `player-blocked-375.png`, `player-blocked-320.png` — the only working recovery link is undersized and low-contrast.**
Element: "Watch on YouTube →" inside the fallback caption. It renders as ~12px grey secondary text on white, inline in a sentence, with a tap box on the order of 17px tall — far under the 40px touch-target minimum, and at 320px it sits at the end of a three-line grey block where nothing marks it as the action. This is the entire AC-3 escape hatch for a reader who cannot play the embed, and it is styled as footnote text. Checklist breach — "Touch targets" and "Contrast/Hierarchy".

**4. `player-blocked-desktop.png` — the recovery link wraps mid-phrase.**
Element: same caption. At desktop width the line breaks as "…network policy. Watch" / "on YouTube →", splitting the call to action across two lines with the verb orphaned on the first. At full desktop width there is no reason for the phrase to break at all. Checklist breach — "Text truncation / spacing".

**5. `player-loads-desktop.png`, `player-loads-375.png`, `player-loads-320.png`, `quotes-desktop.png`, `quotes-375.png`, `quotes-320.png`, `player-blocked-*.png`, `quotes-blocked-*.png` — timestamp seek controls are below the touch-target minimum.**
Element: the "▸ 0:42" / "▸ 3:05" / "▸ 8:32" markers at the left of each quote row. Each is a ~17px-tall line of small grey text with a tiny triangle glyph, and each is the mechanism by which a reader jumps from a quote to the moment in the video. At 320px they sit in a narrow left gutter with no visible hit area. These are the AC-3 path from evidence back to the recording; they are drawn as labels, not as controls. Checklist breach — "Touch targets".

**6. `feed-card-desktop.png`, `feed-card-375.png`, `feed-card-320.png` — no video story appears in the feed at all.**
Element: the story list. All three feed captures show only two cards, both plain human stories (one text-only, one with a still image). No video story card is in frame at any width. AC-3 asks whether a reader can tell a video is a video and reach the story to play it — the feed is the surface where that judgement would be made, and these three screenshots contain no instance of it. I cannot pass AC-3 on evidence that does not depict the case. This is an evidence gap, and on this evidence AC-3 is unmet.

**Evidence integrity — `quotes-375.png` and `quotes-blocked-375.png` are the same file.**
Both hash to `9888f090f918a5869edb7e78b0a287b4cd81e99b6fe12c8485fa2ff61aff9934`. They are byte-identical, so the blocked-player story's quotes section at 375px was never independently captured; there are 23 distinct images here, not 24. Related: `quotes-blocked-320.png` and `quotes-blocked-desktop.png` are scrolled far enough that the player region is entirely off-screen, so nothing in them corroborates the "blocked" state their filenames claim. Checklist — "State match" cannot be confirmed for the quotes-blocked set.

**Not counted against the build.** The embedded player's own title bar truncates the video title mid-word at 375px and 320px ("Rick Astley - Never (" / "Rick Astley - |"); that is third-party YouTube chrome inside the iframe, not the reviewed surface. The bottom action row and the "Change image / Remove image" controls were excluded as instructed, including the row's fourth icon being clipped at 320px.

**What holds up.** The machine/human distinction is clear and consistent: machine stories carry a square avatar, a `MACHINE` pill and the closing disclosure; human stories carry a ringed circular avatar and a "0 verified" pill and no disclosure. Quote text is italic with a left rule and never bleeds into the prose blocks. No overflow beyond card borders at any width, no clipped card corners, contrast on body prose is fine, and the layout degrades to a single column at 320px without horizontal scroll. The section meta ("3 marks · 10:00") sits correctly opposite its heading at desktop and stacks beneath it on mobile.

SCREENSHOT: ad62cea599c8831f0433e3224afe9d8bcd90da51bcb347e8e98074c3a17b13ab  features/verification/p1141/renders/feed-card-320.png
SCREENSHOT: cf24e421d0b81b3ca68ec879c00663b894dbf99f89fd3c5603bacfd1f2cb214f  features/verification/p1141/renders/feed-card-375.png
SCREENSHOT: bbc3c96716d1c46cee0960a229488c817e6c11e2d4e2b42f58614ef4744358d1  features/verification/p1141/renders/feed-card-desktop.png
SCREENSHOT: c0af777af7c897457e2389e9fca3ebb0826c2d4ceaa8bfb3dc3dfa55ec039955  features/verification/p1141/renders/human-story-320.png
SCREENSHOT: 77d4e8bec1e39e47ff71dce8e824cb036bce08722dca936b26ad4b94f25cf7cf  features/verification/p1141/renders/human-story-375.png
SCREENSHOT: 9f0a0215ed392a910082ed3cfd0edb889ed6367a9b7cb2086d75325fb0d2d9a8  features/verification/p1141/renders/human-story-desktop.png
SCREENSHOT: daec7de98806089debba0b9a8c6285b6d335aedb794d91b13bd535546a831391  features/verification/p1141/renders/image-path-320.png
SCREENSHOT: 352a1e621aeb569ac43a47a4e028616ca8ac5dd820271628b6e5754a63d6d185  features/verification/p1141/renders/image-path-375.png
SCREENSHOT: 57162ed8b33de5567554693d7c898bcbbb8c5d756eab1909f96284c01c0568a1  features/verification/p1141/renders/image-path-desktop.png
SCREENSHOT: 5df0a8c92d93517afebecce2441e904b2c2139bf1176ef4ccf9bb9b773939907  features/verification/p1141/renders/no-quotes-320.png
SCREENSHOT: 9d3d3f073043160a985dcc55f9462de570dc5e41897dd1f12b069cde13dfc4a3  features/verification/p1141/renders/no-quotes-375.png
SCREENSHOT: 5186df2c03c59334da4042117ef9b99dc136e8c7597dc60791cebc7b69218dba  features/verification/p1141/renders/no-quotes-desktop.png
SCREENSHOT: ba5e3b96392a0b4226611309527b0c416adbba1a22820e0a027aa8dd8a0a4256  features/verification/p1141/renders/player-blocked-320.png
SCREENSHOT: d41f83349fc0d720a355ee1ffd8f9cf43200c665552e3b03ecffef89e8e932e7  features/verification/p1141/renders/player-blocked-375.png
SCREENSHOT: b740eb2128a12df7f3398bf3e50b3f59e00a7cd8642ef9b3f9460b1b78ba1d91  features/verification/p1141/renders/player-blocked-desktop.png
SCREENSHOT: 7740c1017f0779541e4b9fc2984ba9bfe3ff194e9cc27c5380ea14a3e31a4b24  features/verification/p1141/renders/player-loads-320.png
SCREENSHOT: 386d3ad7b0fa1ed378f21d3c209a90c8521446bd270e9942a4f8e0a6da11f326  features/verification/p1141/renders/player-loads-375.png
SCREENSHOT: 22656c344a18ebe38323b2512fd39a181c36c7258bbf064075e278c46853faf9  features/verification/p1141/renders/player-loads-desktop.png
SCREENSHOT: 1328122135b7c42bf9e18313188bf9ffa4497440ffefbc298b282700c8d6c1dc  features/verification/p1141/renders/quotes-320.png
SCREENSHOT: 9888f090f918a5869edb7e78b0a287b4cd81e99b6fe12c8485fa2ff61aff9934  features/verification/p1141/renders/quotes-375.png
SCREENSHOT: 5f438c1ecf604241189589f3dfb9e12689e11ce02fbcbb2372314bc6350edb72  features/verification/p1141/renders/quotes-blocked-320.png
SCREENSHOT: 9888f090f918a5869edb7e78b0a287b4cd81e99b6fe12c8485fa2ff61aff9934  features/verification/p1141/renders/quotes-blocked-375.png
SCREENSHOT: c950ffcf055fc1dd0dcf9fb2bdbba71de690f91f4f199d86ac3a7384441c4316  features/verification/p1141/renders/quotes-blocked-desktop.png
SCREENSHOT: 71c70d9f09e1660a8b2f033263db3c06f2a5417532379da443c2eba04ff8549b  features/verification/p1141/renders/quotes-desktop.png
