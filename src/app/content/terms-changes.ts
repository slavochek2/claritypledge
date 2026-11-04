/**
 * What changed in each terms version, shown in the re-acceptance popup.
 *
 * A returning user asked to accept updated terms must be told what changed, not
 * only handed two long documents. `headline` is the one visible sentence;
 * `highlights` open on demand behind "Show more". Bumping CURRENT_TERMS_VERSION without adding an
 * entry here fails src/tests/terms-change-summary.test.ts.
 *
 * `requiresConsent` picks how returning users are told. false: a dismissible
 * banner (notice; continued use is acceptance). true: the blocking popup, for a
 * change that needs fresh, explicit consent. Bumps are batched into the
 * quarterly terms review, not made per edit (decisions.md 2026-09-14, P1307 D15).
 *
 * How to write an entry (founder, P1596): the reader has never seen the feature and does not know our
 * words. A notice that opens with "we changed the terms" reads as taking something away, so when the
 * version comes with something new, `title` announces it and `headline` says what the person gains.
 * Never invent a gain: a change with no new benefit is kind 'terms-only' and says plainly what
 * changed. Kind (what the news is) and requiresConsent (how much agreement it needs) are separate:
 * a new feature can still need the blocking popup. The costs people
 * would mind most (who can see it, what happens to someone who does not use it) belong in `headline`,
 * visible without opening anything. The rest goes in `highlights`. The "updated Terms" line and "you agree" sit below, added by the component.
 */
export interface TermsChangeSummary {
  requiresConsent: boolean;
  /** 'feature': the version brings something new, and the title must start with "New". */
  kind: 'feature' | 'terms-only';
  /** Opens the notice: the new thing, or for terms-only what changed, in a few plain words. */
  title: string;
  headline: string;
  /** At most three plain-language lines; the full documents carry the rest. */
  highlights: string[];
}

/** Newest first: termsPrompt reads this order to find what someone has not seen. */
export const TERMS_CHANGES: Record<string, TermsChangeSummary> = {
  'v1.7': {
    // Notice, not re-acceptance (founder, P1536, 2026-11-04; overrides the quarterly batching of
    // decisions.md 2026-09-14): drafting a canvas sends the owner's material to Gemini. Retention
    // follows spec P1536 D16: text of uploads deleted at Publish, or kept at most 30 days while a
    // further canvas is offered. Original files are not kept; privacy.md carries the full text.
    requiresConsent: false,
    kind: 'feature',
    title: 'New feature: your mirror agent can draft or update your canvas',
    headline: "Give your mirror agent files, links or text and it writes draft points for a canvas, using Google's Gemini. What you give it, and the canvas so far, goes to Google. The draft stays private to you until you publish it.",
    highlights: [
      'If your material names other people, their details go to Google too, so only share what you have the right to share.',
      'We keep the text of your uploads, not the files. Publishing deletes it, or keeps it for at most 30 days while your agent offers another canvas from the same material. Discarding the draft, or deleting the canvas or your account, deletes it too.',
      'Our policy now has one rule for every AI feature: we announce a new AI provider, a new kind of data or a new purpose before it starts.',
    ],
  },
  'v1.6': {
    // Notice, not re-acceptance (founder, P1592): transcription at an event now reaches the event's
    // channel. The person transcribing still switches it on themselves (D7).
    requiresConsent: false,
    kind: 'feature',
    title: 'New feature: keep your event conversations in writing',
    headline: "At events that offer it, you can save what you say as text in the event's chat. The host and attendees can read and forward it, and someone nearby with it on may pick up your voice and post it under their name.",
    highlights: [
      "It appears under your name after each part of the event, and anything said in between is posted at the end. People who weren't there can read it too.",
      "We keep your audio. Google's Gemini turns it into text, and we may use it, with names removed (a voice can still identify someone), to improve our AI.",
      'If people talk over each other, some words may be missing.',
    ],
  },
  'v1.5': {
    // Blocking (founder, P1544): reverses the earlier promise that no AI reads a chat. The mirror agent
    // sends recent chat text, other members' messages included, to the Gemini API (privacy.md).
    requiresConsent: true,
    kind: 'feature',
    title: 'New: your mirror agent can answer you',
    headline: "Your mirror agent can now answer you, using Google's Gemini. It reads your recent chat messages, and other members' agents may read what you post.",
    highlights: [
      'It reads recent messages from your chats, up to a limit, and only you see its answer.',
      "Other members' mirror agents may read what you post in a chat you share with them.",
      'To object, delete your messages or your account. Leaving a chat does not remove what you posted.',
    ],
  },
  'v1.4': {
    // Blocking (founder): this version newly describes voice profiles, biometric data on
    // a consent basis with no separate prompt of their own (privacy.md), so it asks for
    // explicit acceptance. Later versions default to the banner unless they need consent.
    requiresConsent: true,
    kind: 'terms-only',
    title: "We've updated our Terms and Privacy Policy",
    headline: 'We now say clearly who handles your data, including voice and analytics.',
    highlights: [
      'Our analytics can replay how you move around the site.',
      "We list every service that handles your data, and where it's stored (US or EU).",
      'We explain how we use your voice audio and transcripts.',
    ],
  },
};
