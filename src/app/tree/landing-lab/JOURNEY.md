# Landing lab: "Go first" journey

Status: design and build plan for a dev-only prototype at `/tree/landing-first`. Nothing
here is reachable in production. Produced 2026-09-29 from a brainstorm and review rounds
with an external critic model. Every visitor-facing sentence not marked FOUNDER below is an
agent proposal that is NOT approved. Section 8 lists every decision that is the founder's.

## 1. What the page is for

One accurate insight and one fitting next action, for a visitor who arrives cold on a phone.

- Insight: almost nobody verifies cognitive understanding, because there is no social norm
  to admit "I don't understand". Nobody is blamed. Ego, fear and laziness do not appear.
- Action: the visitor goes first somewhere. With colleagues, with one person, or in a room.
- Success is counted in completed primary actions per ending. Not in scroll or time.

## 2. Principles, each one earned in review

1. Value before questions. Nothing about the visitor is asked before the fork.
2. Routing is not qualification. The fork routes by intended next action. Qualification
   happens only inside the work ending, when the visitor asks for the pilot.
3. "Skip to main site" is visible from first paint on every screen and goes to `/`.
4. A number changes only when a human rating is revealed. Never from a drag, a scroll or
   the end of an animation. Every number names who rated what.
5. One primary action per ending.
6. Type first. The text column and controls own the layout. The scene yields space to
   them and to the software keyboard.
7. The scene is atmosphere with exactly two meaningful moments: end-on unity becoming a
   side-on gap, and fog hiding that gap. It carries no information that the text does not.
8. No person or organization is impersonated. The AI rehearsal is called "the mirror".

## 3. The journey

Timing is a target for the median visitor, measured later, not a promise. Words not marked
FOUNDER are proposals, listed in `first/copy.ts` under PROPOSALS. Terms: one explain-back
attempt is a "try"; a two-person practice is a "session"; a group meetup is an "event".

### Screen 1. Promise and story, first beat
- Headline, FOUNDER, from the current homepage: "Make it normal to admit 'I don't
  understand'". Balanced, with the opening quote, "I" and "don't" kept on one line.
- Below it, FOUNDER, story beat 1: "I asked them if they think I understand them."
- Scene: two bodies end-on. About a quarter of the back body shows beside the front one, so
  they read as two overlapping circles. No slot, no number, nothing blurred.

### Screen 2. Story, second and third beat
- FOUNDER: "They said: yes." A chip below the two bodies, never on top of one, shows
  "Yes", with no caption. No number is shown, because nobody gave one.
- FOUNDER: "Days later, they said I didn't understand them." The chip's "Yes" is struck
  through at 60 percent opacity, captioned "Never verified". The view turns side-on. Two
  bodies, a gap, clear air.

### Screen 3. Three meanings
- FOUNDER: the sentence ending "the word 'understand' has at least three meanings."
- The three FOUNDER definitions as a list, each label part bold: Agreement and Emotional
  understanding in 70 percent white, Cognitive understanding in full white.

### Screen 4. Demonstration, fixed sequence
- Lead: "One person speaks. The other explains it back. The speaker rates it out of 10."
- Directly under it, "Made-up example" in the caption style, on every beat. When the screen
  scrolls, the lead (in a one-line form, "Speak, explain back, rate it") and this caption
  are pinned together as the compact header. It does not look like a field.
- Six beats, each revealed with Next:
  1. The speaker's statement, in a card labelled "Speaker". It stays visible on every beat.
  2. The first try: one card labelled "First try", with "Listener explains back" and the
     explain-back, fluent, sincere, and carrying a plausible wrong assumption.
  3. A guess: "How would the speaker rate this?" and 11 plain buttons in two rows that each
     fill the width, 0 to 5 then 6 to 10, every button at least 44 by 44px, at every width.
     The card and the buttons are brought into view together. A press records the guess
     and reveals the rating. Next also reveals it, without a guess.
  4. The rating, inside the same card, one row of two equal cells: "Your guess" with its
     number in gray-white, and "Speaker's rating" with its number in white, the speaker's
     number shown 400ms after the guess (at once under reduced motion). Without a guess,
     the speaker's rating alone. Numerals 28px, weight 600. Then the speaker's line on
     what was missed. No right or wrong, no colour judgement, no score.
  5. The second try, labelled "Second try" over "Listener explains back again" (a label
     that does not fit one line takes two, with no dot). The first try folds to one line at
     every width: "First try" on the left, "Speaker's rating N out of 10" on the right.
  6. The second rating.
