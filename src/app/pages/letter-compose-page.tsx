/**
 * @file letter-compose-page.tsx
 * @description P661: Letter composition orchestrator — replaces the 4-step wizard.
 * Flow: receiver modal → prediction walk → review → seal → confirmation.
 * Route: /letter/:docId/compose
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
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
import type { ClarityDoc, DocStory, LetterMode } from '@/app/types';

type ComposePhase = 'modal' | 'predict' | 'review' | 'confirmation';

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
  const [predictions, setPredictions] = useState<Map<string, number>>(new Map());
  const [sealing, setSealing] = useState(false);
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
        setDoc(result.doc);
        setStories(result.stories);
        setFetchState('done');
      } catch {
        setFetchState('not-found');
      }
    })();
  }, [docId]);

  // Edge case: doc has no stories
  useEffect(() => {
    if (fetchState === 'done' && doc && stories.length === 0) {
      toast.error('Add stories before composing a letter');
      navigate(`/d/${docId}`, { replace: true });
    }
  }, [fetchState, doc, stories.length, docId, navigate]);

  const handleReceiverSubmit = useCallback((result: ReceiverSetupResult) => {
    setMode(result.mode);
    setEmails(result.emails);
    setReceiverName(result.receiverName);
    setPhase('predict');
  }, []);

  const handlePredict = useCallback((storyId: string, value: number) => {
    setPredictions((prev) => {
      const next = new Map(prev);
      next.set(storyId, value);
      return next;
    });
  }, []);

  const handlePredictionComplete = useCallback(() => {
    setPhase('review');
  }, []);

  // Persist predictions to sessionStorage so preview page can show author's numbers
  useEffect(() => {
    if (!docId || predictions.size === 0) return;
    sessionStorage.setItem(
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
      // 1. Create draft letter
      const letter = await lettersService.createLetter(docId, user.id, mode);

      // 2. Build predictions array for RPC
      const predictionsArray = Array.from(predictions.entries()).map(([story_id, prediction]) => ({
        story_id,
        prediction,
      }));

      // 3. Build deliveries array for 1-to-1
      const deliveriesArray = mode === 'one-to-one'
        ? emails.map((email) => ({ receiver_email: email, receiver_name: receiverName || undefined }))
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

      toast.success('Letter sealed and sent!');
      setPhase('confirmation');
    } catch (err) {
      console.error('Seal failed:', err);
      toast.error('Something went wrong. Please try again.');
      sealingRef.current = false;
      setSealing(false);
    }
  }, [docId, user?.id, mode, predictions, emails, receiverName, stories.length]);

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
      />
    );
  }

  // Phase: Review + Send
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
      />
    );
  }

  return null;
}
