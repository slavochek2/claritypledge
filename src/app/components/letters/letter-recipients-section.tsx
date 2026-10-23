/**
 * @file letter-recipients-section.tsx
 * @description P1545 Letters parity: the Recipients section of the letter overview page, the letter's
 * control page. Per person: status (Invited / Opened / In progress / done), "N of M steps", a "new"
 * mark while they have unread explain-backs, and one whole-letter Results link. Public-link
 * respondents get one row each, the latest 10 plus "Show all". Actions: Add recipients, Preview,
 * Copy public link (public letters), and the Sealed date.
 *
 * Presentational: the page owns the data and the handlers.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { LetterDelivery } from '@/app/types';

const RESPONDENT_PAGE = 10;

export interface LetterRecipientsSectionProps {
  letterId: string;
  isPublic: boolean;
  deliveries: LetterDelivery[];
  /** Unread explain-backs per delivery id. */
  newByDelivery: Record<string, number>;
  sealedAt: string | null;
  /** The person opened this delivery's results: the page clears their "new" mark. */
  onResultsOpened: (deliveryId: string) => void;
  onAddRecipients: () => void;
  onPreview: () => void;
  onCopyPublicLink: () => void;
}

function statusLabel(status: LetterDelivery['status']): string {
  switch (status) {
    case 'sent': return 'Invited';
    case 'opened': return 'Opened';
    case 'in_progress': return 'In progress';
    case 'completed': return 'done';
    default: return status;
  }
}

function PersonRow({
  delivery, letterId, newCount, onResultsOpened,
}: { delivery: LetterDelivery; letterId: string; newCount: number; onResultsOpened: (id: string) => void }) {
  const name = delivery.receiver_name || delivery.receiver_email || 'Anonymous';
  const showSteps = delivery.status !== 'sent' && delivery.steps_completed !== undefined && delivery.total_steps !== undefined;
  const hasResults = delivery.status === 'completed' || (delivery.steps_completed ?? 0) > 0;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      {delivery.receiver_slug ? (
        <Link to={`/p/${delivery.receiver_slug}`} className="max-w-[24ch] truncate font-medium hover:underline sm:max-w-[40ch]" title={name}>
          {name}
        </Link>
      ) : (
        <span className="max-w-[24ch] truncate font-medium sm:max-w-[40ch]" title={name}>{name}</span>
      )}
      <span className="text-muted-foreground">{statusLabel(delivery.status)}</span>
      {showSteps && (
        <span className="text-muted-foreground">
          {Math.min(delivery.steps_completed ?? 0, delivery.total_steps ?? 0)} of {delivery.total_steps} steps
        </span>
      )}
      {newCount > 0 && <span className="text-xs font-medium text-blue-600">{newCount} new</span>}
      {hasResults && (
        <Link
          to={`/letter/${letterId}/results?delivery=${delivery.id}`}
          onClick={() => onResultsOpened(delivery.id)}
          className="ml-auto inline-flex min-h-10 items-center text-sm font-medium text-blue-600 hover:underline"
        >
          Results
        </Link>
      )}
    </li>
  );
}

export function LetterRecipientsSection({
  letterId, isPublic, deliveries, newByDelivery, sealedAt, onResultsOpened, onAddRecipients, onPreview, onCopyPublicLink,
}: LetterRecipientsSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const byNewest = (a: LetterDelivery, b: LetterDelivery) => Date.parse(b.created_at) - Date.parse(a.created_at);
  const recipients = deliveries.filter(d => d.receiver_email).sort(byNewest).reverse();
  const respondents = deliveries.filter(d => !d.receiver_email).sort(byNewest);
  const shownRespondents = showAll ? respondents : respondents.slice(0, RESPONDENT_PAGE);
  const sealed = sealedAt ? new Date(sealedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  const empty = deliveries.length === 0;

  const row = (d: LetterDelivery) => (
    <PersonRow key={d.id} delivery={d} letterId={letterId} newCount={newByDelivery[d.id] ?? 0} onResultsOpened={onResultsOpened} />
  );

  return (
    <section aria-labelledby="letter-recipients-heading" data-testid="letter-recipients">
      <h2 id="letter-recipients-heading" className="mb-1 text-base font-medium text-foreground">Recipients</h2>
      {sealed && <p className="mb-2 text-sm text-muted-foreground">Sealed {sealed}</p>}

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
          {!showAll && respondents.length > RESPONDENT_PAGE && (
            <Button variant="ghost" className="mt-1 min-h-10 text-blue-600" onClick={() => setShowAll(true)}>
              Show all ({respondents.length})
            </Button>
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-10" onClick={onAddRecipients}>Add recipients</Button>
        <Button variant="outline" className="min-h-10" onClick={onPreview}>Preview</Button>
        {isPublic && <Button variant="outline" className="min-h-10" onClick={onCopyPublicLink}>Copy public link</Button>}
      </div>
    </section>
  );
}
