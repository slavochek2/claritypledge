/**
 * @file transcript-copy-control.tsx
 * @description The transcript views' shared Copy button and its screen-reader confirmation. Split out
 * of my-sessions-page.tsx (P1586) so the room and session views stop carrying identical copies.
 */
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

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
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1"
          aria-label="Copy transcript to clipboard"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* aria-live region for copy feedback */}
      <div aria-live="polite" className="sr-only" role="status">
        {copied ? 'Transcript copied to clipboard' : ''}
      </div>
    </>
  );
}
