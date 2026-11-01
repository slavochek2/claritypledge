/**
 * @file CanvasOpener.tsx
 * @description P1536: what opens a canvas thread, drawn by the client at the top as mirror messages (never stored, the way
 * the mirror's greeting works): one message ("I'll help you ... Send me anything ...") and, under it, a small steps card
 * "Want to save time?": 1 Copy prompt, 2 paste it into your own AI, 3 upload the answer here, with a "What gets copied"
 * disclosure that shows the prompt. It is never folded away. Copy prompt keeps one look always (an outline, rule 9); it says
 * "Copied" for about two seconds after. When the clipboard refuses, the same text opens
 * in a dialog to copy by hand.
 */
import { useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { MirrorMark } from './chat-kit';
import { mirrorRole } from './chat-view-model';
import {
  CANVAS_OPENER_ASK,
  CANVAS_OWN_AI_PROMPT,
  CANVAS_STEPS_TITLE,
  CANVAS_STEP_PASTE,
  CANVAS_STEP_UPLOAD,
  COPIED_LABEL,
  COPY_PROMPT_LABEL,
  PROMPT_PREVIEW_LABEL,
} from './canvas-thread-copy';
import { useCopyPrompt } from './use-copy-prompt';

function PromptDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] rounded-lg sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle>Copy this prompt</DialogTitle>
          <DialogDescription>Your browser did not let me copy it. Select all, copy, and paste it into your own AI.</DialogDescription>
        </DialogHeader>
        <textarea
          readOnly
          autoFocus
          aria-label="Prompt"
          value={CANVAS_OWN_AI_PROMPT}
          onFocus={(e) => e.currentTarget.select()}
          className="h-64 w-full resize-none rounded-md border bg-background p-2 text-base md:text-sm"
          data-testid="canvas-prompt-text"
        />
        <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** The mirror's name and role on one line, as a message row shows them. */
function Sender({ title }: { title: string | null | undefined }) {
  return (
    <div className="flex min-w-0 items-baseline text-[15px] leading-6">
      <span className="min-w-0 truncate font-semibold text-foreground">{title ?? mirrorRole()}</span>
      {title && <span className="shrink-0 whitespace-pre text-xs text-muted-foreground"> · {mirrorRole()}</span>}
    </div>
  );
}

function CopyLabel({ copied }: { copied: boolean }) {
  return copied ? (
    <>
      <Check aria-hidden="true" />
      {COPIED_LABEL}
    </>
  ) : (
    <>{COPY_PROMPT_LABEL}</>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex min-h-8 items-center gap-2.5 text-sm text-foreground">
      <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {n}
      </span>
      {children}
    </li>
  );
}

/** "What gets copied": the prompt itself, one tap away, so nothing is copied blind. */
function PromptPreview() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 items-center gap-1 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        {PROMPT_PREVIEW_LABEL}
      </button>
      {open && (
        <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-sans text-xs leading-5 text-foreground" data-testid="canvas-prompt-preview">
          {CANVAS_OWN_AI_PROMPT}
        </pre>
      )}
    </div>
  );
}

/**
 * The opener always draws in full, whatever the owner has sent.
 */
export function CanvasThreadOpener({ title }: { title: string | null | undefined }) {
  const { copy, copied, showText, setShowText } = useCopyPrompt();
  const dialog = showText && <PromptDialog onClose={() => setShowText(false)} />;
  return (
    <div className="mx-2 px-2 pb-1.5 pt-2.5" data-testid="canvas-opener">
      <div className="flex gap-2.5" data-testid="canvas-opener-ask">
        <div className="w-9 shrink-0">
          <MirrorMark size="md" />
        </div>
        <div className="min-w-0 flex-1">
          <Sender title={title} />
          <p className="whitespace-pre-wrap break-words text-[15px] leading-[22px] text-foreground">{CANVAS_OPENER_ASK}</p>
        </div>
      </div>
      {/* the steps card belongs to the same sender's message: it lines up under the text, no avatar or name again */}
      <section aria-label={CANVAS_STEPS_TITLE} className="mt-2 flex gap-2.5" data-testid="canvas-opener-steps">
        <div className="w-9 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 rounded-xl border bg-background p-3">
          <h3 className="text-sm font-semibold text-foreground">{CANVAS_STEPS_TITLE}</h3>
          <ol className="mt-1.5 space-y-1">
            <Step n={1}>
              <Button type="button" variant="outline" className="min-h-10 gap-1" onClick={() => void copy()}>
                <CopyLabel copied={copied} />
              </Button>
            </Step>
            <Step n={2}>{CANVAS_STEP_PASTE}</Step>
            <Step n={3}>{CANVAS_STEP_UPLOAD}</Step>
          </ol>
          <PromptPreview />
        </div>
      </section>
      {dialog}
    </div>
  );
}
