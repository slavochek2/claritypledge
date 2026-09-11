/**
 * @file mock-data.ts
 * @description P1307 clickable prototype — mock event + transcript fixtures.
 * No network calls, no DB. Obviously-fake values only (this is a public repo).
 */

export const MOCK_EVENT_NAME = 'Clarity Night — Tallinn';

export interface MockTranscriptMessage {
  id: string;
  speaker: string;
  time: string;
  text: string;
}

/** Three consecutive fragments from the same speaker (Maria), then a reply from Jonas —
 * exercises the consecutive-same-speaker merge the transcript screen must render. */
export const MOCK_MESSAGES: MockTranscriptMessage[] = [
  { id: 'm1', speaker: 'Maria', time: '7:02 PM', text: "So I've been thinking about the pricing question again —" },
  { id: 'm2', speaker: 'Maria', time: '7:02 PM', text: 'specifically whether we\'re even at the right stage for it.' },
  { id: 'm3', speaker: 'Maria', time: '7:03 PM', text: 'Like, does it make sense to lock anything in this early?' },
  { id: 'm4', speaker: 'Jonas', time: '7:03 PM', text: "That's fair — I think we can hold off another cycle and see what the data says." },
];

/** The speaker shown with a live "…" indicator, as if still mid-sentence. */
export const MOCK_CURRENTLY_TALKING = 'Jonas';
