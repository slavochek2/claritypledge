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

/** A paragraph, or a short list whose items may lead with a bold label. */
export type TranscriptBlock = string | { items: { label?: string; text: string }[] };

/**
 * Each clip's words, from the Night #1 transcript at the clip's in/out points, lightly edited for
 * reading (founder, 2026-10-05): fillers and restarts cut, lists drawn out, no claim added or dropped.
 */
export const TRANSCRIPTS: Record<ClipKey, TranscriptBlock[]> = {
  welcome: [
    "When I invited people to this event, some said no, and I asked them why. Generally, people don't come to public discussions about big topics because they think it's a waste of time. It comes down to three things:",
    {
      items: [
        { label: 'Monologues.', text: "People talk and don't listen to each other." },
        { label: 'Split rooms.', text: 'Disagreements divide the room, and nobody learns anything.' },
        { label: 'Agree or hate.', text: 'When events repeat, people end up just agreeing with the host, or hating the host.' },
      ],
    },
    "So what is the crux? Why are discussions so often unproductive, in public events like this one, in personal conversations, in professional meetings? I suggest one of the main reasons is a social norm. In many places, admitting that you don't understand, revealing a gap in understanding, isn't tolerated. It's usually punished, because people think: so what, are you stupid? Weren't you paying attention?",
    "And if we don't reveal the gap, we can't bridge it. I suggest every reason I gave at the start can be traced back to this. So today is an experiment. I developed some tools to see if I can create an environment where revealing a gap in understanding is rewarded, so we can bridge it, have a more meaningful discussion, and learn from each other.",
  ],
  story: [
    'Let me tell you a quick story. This is someone I love, and we had a conflict. Because understanding is my focus, I wanted to check that I understood her. So I explained back what she said and asked, "Is that what you meant?" She said, "Yes, that\'s what I mean."',
    'A few days later the conflict escalated, and she wrote to me: "I don\'t want to speak to you anymore, because I didn\'t feel understood."',
    'So was it a lie, a memory issue, or a misunderstanding? I found that the word "understanding" has three meanings:',
    {
      items: [
        { label: 'Agreement.', text: 'For some people, "you don\'t understand me" means "you don\'t agree with me."' },
        { label: 'Emotional understanding.', text: 'For others, it means "you don\'t feel what I feel."' },
        { label: 'Cognitive understanding.', text: 'I repeat back what you meant, then ask: from 0 to 10, how well do you think I understand you?' },
      ],
    },
    "If we both say 10, we've checked it, and we know I understood you. We might still disagree, and I might not feel what you feel, but I have exactly the picture in my head that you have.",
  ],
  principle: [
    "There's a lot of text here, but the text isn't the important part. It's simple. I call it the Clarity Meeting Principle, and you can opt in or opt out. Both are completely fine. It has three parts:",
    {
      items: [
        { label: 'Your right.', text: 'We allow each other to ask one specific question.' },
        { label: 'My promise.', text: 'If you opt in, you promise to answer it.' },
        { label: 'The exception.', text: "If for some specific reason you can't answer, you explain why." },
      ],
    },
    'The question is: from 0 to 10, how much do you think you understand me cognitively?',
  ],
  research: [
    "This part is optional. If there are volunteers, I have microphones. Your discussions would help my research and development: I'd analyse them with AI to improve the next event, and, if you opt in, to personalise your experience in the future. If you change your mind, I can always delete the file.",
    "We'll have discussions in pairs. If both of you opt in, you're both recorded, and the recording is diarized, meaning each of you is identified as a speaker. I can't be in every conversation and I don't listen to them, so the analysis is how I see whether I'm actually succeeding in creating meaningful discussions, or not.",
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
  // Founder 2026-10-04: WhatsApp first (the hike and Clarity Night crowd is expats and nomads, and
  // our own groups run on WhatsApp), then LINE (Thai locals), then Facebook, then Telegram.
  return [
    { name: 'WhatsApp', glyph: WHATSAPP_GLYPH, href: `https://wa.me/?text=${t}` },
    { name: 'LINE', glyph: LINE_GLYPH, href: `https://line.me/R/msg/text/?${t}` },
    { name: 'Facebook', glyph: FACEBOOK_GLYPH, href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { name: 'Telegram', glyph: TELEGRAM_GLYPH, href: `https://t.me/share/url?url=${u}&text=${encodeURIComponent(text)}` },
  ];
};
