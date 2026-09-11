/**
 * @file TranscriptScreen.tsx
 * @description P1307 clickable prototype — mock transcript view, styled after the message
 * rows in `src/app/pages/transcribe-room-page.tsx` (`text-sm`, bold name + muted timestamp,
 * then the text). Consecutive same-speaker rows are MERGED into one block (name + time shown
 * once, fragments joined) rather than repeating the header per fragment — mock data has
 * Maria speak 3 consecutive fragments before Jonas replies, to exercise that merge.
 *
 * The "currently talking" indicator mirrors that page's listening-indicator dot
 * (`bg-blue-500 rounded-full animate-pulse`) but as an animated "…" under the live speaker.
 */
import { FocusHeader } from '@/app/components/layout/focus-header';
import { MOCK_CURRENTLY_TALKING, MOCK_MESSAGES, type MockTranscriptMessage } from './mock-data';

interface MergedBlock {
  speaker: string;
  time: string;
  text: string;
}

/** Consecutive same-speaker messages collapse into one block — name + time shown once. */
function mergeConsecutive(messages: MockTranscriptMessage[]): MergedBlock[] {
  const blocks: MergedBlock[] = [];
  for (const msg of messages) {
    const last = blocks[blocks.length - 1];
    if (last && last.speaker === msg.speaker) {
      last.text = `${last.text} ${msg.text}`;
    } else {
      blocks.push({ speaker: msg.speaker, time: msg.time, text: msg.text });
    }
  }
  return blocks;
}

function TalkingIndicator() {
  return (
    <span className="inline-flex items-end gap-0.5 h-3" aria-hidden="true">
      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.2s]" />
      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.1s]" />
      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" />
    </span>
  );
}

export function TranscriptScreen({ onBack }: { onBack: () => void }) {
  const blocks = mergeConsecutive(MOCK_MESSAGES);

  return (
    <div data-testid="proto-transcript" className="mx-auto w-full max-w-2xl px-4 py-6">
      <FocusHeader onBack={onBack} label="Back" aria-label="Back to meet" />

      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        Stand-in for the existing /transcribe room page — the only changes shown are merged
        messages and the “…” indicator
      </p>
      <h1 className="text-lg font-semibold text-foreground mb-4">Room transcript</h1>

      <div className="space-y-3">
        {blocks.map((block, i) => {
          // The live speaker's dots join their own last block rather than opening a new,
          // name-stamped one — repeating the name is the exact complaint the merge fixes.
          const talkingHere = i === blocks.length - 1 && block.speaker === MOCK_CURRENTLY_TALKING;
          return (
            <div key={i} className="text-sm" data-testid="proto-transcript-message">
              <span className="font-medium">{block.speaker}</span>{' '}
              <span className="text-xs text-muted-foreground">{block.time}</span>
              <p>{block.text}</p>
              {talkingHere && (
                <div className="mt-0.5" data-testid="proto-transcript-talking">
                  <TalkingIndicator />
                </div>
              )}
            </div>
          );
        })}

        {/* A different person started talking: new block with just the live dots. */}
        {blocks[blocks.length - 1]?.speaker !== MOCK_CURRENTLY_TALKING && (
          <div className="text-sm" data-testid="proto-transcript-talking">
            <span className="font-medium">{MOCK_CURRENTLY_TALKING}</span>{' '}
            <span className="text-xs text-muted-foreground">now</span>
            <div className="mt-0.5">
              <TalkingIndicator />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
