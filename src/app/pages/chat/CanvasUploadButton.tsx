/**
 * @file CanvasUploadButton.tsx
 * @description P1536: the upload control of a canvas thread, in the composer to the left of the paperclip: a secondary
 * button with a plus and "Upload". One file at a time; the server reads it to text and keeps only the text. Shown only in
 * a canvas thread while drafting is on. The upload itself (and its row in the checklist) lives in use-canvas-uploads.
 */
import { useRef } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UPLOAD_ACCEPT, UPLOAD_LABEL } from './canvas-thread-copy';

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
      <Button
        type="button"
        variant="outline"
        aria-busy={busy}
        data-testid="canvas-upload"
        onClick={() => !busy && input.current?.click()}
        className="h-10 shrink-0 gap-1 rounded-full border-blue-600 px-3 text-blue-600 hover:text-blue-700"
      >
        {/* a static plus while a file reads: the checklist row is what spins */}
        <Plus aria-hidden="true" />
        {UPLOAD_LABEL}
      </Button>
    </>
  );
}
