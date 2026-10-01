/**
 * @file prep-content.tsx
 * @description P1336 — the preparation's page data: clip sources, transcripts, the research
 * Q&A and the share targets. Moved here from the approved prototype (/tree/p1336-d) so the
 * product page and the prototype read one copy.
 */
import type { ReactNode } from 'react';
import { TELEGRAM_GLYPH, WHATSAPP_GLYPH } from '../components/GroupChatBlock';
import type { ClipKey } from './prep-plan';
import { publicMediaUrl } from '@/lib/public-media';

// ─── clips: public media bucket, versioned filenames (cache-busting) ─────────

/**
 * The clips live with the site's other public media under `event-prep/` — see
 * src/lib/public-media.ts for why that is GCS and never Supabase Storage. One upload serves
 * every environment. Pinned by the CSP tests in p1336-prep-pieces and p1385-public-media.
 */
/** Bump with a re-render: the new file is uploaded under the new name, never over the old. */
export const CLIP_FILE_VERSION = 'v1';

const CLIP_NAMES: Record<ClipKey, string> = {
  welcome: 'why-clarity-night',
  story: 'cognitive-understanding',
  principle: 'principle',
  research: 'research-recording',
};

export const CLIP_PLAY_LABELS: Record<ClipKey, string> = {
  welcome: 'Play the How we are different video',
  story: 'Play the cognitive understanding video',
  principle: 'Play the principle video',
  research: 'Play the recording video',
};

export const CLIP_POSTER_ALT: Record<ClipKey, string> = {
  welcome: 'Slava speaking at Clarity Night #1',
  story: 'The cognitive understanding video',
  principle: 'Slava speaking at Clarity Night #1',
  research: 'Slava speaking at Clarity Night #1',
};

/** Public object URL. Faststart MP4s, so playback starts before the whole file arrives. */
export function clipUrl(clip: ClipKey, kind: 'video' | 'poster'): string {
  const file = `${CLIP_NAMES[clip]}-${CLIP_FILE_VERSION}${kind === 'video' ? '.mp4' : '-poster.jpg'}`;
  return publicMediaUrl(`event-prep/${file}`);
}

/** Each clip's own words, from the Night #1 transcript at the clip's in/out points. */
export const TRANSCRIPTS: Record<ClipKey, string[]> = {
  welcome: [
    "So when I invited people to this event, I got some rejections, and I asked for feedback. Generally speaking, people don't come to public discussions about global things because they think it's a waste of time.",
    "It's because of these three things. First, people have monologues and don't listen to each other. Second, disagreements split the room, and nobody learns anything. And last but not least, at some point, if events are repeating, people just agree, for example, with the host, or hate the host.",
    "If you say, how come, what is the crux? Why is it that discussions are not meaningful, or unproductive, or not effective, in public discussions like the one we will have today, or in personal discussions, or professional meetings? I suggest one of the main reasons is a social norm. In many social environments, admitting that you don't understand cognitively, revealing that there is a gap in understanding, is not tolerated, usually punished, because people think: oh, so what are you saying, you're stupid? Or didn't you pay attention?",
    "And if we reflect on how it affects the dynamic of the discussion: if we don't reveal the gap, we cannot bridge the gap. And I suggest that all of the things I said at the beginning, why people have bad discussions, not meaningful discussions, can be traced to this reason. So today, it's part of the experiment, meaning I developed some tools to see if I can help create this environment, where it's rewarding to reveal the gap in cognitive understanding, so we can bridge it and have a more meaningful discussion, so we can learn from each other.",
  ],
  story: [
    'Now, I tell you quickly the story. This is a person I love, and we had a conflict. And I wanted, because of my focus, I wanted to verify that I understand her. So I repeated back, I explained back, I said, is that what you meant? And she told me, yes, that\'s what I mean. That\'s what I mean. And after a few days, the conflict escalated and she wrote me, I don\'t want to speak to you anymore, because I didn\'t feel understood.',
    'So is it a lie, a memory issue, or a misunderstanding? Empirically, I found that the word understanding has three meanings. One, there are people who will say, you don\'t understand me until you agree. Okay, this is how you know: when they say you don\'t understand me, or you understand me, they mean agreement. Other people, they mean you don\'t feel what I feel. This is emotional understanding.',
    'Cognitive understanding means I repeat back your intended meaning, and then I ask you from zero to 10, how much do you think I understand you? Or you ask me how much I understand you. And if it\'s 10, if we both say 10, then we verified, we know exactly that I understood you, right? Because we verified. We might still disagree, and I might not feel what you feel, but we know that I have exactly the mental model that you have.',
  ],
  principle: [
    "This is a lot of text, but the text is not the important thing. It's super simple, it has three parts. I will introduce it. It's a Clarity Meeting Principle, I call it that, and then you can either opt in or opt out. Both are completely fine.",
    "So what is it? There is your right, my promise, and the exception. Basically, it says we allow each other to ask one specific question. The other person promises to answer. If you opt in, you promise to answer that question. If you, for some very specific reason, cannot answer, you explain why.",
    'The question is: how much, from 0 to 10, do you think you understand me cognitively?',
  ],
  research: [
    "So this is optional. If there are volunteers, then I'd like to suggest that I have microphones. Because there will be discussions, and for me it would be helpful for research and development to take the context of your discussion, analyze it with AI, and see if I can improve for the next event, and also personalize the experience for the future, if you opt into this. And if you don't like it, I can always delete the file.",
    "So we will have discussions with each other in pairs. And when you have a discussion, if both of you are part of this, then you are both being recorded, and it's diarized, so we identify you as the speakers. And I will use the context of your discussion, which I cannot hear, I cannot be there, to see if I'm actually succeeding to create these meaningful discussions, or maybe not.",
  ],
};

