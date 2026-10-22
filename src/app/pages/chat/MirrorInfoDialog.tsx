/**
 * @file MirrorInfoDialog.tsx
 * @description P1520: the mirror's own panel, opened by tapping its name in the chat header — its face, its name
 * and role, Rename and New face. New face shows only where the mirror can paint (an AI call); the face itself and
 * Rename always do. P1537: no gender picker and no privacy line (founder, 2026-10-21).
 */
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ChatSummary } from '@/app/data/chat-service';
import { MirrorMark, PRIMARY_CLASS } from './chat-kit';
import { mirrorRole } from './chat-view-model';
import { useMirror } from './mirror-state';

export function MirrorInfoDialog({ chat, onRename, onClose }: { chat: ChatSummary; onRename: () => void; onClose: () => void }) {
  const mirror = useMirror();
  const name = chat.title ?? mirrorRole(chat);
  const canPaint = mirror?.enabled === true;
  const status = mirror?.portraitStatus ?? 'idle';
  const credit = mirror?.profile?.credit ?? null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] rounded-lg sm:max-w-sm" data-testid="mirror-info" {...(chat.title ? {} : { 'aria-describedby': undefined })}>
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
          {chat.title && <DialogDescription>{mirrorRole(chat)}</DialogDescription>}
          {credit && <p className="text-xs text-muted-foreground" data-testid="mirror-credit">Painted in the style of {credit.artist}</p>}
        </DialogHeader>

        {status === 'capped' && <p role="status" className="text-sm text-muted-foreground">No more new faces today. Try again tomorrow.</p>}
        {status === 'terms' && (
          <div role="alert" data-testid="mirror-terms" className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>Accept the updated terms to use your mirror agent.</span>
            <Button variant="ghost" className="min-h-10 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        )}
        {status === 'failed' && <p role="alert" className="text-sm text-red-700">Could not paint a new face. Try again.</p>}

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
