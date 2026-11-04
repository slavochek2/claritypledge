/**
 * @file transcript-copy-control.tsx
 * @description The transcript views' shared Copy button and its screen-reader confirmation. Split out
 * of my-sessions-page.tsx (P1586) so the room and session views stop carrying identical copies.
 */
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TranscriptCopyControl({ getText, errorLabel }: { getText: () => string; errorLabel: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error(errorLabel);
    }
  };

  return (
    <>
      {/* P1604: the one primary action of a transcript screen (design-system rule 8: the default Button, auto width, 44px target). */}
      <div className="flex items-center justify-end mb-4">
        <Button onClick={handleCopy} className="min-h-11 gap-2" aria-label="Copy transcript to clipboard">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {/* aria-live region for copy feedback */}
      <div aria-live="polite" className="sr-only" role="status">
        {copied ? 'Transcript copied to clipboard' : ''}
      </div>
    </>
  );
}

/**
 * The Copy action for a transcript's TITLE ROW (top right, also on a phone). Secondary (the filled `secondary` variant, founder 2026-11-04), 44px: the title row, not a
 * body-level primary, carries it. Same copy behaviour and screen-reader confirmation as the control above.
 */
export function CopyTranscriptButton({ getText, errorLabel }: { getText: () => string; errorLabel: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error(errorLabel);
    }
  };
  return (
    <>
      <Button variant="outline" onClick={handleCopy} className="min-h-11 gap-2" aria-label="Copy transcript to clipboard">
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <span aria-live="polite" className="sr-only" role="status">{copied ? 'Transcript copied to clipboard' : ''}</span>
    </>
  );
}