// ─── research ──────────────────────────────────────────────────────────────────────────

/** Written with every Yes; the Q&A below is the text that version refers to. */
export const RESEARCH_POLICY_VERSION = 'p1336-research-v1';

/** The deletion address the privacy policy lists (src/app/content/privacy.md), written as that page writes it. */
const PRIVACY_CONTACT = 'privacy AT claritypledge DOT com';

export const RESEARCH_QA: { q: string; a: ReactNode }[] = [
  {
    q: 'Who sees the audio recording?',
    a: 'All people who are part of the recorded conversation at the event. Clarity Pledge, as a research programme, reads the conversation transcripts, analysed with AI, for research, and doesn\'t listen to the audio. Event organisers and hosts don\'t read them.',
  },
  {
    q: 'Will my partner be recorded too?',
    a: 'Your microphone is a directional lavalier microphone. It picks up mostly you, but it can record some background sound around you.',
  },
  {
    q: 'Can I ask you to delete my data?',
    a: (
      <>
        Yes. Email us and we delete your recording and transcript.{' '}
        <span className="whitespace-nowrap">({PRIVACY_CONTACT})</span>
      </>
    ),
  },
];

export const RESEARCH_PROGRAMME_URL = 'https://github.com/slavochek2/claritypledge/blob/main/docs/research-programme.md';

// ─── share row ─────────────────────────────────────────────────────────────────────────

/** Brand glyphs (Simple Icons shapes, 24x24, fill=currentColor); WhatsApp/Telegram are GroupChatBlock's. */
const LINE_GLYPH =
  'M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314';
const FACEBOOK_GLYPH =
  'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z';
/** The four networks' standard web share URLs. */
export const shareTargets = (url: string, text: string) => {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(`${text} ${url}`);
  return [
    { name: 'LINE', glyph: LINE_GLYPH, href: `https://line.me/R/msg/text/?${t}` },
    { name: 'WhatsApp', glyph: WHATSAPP_GLYPH, href: `https://wa.me/?text=${t}` },
    { name: 'Telegram', glyph: TELEGRAM_GLYPH, href: `https://t.me/share/url?url=${u}&text=${encodeURIComponent(text)}` },
    { name: 'Facebook', glyph: FACEBOOK_GLYPH, href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  ];
};
