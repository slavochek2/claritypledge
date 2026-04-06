/**
 * @file sent-tab.tsx
 * @description P660: Sent tab — sealed letters grouped by source draft, newest first.
 * Each card shows draft title, sealed date, story count, mode label.
 * Expandable recipients/respondents with status pipeline and add-recipient action.
 */

import { useState, useEffect, useCallback } from 'react';
import { LetterStatusBadge } from './letter-status-badge';
import {
  getAllSentLetters,
  getDeliveriesForLetter,
  addRecipientToSealed,
} from '@/app/data/letters-service';
import { formatTimeAgo } from '@/app/utils/format-time';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { ClarityLetter, LetterDelivery } from '@/app/types';

// ============================================================================
// TYPES
// ============================================================================

type SentLetterWithMeta = ClarityLetter & {
  doc_title: string;
};

interface LetterCardData {
  letter: SentLetterWithMeta;
  deliveries: LetterDelivery[];
}

interface SentTabProps {
  userId: string;
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

function DeliveryRow({ delivery }: { delivery: LetterDelivery }) {
  const isCompleted = delivery.status === 'completed';
  const displayName = delivery.receiver_name || delivery.receiver_email || 'Anonymous';
  // Recipient (has email) = envelope icon; link respondent (no email) = link icon
  const icon = delivery.receiver_email ? '✉' : '🔗';

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm flex-shrink-0" aria-hidden="true">{icon}</span>
        <span className="text-sm text-foreground truncate">{displayName}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <LetterStatusBadge status={delivery.status} />
        {isCompleted && (
          <Button variant="outline" size="sm" className="min-h-[44px] text-xs px-3">
            Results
          </Button>
        )}
      </div>
    </div>
  );
}

function AddRecipientButton({
  letterId,
  onAdded,
}: {
  letterId: string;
  onAdded: () => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      await addRecipientToSealed(letterId, trimmed);
      toast.success(`Invitation sent to ${trimmed}`);
      setEmail('');
      setIsAdding(false);
      onAdded();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to add recipient'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdding) {
    return (
      <button
        onClick={() => setIsAdding(true)}
        className="text-sm text-blue-600 hover:text-blue-700 font-medium min-h-[44px] px-3 inline-flex items-center"
      >
        + Add recipient
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="email@example.com"
        className="flex-1 text-sm border border-border rounded-md px-2 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[44px]"
        autoFocus
        disabled={submitting}
      />
      <Button
        size="sm"
        className="min-h-[44px] text-xs px-3"
        onClick={handleSubmit}
        disabled={submitting || !email.trim()}
      >
        {submitting ? 'Sending...' : 'Send'}
      </Button>
      <button
        onClick={() => { setIsAdding(false); setEmail(''); }}
        className="text-sm text-muted-foreground hover:text-foreground min-h-[44px] px-2"
        disabled={submitting}
      >
        Cancel
      </button>
    </div>
  );
}

function PublicLinkRow({ letterId }: { letterId: string }) {
  const publicUrl = `${window.location.origin}/letter/${letterId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm flex-shrink-0" aria-hidden="true">🔗</span>
        <span className="text-sm text-muted-foreground truncate">Public link</span>
      </div>
      <button
        onClick={handleCopy}
        className="text-muted-foreground hover:text-foreground transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
        title="Copy link"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      </button>
    </div>
  );
}

function LetterCard({
  data,
  onRefresh,
}: {
  data: LetterCardData;
  onRefresh: () => void;
}) {
  const { letter, deliveries } = data;
  const isPublic = letter.mode === 'one-to-many';
  const modeLabel = isPublic ? 'Public' : 'Private';
  const sealedDate = letter.sealed_at ? formatTimeAgo(letter.sealed_at) : 'Unknown';

  // Split deliveries: recipients (have email) vs respondents (no email, from public link)
  const recipients = deliveries.filter((d) => d.receiver_email);
  const respondents = deliveries.filter((d) => !d.receiver_email);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 bg-muted/20">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground line-clamp-2">
              {letter.doc_title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sealed {sealedDate} · {deliveries.length} {deliveries.length === 1 ? 'recipient' : 'recipients'}
            </p>
          </div>
          <span
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
              isPublic
                ? 'bg-blue-50 text-blue-600'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {modeLabel}
          </span>
        </div>
      </div>

      {/* Recipients section */}
      <div className="px-2 py-2">
        {recipients.length > 0 && (
          <div className="mb-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-1">
              Recipients
            </p>
            {recipients.map((d) => (
              <DeliveryRow key={d.id} delivery={d} />
            ))}
          </div>
        )}

        {/* Respondents section — only for public letters */}
        {isPublic && respondents.length > 0 && (
          <div className="mb-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-1">
              Respondents
            </p>
            {respondents.map((d) => (
              <DeliveryRow key={d.id} delivery={d} />
            ))}
          </div>
        )}

        {/* Public link row */}
        {isPublic && <PublicLinkRow letterId={letter.id} />}

        {/* Add recipient button */}
        <div className="mt-1">
          <AddRecipientButton letterId={letter.id} onAdded={onRefresh} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SentTab({ userId }: SentTabProps) {
  const [cards, setCards] = useState<LetterCardData[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'done' | 'error'>('loading');

  const fetchData = useCallback(async () => {
    setFetchState('loading');
    try {
      const letters = await getAllSentLetters(userId);
      // Fetch deliveries for each letter in parallel
      const withDeliveries = await Promise.all(
        letters.map(async (letter) => {
          const deliveries = await getDeliveriesForLetter(letter.id);
          return { letter, deliveries };
        })
      );
      setCards(withDeliveries);
      setFetchState('done');
    } catch {
      toast.error('Failed to load sent letters');
      setFetchState('error');
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (fetchState === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading sent letters...</p>
      </div>
    );
  }

  if (fetchState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <p className="text-sm text-muted-foreground">Something went wrong loading your sent letters.</p>
        <Button variant="outline" size="sm" onClick={fetchData}>
          Retry
        </Button>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <p className="text-sm text-muted-foreground">
          No letters sent yet. Create a draft and send your first letter.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <LetterCard key={card.letter.id} data={card} onRefresh={fetchData} />
      ))}
    </div>
  );
}
