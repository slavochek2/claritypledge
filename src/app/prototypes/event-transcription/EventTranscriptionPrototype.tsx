/**
 * @file EventTranscriptionPrototype.tsx
 * @description P1307 — CLICKABLE PROTOTYPE for founder approval. Demonstrates live room
 * transcription starting from the event-room ready screen and continuing in the background
 * across pages, via a cross-page bar with Open/End actions.
 *
 * Mock state ONLY: no database writes, no microphone, no network calls, reachable without
 * login. All navigation is local component state (no react-router) — screens are `ready`,
 * `meet`, `transcript`, `practice`.
 *
 * Route: `/tree/event-transcription` (DEV-gated, this repo's prototype convention —
 * `.claude/rules/src.md` "Prototype Routes": one prefix, `/tree/*`, never `/prototypes/*`).
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ReadyScreen } from './ReadyScreen';
import { MeetScreen } from './MeetScreen';
import { TranscriptScreen } from './TranscriptScreen';
import { PracticeScreen } from './PracticeScreen';

type Screen = 'ready' | 'meet' | 'transcript' | 'practice';

/** Off: tapping the switch on is the recording consent (P1307 D12). */
const INITIAL_TRANSCRIBE_ON = false;

export function EventTranscriptionPrototype() {
  const [screen, setScreen] = useState<Screen>('ready');
  /** The ready screen's switch. */
  const [transcribeOn, setTranscribeOn] = useState(INITIAL_TRANSCRIBE_ON);
  /** Whether the cross-page bar is currently showing — set from `transcribeOn` on Continue,
   * and independently flipped off by the bar's own "End" action. */
  const [transcriptionActive, setTranscriptionActive] = useState(false);

  function handleReset() {
    setScreen('ready');
    setTranscribeOn(INITIAL_TRANSCRIBE_ON);
    setTranscriptionActive(false);
  }

  function handleContinueFromReady() {
    setTranscriptionActive(transcribeOn);
    setScreen('meet');
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="flex-1">
        {screen === 'ready' && (
          <ReadyScreen
            onBack={() => { /* mock: event page is out of scope for this prototype */ }}
            onContinue={handleContinueFromReady}
            transcribeOn={transcribeOn}
            onTranscribeChange={setTranscribeOn}
          />
        )}

        {screen === 'meet' && (
          <MeetScreen
            onBack={() => setScreen('ready')}
            transcriptionActive={transcriptionActive}
            onOpenTranscript={() => setScreen('transcript')}
            onEndTranscription={() => setTranscriptionActive(false)}
            onJoinPractice={() => setScreen('practice')}
          />
        )}

        {screen === 'transcript' && <TranscriptScreen onBack={() => setScreen('meet')} />}

        {screen === 'practice' && (
          <PracticeScreen onEndSession={() => setScreen('meet')} />
        )}
      </div>

      {/* Prototype controls — not part of the demonstrated product surface. */}
      <div
        data-testid="prototype-controls"
        className="border-t border-dashed border-border bg-muted/50 px-4 py-3 flex items-center justify-between gap-3"
      >
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Prototype controls
        </span>
        <Button
          onClick={handleReset}
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-9"
          data-testid="prototype-reset"
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
