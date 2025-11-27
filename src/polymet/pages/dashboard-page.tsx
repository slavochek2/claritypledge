import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "@/hooks/use-user";
import { ShareTools } from "@/polymet/components/share-tools";
import { InviteEndorsers } from "@/polymet/components/invite-endorsers";
import { Button } from "@/components/ui/button";
import { StampIcon, EyeIcon, UsersIcon, TrendingUpIcon } from "lucide-react";

export function DashboardPage() {
  const { user: profile, isLoading } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !profile) {
      navigate("/");
    }
  }, [profile, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading Dashboard...</div>
      </div>
    );
  }

  if (!profile) {
    return null; // Will redirect in useEffect
  }

  const profileUrl = `${window.location.origin}/p/${profile.slug || profile.id}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl py-12 px-4">
        <div className="space-y-12">
          {/* Seal Your Pledge Action Card - Only show if unverified */}
          {!profile.isVerified && (
            <div className="relative overflow-hidden rounded-xl border-2 border-[#0044CC]/20 bg-[#0044CC]/5 dark:bg-[#0044CC]/10 p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-start gap-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#0044CC]/10 flex items-center justify-center text-[#0044CC] dark:text-blue-400">
                  <StampIcon className="w-6 h-6" />
                </div>
                
                <div className="flex-1 space-y-4">
                  <div>
                    <h3 className="text-xl font-serif font-bold text-[#1A1A1A] dark:text-foreground mb-2" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>
                      One Last Step: Check Your Email
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      We've sent a verification link to <strong>{profile.email}</strong>. 
                      Please click it to activate your account and make your pledge official.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              Your Dashboard
            </h1>
            <p className="text-lg text-muted-foreground">
              {profile.isVerified
                ? "Manage your Clarity Pledge and track your impact"
                : "Complete verification to unlock sharing tools"}
            </p>
            
            {/* View My Pledge Button */}
            <Link to={`/p/${profile.slug || profile.id}`}>
              <Button 
                variant="outline" 
                size="lg"
                className="gap-2"
              >
                <EyeIcon className="w-4 h-4" />
                View My Pledge
              </Button>
            </Link>
          </div>

          {/* Dashboard Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border-2 border-[#0044CC] dark:border-blue-500 rounded-lg p-6 bg-card">
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-[#0044CC]/10 flex items-center justify-center">
                  <UsersIcon className="w-6 h-6 text-[#0044CC] dark:text-blue-400" />
                </div>
                <p className="text-4xl md:text-5xl font-bold text-[#0044CC] dark:text-blue-400">
                  {profile.witnesses.length}
                </p>
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {profile.witnesses.length === 1
                      ? "Endorsement"
                      : "Endorsements"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    People who acknowledged your pledge
                  </p>
                </div>
              </div>
            </div>

            <div className="border-2 border-amber-500 dark:border-amber-400 rounded-lg p-6 bg-card">
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <TrendingUpIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-4xl md:text-5xl font-bold text-amber-600 dark:text-amber-400">
                  {profile.reciprocations}
                </p>
                <div>
                  <p className="text-lg font-semibold text-foreground">Impact</p>
                  <p className="text-sm text-muted-foreground">
                    People who took the pledge after seeing yours
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Share Tools - Only show when verified */}
          {profile.isVerified && (
            <div className="space-y-6">
              <div className="border border-border rounded-lg p-6 bg-card">
                <ShareTools profileUrl={profileUrl} name={profile.name} />
              </div>

              {/* Invite Endorsers */}
              <div className="border border-border rounded-lg p-6 bg-card">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-foreground">
                      Invite People to Endorse
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Send personal invitations to colleagues, friends, or anyone
                      who knows your commitment to clarity
                    </p>
                  </div>
                  <InviteEndorsers
                    profileName={profile.name}
                    profileUrl={profileUrl}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Unverified Share Disabled Message */}
          {!profile.isVerified && (
            <div className="border border-dashed border-border rounded-lg p-8 bg-muted/30">
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground opacity-50">
                  <StampIcon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-muted-foreground">
                  Tools Locked Until Sealed
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Once you confirm your email and seal your pledge, you'll unlock tools to share your commitment and invite others.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

