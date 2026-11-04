/**
 * @file sessions-view.ts
 * @description The /sessions view stack and its navigation rules, out of my-sessions-page.tsx (P1604). list → session detail → round
 * summary | transcript. A transcription session (a seat in a transcribe room) has no rounds, so opening it from the list goes
 * straight to its text, and Back from the text returns to the list; a real rounds session keeps its detail page in between.
 */
import type { SessionSummary } from '@/app/data/sessions-service';
import { TRANSCRIPT_TITLE } from '@/app/components/session/capture-copy';

export type SessionView =
  | { type: 'list' }
  | { type: 'session'; session: SessionSummary }
  | { type: 'round'; session: SessionSummary; roundIndex: number }
  | { type: 'transcript'; session: SessionSummary };

/** What a click on a list row opens. */
export function openFromList(session: SessionSummary): SessionView {
  return session.roomId ? { type: 'transcript', session } : { type: 'session', session };
}

/** Where Back goes from this view. */
export function previousView(view: SessionView): SessionView {
  if (view.type === 'list') return view;
  if (view.type === 'session') return { type: 'list' };
  if (view.type === 'transcript' && view.session.roomId) return { type: 'list' };
  return { type: 'session', session: view.session };
}

export function transcriptHeading(session: SessionSummary): string {
  return session.chatName ? `${TRANSCRIPT_TITLE} · ${session.chatName}` : TRANSCRIPT_TITLE;
}

/** The title row of each view: the list, a session (date and partner), a transcript, a round (its story shows the content, so no duplicate). */
export function viewTitle(view: SessionView): string {
  if (view.type === 'list') return 'Session History';
  if (view.type === 'session') return `${formatSessionDate(view.session.date)} · ${view.session.partnerName}`;
  if (view.type === 'transcript') return transcriptHeading(view.session);
  const item = view.session.sessionHistory[view.roundIndex];
  return item?.storyData ? `Round ${view.roundIndex + 1}` : item?.title || `Round ${view.roundIndex + 1}`;
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
