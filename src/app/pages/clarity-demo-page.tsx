/**
 * @file clarity-demo-page.tsx
 * @description Clarity Partners MVP - Session create/join and realtime demo flow.
 * Two phones sync in real-time via Supabase Realtime, each with role-specific UI.
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createClaritySession,
  joinClaritySession,
  subscribeToClaritySession,
  updateClarityDemoStatus,
  type ClaritySession,
} from "@/app/data/api";
import {
  PartnerCommitmentCard,
  PARTNER_COMMITMENT_TEXT,
} from "@/app/components/partners/partner-commitment-card";

type ViewState = "start" | "invitation" | "waiting-creator" | "demo";

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

  // Subscribe to session updates when we have a session
  useEffect(() => {
    if (!session) return;

    const unsubscribe = subscribeToClaritySession(session.id, (updatedSession) => {
      console.log("Session updated:", updatedSession);
      setSession(updatedSession);

      // When demo starts (joiner accepted commitment), transition creator to demo
      if (updatedSession.demoStatus === "in_progress" && view === "waiting-creator") {
        setView("demo");
      }
    });

    return () => unsubscribe();
  }, [session?.id, view]);

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
              // Update demo status so creator knows to transition
              await updateClarityDemoStatus(session.id, "in_progress");
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

  // DEMO VIEW - Both connected
  if (view === "demo" && session) {
    const partnerName = isCreator ? session.joinerName : session.creatorName;

    return (
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-md">
        <div className="text-center space-y-6">
          <h1 className="text-2xl font-serif font-bold">Demo In Progress</h1>

          <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800">
              Connected with <strong>{partnerName}</strong>
            </p>
            <p className="text-sm text-green-600 mt-2">
              Session: {session.code}
            </p>
          </div>

          <p className="text-muted-foreground">
            Demo levels coming in next iteration...
          </p>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}
