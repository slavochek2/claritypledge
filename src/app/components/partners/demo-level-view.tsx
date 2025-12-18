/**
 * @file demo-level-view.tsx
 * @description Main demo view component that orchestrates the 5-level paraphrase flow.
 * Handles role-specific UI (speaker vs listener), state sync, and phase transitions.
 */
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { TranscriptionInput } from './transcription-input';
import { RatingCard } from './rating-card';
import { PositionButtons } from './position-buttons';
import {
  DEMO_LEVELS,
  getLevelConfig,
  getRolesForLevel,
  getIdeaTextForLevel,
  isFinalLevel,
} from './demo-config';
import type { DemoFlowState, Position, ClaritySession } from '@/app/types';
import { ArrowRight, CheckCircle2, MessageSquare, Users } from 'lucide-react';

interface DemoLevelViewProps {
  /** The current session */
  session: ClaritySession;
  /** Current demo flow state */
  demoState: DemoFlowState;
  /** Whether current user is the creator */
  isCreator: boolean;
  /** Update the demo state (syncs via realtime) */
  onUpdateState: (updates: Partial<DemoFlowState>) => void;
  /** Save a completed round to the database */
  onSaveRound: () => void;
  /** Move to next level */
  onNextLevel: () => void;
  /** Complete the demo (all 5 levels done) */
  onDemoComplete: () => void;
}

