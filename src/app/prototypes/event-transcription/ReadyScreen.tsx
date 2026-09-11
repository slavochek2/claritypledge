/**
 * @file ReadyScreen.tsx
 * @description P1307 clickable prototype — reproduces the look of
 * `src/app/prototypes/events/components/EventRoomReady.tsx` (back header, question, shared
 * `SliderTrack`, full-width `Continue` in `PRIMARY_BUTTON_CLASS`), REUSING those imports
 * rather than copying them. State is local mock state — no Supabase, no navigation, no auth.
 *
 * Adds the "Transcribe for AI insights" toggle above Continue (styled like
 * clarity-live-page.tsx's "Record for AI Insights" switch, ~L4130-4165) and the consent
 * copy below it (styled like clarity-live-page.tsx ~L4258-4270).
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { SliderTrack } from '@/app/components/partners/slider-track';
import { PRIMARY_BUTTON_CLASS } from '@/app/pages/meeting-terms-page';
import { cn } from '@/lib/utils';

const QUESTION = 'How up for thinking are you right now?';
const MIDPOINT_LABEL = 'Neutral';
const MIDPOINT_VALUE = 5;
const POLE_LABELS = { low: 'Keep it light', high: 'Go deep' };

export function ReadyScreen({
  onBack,
  onContinue,
  transcribeOn,
  onTranscribeChange,
}: {
  onBack: () => void;
  onContinue: () => void;
  transcribeOn: boolean;
  onTranscribeChange: (next: boolean) => void;
}) {
  const [value, setValue] = useState(MIDPOINT_VALUE);
  const [touched, setTouched] = useState(false);

  return (
    <div
      data-testid="proto-room-ready"
      className="flex min-h-[calc(100vh-4rem)] flex-col px-4 py-10 lg:min-h-[calc(100vh-5rem)]"
    >
      <h1 className="sr-only">Before you meet</h1>

      <div className="mx-auto w-full max-w-2xl">
        <FocusHeader onBack={onBack} label="Back" aria-label="Back to event" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <p className="text-center text-xl font-semibold leading-snug text-foreground sm:text-2xl">
            {QUESTION}
          </p>

          <div className="pt-4">
            <SliderTrack
              value={value}
              onChange={(next) => { setValue(next); setTouched(true); }}
              showValue={false}
              ariaLabel={QUESTION}
              midpointLabel={MIDPOINT_LABEL}
              poleLabels={POLE_LABELS}
              muted={!touched}
              bipolarFill
              expandedHitArea
            />
          </div>

          {/* Transcribe toggle — styled like clarity-live-page.tsx's "Record for AI
              Insights" switch (~L4130-4165). ON by default. */}
          <div className="w-full">
            <button
              role="switch"
              aria-checked={transcribeOn}
              aria-label={
                transcribeOn
                  ? 'Transcribe for AI insights — recording enabled'
                  : 'Transcribe for AI insights — recording disabled'
              }
              onClick={() => onTranscribeChange(!transcribeOn)}
              data-testid="transcribe-toggle"
              className={cn(
                'flex items-center gap-3 w-full min-h-11 px-3 py-2 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                transcribeOn ? 'bg-blue-50 border-blue-200' : 'bg-muted border-border',
              )}
            >
              <div
                className={cn(
                  'relative flex-shrink-0 w-9 h-5 rounded-full transition-colors',
                  transcribeOn ? 'bg-blue-400' : 'bg-muted-foreground/30',
                )}
              >
                <div
                  className={cn(
                    'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform',
                    transcribeOn ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Transcribe for AI insights
                </span>
                {/* Founder copy (2026-09-11): says what is kept and who sees it. */}
                <span className="text-xs text-muted-foreground">
                  {transcribeOn
                    ? 'Record audio and share transcript with others in the room'
                    : 'Not transcribed'}
                </span>
              </div>
            </button>
            <span className="sr-only" aria-live="polite">
              {transcribeOn
                ? 'Transcription enabled. Your audio is recorded and your transcript is shared with others in the room.'
                : 'Transcription disabled.'}
            </span>
          </div>

          <Button onClick={onContinue} size="lg" className={cn(PRIMARY_BUTTON_CLASS, 'w-full')}>
            Continue
          </Button>

          {/* Consent line — the /live pattern (clarity-live-page.tsx ~L4258-4270), founder
              copy 2026-09-11, same in both switch states. */}
          <p className="text-sm text-muted-foreground text-center">
            By continuing, you agree to our{' '}
            <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Terms
            </a>{' '}
            and{' '}
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
