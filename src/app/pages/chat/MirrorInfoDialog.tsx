/**
 * @file MirrorInfoDialog.tsx
 * @description P1520: the mirror's own panel, opened by tapping its name in the chat header — its face, its name
 * and role, Rename, New face and the choice of face (founder, 2026-10-20). New face and the face choice show only
 * where the mirror can paint (they are AI calls); the face itself and Rename always do.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ChatSummary } from '@/app/data/chat-service';
import type { MirrorGender } from '@/app/data/mirror-service';
import { FOCUS_RING, MirrorMark, PRIMARY_CLASS } from './chat-kit';
import { chatErrorText, mirrorRole } from './chat-view-model';
import { useMirror } from './mirror-state';

const FACES: Array<{ value: MirrorGender | null; label: string }> = [
  { value: null, label: 'Random' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'neutral', label: 'Neutral' },
];

export function MirrorInfoDialog({ chat, onRename, onClose }: { chat: ChatSummary; onRename: () => void; onClose: () => void }) {
  const mirror = useMirror();
  const [error, setError] = useState<string | null>(null);
  const name = chat.title ?? mirrorRole(chat);
  const canPaint = mirror?.enabled === true;
  const status = mirror?.portraitStatus ?? 'idle';
  const gender = mirror?.profile?.gender ?? null;
  const credit = mirror?.profile?.credit ?? null;

  const choose = async (value: MirrorGender | null) => {
    setError(null);
    try {
      await mirror?.setGender(value);
    } catch (e) {
      setError(chatErrorText(e, 'Could not save. Try again.'));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] rounded-lg sm:max-w-sm" data-testid="mirror-info">
        <DialogHeader className="items-center text-center">
          <div className="relative mb-2">
            <MirrorMark size="xl" />
            {status === 'painting' && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60" role="status" aria-label="Painting a new face">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
              </span>
            )}
          </div>
          <DialogTitle className="max-w-full break-words">{name}</DialogTitle>
          <DialogDescription>
            {chat.title ? `${mirrorRole(chat)} · ` : ''}Only you can see and talk to it.
          </DialogDescription>
          {credit && <p className="text-xs text-muted-foreground" data-testid="mirror-credit">Painted in the style of {credit.artist}</p>}
        </DialogHeader>

        {canPaint && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-foreground">Face</legend>
            <div className="grid grid-cols-4 gap-1 rounded-lg border p-1" role="radiogroup" aria-label="Face">
              {FACES.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  role="radio"
                  aria-checked={gender === f.value}
                  onClick={() => void choose(f.value)}
                  className={cn(
                    'min-h-10 rounded-md px-1 text-sm',
                    gender === f.value ? 'bg-accent font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent/60',
                    FOCUS_RING,
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Used the next time it gets a new face.</p>
          </fieldset>
        )}

        {status === 'capped' && <p role="status" className="text-sm text-muted-foreground">No more new faces today. Try again tomorrow.</p>}
        {status === 'failed' && <p role="alert" className="text-sm text-red-700">Could not paint a new face. Try again.</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="min-h-10"
            onClick={() => {
              onClose();
              onRename();
            }}
          >
            Rename
          </Button>
          {canPaint && (
            <Button className={PRIMARY_CLASS} disabled={status === 'painting'} onClick={() => void mirror?.newFace()}>
              {status === 'painting' ? 'Painting…' : 'New face'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