export function DemoLevelView({
  session,
  demoState,
  isCreator,
  onUpdateState,
  onSaveRound,
  onNextLevel,
  onDemoComplete,
}: DemoLevelViewProps) {
  const { currentLevel, currentRound, phase } = demoState;
  const levelConfig = getLevelConfig(currentLevel);

  const creatorName = session.creatorName;
  const joinerName = session.joinerName || 'Partner';
  const { speakerName, listenerName } = getRolesForLevel(currentLevel, creatorName, joinerName);

  // Determine current user's role
  const myName = isCreator ? creatorName : joinerName;
  const isSpeaker = myName === speakerName;
  const isListener = !isSpeaker;

  // Pre-set idea text for Level 5
  const presetIdeaText = getIdeaTextForLevel(currentLevel);

  // Handle idea confirmation (speaker only)
  const handleIdeaConfirm = useCallback((text: string) => {
    onUpdateState({
      ideaText: text,
      ideaConfirmed: true,
      phase: 'paraphrase',
    });
  }, [onUpdateState]);

  // Handle paraphrase confirmation (listener only)
  const handleParaphraseConfirm = useCallback((text: string) => {
    onUpdateState({
      paraphraseText: text,
      paraphraseConfirmed: true,
      phase: 'rating',
    });
  }, [onUpdateState]);

  // Handle rating submission
  const handleRatingSubmit = useCallback((rating: number, correction?: string) => {
    if (isSpeaker) {
      onUpdateState({
        speakerRating: rating,
        correctionText: correction,
      });
    } else {
      onUpdateState({
        listenerSelfRating: rating,
      });
    }
  }, [isSpeaker, onUpdateState]);

  // Handle accepting understanding (speaker only)
  const handleAcceptUnderstanding = useCallback(() => {
    if (!levelConfig) return;
    onUpdateState({
      isAccepted: true,
      phase: levelConfig.positionRequired ? 'position' : 'transition',
    });
    onSaveRound();
  }, [onUpdateState, onSaveRound, levelConfig]);

  // Handle position selection (listener only)
  const handlePositionSelect = useCallback((position: Position) => {
    onUpdateState({
      position,
      positionConfirmed: true,
      phase: 'transition',
    });
  }, [onUpdateState]);

  // Handle asking for position (speaker decides)
  const handleAskForPosition = useCallback((ask: boolean) => {
    if (ask) {
      onUpdateState({
        askForPosition: true,
        phase: 'position',
      });
    } else {
      onUpdateState({
        askForPosition: false,
        phase: 'transition',
      });
    }
  }, [onUpdateState]);

  // Handle moving to next level
  const handleNextLevel = useCallback(() => {
    if (isFinalLevel(currentLevel)) {
      onDemoComplete();
    } else {
      onNextLevel();
    }
  }, [currentLevel, onNextLevel, onDemoComplete]);

  // Handle retry (start new round)
  const handleRetry = useCallback(() => {
    onUpdateState({
      currentRound: currentRound + 1,
      phase: 'paraphrase', // Keep the idea, just re-paraphrase
      paraphraseText: undefined,
      paraphraseConfirmed: false,
      speakerRating: undefined,
      listenerSelfRating: undefined,
      correctionText: undefined,
      isAccepted: false,
    });
  }, [currentRound, onUpdateState]);

  // Progress indicator
  const renderProgress = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {DEMO_LEVELS.map((level) => (
        <div
          key={level.level}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            level.level < currentLevel
              ? 'bg-green-500 text-white'
              : level.level === currentLevel
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {level.level < currentLevel ? <CheckCircle2 className="h-4 w-4" /> : level.level}
        </div>
      ))}
    </div>
  );

  // Role badge
  const renderRoleBadge = () => (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-4 ${
      isSpeaker ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
    }`}>
      {isSpeaker ? <MessageSquare className="h-4 w-4" /> : <Users className="h-4 w-4" />}
      You are: {isSpeaker ? 'SPEAKER' : 'LISTENER'}
    </div>
  );

  // Early return for invalid level (after all hooks)
  if (!levelConfig) {
    return <div>Invalid level</div>;
  }

  // PHASE: IDEA - Speaker shares their idea
  if (phase === 'idea') {
    return (
      <div className="space-y-6">
        {renderProgress()}

        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">
            Level {currentLevel}: {levelConfig.title}
          </h2>
          {renderRoleBadge()}
        </div>

        {isSpeaker ? (
          // Speaker view - input idea
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 font-medium">{levelConfig.prompt}</p>
              <p className="text-sm text-blue-600 mt-1">
                Say it out loud to {listenerName}, then record it here.
              </p>
            </div>

            {levelConfig.isCommitmentLevel && presetIdeaText ? (
              // Level 5 - show preset commitment text
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">Read this commitment aloud:</p>
                  <p className="text-foreground font-medium">{presetIdeaText}</p>
                </div>
                <Button
                  onClick={() => handleIdeaConfirm(presetIdeaText)}
                  className="w-full"
                  size="lg"
                >
                  I've Read It Aloud
                </Button>
              </div>
            ) : (
              // Normal levels - transcription input
              <TranscriptionInput
                onConfirm={handleIdeaConfirm}
                label="Your idea:"
                placeholder="Tap the mic to speak your idea, or type it..."
              />
            )}
          </div>
        ) : (
          // Listener view - waiting for idea
          <div className="text-center p-8 bg-muted/50 rounded-lg">
            <div className="animate-pulse">
              <p className="text-lg text-muted-foreground">
                Waiting for {speakerName} to share their idea...
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Listen carefully when they speak!
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PHASE: PARAPHRASE - Listener paraphrases
  if (phase === 'paraphrase') {
    return (
      <div className="space-y-6">
        {renderProgress()}

        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">
            Level {currentLevel}: {levelConfig.title}
          </h2>
          {renderRoleBadge()}
        </div>

        {/* Show the idea being discussed */}
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">{speakerName}'s idea:</p>
          <p className="text-foreground">{demoState.ideaText}</p>
        </div>

        {isListener ? (
          // Listener view - paraphrase input
          <div className="space-y-4">
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-purple-800 font-medium">
                Paraphrase what {speakerName} said.
              </p>
              <p className="text-sm text-purple-600 mt-1">
                Say it back to them in your own words, then record it here.
              </p>
            </div>

            <TranscriptionInput
              onConfirm={handleParaphraseConfirm}
              label="Your paraphrase:"
              placeholder="Tap the mic to speak your paraphrase, or type it..."
            />
          </div>
        ) : (
          // Speaker view - waiting for paraphrase
          <div className="text-center p-8 bg-muted/50 rounded-lg">
            <div className="animate-pulse">
              <p className="text-lg text-muted-foreground">
                Waiting for {listenerName} to paraphrase...
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Listen to how they understood you.
              </p>
            </div>
          </div>
        )}

        {/* Round indicator */}
        {currentRound > 1 && (
          <p className="text-center text-sm text-muted-foreground">
            Round {currentRound}
          </p>
        )}
      </div>
    );
  }

  // PHASE: RATING - Both rate simultaneously
  if (phase === 'rating') {
    const bothRated = demoState.speakerRating !== undefined && demoState.listenerSelfRating !== undefined;

    // Check if 10/10 and auto-progress
    if (bothRated && demoState.speakerRating === 100 && !demoState.isAccepted) {
      // Auto-accept on 100
      handleAcceptUnderstanding();
    }

    return (
      <div className="space-y-6">
        {renderProgress()}

        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">
            Level {currentLevel}: {levelConfig.title}
          </h2>
          {renderRoleBadge()}
        </div>

        <RatingCard
          role={isSpeaker ? 'speaker' : 'listener'}
          ideaText={demoState.ideaText || ''}
          paraphraseText={demoState.paraphraseText || ''}
          speakerName={speakerName}
          listenerName={listenerName}
          onSubmitRating={handleRatingSubmit}
          onAcceptUnderstanding={handleAcceptUnderstanding}
          myRating={isSpeaker ? demoState.speakerRating : demoState.listenerSelfRating}
          otherRating={isSpeaker ? demoState.listenerSelfRating : demoState.speakerRating}
          correctionText={demoState.correctionText}
          roundNumber={currentRound}
        />

        {/* Retry button for speaker when understanding not achieved */}
        {bothRated && demoState.speakerRating !== undefined && demoState.speakerRating < 100 && !demoState.isAccepted && isSpeaker && (
          <Button
            variant="outline"
            onClick={handleRetry}
            className="w-full"
          >
            Let them try again
          </Button>
        )}
      </div>
    );
  }

  // PHASE: POSITION - Listener selects position (after understanding)
  if (phase === 'position') {
    // Speaker decides if position is needed (for optional levels)
    if (!levelConfig.positionRequired && demoState.askForPosition === undefined && isSpeaker) {
      return (
        <div className="space-y-6">
          {renderProgress()}

          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">
              Understanding Achieved!
            </h2>
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <p className="text-center mb-4">
              Do you want to know {listenerName}'s position on this?
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => handleAskForPosition(false)}
                className="flex-1"
              >
                No, understanding is enough
              </Button>
              <Button
                onClick={() => handleAskForPosition(true)}
                className="flex-1"
              >
                Yes, ask for position
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Show position buttons to listener
    return (
      <div className="space-y-6">
        {renderProgress()}

        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">
            Understanding Achieved!
          </h2>
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          {renderRoleBadge()}
        </div>

        {/* Reminder of what was discussed */}
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">{speakerName}'s idea:</p>
          <p className="text-foreground">{demoState.ideaText}</p>
        </div>

        {isListener ? (
          <PositionButtons
            onSelect={handlePositionSelect}
            enabled={demoState.isAccepted}
            selectedPosition={demoState.position}
          />
        ) : (
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <p className="text-muted-foreground animate-pulse">
              Waiting for {listenerName} to share their position...
            </p>
          </div>
        )}
      </div>
    );
  }

  // PHASE: TRANSITION - Level complete, ready for next
  if (phase === 'transition') {
    const isLastLevel = isFinalLevel(currentLevel);

    return (
      <div className="space-y-6">
        {renderProgress()}

        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">
            Level {currentLevel} Complete!
          </h2>
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
        </div>

        {/* Summary */}
        <div className="space-y-3">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Idea:</p>
            <p className="text-foreground">{demoState.ideaText}</p>
          </div>

          <div className="flex items-center justify-center gap-4 text-sm">
            <span>Rounds: {currentRound}</span>
            <span>•</span>
            <span>Final rating: {demoState.speakerRating}/100</span>
            {demoState.position && (
              <>
                <span>•</span>
                <span className="capitalize">Position: {demoState.position}</span>
              </>
            )}
          </div>
        </div>

        {/* Next level / Complete button */}
        {isCreator && (
          <Button
            onClick={handleNextLevel}
            className="w-full"
            size="lg"
          >
            {isLastLevel ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete Demo
              </>
            ) : (
              <>
                Level {currentLevel + 1}
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        )}

        {!isCreator && (
          <p className="text-center text-muted-foreground animate-pulse">
            Waiting for {creatorName} to continue...
          </p>
        )}
      </div>
    );
  }

  return null;
}
