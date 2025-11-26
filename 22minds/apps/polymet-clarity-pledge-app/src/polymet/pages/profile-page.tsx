import { useParams, useSearchParams, Link } from "react-router-dom";
import { getProfile, addWitness } from "@/polymet/data/mock-profiles";
import { ProfileOwnerView } from "@/polymet/components/profile-owner-view";
import { ProfileVisitorView } from "@/polymet/components/profile-visitor-view";
import { Button } from "@/components/ui/button";

export function ProfilePage() {
  const { id = "alice-chen" } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isOwner = searchParams.get("owner") === "true";

  const profile = getProfile(id);

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-foreground">
            Profile Not Found
          </h1>
          <p className="text-muted-foreground">
            This pledge doesn't exist or has been removed.
          </p>
          <Link to="/">
            <Button className="bg-[#0044CC] hover:bg-[#0033AA] text-white">
              Go to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const profileUrl = `${window.location.origin}/p/${id}`;

  const handleWitness = (witnessName: string, linkedinUrl?: string) => {
    const witnessId = addWitness(id, witnessName, linkedinUrl);
    console.log(`Witness added: ${witnessName} with witnessId: ${witnessId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl py-12 px-4">
        {isOwner ? (
          <ProfileOwnerView profile={profile} profileUrl={profileUrl} />
        ) : (
          <ProfileVisitorView profile={profile} onWitness={handleWitness} />
        )}
      </div>
    </div>
  );
}
