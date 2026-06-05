/**
 * @file letter-compose-page.tsx
 * @description P661: Letter composition orchestrator — replaces the 4-step wizard.
 * Flow: receiver modal → prediction walk → review → seal → confirmation.
 * Route: /letter/:docId/compose
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth';
import { docsService } from '@/app/data/docs-service';
import * as lettersService from '@/app/data/letters-service';
import { invokeLetterEmails } from '@/lib/letter-emails';
import { analytics } from '@/lib/mixpanel';
import { LetterReceiverModal, type ReceiverSetupResult } from '@/app/components/letters/letter-receiver-modal';
import { LetterPredictionWalk } from '@/app/components/letters/letter-prediction-walk';
import { LetterReviewScreen } from '@/app/components/letters/letter-review-screen';
import { LetterSealConfirmation } from '@/app/components/letters/letter-seal-confirmation';
import { pointsService } from '@/app/data/points-service';
import { computeDefaultPointOrderUpdates } from '@/app/utils/compose-default-point-order';
import type { ClarityDoc, DocStory, LetterMode } from '@/app/types';

type ComposePhase = 'modal' | 'predict' | 'review' | 'sealing' | 'confirmation';

export function LetterComposePage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Check if receiver setup was passed via route state (from modal on doc page)
  const routeState = location.state as {
    mode?: LetterMode;
    emails?: string[];
    receiverName?: string;
    recipients?: Array<{ email: string; name: string; profileId?: string }>;
  } | null;

  // Data loading
  const [doc, setDoc] = useState<ClarityDoc | null>(null);
  const [stories, setStories] = useState<DocStory[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'done' | 'not-found'>('loading');

  // Orchestrator state — skip modal if route state provided
  const [phase, setPhase] = useState<ComposePhase>(routeState?.mode ? 'predict' : 'modal');
  const [mode, setMode] = useState<LetterMode | null>(routeState?.mode ?? null);
  const [emails, setEmails] = useState<string[]>(routeState?.emails ?? []);
  const [receiverName, setReceiverName] = useState(routeState?.receiverName ?? '');
  const [recipientsList, setRecipientsList] = useState<Array<{ email: string; name: string; profileId?: string }>>(
    routeState?.recipients ?? []
  );
  const [predictions, setPredictions] = useState<Map<string, number>>(new Map());
  const [sealing, setSealing] = useState(false);
  const [sealedLetterId, setSealedLetterId] = useState<string | null>(null);
  const sealingRef = useRef(false);

  const isPrivateDoc = doc?.visibility === 'private';

  // Load doc + stories
  useEffect(() => {
    if (!docId) return;
    (async () => {
      try {
        const result = await docsService.getDoc(docId);
        if (!result) {
          setFetchState('not-found');
          return;
        }

        // P713: Enrich points with author's existing positions so buttons preselect on load.
        const allPointIds = result.stories.flatMap(s => s.story.points.map(p => p.id));
        const positionsMap = (allPointIds.length > 0 && user?.id)
          ? await pointsService.getMyPositionsForPoints(allPointIds, user.id)
          : new Map();

        const enrichedStories = result.stories.map(s => {
          const hiddenIds = Array.isArray(s.point_config?.hidden)
            ? new Set(s.point_config.hidden)
            : null;
          let points = s.story.points
            .filter(p => !hiddenIds || !hiddenIds.has(p.id))
            .map(p => ({
              ...p,
              userPosition: positionsMap.get(p.id)?.position ?? null,
            }));
          if (Array.isArray(s.point_config?.order) && s.point_config.order.length > 0) {
            const orderMap = new Map(s.point_config.order.map((id, i) => [id, i]));
            points = [...points].sort((a, b) =>
              (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER)
            );
          }
          return {
            ...s,
            story: { ...s.story, points },
          };
        });

        setDoc(result.doc);
        setStories(enrichedStories as DocStory[]);
        setFetchState('done');
      } catch {
        setFetchState('not-found');
      }
    })();
  }, [docId, user?.id]);

  // Edge case: doc has no stories
  useEffect(() => {
    if (fetchState === 'done' && doc && stories.length === 0) {
      toast.error('Add stories before composing a letter');
      navigate(`/d/${docId}`, { replace: true });
    }
  }, [fetchState, doc, stories.length, docId, navigate]);

  // Public docs: skip the mode picker modal — go straight to prediction
  useEffect(() => {
    if (fetchState !== 'done' || !doc) return;
    if (phase !== 'modal') return; // already past modal
    if (doc.visibility === 'public') {
      setMode('one-to-many');
      setPhase('predict');
    }
  }, [fetchState, doc, phase]);

  const handleReceiverSubmit = useCallback((result: ReceiverSetupResult) => {
    setMode(result.mode);
    setEmails(result.emails);
    setRecipientsList(result.recipients);
    // For prediction walk: single recipient → their name, 2+ → empty (triggers "readers" fallback)
    const derivedName = result.recipients.length === 1 ? result.recipients[0].name : '';
    setReceiverName(derivedName);
    setPhase('predict');
  }, []);

  const handlePredict = useCallback((storyId: string, value: number) => {
    setPredictions((prev) => {
      const next = new Map(prev);
      next.set(storyId, value);
      return next;
    });
  }, []);

  // Persist predictions to sessionStorage so preview page can show author's numbers
  useEffect(() => {
    if (!docId || predictions.size === 0) return;
    localStorage.setItem(
      `clarity-preview-predictions-${docId}`,
      JSON.stringify([...predictions])
    );
  }, [docId, predictions]);

  const handleSeal = useCallback(async () => {
    if (!docId || !user?.id || !mode) return;
    if (sealingRef.current) return;

    // Guard: all stories must have predictions
    if (predictions.size < stories.length) {
      toast.error(`Please predict all ${stories.length} stories before sealing`);
      return;
    }

    sealingRef.current = true;
    setSealing(true);
    try {
      // P837: Persist the composer's displayed point order for any story whose
      // point_config.order is empty/missing, so the sealed snapshot inherits
      // the same leading-point the author saw. Fails closed — no half-sealed
      // state if any updatePointConfig write fails.
      const orderUpdates = computeDefaultPointOrderUpdates(stories);
      if (orderUpdates.length > 0) {
        await Promise.all(
          orderUpdates.map(({ storyId, order }) => {
            const existing = stories.find((s) => s.story_id === storyId)?.point_config ?? {};
            return docsService.updatePointConfig(docId, storyId, { ...existing, order });
          })
        );
      }

      // 1. Create draft letter
      const letter = await lettersService.createLetter(docId, user.id, mode);

      // 2. Build predictions array for RPC
      const predictionsArray = Array.from(predictions.entries()).map(([story_id, prediction]) => ({
        story_id,
        prediction,
      }));

      // 3. Build deliveries array for 1-to-1 — each recipient gets their own name
      const deliveriesArray = mode === 'one-to-one'
        ? (recipientsList.length > 0
            ? recipientsList.map((r) =>
                // P878: picker-selected recipient — address by profile_id; the seal RPC
                // resolves the email in-DB (AD-6).
                r.profileId
                  ? { receiver_profile_id: r.profileId, receiver_name: r.name || undefined }
                  : { receiver_email: r.email, receiver_name: r.name || undefined })
            : emails.map((email) => ({ receiver_email: email, receiver_name: receiverName || undefined })))
        : [];

      // 4. Seal (atomic: snapshot + deliveries + predictions)
      const result = await lettersService.sealLetter(letter.id, predictionsArray, deliveriesArray);

      if (!result.success) {
        toast.error(result.error || 'Failed to seal letter');
        sealingRef.current = false;
        setSealing(false);
        return;
      }

      // 5. Fire-and-forget email notifications
      invokeLetterEmails(letter.id);

      analytics.track('letter_sealed', {
        letter_id: letter.id,
        doc_id: docId,
        mode,
        recipient_count: mode === 'one-to-one' ? emails.length : 0,
        story_count: stories.length,
        prediction_count: predictions.size,
      });

      setSealedLetterId(letter.id);
      toast.success(mode === 'one-to-many' ? 'Letter sealed!' : 'Letter sealed and sent!');
      setPhase('confirmation');
    } catch (err) {
      console.error('Seal failed:', err);
      toast.error('Something went wrong. Please try again.');
      sealingRef.current = false;
      setSealing(false);
    }
  }, [docId, user?.id, mode, predictions, emails, receiverName, recipientsList, stories]);

  const handlePredictionComplete = useCallback(() => {
    if (doc?.visibility === 'public') {
      setPhase('sealing');
      handleSeal(); // transitions to 'confirmation' on success
    } else {
      setPhase('review');
    }
  }, [doc?.visibility, handleSeal]);

  // Loading / not-found
  if (fetchState === 'loading') {
    return <ClarityPageLoader />;
  }

  if (fetchState === 'done' && doc && stories.length === 0) {
    return <ClarityPageLoader />;
  }

  if (fetchState === 'not-found' || !doc) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Doc not found or you don&apos;t have access.</p>
          <Button variant="link" onClick={() => navigate('/docs')}>
            Back to Docs
          </Button>
        </div>
      </main>
    );
  }

  // Phase: Modal (receiver setup)
  if (phase === 'modal') {
    return (
      <>
        <LetterReceiverModal
          open={true}
          onOpenChange={(open) => {
            if (!open) navigate(`/d/${docId}`);
          }}
          isPrivateDoc={isPrivateDoc}
          docId={docId ?? ''}
          storyCount={stories.length}
          onSubmit={handleReceiverSubmit}
        />
      </>
    );
  }

  // Phase: Prediction walk (full-screen)
  if (phase === 'predict') {
    const promptName = mode === 'one-to-many' ? '' : receiverName;
    return (
      <LetterPredictionWalk
        stories={stories}
        receiverName={promptName}
        predictions={predictions}
        onPredict={handlePredict}
        onComplete={handlePredictionComplete}
        onClose={() => navigate(`/d/${docId}`)}
        isPublicDoc={doc.visibility === 'public'}
      />
    );
  }

  // Phase: Sealing (public doc — brief loader between predict and confirmation)
  if (phase === 'sealing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50">
            <Sparkles className="h-6 w-6 text-blue-500 animate-pulse" />
          </div>
          <p className="text-muted-foreground">Sealing your letter...</p>
        </div>
      </div>
    );
  }

  // Phase: Review + Send (private docs only)
  if (phase === 'review' && mode) {
    return (
      <LetterReviewScreen
        docId={docId ?? ''}
        stories={stories}
        mode={mode}
        emails={emails}
        receiverName={receiverName}
        predictions={predictions}
        sealing={sealing}
        onSeal={handleSeal}
        onBack={() => setPhase('predict')}
      />
    );
  }

  // Phase: Confirmation
  if (phase === 'confirmation' && mode) {
    return (
      <LetterSealConfirmation
        docId={docId ?? ''}
        receiverName={receiverName}
        mode={mode}
        storyCount={stories.length}
        letterId={sealedLetterId ?? undefined}
        isPublicDoc={doc.visibility === 'public'}
      />
    );
  }

  return null;
}
