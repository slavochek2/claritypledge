/**
 * @file letter-seal-confirmation.tsx
 * @description P661: Ceremonial "Letter Sealed" confirmation screen.
 * P665: Public docs show a shareable link + optional email invite.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/utils';
import { addRecipientToSealed } from '@/app/data/letters-service';
import type { LetterMode } from '@/app/types';

interface LetterSealConfirmationProps {
  docId: string;
  receiverName: string;
  mode: LetterMode;
  storyCount: number;
  letterId?: string;
  isPublicDoc?: boolean;
}

export function LetterSealConfirmation({
  docId,
  receiverName,
  mode,
  storyCount,
  letterId,
  isPublicDoc,
}: LetterSealConfirmationProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

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

  const handleInvite = async () => {
    const trimmed = inviteEmail.trim();
    if (!trimmed || !letterId) return;
    setInviting(true);
    try {
      await addRecipientToSealed(letterId, trimmed);
      toast.success(`Invitation sent to ${trimmed}`);
      setInviteEmail('');
      setShowInvite(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-sm">
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

        {/* Public link block */}
        {isPublicDoc && letterId && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2.5 text-sm">
              <span className="text-muted-foreground truncate flex-1 text-left font-mono text-xs">
                {window.location.origin}/letter/{letterId}
              </span>
              <button
                onClick={handleCopyLink}
                className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors"
                aria-label="Copy link"
              >
                {copied
                  ? <Check className="h-4 w-4 text-blue-500" />
                  : <Copy className="h-4 w-4 text-muted-foreground" />}
              </button>
            </div>

            {!showInvite ? (
              <button
                onClick={() => setShowInvite(true)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Also invite someone by email
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  placeholder="email@example.com"
                  className="flex-1 text-sm border border-border rounded-md px-2 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px]"
                  autoFocus
                  disabled={inviting}
                />
                <Button
                  size="sm"
                  className="min-h-[44px] text-xs px-3"
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                >
                  {inviting ? 'Sending...' : 'Send'}
                </Button>
                <button
                  onClick={() => { setShowInvite(false); setInviteEmail(''); }}
                  className="text-sm text-muted-foreground hover:text-foreground min-h-[44px] px-2"
                  disabled={inviting}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Private flow: "you'll see responses" */}
        {!isPublicDoc && (
          <p className="text-sm text-muted-foreground">
            You&apos;ll see {mode === 'one-to-one' ? `${receiverName}'s` : 'responses as readers'} read.
          </p>
        )}

        <Button
          variant="outline"
          onClick={() => navigate(`/d/${docId}`)}
        >
          Back to Doc
        </Button>
      </div>
    </div>
  );
}
