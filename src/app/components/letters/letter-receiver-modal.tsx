/**
 * @file letter-receiver-modal.tsx
 * @description P661: Receiver setup modal for letter composition.
 * Replaces the wizard's ModeStep — opens as a dialog on the doc page.
 *
 * P664: Added `mode` prop to support "add-recipient" variant:
 * - mode="compose" (default): current behavior — mode selector, "Continue" button
 * - mode="add-recipient": no mode selector, title "Add recipient(s)", button "Send Invitation",
 *   requires `letterId` prop, calls `addRecipientToSealed` on submit
 *
 * P682: Multi-recipient support for private doc compose flow:
 * - Private docs skip mode selector, show recipient form directly
 * - Dynamic recipient rows with per-row email lookup
 * - ReceiverSetupResult.recipients replaces single receiverName
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Mail, Link2, Loader2, X } from 'lucide-react';
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
import { addRecipientToSealed } from '@/app/data/letters-service';
import { toast } from 'sonner';
import type { LetterMode } from '@/app/types';

function isExistingUserWithName(party: { name: string }): boolean {
  const name = party.name?.trim();
  return !!name && name !== 'Unknown';
}

export interface ReceiverSetupResult {
  mode: LetterMode;
  emails: string[];
  recipients: Array<{ email: string; name: string }>;
}

// ─── Recipient row types ─────────────────────────────────────────────────────

interface RecipientState {
  id: string;
  email: string;
  name: string;
  isLookingUp: boolean;
  lookupResult: AgreementParty | 'not-found' | null;
  isNameLocked: boolean;
  emailError: string | null;
}

function createEmptyRecipient(): RecipientState {
  return {
    id: `row-${Math.random().toString(36).slice(2)}`,
    email: '',
    name: '',
    isLookingUp: false,
    lookupResult: null,
    isNameLocked: false,
    emailError: null,
  };
}

// ─── RecipientRow internal component ─────────────────────────────────────────

interface RecipientRowProps {
  recipient: RecipientState;
  index: number;
  isOnly: boolean;
  currentUserEmail: string;
  allEmails: string[];
  onUpdate: (id: string, field: Partial<RecipientState>) => void;
  onRemove: (id: string) => void;
  showValidationErrors: boolean;
  autoFocus: boolean;
}

function RecipientRow({
  recipient,
  index,
  isOnly,
  currentUserEmail,
  allEmails,
  onUpdate,
  onRemove,
  showValidationErrors,
  autoFocus,
}: RecipientRowProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && emailRef.current) {
      emailRef.current.focus();
    }
  }, [autoFocus]);

  const handleEmailChange = useCallback(
    (value: string) => {
      onUpdate(recipient.id, {
        email: value,
        lookupResult: null,
        emailError: null,
        ...(recipient.isNameLocked ? { isNameLocked: false, name: '' } : {}),
      });

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      const trimmed = value.trim();
      if (!trimmed || !trimmed.includes('@')) return;

      // Self-send check (immediate, before lookup)
      if (currentUserEmail && trimmed.toLowerCase() === currentUserEmail.toLowerCase()) {
        onUpdate(recipient.id, {
          emailError: "You can't send a letter to yourself",
          isLookingUp: false,
        });
        return;
      }

      // Duplicate check
      const lowerEmail = trimmed.toLowerCase();
      const isDuplicate = allEmails.some(
        (e, i) => i !== index && e.toLowerCase() === lowerEmail
      );
      if (isDuplicate) {
        onUpdate(recipient.id, {
          emailError: 'Already added',
          isLookingUp: false,
        });
        return;
      }

      debounceRef.current = setTimeout(async () => {
        onUpdate(recipient.id, { isLookingUp: true });
        try {
          const party = await agreementsService.lookupUserByEmail(trimmed);
          analytics.track('letter_email_lookup', { found: !!party });
          const result: AgreementParty | 'not-found' = party ?? 'not-found';

          if (party && isExistingUserWithName(party)) {
            onUpdate(recipient.id, {
              lookupResult: result,
              name: party.name,
              isNameLocked: true,
              isLookingUp: false,
            });
          } else {
            onUpdate(recipient.id, {
              lookupResult: result,
              isLookingUp: false,
            });
          }
        } catch {
          onUpdate(recipient.id, { isLookingUp: false });
        }
      }, 400);
    },
    [recipient.id, recipient.isNameLocked, currentUserEmail, allEmails, index, onUpdate]
  );

  // Determine errors for display
  const emailEmpty = showValidationErrors && !recipient.email.trim();
  const emailInvalid = showValidationErrors && recipient.email.trim() && !recipient.email.trim().includes('@');
  const nameEmpty = showValidationErrors && !recipient.name.trim() && recipient.email.trim();
  const hasEmailError = !!recipient.emailError || emailEmpty || emailInvalid;

  // Hint text logic
  let hintText: { text: string; className: string } | null = null;
  if (recipient.emailError) {
    hintText = { text: recipient.emailError, className: 'text-sm text-red-500' };
  } else if (recipient.isNameLocked) {
    hintText = { text: 'Using their registered name', className: 'text-xs text-muted-foreground' };
  } else if (recipient.lookupResult === 'not-found') {
    hintText = { text: "No account \u2014 they\u2019ll be invited to join", className: 'text-xs text-muted-foreground' };
  } else if (emailEmpty) {
    hintText = { text: 'Email is required', className: 'text-sm text-red-500' };
  } else if (emailInvalid) {
    hintText = { text: 'Invalid email format', className: 'text-sm text-red-500' };
  }

  return (
    <div
      className="relative rounded-lg border border-border p-3 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:items-start"
      role="group"
      aria-label={`Recipient ${index + 1}`}
    >
      {/* Remove button — top-right, hidden if isOnly */}
      {!isOnly && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute -top-2 -right-2 min-w-[44px] min-h-[44px] z-10"
          aria-label={`Remove recipient ${index + 1}`}
          onClick={() => onRemove(recipient.id)}
          type="button"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      )}

      {/* Email field */}
      <div className="space-y-1">
        <div className="relative">
          <Input
            ref={emailRef}
            type="email"
            placeholder="Email address"
            value={recipient.email}
            onChange={(e) => handleEmailChange(e.target.value)}
            className={hasEmailError ? 'border-red-500' : ''}
            aria-label={`Email address for recipient ${index + 1}`}
          />
          {recipient.isLookingUp && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        {hintText && (
          <p className={hintText.className} role={recipient.emailError || emailEmpty || emailInvalid ? 'alert' : 'status'}>
            {hintText.text}
          </p>
        )}
      </div>

      {/* Name field */}
      <div className="space-y-1">
        <Input
          type="text"
          placeholder="Full name"
          value={recipient.name}
          onChange={(e) => onUpdate(recipient.id, { name: e.target.value })}
          readOnly={recipient.isNameLocked}
          className={`${recipient.isNameLocked ? 'bg-muted text-muted-foreground' : ''} ${nameEmpty ? 'border-red-500' : ''}`}
          aria-label={`Full name for recipient ${index + 1}`}
        />
        {nameEmpty && (
          <p className="text-sm text-red-500" role="alert">Name is required</p>
        )}
      </div>
    </div>
  );
}

