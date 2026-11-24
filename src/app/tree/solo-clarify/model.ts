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
  oneMic: 'Launch the course in spring with a smaller promise rather than a smaller course.',
  dm: 'Team meetings run long because nobody is sure what was decided, not because nobody prepares.',
} as const;

/** A #tag in the statement becomes a tag and the statement shows without it, as the feed does: the product's own rule (P1660: links masked, whole tokens only). */
export function splitTags(text: string): { statement: string; tags: string[] } {
  const tags = extractHashtags(text);
  return { statement: stripHashtags(text, tags), tags };
}

/** The text without `#tag` (the shared rule, so a tag such as `c++` is matched literally). */
export const removeTag = (text: string, tag: string): string => stripHashtags(text, [tag]);
