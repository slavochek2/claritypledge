/**
 * @file model.ts
 * @description P1722 exploration: the invented data the /tree/solo-clarify screens draw. Obviously fake, no network.
 */
import { extractHashtags, stripHashtags } from '@/lib/utils';
export type Visibility = 'private' | 'public';

export interface FakeMessage {
  id: string;
  /** 'me' is the viewer; 'mirror' is their Mirror agent; anything else is a person in the room. */
  who: 'me' | 'mirror' | 'other';
  text: string;
  /** Spoken and transcribed rather than typed. */
  transcribed?: boolean;
  /** A one-mic recording: who the transcription thinks spoke. */
  speaker?: string;
  time: string;
}

export const ME = 'Sam (example)';
export const MIRROR = "Sam's mirror";
export const OTHER = 'Mia (example)';

/** Think out loud in the Mirror chat: voice, then a typed aside to the Mirror. */
export const MIRROR_TALK: FakeMessage[] = [
  { id: 'm1', who: 'me', transcribed: true, time: '09:12', text: 'So I keep thinking that people only change their mind when they feel heard first. Like, if I just argue, nothing moves.' },
  { id: 'm2', who: 'me', transcribed: true, time: '09:13', text: 'And the restating thing works because the other person checks that I got it. Blah blah, example text for the prototype.' },
  { id: 'm3', who: 'me', time: '09:14', text: '@mirror what I really mean: being restated correctly is the precondition, not the arguments.' },
];

/** One microphone, two people, only one of them a user. */
export const ONE_MIC_TALK: FakeMessage[] = [
  { id: 'o1', who: 'me', transcribed: true, speaker: 'Speaker 1', time: '18:40', text: 'I think we should launch the course in spring, not wait for the full curriculum.' },
  { id: 'o2', who: 'other', transcribed: true, speaker: 'Speaker 2', time: '18:41', text: 'But if it is half finished, people will judge it on the half. First impressions stick (example).' },
  { id: 'o3', who: 'me', transcribed: true, speaker: 'Speaker 1', time: '18:42', text: 'Fair. So maybe spring with a smaller promise, not a smaller course.' },
];

/** A DM between the viewer and another user, where Clarify started. */
export const DM_TALK: FakeMessage[] = [
  { id: 'd1', who: 'other', time: '14:02', text: 'Honestly I think our team meetings are too long because nobody prepares (example).' },
  { id: 'd2', who: 'me', time: '14:03', text: 'I think it is the opposite: they are long because nobody is sure what was decided.' },
];

/** No tags in the invented drafts (src.md: no agent-authored hashtags): the founder types any to try it. */
export const DRAFTS = {
  mirrorNext: 'A conversation goes better when each side says back what they heard before answering.',
  mirror: 'Being restated correctly is what lets people change their mind, not the strength of the arguments.',
  oneMic: 'Launch the course in spring with a smaller promise, because people judge a half-finished course on the half that is there.',
  dm: 'Team meetings run long because nobody is sure what was decided, not because nobody prepares.',
} as const;

/** A #tag in the statement becomes a tag and the statement shows without it, as the feed does: the product's own rule (P1660: links masked, whole tokens only). */
export function splitTags(text: string): { statement: string; tags: string[] } {
  const tags = extractHashtags(text);
  return { statement: stripHashtags(text, tags), tags };
}

/** A tag the text does not carry: put in a #token's place, it shows whether the shared rule reads a hashtag at that spot. */
const probeFor = (text: string): string => {
  let probe = 'pprobe';
  while (text.toLowerCase().includes(probe)) probe += 'x';
  return probe;
};

/**
 * Removing a tag edits only the hashtags the shared P1660 extractor reads as that tag; the rest of the draft stays as typed
 * (stripHashtags is a display formatter: it also drops system tags and tidies whitespace, so it never writes back here).
 * The extractor reads `#` plus a run of word characters, so that run is the tag here too. It counts only where the
 * extractor reads a hashtag at that spot (tried by putting a probe tag there), so links, link titles and its other masks
 * are never touched. A tag that ends its word goes, with one space or a list comma beside it (`"#ai"` gives `""`); a tag
 * the word runs on from (`#ai-powered`, `#c++`) only loses its `#`, so no wording goes.
 */
export function removeTag(text: string, tag: string): string {
  const probe = probeFor(text);
  const edits: { at: number; end: number; put: string }[] = [];
  for (const m of text.matchAll(/#(\w+)/g)) {
    const at = m.index ?? 0;
    const end = at + m[0].length;
    if ((m[1] ?? '').toLowerCase() !== tag) continue;
    if (!extractHashtags(`${text.slice(0, at)}#${probe}${text.slice(end)}`).includes(probe)) continue;
    const wordRunsOn = /^[-'\u2019+\p{L}\p{M}\p{N}]/u.test(text.slice(end));
    edits.push({ at, end, put: wordRunsOn ? (m[1] ?? '') : '' });
  }
  let out = text;
  for (const { at, end, put } of edits.reverse()) {
    const [from, to] = put === '' ? withSpacing(out, at, end) : [at, end];
    out = out.slice(0, from) + put + out.slice(to);
  }
  return out;
}

/** The span a deleted tag takes with it: one space beside it, or a list comma after it at the start of a line, phrase or bracket. */
function withSpacing(text: string, from: number, to: number): [number, number] {
  const before = text[from - 1];
  const after = text[to];
  const lineStart = from === 0 || /[\s([{"'\u201c\u2018]/.test(before ?? '');
  const spaceBefore = before === ' ' || before === '\t';
  const list = /^[,;](?:[ \t]|(?=\n|$))/.exec(text.slice(to));
  if (lineStart && list) return [list[0].length === 1 && spaceBefore ? from - 1 : from, to + list[0].length];
  if ((after === ' ' || after === '\t') && lineStart) return [from, to + 1];
  if (spaceBefore && (after === undefined || after === '\n' || /[.,;:!?)]/.test(after))) return [from - 1, to];
  return [from, to];
}
