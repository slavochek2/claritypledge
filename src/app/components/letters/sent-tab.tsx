/**
 * @file sent-tab.tsx
 * @description P664: Sent tab redesign — Drafts-consistent card pattern.
 * Cards collapsed by default with Notion-style ▶/▼ expand toggle.
 * Actions behind ⋯ dropdown (Preview letter, Add recipient(s), Copy public link).
 * InlineVisibilityIcon before title, border-l-4 color matching Drafts tab.
 * Replaces AddRecipientButton (bare input) with LetterReceiverModal in add-recipient mode.
 * Replaces PublicLinkRow with "Copy public link" in ⋯ menu.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, ChevronRight, ChevronDown, Mail, Link2 } from 'lucide-react';
import {
  getAllSentLetters,
  getDeliveriesForLetters,
} from '@/app/data/letters-service';
import { formatTimeAgo } from '@/app/utils/format-time';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { InlineVisibilityIcon } from '@/app/components/shared/visibility-badge';
import { LetterReceiverModal } from './letter-receiver-modal';
import { toast } from 'sonner';
import { ClarityLoader } from '@/components/ui/clarity-loader';
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
// STATUS HELPERS
// ============================================================================

function getStatusLabel(status: LetterDelivery['status']): string {
  switch (status) {
    case 'sent': return 'Invited';
    case 'opened': return 'Opened';
    case 'in_progress': return 'In progress';
    case 'completed': return 'Completed';
    default: return status;
  }
}

// ============================================================================
// RECIPIENT ROW — expanded view
// ============================================================================

function RecipientRow({ delivery }: { delivery: LetterDelivery }) {
  const displayName = delivery.receiver_name || delivery.receiver_email || 'Anonymous';
  // Recipient (has email) = envelope icon; link respondent (no email) = link icon
  const Icon = delivery.receiver_email ? Mail : Link2;
  const statusLabel = getStatusLabel(delivery.status);

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 text-sm">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
      <span className="text-foreground truncate">{displayName}</span>
      <span aria-hidden="true" className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">{statusLabel}</span>
    </div>
  );
}

// ============================================================================
// LETTER CARD
// ============================================================================

function LetterCard({
  data,
  onRefresh,
}: {
  data: LetterCardData;
  onRefresh: () => void;
}) {
  const { letter, deliveries } = data;
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [addRecipientOpen, setAddRecipientOpen] = useState(false);

  const isPublic = letter.mode === 'one-to-many';
  const sealedDate = letter.sealed_at ? formatTimeAgo(letter.sealed_at) : 'Unknown';

  // Split deliveries: recipients (have email) vs respondents (no email, from public link)
  const recipients = deliveries.filter((d) => d.receiver_email);
  const respondents = deliveries.filter((d) => !d.receiver_email);
  const completedCount = deliveries.filter((d) => d.status === 'completed').length;
  const totalCount = recipients.length; // total invited recipients

  const summaryParts: string[] = [
    `Sealed ${sealedDate}`,
    `${completedCount} of ${totalCount} completed`,
  ];
  if (isPublic && respondents.length > 0) {
    summaryParts.push(`${respondents.length} ${respondents.length === 1 ? 'response' : 'responses'}`);
  }
  const summary = summaryParts.join(' · ');

  const borderClass = isPublic ? 'border-l-blue-500' : 'border-l-gray-400';
  const visibilityProp = isPublic ? 'public' as const : 'private' as const;

  const handleCopyPublicLink = async () => {
    const publicUrl = `${window.location.origin}/letter/${letter.id}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handlePreview = () => {
    window.open(`/letter/${letter.source_doc_id}/preview`, '_blank', 'noopener,noreferrer');
  };

  const handleResults = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/letter/${letter.id}/results`);
  };

  const handleToggle = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <>
      <div
        className={`rounded-lg border bg-card border-l-4 ${borderClass} overflow-hidden`}
      >
        {/* Card header — click area toggles expand */}
        <div
          className="px-3 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
          onClick={handleToggle}
          role="presentation"
        >
          <div className="flex items-start gap-2">
            {/* Expand/collapse toggle */}
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
              onClick={(e) => { e.stopPropagation(); handleToggle(); }}
              className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors min-h-[20px] min-w-[20px] flex items-center justify-center"
            >
              {isExpanded
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {/* Title + summary */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <InlineVisibilityIcon visibility={visibilityProp} />
                <span className="text-sm font-medium text-foreground line-clamp-2">
                  {letter.doc_title}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 ml-0.5">
                {summary}
              </p>
            </div>

            {/* Actions — stop propagation so they don't toggle expand */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              {/* ⋯ dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 min-h-[44px]"
                    aria-label={`Actions for ${letter.doc_title}`}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handlePreview}>
                    Preview letter
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAddRecipientOpen(true)}>
                    Add recipient(s)
                  </DropdownMenuItem>
                  {isPublic && (
                    <DropdownMenuItem onClick={handleCopyPublicLink}>
                      Copy public link
                    </DropdownMenuItem>
                  )}
                  {/* Mobile: Results in dropdown when no Results button shown */}
                  {completedCount > 0 && (
                    <DropdownMenuItem
                      className="sm:hidden"
                      onClick={() => navigate(`/letter/${letter.id}/results`)}
                    >
                      View results
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* [Results] button — desktop only, only when >= 1 completed */}
              {completedCount > 0 && (
                <Button
                  size="sm"
                  className="hidden sm:inline-flex bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"
                  onClick={handleResults}
                >
                  Results
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Expanded recipient rows */}
        {isExpanded && (
          <div className="border-t border-border/50 pb-2">
            <div className="mx-3 my-2 border-t border-dashed border-border/40" />
            {recipients.length > 0 ? (
              recipients.map((d) => (
                <RecipientRow key={d.id} delivery={d} />
              ))
            ) : (
              <p className="text-xs text-muted-foreground px-3 py-1">No recipients yet.</p>
            )}
            {/* Respondents section for public letters */}
            {isPublic && respondents.length > 0 && (
              <>
                <div className="mx-3 my-1 border-t border-dashed border-border/40" />
                {respondents.map((d) => (
                  <RecipientRow key={d.id} delivery={d} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Add recipient modal */}
      <LetterReceiverModal
        mode="add-recipient"
        open={addRecipientOpen}
        onOpenChange={setAddRecipientOpen}
        letterId={letter.id}
        onRecipientAdded={() => {
          setAddRecipientOpen(false);
          onRefresh();
        }}
      />
    </>
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
      if (letters.length === 0) {
        setCards([]);
        setFetchState('done');
        return;
      }
      const deliveriesByLetter = await getDeliveriesForLetters(letters.map((l) => l.id));
      setCards(letters.map((letter) => ({ letter, deliveries: deliveriesByLetter[letter.id] ?? [] })));
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
        <ClarityLoader size="lg" />
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
