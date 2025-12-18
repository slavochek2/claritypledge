/**
 * @file clarity-demo-page.tsx
 * @description Clarity Partners MVP - Session create/join and realtime demo flow.
 * Two phones sync in real-time via Supabase Realtime, each with role-specific UI.
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createClaritySession,
  joinClaritySession,
  subscribeToClaritySession,
  updateClarityDemoStatus,
  updateDemoFlowState,
  saveDemoRound,
  saveClarityIdea,
  type ClaritySession,
  type DemoFlowState,
} from "@/app/data/api";
import {
  PartnerCommitmentCard,
  PARTNER_COMMITMENT_TEXT,
} from "@/app/components/partners/partner-commitment-card";
import { DemoLevelView } from "@/app/components/partners/demo-level-view";
import {
  createInitialDemoState,
  getRolesForLevel,
  getNextLevel,
} from "@/app/components/partners/demo-config";
import { CheckCircle2, PartyPopper } from "lucide-react";

type ViewState = "start" | "invitation" | "waiting-creator" | "demo" | "complete";

export function ClarityDemoPage() {
  const [view, setView] = useState<ViewState>("start");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [session, setSession] = useState<ClaritySession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [hasAccepted, setHasAccepted] = useState(false);

  // Demo flow state (synced via session.state)
  const [demoState, setDemoState] = useState<DemoFlowState>(createInitialDemoState());

  // Subscribe to session updates when we have a session
  useEffect(() => {
    if (!session) return;

    const unsubscribe = subscribeToClaritySession(session.id, (updatedSession) => {
      console.log("Session updated:", updatedSession);
      setSession(updatedSession);

      // Sync demo state from session (state is stored as JSONB, cast through unknown)
      if (updatedSession.state && updatedSession.state.currentLevel !== undefined) {
        setDemoState(updatedSession.state as unknown as DemoFlowState);
      }

      // When demo starts (joiner accepted commitment), transition creator to demo
      if (updatedSession.demoStatus === "in_progress" && view === "waiting-creator") {
        setView("demo");
      }

      // When demo completes
      if (updatedSession.demoStatus === "completed" && view === "demo") {
        setView("complete");
      }
    });

    return () => unsubscribe();
  }, [session?.id, view]);

  // Initialize demo state when entering demo view
  useEffect(() => {
    if (view === "demo" && session && !session.state?.currentLevel) {
      const initialState = createInitialDemoState();
      updateDemoFlowState(session.id, initialState);
      setDemoState(initialState);
    }
  }, [view, session]);

  const handleCreateSession = async () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const newSession = await createClaritySession(name.trim(), inviteNote.trim() || undefined);
      setSession(newSession);
      setIsCreator(true);
      setView("waiting-creator");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinSession = async () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!roomCode.trim()) {
      setError("Please enter the room code");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const joinedSession = await joinClaritySession(roomCode.trim(), name.trim());
      if (!joinedSession) {
        setError("Session not found or already full");
        return;
      }
      setSession(joinedSession);
      setIsCreator(false);
      // Show invitation/commitment screen before demo
      setView("invitation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join session");
    } finally {
      setIsLoading(false);
    }
  };

  // Update demo state and sync to Supabase
  const handleUpdateDemoState = useCallback(async (updates: Partial<DemoFlowState>) => {
    if (!session) return;

    // Optimistic update
    setDemoState(prev => ({ ...prev, ...updates }));

    // Sync to database
    try {
      await updateDemoFlowState(session.id, updates);
    } catch (err) {
      console.error("Failed to sync demo state:", err);
    }
  }, [session]);

  // Save a completed round to the database
  const handleSaveRound = useCallback(async () => {
    if (!session) return;

    const { speakerName, listenerName } = getRolesForLevel(
      demoState.currentLevel,
      session.creatorName,
      session.joinerName || "Partner"
    );

    try {
      // Save the round
      await saveDemoRound({
        sessionId: session.id,
        level: demoState.currentLevel,
        roundNumber: demoState.currentRound,
        speakerName,
        listenerName,
        ideaText: demoState.ideaText,
        paraphraseText: demoState.paraphraseText,
        speakerRating: demoState.speakerRating,
        listenerSelfRating: demoState.listenerSelfRating,
        correctionText: demoState.correctionText,
        isAccepted: demoState.isAccepted,
        position: demoState.position,
      });

      // Save the idea to backlog (if it's a real idea, not Level 5 commitment)
      if (demoState.ideaText && demoState.currentLevel < 5) {
        await saveClarityIdea({
          sessionId: session.id,
          authorName: speakerName,
          content: demoState.ideaText,
          sourceLevel: demoState.currentLevel,
        });
      }
    } catch (err) {
      console.error("Failed to save round:", err);
    }
  }, [session, demoState]);

  // Move to next level
  const handleNextLevel = useCallback(async () => {
    if (!session) return;

    const nextLevel = getNextLevel(demoState.currentLevel);
    if (nextLevel) {
      const newState: DemoFlowState = {
        currentLevel: nextLevel,
        currentRound: 1,
        phase: 'idea',
        ideaText: undefined,
        ideaConfirmed: false,
        paraphraseText: undefined,
        paraphraseConfirmed: false,
        speakerRating: undefined,
        listenerSelfRating: undefined,
        correctionText: undefined,
        isAccepted: false,
        askForPosition: undefined,
        position: undefined,
        positionConfirmed: false,
      };

      setDemoState(newState);
      await updateDemoFlowState(session.id, newState);
    }
  }, [session, demoState.currentLevel]);

  // Complete the demo
  const handleDemoComplete = useCallback(async () => {
    if (!session) return;

    await updateClarityDemoStatus(session.id, "completed");
    setView("complete");
  }, [session]);

  // Determine if user is in "join mode" (has entered a room code)
  const isJoinMode = roomCode.trim().length > 0;
  const needsName = !name.trim() && isJoinMode;

  // START VIEW - Enter name, create or join
  if (view === "start") {
    return (
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif font-bold mb-2">Clarity Partners</h1>
          <p className="text-muted-foreground">
            Experience what it means to truly understand each other.
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name" className={needsName ? "text-amber-600 font-medium" : ""}>
              Your Name {needsName && "*"}
            </Label>
            <Input
              id="name"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className={needsName ? "border-amber-500 ring-1 ring-amber-500" : ""}
            />
            {needsName && (
              <p className="text-sm text-amber-600">
                Please enter your name to join
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="space-y-4 pt-4">
            {/* Only show invite note when NOT in join mode */}
            {!isJoinMode && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="note">Invite Note (optional)</Label>
                  <Input
                    id="note"
                    placeholder="Why are you inviting them?"
                    value={inviteNote}
                    onChange={(e) => setInviteNote(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleCreateSession}
                  disabled={isLoading || !name.trim()}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? "Creating..." : "Create Session"}
                </Button>
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {isJoinMode ? "Join session" : "Or join existing"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="code">Room Code</Label>
                <Input
                  id="code"
                  placeholder="Enter 6-letter code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="text-center"
                />
              </div>
              <Button
                onClick={handleJoinSession}
                disabled={isLoading || !name.trim() || !roomCode.trim()}
                variant={isJoinMode ? "default" : "outline"}
                className="w-full"
                size="lg"
              >
                {isLoading ? "Joining..." : "Join Session"}
              </Button>
            </div>

            {/* Show create option when in join mode */}
            {isJoinMode && (
              <Button
                onClick={() => setRoomCode("")}
                variant="ghost"
                className="w-full text-muted-foreground"
                size="sm"
              >
                Or create a new session instead
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // WAITING-CREATOR VIEW - Show code, wait for partner (or show reviewing state)
  if (view === "waiting-creator" && session) {
    const joinerHasJoined = !!session.joinerName;

    return (
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-md">
        <div className="text-center space-y-6">
          <h1 className="text-2xl font-serif font-bold">
            {joinerHasJoined ? `Waiting for ${session.joinerName}` : "Waiting for Partner"}
          </h1>

          {!joinerHasJoined ? (
            <>
              <div className="p-6 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Share this code:</p>
                <p className="text-4xl font-mono font-bold tracking-widest">{session.code}</p>
              </div>

              <p className="text-muted-foreground">
                Ask your partner to enter this code on their phone.
              </p>
            </>
          ) : (
            <>
              <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800">
                  <strong>{session.joinerName}</strong> is reviewing your commitment.
                </p>
                <p className="text-sm text-blue-600 mt-2">
                  They'll start when ready.
                </p>
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // INVITATION VIEW - Joiner sees creator's commitment before starting
  if (view === "invitation" && session) {
    return (
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-serif font-bold">
            {session.creatorName} invited you
          </h1>
        </div>

        {/* Show invite note if provided */}
        {session.creatorNote && (
          <blockquote className="italic text-muted-foreground border-l-2 border-muted-foreground/30 pl-4 mb-6">
            "{session.creatorNote}"
          </blockquote>
        )}

        {/* What happens next */}
        <div className="mb-6 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm font-medium mb-2">What happens next:</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• 5 quick rounds (~2 min each)</li>
            <li>• Take turns sharing ideas</li>
            <li>• Practice understanding before responding</li>
          </ul>
        </div>

        <div className="mb-6">
          <p className="text-sm text-muted-foreground mb-3 text-center">
            {session.creatorName}'s commitment to you:
          </p>
          <PartnerCommitmentCard
            creatorName={session.creatorName}
            commitmentText={PARTNER_COMMITMENT_TEXT}
          />
        </div>

        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={hasAccepted}
              onCheckedChange={(checked) => setHasAccepted(checked === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              I offer the same commitment for the next 10 minutes
            </span>
          </label>

          <Button
            onClick={async () => {
              // Initialize demo state and update status
              const initialState = createInitialDemoState();
              await updateDemoFlowState(session.id, initialState);
              await updateClarityDemoStatus(session.id, "in_progress");
              setDemoState(initialState);
              setView("demo");
            }}
            disabled={!hasAccepted}
            className="w-full"
            size="lg"
          >
            Start 10-Minute Session
          </Button>
        </div>
      </div>
    );
  }

  // DEMO VIEW - The actual 5-level demo
  if (view === "demo" && session) {
    return (
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-md">
        <DemoLevelView
          session={session}
          demoState={demoState}
          isCreator={isCreator}
          onUpdateState={handleUpdateDemoState}
          onSaveRound={handleSaveRound}
          onNextLevel={handleNextLevel}
          onDemoComplete={handleDemoComplete}
        />
      </div>
    );
  }

  // COMPLETE VIEW - Demo finished
  if (view === "complete" && session) {
    const partnerName = isCreator ? session.joinerName : session.creatorName;

    return (
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-md">
        <div className="text-center space-y-6">
          <PartyPopper className="h-16 w-16 text-yellow-500 mx-auto" />

          <h1 className="text-2xl font-serif font-bold">
            Demo Complete!
          </h1>

          <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-3" />
            <p className="text-green-800">
              You and <strong>{partnerName}</strong> completed all 5 levels!
            </p>
          </div>

          <div className="space-y-3 text-left p-4 bg-muted/50 rounded-lg">
            <p className="font-medium">What you experienced:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Sharing facts, opinions, and values</li>
              <li>• Paraphrasing to verify understanding</li>
              <li>• Rating calibration (how well you estimate understanding)</li>
              <li>• Separating understanding from agreement</li>
            </ul>
          </div>

          <div className="pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Ideas from this session have been saved to your backlog.
            </p>
            <Button
              onClick={() => {
                // Reset for new session
                setView("start");
                setSession(null);
                setDemoState(createInitialDemoState());
                setName("");
                setRoomCode("");
                setInviteNote("");
                setHasAccepted(false);
              }}
              variant="outline"
              className="w-full"
            >
              Start New Session
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}
