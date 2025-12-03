/**
 * @file sign-pledge-page.tsx
 * @description This page is where new users officially sign the Polymet Clarity Pledge.
 * It contains a form that collects the user's name, email, and other optional information.
 * This is the primary conversion point for the entire application.
 * After the user submits the form, it triggers the authentication flow (sending a magic link)
 * and shows a success message, instructing them to check their email to verify their pledge.
 */
import { SignPledgeForm } from "@/app/components/pledge/sign-pledge-form";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { MailIcon } from "lucide-react";
import { getFeaturedProfiles, getVerifiedProfileCount } from "@/app/data/api";
import type { ProfileSummary } from "@/app/types";

export function SignPledgePage() {
  const navigate = useNavigate();
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [champions, setChampions] = useState<ProfileSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [socialProofLoaded, setSocialProofLoaded] = useState(false);

  // Fetch social proof data
  useEffect(() => {
    async function loadSocialProof() {
      const [profiles, count] = await Promise.all([
        getFeaturedProfiles(),
        getVerifiedProfileCount()
      ]);
      setChampions(profiles.slice(0, 6)); // Max 6 avatars
      setTotalCount(count);
      setSocialProofLoaded(true);
    }
    loadSocialProof();
  }, []);

  const handleSuccess = () => {
    // Get email from local storage (set by usePledgeForm/createProfile)
    const pendingEmail = localStorage.getItem('pendingVerificationEmail');
    if (pendingEmail) {
        setEmail(pendingEmail);
    }
    
    setIsSuccess(true);
    
    // Check if this is a returning user
    const returningUserInfo = localStorage.getItem('returningUserInfo');

    if (returningUserInfo) {
      try {
        const { name } = JSON.parse(returningUserInfo);
        toast.success(`Welcome back, ${name}! Link sent.`);
        localStorage.removeItem('returningUserInfo'); 
      } catch {
        toast.success("Welcome back! Link sent.");
      }
    } else {
      toast.success("Pledge signed! Check your email.");
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isSuccess) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
        <div className="mb-8 flex justify-center">
          <div className="h-24 w-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
             <MailIcon className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>
        </div>
        
        <h1 className="text-3xl md:text-4xl font-bold mb-6">Almost Done!</h1>
        
        <div className="bg-muted/50 p-6 rounded-lg mb-8 border border-border">
          <p className="text-xl mb-4">
            We've sent a verification link to:
          </p>
          <p className="text-2xl font-bold text-primary break-all">
             {email || "your email"}
          </p>
        </div>
        
        <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
          Click the link in your email to <strong>complete your pledge</strong> and make your profile public.
        </p>
        
        <button 
            onClick={() => navigate('/')}
            className="text-primary hover:underline font-medium"
        >
            Return to Home
        </button>
      </div>
    );
  }

  // Helper to get initials from name
  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-serif font-bold mb-4">Take the Pledge</h1>

        {/* Social Proof - Compact Avatar Row */}
        <div className="flex flex-col items-center gap-3 mb-4 min-h-[60px]">
          {!socialProofLoaded ? (
            // Skeleton placeholder - prevents layout shift
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <div className="flex items-center -space-x-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-muted" />
                ))}
              </div>
              <div className="h-4 w-48 bg-muted rounded" />
            </div>
          ) : totalCount > 0 ? (
            <div className="flex flex-col items-center gap-3 animate-in fade-in duration-300">
              <div className="flex items-center -space-x-2">
                {champions.map((champion) => (
                  <div
                    key={champion.id}
                    className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-medium"
                    style={{ backgroundColor: champion.avatarColor || '#002B5C' }}
                    title={champion.name}
                  >
                    {getInitials(champion.name)}
                  </div>
                ))}
                {totalCount > champions.length && (
                  <div className="w-8 h-8 rounded-full border-2 border-white bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                    +{totalCount - champions.length}
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Join {totalCount} clarity champion{totalCount !== 1 ? 's' : ''} who've taken the pledge
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <SignPledgeForm
        onSuccess={handleSuccess}
        onSwitchToLogin={() => navigate('/login')}
      />
    </div>
  );
}

