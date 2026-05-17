/**
 * @file letter-overview-page.tsx
 * @description P700: Author-only cohort overview for a sent letter.
 * Shows stacked CohortTable components — one per story in the letter.
 *
 * Route: /letter/:id/overview
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/auth';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { Button } from '@/components/ui/button';
import { CohortTable } from '@/app/components/letters/cohort-table';
import { getLetterOverview } from '@/app/data/letters-service';
import type { LetterOverviewPayload } from '@/app/types';
import { stripHashtags } from '@/lib/utils';
import { PersonAvatar } from '@/components/ui/person-avatar';

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

  // Auth gate — redirect to login if unauthenticated
  useEffect(() => {
    if (sessionChecked && !isLoading && !user) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`, { replace: true });
    }
  }, [user, sessionChecked, isLoading, navigate]);

  const fetchData = useCallback(async () => {
    if (!letterId || !user) return;
    setPageState('loading');
    try {
      const result = await getLetterOverview(letterId);
      if (!result) {
        // RPC returned null/empty — not author, or not sealed
        setPageState('not-authorized');
        return;
      }
      if (result.deliveries.length === 0) {
        setPayload(result);
        setPageState('empty');
        return;
      }
      setPayload(result);
      setPageState('ready');
    } catch {
      setPageState('error');
    }
  }, [letterId, user]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const handleBack = () => navigate('/letters?tab=sent');

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (!sessionChecked || pageState === 'loading') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <FocusHeader onBack={handleBack} label="Back" aria-label="Back to Sent tab" />
        <OverviewSkeleton />
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <FocusHeader onBack={handleBack} label="Back" aria-label="Back to Sent tab" />
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">Could not load this letter overview.</p>
          <Button variant="outline" onClick={fetchData}>Retry</Button>
        </div>
      </div>
    );
  }

  // ── Not authorized ──────────────────────────────────────────────────────────
  if (pageState === 'not-authorized') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <FocusHeader onBack={handleBack} label="Back" aria-label="Back to Sent tab" />
        <div className="text-center py-12">
          <p className="text-muted-foreground">Not authorized.</p>
        </div>
      </div>
    );
  }

  // ── Empty (zero deliveries) ─────────────────────────────────────────────────
  if (pageState === 'empty' || !payload) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <FocusHeader onBack={handleBack} label="Back" aria-label="Back to Sent tab" />
        <div className="py-12">
          <p className="text-muted-foreground text-sm">No recipients on this letter yet.</p>
        </div>
      </div>
    );
  }

  // ── Success ─────────────────────────────────────────────────────────────────
  const { letter, stories, deliveries, predictions, ratings, pointResponses } = payload;

  return (
    <div className="animate-fade-in">
      {/* Page-level sr-only labels — accessible names for repeated muted cells (P700) */}
      <span className="sr-only">No response</span>
      <span className="sr-only">Waiting for response</span>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-10">
        <FocusHeader onBack={handleBack} label="Back" aria-label="Back to Sent tab" />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Letter Overview</p>
          <h1 className="text-xl font-semibold text-foreground">{letter.title && !/^Untitled Doc\d*$/.test(letter.title) ? letter.title : 'Untitled letter'}</h1>
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

        {stories.map((story) => {
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
              deliveries={deliveries}
              ratings={ratings}
              predictions={predictions}
              responses={pointResponses}
              letterId={letterId ?? ''}
            />
          </section>
          );
        })}
      </div>
    </div>
  );
}
