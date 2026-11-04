/**
 * @file transcription-session-row.tsx
 * @description P1604: a transcription session in session history (a seat in a transcribe room). It says what it is ("Transcript",
 * with the chat's name when it has one), where its text stands, and the whole card opens the text directly, with a visible "Open" button.
 * It never says "0 rounds": a transcription session has none. Split out of session-list.tsx.
 */
import { Clock, FileText, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionSummary } from '@/app/data/sessions-service';
import { TRANSCRIPT_FAILED, TRANSCRIPT_PROCESSING, TRANSCRIPT_TITLE } from '@/app/components/session/capture-copy';

function stateText(state: SessionSummary['transcriptionState']): string | null {
  if (state === 'processing') return TRANSCRIPT_PROCESSING;
  return state === 'failed' ? TRANSCRIPT_FAILED : null;
}

export function TranscriptionSessionRow({ session, time, dateLabel, onClick }: {
  session: SessionSummary;
  time: string;
  dateLabel: string;
  onClick: (session: SessionSummary) => void;
}) {
  const state = stateText(session.transcriptionState);
  const where = session.chatName ? `${time} · ${session.chatName}` : time;
  const title = `Open ${TRANSCRIPT_TITLE.toLowerCase()}${session.chatName ? ` in ${session.chatName}` : ''} on ${dateLabel}${state ? `, ${state}` : ''}`;
  return (
    // ONE click target: the visible "Open" button. It stretches over the whole card (a ::after covering it), so a tap anywhere on the card is a
    // tap on the button: one tab stop, one focus ring (shown on the card), one handler, nothing relying on bubbling.
    <li className="mb-2">
      <div
        data-testid="transcript-row"
        className="relative w-full flex items-center gap-3 px-4 py-3 min-h-[64px] rounded-lg border bg-card hover:bg-muted/50 active:bg-muted transition-colors cursor-pointer focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      >
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden="true">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium text-foreground">{TRANSCRIPT_TITLE}</span>
          <span className="truncate text-xs text-muted-foreground">{where}</span>
          {state && (
            <span className={`mt-0.5 flex items-center gap-1.5 text-xs ${session.transcriptionState === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
              {session.transcriptionState === 'failed'
                ? <XCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                : <Clock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />}
              <span className="min-w-0">{state}</span>
            </span>
          )}
        </span>
        {/* Design system: a details action is tertiary, variant="ghost". */}
        <Button
          type="button"
          variant="ghost"
          aria-label={title}
          onClick={() => onClick(session)}
          className="min-h-11 flex-shrink-0 px-3 text-sm after:absolute after:inset-0 after:content-[''] focus-visible:ring-0"
        >
          Open
        </Button>
      </div>
    </li>
  );
}
