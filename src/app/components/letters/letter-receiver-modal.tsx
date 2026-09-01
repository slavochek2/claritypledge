/**
 * @file letter-receiver-modal.tsx
 * @description P661: Receiver setup modal for letter composition.
 * Replaces the wizard's ModeStep — opens as a dialog on the doc page.
 *
 * P664: Added `mode` prop to support "add-recipient" variant:
 * - mode="compose" (default): current behavior — mode selector, "Continue" button
 * - mode="add-recipient": no mode selector, title "Add recipient(s)", button "Send Invitation",
 *   requires `letterId` prop, calls `addRecipientToSealed` per row on submit
 *
 * P682: Multi-recipient support for private doc compose flow:
 * - Private docs skip mode selector, show recipient form directly
 * - Dynamic recipient rows with per-row email lookup
 * - ReceiverSetupResult.recipients replaces single receiverName
 *
 * P688: RecipientRow unified as the sole recipient-entry path across all modes.
 * Old flat single-recipient state and JSX removed. Add-recipient mode now
 * batches addRecipientToSealed calls with per-row partial-failure handling.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Mail, Link2, X } from 'lucide-react';
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
import type { AgreementParty, ProfileSearchResult } from '@/app/data/agreements-service';
import { ProfilePickerInput } from '@/app/components/shared/profile-picker-input';
import { analytics } from '@/lib/mixpanel';
import { addRecipientToSealed } from '@/app/data/letters-service';
import { invokeLetterEmails } from '@/lib/letter-emails';
import { toast } from 'sonner';
import type { LetterMode } from '@/app/types';

function isExistingUserWithName(party: { name: string }): boolean {
  const name = party.name?.trim();
  return !!name && name !== 'Unknown';
}

export interface ReceiverSetupResult {
  mode: LetterMode;
  emails: string[];
  // P878: a picker-selected recipient carries profileId and an empty email —
  // the seal RPC resolves the email in-DB (AD-6).
  recipients: Array<{ email: string; name: string; profileId?: string }>;
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
  // P878: picker-selected person (addressed by profile_id; email stays empty)
  selected: ProfileSearchResult | null;
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
    selected: null,
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
  // P878: the picker owns its input — focus the row's input through the wrapper.
  const pickerWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) {
      pickerWrapRef.current?.querySelector('input')?.focus();
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

  // P878: picker selection — recipient addressed by profile_id, name auto-filled + locked
  const handlePickerSelect = useCallback(
    (result: ProfileSearchResult | null) => {
      if (result) {
        onUpdate(recipient.id, {
          selected: result,
          name: result.name,
          isNameLocked: true,
          email: '',
          emailError: null,
          lookupResult: null,
          isLookingUp: false,
        });
      } else {
        onUpdate(recipient.id, {
          selected: null,
          isNameLocked: false,
          name: '',
        });
      }
    },
    [recipient.id, onUpdate]
  );

  // Determine errors for display (a picker selection satisfies the recipient requirement)
  const emailEmpty = showValidationErrors && !recipient.selected && !recipient.email.trim();
  const emailInvalid = showValidationErrors && !recipient.selected && recipient.email.trim() && !recipient.email.trim().includes('@');
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

      {/* Recipient field — P878 picker (name typeahead) with email first-contact fallback */}
      <div className="space-y-1" ref={pickerWrapRef}>
        <ProfilePickerInput
          value={recipient.email}
          onValueChange={handleEmailChange}
          selected={recipient.selected}
          onSelect={handlePickerSelect}
          placeholder="Name or email address"
          ariaLabel={`Name or email for recipient ${index + 1}`}
          hasError={hasEmailError}
          isBusy={recipient.isLookingUp}
        />
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

  // In add-recipient mode and private docs, skip mode selector — auto-select one-to-one
  const [selectedMode, setSelectedMode] = useState<LetterMode | null>(
    isAddRecipientMode || isPrivateDoc ? 'one-to-one' : null
  );

  // ── Recipient state ──────────────────────────────────────────────────────────
  const [recipients, setRecipients] = useState<RecipientState[]>([createEmptyRecipient()]);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Computed values ──────────────────────────────────────────────────────────

  const allEmails = recipients.map((r) => r.email.trim());

  // Show recipient form for: add-recipient mode, private doc compose, public doc one-to-one compose
  const showRecipientForm = isAddRecipientMode || isPrivateDoc || selectedMode === 'one-to-one';

  // Rows that have any content entered (used for validation)
  const filledRowsForValidation = recipients.filter(
    (r) => r.selected !== null || r.email.trim() !== '' || r.name.trim() !== ''
  );

  // P878: a row is addressable via a picker selection (profile_id) OR a typed email
  const recipientCanProceed =
    filledRowsForValidation.length > 0 &&
    filledRowsForValidation.every(
      (r) =>
        (r.selected !== null || r.email.trim().includes('@')) &&
        r.name.trim().length > 0 &&
        !r.emailError
    );

  const canProceed =
    isAddRecipientMode
      ? recipientCanProceed
      : selectedMode === 'one-to-many'
        ? true
        : selectedMode === 'one-to-one'
          ? recipientCanProceed
          : false;

  // ── Recipient helpers ────────────────────────────────────────────────────────

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

  // ── Form helpers ─────────────────────────────────────────────────────────────

  const resetForm = () => {
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

    // ── One-to-many compose: no recipients needed ─────────────────────────────
    if (!isAddRecipientMode && selectedMode === 'one-to-many') {
      analytics.track('letter_created', {
        doc_id: (props as ComposeModalProps).docId,
        mode: 'one-to-many',
        story_count: (props as ComposeModalProps).storyCount,
      });
      (props as ComposeModalProps).onSubmit({ mode: 'one-to-many', emails: [], recipients: [] });
      return;
    }

    // For all recipient paths: validate
    const filledRows = recipients.filter(
      (r) => r.selected !== null || r.email.trim() !== '' || r.name.trim() !== ''
    );

    if (filledRows.length === 0) {
      setShowValidationErrors(true);
      return;
    }

    const hasErrors = filledRows.some(
      (r) =>
        (r.selected === null && !r.email.trim().includes('@')) ||
        !r.name.trim() ||
        !!r.emailError
    );
    if (hasErrors) {
      setShowValidationErrors(true);
      setRecipients(filledRows.length > 0 ? filledRows : [createEmptyRecipient()]);
      return;
    }

    // P878: picker rows carry profileId with an empty email — the seal/add RPCs
    // resolve the email in-DB (AD-6).
    const builtRecipients = filledRows.map((r) => ({
      email: r.email.trim().toLowerCase(),
      name: r.name.trim(),
      profileId: r.selected?.profileId,
    }));

    // ── Add-recipient mode: batch addRecipientToSealed with partial-failure ────
    if (isAddRecipientMode) {
      setSubmitting(true);

      const sendResults = await Promise.all(
        filledRows.map(async (row, i) => {
          try {
            await addRecipientToSealed(
              props.letterId,
              builtRecipients[i].profileId ? null : builtRecipients[i].email,
              builtRecipients[i].name,
              builtRecipients[i].profileId
            );
            return { id: row.id, email: builtRecipients[i].email || builtRecipients[i].name, success: true as const };
          } catch (err) {
            return {
              id: row.id,
              email: builtRecipients[i].email,
              success: false as const,
              error: err instanceof Error ? err.message : 'Failed to send',
            };
          }
        })
      );

      setSubmitting(false);

      const succeeded = sendResults.filter((r) => r.success);
      const failed = sendResults.filter((r) => !r.success);

      // Fire-and-forget email notifications for any successful adds
      if (succeeded.length > 0) {
        invokeLetterEmails(props.letterId);
      }

      if (failed.length === 0) {
        // All succeeded
        const count = succeeded.length;
        toast.success(
          count === 1
            ? `Invitation sent to ${succeeded[0].email}`
            : `Invitations sent to ${count} people`
        );
        resetForm();
        onOpenChange(false);
        props.onRecipientAdded();
      } else if (succeeded.length === 0) {
        // All failed — keep all rows, show errors
        const failedIds = new Set(failed.map((f) => f.id));
        setRecipients((prev) =>
          prev.map((r) => {
            if (!failedIds.has(r.id)) return r;
            const result = failed.find((f) => f.id === r.id);
            return { ...r, emailError: result?.error ?? 'Failed to send' };
          })
        );
        toast.error('No invitations sent');
      } else {
        // Partial success — remove succeeded rows, mark failed rows
        const succeededIds = new Set(succeeded.map((s) => s.id));
        const failedIds = new Set(failed.map((f) => f.id));
        setRecipients((prev) =>
          prev
            .filter((r) => !succeededIds.has(r.id))
            .map((r) => {
              if (!failedIds.has(r.id)) return r;
              const result = failed.find((f) => f.id === r.id);
              return { ...r, emailError: result?.error ?? 'Failed to send' };
            })
        );
        toast.warning(
          `Sent ${succeeded.length} of ${filledRows.length} invitations. Fix the rows marked in red and try again.`
        );
      }
      return;
    }

    // ── Compose mode (one-to-one, private or public doc) ─────────────────────
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
  };

  // ── Submit label ─────────────────────────────────────────────────────────────

  const filledEmailCount = recipients.filter((r) => r.selected !== null || r.email.trim()).length;
  const submitLabel = !isAddRecipientMode
    ? 'Continue'
    : submitting
      ? 'Sending\u2026'
      : filledEmailCount >= 2
        ? `Send ${filledEmailCount} Invitations`
        : 'Send Invitation';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md max-h-[85vh] overflow-y-auto"
        overlayClassName="bg-black/50"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{isAddRecipientMode ? 'Add recipient(s)' : 'Who is your letter for?'}</DialogTitle>
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
                    : 'border-border hover:border-gray-300 bg-white'
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
                    : 'border-border hover:border-gray-300 bg-white'
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

          {/* ── RecipientRow form (add-recipient, private doc compose, public one-to-one) ── */}
          {showRecipientForm && (
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

          {/* Info for 1-to-many — compose mode only */}
          {!isAddRecipientMode && !isPrivateDoc && selectedMode === 'one-to-many' && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-sm text-blue-800">
                You&apos;ll get a shareable link after sealing.
              </p>
            </div>
          )}

          {/* Submit button */}
          <Button
            onClick={handleSubmit}
            disabled={
              isAddRecipientMode
                ? (!canProceed || submitting)  // add-recipient: need valid rows before send
                : isPrivateDoc
                  ? submitting  // private doc compose: always clickable; validation shows on submit (P682 behaviour)
                  : (!canProceed || submitting)  // public doc compose: need mode+valid row
            }
            className="bg-blue-500 hover:bg-blue-600 text-white w-full"
          >
            {submitLabel}
          </Button>

          {/* Footer hint — add-recipient mode and private doc compose */}
          {(isAddRecipientMode || isPrivateDoc) && (
            <p className="text-xs text-muted-foreground text-center">
              Each person receives their own personal invitation.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
