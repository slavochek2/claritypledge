/**
 * @file CanvasUploadButton.tsx
 * @description P1536: the upload control of a canvas thread, in the composer's first spot: the Upload icon, named "Upload" (P1618 amends 3c X3: the
 * paperclip means "Attach a point or story" and nothing else). One file at a time; the server reads it to text and keeps only the text.
 * Shown only in a canvas thread while drafting is on. The upload itself (and its row in the checklist) lives in use-canvas-uploads.
 */
import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FOCUS_RING, HOVER, ROUND } from './chat-kit';
import { UPLOAD_ACCEPT, UPLOAD_LABEL, UPLOAD_WAITS_LABEL } from './canvas-thread-copy';

export function CanvasUploadButton({ busy, onPick }: { busy: boolean; onPick: (file: File | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        tabIndex={-1}
        data-testid="canvas-upload-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          onPick(file);
        }}
      />
      {/* The tooltip opens on hover and on keyboard focus (Radix); the accessible name stays the aria-label. */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={UPLOAD_LABEL}
              aria-busy={busy}
              data-testid="canvas-upload"
              onClick={() => !busy && input.current?.click()}
              className={cn(ROUND, 'text-muted-foreground', HOVER, FOCUS_RING)}
            >
              {/* static while a file reads: the checklist row is what spins */}
              <Upload className="h-5 w-5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{UPLOAD_LABEL}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
}

/** D15: while an update runs, Upload waits: its own spot reads a status (a dashed, quiet circle), never a disabled button. */
export function CanvasUploadWaits() {
  return (
    <span role="status" aria-label={UPLOAD_WAITS_LABEL} title={UPLOAD_WAITS_LABEL} data-testid="canvas-upload-waits" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/60">
      <Upload aria-hidden="true" className="h-4 w-4" />
    </span>
  );
}

/** The Upload spot of the composer: the button, or (D15) its waiting status while an update runs. */
export function UploadSpot({ waiting, busy, onPick }: { waiting: boolean; busy: boolean; onPick: (file: File | undefined) => void }) {
  return waiting ? <CanvasUploadWaits /> : <CanvasUploadButton busy={busy} onPick={onPick} />;
}
