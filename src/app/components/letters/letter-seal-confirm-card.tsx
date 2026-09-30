/**
 * @file letter-seal-confirm-card.tsx
 * @description P952 AD-5: Lightweight public-path seal step shown between prediction
 * walk and sealing. Replaces the silent auto-seal for one-to-many docs so authors
 * can choose the response intensity before sending.
 */

import { Button } from '@/components/ui/button';

interface LetterSealConfirmCardProps {
  responsesMode: 'off' | 'invite';
  onResponsesModeChange: (mode: 'off' | 'invite') => void;
  onSend: () => void;
  /** True while seal RPC is in-flight; disables Send button and shows spinner. */
  sealing: boolean;
}

export function LetterSealConfirmCard({
  responsesMode,
  onResponsesModeChange,
  onSend,
  sealing,
}: LetterSealConfirmCardProps) {
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto px-4 py-8">
      {/* Responses control — the question is the heading */}
      <fieldset className="w-full space-y-2">
        <legend className="text-xl font-semibold text-foreground text-center w-full mb-4">Should readers explain your stories back to you?</legend>

        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-transparent hover:bg-muted/50 transition-colors">
          <input
            type="radio"
            name="responses-mode"
            value="off"
            checked={responsesMode === 'off'}
            onChange={() => onResponsesModeChange('off')}
            className="accent-[#0044CC]"
          />
          <span className="text-sm font-medium text-foreground">Just read the letter</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-transparent hover:bg-muted/50 transition-colors">
          <input
            type="radio"
            name="responses-mode"
            value="invite"
            checked={responsesMode === 'invite'}
            onChange={() => onResponsesModeChange('invite')}
            className="accent-[#0044CC]"
          />
          <span className="text-sm font-medium text-foreground">Ask them to explain your stories back (voice or text)</span>
        </label>
      </fieldset>

      <Button
        onClick={onSend}
        disabled={sealing}
        className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white rounded-full font-bold text-base min-h-14"
      >
        {sealing ? 'Sending…' : 'Send letter →'}
      </Button>
    </div>
  );
}
