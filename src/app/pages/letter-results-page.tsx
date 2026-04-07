/**
 * @file letter-results-page.tsx
 * @description P581 Task 11: Sender results page — shows per-receiver gaps,
 * per-point positions, and filed stories.
 * Route: /letter/:id/results
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { useAuth } from '@/auth';
import { analytics } from '@/lib/mixpanel';
import {
  getLetterForSender,
} from '@/app/data/letters-service';
import type {
  ClarityLetter,
  LetterStorySnapshot,
  LetterDelivery,
  LetterPrediction,
} from '@/app/types';

// ============================================================================
// TYPES
// ============================================================================

type PageState = 'loading' | 'not-found' | 'ready';

// ============================================================================
// COMPONENT
// ============================================================================

export function LetterResultsPage() {
  const { id: letterId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, sessionChecked, isLoading } = useAuth();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [letter, setLetter] = useState<ClarityLetter | null>(null);
  const [snapshots, setSnapshots] = useState<LetterStorySnapshot[]>([]);
  const [deliveries, setDeliveries] = useState<LetterDelivery[]>([]);
  const [predictions, setPredictions] = useState<LetterPrediction[]>([]);

  // Auth gate — wait for both session check AND profile loading to complete
  // before redirecting. Without !isLoading, the gate fires during the window
  // where sessionChecked is true but the profile hasn't been fetched yet.
  useEffect(() => {
    if (sessionChecked && !isLoading && !user) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`, { replace: true });
    }
  }, [user, sessionChecked, isLoading, navigate]);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!letterId || !user) return;
    try {
      const result = await getLetterForSender(letterId);
      if (!result) {
        setPageState('not-found');
        return;
      }
      setLetter(result.letter);
      setSnapshots(result.snapshots);
      setDeliveries(result.deliveries);
      setPredictions(result.predictions);
      setPageState('ready');
      analytics.track('letter_results_viewed', {
        letter_id: letterId,
        mode: result.letter.mode,
        delivery_count: result.deliveries.length,
        snapshot_count: result.snapshots.length,
      });
    } catch {
      setPageState('not-found');
    }
  }, [letterId, user]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  // Aggregate stats
  const completedCount = useMemo(
    () => deliveries.filter(d => d.status === 'completed').length,
    [deliveries]
  );

  // Prediction map: story_id → prediction value
  const predictionMap = useMemo(
    () => new Map(predictions.map(p => [p.story_id, p.prediction])),
    [predictions]
  );

  // Find highest-gap story across all predictions
  const highestGapStory = useMemo(() => {
    if (snapshots.length === 0) return null;
    let maxGap = 0;
    let maxStoryId = snapshots[0].story_id;
    let maxPosition = 0;

    for (const snap of snapshots) {
      const prediction = predictionMap.get(snap.story_id) ?? 0;
      // For sender results, gap is approximate — use prediction spread
      const gap = Math.abs(prediction - 5); // Distance from neutral
      if (gap > maxGap) {
        maxGap = gap;
        maxStoryId = snap.story_id;
        maxPosition = snap.position;
      }
    }
    return { storyId: maxStoryId, position: maxPosition };
  }, [snapshots, predictionMap]);

  // ---- Loading / Error states ----

  if (!sessionChecked || pageState === 'loading') {
    return <ClarityPageLoader />;
  }

  if (pageState === 'not-found' || !letter) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-foreground">Letter not found</h1>
        <p className="text-sm text-muted-foreground">
          This letter doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Link to="/docs" className="text-sm text-[#0044CC] hover:underline">
          Back to Docs
        </Link>
      </div>
    );
  }

  // ---- Ready state ----

  const isOneToMany = letter.mode === 'one-to-many';

  return (
    <main aria-label="Letter Results" className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <FocusHeader
          onBack={() => navigate(`/d/${letter.source_doc_id}`)}
          label="Back to Doc"
        />

        <h1 className="text-xl font-semibold text-foreground">
          Letter Results
        </h1>

        {/* Summary stats */}
        <div className="text-sm text-muted-foreground">
          {isOneToMany ? (
            <span>
              {completedCount} completed, {deliveries.length - completedCount} pending
            </span>
          ) : (
            deliveries.length > 0 && (
              <span>
                To: {deliveries[0].receiver_email ?? 'Recipient'} &middot;{' '}
                {deliveries[0].status === 'completed' ? 'Completed' : 'In progress'}
              </span>
            )
          )}
        </div>

        {/* Per-story results */}
        <div className="space-y-4">
          {snapshots.map(snap => {
            const prediction = predictionMap.get(snap.story_id);

            return (
              <div
                key={snap.story_id}
                className="rounded-lg border bg-card p-4 space-y-2"
              >
                <div className="text-sm font-medium text-foreground">
                  Story {snap.position + 1}
                </div>
                {prediction !== undefined && (
                  <div className="text-sm text-muted-foreground">
                    Your prediction: {prediction}
                  </div>
                )}

                {/* Per-delivery results for this story */}
                {!isOneToMany && deliveries.map(del => (
                  <div key={del.id} className="text-xs text-muted-foreground pl-2 border-l-2 border-muted">
                    {del.receiver_email ?? 'Recipient'}: {del.status}
                    {del.stories_rated > 0 && ` (${del.stories_rated} rated)`}
                  </div>
                ))}

                {isOneToMany && completedCount > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {completedCount} {completedCount === 1 ? 'response' : 'responses'}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* /live CTA */}
        {highestGapStory && (
          <div className="text-center pt-2">
            <Link
              to={`/live?storyId=${highestGapStory.storyId}`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors min-h-[44px]"
            >
              Start /live on Story {highestGapStory.position + 1}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
