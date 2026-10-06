/**
 * Landing lab — the one shared source of words and links for the three prototypes
 * under /tree/landing-*.
 *
 * Two kinds of text live here, and the difference matters:
 *
 *  - FOUNDER lines are copied verbatim from text the founder already wrote and
 *    published (the community description, the st1 story, the current homepage).
 *    Do not reword them. Cut by omission only.
 *  - DRAFT lines are agent-written placeholders. Headlines, button labels and value
 *    statements are founder decisions, so every draft is rendered through <Draft>
 *    and shows a visible marker until the founder replaces or approves it.
 *
 * A prototype that needs a sentence this file does not have adds it to DRAFTS here,
 * never inline in the page.
 */
import { publicMediaUrl } from "@/lib/public-media";

export const FOUNDER = {
  /** Community blurb. */
  blurb:
    "We reveal gaps in cognitive understanding instead of pretending, and carry the habit out of the room.",
  /** Earlier community blurb, superseded on the group page, kept here for its image of a hidden number. */
  hiddenNumber:
    "In every conversation there's a hidden number: how well you both know you understood each other. Nobody asks. We ask.",
  /** Community description, the norm. */
  norm: [
    "Ask a colleague what they understood from your words and it reads as disrespect.",
    "Admit you did not fully understand them and they might think you are stupid.",
    "So people pretend they understood, and the gap in cognitive understanding stays hidden.",
  ],
  /** Community description, the five barriers. Order is the founder's. */
  barriers: ["ego", "fear", "laziness", "plausible deniability", "ignorance"],
  barriersClose: "The first four are hard to shift. Ignorance is not. It can be filled.",
  /** Community description, the definition. */
  definition:
    "Cognitive understanding is knowing what the other person means, and both of you knowing that the other knows it.",
  notAgreement:
    "You can fully understand someone, not feel what they feel, and still disagree.",
  /** Community description, what activism means here. */
  activism:
    "Communication activism is about spreading good communication practice.",
  activismResearch:
    "And it is about finding out together how to spread it faster, cheaper and with less effort, in a way that spreads on its own.",
  joining:
    "Joining needs no skill. It needs the will to improve your own communication and other people's.",
  /** Community description, the six personal benefits. */
  benefits: [
    "avoid preventable mistakes",
    "accelerate your learning",
    "build trust faster",
    "increase your own trustworthiness",
    "reduce conflicts that get emotionally stuck",
    "strengthen your professional and personal relationships",
  ],
  /** Community description, belonging. */
  home:
    "A lasting home is not a place. It is the people who share the value of integrity, and who practise intellectual honesty to help each other catch their own mistakes.",
  /** Current homepage. */
  normalToAdmit: "Make it normal to admit “I don’t understand”",
  revealBridge: "Reveal gaps easily. Bridge them safely.",
  crave: "We all crave being understood. Let's commit to listen.",
  /** Current homepage, the tapper and listener study (Newton, 1990). */
  tapper:
    "We think our meaning is far more obvious than it is. Tap a song's rhythm: tappers expect 50% of listeners to name it; 2.5% do.",
  /** The st1 story, verbatim, paragraph by paragraph. */
  st1: [
    "I had a conflict with someone I know well. I asked them if they think I understand them. They said: yes. Days later, they said I didn't understand them.",
    "Did they forget? Was it a lie? Then I saw it could be a misunderstanding, because the word “understand” has at least three meanings.",
    "Agreement: some people insist you don't understand them until you agree.",
    "Emotional understanding: you feel what I feel.",
    "Cognitive understanding: you explained back my intended meaning, and I confirmed you understand me 10 out of 10.",
    "They confirmed I cognitively understood them, but they needed me to emotionally understand them.",
  ],
} as const;

/** Agent-written placeholders. Every one of these is a founder decision. */
export const DRAFTS = {
  /**
   * The founder's spoken intent names companies with a word the P1193 source contract
   * bans from every visible string in src (it was the old product noun for a group).
   * "teams" stands in until the founder picks the word.
   */
  founderLine: "I help people and teams make it normal to reveal what they did not understand.",
  watchCta: "Watch the story",
  eventCta: "Come to a Clarity Night",
  communityCta: "Join the community",
  teamsLink: "For teams",
} as const;

export const MEDIA = {
  /** The st1 story's video and its own poster image. */
  st1VideoUrl: "https://youtu.be/k4zpMYIKK5A",
  st1PosterUrl:
    publicMediaUrl("story-images/883d89f5-4449-46b2-a663-f4f2c7204c22/ce9328cc-621e-47b1-90f0-26baea23eed4.jpg"),
  st1StoryPath: "/story/883d89f5-4449-46b2-a663-f4f2c7204c22",
  founderPhoto: "/founder-photo.jpg",
} as const;

export const LINKS = {
  events: "/events",
  community: "/groups/cm",
  /** The current business homepage. It moves to its own address if a prototype ever replaces "/". */
  teams: "/",
  tapperStudy: "Newton (1990), The Rocky Road from Actions to Intentions, Stanford dissertation",
} as const;
