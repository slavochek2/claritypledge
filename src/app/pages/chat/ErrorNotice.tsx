/**
 * @file ErrorNotice.tsx
 * @description P1576: how a failed action reads in the composer: the chat's error colour and an icon on the message,
 * and the way out as real bordered buttons (at least 40px tall) in a row under it. One treatment for a failed voice
 * note, a failed transcription and dictated words that did not fit, so none of them reads as ordinary composer text.
 */
import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorNotice({ message, testId, children }: { message: ReactNode; testId?: string; children: ReactNode }) {
  return (
    <div role="alert" data-testid={testId} className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-1.5">
      <p className="flex items-start gap-2 text-sm text-red-700">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * A way out of an error, by the Button Decision Rules (docs/design-system.md): the one action inside the notice
 * (`primary`: Retry, Insert) is the default Button, auto width (rule 8); the way out of it is an outline Button. A way out that LOSES
 * something (`destructive`: Discard) is rule 5: a ghost Button with red text, no box. Colour comes from the variant, never typed blue here (P1568).
 */
export function NoticeButton({ label, onClick, primary = false, destructive = false, children }: { label: string; onClick: () => void; primary?: boolean; destructive?: boolean; children: ReactNode }) {
  return (
    <Button
      type="button"
      variant={primary ? 'default' : destructive ? 'ghost' : 'outline'}
      aria-label={label}
      onClick={onClick}
      className={destructive ? 'min-h-10 px-4 text-red-600 hover:bg-red-50 hover:text-red-700' : 'min-h-10 px-4'}
    >
      {children}
    </Button>
  );
}
