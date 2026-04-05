/**
 * @file letter-compose-page.tsx
 * @description P581: Letter composition wizard — 4-step flow:
 * 1. Mode selector (1-to-1 with emails vs 1-to-many with link)
 * 2. Predictions (per-story, 0-10 rating)
 * 3. Preview (read-only letter view with banner)
 * 4. Seal ceremony (confirm & send)
 *
 * Route: /letter/:docId/compose
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mail, Link2, ChevronLeft, ChevronRight, Eye, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { RatingButtons } from '@/app/components/partners/shared';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { useAuth } from '@/auth';
import { docsService } from '@/app/data/docs-service';
import * as lettersService from '@/app/data/letters-service';
import { invokeLetterEmails } from '@/lib/letter-emails';
import { analytics } from '@/lib/mixpanel';
import type { ClarityDoc, DocStory, LetterMode } from '@/app/types';

type WizardStep = 'mode' | 'predictions' | 'preview' | 'seal';

// ---------------------------------------------------------------------------
// Step 1: Mode Selector
// ---------------------------------------------------------------------------

interface ModeStepProps {
  mode: LetterMode | null;
  onSelectMode: (mode: LetterMode) => void;
  emails: string;
  onEmailsChange: (emails: string) => void;
  receiverName: string;
  onReceiverNameChange: (name: string) => void;
  isPrivateDoc: boolean;
  onNext: () => void;
}

function ModeStep({ mode, onSelectMode, emails, onEmailsChange, receiverName, onReceiverNameChange, isPrivateDoc, onNext }: ModeStepProps) {
  const canProceed = mode === 'one-to-many' || (mode === 'one-to-one' && emails.trim().length > 0 && receiverName.trim().length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Who is this letter for?</h2>
        <p className="text-sm text-muted-foreground mt-1">Choose how you want to deliver your letter.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 1-to-1 card */}
        <button
          type="button"
          onClick={() => onSelectMode('one-to-one')}
          className={`text-left p-5 rounded-xl border-2 transition-all ${
            mode === 'one-to-one'
              ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
              : 'border-gray-200 hover:border-gray-300 bg-white'
          }`}
        >
          <Mail className={`h-8 w-8 mb-3 ${mode === 'one-to-one' ? 'text-blue-500' : 'text-gray-400'}`} />
          <div className="font-medium text-foreground">Specific people</div>
          <p className="text-sm text-muted-foreground mt-1">
            Send by email to one or more people. They get a personal invitation link.
          </p>
        </button>

        {/* 1-to-many card */}
        <button
          type="button"
          onClick={() => !isPrivateDoc && onSelectMode('one-to-many')}
          disabled={isPrivateDoc}
          className={`text-left p-5 rounded-xl border-2 transition-all ${
            isPrivateDoc
              ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
              : mode === 'one-to-many'
                ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
                : 'border-gray-200 hover:border-gray-300 bg-white'
          }`}
        >
          <Link2 className={`h-8 w-8 mb-3 ${mode === 'one-to-many' ? 'text-blue-500' : 'text-gray-400'}`} />
          <div className="font-medium text-foreground">Anyone with a link</div>
          <p className="text-sm text-muted-foreground mt-1">
            {isPrivateDoc
              ? 'Not available for private docs (D45). Switch to public to enable.'
              : 'Generate a shareable link. Anyone who opens it can read and respond.'}
          </p>
        </button>
      </div>

      {/* Email + name input for 1-to-1 */}
      {mode === 'one-to-one' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="receiver-emails" className="text-sm font-medium text-foreground">
              Recipient email
            </label>
            <Input
              id="receiver-emails"
              type="text"
              placeholder="email@example.com"
              value={emails}
              onChange={(e) => onEmailsChange(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">The email address of the person you&apos;re writing to.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="receiver-name" className="text-sm font-medium text-foreground">
              Recipient&apos;s full name
            </label>
            <Input
              id="receiver-name"
              type="text"
              placeholder="e.g. Slava Ladischenski"
              maxLength={100}
              value={receiverName}
              onChange={(e) => onReceiverNameChange(e.target.value)}
              required
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">Used in the email greeting and on the letter cover.</p>
          </div>
        </div>
      )}

      {/* Info for 1-to-many */}
      {mode === 'one-to-many' && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-sm text-blue-800">
            A shareable link will be generated after you seal the letter. Anyone with the link can read and respond.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!canProceed} className="bg-blue-500 hover:bg-blue-600 text-white">
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Predictions Carousel
// ---------------------------------------------------------------------------

interface PredictionsStepProps {
  stories: DocStory[];
  predictions: Map<string, number>;
  onPredict: (storyId: string, value: number) => void;
  onBack: () => void;
  onNext: () => void;
}

function PredictionsStep({ stories, predictions, onPredict, onBack, onNext }: PredictionsStepProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const allPredicted = stories.every((s) => predictions.has(s.story_id));
  const currentStory = stories[currentIndex];

  if (!currentStory) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Predict understanding</h2>
        <p className="text-sm text-muted-foreground mt-1">
          How well will the receiver understand each story? (0 = not at all, 10 = perfectly)
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Story {currentIndex + 1} of {stories.length}</span>
        <span className="ml-auto">
          {predictions.size}/{stories.length} predicted
        </span>
      </div>

      {/* Story card */}
      <div className="p-5 rounded-xl border border-gray-200 bg-white space-y-4">
        <div className="font-medium text-foreground line-clamp-2">
          {currentStory.story.content.slice(0, 120)}{currentStory.story.content.length > 120 ? '...' : ''}
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-2">Your prediction:</p>
          <RatingButtons
            selectedValue={predictions.get(currentStory.story_id) ?? null}
            onSelect={(value) => onPredict(currentStory.story_id, value)}
            fullWidth
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentIndex((i) => Math.min(stories.length - 1, i + 1))}
            disabled={currentIndex === stories.length - 1}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button
            onClick={onNext}
            disabled={!allPredicted}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            {allPredicted ? 'Preview' : `Predict all ${stories.length} stories first`}
            {allPredicted && <Eye className="h-4 w-4 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Preview
// ---------------------------------------------------------------------------

interface PreviewStepProps {
  doc: ClarityDoc;
  stories: DocStory[];
  onBack: () => void;
  onNext: () => void;
}

function PreviewStep({ doc, stories, onBack, onNext }: PreviewStepProps) {
  return (
    <div className="space-y-6">
      {/* Preview banner */}
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          This is a preview — the receiver will see exactly this.
        </p>
      </div>

      {/* Letter content */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">{doc.title}</h2>

        {stories.map((docStory, index) => (
          <div
            key={docStory.story_id}
            className="p-4 rounded-lg border border-gray-200 bg-white"
          >
            <div className="text-xs text-muted-foreground mb-2">Story {index + 1}</div>
            <p className="text-foreground whitespace-pre-wrap">{docStory.story.content}</p>

            {/* Show points if any */}
            {docStory.story.points && docStory.story.points.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {docStory.story.points.map((point) => (
                  <div
                    key={point.id}
                    className="text-sm text-muted-foreground pl-3 border-l-2 border-gray-200"
                  >
                    {point.statement}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to predictions
        </Button>
        <Button onClick={onNext} className="bg-blue-500 hover:bg-blue-600 text-white">
          Continue to seal
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Seal Ceremony
// ---------------------------------------------------------------------------

interface SealStepProps {
  doc: ClarityDoc;
  stories: DocStory[];
  mode: LetterMode;
  emails: string[];
  receiverName: string;
  predictions: Map<string, number>;
  onBack: () => void;
  onSeal: () => Promise<void>;
  sealing: boolean;
}

function SealStep({ doc, stories, mode, emails, receiverName, predictions, onBack, onSeal, sealing }: SealStepProps) {
  const totalPoints = stories.reduce(
    (sum, s) => sum + (s.story.points?.length ?? 0),
    0
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8">
      {/* Ceremony icon */}
      <div className="text-6xl animate-pulse">
        <Sparkles className="h-16 w-16 text-blue-500" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Seal your letter</h2>
        <p className="text-muted-foreground max-w-md">
          Once sealed, your predictions are locked and the letter is sent. This cannot be undone.
        </p>
      </div>

      {/* Summary */}
      <div className="w-full max-w-sm space-y-3 text-left p-5 rounded-xl border border-gray-200 bg-white">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Letter</span>
          <span className="font-medium text-foreground">{doc.title}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Stories</span>
          <span className="font-medium text-foreground">{stories.length}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Points</span>
          <span className="font-medium text-foreground">{totalPoints}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Predictions</span>
          <span className="font-medium text-foreground">{predictions.size}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Delivery</span>
          <span className="font-medium text-foreground">
            {mode === 'one-to-one' ? `${emails.length} recipient${emails.length !== 1 ? 's' : ''}` : 'Anyone with link'}
          </span>
        </div>
        {mode === 'one-to-one' && emails.length > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-muted-foreground mb-1">Recipients:</p>
            <div className="space-y-0.5">
              {emails.map((email) => (
                <p key={email} className="text-xs text-foreground">
                  {receiverName ? `${receiverName} (${email})` : email}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onBack} disabled={sealing}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button
          onClick={onSeal}
          disabled={sealing}
          size="lg"
          className="bg-blue-500 hover:bg-blue-600 text-white px-8"
        >
          {sealing ? (
            'Sealing...'
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Seal & Send Letter
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LetterComposePage — Main wizard
// ---------------------------------------------------------------------------

export function LetterComposePage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [doc, setDoc] = useState<ClarityDoc | null>(null);
  const [stories, setStories] = useState<DocStory[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'done' | 'not-found'>('loading');

  // Wizard state
  const [step, setStep] = useState<WizardStep>('mode');
  const [mode, setMode] = useState<LetterMode | null>(null);
  const [emailsInput, setEmailsInput] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [predictions, setPredictions] = useState<Map<string, number>>(new Map());
  const [sealing, setSealing] = useState(false);

  // Parse emails from comma-separated input
  const parsedEmails = useMemo(() => {
    return emailsInput
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && e.includes('@'));
  }, [emailsInput]);

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

  const handlePredict = useCallback((storyId: string, value: number) => {
    setPredictions((prev) => {
      const next = new Map(prev);
      next.set(storyId, value);
      return next;
    });
  }, []);

  const handleSeal = useCallback(async () => {
    if (!docId || !user?.id || !mode) return;

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
        ? parsedEmails.map((email) => ({ receiver_email: email, receiver_name: receiverName || undefined }))
        : [];

      // 4. Seal (atomic: snapshot + deliveries + predictions)
      const result = await lettersService.sealLetter(letter.id, predictionsArray, deliveriesArray);

      if (!result.success) {
        toast.error(result.error || 'Failed to seal letter');
        setSealing(false);
        return;
      }

      // 5. Fire-and-forget email notifications
      invokeLetterEmails(letter.id);

      analytics.track('letter_sealed', {
        letter_id: letter.id,
        doc_id: docId,
        mode,
        recipient_count: mode === 'one-to-one' ? parsedEmails.length : 0,
        story_count: stories.length,
        prediction_count: predictions.size,
      });

      toast.success('Letter sealed and sent!');
      navigate(`/d/${docId}`);
    } catch (err) {
      console.error('Seal failed:', err);
      toast.error('Something went wrong. Please try again.');
      setSealing(false);
    }
  }, [docId, user?.id, mode, predictions, parsedEmails, receiverName, navigate, stories.length]);

  // Edge case: doc has no stories — redirect back
  useEffect(() => {
    if (fetchState === 'done' && doc && stories.length === 0) {
      toast.error('Add stories before composing a letter');
      navigate(`/d/${docId}`, { replace: true });
    }
  }, [fetchState, doc, stories.length, docId, navigate]);

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

  return (
    <main aria-label="Compose letter" className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <FocusHeader
          onBack={() => {
            if (step === 'mode') {
              navigate(`/d/${docId}`);
            } else if (step === 'predictions') {
              setStep('mode');
            } else if (step === 'preview') {
              setStep('predictions');
            } else {
              setStep('preview');
            }
          }}
          label={step === 'mode' ? 'Back to doc' : 'Back'}
        />

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {(['mode', 'predictions', 'preview', 'seal'] as WizardStep[]).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= ['mode', 'predictions', 'preview', 'seal'].indexOf(step)
                  ? 'bg-blue-500'
                  : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {step === 'mode' && (
          <ModeStep
            mode={mode}
            onSelectMode={setMode}
            emails={emailsInput}
            onEmailsChange={setEmailsInput}
            receiverName={receiverName}
            onReceiverNameChange={setReceiverName}
            isPrivateDoc={isPrivateDoc}
            onNext={() => {
              analytics.track('letter_created', {
                doc_id: docId,
                mode,
                story_count: stories.length,
              });
              setStep('predictions');
            }}
          />
        )}
        {step === 'predictions' && (
          <PredictionsStep
            stories={stories}
            predictions={predictions}
            onPredict={handlePredict}
            onBack={() => setStep('mode')}
            onNext={() => setStep('preview')}
          />
        )}
        {step === 'preview' && (
          <PreviewStep
            doc={doc}
            stories={stories}
            onBack={() => setStep('predictions')}
            onNext={() => setStep('seal')}
          />
        )}
        {step === 'seal' && mode && (
          <SealStep
            doc={doc}
            stories={stories}
            mode={mode}
            emails={parsedEmails}
            receiverName={receiverName}
            predictions={predictions}
            onBack={() => setStep('preview')}
            onSeal={handleSeal}
            sealing={sealing}
          />
        )}
      </div>
    </main>
  );
}