- Always visible together, at every size: the statement, the current explain-back, and its
  rating once revealed. At 320 by 568 the mirror link on the last beat may need a scroll. A number and its "out of 10" never break across lines. Every
  number names who gave it: the speaker's rating, or "your guess".
- The scene reacts to the revealed ratings only. The low rating thickens the mist in the
  gap slightly and dims both bodies by about 15 percent. The high rating clears the mist,
  and a thin white filament joins the two bodies and stays for the rest of the screen. The
  bodies never move closer. Under reduced motion these are end states, not animations.
- Content requirement: the founder is the speaker, supplies the statement, and rates both
  explain-backs himself. The ratings shown are the ratings he gave. Until then the line
  "Made-up example" stays, and the page is not shown to any test visitor.

### Screen 5. Optional detour: the mirror
- One secondary link under the finished demonstration: "Try it on something of your own
  with an AI rehearsal". Rendered only when the mirror is connected, or under a development
  flag for the founder's review.
- The same shell as the journey. The scene is hidden on phones and dimmed on desktop.
  Footer: Back, returning to the demonstration, on the left. On the right, "Explain it
  back" while the visitor can submit, "Try again" while a retry is open, and a filled
  "Continue" once the mirror has answered its last try or is unavailable.
- "Write one or two sentences you want understood. The mirror tries to explain them back.
  Then you rate it." The visitor rates out of 10. Below 10, the visitor says what was
  missed and the mirror tries again. Three tries at most.
- The mirror never scores, praises, advises, agrees or disagrees.
- Notices: "Leave out names and confidential details." and an accurate statement of what
  happens to the text, written only once the endpoint exists. Until then a submit shows a
  bordered notice, "The mirror is not available yet.", that looks like neither a field nor
  an error.
- Closing line, only in the end states (after the last try, or when the mirror is
  unavailable), fully visible without scrolling at 320 by 568, with no divider of its own:
  "The mirror covers one step. The real practice is between two people."
- "Continue" lands on the first beat of screen 6; Back returns to the demonstration.

### Screen 6. The norm, and Point A to Point B
Three beats. From here on the mist sits in the gap only; both bodies stay crisp.
- Beat 1: the title, FOUNDER, slide 8: "Why almost nobody verifies cognitive
  understanding", with the two FOUNDER sentences about disrespect and about seeming stupid.
- Beat 2, FOUNDER: "So people pretend they understood, and the gap in cognitive
  understanding stays hidden."
