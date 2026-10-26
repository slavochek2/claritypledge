/**
 * @file letter-overview-page.tsx
 * @description P700: Author-only cohort overview for a sent letter; P1545: the letter's control page.
 * One hierarchy: title and sealed date, ONE primary action (Add recipients, blue) with Preview and
 * Copy public link as outline buttons beside it, then the people list (each row opens that person's results),
 * then one CohortTable per story as detail. One Back, at the top.
 *
 * Route: /letter/:id/overview
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/auth';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { Button } from '@/components/ui/button';
import { CohortTable } from '@/app/components/letters/cohort-table';
import { LetterRecipientsSection } from '@/app/components/letters/letter-recipients-section';
import { LetterReceiverModal } from '@/app/components/letters/letter-receiver-modal';
import { LetterDelete } from '@/app/components/letters/letter-delete';
import {
  getDeliveriesForLettersOrThrow,
  getLetterOverview,
  getUnreadExplainBackCountsByDelivery,
} from '@/app/data/letters-service';
import { newCountForDelivery } from '@/app/utils/letter-new-activity';
import { toast } from 'sonner';
import type { LetterDelivery, LetterOverviewPayload } from '@/app/types';
import { stripHashtags } from '@/lib/utils';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { analytics } from '@/lib/mixpanel';
import { ARTIFACTS_LETTERS_SENT } from '@/app/pages/artifacts/legacy-redirect-targets';

function snippet(text: string, max: number): string {
  const t = text.trim();
  if (!t) return '';
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return cut.trimEnd() + '…';
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function OverviewSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Two skeleton story blocks */}
      {[0, 1].map((i) => (
        <div key={i}>
          <div className="h-5 bg-muted rounded w-48 mb-3" />
          <div className="h-4 bg-muted rounded mb-2" />
          <div className="h-4 bg-muted rounded mb-2" />
          <div className="h-4 bg-muted rounded mb-2" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// PAGE
// ============================================================================

type PageState = 'loading' | 'error' | 'not-authorized' | 'empty' | 'ready';

export function LetterOverviewPage() {
  const { id: letterId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, sessionChecked, isLoading } = useAuth();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [payload, setPayload] = useState<LetterOverviewPayload | null>(null);
  const trackedLetterIdRef = useRef<string | null>(null);
  // Recipients section: status, steps and "new" marks come from the deliveries read, which the overview RPC lacks.
  const [deliveries, setDeliveries] = useState<LetterDelivery[]>([]);
  const [recipientsFailed, setRecipientsFailed] = useState(false);
  const [newByDelivery, setNewByDelivery] = useState<Record<string, number>>({});
  const [addOpen, setAddOpen] = useState(false);

  // Auth gate — redirect to login if unauthenticated
  useEffect(() => {
    if (sessionChecked && !isLoading && !user) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`, { replace: true });
    }
  }, [user, sessionChecked, isLoading, navigate]);

  useEffect(() => {
    if ((pageState === 'ready' || pageState === 'empty') && payload && letterId && trackedLetterIdRef.current !== letterId) {
      trackedLetterIdRef.current = letterId;
      analytics.track('letter_overview_viewed', {
        letter_id: letterId,
        story_count: payload.stories.length,
        recipient_count: payload.deliveries.length,
      });
    }
  }, [pageState, payload, letterId]);

  // Newest request wins: a slow older response (another letter, or an earlier refresh) is dropped.
  const requestRef = useRef(0);

  // `quiet` refreshes in place (the page stays on screen); the default shows the loading skeleton.
  const fetchData = useCallback(async (quiet = false) => {
    if (!letterId || !user) return;
    const mine = ++requestRef.current;
    const stale = () => requestRef.current !== mine;
    if (!quiet) setPageState('loading');
    try {
      const [result, recipients] = await Promise.all([
        getLetterOverview(letterId),
        getDeliveriesForLettersOrThrow([letterId]).then(
          (grouped) => grouped[letterId] ?? [],
          () => null,
        ),
      ]);
      if (stale()) return;
      if (!result) {
        // RPC answered with nothing — not author, or not sealed
        setPageState('not-authorized');
        return;
      }
      setRecipientsFailed(recipients === null);
      if (recipients) {
        let counts: Record<string, number> = {};
        try {
          counts = (await getUnreadExplainBackCountsByDelivery(recipients.map((d) => d.id))) ?? {};
        } catch {
          counts = {};
        }
        if (stale()) return;
        setDeliveries(recipients);
        // Unread explain-backs and unread activity (they started or finished: read_at still null) both mark "new".
        setNewByDelivery(Object.fromEntries(recipients.map((d) => [
          d.id,
          newCountForDelivery(counts[d.id] ?? 0, (d.status === 'completed' || d.status === 'in_progress') && !d.read_at),
        ])));
      }
      if (result.deliveries.length === 0) {
        setPayload(result);
        setPageState('empty');
        return;
      }
      setPayload(result);
      setPageState('ready');
    } catch {
      if (!stale()) setPageState('error');
    }
  }, [letterId, user]);

  useEffect(() => {
    if (user) void fetchData();
  }, [user, fetchData]);

  // P1364: Back returns to where the reader came from; a cold arrival goes to the Sent tab.
  const BACK_FALLBACK = ARTIFACTS_LETTERS_SENT;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (!sessionChecked || pageState === 'loading') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <FocusHeader fallback={BACK_FALLBACK} />
        <OverviewSkeleton />
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <FocusHeader fallback={BACK_FALLBACK} />
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">Could not load this letter overview.</p>
          <Button variant="outline" onClick={() => void fetchData()}>Retry</Button>
        </div>
      </div>
    );
  }

  // ── Not authorized ──────────────────────────────────────────────────────────
  if (pageState === 'not-authorized') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <FocusHeader fallback={BACK_FALLBACK} />
        <div className="text-center py-12">
          <p className="text-muted-foreground">Not authorized.</p>
        </div>
      </div>
    );
  }

  if (!payload) return null;

  // ── Success ─────────────────────────────────────────────────────────────────
  const { letter, stories, predictions, ratings, pointResponses } = payload;
  const isPublic = letter.mode === 'one-to-many';
  const hasCohort = payload.deliveries.length > 0;

  // The "new" mark is cleared by the results page once it has rendered, not by the click here.
  const sealed = letter.sealed_at ? new Date(letter.sealed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  const handlePreview = () => {
    if (letter.source_doc_id) window.open(`/letter/${letter.source_doc_id}/preview`, '_blank', 'noopener,noreferrer');
  };
  const handleCopyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/letter/${letter.id}`);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Page-level sr-only labels — accessible names for repeated muted cells (P700) */}
      <span className="sr-only">No response</span>
      <span className="sr-only">Waiting for response</span>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-10">
        <FocusHeader fallback={BACK_FALLBACK} />
        <div className="space-y-4">
          <div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Letter Overview</p>
              <h1 className="text-xl font-semibold text-foreground">{letter.title && !/^Untitled Doc\d*$/.test(letter.title) ? letter.title : 'Untitled letter'}</h1>
              {sealed && <p className="mt-1 text-sm text-muted-foreground">Sealed {sealed}</p>}
              {/* P843: author identity with avatar + full name (parity with cohort rows) */}
              <div className="mt-3 flex items-center gap-2" data-testid="letter-author-block">
                <PersonAvatar
                  person={{
                    name: letter.sender.name,
                    avatarUrl: letter.sender.avatar_url ?? undefined,
                    hasPledged: letter.sender.has_pledged,
                    slug: letter.sender.slug ?? undefined,
                  }}
                  size="sm"
                />
                {letter.sender.slug ? (
                  <Link
                    to={`/p/${letter.sender.slug}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {letter.sender.name}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">{letter.sender.name}</span>
                )}
              </div>
            </div>
          </div>
          {/* Add recipients is the one primary (blue, as "+ New" on Artifacts); Preview and Copy public link are visible outline buttons beside it. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button className="min-h-10 bg-blue-500 text-white hover:bg-blue-700" onClick={() => setAddOpen(true)}>Add recipients</Button>
            {letter.source_doc_id && (
              <Button variant="outline" className="min-h-10" onClick={handlePreview}>Preview</Button>
            )}
            {isPublic && (
              <Button variant="outline" className="min-h-10" onClick={() => void handleCopyPublicLink()}>Copy public link</Button>
            )}
          </div>
        </div>

        {recipientsFailed ? (
          <section>
            <h2 className="mb-1 text-base font-medium text-foreground">Recipients</h2>
            <p className="text-sm text-muted-foreground">Something went wrong loading the recipients.</p>
            <Button variant="outline" className="mt-2 min-h-10" onClick={() => void fetchData()}>Retry</Button>
          </section>
        ) : (
          <LetterRecipientsSection
            letterId={letter.id}
            isPublic={isPublic}
            deliveries={deliveries}
            newByDelivery={newByDelivery}
          />
        )}

        {hasCohort && stories.map((story) => {
          const heading = snippet(stripHashtags(story.content, story.hashtags), 80) || 'Untitled story';
          return (
          <section key={story.story_id}>
            <h2 className="text-base font-medium text-foreground mb-3">
              <Link to={`/story/${story.story_id}`} className="hover:underline">
                {heading}
              </Link>
            </h2>
            <CohortTable
              story={story}
              deliveries={payload.deliveries}
              ratings={ratings}
              predictions={predictions}
              responses={pointResponses}
              letterMode={letter.mode}
            />
          </section>
          );
        })}

        {/* P1545: Delete moved in from the Artifacts row menu. Only while nobody has the letter (no recipient, no public-link
            respondent); unknown recipients are not "nobody". Last and low-weight: never a second primary. */}
        {!recipientsFailed && deliveries.length === 0 && payload.deliveries.length === 0 && <LetterDelete letterId={letter.id} />}

        {addOpen && (
          <LetterReceiverModal
            mode="add-recipient"
            open
            onOpenChange={setAddOpen}
            letterId={letter.id}
            onRecipientAdded={() => {
              setAddOpen(false);
              void fetchData(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
