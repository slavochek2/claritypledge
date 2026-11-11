/**
 * Copy and citations for the /tree/landing-fable design exploration (P1665).
 * A verbatim copy of the constants in src/app/pages/build-right-thing-landing.tsx, which does
 * not export them. If this design is adopted, the page reads the originals and this file goes.
 */
export const REFERENCES = [
  { n: 1, label: "CB Insights — The Top Reasons Startups Fail (no market need: the #1 reason, cited in 35% of post-mortems)", url: "https://www.cbinsights.com/research/startup-failure-reasons-top/" },
  { n: 2, label: "Axios HQ — Internal Communications Statistics", url: "https://www.axioshq.com/insights/internal-communications-statistics" },
  { n: 3, label: "Radical Candor — The Trust Gap: State of the Workplace Insights (2026)", url: "https://www.radicalcandor.com/trust-gap" },
  { n: 4, label: "Newton (1990) — The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)", url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf" },
  { n: 5, label: "Camerer, Loewenstein & Weber (1989) — The Curse of Knowledge in Economic Settings, Journal of Political Economy", url: "https://doi.org/10.1086/261651" },
  { n: 6, label: "Schegloff, Jefferson & Sacks (1977) — The Preference for Self-Correction in the Organization of Repair in Conversation, Language", url: "https://doi.org/10.2307/413107" },
  { n: 7, label: "Kendrick (2015) — The Intersection of Turn-Taking and Repair: The Timing of Other-Initiations of Repair, Frontiers in Psychology", url: "https://doi.org/10.3389/fpsyg.2015.00250" },
];

export const ASSUMED_STATS = [
  { value: 8, denom: 10, label: "leaders believe they're clear", ref: 2 },
  { value: 5, denom: 10, label: "employees don't agree their leaders are clear", ref: 2 },
  { value: 6, denom: 10, label: "employees are afraid to speak up at work", ref: 3 },
];

export const REASONS_NOBODY_CHECKS: { title: string; text: string; ref: number; ref2?: number }[] = [
  { title: "Illusion of transparency", text: "We think our meaning is far more obvious than it is. Tap a song's rhythm: tappers expect 50% of listeners to name it; 2.5% do.", ref: 4 },
  { title: "Curse of knowledge", text: "Once you know something, you can't un-know it — which makes it hard to feel what the other person is missing.", ref: 5 },
  { title: "The social norm", text: "Conversation is built to let people fix their own meaning — stepping in to check what someone understood is a marked move. So we delay it, soften it, or skip it.", ref: 6, ref2: 7 },
];
