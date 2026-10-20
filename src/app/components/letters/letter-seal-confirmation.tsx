/**
 * @file letter-seal-confirmation.tsx
 * @description P661: Ceremonial "Letter Sealed" confirmation screen.
 * P665: Public docs show a shareable link + optional email invite.
 * P688: Inline invite form replaced by LetterReceiverModal in add-recipient mode.
 *       Visual hierarchy updated: shareable link is the hero element,
 *       "Back to Doc" is the primary CTA, "+ Also invite" is a tertiary text link.
 */

import { useState } from 'react';
import { useReturnToParent } from '@/app/hooks/use-go-back';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/utils';
import { LetterReceiverModal } from './letter-receiver-modal';
import type { LetterMode } from '@/app/types';

interface LetterSealConfirmationProps {
  docId: string;
  receiverName: string;
  mode: LetterMode;
  storyCount: number;
  letterId?: string;
  isPublicDoc?: boolean;
  /** The doc page opened compose (it marks the route state). Only then is the entry below the doc. */
  openedFromDoc?: boolean;
}

export function LetterSealConfirmation({
  docId,
  receiverName,
  mode,
  storyCount,
  letterId,
  isPublicDoc,
  openedFromDoc = false,
}: LetterSealConfirmationProps) {
  // "Back to Doc" goes to the doc. When the doc page opened compose (it marks the route state) that is a POP, so
  // the doc's own Back does not land on compose again. Opened from the Drafts list (drafts-tab goes straight
  // to compose) the entry below is the LIST: a pop would not match the label, so it replaces with the doc.
  const backToDoc = useReturnToParent(`/letters/drafts/${docId}`, openedFromDoc);
  const [copied, setCopied] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const handleCopyLink = async () => {
    if (!letterId) return;
    const url = `${window.location.origin}/letter/${letterId}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Failed to copy link');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-sm w-full">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-50 mb-2">
          <span className="text-3xl">&#10022;</span>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Letter Sealed</h2>
          <p className="text-muted-foreground">
            {mode === 'one-to-one' ? `Sent to ${receiverName}` : 'Ready to share'}
          </p>
          <p className="text-sm text-muted-foreground">
            {storyCount} {storyCount === 1 ? 'story' : 'stories'}
          </p>
        </div>

        {/* Public link block — hero link, primary CTA, tertiary invite link */}
        {isPublicDoc && letterId && (
          <div className="space-y-4">
            {/* Hero shareable link card */}
            <div
              role="region"
              aria-label="Shareable letter link"
              className="w-full border border-border rounded-xl p-4 bg-muted/30 flex items-center gap-3"
            >
              <span className="text-sm text-foreground break-all flex-1 text-left">
                {window.location.origin}/letter/{letterId}
              </span>
              <button
                onClick={handleCopyLink}
                className="flex-shrink-0 p-2 rounded-lg hover:bg-muted transition-colors min-w-11 min-h-11 flex items-center justify-center"
                aria-label="Copy link to clipboard"
              >
                {copied
                  ? <Check className="h-5 w-5 text-blue-500" />
                  : <Copy className="h-5 w-5 text-muted-foreground" />}
              </button>
            </div>

            {/* Primary CTA */}
            <Button
              className="w-full bg-blue-500 hover:bg-blue-700 text-white"
              onClick={backToDoc}
            >
              Back to Doc
            </Button>

            {/* Tertiary invite link */}
            <button
              onClick={() => setShowInviteModal(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              + Also invite someone by email
            </button>
          </div>
        )}

        {/* Private flow: "you'll see responses" */}
        {!isPublicDoc && (
          <p className="text-sm text-muted-foreground">
            You&apos;ll see {mode === 'one-to-one' ? `${receiverName}'s` : 'responses as readers'} read.
          </p>
        )}

        {/* Back to Doc — private doc only (public doc uses the button above) */}
        {!isPublicDoc && (
          <Button
            variant="outline"
            onClick={backToDoc}
          >
            Back to Doc
          </Button>
        )}
      </div>

      {/* Invite modal — opens over the seal confirmation screen */}
      {isPublicDoc && letterId && (
        <LetterReceiverModal
          mode="add-recipient"
          open={showInviteModal}
          onOpenChange={setShowInviteModal}
          letterId={letterId}
          onRecipientAdded={() => {
            // Modal shows its own success toast; nothing else to do here
          }}
        />
      )}
    </div>
  );
}