// ─── Modal props ─────────────────────────────────────────────────────────────

// Props for compose mode (default)
interface ComposeModalProps {
  mode?: 'compose';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPrivateDoc: boolean;
  docId: string;
  storyCount: number;
  onSubmit: (result: ReceiverSetupResult) => void;
  letterId?: never;
  onRecipientAdded?: never;
}

// Props for add-recipient mode
interface AddRecipientModalProps {
  mode: 'add-recipient';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  letterId: string;
  onRecipientAdded: () => void;
  isPrivateDoc?: never;
  docId?: never;
  storyCount?: never;
  onSubmit?: never;
}

type LetterReceiverModalProps = ComposeModalProps | AddRecipientModalProps;

export function LetterReceiverModal(props: LetterReceiverModalProps) {
  const { open, onOpenChange } = props;
  const isAddRecipientMode = props.mode === 'add-recipient';
  const isPrivateDoc = !isAddRecipientMode && props.isPrivateDoc;

  const { user } = useAuth();

  // In add-recipient mode, the letter mode is fixed — always one-to-one
  // For private docs in compose mode, skip mode selector — auto-select one-to-one
  const [selectedMode, setSelectedMode] = useState<LetterMode | null>(
    isAddRecipientMode || isPrivateDoc ? 'one-to-one' : null
  );

  // ── Multi-recipient state (compose mode, private doc) ──────────────────────
  const [recipients, setRecipients] = useState<RecipientState[]>([createEmptyRecipient()]);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  // ── Single-recipient state (add-recipient mode + public doc one-to-one) ────
  const [emailsInput, setEmailsInput] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [lookupResult, setLookupResult] = useState<AgreementParty | null | 'not-found'>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isReceiverNameLocked, setIsReceiverNameLocked] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine if we should show multi-recipient form
  const useMultiRecipient = !isAddRecipientMode && isPrivateDoc;

  const parsedEmails = emailsInput
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.includes('@'));

  // ── Multi-recipient helpers ────────────────────────────────────────────────

  const allEmails = recipients.map((r) => r.email.trim());

  const handleRecipientUpdate = useCallback((id: string, fields: Partial<RecipientState>) => {
    setRecipients((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...fields } : r))
    );
  }, []);

  const handleRecipientRemove = useCallback((id: string) => {
    setRecipients((prev) => {
      const filtered = prev.filter((r) => r.id !== id);
      return filtered.length === 0 ? [createEmptyRecipient()] : filtered;
    });
  }, []);

  const handleAddRecipient = useCallback(() => {
    if (recipients.length >= 20) return;
    const newRow = createEmptyRecipient();
    setRecipients((prev) => [...prev, newRow]);
    setLastAddedId(newRow.id);
  }, [recipients.length]);

  // ── Multi-recipient canProceed ─────────────────────────────────────────────

  const multiRecipientCanProceed = (() => {
    if (!useMultiRecipient) return false;
    // At least one non-empty row
    const filledRows = recipients.filter(
      (r) => r.email.trim() !== '' || r.name.trim() !== ''
    );
    if (filledRows.length === 0) return false;
    // All filled rows must be valid
    return filledRows.every(
      (r) =>
        r.email.trim().includes('@') &&
        r.name.trim().length > 0 &&
        !r.emailError
    );
  })();

  // ── Single-recipient canProceed ────────────────────────────────────────────

  const singleCanProceed =
    selectedMode === 'one-to-many' ||
    (selectedMode === 'one-to-one' && parsedEmails.length > 0 && receiverName.trim().length > 0 && !emailError);

  const canProceed = useMultiRecipient ? multiRecipientCanProceed : singleCanProceed;

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
          setEmailError("You can't send a letter to yourself");
          setIsLookingUp(false);
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

  const resetForm = () => {
    setEmailsInput('');
    setReceiverName('');
    setLookupResult(null);
    setEmailError(null);
    setIsReceiverNameLocked(false);
    setSubmitting(false);
    setRecipients([createEmptyRecipient()]);
    setShowValidationErrors(false);
    setLastAddedId(null);
    if (!isAddRecipientMode && !isPrivateDoc) setSelectedMode(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    if (submitting) return;

    // ── Multi-recipient submit (private doc compose) ─────────────────────
    if (useMultiRecipient) {
      // Remove empty trailing rows silently
      const filledRows = recipients.filter(
        (r) => r.email.trim() !== '' || r.name.trim() !== ''
      );

      if (filledRows.length === 0) {
        setShowValidationErrors(true);
        return;
      }

      // Validate all filled rows
      const hasErrors = filledRows.some(
        (r) =>
          !r.email.trim().includes('@') ||
          !r.name.trim() ||
          !!r.emailError
      );

      if (hasErrors) {
        setShowValidationErrors(true);
        // Update recipients to only show filled rows (removes empty ones)
        setRecipients(filledRows.length > 0 ? filledRows : [createEmptyRecipient()]);
        return;
      }

      const builtRecipients = filledRows.map((r) => ({
        email: r.email.trim().toLowerCase(),
        name: r.name.trim(),
      }));

      analytics.track('letter_created', {
        doc_id: (props as ComposeModalProps).docId,
        mode: 'one-to-one',
        story_count: (props as ComposeModalProps).storyCount,
        recipient_count: builtRecipients.length,
      });

      (props as ComposeModalProps).onSubmit({
        mode: 'one-to-one',
        emails: builtRecipients.map((r) => r.email),
        recipients: builtRecipients,
      });
      return;
    }

    // ── Add-recipient mode ───────────────────────────────────────────────
    if (!canProceed) return;

    if (isAddRecipientMode) {
      const email = parsedEmails[0];
      if (!email) return;
      setSubmitting(true);
      try {
        await addRecipientToSealed(props.letterId, email, receiverName.trim() || undefined);
        toast.success(`Invitation sent to ${email}`);
        resetForm();
        onOpenChange(false);
        props.onRecipientAdded();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add recipient');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // ── Compose mode (public doc one-to-one or one-to-many) ──────────────
    if (!selectedMode) return;
    analytics.track('letter_created', {
      doc_id: props.docId,
      mode: selectedMode,
      story_count: props.storyCount,
    });
    props.onSubmit({
      mode: selectedMode,
      emails: selectedMode === 'one-to-one' ? parsedEmails : [],
      recipients: selectedMode === 'one-to-one'
        ? parsedEmails.map((email) => ({ email, name: receiverName.trim() }))
        : [],
    });
  };

  const title = isAddRecipientMode ? 'Add recipient(s)' : 'Who is your letter for?';
  const submitLabel = isAddRecipientMode ? (submitting ? 'Sending...' : 'Send Invitation') : 'Continue';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modal={false}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto" hideOverlay>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Mode selector — only in compose mode for PUBLIC docs */}
          {!isAddRecipientMode && !isPrivateDoc && (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* 1-to-1 card */}
              <button
                type="button"
                onClick={() => setSelectedMode('one-to-one')}
                className={`text-left p-5 rounded-xl border-2 transition-all ${
                  selectedMode === 'one-to-one'
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <Mail className={`h-8 w-8 mb-3 ${selectedMode === 'one-to-one' ? 'text-blue-500' : 'text-gray-400'}`} />
                <div className="font-medium text-foreground">Specific people</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Send by email with a personal invitation link.
                </p>
              </button>

              {/* 1-to-many card */}
              <button
                type="button"
                onClick={() => setSelectedMode('one-to-many')}
                className={`text-left p-5 rounded-xl border-2 transition-all ${
                  selectedMode === 'one-to-many'
                    ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <Link2 className={`h-8 w-8 mb-3 ${selectedMode === 'one-to-many' ? 'text-blue-500' : 'text-gray-400'}`} />
                <div className="font-medium text-foreground">Anyone with a link</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Share a link &mdash; anyone can read and respond.
                </p>
              </button>
            </div>
          )}

          {/* ── Multi-recipient form (private doc compose) ──────────────── */}
          {useMultiRecipient && (
            <>
              {recipients.map((recipient, i) => (
                <RecipientRow
                  key={recipient.id}
                  recipient={recipient}
                  index={i}
                  isOnly={recipients.length === 1}
                  currentUserEmail={user?.email ?? ''}
                  allEmails={allEmails}
                  onUpdate={handleRecipientUpdate}
                  onRemove={handleRecipientRemove}
                  showValidationErrors={showValidationErrors}
                  autoFocus={recipient.id === lastAddedId}
                />
              ))}

              {/* + Add another person — hidden at 20 */}
              {recipients.length < 20 && (
                <Button
                  variant="link"
                  className="text-sm p-0 h-auto"
                  onClick={handleAddRecipient}
                  type="button"
                >
                  + Add another person
                </Button>
              )}
            </>
          )}

          {/* ── Single-recipient form (add-recipient + public doc one-to-one) ── */}
          {!useMultiRecipient && (selectedMode === 'one-to-one' || isAddRecipientMode) && (
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
                    disabled={submitting}
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
                  placeholder="e.g. Alex Rivera"
                  maxLength={100}
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  readOnly={isReceiverNameLocked}
                  required
                  disabled={submitting}
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

          {/* Info for 1-to-many — compose mode only */}
          {!isAddRecipientMode && !isPrivateDoc && selectedMode === 'one-to-many' && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-sm text-blue-800">
                You&apos;ll get a shareable link after sealing.
              </p>
            </div>
          )}

          {/* Submit area */}
          <Button
            onClick={handleSubmit}
            disabled={useMultiRecipient ? submitting : (!canProceed || submitting)}
            className="bg-blue-500 hover:bg-blue-600 text-white w-full"
          >
            {submitLabel}
          </Button>

          {/* Footer hint — only for multi-recipient */}
          {useMultiRecipient && (
            <p className="text-xs text-muted-foreground text-center">
              Each person receives their own personal invitation.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