- Beat 3: FOUNDER, slide 8: "No social norm to admit 'I don't understand'", above a
  diagram adapted from slide 48. Point A: "you can't reveal the gaps in understanding".
  Point B: "you can reveal and bridge the gaps". Between them, labelled "Obstacle" (the
  deck's OBSTACLE, shown in sentence case): "no social norm", the adaptation the founder
  asked for. The three cards are stacked vertically, the full column wide, at every width.

### Screen 7. The fork
- Line, FOUNDER: "In every conversation there's a hidden number: how well you both know you
  understood each other. Nobody asks. We ask."
- Question: "Where would you like to start?"
- Four buttons, one axis, the intended next action:
  1. "Use it on a stuck conversation at work"
  2. "Try it with one person you know"
  3. "Join a group event"
  4. "Watch or read first"
- A plain vertical list, all four visible without scrolling down to 320 by 568. When a
  button takes focus the scene may turn slightly. That is decoration. No swipe navigation.

### Endings
Every ending uses the same shell, with Back in the footer's left slot and its one primary
action, if it has one, in the footer's right slot. The two forms are submitted from the
footer ("Preview what would be sent"); while the software keyboard is open the footer may
scroll with the page.
- Work. "Can you invite everyone in that conversation?" Two choices that look identical at
  rest: "Yes, I can" and "No, someone else would".
  - Yes: "Ask for a first session at work". "Leave out names and confidential details.",
    who reads it, and how long it is kept. Fields: what the stuck conversation is about,
    who would take part by role, how to reach you, about how many people work there.
    Notices: everyone invited must be free to say no; each session is prepared with the
    visitor before it starts. Primary action: send the request.
  - No: "Then send this invitation to the person who could bring everyone together." The
    invitation carries no topic. Its link is shown without the protocol, on its own line in
    the caption style, breaking only after a slash. Primary action: share or copy it.
- One person. No heading. "Open a session, then send the link to the person you have in
  mind. It uses your microphone." Primary action: "Open a session for two".
- Room. "Are you in Chiang Mai?" "Yes, show me the next event" is itself the link to the
  events page, and the completed action. "No, I am somewhere else": leave an email to hear
  about future events.
- Examples. No heading. A story card in a dark frame: the founder's film poster, 16:9,
  dimmed by a 35 percent black overlay, a white play mark at its centre, and "Watch the
  founder's story" under it. It is not the brightest thing on the page. Pressing it plays the film in place. Primary
  action in the footer: "Read more stories". No "going first" framing. Looking is looking.

## 4. Interaction and layout rules

- One shell on every screen: top bar, scene, text panel, progress line, footer.
- Nothing lies over text or a control: no gradient, no fade, no mask, anywhere.
- Fitting is decided once per screen from the tallest of its beats. Below 1024px, screens 1
  and 2 give the scene the room the text leaves ("hero"). Every other screen gives it the
  largest size that still leaves the text its room: the band, `clamp(96px, 22dvh, 220px)`;
  else a 72px strip, where the two bodies are small, side by side, with the gap between
  them clearly visible and mist, dimming and the filament working as in the band; else
  nothing. Presence is decided by space alone, never by a width or height threshold. The
  forms and the mirror give it nothing. A change of height takes 600 milliseconds,
  instantly under reduced motion.
- A screen whose text is taller than its panel is compact: its title or lead becomes a
  sticky header at the top of the panel, 17px at weight 600, at most two lines at 320px
  wide, on the solid page colour with a 1px divider under it. Content scrolls under it
  and is clipped at the divider. So the title or lead is fully visible on every beat.
- The footer (progress line and buttons) is solid page colour. The panel ends where the
  footer begins, and its bottom edge never cuts a line of text or a control: it rises into
  the gap above the first line it would cut. At the end of a scroll the last content sits
  at least 12px above the footer. The first line of a screen is fully visible when it
  opens. After every Next the newest beat is brought fully into view, and no card is left
  cut by the top edge.
- Desktop, from 1024px: the scene fills the left half at full height; the logo sits at the
  viewport's top-left, over the scene, and Skip at the top-right. The text sits in the right
  half, its first line anchored at 22 percent of the column's height, so the lead and the
  statement never move when a beat adds content. The forms and the mirror keep this split,
  with the scene dimmed to 40 percent.
- Footer: Back left-aligned to the text column's edge on every screen but the first, the
  primary action right-aligned to it, at least 160px wide. Labels never wrap and keep one
  size at every width; below 360px wide only the button's side padding shrinks. The footer
  and its divider span the text column only. Bottom padding
  `max(12px, env(safe-area-inset-bottom))`. One primary blue, one class, on every primary
  button, and every primary button sits in the footer.
- Advance: Next, at least 48 CSS pixels. Keyboard: Space, Enter and down arrow advance only
  when focus is on the page body or on Next. No tap-anywhere, no swipe. Next is always
  enabled; a press during a transition finishes it at once and advances no further. Browser
  Back steps one screen where the history entry exists.
- Transitions 600 milliseconds. Text 250 milliseconds.
- Type: three roles. Title 30px bold, 36px from 1024px. Lead 20px regular (18px below 360px
  wide). Body 17px. One small caption: 13px semibold gray, sentence case, for card labels,
  "Made-up example" and field hints. The fork's question and the form's bold notice use the
  lead role. Card padding 16px. Titles break by balance only.
- Text sits on the solid page colour. Contrast at least 4.5 to 1. Straight apostrophes are
  shown curly and a founder phrase is kept together, at render time only; the words are
  never changed. Labels and buttons have no full stop; sentences do.
- Fields: one text size; textareas cannot be resized.
- Scene: a transparent canvas; each body's glow fades radially into the page colour, so
  there is no panel edge. Two perfect circles in one glossy, crescent-lit material. The
  canvas ignores pointer events. The still used without WebGL shows the same states.
- Colour: design system blue for every action. Neutral white for ratings. No green, amber,
  orange, yellow or purple.
- Heights use dynamic viewport units. The page takes the full window width.

## 5. Measurement

Explicit events only: journey started, demonstration completed, the guess on screen 4 with
its value, mirror opened, fork reached,
route chosen, primary action completed per ending, skip pressed with the screen it was
pressed on. No dwell time, no scroll depth, no inferred scoring. In the prototype these
are logged to the console only.

## 6. Build plan

Renderer decision: reuse the existing raymarched scene from the Wild prototype and its
still fallback. No new library. It already has the end-on and side-on views and the fog.
It gains two inputs: fog density independent of the view, and a small focus turn.

1. Route and shell. `/tree/landing-first`, dev-gated like its siblings. Top bar, Next and
   Back, screen state machine with history entries, reduced-motion and no-WebGL paths.
2. Content file. FOUNDER lines reused verbatim from the shared content file. New lines in
   one proposals list. No draft markers rendered on the page. The list of proposed lines
   is given to the founder in plain text for approval.
3. Screens 1 to 3 and 6 with the scene states.
4. Screen 4 as a data-driven sequence: statement, explain-backs, ratings, feedback lines,
   each rating carrying its rater. Ships with sample content and the pending label.
5. Screen 7 and the four endings. Work request and notifications submit nowhere in the
   prototype. Their buttons read "Preview what would be sent", and they never count as a
   completed action.
6. Screen 5, the mirror, behind one function `explainBack(text, feedback)`. Not connected
   in the first build, so its link is hidden except under the development flag. The
   endpoint is a separate step that needs founder approval of the model, the key handling,
   the limits and the retention wording.
7. Tests: the screen state machine, the rule that no rating is shown without a rater, the
   keyboard rule for Next, the share link for the forwarded invitation carries no topic.
8. Visual review at 320, 375 and desktop widths, on a short viewport, with reduced motion,
   and with WebGL disabled, by a reviewer who has not seen the code.

## 7. Risks and the cheapest test for each

1. Visitors admire the scene and miss the mechanism. Test: five cold visitors on their own
   phones, 30 seconds after finishing each explains what the practice does and why people
   avoid it. Fail if fewer than four name explain-back, the speaker's rating and the norm.
2. The demonstration feels staged. Test: same five. Fail if anyone thinks the number came
   from an AI or an algorithm.
3. The page routes interest and produces no host. Test: send it to the first five warm
   prospects before their planned conversations. Zero pilots agreed means the pitch or the
   offer is wrong. Clicks are not evidence.
4. The scene adds nothing. Test: the same journey with the scene switched off, shown to
   half of the visitors in test 1. If comprehension and action are equal, remove the scene.

## 8. Founder decisions this document does not make

1. Whether this direction is built at all, and whether it replaces or joins the three
   existing prototypes.
2. Every sentence not marked FOUNDER, including the four route labels and the "goes first"
   line.
3. The adapted obstacle on the Point A to Point B beat: "no social norm".
4. The demonstration content: the statement, both explain-backs, and the real ratings.
5. The mirror: whether it exists, its name, text only or also voice, which model, and what
   is promised about the visitor's text.
6. The four routes as the set of offers, and what each ending offers.
7. Whether rooms outside Chiang Mai are offered, and what "event notifications" means.
8. Whether organization size is asked at all in the pilot request.
9. Whether the founder's film is the first example shown.
10. Whether the scene stays after the switch-off comparison.

## 9. Review record

Three rounds with an external critic model, 3 of 3 reports received.
- Round 1 killed the identity gate, role taxonomy, voice, chapter rail, souvenir card, the
  cascade scene, and a score driven by a slider. The last claim was checked against the
  Wild prototype's state function and is true.
- Round 2 conceded the narrow mirror, the "goes first" frame and the fixed-sequence
  demonstration. It held against swipe navigation at the fork. It asked for the scene to be
  demoted; the author held, on the founder's explicit brief.
- Round 3 conceded the scene and the order, and returned eight defects. All eight are
  applied above. Verdict: build with fixes.
