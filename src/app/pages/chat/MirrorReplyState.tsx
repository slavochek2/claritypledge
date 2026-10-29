/**
 * @file MirrorReplyState.tsx
 * @description P1520 / P1576: the line under an owner's message in the mirror that says what the mirror is doing
 * about it (thinking, could not answer, capped, terms, or a voice note it cannot transcribe).
 */
import { Button } from '@/components/ui/button';
import { MirrorMark } from './chat-kit';
import { useMirror } from './mirror-state';

/**
 * P1520: what the mirror is doing about this message of its owner: thinking, could not answer (Try again), or out of
 * today's allowance. Nothing once it has answered. A voice note still being transcribed shows nothing here:
 * its own bubble says "Transcribing…".
 */
export function MirrorReplyState({ messageId, name }: { messageId: string; name: string }) {
  const mirror = useMirror();
  const status = mirror?.statusFor(messageId);
  if (!mirror || !status) return null;
  if (status === 'thinking') {
    return (
      <p role="status" data-testid="mirror-thinking" className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <MirrorMark size="xs" />
        <span className="animate-pulse">{name} is thinking…</span>
      </p>
    );
  }
  if (status === 'transcribing') return null;
  if (status === 'transcript_failed') {
    return (
      <p role="alert" data-testid="mirror-transcript-failed" className="mt-1 text-sm text-muted-foreground">
        {/* [FOUNDER COPY: pending approval] */}
        Couldn't transcribe this voice message, so I can't answer it. Type it or record again.
      </p>
    );
  }
  if (status === 'capped') {
    return (
      <p role="status" data-testid="mirror-capped" className="mt-1 text-sm text-muted-foreground">
        {name} has answered as much as it can today. Try again tomorrow.
      </p>
    );
  }
  if (status === 'terms') {
    return (
      <div role="alert" data-testid="mirror-terms" className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <span>Accept the updated terms to use your mirror agent.</span>
        <Button variant="ghost" className="min-h-10 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
  return (
    <div role="alert" data-testid="mirror-failed" className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <span>{name} could not answer.</span>
      <Button variant="ghost" className="min-h-10 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={() => mirror.requestReply(messageId)}>
        Try again
      </Button>
    </div>
  );
}

