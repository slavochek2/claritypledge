/**
 * Landing lab "Do": the instructions this interactive page needs that the founder never
 * wrote. Every visible string here is an agent draft and is rendered through <Draft>.
 * The ARIA strings cannot carry the visible marker, but they are drafts too.
 */
export const DO_COPY = {
  linkBroken: "That link did not work. Tap your own song instead.",
  tapPrompt: "Think of a song everyone knows. Tap its rhythm.",
  tapHint: "Tap the circle, or press space.",
  padWord: "tap",
  tapDone: "That's my song",
  tapReset: "Start over",

  guessPrompt: "Out of 100 listeners, how many would name your song?",
  guessSubmit: "Show me",

  revealYou: "Your guess",
  revealStudy: "The study",
  revealHonest: "That number is the study's result, not a measure of you.",

  shareTitle: "Test it for real. Send your taps to a friend.",
  shareNameLabel: "Which song was it?",
  shareBefore: "Name it and you get a link to send.",
  shareMake: "Make the link",
  shareCopy: "Copy link",
  shareCopied: "Copied",
  sharePreview: "Hear it as they will",
  shareHint: "They hear only the knocks.",

  listenIntro: "Someone tapped a song for you.",
  listenPlay: "Play the taps",
  listenReplay: "Play again",
  listenGuessLabel: "Which song is this?",
  listenReveal: "Reveal the song",
  listenTheirSong: "Their song",
  listenYourGuess: "Your guess",
  listenMatch: "You named it.",
  listenOwn: "Tap one yourself",
} as const;

/** Screen-reader labels. Not visible, still founder decisions. */
export const DO_ARIA = {
  pad: "Tap pad",
  padListening: "Replayed taps",
  replay: "Play the taps again",
  soundOn: "Turn sound on",
  soundOff: "Mute sound",
  minus: "One fewer",
  plus: "One more",
  rhythm: "Your tap rhythm",
  tapCount: "Taps",
  shareLink: "Share link",
  founderPhotoAlt: "Vyacheslav Ladischenski",
} as const;
