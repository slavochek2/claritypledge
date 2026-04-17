/**
 * @file letters-section.tsx
 * @description P581 Task 12: Letters section for doc detail and docs list pages.
 * Shows "Sent Letters" and "Received Letters" lists with status badges.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LetterStatusBadge } from './letter-status-badge';
import {
  getSentLettersForDoc,
  getDeliveriesForLetter,
  getReceivedLetters,
} from '@/app/data/letters-service';
import { formatTimeAgo } from '@/app/utils/format-time';
import type { ClarityLetter, LetterDelivery } from '@/app/types';

// ============================================================================
// SENT LETTERS FOR DOC
// ============================================================================

interface SentLettersSectionProps {
  docId: string;
}

interface LetterWithDeliveries {
  letter: ClarityLetter;
  deliveries: LetterDelivery[];
}

export function SentLettersSection({ docId }: SentLettersSectionProps) {
  const [letters, setLetters] = useState<LetterWithDeliveries[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchLetters = useCallback(async () => {
    try {
      const sentLetters = await getSentLettersForDoc(docId);
      // Fetch deliveries for each letter
      const withDeliveries = await Promise.all(
        sentLetters.map(async letter => {
          const deliveries = await getDeliveriesForLetter(letter.id);
          return { letter, deliveries };
        })
      );
      setLetters(withDeliveries);
    } catch {
      // Silently fail — section is supplementary
    } finally {
      setLoaded(true);
    }
  }, [docId]);

  useEffect(() => {
    fetchLetters();
  }, [fetchLetters]);

  if (!loaded) return null;

  if (letters.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Sent Letters
        </h3>
        <p className="text-sm text-muted-foreground">No letters yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        Sent Letters
      </h3>
      <div className="space-y-2">
        {letters.map(({ letter, deliveries }) => {
          const isOneToMany = letter.mode === 'one-to-many';
          const completedCount = deliveries.filter(d => d.status === 'completed').length;

          if (isOneToMany) {
            return (
              <LetterRow
                key={letter.id}
                letterId={letter.id}
                label={`${deliveries.length} responses`}
                date={letter.created_at}
                badgeStatus={completedCount > 0 ? 'completed' : 'sent'}
                isGroup
              />
            );
          }

          // 1-to-1: show individual delivery rows
          return deliveries.map(del => (
            <LetterRow
              key={del.id}
              letterId={letter.id}
              label={del.receiver_email ?? 'Recipient'}
              date={del.created_at}
              badgeStatus={del.status}
            />
          ));
        })}
      </div>
    </div>
  );
}

// ============================================================================
// RECEIVED LETTERS (for docs list page)
// ============================================================================

interface ReceivedLettersSectionProps {
  userId: string;
}

export function ReceivedLettersSection({ userId }: ReceivedLettersSectionProps) {
  const [deliveries, setDeliveries] = useState<LetterDelivery[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const received = await getReceivedLetters(userId);
        if (!cancelled) setDeliveries(received);
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [userId]);

  if (!loaded) return null;

  if (deliveries.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Received Letters
        </h3>
        <p className="text-sm text-muted-foreground">No letters yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        Received Letters
      </h3>
      <div className="space-y-2">
        {deliveries.map(del => (
          <div
            key={del.id}
            className="flex items-center gap-3 rounded-lg border bg-card p-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                Letter from sender
              </div>
              <div className="text-xs text-muted-foreground">
                {formatTimeAgo(del.created_at)} ago
              </div>
            </div>
            <LetterStatusBadge status={del.status} />
            <Link
              to={`/letter/${del.id}?token=${del.invitation_token}`}
              className="text-xs text-[#0044CC] hover:underline flex-shrink-0"
            >
              {del.status === 'completed' ? 'View' : 'Read'}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// SHARED ROW COMPONENT
// ============================================================================

interface LetterRowProps {
  letterId: string;
  label: string;
  date: string;
  badgeStatus: LetterDelivery['status'];
  isGroup?: boolean;
}

function LetterRow({ letterId, label, date, badgeStatus, isGroup }: LetterRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">
          {isGroup && <span className="mr-1">&#128101;</span>}
          {label}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatTimeAgo(date)} ago
        </div>
      </div>
      <LetterStatusBadge status={badgeStatus} />
      <Link
        to={`/letter/${letterId}/results`}
        className="text-xs text-[#0044CC] hover:underline flex-shrink-0"
      >
        View
      </Link>
    </div>
  );
}
