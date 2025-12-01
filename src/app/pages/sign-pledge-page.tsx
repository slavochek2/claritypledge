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
import { useState } from "react";
import { MailIcon } from "lucide-react";

export function SignPledgePage() {
  const navigate = useNavigate();
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

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
          Please click the link in that email to <strong>seal your pledge</strong>. 
          Your profile will not be public until you verify your email.
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

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-serif font-bold mb-4">Take the Pledge</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Join others in committing to clarity and understanding.
        </p>
      </div>
      <SignPledgeForm
        onSuccess={handleSuccess}
        onSwitchToLogin={() => navigate('/login')}
      />
    </div>
  );
}

