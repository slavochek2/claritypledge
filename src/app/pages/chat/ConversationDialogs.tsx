/**
 * @file ConversationDialogs.tsx
 * @description The dialogs one open conversation can raise: attach, mirror info, rename, block.
 */
import { toast } from 'sonner';
import type { ChatSummary } from '@/app/data/chat-service';
import type { Shareable } from '@/app/data/chat-ui-helpers';
import { AttachDialog, ConfirmDialog, RenameMirrorDialog } from './ChatDialogs';
import { attachConversationId } from './attach-canvases';
import { MirrorInfoDialog } from './MirrorInfoDialog';
import { useChat } from './chat-state';
import { mirrorRole } from './chat-view-model';
import type { ConversationDialogFlags } from './use-conversation-dialogs';

export function ConversationDialogs({ summary, d, onPick }: { summary: ChatSummary; d: ConversationDialogFlags; onPick: (s: Shareable) => void }) {
  const chat = useChat();
  const other = summary.other;
  const blockId = other?.id ?? null;
  return (
    <>
      {d.attaching && (
        <AttachDialog
          viewerId={chat.userId}
          conversationId={attachConversationId(summary)}
          onClose={() => d.setAttaching(false)}
          onPick={(s) => {
            onPick(s);
            d.setAttaching(false);
          }}
        />
      )}
      {d.infoOpen && <MirrorInfoDialog chat={summary} onRename={() => d.setRenaming(true)} onClose={() => d.setInfoOpen(false)} />}
      {d.renaming && (
        <RenameMirrorDialog
          initial={summary.title ?? 'Mirror agent'}
          role={mirrorRole(summary)}
          onClose={() => d.setRenaming(false)}
          onSaved={() => void chat.refresh()}
        />
      )}
      {d.blocking && blockId && other && (
        <ConfirmDialog
          title={`Block ${other.name}?`}
          description="They will not be able to message you, start a new chat with you or find you in search. Your existing messages stay. You can unblock them any time."
          confirmLabel="Block"
          onConfirm={async () => {
            await chat.block(blockId);
            toast(`Blocked ${other.name}`);
          }}
          onClose={() => d.setBlocking(false)}
        />
      )}
    </>
  );
}
