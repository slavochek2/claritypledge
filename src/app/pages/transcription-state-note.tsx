/**
 * @file transcription-state-note.tsx
 * @description P1604: the line inside a transcription session that says its text is still being prepared, or could not be. The live
 * text, if any, stays readable under it.
 */
import { Clock, XCircle } from 'lucide-react';
import type { TranscriptionState } from '@/app/data/room-transcription-state';
import { TRANSCRIPT_FAILED, TRANSCRIPT_PROCESSING } from '@/app/components/session/capture-copy';

export function TranscriptionStateNote({ state }: { state: TranscriptionState }) {
  if (state === 'processing') {
    return (
      <p role="status" className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="transcription-state">
        <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span className="min-w-0">{TRANSCRIPT_PROCESSING}</span>
      </p>
    );
  }
  if (state === 'failed') {
    return (
      <p role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive" data-testid="transcription-state">
        <XCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span className="min-w-0">{TRANSCRIPT_FAILED}</span>
      </p>
    );
  }
  return null;
}
