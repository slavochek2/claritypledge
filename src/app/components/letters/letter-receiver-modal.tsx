/**
 * @file letter-receiver-modal.tsx
 * @description P661: Receiver setup modal for letter composition.
 * Replaces the wizard's ModeStep — opens as a dialog on the doc page.
 */

import { useState, useCallback, useRef } from 'react';
import { Mail, Link2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/auth';
import { agreementsService } from '@/app/data/agreements-service';
import type { AgreementParty } from '@/app/data/agreements-service';
import { analytics } from '@/lib/mixpanel';
import type { LetterMode } from '@/app/types';

function isExistingUserWithName(party: { name: string }): boolean {
  const name = party.name?.trim();
  return !!name && name !== 'Unknown';
}

export interface ReceiverSetupResult {
  mode: LetterMode;
  emails: string[];
  receiverName: string;
}

interface LetterReceiverModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPrivateDoc: boolean;
  docId: string;
  storyCount: number;
  onSubmit: (result: ReceiverSetupResult) => void;
}

export function LetterReceiverModal({
  open,
  onOpenChange,
  isPrivateDoc,
  docId,
  storyCount,
  onSubmit,
}: LetterReceiverModalProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<LetterMode | null>(null);
  const [emailsInput, setEmailsInput] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [lookupResult, setLookupResult] = useState<AgreementParty | null | 'not-found'>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isReceiverNameLocked, setIsReceiverNameLocked] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parsedEmails = emailsInput
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.includes('@'));

  const canProceed =
    mode === 'one-to-many' ||
    (mode === 'one-to-one' && parsedEmails.length > 0 && receiverName.trim().length > 0);

  const handleEmailChange = useCallback(
    (value: string) => {
      setEmailsInput(value);
      setLookupResult(null);
      setEmailError(null);

      if (isReceiverNameLocked) {
        setIsReceiverNameLocked(false);
        setReceiverName('');
      }

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      const trimmed = value.trim();
      if (!trimmed || !trimmed.includes('@')) return;

      debounceRef.current = setTimeout(async () => {
        if (user?.email && trimmed.toLowerCase() === user.email.toLowerCase()) {
          setEmailError("You can\u2019t send a letter to yourself");
          return;
        }

        setIsLookingUp(true);
        try {
          const party = await agreementsService.lookupUserByEmail(trimmed);
          analytics.track('letter_email_lookup', { found: !!party });
          setLookupResult(party ?? 'not-found');

          if (party && isExistingUserWithName(party)) {
            setReceiverName(party.name);
            setIsReceiverNameLocked(true);
          }
        } finally {
          setIsLookingUp(false);
        }
      }, 400);
    },
    [user?.email, isReceiverNameLocked]
  );

  const handleSubmit = () => {
    if (!mode || !canProceed) return;
    analytics.track('letter_created', {
      doc_id: docId,
      mode,
      story_count: storyCount,
    });
    onSubmit({
      mode,
      emails: mode === 'one-to-one' ? parsedEmails : [],
      receiverName: receiverName.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Who is your letter for?</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* 1-to-1 card */}
            <button
              type="button"
              onClick={() => setMode('one-to-one')}
              className={`text-left p-5 rounded-xl border-2 transition-all ${
                mode === 'one-to-one'
                  ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <Mail className={`h-8 w-8 mb-3 ${mode === 'one-to-one' ? 'text-blue-500' : 'text-gray-400'}`} />
              <div className="font-medium text-foreground">Specific people</div>
              <p className="text-sm text-muted-foreground mt-1">
                Send by email with a personal invitation link.
              </p>
            </button>

            {/* 1-to-many card */}
            <button
              type="button"
              onClick={() => !isPrivateDoc && setMode('one-to-many')}
              disabled={isPrivateDoc}
              aria-disabled={isPrivateDoc}
              className={`text-left p-5 rounded-xl border-2 transition-all ${
                isPrivateDoc
                  ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                  : mode === 'one-to-many'
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <Link2 className={`h-8 w-8 mb-3 ${mode === 'one-to-many' ? 'text-blue-500' : 'text-gray-400'}`} />
              <div className="font-medium text-foreground">Anyone with a link</div>
              <p className="text-sm text-muted-foreground mt-1">
                {isPrivateDoc
                  ? "Private docs can\u2019t use links. Switch to public to enable."
                  : 'Share a link \u2014 anyone can read and respond.'}
              </p>
            </button>
          </div>

          {/* Email + name input for 1-to-1 */}
          {mode === 'one-to-one' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="receiver-emails" className="text-sm font-medium text-foreground">
                  Recipient email
                </label>
                <div className="relative">
                  <Input
                    id="receiver-emails"
                    type="email"
                    placeholder="email@example.com"
                    value={emailsInput}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    className={`w-full ${emailError ? 'border-red-500' : ''}`}
                  />
                  {isLookingUp && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                {emailError && (
                  <p className="text-sm text-red-500" role="alert">{emailError}</p>
                )}
                {!emailError && lookupResult === 'not-found' && (
                  <p className="text-sm text-muted-foreground" role="status">
                    No account &#8212; they&apos;ll be invited to join.
                  </p>
                )}
                {!emailError && lookupResult !== null && lookupResult !== 'not-found' && (
                  <p className="text-sm text-green-700 font-medium" role="status">
                    Account found &#10003;
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="receiver-name" className="text-sm font-medium text-foreground">
                  Recipient&apos;s full name
                </label>
                <Input
                  id="receiver-name"
                  type="text"
                  placeholder="e.g. Slava Ladischenski"
                  maxLength={100}
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  readOnly={isReceiverNameLocked}
                  required
                  className={`w-full ${isReceiverNameLocked ? 'bg-gray-50 text-muted-foreground' : ''}`}
                />
                {isReceiverNameLocked ? (
                  <p className="text-xs text-muted-foreground">Using their registered name.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">For the email greeting and letter cover.</p>
                )}
              </div>
            </div>
          )}

          {/* Info for 1-to-many */}
          {mode === 'one-to-many' && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-sm text-blue-800">
                You&apos;ll get a shareable link after sealing.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={!canProceed} className="bg-blue-500 hover:bg-blue-600 text-white">
              Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
