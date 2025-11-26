import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { verifyProfile, getProfile } from "@/polymet/data/mock-profiles";
import { CheckCircleIcon, XCircleIcon, LoaderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VerifyEmailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!id) {
      setStatus("error");
      return;
    }

    // Simulate verification process
    setTimeout(() => {
      const userProfile = getProfile(id);

      if (userProfile) {
        verifyProfile(id);
        setProfile(userProfile);
        setStatus("success");

        // Redirect to profile after 3 seconds
        setTimeout(() => {
          navigate(`/p/${id}?owner=true`);
        }, 3000);
      } else {
        setStatus("error");
      }
    }, 1500);
  }, [id, navigate]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="flex justify-center">
            <LoaderIcon className="w-16 h-16 text-blue-600 dark:text-blue-400 animate-spin" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Verifying Your Email</h1>
            <p className="text-lg text-muted-foreground">
              Please wait while we confirm your signature...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircleIcon className="w-12 h-12 text-destructive" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Verification Failed</h1>
            <p className="text-lg text-muted-foreground">
              We couldn't verify your email. The link may be invalid or expired.
            </p>
          </div>
          <Link to="/">
            <Button
              size="lg"
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              Return to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircleIcon className="w-12 h-12 text-green-600 dark:text-green-500" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Email Verified! 🎉</h1>
          <p className="text-lg text-muted-foreground">
            Your signature has been verified, {profile?.name}!
          </p>
          <p className="text-base text-muted-foreground">
            Your profile is now public and will appear on the "Who Signed the
            Pledge" page.
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Redirecting to your profile...
          </p>
          <Link to={`/p/${id}?owner=true`}>
            <Button
              size="lg"
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              View My Profile Now
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
