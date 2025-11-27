import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2Icon, XCircleIcon, Loader2Icon } from "lucide-react";
import { verifyEndorsement, getProfile } from "@/polymet/data/api";

export function VerifyEndorsementPage() {
  const { profileId, witnessId } = useParams<{
    profileId: string;
    witnessId: string;
  }>();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [endorserProfile, setEndorserProfile] = useState<any>(null);
  const [targetProfile, setTargetProfile] = useState<any>(null);

  useEffect(() => {
    const verify = async () => {
      if (profileId && witnessId) {
        try {
          const target = await getProfile(profileId);
          if (target) {
            // verifyEndorsement returns null on success (no new profile created)
            await verifyEndorsement(profileId, witnessId);
            
            setTargetProfile(target);
            setStatus("success");
            setEndorserProfile(null);
          } else {
            setStatus("error");
          }
        } catch (error) {
          console.error("Verification error:", error);
          setStatus("error");
        }
      } else {
        setStatus("error");
      }
    };

    verify();
  }, [profileId, witnessId]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2Icon className="w-12 h-12 animate-spin text-[#0044CC] dark:text-blue-500 mx-auto" />

          <h2 className="text-2xl font-bold">Verifying Your Endorsement...</h2>
          <p className="text-muted-foreground">Please wait a moment</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full border-2 border-destructive rounded-lg p-8 bg-destructive/5 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center">
              <XCircleIcon className="w-8 h-8 text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Verification Failed</h2>
            <p className="text-muted-foreground">
              This verification link is invalid or has already been used.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link to="/">Return to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-8">
        {/* Success Message */}
        <div className="border-2 border-[#0044CC] dark:border-blue-500 rounded-lg p-8 bg-[#0044CC]/5 dark:bg-blue-500/5 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-[#0044CC] dark:bg-blue-500 flex items-center justify-center animate-in zoom-in duration-500">
              <CheckCircle2Icon className="w-10 h-10 text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Endorsement Confirmed!</h2>
            <p className="text-lg text-muted-foreground">
              You've successfully endorsed {targetProfile?.name}'s commitment to
              clarity
            </p>
          </div>
        </div>

        {/* New Profile Created - OR CTA to Create One */}
        <div className="border-2 border-border rounded-lg p-8 bg-card space-y-6">
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">
              {endorserProfile ? "Your Pledge Profile is Ready! 🎉" : "Now, Take the Pledge Yourself"}
            </h3>
            <p className="text-muted-foreground">
              {endorserProfile 
                ? "We've created a profile for you. Now you can take the pledge yourself and build your own network of endorsers."
                : "You've endorsed a colleague. Now create your own profile to build a network of mutual accountability."}
            </p>
          </div>

          {endorserProfile && (
            <div className="bg-muted/50 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Your Profile</p>
                  <p className="text-xl font-semibold">{endorserProfile.name}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/dashboard`}>
                    Dashboard
                  </Link>
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="font-semibold">What's next?</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-[#0044CC] dark:text-blue-500 mt-0.5">
                  ✓
                </span>
                <span>
                  Take the Clarity Pledge yourself to show your commitment
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#0044CC] dark:text-blue-500 mt-0.5">
                  ✓
                </span>
                <span>Share your profile and invite others to endorse you</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#0044CC] dark:text-blue-500 mt-0.5">
                  ✓
                </span>
                <span>Build a network of mutual accountability</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            {endorserProfile ? (
              <Button
                asChild
                className="flex-1 bg-[#0044CC] hover:bg-[#0033AA] text-white"
                size="lg"
              >
                <Link to={`/dashboard`}>
                  Go to My Dashboard
                </Link>
              </Button>
            ) : (
              <Button
                asChild
                className="flex-1 bg-[#0044CC] hover:bg-[#0033AA] text-white"
                size="lg"
              >
                <Link to="/">
                  Take the Pledge Now
                </Link>
              </Button>
            )}
            
            <Button asChild variant="outline" className="flex-1" size="lg">
              <Link to={`/p/${targetProfile?.id}`}>
                View {targetProfile?.name}'s Profile
              </Link>
            </Button>
          </div>
        </div>

        {/* Viral Hook */}
        <div className="text-center text-sm text-muted-foreground">
          <p>
            Clarity works best when it's mutual.{" "}
            <Link
              to="/"
              className="text-[#0044CC] dark:text-blue-400 hover:underline font-medium"
            >
              Learn more about the pledge
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
