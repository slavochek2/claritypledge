/**
 * @file room-transcript-view.tsx
 * @description P1307 Decision 4 / P1604: a transcribe room session's text in session history. The standard Back, the title with Copy
 * on the same row, the state note, and speaker blocks that look like the chat's: the person's mark (ring for a pledger) and a name
 * linking to their profile. A round session is headed block by block in time order. Split out of my-sessions-page.tsx (its size limit).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { PageHeader } from '@/app/components/layout/page-header';
import { fetchRoomTranscript } from '@/app/data/api';
import type { SpeakerSegment, TranscriptSection } from '@/app/data/room-clean-transcript';
import { fetchSpeakerPeople, type SpeakerPerson } from '@/app/data/transcript-speakers';
import type { TranscriptionState } from '@/app/data/room-transcription-state';
import { TranscriptSkeleton } from '@/app/pages/my-sessions-skeleton';
import { SectionWait } from '@/components/ui/section-wait';
import { useTranscript } from '@/app/pages/use-transcript';
import { CopyTranscriptButton } from '@/app/pages/transcript-copy-control';
import { useEscapeBack } from '@/app/pages/use-escape-back';
import { useRoomTranscriptionState } from '@/app/pages/use-room-transcription-state';
import { TranscriptionStateNote } from '@/app/pages/transcription-state-note';
import { headingBefore } from '@/app/pages/transcript-blocks';
import { FOCUS_RING, PersonMark } from '@/app/pages/chat/chat-kit';
import { AuthorName } from '@/app/pages/chat/MessageParts';
import { UnlinkedAuthorMark } from '@/app/pages/chat/MessageRowPlaceholders';

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
}

function copyText(segments: SpeakerSegment[]): string {
  return segments.map((seg) => `${seg.speakerLabel} [${formatTimestamp(seg.startMs)}]: ${seg.text}`).join('\n');
}

/** The seat -> person map, read once the text carries seats. */
function useSpeakers(roomId: string, segments: SpeakerSegment[] | undefined): Map<string, SpeakerPerson> {
  const [people, setPeople] = useState<Map<string, SpeakerPerson>>(new Map());
  const hasSeats = !!segments?.some((s) => s.memberId);
  useEffect(() => {
    if (!hasSeats) return;
    let live = true;
    void fetchSpeakerPeople(roomId).then((got) => { if (live) setPeople(got); });
    return () => { live = false; };
  }, [roomId, hasSeats]);
  return people;
}

/** The mark and the name of one speaker, the way a chat message shows its author. */
function SpeakerHeader({ segment, person, time }: { segment: SpeakerSegment; person: SpeakerPerson | undefined; time: string }) {
  if (!segment.memberId || !person) {
    return (
      <div className="flex items-baseline gap-2 mb-0.5">
        <span className="font-semibold text-foreground">{segment.speakerLabel}</span>
        <span className="text-xs text-muted-foreground">{time}</span>
      </div>
    );
  }
  const author = person.kind === 'person' ? person.author : undefined;
  const authorId = person.kind === 'deleted' ? null : author?.id ?? 'unknown';
  return (
    <div className="flex items-center gap-3 mb-1">
      {author?.slug ? (
        <Link to={`/p/${author.slug}`} aria-label={`Open ${author.name}'s profile`} className={`relative block shrink-0 rounded-full ${FOCUS_RING}`}>
          <PersonMark person={author} size="md" />
        </Link>
      ) : (
        <UnlinkedAuthorMark author={author} authorId={authorId} pending={false} />
      )}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 leading-6">
        <AuthorName author={author} authorId={authorId} pending={false} className="min-w-0 max-w-full truncate text-[15px] text-foreground" />
        <span className="text-xs text-muted-foreground">{time}</span>
      </div>
    </div>
  );
}

export function RoomTranscriptView({ roomId, title, initialState, onBack }: { roomId: string; title: string; initialState: TranscriptionState; onBack: () => void }) {
  const { transcript, loading, failed, retry } = useTranscript(roomId, fetchRoomTranscript);
  // P1604: while the clean text is being prepared the live text is still here; when it arrives the text is read again.
  const state = useRoomTranscriptionState(roomId, initialState, retry);
  useEscapeBack(onBack);
  const segments = transcript?.segments as SpeakerSegment[] | undefined;
  const people = useSpeakers(roomId, segments);
  const sections = useMemo(
    () => new Map(((transcript as { sections?: TranscriptSection[] } | null)?.sections ?? []).map((s) => [s.jobId, s])),
    [transcript],
  );
  const hasText = !!segments && segments.length > 0;

  return (
    <>
      <FocusHeader onBack={onBack} />
      <PageHeader
        title={title}
        actions={hasText ? <CopyTranscriptButton getText={() => copyText(segments)} errorLabel="[P1307] Failed to copy room transcript" /> : undefined}
      />
      {loading ? (
        <SectionWait failed={failed} onRetry={retry}><TranscriptSkeleton /></SectionWait>
      ) : !hasText ? (
        <div className="text-center py-12" data-testid="room-transcript-empty">
          <TranscriptionStateNote state={state} />
          <p className="text-sm text-muted-foreground">No speech detected in this recording.</p>
        </div>
      ) : (
        <div data-testid="room-transcript" data-source={transcript?.source}>
          <TranscriptionStateNote state={state} />
          <div className="space-y-4">
            {segments.map((segment, i) => {
              const heading = headingBefore(segment.jobId, segments[i - 1]?.jobId, sections);
              return (
                <div key={i}>
                  {heading && <h2 className="mb-2 mt-2 text-sm font-semibold text-muted-foreground">{heading}</h2>}
                  <article aria-label={`${segment.speakerLabel} at ${formatTimestamp(segment.startMs)}`} className="text-sm">
                    <SpeakerHeader segment={segment} person={segment.memberId ? people.get(segment.memberId) : undefined} time={formatTimestamp(segment.startMs)} />
                    <p className="text-foreground/90 leading-relaxed">{segment.text}</p>
                    {/* Decision 5's label: a sentence several phones heard is kept, never deleted. */}
                    {segment.alsoHeardBy.length > 0 && (
                      <p className="text-xs text-muted-foreground">also heard by {segment.alsoHeardBy.join(', ')}</p>
                    )}
                    {segment.fromIncompleteRecording && (
                      // [FOUNDER DECISION: copy — placeholder] Part 3: an incomplete archive is reported, never presented as whole.
                      <p className="text-xs text-muted-foreground">Recording incomplete</p>
                    )}
                  </article>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
