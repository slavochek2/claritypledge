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
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Ready to send?</h2>
        <p className="text-sm text-muted-foreground">
          Choose how readers can respond to your letter.
        </p>
      </div>

      {/* Responses control */}
      <fieldset className="w-full space-y-2">
        <legend className="text-sm font-medium text-foreground mb-2">Responses</legend>

        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-transparent hover:bg-muted/50 transition-colors">
          <input
            type="radio"
            name="responses-mode"
            value="invite"
            checked={responsesMode === 'invite'}
            onChange={() => onResponsesModeChange('invite')}
            className="mt-0.5 accent-[#0044CC]"
          />
          <div>
            <div className="text-sm font-medium text-foreground">Invite</div>
            <div className="text-xs text-muted-foreground">
              Readers can explain back what they understood and add stories. Responses go to your results.
            </div>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-transparent hover:bg-muted/50 transition-colors">
          <input
            type="radio"
            name="responses-mode"
            value="off"
            checked={responsesMode === 'off'}
            onChange={() => onResponsesModeChange('off')}
            className="mt-0.5 accent-[#0044CC]"
          />
          <div>
            <div className="text-sm font-medium text-foreground">Off</div>
            <div className="text-xs text-muted-foreground">
              Read-only letter. No response affordances shown.
            </div>
          </div>
        </label>

        <div className="flex items-start gap-3 p-3 rounded-lg border border-dashed border-muted opacity-40 cursor-not-allowed">
          <input
            type="radio"
            name="responses-mode"
            value="push"
            disabled
            className="mt-0.5"
          />
          <div>
            <div className="text-sm font-medium text-foreground">Push <span className="text-xs font-normal text-muted-foreground">— coming with P948</span></div>
            <div className="text-xs text-muted-foreground">
              Both explain-back and story are primary CTAs at each reveal.
            </div>
          </div>
        </div>
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
