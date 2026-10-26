/**
 * @file letter-recipients-section.tsx
 * @description P1545 Letters parity + orientation redesign: the people list of the letter overview page.
 * One row per person: name, status (Invited / Opened / In progress / Done), "N of M steps", and a dot
 * while they have something new. A person who has started or finished is a tap target as a whole row:
 * it opens their whole-letter results (no separate Results link). Public-link respondents get one row
 * each, the latest 10 plus "Show all".
 *
 * Presentational: the page owns the data and the actions (Add recipient, Preview, Copy link).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LetterDelivery } from '@/app/types';
import { agoPhrase } from '@/app/pages/artifacts/artifacts-view-model';

const RESPONDENT_PAGE = 10;

export interface LetterRecipientsSectionProps {
  letterId: string;
  isPublic: boolean;
  deliveries: LetterDelivery[];
  /** Unread explain-backs / unread activity per delivery id; any value above 0 draws the dot. */
  newByDelivery: Record<string, number>;
  /** A person's results were opened from this list (their handed-over mark can go). */
  onOpenResults?: (deliveryId: string) => void;
}

function statusLabel(status: LetterDelivery['status']): string {
  switch (status) {
    case 'sent': return 'Invited';
    case 'opened': return 'Opened';
    case 'in_progress': return 'In progress';
    case 'completed': return 'Done';
    default: return status;
  }
}

const NAME_CLASS = 'max-w-[24ch] truncate font-medium sm:max-w-[40ch]';
const LINK_FOCUS = 'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function PersonRow({
  delivery, letterId, isNew, onOpenResults,
}: { delivery: LetterDelivery; letterId: string; isNew: boolean; onOpenResults?: (deliveryId: string) => void }) {
  const name = delivery.receiver_name || delivery.receiver_email || 'Anonymous';
  const isRespondent = !delivery.receiver_email;
  // "N of M steps" is progress: it reads only while the person is in progress (Done says Done, nothing else).
  const showSteps = delivery.status === 'in_progress' && delivery.steps_completed !== undefined && delivery.total_steps !== undefined;
  const hasResults = delivery.status === 'completed' || (delivery.steps_completed ?? 0) > 0;
  const detail = [
    statusLabel(delivery.status),
    showSteps ? `${Math.min(delivery.steps_completed ?? 0, delivery.total_steps ?? 0)} of ${delivery.total_steps} steps` : null,
    // Public-link respondents are all "Anonymous": when they finished tells the rows apart.
    isRespondent && delivery.status === 'completed' ? agoPhrase(delivery.completed_at) : null,
  ].filter(Boolean).join(' · ');
  return (
    <li className={`relative flex min-h-12 items-center gap-3 px-1 py-2 text-sm ${hasResults ? 'transition-colors hover:bg-accent/50' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {hasResults ? (
            // The link stretches over the whole row: a tap anywhere opens this person's results.
            <Link
              to={`/letter/${letterId}/results?delivery=${delivery.id}`}
              onClick={() => onOpenResults?.(delivery.id)}
              className={`${NAME_CLASS} ${LINK_FOCUS} after:absolute after:inset-0 after:content-['']`}
              title={name}
            >
              {name}
            </Link>
          ) : delivery.receiver_slug ? (
            <Link to={`/p/${delivery.receiver_slug}`} className={`${NAME_CLASS} ${LINK_FOCUS} hover:underline`} title={name}>
              {name}
            </Link>
          ) : (
            <span className={NAME_CLASS} title={name}>{name}</span>
          )}
          {isNew && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" role="img" aria-label="New" />}
        </div>
        <p className="text-muted-foreground">{detail}</p>
      </div>
      {hasResults && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </li>
  );
}

export function LetterRecipientsSection({ letterId, isPublic, deliveries, newByDelivery, onOpenResults }: LetterRecipientsSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const time = (iso: string) => { const t = Date.parse(iso); return Number.isNaN(t) ? 0 : t; };
  const byNewest = (a: LetterDelivery, b: LetterDelivery) => time(b.created_at) - time(a.created_at);
  const recipients = deliveries.filter(d => d.receiver_email).sort(byNewest);
  const respondents = deliveries.filter(d => !d.receiver_email).sort(byNewest);
  const shownRespondents = showAll ? respondents : respondents.slice(0, RESPONDENT_PAGE);
  const empty = deliveries.length === 0;

  const row = (d: LetterDelivery) => (
    <PersonRow key={d.id} delivery={d} letterId={letterId} isNew={(newByDelivery[d.id] ?? 0) > 0} onOpenResults={onOpenResults} />
  );

  return (
    <section aria-labelledby="letter-recipients-heading" data-testid="letter-recipients">
      <h2 id="letter-recipients-heading" className="mb-1 text-base font-medium text-foreground">Recipients</h2>

      {empty && (
        <p className="py-2 text-sm text-muted-foreground">{isPublic ? 'No responses yet' : 'No recipients yet'}</p>
      )}

      {recipients.length > 0 && (
        <ul className="divide-y divide-border/60" aria-label="Recipients">{recipients.map(row)}</ul>
      )}

      {respondents.length > 0 && (
        <>
          <h3 className="mt-3 text-sm font-medium text-muted-foreground">Public link</h3>
          <ul className="divide-y divide-border/60" aria-label="Public link respondents">{shownRespondents.map(row)}</ul>
          {respondents.length > RESPONDENT_PAGE && (
            <Button variant="ghost" className="mt-1 min-h-10 text-blue-600" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Show less' : `Show all (${respondents.length})`}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
